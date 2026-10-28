import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CandidateV2Budget } from '../../src/services/candidateV2/budget';
import type { OpenResult } from '../../src/services/candidateV2/contract';
import { EVALV2_SYSTEM, renderEvalV2, type PromptProvider, type PromptReply } from '../../src/services/candidateV2/evalV2Criterion';
import { lailaRubric } from '../../src/services/candidateV2/lailaAdapter';
import { lailaScores } from '../../src/services/candidateV2/lailaAggregate';
import { createR1Grader, LAILA_README_RULE, LAILA_ZERO_SENTENCE, lailaRubricR1, R1_SYSTEM_SUFFIX, type R1Trace } from '../../src/services/candidateV2/lailaR1';
import { buildRequest } from '../../src/services/candidateV2/nativeGrader';
import { ProviderError } from '../../src/services/candidateV2/provider';
import { buildSnapshot, runCandidateV2, type ResultStore } from '../../src/services/candidateV2/runner';
import { SettledBudget } from '../../src/services/candidateV2/settledBudget';
import { priceBound } from '../../src/services/candidateV2/pricing';

// Offline only: mock provider, synthetic answer, official LAILA rubric files.
// Synthetic LAILA-shaped fixture by default (CI has no dataset); LAILA_RUBRICS_DIR runs against the official files.
const RUBRICS = process.env.LAILA_RUBRICS_DIR ?? path.join(__dirname, '../fixtures/laila_synthetic_rubrics');
const ANSWER = 'التكنولوجيا  تساعد الطلاب على التعلم.\nلكنها لا تغني عن المعلم في الفصل.';
const TRAITS = ['relevance', 'organization', 'vocabulary', 'style', 'development', 'mechanics', 'grammar'];
const reply = (lv: Record<string, string>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ criteria: TRAITS.map((t) => ({ criterionId: t, levelId: lv[t] ?? '2', evidence: (lv[t] ?? '2') === '0' ? [] : ['التكنولوجيا تساعد الطلاب'], rationale: 'r' })),
    scoreExplanation: 'شرح', strengths: [], improvements: [], feedback: 'ملاحظات', objectiveIds: [], confidence: 'medium', flags: [], ...extra });
const ALL0 = Object.fromEntries(TRAITS.map((t) => [t, '0']));
const ALL2 = Object.fromEntries(TRAITS.map((t) => [t, '2']));

class Mock implements PromptProvider {
  readonly name = 'mock';
  calls: { system: string; user: string }[] = [];
  constructor(private steps: (string | PromptReply | Error)[]) {}
  async complete(p: { system: string; user: string; maxTokens: number }): Promise<PromptReply> {
    this.calls.push(p);
    const s = this.steps.shift() ?? new ProviderError('UNAVAILABLE');
    if (s instanceof Error) throw s;
    return typeof s === 'string' ? { text: s, stopReason: 'end_turn', usage: { inputTokens: 6000, outputTokens: 1000 } } : s;
  }
}
const { rubric, text } = lailaRubricR1(RUBRICS, '3');
async function run(steps: (string | PromptReply | Error)[], budget?: CandidateV2Budget) {
  const provider = new Mock(steps);
  let trace: R1Trace | undefined;
  const grader = createR1Grader({ provider, rubricText: text, budget, model: 'claude-sonnet-5-5', onTrace: (_, t) => { trace = t; } });
  const claimed = new Set<string>();
  const store: ResultStore = { async claim(k) { if (claimed.has(k)) return false; claimed.add(k); return true; }, async put() {} };
  const r = await runCandidateV2({
    attempt: { id: 'a1', tenantId: 't', assessmentVersion: 1, answers: [{ questionId: 'q3', studentAnswer: ANSWER }] },
    question: { id: 'q3', type: 'open-response', text: 'سؤال', rubric }, assessmentVersion: 1, grader, store, config: { enabled: true, tenants: new Set(['t']), timeoutMs: 10_000 },
  });
  return { r, provider, trace };
}

describe('R1 rubric text', () => {
  it('the zero sentence is the official level-0 line of every non-relevance trait, for all 8 prompts', () => {
    for (let p = 1; p <= 8; p++) expect(() => lailaRubricR1(RUBRICS, String(p))).not.toThrow();
  });
  it('only the relevance description changes; ids, levels and level wording are identical to offline-v1', () => {
    const v1 = lailaRubric(RUBRICS, '3');
    expect(rubric).toEqual(v1.rubric);
    for (const c of text.criteria) {
      const b = v1.text.criteria.find((x) => x.criterionId === c.criterionId)!;
      expect(c.levels).toEqual(b.levels);
      if (c.criterionId === 'relevance') expect(c.description).toBe(`${b.description}. ${LAILA_ZERO_SENTENCE} ${LAILA_README_RULE}`);
      else expect(c.description).toBe(b.description);
    }
  });
  it('the README rule is quoted exactly from the dataset README', () => {
    expect(readFileSync(path.join(RUBRICS, 'README.md'), 'utf8')).toContain(LAILA_README_RULE.replace('If an essay', 'If an essay'));
  });
});

describe('R1 prompt', () => {
  it('system = unchanged eval-v2 text + the LAILA suffix; offline-v1 rendering is unchanged', async () => {
    const { provider } = await run([reply(ALL2), reply(ALL2)]);
    expect(provider.calls[0].system).toBe(EVALV2_SYSTEM('Arabic') + R1_SYSTEM_SUFFIX);
    const snap = buildSnapshot({ id: 'a1', tenantId: 't', assessmentVersion: 1, answers: [] }, { id: 'q3', type: 'open-response', text: 'سؤال', rubric }, ANSWER);
    expect(renderEvalV2(buildRequest(snap, ANSWER, lailaRubric(RUBRICS, '3').text)).system).toBe(EVALV2_SYSTEM('Arabic'));
    expect(createHash('sha256').update(EVALV2_SYSTEM('Arabic')).digest('hex')).toBe('4fc9349dc65a0a70fd968b821d8d3d06461a0e64f87825da7f15cdfc53cf0353');
  });
  it('the payload still carries no anchors, references or scores', async () => {
    const { provider } = await run([reply(ALL2), reply(ALL2)]);
    expect(provider.calls[0].user).not.toMatch(/anchor|calibration|modelAnswer|teacherScore|humanScore|holistic/i);
  });
});

describe('R1 grading through the unchanged runner and contract', () => {
  it('relevance 0 with all traits 0 is VALID; LAILA view total 0', async () => {
    const { r } = await run([reply(ALL0), reply(ALL0)]);
    expect(r.status).toBe('VALID');
    const s = lailaScores(r.result as OpenResult, rubric);
    expect(s.holistic).toBe(0);
    expect(s.relevanceZeroRuleApplied).toBe(false);
  });
  it('relevance 0 with other traits > 0 stays raw; the LAILA view zeroes them', async () => {
    const lv = { ...ALL2, relevance: '0' };
    const { r } = await run([reply(lv), reply(lv)]);
    const s = lailaScores(r.result as OpenResult, rubric);
    expect(s.rawHolistic).toBe(12);
    expect(s.holistic).toBe(0);
    expect(s.relevanceZeroRuleApplied).toBe(true);
  });
  it('records both evaluations’ scores and flags in the trace', async () => {
    const { trace } = await run([reply(ALL2, { flags: ['off_topic'] }), reply({ ...ALL2, grammar: '3' })]);
    const valid = trace!.events.filter((e) => e.outcome === 'valid');
    expect(valid.map((e) => e.scores!.grammar)).toEqual([2, 3]);
    expect(valid[0].flags).toContain('off_topic');
  });
  it('evidence, retry, conflict and timeout behaviour are offline-v1’s', async () => {
    const bad = JSON.parse(reply(ALL2));
    bad.criteria[1].evidence = ['اختلاق'];
    expect((await run([JSON.stringify(bad), JSON.stringify(bad)])).r.status).toBe('INVALID_OUTPUT');
    expect((await run(['x', reply(ALL2), reply(ALL2)])).r.status).toBe('VALID');
    const far = Object.fromEntries(TRAITS.map((t) => [t, t === 'relevance' ? '0' : '5']));
    expect((await run([reply(far), reply(ALL0), reply({ ...ALL0, relevance: '1', grammar: '3', style: '3', development: '3' })])).r.status).toBe('ERROR');
    expect((await run([new ProviderError('TIMEOUT')])).r).toMatchObject({ status: 'ERROR', reasonCode: 'TIMEOUT' });
  });
});

describe('settled budget', () => {
  const bound = (c: { model: string; inputChars: number; maxOutputTokens: number }) => priceBound(c);
  it('reserves the bound before the call, then books the measured cost', async () => {
    const b = new SettledBudget({ maxCalls: 10, maxUsd: 10 }, bound);
    await run([reply(ALL2), reply(ALL2)], b);
    expect(b.calls).toBe(2);
    expect(b.settledCalls).toBe(2);
    expect(b.actualUsd).toBeCloseTo(2 * (6000 * 2 + 1000 * 10) / 1e6, 9);
    expect(b.reservedUsd).toBeCloseTo(b.actualUsd, 9);
  });
  it('still stops before the provider when the next bound would exceed the cap', async () => {
    const b = new SettledBudget({ maxCalls: 10, maxUsd: 0.05 }, bound); // bound ≈ 0.04-0.05 per call
    const { r, provider } = await run([reply(ALL2), reply(ALL2), reply(ALL2)], b);
    expect(provider.calls.length).toBeLessThan(3);
    expect(r.status).toBe('ERROR');
    expect(b.reservedUsd).toBeLessThanOrEqual(0.05 + 1e-9);
  });
  it('a call without usage keeps the full bound booked; unknown prices stop before any call', async () => {
    const b = new SettledBudget({ maxCalls: 10, maxUsd: 10 }, bound);
    await run([{ text: reply(ALL2), stopReason: 'end_turn' }, { text: reply(ALL2), stopReason: 'end_turn' }], b);
    expect(b.settledCalls).toBe(0);
    expect(b.reservedUsd).toBeGreaterThan(0.05);
    const z = new SettledBudget({ maxCalls: 10, maxUsd: 10 }, () => null);
    const { provider } = await run([reply(ALL2)], z);
    expect(provider.calls).toHaveLength(0);
  });
});

describe('isolation', () => {
  it('new files import only Candidate V2 modules and node built-ins', () => {
    for (const f of ['lailaR1.ts', 'settledBudget.ts']) {
      const src = readFileSync(path.join(__dirname, '../../src/services/candidateV2', f), 'utf8');
      const froms = src.match(/from '([^']+)'/g) ?? [];
      expect(froms.every((m) => /from '(\.\/[a-zA-Z0-9]+|fs|path|crypto)'/.test(m))).toBe(true);
    }
  });
  it('offline-v1 module is byte-identical to the evaluated baseline', () => {
    const src = readFileSync(path.join(__dirname, '../../src/services/candidateV2/evalV2Criterion.ts'));
    expect(createHash('sha256').update(src).digest('hex')).toBe('c0cb24955a1601150471519a8cb0a44189df9ecad7091c93febaec1c73f4f117');
  });
});
