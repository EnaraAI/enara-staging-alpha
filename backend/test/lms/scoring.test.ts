import { describe, expect, it } from 'vitest';
import {
  clampComment,
  COMMENT_MAX,
  criterionBreakdown,
  defaultPolicy,
  effectivePolicy,
  pickForPolicy,
  resultState,
  scoreNumbers,
  skillBreakdown,
  toLmsScore,
  type ScoreAttempt,
  type ScoreQuestion,
} from '../../src/integrations/lms/core/scoring';

// toLmsScore and the scoring policy (plan §6, Phase 3): pure functions, no
// database. Language and non-language courses, partial credit, pending
// manual grading, released vs unreleased, number guards, comment length.

const LANG = { language: true, level: 'A2' };
const OTHER = { language: false };

const released = (over: Partial<ScoreAttempt> = {}): ScoreAttempt => ({
  id: 'at-1',
  status: 'submitted',
  assignmentId: 'asg-1',
  gradingStatus: 'released',
  totalPoints: 7,
  maxPoints: 10,
  score: 70,
  submittedAt: new Date('2026-11-10T10:00:00Z'),
  answers: [],
  ...over,
});

const LANG_QUESTIONS: ScoreQuestion[] = [
  { id: 'q1', type: 'multiple-choice', topic: 'Grammar' },
  { id: 'q2', type: 'short-answer', topic: 'vocabulary: family' },
  { id: 'q3', type: 'short-answer', topic: 'Grammar' },
  { id: 'q4', type: 'multiple-choice', topic: 'Fractions' },
];
const LANG_ANSWERS = [
  { questionId: 'q1', points: 1, maxPoints: 1 },
  { questionId: 'q2', points: 0, maxPoints: 2 },
  { questionId: 'q3', points: 2, maxPoints: 2 },
  { questionId: 'q4', points: 1, maxPoints: 1 },
];

const SCI_QUESTIONS: ScoreQuestion[] = [
  {
    id: 'q1',
    type: 'open-response',
    topic: 'Reading the graph',
    rubric: { criteria: [{ id: 'c1', title: 'Reasoning', maxPoints: 4 }, { id: 'c2', title: 'Use of evidence', maxPoints: 2 }] },
  },
  { id: 'q2', type: 'open-response', rubric: { criteria: [{ id: 'c3', title: 'Reasoning', maxPoints: 4 }] } },
  { id: 'q3', type: 'multiple-choice', topic: 'Writing' },
];
const SCI_ANSWERS = [
  { questionId: 'q1', points: 4, maxPoints: 6, criterionScores: [{ criterionId: 'c1', points: 3 }, { criterionId: 'c2', points: 1 }] },
  { questionId: 'q2', points: 2, maxPoints: 4, criterionScores: [{ criterionId: 'c3', points: 2 }] },
  { questionId: 'q3', points: 1, maxPoints: 1 },
];

describe('resultState: only released results are final', () => {
  it('assignment attempts: released is final; teacher states are pending manual; automatic grading is not sent', () => {
    expect(resultState(released())).toBe('final');
    for (const g of ['needs_review', 'graded_draft', 'grading_exception', 'grading_pending', 'finalized']) expect(resultState(released({ gradingStatus: g }))).toBe('pending_manual');
    for (const g of ['grading_queued', 'grading_in_progress', 'grading_failed', undefined]) expect(resultState(released({ gradingStatus: g }))).toBe('grading');
  });

  it('a standalone assessment attempt is final when submitted (scored by the key at submit)', () => {
    expect(resultState({ status: 'submitted' })).toBe('final');
  });

  it('open, abandoned and anonymised attempts are never sent', () => {
    expect(resultState(released({ status: 'in-progress' }))).toBe('none');
    expect(resultState(released({ status: 'abandoned' }))).toBe('none');
    expect(resultState(released({ anonymised: true }))).toBe('none');
  });
});

describe('toLmsScore: the numbers', () => {
  it('a released result: points out of the maximum, FullyGraded, Completed', () => {
    const s = toLmsScore(released(), { course: OTHER })!;
    expect(s).toMatchObject({ scoreGiven: 7, scoreMaximum: 10, gradingProgress: 'FullyGraded', activityProgress: 'Completed' });
    expect(s.comment).toBe('Score: 7/10 (70%). Details in ENARA.');
  });

  it('partial credit keeps fractions (rounded to 2 decimals)', () => {
    const s = toLmsScore(released({ totalPoints: 7.333333, maxPoints: 9 }), { course: OTHER })!;
    expect(s.scoreGiven).toBe(7.33);
    expect(s.scoreMaximum).toBe(9);
    expect(s.comment).toContain('7.33/9 (81%)');
  });

  it('zero is a real score, not "nothing"', () => {
    const s = toLmsScore(released({ totalPoints: 0, maxPoints: 5, score: 0 }), { course: OTHER })!;
    expect(s.scoreGiven).toBe(0);
    expect(s.gradingProgress).toBe('FullyGraded');
  });

  it('falls back to the percentage when points are missing, NaN, negative or the maximum is 0', () => {
    for (const bad of [{ totalPoints: undefined }, { totalPoints: NaN }, { totalPoints: -2 }, { maxPoints: 0 }, { maxPoints: -1 }, { maxPoints: Infinity }]) {
      const s = toLmsScore(released({ ...bad, score: 64 }), { course: OTHER })!;
      expect(s, JSON.stringify(bad)).toMatchObject({ scoreGiven: 64, scoreMaximum: 100 });
    }
  });

  it('caps the score at the maximum (never above 100%)', () => {
    expect(toLmsScore(released({ totalPoints: 12, maxPoints: 10 }), { course: OTHER })).toMatchObject({ scoreGiven: 10, scoreMaximum: 10 });
    expect(toLmsScore(released({ totalPoints: undefined, score: 140 }), { course: OTHER })).toMatchObject({ scoreGiven: 100, scoreMaximum: 100 });
  });

  it('sends nothing when no valid number exists at all', () => {
    expect(toLmsScore(released({ totalPoints: NaN, score: NaN }), { course: OTHER })).toBeNull();
    expect(toLmsScore(released({ totalPoints: undefined, maxPoints: undefined, score: -5 }), { course: OTHER })).toBeNull();
    expect(scoreNumbers({})).toBeNull();
  });

  it('a standalone assessment attempt uses its percentage', () => {
    expect(toLmsScore({ id: 'x', status: 'submitted', score: 50 }, { course: OTHER })).toMatchObject({ scoreGiven: 50, scoreMaximum: 100, gradingProgress: 'FullyGraded' });
  });
});

describe('toLmsScore: pending and unreleased', () => {
  it('a result a person still has to grade: PendingManual, Submitted, and no score at all', () => {
    for (const g of ['needs_review', 'grading_exception']) {
      const s = toLmsScore(released({ gradingStatus: g, totalPoints: 3 }), { course: LANG })!;
      expect(s.gradingProgress).toBe('PendingManual');
      expect(s.activityProgress).toBe('Submitted');
      expect(s.scoreGiven).toBeUndefined();
      expect(s.scoreMaximum).toBe(10);
      expect(s.comment).not.toMatch(/\d+\/\d+/);
    }
  });

  it('a finalized but UNRELEASED result (manual release) is never sent as a score', () => {
    const s = toLmsScore(released({ gradingStatus: 'finalized', totalPoints: 9 }), { course: OTHER })!;
    expect(s.gradingProgress).toBe('PendingManual');
    expect(s.scoreGiven).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain('9/10');
  });

  it('automatic grading still running: nothing is sent', () => {
    for (const g of ['grading_queued', 'grading_in_progress', 'grading_failed']) expect(toLmsScore(released({ gradingStatus: g }), { course: OTHER })).toBeNull();
  });

  it('pending manual has a default maximum when the attempt has none', () => {
    expect(toLmsScore(released({ gradingStatus: 'needs_review', maxPoints: undefined }), { course: OTHER })!.scoreMaximum).toBe(100);
  });
});

describe('toLmsScore: the comment (language vs other subjects)', () => {
  it('language course: CEFR level and language-skill breakdown', () => {
    const s = toLmsScore(released({ totalPoints: 4, maxPoints: 6, answers: LANG_ANSWERS }), { questions: LANG_QUESTIONS, course: LANG })!;
    expect(s.comment).toBe('Score: 4/6 (67%). Level: A2. Skills: Grammar 3/3, Vocabulary 0/2. Details in ENARA.');
    expect(s).toMatchObject({ levelScheme: 'cefr', levelLabel: 'A2' });
    // Non-skill topics (Fractions) are not listed as skills.
    expect(s.comment).not.toContain('Fractions');
  });

  it('language course without a level: skills only, no CEFR', () => {
    const s = toLmsScore(released({ answers: LANG_ANSWERS }), { questions: LANG_QUESTIONS, course: { language: true } })!;
    expect(s.comment).not.toContain('Level');
    expect(s.levelScheme).toBeUndefined();
    expect(s.comment).toContain('Skills: Grammar 3/3');
  });

  it('a level that is not CEFR is not shown as one', () => {
    const s = toLmsScore(released({ answers: LANG_ANSWERS }), { questions: LANG_QUESTIONS, course: { language: true, level: 'Grade 7' } })!;
    expect(s.comment).not.toContain('Level');
  });

  it('a speaking exam counts everything as Speaking', () => {
    const s = toLmsScore(released({ answers: LANG_ANSWERS }), { questions: LANG_QUESTIONS, course: { language: true, level: 'b1', format: 'english_conversation' } })!;
    expect(s.comment).toContain('Level: B1. Skills: Speaking 4/6.');
  });

  it('non-language course: never CEFR, even with a CEFR-looking level; rubric criteria instead', () => {
    const s = toLmsScore(released({ totalPoints: 7, maxPoints: 11, answers: SCI_ANSWERS }), { questions: SCI_QUESTIONS, course: { language: false, level: 'A2' } })!;
    expect(s.comment).toBe('Score: 7/11 (64%). Criteria: Reasoning 5/8, Use of evidence 1/2. Details in ENARA.');
    expect(s.comment).not.toMatch(/Level|CEFR|A2|Skills/);
    expect(s.levelScheme).toBeUndefined();
    // A "Writing" topic is not a skill outside language courses.
    expect(s.comment).not.toContain('Writing');
  });

  it('non-language course without rubrics: just the score', () => {
    expect(toLmsScore(released({ answers: LANG_ANSWERS }), { questions: LANG_QUESTIONS, course: OTHER })!.comment).toBe('Score: 7/10 (70%). Details in ENARA.');
  });

  it('breakdowns ignore bad numbers and unknown criteria', () => {
    expect(skillBreakdown([{ questionId: 'q1', points: NaN, maxPoints: 1 }, { questionId: 'q3', points: 1, maxPoints: 0 }, { questionId: 'q1', points: -1, maxPoints: 1 }], LANG_QUESTIONS, LANG)).toBe('');
    expect(criterionBreakdown([{ questionId: 'q1', criterionScores: [{ criterionId: 'nope', points: 1 }, { criterionId: 'c1', points: NaN }] }], SCI_QUESTIONS)).toBe('');
    expect(criterionBreakdown([{ questionId: 'q1', criterionScores: [{ criterionId: 'c1', points: 9 }] }], SCI_QUESTIONS)).toBe('Reasoning 4/4');
  });

  it('the comment never has the student name or answers, and stays within the limit', () => {
    const many: ScoreQuestion[] = Array.from({ length: 80 }, (_, i) => ({ id: `q${i}`, rubric: { criteria: [{ id: `c${i}`, title: `Criterion number ${i} with a fairly long title`, maxPoints: 2 }] } }));
    const answers = many.map((q, i) => ({ questionId: q.id, points: 1, maxPoints: 2, criterionScores: [{ criterionId: `c${i}`, points: 1 }] }));
    const s = toLmsScore(released({ answers }), { questions: many, course: OTHER })!;
    expect(s.comment.length).toBeLessThanOrEqual(COMMENT_MAX);
    expect(s.comment.endsWith('…')).toBe(true);
    expect(clampComment('a'.repeat(5000)).length).toBe(COMMENT_MAX);
    expect(clampComment(' short \n text ')).toBe('short text');
  });

  it('teacher-written titles are cleaned (control characters, length)', () => {
    const qs: ScoreQuestion[] = [{ id: 'q1', rubric: { criteria: [{ id: 'c1', title: 'Clarity\u0000\n\tof   writing' + 'x'.repeat(100), maxPoints: 2 }] } }];
    const out = criterionBreakdown([{ questionId: 'q1', criterionScores: [{ criterionId: 'c1', points: 2 }] }], qs);
    expect(out.startsWith('Clarity of writing')).toBe(true);
    expect(out).not.toMatch(/[\u0000-\u001f]/);
  });
});

describe('scoring policy', () => {
  const at = (id: string, day: number, over: Partial<ScoreAttempt> = {}) => released({ id, submittedAt: new Date(Date.UTC(2026, 10, day)), ...over });
  const pick = (attempts: ScoreAttempt[], policy: 'best' | 'latest') =>
    pickForPolicy(attempts.map((attempt) => ({ attempt, score: toLmsScore(attempt, { course: OTHER }) })), policy)?.attempt.id ?? null;

  it('defaults: best for practice, latest for assessments; a link can override', () => {
    expect(defaultPolicy('practice')).toBe('best');
    expect(defaultPolicy('assessment')).toBe('latest');
    expect(defaultPolicy(undefined)).toBe('latest');
    expect(effectivePolicy({ activityKind: 'practice' })).toBe('best');
    expect(effectivePolicy({ activityKind: 'practice', scoringPolicy: 'latest' })).toBe('latest');
    expect(effectivePolicy({ activityKind: 'assessment', scoringPolicy: 'best' })).toBe('best');
  });

  it('latest: the most recent submitted attempt, even when lower', () => {
    expect(pick([at('a', 1, { totalPoints: 9 }), at('b', 2, { totalPoints: 4 })], 'latest')).toBe('b');
  });

  it('best: the highest released result (ratio), ties go to the most recent', () => {
    expect(pick([at('a', 1, { totalPoints: 9 }), at('b', 2, { totalPoints: 4 })], 'best')).toBe('a');
    expect(pick([at('a', 1, { totalPoints: 5, maxPoints: 10 }), at('b', 2, { totalPoints: 1, maxPoints: 2 })], 'best')).toBe('b');
    expect(pick([at('a', 1, { totalPoints: 4, maxPoints: 5 }), at('b', 2, { totalPoints: 9, maxPoints: 10 })], 'best')).toBe('b');
  });

  it('latest: a newer attempt still being graded automatically holds the cell (nothing new is sent)', () => {
    expect(pick([at('a', 1), at('b', 2, { gradingStatus: 'grading_in_progress' })], 'latest')).toBeNull();
  });

  it('latest: a newer attempt waiting for the teacher is sent as pending', () => {
    const c = pickForPolicy([at('a', 1), at('b', 2, { gradingStatus: 'needs_review' })].map((attempt) => ({ attempt, score: toLmsScore(attempt, { course: OTHER }) })), 'latest');
    expect(c?.attempt.id).toBe('b');
    expect(c?.score?.gradingProgress).toBe('PendingManual');
  });

  it('best: a pending newer attempt never hides a released best; pending only when nothing is released', () => {
    expect(pick([at('a', 1, { totalPoints: 3 }), at('b', 2, { gradingStatus: 'needs_review' })], 'best')).toBe('a');
    expect(pick([at('a', 1, { gradingStatus: 'needs_review' }), at('b', 2, { gradingStatus: 'grading_queued' })], 'best')).toBe('a');
  });

  it('nothing submitted or only unusable attempts: nothing', () => {
    expect(pick([], 'latest')).toBeNull();
    expect(pick([at('a', 1, { status: 'in-progress' })], 'best')).toBeNull();
    expect(pick([at('a', 1, { anonymised: true })], 'latest')).toBeNull();
    expect(pick([at('a', 1, { totalPoints: NaN, score: NaN })], 'latest')).toBeNull();
  });
});
