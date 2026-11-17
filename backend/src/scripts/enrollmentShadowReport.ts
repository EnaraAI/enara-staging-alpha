import mongoose from 'mongoose';
import { openMongo } from '../config/db';
import { EnrollmentShadowStat, SHADOW_FEATURES } from '../models/EnrollmentShadowStat';

// Multi-class step 4: read-only report of the shadow checks (counts only).
//   npm run enrollment:shadow-report              last 14 days
//   npm run enrollment:shadow-report -- --days 30
// Step 5 may start for a feature once it shows checks every day and 0
// mismatches and 0 errors for 7 days in a row (docs/multi-class/PLAN.md).
const REQUIRED_CLEAN_DAYS = 7;

async function main() {
  const i = process.argv.indexOf('--days');
  const days = i > 0 ? Math.max(1, Number(process.argv[i + 1]) || 14) : 14;
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  await openMongo();
  const rows = await EnrollmentShadowStat.find({ day: { $gte: since } }).lean();
  const table: Record<string, Record<string, { checks: number; mismatches: number; errors: number }>> = {};
  for (const r of rows) {
    const d = ((table[r.feature] ??= {})[r.day] ??= { checks: 0, mismatches: 0, errors: 0 });
    d.checks += r.checks; d.mismatches += r.mismatches; d.errors += r.errors;
  }
  const allDays = [...Array(days).keys()].map((k) => new Date(Date.now() - (days - 1 - k) * 86_400_000).toISOString().slice(0, 10));
  const summary = SHADOW_FEATURES.map((feature) => {
    const byDay = table[feature] ?? {};
    let clean = 0; // consecutive clean days ending today (or yesterday, if today has no checks yet)
    for (const d of [...allDays].reverse()) {
      const v = byDay[d];
      if (!v || !v.checks) { if (d === allDays[allDays.length - 1]) continue; break; }
      if (v.mismatches || v.errors) break;
      clean++;
    }
    const tot = Object.values(byDay).reduce((a, v) => ({ checks: a.checks + v.checks, mismatches: a.mismatches + v.mismatches, errors: a.errors + v.errors }), { checks: 0, mismatches: 0, errors: 0 });
    return { feature, ...tot, cleanDaysInARow: clean, readyForStep5: clean >= REQUIRED_CLEAN_DAYS };
  });
  console.log(JSON.stringify({ since, days, features: summary, byDay: table }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
