import { getConfig } from '../../../config/env';
import { isInstitutionSuspended } from '../../../middleware/auth.middleware';
import { ClassEnrollment } from '../../../models/ClassEnrollment';
import { CourseInstance } from '../../../models/CourseInstance';
import { Student } from '../../../models/Student';
import { User } from '../../../models/User';
import { endEnrollment, enroll } from '../../../services/enrollment';
import { logger, serializeError } from '../../../utils/logging';
import { fetchMembers, nrpsAllowed, type NrpsMember } from '../adapters/lti13/nrps';
import { LmsContext, LmsEnrollment, LmsPlatform, LmsResourceLink, LmsUser, type ILmsContext, type ILmsEnrollment, type ILmsPlatform, type ILmsRosterSyncState, type ILmsUser } from '../models';
import { getPreset } from '../presets';
import { writeLmsAudit } from './audit';
import { createEnaraAccount, type PreviewResult, type ProvisionInput, type ProvisionRole } from './domainService';
import { runInBackground } from './drain';
import { lmsFlags } from './flags';
import { isTestUser, mapLtiRoles } from './roleMap';
import { afterRosterSync } from './rosterHooks';
import { endParentLinksForStudent, hasAnyActiveEnrollment } from '../../../parents/linkLifecycle';

// LMS Phase 4: roster sync through LTI NRPS (docs/lms/PHASE_4_NOTES.md).
//
// Reads the LMS course's members (adapters/lti13/nrps.ts, every page) and
// applies the difference to ENARA. People are matched by LMS user id
// (platform + NRPS user_id = the launch's sub), never by email.
//   - New learner: an ENARA student account (the reserved, never-emailed
//     address a launch would give), an active class enrollment (source 'lms',
//     lmsContextId) in the course's own ENARA class (and CourseInstance.studentIds,
//     as a launch does), and an lms_enrollments row 'invited' = "not started".
//     The first launch makes it 'active'. A not-started student takes NO seat:
//     the seat (and the hard cap) is taken at the first launch (owner decision).
//   - Learner gone from the LMS, or Inactive there: the LMS membership becomes
//     inactive (end date); the account, history and grades are kept; a re-add
//     reactivates it.
//   - Instructors: added to the class's instructors (a teacher account is made
//     as a launch would), and removed when gone from the LMS.
//   - Role conflicts are handled as a launch does: an account never changes
//     role. A student account listed as Instructor, or a staff account listed
//     as Learner, is left unchanged and audited.
// Ownership (owner decision): a sync changes only what this course of this
// LMS connection added: class enrollments with source 'lms' and this course's
// lmsContextId, and instructors the LMS added (lms_enrollments.addedInstructor).
// Manual or Google enrollments, other LMS connections and courses, and
// instructors assigned inside ENARA are never touched.
// Safety: when the list is incomplete (an error, or cut short by the bounds)
// nobody is removed; an empty list never removes anybody either.
// Bounded per run (time budget, new accounts per run); what is left is done
// next run. One sync per course at a time (lease on lms_contexts).
// Audit (lms_audit_log): IDs, counts and codes only.

export type RosterTrigger = 'launch' | 'nightly' | 'manual' | 'cron';

export interface RosterCounts {
  members: number;
  pages: number;
  added: number;
  reactivated: number;
  removed: number;
  unchanged: number;
  conflicts: number;
  ignored: number;
  deferred: number;
  instructorsAdded: number;
  instructorsRemoved: number;
}

export interface RosterSyncOutcome extends RosterCounts {
  contextId: string;
  status: 'ok' | 'partial' | 'failed' | 'skipped' | 'busy';
  code?: string;
  trigger: RosterTrigger;
  at: Date;
}

const SYSTEM_ACTOR = 'system:lms';
const STALE_MS = 24 * 3600_000;
const RETRY_AFTER_FAILURE_MS = 3600_000;
const LEASE_MS = 2 * 60_000;
const INSTRUCTOR_ROLE = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';
const DEFAULTS: Record<RosterTrigger, { budgetMs: number; maxNewAccounts: number }> = {
  launch: { budgetMs: 40_000, maxNewAccounts: 200 },
  nightly: { budgetMs: 40_000, maxNewAccounts: 200 },
  cron: { budgetMs: 40_000, maxNewAccounts: 200 },
  manual: { budgetMs: 25_000, maxNewAccounts: 150 },
};
let manualCooldownMs = 30_000;

export const rosterOn = (): boolean => lmsFlags().roster;

/** Nightly / cron triggers follow LMS_DRAIN_TRIGGERS ('daily', 'cron') like the grade drain. */
export function rosterTriggerOn(trigger: 'daily' | 'cron'): boolean {
  return rosterOn() && getConfig().lms.drainTriggers.includes(trigger);
}

const emptyCounts = (): RosterCounts => ({ members: 0, pages: 0, added: 0, reactivated: 0, removed: 0, unchanged: 0, conflicts: 0, ignored: 0, deferred: 0, instructorsAdded: 0, instructorsRemoved: 0 });
const isObjectId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);

type Account = { _id: unknown; role: string; status?: string; institutionId?: string; studentId?: string };
type MemberRole = ProvisionRole | 'ignore';

function roleOf(m: Pick<NrpsMember, 'roles'>, platform: ILmsPlatform): MemberRole {
  if (!m.roles.length || isTestUser(m.roles)) return 'ignore';
  const preset = getPreset(platform.vendor);
  const mapped = mapLtiRoles(m.roles, {
    allowAdminRole: platform.allowAdminRole,
    overrides: { ...(preset?.roleOverrides ?? {}), ...((platform.roleOverrides as Record<string, string> | undefined) ?? {}) },
  });
  return mapped.role === 'observer' ? 'ignore' : (mapped.role as ProvisionRole);
}

const person = (m: NrpsMember) => ({ email: m.email, givenName: m.givenName, familyName: m.familyName, name: m.name });

async function recordState(context: ILmsContext, state: ILmsRosterSyncState, opts: { synced: boolean; release: boolean }) {
  const prev = context.rosterSync ?? {};
  const merged: ILmsRosterSyncState = { ...state };
  if (!state.lastErrorCode && prev.lastErrorCode) {
    merged.lastErrorCode = prev.lastErrorCode;
    merged.lastErrorAt = prev.lastErrorAt;
  }
  await LmsContext.updateOne(
    { id: context.id },
    { $set: { rosterSync: merged, ...(opts.synced ? { lastRosterSyncAt: state.lastAttemptAt } : {}) }, ...(opts.release ? { $unset: { rosterSyncLeaseUntil: 1 } } : {}) },
  );
}

async function fail(context: ILmsContext, trigger: RosterTrigger, code: string, opts: { actor?: string; release: boolean; pages?: number }): Promise<RosterSyncOutcome> {
  const at = new Date();
  await recordState(context, { lastAttemptAt: at, trigger, outcome: 'failed', pages: opts.pages ?? 0, lastErrorCode: code, lastErrorAt: at }, { synced: false, release: opts.release });
  await writeLmsAudit({ event: 'roster.sync', outcome: 'fail', institutionId: context.institutionId, platformId: context.platformId, actor: opts.actor ?? SYSTEM_ACTOR, code, refIds: { contextId: context.id, trigger } });
  return { ...emptyCounts(), pages: opts.pages ?? 0, contextId: context.id, status: 'failed', code, trigger, at };
}

/** Upserts the LMS identity for a member (no launch time: they have not launched). The LMS name and email stay in lms_users only. */
async function ensureLmsUser(platform: ILmsPlatform, m: NrpsMember): Promise<ILmsUser> {
  const key = { platformId: platform.id, externalUserId: m.userId };
  const p = person(m);
  const set = {
    ...(p.email ? { email: p.email } : {}),
    ...(p.givenName ? { givenName: p.givenName } : {}),
    ...(p.familyName ? { familyName: p.familyName } : {}),
  };
  let row: ILmsUser;
  try {
    row = (await LmsUser.findOneAndUpdate(key, { ...(Object.keys(set).length ? { $set: set } : {}), $setOnInsert: { institutionId: platform.institutionId } }, { upsert: true, new: true }).lean())!;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    row = (await LmsUser.findOne(key).lean())!;
  }
  // A launch refused before an account existed (e.g. the hard cap) left a
  // launch time on an identity that never got in: it has not started.
  if (!row.enaraUserId && row.lastLaunchAt) {
    await LmsUser.updateOne({ id: row.id, enaraUserId: { $exists: false } }, { $unset: { lastLaunchAt: 1 } });
    row = { ...row, lastLaunchAt: undefined };
  }
  return row;
}

export interface SyncOptions {
  trigger: RosterTrigger;
  actor?: string;
  budgetMs?: number;
  maxNewAccounts?: number;
}

/** Syncs one LMS course's roster from the LMS (NRPS). Never throws for an LMS problem. */
export async function syncContextRoster(contextId: string, opts: SyncOptions): Promise<RosterSyncOutcome> {
  const trigger = opts.trigger;
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? DEFAULTS[trigger].budgetMs;
  const deadline = started + budgetMs;
  const maxNew = opts.maxNewAccounts ?? DEFAULTS[trigger].maxNewAccounts;
  const at = new Date(started);
  const skipped = (code: string): RosterSyncOutcome => ({ ...emptyCounts(), contextId, status: 'skipped', code, trigger, at });
  if (!rosterOn()) return skipped('roster_off');
  const context = await LmsContext.findOne({ id: contextId }).lean();
  if (!context) return skipped('not_found');
  const platform = await LmsPlatform.findOne({ id: context.platformId, institutionId: context.institutionId }).lean();
  if (!platform || platform.status !== 'active') return fail(context, trigger, 'platform_not_active', { actor: opts.actor, release: false });
  if (!context.nrpsUrl) return fail(context, trigger, 'no_memberships_url', { actor: opts.actor, release: false });
  if (!nrpsAllowed(platform)) return fail(context, trigger, 'nrps_not_allowed', { actor: opts.actor, release: false });
  if (!context.enaraClassId) return fail(context, trigger, 'no_class', { actor: opts.actor, release: false });
  if (await isInstitutionSuspended(context.institutionId)) return fail(context, trigger, 'institution_suspended', { actor: opts.actor, release: false });

  // One sync per course at a time, across instances.
  const now = new Date();
  const leased = await LmsContext.findOneAndUpdate(
    { id: context.id, $or: [{ rosterSyncLeaseUntil: { $exists: false } }, { rosterSyncLeaseUntil: null }, { rosterSyncLeaseUntil: { $lte: now } }] },
    { $set: { rosterSyncLeaseUntil: new Date(now.getTime() + LEASE_MS) } },
    { new: true },
  ).lean();
  if (!leased) return { ...emptyCounts(), contextId, status: 'busy', code: 'sync_in_progress', trigger, at };

  try {
    return await applyRoster(leased, platform, { ...opts, trigger, deadline, maxNew, at });
  } catch (error) {
    logger.error('lms_roster_sync_failed', { contextId, error: serializeError(error) });
    return fail(leased, trigger, 'internal_error', { actor: opts.actor, release: true });
  }
}

async function applyRoster(
  context: ILmsContext,
  platform: ILmsPlatform,
  o: SyncOptions & { trigger: RosterTrigger; deadline: number; maxNew: number; at: Date },
): Promise<RosterSyncOutcome> {
  const inst = context.institutionId;
  const fetchBudget = Math.max(3_000, Math.floor((o.deadline - Date.now()) * 0.6));
  const fetched = await fetchMembers(platform, context.nrpsUrl!, { budgetMs: fetchBudget });
  if (!fetched.ok) return fail(context, o.trigger, fetched.code, { actor: o.actor, release: true, pages: fetched.pages });

  const counts = emptyCounts();
  counts.members = fetched.members.length;
  counts.pages = fetched.pages;
  const cls = await CourseInstance.findOne({ id: context.enaraClassId, institutionId: inst }).select('id studentIds instructorIds').lean();
  if (!cls) return fail(context, o.trigger, 'no_class', { actor: o.actor, release: true, pages: fetched.pages });
  const studentIds = new Set((cls.studentIds ?? []).map(String));
  const instructorIds = new Set((cls.instructorIds ?? []).map(String));

  // Everything this course knows, in a few queries.
  const extIds = fetched.members.map((m) => m.userId);
  const rows = await LmsEnrollment.find({ contextId: context.id, institutionId: inst }).lean();
  const known = await LmsUser.find({ platformId: platform.id, $or: [{ externalUserId: { $in: extIds } }, { id: { $in: rows.map((r) => r.lmsUserId) } }] }).lean<ILmsUser[]>();
  const byExt = new Map(known.map((u) => [u.externalUserId, u]));
  const byId = new Map(known.map((u) => [u.id, u]));
  const rowByUser = new Map(rows.map((r) => [r.lmsUserId, r]));
  const userIds = known.map((u) => u.enaraUserId).filter(isObjectId);
  const accounts = new Map(
    (userIds.length ? await User.find({ _id: { $in: userIds } }).select('role status institutionId studentId').lean<Account[]>() : []).map((a) => [String(a._id), a]),
  );
  const classRows = new Map(
    (await ClassEnrollment.find({ scope: 'class', targetId: cls.id, institutionId: inst }).select('studentId status source lmsContextId').lean()).map((r) => [r.studentId, r]),
  );
  const audit = (event: string, outcome: 'ok' | 'warn' | 'fail', refIds: Record<string, unknown>, code?: string) =>
    writeLmsAudit({ event, outcome, institutionId: inst, platformId: platform.id, actor: o.actor ?? SYSTEM_ACTOR, code, refIds: { contextId: context.id, trigger: o.trigger, ...refIds } });

  // ---- removals: only from a complete, non-empty list.
  const active = new Map(fetched.members.filter((m) => m.status === 'Active').map((m) => [m.userId, m]));
  const liveRows = rows.filter((r) => r.status === 'active' || r.status === 'invited');
  let removalsSkipped: string | undefined;
  if (fetched.truncated) removalsSkipped = 'roster_truncated';
  else if (!active.size && liveRows.length) removalsSkipped = 'empty_roster';
  if (!removalsSkipped) {
    for (const row of liveRows) {
      const lu = byId.get(row.lmsUserId);
      if (!lu || active.has(lu.externalUserId)) continue;
      const listed = fetched.members.find((m) => m.userId === lu.externalUserId);
      await endMembership(row, lu, listed ? 'inactive_in_lms' : 'not_in_lms');
    }
  } else {
    await audit('roster.removals_skipped', 'warn', { members: fetched.members.length, known: liveRows.length }, removalsSkipped);
  }

  async function endMembership(row: ILmsEnrollment, lu: ILmsUser, reason: string) {
    const acc = lu.enaraUserId ? accounts.get(lu.enaraUserId) : undefined;
    let classEnded = false;
    let instructorRemoved = false;
    if (row.enaraRole === 'student' && acc?.studentId) {
      const cr = classRows.get(acc.studentId);
      // Only the membership this course of this LMS connection made.
      if (cr && cr.status === 'active' && cr.source === 'lms' && cr.lmsContextId === context.id) {
        classEnded = await endEnrollment({ studentId: acc.studentId, scope: 'class', targetId: cls!.id, status: 'inactive', endedBy: SYSTEM_ACTOR });
        await CourseInstance.updateOne({ id: cls!.id, institutionId: inst }, { $pull: { studentIds: acc.studentId } });
        studentIds.delete(acc.studentId);
      }
    } else if (row.enaraRole !== 'student' && row.addedInstructor && acc) {
      await CourseInstance.updateOne({ id: cls!.id, institutionId: inst }, { $pull: { instructorIds: String(acc._id) } });
      instructorIds.delete(String(acc._id));
      instructorRemoved = true;
    }
    await LmsEnrollment.updateOne({ id: row.id, status: { $in: ['active', 'invited'] } }, { $set: { status: 'inactive', endedAt: new Date(), ...(instructorRemoved ? { addedInstructor: false } : {}) } });
    if (row.enaraRole === 'student') counts.removed++;
    else if (instructorRemoved) counts.instructorsRemoved++;
    // P0 item 2: a student this sync left in no class at all (no active class
    // enrollment of any kind, no LMS course) loses parent access: links
    // 'ended' (lms_left_all_classes), unused codes revoked. Still in another
    // class: nothing changes.
    let parentLinksEnded = 0;
    if (row.enaraRole === 'student' && acc?.studentId && !(await hasAnyActiveEnrollment(acc.studentId, String(acc._id)))) {
      parentLinksEnded = (await endParentLinksForStudent(acc.studentId, 'lms_left_all_classes', { id: SYSTEM_ACTOR, role: 'system' }, { revokeCodes: true })).linksEnded;
    }
    await audit('roster.member_removed', 'ok', { lmsUserId: lu.id, enaraUserId: lu.enaraUserId, role: row.enaraRole, reason, classEnrollmentEnded: classEnded, instructorRemoved, ...(parentLinksEnded ? { parentLinksEnded } : {}) });
  }

  // ---- additions and updates: people with an account first (cheap), new people last (bounded).
  const members = [...active.values()].sort((a, b) => Number(!!byExt.get(b.userId)?.enaraUserId) - Number(!!byExt.get(a.userId)?.enaraUserId));
  let created = 0;
  for (const m of members) {
    if (Date.now() > o.deadline) {
      counts.deferred++;
      continue;
    }
    const role = roleOf(m, platform);
    if (role === 'ignore') {
      counts.ignored++;
      continue;
    }
    let lu = byExt.get(m.userId);
    let acc = lu?.enaraUserId ? accounts.get(lu.enaraUserId) : undefined;
    if (lu?.enaraUserId && !acc) {
      // The ENARA account was deleted: start again with a new one (as a launch does).
      await LmsUser.updateOne({ id: lu.id, enaraUserId: lu.enaraUserId }, { $unset: { enaraUserId: 1 } });
      lu = { ...lu, enaraUserId: undefined };
    }
    let createdAccount = false;
    if (acc) {
      let conflict: string | undefined;
      if (acc.institutionId !== inst) conflict = 'account_conflict';
      else if (acc.status !== 'active') conflict = 'account_disabled';
      else if (role === 'student' && acc.role !== 'student') conflict = 'staff_as_learner';
      else if (role !== 'student' && acc.role === 'student') conflict = 'student_as_instructor';
      else if (role !== 'student' && acc.role !== 'teacher' && acc.role !== 'admin') conflict = 'role_conflict';
      if (conflict) {
        counts.conflicts++;
        await audit('roster.member_conflict', 'warn', { lmsUserId: lu!.id, enaraUserId: lu!.enaraUserId, role, accountRole: acc.role }, conflict);
        continue;
      }
    } else {
      if (created >= o.maxNew) {
        counts.deferred++;
        continue;
      }
      lu = await ensureLmsUser(platform, m);
      if (lu.enaraUserId) {
        // Linked meanwhile (a launch raced us): leave it to the next run.
        counts.deferred++;
        continue;
      }
      try {
        const made = await createEnaraAccount({ role, institutionId: inst, person: person(m) }, lu, { noSeatYet: true });
        acc = { _id: made.userId, role: role === 'student' ? 'student' : role, status: 'active', institutionId: inst, studentId: made.studentId };
        lu = { ...lu, enaraUserId: made.userId };
        accounts.set(made.userId, acc);
        createdAccount = made.created;
        created++;
      } catch (error) {
        counts.conflicts++;
        await audit('roster.member_conflict', 'warn', { lmsUserId: lu.id, role }, (error as { code?: string }).code === 'account_conflict' ? 'account_conflict' : 'account_error');
        continue;
      }
    }
    const userId = String(acc!._id);
    const row = rowByUser.get(lu!.id);
    const launched = !!row && (!!row.firstLaunchAt || row.source === 'launch');
    const ltiRoles = m.roles.slice(0, 30);
    let addedInstructor = false;
    if (role === 'student' && acc!.studentId) {
      const cr = classRows.get(acc!.studentId);
      if (!cr || cr.status !== 'active') {
        await enroll({ institutionId: inst, studentId: acc!.studentId, scope: 'class', targetId: cls.id, source: 'lms', lmsContextId: context.id, createdBy: SYSTEM_ACTOR });
        classRows.set(acc!.studentId, { studentId: acc!.studentId, status: 'active', source: cr?.source ?? 'lms', lmsContextId: cr ? cr.lmsContextId : context.id } as never);
      }
      if (!studentIds.has(acc!.studentId)) {
        await CourseInstance.updateOne({ id: cls.id, institutionId: inst }, { $addToSet: { studentIds: acc!.studentId } });
        studentIds.add(acc!.studentId);
      }
    } else if (role !== 'student' && acc!.role === 'teacher' && !instructorIds.has(userId)) {
      // As a launch does: teachers join the class's instructors (admin accounts already see every class).
      const r = await CourseInstance.updateOne({ id: cls.id, institutionId: inst }, { $addToSet: { instructorIds: userId } });
      addedInstructor = r.modifiedCount === 1;
      instructorIds.add(userId);
    }
    const seen = new Date();
    if (!row) {
      try {
        await LmsEnrollment.create({
          contextId: context.id, lmsUserId: lu!.id, institutionId: inst, ltiRoles, enaraRole: role, status: 'invited', source: 'nrps', lastSeenAt: seen,
          ...(addedInstructor ? { addedInstructor: true } : {}),
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        await LmsEnrollment.updateOne({ contextId: context.id, lmsUserId: lu!.id }, { $set: { lastSeenAt: seen, ...(addedInstructor ? { addedInstructor: true } : {}) } });
      }
      if (role === 'student') counts.added++;
      else if (addedInstructor) counts.instructorsAdded++;
      else counts.unchanged++;
      await audit('roster.member_added', 'ok', { lmsUserId: lu!.id, enaraUserId: userId, role, createdAccount, addedInstructor });
    } else if (row.status === 'inactive' || row.status === 'deleted') {
      await LmsEnrollment.updateOne(
        { id: row.id },
        { $set: { status: launched ? 'active' : 'invited', enaraRole: role, ltiRoles, lastSeenAt: seen, ...(addedInstructor ? { addedInstructor: true } : {}) }, $unset: { endedAt: 1 } },
      );
      if (role === 'student') counts.reactivated++;
      else if (addedInstructor) counts.instructorsAdded++;
      else counts.unchanged++;
      await audit('roster.member_reactivated', 'ok', { lmsUserId: lu!.id, enaraUserId: userId, role, started: launched, addedInstructor });
    } else {
      await LmsEnrollment.updateOne({ id: row.id }, { $set: { enaraRole: role, ltiRoles, lastSeenAt: seen, ...(addedInstructor ? { addedInstructor: true } : {}) } });
      if (addedInstructor) counts.instructorsAdded++;
      else counts.unchanged++;
    }
  }

  const status: RosterSyncOutcome['status'] = counts.deferred || removalsSkipped ? 'partial' : 'ok';
  const code = counts.deferred ? 'more_next_run' : removalsSkipped;
  await recordState(context, { lastAttemptAt: o.at, trigger: o.trigger, outcome: status, ...counts }, { synced: true, release: true });
  await writeLmsAudit({
    event: 'roster.sync', outcome: status === 'ok' ? 'ok' : 'warn', institutionId: inst, platformId: platform.id, actor: o.actor ?? SYSTEM_ACTOR, code,
    refIds: { contextId: context.id, enaraClassId: cls.id, trigger: o.trigger, ...counts },
  });
  const outcome: RosterSyncOutcome = { ...counts, contextId: context.id, status, code, trigger: o.trigger, at: o.at };
  // Extension point for the grade ledger (LMS results check); a no-op today.
  try {
    await afterRosterSync(context, outcome);
  } catch (error) {
    logger.warn('lms_after_roster_sync_failed', { contextId: context.id, error: serializeError(error) });
  }
  return outcome;
}

// ------------------------------------------------------------ triggers

/** (a) A teacher's launch: sync in the background when the last sync is older than 24 h (at most one try an hour after a failure). */
export function scheduleRosterSyncOnLaunch(context: Pick<ILmsContext, 'id' | 'nrpsUrl' | 'lastRosterSyncAt' | 'rosterSync'>): boolean {
  if (!rosterOn() || !context.nrpsUrl) return false;
  const now = Date.now();
  if (context.lastRosterSyncAt && now - new Date(context.lastRosterSyncAt).getTime() < STALE_MS) return false;
  const tried = context.rosterSync?.lastAttemptAt;
  if (tried && context.rosterSync?.outcome === 'failed' && now - new Date(tried).getTime() < RETRY_AFTER_FAILURE_MS) return false;
  runInBackground('roster_sync_launch', () => syncContextRoster(context.id, { trigger: 'launch' }));
  return true;
}

/** (b) Nightly (the daily cron) or the protected cron route: the courses synced longest ago first, within the time budget. */
export async function scheduledRosterSync(opts: { trigger: 'nightly' | 'cron'; budgetMs: number; limit?: number }) {
  if (!rosterOn()) return { skipped: true };
  const deadline = Date.now() + opts.budgetMs;
  const platforms = await LmsPlatform.find({ status: 'active' }).select('id').limit(1000).lean();
  const fresh = new Date(Date.now() - 20 * 3600_000);
  const contexts = await LmsContext.find({
    status: 'active',
    platformId: { $in: platforms.map((p) => p.id) },
    nrpsUrl: { $exists: true },
    enaraClassId: { $exists: true },
    $or: [{ lastRosterSyncAt: { $exists: false } }, { lastRosterSyncAt: null }, { lastRosterSyncAt: { $lt: fresh } }],
  })
    .sort({ lastRosterSyncAt: 1 })
    .limit(opts.limit ?? 25)
    .select('id')
    .lean();
  const out = { contexts: 0, ok: 0, partial: 0, failed: 0, busy: 0, skipped: 0, added: 0, removed: 0, notReached: 0 };
  for (const c of contexts) {
    const left = deadline - Date.now();
    if (left < 5_000) {
      out.notReached++;
      continue;
    }
    const r = await syncContextRoster(c.id, { trigger: opts.trigger, budgetMs: left });
    out.contexts++;
    out[r.status === 'ok' ? 'ok' : r.status === 'partial' ? 'partial' : r.status === 'failed' ? 'failed' : r.status === 'busy' ? 'busy' : 'skipped']++;
    out.added += r.added;
    out.removed += r.removed;
  }
  return out;
}

/** "Sync roster now": too soon after the last attempt? (protects the LMS from repeated clicks). */
export function manualSyncTooSoon(context: Pick<ILmsContext, 'rosterSync'>): boolean {
  const tried = context.rosterSync?.lastAttemptAt;
  return !!tried && Date.now() - new Date(tried).getTime() < manualCooldownMs;
}

/** Tests only. */
export function setRosterCooldownForTests(ms: number): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  manualCooldownMs = ms;
}

// ------------------------------------------------- first launch, switched

/**
 * Owner item: a teacher whose FIRST launch is already "switched to student".
 * Before a Learner launch creates a student (and so, later, a seat) for an LMS
 * person with no ENARA account yet, ask the LMS for their real course role
 * (NRPS, listing instructors when the platform supports the role filter). If
 * the LMS lists them as staff: a student preview (their staff account is made
 * as a teacher launch would; no student, no seat, no grade). If NRPS cannot
 * answer, today's behaviour stays and the reason is audited. Bounded: a few
 * pages, about 6 s. Off unless roster sync is on.
 */
export async function nrpsStudentPreview(input: ProvisionInput, platform: ILmsPlatform): Promise<PreviewResult | null> {
  if (!rosterOn() || input.role !== 'student' || input.testUser) return null;
  let lu: ILmsUser | null = await LmsUser.findOne({ platformId: input.platformId, externalUserId: input.externalUserId }).lean<ILmsUser>();
  if (lu?.enaraUserId) {
    if (isObjectId(lu.enaraUserId) && (await User.exists({ _id: lu.enaraUserId }))) return null; // has an account: the usual rules
  }
  const context = await LmsContext.findOne({ platformId: input.platformId, externalContextId: input.context.externalId, institutionId: input.institutionId }).lean();
  const url = input.services?.nrpsUrl ?? context?.nrpsUrl;
  const base = { lmsUserId: lu?.id, contextId: context?.id };
  const unavailable = async (reason: string) => {
    await writeLmsAudit({ event: 'preview_check', outcome: 'warn', institutionId: input.institutionId, platformId: platform.id, code: 'nrps_unavailable', refIds: { ...base, reason } });
    return null;
  };
  if (!url) return unavailable('no_memberships_url');
  if (!nrpsAllowed(platform)) return unavailable('nrps_not_allowed');
  const r = await fetchMembers(platform, url, { role: INSTRUCTOR_ROLE, maxPages: 3, budgetMs: 6_000, stopWhen: (m) => m.userId === input.externalUserId });
  if (!r.ok) return unavailable(r.code);
  const me = r.members.find((m) => m.userId === input.externalUserId);
  const role = me && me.status === 'Active' ? roleOf(me, platform) : undefined;
  if (!me && r.truncated) return unavailable('not_found_in_pages');
  if (!role || role === 'student' || role === 'ignore') {
    await writeLmsAudit({ event: 'preview_check', outcome: 'ok', institutionId: input.institutionId, platformId: platform.id, code: 'nrps_not_staff', refIds: { ...base, listed: !!me } });
    return null;
  }
  // Staff in the LMS: link (or make) their staff account, as a teacher launch would.
  const key = { platformId: input.platformId, externalUserId: input.externalUserId };
  const p = input.person;
  const set = { lastLaunchAt: new Date(), ...(p.email ? { email: p.email } : {}), ...(p.givenName ? { givenName: p.givenName } : {}), ...(p.familyName ? { familyName: p.familyName } : {}) };
  try {
    lu = (await LmsUser.findOneAndUpdate(key, { $set: set, $setOnInsert: { institutionId: input.institutionId } }, { upsert: true, new: true }).lean<ILmsUser>())!;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    lu = (await LmsUser.findOne(key).lean<ILmsUser>())!;
  }
  if (lu.enaraUserId) await LmsUser.updateOne({ id: lu.id, enaraUserId: lu.enaraUserId }, { $unset: { enaraUserId: 1 } });
  const made = await createEnaraAccount({ role, institutionId: input.institutionId, person: input.person }, { ...lu, enaraUserId: undefined });
  const staff = await User.findById(made.userId).select('role status institutionId').lean();
  if (!staff || (staff.role !== 'teacher' && staff.role !== 'admin') || staff.status !== 'active' || staff.institutionId !== input.institutionId) return null;
  const link = context ? await LmsResourceLink.findOne({ contextId: context.id, externalResourceLinkId: input.resourceLink.externalId }).lean() : null;
  return {
    lmsUserId: lu.id,
    enaraUserId: made.userId,
    staffRole: staff.role as 'teacher' | 'admin',
    detectedBy: 'nrps',
    contextId: context?.id,
    enaraClassId: context?.enaraClassId,
    resourceLinkId: link?.id,
    targetAssignmentId: link?.enaraActivityId,
    presentation: link?.presentation ?? 'iframe',
  };
}

// --------------------------------------------------------------- views

export interface ContextRosterView {
  id: string;
  platformId: string;
  institutionId: string;
  title: string | null;
  label: string | null;
  enaraClassId: string | null;
  rosterAvailable: boolean;
  lastRosterSyncAt: Date | null;
  sync: ILmsRosterSyncState | null;
  students: { active: number; notStarted: number; inactive: number };
}

export async function contextRosterViews(contexts: ILmsContext[]): Promise<ContextRosterView[]> {
  if (!contexts.length) return [];
  const agg = await LmsEnrollment.aggregate<{ _id: { c: string; s: string }; n: number }>([
    { $match: { contextId: { $in: contexts.map((c) => c.id) }, enaraRole: 'student' } },
    { $group: { _id: { c: '$contextId', s: '$status' }, n: { $sum: 1 } } },
  ]);
  const n = (c: string, s: string) => agg.find((a) => a._id.c === c && a._id.s === s)?.n ?? 0;
  return contexts.map((c) => ({
    id: c.id,
    platformId: c.platformId,
    institutionId: c.institutionId,
    title: c.title ?? null,
    label: c.label ?? null,
    enaraClassId: c.enaraClassId ?? null,
    rosterAvailable: !!c.nrpsUrl,
    lastRosterSyncAt: c.lastRosterSyncAt ?? null,
    sync: c.rosterSync ?? null,
    students: { active: n(c.id, 'active'), notStarted: n(c.id, 'invited'), inactive: n(c.id, 'inactive') + n(c.id, 'deleted') },
  }));
}

/** Students listed by the LMS who have not opened ENARA from this course yet. */
export async function notStartedStudents(context: Pick<ILmsContext, 'id' | 'institutionId'>, limit = 500) {
  const rows = await LmsEnrollment.find({ contextId: context.id, institutionId: context.institutionId, enaraRole: 'student', status: 'invited' }).select('lmsUserId createdAt').sort({ createdAt: 1 }).limit(limit).lean();
  if (!rows.length) return [];
  const lmsUsers = await LmsUser.find({ id: { $in: rows.map((r) => r.lmsUserId) } }).select('id enaraUserId').lean();
  const userIds = lmsUsers.map((u) => u.enaraUserId).filter(isObjectId);
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('studentId').lean() : [];
  const studentOf = new Map(users.map((u) => [String(u._id), u.studentId]));
  const sids = users.map((u) => u.studentId).filter((x): x is string => !!x);
  const names = new Map((sids.length ? await Student.find({ id: { $in: sids }, institutionId: context.institutionId }).select('id name').lean() : []).map((s) => [s.id, s.name]));
  const lmsUserById = new Map(lmsUsers.map((u) => [u.id, u]));
  return rows.map((r) => {
    const sid = studentOf.get(lmsUserById.get(r.lmsUserId)?.enaraUserId ?? '');
    return { lmsUserId: r.lmsUserId, studentId: sid ?? null, name: sid ? names.get(sid) ?? null : null, listedSince: r.createdAt };
  });
}

/** For the teacher's class roster: the LMS course behind this class and its not-started students. Null when roster sync is off or the class is not an LMS course. */
export async function lmsRosterForClass(classId: string, institutionId: string | undefined) {
  if (!rosterOn() || !institutionId) return null;
  const context = await LmsContext.findOne({ enaraClassId: classId, institutionId }).lean();
  if (!context) return null;
  const notStarted = await notStartedStudents(context);
  return {
    contextId: context.id,
    rosterAvailable: !!context.nrpsUrl,
    lastRosterSyncAt: context.lastRosterSyncAt ?? null,
    lastOutcome: context.rosterSync?.outcome ?? null,
    lastErrorCode: context.rosterSync?.lastErrorCode ?? null,
    notStartedStudentIds: notStarted.map((s) => s.studentId).filter((x): x is string => !!x),
  };
}
