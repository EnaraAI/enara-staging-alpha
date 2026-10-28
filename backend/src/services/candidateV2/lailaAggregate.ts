import type { OpenResult, Rubric } from './contract';

// LAILA scoring from a contract-valid criterion result. Raw criterion scores are kept exactly;
// the dataset's own rules are applied in a separate, labelled view:
//   holistic = sum of the seven trait scores (0-32);
//   relevance = 0 forces every other trait to 0 (LAILA rubric README).
export const LAILA_SCALES: Readonly<Record<string, number>> = Object.freeze({ relevance: 2, organization: 5, vocabulary: 5, style: 5, development: 5, mechanics: 5, grammar: 5 });
export const LAILA_HOLISTIC_MAX = 32;

// The rubric must be exactly LAILA's: seven traits, whole-point levels 0..max, nothing else.
export function checkLailaRubric(r: Rubric): string[] {
  const p: string[] = [];
  const ids = r.criteria.map((c) => c.id).sort();
  if (ids.join('|') !== Object.keys(LAILA_SCALES).sort().join('|')) p.push('criteria are not the seven LAILA traits');
  for (const c of r.criteria) {
    const max = LAILA_SCALES[c.id];
    if (max === undefined) continue;
    const pts = c.levels.map((l) => l.points).sort((a, b) => a - b).join(',');
    if (c.maxPoints !== max || pts !== Array.from({ length: max + 1 }, (_, i) => i).join(',')) p.push(`${c.id}: levels are not 0..${max}`);
  }
  return p;
}

export interface LailaScores {
  raw: Record<string, number>;
  rawHolistic: number;
  scores: Record<string, number>; // after the relevance-zero rule
  holistic: number;
  relevanceZeroRuleApplied: boolean; // true only when it changed a score
}

export function lailaScores(result: OpenResult, rubric: Rubric): LailaScores {
  const problems = checkLailaRubric(rubric);
  if (problems.length) throw new Error(problems.join('; '));
  const raw: Record<string, number> = {};
  for (const c of result.criteria) raw[c.criterionId] = c.points;
  for (const [t, max] of Object.entries(LAILA_SCALES)) {
    const v = raw[t];
    if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${t}: score ${String(v)} outside 0..${max}`);
  }
  const rawHolistic = Object.keys(LAILA_SCALES).reduce((n, t) => n + raw[t], 0);
  if (rawHolistic !== result.totalPoints) throw new Error('total is not the sum of the trait scores');
  const zero = raw.relevance === 0;
  const scores = Object.fromEntries(Object.keys(LAILA_SCALES).map((t) => [t, zero && t !== 'relevance' ? 0 : raw[t]]));
  const holistic = Object.values(scores).reduce((n, v) => n + v, 0);
  return { raw, rawHolistic, scores, holistic, relevanceZeroRuleApplied: zero && holistic !== rawHolistic };
}
