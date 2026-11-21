// Tutor provider checks on lms-test (owner, 21 Nov 2026), behind the maintenance guards (test database + maintenance token):
// - llmCheck(): the endpoint's models, then one call (first, maybe cold), three warm calls and one streamed call, with timings and usage;
// - llmCompare(req): one Anthropic-style request (system, messages, max_tokens) sent through the provider adapter, for the quality check.
// The key comes from the server's own TUTOR_LLM_API_KEY and is never returned or logged. Inputs are fake learner turns from our research
// files; outputs are numbers and model text only.
import { REASONING_OFF, deepseekClient, reasoningModeUsed, tutorModel } from '../services/llmProvider';

const BASE = () => (process.env.TUTOR_LLM_ENDPOINT?.trim() || '').replace(/\/+$/, '');
const KEY = () => process.env.TUTOR_LLM_API_KEY?.trim() || '';

export async function llmCheck(): Promise<Record<string, unknown>> {
  if (!BASE() || !KEY()) return { ok: false, reason: 'TUTOR_LLM_ENDPOINT or TUTOR_LLM_API_KEY not set' };
  const k = KEY(); const dot = k.indexOf('.');
  const tries: [string, Record<string, string>][] = [['bearer', { Authorization: `Bearer ${k}` }], ...(dot > 0 ? [['modal-key/secret', { 'Modal-Key': k.slice(0, dot), 'Modal-Secret': k.slice(dot + 1) }] as [string, Record<string, string>]] : [])];
  let auth: string | null = null; let models: unknown = null; const authTries: Record<string, number> = {};
  for (const [name, h] of tries) {
    const t = Date.now(); const r = await fetch(`${BASE()}/models`, { headers: h, signal: AbortSignal.timeout(45_000) }).catch(() => null);
    authTries[name] = r?.status ?? 0;
    if (r?.ok) { auth = name; models = ((await r.json()) as { data?: unknown[] }).data; authTries[`${name}_ms`] = Date.now() - t; break; }
  }
  if (!auth) return { ok: false, authTries };
  const model = tutorModel() ?? (models as { id: string }[])?.[0]?.id;
  if (!process.env.TUTOR_LLM_MODEL && model) process.env.TUTOR_LLM_MODEL = model; // for this check only (the setting itself is set by the deploy manifest)
  // How each "reasoning off" spelling behaves (status, reply length, reasoning length): numbers only.
  const probes: Record<string, unknown>[] = [];
  for (const extra of REASONING_OFF) {
    const t = Date.now();
    const r = await fetch(`${BASE()}/chat/completions`, { method: 'POST', headers: { ...tries.find(([n]) => n === auth)![1], 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({ model, max_tokens: 120, messages: [{ role: 'user', content: 'Say hello in five words.' }], ...extra }) }).catch(() => null);
    const j = r?.ok ? (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string }[] } : {};
    const m = j.choices?.[0];
    probes.push({ variant: Object.keys(extra)[0] ?? 'default', status: r?.status ?? 0, ms: Date.now() - t, replyChars: m?.message?.content?.length ?? 0, reasoningChars: m?.message?.reasoning_content?.length ?? 0, finish: m?.finish_reason });
  }
  const c = deepseekClient(55_000);
  const body = { model: model!, max_tokens: 120, temperature: 0.4, system: 'You are a patient English tutor for a 10-year-old. Reply in at most 2 short sentences, then ask ONE question.', messages: [{ role: 'user' as const, content: 'I goed to the park yesterday.' }] };
  const timed = async () => { const t = Date.now(); const r = await c.messages.create(body as never) as unknown as { content: { text: string }[]; usage: unknown; stop_reason: string }; return { ms: Date.now() - t, text: r.content[0]?.text ?? '', usage: r.usage, stop: r.stop_reason }; };
  const first = await timed(); const warm = [await timed(), await timed(), await timed()];
  const t0 = Date.now(); let firstToken: number | null = null; let streamed = '';
  const s = c.messages.stream(body as never) as unknown as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>;
  for await (const e of s) if (e.type === 'content_block_delta' && e.delta?.text) { if (firstToken === null) firstToken = Date.now() - t0; streamed += e.delta.text; }
  return { ok: true, auth, models, model, probes, reasoningMode: reasoningModeUsed(), first: { ms: first.ms, stop: first.stop, usage: first.usage, text: first.text.slice(0, 200) },
    warmMs: warm.map((w) => w.ms), stream: { totalMs: Date.now() - t0, firstTokenMs: firstToken, text: streamed.slice(0, 200) } };
}

export async function llmCompare(req: { system?: string; messages: { role: 'user' | 'assistant'; content: string }[]; max_tokens?: number }) {
  if (!BASE() || !KEY() || !tutorModel()) return { ok: false, reason: 'provider not configured' };
  if (!Array.isArray(req.messages) || !req.messages.length || req.messages.length > 40) return { ok: false, reason: 'messages: 1 to 40' };
  const t = Date.now();
  const r = await deepseekClient(55_000).messages.create({ model: tutorModel()!, max_tokens: Math.min(req.max_tokens ?? 800, 2000), system: String(req.system ?? '').slice(0, 60_000), messages: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 8000) })) } as never) as unknown as { content: { text: string }[]; usage: unknown; stop_reason: string };
  return { ok: true, ms: Date.now() - t, text: r.content[0]?.text ?? '', usage: r.usage, stop: r.stop_reason };
}

// DeepSeek match quality check (owner go 21 Nov 2026, docs/tutor/DEEPSEEK_MATCH_PLAN.md step 6): one fake tutor turn through the REAL prompt
// builder (buildTutorRequest: base instructions, learner line, pedagogy incl. the subject grading line and "not in the materials" line,
// language context, course passages) and the DeepSeek adapter, with the match parts on ("match") or off ("base", as live before). Then the
// same reading the tutor uses: the hidden line is parsed and removed, one repair call when it is missing (repairOnce), citations counted.
// Fake learners and fake course passages only (backend/eval); numbers, model text and the parsed hidden line are returned.
export type EvalTurn = {
  history: { role: 'user' | 'assistant'; content: string }[]; query: string; learner?: string; languageContext?: string;
  sources?: { fileName: string; page?: number; text: string; lessonId?: string }[]; practice?: boolean; outOfScope?: boolean; mode?: 'chat' | 'voice';
};
export async function tutorEval(req: { arm?: string; turn?: EvalTurn }) {
  if (!BASE() || !KEY() || !tutorModel()) return { ok: false, reason: 'provider not configured' };
  const t = req.turn;
  if (!t || typeof t.query !== 'string' || !Array.isArray(t.history) || t.history.length > 40) return { ok: false, reason: 'turn: query and history (<= 40)' };
  const { buildTutorRequest } = await import('../services/directTutorModel');
  const { SUBJECT_GRADE_LINE } = await import('../services/subjectPractice');
  const { OUT_OF_SCOPE_LINE } = await import('../services/groundedRefusal');
  const { MISSING_MARKER_NOTE } = await import('../services/repairOnce');
  const { stripAssessmentMarkers } = await import('../services/languageLearningState');
  const { sourcesPrompt, citationsIn } = await import('../services/curriculumRetrieval');
  const { dsParts } = await import('../services/deepseekTutor');
  const sources = (t.sources ?? []).slice(0, 8).map((s, i) => ({ n: i + 1, chunkId: `eval-${i + 1}`, text: String(s.text).slice(0, 4000), fileName: String(s.fileName).slice(0, 120), fileUrl: '', page: s.page, lessonId: s.lessonId ?? 'eval', score: 1 }));
  const pedagogy = [t.practice ? SUBJECT_GRADE_LINE : undefined, t.outOfScope ? OUT_OF_SCOPE_LINE : undefined].filter(Boolean).join('\n\n') || undefined;
  const params = { query: t.query.slice(0, 4000), history: t.history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' as const : 'user' as const, content: String(h.content).slice(0, 8000) })),
    teachingMethod: 'socratic' as never, mode: t.mode === 'voice' ? 'voice' as const : 'chat' as const, learner: t.learner?.slice(0, 2000), pedagogy,
    sourcesPrompt: sources.length ? sourcesPrompt(sources) : undefined, languageContext: t.languageContext?.slice(0, 60_000) };
  const off = { gradeFirst: false, answerCheck: false, examples: false, replyChecks: false, tuning: false };
  const client = deepseekClient(55_000, { parts: req.arm === 'match' ? dsParts(true) : off });
  const ask = async (p: typeof params) => {
    const { body } = await buildTutorRequest(p);
    (body as { model: string }).model = tutorModel()!;
    const r = await client.beta.messages.create(body as never) as unknown as { content: { text: string }[]; usage: { input_tokens: number; output_tokens: number } };
    return { raw: r.content[0]?.text ?? '', usage: r.usage };
  };
  const t0 = Date.now();
  let a = await ask(params); let s = stripAssessmentMarkers(a.raw); let repaired = false;
  const usage = { ...a.usage };
  if (!s.assessment && s.text) { // repairOnce, as the tutor does
    repaired = true;
    const b = await ask({ ...params, pedagogy: [params.pedagogy, MISSING_MARKER_NOTE].filter(Boolean).join('\n\n') });
    usage.input_tokens += b.usage.input_tokens; usage.output_tokens += b.usage.output_tokens;
    const s2 = stripAssessmentMarkers(b.raw);
    if (s2.text && s2.assessment) { a = b; s = s2; }
  }
  return { ok: true, ms: Date.now() - t0, raw: a.raw, text: s.text, assessment: s.assessment, repaired, citations: citationsIn(s.text, sources).length, usage };
}
