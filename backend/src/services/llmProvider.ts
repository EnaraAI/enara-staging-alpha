// Tutor LLM provider switch (owner, 21 Nov 2026): until the new Anthropic key arrives, learner-facing model calls on lms-test can go to
// DeepSeek V4.1 Flash on our Modal endpoint (OpenAI-compatible chat completions). Internal settings, lms-test only:
//   TUTOR_LLM_PROVIDER=deepseek   (anything else / unset: Anthropic, as everywhere else)
//   TUTOR_LLM_ENDPOINT            the OpenAI-compatible base URL (…/v1)
//   TUTOR_LLM_MODEL               the model id from GET /v1/models
//   TUTOR_LLM_API_KEY             Sensitive; never logged. Sent as "Authorization: Bearer"; if that is refused (401/403), the value is split
//                                 at the first "." into Modal-Key / Modal-Secret headers.
//   TUTOR_LLM_PRICE_IN / _OUT     USD per million tokens for budget reservations and cost records (until set: a cautious upper-bound estimate).
// The adapter looks like the Anthropic SDK client to its callers (messages.create / messages.stream, and the beta variants): it converts
// our Anthropic-style requests (system, messages, max_tokens) to chat completions and the replies back (text content, stop_reason, usage),
// including streaming as Anthropic-style events. So metering, the fallback and every engine check (child trim, one task, marker parsing,
// grading) run on the reply exactly as before. Documents sent as PDF blocks cannot be read by this model: they are left out (passages
// from the school's materials are text and are kept).
import type Anthropic from '@anthropic-ai/sdk';

export const tutorProvider = (): 'deepseek' | 'anthropic' => (process.env.TUTOR_LLM_PROVIDER?.trim().toLowerCase() === 'deepseek' ? 'deepseek' : 'anthropic');
export const tutorModel = (): string | undefined => process.env.TUTOR_LLM_MODEL?.trim() || undefined;
const endpoint = () => (process.env.TUTOR_LLM_ENDPOINT?.trim() || '').replace(/\/+$/, '');
const key = () => process.env.TUTOR_LLM_API_KEY?.trim() || '';
/** DeepSeek is used only when switched on AND fully configured; otherwise Anthropic stays in place. */
export const deepseekReady = (): boolean => tutorProvider() === 'deepseek' && Boolean(endpoint() && key() && tutorModel());

/** Prices (USD per million tokens) for the reservation bound and the cost record. Defaults are a cautious upper bound, not a quote. */
export function deepseekPrices(): { input: number; output: number } {
  const n = (v: string | undefined, d: number) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : d; };
  return { input: n(process.env.TUTOR_LLM_PRICE_IN, 1), output: n(process.env.TUTOR_LLM_PRICE_OUT, 4) };
}

type Block = { type: string; text?: string; source?: { type?: string; media_type?: string; data?: string } };
type AMsg = { role: 'user' | 'assistant'; content: string | Block[] };
type ABody = { model: string; max_tokens: number; system?: string | Block[]; messages: AMsg[]; temperature?: number; stop_sequences?: string[]; [k: string]: unknown };

const textOf = (c: string | Block[] | undefined): string => {
  if (!c) return '';
  if (typeof c === 'string') return c;
  return c.map((b) => (b.type === 'text' ? b.text ?? '' : b.type === 'document' && b.source?.type === 'text' ? b.source.data ?? '' : '')).filter(Boolean).join('\n\n');
};
// The model "reasons" by default: its reasoning goes to a separate field and uses the output budget, so short tutor replies came back
// EMPTY (check on lms-test, 21 Nov). Reasoning is switched off. Servers spell that differently: we send `reasoning_effort: "none"`;
// if the server refuses the request (400), the next spelling is tried (`chat_template_kwargs.thinking=false`), then neither. Learned once
// per instance. If the reply still has no text but has reasoning, the reasoning is NOT shown (it is not a reply to the learner).
export const REASONING_OFF: Record<string, unknown>[] = [{ reasoning_effort: 'none' }, { chat_template_kwargs: { thinking: false, enable_thinking: false } }, {}];
let reasoningMode = 0;
export const _resetReasoningMode = () => { reasoningMode = 0; };
export const reasoningModeUsed = () => Object.keys(REASONING_OFF[reasoningMode])[0] ?? 'default';
// Quality check (20 saved turns, 21 Nov): without a reminder DeepSeek left out the hidden grading line in 3 of 20 replies and sometimes
// gave a long worked example instead of answering. A short reminder at the END of the system prompt (where this model follows
// instructions best) lifted valid lines to 18 of 20. Added only when the request asks for the hidden line; repairOnce covers the rest.
export const DEEPSEEK_REMINDER = 'Rules for this reply, most important first:\n1. Your reply MUST start with the hidden line [[assess verdict=... relevance=... next=...]] in exactly the format described above. Never leave it out.\n2. Reply to the STUDENT\'s LAST message in the conversation: judge that answer first (right, partly right or wrong; a spelling slip is an error), then give exactly ONE task.\n3. Keep to the length limits for this learner. No stories, lists or worked examples unless the instructions above ask for one now.';
/** Anthropic-style request -> chat-completions request. */
export function toChat(body: ABody, stream: boolean): Record<string, unknown> {
  const base = textOf(body.system as string | Block[] | undefined);
  const system = base.includes('[[assess') ? `${base}\n\n${DEEPSEEK_REMINDER}` : base;
  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...body.messages.map((m) => ({ role: m.role, content: textOf(m.content) })).filter((m) => m.content),
  ];
  return {
    model: tutorModel(), messages, max_tokens: body.max_tokens,
    ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
    ...(body.stop_sequences?.length ? { stop: body.stop_sequences } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    ...REASONING_OFF[reasoningMode],
  };
}
const STOP: Record<string, string> = { stop: 'end_turn', length: 'max_tokens', content_filter: 'refusal', tool_calls: 'tool_use' };
type Usage = { prompt_tokens?: number; completion_tokens?: number } | undefined;
const usageOf = (u: Usage) => ({ input_tokens: u?.prompt_tokens ?? 0, output_tokens: u?.completion_tokens ?? 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
/** chat-completions reply -> Anthropic-style message. */
export function fromChat(j: { id?: string; model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string | null }[]; usage?: Usage }) {
  const c = j.choices?.[0];
  return {
    id: j.id ?? 'deepseek', type: 'message', role: 'assistant', model: j.model ?? tutorModel() ?? 'deepseek',
    content: [{ type: 'text', text: c?.message?.content ?? '' }],
    stop_reason: STOP[c?.finish_reason ?? 'stop'] ?? 'end_turn', stop_sequence: null, usage: usageOf(j.usage),
  };
}

class ProviderError extends Error { constructor(public status: number, msg: string) { super(msg); this.name = 'ProviderError'; } }
let splitAuth = false; // learned once per instance when Bearer is refused
function headers(): Record<string, string> {
  const k = key(); const dot = k.indexOf('.');
  return splitAuth && dot > 0 ? { 'Modal-Key': k.slice(0, dot), 'Modal-Secret': k.slice(dot + 1) } : { Authorization: `Bearer ${k}` };
}
async function post(payload: () => unknown, signal?: AbortSignal, timeout = 60_000): Promise<Response> {
  const go = () => fetch(`${endpoint()}/chat/completions`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload()), signal: signal ?? AbortSignal.timeout(timeout) });
  let r = await go();
  if ((r.status === 401 || r.status === 403) && !splitAuth && key().includes('.')) { splitAuth = true; r = await go(); }
  while (r.status === 400 && reasoningMode < REASONING_OFF.length - 1) { reasoningMode++; r = await go(); }
  if (!r.ok) throw new ProviderError(r.status, `tutor provider HTTP ${r.status}`);
  return r;
}

/** An Anthropic-event stream over a chat-completions SSE stream: message_start, text deltas, message_delta (stop, usage), message_stop. */
function streamOf(body: ABody, timeout: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  let final: ReturnType<typeof fromChat> | undefined;
  let resolveFinal!: (m: ReturnType<typeof fromChat>) => void; let rejectFinal!: (e: unknown) => void;
  const finalP = new Promise<ReturnType<typeof fromChat>>((res, rej) => { resolveFinal = res; rejectFinal = rej; });
  finalP.catch(() => undefined);
  async function* events() {
    let text = ''; let finish = 'stop'; let usage: Usage; let model = tutorModel();
    try {
      const r = await post(() => toChat(body, true), ac.signal);
      yield { type: 'message_start', message: { id: 'deepseek', type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage: usageOf(undefined) } };
      yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
      const rd = r.body!.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
          const j = JSON.parse(d) as { model?: string; usage?: Usage; choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[] };
          if (j.model) model = j.model;
          if (j.usage) usage = j.usage;
          const ch = j.choices?.[0];
          if (ch?.finish_reason) finish = ch.finish_reason;
          const t = ch?.delta?.content;
          if (t) { text += t; yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }; }
        }
      }
      yield { type: 'content_block_stop', index: 0 };
      final = fromChat({ model, choices: [{ message: { content: text }, finish_reason: finish }], usage });
      yield { type: 'message_delta', delta: { stop_reason: final.stop_reason, stop_sequence: null }, usage: { output_tokens: final.usage.output_tokens } };
      yield { type: 'message_stop' };
      resolveFinal(final);
    } catch (e) { rejectFinal(e); throw e; } finally { clearTimeout(timer); }
  }
  const it = events();
  return { [Symbol.asyncIterator]: () => it, finalMessage: () => finalP, abort: () => ac.abort() };
}

/** A client with the same call shape as the Anthropic SDK (messages and beta.messages: create, stream). */
export function deepseekClient(timeout: number) {
  const messages = {
    create: async (body: ABody) => fromChat((await (await post(() => toChat(body, false), undefined, timeout)).json()) as Parameters<typeof fromChat>[0]),
    stream: (body: ABody) => streamOf(body, timeout),
  };
  return { messages, beta: { messages } } as unknown as Anthropic;
}
