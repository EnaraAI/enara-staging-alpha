import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { summarize, gate, type BenchRow } from '../../src/assessment/bench/metrics';
import { BENCH_SETS, benchDir, checkSet, loadSet, openItemOf, answerTextOf } from '../../src/assessment/bench/dataset';

const row = (o: Partial<BenchRow>): BenchRow => ({
  answerId: Math.random().toString(36), itemId: 'i', domain: 'language', lang: 'en', type: 'essay', band: 'mid',
  gold: { a: 1, b: 1 }, goldTotal: 2, model: { a: 1, b: 1 }, modelTotal: 2, flagged: false, flagReasons: [], confidence: 0.9, latencyMs: 1000, ...o,
});

describe('bench metrics', () => {
  it('within 1 point, exact, bias, per criterion; a model miss counts against agreement', () => {
    const [s] = summarize([
      row({}),
      row({ model: { a: 2, b: 1 }, modelTotal: 3 }),
      row({ model: { a: 2, b: 2 }, modelTotal: 4 }),
      row({ model: null, modelTotal: null, error: 'model_error' }),
    ]);
    expect(s).toMatchObject({ set: 'language/en', n: 4, graded: 3, within1: 0.5, exact: 0.25, errorRate: 0.25, bias: 1 });
    expect(s.criteria.a).toMatchObject({ n: 3, exact: 0.333, within1: 1 });
  });
  it('the gate: 0.85 within 1, flag rate 0.2, error rate 0.05, a regression over 0.03, an incomplete run', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ modelTotal: i < 17 ? 2 : 5, flagged: i < 5 }));
    const sums = summarize(rows);
    expect(sums[0].within1).toBe(0.85);
    const f = gate(sums, { baseline: { 'language/en': 0.9 }, expected: { 'language/en': 30 } });
    expect(f.join('\n')).toMatch(/only 20 of 30/);
    expect(f.join('\n')).toMatch(/flag rate 0.25/);
    expect(f.join('\n')).toMatch(/0.03 below the baseline 0.9/);
    expect(f.join('\n')).not.toMatch(/within 1 point 0.85 </);
  });
});

describe('bench datasets', () => {
  it('checkSet refuses a gold total that is not the sum, unknown criteria and error codes', () => {
    const items = [{ id: 'x1', type: 'short_answer', domain: 'language', language: 'en', level: 'A2', difficulty: 1, stem: 'Say hello.' }];
    const ans = (band: string, extra = {}) => ({ id: `x1-${band}`, itemId: 'x1', band, answer: 'Hello.', gold: { task_completion: 2, grammar_accuracy: 1, mechanics: 1 }, goldTotal: 4, errorCodes: [], ...extra });
    expect(checkSet({ domain: 'language', lang: 'en', items, answers: [ans('weak'), ans('mid'), ans('strong')] })).toEqual([]);
    const p = checkSet({ domain: 'language', lang: 'en', items, answers: [ans('weak', { goldTotal: 3 }), ans('mid', { gold: { task_completion: 2, grammar: 1, mechanics: 1 } }), ans('strong', { errorCodes: ['nonsense'] })] });
    expect(p.join('\n')).toMatch(/goldTotal is not the sum/);
    expect(p.join('\n')).toMatch(/gold criteria/);
    expect(p.join('\n')).toMatch(/unknown error codes nonsense/);
  });
  const dir = benchDir();
  for (const s of BENCH_SETS) {
    const present = !!dir && existsSync(join(dir, s.domain, s.lang, 'items.json'));
    it.runIf(present)(`${s.domain}/${s.lang}: 30 items, 90 answers, sound gold scores; the engine's view has no gold`, () => {
      const set = loadSet(s.domain, s.lang);
      expect(set.items).toHaveLength(30);
      expect(set.answers).toHaveLength(90);
      const it0 = openItemOf(set.items[0]);
      expect(JSON.stringify(it0)).not.toMatch(/gold|model_answer/);
      if (s.domain === 'math') expect(JSON.parse(answerTextOf(set.answers[0]))).toHaveProperty('final');
      // Gold totals spread over the range (not all full marks or all zero).
      const totals = new Set(set.answers.map((a) => a.goldTotal));
      expect(totals.size).toBeGreaterThanOrEqual(5);
      expect(readFileSync(join(dir!, s.domain, s.lang, 'answers.json'), 'utf8')).not.toMatch(/sk-|api[_-]?key/i);
    });
  }
});
