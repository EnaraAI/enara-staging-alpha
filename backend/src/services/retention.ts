import { LearningEvidence } from '../models/LearningEvidence';
import { ObjectiveRetentionState } from '../models/ObjectiveRetentionState';

// Objective-level spaced review (ret-v1). A fixed, configurable schedule; it
// does not predict an individual forgetting curve.
// - Scheduling starts once the student has 2 distinct independent correct
//   answers on the objective (understanding shown, not one lucky answer).
// - Then each independent correct answer at or after the due date counts as a
//   successful review: intervals 3, 7, 14, 30, 60 days by streak.
// - An independent wrong answer resets the streak and makes it due in 1 day.
// - Answers before the due date don't advance the schedule (no cramming credit).
// The state is replayed from all evidence, so recomputation is deterministic.
// Per-question review items (reviewService) are unchanged and keep their own
// schedule; their answers arrive here as retention_review evidence.

export const RETENTION_VERSION = 'ret-v1';
export const INTERVAL_DAYS = [3, 7, 14, 30, 60];
const DAY = 86_400_000;
const INDEPENDENT = new Set(['independent_assessment', 'diagnostic', 'retention_review']);

export interface RetentionEvidence {
  occurredAt: Date;
  result: string;
  evidenceType: string;
  assistanceLevel: string;
  itemKey?: string;
  invalidatedAt?: Date | null;
}

export function replayRetention(evidence: RetentionEvidence[]) {
  const items = evidence
    .filter((e) => !e.invalidatedAt && INDEPENDENT.has(e.evidenceType) && e.assistanceLevel === 'none' && e.result !== 'inconclusive')
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const correctItems = new Set<string>();
  let scheduled = false;
  let streak = 0;
  let next: Date | undefined;
  let lastSuccess: Date | undefined;
  let lastFail: Date | undefined;
  for (const e of items) {
    const t = e.occurredAt.getTime();
    if (!scheduled) {
      if (e.result === 'correct') {
        correctItems.add(e.itemKey ?? String(t));
        if (correctItems.size >= 2) {
          scheduled = true;
          lastSuccess = e.occurredAt;
          next = new Date(t + INTERVAL_DAYS[0] * DAY);
        }
      }
      continue;
    }
    if (e.result === 'correct') {
      if (next && t >= next.getTime()) {
        streak += 1;
        lastSuccess = e.occurredAt;
        next = new Date(t + INTERVAL_DAYS[Math.min(streak, INTERVAL_DAYS.length - 1)] * DAY);
      }
    } else {
      streak = 0;
      lastFail = e.occurredAt;
      next = new Date(t + DAY);
    }
  }
  return { scheduled, consecutiveSuccessfulReviews: streak, nextReviewAt: next, lastSuccessfulRetrievalAt: lastSuccess, lastFailedRetrievalAt: lastFail };
}

export function retentionStatus(state: { scheduled: boolean; nextReviewAt?: Date | null }, now = new Date()) {
  if (!state.scheduled || !state.nextReviewAt) return 'not_scheduled' as const;
  const due = new Date(state.nextReviewAt).getTime();
  if (now.getTime() < due) return 'scheduled' as const;
  return now.getTime() > due + 7 * DAY ? ('overdue' as const) : ('due' as const);
}

export async function updateRetention(studentId: string, objectiveId: string, institutionId?: string) {
  const evidence = await LearningEvidence.find({ studentId, objectiveId })
    .select('occurredAt result evidenceType assistanceLevel itemKey invalidatedAt')
    .lean();
  const r = replayRetention(evidence);
  await ObjectiveRetentionState.updateOne(
    { studentId, objectiveId },
    {
      $set: { ...r, institutionId, schedulingVersion: RETENTION_VERSION },
      ...(r.nextReviewAt ? {} : { $unset: { nextReviewAt: 1 } }),
    },
    { upsert: true },
  );
  return r;
}
