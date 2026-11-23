// Rules-first coverage on the assessment bench, offline (no model, no database): npm run bench:rules [-- --misses]
import { rulesCoverage, coverageLine } from '../assessment/bench/rulesCoverage';
import { spellChecker, loadStats } from '../assessment/text/dictionaries';

// Spelling dictionaries: load time (first use in a process) and the heap they take.
for (const lang of ['en', 'ar']) {
  const before = process.memoryUsage().heapUsed;
  const ok = spellChecker(lang) !== null;
  const mb = (process.memoryUsage().heapUsed - before) / 1e6;
  console.log(ok ? `dictionary ${lang}: ${loadStats[lang].entries} entries, loaded in ${loadStats[lang].ms} ms, ~${Math.round(mb)} MB heap` : `dictionary ${lang}: NOT FOUND (spelling rules off)`);
}

const rows = rulesCoverage();
for (const r of rows) {
  console.log(coverageLine(r));
  if (process.argv.includes('--misses')) for (const m of r.misses) console.log(`   ${m.answerId} ${m.criterion}: code ${m.code}, gold ${m.gold} (${m.rule})`);
}
const all = rows.reduce((t, r) => ({ c: t.c + r.criteria, d: t.d + r.decided, a: t.a + r.agree, n: t.n + r.answers, z: t.z + r.noModel }), { c: 0, d: 0, a: 0, n: 0, z: 0 });
console.log(`ALL: code-decided ${all.d}/${all.c} (${(all.d / all.c).toFixed(3)}), no model call ${all.z}/${all.n}, agreement ${(all.a / Math.max(1, all.d)).toFixed(3)}`);
