// lms-test speed: MEASURE ONLY (owner, 27 Nov 2026: "measure first, then fix"). Changes nothing on lms-test.
// Hosts: https://lms-test.enara.app and https://design.enara.app only. test.enara.app is never called (guard below).
// Gentle: one page load at a time; API sampling keeps at most 2 requests in flight with a gap after each; every phase
// waits while an lms-test deploy (lms-e2e "Deploy, migrate" job) is running, and every sample carries its time so samples
// taken during a deploy can be dropped afterwards. No live avatar call is started; anam/elevenlabs/rt.enara.app are
// blocked in page loads. Model calls: DeepSeek on Modal only (llm-check, llm-ping, 5 tutor stream turns, 1 drawing).
// Env: SEED_USER_PASSWORD, LMSTEST_MAINTENANCE_TOKEN, GITHUB_TOKEN, GITHUB_REPOSITORY, OUT. Secrets are never printed
// or written: tokens live in memory only; Lighthouse JSON keeps no headers or storage.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import https from 'node:https';
const require = createRequire(import.meta.url);

const LMS = 'https://lms-test.enara.app';
const DESIGN = 'https://design.enara.app';
const OUT = process.env.OUT || new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT + 'lh', { recursive: true });
const PW = process.env.SEED_USER_PASSWORD;
const MT = process.env.LMSTEST_MAINTENANCE_TOKEN;
const GH = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || 'EnaraAI/enara-staging-alpha';
const PHASES = (process.env.PHASES || 'env,public,login,pages,api,model,cold').split(',');
if (!PW) { console.log('SEED_USER_PASSWORD missing'); process.exit(1); }

function guardUrl(u) {
  const h = new URL(u).hostname;
  if (h === 'test.enara.app' || (h.endsWith('.enara.app') && !['lms-test.enara.app', 'design.enara.app', 'rt.enara.app'].includes(h))) throw new Error(`refused host ${h}`);
  return u;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const events = [];
const ev = (type, data = {}) => { const e = { at: now(), type, ...data }; events.push(e); appendFileSync(OUT + 'events.jsonl', JSON.stringify(e) + '\n'); };

// ---------- deploy awareness ----------
async function ghApi(path) {
  if (!GH) return null;
  const r = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json' } }).catch(() => null);
  return r?.ok ? r.json() : null;
}
async function deployRunning() {
  const runs = await ghApi(`/repos/${REPO}/actions/runs?status=in_progress&per_page=30`);
  if (!runs) return null;
  for (const run of runs.workflow_runs ?? []) {
    if (!/lms-e2e|LMS E2E|lms-deploy/i.test(`${run.name} ${run.path}`)) continue;
    const jobs = await ghApi(`/repos/${REPO}/actions/runs/${run.id}/jobs?per_page=50`);
    const j = (jobs?.jobs ?? []).find((x) => /Deploy, migrate/i.test(x.name) && x.status === 'in_progress');
    if (j) return { run: run.id, title: run.display_title?.slice(0, 80), started: j.started_at };
  }
  return null;
}
async function waitNoDeploy(label) {
  const t0 = Date.now(); let saw = false;
  for (;;) {
    const d = await deployRunning();
    if (!d) break;
    if (!saw) { log(`deploy running (${d.run}); waiting before ${label}`); ev('deploy_wait', { label, ...d }); saw = true; }
    if (Date.now() - t0 > 25 * 60_000) { ev('deploy_wait_gave_up', { label }); break; }
    await sleep(30_000);
  }
  if (saw) { await sleep(90_000); ev('deploy_wait_done', { label, waitedS: Math.round((Date.now() - t0) / 1000) }); }
}

// ---------- HTTP with timing ----------
// One https request with phase timings (dns, connect, tls, ttfb, total). keepAlive agent = warm connection; fresh agent = cold.
const warmAgent = new https.Agent({ keepAlive: true, maxSockets: 2 });
function timed(url, { method = 'GET', headers = {}, body, agent = warmAgent, timeoutMs = 70_000, onChunk } = {}) {
  guardUrl(url);
  return new Promise((resolve) => {
    const t0 = performance.now(); const tt = {}; const startAt = now();
    const req = https.request(url, { method, headers: { 'user-agent': 'enara-perf-measure/1', ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, agent, timeout: timeoutMs }, (res) => {
      tt.ttfb = performance.now() - t0;
      let size = 0; const chunks = [];
      res.on('data', (c) => { size += c.length; if (size < 2_000_000) chunks.push(c); onChunk?.(c, performance.now() - t0); });
      res.on('end', () => {
        const h = res.headers;
        resolve({ at: startAt, url: url.replace(LMS, '').replace(DESIGN, 'design:'), method, status: res.statusCode, ...round(tt), total: +(performance.now() - t0).toFixed(1), size,
          vercelId: h['x-vercel-id'] ?? null, vercelCache: h['x-vercel-cache'] ?? null, cfRay: h['cf-ray'] ?? null, serverTiming: h['server-timing'] ?? null,
          retryAfter: h['retry-after'] ?? null, reused: tt.reused ?? null, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('socket', (s) => {
      tt.reused = !s.connecting && !!s.encrypted && s.readyState === 'open';
      s.once('lookup', () => { tt.dns = performance.now() - t0; });
      s.once('connect', () => { tt.connect = performance.now() - t0; });
      s.once('secureConnect', () => { tt.tls = performance.now() - t0; });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ at: startAt, url: url.replace(LMS, ''), method, status: 0, error: String(e.message).slice(0, 80), total: +(performance.now() - t0).toFixed(1) }));
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(1) : v]));
const strip = (r) => { const { body, ...rest } = r; return rest; };

// ---------- accounts and pages ----------
const ACCOUNTS = [
  { key: 'kids', email: 'khaled.nasser@school.enara.app', lmsPath: '/', uiRole: 'student', design: '/#/kids' },
  { key: 'child', email: 'menna.osman@school.enara.app', lmsPath: '/', uiRole: 'student', design: '/#/student' },
  { key: 'adult', email: 'hassan.shaker@school.enara.app', lmsPath: '/', uiRole: 'student', design: '/#/student' },
  { key: 'parent', email: 'ghada.kim@school.enara.app', lmsPath: '/parents', uiRole: 'parent', design: '/#/parent' },
  { key: 'teacher', email: 'shahd.morsy@school.enara.app', lmsPath: '/', uiRole: 'admin', design: '/#/teacher' },
  { key: 'schooladmin', email: 'ahmed.anwar@school.enara.app', lmsPath: '/', uiRole: 'admin', design: '/#/school' },
  { key: 'platformadmin', email: 'mariam.shawky@school.enara.app', lmsPath: '/', uiRole: 'enara-admin', design: '/#/platform' },
];
const sessions = {}; // key -> { token, user } (memory only)

// ---------- phase: environment ----------
async function phaseEnv() {
  const trace = await fetch('https://www.cloudflare.com/cdn-cgi/trace').then((r) => r.text()).catch(() => '');
  const colo = /colo=(\w+)/.exec(trace)?.[1]; const loc = /loc=(\w+)/.exec(trace)?.[1];
  ev('runner', { cloudflareColo: colo, country: loc });
  const out = { runner: { cloudflareColo: colo, country: loc }, cold: [], warm: [] };
  for (const base of [LMS, DESIGN]) {
    for (let i = 0; i < 4; i++) {
      out.cold.push(strip(await timed(base + '/', { agent: new https.Agent({ keepAlive: false }) }))); await sleep(1500);
    }
    for (let i = 0; i < 4; i++) { out.warm.push(strip(await timed(base + (base === LMS ? '/health' : '/favicon.svg')))); await sleep(1500); }
  }
  writeFileSync(OUT + 'env.json', JSON.stringify(out, null, 1));
  log('env', colo, loc);
}

// ---------- Lighthouse ----------
let chrome, lighthouse, desktopConfig, pw, browserCdp;
async function startChrome() {
  const { launch } = require('chrome-launcher');
  lighthouse = (await import('lighthouse')).default;
  desktopConfig = (await import('lighthouse/core/config/desktop-config.js')).default;
  pw = require('playwright');
  chrome = await launch({ chromePath: process.env.CHROME_PATH || pw.chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run'] });
  browserCdp = await pw.chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
}
const BLOCK = ['*anam.ai*', '*elevenlabs.io*', '*rt.enara.app*', '*/api/avatar/session*', '*/api/avatar/query-stream*', '*/api/avatar/speak*', '*/messages/stream*', '*/api/speaking/*', '*/api/me/tutor/tts*'];
async function seedStorage(origin, entries) {
  const ctx = browserCdp.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(origin + '/favicon.svg', { timeout: 30_000 }).catch(() => {});
  await page.evaluate((e) => { localStorage.clear(); sessionStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, entries);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await page.close();
}
async function runLh(name, url, device, storage) {
  guardUrl(url);
  if (storage) await seedStorage(new URL(url).origin, storage);
  else { const ctx = browserCdp.contexts()[0]; const p = await ctx.newPage(); const c = await ctx.newCDPSession(p); await c.send('Network.clearBrowserCache'); await p.close(); }
  const flags = { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'], disableStorageReset: true, blockedUrlPatterns: BLOCK, maxWaitForLoad: 60_000 };
  const startedAt = now();
  let lhr;
  try { lhr = (await lighthouse(url, flags, device === 'desktop' ? desktopConfig : undefined))?.lhr; } catch (e) { ev('lh_error', { name, device, error: String(e.message).slice(0, 120) }); return null; }
  for (const k of ['screenshot-thumbnails', 'final-screenshot', 'full-page-screenshot']) delete lhr.audits[k];
  delete lhr.fullPageScreenshot; delete lhr.i18n;
  writeFileSync(`${OUT}lh/${name}--${device}.json`, JSON.stringify(lhr));
  const a = lhr.audits; const m = a.metrics?.details?.items?.[0] ?? {};
  const reqs = a['network-requests']?.details?.items ?? [];
  const api = reqs.filter((r) => /lms-test\.enara\.app\/(api|ready)/.test(r.url));
  const s = { name, device, url: url.replace(LMS, 'lms:').replace(DESIGN, 'design:'), startedAt, finalUrl: lhr.finalDisplayedUrl?.replace(LMS, 'lms:').replace(DESIGN, 'design:'), runtimeError: lhr.runtimeError?.code ?? null,
    fcp: a['first-contentful-paint']?.numericValue, lcp: a['largest-contentful-paint']?.numericValue, tti: a.interactive?.numericValue, tbt: a['total-blocking-time']?.numericValue, si: a['speed-index']?.numericValue,
    bytes: a['total-byte-weight']?.numericValue, requests: reqs.length, apiRequests: api.length,
    observed: { fcp: m.observedFirstContentfulPaint, lcp: m.observedLargestContentfulPaint, dcl: m.observedDomContentLoaded, load: m.observedLoad, lastVisualChange: m.observedLastVisualChange },
    renderBlocking: (a['render-blocking-resources']?.details?.items ?? []).map((i) => ({ url: i.url, wastedMs: i.wastedMs })),
    mainThreadMs: a['mainthread-work-breakdown']?.numericValue, bootupMs: a['bootup-time']?.numericValue,
    api: api.map((r) => ({ url: r.url.replace(LMS, ''), method: r.requestMethod ?? 'GET', status: r.statusCode, start: Math.round(r.networkRequestTime ?? r.rendererStartTime ?? 0), end: Math.round(r.networkEndTime ?? 0), bytes: r.transferSize })) };
  appendFileSync(OUT + 'pages.jsonl', JSON.stringify(s) + '\n');
  log(`LH ${name} ${device}: LCP ${Math.round(s.lcp)} TTI ${Math.round(s.tti)} obsLCP ${Math.round(s.observed.lcp ?? -1)} api ${s.apiRequests} ${s.runtimeError ?? ''}`);
  return s;
}

async function phasePublic() {
  await startChrome();
  for (let rep = 1; rep <= 2; rep++) for (const device of ['mobile', 'desktop']) {
    await waitNoDeploy('public lighthouse');
    await runLh(`public-lms-login-r${rep}`, LMS + '/', device);
    await sleep(5000);
    await runLh(`public-design-login-r${rep}`, DESIGN + '/#/login', device);
    await sleep(5000);
  }
}

// ---------- logins ----------
async function phaseLogin() {
  const out = [];
  for (const acc of ACCOUNTS) {
    await waitNoDeploy('login');
    const r = await timed(LMS + '/api/auth/login', { method: 'POST', body: { email: acc.email, password: PW } });
    let ok = false;
    try { const j = JSON.parse(r.body); if (j.token) { sessions[acc.key] = { token: j.token, user: j.user }; ok = true; } } catch { /* not json */ }
    out.push({ ...strip(r), account: acc.key, ok, uiMode: sessions[acc.key]?.user?.uiMode ?? null, role: sessions[acc.key]?.user?.role ?? null });
    log(`login ${acc.key}: ${r.status} ${r.total} ms`);
    await sleep(3000);
  }
  writeFileSync(OUT + 'logins.json', JSON.stringify(out, null, 1));
}

// ---------- authenticated pages ----------
async function phasePages() {
  if (!chrome) await startChrome();
  const reps = Number(process.env.PAGE_REPS || 1);
  for (let rep = 1; rep <= reps; rep++) for (const acc of ACCOUNTS) {
    const s = sessions[acc.key]; if (!s) continue;
    for (const device of ['mobile', 'desktop']) {
      await waitNoDeploy(`page ${acc.key}`);
      await runLh(`lms-${acc.key}-r${rep}`, LMS + acc.lmsPath, device, { enara_token: s.token, enara_user: JSON.stringify(s.user), enara_ui_role: acc.uiRole });
      await sleep(8000);
      await runLh(`design-${acc.key}-r${rep}`, DESIGN + acc.design + (acc.design.includes('?') ? '&' : '?') + 'lang=en', device, { enara_design_token: s.token });
      await sleep(8000);
    }
  }
}

// ---------- API sampling ----------
const KNOWN = {
  kids: ['/api/me/courses', '/api/me/assignments', '/api/me/assessments', '/api/me/achievements', '/api/me/study-plan', '/api/me/dashboard', '/api/learning/students/me/knowledge-map', '/api/credits', '/api/auth/session'],
  child: ['/api/auth/session', '/api/me/courses'], adult: ['/api/auth/session', '/api/me/tutor/sessions'],
  parent: ['/api/auth/session'], teacher: ['/api/auth/session'], schooladmin: ['/api/auth/session'], platformadmin: ['/api/auth/session'],
};
const SKIP = /\/api\/(avatar|speaking|maintenance|cron|demo\/(start|end|heartbeat)|me\/tutor\/(warm|tts|visualize)|me\/events)|\/messages|anam|elevenlabs/;
function endpointsFromPages() {
  const fs = require('node:fs');
  const lines = fs.existsSync(OUT + 'pages.jsonl') ? fs.readFileSync(OUT + 'pages.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const map = new Map(); // `${role} ${path}` -> {role, path}
  for (const p of lines) {
    const role = /^(lms|design)-(\w+)-r/.exec(p.name)?.[2]; if (!role) continue;
    for (const a of p.api) if (a.method === 'GET' && !SKIP.test(a.url)) map.set(`${role} ${a.url}`, { role, path: a.url, seenOn: p.name });
  }
  for (const [role, paths] of Object.entries(KNOWN)) for (const path of paths) if (![...map.values()].some((e) => e.role === role && e.path === path)) map.set(`${role} ${path}`, { role, path, seenOn: 'known' });
  // One role per path template is enough (the same template for other roles is kept only when the role differs in kind).
  return [...map.values()];
}
async function phaseApi() {
  const eps = endpointsFromPages().filter((e) => sessions[e.role]);
  // Cap total requests (~1,000): rounds scale with the number of endpoints.
  const rounds = Math.max(4, Math.min(8, Math.floor(1000 / (eps.length * 2))));
  log(`API sampling: ${eps.length} endpoints x ${rounds} rounds x 2 (spaced + immediate repeat)`);
  writeFileSync(OUT + 'endpoints.json', JSON.stringify(eps, null, 1));
  const seen = new Set();
  for (let r = 1; r <= rounds; r++) {
    await waitNoDeploy(`api round ${r}`);
    const queue = eps.map((e) => e);
    const worker = async () => {
      while (queue.length) {
        const e = queue.shift();
        const headers = { Authorization: `Bearer ${sessions[e.role].token}`, Accept: 'application/json' };
        const first = !seen.has(e.role + e.path); seen.add(e.role + e.path);
        const a = await timed(LMS + e.path, { headers });
        appendFileSync(OUT + 'api.jsonl', JSON.stringify({ ...strip(a), role: e.role, path: e.path, round: r, kind: first ? 'first' : 'spaced' }) + '\n');
        const b = await timed(LMS + e.path, { headers });
        appendFileSync(OUT + 'api.jsonl', JSON.stringify({ ...strip(b), role: e.role, path: e.path, round: r, kind: 'repeat' }) + '\n');
        await sleep(1200);
      }
    };
    await Promise.all([worker(), worker()]);
    log(`API round ${r} done`);
  }
}

// ---------- model time to first token ----------
async function phaseModel() {
  const out = { llmCheck: null, llmPing: [], tutorStream: [], drawing: null, avatarQueryStream: 'not run: needs a live avatar session (POST /api/avatar/session creates an Anam session token); live calls are forbidden' };
  await waitNoDeploy('model');
  if (MT) {
    const c = await timed(LMS + '/api/maintenance/llm-check', { headers: { Authorization: `Bearer ${MT}` }, timeoutMs: 180_000 });
    try { const j = JSON.parse(c.body); delete j.models; out.llmCheck = { status: c.status, total: c.total, ...j }; } catch { out.llmCheck = { status: c.status, total: c.total }; }
    log(`llm-check ${c.status} ${c.total}`);
    for (let i = 0; i < 3; i++) {
      await sleep(15_000);
      const p = await timed(LMS + '/api/maintenance/llm-ping', { method: 'POST', body: {}, headers: { Authorization: `Bearer ${MT}` }, timeoutMs: 120_000 });
      let j = {}; try { j = JSON.parse(p.body); } catch { /* */ }
      out.llmPing.push({ at: p.at, status: p.status, total: p.total, serverMs: j.ms ?? null, ok: j.ok ?? null });
    }
  }
  const s = sessions.adult;
  if (s) {
    const H = { Authorization: `Bearer ${s.token}`, Accept: 'application/json' };
    const created = await timed(LMS + '/api/me/tutor/sessions', { method: 'POST', headers: H, body: { title: 'perf check' } });
    let sid = null; try { const j = JSON.parse(created.body); sid = j.id ?? j.session?.id ?? j._id ?? null; } catch { /* */ }
    out.createSession = { status: created.status, total: created.total };
    const msgs = ['What is 7 times 8?', 'Can you explain what a noun is, in one sentence?', 'Is 51 a prime number?', 'What is the past tense of "go"?', 'How many sides does a hexagon have?'];
    for (const text of sid ? msgs : []) {
      await sleep(15_000);
      let firstToken = null, firstByte = null, buf = '';
      const r = await timed(LMS + `/api/me/tutor/sessions/${encodeURIComponent(sid)}/messages/stream`, {
        method: 'POST', headers: { ...H, Accept: 'text/event-stream' }, body: { text, context: {} }, timeoutMs: 120_000,
        onChunk: (c, t) => { if (firstByte === null) firstByte = t; buf += c.toString('utf8'); if (firstToken === null && /"type"\s*:\s*"(token|replace)"/.test(buf)) firstToken = t; },
      });
      const done = /"type"\s*:\s*"done"/.test(r.body ?? ''); const err = /"type"\s*:\s*"error"/.test(r.body ?? '');
      out.tutorStream.push({ at: r.at, status: r.status, headersMs: r.ttfb, firstChunkMs: firstByte && +firstByte.toFixed(0), firstTokenMs: firstToken && +firstToken.toFixed(0), totalMs: r.total, done, error: err, vercelId: r.vercelId });
      log(`tutor stream: status ${r.status} first token ${firstToken?.toFixed(0)} total ${r.total}`);
    }
    await sleep(15_000);
    const d = await timed(LMS + '/api/me/tutor/visualize', { method: 'POST', headers: H, body: { lessonTitle: 'Fractions: halves and quarters', prompt: 'Draw one half and one quarter of a circle.' }, timeoutMs: 90_000 });
    out.drawing = { at: d.at, status: d.status, headersMs: d.ttfb, totalMs: d.total, bytes: d.size };
    log(`drawing ${d.status} ${d.total}`);
  }
  writeFileSync(OUT + 'model.json', JSON.stringify(out, null, 1));
}

// ---------- cold starts ----------
async function probeSet(label) {
  const s = sessions.kids ?? Object.values(sessions)[0];
  const rows = [];
  rows.push({ label, probe: 'health', ...strip(await timed(LMS + '/health')) });
  rows.push({ label, probe: 'credits-noauth', ...strip(await timed(LMS + '/api/credits')) });
  if (s) rows.push({ label, probe: 'auth-session', ...strip(await timed(LMS + '/api/auth/session', { headers: { Authorization: `Bearer ${s.token}` } })) });
  if (s) rows.push({ label, probe: 'credits-auth', ...strip(await timed(LMS + '/api/credits', { headers: { Authorization: `Bearer ${s.token}` } })) });
  for (const r of rows) appendFileSync(OUT + 'cold.jsonl', JSON.stringify(r) + '\n');
  log(`probe ${label}: ${rows.map((r) => `${r.probe} ${r.status} ${r.total}`).join(' | ')}`);
}
async function phaseCold() {
  const idleMin = Number(process.env.IDLE_MIN || 11);
  for (let i = 1; i <= Number(process.env.IDLE_REPS || 2); i++) {
    await waitNoDeploy('cold');
    log(`idle ${idleMin} min (no requests from this run)`);
    ev('idle_start', { minutes: idleMin });
    await sleep(idleMin * 60_000);
    const d = await deployRunning(); ev('idle_end', { deployDuringIdle: d });
    await probeSet(`after-idle-${i}`);
    for (let k = 1; k <= 3; k++) { await sleep(2000); await probeSet(`warm-${i}-${k}`); }
  }
}

// ---------- run ----------
const t0 = Date.now();
ev('start', { phases: PHASES });
try {
  if (PHASES.includes('env')) await phaseEnv();
  if (PHASES.includes('public')) await phasePublic();
  if (PHASES.includes('login') || PHASES.includes('pages') || PHASES.includes('api') || PHASES.includes('model') || PHASES.includes('cold')) await phaseLogin();
  if (PHASES.includes('cold')) await probeSet('start');
  if (PHASES.includes('pages')) await phasePages();
  if (PHASES.includes('api')) await phaseApi();
  if (PHASES.includes('model')) await phaseModel();
  if (PHASES.includes('cold')) await phaseCold();
} catch (e) {
  ev('crash', { error: String(e?.stack ?? e).slice(0, 600) });
  console.log('crash', String(e?.message ?? e).slice(0, 200));
} finally {
  try { await browserCdp?.close(); } catch { /* */ }
  try { await chrome?.kill(); } catch { /* */ }
  ev('end', { minutes: +((Date.now() - t0) / 60000).toFixed(1) });
  writeFileSync(OUT + 'events.json', JSON.stringify(events, null, 1));
}
process.exit(0);
