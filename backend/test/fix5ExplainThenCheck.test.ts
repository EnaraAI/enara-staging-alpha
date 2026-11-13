import { describe, expect, it } from 'vitest';
import * as LTC from '../src/services/languageTeachingContext';

// Fix 5 (learning simulation): most simulated learners kept their wrong belief after
// hint-only support. After two misses the tutor names the belief and teaches the rule
// clearly (different-word example, item answer still hidden); after an assisted success
// it ends with a one-line rule summary.
describe('fix 5: explain clearly after two misses, then summarise', () => {
  const sig = (o: object) => ({ answeringCheck: true, keyVerdict: 'INCORRECT', learning: { attemptsOnItem: 1 }, activeLessonItem: { id: 'g1', prompt: 'x' }, ...o });
  it('teaches the rule after the second miss, not before', () => {
    const f = (LTC as unknown as { supportStage: (s: unknown) => string | null }).supportStage;
    expect(f(sig({ learning: { attemptsOnItem: 0 } }))).toBeNull();
    expect(f(sig({}))).toBe('teach_rule');
    expect(f(sig({ answeringCheck: false, whyAfterAttempt: true, learning: { attemptsOnItem: 2 } }))).toBe('teach_rule');
  });
  it('summarises after a success that followed a miss', () => {
    const f = (LTC as unknown as { supportStage: (s: unknown) => string | null }).supportStage;
    expect(f(sig({ keyVerdict: 'CORRECT' }))).toBe('summarise');
    expect(f(sig({ keyVerdict: 'CORRECT', learning: { attemptsOnItem: 0 } }))).toBeNull();
  });
  it('the texts name the belief, keep the item answer hidden, and give a one-line rule', () => {
    expect(LTC.TEACH_RULE).toMatch(/name their belief/i);
    expect(LTC.TEACH_RULE).toMatch(/different word/i);
    expect(LTC.TEACH_RULE).toMatch(/not this item's answer/i);
    expect(LTC.RULE_SUMMARY).toMatch(/Remember:/);
  });
});
