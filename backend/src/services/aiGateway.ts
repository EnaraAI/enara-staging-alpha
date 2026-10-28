import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import type { LedgerCostStatus, LedgerProvider, LedgerStatus, LedgerUnits } from '../models/UsageLedger';
import { getCallContext } from '../utils/callContext';
import { logger, serializeError } from '../utils/logging';
import { errorCodeOf, recordAiCall, type TokenUsage } from './aiCalls';
import { CURRENT_PRICE_VERSION, priceUsage, upperBoundUsd, type PriceProvider } from './priceCatalog';
import { reserveAiBudget, settleAiBudget, type BudgetTicket } from './aiBudget';
import { checkInstitutionAiRate } from './aiRateLimit';
import { UsageLedgerConflictError, appendUsage } from './usageLedger';

// Central metering for provider calls (4Level1 plan, P0b). Each billable
// provider attempt gets one final, immutable usage_ledger row keyed by
// `ai:<requestId>:<operation uuid>:<attempt>`; ai_calls keeps its existing
// operational rows. SDK retries are off at metered call sites and retried
// here instead, so every attempt the provider may bill is visible.
//
// Lifecycle: call the provider, then append the final row. There is no
// pending row (usage_ledger is append-only). If the process dies between the
// provider reply and the append, that attempt is not metered: metering is
// at-most-once per attempt across crashes, exactly-once otherwise. Later
// corrections are new rows, never edits.
//
// Rows hold identifiers, model, units and price only: no prompts, replies,
// student content or credentials.

export interface GatewayMeta {
  feature: string;
  provider?: LedgerProvider;
  modelName: string;
  // Server-derived tenant for work outside a request (cron, grading jobs).
  institutionId?: string;
  refs?: { sessionId?: string; assessmentId?: string; attemptId?: string; uploadId?: string };
  // Total provider attempts, including retries of retryable failures.
  maxAttempts?: number;
  // Limits for the budget reservation's upper bound (P0d): input tokens bound
  // (see textTokenBound), max output tokens, TTS characters; anyModel when a
  // server-side fallback may answer with another model. Without it, the
  // school's configured reservation ceiling for the tool applies.
  bound?: { inputTokens?: number; outputTokens?: number; characters?: number; anyModel?: boolean };
}

export interface GatewayOperation {
  key: string;
  attempts: number;
}

export function startOperation(): GatewayOperation {
  return { key: `ai:${getCallContext().requestId || 'bg'}:${randomUUID()}`, attempts: 0 };
}

let retryDelayMs = 500;
// Tests only.
export function setGatewayRetryDelay(ms: number) {
  retryDelayMs = ms;
}

// Same classes the Anthropic SDK retries: timeouts, connection failures,
// 408/409/429 and 5xx.
export function isRetryable(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown; name?: string };
  const status = typeof e?.status === 'number' ? e.status : typeof e?.statusCode === 'number' ? e.statusCode : undefined;
  if (status !== undefined) return status === 408 || status === 409 || status === 429 || status >= 500;
  return /Connection|Timeout/.test(e?.name || '');
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tenant and user always come from the server-side call context. An explicit
// institutionId (from server data, e.g. the attempt being graded) is used for
// work with no request tenant, or by Enara admins; a different school inside
// another school's request is refused for the ledger and logged.
export function owner(meta: GatewayMeta) {
  const ctx = getCallContext();
  let institutionId = ctx.institutionId;
  if (meta.institutionId && meta.institutionId !== ctx.institutionId) {
    if (!ctx.institutionId || ctx.role === 'enara-admin') institutionId = meta.institutionId;
    else logger.warn('ai_gateway_tenant_mismatch', { feature: meta.feature, requestId: ctx.requestId });
  }
  return { institutionId, userId: ctx.userId, studentId: ctx.studentId, role: ctx.role, requestId: ctx.requestId };
}

export function tokenUnits(usage?: TokenUsage | null): LedgerUnits | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

export interface AttemptRecord {
  operationKey: string;
  attempt: number;
  meta: GatewayMeta;
  modelName: string;
  status: LedgerStatus;
  // undefined: the provider reported no usage (errors, cancellations).
  units?: LedgerUnits;
  unitsBasis?: 'server_measured' | 'inferred_from_activity';
  errorCode?: string;
}

// Appends the final ledger row for one attempt. Idempotent on operationKey.
// A conflicting reuse of a key is logged and thrown as a generic operational
// error (no prices in it). Other write failures are logged and do not fail
// the caller's provider result. Returns whether the row is stored.
function priceAttempt(rec: AttemptRecord): { costInternal: number | null; costStatus: LedgerCostStatus; priceCatalogVersion: string } {
  const provider = rec.meta.provider ?? 'anthropic';
  if (!rec.units) return { costInternal: null, costStatus: 'usage_unknown', priceCatalogVersion: CURRENT_PRICE_VERSION };
  const priced =
    provider === 'anthropic' || provider === 'elevenlabs'
      ? priceUsage(provider as PriceProvider, rec.modelName, rec.units)
      : { costUsd: null, status: 'unpriced' as const, priceCatalogVersion: CURRENT_PRICE_VERSION };
  return { costInternal: priced.costUsd, costStatus: priced.status, priceCatalogVersion: priced.priceCatalogVersion };
}

export async function recordAttempt(rec: AttemptRecord): Promise<boolean> {
  const provider = rec.meta.provider ?? 'anthropic';
  const { costInternal, costStatus, priceCatalogVersion } = priceAttempt(rec);
  const entry = {
    operationKey: rec.operationKey,
    ...owner(rec.meta),
    feature: rec.meta.feature,
    refs: rec.meta.refs,
    provider,
    modelName: rec.modelName,
    units: rec.units ?? {},
    unitsBasis: rec.unitsBasis,
    attempt: rec.attempt,
    status: rec.status,
    errorCode: rec.errorCode,
    priceCatalogVersion,
    costInternal,
    costStatus,
  };
  if (mongoose.connection.readyState !== 1) {
    logger.error('usage_ledger_unavailable', { operationKey: rec.operationKey, feature: rec.meta.feature });
    return false;
  }
  for (let tries = 0; tries < 2; tries++) {
    try {
      await appendUsage(entry);
      return true;
    } catch (error) {
      if (error instanceof UsageLedgerConflictError) {
        logger.error('ai_gateway_ledger_conflict', { operationKey: error.operationKey, fields: error.fields, feature: rec.meta.feature });
        throw new AppError('Usage could not be recorded', 500, 'USAGE_METERING_FAILED');
      }
      if (tries === 1) logger.error('usage_ledger_write_failed', { operationKey: rec.operationKey, feature: rec.meta.feature, error: serializeError(error) });
    }
  }
  return false;
}

// Before a provider attempt: per-school rate limit (non-grading), pauses and
// the budget reservation. Throws before the provider is called if refused.
export async function reserveAttempt(meta: GatewayMeta, operationKey: string, ttlMs?: number): Promise<BudgetTicket> {
  const who = owner(meta);
  const provider = meta.provider ?? 'anthropic';
  await checkInstitutionAiRate(who.institutionId, meta.feature);
  const bound =
    meta.bound && (provider === 'anthropic' || provider === 'elevenlabs') ? upperBoundUsd(provider, meta.modelName, meta.bound) : null;
  return reserveAiBudget({ key: operationKey, feature: meta.feature, provider, institutionId: who.institutionId, userId: who.userId, upperBoundUsd: bound, ttlMs });
}

// After a provider attempt: append its ledger row, then settle the
// reservation with the priced cost (or keep it whole when the cost is unknown).
export async function finishAttempt(ticket: BudgetTicket, rec: AttemptRecord): Promise<boolean> {
  try {
    return await recordAttempt(rec);
  } finally {
    await settleAiBudget(ticket, priceAttempt(rec).costInternal);
  }
}

interface MessageResponse {
  model?: string;
  usage?: TokenUsage | null;
  stop_reason?: string | null;
}

// One non-streaming model call: retries retryable failures, logs each attempt
// to ai_calls (as trackAiCall did) and meters it. Errors are rethrown.
export async function meteredMessage<T extends MessageResponse>(meta: GatewayMeta, call: () => Promise<T>, op = startOperation()): Promise<T> {
  const maxAttempts = meta.maxAttempts ?? 1;
  for (let i = 0; ; i++) {
    const attempt = ++op.attempts;
    const operationKey = `${op.key}:${attempt}`;
    const ticket = await reserveAttempt(meta, operationKey);
    const startedAt = Date.now();
    let response: T;
    try {
      response = await call();
    } catch (error) {
      const errorCode = errorCodeOf(error);
      recordAiCall({ feature: meta.feature, modelName: meta.modelName, status: 'error', startedAt, errorCode, institutionId: meta.institutionId });
      await finishAttempt(ticket, { operationKey, attempt, meta, modelName: meta.modelName, status: 'error', errorCode });
      if (i + 1 < maxAttempts && isRetryable(error)) {
        await wait(retryDelayMs);
        continue;
      }
      throw error;
    }
    const modelName = response.model || meta.modelName;
    const status = response.stop_reason === 'refusal' ? 'refusal' : 'ok';
    recordAiCall({ feature: meta.feature, modelName, status, startedAt, usage: response.usage ?? undefined, institutionId: meta.institutionId });
    await finishAttempt(ticket, { operationKey, attempt, meta, modelName, status, units: tokenUnits(response.usage) });
    return response;
  }
}

export interface MessageStreamLike<E, F extends MessageResponse> extends AsyncIterable<E> {
  finalMessage(): Promise<F>;
  abort(): void;
}

// A streamed model call. Yields provider events; the final message is put in
// `out.final`. A failure before the first event is retried (nothing reached
// the caller); after that it is not. A consumer that stops early aborts the
// stream and is metered as 'cancelled' with unknown usage. Cancellations get
// no ai_calls row, as before.
export async function* meteredStream<E, F extends MessageResponse>(
  meta: GatewayMeta,
  open: () => MessageStreamLike<E, F>,
  out: { final?: F } = {},
  op = startOperation(),
): AsyncGenerator<E> {
  const maxAttempts = meta.maxAttempts ?? 1;
  for (let i = 0; ; i++) {
    const attempt = ++op.attempts;
    const operationKey = `${op.key}:${attempt}`;
    const ticket = await reserveAttempt(meta, operationKey);
    const startedAt = Date.now();
    let emitted = false;
    let settled = false;
    let stream: MessageStreamLike<E, F> | undefined;
    try {
      stream = open();
      for await (const event of stream) {
        emitted = true;
        yield event;
      }
      const final = await stream.finalMessage();
      settled = true;
      const modelName = final.model || meta.modelName;
      const status = final.stop_reason === 'refusal' ? 'refusal' : 'ok';
      recordAiCall({ feature: meta.feature, modelName, status, startedAt, usage: final.usage ?? undefined, institutionId: meta.institutionId });
      await finishAttempt(ticket, { operationKey, attempt, meta, modelName, status, units: tokenUnits(final.usage) });
      out.final = final;
      return;
    } catch (error) {
      if (settled) throw error; // metering failed after a complete reply
      settled = true;
      const errorCode = errorCodeOf(error);
      recordAiCall({ feature: meta.feature, modelName: meta.modelName, status: 'error', startedAt, errorCode, institutionId: meta.institutionId });
      await finishAttempt(ticket, { operationKey, attempt, meta, modelName: meta.modelName, status: 'error', errorCode });
      if (!emitted && i + 1 < maxAttempts && isRetryable(error)) {
        await wait(retryDelayMs);
        continue;
      }
      throw error;
    } finally {
      if (!settled) {
        // The consumer stopped reading: stop generating and meter it honestly.
        try {
          stream?.abort();
        } catch {
          // already finished
        }
        await finishAttempt(ticket, { operationKey, attempt, meta, modelName: meta.modelName, status: 'cancelled' }).catch((error) =>
          logger.error('usage_ledger_write_failed', { operationKey, error: serializeError(error) }),
        );
      }
    }
  }
}

// Text-to-speech: billed per character once the provider accepts the request.
// ai_calls logging stays with the caller (unchanged).
export async function meteredSpeech<T>(meta: GatewayMeta, characters: number, call: () => Promise<T>, op = startOperation()): Promise<T> {
  const maxAttempts = meta.maxAttempts ?? 1;
  const m = { ...meta, provider: meta.provider ?? ('elevenlabs' as const) };
  for (let i = 0; ; i++) {
    const attempt = ++op.attempts;
    const operationKey = `${op.key}:${attempt}`;
    const ticket = await reserveAttempt({ ...m, bound: { characters } }, operationKey);
    let result: T;
    try {
      result = await call();
    } catch (error) {
      await finishAttempt(ticket, { operationKey, attempt, meta: m, modelName: m.modelName, status: 'error', errorCode: errorCodeOf(error) });
      if (i + 1 < maxAttempts && isRetryable(error)) {
        await wait(retryDelayMs);
        continue;
      }
      throw error;
    }
    await finishAttempt(ticket, { operationKey, attempt, meta: m, modelName: m.modelName, status: 'ok', units: { characters } });
    return result;
  }
}

// One call to an external service that may bill (orchestrator, ingestion
// engine, STT token): one attempt, no retries. `failed` maps a returned
// result to an error code (e.g. a non-2xx response); `units` gives reported
// units, else usage is recorded as unknown. Results and errors pass through.
export async function meteredCall<T>(
  meta: GatewayMeta,
  call: () => Promise<T>,
  opts: { operationKey?: string; failed?: (result: T) => string | undefined; units?: (result: T) => LedgerUnits | undefined } = {},
): Promise<T> {
  const operationKey = opts.operationKey ?? `${startOperation().key}:1`;
  const ticket = await reserveAttempt(meta, operationKey);
  let result: T;
  try {
    result = await call();
  } catch (error) {
    await finishAttempt(ticket, { operationKey, attempt: 1, meta, modelName: meta.modelName, status: 'error', errorCode: errorCodeOf(error) });
    throw error;
  }
  const errorCode = opts.failed?.(result);
  await finishAttempt(ticket, { operationKey, attempt: 1, meta, modelName: meta.modelName, status: errorCode ? 'error' : 'ok', errorCode, units: errorCode ? undefined : opts.units?.(result) });
  return result;
}
