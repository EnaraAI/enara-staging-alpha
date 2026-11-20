import { afterEach, describe, expect, it } from 'vitest';
import { applyOutcome, briefLines, reviewDue, scheduleWrong, SPACED_DAYS } from '../src/services/errorsToWorkOn';

// spacedReview (LIT_REVIEW_GAP_PLAN 3.1): reviews after 1, 3, 7, 21 days; an error closes only after an unassisted right answer at least
// 2 days after the last wrong; one more check 21 days after closing; a wrong answer reopens and restarts the schedule.
const DAY = 86_400_000;
const t0 = new Date('2026-11-01T10:00:00Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);
const fresh = () => {
  const e: any = { status: 'open', rightStreak: 0, countedKeys: [], lastSeenAt: t0, occurrences: 1, statusHistory: [] };
  scheduleWrong(e, t0);
  return e;
};
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('spacedReview on', () => {
  it('a new error is due one day later, not before', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn,spacedReview';
    const e = fresh();
    expect(new Date(e.nextReviewAt).getTime()).toBe(at(SPACED_DAYS[0]).getTime());
    expect(reviewDue(e, at(0.5))).toBe(false);
    expect(reviewDue(e, at(1))).toBe(true);
  });
  it('two rights on the same day do NOT close it (the old rule did); a right 2+ days after the last wrong does', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn,spacedReview';
    const e = fresh();
    applyOutcome(e, { right: true, key: 's1', at: at(0.2) });
    applyOutcome(e, { right: true, key: 's2', at: at(0.4) });
    expect(e.status).toBe('open');
    expect(e.reviewStep).toBe(2); // moved out to the 7-day step
    applyOutcome(e, { right: true, key: 's3', at: at(2) });
    expect(e.status).toBe('resolved');
    expect(e.statusHistory.at(-1).reason).toBe('unassisted_right_after_delay');
    expect(new Date(e.nextReviewAt).getTime()).toBe(at(2 + 21).getTime());
  });
  it('the 21-day check: due then, passed by a right answer; a wrong one reopens and restarts at 1 day', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn,spacedReview';
    const e = fresh();
    applyOutcome(e, { right: true, key: 's1', at: at(3) });
    expect(reviewDue(e, at(10))).toBe(false);
    expect(reviewDue(e, at(24))).toBe(true);
    const f = structuredClone(e);
    applyOutcome(e, { right: true, key: 's2', at: at(24) });
    expect(e.finalCheckAt).toEqual(at(24));
    expect(e.nextReviewAt).toBeUndefined();
    expect(reviewDue(e, at(60))).toBe(false);
    applyOutcome(f, { right: false, key: 's2', at: at(24) });
    expect(f.status).toBe('open');
    expect(new Date(f.nextReviewAt).getTime()).toBe(at(25).getTime());
  });
  it('the brief asks for an unassisted memory check, and marks the final check', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn,spacedReview';
    const lines = briefLines([{ code: 'EN-F-A2-GR-comparatives', title: 'Compare two things', errorCode: 'spelling_vowel', occurrences: 1, status: 'resolved' }]);
    expect(lines.join('\n')).toMatch(/no rule, hint or example before their try/);
    expect(lines.join('\n')).toMatch(/final check/);
  });
});

describe('spacedReview off: unchanged', () => {
  it('two independent rights in later sessions close the error, as before', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn';
    const e: any = { status: 'open', rightStreak: 0, countedKeys: [], lastSeenAt: t0, occurrences: 1, statusHistory: [] };
    applyOutcome(e, { right: true, key: 's1', at: at(0.2) });
    applyOutcome(e, { right: true, key: 's2', at: at(0.4) });
    expect(e.status).toBe('resolved');
    expect(e.nextReviewAt).toBeUndefined();
    expect(briefLines([{ errorCode: 'x', occurrences: 1 }])[0]).toMatch(/^- Errors to work on/);
  });
  it('"all" does not turn it on', () => {
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(briefLines([{ errorCode: 'x', occurrences: 1 }])[0]).toMatch(/^- Errors to work on/);
  });
});
