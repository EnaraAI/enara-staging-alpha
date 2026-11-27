// Expressive avatar (live tutor item 5): screenshots of the live tutor's face for the owner, on lms-test.enara.app ONLY.
// A seed learner signs in (the shared seed password from the GitHub secret SEED_USER_PASSWORD), opens the real live call
// in Google Chrome, and speaks scripted turns with a synthetic voice (Piper) through a fake microphone. About 1 s after
// each cue the avatar's video frame is saved as <who>--<moment>--<on|off>.png. "on"/"off" is a per-call test override
// (X-Enara-Expressive-Test) that the server honours only with the CI token, which Playwright adds to the call-start
// request: the page never holds it. test.enara.app is frozen: every URL goes through assertSiteUrl (lms-test only).
// Secrets and tokens are never printed or written.
//
//   node shots.mjs            plan.json decides: mode "dry" (sign in, open the call screen, no call) or "calls"
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, assertSiteUrl } from '../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.EXPR_OUT || join(HERE, 'out');
const plan = JSON.parse(readFileSync(join(HERE, 'plan.json'), 'utf8'));
const PW = process.env.SEED_USER_PASSWORD;
const CI_TOKEN = process.env.LMSTEST_MAINTENANCE_TOKEN;
for (const d of ['shots', 'audio', 'tts', 'debug']) mkdirSync(join(OUT, d), { recursive: true });
const log = (...a) => console.log(...a);
const summary = (s) => { log(s); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (t) => String(t).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '<jwt>').replace(/[A-Za-z0-9+/_=-]{40,}/g, '<long>');

async function site(path, init = {}) {
  return fetch(assertSiteUrl(`${SITE}${path}`), { redirect: 'manual', ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 60_000) });
}
async function login(email) {
  const r = await site('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.token ? { token: j.token, user: j.user } : { status: r.status, code: j.code ?? j.error?.code ?? null };
}
const get = (token, path) => site(path, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// ---------- learner speech (Piper, on demand)
let tts;
function startTts() {
  if (tts) return tts;
  const proc = spawn('python', [join(HERE, 'tts.py'), process.env.PIPER_VOICES || join(HERE, 'voices')], { stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = [];
  createInterface({ input: proc.stdout }).on('line', (l) => waiting.shift()?.(l));
  tts = (text, voice, out) => new Promise((resolve) => { waiting.push(resolve); proc.stdin.write(`${JSON.stringify({ text, voice, out })}\n`); });
  tts.close = () => proc.stdin.end();
  return tts;
}
let ttsN = 0;
async function speech(text, voice) {
  const out = join(OUT, 'tts', `u${++ttsN}.wav`);
  await startTts()(text, voice, out);
  return readFileSync(out).toString('base64');
}

// ---------- what the learner says next: depends on the tutor's last question (right / wrong answers)
const IRREGULAR_PAST = { go: 'went', see: 'saw', have: 'had', eat: 'ate', get: 'got', make: 'made', take: 'took', come: 'came', buy: 'bought', swim: 'swam', write: 'wrote', run: 'ran', do: 'did', be: 'was', visit: 'visited', drink: 'drank', read: 'read', meet: 'met', sleep: 'slept', play: 'played', watch: 'watched' };
function third(v) {
  const w = v.toLowerCase();
  if (w === 'be') return 'is';
  if (w === 'have') return 'has';
  if (/(s|sh|ch|x|z|o)$/.test(w)) return `${w}es`;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}
const past = (v) => IRREGULAR_PAST[v.toLowerCase()] ?? (v.endsWith('e') ? `${v}d` : `${v}ed`);
const wrongPast = (v) => (IRREGULAR_PAST[v.toLowerCase()] ? (v.endsWith('e') ? `${v}d` : `${v}ed`) : v);
export function answers(question) {
  const q = String(question || '');
  const isPast = /\bpast\b|yesterday|last (week|summer|year|night|weekend)|\bago\b/i.test(q);
  // "Complete: He ___ (get) up at seven."
  const gap = /([A-Z][^.?!"“”:]*?)_{2,}\s*\(([a-zA-Z]+)\)([^.?!"“”]*[.?!]?)/.exec(q);
  if (gap) {
    const [, before, verb, after] = gap;
    const fill = (f) => `${before}${f}${after}`.replace(/\s+/g, ' ').trim();
    return isPast ? { right: fill(past(verb)), wrong: fill(wrongPast(verb)) } : { right: fill(third(verb)), wrong: fill(verb) };
  }
  // 'Correct the verb: "She go to bed at ten."'
  const quoted = /["“]([^"”]{6,80})["”]/.exec(q);
  if (quoted && /correct|fix|mistake|wrong/i.test(q)) {
    const s = quoted[1];
    const fixed = s.replace(/\b(he|she|it|my \w+|his \w+|her \w+)\s+([a-z]+)\b/i, (m, subj, verb) => `${subj} ${/s$/.test(verb) ? verb : third(verb)}`);
    return { right: fixed, wrong: s };
  }
  if (isPast) return { right: 'Yesterday I went to the park and I saw my friend.', wrong: 'Yesterday I go to the park and I see my friend.' };
  return { right: 'She gets up at seven and she goes to school.', wrong: 'She get up at seven and she go to school.' };
}

// ---------- the in-page fake microphone, remote-audio recorder and frame grabber (added before the app loads)
const INIT = () => {
  const ctx = new AudioContext({ sampleRate: 48000 });
  const dest = ctx.createMediaStreamDestination();
  const noise = ctx.createBufferSource();
  const nb = ctx.createBuffer(1, 96000, 48000);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.0005;
  noise.buffer = nb; noise.loop = true; noise.connect(dest); noise.start();
  const md = navigator.mediaDevices;
  md.getUserMedia = async (c) => {
    if (c && c.video) throw new DOMException('no camera', 'NotFoundError');
    await ctx.resume();
    return new MediaStream(dest.stream.getAudioTracks().map((t) => t.clone()));
  };
  md.enumerateDevices = async () => [{ deviceId: 'fake-mic', kind: 'audioinput', label: 'Synthetic learner', groupId: 'g', toJSON() { return this; } }];
  window.__learnerSay = async (b64) => {
    await ctx.resume();
    const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const buf = await ctx.decodeAudioData(bin.buffer);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(dest);
    await new Promise((r) => { src.onended = r; src.start(); });
    return Math.round(buf.duration * 1000);
  };
  // The tutor's voice (remote audio track) for a short recording of each reply.
  window.__remoteAudio = [];
  const RPC = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) {
    const pc = new RPC(...a);
    pc.addEventListener('track', (e) => { if (e.track.kind === 'audio') window.__remoteAudio.push(e.track); });
    return pc;
  };
  window.RTCPeerConnection.prototype = RPC.prototype;
  let rec = null; let chunks = [];
  window.__recStart = () => {
    const track = window.__remoteAudio.filter((t) => t.readyState === 'live').at(-1);
    if (!track) return false;
    chunks = [];
    rec = new MediaRecorder(new MediaStream([track]), { mimeType: 'audio/webm' });
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start(250);
    return true;
  };
  window.__recStop = () => new Promise((resolve) => {
    if (!rec) return resolve(null);
    rec.onstop = async () => { const b = new Blob(chunks, { type: 'audio/webm' }); const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); resolve(btoa(s)); };
    rec.stop(); rec = null;
  });
  window.__grabFrame = () => {
    const v = document.getElementById('enara-anam-video');
    if (!v || !v.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  };
  try { localStorage.setItem('enara.relay', 'off'); } catch { /* storage blocked */ }
};

// ---------- navigation to the live call screen (real UI)
async function buttons(page) { return (await page.getByRole('button').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60); }
async function clickOne(page, label, locators, timeout = 20_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    for (const l of locators) {
      const el = l.first();
      if (await el.isVisible().catch(() => false)) { await el.click(); log(`  click ${label}`); await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined); return true; }
    }
    // lms-test can be slow to load a page: press its own "Try again" / "Retry".
    const retry = page.getByRole('button', { name: /^(Try again|Retry)$/ }).first();
    if (await retry.isVisible().catch(() => false)) { log(`  retry (page failed to load) while waiting for ${label}`); await retry.click().catch(() => undefined); await sleep(3000); }
    await sleep(500);
  }
  log(`  no ${label}; buttons: ${JSON.stringify(await buttons(page))}`);
  return false;
}
async function snap(page, name) { await page.screenshot({ path: join(OUT, 'debug', `${name}.png`) }).catch(() => undefined); }
async function skipTour(page) {
  const tour = page.getByRole('button', { name: /Skip tour|تخطّ/ });
  if (await tour.first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await tour.first().dispatchEvent('click');
}
const LESSON_PREF = [/routine/i, /family/i, /greeting/i];
async function openCallScreen(page, who, app) {
  await page.goto(`${SITE}/`, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => undefined);
  await skipTour(page);
  await snap(page, `${who}-1-home`);
  if (app === 'kids') {
    await clickOne(page, 'learning tab', [page.getByRole('button', { name: /^(Learning|My learning|Lessons|Learn)$/i }), page.getByRole('link', { name: /Learning|Lessons/i }), page.getByRole('tab', { name: /Learning|Lessons/i })]);
    await snap(page, `${who}-2-learning`);
    // Courses and lessons can take a while to load on lms-test.
    // The English course card's "Keep going" (not the EN/English language button).
    await clickOne(page, 'English course', [page.locator('article, li, section, div').filter({ hasText: /English\s*[–-]\s*Grade/ }).getByRole('button', { name: /Keep going|Start/ })], 90_000);
    await snap(page, `${who}-3-course`);
    // The lesson map's lessons are not buttons: click the lesson's title (else "Continue: <next lesson>").
    // The lesson's round button sits next to its title (the title itself is not clickable); else "Continue: <next lesson>".
    const lessonButton = (re) => page.getByText(re).first().locator('xpath=ancestor::*[.//button][1]//button').first();
    if (!(await clickOne(page, 'lesson', [...LESSON_PREF.map(lessonButton), page.getByRole('button', { name: /^Continue/ })], 90_000))) await clickOne(page, 'first lesson', [page.locator('.ek-lessonmap button, [class*=lesson] button')]);
    await snap(page, `${who}-4-lesson`);
    if (!(await clickOne(page, 'Ask Enara about this lesson', [page.getByRole('button', { name: /Ask Enara about this (lesson|video)/ })], 60_000))) await clickOne(page, 'Ask Enara', [page.getByRole('button', { name: /Ask Enara/ })]);
    await snap(page, `${who}-5-drawer`);
    await clickOne(page, 'Talk live', [page.getByRole('button', { name: /Talk live/ })], 30_000);
  } else {
    await clickOne(page, 'My learning', [page.getByRole('button', { name: 'My learning', exact: true }), page.getByRole('link', { name: 'My learning' })]);
    await snap(page, `${who}-2-learning`);
    await clickOne(page, 'English course', [page.getByRole('button', { name: /English/ })], 90_000);
    await snap(page, `${who}-3-course`);
    await clickOne(page, 'lesson', LESSON_PREF.map((re) => page.getByRole('button', { name: re })), 60_000);
    await snap(page, `${who}-4-lesson`);
    await clickOne(page, 'Live AI Tutor', [page.getByRole('button', { name: /Live AI Tutor/ })], 30_000);
  }
  await snap(page, `${who}-6-modal`);
  // The first time, the face picker opens by itself: keep the school's tutor.
  await clickOne(page, 'face picker: skip', [page.getByRole('button', { name: /Skip for now/ })], 4000);
  const start = page.getByRole('button', { name: 'Start call' });
  const ok = await start.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false);
  await snap(page, `${who}-7-start`);
  return ok;
}

// ---------- one real call
const MOMENTS = [
  { id: 'new-question', say: () => 'Hello. Can you give me one short question about this lesson, please?' },
  { id: 'wrong', say: (q) => answers(q).wrong },
  { id: 'stuck1', say: () => "I don't know." },
  { id: 'stuck2', say: () => "I don't know. I am confused." },
  { id: 'right', say: (q) => answers(q).right },
  { id: 'drawing', say: () => 'Can you draw a picture for me, please?' },
];

async function oneCall(browser, spec) {
  const { who, expressive } = spec;
  const learner = plan.learners[who];
  const tag = `${who}--${expressive}`;
  const result = { who, expressive, email: null, start: null, turns: [], errors: [] };
  let auth = null;
  for (const email of [learner.email, ...(learner.fallback ?? [])]) { auth = await login(email); if (auth.token) { result.email = email; break; } result.errors.push(`login ${email.split('@')[0]} ${auth.status} ${auth.code}`); }
  if (!auth?.token) return result;
  result.learner = { role: auth.user?.role, uiMode: auth.user?.uiMode ?? null };
  await site('/api/auth/tour/complete', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } }).catch(() => undefined);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, permissions: ['microphone'] });
  await context.addInitScript(([token, user]) => {
    for (const store of [localStorage, sessionStorage]) { try { store.setItem('enara_token', token); store.setItem('enara_user', JSON.stringify({ ...user, tourPending: false })); store.setItem('enara_ui_role', 'student'); } catch { /* blocked */ } }
  }, [auth.token, auth.user]);
  await context.addInitScript(INIT);
  const page = await context.newPage();
  page.on('pageerror', (e) => result.errors.length < 30 && result.errors.push(`pageerror ${mask(e.message).slice(0, 200)}`));
  // The CI-only per-call override, on the call start only (the page never sees the token).
  await page.route('**/api/avatar/session', async (route) => {
    if (route.request().method() !== 'POST' || plan.mode !== 'calls') return route.continue();
    return route.continue({ headers: { ...route.request().headers(), 'x-enara-expressive-test': expressive, 'x-enara-ci-token': CI_TOKEN } });
  });
  const replies = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (u.endsWith('/api/avatar/session') && r.request().method() === 'POST') {
      const j = await r.json().catch(() => null);
      result.start = j ? { status: r.status(), speech: j.speech, expressive_test: j.expressive_test ?? null, features: j.features ?? null } : { status: r.status() };
    }
    if (u.endsWith('/api/avatar/query-stream')) {
      const lines = (await r.text().catch(() => '')).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
      replies.push({ at: Date.now(), cues: lines.filter((l) => l.cue).map((l) => l.cue), drawing: lines.some((l) => l.visual === 'drawing'), text: lines.filter((l) => l.content).map((l) => l.content).join('') });
    }
  });
  try {
    if (!(await openCallScreen(page, tag, learner.app))) { result.errors.push('no Start call button'); return result; }
    if (plan.mode !== 'calls') return result;
    await page.getByRole('button', { name: 'Start call' }).click();
    // Connected: the face is moving.
    const connected = await page.waitForFunction(() => { const v = document.getElementById('enara-anam-video'); return v && v.videoWidth > 0 && v.currentTime > 0.5; }, null, { timeout: 60_000 }).then(() => true, () => false);
    await snap(page, `${tag}-8-connected`);
    if (!connected) { result.errors.push('video did not start'); return result; }
    await sleep(1500);
    await saveFrame(page, `${who}--idle--${expressive}`);
    const frame = page.getByTestId('live-avatar-frame');
    let lastQuestion = '';
    for (const m of MOMENTS) {
      const text = m.say(lastQuestion);
      const turn = { moment: m.id, said: text };
      const before = { replies: replies.length, persona: await frame.getAttribute('data-persona-turn').catch(() => null), done: await frame.getAttribute('data-persona-done').catch(() => null) };
      turn.speechMs = await page.evaluate((b64) => window.__learnerSay(b64), await speech(text, learner.voice));
      // The reply starts speaking (the video tutor's own event), whatever ENARA sent.
      const started = await page.waitForFunction((prev) => { const el = document.querySelector('[data-testid="live-avatar-frame"]'); return el && el.dataset.personaTurn && el.dataset.personaTurn !== prev; }, before.persona, { timeout: 30_000 }).then(() => true, () => false);
      turn.started = started;
      await page.evaluate(() => window.__recStart()).catch(() => false);
      await sleep(1000);
      await saveFrame(page, `${who}--${m.id}--${expressive}`);
      turn.cueSent = await frame.getAttribute('data-cue-sent').catch(() => null);
      turn.cueApplied = await frame.getAttribute('data-cue-applied').catch(() => null);
      turn.personaCue = await frame.getAttribute('data-persona-turn').catch(() => null);
      if (m.id === 'drawing') { await sleep(1500); await page.screenshot({ path: join(OUT, 'shots', `${who}--drawing-panel--${expressive}.png`) }); }
      // A second cue in the same reply (stuck: concerned, then supportive): one more frame ~1 s after Anam applies it.
      // Stuck: a second cue in the same reply (concerned, then supportive): one more frame ~1 s after Anam applies it
      // (switch off: the same moment, about 3 s into the reply).
      if (/^stuck/.test(m.id)) {
        const second = expressive === 'on' && await page.waitForFunction((prev) => { const el = document.querySelector('[data-testid="live-avatar-frame"]'); return el && el.dataset.cueApplied && el.dataset.cueApplied !== prev && /^supportive@/.test(el.dataset.cueApplied); }, turn.cueApplied, { timeout: 8000 }).then(() => true, () => false);
        await sleep(second ? 1000 : 2000);
        await saveFrame(page, `${who}--${m.id}-then--${expressive}`);
        turn.secondCueApplied = second;
      }
      await page.waitForFunction((prev) => { const el = document.querySelector('[data-testid="live-avatar-frame"]'); return el && el.dataset.personaDone && el.dataset.personaDone !== prev; }, before.done, { timeout: 30_000 }).catch(() => undefined);
      const audio = await page.evaluate(() => window.__recStop()).catch(() => null);
      if (audio) writeFileSync(join(OUT, 'audio', `${who}--${m.id}--${expressive}.webm`), Buffer.from(audio, 'base64'));
      const reply = replies.slice(before.replies).at(-1);
      Object.assign(turn, { cues: reply?.cues ?? [], drawingLine: reply?.drawing ?? false, reply: reply?.text?.slice(0, 400) ?? null });
      if (reply?.text) lastQuestion = reply.text;
      result.turns.push(turn);
      log(`  ${tag} ${m.id}: said "${text}" cues=${JSON.stringify(turn.cues)} applied=${turn.cueApplied} reply="${(turn.reply ?? '').slice(0, 100)}"`);
      await sleep(800);
    }
  } catch (e) {
    result.errors.push(`harness ${mask(e?.message ?? e).slice(0, 200)}`);
  } finally {
    // End the call the way the learner would (close), so Anam stops at once.
    await page.locator('.fixed.inset-0 button').filter({ has: page.locator('svg.lucide-x') }).first().click({ timeout: 5000 }).catch(() => undefined);
    await sleep(2000);
    await context.close().catch(() => undefined);
  }
  return result;
}

async function saveFrame(page, name) {
  const b64 = await page.evaluate(() => window.__grabFrame()).catch(() => null);
  if (b64) writeFileSync(join(OUT, 'shots', `${name}.png`), Buffer.from(b64, 'base64'));
  else await page.locator('#enara-anam-video').screenshot({ path: join(OUT, 'shots', `${name}.png`) }).catch(() => undefined);
}

// ---------- dry checks: sign-ins, the Arabic/English voices in use, the call screen (no call)
async function dry(browser) {
  const admin = await login(plan.admin);
  if (admin.token) {
    const v = await get(admin.token, '/api/avatar/admin/voices');
    const voices = (v.body?.inUse ?? []).map((x) => ({ use: x.use, name: x.name, provider: x.provider ?? null, model: x.model ?? null, country: x.country ?? null }));
    summary(`VOICES ${v.status} ${JSON.stringify(voices)}`);
    writeFileSync(join(OUT, 'voices.json'), JSON.stringify(voices, null, 1));
  } else summary(`admin login ${admin.status} ${admin.code}`);
  for (const email of plan.dryCheck ?? []) {
    const a = await login(email);
    summary(`LEARNER ${email.split('@')[0]} login=${a.token ? 'ok' : a.status} role=${a.user?.role ?? '-'} uiMode=${a.user?.uiMode ?? '-'} ageBand=${a.user?.learnerAgeBand ?? '-'}`);
  }
  // Which Arabic voice a child's call gets and whether it can be slowed: start a call (a token only, never connected) and end it.
  for (const lang of plan.voiceProbe ?? []) {
    const a = await login(plan.learners.child.email);
    if (!a.token) continue;
    const r = await site('/api/avatar/session', { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json', 'x-enara-expressive-test': 'on', 'x-enara-ci-token': CI_TOKEN }, body: JSON.stringify({ preferred_language: lang }) });
    const j = await r.json().catch(() => ({}));
    summary(`VOICE_PROBE ${lang} ${r.status} ${JSON.stringify(j.expressive_test ?? null)}`);
    if (j.session_id) await site(`/api/avatar/session/${encodeURIComponent(j.session_id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${a.token}` } }).catch(() => undefined);
  }
  const out = [];
  for (const who of Object.keys(plan.learners)) out.push(await oneCall(browser, { who, expressive: 'on' }));
  return out;
}

async function main() {
  if (!PW) throw new Error('SEED_USER_PASSWORD is not set');
  if (!CI_TOKEN) throw new Error('LMSTEST_MAINTENANCE_TOKEN is not set');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.EXPR_BROWSER_CHANNEL || 'chrome',
    args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  let results;
  try {
    if (plan.mode === 'calls') {
      if ((plan.callsUsed ?? 0) > plan.maxCalls) throw new Error(`call budget: ${plan.callsUsed} used of ${plan.maxCalls}`);
      if ((plan.callsUsed ?? 0) + plan.run.length > plan.maxCalls) throw new Error('this run would pass the call budget');
      results = [];
      for (const spec of plan.run) {
        log(`CALL ${spec.who} ${spec.expressive}`);
        results.push(await oneCall(browser, spec));
        await sleep(3000);
      }
    } else results = await dry(browser);
  } finally {
    await browser.close().catch(() => undefined);
    tts?.close?.();
  }
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  for (const r of results) summary(`RESULT ${r.who} ${r.expressive} email=${r.email?.split('@')[0] ?? '-'} start=${JSON.stringify(r.start)} turns=${r.turns.length} errors=${JSON.stringify(r.errors)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { log(`FAILED: ${mask(e?.message ?? e).slice(0, 300)}`); process.exitCode = 1; });
}
