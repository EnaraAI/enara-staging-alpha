import { describe, expect, it } from 'vitest';
import { REVIEW_OPEN_LINE, REVIEW_RECALL_FAIL, ruleFirstLine } from '../src/services/languageTeachingContext';
import { u, a, open, withEnv, build, evidence } from './esl5Helpers';

// ESL5 instruction fix 3: session-2 opening (reviewOpen recall vs the levelExplicit rule-first line). One rule: in a later session, rules introduced
// in an earlier session are recalled first (no rule line); the levelExplicit rule line is only for rules not introduced yet; a failed recall gets the
// rule line and a right/wrong contrast in the next reply.
const ENV = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5';
const FIRST_TIME = /First time this lesson's rule comes up|state the rule in ONE plain sentence of 20 words or fewer, no grammar jargon/;
const OPENING = 'Hello again! Can we practise a, an and the again today?';

describe('session 2 opening', () => {
  it('recall opening (live error types, rules introduced earlier): recall item only, no rule line, nothing recorded as introduced', () => {
    const rec = { live: ['article_omitted'], knownPoints: {}, introduced: ['lsn:1', 'lsn:2'] };
    const c = withEnv(ENV, () => build(OPENING, [], { record: rec }));
    expect(c.prompt).toContain(REVIEW_OPEN_LINE(['article_omitted']));
    expect(c.prompt).not.toMatch(FIRST_TIME);
    expect(c.ruleFirst).toBeUndefined();
    expect(withEnv(ENV, () => evidence(c)).rulesIntroduced).toBeUndefined();
    // before the fix the same opening also carried the levelExplicit "first time" rule line (short_explanation path)
    const old = withEnv(ENV.replace(',esl5', ',liveError,releaseAfterTwo,fadeKnown,ownSentence'), () => build(OPENING, [], { record: rec }));
    expect(old.prompt).toMatch(FIRST_TIME);
  });
  it('a rule not introduced in an earlier session still gets the levelExplicit rule line; one already introduced does not', () => {
    const hist = [u('hi'), a('Hello again! Recall: She is ___ teacher.', { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment' }, activeItem: { id: 'msg:r', source: 'tutor' } })];
    const fresh = withEnv(ENV, () => build('Give me an exercise', [], { record: { live: [], knownPoints: {}, introduced: ['lsn:1'] } }));
    expect(fresh.ruleFirst?.criteria).toEqual([2]); // item a1 (criterion 2) was never introduced
    expect(fresh.prompt).toMatch(FIRST_TIME);
    const known = withEnv(ENV, () => build('Give me an exercise', [], { record: { live: [], knownPoints: {}, introduced: ['lsn:1', 'lsn:2'] } }));
    expect(known.ruleFirst).toBeUndefined();
    expect(known.prompt).not.toMatch(FIRST_TIME);
    expect(known.prompt).toMatch(/Lesson item to present now/);
    expect(hist.length).toBe(2);
  });
  it('the reply after a recall item: if the recall failed, the rule line and a right/wrong contrast come now', () => {
    const rec = { live: ['article_omitted'], knownPoints: {}, introduced: ['lsn:1', 'lsn:2'] };
    const h = [u(OPENING), a('Welcome back! From memory: My aunt is ___ nurse.', { ...open('a2'), reviewOpen: ['article_omitted'] })];
    const c = withEnv(ENV, () => build('My aunt is nurse', h, { record: rec }));
    expect(c.prompt).toContain(REVIEW_RECALL_FAIL);
    expect(REVIEW_RECALL_FAIL).toMatch(/rule in ONE plain sentence/); expect(REVIEW_RECALL_FAIL).toMatch(/one right and one wrong example/);
    expect(c.prompt).not.toMatch(/no rule lecture/);
  });
  it('switches off (levelExplicit only): unchanged, the record is ignored', () => {
    const rec = { live: ['article_omitted'], knownPoints: {}, introduced: ['lsn:1', 'lsn:2'] };
    const c = withEnv('levelExplicit', () => build(OPENING, [], { record: rec }));
    expect(c.prompt).not.toContain(REVIEW_RECALL_FAIL); expect(c.prompt).not.toMatch(/later session/);
    expect(c.prompt).toContain(ruleFirstLine(c.ruleFirst!, undefined, false).slice(0, 40));
  });
});
