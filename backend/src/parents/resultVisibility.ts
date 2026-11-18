import { Institution } from '../models/Institution';
import { parentGradesAfterReviewEnabled } from './flags';

// Parents P3 (PARENT_GRADES_AFTER_REVIEW_ENABLED): THE rule for which results a
// parent may see, applied to every place a score reaches a parent:
//   progress (assessments list), home and weekly report (level card), weekly
//   status ("score dropped"), the CEFR level from checkpoint tests, the weekly
//   summary / "Share" (they read the same functions), and later the
//   new-results email (P4).
// School setting "Show results to parents" (D7, default after release):
//   after_release  only attempts with gradingStatus 'released'. A result an
//                  assignment releases automatically is 'released' too (owner
//                  decision 3). An attempt with NO grading status (older
//                  assessments) is not released, so it is not shown.
//   immediately    every submitted attempt with a score (as before P3).
// With the switch off: exactly as before (every submitted attempt).
export type ResultsPolicy = 'legacy' | 'immediately' | 'after_release';
export const DEFAULT_SHOW_RESULTS = 'after_release' as const;

export async function resultsPolicyFor(institutionId: string | undefined): Promise<ResultsPolicy> {
  if (!parentGradesAfterReviewEnabled()) return 'legacy';
  const s = institutionId ? await Institution.findOne({ id: institutionId }).select('parentPortal').lean() : null;
  return s?.parentPortal?.showResults === 'immediately' ? 'immediately' : DEFAULT_SHOW_RESULTS;
}

/** The extra query condition for attempts a parent may see the score of. */
export function visibleAttemptFilter(policy: ResultsPolicy): Record<string, unknown> {
  return policy === 'after_release' ? { gradingStatus: 'released' } : {};
}

export function attemptVisible(policy: ResultsPolicy, attempt: { gradingStatus?: string | null }): boolean {
  return policy !== 'after_release' || attempt.gradingStatus === 'released';
}

/** "Checked by the teacher / validated": released or finalized. Before P3 a missing status counted as verified. */
export function attemptVerified(policy: ResultsPolicy, attempt: { gradingStatus?: string | null }): boolean {
  if (policy === 'legacy') return attempt.gradingStatus === undefined || attempt.gradingStatus === null || attempt.gradingStatus === 'released' || attempt.gradingStatus === 'finalized';
  return attempt.gradingStatus === 'released' || attempt.gradingStatus === 'finalized';
}
