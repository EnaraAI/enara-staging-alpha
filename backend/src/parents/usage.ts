import mongoose from 'mongoose';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { ParentUsageDaily, ParentUsageEvent, type UsageKind } from '../models/ParentUsage';
import { logger, serializeError } from '../utils/logging';
import { parentSettingsEnabled } from './flags';
import { addDays, cairoDay } from './time';

// Parents P1: usage events (IDs and dates only, 13 months, D10) and their
// nightly rollup. Writing never blocks or fails a parent request.
export const SCREENS = ['home', 'progress', 'activity', 'controls', 'report', 'account'] as const;
export const FEATURES = ['share_report', 'controls_changed', 'link_child', 'guardian_role', 'learner_signals'] as const;
export type Screen = (typeof SCREENS)[number];
export type Feature = (typeof FEATURES)[number];

export interface UsageInput {
  parentUserId: string;
  institutionId?: string;
  studentId?: string;
  kind: UsageKind;
  name: string;
}

export async function recordUsage(e: UsageInput, now = new Date(), retry = true): Promise<void> {
  if (!parentSettingsEnabled() || !e.institutionId || mongoose.connection.readyState !== 1) return;
  const day = cairoDay(now);
  const key = [day, e.parentUserId, e.institutionId, e.studentId ?? '', e.kind, e.name].join('|');
  try {
    await ParentUsageEvent.updateOne(
      { key },
      { $inc: { count: 1 }, $set: { lastAt: now }, $setOnInsert: { key, parentUserId: e.parentUserId, institutionId: e.institutionId, ...(e.studentId ? { studentId: e.studentId } : {}), kind: e.kind, name: e.name.slice(0, 40), day, at: now } },
      { upsert: true },
    );
  } catch (error) {
    if (retry && (error as { code?: number }).code === 11000) return recordUsage(e, now, false); // a parallel first write: count it on the row now there
    logger.warn('parent_usage_write_failed', { kind: e.kind, error: serializeError(error) });
  }
}

/** A parent signed in ('login') or a remembered device resumed ('device'): one login event per school of their active links. */
export async function recordParentLogin(parentUserId: string, now = new Date(), name: 'login' | 'device' = 'login'): Promise<void> {
  if (!parentSettingsEnabled() || mongoose.connection.readyState !== 1) return;
  try {
    const schools = await ParentLearnerLink.distinct('institutionId', { parentUserId, status: 'active' });
    for (const institutionId of schools) await recordUsage({ parentUserId, institutionId: String(institutionId), kind: 'login', name }, now);
  } catch (error) {
    logger.warn('parent_usage_login_failed', { error: serializeError(error) });
  }
}

export interface SchoolUsage {
  institutionId: string;
  linkedParents: number;
  active7: number;
  active30: number;
  logins30: number;
  topScreens: { screen: string; views: number }[];
}

/** Live numbers per school: parents linked now, distinct parents active in the last 7 and 30 days, most-used screens (30 days). */
export async function schoolUsage(institutionIds: string[], now = new Date()): Promise<Map<string, SchoolUsage>> {
  const out = new Map<string, SchoolUsage>();
  for (const id of institutionIds) out.set(id, { institutionId: id, linkedParents: 0, active7: 0, active30: 0, logins30: 0, topScreens: [] });
  if (!institutionIds.length) return out;
  const today = cairoDay(now);
  const from30 = addDays(today, -29);
  const from7 = addDays(today, -6);
  const linked = await ParentLearnerLink.aggregate<{ _id: string; n: number }>([
    { $match: { institutionId: { $in: institutionIds }, status: 'active' } },
    { $group: { _id: { s: '$institutionId', p: '$parentUserId' } } },
    { $group: { _id: '$_id.s', n: { $sum: 1 } } },
  ]);
  for (const r of linked) out.get(r._id)!.linkedParents = r.n;
  const active = await ParentUsageEvent.aggregate<{ _id: string; p7: string[]; p30: string[]; logins: number }>([
    { $match: { institutionId: { $in: institutionIds }, day: { $gte: from30, $lte: today } } },
    { $group: {
      _id: '$institutionId',
      p30: { $addToSet: '$parentUserId' },
      p7: { $addToSet: { $cond: [{ $gte: ['$day', from7] }, '$parentUserId', null] } },
      logins: { $sum: { $cond: [{ $eq: ['$kind', 'login'] }, '$count', 0] } },
    } },
  ]);
  for (const r of active) {
    const u = out.get(r._id)!;
    u.active30 = r.p30.length;
    u.active7 = r.p7.filter(Boolean).length;
    u.logins30 = r.logins;
  }
  const screens = await ParentUsageEvent.aggregate<{ _id: { s: string; n: string }; v: number }>([
    { $match: { institutionId: { $in: institutionIds }, day: { $gte: from30, $lte: today }, kind: 'screen' } },
    { $group: { _id: { s: '$institutionId', n: '$name' }, v: { $sum: '$count' } } },
    { $sort: { v: -1, '_id.n': 1 } },
  ]);
  for (const r of screens) {
    const u = out.get(r._id.s)!;
    if (u.topScreens.length < 5) u.topScreens.push({ screen: r._id.n, views: r.v });
  }
  return out;
}

/** Rolls one Cairo day up into parent_usage_daily (one row per school). Idempotent: re-running replaces the day's rows. */
export async function rollupDay(day: string, now = new Date()): Promise<{ day: string; schools: number }> {
  const rows = await ParentUsageEvent.aggregate<{ _id: string; parents: string[]; logins: number; items: { kind: string; name: string; count: number }[] }>([
    { $match: { day } },
    { $group: { _id: '$institutionId', parents: { $addToSet: '$parentUserId' }, logins: { $sum: { $cond: [{ $eq: ['$kind', 'login'] }, '$count', 0] } }, items: { $push: { kind: '$kind', name: '$name', count: '$count' } } } },
  ]);
  const linked = await ParentLearnerLink.aggregate<{ _id: string; n: number }>([
    { $match: { status: 'active', institutionId: { $exists: true } } },
    { $group: { _id: { s: '$institutionId', p: '$parentUserId' } } },
    { $group: { _id: '$_id.s', n: { $sum: 1 } } },
  ]);
  const linkedOf = new Map(linked.map((r) => [r._id, r.n]));
  const schools = new Set([...rows.map((r) => r._id), ...linkedOf.keys()]);
  for (const institutionId of schools) {
    const r = rows.find((x) => x._id === institutionId);
    const screens: Record<string, number> = {};
    const features: Record<string, number> = {};
    for (const it of r?.items ?? []) {
      if (it.kind === 'screen') screens[it.name] = (screens[it.name] ?? 0) + it.count;
      if (it.kind === 'feature') features[it.name] = (features[it.name] ?? 0) + it.count;
    }
    await ParentUsageDaily.updateOne(
      { institutionId, day },
      { $set: { activeParents: r?.parents.length ?? 0, logins: r?.logins ?? 0, linkedParents: linkedOf.get(institutionId) ?? 0, screens, features, at: now } },
      { upsert: true },
    );
  }
  return { day, schools: schools.size };
}

/** The daily job: yesterday (complete) and today so far, Cairo days. */
export async function runParentUsageRollup(now = new Date()): Promise<{ skipped?: string; days?: { day: string; schools: number }[] }> {
  if (!parentSettingsEnabled()) return { skipped: 'parent_settings_off' };
  const today = cairoDay(now);
  return { days: [await rollupDay(addDays(today, -1), now), await rollupDay(today, now)] };
}

/** A parent account is deleted (or merged away, P2): its usage events go too. */
export async function deleteParentUsage(parentUserId: string): Promise<number> {
  return (await ParentUsageEvent.deleteMany({ parentUserId })).deletedCount ?? 0;
}
