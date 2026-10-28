import { createHash } from 'crypto';
import { buildRequest } from '../../src/services/candidateV2/nativeGrader';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CandidateV2Budget } from '../../src/services/candidateV2/budget';
import { validateOpenOutput, type OpenResult } from '../../src/services/candidateV2/contract';
import { agree, createEvalV2CriterionGrader, EVALV2_SYSTEM, renderEvalV2, resolveQuote, validateEvalV2, type EvalV2Trace, type PromptProvider, type PromptReply } from '../../src/services/candidateV2/evalV2Criterion';
import { lailaRubric } from '../../src/services/candidateV2/lailaAdapter';
import { checkLailaRubric, lailaScores } from '../../src/services/candidateV2/lailaAggregate';
import { ProviderError } from '../../src/services/candidateV2/provider';
import { buildSnapshot, runCandidateV2, type ResultStore } from '../../src/services/candidateV2/runner';

// Offline only: mock provider, synthetic answer text (no LAILA essay), the official LAILA rubric files.
// Synthetic LAILA-shaped fixture by default (CI has no dataset); LAILA_RUBRICS_DIR runs against the official files.
const RUBRICS = process.env.LAILA_RUBRICS_DIR ?? path.join(__dirname, '../fixtures/laila_synthetic_rubrics');
const { rubric, text } = lailaRubric(RUBRICS, '3');
const ANSWER = 'التكنولوجيا  تساعد الطلاب على التعلم.\nلكنها لا تغني عن المعلم في الفصل.';
const TRAITS = ['relevance', 'organization', 'vocabulary', 'style', 'development', 'mechanics', 'grammar'];

const reply = (levels: Record<string, string>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    criteria: TRAITS.map((t) => ({ criterionId: t, levelId: levels[t] ?? '2', evidence: (levels[t] ?? '2') === '0' ? [] : ['التكنولوجيا تساعد الطلاب'], rationale: 'r' })),
    scoreExplanation: 'شرح', strengths: [], improvements: [], feedback: 'ملاحظات', objectiveIds: [], confidence: 'medium', flags: [], ...extra,
  });
const ALL2 = Object.fromEntries(TRAITS.map((t) => [t, '2']));

class Mock implements PromptProvider {
  readonly name = 'mock';
  calls: { system: string; user: string; maxTokens: number }[] = [];
  constructor(private steps: (string | PromptReply | Error)[]) {}
  async complete(p: { system: string; user: string; maxTokens: number }): Promise<PromptReply> {
    this.calls.push(p);
    const s = this.steps.shift() ?? new ProviderError('UNAVAILABLE', 'exhausted');
    if (s instanceof Error) throw s;
    return typeof s === 'string' ? { text: s, stopReason: 'end_turn' } : s;
  }
}

const snap = () => buildSnapshot({ id: 'a1', tenantId: 't', assessmentVersion: 1, answers: [] }, { id: 'q3', type: 'open-response', text: 'سؤال', rubric }, ANSWER);
async function run(steps: (string | PromptReply | Error)[], budget?: CandidateV2Budget) {
  const provider = new Mock(steps);
  let trace: EvalV2Trace | undefined;
  const grader = createEvalV2CriterionGrader({ provider, rubricText: text, budget, model: 'claude-sonnet-5-5', onTrace: (_, t) => { trace = t; } });
  const claimed = new Set<string>();
  const store: ResultStore = { async claim(k) { if (claimed.has(k)) return false; claimed.add(k); return true; }, async put() {} };
  const r = await runCandidateV2({
    attempt: { id: 'a1', tenantId: 't', assessmentVersion: 1, answers: [{ questionId: 'q3', studentAnswer: ANSWER }] },
    question: { id: 'q3', type: 'open-response', text: 'سؤال', rubric }, assessmentVersion: 1, grader, store,
    config: { enabled: true, tenants: new Set(['t']), timeoutMs: 10_000 },
  });
  return { r, provider, trace };
}

describe('LAILA rubric and aggregation', () => {
  it('the adapter rubric is exactly LAILA (7 traits, 0..2 / 0..5) for all 8 prompts', () => {
    for (let p = 1; p <= 8; p++) expect(checkLailaRubric(lailaRubric(RUBRICS, String(p)).rubric)).toEqual([]);
  });
  it('rejects a rubric with a missing trait or a converted scale', () => {
    expect(checkLailaRubric({ ...rubric, criteria: rubric.criteria.slice(1) })).not.toEqual([]);
    const tenPoint = { ...rubric, criteria: rubric.criteria.map((c) => (c.id === 'grammar' ? { ...c, maxPoints: 10, levels: c.levels.map((l) => ({ ...l, points: l.points * 2 })) } : c)) };
    expect(checkLailaRubric(tenPoint).join()).toMatch(/grammar/);
  });
  const result = (pts: Record<string, number>): OpenResult => ({ status: 'VALID', criteria: TRAITS.map((t) => ({ criterionId: t, selectedLevelId: String(pts[t]), points: pts[t], evidence: [] })), totalPoints: TRAITS.reduce((n, t) => n + pts[t], 0), scoreMin: 0, scoreMax: 32, feedback: 'f', rubricVersion: 1 });
  it('holistic = sum of the seven integer trait scores (0..32)', () => {
    const s = lailaScores(result({ relevance: 2, organization: 5, vocabulary: 5, style: 5, development: 5, mechanics: 5, grammar: 5 }), rubric);
    expect(s.holistic).toBe(32);
    expect(s.rawHolistic).toBe(32);
    expect(s.relevanceZeroRuleApplied).toBe(false);
  });
  it('relevance 0 forces the other traits to 0 in the LAILA view; raw scores are kept', () => {
    const s = lailaScores(result({ relevance: 0, organization: 2, vocabulary: 1, style: 0, development: 3, mechanics: 1, grammar: 1 }), rubric);
    expect(s.raw.development).toBe(3);
    expect(s.rawHolistic).toBe(8);
    expect(s.scores).toEqual(Object.fromEntries(TRAITS.map((t) => [t, 0])));
    expect(s.holistic).toBe(0);
    expect(s.relevanceZeroRuleApplied).toBe(true);
  });
  it('relevance 0 with all traits already 0: rule satisfied, nothing changed', () => {
    const s = lailaScores(result(Object.fromEntries(TRAITS.map((t) => [t, 0]))), rubric);
    expect(s.relevanceZeroRuleApplied).toBe(false);
  });
  it('refuses a non-sum total or an out-of-range trait', () => {
    expect(() => lailaScores({ ...result({ relevance: 1, organization: 1, vocabulary: 1, style: 1, development: 1, mechanics: 1, grammar: 1 }), totalPoints: 9 }, rubric)).toThrow(/sum/);
    expect(() => lailaScores(result({ relevance: 3, organization: 1, vocabulary: 1, style: 1, development: 1, mechanics: 1, grammar: 1 }), rubric)).toThrow(/relevance/);
  });
});

describe('eval-v2 evidence rule', () => {
  it('matches across whitespace and case and returns the exact answer substring', () => {
    expect(resolveQuote(ANSWER, 'التكنولوجيا تساعد الطلاب')).toBe('التكنولوجيا  تساعد الطلاب');
    expect(resolveQuote(ANSWER, 'التعلم. لكنها')).toBe('التعلم.\nلكنها');
    expect(resolveQuote('Hello World', 'hello   world')).toBe('Hello World');
  });
  it('does not match a paraphrase, a spelling change or an empty quote', () => {
    expect(resolveQuote(ANSWER, 'التقنية تساعد الطلاب')).toBeNull();
    expect(resolveQuote(ANSWER, 'التكنولوجيا تساعد الطالب')).toBeNull();
    expect(resolveQuote(ANSWER, '   ')).toBeNull();
  });
  it('drops unmatched quotes but keeps the level when one quote matches', () => {
    const raw = JSON.parse(reply(ALL2));
    raw.criteria[0].evidence = ['كلام غير موجود', 'التكنولوجيا تساعد الطلاب'];
    const v = validateEvalV2(raw, rubric, ANSWER);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.droppedQuotes).toBe(1);
      expect(v.flags).toContain('evidence_not_found');
      expect(v.criteria[0].evidence).toEqual(['التكنولوجيا  تساعد الطلاب']);
    }
  });
  it('rejects points with no matching quote; allows 0 points without quotes', () => {
    const raw = JSON.parse(reply(ALL2));
    raw.criteria[1].evidence = ['اختلاق'];
    expect(validateEvalV2(raw, rubric, ANSWER)).toMatchObject({ ok: false, reason: expect.stringMatching(/organization/) });
    expect(validateEvalV2(JSON.parse(reply({ ...ALL2, style: '0' })), rubric, ANSWER).ok).toBe(true);
  });
  it('rejects malformed replies, missing criteria, undeclared levels, missing feedback and objective ids', () => {
    expect(validateEvalV2('text', rubric, ANSWER).ok).toBe(false);
    expect(validateEvalV2({}, rubric, ANSWER).ok).toBe(false);
    const missing = JSON.parse(reply(ALL2));
    missing.criteria = missing.criteria.filter((c: { criterionId: string }) => c.criterionId !== 'grammar');
    expect(validateEvalV2(missing, rubric, ANSWER)).toMatchObject({ ok: false, reason: expect.stringMatching(/grammar/) });
    expect(validateEvalV2(JSON.parse(reply({ ...ALL2, relevance: '3' })), rubric, ANSWER).ok).toBe(false);
    expect(validateEvalV2(JSON.parse(reply({ ...ALL2, grammar: '2.5' })), rubric, ANSWER).ok).toBe(false);
    expect(validateEvalV2(JSON.parse(reply(ALL2, { feedback: '' })), rubric, ANSWER).ok).toBe(false);
    expect(validateEvalV2(JSON.parse(reply(ALL2, { scoreExplanation: '' })), rubric, ANSWER).ok).toBe(false);
    expect(validateEvalV2(JSON.parse(reply(ALL2, { objectiveIds: ['x'] })), rubric, ANSWER).ok).toBe(false);
  });
});

describe('eval-v2 agreement rule', () => {
  const ev = (levels: Record<string, string>) => {
    const v = validateEvalV2(JSON.parse(reply(levels)), rubric, ANSWER);
    if (!v.ok) throw new Error(v.reason);
    return v;
  };
  it('agrees within one level per criterion and max(1, floor(32/4)) = 8 total points', () => {
    expect(agree(ev(ALL2), ev({ ...ALL2, grammar: '3', style: '1' }), rubric)).toBe(true);
    expect(agree(ev(ALL2), ev({ ...ALL2, grammar: '4' }), rubric)).toBe(false);
  });
  it('on LAILA the total tolerance (8) never binds: one level on all 7 traits moves the total by 7 at most', () => {
    const hi = Object.fromEntries(TRAITS.map((t) => [t, t === 'relevance' ? '2' : '5']));
    const lo = Object.fromEntries(TRAITS.map((t) => [t, t === 'relevance' ? '1' : '4']));
    expect(agree(ev(hi), ev(lo), rubric)).toBe(true); // 32 vs 25: the largest gap the level rule allows
    expect(agree(ev(hi), ev({ ...lo, grammar: '3' }), rubric)).toBe(false); // a 2-level gap on one trait decides
  });
});

describe('grader through the unchanged Candidate V2 runner and contract', () => {
  it('two agreeing evaluations: VALID, first evaluation chosen, exact evidence, total = sum', async () => {
    const { r, provider, trace } = await run([reply(ALL2), reply({ ...ALL2, grammar: '3' })]);
    expect(r.status).toBe('VALID');
    expect(provider.calls).toHaveLength(2);
    expect(trace?.decision).toBe('AGREED');
    const res = r.result as OpenResult;
    expect(res.totalPoints).toBe(14);
    expect(res.criteria.find((c) => c.criterionId === 'grammar')?.points).toBe(2);
    for (const c of res.criteria) for (const q of c.evidence) expect(ANSWER.includes(q)).toBe(true);
    expect(lailaScores(res, rubric).holistic).toBe(14);
  });
  it('disagreement: a third evaluation decides with the run it agrees with', async () => {
    const far = Object.fromEntries(TRAITS.map((t) => [t, t === 'relevance' ? '2' : '5']));
    const { r, provider, trace } = await run([reply(ALL2), reply(far), reply({ ...far, grammar: '4' })]);
    expect(provider.calls).toHaveLength(3);
    expect(trace?.decision).toBe('THIRD_AGREED');
    expect((r.result as OpenResult).totalPoints).toBe(32);
  });
  it('no partner for the third evaluation: ERROR, never a grade', async () => {
    const far = Object.fromEntries(TRAITS.map((t) => [t, t === 'relevance' ? '0' : '5']));
    const mid = Object.fromEntries(TRAITS.map((t) => [t, t === 'relevance' ? '1' : '0']));
    const zero = Object.fromEntries(TRAITS.map((t) => [t, '0']));
    const { r, trace } = await run([reply(far), reply(zero), reply({ ...mid, grammar: '3', style: '3', development: '3' })]);
    expect(r.status).toBe('ERROR');
    expect(r.result).toBeUndefined();
    expect(trace?.decision).toBe('CONFLICT');
  });
  it('an invalid reply gets one more attempt (eval-v2); a valid retry continues', async () => {
    const { r, provider, trace } = await run(['not json', reply(ALL2), reply(ALL2)]);
    expect(r.status).toBe('VALID');
    expect(provider.calls).toHaveLength(3);
    expect(trace?.events[0]).toMatchObject({ evaluation: 1, attempt: 1, outcome: 'invalid' });
  });
  it('a cut-off reply counts as an attempt; two invalid attempts give INVALID_OUTPUT with no score', async () => {
    const { r, trace } = await run([{ text: '{"criteria":[', stopReason: 'max_tokens' }, 'still not json']);
    expect(r.status).toBe('INVALID_OUTPUT');
    expect(r.result).toBeUndefined();
    expect(trace?.decision).toBe('INVALID');
  });
  it('a missing criterion in both attempts is INVALID_OUTPUT (no default level)', async () => {
    const missing = JSON.parse(reply(ALL2));
    missing.criteria.pop();
    const { r } = await run([JSON.stringify(missing), JSON.stringify(missing)]);
    expect(r.status).toBe('INVALID_OUTPUT');
  });
  it('the integrity flag stops grading (ERROR)', async () => {
    const { r, trace } = await run([reply(ALL2, { flags: ['possible_integrity_issue'] }), reply(ALL2)]);
    expect(r.status).toBe('ERROR');
    expect(trace?.decision).toBe('INTEGRITY_FLAG');
  });
  it('provider timeout -> ERROR/TIMEOUT; other provider errors -> ERROR/GRADER_EXCEPTION', async () => {
    expect((await run([new ProviderError('TIMEOUT')])).r).toMatchObject({ status: 'ERROR', reasonCode: 'TIMEOUT' });
    expect((await run([new ProviderError('RATE_LIMITED')])).r).toMatchObject({ status: 'ERROR', reasonCode: 'GRADER_EXCEPTION' });
  });
  it('the budget is reserved before every call and stops before the provider is reached', async () => {
    const budget = new CandidateV2Budget({ maxCalls: 1, maxUsd: 100 }, () => 0.01);
    const { r, provider } = await run([reply(ALL2), reply(ALL2)], budget);
    expect(r.status).toBe('ERROR');
    expect(provider.calls).toHaveLength(1);
    const none = new CandidateV2Budget({ maxCalls: 10, maxUsd: 100 }, () => null);
    const z = await run([reply(ALL2)], none);
    expect(z.r.status).toBe('ERROR');
    expect(z.provider.calls).toHaveLength(0);
  });
  it('the contract still rejects anything the adapter did not resolve (exact quotes only)', () => {
    const out = { rubricVersion: 1, criteria: TRAITS.map((t) => ({ criterionId: t, selectedLevelId: '2', points: 2, evidence: ['التكنولوجيا تساعد الطلاب'] })), totalPoints: 14, feedback: 'f' };
    expect(validateOpenOutput(out, snap(), ANSWER)).toMatchObject({ status: 'INVALID_OUTPUT', reasonCode: 'MISSING_EVIDENCE' });
  });
});

describe('prompt and isolation', () => {
  it('the payload holds the rubric, question and answer only: no anchors, references, scores or model answer', () => {

    const p = renderEvalV2(buildRequest(snap(), ANSWER, text));
    expect(p.system).toBe(EVALV2_SYSTEM('Arabic'));
    const u = JSON.parse(p.user);
    expect(Object.keys(u).sort()).toEqual(['objectives', 'question', 'rubric', 'studentAnswer']);
    expect(u.rubric).toHaveLength(7);
    expect(p.user).not.toMatch(/anchor|calibration|modelAnswer|teacherScore|humanScore|holistic/i);
  });
  it('the system text is the eval-v2 text byte for byte (pinned hash)', () => {

    expect(createHash('sha256').update(EVALV2_SYSTEM('Arabic')).digest('hex')).toBe(EXPECTED_SYSTEM_SHA);
  });
  it('the new files import nothing from production grading, V1, models, telemetry or provider SDKs', () => {
    for (const f of ['evalV2Criterion.ts', 'lailaAggregate.ts', 'lailaAdapter.ts']) {
      const src = readFileSync(path.join(__dirname, '../../src/services/candidateV2', f), 'utf8');
      const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
      expect(imports).not.toMatch(/hybridV1|models\/|mongoose|@anthropic-ai|aiCalls|aiJson|gradingProposals|autoGrading|config\//);
      expect(imports.match(/from '([^']+)'/g)?.every((m) => /from '(\.\/|fs'|path'|crypto')/.test(m))).toBe(true);
    }
    expect(readdirSync(path.join(__dirname, '../../src/services/candidateV2')).some((f) => /live|anthropic/i.test(f))).toBe(false);
  });
});

const EXPECTED_SYSTEM_SHA = '4fc9349dc65a0a70fd968b821d8d3d06461a0e64f87825da7f15cdfc53cf0353'; // = production eval-v2 rubric system text (Arabic), checked at implementation time
