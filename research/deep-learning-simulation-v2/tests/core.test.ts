import { describe, it, expect } from 'vitest';
import { Rng } from '../src/util/rng';
import { mean, sd, hedgesG, holm, benjaminiHochberg, wilson, cohenKappa, pearson, normalisedGain, quantile, signFlipPermutation, clusterBootstrapMean } from '../src/stats/stats';
import { assign, assignmentHash, balance } from '../src/design/assignment';
import { AREAS } from '../src/benchmark/schema';
import { Ledger, summarizeLedger, BudgetExceeded } from '../src/ledger/ledger';
import { mkdtempSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path';

const outcomesByArea = Object.fromEntries(AREAS.map((a, i) => [a, Array.from({ length: 8 }, (_, k) => `${'GRVORDWRFNLS'.slice(i * 2, i * 2 + 2)}-0${k + 1}`)])) as any;
const students = Array.from({ length: 150 }, (_, i) => `S${String(i + 1).padStart(3, '0')}`);

describe('rng + randomization', () => {
  it('is deterministic for a seed and differs across seeds', () => { const a = Rng.of('x', 1); const b = Rng.of('x', 1); const c = Rng.of('x', 2); const s = [a.next(), a.next()]; expect([b.next(), b.next()]).toEqual(s); expect(c.next()).not.toBe(s[0]); });
  it('assignment is reproducible and hash-stable', () => { const a = assign({ seed: 's', replication: 1, students, outcomesByArea }); const b = assign({ seed: 's', replication: 1, students, outcomesByArea }); expect(assignmentHash(a)).toBe(assignmentHash(b)); expect(assignmentHash(assign({ seed: 's2', replication: 1, students, outcomesByArea }))).not.toBe(assignmentHash(a)); });
  it('every student has 6 blocks, all 6 conditions once, one outcome per area', () => { const bl = assign({ seed: 's', replication: 1, students, outcomesByArea }); expect(bl.length).toBe(900); const r = balance(bl); expect(r.studentsWithAllConditions).toBe(150); for (const s of students.slice(0, 5)) { const mine = bl.filter((b) => b.studentId === s); expect(new Set(mine.map((b) => b.area)).size).toBe(6); expect(new Set(mine.map((b) => b.condition)).size).toBe(6); } });
  it('conditions are balanced across areas (Latin square) and outcomes used evenly', () => { const bl = assign({ seed: 's', replication: 1, students: students.slice(0, 144), outcomesByArea }); const r = balance(bl); expect(r.maxImbalance).toBe(0); const per = new Map<string, number>(); for (const b of bl) per.set(b.outcomeId, (per.get(b.outcomeId) ?? 0) + 1); expect(Math.max(...per.values()) - Math.min(...per.values())).toBeLessThanOrEqual(0); });
  it('replications use independent assignments', () => { expect(assignmentHash(assign({ seed: 's', replication: 1, students, outcomesByArea }))).not.toBe(assignmentHash(assign({ seed: 's', replication: 2, students, outcomesByArea }))); });
  it('block ids are unique (no pseudoreplication of identical units)', () => { const bl = assign({ seed: 's', replication: 1, students, outcomesByArea }); expect(new Set(bl.map((b) => b.blockId)).size).toBe(bl.length); });
});

describe('statistics against hand-computed values', () => {
  it('mean/sd', () => { expect(mean([1, 2, 3, 4])).toBe(2.5); expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4); });
  it('quantile', () => { expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3); expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 6); });
  it('Hedges g: [2,4,6] vs [1,3,5] -> d=0.5, J=1-3/(4*6-9)=0.8', () => { const r = hedgesG([2, 4, 6], [1, 3, 5]); expect(r.g).toBeCloseTo(0.5 * 0.8, 6); });
  it('Holm', () => { expect(holm([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06]); expect(holm([0.5])).toEqual([0.5]); });
  it('Benjamini-Hochberg', () => { const q = benjaminiHochberg([0.01, 0.04, 0.03]); expect(q[0]).toBeCloseTo(0.03, 6); expect(q[1]).toBeCloseTo(0.04, 6); expect(q[2]).toBeCloseTo(0.04, 6); });
  it('Wilson 8/10', () => { const w = wilson(8, 10); expect(w.lo).toBeCloseTo(0.4902, 3); expect(w.hi).toBeCloseTo(0.9433, 3); });
  it('Cohen kappa: perfect=1, chance~0', () => { expect(cohenKappa(['a', 'b', 'a', 'b'], ['a', 'b', 'a', 'b'])).toBe(1); expect(cohenKappa(['a', 'a', 'b', 'b'], ['a', 'b', 'a', 'b'])).toBeCloseTo(0, 6); });
  it('Pearson', () => { expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 9); expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 9); });
  it('normalised gain', () => { expect(normalisedGain(0.5, 0.75)).toBeCloseTo(0.5, 9); expect(normalisedGain(1, 1)).toBeNull(); });
  it('sign-flip permutation: strong effect small p, null large p', () => { const r = Rng.of('p'); expect(signFlipPermutation(Array(30).fill(1).map((x, i) => x + (i % 3) * 0.1), r, 4000)).toBeLessThan(0.001); const nulls = Array.from({ length: 40 }, (_, i) => (i % 2 ? 1 : -1)); expect(signFlipPermutation(nulls, Rng.of('q'), 4000)).toBeGreaterThan(0.5); });
  it('cluster bootstrap covers the truth and widens with between-student variance', () => { const r = Rng.of('cb'); const obs = []; for (let s = 0; s < 60; s += 1) { const eff = r.normal(0, 1); for (let o = 0; o < 6; o += 1) obs.push({ student: `s${s}`, outcome: `o${o}`, value: 2 + eff + r.normal(0, 0.5) }); } const ci = clusterBootstrapMean(obs, Rng.of('b'), 800); expect(ci.lo).toBeLessThan(2.3); expect(ci.hi).toBeGreaterThan(1.7); expect(ci.hi - ci.lo).toBeGreaterThan(0.3); });
});

describe('cost ledger', () => {
  const mk = (cap = 1) => new Ledger(mkdtempSync(path.join(tmpdir(), 'led-')), 'r1', cap);
  const base = { campaign: 'c', studentId: 's', blockId: 'b', role: 'tutor', provider: 'anthropic', model: 'm', httpStatus: 200, ok: true, retryOf: null, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, priced: true, error: null };
  it('accumulates, persists across restarts, and reports failed/retry/unknown costs without inventing them', () => {
    const l = mk(); l.record({ ...base, costUsd: 0.1 }); l.record({ ...base, ok: false, httpStatus: 503, inputTokens: null, outputTokens: null, costUsd: null, priced: false }); l.record({ ...base, retryOf: 2, costUsd: 0.2 });
    const s = summarizeLedger(Ledger.read(l.file)); expect(s.attempts).toBe(3); expect(s.failedAttempts).toBe(1); expect(s.unknownCostAttempts).toBe(1); expect(s.retryCostUsd).toBeCloseTo(0.2); expect(s.totalUsd).toBeCloseTo(0.3);
    const again = new Ledger(path.dirname(l.file), 'r1', 1); expect(again.spentUsd).toBeCloseTo(0.3); expect(again.unknownCostAttempts).toBe(1);
  });
  it('safe stop: refuses new calls once the cap is reached', () => { const l = mk(0.25); l.record({ ...base, costUsd: 0.3 }); expect(() => l.assertBudget()).toThrow(BudgetExceeded); });
});
