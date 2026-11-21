import { afterEach, describe, expect, it } from 'vitest';
import { CHILD_RULE_LINE, CHILD_RULE_ON_WRONG_LINE, childRuleOn, detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import { trimChildReply } from '../src/services/languageTurnPipeline';
import type { HistoryTurn } from '../src/services/languageLearningState';

// childRule (NEXT_PLAN step 0, owner go 21 Nov 2026): ESL7b under-9s scored below BASE (68 vs 72). childShort allows 3 sentences of at most
// 12 words plus one task, but the rule block asked for a rule, a right AND a wrong example and a task, and the trim cut parts of it.
const SPEC: LanguageSpec = { objectives: ['Use a and an'], successCriteria: ['Uses an before a vowel sound'], grammar: ['a/an'], items: [
  { id: 'a1', prompt: 'Write a or an: I have ___ apple.', acceptedAnswers: ['an'], targetForms: ['an'], criteria: [1] }] };
const LESSON = { title: 'a and an', spec: SPEC };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

function prompt(years: number | undefined, band: 'child' | 'teen' = 'child') {
  const message = 'Hi! Give me an exercise.';
  const history = [u(message)];
  const signals = detectTurnSignals(message, history, LESSON);
  const moves = selectLanguageMoves({ band: levelBand('A1'), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const base = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const learner = { ...base, ageBand: { status: 'known', value: band, source: 'test' } as never, ...(years !== undefined ? { ageYears: years } : {}) };
  const ctx: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves, ruleFirst: { criteria: [1], texts: ['Uses an before a vowel sound'] } };
  return { ctx, text: renderLanguageContextPrompt(ctx) };
}

describe('childRule', () => {
  it('under 9: the child rule line replaces the long rule block (no wrong example)', () => {
    process.env.ENARA_ENGINE_V2 = 'ruleFirst,childShort,childRule';
    const { ctx, text } = prompt(7);
    expect(childRuleOn(ctx)).toBe(true);
    expect(text).toContain(CHILD_RULE_LINE({ texts: ['Uses an before a vowel sound'] }));
    expect(text).toMatch(/NO wrong example/);
    expect(text).not.toMatch(/give one right example and one wrong example/);
  });

  it('9 and over, teens, no age, or the switch off: unchanged', () => {
    process.env.ENARA_ENGINE_V2 = 'ruleFirst,childShort,childRule';
    for (const [y, b] of [[9, 'child'], [10, 'child'], [14, 'teen'], [undefined, 'child']] as const) {
      const { ctx, text } = prompt(y, b);
      expect(childRuleOn(ctx)).toBe(false);
      expect(text).not.toContain('This child is under 9, so the reply is exactly');
    }
    process.env.ENARA_ENGINE_V2 = 'ruleFirst,childShort';
    const off = prompt(7);
    expect(childRuleOn(off.ctx)).toBe(false);
    expect(off.text).not.toContain('This child is under 9, so the reply is exactly');
  });

  it('the child line asks for a reply that fits childShort: 3 short sentences plus the task', () => {
    const line = CHILD_RULE_LINE({ texts: ['x'] });
    expect(line).toMatch(/at most 10 words/);
    expect(line).toMatch(/at most 8 words/);
    expect(CHILD_RULE_ON_WRONG_LINE).toMatch(/ONE sentence of at most 10 words/);
    expect(CHILD_RULE_ON_WRONG_LINE).not.toMatch(/right\/wrong pair/);
  });

  it('the trim keeps the greeting, the rule, the example and the task of a reply in the child form', () => {
    const reply = 'Hi Sara! Use an before a, e, i, o, u. I see an owl.\n\nWrite a or an: I have ___ apple.';
    const t = trimChildReply(reply);
    expect(t.removed).toBe(0);
    expect(t.text).toContain('Use an before a, e, i, o, u.');
    expect(t.text).toContain('I see an owl.');
    expect(t.text).toContain('Write a or an: I have ___ apple.');
  });
});
