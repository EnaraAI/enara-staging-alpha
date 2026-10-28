// Mastery estimator: a deterministic, explainable heuristic over evidence.
// The estimate is a 0-1 score, NOT a calibrated probability.
//
// mastery-v1
// - Each piece of evidence counts with weight = reliabilityWeight x recency, where recency
//   halves every 60 days measured back from the student's latest evidence on the objective
//   (so the result depends only on the evidence, not on when it is computed).
// - estimate = (sum of weight x score + 1 x 0.5) / (sum of weight + 1): one "virtual" neutral
//   observation keeps a single answer from swinging the score to 0 or 1.
// - Evidence strength = independent, distinct items (best weight per item, assistance none):
//   none 0, limited < 2, moderate < 4, substantial >= 4 (in weight units).
// - Status: not_assessed (no evidence); mastered needs estimate >= 0.85, strength moderate or
//   more, >= 3 distinct independent items and the latest independent answer correct;
//   otherwise proficient >= 0.70, developing >= 0.50, emerging below.
//   A high estimate on limited evidence is capped at proficient and flagged needsVerification.

export const MASTERY_MODEL_VERSION = 'mastery-v1';
const HALF_LIFE_DAYS = 60;
const PRIOR_WEIGHT = 1;
const THRESHOLDS = { mastered: 0.85, proficient: 0.7, developing: 0.5 };

export type EvidenceStrength = 'none' | 'limited' | 'moderate' | 'substantial';
export type MasteryStatus = 'not_assessed' | 'emerging' | 'developing' | 'proficient' | 'mastered';

export interface EvidenceInput {
  id: string;
  normalizedScore?: number;
  result: string;
  reliabilityWeight: number;
  assistanceLevel: string;
  itemKey?: string;
  occurredAt: Date;
  invalidatedAt?: Date | null;
}

export interface MasteryResult {
  masteryEstimate: number | null;
  evidenceStrength: EvidenceStrength;
  masteryStatus: MasteryStatus;
  evidenceCount: number;
  independentEvidenceCount: number;
  distinctIndependentItems: number;
  needsVerification: boolean;
  lastEvidenceAt?: Date;
  modelVersion: string;
}

const scoreOf = (e: EvidenceInput) =>
  typeof e.normalizedScore === 'number' ? e.normalizedScore : e.result === 'correct' ? 1 : e.result === 'partially_correct' ? 0.5 : 0;

export function estimateMastery(evidence: EvidenceInput[]): MasteryResult {
  const usable = evidence
    .filter((e) => !e.invalidatedAt && e.result !== 'inconclusive')
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));
  if (!usable.length) {
    return {
      masteryEstimate: null,
      evidenceStrength: 'none',
      masteryStatus: 'not_assessed',
      evidenceCount: 0,
      independentEvidenceCount: 0,
      distinctIndependentItems: 0,
      needsVerification: false,
      modelVersion: MASTERY_MODEL_VERSION,
    };
  }
  const latest = usable[usable.length - 1].occurredAt.getTime();
  let num = PRIOR_WEIGHT * 0.5;
  let den = PRIOR_WEIGHT;
  for (const e of usable) {
    const ageDays = (latest - e.occurredAt.getTime()) / 86_400_000;
    const w = e.reliabilityWeight * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    num += w * scoreOf(e);
    den += w;
  }
  const estimate = Math.round((num / den) * 1000) / 1000;

  const independent = usable.filter((e) => e.assistanceLevel === 'none');
  const bestPerItem = new Map<string, number>();
  for (const e of independent) {
    const key = e.itemKey || e.id;
    bestPerItem.set(key, Math.max(bestPerItem.get(key) ?? 0, e.reliabilityWeight));
  }
  const strengthUnits = [...bestPerItem.values()].reduce((a, b) => a + b, 0);
  const evidenceStrength: EvidenceStrength =
    strengthUnits <= 0 ? 'none' : strengthUnits < 2 ? 'limited' : strengthUnits < 4 ? 'moderate' : 'substantial';

  const lastIndependentCorrect = independent.length > 0 && scoreOf(independent[independent.length - 1]) >= 1;
  const enoughForMastered = evidenceStrength !== 'none' && evidenceStrength !== 'limited' && bestPerItem.size >= 3 && lastIndependentCorrect;
  let masteryStatus: MasteryStatus =
    estimate >= THRESHOLDS.mastered ? 'mastered' : estimate >= THRESHOLDS.proficient ? 'proficient' : estimate >= THRESHOLDS.developing ? 'developing' : 'emerging';
  let needsVerification = false;
  if (masteryStatus === 'mastered' && !enoughForMastered) {
    masteryStatus = 'proficient';
    needsVerification = true;
  }
  if (evidenceStrength === 'limited' && estimate >= THRESHOLDS.proficient) needsVerification = true;

  return {
    masteryEstimate: estimate,
    evidenceStrength,
    masteryStatus,
    evidenceCount: usable.length,
    independentEvidenceCount: independent.length,
    distinctIndependentItems: bestPerItem.size,
    needsVerification,
    lastEvidenceAt: usable[usable.length - 1].occurredAt,
    modelVersion: MASTERY_MODEL_VERSION,
  };
}
