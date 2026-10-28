import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { getConfig } from '../config/env';
import { readUpload } from './uploadStorage';
import { logger, serializeError } from '../utils/logging';
import { meteredMessage, meteredStream } from './aiGateway';
import { filterClearedFileUrls } from './documentSafety';
import { getCallContext } from '../utils/callContext';
import { BUDGET_ERROR_CODES } from './aiBudget';
import { textTokenBound } from './priceCatalog';
import type { ChatHistoryItem, TeachingMethod } from './enaraOrchestrator';

// Backup for tutor replies when the Enara orchestrator is unavailable: asks Claude
// directly, grounded in the student's curriculum (course outline, current lesson
// and that lesson's uploaded PDF/text materials).

const METHOD_GUIDANCE: Record<TeachingMethod, string> = {
  socratic:
    'Teach Socratically: ask one guiding question at a time and help the student reach the answer themselves. Do not just give the final answer.',
  gap_filler: 'Give a short, direct explanation of the missing concept, then one worked example.',
  error_analysis:
    "Find where the student's reasoning went wrong, explain the mistake, then show the correct approach step by step.",
};

let client: Anthropic | undefined;
function getClient(apiKey: string): Anthropic {
  // One client per warm instance. Fit within the 60 s serverless limit: one
  // retry, made (and metered) by the gateway rather than the SDK.
  client ??= new Anthropic({ apiKey, timeout: 25_000, maxRetries: 0 });
  return client;
}

export interface TutorCurriculum {
  courseTitle?: string;
  subject?: string;
  summary?: string;
  chapters: { id: string; title: string; description?: string }[];
  currentLessonId?: string;
  materials: string[];
}

const MAX_MATERIALS = 3;
const MAX_MATERIAL_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

type MaterialBlock = Anthropic.Beta.BetaContentBlockParam;

async function loadMaterialBytes(url: string): Promise<Buffer | null> {
  try {
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length <= MAX_MATERIAL_BYTES ? buf : null;
    }
    if (url.startsWith('/uploads/')) {
      const file = await readUpload(path.basename(url));
      return file && file.body.length <= MAX_MATERIAL_BYTES ? file.body : null;
    }
  } catch (error) {
    logger.warn('tutor_material_unreadable', { url, error: serializeError(error) });
  }
  return null;
}

// Lesson files rarely change mid-conversation: keep them for a few minutes on a
// warm instance instead of fetching from storage on every turn.
const MATERIAL_TTL_MS = 10 * 60 * 1000;
const materialCache = new Map<string, { block: MaterialBlock | null; at: number }>();

async function loadMaterials(urls: string[]): Promise<MaterialBlock[]> {
  const blocks = await Promise.all(
    urls.slice(0, MAX_MATERIALS).map(async (url): Promise<MaterialBlock | null> => {
      const cached = materialCache.get(url);
      if (cached && Date.now() - cached.at < MATERIAL_TTL_MS) return cached.block;
      const block = await loadMaterial(url);
      if (materialCache.size > 50) materialCache.delete(materialCache.keys().next().value!);
      materialCache.set(url, { block, at: Date.now() });
      return block;
    }),
  );
  return blocks.filter((b): b is MaterialBlock => b !== null);
}

async function loadMaterial(url: string): Promise<MaterialBlock | null> {
  const ext = path.extname(url.split('?')[0]).toLowerCase();
  const title = decodeURIComponent(path.basename(url.split('?')[0]));
  if (ext !== '.pdf' && ext !== '.txt' && ext !== '.md') return null;
  const bytes = await loadMaterialBytes(url);
  if (!bytes) return null;
  if (ext === '.pdf') {
    return {
      type: 'document',
      title,
      source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
    };
  }
  return {
    type: 'document',
    title,
    source: { type: 'text', media_type: 'text/plain', data: bytes.toString('utf8').slice(0, MAX_TEXT_CHARS) },
  };
}

function describeCurriculum(c: TutorCurriculum): string {
  const lines = ['<curriculum>'];
  if (c.courseTitle) lines.push(`Course: ${c.courseTitle}`);
  if (c.subject) lines.push(`Subject: ${c.subject}`);
  if (c.summary) lines.push(`Summary: ${c.summary}`);
  if (c.chapters.length) {
    lines.push('Lessons in order:');
    c.chapters.forEach((ch, i) => {
      const current = ch.id === c.currentLessonId ? ' (CURRENT LESSON)' : '';
      lines.push(`${i + 1}. ${ch.title}${current}${ch.description ? ` — ${ch.description}` : ''}`);
    });
  }
  lines.push('</curriculum>');
  return lines.join('\n');
}

export function isDirectTutorModelConfigured(): boolean {
  return Boolean(getConfig().anthropicApiKey);
}

interface TutorRequestParams {
  query: string;
  history: ChatHistoryItem[];
  teachingMethod: TeachingMethod;
  curriculum?: TutorCurriculum;
  // 'voice' replies are spoken by the live avatar: plain sentences, no Markdown,
  // from the faster voice model.
  mode?: 'chat' | 'voice';
  // Where the student stands (progress, weak topics, reviews due): lets the
  // tutor be proactive instead of only answering.
  learner?: string;
  // Learning-intelligence context for one objective: target, evidence summary
  // and the teaching strategy to use (services/learningContext.ts).
  pedagogy?: string;
  // Retrieved course passages (services/curriculumRetrieval.ts). When given,
  // they replace sending whole lesson files.
  sourcesPrompt?: string;
}

// Shown to the student's own tutor in every mode: checks understanding and
// notices struggle instead of only answering what was asked.
export const PROACTIVE_TEACHING =
  'Be a proactive tutor. After explaining a new idea, end with one short question that checks understanding. ' +
  'When the student answers, say clearly whether it is right; if not, name the specific mistake and give a ' +
  'smaller next step rather than repeating yourself. If they have answered wrong twice in a row, or ask the ' +
  'same thing again, slow down: one tiny step at a time, simpler words, a concrete everyday example, and ' +
  'encouragement. When it fits, point them to what to do next (a weak topic to practise, the next lesson). ';

// Marker a spoken reply starts with when the tutor decides a visual would help;
// the server strips it and draws the visual.
export const SHOW_VISUAL_MARKER = '[SHOW]';

async function buildTutorRequest(params: TutorRequestParams) {
  const config = getConfig();
  // History must start with a user turn. A conversation the tutor opened itself
  // keeps that opening, after a stand-in for the start of the call.
  const history = [...params.history];
  if (history.length && history[0].role !== 'user') {
    history.unshift({ role: 'user', content: params.mode === 'voice' ? '(The call started.)' : '(Chat started.)' });
  }
  // Back-to-back turns by the same side (an opening then a nudge) become one.
  for (let i = history.length - 1; i > 0; i--) {
    if (history[i].role === history[i - 1].role) {
      history[i - 1] = { role: history[i].role, content: `${history[i - 1].content}\n\n${history[i].content}` };
      history.splice(i, 1);
    }
  }

  const curriculum = params.curriculum;
  // Documents safety gate (P2): only attested, clean-scanned files go to the model.
  const materialUrls = curriculum && !params.sourcesPrompt ? await filterClearedFileUrls(getCallContext().institutionId, curriculum.materials) : [];
  const materials = materialUrls.length ? await loadMaterials(materialUrls) : [];
  const style =
    params.mode === 'voice'
      ? 'Your reply is spoken aloud by a video avatar: use short, natural spoken sentences, no Markdown, lists, ' +
        'emoji or LaTeX, and say formulas in words. Keep it under about 80 words. ' +
        'Next to you is a visual panel: when the student asks for a picture, diagram, drawing, table or chart, ' +
        'one is drawn there for them automatically while you talk, so never say you cannot show or draw things. ' +
        'Say something like "I\'m putting a diagram on the screen" and talk them through it. ' +
        `If a picture, diagram, table or worked steps on screen would clearly help and the student did not ask, start your reply with ${SHOW_VISUAL_MARKER} (it is hidden from them) and mention you are putting it on the screen. Don't do it for small talk or every turn. `
      : 'keep replies concise and age-appropriate, and use Markdown for steps and formulas. ';
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    {
      type: 'text',
      text:
        "You are Enara's AI tutor for school students. Reply in the student's language (English or Arabic), " +
        style +
        METHOD_GUIDANCE[params.teachingMethod] +
        ' ' +
        PROACTIVE_TEACHING,
    },
  ];
  if (curriculum) {
    system.push({
      type: 'text',
      text:
        "This is the student's curriculum. Before answering, read it (and any lesson materials at the start of " +
        "the conversation) and teach from it: use its terms, examples and level, and focus on the current lesson. " +
        'If the question goes beyond the curriculum, say so briefly and still help at the right level. ' +
        "Don't invent content and claim it comes from the course.\n\n" +
        describeCurriculum(curriculum),
      cache_control: { type: 'ephemeral' },
    });
  }
  if (params.learner) {
    system.push({
      type: 'text',
      text:
        "Where this student stands (use it to personalise and to suggest next steps; don't recite it):\n" +
        params.learner,
    });
  }
  if (params.pedagogy) {
    system.push({ type: 'text', text: params.pedagogy });
  }
  if (params.sourcesPrompt) {
    system.push({ type: 'text', text: params.sourcesPrompt });
  }
  // Lesson materials go in a fixed opening turn, cached together with the
  // system prompt, so later turns don't pay to re-read them.
  const materialTurns: Anthropic.Beta.BetaMessageParam[] = materials.length
    ? [
        {
          role: 'user',
          content: [
            ...materials.slice(0, -1),
            { ...materials[materials.length - 1], cache_control: { type: 'ephemeral' } } as MaterialBlock,
            { type: 'text', text: 'These are the materials for the current lesson.' },
          ],
        },
        { role: 'assistant', content: "I've read the lesson materials." },
      ]
    : [];

  const body = {
      model: params.mode === 'voice' ? config.anthropicVoiceModel : config.anthropicTutorModel,
      max_tokens: params.mode === 'voice' ? 1000 : 4000,
      betas: ['server-side-fallback-2026-07-01'] as Anthropic.Beta.AnthropicBeta[],
      fallbacks: 'default' as const,
      output_config: { effort: config.anthropicTutorEffort },
      system,
      messages: [
        ...materialTurns,
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user' as const, content: params.query },
      ],
  };
  // Budget bound: text is at most one token per byte. A PDF has no such bound,
  // so calls carrying one rely on the school's configured ceiling.
  const hasPdf = materials.some((m) => m.type === 'document' && m.source.type === 'base64');
  const bound = hasPdf ? undefined : { inputTokens: textTokenBound(body.system, body.messages), outputTokens: body.max_tokens, anyModel: true };
  return { materialsCount: materials.length, body, bound };
}

function logModelError(error: unknown) {
  if (error instanceof Anthropic.APIError) {
    logger.warn('direct_tutor_model_failed', { status: error.status, message: error.message });
  } else {
    logger.warn('direct_tutor_model_failed', { error: serializeError(error) });
  }
}

export async function queryDirectTutorModel(
  params: TutorRequestParams,
): Promise<{ answer: string; intent: string; context_found: number; version: string } | null> {
  const config = getConfig();
  if (!config.anthropicApiKey) return null;

  try {
    const { body, materialsCount, bound } = await buildTutorRequest(params);
    const feature = params.mode === 'voice' ? 'tutor_voice' : 'tutor_chat';
    const response = await meteredMessage({ feature, modelName: body.model, maxAttempts: 2, bound }, () => getClient(config.anthropicApiKey!).beta.messages.create(body));

    if (response.stop_reason === 'refusal') {
      logger.warn('direct_tutor_model_refused', { category: response.stop_details?.category ?? null });
      return null;
    }
    const answer = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    if (!answer) return null;
    const contextFound = (params.curriculum ? 1 : 0) + materialsCount;
    return { answer, intent: 'direct_model', context_found: contextFound, version: `anthropic:${response.model}` };
  } catch (error) {
    if (BUDGET_ERROR_CODES.has((error as { code?: string }).code ?? '')) throw error;
    logModelError(error);
    return null;
  }
}

// Streams the reply text as it is generated. Yields nothing if the model is
// unconfigured or fails before any text; a refusal ends the stream early.
export async function* streamDirectTutorModel(params: TutorRequestParams): AsyncGenerator<string> {
  const config = getConfig();
  if (!config.anthropicApiKey) return;

  const feature = params.mode === 'voice' ? 'tutor_voice' : 'tutor_chat';
  try {
    const { body, bound } = await buildTutorRequest(params);
    const client = getClient(config.anthropicApiKey);
    // The gateway logs ai_calls and meters each attempt; a consumer that stops
    // reading early aborts the stream.
    const out: { final?: Anthropic.Beta.BetaMessage } = {};
    for await (const event of meteredStream({ feature, modelName: body.model, maxAttempts: 2, bound }, () => client.beta.messages.stream(body), out)) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    if (out.final?.stop_reason === 'refusal') {
      logger.warn('direct_tutor_model_refused', { category: out.final.stop_details?.category ?? null });
    }
  } catch (error) {
    // A usage-metering conflict is an operational fault, not a model failure.
    // So are budget refusals and pauses: the caller reports them.
    const code = (error as { code?: string }).code;
    if (code === 'USAGE_METERING_FAILED' || BUDGET_ERROR_CODES.has(code ?? '')) throw error;
    logModelError(error);
  }
}

type CourseTree = Awaited<ReturnType<typeof import('./studentCourseService').buildCourseTree>>;

export function curriculumFromCourse(course: CourseTree, lessonId?: string): TutorCurriculum {
  const lessons = course.modules.flatMap((m) => m.lessons);
  const current = lessons.find((l) => l.id === lessonId);
  return {
    courseTitle: course.title,
    subject: course.subject,
    summary: course.curriculumSummary,
    chapters: lessons.map((l) => ({ id: l.id, title: l.title, description: l.description })),
    currentLessonId: current?.id,
    materials: current?.materials ?? [],
  };
}
