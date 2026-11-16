import { describe, expect, it } from 'vitest';
import { FADE_LINE, FADE_RETURN_LINE, FADE_CRITERION } from '../src/services/languageTeachingContext';
import { applyKnownPoints } from '../src/services/learnerLanguageProfile';
import { u, a, open, right, withEnv, build, evidence } from './esl5Helpers';

// ESL5 change 4 (fadeKnown): framework §2 (explicit instruction for novices, faded support once the learner knows the point).
const ENV = 'levelExplicit,ruleFirst,fadeKnown';
const RULE = /First time this lesson's rule comes up/;
const CRIT2 = 'Uses an before a vowel sound';

describe('criterion: two independent successes', () => {
  it('FADE_CRITERION is 2 and the record counts points', () => {
    expect(FADE_CRITERION).toBe(2);
    expect(applyKnownPoints(undefined, { knownInc: ['lsn:2'] })).toEqual({ 'lsn:2': 1 });
    expect(applyKnownPoints({ 'lsn:2': 1 }, { knownInc: ['lsn:2'] })).toEqual({ 'lsn:2': 2 });
    expect(applyKnownPoints({ 'lsn:2': 2 }, { knownReset: ['lsn:2'] })).toEqual({ 'lsn:2': 0 });
  });
  it('one independent success: full explicit support stays', () => {
    const c = withEnv(ENV, () => build('Give me an exercise', [], { record: { live: [], knownPoints: { 'lsn:2': 1 } } }));
    expect(c.prompt).toMatch(RULE); expect(c.prompt).not.toMatch(/Fade the support/);
  });
});

describe('fades after 2 independent successes', () => {
  it('from the record (earlier sessions): no rule line, no worked example, a quick check then harder/mixed items', () => {
    const c = withEnv(ENV, () => build('Give me an exercise', [], { record: { live: [], knownPoints: { 'lsn:2': 2 } } }));
    expect(c.signals.presentLessonItem?.id).toBe('a1');
    expect(c.prompt).toContain(FADE_LINE([CRIT2]));
    expect(c.prompt).not.toMatch(RULE);
    expect(c.ruleFirst).toBeUndefined();
    expect(withEnv(ENV, () => evidence(c)).fadeCheck).toEqual([2]);
    const off = withEnv('levelExplicit,ruleFirst', () => build('Give me an exercise', [], { record: { live: [], knownPoints: { 'lsn:2': 2 } } }));
    expect(off.prompt).toMatch(RULE); expect(off.prompt).not.toMatch(/Fade the support/);
  });
  it('from this session: two distinct items answered without help', () => {
    const h = [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1')), u('an'), a('Correct! Next: She has ___ cat.', right('a1', 2)), u('She has a cat'), a('Correct! Another: Complete: I saw ___ apple.', { ...right('a1', 2), activeItem: { id: 'msg:2', source: 'tutor' } }), u('an'), a('Correct!', { ...right('a1', 2), activeItem: { id: 'lesson:a1', source: 'lesson', lessonItemId: 'a1' } })];
    const c = withEnv(ENV, () => build('a', h));
    expect(c.signals.learning?.independentEvidence[2]?.length).toBeGreaterThanOrEqual(2);
    expect(c.signals.fade?.faded).toEqual([2]);
    expect(c.prompt).not.toMatch(RULE);
  });
});

describe('returns to explicit support after a failed quick check', () => {
  const rec = { live: [], knownPoints: { 'lsn:2': 2 } };
  const checked = [u('Give me an exercise'), a('Quick check: Complete: I saw ___ apple.', { ...open('a1'), fadeCheck: [2] })];
  it('the answer to the quick check, not accepted by the key: rule line allowed again, return line added', () => {
    const c = withEnv(ENV, () => build('a', checked, { record: rec }));
    expect(c.signals.fade).toEqual({ faded: [], checkAnswered: [2] });
    expect(c.prompt).toContain(FADE_RETURN_LINE);
    expect(c.prompt).toMatch(RULE);
    expect(withEnv(ENV, () => evidence(c)).fadeCheckAnswered).toEqual([2]);
  });
  it('a passed quick check stays faded', () => {
    const c = withEnv(ENV, () => build('an', checked, { record: rec }));
    expect(c.signals.fade?.faded).toEqual([2]);
    expect(c.prompt).not.toMatch(RULE);
  });
  it('after a recorded failure the point is not faded again in this session', () => {
    const h = [...checked, u('a'), a('Not quite. Rule: ... Try: She has ___ owl.', { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: { id: 'lesson:a1', source: 'lesson', lessonItemId: 'a1' }, fadeCheckAnswered: [2], fadeFailed: [2] })];
    const c = withEnv(ENV, () => build('an', h, { record: rec }));
    expect(c.signals.fade?.faded ?? []).toEqual([]);
    expect(c.prompt).not.toMatch(/Fade the support/);
  });
});

describe('the failed check is stored with the reply', () => {
  it('completeLanguageTurn records fadeFailed when the quick check was answered wrongly (switch on only)', async () => {
    const { completeLanguageTurn } = await import('../src/services/languageTurnPipeline');
    const checked = [u('Give me an exercise'), a('Quick check: Complete: I saw ___ apple.', { ...open('a1'), fadeCheck: [2] })];
    const marker = { text: '', assessment: { verdict: 'INCORRECT' as const, relevance: 'ACTIVE_ITEM' as const, criteria: [], next: 'SAME_ITEM' as const }, markers: 1, untrustedMarkers: 0, firstMarkerNotLeading: false, malformed: false };
    const run = (env: string) => withEnv(env, () => {
      const c = build('a', checked, { record: { live: [], knownPoints: { 'lsn:2': 2 } } });
      return completeLanguageTurn({ language: c, reply: 'Not quite.', learnerText: 'a', messageId: 'm', marker, removed: 0, institutionId: '', studentId: '' });
    });
    expect(((await run(ENV)) as { fadeFailed?: number[] }).fadeFailed).toEqual([2]);
    expect(((await run('levelExplicit,ruleFirst')) as { fadeFailed?: number[] }).fadeFailed).toBeUndefined();
  });
});
