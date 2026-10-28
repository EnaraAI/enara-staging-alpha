import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// Candidate V2 native rubric grader (D1): mocked provider only, synthetic LAILA-shaped rubric
// with invented wording (no LAILA text or essays). Network, SDK, database and V1 are trapped.
const trap = vi.hoisted(() => ({ calls: [] as string[] }));
const boom = (name: string) => (..._a: unknown[]) => { trap.calls.push(name); throw new Error(`${name} must not be called`); };
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { trap.calls.push('anthropic'); throw new Error('provider'); } } }));
vi.mock('../../src/models/AiCall', () => ({ AiCall: new Proxy({}, { get: (_t, k) => boom(`AiCall.${String(k)}`) }) }));
vi.mock('../../src/models/AssessmentAttempt', () => ({ AssessmentAttempt: new Proxy({}, { get: (_t, k) => boom(`AssessmentAttempt.${String(k)}`) }) }));
vi.mock('../../src/services/hybridV1/v6', () => ({ gradeV6: boom('gradeV6'), V6: {} }));
vi.mock('../../src/services/hybridV1/hybrid', () => ({ pickAnchors: boom('pickAnchors'), combine: boom('combine'), eligibility: boom('elig'), ANCHOR_SEED: 'x', HYBRID_VERSION: 'x' }));
vi.stubGlobal('fetch', boom('fetch'));

import { CandidateV2Budget } from '../../src/services/candidateV2/budget';
import type { Rubric } from '../../src/services/candidateV2/contract';
import { buildRequest, checkRubricCompatibility, createNativeGrader, parseReply, type RubricText } from '../../src/services/candidateV2/nativeGrader';
import { MockProvider, ProviderError, type MockStep } from '../../src/services/candidateV2/provider';
import { buildSnapshot, runCandidateV2, type AttemptView, type QuestionView, type ResultStore, type StoredResult } from '../../src/services/candidateV2/runner';

// ---------------------------------------------------------------- synthetic fixtures
const TRAITS: [string, number][] = [['relevance', 2], ['organization', 5], ['vocabulary', 5], ['style', 5], ['development', 5], ['mechanics', 5], ['grammar', 5]];
const RUBRIC: Rubric = { id: 'syn-laila-shaped', version: 1, criteria: TRAITS.map(([id, max]) => ({ id, maxPoints: max, levels: Array.from({ length: max + 1 }, (_, p) => ({ id: `${id}-${p}`, points: p })) })) };
const TEXT: RubricText = { rubricId: RUBRIC.id, rubricVersion: 1, criteria: TRAITS.map(([id, max]) => ({ criterionId: id, title: `معيار ${id}`, description: `وصف تجريبي للمعيار ${id}`,
  levels: Array.from({ length: max + 1 }, (_, p) => ({ levelId: `${id}-${p}`, description: `مستوى تجريبي ${p}` })) })) };
const ESSAY = 'هذه مقالة تجريبية. الفكرة الأولى واضحة. الفكرة الثانية مدعومة بمثال. الخاتمة تلخص الرأي.';
const QUOTES = ['هذه مقالة تجريبية', 'الفكرة الأولى واضحة', 'الفكرة الثانية مدعومة بمثال', 'الخاتمة تلخص الرأي'];
const Q: QuestionView = { id: 'q-essay', type: 'open-response', text: 'سؤال مقالي تجريبي', rubric: RUBRIC };
const attempt = (id = 'att-1'): AttemptView => Object.freeze({ id, tenantId: 'eval', assessmentVersion: 1, answers: Object.freeze([Object.freeze({ questionId: 'q-essay', studentAnswer: ESSAY })]) }) as AttemptView;
const CFG = { enabled: true, tenants: new Set(['eval']), timeoutMs: 1_000 };
const reply = (pts: number[], over: Record<string, unknown> = {}) => JSON.stringify({
  rubricVersion: 1, feedback: 'ملاحظات تجريبية', totalPoints: pts.reduce((a, b) => a + b, 0),
  criteria: TRAITS.map(([id], i) => ({ criterionId: id, selectedLevelId: `${id}-${pts[i]}`, points: pts[i], evidence: pts[i] > 0 ? [QUOTES[i % QUOTES.length]] : [] })), ...over });
function store() {
  const claimed = new Set<string>(); const rows = new Map<string, StoredResult>();
  const s: ResultStore = { claim: async (k) => (claimed.has(k) ? false : (claimed.add(k), true)), put: async (k, r) => { rows.set(k, structuredClone(r)); } };
  return { s, rows };
}
async function grade(steps: MockStep[], opts: Partial<Parameters<typeof createNativeGrader>[0]> = {}, run: Partial<Parameters<typeof runCandidateV2>[0]> = {}) {
  const provider = new MockProvider(steps);
  const st = store();
  const r = await runCandidateV2({ attempt: attempt(), question: Q, assessmentVersion: 1, expectedRubricVersion: 1, store: st.s, config: CFG,
    grader: createNativeGrader({ provider, rubricText: TEXT, callTimeoutMs: 50, ...opts }), ...run });
  return { r, provider, rows: st.rows };
}

describe('request building', () => {
  it('carries every criterion and declared level with wording, and identifiers', () => {
    const snap = buildSnapshot(attempt(), Q, ESSAY);
    const req = buildRequest(snap, ESSAY, TEXT);
    expect(req).toMatchObject({ candidateVersion: 'hybrid-v2-rubric-native-anchor-independent@design-v1', rubricId: RUBRIC.id, rubricVersion: 1, questionId: 'q-essay', attemptId: 'att-1', inputSnapshotHash: snap.hash, question: Q.text, answer: ESSAY });
    expect(req.criteria.map((c) => [c.criterionId, c.maxPoints, c.levels.length])).toEqual(TRAITS.map(([id, max]) => [id, max, max + 1]));
    expect(req.criteria.reduce((n, c) => n + c.maxPoints, 0)).toBe(32);
    expect(req.criteria[0].levels[2]).toEqual({ levelId: 'relevance-2', points: 2, description: 'مستوى تجريبي 2' });
    expect(req).not.toHaveProperty('references'); // none supplied -> none required
  });
  it('contains no anchors, human scores or reference scores', async () => {
    const { provider } = await grade([reply([2, 4, 3, 3, 4, 2, 3])]);
    const sent = JSON.stringify(provider.requests[0]).replace(/hybrid-v2-rubric-native-anchor-independent@design-v1/, '');
    expect(sent).not.toMatch(/anchor|human_score|humanScore|teacher|gold|canonical|reference_score/i);
  });
  it('passes approved reference material only when given', () => {
    const req = buildRequest(buildSnapshot(attempt(), Q, ESSAY), ESSAY, TEXT, [{ kind: 'marking_guide', text: 'دليل', provenance: 'synthetic' }]);
    expect(req.references).toEqual([{ kind: 'marking_guide', text: 'دليل', provenance: 'synthetic' }]);
  });
});

describe('rubric compatibility', () => {
  it('accepts a matching bundle and rejects mismatches before any provider call', async () => {
    expect(checkRubricCompatibility(RUBRIC, TEXT)).toEqual({ ok: true });
    const bad: RubricText[] = [
      { ...TEXT, rubricVersion: 2 },
      { ...TEXT, criteria: TEXT.criteria.slice(1) },
      { ...TEXT, criteria: [{ ...TEXT.criteria[0], levels: TEXT.criteria[0].levels.slice(1) }, ...TEXT.criteria.slice(1)] },
      { ...TEXT, criteria: [{ ...TEXT.criteria[0], description: ' ' }, ...TEXT.criteria.slice(1)] },
    ];
    for (const t of bad) {
      expect(checkRubricCompatibility(RUBRIC, t).ok).toBe(false);
      const { r, provider } = await grade([reply([2, 4, 3, 3, 4, 2, 3])], { rubricText: t });
      expect(r).toMatchObject({ status: 'ERROR', reasonCode: 'GRADER_EXCEPTION' });
      expect(provider.requests).toHaveLength(0);
    }
  });
});

describe('valid outputs through the unchanged V2 contract', () => {
  it.each([[[2, 4, 3, 3, 4, 2, 3], 21], [[0, 0, 0, 0, 0, 0, 0], 0], [[2, 5, 5, 5, 5, 5, 5], 32]])('%j -> total %i', async (pts, total) => {
    const { r } = await grade([reply(pts)]);
    expect(r).toMatchObject({ status: 'VALID', result: { totalPoints: total, scoreMax: 32, rubricVersion: 1 } });
    expect((r.result as any).criteria.map((c: any) => c.points)).toEqual(pts);
  });
  it('accepts JSON wrapped in prose but adds nothing', () => {
    expect(parseReply(`نتيجة: ${reply([2, 4, 3, 3, 4, 2, 3])} انتهى`)).toEqual(JSON.parse(reply([2, 4, 3, 3, 4, 2, 3])));
  });
});

describe('invalid outputs, evidence, ranges, totals', () => {
  const cases: [string, string, string, string][] = [
    ['unparseable', 'not json at all', 'INVALID_OUTPUT', 'MALFORMED_OUTPUT'],
    ['empty', '   ', 'INVALID_OUTPUT', 'EMPTY_OUTPUT'],
    ['array', '[1,2]', 'INVALID_OUTPUT', 'MALFORMED_OUTPUT'],
    ['missing criteria', JSON.stringify({ rubricVersion: 1, totalPoints: 0, feedback: 'f' }), 'INVALID_OUTPUT', 'MALFORMED_OUTPUT'],
    ['missing feedback', reply([2, 4, 3, 3, 4, 2, 3], { feedback: undefined }), 'INVALID_OUTPUT', 'MISSING_FEEDBACK'],
    ['missing total', reply([2, 4, 3, 3, 4, 2, 3], { totalPoints: undefined }), 'INVALID_OUTPUT', 'SCORE_OUT_OF_RANGE'],
    ['wrong rubric version', reply([2, 4, 3, 3, 4, 2, 3], { rubricVersion: 2 }), 'INVALID_OUTPUT', 'RUBRIC_VERSION_MISMATCH'],
    ['ungradable', JSON.stringify({ ungradable: true }), 'UNGRADABLE', 'UNGRADABLE_ANSWER'],
  ];
  it.each(cases)('%s', async (_n, text, status, code) => {
    const { r } = await grade([text]);
    expect(r).toMatchObject({ status, reasonCode: code });
    expect(r.result).toBeUndefined();
  });
  it('rejects missing, fabricated and whitespace evidence', async () => {
    const base = JSON.parse(reply([2, 4, 3, 3, 4, 2, 3]));
    for (const ev of [[], ['نص غير موجود في المقالة'], ['   ']]) {
      const o = structuredClone(base); o.criteria[1].evidence = ev;
      expect((await grade([JSON.stringify(o)])).r).toMatchObject({ reasonCode: 'MISSING_EVIDENCE' });
    }
  });
  it('rejects out-of-range and off-level scores', async () => {
    const base = JSON.parse(reply([2, 4, 3, 3, 4, 2, 3]));
    const relevance3 = structuredClone(base); relevance3.criteria[0] = { ...relevance3.criteria[0], selectedLevelId: 'relevance-3', points: 3 };
    expect((await grade([JSON.stringify(relevance3)])).r).toMatchObject({ reasonCode: 'INVALID_LEVEL_ID' });
    const frac = structuredClone(base); frac.criteria[1].points = 3.5;
    expect((await grade([JSON.stringify(frac)])).r).toMatchObject({ reasonCode: 'CRITERION_POINTS_MISMATCH' });
    for (const t of [-1, 33, 'NaN']) expect((await grade([JSON.stringify({ ...base, totalPoints: t })])).r).toMatchObject({ status: 'INVALID_OUTPUT' });
  });
  it('rejects a total that is not the sum', async () => {
    expect((await grade([reply([2, 4, 3, 3, 4, 2, 3], { totalPoints: 20 })])).r).toMatchObject({ reasonCode: 'TOTAL_POINTS_MISMATCH' });
  });
});

describe('timeouts, provider failures, retries, budget', () => {
  it('timeout -> ERROR/TIMEOUT, no score, stored failure', async () => {
    const { r, rows } = await grade(['hang']);
    expect(r).toMatchObject({ status: 'ERROR', reasonCode: 'TIMEOUT' });
    expect(r.result).toBeUndefined();
    expect([...rows.values()][0]).toMatchObject({ status: 'ERROR', reasonCode: 'TIMEOUT' });
  });
  it.each(['RATE_LIMITED', 'UNAVAILABLE', 'BAD_REQUEST', 'NETWORK'] as const)('%s with default policy (0 retries): one call, ERROR', async (code) => {
    const { r, provider } = await grade([new ProviderError(code), reply([2, 4, 3, 3, 4, 2, 3])]);
    expect(r).toMatchObject({ status: 'ERROR', reasonCode: 'GRADER_EXCEPTION' });
    expect(provider.requests).toHaveLength(1);
  });
  it('with transportRetries=1 retries a retryable error exactly once, never a non-retryable one', async () => {
    const ok = await grade([new ProviderError('UNAVAILABLE'), reply([2, 4, 3, 3, 4, 2, 3])], { transportRetries: 1 });
    expect(ok.r.status).toBe('VALID');
    expect(ok.provider.requests).toHaveLength(2);
    const twice = await grade([new ProviderError('RATE_LIMITED'), new ProviderError('RATE_LIMITED'), reply([2, 4, 3, 3, 4, 2, 3])], { transportRetries: 1 });
    expect(twice.r.status).toBe('ERROR');
    expect(twice.provider.requests).toHaveLength(2);
    const bad = await grade([new ProviderError('BAD_REQUEST'), reply([2, 4, 3, 3, 4, 2, 3])], { transportRetries: 1 });
    expect(bad.r.status).toBe('ERROR');
    expect(bad.provider.requests).toHaveLength(1);
  });
  it('an invalid output is never retried (no repair policy approved)', async () => {
    const { r, provider } = await grade(['not json', reply([2, 4, 3, 3, 4, 2, 3])], { transportRetries: 1 });
    expect(r).toMatchObject({ status: 'INVALID_OUTPUT' });
    expect(provider.requests).toHaveLength(1);
  });
  it('budget caps stop before the provider is called', async () => {
    const budget = new CandidateV2Budget({ maxCalls: 1, maxUsd: 1 }, () => 0.02);
    const first = await grade([reply([2, 4, 3, 3, 4, 2, 3])], { budget });
    expect(first.r.status).toBe('VALID');
    const second = await grade([reply([2, 4, 3, 3, 4, 2, 3])], { budget }, { attempt: attempt('att-2') });
    expect(second.r).toMatchObject({ status: 'ERROR', reasonCode: 'GRADER_EXCEPTION' });
    expect(second.provider.requests).toHaveLength(0);
    const unpriced = await grade([reply([2, 4, 3, 3, 4, 2, 3])], { budget: new CandidateV2Budget({ maxCalls: 5, maxUsd: 1 }, () => null) });
    expect(unpriced.provider.requests).toHaveLength(0);
  });
});

describe('isolation and idempotency', () => {
  it('duplicate and concurrent runs make one provider call', async () => {
    const provider = new MockProvider(Array(10).fill(reply([2, 4, 3, 3, 4, 2, 3])));
    const st = store();
    const p = { attempt: attempt(), question: Q, assessmentVersion: 1, store: st.s, config: CFG, grader: createNativeGrader({ provider, rubricText: TEXT }) };
    const rs = await Promise.all(Array.from({ length: 5 }, () => runCandidateV2(p)));
    expect(rs.filter((x) => x.status === 'VALID')).toHaveLength(1);
    expect(provider.requests).toHaveLength(1);
  });
  it('touches no network, SDK, telemetry, official records, V6 or anchors', async () => {
    trap.calls.length = 0;
    await grade([reply([2, 4, 3, 3, 4, 2, 3])]);
    await grade(['hang']);
    expect(trap.calls).toEqual([]);
  });
  it('Candidate V2 sources import nothing from V1, models, telemetry or providers', () => {
    const dir = path.join(__dirname, '../../src/services/candidateV2');
    for (const f of readdirSync(dir)) {
      const imports = readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => /^\s*import\b|require\(/.test(l)).join('\n');
      expect(imports).not.toMatch(/hybridV1|models\/|mongoose|@anthropic-ai|aiCalls|aiJson/);
      const code = readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/anchorsFor|pickAnchors|gradeV6|trackAiCall|fetch\(/);
    }
  });
  it('frozen contract and runner are unchanged', () => {
    const sha = (f: string) => require('crypto').createHash('sha256').update(readFileSync(path.join(__dirname, '../../src/services/candidateV2', f))).digest('hex');
    expect(sha('contract.ts')).toBe('771629a6e8f677d43c15cec6df643df5c16d12611c21970649f2a311c1ce8c8c');
    expect(sha('runner.ts')).toBe('b74dcafaa8c943c66b52af3d1b1adf7bda5db63850930c6ce97252c3062cc05d');
  });
});
