import { describe, expect, it } from 'vitest';
import * as LS from '../src/services/languageLearningState';
import * as LTC from '../src/services/languageTeachingContext';

// r4.4 #3 (rebuilt): one independent success is not final. The tutor counts independent evidence
// across DIFFERENT tasks, asks for one more check in a new context before moving on, and probes
// the reasoning when an answer is only partly right.
const act = (item: string) => ({ id: `lesson:${item}`, source: 'lesson', lessonItemId: item });
// the tutor presents an item (no verdict yet)
const pres = (item: string) => ({ role: 'assistant' as const, content: 'item', languageTurn: { activeItem: act(item), hintLevel: 0, assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', item, source: 'tutor_assessment' } } });
// the tutor judges the answer to the current item as correct and sets the next item
const ok = (next: string) => ({ role: 'assistant' as const, content: 'ok', languageTurn: { activeItem: act(next), hintLevel: 0, assessment: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [1], next: 'NEW_ITEM', item: next, source: 'tutor_assessment' } } });
// the tutor judges the answer wrong and gives a hint on the same item
const hint = (item: string) => ({ role: 'assistant' as const, content: 'hint', languageTurn: { activeItem: act(item), hintLevel: 1, assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' } } });
const u = (t: string) => ({ role: 'user' as const, content: t });

describe('r4.4 #3 multi-success evidence', () => {
  it('counts independent evidence per distinct task, not per message', () => {
    const st = LS.deriveLearningState([u('a'), pres('i1'), u('b'), ok('i2'), u('c'), ok('i3')] as never);
    expect((st as unknown as { independentEvidence: Record<number, string[]> }).independentEvidence[1].sort()).toEqual(['lesson:i1', 'lesson:i2']);
  });
  it('an assisted success is not independent evidence', () => {
    const st = LS.deriveLearningState([u('a'), pres('i1'), u('b'), hint('i1'), u('c'), ok('i2')] as never);
    expect(((st as unknown as { independentEvidence: Record<number, string[]> }).independentEvidence[1] ?? []).length).toBe(0);
  });
  it('criteria text asks for one more check after a single independent success', () => {
    const once = LS.deriveLearningState([u('a'), pres('i1'), u('b'), ok('i2')] as never);
    const twice = LS.deriveLearningState([u('a'), pres('i1'), u('b'), ok('i2'), u('c'), ok('i3')] as never);
    const f = (LTC as unknown as { criteriaLines: (c: string[], l: unknown) => string[] }).criteriaLines;
    expect(f(['Adds -s'], once)[0]).toMatch(/shown on their own once: check it once more in a new context/);
    expect(f(['Adds -s'], twice)[0]).toMatch(/shown on their own in 2 different tasks/);
  });
  it('the tutor is told to probe the reasoning of a partly right answer', () => {
    expect(LTC.WHY_PROBE).toMatch(/partly right/i);
    expect(LTC.WHY_PROBE).toMatch(/ask one short question/i);
  });
});
