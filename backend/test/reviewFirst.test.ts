import { afterEach, describe, expect, it } from 'vitest';
import { detectTurnSignals, levelBand, ruleFirstDecision, reviewFirstAdjust, reviewFirstStep, REVIEW_FIRST_LINE, selectLanguageMoves, type LanguageSpec } from '../src/services/languageTeachingContext';
import type { HistoryTurn } from '../src/services/languageLearningState';

// reviewFirst (REVIEW_FIRST_PLAN, owner go 21 Nov 2026): ESL7 round 11 showed the session-2 opening prompt saying both "Reviews due: no rule before
// their try" (spacedReview) and "first time this rule comes up: state the rule" (ruleFirst); tutors followed the rule block, so the reviews did not
// run. With reviewFirst, the first one or two replies of a session are the due reviews only; the lesson and its first-time rule come after.
const SPEC: LanguageSpec = { objectives: ['Use am, is and are'], successCriteria: ['Uses am with I', 'Uses is with he, she and it'], grammar: ['be'], items: [
  { id: 'v1', prompt: 'Write am, is or are: She ___ my sister.', acceptedAnswers: ['is'], targetForms: ['is'], criteria: [2] }] };
const LESSON = { title: 'am, is, are', spec: SPEC };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string): HistoryTurn => ({ role: 'assistant', content });
const ON = 'spacedReview,ruleFirst,levelExplicit,reviewFirst';
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

function turn(message: string, history: HistoryTurn[], reviewsDue?: number) {
  const signals0 = detectTurnSignals(message, history, LESSON);
  const moves0 = selectLanguageMoves({ band: levelBand('A1'), targetLanguage: 'English', lessonStatus: 'structured', signals: signals0 });
  const rf = reviewFirstAdjust({ signals: signals0, moves: moves0, history, reviewsDue });
  const rule = rf.step ? undefined : ruleFirstDecision({ band: levelBand('A1'), masteryStatus: 'not_started', history, signals: rf.signals, spec: SPEC, moves: rf.moves }).ruleFirst;
  return { ...rf, rule };
}

describe('reviewFirst', () => {
  it('step: the first min(due, 2) replies of a session are reviews; then the lesson', () => {
    process.env.ENARA_ENGINE_V2 = ON;
    expect(reviewFirstStep([u('Hi, can we start?')], 1)).toBe(1);
    expect(reviewFirstStep([u('Hi'), a('Review 1'), u('is')], 1)).toBeUndefined();
    expect(reviewFirstStep([u('Hi'), a('Review 1'), u('is')], 3)).toBe(2);
    expect(reviewFirstStep([u('Hi'), a('R1'), u('x'), a('R2'), u('y')], 3)).toBeUndefined();
    expect(reviewFirstStep([u('Hi')], 0)).toBeUndefined();
    expect(reviewFirstStep([u('Hi')], undefined)).toBeUndefined();
  });

  it('ESL7 s7006/s7011 shape: opening reply with reviews due has no lesson item and no rule line; the line names the review and overrides the rule', () => {
    process.env.ENARA_ENGINE_V2 = ON;
    const t = turn('Hi! Can you give me an exercise on am, is and are?', [u('Hi! Can you give me an exercise on am, is and are?')], 2);
    expect(t.step).toBe(1);
    expect(t.signals.presentLessonItem).toBeUndefined();
    expect(t.moves.map((m) => m.id)).not.toContain('present_lesson_item');
    expect(t.rule).toBeUndefined();
    const line = REVIEW_FIRST_LINE(1, 2);
    expect(line).toMatch(/review 1 of 2/);
    expect(line).toMatch(/focus=E1/);
    expect(line).toMatch(/no rule, hint or example before their try/);
    expect(line).toMatch(/overrides any instruction above to state today's rule first/);
    expect(REVIEW_FIRST_LINE(2, 2)).toMatch(/if wrong: the rule in one plain sentence/);
  });

  it('after the reviews the lesson starts: lesson item and the first-time rule come back', () => {
    process.env.ENARA_ENGINE_V2 = ON;
    const h = [u('Hi! Give me an exercise.'), a('Review: fill in ...'), u('are'), a('Good. Review 2 ...'), u('is'), ];
    const t = turn('Give me an exercise.', [...h, u('Give me an exercise.')], 2);
    expect(t.step).toBeUndefined();
    expect(t.signals).toEqual(detectTurnSignals('Give me an exercise.', [...h, u('Give me an exercise.')], LESSON)); // the identity once the reviews are done
    // the rule decision runs again, exactly as without reviewFirst
    process.env.ENARA_ENGINE_V2 = 'spacedReview,ruleFirst,levelExplicit';
    expect(t.rule).toEqual(turn('Give me an exercise.', [...h, u('Give me an exercise.')], 2).rule);
  });

  it('no reviews due, or the switch off: unchanged', () => {
    process.env.ENARA_ENGINE_V2 = ON;
    const none = turn('Hi! Give me an exercise.', [u('Hi! Give me an exercise.')], 0);
    expect(none.step).toBeUndefined();
    expect(none.rule?.criteria.length ?? 0).toBeGreaterThan(0); // without reviews the first-time rule fires on the opening, as before
    expect(none.signals.presentLessonItem?.id).toBe('v1');
    process.env.ENARA_ENGINE_V2 = 'spacedReview,ruleFirst,levelExplicit';
    const off = turn('Hi! Give me an exercise.', [u('Hi! Give me an exercise.')], 2);
    expect(off.step).toBeUndefined();
    expect(off.signals.presentLessonItem?.id).toBe('v1');
    process.env.ENARA_ENGINE_V2 = 'ruleFirst,levelExplicit,reviewFirst'; // reviewFirst needs spacedReview
    expect(turn('Hi! Give me an exercise.', [u('Hi! Give me an exercise.')], 2).step).toBeUndefined();
  });

  it('the last-session "Start here" step is removed only from that clause', () => {
    const line = '- Last session (7 days ago, "am, is, are"): 2 right, 1 wrong. Start here: a one-item recall check.';
    expect(line.replace(/ Start here: [^.]*\./, '')).toBe('- Last session (7 days ago, "am, is, are"): 2 right, 1 wrong.');
  });
});
