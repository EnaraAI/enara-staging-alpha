// Avatar cost / latency / STT run against lms-test.enara.app ONLY (owner's task, 21 Nov 2026).
// test.enara.app is frozen: every site URL goes through assertSiteUrl (lms-test only), and the
// Vercel project is checked with the deploy guard before anything else.
//
//   node run.mjs preflight          AI_PAUSED (read only), the project guard, /ready
//   node run.mjs calls <audioDir>   the calls named in plan.json run.ids
//
// Secrets (Vercel token, maintenance token, the learner's session token, Anam
// tokens) are never printed or written: only IDs, counts, codes and timings.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ID, TEAM_ID, SITE, assertSiteUrl, projectProblems } from '../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.AVC_OUT || join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const plan = JSON.parse(readFileSync(join(HERE, 'plan.json'), 'utf8'));
const summaryLine = (s) => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`); };

async function site(path, init = {}) {
  const url = assertSiteUrl(`${SITE}${path}`);
  return fetch(url, { redirect: 'manual', ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000) });
}

async function vercel(path) {
  const res = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`, { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Vercel GET ${path.split('?')[0].replace(/\/env\/[^/]+$/, '/env/<id>')}: HTTP ${res.status}`);
  return res.json();
}

const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v).trim());

async function preflight() {
  const out = {};
  if (!process.env.VERCEL_TOKEN) throw new Error('VERCEL_TOKEN is not set');
  const project = await vercel(`/v9/projects/${PROJECT_ID}`);
  const domains = (await vercel(`/v9/projects/${PROJECT_ID}/domains?limit=100`)).domains ?? [];
  const problems = projectProblems(project, domains);
  if (problems.length) throw new Error(`guard: ${problems.join('; ')}`);
  const envs = (await vercel(`/v10/projects/${PROJECT_ID}/env`)).envs ?? [];
  const prod = (k) => envs.filter((e) => e.key === k && (e.target ?? []).includes('production'));
  let aiPaused = 'unset';
  const e = prod('AI_PAUSED')[0];
  if (e) {
    let value = e.type === 'plain' ? e.value : undefined;
    if (value === undefined && e.type !== 'sensitive') value = (await vercel(`/v1/projects/${PROJECT_ID}/env/${e.id}`)).value;
    aiPaused = value === undefined ? 'unreadable' : truthy(value) ? 'true' : 'false';
    value = undefined;
  }
  out.AI_PAUSED = aiPaused;
  // Names only (present or not), never values.
  out.keysPresent = Object.fromEntries(['ANAM_API_KEY', 'ANAM_AVATAR_ID', 'ELEVENLABS_API_KEY', 'ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'ANAM_SESSION_RESERVE_USD', 'ANAM_MAX_SESSION_SECONDS'].map((k) => [k, prod(k).length > 0]));
  out.envUpdated = Object.fromEntries(['ELEVENLABS_API_KEY', 'ANAM_API_KEY'].map((k) => [k, prod(k)[0]?.updatedAt ? new Date(prod(k)[0].updatedAt).toISOString() : null]));
  const deps = (await vercel(`/v6/deployments?projectId=${PROJECT_ID}&target=production&limit=3`)).deployments ?? [];
  out.lastProdDeploys = deps.map((d) => ({ created: new Date(d.created).toISOString(), state: d.state ?? d.readyState, ref: d.meta?.githubCommitRef ?? null, sha: (d.meta?.githubCommitSha ?? '').slice(0, 8) || null }));
  const ready = await site('/ready');
  const rj = await ready.json().catch(() => ({}));
  out.ready = { status: ready.status, checks: rj.checks ?? null };
  summaryLine(`AI_PAUSED=${aiPaused}`);
  console.log(`PREFLIGHT ${JSON.stringify(out)}`);
  writeFileSync(join(OUT, 'preflight.json'), JSON.stringify(out, null, 1));
  if (aiPaused === 'true') { summaryLine('AI is paused on lms-test: stopping (not changing it).'); process.exitCode = 3; }
}

// --- learner session for the fake student health-student-1 (the deploy health check's LTI flow)
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

async function pickCourse(get) {
  const r = await get('/api/me/courses');
  const j = await r.json().catch(() => null);
  const list = Array.isArray(j) ? j : (j?.courses ?? j?.items ?? []);
  const info = { status: r.status, count: list.length };
  const eng = list.find((c) => /english/i.test(`${c.name ?? ''} ${c.courseName ?? ''} ${c.subject ?? ''}`)) ?? null;
  info.names = list.map((c) => String(c.name ?? c.courseName ?? c.title ?? '').slice(0, 60));
  info.picked = eng ? String(eng.id ?? eng.courseId ?? '') || null : null;
  return info;
}

async function usageToday(get) {
  const r = await get('/api/usage/me/today?features=voice,avatar_session,tutor_voice');
  return r.ok ? r.json().catch(() => null) : { status: r.status };
}

async function calls(audioDir) {
  const { chromium } = await import('playwright');
  const ids = plan.run.ids;
  const byId = Object.fromEntries(plan.calls.map((c) => [c.id, c]));
  if (ids.length > 30) throw new Error('more than 30 calls');
  const token = await learnerToken();
  const get = asLearner(token);
  const course = await pickCourse(get);
  console.log(`COURSE ${JSON.stringify(course)}`);
  const usageBefore = await usageToday(get);
  const umd = readFileSync(join(process.cwd(), 'node_modules/@anam-ai/js-sdk/dist/umd/anam.js'), 'utf8');
  const harness = readFileSync(join(HERE, 'harness.js'), 'utf8');
  const results = [];
  for (const id of ids) {
    const call = byId[id];
    const sentences = call.sentences.map((text, n) => ({ text, b64: readFileSync(join(audioDir, id, `s${n}.wav`)).toString('base64') }));
    const browser = await chromium.launch({
      headless: true,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${join(audioDir, id, 'call.wav')}`, '--autoplay-policy=no-user-gesture-required'],
    });
    let result;
    const consoleLines = [];
    try {
      const context = await browser.newContext({ bypassCSP: true, permissions: ['microphone'] });
      const page = await context.newPage();
      // The harness page lives on the lms-test origin (served by Playwright, not by the site), so our API calls are same-origin.
      await page.route(`${SITE}/__avatarcost`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><title>avatarcost</title></head><body></body></html>' }));
      // Browser console and page errors, masked (anything token-like is cut out), for the artifact and the log.
      const mask = (t) => String(t).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '<jwt>').replace(/[A-Za-z0-9+/_=-]{40,}/g, '<long>').slice(0, 400);
      page.on('pageerror', (e) => consoleLines.push(`pageerror ${mask(e.message)}`));
      page.on('console', (m) => { if (consoleLines.length < 400) consoleLines.push(`${m.type()} ${mask(m.text())}`); });
      // Anam signalling: WebSocket frames (short, masked) and HTTP statuses, to see why a call closes.
      page.on('websocket', (ws) => {
        const host = new URL(ws.url()).host;
        consoleLines.push(`ws open ${host}`);
        ws.on('framereceived', (f) => { const t = typeof f.payload === 'string' ? f.payload : '<bin>'; if (consoleLines.length < 400 && !/"(answer|offer|candidate|iceCandidate)"|sdp/i.test(t.slice(0, 300))) consoleLines.push(`ws< ${mask(t)}`); });
        ws.on('framesent', (f) => { const t = typeof f.payload === 'string' ? f.payload : '<bin>'; if (consoleLines.length < 400 && !/sdp|candidate/i.test(t.slice(0, 300))) consoleLines.push(`ws> ${mask(t).slice(0, 160)}`); });
        ws.on('close', () => consoleLines.push(`ws close ${host}`));
      });
      page.on('response', async (r) => {
        const u = new URL(r.url());
        if (!/anam\.ai$/.test(u.host)) return;
        let body = '';
        if (r.status() >= 400) body = await r.text().catch(() => '');
        consoleLines.push(`http ${r.request().method()} ${u.host}${u.pathname.slice(0, 80)} ${r.status()} ${mask(body).slice(0, 300)}`);
      });
      page.on('requestfailed', (r) => { if (consoleLines.length < 400) consoleLines.push(`requestfailed ${new URL(r.url()).host}${new URL(r.url()).pathname.slice(0, 80)} ${r.failure()?.errorText ?? ''}`); });
      await page.goto(`${SITE}/__avatarcost`);
      await page.addScriptTag({ content: umd });
      await page.addScriptTag({ content: harness });
      result = await page.evaluate((cfg) => window.__avc.runCall(cfg), {
        token,
        sessionBody: { ...(course.picked ? { course_id: course.picked } : {}), subject: 'English', lesson_title: 'Speaking practice', preferred_language: 'english' },
        sentences,
        maxReplyMs: 25000,
      });
    } catch (e) {
      result = { ok: false, errors: [`harness_${String(e?.message ?? e).slice(0, 160)}`] };
    } finally {
      await browser.close().catch(() => {});
    }
    // The stored transcript (what our server kept for this call).
    if (result.sessionId) {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await get(`/api/me/tutor/sessions/${encodeURIComponent(result.sessionId)}`);
      const j = await r.json().catch(() => null);
      const msgs = j?.messages ?? j?.session?.messages ?? [];
      result.stored = { status: r.status, user: msgs.filter((m) => m.role === 'user').map((m) => m.text ?? m.content ?? ''), ai: msgs.filter((m) => m.role !== 'user').length };
    }
    result.console = consoleLines;
    if (!result.ok) { console.log(`EVENTS ${id} ${JSON.stringify(result.events ?? [])} closed=${result.closedReason ?? null}`); for (const l of consoleLines.slice(0, 60)) console.log(`CONSOLE ${id} ${l}`); }
    result.id = id; result.group = call.group; result.voice = call.voice;
    results.push(result);
    const brief = { id, ok: result.ok, speech: result.speech, durationSec: result.durationSec, readyMs: result.readyMs, endStatus: result.endStatus, errors: result.errors, turns: (result.turns ?? []).map((t) => ({ ref: t.text, heard: t.heard, lat: t.replyAudioLatencyMs, ft: t.queries?.[0]?.firstContentMs ?? null })) };
    console.log(`CALL ${JSON.stringify(brief)}`);
    writeFileSync(join(OUT, `call-${id}.json`), JSON.stringify(result, null, 1));
    if (result.errors?.some((e) => /^session_start_http_|unexpected_speech_mode/.test(e))) { console.log('STOP: the call could not start in Anam mode; not trying the rest.'); break; }
    await new Promise((r) => setTimeout(r, 3000));
  }
  const usageAfter = await usageToday(get);
  writeFileSync(join(OUT, 'usage.json'), JSON.stringify({ usageBefore, usageAfter, course }, null, 1));
  console.log(`USAGE ${JSON.stringify({ usageBefore, usageAfter })}`);
  console.log(`SUMMARY ${JSON.stringify({ attempt: plan.run.attempt, ran: results.length, ok: results.filter((r) => r.ok).length })}`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'preflight') await preflight();
  else if (cmd === 'calls') await calls(arg);
  else throw new Error('usage: run.mjs preflight | calls <audioDir>');
} catch (e) {
  console.log(`FAILED: ${String(e?.message ?? e).slice(0, 300)}`);
  process.exitCode = 1;
}
