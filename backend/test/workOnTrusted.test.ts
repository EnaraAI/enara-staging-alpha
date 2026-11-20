import { describe, expect, it } from 'vitest';
import { trustedWrong } from '../src/services/errorsToWorkOn';
import { oneTaskMethodText, ONE_TASK_METHOD_LINE } from '../src/services/learningContext';

// workOnTrusted (LIT_REVIEW_GAP_PLAN 3.4): only grades from validated paths make errors to work on.
// The cases are the false rejects of grader validation rounds 8 and 11 (research/assessment-validation/a1a2): a correct answer the
// grader scored 0. With the switch on, none of them becomes an error.
const ec = (text = 'Correct the mistake: The bus late was because traffic.') => ({ type: 'short-answer', text, correctAnswer: 'The bus was late because of the traffic.' });
const gap = (key: string) => ({ type: 'short-answer', text: 'Complete: I ___ tired after work today.', correctAnswer: key });
const live = { graderV2: false }; // lms-test today
const v2 = { graderV2: true };

describe('workOnTrusted: round 8 and round 11 false rejects never become errors', () => {
  const r8ec = ["Sugar is bad for you're teeth.", 'My mother cook rice on Saturday.', 'My uncle is a bus driver.', 'My cousin do his homework every night.'];
  it.each(r8ec)('round 8 error correction (rule-scored): %s', (answer) => {
    for (const o of [live, v2]) expect(trustedWrong(ec(), { method: 'rule', studentAnswer: answer }, o)).toBe(false);
  });
  it('round 8 gap answered with a whole sentence (R8-088) and with a contraction of the key (R8-115)', () => {
    expect(trustedWrong(gap('am'), { method: 'rule', studentAnswer: 'I am tired after work today.' }, v2)).toBe(false);
    expect(trustedWrong({ ...gap('would'), text: 'Complete: I ___ like a glass of water, please.' }, { method: 'rule', studentAnswer: "'d" }, v2)).toBe(false);
  });
  const r11 = ['The new school year begins in October.', 'There is a big library in my school.', 'Last year my brothers sold their bikes.', 'He has short hair and green eyes.', 'Because it was windy, I wore a scarf.'];
  it.each(r11)('round 11 error correction (rule-scored): %s', (answer) => {
    for (const o of [live, v2]) expect(trustedWrong(ec(), { method: 'rule', studentAnswer: answer }, o)).toBe(false);
  });
  it('gap items are not trusted on the live grader (graderV2 off)', () => {
    expect(trustedWrong(gap('am'), { method: 'rule', studentAnswer: 'is' }, live)).toBe(false);
  });
});

describe('workOnTrusted: validated paths still make errors', () => {
  it('a choice item scored by rule, and a teacher-set or teacher-accepted score', () => {
    expect(trustedWrong({ type: 'multiple-choice', text: 'I saw ___ apple.', correctAnswer: 'an' }, { method: 'rule', studentAnswer: 'a' }, live)).toBe(true);
    expect(trustedWrong({ type: 'true-false', text: 'x', correctAnswer: 'true' }, { studentAnswer: 'false' }, live)).toBe(true);
    expect(trustedWrong(ec(), { method: 'teacher', studentAnswer: 'x' }, live)).toBe(true);
    expect(trustedWrong({ type: 'open-response', text: 'Write about your day.' }, { method: 'ai_proposal', studentAnswer: 'x' }, live)).toBe(true);
  });
  it('a short gap answer under graderV2 is trusted; an AI-scored open answer is not', () => {
    expect(trustedWrong(gap('am'), { method: 'rule', studentAnswer: 'is' }, v2)).toBe(true);
    expect(trustedWrong({ type: 'open-response', text: 'Write about your day.' }, { method: 'ai', studentAnswer: 'x' }, v2)).toBe(false);
  });
});

describe('oneTaskMethod: one thing per reply in every method', () => {
  const formative = 'Give feedback. Follow a correct answer with a deeper question. When the starting point is unknown, begin with a few short questions to find it.';
  it('switch off: the method text is unchanged', () => {
    process.env.ENARA_ENGINE_V2 = 'planner2';
    expect(oneTaskMethodText(formative)).toBe(formative);
  });
  it('switch on: the deeper question becomes one new item, and every method gets the one-thing line', () => {
    process.env.ENARA_ENGINE_V2 = 'planner2,oneTaskMethod';
    const t = oneTaskMethodText(formative);
    expect(t).not.toContain('deeper question');
    expect(t).toContain('give one new item that goes one step further');
    expect(t.endsWith(ONE_TASK_METHOD_LINE)).toBe(true);
    expect(oneTaskMethodText('Explain using a simple visual, then ask a question about it.')).toContain(ONE_TASK_METHOD_LINE);
    delete process.env.ENARA_ENGINE_V2;
  });
  it('"all" does not turn either switch on', () => {
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(oneTaskMethodText(formative)).toBe(formative);
    delete process.env.ENARA_ENGINE_V2;
  });
});
