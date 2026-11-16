import { Rng } from '../util/rng';
export const mean = (x: number[]): number => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
export const variance = (x: number[]): number => { if (x.length < 2) return NaN; const m = mean(x); return x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1); };
export const sd = (x: number[]): number => Math.sqrt(variance(x));
export const quantile = (x: number[], q: number): number => { const s = [...x].sort((a, b) => a - b); if (!s.length) return NaN; const p = (s.length - 1) * q; const lo = Math.floor(p); const hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };

// Hedges g for two independent groups (bias-corrected standardised mean difference).
export function hedgesG(a: number[], b: number[]): { g: number; se: number } {
  const n1 = a.length; const n2 = b.length;
  if (n1 < 2 || n2 < 2) return { g: NaN, se: NaN };
  const sp = Math.sqrt(((n1 - 1) * variance(a) + (n2 - 1) * variance(b)) / (n1 + n2 - 2));
  if (sp === 0) return { g: 0, se: NaN };
  const d = (mean(a) - mean(b)) / sp; const J = 1 - 3 / (4 * (n1 + n2) - 9); const g = d * J;
  return { g, se: Math.sqrt((n1 + n2) / (n1 * n2) + (g * g) / (2 * (n1 + n2))) };
}
// Cohen's d_z for paired differences.
export const pairedD = (diffs: number[]): number => { const s = sd(diffs); return s === 0 ? 0 : mean(diffs) / s; };

export interface Obs { student: string; outcome: string; value: number; }
// Two-way (student x outcome) cluster bootstrap of the mean: resample students AND outcomes with replacement, keep cells present.
export function clusterBootstrapMean(obs: Obs[], rng: Rng, B = 2000): { est: number; lo: number; hi: number } {
  const est = mean(obs.map((o) => o.value));
  if (!obs.length) return { est, lo: NaN, hi: NaN };
  const students = [...new Set(obs.map((o) => o.student))]; const outcomes = [...new Set(obs.map((o) => o.outcome))];
  const byS = new Map<string, Obs[]>(); for (const o of obs) { (byS.get(o.student) ?? byS.set(o.student, []).get(o.student)!).push(o); }
  const stats: number[] = [];
  for (let b = 0; b < B; b += 1) {
    const sw = new Map<string, number>(); for (let i = 0; i < students.length; i += 1) { const s = students[rng.int(students.length)]; sw.set(s, (sw.get(s) ?? 0) + 1); }
    const ow = new Map<string, number>(); for (let i = 0; i < outcomes.length; i += 1) { const o = outcomes[rng.int(outcomes.length)]; ow.set(o, (ow.get(o) ?? 0) + 1); }
    let num = 0; let den = 0;
    for (const [s, ws] of sw) for (const o of byS.get(s) ?? []) { const wo = ow.get(o.outcome); if (!wo) continue; const w = ws * wo; num += w * o.value; den += w; }
    if (den > 0) stats.push(num / den);
  }
  return { est, lo: quantile(stats, 0.025), hi: quantile(stats, 0.975) };
}
// Sign-flip permutation test on cluster-level mean differences (one value per student; unit of analysis = student).
export function signFlipPermutation(diffsPerStudent: number[], rng: Rng, B = 10000): number {
  const n = diffsPerStudent.length; if (!n) return NaN;
  const obs = Math.abs(mean(diffsPerStudent)); let ge = 0;
  for (let b = 0; b < B; b += 1) { let s = 0; for (const d of diffsPerStudent) s += rng.next() < 0.5 ? d : -d; if (Math.abs(s / n) >= obs - 1e-12) ge += 1; }
  return (ge + 1) / (B + 1);
}
// Holm-Bonferroni step-down adjusted p-values.
export function holm(p: number[]): number[] {
  const idx = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]); const m = p.length; const out = new Array<number>(m); let run = 0;
  idx.forEach(([v, i], k) => { run = Math.max(run, Math.min(1, (m - k) * v)); out[i] = run; });
  return out;
}
// Benjamini-Hochberg q-values (exploratory families).
export function benjaminiHochberg(p: number[]): number[] {
  const m = p.length; const idx = p.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]); const out = new Array<number>(m); let prev = 1;
  idx.forEach(([v, i], k) => { const rank = m - k; prev = Math.min(prev, (v * m) / rank); out[i] = Math.min(1, prev); });
  return out;
}
// Normalised gain (Hake): (post-pre)/(1-pre); undefined when pre == 1.
export const normalisedGain = (pre: number, post: number): number | null => (pre >= 1 ? null : (post - pre) / (1 - pre));
// Wilson interval for a proportion.
export function wilson(k: number, n: number, z = 1.96): { p: number; lo: number; hi: number } {
  if (!n) return { p: NaN, lo: NaN, hi: NaN }; const p = k / n; const d = 1 + (z * z) / n; const c = p + (z * z) / (2 * n); const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p, lo: (c - r) / d, hi: (c + r) / d };
}
// Cohen's kappa for two raters over categorical labels.
export function cohenKappa(a: string[], b: string[]): number {
  const n = a.length; if (!n || n !== b.length) return NaN; const cats = [...new Set([...a, ...b])];
  const po = a.filter((x, i) => x === b[i]).length / n; let pe = 0;
  for (const c of cats) pe += (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}
// Pearson correlation.
export function pearson(x: number[], y: number[]): number {
  const mx = mean(x); const my = mean(y); let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < x.length; i += 1) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}
