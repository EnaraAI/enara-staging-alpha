import { randomUUID } from 'crypto';

// PDPL P1 (owner decision 2026-11-17; docs/multi-class/ARCHIVE_NOTES.md): when a
// student is deleted permanently, their scores and structured results are kept
// for the school's totals, with the link to the person replaced by a random
// anonymous ID. This module holds the rules: what an anonymised record keeps,
// and when reports may show such a record as its own row.

/**
 * Reports and analytics never show anonymised (deleted) students' rows one by
 * one in a class or group smaller than this (live + anonymised students); only
 * aggregates there. Live students' rows are unaffected.
 */
export const MIN_GROUP_SIZE_FOR_ROWS = 5;

export const ANON_STUDENT_PREFIX = 'anon_';
export const DELETED_STUDENT_LABEL = 'Deleted student';

/** Random per deleted student; not derived from the student ID (non-reversible). */
export const newAnonymousStudentId = () => `${ANON_STUDENT_PREFIX}${randomUUID()}`;
export const newAnonymousAttemptId = () => `att_anon_${randomUUID()}`;
export const newAnonymousProposalId = () => `gp_anon_${randomUUID()}`;

export const isAnonymised = (row: { anonymised?: boolean | null } | null | undefined) => row?.anonymised === true;

/** Only results with a final score are kept; drafts, open and unfinished grading are deleted. */
export function keepsFinalResult(t: { status?: string; gradingStatus?: string | null }): boolean {
  return t.status === 'submitted' && (!t.gradingStatus || t.gradingStatus === 'finalized' || t.gradingStatus === 'released');
}

type Doc = Record<string, unknown>;
const pick = (src: Doc, keys: readonly string[]) => {
  const out: Doc = {};
  for (const k of keys) if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  return out;
};

// Whitelists: anything not named here (answers and essays, feedback,
// explanations, transcripts and conversation turns, appeals, drafts, grading
// history with its actors and reasons, errors, speaking-exam details) is dropped.
const ATTEMPT_KEEP = [
  '_id', 'assessmentId', 'assessmentTitle', 'subject', 'institutionId', 'status', 'score',
  'startedAt', 'submittedAt', 'timeSpentSec', 'assignmentId', 'assessmentVersion', 'isLate',
  'gradingStatus', 'totalPoints', 'maxPoints', 'finalizedAt', 'releasedAt', 'origin', 'createdAt', 'updatedAt',
] as const;
// Assessment engine fields kept are structured only (scores, reason codes, grader); feedbackText (model free text) is never kept.
const ANSWER_KEEP = ['questionId', 'isCorrect', 'points', 'maxPoints', 'method', 'originalPoints', 'needsReview', 'criteria', 'confidence', 'flagged', 'grader'] as const;
const PROPOSAL_KEEP = [
  '_id', 'institutionId', 'assignmentId', 'questionId', 'kind', 'run', 'status', 'points', 'maxPoints',
  'objectiveIds', 'confidence', 'flags', 'modelName', 'promptVersion', 'createdAt',
] as const;

/**
 * The anonymised copy of an attempt (same _id, new id). Keeps score, item IDs,
 * correct/incorrect, points, timestamps and assessment/assignment IDs.
 * updatedAt is left as it was, so no field dates the deletion.
 */
export function anonymiseAttempt(t: Doc, anonymousStudentId: string, newId: string, proposalIds: Map<string, string>): Doc {
  const answers = ((t.answers as Doc[] | undefined) ?? []).map((a) => {
    const kept = pick(a, ANSWER_KEEP);
    const scores = a.criterionScores as { criterionId?: string; levelId?: string; points?: number }[] | undefined;
    if (scores?.length) kept.criterionScores = scores.map((c) => pick(c as Doc, ['criterionId', 'levelId', 'points']));
    const pid = typeof a.proposalId === 'string' ? proposalIds.get(a.proposalId) : undefined;
    if (pid) kept.proposalId = pid;
    return kept;
  });
  const out: Doc = { ...pick(t, ATTEMPT_KEEP), id: newId, studentId: anonymousStudentId, answers, history: [], anonymised: true };
  // A kept result is final. "Finalized, not yet released" only decides when the
  // student sees it; with no student it would sit in teachers' release queues
  // for ever, so it is stored as released (releasedAt is not invented).
  if (out.gradingStatus === 'finalized') out.gradingStatus = 'released';
  return out;
}

/** A grading proposal with the student's words and the text that quotes them removed; the structured score stays. */
export function anonymiseProposal(p: Doc, newId: string, newAttemptId: string): Doc {
  const criteria = ((p.criteria as Doc[] | undefined) ?? []).map((c) => ({ ...pick(c, ['criterionId', 'levelId', 'points']), evidence: [] }));
  return { ...pick(p, PROPOSAL_KEEP), id: newId, attemptId: newAttemptId, criteria };
}

/**
 * Small-group rule for one report: anonymised students' rows are shown only
 * when the class/group (live + anonymised students) has at least
 * MIN_GROUP_SIZE_FOR_ROWS students. Aggregates always count them.
 */
export function anonymisedRowsAllowed(liveStudents: number, anonymisedStudents: number): boolean {
  return liveStudents + anonymisedStudents >= MIN_GROUP_SIZE_FOR_ROWS;
}

/**
 * The anonymised students among a report's attempts: each one's latest kept
 * result (by submittedAt) and how many results they have. Empty unless a
 * student was deleted permanently.
 */
export function anonymisedStudents<T extends { studentId: string; anonymised?: boolean | null; submittedAt?: Date | null }>(attempts: T[]) {
  const latest = new Map<string, T>();
  const count = new Map<string, number>();
  for (const t of attempts) {
    if (!isAnonymised(t)) continue;
    count.set(t.studentId, (count.get(t.studentId) ?? 0) + 1);
    const cur = latest.get(t.studentId);
    if (!cur || new Date(t.submittedAt ?? 0).getTime() > new Date(cur.submittedAt ?? 0).getTime()) latest.set(t.studentId, t);
  }
  return { latest: [...latest.values()], count };
}
