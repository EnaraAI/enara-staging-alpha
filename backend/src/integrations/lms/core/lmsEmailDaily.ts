import { logger, serializeError } from '../../../utils/logging';
import {
  LmsAuditLog,
  LmsContext,
  LmsDeployment,
  LmsEnrollment,
  LmsGradeSyncJob,
  LmsEmailClaim,
  LmsOnboarding,
  LmsOrgSettings,
  LmsPlatform,
  LmsRegistrationCode,
  LmsResourceLink,
  LmsToolKey,
  LmsUser,
  type ILmsContext,
  type ILmsPlatform,
} from '../models';
import { flaggedActivities, platformName } from './activityHealth';
import { LMS_VALUE_DIFFERS } from './gradeSyncLog';
import {
  appUrl,
  cairoDay,
  capCount,
  claimWindow,
  firstName,
  formatDay,
  heldToday,
  lmsEmailsActive,
  num,
  opsRecipients,
  owned,
  schoolAdminRecipients,
  schoolLang,
  schoolOf,
  sendLmsEmail,
  teacherRecipients,
  type LmsEmailResult,
  type LmsRecipient,
  type TeacherRecipient,
} from './lmsEmail';
import { classUrl, notifyOpsApprovalNeeded, opsUrl, platformUrl } from './lmsEmailEvents';
import { courseLabel, gradeFailReason, KEY_PROBLEM_CODES, REMOVALS_SKIPPED_REASON, rosterFailText } from './lmsEmailText';
import { codeState } from './registrationCode';
import { getConfig } from '../../../config/env';

// The LMS email digests, run by GET /api/cron/daily (lms-test has no
// scheduler: the daily route runs when it is called with CRON_SECRET; see
// docs/lms/LMS_EMAILS.md). Every digest is "one email per recipient (or per
// connection) per Cairo day" by its idempotency key, so a second run the same
// day sends nothing new. Weekly items run on Mondays (Cairo). The ops daily
// digest (E5) runs last and always goes (also past the test inbox's daily cap,
// whose held emails it counts).
//
//   2a / 2b invite expiring (<= 3 days) / expired, once per onboarding link
//   8  grade-sync digest: grades that became 'dead' in 24 h, per connection
//   9  roster sync failed in 24 h (not manual), same course + code not again for 72 h
//   E6 removals skipped in 24 h, once per course + code per 7 days
//   15 activity may be deleted: lineitem_gone daily, stale weekly; once per link and reason
//   16 grades changed in Moodle (newly flagged in 24 h), per teacher
//   17 newer attempts waiting (once per attempt), per teacher
//   19 approval still needed: one reminder per pending item per day
//   E4 ENARA signing key: a 'next' key older than 24 h, or no active key
//   11 (Monday) adoption weekly, per connection
//   14 (Monday) students not started, per teacher (a course at most 3 weeks in a row unless its count rises)
//   E5 ops daily digest

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LIMIT = 500;

type Totals = Record<string, number>;
export interface LmsEmailDailyResult {
  skipped?: string;
  ran: string[];
  emails: Totals;
  stoppedEarly?: boolean;
}

function add(totals: Totals, r: LmsEmailResult | null | undefined) {
  if (!r) return;
  for (const k of ['sent', 'captured', 'held', 'failed', 'duplicate'] as const) totals[k] = (totals[k] ?? 0) + r[k];
}

const nameOf = (r: LmsRecipient) => firstName(r.name);

/** Mondays in Cairo run the weekly items. */
export function isCairoMonday(now = new Date()): boolean {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' }).format(now) === 'Mon';
}

async function forSchool(institutionId: string) {
  const [school, lang, admins] = await Promise.all([schoolOf(institutionId), schoolLang(institutionId), schoolAdminRecipients(institutionId)]);
  return school ? { school, lang, admins } : null;
}

// ------------------------------------------------------------ 2a / 2b

export async function inviteReminders(now: Date, totals: Totals) {
  const rows = await LmsOnboarding.find({ inviteSentAt: { $exists: true }, registrationLinkId: { $exists: true } }).limit(LIMIT).lean();
  for (const o of rows) {
    const link = await LmsRegistrationCode.findOne({ id: o.registrationLinkId }).lean();
    if (!link) continue;
    const state = codeState(link, now.getTime());
    const left = link.expiresAt.getTime() - now.getTime();
    const expiring = state === 'unused' && left <= 3 * DAY;
    // Expired unused in the last 7 days (an older one was already reported or is stale).
    const expired = state === 'expired' && link.status === 'unused' && -left <= 7 * DAY;
    if (!expiring && !expired) continue;
    const school = await schoolOf(o.institutionId);
    if (!school) continue;
    const lang = await schoolLang(o.institutionId);
    const admins = await schoolAdminRecipients(o.institutionId);
    // The invited admin (the school's contact) even when other admins exist.
    const recipients = school.contactEmail ? [{ ref: `contact:${o.institutionId}`, email: school.contactEmail, name: school.contactName }, ...admins] : admins;
    const date = formatDay(link.expiresAt, lang, school.timeZone);
    add(totals, await sendLmsEmail({
      template: expiring ? 'lms-invite-expiring' : 'lms-invite-expired', key: `${expiring ? 'invite-expiring' : 'invite-expired'}:${link.id}`, lang, institutionId: o.institutionId, recipients,
      vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: school.name, ...(expiring ? { EXPIRES_ON: date } : { EXPIRED_ON: date }), ACTION_URL: `${appUrl()}/?page=lms-status`, REFERENCE_CODE: o.id }),
    }));
  }
}

// ------------------------------------------------------------ 8

export async function gradeSyncDigest(now: Date, totals: Totals) {
  const since = new Date(now.getTime() - DAY);
  const dead = await LmsAuditLog.find({ event: 'grade.failed', 'refIds.dead': true, code: { $ne: LMS_VALUE_DIFFERS }, createdAt: { $gte: since } }).select('platformId code refIds').limit(5000).lean();
  const byPlatform = new Map<string, typeof dead>();
  for (const d of dead) if (d.platformId) byPlatform.set(d.platformId, [...(byPlatform.get(d.platformId) ?? []), d]);
  const day = cairoDay(now);
  for (const [platformId, rows] of byPlatform) {
    const p = await LmsPlatform.findOne({ id: platformId }).lean();
    if (!p) continue;
    const s = await forSchool(p.institutionId);
    if (!s) continue;
    const jobIds = [...new Set(rows.map((r) => String(r.refIds?.jobId ?? '')).filter(Boolean))];
    const [retrying, courses] = await Promise.all([
      LmsGradeSyncJob.countDocuments({ platformId, status: { $in: ['pending', 'processing'] }, attempts: { $gt: 0 } }),
      jobIds.length ? LmsGradeSyncJob.distinct('contextId', { id: { $in: jobIds } }) : Promise.resolve([] as string[]),
    ]);
    const codes = new Map<string, number>();
    for (const r of rows) codes.set(r.code ?? 'unknown', (codes.get(r.code ?? 'unknown') ?? 0) + 1);
    const top = [...codes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    add(totals, await sendLmsEmail({
      template: 'lms-grade-sync-digest', key: `grade-digest:${platformId}:${day}`, lang: s.lang, institutionId: p.institutionId, platformId, recipients: s.admins,
      vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: s.school.name, LMS_NAME: platformName(p), DATE: formatDay(now, s.lang, s.school.timeZone), FAILED_COUNT: num(jobIds.length || rows.length), RETRYING_COUNT: num(retrying), COURSES_AFFECTED: num(courses.length), TOP_REASON: owned(gradeFailReason(top)[s.lang], s.lang), ACTION_URL: platformUrl(platformId, 'grades'), REFERENCE_CODE: platformId }),
    }));
  }
}

// ------------------------------------------------------------ 9 and E6

const NOT_REPORTED = new Set(['busy', 'skipped', 'roster_busy', 'roster_skipped']);

export async function rosterDigests(now: Date, totals: Totals) {
  const since = new Date(now.getTime() - DAY);
  const day = cairoDay(now);
  const fails = await LmsAuditLog.find({ event: 'roster.sync', outcome: 'fail', createdAt: { $gte: since }, 'refIds.trigger': { $ne: 'manual' } }).sort({ createdAt: 1 }).limit(2000).lean();
  const byPlatform = new Map<string, { contextId: string; code: string; id: string }[]>();
  for (const f of fails) {
    const contextId = String(f.refIds?.contextId ?? '');
    const code = f.code ?? 'internal_error';
    if (!f.platformId || !contextId || NOT_REPORTED.has(code)) continue;
    const list = byPlatform.get(f.platformId) ?? [];
    if (!list.some((x) => x.contextId === contextId && x.code === code)) list.push({ contextId, code, id: f.id });
    byPlatform.set(f.platformId, list);
  }
  for (const [platformId, list] of byPlatform) {
    const fresh: typeof list = [];
    for (const x of list) if (await claimWindow(`roster-fail:${x.contextId}:${x.code}`, 72 * HOUR, now)) fresh.push(x);
    if (!fresh.length) continue;
    const p = await LmsPlatform.findOne({ id: platformId }).lean();
    if (!p) continue;
    const s = await forSchool(p.institutionId);
    if (!s) continue;
    const first = fresh[0];
    const course = await LmsContext.findOne({ id: first.contextId }).select('title').lean();
    const text = rosterFailText(first.code);
    add(totals, await sendLmsEmail({
      template: 'lms-roster-sync-failed', key: `roster-digest:${platformId}:${day}`, lang: s.lang, institutionId: p.institutionId, platformId, recipients: s.admins,
      vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: s.school.name, LMS_NAME: platformName(p), FAILED_COURSES: num(new Set(fresh.map((x) => x.contextId)).size), COURSE_NAME: course?.title || (s.lang === 'ar' ? 'مقرر' : 'a course'), REASON: owned(text.reason[s.lang], s.lang), FIX: owned(text.fix[s.lang], s.lang), ACTION_URL: platformUrl(platformId, 'roster'), REFERENCE_CODE: `${first.id} · ${first.code}` }),
    }));
  }

  const skipped = await LmsAuditLog.find({ event: 'roster.removals_skipped', createdAt: { $gte: since } }).limit(1000).lean();
  for (const r of skipped) {
    const contextId = String(r.refIds?.contextId ?? '');
    const reason = REMOVALS_SKIPPED_REASON[r.code ?? ''];
    if (!contextId || !reason || !r.platformId) continue;
    if (!(await claimWindow(`removals-skipped:${contextId}:${r.code}`, 7 * DAY, now))) continue;
    const [p, course] = await Promise.all([LmsPlatform.findOne({ id: r.platformId }).lean(), LmsContext.findOne({ id: contextId }).select('title').lean()]);
    if (!p) continue;
    const s = await forSchool(p.institutionId);
    if (!s) continue;
    add(totals, await sendLmsEmail({
      template: 'lms-roster-removals-skipped', key: `removals-skipped:${contextId}:${r.code}:${day}`, lang: s.lang, institutionId: p.institutionId, platformId: p.id, recipients: s.admins,
      vars: (x) => ({ NAME: nameOf(x), COURSE_NAME: course?.title || (s.lang === 'ar' ? 'مقرر' : 'a course'), LMS_NAME: platformName(p), REASON: owned(reason[s.lang], s.lang), ACTION_URL: platformUrl(p.id, 'roster') }),
    }));
  }
}

// ------------------------------------------------------------ teacher digests (15, 16, 17, 14)

interface Item { contextId: string }

/**
 * Groups items by opted-in teacher (D2) and sends one email per teacher:
 * counts, the course (or "3 courses") and the class page. Never a student's
 * name or a per-student value (D3).
 */
async function perTeacher(items: Item[], send: (t: TeacherRecipient, mine: Item[], contexts: ILmsContext[], lang: 'en' | 'ar') => Promise<LmsEmailResult | null>, totals: Totals) {
  if (!items.length) return;
  const contextIds = [...new Set(items.map((i) => i.contextId))];
  const teachers = await teacherRecipients(contextIds);
  if (!teachers.length) return;
  const contexts = await LmsContext.find({ id: { $in: contextIds } }).lean<ILmsContext[]>();
  const ctx = new Map<string, ILmsContext>(contexts.map((c) => [c.id, c]));
  for (const t of teachers) {
    const mine = items.filter((i) => t.contextIds.includes(i.contextId));
    if (!mine.length) continue;
    const theirs = [...new Set(mine.map((i) => i.contextId))].map((id) => ctx.get(id)).filter((c): c is ILmsContext => !!c);
    if (!theirs.length) continue;
    add(totals, await send(t, mine, theirs, await schoolLang(t.institutionId)));
  }
}

async function platformOf(contexts: ILmsContext[]): Promise<ILmsPlatform | null> {
  return LmsPlatform.findOne({ id: contexts[0].platformId }).lean();
}

/** 15: Moodle activities linked to ENARA that may have been deleted (lineitem_gone daily, stale weekly). */
export async function activityDigest(now: Date, totals: Totals, weekly: boolean) {
  const day = cairoDay(now);
  const items: (Item & { linkId: string; reason: string })[] = [];
  const gone = await LmsResourceLink.find({ lineItemGoneAt: { $gte: new Date(now.getTime() - DAY) }, enaraActivityId: { $exists: true } }).select('id contextId').limit(LIMIT).lean();
  for (const l of gone) items.push({ contextId: l.contextId, linkId: l.id, reason: 'lineitem_gone' });
  if (weekly) {
    const platforms = await LmsPlatform.find({ status: 'active' }).select('id').limit(200).lean();
    for (const p of platforms) {
      for (const f of await flaggedActivities(p.id, now, 200)) {
        if (f.reason !== 'stale') continue;
        const link = await LmsResourceLink.findOne({ id: f.resourceLinkId }).select('contextId').lean();
        if (link) items.push({ contextId: link.contextId, linkId: f.resourceLinkId, reason: 'stale' });
      }
    }
  }
  const fresh: typeof items = [];
  for (const i of items) if (await claimWindow(`may-be-deleted:${i.linkId}:${i.reason}`, Infinity, now)) fresh.push(i);
  await perTeacher(fresh, async (t, mine, contexts, lang) => {
    const p = await platformOf(contexts);
    if (!p) return null;
    return sendLmsEmail({
      template: 'lms-activity-may-be-deleted', key: `may-be-deleted:${t.enaraUserId}:${day}`, lang, institutionId: t.institutionId, platformId: p.id, recipients: [t],
      vars: (r) => ({ NAME: nameOf(r), ACTIVITY_COUNT: num(mine.length), COURSE_LABEL: courseLabel(contexts.map((c) => c.title), lang), LMS_NAME: platformName(p), ACTION_URL: classUrl(contexts[0].enaraClassId, 'may-be-deleted') }),
    });
  }, totals);
}

async function contextsOfLinks(linkIds: string[]): Promise<Map<string, string>> {
  const links = linkIds.length ? await LmsResourceLink.find({ id: { $in: linkIds } }).select('id contextId').lean() : [];
  return new Map(links.map((l) => [l.id, l.contextId]));
}

/** 16: grades changed in Moodle (newly flagged in the last 24 h). */
export async function gradeChangedDigest(now: Date, totals: Totals) {
  const day = cairoDay(now);
  const rows = await LmsAuditLog.find({ event: 'grade.lms_changed', createdAt: { $gte: new Date(now.getTime() - DAY) } }).select('refIds').limit(5000).lean();
  const linkOf = await contextsOfLinks([...new Set(rows.map((r) => String(r.refIds?.resourceLinkId ?? '')).filter(Boolean))]);
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const r of rows) {
    const contextId = linkOf.get(String(r.refIds?.resourceLinkId ?? ''));
    const cell = `${r.refIds?.resourceLinkId}:${r.refIds?.lmsUserId}`;
    if (contextId && !seen.has(cell)) { seen.add(cell); items.push({ contextId }); }
  }
  await perTeacher(items, async (t, mine, contexts, lang) => {
    const p = await platformOf(contexts);
    if (!p) return null;
    return sendLmsEmail({
      template: 'lms-grade-changed-in-lms', key: `lms-changed:${t.enaraUserId}:${day}`, lang, institutionId: t.institutionId, platformId: p.id, recipients: [t],
      vars: (r) => ({ NAME: nameOf(r), LMS_NAME: platformName(p), CHANGED_COUNT: num(mine.length), COURSE_LABEL: courseLabel(contexts.map((c) => c.title), lang), ACTION_URL: classUrl(contexts[0].enaraClassId, 'lms-differs') }),
    });
  }, totals);
}

/** 17: newer attempts waiting for review (G2), once per attempt. */
export async function newerAttemptDigest(now: Date, totals: Totals) {
  const day = cairoDay(now);
  const rows = await LmsAuditLog.find({ event: 'grade.kept_released', createdAt: { $gte: new Date(now.getTime() - DAY) } }).select('refIds').limit(5000).lean();
  const linkOf = await contextsOfLinks([...new Set(rows.map((r) => String(r.refIds?.resourceLinkId ?? '')).filter(Boolean))]);
  const items: Item[] = [];
  for (const r of rows) {
    const contextId = linkOf.get(String(r.refIds?.resourceLinkId ?? ''));
    const attemptId = String(r.refIds?.attemptId ?? '');
    if (contextId && attemptId && (await claimWindow(`newer-attempt:${attemptId}`, Infinity, now))) items.push({ contextId });
  }
  await perTeacher(items, async (t, mine, contexts, lang) => sendLmsEmail({
    template: 'lms-newer-attempt-waiting', key: `newer-attempt:${t.enaraUserId}:${day}`, lang, institutionId: t.institutionId, recipients: [t],
    vars: (r) => ({ NAME: nameOf(r), WAITING_COUNT: num(mine.length), COURSE_LABEL: courseLabel(contexts.map((c) => c.title), lang), ACTION_URL: classUrl(contexts[0].enaraClassId, 'newer-attempt') }),
  }), totals);
}

export const NOT_STARTED_MAX_WEEKS = 3;

/** 14 (Monday): students who have not opened ENARA yet, per teacher; a course at most 3 weeks in a row, then only if its count rises. */
export async function notStartedDigest(now: Date, totals: Totals) {
  if (!getConfig().lms.rosterSyncEnabled) return;
  const day = cairoDay(now);
  const counts = await LmsEnrollment.aggregate<{ _id: string; n: number }>([{ $match: { enaraRole: 'student', status: 'invited' } }, { $group: { _id: '$contextId', n: { $sum: 1 } } }, { $limit: 2000 }]);
  const items = counts.filter((c) => c.n > 0).map((c) => ({ contextId: c._id, n: c.n }));
  await perTeacher(items, async (t, mine, contexts, lang) => {
    const included: { contextId: string; n: number }[] = [];
    for (const i of mine as { contextId: string; n: number }[]) {
      const _id = `not-started:${t.enaraUserId}:${i.contextId}`;
      const st = await LmsEmailClaim.findById(_id).lean();
      if (String(st?.data?.day ?? '') === day) { included.push(i); continue; } // a second run today
      const consecutive = !!st && now.getTime() - st.at.getTime() <= 8 * DAY;
      const streak = consecutive ? Number(st?.data?.streak ?? 0) : 0;
      const lastN = Number(st?.data?.n ?? 0);
      if (streak >= NOT_STARTED_MAX_WEEKS && i.n <= lastN) {
        // Already in 3 emails in a row and not rising: keep watching, send nothing.
        await LmsEmailClaim.updateOne({ _id }, { $set: { at: now } });
        continue;
      }
      await LmsEmailClaim.updateOne({ _id }, { $set: { at: now, data: { n: i.n, streak: streak >= NOT_STARTED_MAX_WEEKS ? 1 : streak + 1, day } } }, { upsert: true });
      included.push(i);
    }
    if (!included.length) return null;
    const theirs = contexts.filter((c) => included.some((i) => i.contextId === c.id));
    return sendLmsEmail({
      template: 'lms-students-not-started', key: `not-started:${t.enaraUserId}:${day}`, lang, institutionId: t.institutionId, recipients: [t],
      vars: (r) => ({ NAME: nameOf(r), NOT_STARTED: num(included.reduce((a, i) => a + i.n, 0)), COURSE_LABEL: courseLabel(theirs.map((c) => c.title), lang), ACTION_URL: classUrl(theirs[0]?.enaraClassId, 'not-started') }),
    });
  }, totals);
}

// ------------------------------------------------------------ 11 (Monday)

export async function adoptionWeekly(now: Date, totals: Totals) {
  const week = new Date(now.getTime() - 7 * DAY);
  const twoWeeks = new Date(now.getTime() - 14 * DAY);
  const platforms = await LmsPlatform.find({ status: 'active' }).limit(200).lean();
  for (const p of platforms) {
    const [launches2w, changes2w] = await Promise.all([
      LmsAuditLog.countDocuments({ platformId: p.id, event: 'lti.launch', createdAt: { $gte: twoWeeks } }),
      LmsAuditLog.countDocuments({ platformId: p.id, event: { $in: ['grade.sent', 'roster.sync', 'activity.bound'] }, outcome: { $ne: 'fail' }, createdAt: { $gte: twoWeeks } }),
    ]);
    if (!launches2w && !changes2w) continue;
    const s = await forSchool(p.institutionId);
    if (!s) continue;
    const contexts = await LmsContext.find({ platformId: p.id, status: 'active' }).select('id').lean();
    const [notStarted, active, sent, failed] = await Promise.all([
      contexts.length ? LmsEnrollment.countDocuments({ contextId: { $in: contexts.map((c) => c.id) }, enaraRole: 'student', status: 'invited' }) : 0,
      LmsUser.countDocuments({ platformId: p.id, lastLaunchAt: { $gte: week } }),
      LmsAuditLog.countDocuments({ platformId: p.id, event: 'grade.sent', createdAt: { $gte: week } }),
      LmsAuditLog.countDocuments({ platformId: p.id, event: 'grade.failed', 'refIds.dead': true, createdAt: { $gte: week } }),
    ]);
    const weekOf = formatDay(week, s.lang, s.school.timeZone);
    add(totals, await sendLmsEmail({
      template: 'lms-adoption-weekly', key: `adoption:${p.id}:${cairoDay(now)}`, lang: s.lang, institutionId: p.institutionId, platformId: p.id, recipients: s.admins,
      vars: (r) => ({ NAME: nameOf(r), SCHOOL_NAME: s.school.name, LMS_NAME: platformName(p), WEEK_OF: weekOf, COURSES_CONNECTED: num(contexts.length), NOT_STARTED: num(notStarted), ACTIVE: num(active), GRADES_SENT: num(sent), GRADES_FAILED: num(failed), ACTION_URL: platformUrl(p.id) }),
    }));
  }
}

// ------------------------------------------------------------ ops: 19 reminders, E4, E5

export async function approvalReminders(now: Date, totals: Totals) {
  const before = new Date(now.getTime() - DAY);
  const platforms = await LmsPlatform.find({ status: 'pending', createdAt: { $lte: before } }).limit(100).lean();
  for (const p of platforms) add(totals, await notifyOpsApprovalNeeded(p, { kind: 'connection', id: p.id, since: p.createdAt }, cairoDay(now)));
  const deployments = await LmsDeployment.find({ status: 'pending', createdAt: { $lte: before } }).limit(100).lean();
  for (const d of deployments) {
    const p = await LmsPlatform.findOne({ id: d.platformId, status: { $ne: 'pending' } }).lean();
    if (p) add(totals, await notifyOpsApprovalNeeded(p, { kind: 'deployment', id: d.id, externalId: d.deploymentId, since: d.createdAt }, cairoDay(now)));
  }
}

export async function keyRotationDue(now: Date, totals: Totals) {
  const keys = await LmsToolKey.find({ status: { $in: ['active', 'next'] } }).select('kid status createdAt activatedAt').lean();
  const active = keys.find((k) => k.status === 'active');
  const next = keys.find((k) => k.status === 'next');
  let state: string | null = null;
  let stateKey = '';
  if (!active) {
    // No key yet at all is normal before the first launch: only a site with LMS traffic is reported.
    if (!(await LmsPlatform.exists({ status: 'active' }))) return;
    state = 'There is no active Enara signing key, so Moodle cannot check Enara\'s grade and roster calls.';
    stateKey = 'no-active';
  } else if (next && now.getTime() - next.createdAt.getTime() > DAY) {
    state = `The next signing key (kid ${next.kid}) was created more than 24 hours ago and has not been promoted yet.`;
    stateKey = `next:${next.kid}`;
  }
  if (!state) return;
  const fmt = (d?: Date) => (d ? formatDay(d, 'en') : 'none');
  add(totals, await sendLmsEmail({
    template: 'lms-ops-key-rotation-due', key: `key-rotation:${stateKey}:${cairoDay(now)}`, lang: 'en', recipients: opsRecipients(),
    vars: () => ({ KEY_STATE: state!, ACTIVE_SINCE: fmt(active?.activatedAt ?? active?.createdAt), NEXT_SINCE: fmt(next?.createdAt), ACTION_URL: opsUrl() }),
  }));
}

export async function opsDailyDigest(now: Date, totals: Totals) {
  const since = new Date(now.getTime() - DAY);
  const day = cairoDay(now);
  const before = new Date(now.getTime() - DAY);
  const [pendingP, pendingD, billing, dead, roster, keys, off, unknown, platforms, held, capUsed] = await Promise.all([
    LmsPlatform.countDocuments({ status: 'pending', createdAt: { $lte: before } }),
    LmsDeployment.countDocuments({ status: 'pending', createdAt: { $lte: before } }),
    LmsOrgSettings.countDocuments({ billingFlaggedAt: { $exists: true } }),
    LmsAuditLog.countDocuments({ event: 'grade.failed', 'refIds.dead': true, code: { $ne: LMS_VALUE_DIFFERS }, createdAt: { $gte: since } }),
    LmsAuditLog.countDocuments({ event: 'roster.sync', outcome: 'fail', createdAt: { $gte: since } }),
    LmsAuditLog.countDocuments({ outcome: 'fail', code: { $in: KEY_PROBLEM_CODES }, createdAt: { $gte: since } }),
    LmsAuditLog.countDocuments({ event: 'platform.disabled', createdAt: { $gte: since } }),
    LmsAuditLog.countDocuments({ event: { $in: ['lti.login', 'lti.launch'] }, code: 'unknown_platform', createdAt: { $gte: since } }),
    LmsPlatform.find({ launchCount: { $gte: 10 } }).select('institutionId launchCount cookielessLaunchCount').lean(),
    heldToday(day),
    capCount(day),
  ]);
  let cookieless = 'none';
  const top = platforms.map((p) => ({ p, share: (p.cookielessLaunchCount ?? 0) / p.launchCount })).filter((x) => x.share > 0).sort((a, b) => b.share - a.share)[0];
  if (top) cookieless = `${(await schoolOf(top.p.institutionId))?.name ?? top.p.institutionId}: ${Math.round(top.share * 100)}%`;
  const redirect = !!getConfig().email.testRecipient;
  const cap = getConfig().lms.testDailyCap;
  const capNote = !redirect || !cap ? 'none'
    : held.total ? `cap hit: ${held.total} held back (${held.byTemplate.map((h) => `${h.template} ${h.n}`).join(', ')})`
    : `${capUsed} of ${cap} used, nothing held back`;
  const rows = { PENDING_OVER_24H: pendingP + pendingD, BILLING_FLAGS: billing, DEAD_JOBS: dead, ROSTER_FAILED: roster, KEY_PROBLEMS: keys, SWITCHED_OFF: off, UNKNOWN_LMS_LAUNCHES: unknown };
  if (!Object.values(rows).some((n) => n > 0) && cookieless === 'none' && !held.total) return { sent: false };
  add(totals, await sendLmsEmail({
    template: 'lms-ops-daily-digest', key: `ops-digest:${day}`, lang: 'en', recipients: opsRecipients(), alwaysSend: true,
    vars: () => ({ DATE: formatDay(now, 'en'), ...Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, num(v)])), COOKIELESS_TOP: cookieless, CAP_NOTE: capNote, ACTION_URL: opsUrl() }),
  }));
  return { sent: true };
}

// ------------------------------------------------------------ the run

export async function runLmsEmailDaily(opts: { now?: Date; budgetMs?: number } = {}): Promise<LmsEmailDailyResult> {
  if (!lmsEmailsActive()) return { skipped: 'lms_emails_off', ran: [], emails: {} };
  const now = opts.now ?? new Date();
  const deadline = Date.now() + (opts.budgetMs ?? 30_000);
  const monday = isCairoMonday(now);
  const totals: Totals = {};
  const ran: string[] = [];
  let stoppedEarly = false;
  const steps: [string, () => Promise<unknown>][] = [
    ['invites', () => inviteReminders(now, totals)],
    ['gradeSync', () => gradeSyncDigest(now, totals)],
    ['roster', () => rosterDigests(now, totals)],
    ['activities', () => activityDigest(now, totals, monday)],
    ['gradeChanged', () => gradeChangedDigest(now, totals)],
    ['newerAttempts', () => newerAttemptDigest(now, totals)],
    ['approvals', () => approvalReminders(now, totals)],
    ['keyRotation', () => keyRotationDue(now, totals)],
    ...(monday ? ([['adoption', () => adoptionWeekly(now, totals)], ['notStarted', () => notStartedDigest(now, totals)]] as [string, () => Promise<unknown>][]) : []),
  ];
  for (const [name, step] of steps) {
    if (Date.now() > deadline) { stoppedEarly = true; break; }
    try {
      await step();
      ran.push(name);
    } catch (error) {
      logger.error('lms_email_daily_step_failed', { step: name, error: serializeError(error) });
    }
  }
  // The ops digest always runs (it reports what was held back today).
  try {
    await opsDailyDigest(now, totals);
    ran.push('opsDigest');
  } catch (error) {
    logger.error('lms_email_daily_step_failed', { step: 'opsDigest', error: serializeError(error) });
  }
  return { ran, emails: totals, ...(stoppedEarly ? { stoppedEarly } : {}) };
}
