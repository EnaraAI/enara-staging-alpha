// Runs every test file: node test_all.mjs schema.sql "$PWD/out/site.mjs"
import { spawnSync } from 'node:child_process';
let failed = false;
for (const f of ['test_site.mjs', 'test_v2.mjs', 'test_autonomy.mjs']) {
  const r = spawnSync(process.execPath, ['--no-warnings', f, ...process.argv.slice(2)], { encoding: 'utf8' });
  process.stdout.write(`${f}: ${r.stdout}${r.stderr}`);
  if (r.status !== 0 || / failed [1-9]/.test(r.stdout)) failed = true;
}
console.log(failed ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED');
process.exitCode = failed ? 1 : 0;
