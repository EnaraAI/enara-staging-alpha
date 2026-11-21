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
import { logger } from '../utils/logging';
import { type ChatCall, type ChatMsg, type DsParts, dsParts, gradedReply, isGraded } from './deepseekTutor';

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
export function toChat(body: ABody, stream: boolean, opts: { reminder?: boolean } = {}): Record<string, unknown> {
  const base = textOf(body.system as string | Block[] | undefined);
  const system = base.includes('[[assess') && opts.reminder !== false ? `${base}\n\n${DEEPSEEK_REMINDER}` : base;
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

/** One chat-completions call for the graded turn (deepseekTutor.ts). Reasoning stays off unless a level is asked for. With onDelta the reply
 * is streamed; onDelta returning false stops it (the text so far is kept; output tokens are then estimated). */
function chatCall(timeout: number, signal?: AbortSignal): ChatCall {
  return async (q) => {
    const ac = new AbortController();
    const onAbort = () => ac.abort(); signal?.addEventListener('abort', onAbort);
    const payload = () => ({
      model: tutorModel(), messages: q.messages, max_tokens: q.max_tokens,
      ...(typeof q.temperature === 'number' ? { temperature: q.temperature } : {}),
      ...(q.json ? { response_format: { type: 'json_object' } } : {}),
      ...(q.onDelta ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...(q.reasoning && q.reasoning !== 'none' && reasoningMode === 0 ? { reasoning_effort: q.reasoning } : REASONING_OFF[reasoningMode]),
    });
    try {
      let r: Response;
      try { r = await post(payload, ac.signal, timeout); } catch (e) {
        if (!q.json || (e as { status?: number }).status !== 400) throw e;
        r = await post(() => { const x = payload() as Record<string, unknown>; delete x.response_format; return x; }, ac.signal, timeout); // a server without JSON mode
      }
      if (!q.onDelta) {
        const m = fromChat((await r.json()) as Parameters<typeof fromChat>[0]);
        return { text: m.content[0]?.text ?? '', finish: m.stop_reason, usage: { input_tokens: m.usage.input_tokens, output_tokens: m.usage.output_tokens } };
      }
      let text = ''; let finish = 'stop'; let usage: Usage; let stopped = false;
      const rd = r.body!.getReader(); const dec = new TextDecoder(); let buf = '';
      try {
        outer: for (;;) {
          const { done, value } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
            const j = JSON.parse(d) as { usage?: Usage; choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[] };
            if (j.usage) usage = j.usage;
            const ch = j.choices?.[0];
            if (ch?.finish_reason) finish = ch.finish_reason;
            const t = ch?.delta?.content;
            if (t) { text += t; if (q.onDelta(t) === false) { stopped = true; break outer; } }
          }
        }
      } finally { if (stopped) { ac.abort(); rd.cancel().catch(() => undefined); } }
      const u = usageOf(usage);
      if (stopped || !u.output_tokens) u.output_tokens = Math.max(u.output_tokens, Math.ceil(text.length / 3));
      return { text, finish: STOP[finish] ?? 'end_turn', usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens } };
    } finally { signal?.removeEventListener('abort', onAbort); }
  };
}
const anyPart = (p: DsParts) => p.gradeFirst || p.answerCheck || p.examples || p.replyChecks || p.tuning;
const gradeReasoning = () => { const v = process.env.TUTOR_LLM_GRADE_REASONING?.trim().toLowerCase(); return v && ['none', 'low', 'high'].includes(v) ? v : 'none'; };
async function graded(body: ABody, parts: DsParts, timeout: number, signal?: AbortSignal, onText?: (t: string) => void) {
  const chat = toChat(body, false, { reminder: !parts.gradeFirst }) as { messages: ChatMsg[] };
  const [sys, ...rest] = chat.messages[0]?.role === 'system' ? chat.messages : [{ role: 'system' as const, content: '' }, ...chat.messages];
  const r = await gradedReply({ system: sys.content, messages: rest, maxTokens: body.max_tokens, temperature: body.temperature, parts, call: chatCall(timeout, signal), gradeReasoning: gradeReasoning(), onText });
  // Timings only (no learner text): where a DeepSeek turn spends its time.
  logger.info('ds_turn_timing', { ...r.meta.timings, regenerated: r.meta.regenerated.length, verdict: r.meta.grade?.verdict ?? null });
  const m = fromChat({ model: tutorModel(), choices: [{ message: { content: r.text }, finish_reason: r.finish === 'max_tokens' ? 'length' : 'stop' }], usage: { prompt_tokens: r.usage.input_tokens, completion_tokens: r.usage.output_tokens } });
  return Object.assign(m, { ds_meta: { timings: r.meta.timings, regenerated: r.meta.regenerated, skippedGrade: Boolean(r.meta.timings.skippedGrade) } });
}
/** A graded turn as a stream. dsFast: checked sentences are sent as they are ready; otherwise the reply is written whole first, then sent. */
function gradedStream(body: ABody, parts: DsParts, timeout: number) {
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), timeout);
  const queue: string[] = []; let wake: (() => void) | null = null; let ended = false;
  const push = (t: string) => { queue.push(t); wake?.(); };
  const live = Boolean(parts.fast && parts.gradeFirst);
  const finalP = graded(body, parts, timeout, ac.signal, live ? push : undefined).finally(() => { clearTimeout(timer); ended = true; wake?.(); });
  finalP.catch(() => undefined);
  async function* events() {
    yield { type: 'message_start', message: { id: 'deepseek', type: 'message', role: 'assistant', model: tutorModel(), content: [], stop_reason: null, usage: usageOf(undefined) } };
    yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
    if (live) {
      for (;;) {
        while (queue.length) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: queue.shift()! } };
        if (ended) break;
        await new Promise<void>((res) => { if (queue.length || ended) res(); else wake = res; }); wake = null;
      }
      await finalP; // rethrows a failure
    } else {
      const m = await finalP; const text = m.content[0]?.text ?? '';
      for (const piece of text.match(/[\s\S]{1,24}(?=\s|$)|[\s\S]{1,24}/g) ?? []) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } };
    }
    const m = await finalP;
    yield { type: 'content_block_stop', index: 0 };
    yield { type: 'message_delta', delta: { stop_reason: m.stop_reason, stop_sequence: null }, usage: { output_tokens: m.usage.output_tokens } };
    yield { type: 'message_stop' };
  }
  const it = events();
  return { [Symbol.asyncIterator]: () => it, finalMessage: () => finalP, abort: () => ac.abort() };
}

/** A client with the same call shape as the Anthropic SDK (messages and beta.messages: create, stream). opts.parts overrides the
 * DeepSeek-match switches (the maintenance quality check compares with and without them). */
export function deepseekClient(timeout: number, opts: { parts?: DsParts } = {}) {
  const partsFor = (body: ABody) => { const p = opts.parts ?? dsParts(); return isGraded(textOf(body.system as string | Block[] | undefined)) && anyPart(p) ? p : null; };
  const messages = {
    create: async (body: ABody) => { const p = partsFor(body); return p ? graded(body, p, timeout) : fromChat((await (await post(() => toChat(body, false), undefined, timeout)).json()) as Parameters<typeof fromChat>[0]); },
    stream: (body: ABody) => { const p = partsFor(body); return p ? gradedStream(body, p, timeout) : streamOf(body, timeout); },
  };
  return { messages, beta: { messages } } as unknown as Anthropic;
}

// Owner, 21 Nov 2026: while DeepSeek stands in on lms-test, the other model features follow it too (teacher assistant, staff data assistant,
// class summaries, reminders, next steps, learning objectives, avatar visuals). Each keeps its own Anthropic client and model otherwise.
const shared = new Map<number, Anthropic>();
/** The client for a feature: DeepSeek when switched on and configured, else the feature's own Anthropic client. */
export function llmClient(anthropic: Anthropic, timeout: number): Anthropic {
  if (!deepseekReady()) return anthropic;
  let c = shared.get(timeout); if (!c) { c = deepseekClient(timeout); shared.set(timeout, c); }
  return c;
}
/** The model id for a feature: the DeepSeek model when switched on, else the feature's Anthropic model. */
export const llmModel = (anthropicModel: string): string => (deepseekReady() ? tutorModel()! : anthropicModel);
