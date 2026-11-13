import { describe, expect, it } from 'vitest';
import * as LTC from '../src/services/languageTeachingContext';

// Fix 7 (learning simulation): 12 messages did no better than 6; the tutor moved on with the
// wrong belief still in place. After an assisted success it now asks for the rule in the
// learner's own words before any new task, and checks that statement on the next turn.
describe('fix 7: check the rule in their own words before moving on', () => {
  it('after an assisted success the tutor asks for the rule and gives no new exercise yet', () => {
    expect(LTC.RULE_SUMMARY).toMatch(/in your own words/i);
    expect(LTC.RULE_SUMMARY).toMatch(/do not give the next exercise/i);
  });
  it('detects that the last tutor message asked for the rule', () => {
    const f = (LTC as unknown as { askedForRule: (t: string) => boolean }).askedForRule;
    expect(f('Great! Now tell me the rule in your own words.')).toBe(true);
    expect(f('Good. Next exercise: ...')).toBe(false);
  });
  it('checking their rule: confirm with "Remember:" if right, correct only the wrong part if not', () => {
    expect(LTC.RULE_CHECK).toMatch(/Remember:/);
    expect(LTC.RULE_CHECK).toMatch(/only the wrong part/i);
    expect(LTC.RULE_CHECK).toMatch(/say it again/i);
  });
});
