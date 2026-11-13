// Trusted coarse learner age band (Option B, approved 9 Nov 2026). Exactly
// these values; boundaries (which ages count as child or teen) are a separate
// product decision and are deliberately not encoded anywhere.
export const LEARNER_AGE_BANDS = ['child', 'teen', 'adult'] as const;
export type LearnerAgeBand = (typeof LEARNER_AGE_BANDS)[number];

// Exact enum match only: no casing variants, trimming, numbers or booleans.
export function isLearnerAgeBand(value: unknown): value is LearnerAgeBand {
  return typeof value === 'string' && (LEARNER_AGE_BANDS as readonly string[]).includes(value);
}
