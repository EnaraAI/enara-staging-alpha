// Writes .run/summary.md from the Playwright JSON report and the run's timings:
// pass/fail per scenario (spec file) and per test, and the timings.
import fs from 'fs';
import path from 'path';

const run = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.run');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(run, f), 'utf8')); } catch { return d; } };
const results = read('results.json', null);
const timings = read('timings.json', {});
const up = read('up-timings.json', {});
const version = read('moodle-version.json', {});
const branch = process.env.MOODLE_BRANCH || 'local';

const rows = [];
const walk = (suite, file) => {
  for (const s of suite.suites ?? []) walk(s, s.file ?? file);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const r = t.results?.[t.results.length - 1];
      const status = t.status === 'skipped' || r?.status === 'skipped' ? 'skipped' : r?.status === 'passed' ? 'passed' : r ? 'failed' : 'not run';
      rows.push({ file: spec.file ?? file, scenario: suite.title, title: spec.title, project: t.projectName, status, ms: r?.duration ?? 0, error: r?.error?.message?.split('\n')[0]?.slice(0, 200) });
    }
  }
};
if (results) for (const s of results.suites ?? []) walk(s, s.file);

const icon = (s) => ({ passed: '✅', failed: '❌', skipped: '⏭️', 'not run': '⚪' })[s] ?? s;
const byScenario = new Map();
for (const r of rows) {
  const k = `${r.file}`;
  if (!byScenario.has(k)) byScenario.set(k, []);
  byScenario.get(k).push(r);
}
const lines = [];
const failed = rows.filter((r) => r.status === 'failed').length;
lines.push(`## ENARA LMS e2e — ${branch} (Moodle ${version.release ?? '?'})`);
lines.push('');
lines.push(`**${rows.filter((r) => r.status === 'passed').length} passed, ${failed} failed, ${rows.filter((r) => r.status === 'skipped').length} skipped, ${rows.filter((r) => r.status === 'not run').length} not run** (of ${rows.length})`);
lines.push('');
lines.push('| Scenario | Result | Tests |');
lines.push('|---|---|---|');
for (const [file, list] of byScenario) {
  const st = list.some((r) => r.status === 'failed') ? 'failed' : list.every((r) => r.status === 'skipped') ? 'skipped' : list.every((r) => r.status === 'passed' || r.status === 'skipped') ? 'passed' : 'not run';
  const name = list[0].scenario || file;
  lines.push(`| ${name} | ${icon(st)} ${st} | ${list.filter((r) => r.status === 'passed').length}/${list.length} |`);
}
lines.push('');
lines.push('<details><summary>Tests</summary>');
lines.push('');
lines.push('| Test | Browser | Result | Seconds |');
lines.push('|---|---|---|---|');
for (const r of rows) lines.push(`| ${r.title.replace(/\|/g, '/')} | ${r.project} | ${icon(r.status)}${r.error ? ' ' + r.error.replace(/\|/g, '/').replace(/\x1b\[[0-9;]*m/g, '') : ''} | ${(r.ms / 1000).toFixed(1)} |`);
lines.push('');
lines.push('</details>');
lines.push('');
lines.push('**Timings (seconds)**');
lines.push('');
const all = { 'stack up + Moodle install': up.upSeconds, 'Moodle install': up.moodleInstallSeconds, ...timings };
for (const [k, v] of Object.entries(all)) if (v !== undefined) lines.push(`- ${k.replace(/_/g, ' ')}: ${v}`);
fs.writeFileSync(path.join(run, 'summary.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exitCode = 0;
