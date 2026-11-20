import { describe, expect, it } from 'vitest';
import { modelProblem, fixBareNounStart, removeFalseWrongs, pairProblem } from '../src/services/pairCheck';
import { CLOCK_TIMES_LINE, clockLesson, renderLanguageContextPrompt } from '../src/services/languageTeachingContext';
import { RULE_BANK } from '../src/services/ruleBank';
import { withEnv, build } from './esl5Helpers';

// planner2f (owner, after PLN2g): models are correct English, no misspelling is ever shown as an example, time lessons teach quarter past / to.
describe('planner2f: model sentences are correct English', () => {
  it('flags a bare noun at the start and a missing article; passes correct models', () => {
    expect(modelProblem('Pig is big.')).toBe('bare_noun_start');
    expect(fixBareNounStart('Pig is big.')).toBe('The pig is big.');
    expect(modelProblem('He is doctor.')).toBe('article_omitted');
    for (const ok of ['The pig is big.', 'Water is cold.', 'Lina feeds her rabbit.', 'Swimming is fun.', "My brother's bike is red.", 'I have a big dog.']) expect([ok, modelProblem(ok)]).toEqual([ok, null]);
  });
  it('the guard repairs "Pig is big" in a pair and removes a pair whose right model is wrong', () => {
    const a = removeFalseWrongs('Look at this. Right: Pig is big. Wrong: Pig are big. Now you.');
    expect(a.text).toContain('Right: The pig is big.');
    expect(a.removed).toContain('model_fixed');
    const b = removeFalseWrongs('Right: He is doctor. Wrong: He doctor. Now you.');
    expect(b.text).not.toMatch(/He is doctor|He doctor/);
    const c = removeFalseWrongs('For example: Pig is big. Try one.');
    expect(c.text).toContain('For example: The pig is big.');
  });
  it('never a misspelling as an example, not even as the wrong one', () => {
    expect(pairProblem('This is a pen.', 'This is a pne.')).toBe('misspelling_shown');
    expect(pairProblem('This is my father.', 'This is my fathr.')).toBe('misspelling_shown');
    expect(pairProblem('I swam in the lake.', 'I swimmed in the lake.')).toBeNull(); // over-regular past: grammar
    const out = removeFalseWrongs('Right: This is a book. Wrong: This is a bouk. Now you.');
    expect(out.text).not.toMatch(/bouk/);
    expect(out.text).toContain('This is a book.');
  });
  it('every rule-bank example passes both checks (rb-v3)', () => {
    const bad = RULE_BANK.flatMap((e) => [
      ...[[e.right, e.wrong], ...(e.confusion ? [[e.confusion.right, e.confusion.wrong]] : [])].map(([r, w]) => ({ id: e.id, s: `${r} || ${w}`, why: pairProblem(r, w) ?? modelProblem(r) })),
      ...e.models.map((m) => ({ id: e.id, s: m.sentence, why: modelProblem(m.sentence) })),
    ]).filter((x) => x.why);
    expect(bad).toEqual([]);
  });
});

describe('planner2f: clock times', () => {
  const TIME = { objectives: ['Identify the final time agreed, including quarter/half past or to.'], successCriteria: ['Converts half past, quarter past and quarter to into clock times'], vocabulary: ["o'clock", 'quarter past', 'quarter to'] };
  it('a time lesson gets the clock-times line (planner2 on); other lessons and planner2 off do not', () => {
    expect(clockLesson(TIME)).toBe(true);
    expect(clockLesson({ objectives: ['Articles a/an'] })).toBe(false);
    const on = withEnv('levelExplicit,esl5,planner2', () => { const c = build('an', [] as never); return renderLanguageContextPrompt({ ...c, lesson: { ...c.lesson, spec: { ...c.lesson.spec!, ...TIME } } }); });
    expect(on).toContain(CLOCK_TIMES_LINE);
    expect(CLOCK_TIMES_LINE).toMatch(/quarter past seven \(7:15\), quarter to eight \(7:45/);
    expect(withEnv('levelExplicit,esl5,planner2', () => build('an', [] as never)).prompt).not.toContain(CLOCK_TIMES_LINE);
    const off = withEnv('levelExplicit,esl5', () => { const c = build('an', [] as never); return renderLanguageContextPrompt({ ...c, lesson: { ...c.lesson, spec: { ...c.lesson.spec!, ...TIME } } }); });
    expect(off).not.toContain(CLOCK_TIMES_LINE);
  });
  it('the rule-bank time entry teaches quarter past and quarter to', () => {
    const e = RULE_BANK.find((x) => x.id === 'EN-F-A1-VO-numbers-time')!;
    expect(e.rule).toMatch(/quarter past seven \(7:15\), quarter to eight \(7:45\)/);
    expect(e.models.map((m) => m.form)).toEqual(expect.arrayContaining(['quarter past', 'quarter to']));
  });
});
