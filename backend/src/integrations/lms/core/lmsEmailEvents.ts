import { User } from '../../../models/User';
import { logger, serializeError } from '../../../utils/logging';
import { LmsAuditLog, LmsContext, LmsDeployment, LmsEmailClaim, LmsEmailOptIn, LmsPlatform, LmsUser, type ILmsPlatform } from '../models';
import { platformName } from './activityHealth';
import { setLmsAuditListener, type LmsAuditRow } from './audit';
import { checkText } from './connectionCheckText';
import { runInBackground } from './drain';
import {
  appUrl,
  cairoDay,
  claimWindow,
  firstName,
  formatAt,
  formatDay,
  lmsEmailsActive,
  num,
  opsRecipients,
  owned,
  schoolAdminRecipients,
  schoolLang,
  schoolOf,
  sendLmsEmail,
  type LmsEmailResult,
  type LmsRecipient,
} from './lmsEmail';
import { byRole, KEY_PROBLEM_CODES, KEY_PROBLEM_TEXT, OPS_APPROVAL_ITEM, pendingItem, REJECT_REASONS } from './lmsEmailText';

// LMS emails sent right after an event (plan LMS_EMAIL_TEMPLATES_PLAN.md,
// "immediate"). Most events are the LMS audit rows themselves: this module
// listens to writeLmsAudit (audit.ts) and, only when LMS emails are on,
// schedules the email in the background (waitUntil: it never delays or breaks
// the request). Seats, the connection check and the teacher opt-in call the
// notify* functions below directly. Every email goes through sendLmsEmail
// (lmsEmail.ts: gates, idempotency, the test inbox, the daily cap).
//
//   platform.registered active / platform.approved -> 3 lms-connection-active (+18 ops)
//   platform.registered pending                    -> 4a lms-connection-pending (+19 ops)
//   deployment.registered pending, or a launch that
//   auto-created a pending deployment (E3)          -> 4a with ITEM (+19 ops)
//   platform.rejected                              -> 4c lms-connection-rejected
//   platform.disabled                              -> 6 lms-connection-switched-off
//   3 key failures in 60 min for a platform        -> 7 lms-key-problem (max once per 24 h)
//   >= 20 failures and >= 30 % of a school's LMS
//   events in 60 min                               -> 20 lms-ops-error-spike (max once per 6 h)

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const KEY_PROBLEM_MIN = 3;
export const SPIKE_MIN_FAILS = 20;
export const SPIKE_MIN_SHARE = 0.3;
const SPIKE_CHECK_EVERY_MS = 60_000;
const spikeCheckedAt = new Map<string, number>();

const lmsPage = (q: Record<string, string>) => `${appUrl()}/?${new URLSearchParams({ page: 'lms', ...q }).toString()}`;
export const platformUrl = (platformId: string, tab?: string) => lmsPage({ platform: platformId, ...(tab ? { tab } : {}) });
export const opsUrl = (institutionId?: string, tab?: string) => lmsPage({ ...(institutionId ? { institution: institutionId } : {}), ...(tab ? { tab } : {}) });

/** "an Enara administrator" / "a school administrator", from the actor's role (never a name). */
async function actorRole(actor: string | undefined): Promise<'enara' | 'school' | 'system'> {
  if (!actor || !/^[a-f0-9]{24}$/i.test(actor)) return 'system';
  const u = await User.findById(actor).select('role').lean().catch(() => null);
  if (u?.role === 'enara-admin') return 'enara';
  if (u?.role === 'admin') return 'school';
  return 'system';
}

/** The school's admins in the school's language; nothing when the school is gone. */
async function forSchool(institutionId: string) {
  const [school, lang, admins] = await Promise.all([schoolOf(institutionId), schoolLang(institutionId), schoolAdminRecipients(institutionId)]);
  return school ? { school, lang, admins } : null;
}

const nameOf = (r: LmsRecipient) => firstName(r.name);

// ------------------------------------------------------------ connections

/** 3 (and 4b): the connection is active. Once per activation (approvedAt). */
export async function notifyConnectionActive(p: ILmsPlatform): Promise<LmsEmailResult | null> {
  const s = await forSchool(p.institutionId);
  if (!s) return null;
  const at = (p.approvedAt ?? p.createdAt ?? new Date()).getTime();
  return sendLmsEmail({
    template: 'lms-connection-active', key: `active:${p.id}:${at}`, lang: s.lang, institutionId: p.institutionId, platformId: p.id, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: s.school.name, LMS_NAME: platformName(p), ACTION_URL: platformUrl(p.id), REFERENCE_CODE: p.id }),
  });
}

/** 18 (ops): a school is connected. Once per platform. */
export async function notifyOpsSchoolConnected(p: ILmsPlatform, actor?: string): Promise<LmsEmailResult | null> {
  const school = await schoolOf(p.institutionId);
  if (!school) return null;
  const [deployments, role] = await Promise.all([LmsDeployment.countDocuments({ platformId: p.id }), actorRole(actor ?? p.approvedBy ?? p.createdBy)]);
  return sendLmsEmail({
    template: 'lms-ops-school-connected', key: `connected:${p.id}`, lang: 'en', institutionId: p.institutionId, platformId: p.id, recipients: opsRecipients(),
    vars: () => ({ SCHOOL_NAME: school.name, INSTITUTION_ID: p.institutionId, LMS_NAME: platformName(p), REGISTERED_VIA: p.registeredVia, DEPLOYMENTS: num(deployments), BY_ROLE: byRole(role, 'en'), PLATFORM_ID: p.id, ACTION_URL: opsUrl(p.institutionId) }),
  });
}

export interface PendingItem {
  kind: 'connection' | 'deployment' | 'autoDeployment';
  /** lmsp_ (connection) or lmsd_ (deployment): the key and the reference. */
  id: string;
  /** The LMS's own deployment ID (shown for a deployment). */
  externalId?: string;
  since: Date;
}

/** 4a / E3: waiting for approval. Once per platform / deployment. */
export async function notifyPending(p: ILmsPlatform, item: PendingItem): Promise<LmsEmailResult | null> {
  const s = await forSchool(p.institutionId);
  if (!s) return null;
  const itemText = item.kind === 'connection' ? pendingItem('connection', s.lang, platformName(p)) : pendingItem('deployment', s.lang, item.externalId ?? item.id);
  return sendLmsEmail({
    template: 'lms-connection-pending', key: `pending:${item.id}`, lang: s.lang, institutionId: p.institutionId, platformId: p.id, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), ITEM: owned(itemText, s.lang), ACTION_URL: platformUrl(p.id), REFERENCE_CODE: item.id }),
  });
}

/** 19 (ops): approval needed; at most once per item per Cairo day (the daily reminder uses the same key). */
export async function notifyOpsApprovalNeeded(p: ILmsPlatform, item: PendingItem, day = cairoDay()): Promise<LmsEmailResult | null> {
  const school = await schoolOf(p.institutionId);
  if (!school) return null;
  return sendLmsEmail({
    template: 'lms-ops-approval-needed', key: `approval:${item.id}:${day}`, lang: 'en', institutionId: p.institutionId, platformId: p.id, recipients: opsRecipients(),
    vars: () => ({ SCHOOL_NAME: school.name, INSTITUTION_ID: p.institutionId, LMS_NAME: platformName(p), ITEM: OPS_APPROVAL_ITEM[item.kind], WAITING_SINCE: formatAt(item.since, 'en'), PLATFORM_ID: p.id, ACTION_URL: opsUrl(p.institutionId) }),
  });
}

async function onPending(p: ILmsPlatform, item: PendingItem) {
  await notifyPending(p, item);
  await notifyOpsApprovalNeeded(p, item);
}

async function onPlatformRegistered(row: LmsAuditRow) {
  const p = await LmsPlatform.findOne({ id: row.platformId }).lean();
  if (!p) return;
  if (p.status === 'active') {
    await notifyConnectionActive(p);
    await notifyOpsSchoolConnected(p, row.actor);
  } else if (p.status === 'pending') {
    await onPending(p, { kind: 'connection', id: p.id, since: p.createdAt ?? new Date() });
  }
}

async function onPlatformApproved(row: LmsAuditRow) {
  const p = await LmsPlatform.findOne({ id: row.platformId }).lean();
  if (!p || p.status !== 'active') return;
  await notifyConnectionActive(p);
  await notifyOpsSchoolConnected(p, row.actor);
}

async function onDeploymentPending(row: LmsAuditRow, auto: boolean) {
  const p = await LmsPlatform.findOne({ id: row.platformId }).lean();
  if (!p) return;
  const ref = String(row.refIds.deploymentId ?? '');
  // An admin's new deployment carries its lmsd_ id; a launch carries the LMS's own deployment ID.
  const d = ref ? await LmsDeployment.findOne(ref.startsWith('lmsd') ? { id: ref, platformId: p.id } : { platformId: p.id, deploymentId: ref }).lean() : null;
  if (!d || d.status !== 'pending') return;
  // A pending deployment of a still-pending connection is part of that connection's email.
  if (p.status === 'pending' && !auto) return;
  await onPending(p, { kind: auto ? 'autoDeployment' : 'deployment', id: d.id, externalId: d.deploymentId, since: d.createdAt ?? new Date() });
}

/** 4c: an ENARA admin did not approve the connection (fixed reason, D6). Once per rejection. */
async function onPlatformRejected(row: LmsAuditRow) {
  const p = await LmsPlatform.findOne({ id: row.platformId }).lean();
  const reason = REJECT_REASONS[String(row.refIds.reason ?? '')];
  if (!p || !reason) return;
  const s = await forSchool(p.institutionId);
  if (!s) return;
  await sendLmsEmail({
    template: 'lms-connection-rejected', key: `rejected:${p.id}:${row.id}`, lang: s.lang, institutionId: p.institutionId, platformId: p.id, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), LMS_NAME: platformName(p), REASON: owned(reason.reason[s.lang], s.lang), FIX: owned(reason.fix[s.lang], s.lang), ACTION_URL: platformUrl(p.id), REFERENCE_CODE: p.id }),
  });
}

/** 6: switched off. Once per switch-off (the audit row). */
async function onPlatformDisabled(row: LmsAuditRow) {
  const p = await LmsPlatform.findOne({ id: row.platformId }).lean();
  if (!p) return;
  const s = await forSchool(p.institutionId);
  if (!s) return;
  const role = await actorRole(row.actor);
  await sendLmsEmail({
    template: 'lms-connection-switched-off', key: `off:${p.id}:${row.id}`, lang: s.lang, institutionId: p.institutionId, platformId: p.id, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: s.school.name, LMS_NAME: platformName(p), DATE: formatDay(row.createdAt, s.lang, s.school.timeZone), BY_ROLE: owned(byRole(role, s.lang), s.lang), ACTION_URL: platformUrl(p.id), REFERENCE_CODE: row.id }),
  });
}

// ------------------------------------------------------------ problems

const KEY_CODES = new Set(KEY_PROBLEM_CODES);

/** 7: three key failures within 60 minutes for one connection; at most once per connection per 24 h. */
async function onKeyFailure(row: LmsAuditRow, now = new Date()) {
  if (!row.platformId) return;
  const rows = await LmsAuditLog.find({ platformId: row.platformId, outcome: 'fail', code: { $in: KEY_PROBLEM_CODES }, createdAt: { $gte: new Date(now.getTime() - HOUR) } }).select('code createdAt').sort({ createdAt: 1 }).limit(500).lean();
  if (rows.length < KEY_PROBLEM_MIN) return;
  const p = await LmsPlatform.findOne({ id: row.platformId }).lean();
  if (!p) return;
  if (!(await claimWindow(`key-problem:${p.id}`, DAY, now))) return;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.code!, (counts.get(r.code!) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const text = KEY_PROBLEM_TEXT[top];
  const s = await forSchool(p.institutionId);
  if (!s) return;
  await sendLmsEmail({
    template: 'lms-key-problem', key: `key-problem:${p.id}:${row.id}`, lang: s.lang, institutionId: p.institutionId, platformId: p.id, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), LMS_NAME: platformName(p), FIRST_SEEN: formatAt(rows[0].createdAt, s.lang, s.school.timeZone), FAILED_COUNT: num(rows.length), PROBLEM: owned(text.reason[s.lang], s.lang), FIX: owned(text.fix[s.lang], s.lang), ACTION_URL: platformUrl(p.id), REFERENCE_CODE: `${row.id} · ${top}` }),
  });
}

/** 20 (ops): an error spike at one school. Checked at most once a minute per school (per instance). */
async function onFailure(row: LmsAuditRow, now = new Date()) {
  const inst = row.institutionId!;
  const last = spikeCheckedAt.get(inst) ?? 0;
  if (now.getTime() - last < SPIKE_CHECK_EVERY_MS) return;
  spikeCheckedAt.set(inst, now.getTime());
  const since = new Date(now.getTime() - HOUR);
  const [total, fails] = await Promise.all([
    LmsAuditLog.countDocuments({ institutionId: inst, createdAt: { $gte: since } }),
    LmsAuditLog.find({ institutionId: inst, outcome: 'fail', createdAt: { $gte: since } }).select('code platformId createdAt').sort({ createdAt: 1 }).limit(5000).lean(),
  ]);
  if (fails.length < SPIKE_MIN_FAILS || !total || fails.length / total < SPIKE_MIN_SHARE) return;
  if (!(await claimWindow(`spike:${inst}`, 6 * HOUR, now))) return;
  const codes = new Map<string, number>();
  const platforms = new Map<string, number>();
  for (const f of fails) {
    codes.set(f.code ?? 'none', (codes.get(f.code ?? 'none') ?? 0) + 1);
    if (f.platformId) platforms.set(f.platformId, (platforms.get(f.platformId) ?? 0) + 1);
  }
  const [topCode, topCount] = [...codes.entries()].sort((a, b) => b[1] - a[1])[0];
  const topPlatform = [...platforms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const p = topPlatform ? await LmsPlatform.findOne({ id: topPlatform }).lean() : null;
  const school = await schoolOf(inst);
  await sendLmsEmail({
    template: 'lms-ops-error-spike', key: `spike:${inst}:${row.id}`, lang: 'en', institutionId: inst, platformId: p?.id, recipients: opsRecipients(),
    vars: () => ({ SCHOOL_NAME: school?.name ?? inst, INSTITUTION_ID: inst, LMS_NAME: p ? platformName(p) : 'LMS', WINDOW: '60 minutes', FAIL_COUNT: num(fails.length), TOTAL_COUNT: num(total), TOP_CODE: topCode, TOP_CODE_COUNT: num(topCount), FIRST_AT: formatAt(fails[0].createdAt, 'en'), ACTION_URL: opsUrl(inst), REFERENCE_CODE: row.id }),
  });
}

// ------------------------------------------------------------ seats (called by seats.ts)

/** 10b: over the seat limit (seats.ts already limits it to once per 24 h with lastAlertAt). */
export async function notifySeatsOverLimit(institutionId: string, seatsUsed: number, seatLimit: number, alertedAt: Date) {
  const s = await forSchool(institutionId);
  if (!s) return null;
  return sendLmsEmail({
    template: 'lms-seats-over-limit', key: `over-limit:${institutionId}:${alertedAt.getTime()}`, lang: s.lang, institutionId, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: s.school.name, SEATS_USED: num(seatsUsed), SEAT_LIMIT: num(seatLimit), ACTION_URL: opsUrl(undefined, 'seats') }),
  });
}

/** E2 (ops): the billing flag was set (once per flag; a cleared and re-set flag is a new one). */
export async function notifyBillingFlag(institutionId: string, seatsUsed: number, seatLimit: number, hardCap: boolean, flaggedAt: Date) {
  const school = await schoolOf(institutionId);
  if (!school) return null;
  return sendLmsEmail({
    template: 'lms-ops-billing-flag', key: `billing:${institutionId}:${flaggedAt.getTime()}`, lang: 'en', institutionId, recipients: opsRecipients(),
    vars: () => ({ SCHOOL_NAME: school.name, INSTITUTION_ID: institutionId, SEATS_USED: num(seatsUsed), SEAT_LIMIT: num(seatLimit), HARD_CAP: hardCap ? 'on' : 'off', FLAGGED_ON: formatDay(flaggedAt, 'en'), ACTION_URL: opsUrl(institutionId, 'seats') }),
  });
}

/** E1: a new student was refused at the hard cap; at most once per school per 24 h. */
export async function notifyHardCap(institutionId: string, seatsUsed: number, seatLimit: number, now = new Date()) {
  if (!(await claimWindow(`hard-cap:${institutionId}`, DAY, now))) return null;
  const s = await forSchool(institutionId);
  if (!s) return null;
  const refused = await LmsAuditLog.countDocuments({ institutionId, event: 'seats.hard_cap', createdAt: { $gte: new Date(now.getTime() - DAY) } });
  return sendLmsEmail({
    template: 'lms-seats-hard-cap', key: `hard-cap:${institutionId}:${now.getTime()}`, lang: s.lang, institutionId, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: s.school.name, SEATS_USED: num(seatsUsed), SEAT_LIMIT: num(seatLimit), REFUSED_COUNT: num(Math.max(1, refused)), ACTION_URL: opsUrl(undefined, 'seats') }),
  });
}

export const SEAT_WARN_THRESHOLDS = [80, 90] as const;
export const SEAT_WARN_RESET_BELOW = 75;

/**
 * 10a: 80 % / 90 % of the seats used. Once per threshold per seat limit; it
 * starts again when the limit changes or usage drops under 75 %. Over 100 %
 * is 10b (lms-seats-over-limit), not this.
 */
export async function notifySeatsWarning(institutionId: string, seatsUsed: number, seatLimit: number) {
  if (!seatLimit || seatsUsed > seatLimit) return null;
  const pct = (seatsUsed / seatLimit) * 100;
  const _id = `seat-warn:${institutionId}`;
  const state = await LmsEmailClaim.findById(_id).lean();
  const sameLimit = state?.data?.limit === seatLimit;
  if (!state || !sameLimit || pct < SEAT_WARN_RESET_BELOW) {
    await LmsEmailClaim.updateOne({ _id }, { $set: { at: new Date(), data: { limit: seatLimit, percent: 0, round: Number(state?.data?.round ?? 0) + (state ? 1 : 0) } } }, { upsert: true });
  }
  const threshold = [...SEAT_WARN_THRESHOLDS].reverse().find((t) => pct >= t);
  if (!threshold) return null;
  // Atomic: only the first launch that crosses the threshold sends it.
  const claimed = await LmsEmailClaim.findOneAndUpdate({ _id, 'data.limit': seatLimit, 'data.percent': { $lt: threshold } }, { $set: { 'data.percent': threshold, at: new Date() } }, { new: true }).lean();
  if (!claimed) return null;
  const s = await forSchool(institutionId);
  if (!s) return null;
  return sendLmsEmail({
    template: 'lms-seats-warning', key: `seat-warn:${institutionId}:${seatLimit}:${threshold}:${claimed.data?.round ?? 0}`, lang: s.lang, institutionId, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: s.school.name, PERCENT: String(threshold), SEATS_USED: num(seatsUsed), SEAT_LIMIT: num(seatLimit), SEATS_LEFT: num(Math.max(0, seatLimit - seatsUsed)), ACTION_URL: opsUrl(undefined, 'seats') }),
  });
}

// ------------------------------------------------------------ connection check (called by connectionCheck.ts)

/** 5: the automatic connection check went from OK (or never run) to failed; at most once per connection and cause per 24 h. */
export async function notifyConnectionCheckFailed(p: ILmsPlatform, step: { key: Parameters<typeof checkText>[0]; code: string }, checkedAt: Date, host?: string) {
  if (!(await claimWindow(`check-failed:${p.id}:${step.code}`, DAY, checkedAt))) return null;
  const s = await forSchool(p.institutionId);
  if (!s) return null;
  const help = checkText(step.key, 'fail', step.code, host)[s.lang];
  return sendLmsEmail({
    template: 'lms-connection-check-failed', key: `check-failed:${p.id}:${step.code}:${checkedAt.getTime()}`, lang: s.lang, institutionId: p.institutionId, platformId: p.id, recipients: s.admins,
    vars: (r) => ({ NAME: nameOf(r), LMS_NAME: platformName(p), CHECKED_AT: formatAt(checkedAt, s.lang, s.school.timeZone), CAUSE: owned(help.what, s.lang), FIX: owned(help.fix, s.lang), ACTION_URL: `${appUrl()}/?page=lms-status`, REFERENCE_CODE: `${p.id} · ${step.code}` }),
  });
}

// ------------------------------------------------------------ teachers (D2)

/** The teacher's class page (the class of their LMS course). */
export const classUrl = (enaraClassId?: string, filter?: string) =>
  enaraClassId ? `${appUrl()}/?${new URLSearchParams({ page: 'class-assignments', class: enaraClassId, ...(filter ? { filter } : {}) }).toString()}` : `${appUrl()}/`;

/** 13: the welcome, once per teacher ever, right after they said yes to Enara emails on their first launch (D2). */
export async function notifyTeacherWelcome(enaraUserId: string) {
  const o = await LmsEmailOptIn.findOne({ enaraUserId, state: 'in', welcomeSentAt: { $exists: false } }).lean();
  if (!o?.email) return null;
  const [user, context] = await Promise.all([
    User.findById(enaraUserId).select('name role status institutionId').lean().catch(() => null),
    o.contextId ? LmsContext.findOne({ id: o.contextId }).lean() : null,
  ]);
  if (!user || !['teacher', 'admin'].includes(user.role) || user.status !== 'active' || user.institutionId !== o.institutionId || !context) return null;
  const p = await LmsPlatform.findOne({ id: context.platformId }).lean();
  if (!p) return null;
  const lang = await schoolLang(o.institutionId);
  const result = await sendLmsEmail({
    template: 'lms-teacher-welcome', key: `welcome:${enaraUserId}`, lang, institutionId: o.institutionId, platformId: p.id,
    recipients: [{ ref: `user:${enaraUserId}`, email: o.email, name: user.name }],
    vars: (r) => ({ NAME: nameOf(r), COURSE_NAME: context.title || (lang === 'ar' ? 'مقررك' : 'your course'), LMS_NAME: platformName(p), ACTION_URL: classUrl(context.enaraClassId) }),
  });
  if (result.sent || result.captured || result.held || result.duplicate) await LmsEmailOptIn.updateOne({ enaraUserId }, { $set: { welcomeSentAt: new Date() } });
  return result;
}

/** The address Moodle shared for this ENARA account (the opt-in's pre-filled value), if any. */
export async function moodleAddressOf(enaraUserId: string): Promise<{ email?: string; contextId?: string }> {
  const lu = await LmsUser.findOne({ enaraUserId, email: { $exists: true } }).sort({ lastLaunchAt: -1, updatedAt: -1 }).select('email').lean();
  const email = lu?.email && !/\.test$/i.test(lu.email) ? lu.email : undefined;
  return { email };
}

// ------------------------------------------------------------ the listener

function jobsFor(row: LmsAuditRow): (() => Promise<unknown>)[] {
  const jobs: (() => Promise<unknown>)[] = [];
  switch (row.event) {
    case 'platform.registered': jobs.push(() => onPlatformRegistered(row)); break;
    case 'platform.approved': jobs.push(() => onPlatformApproved(row)); break;
    case 'platform.rejected': jobs.push(() => onPlatformRejected(row)); break;
    case 'platform.disabled': jobs.push(() => onPlatformDisabled(row)); break;
    case 'deployment.registered': if (row.refIds.status === 'pending') jobs.push(() => onDeploymentPending(row, false)); break;
    case 'lti.launch': if (row.code === 'deployment_pending' && row.refIds.autoCreated === true) jobs.push(() => onDeploymentPending(row, true)); break;
    default: break;
  }
  if (row.outcome === 'fail' && row.code && KEY_CODES.has(row.code) && row.platformId) jobs.push(() => onKeyFailure(row));
  if (row.outcome === 'fail' && row.institutionId) jobs.push(() => onFailure(row));
  return jobs;
}

/** Called for every LMS audit row; cheap when LMS emails are off (one config read). */
export function onLmsAudit(row: LmsAuditRow): void {
  if (!lmsEmailsActive()) return;
  const jobs = jobsFor(row);
  if (!jobs.length) return;
  runInBackground(`lms_email:${row.event}`, async () => {
    for (const job of jobs) {
      try {
        await job();
      } catch (error) {
        logger.warn('lms_email_trigger_failed', { event: row.event, error: serializeError(error) });
      }
    }
  });
}

setLmsAuditListener(onLmsAudit);

/** Tests only. */
export function resetLmsEmailThrottleForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  spikeCheckedAt.clear();
}

