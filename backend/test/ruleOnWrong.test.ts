import { afterEach, describe, expect, it } from 'vitest';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, RULE_ON_WRONG_LINE, TEACH_RULE_V2, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import type { HistoryTurn } from '../src/services/languageLearningState';

// ruleOnWrong (LIT_REVIEW_GAP_PLAN 3.2): a wrong FIRST try on a new item gets the rule again in one line (ESL6: P+ stated rules 196 times
// against ENARA's 45 by round 2 and led). Through the real engine, with stored assessments in the history.
const SPEC: LanguageSpec = { objectives: ['Use in, on and at with time words'], successCriteria: ['Uses at with clock times', 'Uses on with days', 'Uses in with months'], grammar: ['in/on/at'], items: [
  { id: 'i1', prompt: 'Write in, on or at: My train leaves ___ 5 o\'clock.', acceptedAnswers: ['at'], targetForms: ['at'], criteria: [1] },
  { id: 'i2', prompt: 'Write in, on or at: They get married ___ April.', acceptedAnswers: ['in'], targetForms: ['in'], criteria: [3] }] };
const LESSON = { title: 'Time prepositions', spec: SPEC };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: HistoryTurn['languageTurn']): HistoryTurn => ({ role: 'assistant', content, languageTurn });
const li = { id: 'lesson:i2', source: 'lesson' as const, lessonItemId: 'i2' };
const presented = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i2' }, activeItem: li } as never)];
const wrong = { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li, hintLevel: 1 } as unknown as HistoryTurn['languageTurn'];
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });
function prompt(message: string, history: HistoryTurn[]) {
  const signals = detectTurnSignals(message, history, LESSON);
  const moves = selectLanguageMoves({ band: levelBand('A2'), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const ctx: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves };
  return renderLanguageContextPrompt(ctx);
}

describe('ruleOnWrong', () => {
  it('switch on: the first answer on a new item carries the rule-again line (conditional on it being wrong)', () => {
    process.env.ENARA_ENGINE_V2 = 'wrongAnswer,hints,ruleOnWrong';
    const p = prompt('at April', presented);
    expect(p).toContain(RULE_ON_WRONG_LINE);
    expect(RULE_ON_WRONG_LINE).toMatch(/Never give its answer/);
    expect(RULE_ON_WRONG_LINE).toMatch(/If their answer is right, ignore this line/);
  });
  it('a right answer the key confirms gets no rule-again line', () => {
    process.env.ENARA_ENGINE_V2 = 'wrongAnswer,hints,ruleOnWrong';
    expect(prompt('in', presented)).not.toContain(RULE_ON_WRONG_LINE);
  });
  it('the second try is the existing teach-rule stage, not this line', () => {
    process.env.ENARA_ENGINE_V2 = 'wrongAnswer,hints,ruleOnWrong';
    const p = prompt('on April', [...presented, u('at April'), a('Look at the word April.', wrong)]);
    expect(p).not.toContain(RULE_ON_WRONG_LINE);
    expect(p).toContain(TEACH_RULE_V2);
  });
  it('switch off (and "all"): unchanged', () => {
    process.env.ENARA_ENGINE_V2 = 'wrongAnswer,hints';
    expect(prompt('at April', presented)).not.toContain(RULE_ON_WRONG_LINE);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(prompt('at April', presented)).not.toContain(RULE_ON_WRONG_LINE);
  });
});
