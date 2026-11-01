// P12 experiment hard cap (offline harness only; never imported by the app).
// Wraps fetch underneath every Anthropic SDK client, so it sees each HTTP
// attempt whatever ENARA code path makes it (gateway retries, grading
// consistency runs, the grading emergency path, tutor). Before an attempt it
// reserves the worst case: input tokens counted exactly by the provider's
// free count_tokens endpoint (+10% and 64 tokens), or the byte bound if that
// fails, priced at the dearest input-side rate, plus max_tokens output. An
// attempt whose reservation would take committed spend over the cap is
// refused before it leaves the process, the ledger records STOP, and every
// later attempt is refused too. Only planned (model, max_tokens) pairs and
// allow-listed hosts pass; attempts run one at a time.
import { writeFileSync } from 'fs';
import { priceUsage, textTokenBound, upperBoundUsd } from '../services/priceCatalog';

export interface PlannedCall { label: string; model: string; maxTokens: number }
type Status = 'ok' | 'http_error' | 'transport_error' | 'usage_unknown' | 'unpriced';

export interface AttemptRecord {
  attempt: number;
  step: string;
  label: string;
  model: string;
  responseModel: string | null;
  maxTokens: number;
  inputTokenBound: number;
  boundMethod: 'count_tokens+10%' | 'byte_bound';
  reservedUsd: number;
  committedBeforeUsd: number;
  status: Status;
  httpStatus: number | null;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | null;
  actualUsd: number;
  chargedUsd: number;
  providerRequestId: string | null;
  startedAt: string;
  ms: number;
}

export interface GuardEvent { at: string; type: string; detail: Record<string, unknown> }

export class HardCapError extends Error {
  code = 'P12_HARD_CAP';
}

const now = () => new Date().toISOString();
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export class HardCapGuard {
  step = 'setup';
  planned: PlannedCall[] = [];
  attempts: AttemptRecord[] = [];
  events: GuardEvent[] = [];
  spentUsd = 0;
  exhausted = false;
  stopReason: string | null = null;
  inFlight = 0;
  maxInFlight = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private opts: { capUsd: number; ledgerPath?: string; allowHosts: string[]; anthropicHost: string; upstream: typeof fetch; countTokens?: boolean }) {
    if (!(opts.capUsd > 0)) throw new Error('cap must be positive');
    this.event('start', { capUsd: opts.capUsd, allowHosts: opts.allowHosts });
  }

  get remainingUsd() {
    return round6(this.opts.capUsd - this.spentUsd);
  }

  event(type: string, detail: Record<string, unknown> = {}) {
    this.events.push({ at: now(), type, detail });
    this.persist();
  }

  snapshot() {
    return {
      version: 1, capUsd: this.opts.capUsd, spentUsd: round6(this.spentUsd), remainingUsd: this.remainingUsd, exhausted: this.exhausted, stopReason: this.stopReason,
      attempts: this.attempts, events: this.events, maxConcurrentAttempts: this.maxInFlight,
    };
  }

  persist() {
    if (this.opts.ledgerPath) writeFileSync(this.opts.ledgerPath, JSON.stringify(this.snapshot(), null, 2));
  }

  stop(reason: string, detail: Record<string, unknown> = {}) {
    if (!this.exhausted) {
      this.exhausted = true;
      this.stopReason = reason;
      this.event('STOP', { reason, ...detail });
    }
  }

  // The fetch to install (globalThis.fetch) before any SDK client is created.
  fetch: typeof fetch = (input, init) => {
    const run = this.chain.then(() => this.handle(input as string | URL | Request, init));
    this.chain = run.catch(() => undefined);
    return run;
  };

  private async handle(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!this.opts.allowHosts.includes(url.host)) {
      this.event('blocked_host', { host: url.host, step: this.step });
      throw new HardCapError(`P12 guard: requests to ${url.host} are not allowed`);
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isMessages = url.host === this.opts.anthropicHost && method === 'POST' && url.pathname === '/v1/messages';
    if (!isMessages) {
      // Free metadata calls (models.retrieve) and local stub traffic only.
      if (url.host === this.opts.anthropicHost && !(method === 'GET' && url.pathname.startsWith('/v1/models'))) {
        this.event('blocked_unplanned_endpoint', { path: url.pathname, method, step: this.step });
        throw new HardCapError(`P12 guard: ${method} ${url.pathname} is not planned`);
      }
      return this.opts.upstream(input, init);
    }
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : new TextDecoder().decode(init?.body as ArrayBuffer));
    const plan = this.planned.find((p) => p.model === body.model && p.maxTokens === body.max_tokens);
    if (!plan) {
      this.event('blocked_unplanned_call', { step: this.step, model: body.model, maxTokens: body.max_tokens });
      throw new HardCapError(`P12 guard: ${body.model} with max_tokens ${body.max_tokens} is not planned for this run`);
    }
    if (this.exhausted) {
      this.event('refused_after_stop', { step: this.step, label: plan.label });
      throw new HardCapError(`P12 guard: stopped (${this.stopReason}); no further provider attempts`);
    }
    if (body.stream) {
      this.stop('streaming_not_planned', { step: this.step });
      throw new HardCapError('P12 guard: streaming responses are not planned');
    }
    // Worst case for this attempt.
    let inputBound = textTokenBound(body.system, body.messages, body.tools);
    let boundMethod: AttemptRecord['boundMethod'] = 'byte_bound';
    if (this.opts.countTokens) {
      const counted = await this.countTokens(url, init!, body);
      if (counted !== null) {
        inputBound = Math.ceil(counted * 1.1) + 64;
        boundMethod = 'count_tokens+10%';
      }
    }
    const reserve = upperBoundUsd('anthropic', body.model, { inputTokens: inputBound, outputTokens: body.max_tokens });
    if (reserve === null) {
      this.stop('unpriced_model', { model: body.model });
      throw new HardCapError(`P12 guard: no catalogue price for ${body.model}`);
    }
    const committedBefore = round6(this.spentUsd);
    if (committedBefore + reserve > this.opts.capUsd + 1e-9) {
      this.stop('EXHAUSTED', { step: this.step, label: plan.label, neededUsd: round6(reserve), remainingUsd: this.remainingUsd });
      throw new HardCapError(`P12 guard: next attempt needs up to $${reserve.toFixed(6)}, $${this.remainingUsd.toFixed(6)} remains of the $${this.opts.capUsd} cap`);
    }
    const rec: AttemptRecord = {
      attempt: this.attempts.length + 1, step: this.step, label: plan.label, model: body.model, responseModel: null, maxTokens: body.max_tokens,
      inputTokenBound: inputBound, boundMethod, reservedUsd: round6(reserve), committedBeforeUsd: committedBefore, status: 'transport_error', httpStatus: null,
      stopReason: null, usage: null, actualUsd: 0, chargedUsd: round6(reserve), providerRequestId: null, startedAt: now(), ms: 0,
    };
    this.attempts.push(rec);
    // The reservation is committed (charged in full) until the reply proves less.
    this.spentUsd = round6(this.spentUsd + reserve);
    this.persist();
    const t0 = Date.now();
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    let res: Response;
    try {
      res = await this.opts.upstream(input, init);
    } catch (error) {
      rec.ms = Date.now() - t0;
      this.inFlight -= 1;
      this.event('transport_error', { attempt: rec.attempt, message: String((error as Error).message).slice(0, 200) });
      throw error;
    }
    this.inFlight -= 1;
    rec.ms = Date.now() - t0;
    rec.httpStatus = res.status;
    rec.providerRequestId = res.headers.get('request-id');
    const text = await res.clone().text();
    let json: Record<string, any> | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!res.ok) {
      rec.status = 'http_error'; // kept charged at the full reservation (conservative)
      this.persist();
      return res;
    }
    const u = json?.usage;
    if (!u || typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') {
      rec.status = 'usage_unknown';
      this.stop('usage_unknown', { attempt: rec.attempt });
      return res;
    }
    rec.usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 };
    rec.responseModel = json?.model ?? null;
    rec.stopReason = json?.stop_reason ?? null;
    const priced = priceUsage('anthropic', json?.model || body.model, rec.usage);
    if (priced.costUsd === null) {
      rec.status = 'unpriced';
      this.stop('unpriced_response', { attempt: rec.attempt });
      return res;
    }
    rec.status = 'ok';
    rec.actualUsd = priced.costUsd;
    rec.chargedUsd = priced.costUsd;
    this.spentUsd = round6(this.attempts.reduce((n, x) => n + x.chargedUsd, 0));
    if (priced.costUsd > reserve + 1e-9) this.event('reservation_exceeded', { attempt: rec.attempt, reservedUsd: rec.reservedUsd, actualUsd: priced.costUsd });
    if (this.spentUsd > this.opts.capUsd + 1e-9) this.stop('cap_exceeded_after_settle', { spentUsd: this.spentUsd });
    this.persist();
    return res;
  }

  private async countTokens(url: URL, init: RequestInit, body: Record<string, unknown>): Promise<number | null> {
    const countUrl = new URL(url.href);
    countUrl.pathname = '/v1/messages/count_tokens';
    const payload: Record<string, unknown> = { model: body.model, messages: body.messages };
    for (const k of ['system', 'tools', 'tool_choice', 'thinking']) if (body[k] !== undefined) payload[k] = body[k];
    const headers = new Headers(init.headers);
    headers.delete('content-length');
    headers.delete('x-stainless-retry-count');
    try {
      const r = await this.opts.upstream(countUrl.href, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!r.ok) {
        this.event('count_tokens_failed', { httpStatus: r.status, step: this.step });
        return null;
      }
      const j = (await r.json()) as { input_tokens?: number };
      return typeof j.input_tokens === 'number' ? j.input_tokens : null;
    } catch (error) {
      this.event('count_tokens_failed', { error: String((error as Error).message).slice(0, 120), step: this.step });
      return null;
    }
  }
}
