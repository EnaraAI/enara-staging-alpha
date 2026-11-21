import { afterEach, describe, expect, it } from 'vitest';
import { adaptiveSpacingOn, applyOutcome, scheduleWrong, SPACED_DAYS } from '../src/services/errorsToWorkOn';

// adaptiveSpacing (NEXT_PLAN item 4, owner go 21 Nov 2026): the next review date depends on how the learner did. An easy right (unassisted,
// first try) skips one more step; a right after a hint keeps the step and never closes; a wrong answer restarts at 1 day. The close rule
// stays: an error closes only after an unassisted right answer at least 2 days after the last wrong one.
const DAY = 86_400_000;
const t0 = new Date('2026-11-01T10:00:00Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);
const fresh = () => {
  const e: any = { status: 'open', rightStreak: 0, countedKeys: [], lastSeenAt: t0, occurrences: 1, statusHistory: [] };
  scheduleWrong(e, t0);
  return e;
};
const ON = 'workOn,spacedReview,adaptiveSpacing';
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('adaptiveSpacing', () => {
  it('needs spacedReview', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn,adaptiveSpacing';
    expect(adaptiveSpacingOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = ON;
    expect(adaptiveSpacingOn()).toBe(true);
  });

  it('an easy right too soon after the wrong one skips a step (1 day -> 7 days); a plain right moves one step (-> 3 days)', () => {
    process.env.ENARA_ENGINE_V2 = ON;
    const easy = fresh();
    applyOutcome(easy, { right: true, key: 's1', at: at(0.5), quality: 'easy' });
    expect(easy.status).toBe('open');
    expect(easy.reviewStep).toBe(2);
    expect(new Date(easy.nextReviewAt).getTime()).toBe(at(0.5 + SPACED_DAYS[2]).getTime());
    const plain = fresh();
    applyOutcome(plain, { right: true, key: 's1', at: at(0.5) });
    expect(plain.reviewStep).toBe(1);
    expect(new Date(plain.nextReviewAt).getTime()).toBe(at(0.5 + SPACED_DAYS[1]).getTime());
  });

  it('a right after a hint keeps the step and never closes, even after the delay', () => {
    process.env.ENARA_ENGINE_V2 = ON;
    const e = fresh();
    applyOutcome(e, { right: true, key: 's1', at: at(3), quality: 'assisted' });
    expect(e.status).toBe('open');
    expect(e.reviewStep).toBe(0);
    expect(e.rightStreak).toBe(0);
    expect(new Date(e.nextReviewAt).getTime()).toBe(at(3 + SPACED_DAYS[0]).getTime());
  });

  it('the close rule is kept: an unassisted right 2+ days after the last wrong closes; a wrong one restarts at 1 day', () => {
    process.env.ENARA_ENGINE_V2 = ON;
    const e = fresh();
    applyOutcome(e, { right: true, key: 's1', at: at(2), quality: 'easy' });
    expect(e.status).toBe('resolved');
    expect(e.statusHistory.at(-1).reason).toBe('unassisted_right_after_delay');
    applyOutcome(e, { right: false, key: 's2', at: at(5) });
    expect(e.status).toBe('open');
    expect(e.reviewStep).toBe(0);
    expect(new Date(e.nextReviewAt).getTime()).toBe(at(5 + SPACED_DAYS[0]).getTime());
  });

  it('switch off: quality is ignored (spacedReview as before)', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn,spacedReview';
    const e = fresh();
    applyOutcome(e, { right: true, key: 's1', at: at(0.5), quality: 'easy' });
    expect(e.reviewStep).toBe(1);
    const h = fresh();
    applyOutcome(h, { right: true, key: 's1', at: at(3), quality: 'assisted' });
    expect(h.status).toBe('resolved'); // the old path treats every right reaching applyOutcome as unassisted
  });
});
