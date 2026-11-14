import { mean, pearson, sd } from '../stats/stats';
import type { StudentState } from './population';
// Population-level checks on the simulator inputs (independent of any tutor).
export interface PopCheck { name: string; pass: boolean; detail: string; }
const NUM: (keyof StudentState)[] = ['learningRate', 'prerequisiteLevel', 'misconceptionStrength', 'attentionLapse', 'guessRate', 'confidenceBias', 'halfLifeDays', 'inconsistency'];
export function populationChecks(pop: StudentState[]): PopCheck[] {
  const out: PopCheck[] = [];
  out.push({ name: 'population size 100-200', pass: pop.length >= 100 && pop.length <= 200, detail: `${pop.length}` });
  const ids = new Set(pop.map((s) => s.id)); const seeds = new Set(pop.map((s) => s.seed)); out.push({ name: 'unique ids and seeds', pass: ids.size === pop.length && seeds.size === pop.length, detail: `${ids.size}/${seeds.size}` });
  const dup = new Set<string>(); let identical = 0; for (const s of pop) { const k = NUM.map((n) => (s[n] as number).toFixed(3)).join('|'); if (dup.has(k)) identical += 1; dup.add(k); } out.push({ name: 'no identical students', pass: identical === 0, detail: `${identical} identical` });
  let maxAbs = 0; let pair = ''; for (let i = 0; i < NUM.length; i += 1) for (let j = i + 1; j < NUM.length; j += 1) { const r = pearson(pop.map((s) => s[NUM[i]] as number), pop.map((s) => s[NUM[j]] as number)); if (Math.abs(r) > maxAbs) { maxAbs = Math.abs(r); pair = `${String(NUM[i])}~${String(NUM[j])}`; } }
  out.push({ name: 'behaviour dimensions are not (almost) perfectly correlated', pass: maxAbs < 0.5, detail: `max |r| = ${maxAbs.toFixed(2)} (${pair})` });
  for (const n of NUM) { const v = pop.map((s) => s[n] as number); out.push({ name: `spread: ${String(n)}`, pass: sd(v) > 0.03 * Math.max(1, Math.abs(mean(v))), detail: `sd=${sd(v).toFixed(3)}` }); }
  const tagCount = (t: string) => pop.filter((s) => s.tags.includes(t)).length;
  for (const t of ['fast_learner', 'slow_learner', 'overconfident', 'underconfident', 'persistent_misconceptions', 'weak_prerequisites', 'low_attention', 'guesser', 'fast_forgetter', 'inconsistent']) out.push({ name: `covers ${t}`, pass: tagCount(t) >= Math.max(3, Math.floor(pop.length * 0.04)), detail: `${tagCount(t)} students` });
  const overlap = pop.filter((s) => s.tags.length >= 3).length; out.push({ name: 'overlapping dimensions (>=3 tags) common', pass: overlap >= pop.length * 0.2, detail: `${overlap} students` });
  return out;
}
