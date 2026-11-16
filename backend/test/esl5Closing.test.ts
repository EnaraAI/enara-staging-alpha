import { describe, expect, it } from 'vitest';
import { RELEASE_TEXT, REVIEW_CLOSE_LINE, REVIEW_CLOSE_HOLD, REVIEW_CLOSE_ONE_TRY, REVIEW_CLOSE_RELEASE_LINE, CLOSING_RECAP, SHORT_RECAP, OWN_SENTENCE_TOPIC, genuineFailedAttempts } from '../src/services/languageTeachingContext';
import { u, a, open, wrong, li, withEnv, build, evidence } from './esl5Helpers';

// ESL5 instruction fix 2: the reviewOpen closing turn vs the hint ladder and releaseAfterTwo.
const ENV = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5';
const REC = { live: ['article_omitted'], knownPoints: {} };
const released = (c: ReturnType<typeof build>) => c.moves.some((m) => m.reasons.includes('release_after_two_genuine_attempts'));
// A reply stored without a marker keeps the old open item (next=SAME_ITEM), as in the ESL5 runner history and in production when the tutor omits it.
const stale = (verdict: string, extra: object = {}) => ({ assessment: { verdict, relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li('a2'), hintLevel: 1, ...extra });
const count = (c: ReturnType<typeof build>) => c.signals.genuineFailedAttempts ?? 0;

describe('no release at the closing turn before two genuine attempts on ONE task', () => {
  // ESL5 s500_LE_r1 turns 1-5: item solved, own sentence asked and answered wrong, a tutor item, then one empty answer -> released (bug).
  const S500 = [u('Give me an exercise'), a('Complete: He is ___ doctor.', open('a2')), u('a'), a('Yes. Write one sentence about a person you know.', stale('CORRECT', { ownSentence: 'asked' })),
    u('My sister is engineer.'), a('Missing word. Now: I have bag.', stale('INCORRECT', { ownSentence: 'feedback' })), u('x')];
  it('a solved item, an own-sentence answer and a new tutor item do not add up to two attempts', () => {
    const hist = [...S500.slice(0, -1), u('(I leave it empty, no word)')];
    const c = withEnv(ENV, () => build('(I leave it empty, no word)', S500.slice(0, -1) as never, { record: REC }));
    expect(count(c)).toBeLessThan(2);
    expect(released(c)).toBe(false);
    expect(c.prompt).not.toContain(RELEASE_TEXT);
    expect(withEnv(ENV, () => evidence(c)).answerReleased).toBeUndefined();
    expect(hist.length).toBe(7);
  });
  // ESL5 s502_LE_r2 turn 10: a correct answer to the tutor's own item after a correct own sentence -> released (bug).
  it('a correct answer after a success is never a release', () => {
    const h = [u('hello'), a('Complete: He is ___ doctor.', open('a2')), u('a'), a('Yes. Write one sentence about a person you know.', stale('CORRECT', { ownSentence: 'asked' })),
      u('My friend is a nurse.'), a('Yes. One more, alone: She has ___ umbrella.', stale('INCORRECT', { ownSentence: 'feedback' }))]; // key-based verdict on the stale item, as the runner stored it
    const c = withEnv(ENV, () => build('an', h as never, { record: REC }));
    expect(count(c)).toBeLessThan(2);
    expect(released(c)).toBe(false);
  });
  it('counting: a success resets; a released item and its new item do not carry over', () => {
    const items = [{ id: 'a2', prompt: 'Complete: He is ___ doctor.', acceptedAnswers: ['a'], targetForms: ['a'], criteria: [1] }];
    const sig = { learning: { activeItem: li('a2') }, learnerResponse: 'answer' as const, activeLessonItem: items[0] } as never;
    const h = [u('go'), a('Complete: He is ___ doctor.', open('a2')), u('the'), a('Not yet. Try again.', stale('INCORRECT')), u('an'), a('The answer is a. New one: She is ___ cook.', stale('INCORRECT', { answerReleased: true }))];
    expect(withEnv(ENV, () => genuineFailedAttempts('the', h as never, sig, items as never))).toBe(1);
    const h2 = [u('go'), a('Complete: He is ___ doctor.', open('a2')), u('the'), a('Not yet. Try again.', stale('INCORRECT'))];
    expect(withEnv(ENV, () => genuineFailedAttempts('an', h2 as never, sig, items as never))).toBe(2); // two genuine tries on one item still release
  });
  it('two genuine wrong tries on the same item at the closing turn: release, and its new item is the closing item (one task)', () => {
    const h = [u('hi'), a('Hello! Ready?'), u('yes'), a('Complete: I saw ___ apple.', open('a1')), u('a'), a('Look at the first sound. Try again.', wrong('a1')), u('the'), a('Think about vowels. Try again.', wrong('a1'))];
    const c = withEnv(ENV, () => build('a', h, { record: REC }));
    expect(released(c)).toBe(true);
    expect(c.prompt).toContain(RELEASE_TEXT);
    expect(c.prompt).toContain(REVIEW_CLOSE_RELEASE_LINE('article_omitted'));
    expect(c.prompt).not.toContain(REVIEW_CLOSE_LINE('article_omitted')); // its "never write a completed answer" contradicted the release
    expect(c.prompt).not.toMatch(/Do not ask them to retry this item[\s\S]*try it again themselves/);
  });
});

describe('closing turn wording', () => {
  const H4 = [u('hi'), a('Hello! Ready?'), u('yes'), a('Complete: I saw ___ apple.', open('a1')), u('a'), a('Look at the first sound. Try again.', wrong('a1')), u('ok'), a('Try: I saw ___ apple.', wrong('a1'))];
  it('a wrong answer on the open task at the closing turn keeps the hint/retry (no new item, no answer)', () => {
    const h = [u('hi'), a('Hello! Ready?'), u('yes'), a('Hi again.'), u('ok'), a('Complete: I saw ___ apple.', open('a1'))];
    const c = withEnv(ENV, () => build('a', [...h, u('fine'), a('Complete: I saw ___ apple.', open('a1'))], { record: REC }));
    expect(released(c)).toBe(false);
    expect(c.prompt).toContain(REVIEW_CLOSE_HOLD);
    expect(c.prompt).toContain(REVIEW_CLOSE_ONE_TRY.trim());
    expect(c.prompt).not.toContain(RELEASE_TEXT);
    expect(H4.length).toBe(8);
  });
  it('a key-correct answer at the closing turn: the closing item, one try, no hold', () => {
    const h = [u('hi'), a('Hello! Ready?'), u('yes'), a('Hi again.'), u('ok'), a('Complete: I saw ___ apple.', open('a1'))];
    const c = withEnv(ENV, () => build('an', [...h, u('fine'), a('Complete: I saw ___ apple.', open('a1'))], { record: REC }));
    expect(c.prompt).toContain(`${REVIEW_CLOSE_LINE('article_omitted')}${REVIEW_CLOSE_ONE_TRY}`);
    expect(c.prompt).not.toContain(REVIEW_CLOSE_HOLD);
  });
  it('no conflicting closing text: no rule recap ask, no own-sentence task, exactly one closing line', () => {
    const h = [u('hi'), a('Hello! Ready?'), u('yes'), a('Hi again.'), u('ok'), a('Complete: I saw ___ apple.', open('a1')), u('fine'), a('Complete: I saw ___ apple.', open('a1'))];
    for (const msg of ['a', 'an', 'hint please', "I don't know"]) {
      const c = withEnv(ENV, () => build(msg, h, { record: REC }));
      expect(c.prompt).not.toContain(CLOSING_RECAP); expect(c.prompt).not.toContain(SHORT_RECAP);
      expect(c.prompt).not.toContain(OWN_SENTENCE_TOPIC);
      expect(c.prompt.split('point to close the lesson unit').length - 1).toBe(1);
    }
  });
});
