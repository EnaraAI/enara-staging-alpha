// node --test deploy/lms-test/lib.test.mjs deploy/lms-test/cli.test.mjs
// Runs cli.mjs against a fake Vercel API and a fake lms-test.enara.app
// (fake-fetch.test-helper.mjs): no network, no real token.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PROJECT_ID, PROJECT_NAME, TEAM_ID, manifestFlags } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VTOKEN = 'vercel-token-must-never-be-printed-0123456789';
const MTOKEN = 'maintenance-token-must-never-be-printed-0123';
const NEW = { id: 'dpl_new', url: 'enara-lms-test-new.vercel.app', projectId: PROJECT_ID, target: 'production', readyState: 'READY', alias: [] };
const PREV = { id: 'dpl_prev', url: 'enara-lms-test-prev.vercel.app', projectId: PROJECT_ID, target: 'production', readyState: 'READY', alias: ['lms-test.enara.app'] };
const baseScenario = () => ({
  project: { id: PROJECT_ID, name: PROJECT_NAME, accountId: TEAM_ID, targets: { production: { id: PREV.id, url: PREV.url } } },
  domains: ['lms-test.enara.app', 'enara-lms-test.vercel.app'],
  deployments: { [NEW.id]: NEW, [PREV.id]: PREV },
  serving: PREV.url,
});

function run(args, scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'lmscd-'));
  const log = join(dir, 'calls.jsonl');
  const out = join(dir, 'out');
  const sum = join(dir, 'summary');
  writeFileSync(log, '');
  writeFileSync(out, '');
  writeFileSync(sum, '');
  const r = spawnSync(process.execPath, ['--import', join(HERE, 'fake-fetch.test-helper.mjs'), join(HERE, 'cli.mjs'), ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH, FAKE_SCENARIO: JSON.stringify(scenario), FAKE_LOG: log, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum,
      VERCEL_TOKEN: VTOKEN, LMSTEST_MAINTENANCE_TOKEN: MTOKEN, COMMENT_FILE: join(dir, 'comment.md'), ...(scenario.env ?? {}),
    },
    timeout: 60_000,
  });
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const outputs = Object.fromEntries(readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const all = r.stdout + r.stderr + readFileSync(out, 'utf8') + readFileSync(sum, 'utf8');
  assert.ok(!all.includes(VTOKEN) && !all.includes(MTOKEN), 'a token was printed');
  for (const c of calls) {
    const u = new URL(c.url);
    assert.ok(['api.vercel.com', 'lms-test.enara.app'].includes(u.host), `unexpected host ${u.host}`);
    if (u.host === 'api.vercel.com') assert.equal(u.searchParams.get('teamId'), TEAM_ID);
    assert.notEqual(c.method, 'DELETE');
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls, outputs, dir, summary: readFileSync(sum, 'utf8') };
}

test('guard passes for enara-lms-test and stops on test.enara.app, a renamed project or an unexpected domain', () => {
  assert.equal(run(['guard'], baseScenario()).status, 0);
  for (const change of [{ domains: ['lms-test.enara.app', 'test.enara.app'] }, { project: { ...baseScenario().project, name: 'enara-staging' } }, { domains: ['lms-test.enara.app', 'www.enara.app'] }]) {
    const r = run(['guard'], { ...baseScenario(), ...change });
    assert.equal(r.status, 1);
    assert.match(r.outputs.reason, /^GUARD: /);
  }
});

test('current-production records the deployment to roll back to', () => {
  const r = run(['current-production'], baseScenario());
  assert.equal(r.status, 0);
  assert.deepEqual([r.outputs.prev_id, r.outputs.prev_url], [PREV.id, PREV.url]);
});

test('apply-flags: creates missing ones as plain Production vars, corrects different ones, never touches Sensitive ones; dry run writes nothing', () => {
  const envs = [
    { id: 'e1', key: 'LMS_LTI_ENABLED', type: 'plain', target: ['production'], value: 'true' },
    { id: 'e2', key: 'LMS_ROSTER_SYNC_ENABLED', type: 'encrypted', target: ['production'], value: 'false' },
    { id: 'e3', key: 'MAINTENANCE_ENDPOINTS_ENABLED', type: 'sensitive', target: ['production'] },
    { id: 'e4', key: 'MONGODB_URI', type: 'sensitive', target: ['production'] },
  ];
  const r = run(['apply-flags'], { ...baseScenario(), envs });
  assert.equal(r.status, 0, r.stderr);
  const writes = r.calls.filter((c) => c.method !== 'GET');
  const creates = writes.filter((c) => c.method === 'POST').map((c) => c.body);
  assert.ok(creates.length >= 5);
  // Each created value is the manifest's own value ('true', or the ENARA_ENGINE_V2 comma list).
  const want = manifestFlags(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lms-test.flags.json'), 'utf8')));
  for (const b of creates) {
    assert.deepEqual([b.type, b.target, b.value], ['plain', ['production'], want[b.key]]);
    assert.ok(!['LMS_LTI_ENABLED', 'MAINTENANCE_ENDPOINTS_ENABLED', 'MONGODB_URI'].includes(b.key));
  }
  const patches = writes.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 1);
  assert.match(patches[0].url, /\/env\/e2\?/);
  assert.deepEqual(patches[0].body, { value: 'true' });
  assert.ok(!r.calls.some((c) => /\/env\/e3|\/env\/e4/.test(c.url)), 'a Sensitive var was read or written');
  assert.match(r.stdout, /MAINTENANCE_ENDPOINTS_ENABLED: skip_sensitive/);

  const dry = run(['apply-flags', '--dry-run'], { ...baseScenario(), envs });
  assert.equal(dry.status, 0);
  assert.equal(dry.calls.filter((c) => c.method !== 'GET').length, 0);
});

test('deployment: checks the new deployment, promotes it if the project was rolled back before, then waits until the site serves it', () => {
  const r = run(['deployment', `https://${NEW.url}`], baseScenario());
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.outputs.new_id, NEW.id);
  assert.ok(r.calls.some((c) => c.method === 'POST' && c.url.includes(`/v10/projects/${PROJECT_ID}/promote/${NEW.id}`)));
  const w = run(['wait-serving', NEW.url, '--timeout', '20'], { ...baseScenario(), serving: NEW.url });
  assert.equal(w.status, 0, w.stderr);
  assert.match(w.stdout, /confirmed/);
  // A deployment of another project is refused.
  const other = run(['deployment', 'other.vercel.app'], { ...baseScenario(), deployments: { x: { ...NEW, id: 'x', url: 'other.vercel.app', projectId: 'prj_other' } } });
  assert.equal(other.status, 1);
  assert.match(other.outputs.reason, /another project/);
});

test('rollback: promotes the recorded deployment and waits until lms-test serves it (also when that older build has no deployment field)', () => {
  const scenario = { ...baseScenario(), project: { ...baseScenario().project, targets: { production: { id: NEW.id, url: NEW.url } } }, serving: NEW.url, oldBuilds: [PREV.url] };
  const r = run(['rollback', PREV.id, PREV.url], scenario);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.some((c) => c.method === 'POST' && c.url.includes(`/promote/${PREV.id}`)));
  assert.match(r.stdout, /confirmed_by_vercel/);
});

test('maintenance: migrate, setup and a failing health run (exit 1, reason = the failed step)', () => {
  const ok = run(['maintenance', 'migrate'], { ...baseScenario(), migrate: { applied: ['2026-11-19-x'], pending: [] } });
  assert.equal(ok.status, 0);
  assert.equal(ok.outputs.migrations_applied, '2026-11-19-x');
  assert.ok(ok.calls.every((c) => !c.url.includes('lms-test.enara.app/api/maintenance') || c.auth));
  assert.equal(run(['maintenance', 'setup'], baseScenario()).status, 0);
  const bad = run(['maintenance', 'run'], { ...baseScenario(), run: { ok: false, steps: [{ name: 'ready', ok: true, ms: 3 }, { name: 'grade_received', ok: false, ms: 15000, code: 'no_score_at_mock' }] } });
  assert.equal(bad.status, 1);
  assert.equal(bad.outputs.reason, 'health check failed at grade_received (no_score_at_mock)');
  assert.match(bad.summary, /\| grade_received \| \*\*no\*\* \|/);
  assert.equal(run(['check-site'], baseScenario()).status, 0);
});

test('report: one line in the step summary and a PR comment ending with the footer', () => {
  const r = run(['report'], { ...baseScenario(), env: { OUTCOME: 'rolled_back', REASON: 'health check failed at lti_launch (http_401_invalid_signature)', PR_TITLE: 'LMS phase 5', MIGRATIONS: '2026-11-19-x' } });
  assert.equal(r.status, 0);
  assert.equal(r.outputs.line, 'LMS phase 5: deployed to lms-test — rolled back (health check failed at lti_launch (http_401_invalid_signature))');
  assert.match(r.summary, /### LMS phase 5: deployed to lms-test — rolled back/);
  const comment = readFileSync(join(r.dir, 'comment.md'), 'utf8');
  assert.ok(comment.startsWith('LMS phase 5: deployed to lms-test — rolled back'));
  assert.match(comment, /NOT rolled back/);
  assert.ok(comment.endsWith('\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_'));
  assert.equal(r.calls.length, 0);
});
