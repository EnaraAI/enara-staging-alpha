import { describe, expect, it } from 'vitest';
import {
  BRIEF_MAX_LINES, dayRollup, habitsLines, habitsSummary, lastSessionLine, learnerBrief, parseAccommodations, parseFirstLanguage, parseInterests, profileLines,
  sessionMethodOutcome, summarizeTurns, whatWorksFrom,
} from '../src/services/learnerMemory';
import { engineV2 } from '../src/services/engineV2';
import { u, a, open, withEnv, build } from './esl5Helpers';

// Learner memory phases 2-4 (owner "go for all phases", 20 Nov 2026). Code-built memory, short brief, fixed codes, no free text.
const t = (min: number) => new Date(Date.UTC(2026, 10, 20, 9, min));
const ai = (min: number, lt: object, teaching: object = {}) => ({ role: 'ai', timestamp: t(min), meta: { languageTurn: lt, teaching } });
const user = (min: number) => ({ role: 'user', timestamp: t(min) });

describe('phase 2: session summary', () => {
  const msgs = [
    user(0), ai(1, { activeItem: { lessonItemId: 'a1' }, lessonId: 'L1' }, { objectiveId: 'o1', primary: 'direct_instruction' }),
    user(2), ai(3, { answeringCheck: true, assessment: { verdict: 'CORRECT' }, activeItem: { lessonItemId: 'a2' } }, { objectiveId: 'o1', primary: 'direct_instruction' }),
    user(4), ai(5, { answeringCheck: true, assessment: { verdict: 'INCORRECT' }, diagnosis: 'article_omitted', hintLevel: 1 }, { objectiveId: 'o1', primary: 'direct_instruction' }),
    user(6), ai(7, { answeringCheck: true, assessment: { verdict: 'INCORRECT' }, diagnosis: 'article_omitted', hintLevel: 2 }, { objectiveId: 'o1', primary: 'direct_instruction' }),
  ];
  it('counts, answered items, the most common error, where it stopped and the next step (code only)', () => {
    const s = summarizeTurns(msgs as never)!;
    expect([s.right, s.wrong, s.learnerTurns]).toEqual([1, 2, 4]);
    expect(s.answeredItemIds.sort()).toEqual(['a1', 'a2']);
    expect(s.stuckOn).toBe('article_omitted');
    expect(s.nextStep).toBe('reteach');
    expect(s.lessonId).toBe('L1');
    expect(s.objectiveId).toBe('o1');
  });
  it('the opening line is plain words with no learner text', () => {
    const line = lastSessionLine({ endedAt: t(7), right: 1, wrong: 2, stuckOn: 'article_omitted', stoppedWithOpenItem: false, nextStep: 'reteach' }, 'a and an', new Date(Date.UTC(2026, 10, 22, 9)), () => 'leaving out a/an/the');
    expect(line).toBe('- Last session (2 days ago, "a and an"): 1 right, 2 wrong; stuck on leaving out a/an/the. Start here: reteach the point simply, then one easy item.');
  });
  it('the brief has a heading and at most 8 lines, errors first', () => {
    const b = learnerBrief([['e1', 'e2', 'e3', 'e4', 'e5'], ['s1'], ['p1', 'p2', 'p3', 'p4']]);
    expect(b[0]).toMatch(/^Learner memory/);
    expect(b.length).toBe(1 + BRIEF_MAX_LINES);
    expect(b[1]).toBe('e1');
    expect(learnerBrief([[], []])).toEqual([]);
  });
  it('an item answered in an earlier session on this lesson is not offered again as next (sessionMemory on)', () => {
    const H = [u('Can I have an exercise?'), a('Complete: They ___ (be) happy.', open('a3')), u('are'), a('Yes.', { assessment: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [1], next: 'NONE', source: 'tutor_assessment' }, activeItem: null })];
    expect(withEnv('levelExplicit,esl5,planner2,sessionMemory', () => build('More please', H as never, { priorAnswered: ['a1'] })).signals.nextLessonItem?.id).toBe('a2');
    expect(withEnv('levelExplicit,esl5,planner2', () => build('More please', H as never, { priorAnswered: ['a1'] })).signals.nextLessonItem?.id).toBe('a1');
  });
});

describe('phase 3: profile and habits', () => {
  it('only fixed codes are accepted', () => {
    expect(parseFirstLanguage('ur')).toBe('ur');
    expect(parseFirstLanguage('klingon')).toBeUndefined();
    expect(parseInterests(['football', 'animals'])).toEqual(['football', 'animals']);
    expect(parseInterests(['football', 'my cat Tom'])).toBeUndefined();
    expect(parseInterests(['a', 'b', 'c', 'd', 'e', 'f'])).toBeUndefined();
    expect(parseAccommodations(['extra_time'])).toEqual(['extra_time']);
  });
  it('the model gets the effect of an accommodation, never the reason; Arabic needs no line', () => {
    expect(profileLines({ firstLanguage: 'ar', interests: [], accommodations: [] })).toEqual([]);
    const lines = profileLines({ firstLanguage: 'ur', interests: ['football'], accommodations: ['typed_instead_of_voice', 'fewer_items'] }).join('\n');
    expect(lines).toMatch(/Urdu \(not Arabic\): do not use Arabic comparisons/);
    expect(lines).toMatch(/football/);
    expect(lines).toMatch(/typed answers are fine; never ask them to speak/);
    expect(lines).not.toMatch(/disab|dyslex|health|diagnos/i);
  });
  it('a day rollup and a 30-day summary; back after 7+ days gives a review line', () => {
    const r = dayRollup([{ sessionId: 's1', at: t(0) }, { sessionId: 's1', at: t(5) }, { sessionId: 's2', at: t(40) }]);
    expect(r).toEqual({ sessions: 2, minutes: 8, firstHourUtc: 9, lastHourUtc: 9 });
    const now = new Date(Date.UTC(2026, 10, 20));
    const h = habitsSummary([{ day: new Date(Date.UTC(2026, 10, 1)), sessions: 1, minutes: 10, firstHourUtc: 15 }, { day: new Date(Date.UTC(2026, 10, 10)), sessions: 2, minutes: 20, firstHourUtc: 15 }], now);
    expect(h).toMatchObject({ activeDays: 2, sessions: 3, avgMinutesPerActiveDay: 15, usualTime: 'evening', daysSinceLast: 10, longestGapDays: 9, returnedAfterGap: true });
    expect(habitsLines(h)[0]).toMatch(/back after 10 days/);
    expect(habitsLines({ ...h, daysSinceLast: 2 })).toEqual([]);
  });
});

describe('phase 4: what works (view only)', () => {
  it('per method: sessions and sessions with a right answer on their own (no hint)', () => {
    const s1 = sessionMethodOutcome([ai(1, { answeringCheck: true, assessment: { verdict: 'CORRECT' } }, { primary: 'worked_example' })] as never);
    const s2 = sessionMethodOutcome([ai(1, { answeringCheck: true, assessment: { verdict: 'CORRECT' }, hintLevel: 2 }, { primary: 'worked_example' })] as never);
    expect([s1, s2]).toEqual([{ method: 'worked_example', independentSuccess: true }, { method: 'worked_example', independentSuccess: false }]);
    expect(whatWorksFrom([s1, s2, { method: 'direct_instruction', independentSuccess: true }])).toEqual([
      { method: 'worked_example', sessions: 2, withIndependentSuccess: 1, rate: 0.5 },
      { method: 'direct_instruction', sessions: 1, withIndependentSuccess: 1, rate: 1 },
    ]);
  });
});

describe('switches', () => {
  it('each phase is named-only and off by default; "all" does not turn them on', () => {
    for (const f of ['workOn', 'sessionMemory', 'learnerProfile', 'whatWorks'] as const) {
      expect(withEnv('', () => engineV2(f))).toBe(false);
      expect(withEnv('all', () => engineV2(f))).toBe(false);
      expect(withEnv(f, () => engineV2(f))).toBe(true);
    }
  });
});
