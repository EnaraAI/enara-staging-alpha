// Assessment bench metrics (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §7). Pure: rows in, numbers and pass/fail out.
//   - within1: the share of answers whose model total is within 1 point of the gold total (the gate, per domain and language);
//   - exact: model total equals gold; per criterion: exact and within-1 shares; bias: mean (model - gold);
//   - an answer the model could not grade (error, model unavailable) counts as a miss, and is also reported as error_rate;
//   - flag_rate: the share sent to the teacher's queue; latency p50/p95.
// Gate (per domain × language): within1 ≥ 0.85, flag_rate ≤ 0.20, error_rate ≤ 0.05, and within1 not more than 0.03 below the
// baseline (the last result on lms-test-live, data/assessment-bench/baseline.json).
export interface BenchRow {
  answerId: string; itemId: string; domain: string; lang: string; type: string; band: string;
  gold: Record<string, number>; goldTotal: number;
  model: Record<string, number> | null; modelTotal: number | null;
  flagged: boolean; flagReasons: string[]; confidence: number; latencyMs: number; error?: string | null;
}
export interface SetSummary {
  set: string; n: number; graded: number; within1: number; exact: number; meanAbsError: number; bias: number;
  flagRate: number; errorRate: number; latencyP50: number; latencyP95: number;
  byType: Record<string, { n: number; within1: number }>;
  byBand: Record<string, { n: number; within1: number; bias: number }>;
  criteria: Record<string, { n: number; exact: number; within1: number; bias: number }>;
}
export const THRESHOLDS = { within1: 0.85, flagRate: 0.2, errorRate: 0.05, regression: 0.03 } as const;

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const share = (k: number, n: number) => (n ? r3(k / n) : 0);
const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const mean = (xs: number[]) => (xs.length ? r3(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export function summarize(rows: BenchRow[]): SetSummary[] {
  const sets = [...new Set(rows.map((r) => `${r.domain}/${r.lang}`))].sort();
  return sets.map((set) => {
    const rs = rows.filter((r) => `${r.domain}/${r.lang}` === set);
    const ok = rs.filter((r) => r.modelTotal !== null);
    const near = (r: BenchRow) => r.modelTotal !== null && Math.abs(r.modelTotal - r.goldTotal) <= 1;
    const groups = (key: 'type' | 'band') => Object.fromEntries([...new Set(rs.map((r) => r[key]))].sort().map((k) => {
      const g = rs.filter((r) => r[key] === k); const gOk = g.filter((r) => r.modelTotal !== null);
      return [k, { n: g.length, within1: share(g.filter(near).length, g.length), ...(key === 'band' ? { bias: mean(gOk.map((r) => r.modelTotal! - r.goldTotal)) } : {}) }];
    }));
    const criteria: SetSummary['criteria'] = {};
    for (const c of [...new Set(rs.flatMap((r) => Object.keys(r.gold)))].sort()) {
      const cs = ok.filter((r) => c in r.gold);
      const d = cs.map((r) => (r.model![c] ?? 0) - r.gold[c]);
      criteria[c] = { n: cs.length, exact: share(d.filter((x) => x === 0).length, cs.length), within1: share(d.filter((x) => Math.abs(x) <= 1).length, cs.length), bias: mean(d) };
    }
    return {
      set, n: rs.length, graded: ok.length,
      within1: share(rs.filter(near).length, rs.length),
      exact: share(rs.filter((r) => r.modelTotal !== null && r.modelTotal === r.goldTotal).length, rs.length),
      meanAbsError: mean(ok.map((r) => Math.abs(r.modelTotal! - r.goldTotal))),
      bias: mean(ok.map((r) => r.modelTotal! - r.goldTotal)),
      flagRate: share(rs.filter((r) => r.flagged).length, rs.length),
      errorRate: share(rs.length - ok.length, rs.length),
      latencyP50: pct(ok.map((r) => r.latencyMs), 50), latencyP95: pct(ok.map((r) => r.latencyMs), 95),
      byType: groups('type') as SetSummary['byType'], byBand: groups('band') as SetSummary['byBand'], criteria,
    };
  });
}

/** Gate failures in plain words (empty = pass). A set with fewer answers than expected also fails (an incomplete run). */
export function gate(summaries: SetSummary[], opts: { baseline?: Record<string, number>; expected?: Record<string, number> } = {}): string[] {
  const out: string[] = [];
  for (const s of summaries) {
    if (opts.expected?.[s.set] && s.n < opts.expected[s.set]) out.push(`${s.set}: only ${s.n} of ${opts.expected[s.set]} answers graded`);
    if (s.within1 < THRESHOLDS.within1) out.push(`${s.set}: within 1 point ${s.within1} < ${THRESHOLDS.within1}`);
    if (s.flagRate > THRESHOLDS.flagRate) out.push(`${s.set}: flag rate ${s.flagRate} > ${THRESHOLDS.flagRate}`);
    if (s.errorRate > THRESHOLDS.errorRate) out.push(`${s.set}: error rate ${s.errorRate} > ${THRESHOLDS.errorRate}`);
    const base = opts.baseline?.[s.set];
    if (typeof base === 'number' && s.within1 < base - THRESHOLDS.regression) out.push(`${s.set}: within 1 point ${s.within1} is more than ${THRESHOLDS.regression} below the baseline ${base}`);
  }
  return out;
}

/** One line per set, for logs and the PR. */
export const oneLine = (s: SetSummary) => `${s.set}: within1 ${s.within1} · exact ${s.exact} · bias ${s.bias > 0 ? '+' : ''}${s.bias} · flagged ${s.flagRate} · errors ${s.errorRate} · p50 ${Math.round(s.latencyP50 / 100) / 10}s · n ${s.n}`;
