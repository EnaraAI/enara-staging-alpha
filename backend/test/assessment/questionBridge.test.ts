import { describe, expect, it } from 'vitest';
import { checkEngineQuestion, describeKey, forLearner, gradeEngineQuestion, parseAnswer } from '../../src/assessment/questionBridge';
import { gradeAnswers } from '../../src/services/grading';
import { publishProblems, questionPoints } from '../../src/services/assessmentVersions';
import { needsAiEvaluation } from '../../src/services/autoGrading';

// Assessment engine P1b: closed items inside ENARA assessments (type 'engine').

const q = (engine: Record<string, unknown>, over: Record<string, unknown> = {}) => ({ id: 'q1', type: 'engine', text: 'Q', points: 2, explanation: '', engine, ...over });
const ordering = q({ type: 'ordering', language: 'en', options: [{ id: 'a', text: 'first' }, { id: 'b', text: 'second' }, { id: 'c', text: 'third' }, { id: 'd', text: 'fourth' }], answer_key: { order: ['a', 'b', 'c', 'd'] } });
const matching = q({ type: 'matching', language: 'ar', options: { left: [{ id: 'l1', text: 'مصر' }, { id: 'l2', text: 'فرنسا' }, { id: 'l3', text: 'اليابان' }], right: [{ id: 'r1', text: 'القاهرة' }, { id: 'r2', text: 'باريس' }, { id: 'r3', text: 'طوكيو' }] }, answer_key: { pairs: [['l1', 'r1'], ['l2', 'r2'], ['l3', 'r3']] } });
const fill = q({ type: 'fill_blank', language: 'en', answer_key: { blanks: { blank_1: ['goes'], blank_2: ['has'] } } }, { text: 'She {{blank_1}} to school and {{blank_2}} lunch.' });
const numeric = q({ type: 'numeric', language: 'ar', answer_key: { value: 120, unit: 'سم' } });

describe('teacher checks', () => {
  it('accepts a valid item and keeps only the engine fields', () => {
    const r = checkEngineQuestion(fill as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.engine).toMatchObject({ type: 'fill_blank', language: 'en', answer_key: { blanks: { blank_1: ['goes'] } } });
  });
  it('refuses unknown types and broken items, in plain words', () => {
    expect(checkEngineQuestion(q({ type: 'essay', language: 'en', answer_key: {} }) as never)).toMatchObject({ ok: false });
    const bad = checkEngineQuestion(q({ type: 'fill_blank', language: 'en', answer_key: { blanks: { blank_1: ['x'] } } }, { text: 'no blank here' }) as never);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems.join(' ')).toMatch(/blank/);
    expect(checkEngineQuestion({ id: 'x', type: 'engine', text: 'Q' } as never).ok).toBe(false);
  });
});

describe('what a learner receives', () => {
  it('no answer key, no error codes; ordering and matching shuffled the same way each time, never in the key order', () => {
    const o = forLearner(ordering as never) as typeof ordering;
    expect(o.engine).not.toHaveProperty('answer_key');
    const ids = (o.engine.options as { id: string }[]).map((x) => x.id);
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect((forLearner(ordering as never) as typeof ordering).engine.options).toEqual(o.engine.options);
    expect((o.engine.options as { id: string }[]).map((x) => x.id)).not.toEqual(['a', 'b', 'c', 'd']);
    const m = forLearner(matching as never) as typeof matching;
    expect(m.engine).not.toHaveProperty('answer_key');
    expect((m.engine.options as { left: { id: string }[] }).left.map((x) => x.id)).toEqual(['l1', 'l2', 'l3']);
    expect((m.engine.options as { right: { id: string }[] }).right.map((x) => x.id)).not.toEqual(['r1', 'r2', 'r3']);
    expect(forLearner({ id: 'x', type: 'multiple-choice', text: 'Q' } as never)).toEqual({ id: 'x', type: 'multiple-choice', text: 'Q' });
  });
});

describe('grading through the existing assignment grader', () => {
  it('scores each engine type by code, with criteria and the key in plain words', () => {
    const [a, b, c, d] = gradeAnswers([fill, matching, numeric, ordering] as never, {
      q1: JSON.stringify({ blank_1: 'goes', blank_2: 'have' }),
    } as never);
    expect(a).toMatchObject({ points: 1, maxPoints: 2, isCorrect: false, method: 'rule', correctAnswer: 'goes · has', grader: 'code' });
    expect(a.criteria?.map((x) => x.reasonCode)).toEqual(['correct', 'wrong']);
    expect(b.points).toBe(0);
    expect(c.points).toBe(0);
    expect(d.points).toBe(0);
    const [m] = gradeAnswers([{ ...matching, id: 'm' }] as never, { m: JSON.stringify([['l1', 'r1'], ['l2', 'r2'], ['l3', 'r3']]) });
    expect(m).toMatchObject({ points: 2, isCorrect: true, correctAnswer: 'مصر → القاهرة · فرنسا → باريس · اليابان → طوكيو' });
    const [n] = gradeAnswers([{ ...numeric, id: 'n' }] as never, { n: '١٢٠ سم' });
    expect(n).toMatchObject({ points: 2, isCorrect: true });
    const [half] = gradeAnswers([{ ...numeric, id: 'n' }] as never, { n: '120' });
    expect(half).toMatchObject({ points: 1, criteria: [{ reasonCode: 'unit_missing' }], errorCodes: ['units'] });
  });
  it('a malformed stored item goes to a person, never a guessed score', () => {
    const [x] = gradeAnswers([q({ type: 'mcq', language: 'en', options: [], answer_key: {} })] as never, { q1: 'a' });
    expect(x).toMatchObject({ points: null, needsReview: true });
    expect('invalid' in gradeEngineQuestion(q({ type: 'mcq', language: 'en' }) as never, 'a')).toBe(true);
  });
  it('engine questions never go to the model grader', () => {
    expect(needsAiEvaluation(fill as never, { studentAnswer: 'x' } as never)).toBe(false);
  });
});

describe('publish checks and points', () => {
  it('a broken engine question stops publishing; a valid one is worth its points', () => {
    expect(publishProblems({ title: 'T', questions: [fill] } as never)).toEqual([]);
    expect(publishProblems({ title: 'T', questions: [q({ type: 'dropdown', language: 'en', options: { drop_1: ['a', 'b'] }, answer_key: { choices: { drop_1: 'z' } } }, { text: '{{drop_1}}' })] } as never).join(' ')).toMatch(/Question 1/);
    expect(questionPoints(fill as never)).toBe(2);
  });
});

describe('answers and keys in plain words', () => {
  it('reads JSON answers, leaves plain text as it is', () => {
    expect(parseAnswer('["a","b"]')).toEqual(['a', 'b']);
    expect(parseAnswer('{"blank_1":"x"}')).toEqual({ blank_1: 'x' });
    expect(parseAnswer('{broken')).toBe('{broken');
    expect(parseAnswer('12 cm')).toBe('12 cm');
    expect(parseAnswer(7)).toBe(7);
  });
  it('describes every key', () => {
    expect(describeKey(q({ type: 'mcq', language: 'en', options: [{ id: 'a', text: 'Four' }, { id: 'b', text: 'Five' }], answer_key: { correct: ['a'], multi: false } }) as never)).toBe('Four');
    expect(describeKey(q({ type: 'true_false', language: 'ar', answer_key: { value: false } }) as never)).toBe('خطأ');
    expect(describeKey(q({ type: 'true_false', language: 'en', answer_key: { value: true } }) as never)).toBe('True');
    expect(describeKey(numeric as never)).toBe('120 سم');
    expect(describeKey(ordering as never)).toBe('first → second → third → fourth');
    expect(describeKey(q({ type: 'dropdown', language: 'en', options: { drop_1: ['is', 'are'] }, answer_key: { choices: { drop_1: 'is' } } }) as never)).toBe('is');
    expect(describeKey({ id: 'x', type: 'engine', text: 'Q' } as never)).toBe('');
  });
});
