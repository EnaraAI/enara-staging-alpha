import { describe, expect, it } from 'vitest';
import { RELEASE_TEXT, guardedItems } from '../src/services/languageTeachingContext';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import { u, a, open, wrong, noEval, withEnv, build, evidence } from './esl5Helpers';

// ESL5 change 2 (releaseAfterTwo): framework §3 (explicit correction after prompts fail) and §4 (practice continues on a new item).
const P = [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1'))];
const ENV = 'levelExplicit,releaseAfterTwo';
const released = (c: ReturnType<typeof build>) => c.moves.some((m) => m.reasons.includes('release_after_two_genuine_attempts'));
const LEAK = 'The answer is "an". I saw an apple.';

describe('no release before two genuine attempts', () => {
  it('first wrong attempt: hint, open item still guarded, no answer in the guarded reply', () => {
    const c = withEnv(ENV, () => build('a', P));
    expect(c.signals.genuineFailedAttempts).toBe(1);
    expect(released(c)).toBe(false);
    expect(c.prompt).not.toContain(RELEASE_TEXT);
    expect(withEnv(ENV, () => guardedItems(c)).map((i) => i.id)).toContain('a1');
    expect(withEnv(ENV, () => applyReplyGuards(c, LEAK, 'a')).removed).toBeGreaterThan(0); // the leak guard still removes the early answer
    expect(withEnv(ENV, () => evidence(c)).answerReleased).toBeUndefined();
  });
  it('an answer request after one attempt is held as a hint (no early answer)', () => {
    const c = withEnv(ENV, () => build('just tell me the answer', [...P, u('a'), a('Look at the first sound of the next word. Try again.', wrong('a1'))]));
    expect(c.moves.map((m) => m.id)).not.toContain('answer_with_reasoning');
    expect(c.moves.some((m) => m.reasons.includes('release_held_until_two_genuine_attempts'))).toBe(true);
    // switch off: today's behaviour (answer after one attempt) is unchanged
    const off = withEnv('levelExplicit', () => build('just tell me the answer', [...P, u('a'), a('Look at the first sound of the next word. Try again.', wrong('a1'))]));
    expect(off.moves.map((m) => m.id)).toContain('answer_with_reasoning');
  });
});

describe('release after two', () => {
  const H2 = [...P, u('a'), a('Look at the first sound of apple. Try again.', wrong('a1'))];
  it('second genuine wrong attempt: answer with reason, right/wrong pair, then a NEW item; guards allow the answer on this turn only', () => {
    const c = withEnv(ENV, () => build('the', H2));
    expect(c.signals.genuineFailedAttempts).toBe(2);
    expect(released(c)).toBe(true);
    expect(c.prompt).toContain(RELEASE_TEXT);
    expect(RELEASE_TEXT).toMatch(/one-line reason/); expect(RELEASE_TEXT).toMatch(/right\/wrong pair/); expect(RELEASE_TEXT).toMatch(/ONE new item on the same point/);
    expect(c.prompt).not.toMatch(/ask them to try this item again/);
    expect(withEnv(ENV, () => guardedItems(c)).map((i) => i.id)).not.toContain('a1');
    const g = withEnv(ENV, () => applyReplyGuards(c, LEAK, 'the'));
    expect(g.removed).toBe(0); expect(g.text).toBe(LEAK); // the answer is allowed on the release turn
    expect(withEnv(ENV, () => evidence(c)).answerReleased).toBe(true);
  });
  it('a correct second answer (key) is not released', () => {
    const c = withEnv(ENV, () => build('an', H2));
    expect(released(c)).toBe(false);
  });
});

describe('what does not count as a genuine attempt', () => {
  it('"I don\'t know" and an empty reply do not count', () => {
    const H = [...P, u("I don't know"), a('Look at the first sound of apple. Try: I saw ___ apple.', noEval('a1')), u(' '), a('Try: I saw ___ apple.', wrong('a1'))];
    const c = withEnv(ENV, () => build('a', H));
    expect(c.signals.genuineFailedAttempts).toBe(1);
    expect(released(c)).toBe(false);
    const dk = withEnv(ENV, () => build("I don't know", [...P, u('a'), a('Look at the first sound. Try again: I saw ___ apple.', wrong('a1'))]));
    expect(dk.signals.genuineFailedAttempts).toBe(1);
    expect(released(dk)).toBe(false);
  });
  it('a copy of the prompt does not count', () => {
    const H = [...P, u('Complete: I saw ___ apple.'), a('Try: I saw ___ apple.', wrong('a1'))];
    const c = withEnv(ENV, () => build('I saw ___ apple', H));
    expect(c.signals.genuineFailedAttempts).toBe(0);
    expect(released(c)).toBe(false);
  });
  it('after two genuine misses, "I don\'t know" also gets the answer (it is the reply after two genuine failures)', () => {
    const H = [...P, u('a'), a('Look again: I saw ___ apple.', wrong('a1')), u('the'), a('Not yet: I saw ___ apple.', wrong('a1'))];
    const c = withEnv(ENV, () => build("I don't know", H));
    expect(c.signals.genuineFailedAttempts).toBe(2);
    expect(released(c)).toBe(true);
  });
});
