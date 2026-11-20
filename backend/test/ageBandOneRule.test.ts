import { describe, expect, it } from 'vitest';
import { birthDateBandOn, resolveTrustedAgeBand } from '../src/services/languageTeachingContext';

// PR #33 risk 1: one birth-date rule for the LMS (ENROLLMENT_AGE_FROM_BIRTHDATE) and the tutor switches (kidsBand / planner2):
// models/learnerAgeBand.bandFromBirthDate, after the student's own band and before the class band, in both cases.
const now = new Date('2026-11-20T00:00:00Z');
const kid = { birthDate: '2018-03-01', now };
const env = <T>(v: string | undefined, f: () => T): T => {
  const saved = process.env.ENARA_ENGINE_V2; if (v === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = v;
  try { return f(); } finally { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; }
};

describe('one birth-date age rule (LMS and tutor)', () => {
  it('planner2 on: the birth date comes before the class band, exactly like the LMS switch', () => {
    const tutor = env('planner2', () => resolveTrustedAgeBand({}, undefined, 'adult', undefined, kid));
    const lms = env(undefined, () => resolveTrustedAgeBand({}, undefined, 'adult', 'child'));
    expect(tutor).toEqual({ band: 'child', status: 'known', source: 'student_birth_date' });
    expect(tutor).toEqual(lms);
  });
  it('the staff-set student band and the adult-school setting still win', () => {
    env('planner2', () => {
      expect(resolveTrustedAgeBand({}, 'teen', 'adult', undefined, kid).band).toBe('teen');
      expect(resolveTrustedAgeBand({ adultLearners: true }, undefined, undefined, undefined, kid).band).toBe('adult');
    });
  });
  it('same age thresholds as the LMS rule (13 and 18), and the Kids interface only after the class band', () => {
    env('planner2', () => {
      expect(resolveTrustedAgeBand({}, undefined, undefined, { birthDate: '2013-11-20', now }).band).toBe('teen');
      expect(resolveTrustedAgeBand({}, undefined, undefined, { birthDate: '2013-11-21', now }).band).toBe('child');
      expect(resolveTrustedAgeBand({}, undefined, undefined, { birthDate: '2008-11-20', now }).band).toBe('adult');
      expect(resolveTrustedAgeBand({}, undefined, 'teen', { uiMode: 'kids', now }).band).toBe('teen');
      expect(resolveTrustedAgeBand({}, undefined, undefined, { uiMode: 'kids', now })).toEqual({ band: 'child', status: 'known', source: 'kids_mode' });
    });
  });
  it('switches off: no birth-date band, so the class band is used (today\'s behaviour)', () => {
    env(undefined, () => {
      expect(resolveTrustedAgeBand({}, undefined, 'adult', undefined, kid).band).toBe('adult');
    });
    // The admin age-band screen asks the same question as the tutor (the LMS switch is read from the config when no tutor switch is on).
    expect(env('planner2', () => birthDateBandOn())).toBe(true);
    expect(env('kidsBand', () => birthDateBandOn())).toBe(true);
  });
});
