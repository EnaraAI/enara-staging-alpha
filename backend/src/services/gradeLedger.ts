import { getConfig } from '../config/env';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { GradeLedgerEntry, GradeLmsSlot, GradeSyncLog, type IGradeLedgerEntry, type ILedgerLms, type LedgerReason, type LedgerValue } from '../models/GradeLedger';
import { logger, serializeError } from '../utils/logging';

// The grade ledger (owner decision 4, 2026-11-18; docs/lms/GRADE_LEDGER_NOTES.md).
//
// An ENARA feature, independent of the LMS switches: GRADE_LEDGER_ENABLED
// (default off). Off, every function here returns at once and nothing is read
// or written. On, ENARA's grading code calls recordGradeChange() at the points
// where an attempt's result changes (next to the LMS hook lmsResultChanged):
//
//   submit                      submitted / newer_attempt  (student or system)
//   automatic grader            auto_graded / regrade_after_grader_fix, grading_exception
//   teacher                     teacher_scored, teacher_override, teacher_finalized,
//                               teacher_correction, released, regrade_requested
//   LMS (integrations/lms/core/lmsResults.ts)
//                               lms_change_detected, lms_change_reverted,
//                               kept_lms_value, kept_enara_value
//
// Each entry keeps the attempt's value before (the previous entry's `to`) and
// after (the attempt as stored now), who did it and why. Entries are never
// changed or deleted (models/GradeLedger.ts enforces it), except by PDPL
// permanent deletion (anonymiseGradeLedger below).

export const gradeLedgerOn = () => getConfig().gradeLedger.enabled;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function valueOfAttempt(a: { totalPoints?: number | null; maxPoints?: number | null; score?: number | null; gradingStatus?: string | null; status?: string }): LedgerValue {
  return { points: num(a.totalPoints), maxPoints: num(a.maxPoints), percent: num(a.score), status: a.gradingStatus ?? a.status ?? null };
}

/** 'system:grader', 'system:lms', 'system:time-limit' -> 'system'; a user ID stays as it is. */
export function actorOf(by: string | undefined): string {
  if (!by || by.startsWith('system')) return 'system';
  return by.slice(0, 80);
}

type AttemptRow = {
  id: string;
  institutionId?: string;
  assignmentId?: string;
  studentId: string;
  startedAt?: Date;
  status: string;
  gradingStatus?: string;
  totalPoints?: number;
  maxPoints?: number;
  score?: number;
  anonymised?: boolean;
  history?: { action: string; by?: string; at?: Date }[];
};

/** 1-based attempt number of this attempt among the student's attempts on the assignment (by start time). */
export async function attemptNumberOf(a: Pick<AttemptRow, 'id' | 'assignmentId' | 'studentId' | 'startedAt'>): Promise<number | undefined> {
  if (!a.assignmentId) return undefined;
  const list = await AssessmentAttempt.find({ assignmentId: a.assignmentId, studentId: a.studentId }).select('id startedAt').sort({ startedAt: 1, _id: 1 }).limit(200).lean();
  const i = list.findIndex((t) => t.id === a.id);
  return i >= 0 ? i + 1 : undefined;
}

async function lastEntry(attemptId: string) {
  return GradeLedgerEntry.findOne({ attemptId }).sort({ at: -1, _id: -1 }).lean();
}

export interface RecordOptions {
  questionId?: string;
  note?: string;
  /** For LMS entries: explicit values instead of the attempt's. */
  from?: LedgerValue | null;
  to?: LedgerValue | null;
  lms?: ILedgerLms;
  at?: Date;
}

async function insertEntry(attempt: AttemptRow, reason: LedgerReason, actor: string, opts: RecordOptions): Promise<IGradeLedgerEntry | null> {
  if (!attempt.institutionId || attempt.anonymised) return null;
  const previous = opts.from === undefined ? await lastEntry(attempt.id) : null;
  const row = await GradeLedgerEntry.create({
    institutionId: attempt.institutionId,
    assignmentId: attempt.assignmentId,
    attemptId: attempt.id,
    attemptNumber: await attemptNumberOf(attempt),
    studentId: attempt.studentId,
    reason,
    actor: actorOf(actor),
    from: opts.from !== undefined ? opts.from : previous?.to ?? null,
    to: opts.to !== undefined ? opts.to : valueOfAttempt(attempt),
    ...(opts.questionId ? { questionId: opts.questionId.slice(0, 80) } : {}),
    ...(opts.note ? { note: opts.note.slice(0, 500) } : {}),
    ...(opts.lms ? { lms: opts.lms } : {}),
    at: opts.at ?? new Date(),
  });
  return row.toObject();
}

/**
 * "This attempt's result changed": appends one ledger entry (old -> new, who,
 * why). Inert unless GRADE_LEDGER_ENABLED is on. Never throws and never
 * changes the grade. `submitted` becomes `newer_attempt` from the 2nd attempt
 * on; `auto_graded` becomes `regrade_after_grader_fix` when a person sent the
 * attempt back to the grader.
 */
export async function recordGradeChange(attemptId: string | undefined, reason: LedgerReason, by: string | undefined, opts: RecordOptions = {}): Promise<IGradeLedgerEntry | null> {
  if (!attemptId || !gradeLedgerOn()) return null;
  try {
    const attempt = (await AssessmentAttempt.findOne({ id: attemptId })
      .select('id institutionId assignmentId studentId startedAt status gradingStatus totalPoints maxPoints score anonymised history.action history.by')
      .lean()) as unknown as AttemptRow | null;
    if (!attempt) return null;
    let why = reason;
    if (why === 'submitted' && ((await attemptNumberOf(attempt)) ?? 1) > 1) why = 'newer_attempt';
    if (why === 'auto_graded' && (attempt.history ?? []).some((h) => h.action === 'regrade_requested')) why = 'regrade_after_grader_fix';
    return await insertEntry(attempt, why, by ?? 'system', opts);
  } catch (error) {
    logger.warn('grade_ledger_write_failed', { attemptId, reason, error: serializeError(error) });
    return null;
  }
}

/** The latest ledger entry of an attempt at or before `at` (the sync log links to it). */
export async function ledgerEntryFor(attemptId: string, at = new Date()): Promise<string | undefined> {
  const e = await GradeLedgerEntry.findOne({ attemptId, at: { $lte: at } }).sort({ at: -1, _id: -1 }).select('id').lean();
  return e?.id;
}

// ------------------------------------------------------------ history view

const GRADED_BY_TEACHER = new Set(['teacher', 'ai_proposal']);

/** auto / teacher / regrade, from the stored attempt (the live record) and its history. */
export function gradedByOf(a: { gradingStatus?: string; finalizedBy?: string; answers?: { method?: string }[]; history?: { action: string }[] }): 'auto' | 'teacher' | 'regrade' | null {
  if (!a.gradingStatus || ['grading_queued', 'grading_in_progress', 'grading_failed'].includes(a.gradingStatus)) return null;
  if ((a.answers ?? []).some((x) => GRADED_BY_TEACHER.has(x.method ?? '')) || (a.finalizedBy && !a.finalizedBy.startsWith('system'))) return 'teacher';
  if ((a.history ?? []).some((h) => h.action === 'regrade_requested')) return 'regrade';
  return 'auto';
}

/**
 * Everything the "Grade history" view shows for one student on one
 * assignment: each attempt (its own record), every ledger entry, the LMS sync
 * log and the LMS cells that differ. Callers check access first.
 */
export async function gradeHistory(assignment: { id: string; institutionId: string }, studentId: string) {
  const attempts = await AssessmentAttempt.find({ assignmentId: assignment.id, studentId, institutionId: assignment.institutionId })
    .select('id status gradingStatus startedAt submittedAt totalPoints maxPoints score finalizedAt finalizedBy releasedAt isLate answers.method history.action anonymised')
    .sort({ startedAt: 1, _id: 1 })
    .lean();
  const live = attempts.filter((t) => !t.anonymised);
  const ids = live.map((t) => t.id);
  const [entries, sync, slots] = await Promise.all([
    GradeLedgerEntry.find({ institutionId: assignment.institutionId, attemptId: { $in: ids } }).sort({ at: 1, _id: 1 }).limit(2000).lean(),
    GradeSyncLog.find({ institutionId: assignment.institutionId, attemptId: { $in: ids } }).sort({ at: 1, _id: 1 }).limit(2000).lean(),
    GradeLmsSlot.find({ institutionId: assignment.institutionId, assignmentId: assignment.id, studentId, status: { $exists: true } }).sort({ detectedAt: -1 }).limit(20).lean(),
  ]);
  const numberOf = new Map(live.map((t, i) => [t.id, i + 1]));
  return {
    attempts: live.map((t, i) => ({
      attemptId: t.id,
      number: i + 1,
      status: t.status,
      gradingStatus: t.gradingStatus ?? null,
      startedAt: t.startedAt ?? null,
      submittedAt: t.submittedAt ?? null,
      finalizedAt: t.finalizedAt ?? null,
      releasedAt: t.releasedAt ?? null,
      late: !!t.isLate,
      points: t.totalPoints ?? null,
      maxPoints: t.maxPoints ?? null,
      percent: t.score ?? null,
      gradedBy: gradedByOf(t as never),
    })),
    entries: entries.map((e) => ({
      id: e.id,
      at: e.at,
      attemptId: e.attemptId,
      attemptNumber: e.attemptNumber ?? numberOf.get(e.attemptId) ?? null,
      reason: e.reason,
      actor: e.actor,
      from: e.from ?? null,
      to: e.to ?? null,
      questionId: e.questionId ?? null,
      note: e.note ?? null,
      lms: e.lms ? { resourceLinkId: e.lms.resourceLinkId ?? null, platformId: e.lms.platformId ?? null } : null,
      backfilled: !!e.backfilled,
    })),
    syncLog: sync.map((r) => ({
      id: r.id,
      at: r.at,
      attemptId: r.attemptId,
      attemptNumber: numberOf.get(r.attemptId) ?? null,
      ledgerEntryId: r.ledgerEntryId ?? null,
      jobId: r.jobId ?? null,
      resourceLinkId: r.resourceLinkId ?? null,
      result: r.result,
      errorCode: r.errorCode ?? null,
      tries: r.tries ?? null,
      nextAttemptAt: r.nextAttemptAt ?? null,
      sent: r.sent ?? {},
      backfilled: !!r.backfilled,
    })),
    lms: slots.map((s) => ({
      resourceLinkId: s.resourceLinkId,
      platformId: s.platformId,
      status: s.status,
      lmsValue: s.lmsValue ?? null,
      enaraValue: s.enaraValue ?? null,
      detectedAt: s.detectedAt ?? null,
      resolvedAt: s.resolvedAt ?? null,
      resolvedBy: s.resolvedBy ?? null,
      resolution: s.resolution ?? null,
    })),
  };
}

/** Students of these assignments whose LMS cell differs (for the class assignments roster). */
export async function lmsDiffersFor(institutionId: string, assignmentId: string): Promise<Set<string>> {
  if (!gradeLedgerOn()) return new Set();
  const rows = await GradeLmsSlot.find({ institutionId, assignmentId, status: 'differs' }).select('studentId').limit(1000).lean();
  return new Set(rows.map((r) => r.studentId).filter((s): s is string => !!s));
}

// --------------------------------------------------------------- PDPL (P1)

/**
 * Permanent deletion (services/studentErasure.ts, PDPL P1). Ledger entries and
 * sync log rows of KEPT (anonymised) attempts are rewritten: the student link
 * becomes the same random anonymous ID the kept attempts got, the attempt ID
 * the kept attempt's new ID, and free text (the teacher's note) and the LMS
 * user / job links are dropped. Rows of attempts that are deleted go with
 * them; the student's LMS cell states are deleted. Runs whatever the switch
 * says (rows written while it was on must still be anonymised). This is the
 * ONLY code allowed to change ledger rows (raw collection writes; see the
 * append-only test).
 */
export async function anonymiseGradeLedger(
  studentId: string,
  attemptIds: string[],
  newAttemptId: Map<string, string>,
  anonymousId: string,
): Promise<{ anonymised: Record<string, number>; removed: Record<string, number> }> {
  const anonymised: Record<string, number> = {};
  const removed: Record<string, number> = {};
  const who = { $or: [{ studentId }, ...(attemptIds.length ? [{ attemptId: { $in: attemptIds } }] : [])] };

  const entries = GradeLedgerEntry.collection;
  let n = 0;
  for (const e of await entries.find(who).toArray()) {
    const next = newAttemptId.get(String(e.attemptId));
    if (!next || !anonymousId) continue;
    const lms = e.lms ? { ...(e.lms.platformId ? { platformId: e.lms.platformId } : {}), ...(e.lms.contextId ? { contextId: e.lms.contextId } : {}), ...(e.lms.resourceLinkId ? { resourceLinkId: e.lms.resourceLinkId } : {}) } : undefined;
    const { note: _note, lms: _lms, questionId, ...rest } = e as Record<string, unknown>;
    void _note;
    void _lms;
    await entries.replaceOne({ _id: e._id }, { ...rest, ...(questionId ? { questionId } : {}), ...(lms ? { lms } : {}), attemptId: next, studentId: anonymousId, anonymised: true });
    n += 1;
  }
  if (n) anonymised.grade_ledger = n;
  const goneEntries = (await entries.deleteMany({ ...who, anonymised: { $ne: true } })).deletedCount;
  if (goneEntries) removed.grade_ledger = goneEntries;

  const sync = GradeSyncLog.collection;
  let m = 0;
  for (const r of await sync.find(who).toArray()) {
    const next = newAttemptId.get(String(r.attemptId));
    if (!next || !anonymousId) continue;
    const { lmsUserId: _u, jobId: _j, ...rest } = r as Record<string, unknown>;
    void _u;
    void _j;
    await sync.replaceOne({ _id: r._id }, { ...rest, attemptId: next, studentId: anonymousId, anonymised: true });
    m += 1;
  }
  if (m) anonymised.grade_sync_log = m;
  const goneSync = (await sync.deleteMany({ ...who, anonymised: { $ne: true } })).deletedCount;
  if (goneSync) removed.grade_sync_log = goneSync;

  const slots = (await GradeLmsSlot.deleteMany({ $or: [{ studentId }, ...(attemptIds.length ? [{ attemptId: { $in: attemptIds } }] : [])] })).deletedCount;
  if (slots) removed.grade_lms_slots = slots;
  return { anonymised, removed };
}
