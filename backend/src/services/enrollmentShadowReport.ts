import { EnrollmentShadowStat, SHADOW_FEATURES } from '../models/EnrollmentShadowStat';

// Multi-class step 4: the shadow report (counts only). Used by
// `npm run enrollment:shadow-report` and by the lms-test maintenance route.
// A feature is ready for step 5 when it has checks every day and 0 mismatches
// and 0 errors for `requiredCleanDays` days in a row: 7 for the real database,
// 2-3 for lms-test with daily churn (Mohamed, 2026-11-17).
export async function shadowReport(opts: { days?: number; requiredCleanDays?: number; now?: Date } = {}) {
  const days = Math.max(1, opts.days ?? 14);
  const required = Math.max(1, opts.requiredCleanDays ?? 7);
  const now = opts.now ?? new Date();
  const allDays = [...Array(days).keys()].map((k) => new Date(now.getTime() - (days - 1 - k) * 86_400_000).toISOString().slice(0, 10));
  const rows = await EnrollmentShadowStat.find({ day: { $gte: allDays[0] } }).lean();
  const table: Record<string, Record<string, { checks: number; mismatches: number; errors: number }>> = {};
  for (const r of rows) {
    const d = ((table[r.feature] ??= {})[r.day] ??= { checks: 0, mismatches: 0, errors: 0 });
    d.checks += r.checks; d.mismatches += r.mismatches; d.errors += r.errors;
  }
  const today = allDays[allDays.length - 1];
  const features = SHADOW_FEATURES.map((feature) => {
    const byDay = table[feature] ?? {};
    let clean = 0; // consecutive clean days, ending today (today is skipped while it has no checks yet)
    for (const d of [...allDays].reverse()) {
      const v = byDay[d];
      if (!v || !v.checks) { if (d === today) continue; break; }
      if (v.mismatches || v.errors) break;
      clean++;
    }
    const tot = Object.values(byDay).reduce((a, v) => ({ checks: a.checks + v.checks, mismatches: a.mismatches + v.mismatches, errors: a.errors + v.errors }), { checks: 0, mismatches: 0, errors: 0 });
    return { feature, ...tot, cleanDaysInARow: clean, requiredCleanDays: required, readyForStep5: clean >= required };
  });
  return { since: allDays[0], days, features, byDay: table };
}
