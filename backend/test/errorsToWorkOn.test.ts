import { describe, expect, it } from 'vitest';
import { answerWrong, applyOutcome, briefLines, errorOf, gateOpen, prioritize, removeExamItems, WORK_ON_MAX } from '../src/services/errorsToWorkOn';

// Learner memory phase 1 (owner rules, 20 Nov 2026): errors from released assessments, gated, prioritised, resolved after two independent rights
// in later sessions, reopened on a wrong answer; never the assessment's own items in the tutor's reply.
const day = (n: number) => new Date(Date.UTC(2026, 10, n, 10));
const released = { gradingStatus: 'released', releasedAt: day(10) };
const asg = { state: 'published', dueAt: day(12), latePolicy: 'not_accepted', maxAttempts: 2 };

describe('errors to work on: recording', () => {
  it('a wrong or partly right answer counts; a right one does not', () => {
    expect(answerWrong({ questionId: 'q', isCorrect: false })).toBe(true);
    expect(answerWrong({ questionId: 'q', points: 1, maxPoints: 2 })).toBe(true);
    expect(answerWrong({ questionId: 'q', points: 2, maxPoints: 2, isCorrect: true })).toBe(false);
  });
  it('the error type is the chosen option\'s distractor category, never the answer text', () => {
    const q = { id: 'q1', options: ['an', 'a', 'the'], distractors: [{ option: 'a', category: 'a/an before a vowel sound', description: 'Uses a before a vowel sound' }] };
    expect(errorOf(q, { questionId: 'q1', studentAnswer: 1 })).toEqual({ errorCode: 'a_an_before_a_vowel_sound', errorLabel: 'Uses a before a vowel sound' });
    expect(errorOf(q, { questionId: 'q1', studentAnswer: 'my own words' })).toEqual({ errorCode: 'unknown' });
  });
});

describe('errors to work on: the gate (no help during a test)', () => {
  const g = (over: object = {}) => gateOpen({ attempt: released, assignment: asg, attemptsUsed: 1, attemptInProgress: false, now: day(11), ...over });
  it('closed only when results are released AND the assessment is over for this learner', () => {
    expect(g()).toBe(false); // released, but an attempt is left and it is not closed yet
    expect(g({ attemptsUsed: 2 })).toBe(true); // no attempts left
    expect(g({ now: day(13) })).toBe(true); // past the due date (late not accepted)
    expect(g({ assignment: { ...asg, state: 'closed' } })).toBe(true);
  });
  it('waits for the teacher: not released, needs review, or another attempt in progress', () => {
    expect(g({ attemptsUsed: 2, attempt: { gradingStatus: 'needs_review' } })).toBe(false);
    expect(g({ attemptsUsed: 2, attempt: { gradingStatus: 'finalized', releasedAt: null } })).toBe(false);
    expect(g({ now: day(13), attemptInProgress: true })).toBe(false);
    expect(g({ now: day(13), assignment: { ...asg, latePolicy: 'accept_late', closesAt: day(20) } })).toBe(false); // late attempts still possible
  });
});

describe('errors to work on: priority and limit', () => {
  it('recurring first, then prerequisites, then most recent; at most 3 (2 for children)', () => {
    const e = (objectiveId: string, occurrences: number, n: number) => ({ objectiveId, occurrences, lastSeenAt: day(n) });
    const rows = [e('o1', 1, 9), e('o2', 1, 5), e('o3', 2, 1), e('o4', 1, 8)];
    const prereqs = new Map([['o1', ['o2']]]); // o2 is a prerequisite of o1
    expect(prioritize(rows, prereqs, WORK_ON_MAX.other).map((r) => r.objectiveId)).toEqual(['o3', 'o2', 'o1']);
    expect(prioritize(rows, prereqs, WORK_ON_MAX.child)).toHaveLength(2);
  });
});

describe('errors to work on: leaving and coming back', () => {
  const row = () => ({ status: 'open' as const, rightStreak: 0, countedKeys: [] as string[], lastSeenAt: day(10), occurrences: 1, statusHistory: [] as never[], resolvedAt: undefined as Date | undefined });
  it('two independent rights in later sessions resolve it; one session counts once', () => {
    const e = row();
    expect(applyOutcome(e, { right: true, key: 'session:s1', at: day(11) })).toBe(true);
    expect(applyOutcome(e, { right: true, key: 'session:s1', at: day(11) })).toBe(false); // same session
    expect(e.status).toBe('open');
    applyOutcome(e, { right: true, key: 'session:s2', at: day(12) });
    expect(e.status).toBe('resolved');
  });
  it('an outcome from before or at the error does not count; a wrong answer resets and reopens', () => {
    const e = row();
    expect(applyOutcome(e, { right: true, key: 'attempt:a0', at: day(10) })).toBe(false);
    applyOutcome(e, { right: true, key: 'session:s1', at: day(11) });
    applyOutcome(e, { right: false, key: 'session:s2', at: day(12) });
    expect(e.rightStreak).toBe(0);
    applyOutcome(e, { right: true, key: 'session:s3', at: day(13) }); applyOutcome(e, { right: true, key: 'session:s4', at: day(14) });
    expect(e.status).toBe('resolved');
    applyOutcome(e, { right: false, key: 'attempt:a9', at: day(15) });
    expect(e.status).toBe('open');
  });
  it('a dismissed row never changes', () => {
    const e = { ...row(), status: 'dismissed' as const };
    expect(applyOutcome(e as never, { right: true, key: 'session:s1', at: day(11) })).toBe(false);
  });
});

describe('errors to work on: what the tutor gets', () => {
  it('the brief has codes, titles and the school label only, and asks for new items', () => {
    const lines = briefLines([{ code: 'EN-A1-GR-articles', title: 'a and an', errorCode: 'a_an_before_a_vowel_sound', errorLabel: 'Uses a before a vowel sound', occurrences: 2 }]).join('\n');
    expect(lines).toMatch(/Errors to work on/);
    expect(lines).toMatch(/seen 2 times/);
    expect(lines).toMatch(/Never use, quote or rebuild the questions of their assessment/);
    expect(briefLines([])).toEqual([]);
  });
  it('a reply sentence that contains an assessment question is removed', () => {
    const out = removeExamItems('Good. Try this: She is ___ honest woman. Now a new one: He has ___ umbrella.', ['Complete: She is ___ honest woman.']);
    expect(out.removed).toBe(1);
    expect(out.text).not.toMatch(/honest woman/);
    expect(out.text).toMatch(/umbrella/);
  });
});
