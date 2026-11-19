import { describe, expect, it } from 'vitest';
import { RELEASE_TEXT, repeatedWrongAnswers } from '../src/services/languageTeachingContext';
import { u, a, withEnv, build } from './esl5Helpers';

// planner2c (PLN2c, amendment F deviation 2): a free answer (a task sentence, no course key) is graded only after the reply. The same wrong
// sentence sent again counts as a failed try now, so the "answer after two failed tries" rule also works in the task (PLN2c stuck adults).
const freeWrong = { assessment: { verdict: 'INCORRECT', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' } };
const ENV = 'levelExplicit,esl5,planner2';
const S = 'She work in an office every day.';
const H = [u('Hello! I need English for my job. Can we practise the present simple?'), a('Tell me about a person you work with. What does she do every day?'), u(S), a('Look at the verb after "She". Try again.', freeWrong)];
const released = (c: ReturnType<typeof build>) => c.moves.some((m) => m.reasons.includes('release_after_two_genuine_attempts'));

describe('planner2c: repeated wrong free answer', () => {
  it('counts the repeats (this message included); a different sentence or an earlier right grade is not a repeat', () => {
    expect(repeatedWrongAnswers(S, H as never)).toBe(2);
    expect(repeatedWrongAnswers(' she work in an office every day ', H as never)).toBe(2); // case and punctuation do not matter
    expect(repeatedWrongAnswers(S, [...H, u(S), a('Compare: I cook. He cooks. Try your sentence again.', freeWrong)] as never)).toBe(3);
    expect(repeatedWrongAnswers('She works in an office every day.', H as never)).toBe(0);
    expect(repeatedWrongAnswers(S, [...H.slice(0, 3), a('Good.', { assessment: { verdict: 'CORRECT' } })] as never)).toBe(0);
  });
  it('the second time the same wrong sentence comes, the tutor gives the answer with the reason (no more hints)', () => {
    const c = withEnv(ENV, () => build(S, H as never));
    expect(c.signals.repeatWrong).toBe(2);
    expect(c.signals.genuineFailedAttempts).toBe(2);
    expect(released(c)).toBe(true);
    expect(c.prompt).toContain(RELEASE_TEXT);
  });
  it('a new sentence is not released; planner2 off keeps today\'s behaviour', () => {
    const c = withEnv(ENV, () => build('She take the bus to work.', H as never));
    expect(c.signals.repeatWrong).toBeUndefined();
    expect(released(c)).toBe(false);
    const off = withEnv('levelExplicit,esl5', () => build(S, H as never));
    expect(off.signals.repeatWrong).toBeUndefined();
    expect(released(off)).toBe(false);
  });
});
