import { emailLayout, sendEmail } from '../../../services/emailService';
import { ClassEnrollment } from '../../../models/ClassEnrollment';
import { CourseInstance } from '../../../models/CourseInstance';
import { Student } from '../../../models/Student';
import { User } from '../../../models/User';
import { logger, serializeError } from '../../../utils/logging';
import { LmsOrgSettings, LmsUser, type ILmsOrgSettings } from '../models';
import { writeLmsAudit } from './audit';

// Seats (plan §6, owner decision Q1): one seat = one distinct student in the
// school, however many classes or LMS courses they are in. Checked only when
// a launch would create a NEW student. Over the limit: allow the launch, alert
// the school's admins (at most once a day) and flag the school for billing.
// With hardCap on (per school, default off) the new student is refused.
// Hard-cap note: two first launches at the very same moment can both pass the
// last free seat; the overrun is at most the number of simultaneous launches.
const ALERT_EVERY_MS = 24 * 60 * 60 * 1000;

const LIVE = { origin: { $ne: 'demo_seed' }, archivedAt: null } as const;

/**
 * LMS students who left: every LMS membership they had is inactive (dropped
 * from the LMS roster, Phase 4) and nothing else keeps them in the school (no
 * active group or class enrollment, no group, no class list). They keep their
 * account and history but no longer take a seat; a re-add brings them back.
 */
export async function droppedLmsStudentIds(institutionId: string): Promise<string[]> {
  const ended = await ClassEnrollment.distinct('studentId', { institutionId, source: 'lms', status: 'inactive' });
  if (!ended.length) return [];
  const [stillActive, listed] = await Promise.all([
    ClassEnrollment.distinct('studentId', { institutionId, studentId: { $in: ended }, status: 'active' }),
    CourseInstance.distinct('studentIds', { institutionId, studentIds: { $in: ended } }),
  ]);
  const keep = new Set<string>([...stillActive, ...listed].map(String));
  const candidates = ended.map(String).filter((id) => !keep.has(id));
  if (!candidates.length) return [];
  const rows = await Student.find({ id: { $in: candidates }, institutionId, ...LIVE, $or: [{ batchId: { $exists: false } }, { batchId: null }, { batchId: '' }] })
    .select('id')
    .lean();
  return rows.map((r) => r.id);
}

/**
 * Phase 4 (owner decision): students a roster sync created who have never
 * opened ENARA ("invited / not started"). Their account exists only through
 * the LMS link and has never been launched (lms_users.lastLaunchAt unset on
 * every link). They take no seat until their first launch.
 */
export async function notStartedLmsStudentIds(institutionId: string): Promise<string[]> {
  const pending = (await LmsUser.distinct('enaraUserId', { institutionId, enaraUserId: { $exists: true }, lastLaunchAt: { $exists: false } })).map(String);
  if (!pending.length) return [];
  const launched = new Set((await LmsUser.distinct('enaraUserId', { enaraUserId: { $in: pending }, lastLaunchAt: { $exists: true } })).map(String));
  const userIds = pending.filter((id) => !launched.has(id) && /^[a-f0-9]{24}$/i.test(id));
  if (!userIds.length) return [];
  const studentIds = (await User.distinct('studentId', { _id: { $in: userIds }, role: 'student', institutionId })).filter(Boolean).map(String);
  if (!studentIds.length) return [];
  return (await Student.distinct('id', { id: { $in: studentIds }, institutionId, ...LIVE })).map(String);
}

/** Whether this ENARA account is a synced student who has never launched (no seat yet). */
export async function isNotStartedLmsAccount(enaraUserId: string, institutionId: string): Promise<boolean> {
  const user = await User.findById(enaraUserId).select('role studentId institutionId').lean().catch(() => null);
  if (!user || user.role !== 'student' || !user.studentId || user.institutionId !== institutionId) return false;
  return !(await LmsUser.exists({ enaraUserId, lastLaunchAt: { $exists: true } }));
}

async function seatParts(institutionId: string) {
  const [all, dropped, notStarted] = await Promise.all([
    Student.countDocuments({ institutionId, ...LIVE }),
    droppedLmsStudentIds(institutionId),
    notStartedLmsStudentIds(institutionId),
  ]);
  const notCounted = new Set([...dropped, ...notStarted]);
  const droppedSet = new Set(dropped);
  return { seats: Math.max(0, all - notCounted.size), notStarted: notStarted.filter((id) => !droppedSet.has(id)).length, dropped: dropped.length, notCounted };
}

/**
 * Seats: distinct live students in the school, one per person however many
 * classes or LMS courses they are in. Not seats: demo-seed students, archived
 * students, LMS students whose every LMS membership ended, and synced students
 * who have not started yet (Phase 4).
 */
export async function countSeats(institutionId: string): Promise<number> {
  return (await seatParts(institutionId)).seats;
}

export interface SeatDecision {
  allowed: boolean;
  overLimit: boolean;
  seatsUsed?: number;
  seatLimit?: number;
}

/** Before creating a new student for an LMS launch. */
export async function checkSeatForNewStudent(institutionId: string, actor?: string): Promise<SeatDecision> {
  const settings = await LmsOrgSettings.findOne({ institutionId }).lean();
  if (settings?.seatLimit === undefined || settings.seatLimit === null) return { allowed: true, overLimit: false };
  const used = await countSeats(institutionId);
  const projected = used + 1;
  const limit = settings.seatLimit;
  if (projected <= limit) {
    await LmsOrgSettings.updateOne({ institutionId }, { $set: { seatsUsed: projected } });
    return { allowed: true, overLimit: false, seatsUsed: projected, seatLimit: limit };
  }
  if (settings.hardCap) {
    await writeLmsAudit({ event: 'seats.hard_cap', outcome: 'fail', institutionId, actor, refIds: { seatsUsed: used, seatLimit: limit }, code: 'seat_limit_reached' });
    return { allowed: false, overLimit: true, seatsUsed: used, seatLimit: limit };
  }
  await markOverLimit(institutionId, projected, limit, actor);
  return { allowed: true, overLimit: true, seatsUsed: projected, seatLimit: limit };
}

async function markOverLimit(institutionId: string, seatsUsed: number, seatLimit: number, actor?: string): Promise<void> {
  const now = new Date();
  await LmsOrgSettings.updateOne({ institutionId }, { $set: { overLimit: true, seatsUsed } });
  // Billing flag: set once, kept until an ENARA admin clears it.
  await LmsOrgSettings.updateOne({ institutionId, billingFlaggedAt: { $exists: false } }, { $set: { billingFlaggedAt: now } });
  // One alert a day at most, across all instances (atomic claim of the slot).
  const claimed = await LmsOrgSettings.findOneAndUpdate(
    { institutionId, $or: [{ lastAlertAt: { $exists: false } }, { lastAlertAt: { $lte: new Date(now.getTime() - ALERT_EVERY_MS) } }] },
    { $set: { lastAlertAt: now } },
    { new: true },
  ).lean();
  await writeLmsAudit({ event: 'seats.over_limit', outcome: 'warn', institutionId, actor, refIds: { seatsUsed, seatLimit, alerted: !!claimed }, code: 'over_seat_limit' });
  if (claimed) void alertSchoolAdmins(institutionId, seatsUsed, seatLimit);
}

async function alertSchoolAdmins(institutionId: string, seatsUsed: number, seatLimit: number): Promise<void> {
  try {
    const admins = await User.find({ institutionId, role: 'admin', status: 'active' }).select('email').limit(20).lean();
    const html = emailLayout('Your school is over its ENARA seat limit', [
      `Your school now has ${seatsUsed} students on ENARA. Your plan includes ${seatLimit} seats.`,
      'New students arriving from your LMS can still sign in. Your ENARA contact will be in touch about your plan.',
      'You can see the current count on the LMS connections page.',
    ]);
    for (const a of admins) await sendEmail({ to: a.email, subject: 'ENARA seat limit reached', html });
  } catch (error) {
    logger.warn('lms_seat_alert_failed', { institutionId, error: serializeError(error) });
  }
}

export interface SeatView {
  institutionId: string;
  seatsUsed: number;
  /** LMS students who take a seat (launched, not dropped). */
  lmsStudents: number;
  /** Phase 4: synced students who have not started yet; shown, not counted. */
  notStarted: number;
  seatLimit: number | null;
  hardCap: boolean;
  overLimit: boolean;
  billingFlaggedAt: Date | null;
  lastAlertAt: Date | null;
}

export async function seatView(institutionId: string): Promise<SeatView> {
  const [settings, parts, linked] = await Promise.all([
    LmsOrgSettings.findOne({ institutionId }).lean<ILmsOrgSettings | null>(),
    seatParts(institutionId),
    LmsUser.distinct('enaraUserId', { institutionId, enaraUserId: { $exists: true } }),
  ]);
  const used = parts.seats;
  let lmsStudents = 0;
  const userIds = linked.map(String).filter((id) => /^[a-f0-9]{24}$/i.test(id));
  if (userIds.length) {
    const studentIds = (await User.distinct('studentId', { _id: { $in: userIds }, role: 'student' })).filter(Boolean).map(String);
    const live = studentIds.length ? await Student.distinct('id', { id: { $in: studentIds }, institutionId, ...LIVE }) : [];
    lmsStudents = live.filter((id) => !parts.notCounted.has(String(id))).length;
  }
  const limit = settings?.seatLimit ?? null;
  return {
    institutionId,
    seatsUsed: used,
    lmsStudents,
    notStarted: parts.notStarted,
    seatLimit: limit,
    hardCap: settings?.hardCap ?? false,
    overLimit: limit !== null && used > limit,
    billingFlaggedAt: settings?.billingFlaggedAt ?? null,
    lastAlertAt: settings?.lastAlertAt ?? null,
  };
}

/** ENARA admin only: set or clear the limit and hard cap; optionally clear the billing flag. */
export async function updateSeatSettings(
  institutionId: string,
  input: { seatLimit?: number | null; hardCap?: boolean; clearBillingFlag?: boolean },
  by: string,
): Promise<SeatView> {
  const set: Record<string, unknown> = { updatedBy: by };
  const unset: Record<string, 1> = {};
  if (input.seatLimit === null) unset.seatLimit = 1;
  else if (input.seatLimit !== undefined) set.seatLimit = input.seatLimit;
  if (input.hardCap !== undefined) set.hardCap = input.hardCap;
  if (input.clearBillingFlag) {
    unset.billingFlaggedAt = 1;
    set.overLimit = false;
  }
  await LmsOrgSettings.updateOne({ institutionId }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { upsert: true });
  await writeLmsAudit({ event: 'seats.settings', outcome: 'ok', institutionId, actor: by, refIds: { seatLimit: input.seatLimit === null ? 'cleared' : input.seatLimit ?? 'unchanged', hardCap: input.hardCap ?? 'unchanged', clearBillingFlag: !!input.clearBillingFlag } as Record<string, unknown> });
  return seatView(institutionId);
}
