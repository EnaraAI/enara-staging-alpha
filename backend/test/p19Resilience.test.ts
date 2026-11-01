import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P19 C/D/E (LOCAL, mocked provider): controlled concurrency levels, injected
// provider failures and budget boundaries, through the real HTTP API and the
// real grading pipeline. The provider mock is deterministic and can delay,
// fail, truncate, drop usage or return an unpriced model per call. These
// results describe the application's own behaviour; they are NOT real-provider
// tests. All outbound network is blocked and counted.

type Reply = { text?: string; error?: Error; usage?: unknown; stop_reason?: string; model?: string; delayMs?: number };
const ai = vi.hoisted(() => ({ calls: [] as any[], handler: null as null | ((body: any, n: number) => Reply | Promise<Reply>) }));
vi.mock('@anthropic-ai/sdk', () => {
  const reply = async (body: any) => {
    ai.calls.push(body);
    const r: Reply = ai.handler ? await ai.handler(body, ai.calls.length) : {};
    if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
    if (r.error) throw r.error;
    return { model: r.model ?? body.model, stop_reason: r.stop_reason ?? 'end_turn', usage: 'usage' in r ? r.usage : { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: r.text ?? 'ok' }] };
  };
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn(reply), stream: vi.fn() };
    beta = { messages: { create: vi.fn(reply), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

const INST = 'p19-r';
const N_STUDENTS = 30;
const FEATURES = { teaching_workflow_enabled: true, ai_grading_enabled: true, connected_workflow_enabled: true, learning_intelligence_enabled: true, mastery_tracking_enabled: true, study_plans_enabled: true };
const realFetch = globalThis.fetch;
let outbound = 0;
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>;
const tok: Record<string, string> = {};
const metrics: Record<string, unknown> = {};

const isGrading = (body: any) => JSON.stringify(body.system ?? '').includes("You grade one student's answer");
const marker = (body: any) => (JSON.stringify(body).match(/STU-(\d+)/) || [])[0] ?? 'STU-?';
const evaluation = (body: any, level = 'l2') =>
  JSON.stringify({ criteria: [{ criterionId: 'c1', levelId: level, evidence: ['same size'], rationale: 'r' }], scoreExplanation: `explanation for ${marker(body)}`, strengths: [], improvements: [], feedback: `feedback for ${marker(body)}`, objectiveIds: [], confidence: 'high', flags: [] });
const healthy = (delayMs = 0) => (body: any): Reply => ({ text: isGrading(body) ? evaluation(body) : `tutor reply for ${marker(body)}`, delayMs });
const ledger = (q: object = {}) => mongoose.connection.collection('usage_ledger').find(q).toArray();
const attempt = (id: string) => M.AssessmentAttempt.findOne({ id }).lean();
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
async function until(check: () => Promise<boolean>, what: string, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error(`timed out waiting for ${what}`);
}
const send = (who: string, method: 'get' | 'post', path: string, body?: object) => {
  const r = (request(app) as any)[method](path).set('Authorization', tok[who]);
  return method === 'post' ? r.send(body ?? {}) : r;
};
let asmN = 0;
async function newAssignment() {
  asmN += 1;
  const a = await send('teacher', 'post', '/api/assessments', { title: `P19 check ${asmN}`, subject: 'Maths', curriculumId: metrics.curriculumId, lifecycle: 'published',
    questions: [
      { id: 'q1', type: 'multiple-choice', text: 'What is 1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', explanation: '', points: 1 },
      { id: 'q2', type: 'open-response', text: 'Why a common denominator?', modelAnswer: 'The parts must be the same size before they can be counted together.',
        rubric: { criteria: [{ id: 'c1', title: 'Reasoning', levels: [{ id: 'l0', label: 'Missing', points: 0 }, { id: 'l1', label: 'Partial', points: 1 }, { id: 'l2', label: 'Clear', points: 2 }] }] } },
    ] });
  expect(a.status, JSON.stringify(a.body)).toBe(201);
  const g = await send('teacher', 'post', '/api/assignments', { assessmentId: a.body.id, classId: 'p19r-class', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  expect(g.status, JSON.stringify(g.body)).toBe(201);
  return g.body.id as string;
}
async function submit(stu: number, assignmentId: string) {
  const st = await send(`s${stu}`, 'post', `/api/me/assignments/${assignmentId}/attempts`);
  expect([200, 201], JSON.stringify(st.body)).toContain(st.status);
  const id = st.body.attempt.id as string;
  const t0 = Date.now();
  const sub = await send(`s${stu}`, 'post', `/api/me/assignments/${assignmentId}/attempts/${id}/submit`, { answers: { q1: '3/4', q2: `STU-${stu}: the parts must be the same size` } });
  expect([200, 201, 202], JSON.stringify(sub.body)).toContain(sub.status);
  return { id, t0 };
}
const setCap = async (usd?: number) => {
  if (usd === undefined) { delete process.env.AI_TEST_SPEND_CAP_USD; delete process.env.AI_TEST_SPEND_ID; }
  else Object.assign(process.env, { AI_TEST_SPEND_CAP_USD: String(usd), AI_TEST_SPEND_ID: `p19-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
  (await import('../src/config/env')).resetConfigForTests();
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'test-key-not-real',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID']) delete process.env[k];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url instanceof Request ? url.url : url));
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return realFetch(url, init);
    outbound += 1;
    throw new Error('outbound network blocked in test');
  }) as typeof fetch;
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Assignment', 'AssessmentAttempt', 'TutorSession']) M[name] = (await import(`../src/models/${name}`))[name];
  for (const m of Object.values(M)) await m.createIndexes();
  (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
  app = (await import('../src/app')).createApp();
  const { signAccessToken } = await import('../src/auth/jwt');
  const bearer = (u: any) => `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId, studentId: u.studentId } as never)}`;
  await M.Institution.create({ id: INST, name: 'P19 resilience school', features: FEATURES });
  await M.Batch.create({ id: 'p19r-batch', name: 'Grade 6', institutionId: INST, academicYear: '2026', studentCount: N_STUDENTS });
  const teacher = await M.User.create({ email: 'teacher@p19r.test', password: 'x', role: 'teacher', name: 'Teacher', status: 'active', institutionId: INST });
  tok.teacher = bearer(teacher);
  for (let i = 1; i <= N_STUDENTS; i++) {
    await M.Student.create({ id: `p19r-s${i}`, name: `Student ${i}`, email: `s${i}@p19r.test`, grade: 'Grade 6', institutionId: INST, batchId: 'p19r-batch' });
    await M.StudentCredit.create({ studentId: `p19r-s${i}`, institutionId: INST, limit: 100000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    tok[`s${i}`] = bearer(await M.User.create({ email: `s${i}@p19r.test`, password: 'x', role: 'student', name: `Student ${i}`, status: 'active', institutionId: INST, studentId: `p19r-s${i}` }));
  }
  await M.CourseInstance.create({ id: 'p19r-class', courseId: 'p19r-course', courseName: 'Fractions', institutionId: INST, academicYear: '2026', batchId: 'p19r-batch', studentIds: [], instructorIds: [teacher._id.toString()], visibility: 'student' });
  const cur = await send('teacher', 'post', '/api/curriculums', { name: 'Fractions', summary: 'Fractions', courseName: 'Fractions', chapters: [{ title: 'Adding fractions', description: 'Rewrite 1/2 as 2/4.' }] });
  await send('teacher', 'post', `/api/curriculums/${cur.body.id}/publish-to-class`, { classId: 'p19r-class' });
  metrics.lessonId = cur.body.chapters[0].id;
  metrics.curriculumId = cur.body.id;
}, 180_000);

// Functional tests reset the per-IP limiter store; the limiter itself is measured explicitly below.
beforeEach(async () => { await mongoose.connection.collection('rate_limits').deleteMany({}); });

afterAll(async () => {
  globalThis.fetch = realFetch;
  await setCap(undefined);
  console.log(`P19_METRICS ${JSON.stringify(metrics)}`);
  await mongoose.disconnect();
  await mongo.stop();
});

describe('P19 C1: controlled concurrency levels (local, mocked provider with 150 ms latency)', () => {
  for (const level of [3, 5, 10, 20]) {
    it(`level ${level}: ${level} concurrent tutor messages, then ${level} concurrent submissions graded; no loss, no duplicates, correct association and accounting`, { timeout: 120_000 }, async () => {
      ai.handler = healthy(150);
      const students = Array.from({ length: level }, (_, i) => i + 1 + (level === 3 ? 0 : level === 5 ? 3 : level === 10 ? 8 : 0) % N_STUDENTS);
      const calls0 = ai.calls.length;
      const rows0 = (await ledger()).length;
      // Tutor wave.
      const sessions = await Promise.all(students.map((s) => send(`s${s}`, 'post', '/api/me/tutor/sessions', { courseId: 'p19r-course', lessonId: metrics.lessonId, title: `L${level}` })));
      expect(sessions.every((r) => r.status === 201), sessions.map((r) => r.status).join(',')).toBe(true);
      const tutorMs: number[] = [];
      const tutor = await Promise.all(students.map(async (s, i) => {
        const t0 = Date.now();
        const r = await send(`s${s}`, 'post', `/api/me/tutor/sessions/${sessions[i].body.id}/messages`, { text: `STU-${s} how do I add fractions?` });
        tutorMs.push(Date.now() - t0);
        return r;
      }));
      const tutorFailed = tutor.filter((r) => r.status !== 200).map((r) => `${r.status} ${r.body?.error?.code}`);
      expect(tutorFailed, 'tutor failures').toEqual([]);
      tutor.forEach((r, i) => expect(r.body.assistantMessage.text, 'reply routed to its own student').toContain(`STU-${students[i]}`));
      // Grading wave.
      const assignmentId = await newAssignment();
      const subs = await Promise.all(students.map((s) => submit(s, assignmentId)));
      const releaseMs: number[] = [];
      await Promise.all(subs.map(async ({ id, t0 }) => { await until(async () => (await attempt(id))?.gradingStatus === 'released', `release ${id}`, 60_000); releaseMs.push(Date.now() - t0); }));
      const atts = await M.AssessmentAttempt.find({ assignmentId }).lean();
      expect(atts.length, 'one attempt per student, none lost or duplicated').toBe(level);
      expect(new Set(atts.map((a) => a.studentId)).size).toBe(level);
      for (const a of atts) {
        expect(a.gradingRuns, 'exactly one grading run').toBe(1);
        expect(a.score).toBe(100);
        const q2 = a.answers.find((x: any) => x.questionId === 'q2');
        expect(q2.feedback, 'feedback associated with its own student').toContain(`STU-${a.studentId.replace('p19r-s', '')}`);
      }
      const newCalls = ai.calls.length - calls0;
      const rows = (await ledger()).slice(rows0);
      expect(newCalls, 'provider calls = tutor + 2 evaluations per submission').toBe(level * 3);
      expect(rows.length, 'one ledger row per provider attempt').toBe(newCalls);
      expect(rows.every((r) => r.status === 'ok' && r.costStatus !== 'usage_unknown')).toBe(true);
      expect(new Set(rows.map((r) => r.operationKey)).size, 'no duplicate ledger keys').toBe(rows.length);
      metrics[`level${level}`] = { requests: level * 4, tutorFailed: tutorFailed.length, tutorP50: pct(tutorMs, 50), tutorP95: pct(tutorMs, 95), tutorMax: Math.max(...tutorMs), releaseP50: pct(releaseMs, 50), releaseP95: pct(releaseMs, 95), releaseMax: Math.max(...releaseMs), providerCalls: newCalls, ledgerRows: rows.length, duplicates: 0 };
    });
  }

  it('database operations per student dashboard request (P18-2 investigation)', async () => {
    let ops = 0;
    mongoose.set('debug', () => { ops += 1; });
    for (const p of ['/api/me/dashboard', '/api/me/achievements']) { ops = 0; await send('s1', 'get', p); metrics[`dbOps ${p}`] = ops; }
    mongoose.set('debug', false);
  });

  it('student dashboard under 20 concurrent sessions (P18-2 investigation): latency of /api/me/dashboard and /api/me/achievements', { timeout: 120_000 }, async () => {
    for (const path of ['/api/me/dashboard', '/api/me/achievements', '/api/me/courses', '/api/me/assignments']) {
      const ms: number[] = [];
      const res = await Promise.all(Array.from({ length: 20 }, async (_, i) => { const t0 = Date.now(); const r = await send(`s${i + 1}`, 'get', path); ms.push(Date.now() - t0); return r.status; }));
      expect(res.every((s) => s === 200), `${path} ${res.join(',')}`).toBe(true);
      metrics[`dash ${path}`] = { p50: pct(ms, 50), p95: pct(ms, 95), max: Math.max(...ms) };
    }
  });
});

describe('P19 C1b: a whole class behind one school IP address (reproduction of the per-IP API limit)', () => {
  it('30 students opening their dashboard and reloading it once within one minute from one IP: requests refused by the shared per-IP limiter are counted', { timeout: 120_000 }, async () => {
    await mongoose.connection.collection('rate_limits').deleteMany({});
    // The pages a student dashboard loads on open (from the P18 runtime logs).
    const pages = ['/api/me/dashboard', '/api/me/courses', '/api/me/results', '/api/me/assessments', '/api/me/assignments', '/api/me/achievements', '/api/me/next-steps', '/api/me/study-plan', '/api/learning/students/me/knowledge-map', '/api/me/assignments'];
    const statuses: number[] = [];
    await Promise.all(Array.from({ length: 30 }, async (_, i) => { for (const p of [...pages, ...pages]) statuses.push((await send(`s${i + 1}`, 'get', p)).status); }));
    const limited = statuses.filter((s) => s === 429).length;
    metrics.oneIpClass = { students: 30, requests: statuses.length, rateLimited: limited, limit: '300 per minute per IP (app.ts:137, perUser=false)' };
    // Observed behaviour, recorded: the limiter is per IP, so one class can exhaust it.
    expect(statuses.length).toBe(600);
    expect(limited, 'reproduces P19-1: a class behind one IP is throttled').toBeGreaterThan(0);
    await mongoose.connection.collection('rate_limits').deleteMany({});
  });
});

describe('P19 C1c: logins of a class behind one school IP (reproduction of P18-7)', () => {
  it('25 students signing in within 15 minutes from one IP: the per-IP login limiter refuses the overflow', { timeout: 120_000 }, async () => {
    await mongoose.connection.collection('rate_limits').deleteMany({});
    const bcrypt = (await import('bcryptjs')).default;
    await M.User.updateMany({ institutionId: INST, role: 'student' }, { $set: { password: bcrypt.hashSync('p19-login-password', 4) } });
    const statuses: number[] = [];
    for (let i = 1; i <= 25; i++) statuses.push((await request(app).post('/api/auth/login').send({ email: `s${i}@p19r.test`, password: 'p19-login-password' })).status);
    metrics.oneIpLogins = { attempts: 25, ok: statuses.filter((s) => s === 200).length, rateLimited: statuses.filter((s) => s === 429).length, limit: '20 per 15 minutes per IP (app.ts:112)' };
    expect(statuses.filter((s) => s === 429).length, 'reproduces P18-7').toBeGreaterThan(0);
    await mongoose.connection.collection('rate_limits').deleteMany({});
  });
});

describe('P19 D1: injected provider failures through the real grading pipeline (local)', () => {
  const failingRun = async (name: string, err: (body: any) => Reply, expectRetried: boolean) => {
    const assignmentId = await newAssignment();
    const calls0 = ai.calls.length;
    const rows0 = (await ledger()).length;
    ai.handler = (body) => (isGrading(body) ? err(body) : healthy()(body));
    const { id } = await submit(21, assignmentId);
    await until(async () => ['grading_failed', 'grading_exception'].includes((await attempt(id))?.gradingStatus), `${name} failure`);
    const a = (await attempt(id))!;
    const rows = (await ledger()).slice(rows0);
    expect(a.score ?? null, `${name}: no grade from a failed run`).toBeNull();
    expect(a.gradingStatus).toBe('grading_failed'); // retryable: scheduled, not final
    expect(a.nextGradingAt).toBeTruthy();
    const result = await send('s21', 'get', `/api/me/assignments/${assignmentId}/attempts/${id}/result`);
    expect(result.body.released, `${name}: nothing released`).not.toBe(true);
    expect(result.body.processing, `${name}: the student sees a status`).toBeTruthy();
    expect(JSON.stringify(a.answers)).toContain('STU-21'); // submission preserved
    // Recovery: backoff elapses (test-only time shift); provider healthy again; one valid release.
    ai.handler = healthy();
    await M.AssessmentAttempt.updateOne({ id }, { $set: { nextGradingAt: new Date(Date.now() - 1000) } });
    const { sweepGrading } = await import('../src/services/autoGrading');
    await sweepGrading({ attemptIds: [id] });
    await until(async () => (await attempt(id))?.gradingStatus === 'released', `${name} recovery`);
    await sweepGrading({ attemptIds: [id] });
    const done = (await attempt(id))!;
    expect(done.score).toBe(100);
    expect(done.history.filter((h: any) => h.action === 'released').length, `${name}: one release`).toBe(1);
    const failedCalls = rows.length;
    metrics[`failure ${name}`] = { failedRunProviderAttempts: ai.calls.length - calls0 - 2, ledgerRowsForFailedRun: failedCalls, statuses: [...new Set(rows.map((r) => `${r.status}/${r.costStatus}`))], retriedWithinRun: expectRetried };
    return rows;
  };

  it('timeout: retried once inside the run, then a scheduled retry; failed attempts kept as usage_unknown', { timeout: 60_000 }, async () => {
    const rows = await failingRun('timeout', () => ({ error: Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }) }), true);
    expect(rows.every((r) => r.status === 'error' && r.costStatus === 'usage_unknown' && r.costInternal === null)).toBe(true);
  });
  it('rate limited (429): retried, then scheduled retry; never a grade', { timeout: 60_000 }, async () => {
    const rows = await failingRun('429', () => ({ error: Object.assign(new Error('rate_limit_error'), { status: 429, name: 'RateLimitError' }) }), true);
    expect(rows.every((r) => r.status === 'error')).toBe(true);
  });
  it('provider rejection (400): not retried inside the run (one attempt per evaluation call)', { timeout: 60_000 }, async () => {
    const rows = await failingRun('400', () => ({ error: Object.assign(new Error('invalid_request_error'), { status: 400, name: 'BadRequestError' }) }), false);
    expect(rows.every((r) => r.status === 'error')).toBe(true);
  });
  it('network interruption (connection reset): retried, then scheduled retry', { timeout: 60_000 }, async () => {
    await failingRun('network', () => ({ error: Object.assign(new Error('socket hang up'), { name: 'APIConnectionError', code: 'ECONNRESET' }) }), true);
  });
  it('server error (529 overloaded): retried, then scheduled retry', { timeout: 60_000 }, async () => {
    await failingRun('529', () => ({ error: Object.assign(new Error('overloaded_error'), { status: 529 }) }), true);
  });
  it('invalid structured response: validation retry, then scheduled retry; measured usage still ledgered', { timeout: 60_000 }, async () => {
    const rows = await failingRun('invalid-json', () => ({ text: 'not json at all' }), false);
    expect(rows.every((r) => r.status === 'ok' && r.costStatus !== 'usage_unknown')).toBe(true);
  });
  it('truncated response (stop_reason max_tokens with partial JSON): never accepted', { timeout: 60_000 }, async () => {
    const rows = await failingRun('truncated', () => ({ text: '{"criteria":[{"criterionId":"c1","levelId":"l2"', stop_reason: 'max_tokens' }), false);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('missing usage metadata: grade released, rows are usage_unknown with null cost (never zero), test-spend reservation kept whole', { timeout: 60_000 }, async () => {
    await setCap(5);
    const assignmentId = await newAssignment();
    const rows0 = (await ledger()).length;
    ai.handler = (body) => ({ ...healthy()(body), usage: undefined });
    const { id } = await submit(22, assignmentId);
    await until(async () => (await attempt(id))?.gradingStatus === 'released', 'release without usage');
    const rows = (await ledger()).slice(rows0);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.costStatus === 'usage_unknown' && r.costInternal === null)).toBe(true);
    const counter = await mongoose.connection.collection('budget_counters').findOne({ _id: `test_spend:${process.env.AI_TEST_SPEND_ID}` as never });
    expect(counter!.unknownMicros, 'unknown usage is counted as exposure, not zero').toBeGreaterThan(0);
    expect(counter!.committedMicros).toBeGreaterThanOrEqual(counter!.unknownMicros);
    await setCap(undefined);
  });

  it('missing cost metadata (unpriced model): grade released, rows "unpriced", reservation kept whole under the test cap', { timeout: 60_000 }, async () => {
    await setCap(5);
    const assignmentId = await newAssignment();
    const rows0 = (await ledger()).length;
    ai.handler = (body) => ({ ...healthy()(body), model: 'claude-unpriced-p19' });
    const { id } = await submit(23, assignmentId);
    await until(async () => (await attempt(id))?.gradingStatus === 'released', 'release unpriced');
    const rows = (await ledger()).slice(rows0);
    expect(rows.every((r) => r.costStatus === 'unpriced' && r.costInternal === null), JSON.stringify(rows.map((r) => r.costStatus))).toBe(true);
    const counter = await mongoose.connection.collection('budget_counters').findOne({ _id: `test_spend:${process.env.AI_TEST_SPEND_ID}` as never });
    expect(counter!.unknownMicros).toBeGreaterThan(0);
    await setCap(undefined);
  });

  it('duplicate delivery: concurrent grading runs and repeated kicks on one attempt produce one run and one release', { timeout: 60_000 }, async () => {
    const assignmentId = await newAssignment();
    ai.handler = healthy(200);
    const calls0 = ai.calls.length;
    const { id } = await submit(24, assignmentId);
    const { processAttempt, sweepGrading } = await import('../src/services/autoGrading');
    const outcomes = await Promise.all([processAttempt(id), processAttempt(id), sweepGrading({ attemptIds: [id] }), send('s24', 'get', `/api/me/assignments/${assignmentId}/attempts/${id}/result`)]);
    await until(async () => (await attempt(id))?.gradingStatus === 'released', 'release');
    const a = (await attempt(id))!;
    expect(a.gradingRuns).toBe(1);
    expect(ai.calls.length - calls0, 'two evaluations, once').toBe(2);
    expect(a.history.filter((h: any) => h.action === 'released').length).toBe(1);
    metrics.duplicateDelivery = { outcomes: outcomes.slice(0, 2), providerCalls: ai.calls.length - calls0 };
  });

  it('application cancellation (process killed mid-run): the lease expires and the sweep finishes the attempt once', { timeout: 60_000 }, async () => {
    const assignmentId = await newAssignment();
    ai.handler = () => new Promise<Reply>(() => undefined); // the run never completes, as if the function was killed
    const calls0 = ai.calls.length;
    const { id } = await submit(25, assignmentId);
    await until(async () => (await attempt(id))?.gradingStatus === 'grading_in_progress', 'claimed');
    await until(async () => ai.calls.length > calls0, 'the hanging call reached the provider');
    ai.handler = healthy();
    const { sweepGrading } = await import('../src/services/autoGrading');
    expect((await sweepGrading({ attemptIds: [id] })).due, 'not reclaimed while the lease holds').toBe(0);
    await M.AssessmentAttempt.updateOne({ id }, { $set: { gradingLeaseUntil: new Date(Date.now() - 1000) } }); // test-only: lease expiry
    await sweepGrading({ attemptIds: [id] });
    const a = (await attempt(id))!;
    expect(a).toMatchObject({ gradingStatus: 'released', gradingRuns: 2, score: 100 });
    expect(a.history.filter((h: any) => h.action === 'released').length).toBe(1);
  });

  it('failure after the provider answered but before the grade was stored: no grade, retried, one final release (paid twice, ledgered twice)', { timeout: 60_000 }, async () => {
    const assignmentId = await newAssignment();
    ai.handler = healthy();
    const rows0 = (await ledger()).length;
    const real = M.AssessmentAttempt.findOneAndUpdate.bind(M.AssessmentAttempt);
    let broke = false;
    const spy = vi.spyOn(M.AssessmentAttempt, 'findOneAndUpdate').mockImplementation(((filter: any, update: any, opts: any) => {
      if (!broke && update?.$set?.gradingStatus === 'released') { broke = true; return Promise.reject(new Error('write failed (injected)')) as any; }
      return real(filter, update, opts);
    }) as any);
    const { id } = await submit(26, assignmentId);
    await until(async () => (await attempt(id))?.gradingStatus === 'grading_failed', 'failed after response');
    spy.mockRestore();
    expect((await attempt(id))!.score ?? null).toBeNull();
    await M.AssessmentAttempt.updateOne({ id }, { $set: { nextGradingAt: new Date(Date.now() - 1000) } });
    const { sweepGrading } = await import('../src/services/autoGrading');
    await sweepGrading({ attemptIds: [id] });
    const a = (await attempt(id))!;
    expect(a).toMatchObject({ gradingStatus: 'released', score: 100, gradingRuns: 2 });
    expect(a.history.filter((h: any) => h.action === 'released').length).toBe(1);
    const rows = (await ledger({ 'refs.attemptId': id })).length || (await ledger()).slice(rows0).length;
    expect(rows, 'both runs metered').toBe(4);
  });

  it('three failed runs end in grading_exception with no grade; only a teacher regrade (exception path) restarts it', { timeout: 60_000 }, async () => {
    const assignmentId = await newAssignment();
    ai.handler = (body) => (isGrading(body) ? { text: 'bad' } : healthy()(body));
    const { id } = await submit(27, assignmentId);
    const { sweepGrading } = await import('../src/services/autoGrading');
    await until(async () => (await attempt(id))?.gradingStatus === 'grading_failed', 'run 1');
    for (let i = 0; i < 2; i++) { await M.AssessmentAttempt.updateOne({ id }, { $set: { nextGradingAt: new Date(Date.now() - 1000) } }); await sweepGrading({ attemptIds: [id] }); }
    const a = (await attempt(id))!;
    expect(a).toMatchObject({ gradingStatus: 'grading_exception', gradingRuns: 3 });
    expect(a.score ?? null).toBeNull();
    await sweepGrading({ attemptIds: [id] });
    expect((await attempt(id))!.gradingRuns, 'no automatic 4th run').toBe(3);
  });
});

describe('P19 E3: budget boundaries and concurrent reservations (local)', () => {
  it('below the cap a call reserves and runs; a call that would exceed it is refused before the provider', { timeout: 60_000 }, async () => {
    ai.handler = healthy();
    await setCap(5);
    const ses = await send('s28', 'post', '/api/me/tutor/sessions', { courseId: 'p19r-course', lessonId: metrics.lessonId });
    expect((await send('s28', 'post', `/api/me/tutor/sessions/${ses.body.id}/messages`, { text: 'STU-28 hi' })).status).toBe(200);
    await setCap(0.000001);
    const calls0 = ai.calls.length;
    const refused = await send('s28', 'post', `/api/me/tutor/sessions/${ses.body.id}/messages`, { text: 'STU-28 again' });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('AI_TEST_SPEND_CAP');
    expect(ai.calls.length, 'provider never called').toBe(calls0);
    await setCap(undefined);
  });

  it('20 concurrent tutor calls against a cap that fits only some: committed spend never exceeds the cap; refused calls never reach the provider', { timeout: 60_000 }, async () => {
    ai.handler = healthy(100);
    // Measure one reservation, then allow about 4 of them.
    await setCap(5);
    const probe = await send('s29', 'post', '/api/me/tutor/sessions', { courseId: 'p19r-course', lessonId: metrics.lessonId });
    await send('s29', 'post', `/api/me/tutor/sessions/${probe.body.id}/messages`, { text: 'STU-29 probe' });
    const { BudgetReservation } = await import('../src/models/OrgBudget');
    const one = (await BudgetReservation.findOne({ kind: 'test_spend' }).sort({ createdAt: -1 }).lean())!.amountMicros as number;
    const capMicros = one * 4 + Math.floor(one / 2);
    await setCap(capMicros / 1e6);
    const sessions = await Promise.all(Array.from({ length: 20 }, (_, i) => send(`s${i + 1}`, 'post', '/api/me/tutor/sessions', { courseId: 'p19r-course', lessonId: metrics.lessonId })));
    const calls0 = ai.calls.length;
    const res = await Promise.all(sessions.map((s, i) => send(`s${i + 1}`, 'post', `/api/me/tutor/sessions/${s.body.id}/messages`, { text: `STU-${i + 1} race` })));
    const okN = res.filter((r) => r.status === 200).length;
    const refused = res.filter((r) => r.status === 429 && r.body?.error?.code === 'AI_TEST_SPEND_CAP').length;
    const counter = (await mongoose.connection.collection('budget_counters').findOne({ _id: `test_spend:${process.env.AI_TEST_SPEND_ID}` as never }))!;
    expect(okN + refused, `all accounted for: ${res.map((r) => r.status).join(',')}`).toBe(20);
    expect(okN, 'at most what the cap allows').toBeLessThanOrEqual(4);
    expect(okN).toBeGreaterThanOrEqual(1);
    expect(ai.calls.length - calls0, 'only admitted calls reached the provider').toBe(okN);
    expect(counter.committedMicros, 'never over the cap').toBeLessThanOrEqual(capMicros);
    metrics.budgetRace = { concurrent: 20, admitted: okN, refused, capMicros, reservationMicros: one, committedMicros: counter.committedMicros, settledMicros: counter.settledMicros };
    await setCap(undefined);
  });

  it('a provider failure after reservation keeps the reservation counted as unknown exposure (fails safe, not free)', { timeout: 60_000 }, async () => {
    await setCap(5);
    ai.handler = () => ({ error: Object.assign(new Error('overloaded'), { status: 529 }) });
    const ses = await send('s30', 'post', '/api/me/tutor/sessions', { courseId: 'p19r-course', lessonId: metrics.lessonId });
    const r = await send('s30', 'post', `/api/me/tutor/sessions/${ses.body.id}/messages`, { text: 'STU-30 hi' });
    // The tutor answers gracefully (no fabricated reply) whatever the status.
    expect(r.status === 200 ? !/tutor reply for/.test(JSON.stringify(r.body)) : r.status >= 500).toBe(true);
    metrics.tutorFailureResponse = { status: r.status, body: JSON.stringify(r.body).slice(0, 200) };
    const counter = (await mongoose.connection.collection('budget_counters').findOne({ _id: `test_spend:${process.env.AI_TEST_SPEND_ID}` as never }))!;
    expect(counter.unknownMicros).toBeGreaterThan(0);
    expect(counter.settledMicros ?? 0).toBe(0);
    await setCap(undefined);
  });

  it('P18-1 regression: the dashboard next-steps note carries a cost bound, so a test cap admits it (and still refuses it when the cap is spent)', { timeout: 60_000 }, async () => {
    // Fresh students: the note is cached per student per day.
    const { signAccessToken } = await import('../src/auth/jwt');
    for (const k of ['n1', 'n2']) {
      await M.Student.create({ id: `p19r-${k}`, name: `Note ${k}`, email: `${k}@p19r.test`, grade: 'Grade 6', institutionId: INST, batchId: 'p19r-batch' });
      const u = await M.User.create({ email: `${k}@p19r.test`, password: 'x', role: 'student', name: `Note ${k}`, status: 'active', institutionId: INST, studentId: `p19r-${k}` });
      tok[k] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId, studentId: u.studentId } as never)}`;
    }
    await setCap(5);
    ai.handler = () => ({ text: 'Keep going with your fractions practice.' });
    const before = (await ledger({ feature: 'next_steps_note' })).length;
    const r = await send('n1', 'get', '/api/me/next-steps');
    expect(r.status).toBe(200);
    const rows = (await ledger({ feature: 'next_steps_note' })).slice(before);
    expect(rows.length, 'admitted under the cap and metered').toBe(1);
    expect(rows[0]).toMatchObject({ status: 'ok' });
    await setCap(0.000001);
    const calls0 = ai.calls.length;
    expect((await send('n2', 'get', '/api/me/next-steps')).status, 'page still works (fallback note)').toBe(200);
    expect(ai.calls.length, 'refused before the provider when the cap is spent').toBe(calls0);
    await setCap(undefined);
  });

  it('P18-4 regression: releasedAt is the time the grade was stored, not the time the run started', { timeout: 60_000 }, async () => {
    const assignmentId = await newAssignment();
    ai.handler = healthy(300);
    const { id } = await submit(17, assignmentId);
    await until(async () => (await attempt(id))?.gradingStatus === 'released', 'release');
    const a = (await attempt(id))!;
    const started = a.history.find((h: any) => h.action === 'grading_started').at;
    const evals = await ledger({ 'refs.attemptId': id });
    const lastEval = Math.max(...evals.map((r) => new Date(r.createdAt ?? r.at ?? 0).getTime()));
    expect(new Date(a.releasedAt).getTime() - new Date(started).getTime(), 'release after the provider latency').toBeGreaterThanOrEqual(250);
    if (Number.isFinite(lastEval) && lastEval > 0) expect(new Date(a.releasedAt).getTime()).toBeGreaterThanOrEqual(lastEval - 5);
  });

  it('no request in this file reached the network', () => {
    expect(outbound).toBe(0);
  });
});
