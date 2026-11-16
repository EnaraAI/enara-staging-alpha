import { IDENTITY_RULE } from '../utils/vendorNeutral';
import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { buildOverview } from './analyticsService';
import { meteredMessage } from './aiGateway';
import { textTokenBound } from './priceCatalog';

// The staff "data assistant": answers questions about one school's own data.
// The data is built here, scoped by the caller's institution, so the browser
// never holds provider keys or decides what data the model sees.

let client: Anthropic | undefined;

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Privacy (P22, owner decision 2026-11-01): no student-level record leaves
// the backend for this assistant. The model gets school-level aggregates only
// (totals, courses, subjects, weakest topics), never a roster, name, ID,
// score, risk flag or answer. Names typed in a question are replaced with
// "[student]" before the call. Per-student reports (with real names, for
// authorised staff) come from the deterministic Educator Chat analytics,
// which never call a model.
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function nameRedactor(names: string[]) {
  const words = new Set<string>();
  for (const n of names) {
    const full = (n || '').trim();
    if (full) words.add(full);
    for (const w of full.split(/\s+/)) if ([...w].length >= 3) words.add(w);
  }
  // Longest first, so a full name is replaced before its parts.
  const rules = [...words].sort((a, b) => b.length - a.length).map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, 'giu'));
  return (text: string) => rules.reduce((t, re) => t.replace(re, '[student]'), text).replace(/(\[student\]\s*)+/g, '[student] ');
}

// What the model may see: school-level aggregates only (see header).
export function assistantData(overview: Awaited<ReturnType<typeof buildOverview>>) {
  return {
    generatedAt: overview.generatedAt,
    definitions: overview.definitions,
    totals: overview.totals,
    courses: (overview as { courses?: unknown[] }).courses,
    subjects: overview.subjects,
    weakestTopics: overview.topics.slice(0, 15),
    // Counts only: never a per-student row (see header).
    studentCounts: {
      total: overview.students.length,
      byStatus: overview.students.reduce<Record<string, number>>((acc, s) => { const k = String(s.status ?? 'unknown'); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
      withRiskFlags: overview.students.filter((s) => Array.isArray(s.riskFlags) && s.riskFlags.length > 0).length,
    },
  };
}

export async function answerDataQuestion(scope: Record<string, unknown>, message: string, history: AssistantTurn[]) {
  const config = getConfig();
  if (!config.anthropicApiKey) throw new AppError('The assistant is not configured', 503, 'AI_UNAVAILABLE');
  // Retries happen in the gateway (metered), not in the SDK.
  client ??= new Anthropic({ apiKey: config.anthropicApiKey, timeout: 25_000, maxRetries: 0 });

  const overview = await buildOverview(scope);
  const redact = nameRedactor(overview.students.map((s) => String(s.name ?? '')));
  const data = assistantData(overview);

  const institutionId = typeof scope.institutionId === 'string' ? scope.institutionId : undefined;
  const system =
    "You are Enara's data assistant for school staff. Answer only from the school data provided, which " +
    'is computed from real activity. If the data does not answer the question, say so plainly; never ' +
    'invent students, numbers or deadlines. Be concise and use Markdown lists or tables where they help. ' +
    'The data has no individual students. If asked about a particular student, say that individual reports are in ' +
    'Educator Chat (class analytics) and give school-level context only. ' +
    IDENTITY_RULE +
    '\n\n' +
    `<school_data>${JSON.stringify(data)}</school_data>`;
  const messages = [...history.slice(-6), { role: 'user' as const, content: message }].map((m) => ({ ...m, content: redact(m.content) }));
  const response = await meteredMessage(
    {
      feature: 'staff_assistant', modelName: config.anthropicTutorModel, institutionId, maxAttempts: 2,
      bound: { inputTokens: textTokenBound(system, messages), outputTokens: 2000 },
    },
    () =>
      client!.messages.create({
        model: config.anthropicTutorModel,
        max_tokens: 2000,
        output_config: { effort: 'low' },
        system,
        messages,
      }),
  );
  const answer = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  if (!answer || response.stop_reason === 'refusal') {
    throw new AppError('The assistant could not answer that', 502, 'AI_NO_ANSWER');
  }
  return { answer, aiGenerated: true as const };
}
