import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// Candidate V2 synthetic runner tests: errors, anchor independence, attempt isolation, integrity.
// Every external path is booby-trapped: provider SDK, fetch, mongoose, the official attempt model,
// and all V6 / Hybrid V1 / anchor functions throw (and count) if touched.
const trap = vi.hoisted(() => ({ calls: [] as string[] }));
const boom = (name: string) => (..._a: unknown[]) => { trap.calls.push(name); throw new Error(`${name} must not be called`); };
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { trap.calls.push('anthropic'); throw new Error('provider'); } } }));
vi.mock('mongoose', async (orig) => {
  const m: any = await orig();
  return { ...m, default: { ...m.default, connect: boom('mongoose.connect'), createConnection: boom('mongoose.createConnection') }, connect: boom('mongoose.connect') };
});
vi.mock('../../src/models/AssessmentAttempt', () => ({
  AssessmentAttempt: new Proxy({}, { get: (_t, k) => boom(`AssessmentAttempt.${String(k)}`) }),
}));
vi.mock('../../src/services/hybridV1/shadow', () => ({ shadowGradeAttempt: boom('shadowGradeAttempt'), ShadowBudget: class { constructor() { trap.calls.push('ShadowBudget'); } } }));
vi.mock('../../src/services/hybridV1/hybrid', () => ({ pickAnchors: boom('pickAnchors'), combine: boom('combine'), eligibility: boom('hybridEligibility'), ANCHOR_SEED: 'x', HYBRID_VERSION: 'x' }));
vi.mock('../../src/services/hybridV1/v6', () => ({ gradeV6: boom('gradeV6'), V6: {} }));
vi.mock('../../src/models/HybridShadowResult', () => ({ HybridShadowResult: new Proxy({}, { get: (_t, k) => boom(`HybridShadowResult.${String(k)}`) }), HybridAnchorSet: new Proxy({}, { get: (_t, k) => boom(`HybridAnchorSet.${String(k)}`) }) }));
vi.stubGlobal('fetch', boom('fetch'));

import type { Rubric } from '../../src/services/candidateV2/contract';
import { buildSnapshot, readCandidateV2Config, runCandidateV2, summarize, type AttemptView, type Grader, type QuestionView, type ResultStore, type StoredResult } from '../../src/services/candidateV2/runner';

const RUBRIC: Rubric = { id: 'syn-rubric', version: 3, criteria: [
  { id: 'C1', maxPoints: 4, levels: [{ id: 'c1-0', points: 0 }, { id: 'c1-2', points: 2 }, { id: 'c1-4', points: 4 }] },
  { id: 'C2', maxPoints: 3, levels: [{ id: 'c2-0', points: 0 }, { id: 'c2-1', points: 1 }, { id: 'c2-3', points: 3 }] },
  { id: 'C3', maxPoints: 3, levels: [{ id: 'c3-0', points: 0 }, { id: 'c3-1', points: 1 }, { id: 'c3-3', points: 3 }] },
] };
const ANSWER = 'synthetic answer: alpha reason, beta example, gamma conclusion';
const OPEN: QuestionView = { id: 'q-open', type: 'open-response', text: 'synthetic open question', rubric: RUBRIC };
const SHORT: QuestionView = { id: 'q-short', type: 'short-answer', text: 'synthetic short question', points: 2 };
const VALID_OUT = { rubricVersion: 3, feedback: 'synthetic feedback', totalPoints: 8, criteria: [
  { criterionId: 'C1', selectedLevelId: 'c1-4', points: 4, evidence: ['alpha reason'] },
  { criterionId: 'C2', selectedLevelId: 'c2-1', points: 1, evidence: ['beta example'] },
  { criterionId: 'C3', selectedLevelId: 'c3-3', points: 3, evidence: ['gamma conclusion'] }] };
const CFG = { enabled: true, tenants: new Set(['tenant-a']), timeoutMs: 50 };

// Complete synthetic AssessmentAttempt-shaped fixture (official record stand-in).
const officialAttempt = () => ({
  id: 'att-1', tenantId: 'tenant-a', institutionId: 'tenant-a', assessmentId: 'as-1', assessmentTitle: 'Synthetic', studentId: 'student-1', assessmentVersion: 1,
  status: 'submitted', gradingStatus: 'released', submittedAt: new Date('2026-01-01T00:00:00Z'),
  answers: [
    { questionId: 'q-open', studentAnswer: ANSWER, points: 6, method: 'ai', proposalId: 'gp-1', criterionScores: [{ criterionId: 'C1', levelId: 'c1-2', points: 2 }], feedback: 'official' },
    { questionId: 'q-short', studentAnswer: 'synthetic short', points: 2, method: 'ai', isCorrect: true },
  ],
  history: [{ at: new Date('2026-01-01T00:00:00Z'), by: 'system:grader', action: 'released' }],
});
const deepFreeze = <T>(o: T): T => { Object.values(o as object).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };

function memStore(opts: { failPut?: boolean } = {}) {
  const claimed = new Set<string>();
  const rows = new Map<string, StoredResult>();
  const store: ResultStore = {
    claim: async (k) => { await Promise.resolve(); if (claimed.has(k)) return false; claimed.add(k); return true; },
    put: async (k, rec) => { if (opts.failPut) throw new Error('storage down'); rows.set(k, structuredClone(rec)); },
  };
  return { store, rows, claimed };
}
const run = (grader: Grader, extra: Partial<Parameters<typeof runCandidateV2>[0]> = {}) => {
  const attempt = extra.attempt ?? deepFreeze(officialAttempt()) as unknown as AttemptView;
  const s = memStore();
  return runCandidateV2({ attempt, question: OPEN, assessmentVersion: 1, expectedRubricVersion: 3, grader, store: s.store, config: CFG, ...extra }).then((r) => ({ r, s }));
};

describe('3. invalid output and errors (runner)', () => {
  const cases: [string, Grader, string, string][] = [
    ['malformed JSON text', async () => '{not json', 'INVALID_OUTPUT', 'MALFORMED_OUTPUT'],
    ['empty output', async () => null, 'INVALID_OUTPUT', 'EMPTY_OUTPUT'],
    ['missing fields', async () => ({ rubricVersion: 3 }), 'INVALID_OUTPUT', 'MALFORMED_OUTPUT'],
    ['invalid types', async () => ({ ...VALID_OUT, totalPoints: '8' }), 'INVALID_OUTPUT', 'SCORE_OUT_OF_RANGE'],
    ['ungradable answer', async () => ({ ungradable: true }), 'UNGRADABLE', 'UNGRADABLE_ANSWER'],
    ['timeout', () => new Promise(() => {}), 'ERROR', 'TIMEOUT'],
    ['exception', async () => { throw new Error('synthetic failure'); }, 'ERROR', 'GRADER_EXCEPTION'],
  ];
  it.each(cases)('%s -> explicit status, no score, no fallback', async (_n, grader, status, code) => {
    const { r, s } = await run(grader);
    expect(r).toMatchObject({ status, reasonCode: code, source: 'candidate_v2' });
    expect(r.result).toBeUndefined(); // never a zero or any score
    const stored = [...s.rows.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toHaveProperty('result');
    expect(Object.keys(r).sort()).toEqual(['candidateVersion', 'inputSnapshotHash', 'key', 'reasonCode', 'source', 'status']); // no fallback or other-grader fields
  });
  it('unsupported question types are NOT_ELIGIBLE and the grader is never called', async () => {
    const g = vi.fn();
    const { r } = await run(g as any, { question: { id: 'q-open', type: 'multiple-choice', text: 'x' } });
    expect(r).toMatchObject({ status: 'NOT_ELIGIBLE', reasonCode: 'UNSUPPORTED_QUESTION' });
    expect(g).not.toHaveBeenCalled();
  });
  it('short-answer path is binary', async () => {
    const { r } = await run(async () => ({ isCorrect: true, feedback: 'f' }), { question: SHORT });
    expect(r).toMatchObject({ status: 'VALID', result: { points: 2, isCorrect: true } });
    const { r: r2 } = await run(async () => ({ isCorrect: true, points: 1, feedback: 'f' }), { question: SHORT });
    expect(r2).toMatchObject({ status: 'INVALID_OUTPUT', reasonCode: 'SHORT_ANSWER_SCORE_NOT_BINARY' });
  });
  it('the runner has no fallback grader: failures stay Candidate V2 failures and are counted as such', async () => {
    const results = [(await run(async () => VALID_OUT)).r, (await run(async () => null)).r, (await run(async () => { throw new Error('x'); })).r,
      (await run(vi.fn() as any, { question: { id: 'q-open', type: 'true-false', text: 'x' } })).r, (await run(async () => ({ ungradable: true }))).r];
    expect(summarize(results)).toEqual({ valid: 1, failed: 2, ungradable: 1, notEligible: 1, duplicate: 0, total: 5 });
    expect(results.every((x) => x.source === 'candidate_v2')).toBe(true);
  });
});

describe('4. anchor independence', () => {
  it('runs with no anchor service or records; anchor, teacher-score and V6 paths are never touched', async () => {
    trap.calls.length = 0;
    const { r } = await run(async () => VALID_OUT);
    expect(r).toMatchObject({ status: 'VALID', result: { totalPoints: 8 } });
    expect(trap.calls).toEqual([]);
  });
  it('negative control: the traps really fire when touched', async () => {
    const hybrid = await import('../../src/services/hybridV1/hybrid');
    const v6 = await import('../../src/services/hybridV1/v6');
    const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
    const mongoose = (await import('mongoose')).default;
    trap.calls.length = 0;
    expect(() => hybrid.pickAnchors([], 's')).toThrow();
    expect(() => (v6 as any).gradeV6()).toThrow();
    expect(() => (AssessmentAttempt as any).find({ method: 'teacher' })).toThrow();
    expect(() => (mongoose as any).connect('x')).toThrow();
    expect(() => fetch('http://x')).toThrow();
    expect(trap.calls).toEqual(['pickAnchors', 'gradeV6', 'AssessmentAttempt.find', 'mongoose.connect', 'fetch']);
    trap.calls.length = 0;
  });
  it('the grader input contains no anchors or human scores', async () => {
    let seen: any;
    await run(async (snap) => { seen = snap; return VALID_OUT; });
    expect(Object.keys(seen).sort()).toEqual(['answerSha256', 'assessmentVersion', 'attemptId', 'candidateVersion', 'hash', 'kind', 'maxPoints', 'questionId', 'questionText', 'rubric', 'tenantId']);
    const { candidateVersion: _cv, ...inputs } = seen;
    expect(JSON.stringify(inputs)).not.toMatch(/anchor|human_score|teacher/i);
  });
  it('identical inputs give identical results whatever anchor collections exist elsewhere', async () => {
    const envA = { anchors: [{ answer: 'x', score: 5 }] };
    const envB = { anchors: [{ answer: 'y', score: 0 }, { answer: 'z', score: 3 }] };
    const g: Grader = async () => VALID_OUT;
    const a = await run(g, { ...(envA as any) });
    const b = await run(g, { ...(envB as any) });
    expect(a.r).toEqual(b.r);
  });
  it('the Candidate V2 sources import nothing from V6, Hybrid V1, anchors, models or providers', () => {
    const dir = path.join(__dirname, '../../src/services/candidateV2');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/hybridV1|anchorsFor|pickAnchors|gradeV6|models\/|mongoose|@anthropic-ai|aiJson|fetch\(|gradingProposals|autoGrading/);
    }
  });
});

describe('5. attempt isolation', () => {
  const scenarios: [string, Grader, { failPut?: boolean }][] = [
    ['success', async () => VALID_OUT, {}],
    ['validation failure', async () => ({ ...VALID_OUT, totalPoints: 7 }), {}],
    ['timeout', () => new Promise(() => {}), {}],
    ['exception', async () => { throw new Error('x'); }, {}],
    ['storage failure', async () => VALID_OUT, { failPut: true }],
  ];
  it.each(scenarios)('%s: the official attempt is unchanged and never written', async (name, grader, opts) => {
    trap.calls.length = 0;
    const attempt = officialAttempt();
    const before = structuredClone(attempt);
    deepFreeze(attempt); // any mutation attempt would throw in strict mode
    const s = memStore(opts);
    const r = await runCandidateV2({ attempt: attempt as unknown as AttemptView, question: OPEN, assessmentVersion: 1, grader, store: s.store, config: CFG });
    expect(attempt).toEqual(before);
    expect(trap.calls.filter((c) => c.startsWith('AssessmentAttempt'))).toEqual([]);
    if (name === 'storage failure') expect(r).toMatchObject({ status: 'ERROR', reasonCode: 'STORAGE_FAILURE' });
    for (const row of s.rows.values()) expect(Object.keys(row)).not.toContain('answers');
  });
  it('duplicate execution produces one result and one grader call', async () => {
    const s = memStore();
    const g = vi.fn(async () => VALID_OUT);
    const p = { attempt: deepFreeze(officialAttempt()) as unknown as AttemptView, question: OPEN, assessmentVersion: 1, grader: g, store: s.store, config: CFG };
    const first = await runCandidateV2(p);
    const second = await runCandidateV2(p);
    expect([first.status, second.status]).toEqual(['VALID', 'DUPLICATE']);
    expect(g).toHaveBeenCalledTimes(1);
    expect(s.rows.size).toBe(1);
  });
  it('concurrent execution claims once', async () => {
    const s = memStore();
    const g = vi.fn(async () => VALID_OUT);
    const p = { attempt: deepFreeze(officialAttempt()) as unknown as AttemptView, question: OPEN, assessmentVersion: 1, grader: g, store: s.store, config: CFG };
    const rs = await Promise.all(Array.from({ length: 8 }, () => runCandidateV2(p)));
    expect(rs.filter((x) => x.status === 'VALID')).toHaveLength(1);
    expect(rs.filter((x) => x.status === 'DUPLICATE')).toHaveLength(7);
    expect(g).toHaveBeenCalledTimes(1);
  });
  it('tenant isolation, version mismatch and kill switch stop before the grader', async () => {
    const g = vi.fn();
    const other = deepFreeze({ ...officialAttempt(), tenantId: 'tenant-b' }) as unknown as AttemptView;
    expect((await run(g as any, { attempt: other })).r).toMatchObject({ status: 'NOT_ELIGIBLE', reasonCode: 'TENANT_NOT_ALLOWED' });
    expect((await run(g as any, { assessmentVersion: 2 })).r).toMatchObject({ status: 'NOT_ELIGIBLE', reasonCode: 'VERSION_MISMATCH' });
    expect((await run(g as any, { config: { ...CFG, enabled: false } })).r).toMatchObject({ status: 'NOT_ELIGIBLE', reasonCode: 'DISABLED' });
    expect(readCandidateV2Config({})).toMatchObject({ enabled: false });
    expect(g).not.toHaveBeenCalled();
  });
  it('logs only identifiers and statuses, never answer text or the student', async () => {
    const lines: string[] = [];
    await run(async () => VALID_OUT, { log: (e, m) => lines.push(JSON.stringify({ e, ...m })) });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(ANSWER);
    expect(lines[0]).not.toContain('student-1');
  });
});

describe('6. integrity and determinism', () => {
  it('rejects missing and duplicate ids', async () => {
    const g = vi.fn();
    expect((await run(g as any, { attempt: deepFreeze({ ...officialAttempt(), id: '' }) as any })).r).toMatchObject({ reasonCode: 'MISSING_ID' });
    expect((await run(g as any, { question: { ...OPEN, id: 'q-none' } })).r).toMatchObject({ reasonCode: 'MISSING_ID' });
    const dup = officialAttempt();
    dup.answers.push({ ...dup.answers[0] });
    expect((await run(g as any, { attempt: deepFreeze(dup) as any })).r).toMatchObject({ status: 'ERROR', reasonCode: 'DUPLICATE_ANSWER_ID' });
    expect(g).not.toHaveBeenCalled();
  });
  it('rejects a stale rubric version and a stale snapshot hash', async () => {
    const g = vi.fn(async () => VALID_OUT);
    expect((await run(g, { expectedRubricVersion: 2 })).r).toMatchObject({ status: 'NOT_ELIGIBLE', reasonCode: 'RUBRIC_VERSION_MISMATCH' });
    expect((await run(g, { expectedSnapshotHash: 'stale' })).r).toMatchObject({ status: 'ERROR', reasonCode: 'SNAPSHOT_HASH_MISMATCH' });
    expect(g).not.toHaveBeenCalled();
  });
  it('snapshots are deterministic, immutable and change when inputs change', () => {
    const a = officialAttempt() as unknown as AttemptView;
    const s1 = buildSnapshot(a, OPEN, ANSWER);
    expect(buildSnapshot(a, OPEN, ANSWER)).toEqual(s1);
    expect(Object.isFrozen(s1)).toBe(true);
    expect(buildSnapshot(a, OPEN, `${ANSWER}.`).hash).not.toBe(s1.hash);
    expect(buildSnapshot(a, { ...OPEN, rubric: { ...RUBRIC, version: 4 } }, ANSWER).hash).not.toBe(s1.hash);
  });
  it('repeated execution gives identical results with stable ordering', async () => {
    const shuffled = { ...VALID_OUT, criteria: [VALID_OUT.criteria[2], VALID_OUT.criteria[0], VALID_OUT.criteria[1]] };
    const outs = await Promise.all([1, 2, 3].map(() => run(async () => structuredClone(shuffled)).then((x) => x.r)));
    expect(outs[0]).toEqual(outs[1]);
    expect(outs[1]).toEqual(outs[2]);
    expect((outs[0].result as any).criteria.map((c: any) => c.criterionId)).toEqual(['C1', 'C2', 'C3']);
  });
  it('no provider, network or database connection was initiated anywhere in this suite', () => {
    expect(trap.calls.filter((c) => /anthropic|fetch|mongoose|AssessmentAttempt|HybridShadowResult|HybridAnchorSet/.test(c))).toEqual([]);
  });
});
