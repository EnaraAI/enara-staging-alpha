import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { GradeLedgerEntry, GradeSyncLog, type LedgerReason } from '../models/GradeLedger';
import { LmsGradeSyncJob } from '../integrations/lms/models';
import { commentShort } from '../integrations/lms/core/gradeSyncLog';
import { actorOf, valueOfAttempt } from './gradeLedger';
import { createHash } from 'crypto';

// Grade ledger backfill (docs/lms/GRADE_LEDGER_NOTES.md, part g): gives
// attempts made before the ledger was switched on one entry each, from their
// stored state (released -> `released`, finalized -> `auto_graded`, anything
// else submitted -> `submitted`), marked `backfilled`, dated when that state
// was reached; and LMS jobs already sent one `sent` sync log row each.
// Idempotent: an attempt that has any ledger entry, or a job that has any
// sync log row, is skipped. Only inserts (append-only). Dry run by default
// (scripts/gradeLedgerBackfill.ts).

export interface BackfillOptions {
  apply: boolean;
  institutionId?: string;
  limit?: number;
}

function reasonOf(gradingStatus: string | undefined): LedgerReason {
  if (gradingStatus === 'released') return 'released';
  if (gradingStatus === 'finalized') return 'auto_graded';
  return 'submitted';
}

type Row = {
  id: string;
  institutionId?: string;
  assignmentId?: string;
  studentId: string;
  startedAt?: Date;
  submittedAt?: Date;
  finalizedAt?: Date;
  finalizedBy?: string;
  releasedAt?: Date;
  status: string;
  gradingStatus?: string;
  totalPoints?: number;
  maxPoints?: number;
  score?: number;
  history?: { action: string; by?: string }[];
};

export async function backfillGradeLedger(opts: BackfillOptions) {
  const limit = Math.min(Math.max(opts.limit ?? 5000, 1), 50_000);
  const scope = opts.institutionId ? { institutionId: opts.institutionId } : {};
  const attempts = (await AssessmentAttempt.find({ institutionId: opts.institutionId ?? { $exists: true }, assignmentId: { $exists: true }, status: 'submitted', anonymised: { $ne: true }, origin: { $ne: 'demo_seed' } })
    .select('id institutionId assignmentId studentId startedAt submittedAt finalizedAt finalizedBy releasedAt status gradingStatus totalPoints maxPoints score history.action history.by')
    .sort({ submittedAt: 1 })
    .limit(limit)
    .lean()) as unknown as Row[];
  const withEntries = new Set(await GradeLedgerEntry.distinct('attemptId', { attemptId: { $in: attempts.map((a) => a.id) } }));
  const todo = attempts.filter((a) => !withEntries.has(a.id));

  // Attempt numbers per student and assignment, by start time (all attempts, not only submitted).
  const keys = [...new Set(todo.map((a) => `${a.assignmentId}|${a.studentId}`))];
  const numberOf = new Map<string, number>();
  for (const k of keys) {
    const [assignmentId, studentId] = k.split('|');
    const list = await AssessmentAttempt.find({ assignmentId, studentId }).select('id startedAt').sort({ startedAt: 1, _id: 1 }).lean();
    list.forEach((t, i) => numberOf.set(t.id, i + 1));
  }
  const entries = todo.map((a) => {
    const reason = reasonOf(a.gradingStatus);
    const step = [...(a.history ?? [])].reverse().find((h) => h.action === (reason === 'released' ? 'released' : 'finalized'));
    return {
      institutionId: a.institutionId!,
      assignmentId: a.assignmentId,
      attemptId: a.id,
      attemptNumber: numberOf.get(a.id),
      studentId: a.studentId,
      reason,
      actor: reason === 'submitted' ? 'student' : actorOf(step?.by ?? a.finalizedBy),
      from: null,
      to: valueOfAttempt(a),
      backfilled: true,
      at: (reason === 'released' ? a.releasedAt : reason === 'auto_graded' ? a.finalizedAt : undefined) ?? a.finalizedAt ?? a.submittedAt ?? new Date(),
    };
  });

  const jobs = await LmsGradeSyncJob.find({ ...scope, status: 'sent', sentAt: { $exists: true } }).sort({ sentAt: 1 }).limit(limit).lean();
  const logged = new Set(await GradeSyncLog.distinct('jobId', { jobId: { $in: jobs.map((j) => j.id) } }));
  const jobAttempts = new Map(
    (await AssessmentAttempt.find({ id: { $in: jobs.map((j) => j.enaraAttemptId) } }).select('id assignmentId studentId').lean()).map((t) => [t.id, t]),
  );
  const rows = jobs
    .filter((j) => !logged.has(j.id))
    .map((j) => ({
      institutionId: j.institutionId,
      platformId: j.platformId,
      contextId: j.contextId,
      resourceLinkId: j.resourceLinkId,
      lmsUserId: j.lmsUserId,
      jobId: j.id,
      attemptId: j.enaraAttemptId,
      assignmentId: jobAttempts.get(j.enaraAttemptId)?.assignmentId,
      studentId: jobAttempts.get(j.enaraAttemptId)?.studentId,
      sent: {
        ...(typeof j.scoreGiven === 'number' ? { scoreGiven: j.scoreGiven } : {}),
        scoreMaximum: j.scoreMaximum,
        gradingProgress: j.gradingProgress,
        activityProgress: j.activityProgress,
        ...(j.comment ? { commentHash: createHash('sha256').update(j.comment, 'utf8').digest('hex').slice(0, 16), commentShort: commentShort(j.comment) } : {}),
        scoreTimestamp: j.scoreTimestamp,
      },
      result: (j.attempts > 1 ? 'retried' : 'sent') as 'sent' | 'retried',
      tries: j.attempts,
      ...(j.reason ? { reason: j.reason.slice(0, 40) } : {}),
      backfilled: true,
      at: j.sentAt!,
    }));

  const byReason: Record<string, number> = {};
  for (const e of entries) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
  const report = {
    attemptsScanned: attempts.length,
    attemptsWithEntries: withEntries.size,
    ledgerEntries: entries.length,
    byReason,
    sentJobsScanned: jobs.length,
    syncLogRows: rows.length,
  };
  if (!opts.apply) return { ...report, writes: 0 };
  let written = 0;
  for (let i = 0; i < entries.length; i += 500) written += (await GradeLedgerEntry.insertMany(entries.slice(i, i + 500), { ordered: false })).length;
  let syncWritten = 0;
  for (let i = 0; i < rows.length; i += 500) syncWritten += (await GradeSyncLog.insertMany(rows.slice(i, i + 500), { ordered: false })).length;
  return { ...report, writes: written + syncWritten };
}
