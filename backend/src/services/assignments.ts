import type { IAssignment } from '../models/Assignment';

// Assignment rules (assign-v1). Pure functions so they can be tested alone.
//
// - An assignment is open from opensAt until the student's due date (their
//   extension if they have one, else dueAt).
// - With latePolicy 'accept_late', work is still accepted (and marked late)
//   until closesAt, or until the due date if closesAt is missing or earlier.
// - A closed or archived assignment accepts nothing; a draft isn't visible.
export const ASSIGNMENT_RULES_VERSION = 'assign-v1';

type Rules = Pick<IAssignment, 'state' | 'opensAt' | 'dueAt' | 'closesAt' | 'latePolicy' | 'extensions'>;

export function dueFor(a: Pick<IAssignment, 'dueAt' | 'extensions'>, studentId: string): Date {
  const ext = (a.extensions || []).filter((e) => e.studentId === studentId).sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())[0];
  return new Date(ext ? ext.dueAt : a.dueAt);
}

// Last moment a student may submit (late or not).
export function lastSubmissionFor(a: Rules, studentId: string): Date {
  const due = dueFor(a, studentId);
  if (a.latePolicy !== 'accept_late' || !a.closesAt) return due;
  return new Date(Math.max(due.getTime(), new Date(a.closesAt).getTime()));
}

export type Window = { open: true; late: boolean } | { open: false; reason: 'draft' | 'archived' | 'closed' | 'not_open_yet' | 'past_due' };

export function submissionWindow(a: Rules, studentId: string, now = new Date()): Window {
  if (a.state === 'draft') return { open: false, reason: 'draft' };
  if (a.state === 'archived') return { open: false, reason: 'archived' };
  if (a.state === 'closed') return { open: false, reason: 'closed' };
  if (now < new Date(a.opensAt)) return { open: false, reason: 'not_open_yet' };
  if (now <= dueFor(a, studentId)) return { open: true, late: false };
  if (now <= lastSubmissionFor(a, studentId)) return { open: true, late: true };
  return { open: false, reason: 'past_due' };
}

// The assignment's status as staff see it.
export function assignmentStatus(a: Rules, now = new Date()): 'draft' | 'scheduled' | 'active' | 'closed' | 'archived' {
  if (a.state === 'draft' || a.state === 'archived' || a.state === 'closed') return a.state;
  if (now < new Date(a.opensAt)) return 'scheduled';
  const latest = Math.max(
    new Date(a.dueAt).getTime(),
    a.latePolicy === 'accept_late' && a.closesAt ? new Date(a.closesAt).getTime() : 0,
    ...(a.extensions || []).map((e) => new Date(e.dueAt).getTime()),
  );
  return now.getTime() > latest ? 'closed' : 'active';
}

export type StudentStatus = 'not_started' | 'in_progress' | 'submitted' | 'grading' | 'grading_delayed' | 'awaiting_review' | 'graded' | 'released' | 'missing';

// One student's status from their attempts (newest first not required).
export function studentStatus(
  a: Rules,
  studentId: string,
  attempts: { status: string; gradingStatus?: string; submittedAt?: Date | null }[],
  now = new Date(),
): { status: StudentStatus; late: boolean } {
  const submitted = attempts.filter((t) => t.status === 'submitted');
  const late = submitted.some((t) => t.submittedAt && new Date(t.submittedAt) > dueFor(a, studentId));
  if (submitted.some((t) => t.gradingStatus === 'released')) return { status: 'released', late };
  if (submitted.some((t) => t.gradingStatus === 'finalized')) return { status: 'graded', late };
  if (submitted.some((t) => t.gradingStatus === 'needs_review' || t.gradingStatus === 'grading_pending' || t.gradingStatus === 'graded_draft')) {
    return { status: 'awaiting_review', late };
  }
  if (submitted.some((t) => t.gradingStatus === 'grading_exception')) return { status: 'grading_delayed', late };
  if (submitted.some((t) => t.gradingStatus === 'grading_queued' || t.gradingStatus === 'grading_in_progress' || t.gradingStatus === 'grading_failed')) {
    return { status: 'grading', late };
  }
  if (submitted.length) return { status: 'submitted', late };
  if (attempts.some((t) => t.status === 'in-progress')) return { status: 'in_progress', late: false };
  const w = submissionWindow(a, studentId, now);
  if (!w.open && (w.reason === 'past_due' || w.reason === 'closed')) return { status: 'missing', late: false };
  return { status: 'not_started', late: false };
}
