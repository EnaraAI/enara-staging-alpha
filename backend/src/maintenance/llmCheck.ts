// Tutor provider checks on lms-test (owner, 21 Nov 2026), behind the maintenance guards (test database + maintenance token):
// - llmCheck(): the endpoint's models, then one call (first, maybe cold), three warm calls and one streamed call, with timings and usage;
// - llmCompare(req): one Anthropic-style request (system, messages, max_tokens) sent through the provider adapter, for the quality check.
// The key comes from the server's own TUTOR_LLM_API_KEY and is never returned or logged. Inputs are fake learner turns from our research
// files; outputs are numbers and model text only.
import { deepseekClient, tutorModel } from '../services/llmProvider';

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
  const c = deepseekClient(55_000);
  const body = { model: model!, max_tokens: 120, temperature: 0.4, system: 'You are a patient English tutor for a 10-year-old. Reply in at most 2 short sentences, then ask ONE question.', messages: [{ role: 'user' as const, content: 'I goed to the park yesterday.' }] };
  const timed = async () => { const t = Date.now(); const r = await c.messages.create(body as never) as unknown as { content: { text: string }[]; usage: unknown; stop_reason: string }; return { ms: Date.now() - t, text: r.content[0]?.text ?? '', usage: r.usage, stop: r.stop_reason }; };
  const first = await timed(); const warm = [await timed(), await timed(), await timed()];
  const t0 = Date.now(); let firstToken: number | null = null; let streamed = '';
  const s = c.messages.stream(body as never) as unknown as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>;
  for await (const e of s) if (e.type === 'content_block_delta' && e.delta?.text) { if (firstToken === null) firstToken = Date.now() - t0; streamed += e.delta.text; }
  return { ok: true, auth, models, model, first: { ms: first.ms, stop: first.stop, usage: first.usage, text: first.text.slice(0, 200) },
    warmMs: warm.map((w) => w.ms), stream: { totalMs: Date.now() - t0, firstTokenMs: firstToken, text: streamed.slice(0, 200) } };
}

export async function llmCompare(req: { system?: string; messages: { role: 'user' | 'assistant'; content: string }[]; max_tokens?: number }) {
  if (!BASE() || !KEY() || !tutorModel()) return { ok: false, reason: 'provider not configured' };
  if (!Array.isArray(req.messages) || !req.messages.length || req.messages.length > 40) return { ok: false, reason: 'messages: 1 to 40' };
  const t = Date.now();
  const r = await deepseekClient(55_000).messages.create({ model: tutorModel()!, max_tokens: Math.min(req.max_tokens ?? 800, 2000), system: String(req.system ?? '').slice(0, 60_000), messages: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 8000) })) } as never) as unknown as { content: { text: string }[]; usage: unknown; stop_reason: string };
  return { ok: true, ms: Date.now() - t, text: r.content[0]?.text ?? '', usage: r.usage, stop: r.stop_reason };
}
