// Assessment bench on lms-test (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §7a): grades the bench with the real engine through the
// maintenance route, in small resumable batches, then prints the summary and the misses. Bench answers are fake; the route returns
// numbers and scores only. No secrets printed.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const SITE = 'https://lms-test.enara.app';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`, 'Content-Type': 'application/json' };
const cfg = JSON.parse(readFileSync(new URL('./bench.json', import.meta.url), 'utf8'));
const call = async (body) => {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${SITE}/api/maintenance/assessment-bench`, { method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) }).catch((e) => ({ status: 0, text: async () => String(e) }));
    const t = await r.text();
    if (r.status === 200) return JSON.parse(t);
    console.log('HTTP', r.status, t.slice(0, 200));
    await new Promise((x) => setTimeout(x, r.status === 404 ? 30_000 : 10_000));
  }
  throw new Error('route did not answer');
};
mkdirSync('out', { recursive: true });
if (cfg.mode === 'gen') {
  // P4 generation bench: per subject x language, a few calls of up to 5 items each (not stored); pass rates of schema, checks, judge.
  const gcall = async (body) => {
    for (let i = 0; i < 20; i++) {
      const r = await fetch(`${SITE}/api/maintenance/assessment-gen-bench`, { method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) }).catch((e) => ({ status: 0, text: async () => String(e) }));
      const t = await r.text();
      if (r.status === 200) return JSON.parse(t);
      console.log('HTTP', r.status, t.slice(0, 200));
      await new Promise((x) => setTimeout(x, r.status === 404 ? 30_000 : 10_000));
    }
    return null;
  };
  const rows = [];
  for (const set of cfg.sets) {
    const [domain, lang] = set.split('/');
    const agg = { set, n: 0, schemaOk: 0, checksOk: 0, passed: 0, regenerated: 0, problems: [] };
    for (let k = 0; k < (cfg.callsPerSet ?? 2); k++) {
      const r = await gcall({ domain, lang, count: 5, level: lang === 'ar' ? 'grade 6' : 'A2/grade 6', objective: `${domain}-${lang}-bench`, ...(domain === 'humanities' ? { source: cfg.sources?.[lang] } : {}) });
      if (!r) continue;
      for (const f of ['n', 'schemaOk', 'checksOk', 'passed', 'regenerated']) agg[f] += r[f];
      agg.problems.push(...r.problems); agg.judge = r.judge;
      console.log(set, JSON.stringify({ n: r.n, schemaOk: r.schemaOk, checksOk: r.checksOk, passed: r.passed, ms: r.ms }));
    }
    rows.push({ ...agg, schemaRate: agg.n ? +(agg.schemaOk / agg.n).toFixed(3) : 0, judgePassRate: agg.n ? +(agg.passed / agg.n).toFixed(3) : 0 });
  }
  writeFileSync('out/gen-summary.json', JSON.stringify(rows, null, 1));
  for (const r of rows) console.log(`${r.set}: schema ${r.schemaRate} · passed (checks + judge) ${r.judgePassRate} · n ${r.n} · regenerated ${r.regenerated} · ${r.judge}`);
  process.exit(0);
}
await call({ action: 'start', runId: cfg.runId, capUsd: cfg.capUsd ?? 5 });
const started = Date.now();
for (const set of cfg.sets) {
  const [domain, lang] = set.split('/');
  for (;;) {
    const r = await call({ action: 'grade', runId: cfg.runId, domain, lang, limit: cfg.limit ?? 4 });
    console.log(set, 'graded', r.graded, 'remaining', r.remaining, 'spent', r.spentUsd);
    if (r.stopped) { console.log('STOPPED', r.stopped); break; }
    if (r.remaining <= 0) break;
    if (Date.now() - started > (cfg.maxMinutes ?? 75) * 60_000) { console.log('time budget reached; run again to resume'); break; }
  }
}
const summary = await call({ action: 'summary', runId: cfg.runId });
const misses = await call({ action: 'misses', runId: cfg.runId });
writeFileSync('out/summary.json', JSON.stringify(summary, null, 1));
writeFileSync('out/misses.json', JSON.stringify(misses, null, 1));
console.log((summary.lines ?? []).join('\n'));
console.log('FAILURES', JSON.stringify(summary.failures ?? []));
console.log('spent', summary.spentUsd, 'gold', summary.gold);
console.log('BY MODEL', JSON.stringify(summary.byModel ?? []));
