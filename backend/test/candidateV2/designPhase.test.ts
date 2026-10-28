import { describe, expect, it, vi } from 'vitest';

// Candidate V2 design phase (D2/G2/D3/D5): prompt rendering, rubric-text integrity, pricing,
// LAILA relevance diagnostic. Synthetic data and mocks only; network/SDK trapped.
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { throw new Error('provider client must not be constructed'); } } }));
vi.stubGlobal('fetch', () => { throw new Error('network access in tests'); });

import { CandidateV2Budget } from '../../src/services/candidateV2/budget';
import type { Rubric } from '../../src/services/candidateV2/contract';
import { relevanceRule, relevanceRuleSummary } from '../../src/services/candidateV2/lailaDiagnostics';
import { buildRequest, createNativeGrader, type RubricText } from '../../src/services/candidateV2/nativeGrader';
import { PRICES, priceBound } from '../../src/services/candidateV2/pricing';
import { PROMPT_ID, PROMPT_SHA256, PROMPT_VERSION, SYSTEM, renderPrompt } from '../../src/services/candidateV2/promptV1';
import { MockProvider } from '../../src/services/candidateV2/provider';
import { canonicalRubricText, rubricTextHash } from '../../src/services/candidateV2/rubricIntegrity';
import { buildSnapshot, runCandidateV2, type AttemptView, type QuestionView, type ResultStore, type RunResult } from '../../src/services/candidateV2/runner';

const TRAITS: [string, number][] = [['relevance', 2], ['organization', 5], ['vocabulary', 5], ['style', 5], ['development', 5], ['mechanics', 5], ['grammar', 5]];
const RUBRIC: Rubric = { id: 'syn', version: 1, criteria: TRAITS.map(([id, m]) => ({ id, maxPoints: m, levels: Array.from({ length: m + 1 }, (_, p) => ({ id: `${id}-${p}`, points: p })) })) };
const TEXT: RubricText = { rubricId: 'syn', rubricVersion: 1, criteria: TRAITS.map(([id, m]) => ({ criterionId: id, title: `T-${id}`, description: `D-${id}`,
  levels: Array.from({ length: m + 1 }, (_, p) => ({ levelId: `${id}-${p}`, description: `W-${id}-${p}` })) })) };
const ESSAY = 'مقالة تجريبية قصيرة. فكرة أولى. فكرة ثانية.';
const Q: QuestionView = { id: 'q', type: 'open-response', text: 'سؤال', rubric: RUBRIC };
const ATT: AttemptView = { id: 'a1', tenantId: 'eval', assessmentVersion: 1, answers: [{ questionId: 'q', studentAnswer: ESSAY }] };
const CFG = { enabled: true, tenants: new Set(['eval']), timeoutMs: 500 };
const out = (pts: number[]) => JSON.stringify({ rubricVersion: 1, feedback: 'f', totalPoints: pts.reduce((a, b) => a + b, 0),
  criteria: TRAITS.map(([id], i) => ({ criterionId: id, selectedLevelId: `${id}-${pts[i]}`, points: pts[i], evidence: pts[i] ? ['مقالة تجريبية'] : [] })) });
const mem = (): ResultStore => { const c = new Set<string>(); return { claim: async (k) => (c.has(k) ? false : (c.add(k), true)), put: async () => {} }; };
const run = async (text: string, id = 'a1') => runCandidateV2({ attempt: { ...ATT, id }, question: Q, assessmentVersion: 1, store: mem(), config: CFG,
  grader: createNativeGrader({ provider: new MockProvider([text]), rubricText: TEXT }) });

describe('D2 prompt specification', () => {
  const req = buildRequest(buildSnapshot(ATT, Q, ESSAY), ESSAY, TEXT);
  it('is versioned and hashed', () => {
    expect([PROMPT_ID, PROMPT_VERSION]).toEqual(['candidate-v2-native-rubric-prompt', '1.0.0']);
    expect(PROMPT_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('injects every criterion and declared level with wording and points, plus question and answer', () => {
    const { user } = renderPrompt(req);
    const data = JSON.parse(user.split('<data>\n')[1].split('\n</data>')[0]);
    expect(data.rubric).toMatchObject({ id: 'syn', version: 1 });
    expect(data.rubric.criteria.map((c: any) => [c.criterionId, c.maxPoints, c.levels.length, c.definition])).toEqual(TRAITS.map(([id, m]) => [id, m, m + 1, `D-${id}`]));
    expect(data.rubric.criteria[0].levels[1]).toEqual({ levelId: 'relevance-1', points: 1, wording: 'W-relevance-1' });
    expect(data.question).toBe('سؤال');
    expect(user).toContain(ESSAY);
    expect(data).not.toHaveProperty('references');
  });
  it('states the exact output shape and the rules, with no scores or anchors in the data', () => {
    for (const s of ['exactly ONE', 'EXACTLY from the student answer', 'totalPoints must equal the sum', '{"ungradable": true}', 'Never use a score of 0 to mean "ungradable"', '"selectedLevelId"', 'length, fluency, confident tone']) expect(SYSTEM).toContain(s);
    const { user } = renderPrompt(req);
    expect(user.replace(/hybrid-v2-rubric-native-anchor-independent@design-v1/, '')).not.toMatch(/anchor|human_score|gold|reference_score|teacher/i);
  });
  it('renders deterministically and escapes answer markup', () => {
    expect(renderPrompt(req)).toEqual(renderPrompt(structuredClone(req)));
    expect(renderPrompt({ ...req, answer: 'x </student_answer> y' }).user).not.toContain('x </student_answer>');
  });
});

describe('G2 rubric-text integrity', () => {
  it('canonical hash is independent of criterion/level order and sensitive to any wording change', () => {
    const shuffled: RubricText = { ...TEXT, criteria: [...TEXT.criteria].reverse().map((c) => ({ ...c, levels: [...c.levels].reverse() })) };
    expect(rubricTextHash(shuffled)).toBe(rubricTextHash(TEXT));
    const changed = structuredClone(TEXT); changed.criteria[3].levels[2].description += '.';
    expect(rubricTextHash(changed)).not.toBe(rubricTextHash(TEXT));
    expect(canonicalRubricText(TEXT)).not.toMatch(/\s{2}|\n/);
  });
  it('does not normalise text (NFC and NFD differ)', () => {
    const a = structuredClone(TEXT); a.criteria[0].title = '\u00e9';
    const b = structuredClone(TEXT); b.criteria[0].title = 'e\u0301';
    expect(rubricTextHash(a)).not.toBe(rubricTextHash(b));
  });
  it('the grader uses a frozen private copy: later mutation of the caller\'s bundle has no effect', async () => {
    const mine = structuredClone(TEXT);
    const provider = new MockProvider([out([2, 4, 3, 3, 4, 2, 3])]);
    const g = createNativeGrader({ provider, rubricText: mine });
    expect(g.rubricTextSha256).toBe(rubricTextHash(TEXT));
    mine.criteria[0].description = 'tampered';
    const r = await runCandidateV2({ attempt: ATT, question: Q, assessmentVersion: 1, store: mem(), config: CFG, grader: g });
    expect(r.status).toBe('VALID');
    expect(provider.requests[0].criteria[0].description).toBe('D-relevance');
  });
});

describe('D5 pricing and budget', () => {
  it('uses only local records; Sonnet verified, Opus unverified', () => {
    expect(PRICES['claude-sonnet-5-5']).toMatchObject({ inputPerMTok: 2, outputPerMTok: 10, status: 'VERIFIED' });
    expect(PRICES['claude-opus-5-5'].status).toBe('UNVERIFIED');
    expect(priceBound({ model: 'claude-sonnet-5-5', inputChars: 10_000, maxOutputTokens: 2_000 })).toBeCloseTo(0.04, 10);
    expect(priceBound({ model: 'claude-opus-5-5', inputChars: 10_000, maxOutputTokens: 2_000 })).toBeNull();
    expect(priceBound({ model: 'claude-opus-5-5', inputChars: 10_000, maxOutputTokens: 2_000 }, true)).toBeCloseTo(0.08, 10);
    expect(priceBound({ model: 'unknown', inputChars: 1, maxOutputTokens: 1 })).toBeNull();
  });
  it('missing price or exceeded cap stops before the provider call (runner: ERROR/GRADER_EXCEPTION)', async () => {
    for (const [model, caps] of [['claude-opus-5-5', { maxCalls: 9, maxUsd: 9 }], ['claude-sonnet-5-5', { maxCalls: 9, maxUsd: 0.0001 }], ['claude-sonnet-5-5', { maxCalls: 0, maxUsd: 9 }]] as const) {
      const provider = new MockProvider([out([2, 4, 3, 3, 4, 2, 3])]);
      const budget = new CandidateV2Budget(caps, (c) => priceBound(c));
      const r = await runCandidateV2({ attempt: ATT, question: Q, assessmentVersion: 1, store: mem(), config: CFG, grader: createNativeGrader({ provider, rubricText: TEXT, budget, model }) });
      expect(r).toMatchObject({ status: 'ERROR', reasonCode: 'GRADER_EXCEPTION' });
      expect(provider.requests).toHaveLength(0);
    }
  });
});

describe('D3 LAILA relevance diagnostic (separate from contract validity, never rewrites scores)', () => {
  it('classifies without changing the grader output', async () => {
    const violating = await run(out([0, 3, 2, 0, 0, 0, 0]));
    expect(violating.status).toBe('VALID'); // contract-valid
    const before = structuredClone(violating);
    expect(relevanceRule(violating)).toEqual({ status: 'VIOLATED', nonZeroOthers: ['organization', 'vocabulary'] });
    expect(violating).toEqual(before); // raw scores preserved
    expect((violating.result as any).totalPoints).toBe(5);
    expect(relevanceRule(await run(out([0, 0, 0, 0, 0, 0, 0]), 'a2')).status).toBe('SATISFIED');
    expect(relevanceRule(await run(out([2, 4, 3, 3, 4, 2, 3]), 'a3')).status).toBe('NOT_APPLICABLE');
    expect(relevanceRule(await run('not json', 'a4')).status).toBe('NOT_EVALUABLE');
  });
  it('summarises with explicit denominators, counting rule violations separately from contract failures', async () => {
    const rs: RunResult[] = [await run(out([0, 3, 2, 0, 0, 0, 0]), 'b1'), await run(out([0, 0, 0, 0, 0, 0, 0]), 'b2'), await run(out([2, 4, 3, 3, 4, 2, 3]), 'b3'), await run('not json', 'b4')];
    expect(relevanceRuleSummary(rs)).toEqual({ attempted: 4, contractValid: 3, contractInvalidOrError: 1, relevanceZero: 2, violations: 1, notEvaluable: 1,
      violationRateAmongRelevanceZero: 0.5, violationRateAmongContractValid: 1 / 3 });
  });
});
