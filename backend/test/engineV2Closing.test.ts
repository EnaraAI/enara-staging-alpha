import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/learnerLanguageProfile', async (orig) => ({ ...(await orig<object>()), recordProfileTurn: vi.fn(async () => undefined) }));
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, finalizeLanguageTurn, researchSignals, isClosingTurn, CLOSING_RECAP, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import { applyReplyGuards, completeLanguageTurn } from '../src/services/languageTurnPipeline';
import { taskInvitation } from '../src/services/languageTeachingContext';
import { engineV2 } from '../src/services/engineV2';
import type { HistoryTurn } from '../src/services/languageLearningState';

// Closing recap + independent self-grade check (both default OFF, named-only: not part of "all"). Go through the real engine functions.
const SPEC: LanguageSpec = { objectives: ['Use in, on and at with time words'], successCriteria: ['Uses at with clock times', 'Uses in with months'], grammar: ['in/on/at'], items: [
  { id: 'i1', prompt: 'Write in, on or at: My train leaves ___ 5 o\'clock.', acceptedAnswers: ['at'], targetForms: ['at'], criteria: [1] },
  { id: 'i2', prompt: 'Write in, on or at: They get married ___ April.', acceptedAnswers: ['in'], targetForms: ['in'], criteria: [2] }] };
const LESSON = { title: 'Time prepositions', spec: SPEC };
const li = { id: 'lesson:i2', source: 'lesson' as const, lessonItemId: 'i2' };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: unknown): HistoryTurn => ({ role: 'assistant', content, languageTurn: languageTurn as HistoryTurn['languageTurn'] });
const open = { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i2' }, activeItem: li };
const wrong = { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li, hintLevel: 1 };
const early = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', open)];
const late = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', open), u('on April'), a('Think about the month.', wrong), u('at April'), a('Look at the word.', wrong), u('on April'), a('Still the month.', wrong), u('at April'), a('Again.', wrong)];
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
function build(message: string, history: HistoryTurn[], withResearch = false) {
  const signals = detectTurnSignals(message, history, LESSON);
  const moves = selectLanguageMoves({ band: levelBand('A2'), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const research = withResearch ? researchSignals(history, signals, SPEC) : undefined;
  const ctx: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves, ...(research ? { research } : {}) };
  return { ctx, prompt: renderLanguageContextPrompt(ctx), signals, research };
}

describe('switches', () => {
  it('closing and selfCheck are off by default and are NOT part of "all"', () => {
    delete process.env.ENARA_ENGINE_V2; expect(engineV2('closing')).toBe(false); expect(engineV2('selfCheck')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all'; expect(engineV2('closing')).toBe(false); expect(engineV2('selfCheck')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'closing,selfCheck'; expect(engineV2('closing')).toBe(true); expect(engineV2('selfCheck')).toBe(true);
  });
});

describe('closing', () => {
  it('prompt: closing instruction only from the 5th learner message, and only with the switch', () => {
    delete process.env.ENARA_ENGINE_V2; expect(build('on April', late, true).prompt).not.toContain(CLOSING_RECAP);
    process.env.ENARA_ENGINE_V2 = 'closing';
    expect(build('on April', early, true).prompt).not.toContain(CLOSING_RECAP);
    const l = build('on April', late, true); expect(isClosingTurn(l.research!)).toBe(true); expect(l.prompt).toContain(CLOSING_RECAP);
  });
  it('engine appends the "own words" ask when the model leaves it out, once, and only on the closing turn', () => {
    process.env.ENARA_ENGINE_V2 = 'closing';
    const l = build('on April', late, true); const lang = { ...l.ctx, prompt: l.prompt } as LanguageTeachingContext;
    const out = applyReplyGuards(lang, 'Recap: months take in.', 'on April').text; expect(out).toMatch(/Tell me the rule in your own words\.$/);
    expect(applyReplyGuards(lang, out, 'on April').text.match(/own words/g)).toHaveLength(1);
    const e = build('on April', early, true); expect(applyReplyGuards({ ...e.ctx, prompt: e.prompt } as LanguageTeachingContext, 'Try again.', 'on April').text).toBe('Try again.');
    delete process.env.ENARA_ENGINE_V2; expect(applyReplyGuards(lang, 'Recap: months take in.', 'on April').text).toBe('Recap: months take in.');
  });
});

describe('selfCheck (independent check on the tutor grade)', () => {
  const fin = (learnerText: string, h: HistoryTurn[]) => { const { ctx } = build(learnerText, h); return finalizeLanguageTurn(ctx, { reply: 'Good, that is right.', learnerText, messageId: 'm', parsed: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [2], next: 'NEW_ITEM' } }); };
  it('off: a wrong answer the tutor graded CORRECT is credited (the gap)', () => {
    delete process.env.ENARA_ENGINE_V2; const r = fin('on April', late); expect((r.assessment as { verdict: string }).verdict).toBe('CORRECT');
  });
  it('on: the grade is held back (AMBIGUOUS, no criteria, same item) when the answer has no target form', () => {
    process.env.ENARA_ENGINE_V2 = 'selfCheck'; const r = fin('on April', late); const x = r.assessment as { verdict: string; criteria: number[]; next: string };
    expect(x.verdict).toBe('AMBIGUOUS'); expect(x.criteria).toEqual([]); expect(x.next).toBe('SAME_ITEM'); expect(r.qualityFlags).toContain('self_grade_unverified');
  });
  it('on: a correct answer is still credited (key match), and an open item is never held back', () => {
    process.env.ENARA_ENGINE_V2 = 'selfCheck'; expect((fin('in', late).assessment as { verdict: string }).verdict).toBe('CORRECT');
    expect((fin('They get married in April', late).assessment as { verdict: string }).verdict).toBe('CORRECT');
  });
});

describe('clarity (explain plainly when stuck)', () => {
  it('off by default and not in "all"; on: only when stuck / asking why, never with a first attempt', async () => {
    const { CLARITY_LINE } = await import('../src/services/languageTeachingContext');
    delete process.env.ENARA_ENGINE_V2; expect(build('on April', late).prompt).not.toContain(CLARITY_LINE);
    process.env.ENARA_ENGINE_V2 = 'all'; expect(engineV2('clarity')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'clarity'; expect(engineV2('clarity')).toBe(true);
    expect(build('on April', late).prompt).toContain(CLARITY_LINE);
    expect(build('on April', early).prompt).not.toContain(CLARITY_LINE);
    expect(build('Why is it not on?', late).prompt).toContain(CLARITY_LINE);
    expect(CLARITY_LINE).toMatch(/Never write the corrected form of the open task/);
  });
});

describe('closing happens once; hint variety', () => {
  const asked = [...late, u('Months take in.'), a('Remember: months take in. Tell me the rule in your own words.')];
  it('after the tutor asked for the rule, no second recap and no appended ask', () => {
    process.env.ENARA_ENGINE_V2 = 'closing';
    const l = build('Months take in, days take on.', asked, true);
    expect(isClosingTurn(l.research!)).toBe(false); expect(l.prompt).not.toContain(CLOSING_RECAP);
    expect(applyReplyGuards({ ...l.ctx, prompt: l.prompt } as LanguageTeachingContext, 'Remember: in for months, on for days.', 'Months take in, days take on.').text).not.toMatch(/own words/);
  });
  it('hints switch: two hint-shaped questions in a row get the change-the-form line; off by default; not on a first/mixed turn', async () => {
    const { HINT_VARY } = await import('../src/services/languageTeachingContext');
    const hinty = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', open), u('on April'), a('Think about the word April. Which word fits?', wrong), u('at April'), a('Have another look at the month. Which one is it?', wrong), u('on April')];
    delete process.env.ENARA_ENGINE_V2; expect(build('on April', hinty, true).prompt).not.toContain(HINT_VARY);
    process.env.ENARA_ENGINE_V2 = 'hints'; expect(build('on April', hinty, true).prompt).toContain(HINT_VARY);
    expect(build('on April', hinty.slice(0, 4), true).prompt).not.toContain(HINT_VARY);
    process.env.ENARA_ENGINE_V2 = 'all'; expect(build('on April', hinty, true).prompt).not.toContain(HINT_VARY);
  });
});

describe('hints: explain after the first recorded miss', () => {
  it('clarity line appears after one miss only with hints on', async () => {
    const { CLARITY_LINE } = await import('../src/services/languageTeachingContext');
    const oneMiss = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', open), u('on April'), a('Which month is it?', wrong)];
    process.env.ENARA_ENGINE_V2 = 'clarity'; expect(build('at April', oneMiss).prompt).not.toContain(CLARITY_LINE);
    process.env.ENARA_ENGINE_V2 = 'clarity,hints'; expect(build('at April', oneMiss).prompt).toContain(CLARITY_LINE);
  });
});

describe('closing: ask never stacks on a task (defer, then fold)', () => {
  const TASK = 'The rule: months take in.\n\nNow a new one. Write in, on or at: They were born ___ May.';
  const deferred = (n: number): HistoryTurn[] => Array.from({ length: n }, () => [u('in May'), a(TASK, { closingAsk: 'deferred' })]).flat();
  const run = (history: HistoryTurn[], reply: string) => {
    process.env.ENARA_ENGINE_V2 = 'closing';
    const l = build('on April', history, true); const lang = { ...l.ctx, prompt: l.prompt } as LanguageTeachingContext;
    return { lang, ...applyReplyGuards(lang, reply, 'on April') };
  };
  const asks = (t: string) => (t.match(/in your own words/g) ?? []).length;
  it('a reply that sets a task gets no appended ask, and is tagged deferred', () => {
    const r = run(late, TASK); expect(r.text).toBe(TASK); expect(r.closingAsk).toBe('deferred'); expect(asks(r.text)).toBe(0);
  });
  it('a deferred ask is added on the next task-free reply, and tagged added', () => {
    const r = run([...late, ...deferred(1)], 'The rule: months take in.'); expect(r.text).toMatch(/Tell me the rule in your own words\.$/); expect(r.closingAsk).toBe('added'); expect(asks(r.text)).toBe(1);
  });
  it('still deferred after 2 task replies; folded into the task reply after 3', () => {
    expect(run([...late, ...deferred(2)], TASK).closingAsk).toBe('deferred');
    const r = run([...late, ...deferred(3)], TASK);
    expect(r.closingAsk).toBe('folded'); expect(r.text).toMatch(/^Rule in one line: /); expect(r.text).toContain('Then your task:'); expect(r.text).toContain('Write in, on or at: They were born ___ May.');
    expect(asks(r.text)).toBe(0); expect(r.text).toContain('Uses in with months');
    expect(applyReplyGuards(r.lang, r.text, 'on April').text).toBe(r.text); // idempotent: no second fold
  });
  it('once per session: after an added or folded ask the closing is over (prompt and guard)', () => {
    for (const tag of ['added', 'folded'] as const) {
      const h = [...late, u('in May'), a(TASK, { closingAsk: tag })];
      const r = run(h, 'Good. Another one: write in, on or at: We met ___ June.'); expect(r.closingAsk).toBeUndefined(); expect(r.text).toBe('Good. Another one: write in, on or at: We met ___ June.');
    }
  });
  it('no reply ever contains an appended ask and a task: across every history and reply shape', () => {
    const replies = [TASK, 'The rule: months take in.', 'Try again: in or on?', 'Good.\n\nYour turn: write a sentence with in.'];
    for (const n of [0, 1, 2, 3, 4]) for (const rep of replies) {
      const r = run([...late, ...deferred(n)], rep); const added = r.text !== rep && r.closingAsk === 'added';
      if (added) expect(taskInvitation(rep)).toBeUndefined(); // an ask is only appended to a task-free reply
      if (r.closingAsk === 'folded') expect(asks(r.text)).toBe(0);
    }
  });
});

describe('closing ask evidence', () => {
  it('completeLanguageTurn stores the closingAsk tag (and nothing when there is none)', async () => {
    process.env.ENARA_ENGINE_V2 = 'closing';
    const l = build('on April', late, true); const lang = { ...l.ctx, prompt: l.prompt } as LanguageTeachingContext;
    const base = { language: lang, reply: 'Recap.', learnerText: 'on April', messageId: 'm1', removed: 0, institutionId: 'i', studentId: 's' };
    for (const tag of ['added', 'deferred', 'folded'] as const) expect((await completeLanguageTurn({ ...base, closingAsk: tag }) as { closingAsk?: string }).closingAsk).toBe(tag);
    expect('closingAsk' in (await completeLanguageTurn(base))).toBe(false);
  });
  it('the tag is part of the stored message schema, so the database keeps it', async () => {
    const { TutorMessage } = await import('../src/models/TutorMessage');
    const lt = (TutorMessage.schema.path('meta.languageTurn') as unknown as { schema: { path(p: string): unknown } }).schema;
    expect(lt.path('closingAsk')).toBeTruthy(); expect(lt.path('rulesIntroduced')).toBeTruthy();
  });
});
