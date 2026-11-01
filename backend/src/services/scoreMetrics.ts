// One definition of "a score" for every analytics surface (P22): the school
// dashboard (analyticsService), the data assistant's aggregates, and Educator
// Chat class analytics (educatorAnalytics). See ENARA_ANALYTICS_METRIC_DEFINITIONS.md.
//
//   counted   status 'submitted' with a finite score, and for assignment work
//             a final grade (gradingStatus 'finalized' or 'released').
//             Drafts, in-progress, queued, failed, awaiting-review and
//             exception attempts are not scores yet.
//   one       per student and piece of work (assignment, or the assessment
//             for older self-paced work): the latest counted attempt.
//   window    assignment work by its due date (published or closed, due in
//             the window, never in the future); older self-paced work by its
//             submission time. Default window: the last 90 days.
//   missing   work is never a zero: it is left out of averages and reported
//             separately (submission rate, missing count).

export const SCORE_WINDOW_DAYS = 90;
export const FINAL_GRADING_STATES = ['finalized', 'released'] as const;

export interface ScorableAttempt {
  id: string;
  studentId: string;
  assessmentId?: string;
  assignmentId?: string | null;
  status?: string;
  gradingStatus?: string | null;
  score?: number | null;
  submittedAt?: Date | string | null;
}

export function isCountedScore(t: ScorableAttempt): boolean {
  if (t.status !== 'submitted' || typeof t.score !== 'number' || !Number.isFinite(t.score)) return false;
  // Assignment work: only final grades. Older self-paced attempts were graded
  // by answer key at submission (no grading state).
  if (t.assignmentId) return (FINAL_GRADING_STATES as readonly string[]).includes(String(t.gradingStatus));
  return !t.gradingStatus || (FINAL_GRADING_STATES as readonly string[]).includes(String(t.gradingStatus));
}

const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);

// The latest counted attempt per student and piece of work.
export function latestCountedPerWork<T extends ScorableAttempt>(attempts: T[]): T[] {
  const best = new Map<string, T>();
  for (const t of attempts) {
    if (!isCountedScore(t)) continue;
    const k = `${t.studentId}|${t.assignmentId || `assessment:${t.assessmentId}`}`;
    const prev = best.get(k);
    if (!prev || time(t.submittedAt) > time(prev.submittedAt) || (time(t.submittedAt) === time(prev.submittedAt) && String(t.id) > String(prev.id))) best.set(k, t);
  }
  return [...best.values()];
}

// Counted scores in the window. `dueAtOf` gives an assignment's due date and
// state (undefined: not a known assignment of this scope, left out).
export function scoresInWindow<T extends ScorableAttempt>(
  attempts: T[],
  window: { from: Date; to: Date },
  dueAtOf: (assignmentId: string) => { dueAt: Date; state: string } | undefined,
): T[] {
  return latestCountedPerWork(attempts).filter((t) => {
    if (t.assignmentId) {
      const a = dueAtOf(t.assignmentId);
      return !!a && (a.state === 'published' || a.state === 'closed') && a.dueAt >= window.from && a.dueAt <= window.to;
    }
    const at = time(t.submittedAt);
    return at >= window.from.getTime() && at <= window.to.getTime();
  });
}
