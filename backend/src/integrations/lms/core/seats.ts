import { emailLayout, sendEmail } from '../../../services/emailService';
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

/** Distinct live students in the school (demo-seed students are not seats). */
export async function countSeats(institutionId: string): Promise<number> {
  return Student.countDocuments({ institutionId, origin: { $ne: 'demo_seed' } });
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
  lmsStudents: number;
  seatLimit: number | null;
  hardCap: boolean;
  overLimit: boolean;
  billingFlaggedAt: Date | null;
  lastAlertAt: Date | null;
}

export async function seatView(institutionId: string): Promise<SeatView> {
  const [settings, used, lmsStudents] = await Promise.all([
    LmsOrgSettings.findOne({ institutionId }).lean<ILmsOrgSettings | null>(),
    countSeats(institutionId),
    LmsUser.distinct('enaraUserId', { institutionId, enaraUserId: { $exists: true } }).then(async (ids) =>
      ids.length ? User.countDocuments({ _id: { $in: ids }, role: 'student' }) : 0,
    ),
  ]);
  const limit = settings?.seatLimit ?? null;
  return {
    institutionId,
    seatsUsed: used,
    lmsStudents,
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
