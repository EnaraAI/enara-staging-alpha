import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mishkat + v3b criterion split (docs/tutor/MISHKAT_SPLIT_PLAN.md), switch mishkatSplit. The v3b model call (askForJson) and the
// proposal store are stubbed as in openGrading.test.ts; Mishkat's HTTP call is a stubbed fetch. No network, no model.

const calls: { system: string; user: string }[] = [];
let replies: unknown[] = [];
vi.mock('../../src/services/aiJson', () => ({
  askForJson: vi.fn(async (p: { system: string; user: string; validate: (v: unknown) => unknown }) => {
    calls.push({ system: p.system, user: p.user });
    const raw = replies.shift();
    if (raw instanceof Error) throw raw;
    return { value: p.validate(raw), model: 'test-model' };
  }),
  isAiConfigured: () => true,
}));
vi.mock('../../src/models/GradingProposal', () => ({ GradingProposal: { create: vi.fn(async () => ({ id: 'gp-test' })) } }));

const { gradeOpenAnswer, combineRuns } = await import('../../src/assessment/grading-engine/open');
const { rubricFor } = await import('../../src/assessment/rubrics/templates');
const { mergeMishkat, nearBoundary, roundScore } = await import('../../src/assessment/grading-engine/mishkat/merge');
const { scoreWithMishkat, parseMishkatReply } = await import('../../src/assessment/grading-engine/mishkat/client');
const { mishkatTarget, mishkatCriteria } = await import('../../src/assessment/grading-engine/mishkat/manifest');
const { engineV2 } = await import('../../src/services/engineV2');
type RunResult = Parameters<typeof combineRuns>[0][number];

const attempt = { id: 'att-1', institutionId: 'sch-1', assignmentId: 'asg-1' };
const essay = { questionId: 'q1', stem: 'Write 3-4 sentences about your family.', type: 'essay' as const, domain: 'language' as const, language: 'en' };
const max = Object.fromEntries(rubricFor('language', 'essay', 'en')!.criteria.map((c) => [c.id, c.maxPoints]));
const IDS = ['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics'];
const answer = 'My family is big. I have two brothers and one sister. We eat dinner together every evening.';
const v3bPoints: Record<string, number> = { task_completion: 2, grammar_accuracy: 1, vocabulary_range: 1, organisation: 1, mechanics: 1 };
const reply = (pts = v3bPoints) => ({
  criteria: IDS.map((c) => ({ criterionId: c, levelId: `p${pts[c]}`, evidence: pts[c] > 0 ? ['My family is big.'] : [], rationale: `v3b on ${c}` })),
  errorCodes: ['article'], confidence: 0.9, scoreExplanation: 'Clear answer.', strengths: ['Answers the task'], improvements: ['Join ideas'], feedback: 'Good. Add one linking word.', flags: [],
});
const run = (pts = v3bPoints): RunResult => ({ proposalId: 'gp-1', status: 'proposed', criterionScores: IDS.map((c) => ({ criterionId: c, levelId: `p${pts[c]}`, points: pts[c] })), points: IDS.reduce((n, c) => n + pts[c], 0), confidence: 0.9, errorCodes: ['article'], feedback: 'Good.', scoreExplanation: 'Clear.', strengths: [], improvements: [], flags: [], modelName: 'test-model' });
const v3b = (pts = v3bPoints) => combineRuns([run(pts), run(pts)], max);
const ok = (scores: Record<string, number>, criteria = ['grammar_accuracy', 'mechanics', 'vocabulary_range']) => ({ status: 'ok' as const, version: 'en-2026.11.1', scores, criteria });

describe('the switch', () => {
  const env = process.env.ENARA_ENGINE_V2;
  afterEach(() => { process.env.ENARA_ENGINE_V2 = env; });
  it('is named only: "all" does not turn it on', () => {
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(engineV2('mishkatSplit')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'assessGrading,mishkatSplit';
    expect(engineV2('mishkatSplit')).toBe(true);
  });
});

describe('manifest: what Mishkat may score', () => {
  it('only written language essays and short answers, in Arabic or English', () => {
    expect(mishkatTarget(essay)).toEqual({ lang: 'en', type: 'essay' });
    expect(mishkatTarget({ ...essay, language: 'ar', type: 'short_answer' })).toEqual({ lang: 'ar', type: 'short_answer' });
    expect(mishkatTarget({ ...essay, spoken: true })).toBeNull();
    expect(mishkatTarget({ ...essay, domain: 'science' })).toBeNull();
    expect(mishkatTarget({ ...essay, type: 'math_steps' })).toBeNull();
    expect(mishkatTarget({ ...essay, language: 'fr' })).toBeNull();
  });
  it('the allow-list narrowed by the service list; task completion and organisation never', () => {
    const all = ['task_completion', 'organisation', 'grammar_accuracy', 'mechanics', 'vocabulary_range'];
    expect(mishkatCriteria('essay', all, all)).toEqual(['grammar_accuracy', 'mechanics', 'vocabulary_range']);
    expect(mishkatCriteria('short_answer', all, all)).toEqual(['grammar_accuracy', 'mechanics']);
    expect(mishkatCriteria('essay', ['grammar_accuracy'], all)).toEqual(['grammar_accuracy']);
  });
});

describe('merge (pure)', () => {
  it('replaces v3b on Mishkat criteria, keeps v3b elsewhere, recomputes the total, keeps feedback/codes/confidence', () => {
    const before = v3b();
    const { grade, log } = mergeMishkat(before, ok({ grammar_accuracy: 1.9, mechanics: 2.2, vocabulary_range: 0.8, task_completion: 0, organisation: 0 }), { item: essay, maxByCriterion: max });
    expect(log).toMatchObject({ status: 'used', version: 'en-2026.11.1', used: ['grammar_accuracy', 'mechanics', 'vocabulary_range'], boundary: [], disagree: [] });
    const g = Object.fromEntries(grade.criteria.map((c) => [c.code, c]));
    expect(g.grammar_accuracy).toEqual({ code: 'grammar_accuracy', points: 2, max: 2, reasonCode: 'met', scoredBy: 'mishkat', rule: 'mishkat@en-2026.11.1', reason: 'scored by Mishkat (trained scorer)', modelPoints: 1 });
    expect(g.mechanics).toMatchObject({ points: 2, scoredBy: 'mishkat', modelPoints: 1 }); // 2.2 -> 2 (clamped to max)
    expect(g.vocabulary_range).toMatchObject({ points: 1, scoredBy: 'mishkat', modelPoints: 1 });
    expect(g.task_completion).toEqual({ code: 'task_completion', points: 2, max: 2, reasonCode: 'met', scoredBy: 'model' }); // never Mishkat
    expect(g.organisation).toMatchObject({ points: 1, scoredBy: 'model' });
    expect(grade.points).toBe(2 + 2 + 1 + 1 + 2);
    expect(grade.criterionScores.find((s) => s.criterionId === 'grammar_accuracy')).toMatchObject({ levelId: 'p2', points: 2, scoredBy: 'mishkat' });
    expect({ ...grade, criteria: undefined, criterionScores: undefined, points: undefined }).toEqual({ ...before, criteria: undefined, criterionScores: undefined, points: undefined });
    expect(grade.flagged).toBe(false);
  });
  it('clamps below zero and above the max', () => {
    expect(roundScore(-0.4, 2)).toBe(0);
    expect(roundScore(3.2, 2)).toBe(2);
    expect(roundScore(1.3, 2)).toBe(1);
  });
  it('boundary: within 0.15 of x.5 keeps v3b for that criterion, logged as mishkat_boundary', () => {
    expect([1.36, 1.5, 1.64, 0.4].map(nearBoundary)).toEqual([true, true, true, true]);
    expect([1.34, 1.66, 2.0].map(nearBoundary)).toEqual([false, false, false]);
    const { grade, log } = mergeMishkat(v3b(), ok({ grammar_accuracy: 1.55, mechanics: 2 }), { item: essay, maxByCriterion: max });
    expect(log.boundary).toEqual(['grammar_accuracy']);
    expect(log.used).toEqual(['mechanics']);
    expect(grade.criteria.find((c) => c.code === 'grammar_accuracy')).toMatchObject({ points: 1, scoredBy: 'model', reason: 'mishkat_boundary' });
  });
  it('2 or more levels apart: flagged graders_disagree for the teacher', () => {
    const { grade, log } = mergeMishkat(v3b({ ...v3bPoints, grammar_accuracy: 0 }), ok({ grammar_accuracy: 2.0 }), { item: essay, maxByCriterion: max });
    expect(log.disagree).toEqual(['grammar_accuracy']);
    expect(grade).toMatchObject({ flagged: true, flagReasons: ['graders_disagree'] });
    // 1 level apart: no flag
    const one = mergeMishkat(v3b(), ok({ grammar_accuracy: 2.0 }), { item: essay, maxByCriterion: max });
    expect(one.grade.flagged).toBe(false);
  });
  it('unavailable: v3b grade unchanged (same object), logged', () => {
    const before = v3b();
    const r = mergeMishkat(before, { status: 'unavailable', reason: 'timeout' }, { item: essay, maxByCriterion: max });
    expect(r.grade).toBe(before);
    expect(r.log).toMatchObject({ status: 'unavailable', reason: 'timeout' });
  });
  it('criteria the service does not list stay v3b (even with a score sent for them)', () => {
    const before = v3b();
    const r = mergeMishkat(before, ok({ grammar_accuracy: 0, mechanics: 0 }, ['mechanics']), { item: essay, maxByCriterion: max });
    expect(r.grade.criteria.find((c) => c.code === 'grammar_accuracy')).toMatchObject({ points: 1, scoredBy: 'model' });
    expect(r.grade.criteria.find((c) => c.code === 'mechanics')).toMatchObject({ points: 0, scoredBy: 'mishkat' });
    // Nothing listed: unchanged.
    expect(mergeMishkat(before, ok({ grammar_accuracy: 0 }, []), { item: essay, maxByCriterion: max }).grade).toBe(before);
  });
  it('spoken and non-language items are untouched', () => {
    const before = v3b();
    expect(mergeMishkat(before, ok({ grammar_accuracy: 0 }), { item: { ...essay, spoken: true }, maxByCriterion: max }).grade).toBe(before);
    expect(mergeMishkat(before, ok({ grammar_accuracy: 0 }), { item: { ...essay, domain: 'humanities' }, maxByCriterion: max }).grade).toBe(before);
  });
  it('a criterion decided by code rules (rules-first) wins over Mishkat and v3b', () => {
    const r = run();
    r.criterionScores = r.criterionScores.map((s) => (s.criterionId === 'mechanics' ? { ...s, points: 0, levelId: 'p0', scoredBy: 'code' as const, rule: 'wrong_script', reason: 'not in English' } : { ...s, scoredBy: 'model' as const }));
    const before = combineRuns([r, r], max);
    const { grade, log } = mergeMishkat(before, ok({ grammar_accuracy: 2, mechanics: 2 }), { item: essay, maxByCriterion: max });
    expect(log.used).toEqual(['grammar_accuracy']);
    expect(grade.criteria.find((c) => c.code === 'mechanics')).toEqual({ code: 'mechanics', points: 0, max: 2, reasonCode: 'not_met', scoredBy: 'code', rule: 'wrong_script', reason: 'not in English' });
  });
  it('a flagged blank (no v3b grade) is not merged', () => {
    const blank = combineRuns([{ ...run(), status: 'failed', error: 'AI_UNAVAILABLE' }], max);
    expect(mergeMishkat(blank, ok({ grammar_accuracy: 2 }), { item: essay, maxByCriterion: max }).grade).toBe(blank);
  });
});

describe('client', () => {
  const env = { MISHKAT_ENDPOINT: 'https://mishkat.test/score', MISHKAT_TOKEN: 'tok' };
  const res = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) }) as unknown as Response;
  it('missing endpoint or token: unavailable, no call', async () => {
    const f = vi.fn();
    expect(await scoreWithMishkat({ lang: 'en', type: 'essay', text: 'x' }, { env: {}, fetchImpl: f })).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(await scoreWithMishkat({ lang: 'en', type: 'essay', text: 'x' }, { env: { MISHKAT_ENDPOINT: 'https://m' }, fetchImpl: f })).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
  });
  it('posts {lang,type,text} with the bearer token and reads the reply', async () => {
    const f = vi.fn(async () => res({ version: 'v1', scores: { grammar_accuracy: 1.2 }, criteria: ['grammar_accuracy'] }));
    const r = await scoreWithMishkat({ lang: 'ar', type: 'short_answer', text: 'نص' }, { env, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ status: 'ok', version: 'v1', scores: { grammar_accuracy: 1.2 }, criteria: ['grammar_accuracy'] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://mishkat.test/score');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toEqual({ lang: 'ar', type: 'short_answer', text: 'نص' });
  });
  it('timeout: unavailable (no retry)', async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))));
    expect(await scoreWithMishkat({ lang: 'en', type: 'essay', text: 'x' }, { env, fetchImpl: f as unknown as typeof fetch, timeoutMs: 20 })).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('bad JSON, a reply off the contract, an HTTP error or a network error: unavailable', async () => {
    const call = (f: unknown) => scoreWithMishkat({ lang: 'en', type: 'essay', text: 'x' }, { env, fetchImpl: f as typeof fetch });
    expect(await call(async () => res('{not json'))).toEqual({ status: 'unavailable', reason: 'bad_response' });
    expect(await call(async () => res({ version: 'v1', scores: { grammar_accuracy: 'high' }, criteria: [] }))).toEqual({ status: 'unavailable', reason: 'bad_response' });
    expect(await call(async () => res({ scores: {}, criteria: [] }))).toEqual({ status: 'unavailable', reason: 'bad_response' });
    expect(await call(async () => res({}, 503))).toEqual({ status: 'unavailable', reason: 'http_error' });
    expect(await call(async () => { throw new Error('ECONNREFUSED'); })).toEqual({ status: 'unavailable', reason: 'network_error' });
    expect(parseMishkatReply({ version: 'v', scores: { a: NaN }, criteria: [] })).toBeNull();
  });
});

describe('in the engine (gradeOpenAnswer)', () => {
  const env = { ...process.env };
  const fetchMock = vi.fn();
  const grade = (item = essay) => gradeOpenAnswer({ attempt, item, answer, uiLanguage: 'en', maxByCriterion: max, modelReady: true, options: { store: false } });
  beforeEach(() => {
    calls.length = 0; replies = []; fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.MISHKAT_ENDPOINT = 'https://mishkat.test/score';
    process.env.MISHKAT_TOKEN = 'tok';
  });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...env }; });

  it('switch off: byte-identical result and no Mishkat call (also with "all")', async () => {
    process.env.ENARA_ENGINE_V2 = 'assessGrading';
    replies = [reply(), reply()];
    const off = await grade();
    const prompts = calls.splice(0);
    process.env.ENARA_ENGINE_V2 = 'all,assessGrading';
    replies = [reply(), reply()];
    const all = await grade();
    expect(JSON.stringify(all)).toBe(JSON.stringify(off));
    expect(calls).toEqual(prompts);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(off.criteria.every((c) => !('scoredBy' in c))).toBe(true);
  });
  it('switch on: Mishkat called once in parallel, its criteria replace v3b; the v3b prompts are unchanged', async () => {
    process.env.ENARA_ENGINE_V2 = 'assessGrading';
    replies = [reply(), reply()];
    await grade();
    const prompts = calls.splice(0);
    process.env.ENARA_ENGINE_V2 = 'assessGrading,mishkatSplit';
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: 'en-1', scores: { grammar_accuracy: 2.1, mechanics: 1.0, vocabulary_range: 1.9 }, criteria: ['grammar_accuracy', 'mechanics', 'vocabulary_range'] }) });
    replies = [reply(), reply()];
    const g = await grade();
    expect(calls).toEqual(prompts);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ lang: 'en', type: 'essay', text: answer });
    expect(g.criteria.filter((c) => c.scoredBy === 'mishkat').map((c) => c.code)).toEqual(['grammar_accuracy', 'vocabulary_range', 'mechanics']);
    expect(g.points).toBe(2 + 2 + 2 + 1 + 1);
    expect(g.feedback).toBe('Good. Add one linking word.');
  });
  it('switch on but Mishkat down or not configured: today\'s v3b result', async () => {
    process.env.ENARA_ENGINE_V2 = 'assessGrading';
    replies = [reply(), reply()];
    const off = await grade();
    process.env.ENARA_ENGINE_V2 = 'assessGrading,mishkatSplit';
    fetchMock.mockRejectedValue(new Error('down'));
    replies = [reply(), reply()];
    expect(JSON.stringify(await grade())).toBe(JSON.stringify(off));
    delete process.env.MISHKAT_TOKEN;
    replies = [reply(), reply()];
    expect(JSON.stringify(await grade())).toBe(JSON.stringify(off));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('switch on: spoken answers never call Mishkat', async () => {
    process.env.ENARA_ENGINE_V2 = 'assessGrading,mishkatSplit';
    const spoken = { ...essay, spoken: true };
    const sMax = Object.fromEntries(rubricFor('language', 'essay', 'en', { spoken: true })!.criteria.map((c) => [c.id, c.maxPoints]));
    const sIds = Object.keys(sMax);
    replies = [1, 2].map(() => ({ ...reply(), criteria: reply().criteria.filter((c) => sIds.includes(c.criterionId)) }));
    const g = await gradeOpenAnswer({ attempt, item: spoken, answer, uiLanguage: 'en', maxByCriterion: sMax, modelReady: true, options: { store: false } });
    expect(g.grader).toBe('model:test-model');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
