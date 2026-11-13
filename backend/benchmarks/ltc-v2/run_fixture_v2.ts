// ENARA Language Teaching Benchmark — fixture v2 harness (ltb-fixture-v2).
//
// Derived from benchmarks/ltc-v1/run_trusted_age.ts (unchanged). Differences:
//   - reads fixture v2 records (build_fixture_v2.mjs): the lesson delivered to the
//     course includes languageSpec.items (exercise + next item), answers server-side;
//   - learner turns come from learnerScript (each with a declared target);
//   - every turn records RUNTIME parity: whether the tutor's actual system prompt
//     contained the item the learner is answering, and that no accepted answer of
//     an unanswered item appears in it;
//   - dry mode uses a scripted stand-in tutor that follows the engine's own
//     instructions (present the item it is told to present; confirm only when the
//     engine reports an answer-key match). Dry mode makes NO provider call and
//     proves the plumbing, not model quality.
//   - live mode is refused unless --authorized-paid-run is passed (not run in the
//     remediation task).
//   - r4.1: a case with "transport": "sse" is sent to the streaming route
//     (POST .../messages/stream); the streamed text, the stored text and marker
//     leakage are recorded per turn, and provider usage is read from the stream's
//     own message_start / message_delta events (cost attribution stays exact).
//
// Usage (from backend/): npx tsx benchmarks/ltc-v2/run_fixture_v2.ts --mode dry --cases <fixture_v2_cases.jsonl> --out <dir>

import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true');
}
const MODE = args.get('mode') ?? 'dry';
if (!['dry', 'live'].includes(MODE)) throw new Error('--mode dry|live');
const CAP = Number(args.get('cap') ?? '30');
const REPORT_DIR = args.get('out') ?? path.resolve(__dirname, '../../../docs/benchmarks/language-teaching/20261109-full-remediation/fixture_v2/dry_run');
if (MODE === 'live' && !args.has('authorized-paid-run')) throw new Error('live mode needs --authorized-paid-run (paid provider calls); not authorised in this task');
const CASES_FILE = args.get('cases') ?? path.resolve(__dirname, '../../../docs/benchmarks/language-teaching/20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl');
const OUT = path.join(REPORT_DIR, MODE === 'live' ? 'raw_results.jsonl' : 'dry_run_results.jsonl');
const ATTEMPTS_OUT = path.join(REPORT_DIR, MODE === 'live' ? 'provider_attempts.jsonl' : 'dry_run_attempts.jsonl');

type Case = {
  id: string; cohort: 'child' | 'teen' | 'adult'; cefr: string; caseType: string;
  learner: { grade: string; adultSchool: boolean; priorEvidence: null | { masteryStatus: string; misconception?: string } };
  lessonDelivered: null | { title: string; objective: string; spec: Record<string, any> };
  learnerScript: { turn: number; text: string; target: string }[];
  // Learning-outcome simulation: learner turns after the first are written by a learner model.
  simLearner?: { persona: string; turns: number; model?: string };
  transport?: 'json' | 'sse';
};

let cases: Case[] = readFileSync(CASES_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const lastSystem: { text: string } = { text: '' };
if (args.has('only')) { const only = new Set(args.get('only')!.split(',')); cases = cases.filter((c) => only.has(c.id)); }
if (args.has('limit')) cases = cases.slice(0, Number(args.get('limit')));

// ---------------------------------------------------------------- pricing ----
// Filled after the app modules load (the catalog is the repo's own).
let unitPrice: (model: string, unit: 'input_token' | 'output_token' | 'cache_read_token' | 'cache_write_token') => number | undefined = () => undefined;
const costOf = (model: string, u: Record<string, number | undefined>) => {
  const p = (unit: Parameters<typeof unitPrice>[1]) => unitPrice(model, unit);
  const parts = [
    [u.input_tokens, p('input_token')], [u.output_tokens, p('output_token')],
    [u.cache_read_input_tokens, p('cache_read_token')], [u.cache_creation_input_tokens, p('cache_write_token') ?? p('input_token')],
  ] as const;
  let usd = 0; let priced = true;
  for (const [n, price] of parts) { if (!n) continue; if (price === undefined) priced = false; else usd += n * price; }
  return { usd, priced };
};

// ------------------------------------------------------------ fetch layer ----
type Cursor = { caseId: string; turn: number; identifiers: string[] };
let cursor: Cursor | null = null;
let attemptSeq = 0;
let meteredUsd = 0;
const attempts: Record<string, unknown>[] = [];
const realFetch = globalThis.fetch.bind(globalThis);

// r4.1: provider usage of streamed responses, settled before each turn is recorded.
const pendingCosts: Promise<void>[] = [];
function sseUsage(text: string): Record<string, number> | null {
  let usage: Record<string, number> | null = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    let ev: { type?: string; message?: { usage?: Record<string, number> }; usage?: Record<string, number> };
    try { ev = JSON.parse(line.slice(6)); } catch { continue; }
    if (ev.type === 'message_start' && ev.message?.usage) usage = { ...ev.message.usage };
    if (ev.type === 'message_delta' && ev.usage) usage = { ...(usage ?? {}), ...Object.fromEntries(Object.entries(ev.usage).filter(([, v]) => typeof v === 'number')) };
  }
  return usage;
}
function drySse(body: ReturnType<typeof dryReply>): string {
  const text = body.content[0].text;
  const ev = (o: unknown) => `event: ${(o as { type: string }).type}\ndata: ${JSON.stringify(o)}\n\n`;
  const chunks = text.match(/[\s\S]{1,7}/g) ?? [];
  return [
    ev({ type: 'message_start', message: { ...body, content: [], usage: { input_tokens: 0, output_tokens: 0 } } }),
    ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ...chunks.map((c) => ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } })),
    ev({ type: 'content_block_stop', index: 0 }),
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } }),
    ev({ type: 'message_stop' }),
  ].join('');
}

function dryReply(body: { model?: string; system?: { text?: string }[] | string }) {
  const sys = Array.isArray(body.system) ? body.system.map((b) => b.text ?? '').join('\n') : String(body.system ?? '');
  const present = /Lesson item to present now: \[([\w-]+)\] (.+)/.exec(sys);
  const nextItem = /next present lesson item \[([\w-]+)\] exactly as written: (.+?)\.\n/.exec(sys);
  const keyMatch = sys.includes("matches the course's accepted answer");
  let text: string;
  if (present) text = `[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=${present[1]}]]\nDRY RUN. Here is your exercise: ${present[2]}`;
  else if (keyMatch && nextItem) text = `[[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NEW_ITEM item=${nextItem[1]}]]\nDRY RUN. Correct. Next: ${nextItem[2]}`;
  else if (keyMatch) text = '[[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]\nDRY RUN. Correct. Now write one sentence of your own with this pattern.';
  else text = '[[assess verdict=NOT_EVALUATED relevance=ACTIVE_ITEM next=SAME_ITEM]]\nDRY RUN. Look at your answer again and try once more.';
  return {
    id: `msg_dry_${attemptSeq}`, type: 'message', role: 'assistant', model: body.model ?? 'dry', stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const host = new URL(url).host;
  if (host !== 'api.anthropic.com') {
    // Isolation: the benchmark makes no other outbound calls.
    attempts.push({ kind: 'blocked_outbound', host, caseId: cursor?.caseId, at: new Date().toISOString() });
    throw new Error(`benchmark harness: outbound call to ${host} blocked`);
  }
  attemptSeq += 1;
  const id = `att-${String(attemptSeq).padStart(4, '0')}`;
  const raw = typeof init?.body === 'string' ? init.body : '';
  let req: { model?: string; max_tokens?: number; system?: { text?: string }[] | string; messages?: { content: unknown }[]; output_config?: unknown; stream?: boolean } = {};
  try { req = JSON.parse(raw); } catch { /* non-JSON body */ }
  const systemText = Array.isArray(req.system) ? req.system.map((b) => b.text ?? '').join('\n\n') : String(req.system ?? '');
  if (req.max_tokens === 4000) lastSystem.text = systemText;
  const leaks = (cursor?.identifiers ?? []).filter((v) => v && raw.toLowerCase().includes(v.toLowerCase()));
  const rec: Record<string, unknown> = {
    kind: 'provider_attempt', id, mode: MODE, caseId: cursor?.caseId ?? null, turn: cursor?.turn ?? null,
    path: new URL(url).pathname, modelRequested: req.model ?? null, maxTokens: req.max_tokens ?? null,
    outputConfig: req.output_config ?? null,
    systemSha256: createHash('sha256').update(systemText).digest('hex').slice(0, 16),
    systemChars: systemText.length, hasLtcBlock: systemText.includes('<language_teaching_context version="ltc-v1">'), streamed: Boolean(req.stream),
    identifierLeaks: leaks.length, startedAt: new Date().toISOString(),
  };
  const t0 = Date.now();
  if (MODE === 'dry') {
    const body = dryReply(req);
    Object.assign(rec, { status: 200, latencyMs: 0, modelServed: body.model, usage: body.usage, costUsd: 0, priced: true });
    attempts.push(rec);
    if (req.stream) return new Response(drySse(body), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': id } });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'request-id': id } });
  }
  try {
    const res = await realFetch(input as RequestInfo, init);
    const clone = res.clone();
    if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      // Streamed: usage arrives in the stream; settle it once the body ends.
      Object.assign(rec, { status: res.status, modelServed: req.model ?? 'unknown', requestId: res.headers.get('request-id'), usage: null, costUsd: null, priced: false });
      attempts.push(rec);
      pendingCosts.push(clone.text().then((text) => {
        const usage = sseUsage(text);
        const { usd, priced } = usage ? costOf(String(req.model), usage) : { usd: 0, priced: false };
        meteredUsd += usd;
        Object.assign(rec, { latencyMs: Date.now() - t0, usage, costUsd: Number(usd.toFixed(6)), priced: Boolean(usage) && priced });
      }, (error) => { Object.assign(rec, { streamReadError: (error as Error).name, priced: false }); }));
      return res;
    }
    let json: { model?: string; usage?: Record<string, number>; stop_reason?: string; error?: { type?: string } } = {};
    try { json = await clone.json(); } catch { /* streamed or empty */ }
    const served = json.model ?? req.model ?? 'unknown';
    const { usd, priced } = json.usage ? costOf(served, json.usage) : { usd: 0, priced: true };
    meteredUsd += usd;
    Object.assign(rec, {
      status: res.status, latencyMs: Date.now() - t0, modelServed: served, stopReason: json.stop_reason ?? null,
      usage: json.usage ?? null, costUsd: Number(usd.toFixed(6)), priced, errorType: json.error?.type ?? null,
      requestId: res.headers.get('request-id'),
    });
    attempts.push(rec);
    return res;
  } catch (error) {
    Object.assign(rec, { status: 'network_error', latencyMs: Date.now() - t0, error: (error as Error).name, costUsd: 0 });
    attempts.push(rec);
    throw error;
  }
}) as typeof fetch;

// ------------------------------------------------------ simulated learner --
// A small model plays the learner (persona: level, age band, starting habit). Its calls
// bypass the tutor attempt log but are metered against the same cap; dry mode is canned.
let learnerUsd = 0;
async function simLearnerTurn(persona: string, model: string, convo: { learner: string; reply: string | null }[]): Promise<string> {
  if (MODE === 'dry') return convo.length % 2 ? 'I think it is like this.' : 'OK, can I try again?';
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const c of convo) { messages.push({ role: 'assistant', content: c.learner }, { role: 'user', content: c.reply ?? '(no reply)' }); }
  messages.unshift({ role: 'user', content: '(The lesson starts. Write your first message.)' });
  // retry transient API/network failures (non-200 or non-JSON bodies) with backoff before giving up
  let j: { content?: { type: string; text?: string }[]; usage?: Record<string, number>; model?: string } | null = null;
  for (let attempt = 1; attempt <= 10 && !j; attempt += 1) {
    try {
      const res = await realFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 1500, output_config: { effort: 'low' }, system: persona, messages }),
      });
      const body = await res.text();
      if (res.ok) j = JSON.parse(body);
      else if (res.status === 400 || res.status === 404) throw Object.assign(new Error(`api ${res.status}`), { fatal: true });
    } catch (e) { if ((e as { fatal?: boolean }).fatal) throw e; }
    if (!j) await new Promise((r) => setTimeout(r, Math.min(120000, 3000 * 2 ** attempt)));
  }
  if (!j) throw new Error('API unavailable after 10 attempts');
  if (j.usage) { const { usd } = costOf(j.model ?? model, j.usage); learnerUsd += usd; meteredUsd += usd; }
  const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  if (!text) throw new Error('simulated learner returned no text');
  return text;
}

// --------------------------------------------------------------- the run ----
async function main() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongoose = (await import('mongoose')).default;
  const bcrypt = (await import('bcryptjs')).default;
  const request = (await import('supertest')).default;

  const mongo = await MongoMemoryServer.create();
  const keyFile = args.get('key-file');
  if (MODE === 'live' && (!keyFile || !existsSync(keyFile))) throw new Error('--key-file is required in live mode');
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'ltb-local-jwt-secret-32-characters-min', JWT_EXPIRES_IN: '2h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'ltb-local-hmac-secret-32-characters-min',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    ANTHROPIC_API_KEY: MODE === 'live' ? readFileSync(keyFile!, 'utf8').trim() : 'dry-run-not-a-key',
    // Local throwaway cap; lives only in the in-memory DB. Never the staging cap.
    AI_TEST_SPEND_CAP_USD: String(Math.max(CAP + 10, 1)), AI_TEST_SPEND_ID: 'ltb-v2-local',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED',
    'ANTHROPIC_TUTOR_MODEL', 'ANTHROPIC_TUTOR_EFFORT', 'ANTHROPIC_INTENT_MODEL', 'AZURE_SPEECH_KEY']) delete process.env[k];

  const { resetConfigForTests, getConfig } = await import('../../src/config/env');
  resetConfigForTests();
  const cat = await import('../../src/services/priceCatalog');
  unitPrice = (model, unit) => cat.unitPriceUsd('anthropic', model, unit);
  await mongoose.connect(mongo.getUri());
  const M: Record<string, any> = {};
  for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum', 'LearningObjective', 'StudentObjectiveMastery', 'StudentMisconception']) {
    M[name] = (await import(`../../src/models/${name}`))[name];
  }
  const app = (await import('../../src/app')).createApp();
  const cfg = getConfig();
  const runConfig = {
    benchmarkVersion: 'ltb-fixture-v2', harness: 'backend/benchmarks/ltc-v2/run_fixture_v2.ts (run_trusted_age.ts + delivered lesson items + runtime parity)', mode: MODE, startedAt: new Date().toISOString(),
    route: 'POST /api/me/tutor/sessions/:id/messages (real controller, in-process)',
    tutorModel: cfg.anthropicTutorModel, tutorEffort: cfg.anthropicTutorEffort, intentModel: cfg.anthropicIntentModel,
    maxOutputTokensTutor: 4000, sdkTimeoutMs: 25_000, gatewayMaxAttempts: 2, sdkMaxRetries: 0, concurrency: 1,
    harnessCapUsd: CAP, localTestSpendCapUsd: Math.max(CAP + 10, 1), casesFile: path.basename(CASES_FILE),
    casesSha256: createHash('sha256').update(readFileSync(CASES_FILE)).digest('hex'), caseCount: cases.length,
    turnCount: cases.reduce((n, c) => n + c.learnerScript.length, 0), database: 'mongodb-memory-server (throwaway, in-process)',
  };
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, MODE === 'live' ? 'run_config.json' : 'dry_run_config.json'), JSON.stringify(runConfig, null, 2));
  writeFileSync(OUT, '');
  writeFileSync(ATTEMPTS_OUT, '');
  const flushAttempts = () => { for (const a of attempts.splice(0)) appendFileSync(ATTEMPTS_OUT, JSON.stringify(a) + '\n'); };

  const PW = 'ltb-local-password-1';
  const hash = bcrypt.hashSync(PW, 4);
  let stopped: string | null = null;

  for (const [n, c] of cases.entries()) {
    if (MODE === 'live' && meteredUsd >= CAP) { stopped = `harness cap reached before ${c.id} ($${meteredUsd.toFixed(4)})`; break; }
    const k = String(n + 1).padStart(3, '0');
    const inst = `ltb-school-${k}`; const sid = `ltb-stu-${k}`; const email = `ltb-learner-${k}@bench.invalid`;
    const name = `Qorvath Benchlearner${k}`; // distinctive synthetic name, scanned for in every payload
    const curId = `ltb-cur-${k}`; const lessonId = `ltb-lsn-${k}`; const courseId = `ltb-crs-${k}`; const objId = `ltb-obj-${k}`;
    await M.Institution.create({
      id: inst, name: `Synthetic School ${k}`,
      features: { teaching_workflow_enabled: true, learning_intelligence_enabled: true, adaptive_pedagogy_enabled: true, mastery_tracking_enabled: true, misconception_detection_enabled: true },
      learningSettings: { adultLearners: false },
    });
    await M.Batch.create({ id: `ltb-b-${k}`, name: `Batch ${k}`, institutionId: inst, academicYear: '2026', studentCount: 1 });
    await M.Student.create({ id: sid, name, email, grade: c.learner.grade ?? '', institutionId: inst, batchId: `ltb-b-${k}` });
    await M.StudentCredit.create({ studentId: sid, institutionId: inst, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    await M.User.create({ email, password: hash, role: 'student', name, status: 'active', institutionId: inst, studentId: sid });
    const lesson = c.lessonDelivered ?? { title: 'General practice', objective: 'General English practice.', spec: undefined };
    await M.Curriculum.create({
      id: curId, name: `English ${c.cefr}`, institutionId: inst, courseName: `English ${c.cefr}`, type: 'Language', level: c.cefr, languages: ['English'],
      summary: `Synthetic English course, level ${c.cefr}.`, lastUpdated: '2026-11-09', status: 'deployed',
      chapters: [{ id: lessonId, title: lesson.title, description: lesson.objective, ...(lesson.spec ? { languageSpec: lesson.spec } : {}) }],
    });
    await M.CourseInstance.create({ id: `ltb-cls-${k}`, courseId, courseName: `English ${c.cefr}`, institutionId: inst, academicYear: '2026', batchId: `ltb-b-${k}`, curriculumId: curId, studentIds: [sid], instructorIds: [], visibility: 'student' });
    if (c.lessonDelivered) {
      await M.LearningObjective.create({ id: objId, institutionId: inst, curriculumId: curId, courseId, lessonIds: [lessonId], code: `LTB-${k}`, title: c.lessonDelivered.objective.slice(0, 200), status: 'approved' });
      const ev = c.learner.priorEvidence;
      if (ev) {
        const est = { emerging: 0.3, developing: 0.5, proficient: 0.8, mastered: 0.95 }[ev.masteryStatus] ?? null;
        await M.StudentObjectiveMastery.create({ institutionId: inst, studentId: sid, objectiveId: objId, masteryEstimate: est, evidenceStrength: 'moderate', masteryStatus: ev.masteryStatus, evidenceCount: 4, independentEvidenceCount: 3, distinctIndependentItems: 3, lastEvidenceAt: new Date(), lastMasteryUpdateAt: new Date(), modelVersion: 'ltb-fixture' });
        if (ev.misconception) {
          await M.StudentMisconception.create({ id: `ltb-mis-${k}`, institutionId: inst, studentId: sid, objectiveId: objId, ruleKey: 'ltb_fixture', category: 'grammar', description: ev.misconception, confidence: 0.7, status: 'confirmed', source: 'rule', detectedAt: new Date(), detectionVersion: 'ltb-fixture' });
        }
      }
    }
    // All synthetic learners share one local client address, so the app's IP-keyed
    // limiters (login) would treat 120 learners as one client. Each case stands for
    // a different learner, so the counters in the throwaway DB are cleared per case.
    await mongoose.connection.collection('rate_limits').deleteMany({});
    // Trusted-age fixture: a Workspace Admin of this synthetic school sets the band via the product API.
    const adminEmail = `ltb-admin-${k}@bench.invalid`;
    await M.User.create({ email: adminEmail, password: hash, role: 'admin', name: `Bench Admin ${k}`, status: 'active', institutionId: inst });
    const adminLogin = await request(app).post('/api/auth/login').send({ email: adminEmail, password: PW });
    const adminAuth = `Bearer ${adminLogin.body.token}`;
    const fixtureCall = c.cohort === 'adult'
      ? await request(app).put('/api/learning/settings').set('Authorization', adminAuth).send({ adultLearners: true })
      : await request(app).put(`/api/age-bands/classes/ltb-b-${k}`).set('Authorization', adminAuth).send({ ageBand: c.cohort });
    const fixtureAgeBand = { cohort: c.cohort, method: c.cohort === 'adult' ? 'PUT /api/learning/settings adultLearners=true' : `PUT /api/age-bands/classes/:batch ageBand=${c.cohort}`, httpStatus: fixtureCall.status };
    if (fixtureCall.status !== 200) throw new Error(`trusted-age fixture failed for ${c.id}: HTTP ${fixtureCall.status}`);
    await mongoose.connection.collection('rate_limits').deleteMany({});
    const login = await request(app).post('/api/auth/login').send({ email, password: PW });
    const auth = `Bearer ${login.body.token}`;
    const identifiers = [name, email, sid, inst, `Synthetic School ${k}`, String(login.body.user?.id ?? ''), adminEmail, `Bench Admin ${k}`, `ltb-b-${k}`].filter((v) => v.length > 3);
    const sess = await request(app).post('/api/me/tutor/sessions').set('Authorization', auth).send({ courseId, ...(c.lessonDelivered ? { lessonId } : {}), title: `Benchmark ${c.id}` });
    const sessionId = sess.body.id ?? sess.body.session?.id;
    const turns: Record<string, unknown>[] = [];
    const script = c.simLearner
      ? Array.from({ length: c.simLearner.turns }, (_, i) => c.learnerScript[i] ?? { turn: i + 1, text: '', target: 'simulated' })
      : c.learnerScript;
    for (const [t, step] of script.entries()) {
      const text = c.simLearner && t > 0
        ? await simLearnerTurn(c.simLearner.persona, c.simLearner.model ?? 'claude-haiku-5-5', turns.map((x) => ({ learner: String(x.learner), reply: (x.reply as string | null) ?? null })))
        : step.text;
      if (MODE === 'live' && meteredUsd >= CAP) { stopped = `harness cap reached in ${c.id} turn ${t}`; break; }
      cursor = { caseId: c.id, turn: t, identifiers };
      const before = attemptSeq;
      const t0 = Date.now();
      const sse = c.transport === 'sse';
      const r = sse
        ? await request(app).post(`/api/me/tutor/sessions/${sessionId}/messages/stream`).set('Authorization', auth)
          .send({ text, context: { courseId, ...(c.lessonDelivered ? { lessonId } : {}) } })
          .buffer(true).parse((res, cb) => { let d = ''; res.on('data', (x: Buffer) => { d += x.toString(); }); res.on('end', () => cb(null, d)); })
        : await request(app).post(`/api/me/tutor/sessions/${sessionId}/messages`).set('Authorization', auth)
          .send({ text, context: { courseId, ...(c.lessonDelivered ? { lessonId } : {}) } });
      await Promise.all(pendingCosts.splice(0));
      let ai = r.body?.assistantMessage;
      let stream: Record<string, unknown> | null = null;
      if (sse) {
        const raw = String(r.body ?? '');
        const evs = raw.split('\n\n').filter((b) => b.startsWith('data: ')).map((b) => { try { return JSON.parse(b.slice(6)); } catch { return { type: 'unparseable' }; } });
        const done = evs.find((e) => e.type === 'done');
        ai = done?.assistantMessage;
        const streamedText = evs.filter((e) => e.type === 'token').map((e) => e.delta).join('');
        const replaced = evs.find((e) => e.type === 'replace');
        stream = {
          eventTypes: evs.map((e) => e.type), tokenEvents: evs.filter((e) => e.type === 'token').length,
          streamedChars: streamedText.length, replaced: Boolean(replaced),
          streamedEqualsStored: (replaced ? replaced.text : streamedText.trim()) === (ai?.text ?? null),
          markerInStream: /\[\[assess|verdict=/i.test(streamedText + (replaced?.text ?? '')),
          errorEvent: evs.find((e) => e.type === 'error') ?? null,
        };
      }
      // Runtime parity: what the tutor actually received for this turn.
      const items: { id: string; prompt: string; acceptedAnswers?: string[] }[] = c.lessonDelivered?.spec?.items ?? [];
      const target = step.target.startsWith('lesson_item:') ? items.find((x) => x.id === step.target.slice(12)) : undefined;
      const sys = lastSystem.text;
      const answersInPrompt = items.flatMap((x) => (x.acceptedAnswers ?? []).filter((a) => a.split(' ').length > 1 && sys.includes(a)));
      const runtimeParity = {
        target: step.target,
        tutorSawTarget: target ? sys.includes(target.prompt) : step.target !== 'unseen_exercise',
        acceptedAnswersInSystemPrompt: answersInPrompt,
        activeItemBefore: ai?.meta?.languageTurn?.activeItemBefore ?? null,
        keyVerdict: ai?.meta?.languageTurn?.keyVerdict ?? null,
        presentedLessonItemId: ai?.meta?.languageTurn?.presentedLessonItemId ?? null,
        markerStatus: ai?.meta?.languageTurn?.markerStatus ?? null,
        markerInVisibleReply: /\[\[assess/i.test(ai?.text ?? ''),
      };
      const turnAttempts = attempts.filter((a) => a.kind === 'provider_attempt' && Number(String(a.id).slice(4)) > before);
      turns.push({
        turn: t, learner: text, runtimeParity, httpStatus: r.status, latencyMs: Date.now() - t0, reply: ai?.text ?? null,
        transport: sse ? 'sse' : 'json', ...(stream ? { stream } : {}),
        replyVersion: ai?.meta?.version ?? null, languageTurn: ai?.meta?.languageTurn ?? null,
        teaching: ai?.meta?.teaching ?? null,
        attemptIds: turnAttempts.map((a) => a.id), attempts: turnAttempts.length,
        tutorAttempt: turnAttempts.filter((a) => a.maxTokens === 4000).map((a) => ({ id: a.id, status: a.status, modelServed: a.modelServed, hasLtcBlock: a.hasLtcBlock, identifierLeaks: a.identifierLeaks, systemSha256: a.systemSha256 })),
        errorCode: r.status >= 400 ? r.body?.error?.code ?? r.body?.code ?? null : null,
      });
      cursor = null;
      flushAttempts();
    }
    const rec = { caseId: c.id, cohort: c.cohort, cefr: c.cefr, caseType: c.caseType, sessionCreated: sess.status, loginStatus: login.status, fixtureAgeBand, turns, meteredUsdAfter: Number(meteredUsd.toFixed(6)) };
    appendFileSync(OUT, JSON.stringify(rec) + '\n');
    const summary = turns.map((x) => `${x.httpStatus}/${(x.languageTurn as { moves?: string[] } | null)?.moves?.join('+') ?? '-'}`).join(' | ');
    console.log(`${c.id} ${summary} $${meteredUsd.toFixed(4)}`);
    if (stopped) break;
  }
  flushAttempts();
  const done = { finishedAt: new Date().toISOString(), meteredUsd: Number(meteredUsd.toFixed(6)), providerAttempts: attemptSeq, simulatedLearnerUsd: Number(learnerUsd.toFixed(6)), stopped };
  writeFileSync(path.join(REPORT_DIR, MODE === 'live' ? 'run_status.json' : 'dry_run_status.json'), JSON.stringify(done, null, 2));
  console.log('done', JSON.stringify(done));
  await mongoose.disconnect();
  await mongo.stop({ doCleanup: true, force: true });
}

main().catch((e) => { console.error('ERR', (e as Error).message); process.exit(1); });
