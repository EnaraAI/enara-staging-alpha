import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { getConfig } from '../../../config/env';
import { logger, serializeError } from '../../../utils/logging';
import { AgsFailure, agsFetch, serviceToken, tokenScopes } from '../adapters/lti13/ags';
import { isPrivateHost, REGISTRATION_SCOPES } from '../adapters/lti13/dynamicRegistration';
import { isAcceptableKeysetUrl } from '../adapters/lti13/jwks';
import {
  CHECK_STEPS,
  LmsAuditLog,
  LmsConnectionCheck,
  LmsContext,
  LmsDeployment,
  LmsGradeSyncJob,
  LmsPlatform,
  type CheckStatus,
  type CheckStepKey,
  type ICheckStep,
  type ILmsConnectionCheck,
  type ILmsPlatform,
} from '../models';
import { writeLmsAudit } from './audit';
import { AGS_SCOPE, NRPS_SCOPE } from './capabilities';
import { checkText, type CheckHelp } from './connectionCheckText';
import { lmsFlags } from './flags';
import { passbackOn } from './outbox';

// Step 2: the automatic connection check of one LMS connection (a Moodle tool
// registered for one school). Six steps, each ok | fail | waiting with a plain
// English and Arabic result and fix (connectionCheckText.ts):
//   registered  the connection and a deployment exist (dynamic or by hand);
//   reachable   ENARA fetches Moodle's keyset URL (5 s, no redirects, 64 KB);
//   services    ENARA asks Moodle's token URL for a client-credentials token
//               with the connection's AGS and NRPS scopes (the real grade and
//               roster sign-in); refused before the tool is activated = waiting;
//   activated   a launch (or picker) from this connection was seen;
//   roster      a roster sync of one course worked (or not yet);
//   grades      a grade was sent, or a course's line items can be read (or not yet).
// "Moodle unreachable from the internet" (an on-premise Moodle): the keyset or
// token fetch fails with a network error, a timeout or DNS, or the address is
// private. Launches still work (they go through the browser); the result says
// IT must allow ENARA to reach the Moodle address BY NAME (ENARA has no fixed
// IP, S4) and offers the pasted-public-key fallback.
// When: right after a dynamic registration (background, onboarded schools),
// on "Check again", and nightly (daily cron) for connections whose last check
// failed (S3). Stored per platform in lms_connection_checks; audited as
// connection.check with codes and IDs only. Never stores a response body or a
// token.

const KEYSET_TIMEOUT_MS = 5_000;
const DNS_TIMEOUT_MS = 3_000;
const MAX_BODY = 64 * 1024;
/** "Check again" more often than this returns the stored result. */
export const CHECK_MIN_INTERVAL_MS = 10_000;

export const UNREACHABLE = 'moodle_unreachable';

export interface StepView {
  key: CheckStepKey;
  status: CheckStatus;
  code: string;
  at: Date | null;
  help: CheckHelp;
}

export interface CheckView {
  platformId: string;
  institutionId: string;
  checkedAt: Date | null;
  outcome: CheckStatus | null;
  trigger: string | null;
  unreachable: boolean;
  host: string | null;
  steps: StepView[];
}

const hostOf = (url: string | undefined): string | undefined => {
  try {
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
};

/** The Moodle address shown in the texts (the issuer's host). */
export function platformHost(p: Pick<ILmsPlatform, 'issuer' | 'keysetUrl'>): string | undefined {
  return hostOf(p.issuer) ?? hostOf(p.keysetUrl);
}

// ---------------------------------------------------------------- reachability

type Reach = { ok: true } | { ok: false; reason: 'private_address' | 'dns' | 'network' | 'timeout' };

/**
 * Whether the host is one the internet cannot be expected to reach: a
 * private, loopback or link-local literal, or a name that resolves only to
 * such addresses. Outside production, localhost/127.0.0.1 count as public
 * (the tests' mock Moodle and a local dev server).
 */
export async function privateOrUnresolvable(hostname: string): Promise<Reach> {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopbackDev = !getConfig().isProduction && (h === 'localhost' || h === '127.0.0.1');
  if (loopbackDev) return { ok: true };
  if (isPrivateHost(h)) return { ok: false, reason: 'private_address' };
  if (isIP(h)) return { ok: true };
  try {
    const addrs = await Promise.race([
      lookup(h, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS).unref()),
    ]);
    if (!addrs.length) return { ok: false, reason: 'dns' };
    if (addrs.every((a) => isPrivateHost(a.address))) return { ok: false, reason: 'private_address' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'dns' };
  }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel().catch(() => undefined);
      throw new Error('too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

let keysetTimeoutMs = KEYSET_TIMEOUT_MS;

interface StepOut {
  status: CheckStatus;
  code: string;
  at?: Date;
  unreachable?: boolean;
  reason?: string;
}

async function checkKeyset(p: ILmsPlatform): Promise<StepOut> {
  if (!p.keysetUrl) return p.publicJwks ? { status: 'ok', code: 'manual_key' } : { status: 'fail', code: 'no_keyset' };
  if (!isAcceptableKeysetUrl(p.keysetUrl)) return { status: 'fail', code: 'no_keyset' };
  const host = hostOf(p.keysetUrl)!;
  const reach = await privateOrUnresolvable(host);
  if (!reach.ok) return { status: 'fail', code: UNREACHABLE, unreachable: true, reason: reach.reason };
  let res: Response;
  try {
    res = await fetch(p.keysetUrl, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(keysetTimeoutMs) });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    return { status: 'fail', code: UNREACHABLE, unreachable: true, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { status: 'fail', code: `keyset_http_${res.status}` };
  }
  try {
    const body = JSON.parse(await readCapped(res)) as { keys?: unknown };
    if (!Array.isArray(body?.keys) || !body.keys.length) return { status: 'fail', code: 'keyset_invalid' };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') return { status: 'fail', code: UNREACHABLE, unreachable: true, reason: 'timeout' };
    return { status: 'fail', code: 'keyset_invalid' };
  }
  return { status: 'ok', code: 'keyset_ok' };
}

/** The scopes the services step asks for: the connection's own AGS and NRPS scopes. */
export function serviceScopes(p: Pick<ILmsPlatform, 'scopes'>): string[] {
  const known = new Set<string>([...Object.values(AGS_SCOPE), NRPS_SCOPE]);
  const granted = (p.scopes ?? []).filter((s) => known.has(s));
  return [...new Set(granted.length ? granted : [...REGISTRATION_SCOPES])].sort();
}

function failureStep(error: unknown, activated: boolean): StepOut {
  if (error instanceof AgsFailure) {
    if (error.code === 'network' || error.code === 'timeout') return { status: 'fail', code: UNREACHABLE, unreachable: true, reason: error.code };
    // Moodle refuses the service sign-in until the tool is activated: wait for it.
    if (!activated && /^token_http_4\d\d$/.test(error.code)) return { status: 'waiting', code: 'services_after_activate' };
    return { status: 'fail', code: error.code };
  }
  return { status: 'fail', code: 'internal_error' };
}

async function checkServices(p: ILmsPlatform, activated: boolean, keysetUnreachable: boolean): Promise<StepOut> {
  if (!p.authTokenUrl) return { status: 'fail', code: 'no_token_url' };
  if (!isAcceptableKeysetUrl(p.authTokenUrl)) return { status: 'fail', code: 'no_token_url' };
  const host = hostOf(p.authTokenUrl)!;
  // Same host as the keys (Moodle): no second wait for an address ENARA cannot reach.
  if (keysetUnreachable && host === hostOf(p.keysetUrl)) return { status: 'fail', code: UNREACHABLE, unreachable: true, reason: 'same_host' };
  const reach = await privateOrUnresolvable(host);
  if (!reach.ok) return { status: 'fail', code: UNREACHABLE, unreachable: true, reason: reach.reason };
  try {
    await serviceToken(p, serviceScopes(p), { force: true });
    return { status: 'ok', code: 'token_ok' };
  } catch (error) {
    return failureStep(error, activated);
  }
}

async function firstLaunchAt(platformId: string): Promise<Date | null> {
  const row = await LmsAuditLog.findOne({ platformId, event: { $in: ['lti.launch', 'lti.deep_link'] }, outcome: { $in: ['ok', 'warn'] } })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();
  return row?.createdAt ?? null;
}

async function checkActivated(p: ILmsPlatform): Promise<StepOut> {
  const at = await firstLaunchAt(p.id);
  if (at) return { status: 'ok', code: 'first_launch_seen', at };
  if ((p.launchCount ?? 0) > 0) return { status: 'ok', code: 'first_launch_seen', at: p.lastLaunchAt };
  return { status: 'waiting', code: 'not_activated' };
}

async function checkRoster(p: ILmsPlatform): Promise<StepOut> {
  if (!lmsFlags().roster) return { status: 'waiting', code: 'roster_off' };
  const okCtx = await LmsContext.findOne({ platformId: p.id, 'rosterSync.outcome': { $in: ['ok', 'partial'] } }).sort({ lastRosterSyncAt: 1 }).select('lastRosterSyncAt rosterSync').lean();
  if (okCtx) return { status: 'ok', code: 'roster_ok', at: okCtx.lastRosterSyncAt ?? (okCtx.rosterSync as { lastAttemptAt?: Date } | undefined)?.lastAttemptAt };
  const failed = await LmsContext.findOne({ platformId: p.id, 'rosterSync.outcome': 'failed' }).sort({ updatedAt: -1 }).select('rosterSync').lean();
  if (failed) {
    const code = (failed.rosterSync as { lastErrorCode?: string } | undefined)?.lastErrorCode || 'roster_failed';
    if (code === 'network' || code === 'timeout') return { status: 'fail', code: UNREACHABLE, unreachable: true, reason: code };
    return { status: 'fail', code };
  }
  return { status: 'waiting', code: 'roster_not_yet' };
}

async function checkGrades(p: ILmsPlatform, unreachable: boolean): Promise<StepOut> {
  const sent = await LmsGradeSyncJob.findOne({ platformId: p.id, status: 'sent' }).sort({ sentAt: 1 }).select('sentAt').lean();
  if (sent) return { status: 'ok', code: 'grade_sent', at: sent.sentAt };
  if (!passbackOn()) return { status: 'waiting', code: 'grades_off' };
  const dead = await LmsGradeSyncJob.findOne({ platformId: p.id, status: 'dead' }).sort({ updatedAt: -1 }).select('lastError').lean();
  const context = await LmsContext.findOne({ platformId: p.id, agsLineItemsUrl: { $exists: true, $ne: null } }).sort({ updatedAt: -1 }).lean();
  if (!context) {
    if (dead) return { status: 'fail', code: dead.lastError || 'grades_failed' };
    return { status: 'waiting', code: 'grades_not_yet' };
  }
  if (unreachable) return { status: 'fail', code: UNREACHABLE, unreachable: true, reason: 'same_host' };
  try {
    const url = new URL(context.agsLineItemsUrl!);
    url.searchParams.set('limit', '1');
    if (!isAcceptableKeysetUrl(url.toString())) return { status: 'fail', code: 'bad_line_item_url' };
    const res = await agsFetch(p, tokenScopes(context.agsScopes), url.toString(), { method: 'GET', headers: { Accept: 'application/vnd.ims.lis.v2.lineitemcontainer+json' } });
    await res.body?.cancel().catch(() => undefined);
    if (res.ok) return dead ? { status: 'fail', code: dead.lastError || 'grades_failed' } : { status: 'ok', code: 'lineitems_readable' };
    return { status: 'fail', code: `lineitems_http_${res.status}` };
  } catch (error) {
    return failureStep(error, true);
  }
}

async function checkRegistered(p: ILmsPlatform): Promise<StepOut> {
  if (p.status === 'disabled') return { status: 'fail', code: 'platform_disabled' };
  const deployments = await LmsDeployment.countDocuments({ platformId: p.id });
  if (!deployments && !p.autoCreateDeployments) return { status: 'fail', code: 'no_deployment' };
  if (p.status === 'pending') return { status: 'waiting', code: 'platform_pending', at: p.createdAt };
  return { status: 'ok', code: p.registeredVia === 'dynamic' ? 'registered' : 'registered_manual', at: p.createdAt };
}

const overall = (steps: Pick<ICheckStep, 'status'>[]): CheckStatus =>
  steps.some((s) => s.status === 'fail') ? 'fail' : steps.some((s) => s.status === 'waiting') ? 'waiting' : 'ok';

/** Runs all six steps for one connection (network calls: the keyset, the token URL, one line items read). */
export async function evaluatePlatform(p: ILmsPlatform): Promise<{ steps: ICheckStep[]; outcome: CheckStatus; unreachable: boolean; reasons: Record<string, string> }> {
  const registered = await checkRegistered(p);
  const activated = await checkActivated(p);
  const reachable = await checkKeyset(p);
  const services = await checkServices(p, activated.status === 'ok', !!reachable.unreachable);
  const unreachable = !!(reachable.unreachable || services.unreachable);
  const roster = await checkRoster(p);
  const grades = await checkGrades(p, unreachable);
  const outs: Record<CheckStepKey, StepOut> = { registered, reachable, services, activated, roster, grades };
  const steps = CHECK_STEPS.map((key) => ({ key, status: outs[key].status, code: outs[key].code.slice(0, 80), ...(outs[key].at ? { at: outs[key].at } : {}) }));
  const reasons = Object.fromEntries(CHECK_STEPS.filter((k) => outs[k].reason).map((k) => [`${k}Reason`, outs[k].reason!]));
  return { steps, outcome: overall(steps), unreachable, reasons };
}

export function checkView(row: Pick<ILmsConnectionCheck, 'platformId' | 'institutionId' | 'checkedAt' | 'outcome' | 'trigger' | 'unreachable' | 'steps'> | null, p: ILmsPlatform): CheckView {
  const host = platformHost(p) ?? null;
  return {
    platformId: p.id,
    institutionId: p.institutionId,
    checkedAt: row?.checkedAt ?? null,
    outcome: row?.outcome ?? null,
    trigger: row?.trigger ?? null,
    unreachable: !!row?.unreachable,
    host,
    steps: (row?.steps ?? []).map((s) => ({ key: s.key, status: s.status, code: s.code, at: s.at ?? null, help: checkText(s.key, s.status, s.code, host ?? undefined) })),
  };
}

/** Runs the check for one connection, stores it and audits it (codes and IDs only). */
export async function runConnectionCheck(platformId: string, opts: { trigger: 'registration' | 'manual' | 'nightly'; actor?: string }): Promise<CheckView | null> {
  const p = await LmsPlatform.findOne({ id: platformId }).lean();
  if (!p) return null;
  let result: Awaited<ReturnType<typeof evaluatePlatform>>;
  try {
    result = await evaluatePlatform(p);
  } catch (error) {
    logger.error('lms_connection_check_failed', { platformId, error: serializeError(error) });
    result = { steps: [], outcome: 'fail', unreachable: false, reasons: { error: 'internal_error' } };
  }
  const checkedAt = new Date();
  const row = await LmsConnectionCheck.findOneAndUpdate(
    { platformId },
    {
      $set: { institutionId: p.institutionId, checkedAt, outcome: result.outcome, trigger: opts.trigger, unreachable: result.unreachable, steps: result.steps, ...(opts.actor ? { checkedBy: opts.actor } : {}) },
      ...(opts.actor ? {} : { $unset: { checkedBy: 1 } }),
    },
    { upsert: true, new: true },
  ).lean();
  const firstFail = result.steps.find((s) => s.status === 'fail');
  await writeLmsAudit({
    event: 'connection.check',
    outcome: result.outcome === 'ok' ? 'ok' : result.outcome === 'waiting' ? 'warn' : 'fail',
    institutionId: p.institutionId,
    platformId: p.id,
    actor: opts.actor ?? 'system',
    code: firstFail?.code ?? (result.outcome === 'waiting' ? 'waiting' : undefined),
    refIds: { trigger: opts.trigger, unreachable: result.unreachable, ...Object.fromEntries(result.steps.map((s) => [s.key, s.status])), ...result.reasons },
  });
  return checkView(row, p);
}

/**
 * S3, nightly (the daily cron): re-runs the check for connections whose last
 * check failed, oldest first, within the time budget. Switched-off
 * connections are skipped.
 */
export async function recheckFailedConnections(opts: { budgetMs: number; limit?: number }): Promise<{ checked: number; ok: number; stillFailing: number; skipped?: string }> {
  if (!lmsFlags().lti) return { checked: 0, ok: 0, stillFailing: 0, skipped: 'lti_off' };
  const deadline = Date.now() + opts.budgetMs;
  const rows = await LmsConnectionCheck.find({ outcome: 'fail' }).sort({ checkedAt: 1 }).limit(opts.limit ?? 20).select('platformId').lean();
  let checked = 0;
  let ok = 0;
  let stillFailing = 0;
  for (const r of rows) {
    // One check can take about 20 s at worst (5 s keys, 8 s token, 8 s line items).
    if (Date.now() > deadline - 2_000) break;
    const p = await LmsPlatform.findOne({ id: r.platformId }).select('status').lean();
    if (!p || p.status === 'disabled') continue;
    const view = await runConnectionCheck(r.platformId, { trigger: 'nightly' });
    checked++;
    if (view?.outcome === 'fail') stillFailing++;
    else ok++;
  }
  return { checked, ok, stillFailing };
}

/** Tests only. */
export function setConnectionCheckTimeoutForTests(ms: number): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  keysetTimeoutMs = ms;
}
