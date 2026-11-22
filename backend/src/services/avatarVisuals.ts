import Anthropic from '@anthropic-ai/sdk';
import { meteredMessage } from './aiGateway';
import { textTokenBound } from './priceCatalog';
import { getConfig } from '../config/env';
import { deepseekClient, deepseekReady, tutorModel } from './llmProvider';
import { logger } from '../utils/logging';
import { parseVisualSpec, renderVisualSpec, VISUAL_SPEC_FORMAT, type VisualSpec } from './visualSpec';
import { VISUAL_RULES_EXTRA, contentProblems, fixSvgLayout, svgProblems } from './visualCheck';

// Visual aid for the live avatar's side panel (ported from the avatar adapter):
// after an answer, Claude decides whether a table, diagram or step list would
// help and, if so, returns self-contained HTML/SVG.

const MAX_HTML_CHARS = 60_000;

// Generated drawings tended to put labels on top of each other or on lines.
// Text goes in normal HTML flow (which can't overlap); SVG only carries shapes
// with a few short, well-spaced labels.
const LAYOUT_RULES = `Layout rules (follow all of them):
- It is shown in a panel about 720px wide and 600px tall; vertical scrolling is fine, horizontal is not. Use max-width:100% on everything and box-sizing:border-box.
- Put titles, explanations, steps, equations and tables in HTML elements (h2, p, ol, table, div with flex or grid and gap), never in SVG.
- Use SVG only for the picture itself (scale, number line, shapes, graph axes, bar model). Give it a viewBox, width="100%" and no fixed height.
- Inside SVG, use at most 8 text labels, each at most 4 words, font-size 14 to 18. Keep every label at least 14px away from other labels and from lines, and never draw text across a line or another shape.
- Label inside a shape only if the shape is wider than 10px per character of the label plus 24px padding; centre it with text-anchor="middle" and dominant-baseline="middle". Otherwise put the label just above or below the shape.
- Leave at least 24px of empty margin inside the viewBox on every side so nothing is clipped.
- Keep it compact: one picture plus a few short steps, under about 120 lines, and plain CSS without repetition.
- Equations and numbers are left-to-right even in Arabic: wrap them in <span dir="ltr"> in HTML and <tspan direction="ltr" unicode-bidi="embed"> in SVG.`;

let client: Anthropic | undefined;
// Tutor provider switch (lms-test, owner 21 Nov 2026): the live avatar's visuals follow the tutor to DeepSeek when it is switched on.
let dsClient: Anthropic | undefined;
const visualClient = (): Anthropic => (deepseekReady() ? (dsClient ??= deepseekClient(40_000)) : (client ??= new Anthropic({ apiKey: getConfig().anthropicApiKey!, timeout: 40_000, maxRetries: 0 })));
const visualModel = (): string => (deepseekReady() ? tutorModel()! : getConfig().anthropicVisualModel);

export function sanitizeVisualHtml(value: string): string {
  // The page renders this in a fully sandboxed iframe; this is a second layer.
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|base|script)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*(['"])\s*(javascript|data):[\s\S]*?\2/gi, '$1=$2$2')
    .replace(/url\(\s*(['"]?)\s*(https?:|\/\/)[^)]*\)/gi, 'none')
    .slice(0, MAX_HTML_CHARS);
}

// The student explicitly asking to see something: a drawing, diagram, picture,
// table or chart, in English or (Egyptian) Arabic.
const VISUAL_REQUEST =
  /\b(draw|diagram|picture|image|visual|visuali[sz]e|chart|graph|table|sketch|illustrat\w*|artifact|show me|on (the )?screen|mind ?map)\b|ارسم|ارسملي|رسمة|رسم|صورة|صوره|شكل|جدول|مخطط|وريني|ورّيني|اعرض|وضح بالرسم|خريطة ذهنية/i;

export function isVisualRequest(text: string): boolean {
  return VISUAL_REQUEST.test(text);
}

// In Arabic (right-to-left) text the browser reorders a bare equation like
// "2x - 3 + 3 = 7 + 3" into nonsense. Equation-like runs in HTML text are
// isolated as left-to-right; SVG labels pick their direction from their content.
const EQUATION_RUN = /[0-9A-Za-z][0-9A-Za-z.,²³√()\s]*(?:\s*[-+−×÷=*/<>≤≥^]\s*[0-9A-Za-z.,²³√()]+)+/g;

export function isolateEquations(html: string): string {
  if (!/[\u0600-\u06FF]/.test(html)) return html;
  let inSvg = 0;
  const out = html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<svg\b/i.test(part)) inSvg += 1;
        else if (/^<\/svg>/i.test(part)) inSvg = Math.max(0, inSvg - 1);
        return part;
      }
      if (inSvg) return part;
      return part.replace(EQUATION_RUN, (run) => {
        const trimmed = run.trim();
        const lead = run.slice(0, run.indexOf(trimmed));
        const trail = run.slice(run.indexOf(trimmed) + trimmed.length);
        return `${lead}<bdi dir="ltr">${trimmed}</bdi>${trail}`;
      });
    })
    .join('');
  return '<style>bdi{unicode-bidi:isolate}svg text{unicode-bidi:plaintext}</style>' + out;
}

export async function generateVisualAid(params: {
  question: string;
  answer?: string;
  // What the call is about, for a visual requested before the answer exists.
  context?: string;
  // The student asked for it: always draw something.
  requested?: boolean;
  // Live calls use 'avatar_visual' (exempt from the staging cap); the text
  // tutor uses 'tutor_visual', which stays under it.
  feature?: 'avatar_visual' | 'tutor_visual';
}): Promise<string | null> {
  const config = getConfig();
  if (!config.anthropicApiKey) return null;
  // Fast path: a short description built into the page here. A full page is
  // written only when the description can't be used.
  const described = await describeVisual(params);
  if (described !== undefined) return described;
  return writeVisualPage(params);
}

function visualPrompt(params: { question: string; answer?: string; context?: string; requested?: boolean }): string {
  const { question, answer, context, requested } = params;
  return (
    'You make visual aids for an AI tutor talking with a school student.\n\n' +
    (context ? `<lesson_context>${context}</lesson_context>\n` : '') +
    `<student_message>${question}</student_message>\n` +
    (answer ? `<tutor_answer>${answer}</tutor_answer>\n` : '') +
    '\n' +
    (requested
      ? 'The student asked to see this visually. Make the clearest visual explanation of the concept they ' +
        'are asking about (use the lesson context if they say "this" or "it"): a labelled diagram, worked ' +
        'steps, a table, a number line, a graph or a simple illustration.\n'
      : 'Decide whether a visual aid genuinely helps here. Good cases: worked steps, formulas, tables, ' +
        'comparisons, timelines, vocabulary lists, diagrams. Small talk and simple yes/no answers do not need one.\n') +
    'Write it in the language of the student message.\n'
  );
}

// undefined: no usable description (the caller writes a full page instead).
async function describeVisual(params: Parameters<typeof generateVisualAid>[0]): Promise<string | null | undefined> {
  const { question, answer, context, requested, feature = 'avatar_visual' } = params;
  const conversation = [context, question, answer].filter(Boolean).join('\n');
  const ask = async (note?: string): Promise<{ spec: VisualSpec | null; stop?: 'refusal' | 'max_tokens' }> => {
    const bound = { inputTokens: textTokenBound(question, answer, context, VISUAL_SPEC_FORMAT, VISUAL_RULES_EXTRA, note ?? '') + 1500, outputTokens: 3000 };
    const response = await meteredMessage({ feature, modelName: visualModel(), bound }, () => visualClient().messages.create({
      model: visualModel(),
      max_tokens: 3000,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: visualPrompt(params) + VISUAL_SPEC_FORMAT + '\n' + VISUAL_RULES_EXTRA + (requested ? '' : '\nIf it does not help, reply with exactly {"kind":"none"}') + (note ? `\n\n${note}` : ''),
        },
      ],
    }));
    if (response.stop_reason === 'refusal') return { spec: null, stop: 'refusal' };
    if (response.stop_reason === 'max_tokens') return { spec: null, stop: 'max_tokens' };
    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim();
    const spec = parseVisualSpec(text);
    if (!spec) logger.warn('avatar_visual_spec_unusable', { chars: text.length });
    return { spec };
  };
  try {
    let r = await ask();
    if (r.stop === 'refusal') return null;
    if (r.stop === 'max_tokens' || !r.spec) return undefined;
    if (r.spec.kind === 'none') return requested ? undefined : null;
    // Visual check (visualCheck.ts): fix the layout, then one redo with the reasons if something is still wrong.
    let checked = checkVisual(r.spec, conversation);
    if (checked.problems.length) {
      logger.info('avatar_visual_redo', { problems: checked.problems.length, kind: r.spec.kind });
      r = await ask(`YOUR LAST VISUAL WAS REJECTED. Fix this and keep it simple:\n${checked.problems.map((x) => `- ${x}`).join('\n')}`);
      if (r.spec && r.spec.kind !== 'none') {
        const again = checkVisual(r.spec, conversation);
        if (again.problems.length < checked.problems.length) checked = again;
      }
    }
    // Only hard problems (overlaps, lines through labels, labels outside, made-up content) replace a drawing by a text card; a small
    // unlabelled shape (an eye, a bubble) only asks for the one redo.
    const hard = checked.problems.filter((x) => !x.startsWith('a small '));
    const spec = hard.length ? fallbackCard(checked.spec) : checked.spec;
    if (!spec) return null;
    return isolateEquations(sanitizeVisualHtml(renderVisualSpec(spec, sanitizeVisualHtml)));
  } catch (error) {
    logger.warn('avatar_visual_failed', { message: (error as Error).message });
    return null;
  }
}

type Shown = Exclude<VisualSpec, { kind: 'none' }>;
/** The visible lines of a visual (for the content check). */
function visualLines(spec: Shown): string[] {
  switch (spec.kind) {
    case 'table': return spec.rows.map((r) => r.join(' '));
    case 'list': return spec.items.map((i) => [i.term, i.detail].filter(Boolean).join(' '));
    case 'steps': return spec.items;
    case 'dialogue': return spec.lines.map((l) => l.text);
    case 'timeline': return spec.items.map((i) => `${i.when} ${i.text}`);
    case 'svg': return [...[...spec.svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean), ...(spec.caption ? [spec.caption] : [])];
  }
}
/** Layout fix plus what is still wrong. */
function checkVisual(spec: Shown, conversation: string): { spec: Shown; problems: string[] } {
  let s = spec;
  if (s.kind === 'svg') { const f = fixSvgLayout(s.svg); s = { ...s, svg: f.svg }; }
  const problems = [...(s.kind === 'svg' ? svgProblems(s.svg) : []), ...contentProblems(visualLines(s), conversation)];
  return { spec: s, problems };
}
/** When a drawing still has problems after the redo: a clean text card (the title and the caption), never a broken picture. */
function fallbackCard(spec: Shown): Shown | null {
  if (spec.kind !== 'svg') return spec; // text visuals: the content problems were already reduced by the redo; shown as they are
  return spec.caption ? { kind: 'list', title: spec.title, items: [{ term: spec.caption }], ...(spec.rtl ? { rtl: true } : {}) } as Shown : null;
}

async function writeVisualPage(params: Parameters<typeof generateVisualAid>[0]): Promise<string | null> {
  const { question, answer, context, requested, feature = 'avatar_visual' } = params;
  const config = getConfig();
  try {
    // Bound: the variable parts plus 4,000 tokens for the fixed instructions.
    const bound = { inputTokens: textTokenBound(question, answer, context, LAYOUT_RULES) + 4000, outputTokens: 12_000 };
    const response = await meteredMessage({ feature, modelName: visualModel(), bound }, () => visualClient().messages.create({
      model: visualModel(),
      max_tokens: 12_000,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content:
            'You make visual aids for an AI tutor talking with a school student.\n\n' +
            (context ? `<lesson_context>${context}</lesson_context>\n` : '') +
            `<student_message>${question}</student_message>\n` +
            (answer ? `<tutor_answer>${answer}</tutor_answer>\n` : '') +
            '\n' +
            (requested
              ? 'The student asked to see this visually. Make the clearest visual explanation of the concept they ' +
                'are asking about (use the lesson context if they say "this" or "it"): a labelled diagram, worked ' +
                'steps, a table, a number line, a graph or a simple illustration drawn in inline SVG.\n'
              : 'Decide whether a visual aid genuinely helps here. Good cases: worked steps, formulas, tables, ' +
                'comparisons, timelines, vocabulary lists, diagrams. Small talk and simple yes/no answers do not need one.\n') +
            'Reply with ONLY clean, self-contained HTML/CSS/inline SVG: no JavaScript, forms, iframes, ' +
            'external images, fonts or links, and no Markdown fences. White background, blue #0056D2 accents, ' +
            'system-ui font. Write it in the language of the student message (dir="rtl" on the root for Arabic).\n' +
            LAYOUT_RULES +
            (requested ? '' : '\nIf it does not help, reply with exactly NO_VISUAL'),
        },
      ],
    }));
    if (response.stop_reason === 'refusal') return null;
    // A cut-off page shows half a drawing; better none.
    if (response.stop_reason === 'max_tokens') {
      logger.warn('avatar_visual_truncated', { outputTokens: response.usage.output_tokens });
      return null;
    }
    let html = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    if (!html || (!requested && html.includes('NO_VISUAL'))) return null;
    html = html.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    html = isolateEquations(sanitizeVisualHtml(html));
    return html.includes('<') ? html : null;
  } catch (error) {
    logger.warn('avatar_visual_failed', { message: (error as Error).message });
    return null;
  }
}
