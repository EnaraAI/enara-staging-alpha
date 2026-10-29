import mongoose from 'mongoose';
import { getConfig } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { AiControl, BudgetCounter, BudgetReservation, OrgBudget, type IBudgetReservation } from '../models/OrgBudget';
import { logger, serializeError } from '../utils/logging';

// AI spend protection (4Level1 plan, P0d). Before each provider attempt the
// gateway reserves a conservative upper bound against the school's caps; after
// the attempt (and its usage_ledger row) the reservation is settled. The
// ledger stays append-only: reservations and counters live here.
//
// Policy, in order:
//  - Global (ai_controls or AI_PAUSED) or school pause blocks non-grading AI.
//  - Schools without enforcementEnabled are not capped (existing behaviour).
//  - The bound is the catalogue price of the call's limits; without one, the
//    school's configured `maxReservationUsdPerCall[provider:feature]`; without
//    that, a non-grading call is refused before the provider is called.
//  - Day, month and per-user caps are reserved atomically (conditional $inc).
//  - Settling: a known cost refunds the unused part; an unknown cost (provider
//    error, cancellation, unpriced usage) keeps the whole reservation as
//    "unknown exposure", never as free.
//  - Grading is never refused for budget: ordinary caps first, then the
//    grading allowance (warn alert), then an uncapped emergency overrun
//    (error alert). So the caps are not absolute for grading.
//  - Settings that cannot be read (outage, cold start, duplicate rows) are
//    never taken as "not enforced": non-grading calls fail closed with
//    AI_BUDGET_UNAVAILABLE before the provider is called. Settings read in
//    the last BUDGET_SETTINGS_MAX_STALE_MS may stand in during an outage.
//    Counter-write failures for an enforced school also fail closed.
//  - Grading always proceeds. If its policy cannot be read it runs as a
//    recorded emergency exposure (critical alert); if even that cannot be
//    written, a critical log carries the exposure.
//  - Test-spend cap (P14.2, AI_TEST_SPEND_CAP_USD): one cumulative counter for
//    every attempt in a deployment test window, grading included, reserved
//    before the school policy. Independent of school caps, the grading
//    exemption and pauses; it fails closed (unbounded calls, store failures)
//    for every feature. Unknown cost keeps the whole reservation, as above.

export const GRADING_FEATURES = new Set(['ai_grading']);
// Operations with no catalogue price or reported usage (P0c).
export const UNKNOWN_PRICED_TOOLS = ['anam:avatar_session', 'elevenlabs:stt', 'orchestrator:tutor_chat', 'ingestion_engine:curriculum_ingestion'];
export const ALERT_THRESHOLDS = [50, 80, 100] as const;
const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000;
const CONFIG_CACHE_MS = 15_000;
const MICROS = 1_000_000;

export class AiBudgetError extends AppError {
  constructor(code: 'AI_BUDGET_EXCEEDED' | 'AI_PAUSED' | 'AI_BUDGET_POLICY_MISSING' | 'AI_BUDGET_UNAVAILABLE' | 'AI_TEST_SPEND_CAP') {
    const messages = {
      AI_BUDGET_EXCEEDED: ["This school's AI allowance for now has been reached. Please try again later.", 429],
      AI_PAUSED: ['AI features are paused right now.', 503],
      AI_BUDGET_POLICY_MISSING: ['This AI feature is not enabled for this school yet.', 403],
      AI_BUDGET_UNAVAILABLE: ['AI features are temporarily unavailable. Please try again shortly.', 503],
      AI_TEST_SPEND_CAP: ['The AI testing limit for this environment has been reached.', 429],
    } as const;
    super(messages[code][0], messages[code][1], code);
  }
}
export const BUDGET_ERROR_CODES = new Set(['AI_BUDGET_EXCEEDED', 'AI_PAUSED', 'AI_BUDGET_POLICY_MISSING', 'AI_BUDGET_UNAVAILABLE', 'AI_TEST_SPEND_CAP']);

interface BudgetConfig {
  enforcementEnabled: boolean;
  aiPaused: boolean;
  dailyCapUsd?: number;
  monthlyCapUsd?: number;
  perUserDailyCapUsd?: number;
  gradingAllowanceUsd?: number;
  maxReservationUsdPerCall: Record<string, number>;
}
const budgetCache = new Map<string, { at: number; config: BudgetConfig | null }>();
let globalCache: { at: number; paused: boolean } | undefined;

export function forgetAiBudgetCache(institutionId?: string) {
  if (institutionId) budgetCache.delete(institutionId);
  else budgetCache.clear();
  globalCache = undefined;
}

// Settings are re-read after CONFIG_CACHE_MS. If a re-read fails, settings
// read successfully within MAX_STALE_MS are still used (so a pause or cap
// change can be missed for at most this long during an outage); older or
// missing settings make the policy unavailable, and non-grading calls fail
// closed. A failed read never counts as "not enforced".
export const BUDGET_SETTINGS_MAX_STALE_MS = 60_000;

const connected = () => mongoose.connection.readyState === 1;
// Once this process has connected to the database, budget settings must be
// readable: a later disconnect or failed read is an outage, never "off".
// Both serving entry points (index.ts, vercel.ts) connect before serving any
// request, so this holds for every served call. A process that never
// connected (offline tools, unit tests) has no budget store and nothing is
// enforced, as before P0d.
let everConnected = mongoose.connection.readyState === 1;
mongoose.connection.on('open', () => {
  everConnected = true;
});
const storeRequired = () => everConnected || mongoose.connection.readyState === 1;

const lastAlert = new Map<string, number>();
function storeAlert(event: string, meta: Record<string, unknown>) {
  const key = `${event}:${String(meta.institutionId ?? meta.what ?? '')}`;
  if (Date.now() - (lastAlert.get(key) ?? 0) < 60_000) return;
  lastAlert.set(key, Date.now());
  logger.error(event, { severity: 'critical', ...meta });
}

interface PolicyRead<T> {
  value: T;
  available: boolean; // false: unknown, the caller must not assume "off"
}

async function globalPaused(): Promise<PolicyRead<boolean>> {
  if (getConfig().aiPaused) return { value: true, available: true };
  const now = Date.now();
  if (globalCache && now - globalCache.at < CONFIG_CACHE_MS) return { value: globalCache.paused, available: true };
  if (!connected() && !storeRequired()) return { value: false, available: true };
  try {
    if (!connected()) throw new Error('database not connected');
    const doc = await AiControl.findById('global').lean();
    globalCache = { at: Date.now(), paused: doc?.aiPaused === true };
    return { value: globalCache.paused, available: true };
  } catch (error) {
    if (globalCache && now - globalCache.at < BUDGET_SETTINGS_MAX_STALE_MS) {
      logger.warn('ai_budget_stale_settings_used', { what: 'global_controls', ageMs: now - globalCache.at });
      return { value: globalCache.paused, available: true };
    }
    storeAlert('ai_budget_settings_unavailable', { what: 'global_controls', error: serializeError(error) });
    return { value: false, available: false };
  }
}

async function schoolConfig(institutionId: string): Promise<PolicyRead<BudgetConfig | null>> {
  const now = Date.now();
  const cached = budgetCache.get(institutionId);
  if (cached && now - cached.at < CONFIG_CACHE_MS) return { value: cached.config, available: true };
  if (!connected() && !storeRequired()) return { value: null, available: true };
  try {
    if (!connected()) throw new Error('database not connected');
    const docs = await OrgBudget.find({ institutionId }).limit(2).lean();
    // Two policies for one school means the unique index is missing: refuse
    // to guess which one applies.
    if (docs.length > 1) {
      storeAlert('ai_budget_duplicate_policy', { institutionId });
      throw new Error('duplicate org_budgets rows');
    }
    const doc = docs[0];
    const config: BudgetConfig | null = doc
      ? {
          enforcementEnabled: doc.enforcementEnabled === true,
          aiPaused: doc.aiPaused === true,
          dailyCapUsd: doc.dailyCapUsd,
          monthlyCapUsd: doc.monthlyCapUsd,
          perUserDailyCapUsd: doc.perUserDailyCapUsd,
          gradingAllowanceUsd: doc.gradingAllowanceUsd,
          maxReservationUsdPerCall: Object.fromEntries(
            doc.maxReservationUsdPerCall instanceof Map ? doc.maxReservationUsdPerCall : Object.entries(doc.maxReservationUsdPerCall ?? {}),
          ),
        }
      : null;
    budgetCache.set(institutionId, { at: Date.now(), config });
    return { value: config, available: true };
  } catch (error) {
    if (cached && now - cached.at < BUDGET_SETTINGS_MAX_STALE_MS) {
      logger.warn('ai_budget_stale_settings_used', { what: 'org_budget', institutionId, ageMs: now - cached.at });
      return { value: cached.config, available: true };
    }
    storeAlert('ai_budget_settings_unavailable', { what: 'org_budget', institutionId, error: serializeError(error) });
    return { value: null, available: false };
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const month = (d: Date) => d.toISOString().slice(0, 7);
const toMicros = (usd: number) => Math.ceil(usd * MICROS);

interface CounterSpec {
  id: string;
  capMicros: number;
  window: 'day' | 'month' | 'user_day' | 'grading' | 'grading_emergency' | 'test_spend';
  expiresAt: Date;
}

function standardCounters(inst: string, cfg: BudgetConfig, userId: string | undefined, now: Date): CounterSpec[] {
  const out: CounterSpec[] = [];
  const in40d = new Date(now.getTime() + 40 * 86400_000);
  const in400d = new Date(now.getTime() + 400 * 86400_000);
  if (cfg.dailyCapUsd !== undefined) out.push({ id: `${inst}:day:${day(now)}`, capMicros: toMicros(cfg.dailyCapUsd), window: 'day', expiresAt: in40d });
  if (cfg.monthlyCapUsd !== undefined) out.push({ id: `${inst}:month:${month(now)}`, capMicros: toMicros(cfg.monthlyCapUsd), window: 'month', expiresAt: in400d });
  if (cfg.perUserDailyCapUsd !== undefined && userId) out.push({ id: `${inst}:user:${userId}:day:${day(now)}`, capMicros: toMicros(cfg.perUserDailyCapUsd), window: 'user_day', expiresAt: in40d });
  return out;
}

// Atomically adds `amount` to a counter only if it stays within the cap.
async function reserveOn(inst: string, c: CounterSpec, amount: number): Promise<boolean> {
  await BudgetCounter.updateOne(
    { _id: c.id },
    { $setOnInsert: { institutionId: inst, committedMicros: 0, settledMicros: 0, unknownMicros: 0, alerts: [], expiresAt: c.expiresAt } },
    { upsert: true },
  ).catch((error) => {
    if ((error as { code?: number }).code !== 11000) throw error;
  });
  const res = await BudgetCounter.updateOne({ _id: c.id, committedMicros: { $lte: c.capMicros - amount } }, { $inc: { committedMicros: amount } });
  return res.modifiedCount === 1;
}

async function addUncapped(inst: string, id: string, amount: number, expiresAt: Date) {
  await BudgetCounter.updateOne(
    { _id: id },
    { $inc: { committedMicros: amount }, $setOnInsert: { institutionId: inst, settledMicros: 0, unknownMicros: 0, alerts: [], expiresAt } },
    { upsert: true },
  );
}

async function checkAlerts(inst: string, counters: CounterSpec[]) {
  for (const c of counters) {
    if (!c.capMicros) continue;
    const doc = await BudgetCounter.findById(c.id).select('committedMicros').lean();
    if (!doc) continue;
    const pct = (doc.committedMicros / c.capMicros) * 100;
    for (const t of ALERT_THRESHOLDS) {
      if (pct < t) continue;
      const res = await BudgetCounter.updateOne({ _id: c.id, alerts: { $ne: String(t) } }, { $addToSet: { alerts: String(t) } });
      if (res.modifiedCount === 1) {
        // Internal admin alert: no amounts, prompts or user content.
        (t === 100 ? logger.error : logger.warn)('ai_budget_alert', { institutionId: inst, window: c.window, threshold: t });
      }
    }
  }
}

export interface BudgetTicket {
  key: string;
  state: 'unmetered' | 'reserved';
  kind?: IBudgetReservation['kind'];
  // A test-spend reservation (key + ':test_spend') is held for this attempt.
  testSpend?: boolean;
}

export interface ReserveInput {
  key: string; // unique per provider attempt
  feature: string;
  provider: string;
  institutionId?: string;
  userId?: string;
  upperBoundUsd?: number | null;
  ttlMs?: number;
  now?: Date;
}

// Grading whose budget cannot be checked still runs; its exposure is recorded
// as an uncapped emergency reservation (kept as unknown unless settled with a
// known cost). If that cannot be written either, a critical log carries it.
async function recordGradingEmergency(input: ReserveInput, inst: string, bound: number | null | undefined, reason: string): Promise<BudgetTicket> {
  const now = input.now ?? new Date();
  const amount = typeof bound === 'number' && Number.isFinite(bound) ? toMicros(bound) : 0;
  const id = `${inst}:grading_emergency:${month(now)}`;
  try {
    if (!connected()) throw new Error('database not connected');
    await BudgetReservation.create({
      _id: input.key, institutionId: inst, userId: input.userId, feature: input.feature, provider: input.provider,
      kind: 'grading_emergency', amountMicros: amount, counters: [id], status: 'reserved', createdAt: now,
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS)),
    }).catch((error) => {
      if ((error as { code?: number }).code !== 11000) throw error;
    });
    await addUncapped(inst, id, amount, new Date(now.getTime() + 400 * 86400_000));
    logger.error('ai_budget_grading_emergency', { institutionId: inst, feature: input.feature, reason, severity: 'critical' });
    return { key: input.key, state: 'reserved', kind: 'grading_emergency' };
  } catch (error) {
    logger.error('ai_budget_grading_exposure_unrecorded', { institutionId: inst, feature: input.feature, key: input.key, reason, boundMicros: amount, severity: 'critical', error: serializeError(error) });
    return { key: input.key, state: 'unmetered' };
  }
}

// Not a school: test-spend counters and reservations carry this tenant id, so
// school budget views never list them.
export const TEST_SPEND_TENANT = '__test_spend__';
const testSpendKey = (key: string) => `${key}:test_spend`;

// Reserves the attempt's bound on the deployment's cumulative test-spend
// counter. Returns the reservation key, or undefined when no cap is set.
async function reserveTestSpend(input: ReserveInput): Promise<string | undefined> {
  const cap = getConfig().aiTestSpend;
  if (!cap) return undefined;
  const key = testSpendKey(input.key);
  let bound = typeof input.upperBoundUsd === 'number' && Number.isFinite(input.upperBoundUsd) ? input.upperBoundUsd : undefined;
  try {
    if (bound === undefined && input.institutionId) {
      const school = await schoolConfig(input.institutionId);
      bound = school.value?.maxReservationUsdPerCall[`${input.provider}:${input.feature}`];
    }
    const amount = bound === undefined ? 0 : toMicros(bound);
    // A call without a positive bound cannot be held under the cap.
    if (amount <= 0) {
      logger.warn('ai_test_spend_unbounded_refused', { feature: input.feature, provider: input.provider });
      throw new AiBudgetError('AI_TEST_SPEND_CAP');
    }
    if (!connected()) throw new Error('database not connected');
    const now = input.now ?? new Date();
    const counter: CounterSpec = { id: `test_spend:${cap.id}`, capMicros: toMicros(cap.capUsd), window: 'test_spend', expiresAt: new Date(now.getTime() + 400 * 86400_000) };
    try {
      await BudgetReservation.create({
        _id: key, institutionId: TEST_SPEND_TENANT, userId: input.userId, feature: input.feature, provider: input.provider,
        kind: 'test_spend', amountMicros: amount, counters: [], status: 'reserving', createdAt: now,
        expiresAt: new Date(now.getTime() + (input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS)),
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      // Attempt keys are unique. A reused one is refused rather than run
      // unreserved (its first reservation may be settled), and the first
      // attempt's reservation is never released by this caller.
      logger.warn('ai_test_spend_duplicate_key_refused', { feature: input.feature });
      throw new AiBudgetError('AI_TEST_SPEND_CAP');
    }
    if (!(await reserveOn(TEST_SPEND_TENANT, counter, amount))) {
      await BudgetReservation.updateOne({ _id: key }, { $set: { status: 'released', amountMicros: 0 } });
      logger.warn('ai_test_spend_cap_refused', { feature: input.feature });
      throw new AiBudgetError('AI_TEST_SPEND_CAP');
    }
    await BudgetReservation.updateOne({ _id: key }, { $set: { status: 'reserved', counters: [counter.id] } });
    await checkAlerts(TEST_SPEND_TENANT, [counter]);
    return key;
  } catch (error) {
    if (error instanceof AiBudgetError) throw error;
    storeAlert('ai_test_spend_unavailable', { what: 'test_spend', error: serializeError(error) });
    throw new AiBudgetError('AI_BUDGET_UNAVAILABLE');
  }
}

// Checks the test-spend cap, pauses and the school budget for one provider
// attempt. Throws an AiBudgetError (before any provider call) when the
// attempt may not run.
export async function reserveAiBudget(input: ReserveInput): Promise<BudgetTicket> {
  const test = await reserveTestSpend(input);
  try {
    const ticket = await reserveSchoolBudget(input);
    return test ? { ...ticket, state: 'reserved', testSpend: true } : ticket;
  } catch (error) {
    if (test) await releaseOne(test);
    throw error;
  }
}

async function reserveSchoolBudget(input: ReserveInput): Promise<BudgetTicket> {
  const grading = GRADING_FEATURES.has(input.feature);
  const none: BudgetTicket = { key: input.key, state: 'unmetered' };
  const inst = input.institutionId;
  const school = inst ? await schoolConfig(inst) : { value: null, available: true };
  if (!grading) {
    const global = await globalPaused();
    if (global.value || school.value?.aiPaused) {
      logger.warn('ai_paused_refused', { institutionId: inst, feature: input.feature });
      throw new AiBudgetError('AI_PAUSED');
    }
    if (!global.available || !school.available) {
      logger.error('ai_budget_policy_unavailable', { institutionId: inst, feature: input.feature, policy: 'fail_closed', severity: 'critical' });
      throw new AiBudgetError('AI_BUDGET_UNAVAILABLE');
    }
  } else if (inst && !school.available) {
    return recordGradingEmergency(input, inst, input.upperBoundUsd, 'policy_unavailable');
  }
  if (!inst || !school.value?.enforcementEnabled) return none;
  const cfg = school.value;

  const bound = typeof input.upperBoundUsd === 'number' && Number.isFinite(input.upperBoundUsd) ? input.upperBoundUsd : cfg.maxReservationUsdPerCall[`${input.provider}:${input.feature}`];
  if (bound === undefined) {
    if (!grading) {
      logger.warn('ai_budget_policy_missing', { institutionId: inst, tool: `${input.provider}:${input.feature}` });
      throw new AiBudgetError('AI_BUDGET_POLICY_MISSING');
    }
  }
  const amount = bound === undefined ? 0 : toMicros(bound);
  const now = input.now ?? new Date();
  const counters = standardCounters(inst, cfg, grading ? undefined : input.userId, now);

  try {
    // Idempotent on the attempt key: a replay reserves nothing more.
    try {
      await BudgetReservation.create({
        _id: input.key, institutionId: inst, userId: input.userId, feature: input.feature, provider: input.provider,
        kind: 'standard', amountMicros: amount, counters: [], status: 'reserving', createdAt: now,
        expiresAt: new Date(now.getTime() + (input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS)),
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await BudgetReservation.findById(input.key).lean();
      if (existing?.status === 'released' && !grading) throw new AiBudgetError('AI_BUDGET_EXCEEDED');
      return { key: input.key, state: 'reserved', kind: existing?.kind };
    }

    const done: CounterSpec[] = [];
    // A grading call without any bound goes straight to the emergency path.
    let ok = bound !== undefined;
    if (ok && amount > 0) {
      for (const c of counters) {
        if (await reserveOn(inst, c, amount)) done.push(c);
        else {
          ok = false;
          break;
        }
      }
      if (!ok) for (const c of done) await BudgetCounter.updateOne({ _id: c.id }, { $inc: { committedMicros: -amount } });
    }
    let kind: IBudgetReservation['kind'] = 'standard';
    let held = ok ? counters : [];
    if (!ok) {
      if (!grading) {
        await BudgetReservation.updateOne({ _id: input.key }, { $set: { status: 'released', amountMicros: 0 } });
        logger.warn('ai_budget_refused', { institutionId: inst, feature: input.feature });
        throw new AiBudgetError('AI_BUDGET_EXCEEDED');
      }
      const allowance: CounterSpec = { id: `${inst}:grading:${month(now)}`, capMicros: toMicros(cfg.gradingAllowanceUsd ?? 0), window: 'grading', expiresAt: new Date(now.getTime() + 400 * 86400_000) };
      if (amount > 0 && (await reserveOn(inst, allowance, amount))) {
        kind = 'grading_allowance';
        held = [allowance];
        logger.warn('ai_budget_grading_allowance_used', { institutionId: inst, feature: input.feature });
      } else {
        // Both exhausted (or no bound): grading still runs, as an observable overrun.
        kind = 'grading_emergency';
        const id = `${inst}:grading_emergency:${month(now)}`;
        await addUncapped(inst, id, amount, new Date(now.getTime() + 400 * 86400_000));
        held = [{ id, capMicros: 0, window: 'grading_emergency', expiresAt: now }];
        logger.error('ai_budget_grading_emergency', { institutionId: inst, feature: input.feature, severity: 'critical' });
      }
    }
    await BudgetReservation.updateOne({ _id: input.key }, { $set: { status: 'reserved', kind, counters: held.map((c) => c.id) } });
    await checkAlerts(inst, held);
    return { key: input.key, state: 'reserved', kind };
  } catch (error) {
    if (error instanceof AiBudgetError) throw error;
    if (grading) {
      logger.error('ai_budget_store_failed', { institutionId: inst, feature: input.feature, severity: 'critical', policy: 'grading_proceeds', error: serializeError(error) });
      return recordGradingEmergency(input, inst, bound, 'store_failed');
    }
    logger.error('ai_budget_store_failed', { institutionId: inst, feature: input.feature, severity: 'critical', policy: 'fail_closed', error: serializeError(error) });
    throw new AiBudgetError('AI_BUDGET_UNAVAILABLE');
  }
}

// Settles one attempt. A known cost refunds what was not used; an unknown cost
// (null) keeps the whole reservation as unknown exposure. Idempotent.
export async function settleAiBudget(ticket: BudgetTicket, actualUsd: number | null): Promise<void> {
  if (ticket.state !== 'reserved') return;
  await settleOne(ticket.key, actualUsd);
  if (ticket.testSpend) await settleOne(testSpendKey(ticket.key), actualUsd);
}

async function settleOne(key: string, actualUsd: number | null): Promise<void> {
  try {
    const actual = actualUsd === null ? null : toMicros(actualUsd);
    const r = await BudgetReservation.findOneAndUpdate({ _id: key, status: 'reserved' }, { $set: { status: 'settled', actualMicros: actual, settledAt: new Date() } }, { new: false }).lean();
    if (!r) return;
    for (const id of r.counters) {
      if (actual === null) await BudgetCounter.updateOne({ _id: id }, { $inc: { unknownMicros: r.amountMicros } });
      else await BudgetCounter.updateOne({ _id: id }, { $inc: { committedMicros: actual - r.amountMicros, settledMicros: actual } });
    }
    if (actual === null) logger.info('ai_budget_unknown_cost_retained', { institutionId: r.institutionId, feature: r.feature, provider: r.provider });
    if (actual !== null && actual > r.amountMicros) logger.warn('ai_budget_reservation_exceeded', { institutionId: r.institutionId, feature: r.feature });
  } catch (error) {
    // The reservation stays held; the stale sweep keeps it as unknown exposure.
    logger.error('ai_budget_settle_failed', { key, error: serializeError(error) });
  }
}

// The provider was not called: give the reservation back. Idempotent.
export async function releaseAiBudget(ticket: BudgetTicket): Promise<void> {
  if (ticket.state !== 'reserved') return;
  await releaseOne(ticket.key);
  if (ticket.testSpend) await releaseOne(testSpendKey(ticket.key));
}

async function releaseOne(key: string): Promise<void> {
  try {
    const r = await BudgetReservation.findOneAndUpdate({ _id: key, status: 'reserved' }, { $set: { status: 'released', settledAt: new Date() } }, { new: false }).lean();
    if (!r) return;
    for (const id of r.counters) await BudgetCounter.updateOne({ _id: id }, { $inc: { committedMicros: -r.amountMicros } });
  } catch (error) {
    logger.error('ai_budget_release_failed', { key, error: serializeError(error) });
  }
}

// Reservations left open by a crash or a lost settle. Held ones are kept as
// unknown exposure (the provider may have billed), never refunded; ones that
// crashed mid-reservation are closed without touching counters (any counter
// increments they made stay counted: over-counting, never a bypass).
export async function sweepStaleReservations(opts: { now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const stale = await BudgetReservation.find({ status: { $in: ['reserved', 'reserving'] }, expiresAt: { $lt: now } }).limit(opts.limit ?? 500).lean();
  let expired = 0;
  for (const r of stale) {
    const claimed = await BudgetReservation.updateOne({ _id: r._id, status: r.status }, { $set: { status: 'expired', settledAt: now } });
    if (claimed.modifiedCount !== 1) continue;
    expired += 1;
    if (r.status === 'reserved') for (const id of r.counters) await BudgetCounter.updateOne({ _id: id }, { $inc: { unknownMicros: r.amountMicros } });
  }
  if (expired) logger.warn('ai_budget_stale_reservations_expired', { count: expired });
  return { stale: stale.length, expired };
}

// Validation for enabling enforcement: explicit caps and a reservation ceiling
// for every intended tool without a catalogue price. No defaults are assumed.
export function enforcementProblems(b: {
  dailyCapUsd?: number;
  monthlyCapUsd?: number;
  perUserDailyCapUsd?: number;
  gradingAllowanceUsd?: number;
  intendedTools?: string[];
  maxReservationUsdPerCall?: Record<string, number> | Map<string, number>;
}): string[] {
  const problems: string[] = [];
  for (const f of ['dailyCapUsd', 'monthlyCapUsd', 'perUserDailyCapUsd', 'gradingAllowanceUsd'] as const) {
    if (!(typeof b[f] === 'number' && (b[f] as number) > 0)) problems.push(`${f} is required`);
  }
  if (!b.intendedTools?.length) problems.push('intendedTools is required');
  const bounds = b.maxReservationUsdPerCall instanceof Map ? Object.fromEntries(b.maxReservationUsdPerCall) : b.maxReservationUsdPerCall ?? {};
  for (const tool of b.intendedTools ?? []) {
    if (UNKNOWN_PRICED_TOOLS.includes(tool) && !(bounds[tool] > 0)) problems.push(`maxReservationUsdPerCall.${tool} is required`);
  }
  return problems;
}
