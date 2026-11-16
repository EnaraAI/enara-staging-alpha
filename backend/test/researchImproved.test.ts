import { describe, it, expect, afterEach } from 'vitest';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchImproved, researchSignals, CLOSING_RECAP, STRATEGY_SHIFT, RESEARCH_CLOSING_TURN, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import type { HistoryTurn } from '../src/services/languageLearningState';

// Experiment 4 condition B: default-off, non-production research improvements. These tests show the flag is inert by default and ignored in
// production, and that when on it adds the three behaviours without removing any answer-hiding rule.
const saved = { i: process.env.ENARA_RESEARCH_IMPROVE, n: process.env.NODE_ENV };
afterEach(() => { if (saved.i === undefined) delete process.env.ENARA_RESEARCH_IMPROVE; else process.env.ENARA_RESEARCH_IMPROVE = saved.i; process.env.NODE_ENV = saved.n; });

const SPEC: LanguageSpec = { objectives: ['Use in, on and at with time words'], successCriteria: ['Uses at with clock times', 'Uses on with days', 'Uses in with months'], grammar: ['in/on/at'], items: [
  { id: 'i1', prompt: 'Write in, on or at: My train leaves ___ 5 o\'clock.', acceptedAnswers: ['at'], targetForms: ['at'], criteria: [1] },
  { id: 'i2', prompt: 'Write in, on or at: They get married ___ April.', acceptedAnswers: ['in'], targetForms: ['in'], criteria: [3] }] };
const LESSON = { title: 'Time prepositions', spec: SPEC };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: HistoryTurn['languageTurn']): HistoryTurn => ({ role: 'assistant', content, languageTurn });
function build(message: string, history: HistoryTurn[]) {
  const signals = detectTurnSignals(message, history, LESSON);
  const moves = selectLanguageMoves({ band: levelBand('A2'), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const research = researchSignals(history, signals, SPEC);
  const base: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'l', title: LESSON.title, spec: SPEC }, signals, moves, research };
  return { prompt: renderLanguageContextPrompt(base), research };
}
const longHistory = (n: number) => Array.from({ length: n }, (_, i) => [u(`message ${i}`), a(`reply ${i}`)]).flat();

describe('research improved ENARA (Experiment 4, condition B)', () => {
  it('is OFF by default and ignored in production', () => {
    delete process.env.ENARA_RESEARCH_IMPROVE; for (const f of ['closing', 'strategy', 'coverage'] as const) expect(researchImproved(f)).toBe(false);
    process.env.NODE_ENV = 'production'; process.env.ENARA_RESEARCH_IMPROVE = 'closing,strategy,coverage'; for (const f of ['closing', 'strategy', 'coverage'] as const) expect(researchImproved(f)).toBe(false);
  });
  it('adds nothing to the prompt when the flag is off, even if signals exist', () => {
    delete process.env.ENARA_RESEARCH_IMPROVE; const { prompt } = build('At Saturday.', longHistory(6)); expect(prompt).not.toContain(CLOSING_RECAP); expect(prompt).not.toContain(STRATEGY_SHIFT); expect(prompt).not.toContain('Success criteria they have not shown yet');
  });
  it('closing recap appears from the closing turn on, not before', () => {
    process.env.NODE_ENV = 'test'; process.env.ENARA_RESEARCH_IMPROVE = 'closing';
    expect(build('At Saturday.', longHistory(RESEARCH_CLOSING_TURN - 2)).prompt).not.toContain(CLOSING_RECAP);
    const late = build('At Saturday.', longHistory(RESEARCH_CLOSING_TURN - 1)); expect(late.research.turnNo).toBe(RESEARCH_CLOSING_TURN); expect(late.prompt).toContain(CLOSING_RECAP); expect(late.prompt).toContain('Tell me the rule in your own words');
  });
  it('strategy change only when the learner is stuck (two wrong turns in a row)', () => {
    process.env.NODE_ENV = 'test'; process.env.ENARA_RESEARCH_IMPROVE = 'strategy';
    expect(build('At Saturday.', longHistory(2)).prompt).not.toContain(STRATEGY_SHIFT);
    const wrong = { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' } } as unknown as HistoryTurn['languageTurn'];
    const stuck = build('At Saturday.', [u('x'), a('r1', wrong), u('y'), a('r2', wrong)]); expect(stuck.research.stuck).toBe(true); expect(stuck.prompt).toContain(STRATEGY_SHIFT);
  });
  it('coverage lists the criteria the learner has not shown, from the second turn on', () => {
    process.env.NODE_ENV = 'test'; process.env.ENARA_RESEARCH_IMPROVE = 'coverage';
    const r = build('At Saturday.', longHistory(2)); expect(r.research.uncovered.length).toBe(3); expect(r.prompt).toContain('Uses in with months'); expect(build('hello', []).prompt).not.toContain('Success criteria they have not shown yet');
  });
  it('never removes an answer-hiding rule: first-try rule and no-completed-answer wording remain with all three on', () => {
    process.env.NODE_ENV = 'test'; process.env.ENARA_RESEARCH_IMPROVE = 'closing,strategy,coverage';
    const { prompt } = build('Can you give me one exercise?', []); expect(prompt).toMatch(/no rule, no reminder and no example before their first try/i);
    expect(CLOSING_RECAP).toMatch(/never write a completed answer to an open exercise/i); expect(STRATEGY_SHIFT).toMatch(/Never write the corrected form of the open task/i);
  });
});
