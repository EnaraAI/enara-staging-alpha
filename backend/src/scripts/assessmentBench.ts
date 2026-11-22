// Assessment bench in CI or on a trusted computer (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §7): the real engine on the frozen bench, in a
// throwaway in-memory database, with a hard spending stop (BudgetLedger) and no fallback provider.
//   npm run bench:assessment -- [--sets language/en,math/ar] [--cap 5] [--out results.json]
// Without a model key it only checks the datasets and says so (exit 0): the live bench then runs on lms-test (maintenance route).
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { BENCH_SETS, benchDir, checkSet, type BenchDomain, type BenchLang } from '../assessment/bench/dataset';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const dir = benchDir();
  if (!dir) throw new Error('data/assessment-bench not found');
  const wanted = (arg('sets') ?? BENCH_SETS.map((s) => `${s.domain}/${s.lang}`).join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  // 1. The datasets (always).
  const { readFileSync, existsSync } = await import('fs');
  let bad = 0;
  for (const s of wanted) {
    const [domain, lang] = s.split('/');
    const f = (n: string) => join(dir, domain, lang, n);
    if (!existsSync(f('items.json'))) { console.log(`DATA ${s}: missing`); bad++; continue; }
    const problems = checkSet({ domain, lang, items: JSON.parse(readFileSync(f('items.json'), 'utf8')), answers: JSON.parse(readFileSync(f('answers.json'), 'utf8')) });
    console.log(`DATA ${s}: ${problems.length ? problems.slice(0, 10).join(' | ') : 'ok'}`);
    if (problems.length) bad++;
  }
  if (bad) process.exit(1);
  // 2. The live run, only with a model key.
  if (!process.env.TUTOR_LLM_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log('LIVE skipped: no model key here. The live bench runs on lms-test (POST /api/maintenance/assessment-bench).');
    return;
  }
  const cap = Number(arg('cap') ?? 5);
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
  const { setAiCallGuard } = await import('../services/aiJson');
  const { createLedger, BudgetLedger } = await import('./benchmarkBudget');
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'bench-')), 'ledger.json');
  createLedger(ledgerPath, { name: 'assessment-bench', capUsd: cap, authorizedBy: process.env.BENCH_AUTHORIZED_BY || 'owner: P2b bench, no Anthropic spend (22 Nov 2026)' });
  setAiCallGuard(new BudgetLedger(ledgerPath, 'assessment-bench'));
  const bench = await import('../assessment/bench/run');
  const runId = `ci-${Date.now()}`;
  await bench.startRun({ runId, capUsd: cap });
  for (const s of wanted) {
    const [domain, lang] = s.split('/') as [BenchDomain, BenchLang];
    for (;;) {
      const r = await bench.gradeBatch({ runId, domain, lang, limit: 6, modelReady: true });
      process.stdout.write(`.${r.remaining}`);
      if (r.remaining <= 0) break;
    }
    console.log(` ${s} done`);
  }
  setAiCallGuard(null);
  const out = await bench.summary(runId);
  console.log((out as { lines: string[] }).lines.join('\n'));
  const failures = (out as { failures: string[] }).failures;
  if (arg('out')) writeFileSync(arg('out')!, JSON.stringify(out, null, 2));
  await mongoose.disconnect(); await mongo.stop();
  if (failures.length) { console.log(`FAIL\n${failures.join('\n')}`); process.exit(1); }
  console.log('PASS');
}
main().catch((e) => { console.error(e); process.exit(1); });
