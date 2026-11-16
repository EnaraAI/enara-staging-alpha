import { describe, expect, it } from 'vitest';
import { REVIEW_OPEN_LINE, REVIEW_CLOSE_LINE, CLOSING_RECAP, SHORT_RECAP, learnerAsks, hasTwoAsks } from '../src/services/languageTeachingContext';
import { applyReplyGuards, REVIEW_CLOSE_FALLBACK } from '../src/services/languageTurnPipeline';
import { liveErrorTypes } from '../src/services/learnerLanguageProfile';
import { u, a, open, right, withEnv, build, evidence } from './esl5Helpers';

// ESL5 change 3 (reviewOpen): framework §7 (spaced retrieval as recall attempts, not re-explanation).
const REC = { live: ['article_omitted', 'copula_omitted'], knownPoints: {} };
const ENV = 'levelExplicit,shortRecap,reviewOpen';

describe('live error types from the record', () => {
  it('liveErrors not yet answered correctly, then recorded types without two independent successes; codes only', () => {
    const t = new Date();
    expect(liveErrorTypes({ liveErrors: { article_omitted: { seen: 3, lastCorrect: false }, copula_omitted: { seen: 1, lastCorrect: true } },
      entries: [{ code: 'missing_third_person_s', occurrences: 2, lastSeenAt: t, independentStreak: 0 }, { code: 'pronoun_omitted', occurrences: 1, lastSeenAt: t, independentStreak: 2 }, { code: 'unknown', occurrences: 5, lastSeenAt: t, independentStreak: 0 }] }))
      .toEqual(['article_omitted', 'missing_third_person_s']);
  });
});

describe('session 2 opens with recall', () => {
  it('first message of a later session: recall item from memory, no re-explanation, no lesson item, no rule line', () => {
    const c = withEnv(ENV, () => build('Give me an exercise', [], { record: REC }));
    expect(c.prompt).toContain(REVIEW_OPEN_LINE(['article_omitted', 'copula_omitted']));
    expect(c.prompt).toMatch(/answer from memory/);
    expect(c.prompt).toMatch(/No rule, no explanation and no example before it/);
    expect(c.prompt).not.toMatch(/Lesson item to present now/);
    expect(c.moves.map((m) => m.id)).not.toContain('present_lesson_item');
    expect(c.ruleFirst).toBeUndefined();
    expect(withEnv(ENV, () => evidence(c)).reviewOpen).toEqual(['article_omitted', 'copula_omitted']);
  });
  it('the second recall item comes in the next reply, and only once', () => {
    const h = [u('hi'), a('Welcome back! Complete: She has ___ cat.', { ...open('a1'), reviewOpen: ['article_omitted', 'copula_omitted'] })];
    const c = withEnv(ENV, () => build('a', h, { record: REC }));
    expect(c.prompt).toMatch(/second and last recall item, on leaving out am\/is\/are/);
    expect(withEnv(ENV, () => evidence(c)).reviewOpen).toBeUndefined();
    const h3 = [...h, u('a'), a('Right. Now: My bag ___ heavy.', right('a1', 2))];
    expect(withEnv(ENV, () => build('is', h3, { record: REC })).prompt).not.toMatch(/recall item/);
  });
  it('first session (no record) and switch off: unchanged opening', () => {
    expect(withEnv(ENV, () => build('Give me an exercise', [])).prompt).not.toMatch(/later session/);
    const off = withEnv('levelExplicit,shortRecap', () => build('Give me an exercise', [], { record: REC }));
    expect(off.prompt).not.toMatch(/later session/); expect(off.prompt).toMatch(/Lesson item to present now/);
  });
});

describe('closing is a new item, not a rule recap', () => {
  const long = [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1')), u('an'), a('Correct! Next: He is ___ doctor.', right('a1', 2, 'a2')), u('a'), a('Correct! Now: They ___ (be) happy.', right('a2', 1, 'a3')), u('are'), a('Correct! Write one sentence about your friend.', right('a3', 1))];
  it('the closing line asks for one new item in a new situation on a live error type', () => {
    const c = withEnv(ENV, () => build('My friend is doctor', long, { record: REC }));
    expect(c.prompt).toContain(REVIEW_CLOSE_LINE('article_omitted'));
    expect(c.prompt).not.toContain(SHORT_RECAP); expect(c.prompt).not.toContain(CLOSING_RECAP);
    const off = withEnv('levelExplicit,shortRecap', () => build('My friend is doctor', long));
    expect(off.prompt).toContain(SHORT_RECAP);
  });
  it('guards: no rule ask appended; a rule ask next to the item is removed; a task-free reply gets one item; never more than one task; once only', () => {
    const c = withEnv(ENV, () => build('My friend is a doctor', long, { record: REC }));
    const item = 'Good. New one: My uncle ___ engineer. Write the missing word.';
    const g1 = withEnv(ENV, () => applyReplyGuards(c, item, 'x'));
    expect(g1.text).toBe(item); expect(g1.closingAsk).toBe('added');
    const two = withEnv(ENV, () => applyReplyGuards(c, `${item}\nTell me the rule in your own words.`, 'x'));
    expect(two.text).not.toMatch(/own words/); expect(learnerAsks(two.text)).toHaveLength(1); expect(hasTwoAsks(two.text)).toBe(false);
    const recapOnly = withEnv(ENV, () => applyReplyGuards(c, 'Well done today. Tell me the rule in your own words.', 'x'));
    expect(recapOnly.text).not.toMatch(/own words/); expect(recapOnly.text).toContain(REVIEW_CLOSE_FALLBACK); expect(learnerAsks(recapOnly.text)).toHaveLength(1);
    const none = withEnv(ENV, () => applyReplyGuards(c, 'Well done today.', 'x'));
    expect(none.text).toContain(REVIEW_CLOSE_FALLBACK); expect(learnerAsks(none.text)).toHaveLength(1);
    // once only: after the closing was added, the next turn is not a closing turn
    const after = [...long, u('My friend is a doctor'), a(item, { ...right('a3', 1), closingAsk: 'added' })];
    expect(withEnv(ENV, () => build('My uncle is an engineer', after, { record: REC })).prompt).not.toMatch(/close the lesson unit/);
  });
});
