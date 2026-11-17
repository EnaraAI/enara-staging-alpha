// Trusted coarse learner age band (Option B, approved 9 Nov 2026). Exactly
// these values. Boundaries (Mohamed, 2026-11-17, multi-class Q8): child under
// 13, teen 13-17, adult 18 and over. They are used ONLY by bandFromBirthDate,
// behind ENROLLMENT_AGE_FROM_BIRTHDATE (off by default).
export const LEARNER_AGE_BANDS = ['child', 'teen', 'adult'] as const;
export type LearnerAgeBand = (typeof LEARNER_AGE_BANDS)[number];

// Exact enum match only: no casing variants, trimming, numbers or booleans.
export function isLearnerAgeBand(value: unknown): value is LearnerAgeBand {
  return typeof value === 'string' && (LEARNER_AGE_BANDS as readonly string[]).includes(value);
}

/**
 * Q8 (Mohamed, 2026-11-17): the band from a stored birth date, by age on `now`:
 * child under 13, teen 13-17, adult 18 and over. Missing, invalid or future
 * dates give undefined (age unknown). Never inferred from anything else.
 */
export function bandFromBirthDate(birthDate: unknown, now: Date = new Date()): LearnerAgeBand | undefined {
  const d = birthDate instanceof Date ? birthDate : typeof birthDate === 'string' ? new Date(birthDate) : undefined;
  if (!d || Number.isNaN(d.getTime()) || d.getTime() > now.getTime()) return undefined;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) age -= 1;
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  return 'adult';
}
