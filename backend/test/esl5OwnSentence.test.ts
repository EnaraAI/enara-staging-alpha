import { describe, expect, it } from 'vitest';
import { OWN_SENTENCE_FROM, OWN_SENTENCE_FEEDBACK, ownSentenceNow } from '../src/services/languageTeachingContext';
import { completeLanguageTurn } from '../src/services/languageTurnPipeline';
import { u, a, open, wrong, right, withEnv, build } from './esl5Helpers';

// ESL5 change 5 (ownSentence): framework §5 (focus on form in the learner's own sentence) and §6 (pushed output).
const ENV = 'levelExplicit,ownSentence';
const ASK = /Write one sentence about a person you know using/;
const s1 = [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1'))];
const s2 = [...s1, u('an'), a('Correct! Next: Complete: He is ___ doctor.', right('a1', 2, 'a2'))];
const s3 = [...s2, u('a'), a('Correct! Next: Complete: They ___ (be) happy.', right('a2', 1, 'a3'))];
const tag = async (c: ReturnType<typeof build>, reply: string) => withEnv(ENV, () => completeLanguageTurn({ language: c, reply, learnerText: 'x', messageId: 'm', removed: 0, institutionId: '', studentId: '' }));

describe('second half only', () => {
  it('OWN_SENTENCE_FROM = 3 (second half of the 5-message session the closing assumes)', () => { expect(OWN_SENTENCE_FROM).toBe(3); });
  it('first half (learner messages 1-2): no own-sentence task', () => {
    for (const [m, h] of [['Give me an exercise', []], ['an', s1]] as const) expect(withEnv(ENV, () => build(m, h as never)).prompt).not.toMatch(ASK);
  });
  it('message 3: the own-sentence task replaces the next exercise; switch off: unchanged', () => {
    const c = withEnv(ENV, () => build('a', s2));
    expect(withEnv(ENV, () => ownSentenceNow(c))).toBe('ask');
    expect(c.prompt).toMatch(/Write one sentence about a person you know using Uses a before a consonant sound\./);
    expect(withEnv('levelExplicit', () => build('a', s2)).prompt).not.toMatch(ASK);
  });
});

describe('at most one per session', () => {
  it('tagged only when the reply sets it; never again after it was set', async () => {
    const c = withEnv(ENV, () => build('a', s2));
    expect((await tag(c, 'Correct! Now write one sentence about a person you know using "a".')).ownSentence).toBe('asked');
    expect((await tag(c, 'Correct! Next: They ___ (be) happy.')).ownSentence).toBeUndefined();
    const asked = [...s2, u('a'), a('Correct! Now write one sentence about a person you know using "a".', { ...right('a2', 1), ownSentence: 'asked' })];
    const fb = withEnv(ENV, () => build('My uncle is a pilot.', asked));
    expect(fb.prompt).not.toMatch(ASK);
    const later = [...asked, u('My uncle is a pilot.'), a('Yes, "a pilot" is right. Next: They ___ (be) happy.', { ...open('a3'), ownSentence: 'feedback' })];
    for (const m of ['are', 'is']) expect(withEnv(ENV, () => build(m, later)).prompt).not.toMatch(ASK);
  });
  it('not on a release turn', () => {
    const h = [...s2, u('a'), a('Correct! Next: Complete: I saw ___ apple.', right('a2', 1, 'a1')), u('a'), a('Look again.', wrong('a1'))];
    const c = withEnv(`${ENV},releaseAfterTwo`, () => build('the', h));
    expect(c.prompt).not.toMatch(ASK);
  });
});

describe('feedback on the target form only', () => {
  it('the reply after the task addresses the target form', async () => {
    const asked = [...s3.slice(0, 4), a('Correct! Now write one sentence about a person you know using "a".', { ...right('a1', 2), activeItem: { id: 'msg:own', source: 'tutor' }, ownSentence: 'asked' })];
    const c = withEnv(ENV, () => build('My sister is nurse.', asked));
    expect(withEnv(ENV, () => ownSentenceNow(c))).toBe('feedback');
    expect(c.prompt).toContain(OWN_SENTENCE_FEEDBACK('Uses a before a consonant sound'));
    expect(c.prompt).toMatch(/feedback on the target form only/);
    expect((await tag(c, 'Almost: "a nurse".')).ownSentence).toBe('feedback');
  });
});
