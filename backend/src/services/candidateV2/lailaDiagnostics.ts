import type { RunResult } from './runner';

// D3: LAILA cross-criterion rule as an evaluation-adapter DIAGNOSTIC (not part of the V2
// contract, never a score rewrite). LAILA: when relevance is 0, every other trait must be 0.
// Inputs are Candidate V2 run results; scores are reported exactly as the grader produced them.
export const LAILA_RELEVANCE_CRITERION = 'relevance';

export type RuleStatus = 'SATISFIED' | 'VIOLATED' | 'NOT_APPLICABLE' | 'NOT_EVALUABLE';

export function relevanceRule(r: RunResult): { status: RuleStatus; nonZeroOthers: string[] } {
  if (r.status !== 'VALID' || !r.result || !('criteria' in r.result)) return { status: 'NOT_EVALUABLE', nonZeroOthers: [] };
  const crit = r.result.criteria;
  const rel = crit.find((c) => c.criterionId === LAILA_RELEVANCE_CRITERION);
  if (!rel) return { status: 'NOT_EVALUABLE', nonZeroOthers: [] };
  if (rel.points !== 0) return { status: 'NOT_APPLICABLE', nonZeroOthers: [] };
  const others = crit.filter((c) => c.criterionId !== LAILA_RELEVANCE_CRITERION && c.points !== 0).map((c) => c.criterionId);
  return { status: others.length ? 'VIOLATED' : 'SATISFIED', nonZeroOthers: others };
}

// Denominators: every attempted answer; contract validity and the LAILA rule are counted separately.
export function relevanceRuleSummary(results: RunResult[]) {
  const s = { attempted: results.length, contractValid: 0, contractInvalidOrError: 0, relevanceZero: 0, violations: 0, notEvaluable: 0 };
  for (const r of results) {
    if (r.status === 'VALID') s.contractValid++;
    else s.contractInvalidOrError++;
    const d = relevanceRule(r);
    if (d.status === 'NOT_EVALUABLE') s.notEvaluable++;
    if (d.status === 'SATISFIED' || d.status === 'VIOLATED') s.relevanceZero++;
    if (d.status === 'VIOLATED') s.violations++;
  }
  return {
    ...s,
    violationRateAmongRelevanceZero: s.relevanceZero ? s.violations / s.relevanceZero : null,
    violationRateAmongContractValid: s.contractValid ? s.violations / s.contractValid : null,
  };
}
