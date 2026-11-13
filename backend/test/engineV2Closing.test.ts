import { afterEach, describe, expect, it } from 'vitest';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, finalizeLanguageTurn, researchSignals, isClosingTurn, CLOSING_RECAP, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import { engineV2 } from '../src/services/engineV2';
import type { HistoryTurn } from '../src/services/languageLearningState';

// Closing recap + independent self-grade check (both default OFF, named-only: not part of "all"). Go through the real engine functions.
const SPEC: LanguageSpec = { objectives: ['Use in, on and at with time words'], successCriteria: ['Uses at with clock times', 'Uses in with months'], grammar: ['in/on/at'], items: [
  { id: 'i1', prompt: 'Write in, on or at: My train leaves ___ 5 o\'clock.', acceptedAnswers: ['at'], targetForms: ['at'], criteria: [1] },
  { id: 'i2', prompt: 'Write in, on or at: They get married ___ April.', acceptedAnswers: ['in'], targetForms: ['in'], criteria: [2] }] };
const LESSON = { title: 'Time prepositions', spec: SPEC };
const li = { id: 'lesson:i2', source: 'lesson' as const, lessonItemId: 'i2' };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: unknown): HistoryTurn => ({ role: 'assistant', content, languageTurn: languageTurn as HistoryTurn['languageTurn'] });
const open = { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i2' }, activeItem: li };
const wrong = { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li, hintLevel: 1 };
const early = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', open)];
const late = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', open), u('on April'), a('Think about the month.', wrong), u('at April'), a('Look at the word.', wrong), u('on April'), a('Still the month.', wrong), u('at April'), a('Again.', wrong)];
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
function build(message: string, history: HistoryTurn[], withResearch = false) {
  const signals = detectTurnSignals(message, history, LESSON);
  const moves = selectLanguageMoves({ band: levelBand('A2'), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const research = withResearch ? researchSignals(history, signals, SPEC) : undefined;
  const ctx: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves, ...(research ? { research } : {}) };
  return { ctx, prompt: renderLanguageContextPrompt(ctx), signals, research };
}

describe('switches', () => {
  it('closing and selfCheck are off by default and are NOT part of "all"', () => {
    delete process.env.ENARA_ENGINE_V2; expect(engineV2('closing')).toBe(false); expect(engineV2('selfCheck')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all'; expect(engineV2('closing')).toBe(false); expect(engineV2('selfCheck')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'closing,selfCheck'; expect(engineV2('closing')).toBe(true); expect(engineV2('selfCheck')).toBe(true);
  });
});

describe('closing', () => {
  it('prompt: closing instruction only from the 5th learner message, and only with the switch', () => {
    delete process.env.ENARA_ENGINE_V2; expect(build('on April', late, true).prompt).not.toContain(CLOSING_RECAP);
    process.env.ENARA_ENGINE_V2 = 'closing';
    expect(build('on April', early, true).prompt).not.toContain(CLOSING_RECAP);
    const l = build('on April', late, true); expect(isClosingTurn(l.research!)).toBe(true); expect(l.prompt).toContain(CLOSING_RECAP);
  });
  it('engine appends the "own words" ask when the model leaves it out, once, and only on the closing turn', () => {
    process.env.ENARA_ENGINE_V2 = 'closing';
    const l = build('on April', late, true); const lang = { ...l.ctx, prompt: l.prompt } as LanguageTeachingContext;
    const out = applyReplyGuards(lang, 'Recap: months take in.', 'on April').text; expect(out).toMatch(/Tell me the rule in your own words\.$/);
    expect(applyReplyGuards(lang, out, 'on April').text.match(/own words/g)).toHaveLength(1);
    const e = build('on April', early, true); expect(applyReplyGuards({ ...e.ctx, prompt: e.prompt } as LanguageTeachingContext, 'Try again.', 'on April').text).toBe('Try again.');
    delete process.env.ENARA_ENGINE_V2; expect(applyReplyGuards(lang, 'Recap: months take in.', 'on April').text).toBe('Recap: months take in.');
  });
});

describe('selfCheck (independent check on the tutor grade)', () => {
  const fin = (learnerText: string, h: HistoryTurn[]) => { const { ctx } = build(learnerText, h); return finalizeLanguageTurn(ctx, { reply: 'Good, that is right.', learnerText, messageId: 'm', parsed: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [2], next: 'NEW_ITEM' } }); };
  it('off: a wrong answer the tutor graded CORRECT is credited (the gap)', () => {
    delete process.env.ENARA_ENGINE_V2; const r = fin('on April', late); expect((r.assessment as { verdict: string }).verdict).toBe('CORRECT');
  });
  it('on: the grade is held back (AMBIGUOUS, no criteria, same item) when the answer has no target form', () => {
    process.env.ENARA_ENGINE_V2 = 'selfCheck'; const r = fin('on April', late); const x = r.assessment as { verdict: string; criteria: number[]; next: string };
    expect(x.verdict).toBe('AMBIGUOUS'); expect(x.criteria).toEqual([]); expect(x.next).toBe('SAME_ITEM'); expect(r.qualityFlags).toContain('self_grade_unverified');
  });
  it('on: a correct answer is still credited (key match), and an open item is never held back', () => {
    process.env.ENARA_ENGINE_V2 = 'selfCheck'; expect((fin('in', late).assessment as { verdict: string }).verdict).toBe('CORRECT');
    expect((fin('They get married in April', late).assessment as { verdict: string }).verdict).toBe('CORRECT');
  });
});
