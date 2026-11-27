// Live tutor quick fixes: one short scripted live call per feature on lms-test.enara.app ONLY (owner: a few cents per
// call, at most 3 calls in total). Reuses the avatar cost harness (deploy/lms-test/avatarcost on branch
// claude/tutor-lms-avatarcost-run): the learner is the deploy health check's fake LTI student, the call runs in a real
// browser against real Anam, and the server's own usage report gives the call's Anam seconds and model cost.
// test.enara.app is frozen: every URL goes through assertSiteUrl (lms-test only).
//
//   node run.mjs calls <audioDir>   the calls named in plan.json run.ids
//
// Secrets (maintenance token, the learner's session token, Anam tokens) are never printed or written.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, assertSiteUrl } from '../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LC_OUT || join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const plan = JSON.parse(readFileSync(join(HERE, 'plan.json'), 'utf8'));
const summaryLine = (s) => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`); };
// Anam's public prices (docs/tutor/AVATAR_TEST_REPORT.md, 21 Nov 2026): 11 to 24 cents a minute on a paid plan.
const ANAM_USD_PER_MIN = [0.11, 0.24];

async function site(path, init = {}) {
  const url = assertSiteUrl(`${SITE}${path}`);
  return fetch(url, { redirect: 'manual', ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000) });
}

// --- learner session for the fake student health-student-1 (the deploy health check's LTI flow), as in avatarcost/run.mjs
const MOCK = `${SITE}/api/maintenance/mock-lms`;
const maint = () => `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`;

async function learnerToken() {
  const setup = await site('/api/maintenance/health-check/setup', { method: 'POST', headers: { Authorization: maint() } });
  const sj = await setup.json().catch(() => ({}));
  if (setup.status !== 200 || sj.ok !== true) throw new Error(`health-check setup: ${sj.code ?? `HTTP ${setup.status}`}`);
  const q = new URLSearchParams({ iss: MOCK, login_hint: 'health-student-1', target_link_uri: `${SITE}/lti/launch`, client_id: 'health-check-mock-lms', lti_deployment_id: 'health-deployment-1' });
  const login = await site(`/lti/login?${q}`);
  if (login.status !== 302) throw new Error(`lti_login HTTP ${login.status}`);
  const location = login.headers.get('location') ?? '';
  if (!location.startsWith(`${MOCK}/auth?`)) throw new Error('lti_login unexpected redirect');
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0].trim()).find((c) => c.startsWith('lti_st_'));
  const auth = await fetch(assertSiteUrl(location), { headers: { Authorization: maint(), Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  const aj = await auth.json().catch(() => ({}));
  if (auth.status !== 200 || typeof aj.id_token !== 'string') throw new Error(`mock_auth HTTP ${auth.status}`);
  const launch = await site('/lti/launch', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) }, body: new URLSearchParams({ id_token: aj.id_token, state: aj.state }).toString() });
  if (launch.status !== 303) throw new Error(`lti_launch HTTP ${launch.status}`);
  const loc = launch.headers.get('location') ?? '';
  const lt = new URLSearchParams(loc.slice(loc.indexOf('#') + 1)).get('lt');
  if (!lt) throw new Error('no launch token');
  const ex = await site('/api/lms/launch/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: lt }) });
  const ej = await ex.json().catch(() => ({}));
  if (ex.status !== 200 || typeof ej.token !== 'string') throw new Error(`launch_exchange HTTP ${ex.status}`);
  return ej.token;
}

const asLearner = (token) => (path, init = {}) => site(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });

async function liveUsage(get) {
  const r = await get('/api/me/tutor/live-usage');
  return { status: r.status, body: r.ok ? await r.json().catch(() => null) : null };
}

async function calls(audioDir) {
  const { chromium } = await import('playwright');
  const ids = plan.run.ids;
  const byId = Object.fromEntries(plan.calls.map((c) => [c.id, c]));
  if (plan.run.used + ids.length > plan.run.cap) throw new Error(`over the cap: ${plan.run.used} used + ${ids.length} > ${plan.run.cap}`);
  const token = await learnerToken();
  const get = asLearner(token);
  const umd = readFileSync(join(process.cwd(), 'node_modules/@anam-ai/js-sdk/dist/umd/anam.js'), 'utf8');
  const speech = readFileSync(join(OUT, 'speechText.js'), 'utf8');
  const harness = readFileSync(join(HERE, 'harness.js'), 'utf8');
  const results = [];
  for (const id of ids) {
    const call = byId[id];
    const sentences = call.sentences.map((text, n) => ({ text, b64: readFileSync(join(audioDir, id, `s${n}.wav`)).toString('base64') }));
    const usageBefore = await liveUsage(get);
    // Google Chrome, not Playwright's Chromium: Chromium builds have no H.264 for WebRTC, which the avatar video may need.
    const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    let result;
    const consoleLines = [];
    try {
      const context = await browser.newContext({ bypassCSP: true, permissions: ['microphone'] });
      const page = await context.newPage();
      // The harness page lives on the lms-test origin (served by Playwright, not by the site), so our API calls are same-origin.
      await page.route(`${SITE}/__livecheck`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><title>livecheck</title></head><body></body></html>' }));
      const mask = (t) => String(t).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '<jwt>').replace(/[A-Za-z0-9+/_=-]{40,}/g, '<long>').slice(0, 300);
      page.on('pageerror', (e) => consoleLines.push(`pageerror ${mask(e.message)}`));
      page.on('console', (m) => { if (consoleLines.length < 200) consoleLines.push(`${m.type()} ${mask(m.text())}`); });
      await page.goto(`${SITE}/__livecheck`);
      await page.addScriptTag({ content: umd });
      await page.addScriptTag({ content: speech });
      await page.addScriptTag({ content: harness });
      result = await page.evaluate((cfg) => window.__livecheck.runCall(cfg), {
        token, check: call.check,
        sessionBody: { subject: 'English', lesson_title: 'Speaking practice', preferred_language: 'english' },
        sentences, maxReplyMs: 20000,
      });
    } catch (e) {
      result = { ok: false, errors: [`harness_${String(e?.message ?? e).slice(0, 160)}`] };
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 3000));
    result.usageBefore = usageBefore;
    result.usageAfter = await liveUsage(get);
    result.console = consoleLines;
    result.id = id;
    results.push(result);
    const brief = { id, check: call.check, ok: result.ok, checkOk: result.checkOk ?? null, checkResult: result.checkResult ?? null, features: result.features ?? null, speech: result.speech, durationSec: result.durationSec, errors: result.errors, turns: (result.turns ?? []).map((t) => ({ said: t.text, heard: t.heard, muted: t.muted || undefined, replies: t.queries?.length, reply: (t.replyText ?? '').slice(0, 90), captionTutor: t.captionTutor?.slice(0, 90), captionLearner: t.captionLearner })) };
    console.log(`CALL ${JSON.stringify(brief)}`);
    console.log(`USAGE ${JSON.stringify({ id, before: result.usageBefore, mid: result.usageMidCall ?? null, after: result.usageAfter })}`);
    if (!result.ok) for (const l of consoleLines.slice(0, 40)) console.log(`CONSOLE ${id} ${l}`);
    writeFileSync(join(OUT, `call-${id}.json`), JSON.stringify(result, null, 1));
  }
  // The server's own record of each call (read only): Anam seconds from the usage ledger and the model's cost.
  const avIds = results.map((r) => r.sessionId).filter(Boolean);
  if (avIds.length) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await site(`/api/maintenance/avatar-usage?ids=${avIds.join(',')}`, { headers: { Authorization: maint() } });
    const j = await r.json().catch(() => null);
    writeFileSync(join(OUT, 'avatar-usage.json'), JSON.stringify(j, null, 1));
    for (const c of j?.calls ?? []) {
      const rid = results.find((x) => x.sessionId === c.id)?.id;
      const seconds = (c.ledger ?? []).reduce((n, l) => n + (Number(l?.units?.avatarSeconds) || 0), 0);
      const llmUsd = Object.values(c.llm ?? {}).reduce((n, m) => n + (Number(m?.costUsd) || 0), 0);
      const anam = ANAM_USD_PER_MIN.map((p) => Math.round((seconds / 60) * p * 1000) / 1000);
      summaryLine(`COST ${rid}: ${seconds} s of Anam ($${anam[0]}-$${anam[1]} at paid-plan prices), model $${llmUsd.toFixed(4)}, total $${(anam[0] + llmUsd).toFixed(3)}-$${(anam[1] + llmUsd).toFixed(3)}`);
      console.log(`AVUSAGE ${JSON.stringify({ call: rid, found: c.found, speech: c.speech, basis: c.usageEndBasis, ledger: c.ledger, llm: c.llm })}`);
    }
  }
  for (const r of results) {
    // timeUsed: the learner's numbers around the call. A call that got going adds one used call and its minutes; one
    // the video provider refused adds nothing (failed starts never use up the day).
    if (r.check === 'timeUsed') {
      const b = r.usageBefore?.body, a = r.usageAfter?.body;
      const got = typeof r.readyMs === 'number'; // the video connected: heartbeats were sent
      const ok = r.usageBefore?.status === 200 && r.usageAfter?.status === 200 && a.callsUsedToday === b.callsUsedToday + (got ? 1 : 0) && a.callsLeftToday === b.callsLeftToday - (got ? 1 : 0) && a.secondsUsedToday >= b.secondsUsedToday;
      r.checkResult = { ...(r.checkResult ?? {}), gotGoing: got, before: b, after: a };
      r.checkOk = r.checkOk && ok;
    }
    summaryLine(`CHECK ${r.id}: ${r.checkOk ? 'PASS' : 'FAIL'} ${JSON.stringify(r.checkResult ?? r.errors ?? null)} ${r.errors?.length ? `errors: ${JSON.stringify(r.errors)}` : ''}`);
  }
  if (results.some((r) => !r.checkOk)) process.exitCode = 1;
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'calls') await calls(arg);
  else if (cmd === 'usage') {
    // No call: the learner's live usage as lms-test serves it (liveTimeUsed on: 200 with the numbers; off: 404).
    const u = await liveUsage(asLearner(await learnerToken()));
    summaryLine(`LIVE_USAGE ${u.status} ${JSON.stringify(u.body)}`);
    if (u.status !== 200) process.exitCode = 1;
  }
  else throw new Error('usage: run.mjs calls <audioDir> | usage');
} catch (e) {
  console.log(`FAILED: ${String(e?.message ?? e).slice(0, 300)}`);
  process.exitCode = 1;
}
