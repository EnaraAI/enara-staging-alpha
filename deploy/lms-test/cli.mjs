#!/usr/bin/env node
// Continuous delivery to lms-test.enara.app: the steps the workflow runs
// (.github/workflows/lms-deploy.yml). Node 20+, no dependencies.
// docs/lms/CONTINUOUS_DELIVERY.md.
//
//   node deploy/lms-test/cli.mjs guard
//   node deploy/lms-test/cli.mjs current-production
//   node deploy/lms-test/cli.mjs apply-flags [--dry-run]
//   node deploy/lms-test/cli.mjs deployment <deployment url printed by `vercel deploy`>
//   node deploy/lms-test/cli.mjs wait-serving <deployment host> [--timeout 300]
//   node deploy/lms-test/cli.mjs check-site
//   node deploy/lms-test/cli.mjs maintenance migrate|setup|run
//   node deploy/lms-test/cli.mjs rollback <previous deployment id> <previous deployment host>
//   node deploy/lms-test/cli.mjs report
//
// Secrets come only from the environment (VERCEL_TOKEN, LMSTEST_MAINTENANCE_TOKEN)
// and are never printed. Results go to $GITHUB_OUTPUT (key=value) and stdout.
// test.enara.app is frozen: every Vercel call names the enara-lms-test project
// id (constant) and every site call is checked to be on lms-test.enara.app.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GuardError, PROJECT_ID, SITE, TEAM_ID, assertSiteUrl, cleanReason, commentBody, deploymentProblems, healthFailure,
  manifestFlags, planFlags, projectProblems, resultLine,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, '..', 'lms-test.flags.json');
const API = 'https://api.vercel.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function output(key, value) {
  const line = `${key}=${String(value ?? '').replace(/[\r\n]+/g, ' ')}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  process.stdout.write(`[out] ${line}`);
}
function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}
function fail(reason) {
  const clean = cleanReason(reason);
  output('reason', clean);
  console.error(`::error::${clean}`);
  process.exit(1);
}
function secret(name) {
  const v = process.env[name];
  if (!v) fail(`${name} is not set`);
  return v;
}

// ------------------------------------------------------------- Vercel API

/** Every Vercel call: the team id added, the token from the environment, only this project's paths. */
async function vercel(path, { method = 'GET', body, ok = [200, 201, 202] } = {}) {
  const allowed = path.startsWith(`/v9/projects/${PROJECT_ID}`) || path.startsWith(`/v10/projects/${PROJECT_ID}`) || path.startsWith(`/v1/projects/${PROJECT_ID}`)
    || path.startsWith('/v13/deployments/') || path.startsWith('/v6/deployments?');
  if (!allowed) throw new GuardError(`refusing a Vercel call outside project ${PROJECT_ID}`);
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${secret('VERCEL_TOKEN')}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt < 4) { await sleep(2000 * attempt); continue; }
      throw new Error(`Vercel API ${method} ${path.split('?')[0]}: network error`);
    }
    if ((res.status >= 500 || res.status === 429) && attempt < 4) { await sleep(3000 * attempt); continue; }
    const json = await res.json().catch(() => ({}));
    if (!ok.includes(res.status)) {
      const code = json?.error?.code ? ` ${json.error.code}` : '';
      throw Object.assign(new Error(`Vercel API ${method} ${path.split('?')[0]}: HTTP ${res.status}${code}`), { status: res.status, json });
    }
    return json;
  }
}

async function guard() {
  const project = await vercel(`/v9/projects/${PROJECT_ID}`);
  const domains = [];
  let next = '';
  for (let page = 0; page < 10; page++) {
    const r = await vercel(`/v9/projects/${PROJECT_ID}/domains?limit=100${next ? `&until=${next}` : ''}`);
    domains.push(...(r.domains ?? []).map((d) => d.name));
    next = r.pagination?.next;
    if (!next) break;
  }
  const problems = projectProblems(project, domains);
  if (problems.length) throw new GuardError(`guard: ${problems.join('; ')}`);
  return project;
}

async function currentProduction() {
  const project = await guard();
  const t = project.targets?.production;
  if (t?.id) return { id: t.id, url: t.url };
  const list = await vercel(`/v6/deployments?projectId=${PROJECT_ID}&target=production&state=READY&limit=1`);
  const d = list.deployments?.[0];
  return d ? { id: d.uid, url: d.url } : null;
}

async function getDeployment(idOrHost) {
  const dep = await vercel(`/v13/deployments/${encodeURIComponent(idOrHost)}`);
  const problems = deploymentProblems(dep);
  if (problems.length) throw new GuardError(`deployment: ${problems.join('; ')}`);
  return dep;
}

/** Makes `dep` the production deployment (after a rollback Vercel stops assigning new ones by itself). */
async function promote(depId, { timeoutMs = 180_000 } = {}) {
  await getDeployment(depId);
  await vercel(`/v10/projects/${PROJECT_ID}/promote/${encodeURIComponent(depId)}`, { method: 'POST', ok: [200, 201, 202, 204] });
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const project = await vercel(`/v9/projects/${PROJECT_ID}`);
    if (project.targets?.production?.id === depId) return;
    await sleep(5000);
  }
  throw new Error('promotion did not finish in time');
}

// ------------------------------------------------------------------- site

async function site(path, { method = 'GET', auth = false, body } = {}) {
  const url = assertSiteUrl(`${SITE}${path}`);
  const headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
  if (auth) headers.Authorization = `Bearer ${secret('LMSTEST_MAINTENANCE_TOKEN')}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(70_000) });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

async function siteReady() {
  const r = await site('/ready');
  return r.json?.checks?.mongo === 'ok';
}

/**
 * Waits until lms-test.enara.app answers from `host` (status reports VERCEL_URL)
 * and /ready says mongo ok. `olderOk`: during a rollback the previous build may
 * not know the CI token or the deployment field; then the project's production
 * target (Vercel API) must name `prevId`.
 */
async function waitServing(host, { timeoutS = 300, olderOk = false, prevId } = {}) {
  const want = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const end = Date.now() + timeoutS * 1000;
  let last = 'no answer';
  while (Date.now() < end) {
    const ready = await siteReady();
    const st = await site('/api/maintenance/status', { auth: true });
    const serving = st.json?.deployment?.url;
    if (ready && serving === want) return 'confirmed';
    if (ready && olderOk && (st.status === 401 || st.status === 404 || (st.status === 200 && !st.json?.deployment))) {
      const project = await vercel(`/v9/projects/${PROJECT_ID}`);
      if (project.targets?.production?.id === prevId) return 'confirmed_by_vercel';
    }
    last = !ready ? 'ready: mongo not ok' : st.status !== 200 ? `status HTTP ${st.status}` : `serving another deployment`;
    await sleep(5000);
  }
  throw new Error(`site did not come up on the expected deployment in ${timeoutS}s (${last})`);
}

// --------------------------------------------------------------- commands

async function applyFlags(dryRun) {
  const flags = manifestFlags(JSON.parse(readFileSync(MANIFEST, 'utf8')));
  const { envs = [] } = await vercel(`/v9/projects/${PROJECT_ID}/env`);
  // Encrypted (non-sensitive) values: read one by one to compare. Sensitive ones are never read.
  for (const e of envs) {
    if (e.key in flags && e.type === 'encrypted' && (Array.isArray(e.target) ? e.target : [e.target]).includes('production')) {
      const full = await vercel(`/v1/projects/${PROJECT_ID}/env/${encodeURIComponent(e.id)}`).catch(() => null);
      e.value = typeof full?.value === 'string' ? full.value : undefined;
    }
  }
  const plan = planFlags(flags, envs);
  const changed = [];
  for (const step of plan) {
    if (step.action === 'create' && !dryRun) {
      await vercel(`/v10/projects/${PROJECT_ID}/env`, { method: 'POST', body: { key: step.key, value: step.value, type: 'plain', target: ['production'] } });
    } else if (step.action === 'update' && !dryRun) {
      await vercel(`/v9/projects/${PROJECT_ID}/env/${encodeURIComponent(step.envId)}`, { method: 'PATCH', body: { value: step.value } });
    }
    if (step.action === 'create' || step.action === 'update') changed.push(`${step.key}=${step.value}`);
    const shared = step.sharedWith?.length ? ` (entry also used by ${step.sharedWith.join(', ')})` : '';
    console.log(`${dryRun ? '[dry-run] ' : ''}${step.key}: ${step.action}${shared}`);
  }
  output('flags_changed', changed.join(' ') || 'none');
  summary(`**Flags (enara-lms-test, Production):** ${plan.map((p) => `\`${p.key}\` ${p.action}`).join(', ')}`);
}

async function maintenance(what) {
  const paths = { migrate: '/api/maintenance/migrate', setup: '/api/maintenance/health-check/setup', run: '/api/maintenance/health-check/run' };
  if (!paths[what]) throw new Error('maintenance migrate|setup|run');
  let r = await site(paths[what], { method: 'POST', auth: true, body: {} });
  // A brand-new deployment is cold: its first grade send to the mock LMS (on the same site) can time out (deploy rollbacks
  // on 25 Nov 2026: grade_send job_pending, lastError timeout). Run the whole check once more after a pause; a real fault
  // fails twice and still rolls back.
  const coldGrade = (j) => { const f = (j?.steps ?? []).find((s) => !s.ok); return !!f && ['grade_send', 'grade_received'].includes(f.name) && /timeout|job_pending|no_score_at_mock/.test(f.code ?? ''); };
  if (what === 'run' && r.status === 200 && r.json?.ok !== true && coldGrade(r.json)) {
    for (const s of r.json.steps ?? []) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.name} ${s.ms}ms ${s.code ?? ''} (first run)`);
    console.log('::warning::health check: grade step failed on the cold deployment; running the check once more in 15 s');
    summary('\n> Health check: the grade step failed on the first run (cold deployment); the check ran once more.\n');
    await new Promise((res) => setTimeout(res, 15_000));
    r = await site(paths[what], { method: 'POST', auth: true, body: {} });
  }
  if (what === 'migrate') {
    if (r.status !== 200 || !Array.isArray(r.json?.applied)) throw new Error(`migrate: HTTP ${r.status}`);
    if (r.json.pending?.length) throw new Error(`migrate: still pending ${r.json.pending.join(',')}`);
    output('migrations_applied', r.json.applied.join(' ') || 'none');
    summary(`**Migrations applied:** ${r.json.applied.map((m) => `\`${m}\``).join(', ') || 'none'}`);
    return;
  }
  if (what === 'setup') {
    if (r.status !== 200 || r.json?.ok !== true) throw new Error(`health-check setup: ${r.json?.code ?? `HTTP ${r.status}`}`);
    console.log(`setup ok: platform ${r.json.platformId}, deployment ${r.json.deploymentId}, assessment ${r.json.assessmentId}`);
    return;
  }
  const steps = r.json?.steps ?? [];
  summary(['', '| Health step | ok | ms | code |', '|---|---|---|---|', ...steps.map((s) => `| ${s.name} | ${s.ok ? 'yes' : '**no**'} | ${s.ms} | ${s.code ?? ''} |`)].join('\n'));
  for (const s of steps) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.name} ${s.ms}ms ${s.code ?? ''}`);
  if (r.status !== 200) throw new Error(`health check: HTTP ${r.status}`);
  const why = healthFailure(r.json);
  if (why) throw new Error(why);
}

async function checkSite() {
  if (!(await siteReady())) throw new Error('/ready: mongo not ok');
  const j = await site('/.well-known/jwks.json');
  if (j.status !== 200 || !Array.isArray(j.json?.keys) || !j.json.keys.length) throw new Error(`/.well-known/jwks.json has no key (HTTP ${j.status})`);
  console.log(`site up, mongo ok, ${j.json.keys.length} tool key(s) published`);
  // modelFallback: /ready reports a real key check (names and states only). A rejected key does not fail the deploy (the site still serves
  // non-AI pages); it is an ALERT in the step summary and the log, so it is seen the same day.
  const ready = (await site('/ready')).json?.checks ?? {};
  for (const k of ['anthropicKey', 'anthropicFallbackKey']) {
    if (ready[k] === 'rejected' || ready[k] === 'error') {
      const msg = `ALERT: ${k} on lms-test is ${ready[k]} (tutor replies ${k === 'anthropicKey' ? (ready.anthropicFallbackKey === 'accepted' ? 'use the fallback key' : 'fail') : 'have no working fallback'})`;
      console.log(`::warning::${msg}`);
      summary(`\n> **${msg}**\n`);
    }
  }
}

/** One test of every environment variable (read-only, names and states only). Fails only on a required check; others warn. */
async function envCheck() {
  const r = await site('/api/maintenance/env-check', { method: 'POST', auth: true, body: {} });
  if (r.status !== 200 || !Array.isArray(r.json?.checks)) throw new Error(`env-check: HTTP ${r.status}`);
  summary(['', '| Env check | variables | state | required |', '|---|---|---|---|', ...r.json.checks.map((c) => `| ${c.name} | ${c.vars.join(', ')} | ${c.state === 'ok' ? 'ok' : `**${c.state}**`}${c.note ? ` (${c.note})` : ''} | ${c.required ? 'yes' : ''} |`)].join('\n'));
  for (const c of r.json.checks) {
    console.log(`${c.state === 'ok' ? 'ok  ' : c.required ? 'FAIL' : 'warn'} ${c.name} [${c.vars.join(', ')}] ${c.state}${c.note ? ` (${c.note})` : ''}`);
    if (c.state !== 'ok' && c.state !== 'not_configured' && !c.required) console.log(`::warning::env-check: ${c.name} is ${c.state}`);
  }
  if (!r.json.ok) throw new Error(`env-check: required ${r.json.checks.filter((c) => c.required && c.state !== 'ok').map((c) => c.name).join(', ')} not ok`);
}

async function report() {
  const outcome = process.env.OUTCOME || 'not_deployed';
  const line = resultLine({ title: process.env.PR_TITLE, outcome, reason: process.env.REASON });
  const details = [];
  if (process.env.DEPLOY_SHA) details.push(`Commit: \`${process.env.DEPLOY_SHA.slice(0, 12)}\` on \`lms-test-live\``);
  if (process.env.FLAGS_CHANGED && process.env.FLAGS_CHANGED !== 'none') details.push(`Flags set on enara-lms-test (Production): ${process.env.FLAGS_CHANGED.split(' ').map((f) => `\`${f}\``).join(', ')}`);
  if (process.env.MIGRATIONS && process.env.MIGRATIONS !== 'none') details.push(`Migrations applied: ${process.env.MIGRATIONS.split(' ').map((m) => `\`${m}\``).join(', ')}`);
  if (outcome === 'rolled_back' || outcome === 'rollback_failed') {
    details.push('Database migrations are forward-only and additive: they were NOT rolled back (the previous build ignores what it does not know).');
    details.push('Flags set in the Vercel project stay set; the previous build keeps the environment it was built with.');
  }
  if (process.env.RUN_URL) details.push(`Run: ${process.env.RUN_URL}`);
  summary(`\n### ${line}\n`);
  writeFileSync(process.env.COMMENT_FILE || 'lms-deploy-comment.md', commentBody({ line, details }));
  output('line', line);
  console.log(line);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'guard': {
      const p = await guard();
      console.log(`guard ok: project ${p.name} (${p.id}); test.enara.app is not one of its domains`);
      break;
    }
    case 'current-production': {
      const cur = await currentProduction();
      if (!cur) throw new Error('no current production deployment to roll back to');
      output('prev_id', cur.id);
      output('prev_url', cur.url);
      break;
    }
    case 'apply-flags':
      await guard();
      await applyFlags(args.includes('--dry-run'));
      break;
    case 'deployment': {
      const host = String(args[0] ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!/^[a-z0-9.-]+\.vercel\.app$/.test(host)) throw new Error('vercel deploy did not print a deployment URL');
      const dep = await getDeployment(host);
      if (dep.readyState !== 'READY') throw new Error(`deployment state ${dep.readyState}`);
      output('new_id', dep.id);
      output('new_url', dep.url);
      const project = await vercel(`/v9/projects/${PROJECT_ID}`);
      if (project.targets?.production?.id !== dep.id) {
        console.log('the new deployment is not the production one yet (the project was rolled back before?): promoting it');
        await promote(dep.id);
      }
      break;
    }
    case 'wait-serving': {
      const t = args.indexOf('--timeout');
      console.log(await waitServing(args[0], { timeoutS: t >= 0 ? Number(args[t + 1]) : 300 }));
      break;
    }
    case 'check-site':
      await checkSite();
      break;
    case 'env-check':
      await envCheck();
      break;
    case 'maintenance':
      await maintenance(args[0]);
      break;
    case 'rollback': {
      const [prevId, prevUrl] = args;
      if (!prevId || !prevUrl) throw new Error('rollback <previous deployment id> <previous deployment host>');
      await guard();
      await promote(prevId);
      console.log(await waitServing(prevUrl, { timeoutS: 300, olderOk: true, prevId }));
      break;
    }
    case 'report':
      await report();
      break;
    default:
      throw new Error(`unknown command ${cmd ?? ''}`);
  }
} catch (e) {
  fail(e instanceof GuardError ? `GUARD: ${e.message}` : e?.message ?? String(e));
}
