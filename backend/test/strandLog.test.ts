import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, turnEvidence, MOVE_IDS, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import { STRAND_BY_MOVE, STRANDS, strandOfMoves, strandSplit, loadStrandSplit } from '../src/services/strandLog';
import { engineV2 } from '../src/services/engineV2';
import type { HistoryTurn } from '../src/services/languageLearningState';

// strandLog: which of Nation's four strands each turn serves. Tags and counts only; default off; not part of "all".
const SPEC: LanguageSpec = { objectives: ['Use in, on and at with time words'], successCriteria: ['Uses at with clock times', 'Uses in with months'], items: [
  { id: 'i1', prompt: 'Write in, on or at: My train leaves ___ 5 o\'clock.', acceptedAnswers: ['at'], targetForms: ['at'], criteria: [1] },
  { id: 'i2', prompt: 'Write in, on or at: They get married ___ April.', acceptedAnswers: ['in'], targetForms: ['in'], criteria: [2] }] };
const LESSON = { title: 'Time prepositions', spec: SPEC };
const li = { id: 'lesson:i2', source: 'lesson' as const, lessonItemId: 'i2' };
const open = { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i2' }, activeItem: li };
const history: HistoryTurn[] = [{ role: 'user', content: 'Give me an exercise' }, { role: 'assistant', content: 'Write in, on or at: They get married ___ April.', languageTurn: open as HistoryTurn['languageTurn'] }];
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
function ctxFor(message: string): LanguageTeachingContext {
  const signals = detectTurnSignals(message, history, LESSON);
  const moves = selectLanguageMoves({ band: levelBand('A2'), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const ctx: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves };
  return { ...ctx, prompt: renderLanguageContextPrompt(ctx) } as LanguageTeachingContext;
}

describe('the move-to-strand map', () => {
  it('every MoveId maps to exactly one valid strand, and the map has no extra entries', () => {
    const ids = MOVE_IDS(); expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) { expect(Object.prototype.hasOwnProperty.call(STRAND_BY_MOVE, id), id).toBe(true); expect(STRANDS as readonly string[], id).toContain(STRAND_BY_MOVE[id]); }
    expect(Object.keys(STRAND_BY_MOVE).sort()).toEqual([...ids].sort());
  });
  it('a MoveId that is not in the map fails: strandOfMoves has no silent default', () => {
    // Simulates adding a MoveId to the engine without adding it to the map: the lookup would be undefined, so the tag would be missing and this check fails.
    const fake = [{ id: 'brand_new_move' as never }];
    expect(strandOfMoves(fake)).toBeUndefined();
    const withNew = [...MOVE_IDS(), 'brand_new_move' as never]; expect(withNew.filter((id) => !(id in STRAND_BY_MOVE))).toEqual(['brand_new_move']);
  });
  it('fluency has no move yet, so it stays at 0 until change G exists', () => { expect(Object.values(STRAND_BY_MOVE)).not.toContain('fluency'); });
});

describe('switch', () => {
  it('off by default and not part of "all"; on only when named', () => {
    delete process.env.ENARA_ENGINE_V2; expect(engineV2('strandLog')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all'; expect(engineV2('strandLog')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'strandLog'; expect(engineV2('strandLog')).toBe(true);
  });
});

describe('turn evidence', () => {
  it('off: nothing is stored (no strand, no stage)', () => {
    delete process.env.ENARA_ENGINE_V2; const ev = turnEvidence(ctxFor('on April'), 'obj');
    expect('strand' in ev).toBe(false); expect('stage' in ev).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all,closing,clarity'; expect('strand' in turnEvidence(ctxFor('on April'), 'obj')).toBe(false);
  });
  it('on: the strand of the first move is stored; stage stays empty until change D', () => {
    process.env.ENARA_ENGINE_V2 = 'strandLog'; const c = ctxFor('on April'); const ev = turnEvidence(c, 'obj');
    expect(ev.strand).toBe(STRAND_BY_MOVE[c.moves[0].id]); expect(ev.strand).toBe('language_focused'); expect('stage' in ev).toBe(false);
  });
  it('on: the tags carry no learner text (the evidence has none of the learner message)', () => {
    process.env.ENARA_ENGINE_V2 = 'strandLog'; const secret = 'my private sentence zebra-7391';
    const json = JSON.stringify(turnEvidence(ctxFor(secret), 'obj')); expect(json).not.toContain('zebra-7391');
    expect(json).toMatch(/"strand":"(input|output|language_focused|fluency)"/);
  });
  it('on: with a strong learner offered independent practice the first move can map to output', () => {
    expect(STRAND_BY_MOVE.independent_practice).toBe('output'); expect(strandOfMoves([{ id: 'independent_practice' }, { id: 'fade_support' }])).toBe('output');
    expect(strandOfMoves([{ id: 'comprehensible_model' }])).toBe('input'); expect(strandOfMoves([])).toBeUndefined();
  });
  it('the stored message schema keeps the tags', async () => {
    const { TutorMessage } = await import('../src/models/TutorMessage');
    const lt = (TutorMessage.schema.path('meta.languageTurn') as unknown as { schema: { path(p: string): unknown } }).schema;
    expect(lt.path('strand')).toBeTruthy(); expect(lt.path('stage')).toBeTruthy();
  });
});

describe('the split (counts only)', () => {
  it('counts per strand, shares over tagged turns, and untagged turns are counted apart', () => {
    const s = strandSplit([{ strand: 'language_focused' }, { strand: 'language_focused' }, { strand: 'output' }, { strand: 'input' }, {}, { strand: null }, { strand: 'bogus' }]);
    expect(s.counts).toEqual({ input: 1, output: 1, language_focused: 2, fluency: 0 }); expect(s.turns).toBe(4); expect(s.untagged).toBe(3);
    expect(s.shares.language_focused).toBeCloseTo(0.5); expect(s.shares.fluency).toBe(0);
    expect(strandSplit([]).shares).toEqual({ input: 0, output: 0, language_focused: 0, fluency: 0 });
  });
  it('the result has only numbers: no text field of any kind', () => {
    const s = strandSplit([{ strand: 'output' }]); const walk = (o: unknown): void => { if (o && typeof o === 'object') Object.values(o).forEach(walk); else expect(typeof o).toBe('number'); }; walk(s);
  });
  it('per learner and per course: reads only the strand tag, scoped by institution (and learner, and the course sessions)', async () => {
    const find = vi.fn(); const select = vi.fn(); const lean = vi.fn(async () => [{ meta: { languageTurn: { strand: 'output' } } }, { meta: { languageTurn: { strand: 'input' } } }, { meta: { languageTurn: {} } }]);
    find.mockReturnValue({ select: select.mockReturnValue({ lean }) });
    const sFind = vi.fn(); const sLean = vi.fn(async () => [{ id: 's1' }, { id: 's2' }]); sFind.mockReturnValue({ select: () => ({ lean: sLean }) });
    vi.resetModules(); vi.doMock('../src/models/TutorMessage', () => ({ TutorMessage: { find } })); vi.doMock('../src/models/TutorSession', () => ({ TutorSession: { find: sFind } }));
    const { loadStrandSplit: load } = await import('../src/services/strandLog');
    const r = await load({ institutionId: 'inst', studentId: 'stu', courseId: 'course' });
    expect(r.counts).toEqual({ input: 1, output: 1, language_focused: 0, fluency: 0 }); expect(r.untagged).toBe(1);
    expect(find).toHaveBeenCalledWith({ institutionId: 'inst', role: 'ai', studentId: 'stu', sessionId: { $in: ['s1', 's2'] }, 'meta.languageTurn': { $exists: true } });
    expect(select).toHaveBeenCalledWith({ 'meta.languageTurn.strand': 1, _id: 0 }); // only the tag is read, never text
    expect(sFind).toHaveBeenCalledWith({ institutionId: 'inst', courseId: 'course', studentId: 'stu' });
    await expect(load({ institutionId: 'inst' })).rejects.toThrow(/studentId or a courseId/);
    vi.doUnmock('../src/models/TutorMessage'); vi.doUnmock('../src/models/TutorSession'); void loadStrandSplit;
  });
});
