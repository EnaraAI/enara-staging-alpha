import { createHash } from 'crypto';
import { AssessmentAttempt } from '../../../models/AssessmentAttempt';
import { GradeLmsSlot, GradeSyncLog, type SyncResult } from '../../../models/GradeLedger';
import { gradeLedgerOn, ledgerEntryFor } from '../../../services/gradeLedger';
import { logger, serializeError } from '../../../utils/logging';
import { LmsGradeSyncJob, type ILmsGradeSyncJob } from '../models';

// Grade sync log (grade ledger, part c; docs/lms/GRADE_LEDGER_NOTES.md): one
// append-only grade_sync_log row per try to send a result to the LMS, written
// where the outbox records the try's outcome (outbox.ts finish()). Inert
// unless GRADE_LEDGER_ENABLED is on. Keeps what was sent (score, maximum,
// progress, a hash and the first words of the comment: no names), when, the
// result (sent, retried = sent after failed tries, failed = will retry, dead)
// and the error code, linked to the job and to the attempt's ledger entry.
//
// Also: whether an LMS cell is held because its value was changed in the LMS
// (lmsResults.ts); a held cell gets no automatic sends (outbox.ts
// sendTimeProblem -> dead `lms_value_differs`) until the teacher decides.

export const LMS_VALUE_DIFFERS = 'lms_value_differs';

const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

/** The comment's first words (the score part), never more than 60 characters. */
export function commentShort(comment: string | undefined): string | undefined {
  if (!comment) return undefined;
  const first = comment.split(/(?<=\.)\s/)[0] ?? comment;
  return first.slice(0, 60);
}

function resultOf(status: unknown, tries: number): SyncResult | null {
  if (status === 'sent') return tries > 1 ? 'retried' : 'sent';
  if (status === 'pending') return 'failed';
  if (status === 'dead') return 'dead';
  return null;
}

/** Called by the outbox after it stored a try's outcome. Never throws. */
export async function recordGradeSyncTry(job: ILmsGradeSyncJob, set: Record<string, unknown> | undefined): Promise<void> {
  if (!gradeLedgerOn() || !set) return;
  try {
    const result = resultOf(set.status, job.attempts ?? 1);
    if (!result) return;
    const attempt = await AssessmentAttempt.findOne({ id: job.enaraAttemptId }).select('assignmentId studentId').lean();
    const at = new Date();
    await GradeSyncLog.create({
      institutionId: job.institutionId,
      platformId: job.platformId,
      contextId: job.contextId,
      resourceLinkId: job.resourceLinkId,
      lmsUserId: job.lmsUserId,
      jobId: job.id,
      attemptId: job.enaraAttemptId,
      assignmentId: attempt?.assignmentId,
      studentId: attempt?.studentId,
      ledgerEntryId: await ledgerEntryFor(job.enaraAttemptId, at),
      sent: {
        ...(typeof job.scoreGiven === 'number' ? { scoreGiven: job.scoreGiven } : {}),
        scoreMaximum: job.scoreMaximum,
        gradingProgress: job.gradingProgress,
        activityProgress: job.activityProgress,
        ...(job.comment ? { commentHash: hash(job.comment), commentShort: commentShort(job.comment) } : {}),
        scoreTimestamp: job.scoreTimestamp,
      },
      result,
      ...(result !== 'sent' && result !== 'retried' && typeof set.lastError === 'string' ? { errorCode: set.lastError.slice(0, 80) } : {}),
      tries: job.attempts,
      ...(result === 'failed' && set.nextAttemptAt instanceof Date ? { nextAttemptAt: set.nextAttemptAt } : {}),
      ...(job.reason ? { reason: job.reason.slice(0, 40) } : {}),
      at,
    });
  } catch (error) {
    logger.warn('grade_sync_log_failed', { jobId: job.id, error: serializeError(error) });
  }
}

/** True when the cell's value was changed in the LMS and the teacher has not decided yet. Off: always false. */
export async function lmsSlotHeld(resourceLinkId: string | undefined, lmsUserId: string): Promise<boolean> {
  if (!resourceLinkId || !gradeLedgerOn()) return false;
  return !!(await GradeLmsSlot.exists({ resourceLinkId, lmsUserId, status: 'differs' }));
}

export interface SentValue {
  scoreGiven?: number;
  scoreMaximum?: number;
  gradingProgress?: string;
  at: Date;
  attemptId: string;
  jobId?: string;
}

/**
 * The last value ENARA actually sent to this cell: the newest sent row of the
 * sync log, or (rows written before the ledger was on) the newest sent job.
 */
export async function lastSentForSlot(resourceLinkId: string, lmsUserId: string): Promise<SentValue | null> {
  const [row, job] = await Promise.all([
    GradeSyncLog.findOne({ resourceLinkId, lmsUserId, result: { $in: ['sent', 'retried'] } }).sort({ at: -1, _id: -1 }).lean(),
    LmsGradeSyncJob.findOne({ resourceLinkId, lmsUserId, status: 'sent' }).sort({ sentAt: -1 }).lean(),
  ]);
  const fromRow: SentValue | null = row
    ? { scoreGiven: row.sent?.scoreGiven, scoreMaximum: row.sent?.scoreMaximum, gradingProgress: row.sent?.gradingProgress, at: row.at, attemptId: row.attemptId, jobId: row.jobId }
    : null;
  const fromJob: SentValue | null = job?.sentAt
    ? { scoreGiven: job.scoreGiven, scoreMaximum: job.scoreMaximum, gradingProgress: job.gradingProgress, at: job.sentAt, attemptId: job.enaraAttemptId, jobId: job.id }
    : null;
  if (!fromRow) return fromJob;
  if (!fromJob) return fromRow;
  return fromJob.at.getTime() > fromRow.at.getTime() + 1000 ? fromJob : fromRow;
}
