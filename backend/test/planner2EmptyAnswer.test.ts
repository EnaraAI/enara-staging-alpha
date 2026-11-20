import { describe, expect, it } from 'vitest';
import { RELEASE_TEXT, emptyAnswer } from '../src/services/languageTeachingContext';
import { u, a, open, noEval, withEnv, build, SPEC } from './esl5Helpers';

// planner2d (PLN2f: one stuck under-9): a child who leaves the gap empty never made a "genuine" try, so the answer was never given.
// For a child (trusted age band) an empty answer to the open item now counts as a failed try: the answer comes after two.
const ENV = 'levelExplicit,esl5,planner2';
const H1 = [u('Can I have an exercise?'), a('Complete: They ___ (be) happy.', open('a3'))];
const H2 = [...H1, u(''), a('A small word is missing in the gap. Try again: They ___ (be) happy.', noEval('a3'))];
const released = (c: ReturnType<typeof build>) => c.moves.some((m) => m.reasons.includes('release_after_two_genuine_attempts'));

describe('planner2d: a child\'s empty answer counts as a failed try', () => {
  it('recognises empty answers, and only those', () => {
    const item = SPEC.items![2];
    for (const t of ['', '   ', '___', '?', '...', '-', '(I leave it empty, no word)', '(empty)', 'blank', 'They ___ (be) happy.']) expect(emptyAnswer(t, item)).toBe(true);
    for (const t of ['is', 'They is happy.', "I don't know", 'no']) expect(emptyAnswer(t, item)).toBe(false);
  });
  it('a child: the second empty answer gives the answer with its reason', () => {
    const first = withEnv(ENV, () => build('___', H1 as never, { child: true }));
    expect(first.signals.emptyAnswer).toBe(true);
    expect(first.signals.genuineFailedAttempts).toBe(1);
    expect(released(first)).toBe(false);
    const second = withEnv(ENV, () => build('___', H2 as never, { child: true }));
    expect(second.signals.genuineFailedAttempts).toBe(2);
    expect(released(second)).toBe(true);
    expect(second.prompt).toContain(RELEASE_TEXT);
  });
  it('one empty answer plus one wrong answer also makes two tries', () => {
    const c = withEnv(ENV, () => build('is', H2 as never, { child: true }));
    expect(c.signals.genuineFailedAttempts).toBe(2);
    expect(released(c)).toBe(true);
  });
  it('not a child, or planner2 off: empty answers do not count (today\'s behaviour)', () => {
    const adult = withEnv(ENV, () => build('', H2 as never));
    expect(adult.signals.emptyAnswer).toBeUndefined();
    expect(adult.signals.genuineFailedAttempts ?? 0).toBe(0);
    expect(released(adult)).toBe(false);
    const off = withEnv('levelExplicit,esl5', () => build('', H2 as never, { child: true }));
    expect(off.signals.emptyAnswer).toBeUndefined();
    expect(released(off)).toBe(false);
  });
});
