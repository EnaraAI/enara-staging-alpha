// ENARA Language Teaching Benchmark v1.0 — tutor harness.
//
// Runs the frozen benchmark cases through the REAL tutor route
// (POST /api/me/tutor/sessions/:id/messages) of this backend, in-process,
// against a throwaway in-memory MongoDB. Every fixture is synthetic and
// created per case (one school, one learner, one course each). No staging,
// production or real-school data is touched.
//
// Every provider attempt is captured at the fetch layer (status, model asked
// and served, usage, latency, a hash of the system prompt, and a scan of the
// whole request for the synthetic learner's identifiers). Cost is computed
// from the provider's own usage numbers and the repo's price catalog.
//
// Budget control (three layers):
//   1. harness hard stop: no new turn starts once metered cost >= --cap;
//   2. the app's own test-spend cap (AI_TEST_SPEND_CAP_USD) in the throwaway DB;
//   3. one gateway retry at most (maxAttempts: 2, production setting).
//
// Usage (from backend/):
//   npx tsx benchmarks/ltc-v1/run.ts --mode dry  --limit 3
//   npx tsx benchmarks/ltc-v1/run.ts --mode live --cap 30 --key-file <path>
// Options: --only ID[,ID] --limit N --out DIR --cases FILE
// The key file is read into this process only; it is never printed or written.

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
const REPORT_DIR = args.get('out') ?? path.resolve(__dirname, '../../../docs/benchmarks/language-teaching/20261109T-ltb-v1.0');
const CASES_FILE = args.get('cases') ?? path.join(REPORT_DIR, 'benchmark_cases.jsonl');
const OUT = path.join(REPORT_DIR, MODE === 'live' ? 'raw_results.jsonl' : 'dry_run_results.jsonl');
const ATTEMPTS_OUT = path.join(REPORT_DIR, MODE === 'live' ? 'provider_attempts.jsonl' : 'dry_run_attempts.jsonl');

type Case = {
  id: string; cohort: 'child' | 'teen' | 'adult'; cefr: string; caseType: string;
  learner: { grade: string; adultSchool: boolean; priorEvidence: null | { masteryStatus: string; misconception?: string } };
  lesson: null | { title: string; objective: string; spec: Record<string, unknown> };
  turns: string[];
};

let cases: Case[] = readFileSync(CASES_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
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

function dryReply(body: { model?: string; messages?: { content: unknown }[] }) {
  const last = JSON.stringify(body.messages?.at(-1)?.content ?? '').slice(0, 40);
  return {
    id: `msg_dry_${attemptSeq}`, type: 'message', role: 'assistant', model: body.model ?? 'dry', stop_reason: 'end_turn',
    content: [{ type: 'text', text: `DRY RUN reply (no provider call) to ${last.length} chars. Try this: "This is my sister." Can you write one?` }],
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
  let req: { model?: string; max_tokens?: number; system?: { text?: string }[] | string; messages?: { content: unknown }[]; output_config?: unknown } = {};
  try { req = JSON.parse(raw); } catch { /* non-JSON body */ }
  const systemText = Array.isArray(req.system) ? req.system.map((b) => b.text ?? '').join('\n\n') : String(req.system ?? '');
  const leaks = (cursor?.identifiers ?? []).filter((v) => v && raw.toLowerCase().includes(v.toLowerCase()));
  const rec: Record<string, unknown> = {
    kind: 'provider_attempt', id, mode: MODE, caseId: cursor?.caseId ?? null, turn: cursor?.turn ?? null,
    path: new URL(url).pathname, modelRequested: req.model ?? null, maxTokens: req.max_tokens ?? null,
    outputConfig: req.output_config ?? null,
    systemSha256: createHash('sha256').update(systemText).digest('hex').slice(0, 16),
    systemChars: systemText.length, hasLtcBlock: systemText.includes('<language_teaching_context version="ltc-v1">'),
    identifierLeaks: leaks.length, startedAt: new Date().toISOString(),
  };
  const t0 = Date.now();
  if (MODE === 'dry') {
    const body = dryReply(req);
    Object.assign(rec, { status: 200, latencyMs: 0, modelServed: body.model, usage: body.usage, costUsd: 0, priced: true });
    attempts.push(rec);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'request-id': id } });
  }
  try {
    const res = await realFetch(input as RequestInfo, init);
    const clone = res.clone();
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
    AI_TEST_SPEND_CAP_USD: String(Math.max(CAP + 10, 1)), AI_TEST_SPEND_ID: 'ltb-v1-local',
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
    benchmarkVersion: 'ltb-v1.0', harness: 'backend/benchmarks/ltc-v1/run.ts', mode: MODE, startedAt: new Date().toISOString(),
    route: 'POST /api/me/tutor/sessions/:id/messages (real controller, in-process)',
    tutorModel: cfg.anthropicTutorModel, tutorEffort: cfg.anthropicTutorEffort, intentModel: cfg.anthropicIntentModel,
    maxOutputTokensTutor: 4000, sdkTimeoutMs: 25_000, gatewayMaxAttempts: 2, sdkMaxRetries: 0, concurrency: 1,
    harnessCapUsd: CAP, localTestSpendCapUsd: Math.max(CAP + 10, 1), casesFile: path.basename(CASES_FILE),
    casesSha256: createHash('sha256').update(readFileSync(CASES_FILE)).digest('hex'), caseCount: cases.length,
    turnCount: cases.reduce((n, c) => n + c.turns.length, 0), database: 'mongodb-memory-server (throwaway, in-process)',
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
      learningSettings: { adultLearners: c.learner.adultSchool },
    });
    await M.Batch.create({ id: `ltb-b-${k}`, name: `Batch ${k}`, institutionId: inst, academicYear: '2026', studentCount: 1 });
    await M.Student.create({ id: sid, name, email, grade: c.learner.grade ?? '', institutionId: inst, batchId: `ltb-b-${k}` });
    await M.StudentCredit.create({ studentId: sid, institutionId: inst, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    await M.User.create({ email, password: hash, role: 'student', name, status: 'active', institutionId: inst, studentId: sid });
    const lesson = c.lesson ?? { title: 'General practice', objective: 'General English practice.', spec: undefined };
    await M.Curriculum.create({
      id: curId, name: `English ${c.cefr}`, institutionId: inst, courseName: `English ${c.cefr}`, type: 'Language', level: c.cefr, languages: ['English'],
      summary: `Synthetic English course, level ${c.cefr}.`, lastUpdated: '2026-11-09', status: 'deployed',
      chapters: [{ id: lessonId, title: lesson.title, description: lesson.objective, ...(lesson.spec ? { languageSpec: lesson.spec } : {}) }],
    });
    await M.CourseInstance.create({ id: `ltb-cls-${k}`, courseId, courseName: `English ${c.cefr}`, institutionId: inst, academicYear: '2026', batchId: `ltb-b-${k}`, curriculumId: curId, studentIds: [sid], instructorIds: [], visibility: 'student' });
    if (c.lesson) {
      await M.LearningObjective.create({ id: objId, institutionId: inst, curriculumId: curId, courseId, lessonIds: [lessonId], code: `LTB-${k}`, title: c.lesson.objective.slice(0, 200), status: 'approved' });
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
    const login = await request(app).post('/api/auth/login').send({ email, password: PW });
    const auth = `Bearer ${login.body.token}`;
    const identifiers = [name, email, sid, inst, `Synthetic School ${k}`, String(login.body.user?.id ?? '')].filter((v) => v.length > 3);
    const sess = await request(app).post('/api/me/tutor/sessions').set('Authorization', auth).send({ courseId, ...(c.lesson ? { lessonId } : {}), title: `Benchmark ${c.id}` });
    const sessionId = sess.body.id ?? sess.body.session?.id;
    const turns: Record<string, unknown>[] = [];
    for (const [t, text] of c.turns.entries()) {
      if (MODE === 'live' && meteredUsd >= CAP) { stopped = `harness cap reached in ${c.id} turn ${t}`; break; }
      cursor = { caseId: c.id, turn: t, identifiers };
      const before = attemptSeq;
      const t0 = Date.now();
      const r = await request(app).post(`/api/me/tutor/sessions/${sessionId}/messages`).set('Authorization', auth)
        .send({ text, context: { courseId, ...(c.lesson ? { lessonId } : {}) } });
      const ai = r.body?.assistantMessage;
      const turnAttempts = attempts.filter((a) => a.kind === 'provider_attempt' && Number(String(a.id).slice(4)) > before);
      turns.push({
        turn: t, learner: text, httpStatus: r.status, latencyMs: Date.now() - t0, reply: ai?.text ?? null,
        replyVersion: ai?.meta?.version ?? null, languageTurn: ai?.meta?.languageTurn ?? null,
        teaching: ai?.meta?.teaching ?? null,
        attemptIds: turnAttempts.map((a) => a.id), attempts: turnAttempts.length,
        tutorAttempt: turnAttempts.filter((a) => a.maxTokens === 4000).map((a) => ({ id: a.id, status: a.status, modelServed: a.modelServed, hasLtcBlock: a.hasLtcBlock, identifierLeaks: a.identifierLeaks, systemSha256: a.systemSha256 })),
        errorCode: r.status >= 400 ? r.body?.error?.code ?? r.body?.code ?? null : null,
      });
      cursor = null;
      flushAttempts();
    }
    const rec = { caseId: c.id, cohort: c.cohort, cefr: c.cefr, caseType: c.caseType, sessionCreated: sess.status, loginStatus: login.status, turns, meteredUsdAfter: Number(meteredUsd.toFixed(6)) };
    appendFileSync(OUT, JSON.stringify(rec) + '\n');
    const summary = turns.map((x) => `${x.httpStatus}/${(x.languageTurn as { moves?: string[] } | null)?.moves?.join('+') ?? '-'}`).join(' | ');
    console.log(`${c.id} ${summary} $${meteredUsd.toFixed(4)}`);
    if (stopped) break;
  }
  flushAttempts();
  const done = { finishedAt: new Date().toISOString(), meteredUsd: Number(meteredUsd.toFixed(6)), providerAttempts: attemptSeq, stopped };
  writeFileSync(path.join(REPORT_DIR, MODE === 'live' ? 'run_status.json' : 'dry_run_status.json'), JSON.stringify(done, null, 2));
  console.log('done', JSON.stringify(done));
  await mongoose.disconnect();
  await mongo.stop({ doCleanup: true, force: true });
}

main().catch((e) => { console.error('ERR', (e as Error).message); process.exit(1); });
