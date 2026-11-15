import { describe, expect, it } from 'vitest';
import { detectLiveError, diagnoseError, type LessonItem } from '../src/services/languageLearningState';
import { applyLiveErrors } from '../src/services/learnerLanguageProfile';
import { LIVE_ERROR_LINE } from '../src/services/languageTeachingContext';
import { engineV2 } from '../src/services/engineV2';
import { SPEC, u, a, open, right, withEnv, build, evidence } from './esl5Helpers';

// ESL5 change 1 (liveError): framework §3 (explicit correction tied to this learner's own error) and §9 (library of expected Arabic-L1 errors).
const items = SPEC.items as LessonItem[];
const POS: [string, string][] = [['He is doctor', 'article_omitted'], ['I saw apple', 'article_omitted'], ['He is good doctor', 'article_omitted'], ['I am teacher', 'article_omitted'],
  ['She teacher', 'copula_omitted'], ['He very tall', 'copula_omitted'], ['The weather very hot', 'copula_omitted'], ['My sister teacher', 'copula_omitted'], ['She a teacher', 'copula_omitted']];
const NEG = ['He is a doctor', 'I saw an apple', 'She is a teacher', 'He is very tall', 'I saw apples', 'He likes music', 'She teaches English', 'I saw it', 'He very much likes tea',
  'I watch TV', 'I am tired', 'She is happy', 'They are students', 'He is the teacher', 'It is my book', 'I need help', 'I love my sister', 'He went to school', 'I like apple'];

describe('switch wiring', () => {
  it('off by default, not part of "all", on by name or through the esl5 bundle; esl5 itself is not turned on by "all"', () => {
    for (const f of ['liveError', 'releaseAfterTwo', 'reviewOpen', 'fadeKnown', 'ownSentence'] as const) {
      withEnv('', () => expect(engineV2(f)).toBe(false));
      withEnv('all', () => expect(engineV2(f)).toBe(false));
      withEnv(f, () => expect(engineV2(f)).toBe(true));
      withEnv('esl5', () => expect(engineV2(f)).toBe(true));
      withEnv('levelExplicit', () => expect(engineV2(f)).toBe(false));
    }
    withEnv('esl5', () => { expect(engineV2('levelExplicit')).toBe(false); expect(engineV2('memory')).toBe(false); });
  });
});

describe('detection (conservative)', () => {
  it('finds article and copula omission', () => { for (const [s, c] of POS) expect(detectLiveError(s)?.code, s).toBe(c); });
  it('leaves correct look-alikes alone', () => { for (const s of NEG) expect(detectLiveError(s), s).toBeNull(); });
  it('diagnoseError is unchanged with the switch off and names the live error with it on', () => {
    withEnv('', () => expect(diagnoseError('I saw apple', items[0])?.code).toBe('unknown'));
    withEnv('liveError', () => expect(diagnoseError('I saw apple', items[0])?.code).toBe('article_omitted'));
    withEnv('liveError', () => expect(diagnoseError('He is doctor', items[1])?.code).toBe('article_omitted'));
    withEnv('liveError', () => expect(diagnoseError('I saw an apple', items[0])).toBeNull());
  });
  it('cues never contain an item answer', () => {
    withEnv('liveError', () => {
      for (const it of items) for (const [s] of POS) {
        const d = diagnoseError(s, it); if (!d) continue;
        for (const f of [...(it.targetForms ?? []), ...(it.acceptedAnswers ?? [])]) expect(new RegExp(`\\b${f}\\b`, 'i').test(d.cue), `${d.code} cue vs ${f}`).toBe(false);
      }
    });
  });
});

describe('the reply targets the live error', () => {
  const hist = [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1'))];
  it('"I saw apple" gets an omission contrast instruction, not an a/an choice explanation', () => {
    const on = withEnv('levelExplicit,liveError', () => build('I saw apple', hist));
    expect(on.prompt).toContain(LIVE_ERROR_LINE('article_omitted'));
    expect(on.prompt).toMatch(/OMISSION, not a choice between a and an/);
    expect(on.prompt).not.toMatch(/First time this lesson's rule comes up/); // no a/an sub-rule line
    expect(on.prompt).not.toContain('Uses an before a vowel sound").');
    expect(on.prompt).toMatch(/give one new item that tests the error type named above/);
    expect(on.ruleFirst).toBeUndefined();
    expect(withEnv('levelExplicit,liveError', () => evidence(on)).liveError).toBe('article_omitted');
    const off = withEnv('levelExplicit', () => build('I saw apple', hist));
    expect(off.prompt).toMatch(/First time this lesson's rule comes up/);
    expect(off.prompt).not.toMatch(/OMISSION/);
    expect(withEnv('levelExplicit', () => evidence(off)).liveError).toBeUndefined();
  });
  it('copula omission gets the be-verb contrast', () => {
    const on = withEnv('liveError', () => build('She teacher', [u('Write a sentence about your sister.'), a('Write one sentence about your sister.')]));
    expect(on.prompt).toContain(LIVE_ERROR_LINE('copula_omitted'));
  });
  it('a question is never read as a live error', () => {
    const on = withEnv('liveError', () => build('What is apple?', []));
    expect(on.signals.liveError).toBeUndefined();
  });
  it('the previous target is read back so a later correct answer can be credited', () => {
    const h = [...hist, u('I saw apple'), a('Not quite. Try: She has ___ cat.', { ...open('a1'), liveError: 'article_omitted' })];
    const c = withEnv('liveError', () => build('She has a cat', h));
    expect(c.signals.liveTarget).toBe('article_omitted');
  });
});

describe('learner record: codes and counts only', () => {
  it('counts seen and marks lastCorrect', () => {
    const r1 = applyLiveErrors(undefined, { liveError: 'article_omitted' });
    expect(r1).toEqual({ article_omitted: { seen: 1, lastCorrect: false } });
    const r2 = applyLiveErrors(r1, { liveCorrect: 'article_omitted' });
    expect(r2).toEqual({ article_omitted: { seen: 1, lastCorrect: true } });
    const r3 = applyLiveErrors(r2, { liveError: 'article_omitted' });
    expect(r3.article_omitted).toEqual({ seen: 2, lastCorrect: false });
    expect(JSON.stringify(r3)).not.toMatch(/apple|saw/);
    expect(applyLiveErrors(r3, { liveCorrect: 'copula_omitted' })).toEqual(r3); // a type never seen is not invented
  });
  it('right(...) fixture sanity', () => { expect(right('a1', 2).assessment.verdict).toBe('CORRECT'); });
});
