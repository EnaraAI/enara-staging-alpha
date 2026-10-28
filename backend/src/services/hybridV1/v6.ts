import { createHash } from 'crypto';
import spec from './frozenV6Spec.json';
import { PyJsonError, pyDumps, pyFloat, pyFloatRepr, pyRawDecode, pyStr, type PyValue } from './pyjson';

// TypeScript port of the frozen ENARA-ANCHORED-HOLISTIC-experimental@v6
// grader (scripts/benchmarks/diagnostics/rubric_engine/v3/anchored_holistic.py,
// sha256 a1be3f9c…, plus the gateway prompt template and the Anthropic adapter
// it ran through). Behaviour must match the frozen Python byte for byte:
// test/hybridV1.*.test.ts replays golden fixtures exported from the Python
// modules. Do not edit the frozen spec; a change is a new grader version.

export const V6 = spec as {
  version: string; hybrid_version: string; format: string; grid: string; k_anchors: number; instructions: string; output: string;
  config_sha256: string; system_prefix: string; prompt_template: string; stage: string; model: string; max_tokens: number;
  hybrid_grid: number; source_sha256: Record<string, string>;
};
const MAX_PROMPT_CHARS = 20_000; // frozen gateway limit (V3Config.max_prompt_chars), in code points
export const PER_ATTEMPT_TIMEOUT_MS = 240_000; // frozen gateway per-attempt timeout
const REPAIR_ATTEMPTS = 1;

// Refuse to run if the frozen spec was altered (same recipe as contracts.sha).
export function verifyFrozenSpec() {
  const canonical = pyDumps({ version: V6.version, format: V6.format, grid: V6.grid, k: V6.k_anchors, instructions: V6.instructions, output: V6.output }, [',', ':']);
  const got = createHash('sha256').update(canonical, 'utf8').digest('hex');
  if (got !== V6.config_sha256) throw new Error(`frozen V6 spec hash mismatch (${got.slice(0, 12)})`);
  return got;
}

export interface V6Anchor { answer: string; humanScore: number }
export interface V6Input { question: string; reference: string; maxScore: number; anchors: V6Anchor[]; answer: string }

export type V6Code = 'INVALID_MODEL_OUTPUT' | 'UNVERIFIABLE_EVIDENCE';
export class V6OutputError extends Error {
  constructor(public code: V6Code, message: string, public diagnostics: object[] = []) {
    super(message);
  }
}

const escapeUntrusted = (s: string) => pyStr(s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

export function payload(input: V6Input): Record<string, PyValue> {
  return {
    instructions: V6.instructions, format: V6.format, question: input.question, reference_answer: input.reference, max: pyFloat(input.maxScore),
    anchors: input.anchors.map((a) => ({ answer: a.answer, human_score: pyFloat(a.humanScore) })), student_answer: input.answer,
  };
}

// gateway.render_prompt('semantic', FORMAT, payload)
export function renderPrompt(p: Record<string, PyValue>): string {
  const { instructions, ...data } = p;
  let body = pyDumps(data);
  if ('student_answer' in data) body = body.split(pyStr(String(data.student_answer))).join(escapeUntrusted(String(data.student_answer)));
  body = body.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return V6.prompt_template.split('{prompt_version}').join('\u0000PV').split('{stage}').join('\u0000ST')
    .replace('{instructions}', () => String(instructions)).replace('{data}', () => body)
    .split('\u0000PV').join(V6.format).split('\u0000ST').join(V6.stage);
}

// AnthropicAdapter.body(): no temperature or effort settings (provider defaults), exactly as frozen.
export function requestBody(prompt: string) {
  return { model: V6.model, max_tokens: V6.max_tokens, system: V6.system_prefix + V6.output, messages: [{ role: 'user' as const, content: prompt }] };
}

export const codePoints = (s: string) => [...s].length;

// provider_anthropic.extract_json: first '{', raw_decode, must be an object.
export function extractJson(text: string): { value: Record<string, unknown>; floats: WeakMap<object, Set<string>> } {
  const start = text.indexOf('{');
  if (start < 0) throw new V6OutputError('INVALID_MODEL_OUTPUT', 'no JSON object in the model reply');
  const r = pyRawDecode(text.slice(start)); // throws PyJsonError (Python: JSONDecodeError -> "unparseable reply")
  if (r.value === null || typeof r.value !== 'object' || Array.isArray(r.value)) throw new V6OutputError('INVALID_MODEL_OUTPUT', 'model reply is not a JSON object');
  return { value: r.value as Record<string, unknown>, floats: r.floats };
}

// interpretation_guard.locate (exact matching only; nothing normalised).
export function locate(text: string, source: string, before?: string | null, after?: string | null): { span: { start: number; end: number } | null; status: string } {
  const starts: number[] = [];
  let i = source.indexOf(text);
  while (i !== -1) {
    starts.push(i);
    i = source.indexOf(text, i + 1);
  }
  if (!starts.length) return { span: null, status: 'NOT_FOUND' };
  if (starts.length === 1 && !(before || after)) return { span: toCp(source, starts[0], text), status: 'UNIQUE' };
  const ok = starts.filter((st) => (!before || source.slice(Math.max(0, st - before.length), st) === before) && (!after || source.slice(st + text.length, st + text.length + after.length) === after));
  if (ok.length === 1) return { span: toCp(source, ok[0], text), status: starts.length === 1 ? 'UNIQUE' : 'CONTEXT_UNIQUE' };
  return { span: null, status: ok.length ? 'REPEATED_UNRESOLVED' : 'CONTEXT_NOT_FOUND' };
}
// Spans in Python string indices (code points), as the frozen grader records them.
function toCp(source: string, utf16Start: number, text: string) {
  const start = codePoints(source.slice(0, utf16Start));
  return { start, end: start + codePoints(text) };
}

const sha16 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);
// Python repr of a JSON number as decoded by json (int stays int, float keeps repr).
const numRepr = (v: number, isFloat: boolean) => (isFloat ? pyFloatRepr(v) : String(v));

export interface V6Parsed { score: number; ideas: { idea: string; status: string; evidence: { start: number; end: number }[] }[]; materialErrors: string[] }

// anchored_holistic.parse
export function parseOutput(raw: Record<string, unknown>, floats: WeakMap<object, Set<string>>, answer: string, maxScore: number): V6Parsed {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.ideas)) throw new V6OutputError('INVALID_MODEL_OUTPUT', 'holistic output is not an object with ideas');
  const s = raw.score;
  if (typeof s !== 'number') throw new V6OutputError('INVALID_MODEL_OUTPUT', 'score missing or not a number');
  if (!Number.isFinite(s)) throw pyError('ValueError', `Invalid literal for Fraction: '${pyFloatRepr(s).toLowerCase().replace('infinity', 'inf')}'`); // not repairable
  if (!Number.isInteger(s * 4) || s < 0 || s > maxScore) {
    throw new V6OutputError('INVALID_MODEL_OUTPUT', `score ${numRepr(s, floats.get(raw)?.has('score') ?? false)} not on the 0.25 grid within [0, ${pyFloatRepr(maxScore)}]`);
  }
  const ideas: V6Parsed['ideas'] = [];
  const diags: { idea: number; class: string; quote_len: number; quote_sha256: string }[] = [];
  (raw.ideas as unknown[]).forEach((it, n) => {
    const o = it as Record<string, unknown>;
    if (!o || typeof o !== 'object' || Array.isArray(o) || !['COVERED', 'PARTLY', 'MISSING'].includes(o.status as string)) {
      throw new V6OutputError('INVALID_MODEL_OUTPUT', `idea ${n} fails the contract`);
    }
    const ev: { start: number; end: number }[] = [];
    for (const q of truthyIter(o.evidence)) {
      const qo = q as Record<string, unknown>;
      if (!qo || typeof qo !== 'object' || Array.isArray(qo) || typeof qo.text !== 'string' || !qo.text) {
        throw new V6OutputError('INVALID_MODEL_OUTPUT', `idea ${n} evidence fails the contract`);
      }
      const { span, status } = locate(qo.text, answer, (qo.context_before as string) || null, (qo.context_after as string) || null);
      if (!span) {
        diags.push({ idea: n, class: status, quote_len: codePoints(qo.text), quote_sha256: sha16(qo.text) });
        continue;
      }
      ev.push(span);
    }
    if (o.status !== 'MISSING' && !ev.length && !diags.length) throw new V6OutputError('INVALID_MODEL_OUTPUT', `idea ${n} is ${o.status} without evidence`);
    ideas.push({ idea: [...pyText(o.idea)].slice(0, 200).join(''), status: o.status as string, evidence: ev });
  });
  if (diags.length) throw new V6OutputError('UNVERIFIABLE_EVIDENCE', [...diags.map((d) => `idea ${d.idea}: ${d.class}`).join('; ')].slice(0, 280).join(''), diags);
  const me = truthyIter(raw.material_errors);
  return { score: s, ideas, materialErrors: me.map((x) => [...pyText(x)].slice(0, 200).join('')).slice(0, 5) };
}
// `x or []` in Python iterates any truthy value: lists by item, strings by character, dicts by key;
// a number raises TypeError, which the frozen grader does not repair.
function truthyIter(v: unknown): unknown[] {
  if (!v || (Array.isArray(v) && !v.length)) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return [...v];
  if (typeof v === 'object') return Object.keys(v as object);
  throw pyError('TypeError', `'${typeof v === 'boolean' ? 'bool' : Number.isInteger(v) ? 'int' : 'float'}' object is not iterable`);
}
// str(x) for the stored text fields (idea, material errors); not used for scoring.
function pyText(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  return typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
}
export const pyError = (pyType: string, message: string) => Object.assign(new Error(message), { pyType });

// ---------------------------------------------------------------- model call
export interface ModelReply { text: string; stopReason?: string | null; usage?: { input_tokens?: number | null; output_tokens?: number | null } | null; model?: string; requestId?: string | null }
export interface V6Client { create(body: ReturnType<typeof requestBody>, opts: { timeoutMs: number }): Promise<ModelReply> }

export type V6Status = 'SCORED' | 'NON_SCORED';
export interface V6Result {
  status: V6Status; score: number | null; reasonCode: string | null; repairs: number; calls: { requestId?: string | null; usage?: ModelReply['usage']; model?: string; ms: number }[];
  ideas?: V6Parsed['ideas']; materialErrors?: string[]; message?: string; groundingDiagnostics?: object[];
}

// anchored_holistic.grade + gateway/adapter failure semantics: one call, at most one
// bounded repair for an invalid or ungrounded output; transport, truncation and
// unparseable replies end the attempt with a labelled non-score (no repair), as frozen.
export async function gradeV6(client: V6Client, input: V6Input): Promise<V6Result> {
  verifyFrozenSpec();
  if (!input.answer.trim()) return { status: 'SCORED', score: 0, reasonCode: 'EMPTY_ANSWER', repairs: 0, calls: [] };
  let p = payload(input);
  let repairs = 0;
  const calls: V6Result['calls'] = [];
  for (;;) {
    const prompt = renderPrompt(p);
    if (codePoints(prompt) > MAX_PROMPT_CHARS) return fail('INVALID_REQUEST', `prompt for semantic exceeds ${MAX_PROMPT_CHARS} characters`, repairs, calls);
    const t0 = Date.now();
    let reply: ModelReply;
    try {
      reply = await client.create(requestBody(prompt), { timeoutMs: PER_ATTEMPT_TIMEOUT_MS });
    } catch (e) {
      calls.push({ ms: Date.now() - t0 });
      return fail((e as { code?: string }).code ?? 'MODEL_UNAVAILABLE', String((e as Error).message ?? e).slice(0, 200), repairs, calls);
    }
    calls.push({ requestId: reply.requestId, usage: reply.usage, model: reply.model, ms: Date.now() - t0 });
    if (reply.stopReason === 'max_tokens') return fail('INVALID_MODEL_OUTPUT', 'reply truncated at max_tokens', repairs, calls);
    let decoded;
    try {
      decoded = extractJson(reply.text);
    } catch (e) {
      const m = e instanceof PyJsonError ? `unparseable reply: ${e.message.slice(0, 80)}` : (e as Error).message;
      return fail('INVALID_MODEL_OUTPUT', m, repairs, calls);
    }
    try {
      const out = parseOutput(decoded.value, decoded.floats, input.answer, input.maxScore);
      return { status: 'SCORED', score: out.score, reasonCode: null, repairs, calls, ideas: out.ideas, materialErrors: out.materialErrors };
    } catch (e) {
      if (!(e instanceof V6OutputError)) return fail((e as { pyType?: string }).pyType ?? 'INTERNAL_ERROR', (e as Error).message.slice(0, 200), repairs, calls);
      if (repairs >= REPAIR_ATTEMPTS) {
        return { ...fail(e.code === 'UNVERIFIABLE_EVIDENCE' ? 'GROUNDING_FAILURE' : 'INVALID_MODEL_OUTPUT', e.message.slice(0, 200), repairs, calls), groundingDiagnostics: e.diagnostics };
      }
      repairs++;
      p = { ...p, correction: `Previous output rejected (${e.code}): ${[...e.message].slice(0, 200).join('')}. Return valid JSON; copy evidence text exactly from student_answer; score on the 0.25 grid.` };
    }
  }
}

function fail(reasonCode: string, message: string, repairs: number, calls: V6Result['calls']): V6Result {
  return { status: 'NON_SCORED', score: null, reasonCode, repairs, calls, message };
}
