import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// P19 multi-tenant isolation. Two complete synthetic schools are built through
// the real API (curriculum, publish, assessment, assignment, submissions graded
// by the AI grader, tutor conversations, usage ledger), so school B holds every
// kind of journey record, each tagged "TB_". Then every route is called as each
// school-A identity with school B's real ids, with tampered query parameters
// (institutionId, studentId, classId, search, paging) and with tampered bodies.
// A response must never carry "TB_" or school B's id, and school B's stored
// records must be unchanged. Same-tenant class behaviour (including the
// batch-based enrollment rule) is pinned and documented, not changed.
// Provider mocked (deterministic); all outbound network is blocked and counted.

const ai = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@anthropic-ai/sdk', () => {
  const reply = async (body: any) => {
    ai.calls += 1;
    const all = JSON.stringify(body);
    const tag = all.includes('TB_') ? 'TB_' : 'TA_';
    const system = JSON.stringify(body.system ?? '');
    const text = system.includes("You grade one student's answer")
      ? JSON.stringify({ criteria: [{ criterionId: 'c1', levelId: 'l2', evidence: ['same size'], rationale: `${tag}rationale` }], scoreExplanation: `${tag}explanation of the score`, strengths: [`${tag}strength`], improvements: [], feedback: `${tag}feedback for the student`, objectiveIds: [], confidence: 'high', flags: [] })
      : `${tag}tutor reply`;
    return { model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text }] };
  };
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn(reply), stream: vi.fn() };
    beta = { messages: { create: vi.fn(reply), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

const PW = 'p19-isolation-password';
const FEATURES = {
  teaching_workflow_enabled: true, ai_assessment_authoring_enabled: true, ai_grading_enabled: true, ai_lesson_planning_enabled: true, study_plans_enabled: true,
  learning_intelligence_enabled: true, mastery_tracking_enabled: true, learning_pathways_enabled: true, educator_chat_enabled: true, connected_workflow_enabled: true, documents_workspace_enabled: true,
};
const SCHOOL = { A: 'p19-a', B: 'p19-b' } as const;
type T = keyof typeof SCHOOL;
const realFetch = globalThis.fetch;
let outbound = 0;
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>;
const auth: Record<string, string> = {}; // `${t}:${role}` -> Bearer
const rec: Record<T, Record<string, string>> = { A: {}, B: {} }; // record ids per school
const routes: { method: string; path: string }[] = [];

function mountPath(layer: any): string {
  const src: string = layer.regexp?.source ?? '';
  if (layer.regexp?.fast_slash) return '';
  return src.replace('^\\', '').replace(/\\\/\?\(\?=\\\/\|\$\)$/i, '').replace(/\\\//g, '/').replace(/\$$/, '').replace(/^\^/, '');
}
function collect(stack: any[], prefix: string) {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) for (const m of Object.keys(layer.route.methods)) if (typeof p === 'string') routes.push({ method: m.toUpperCase(), path: (prefix + p).replace(/\/+$/, '') || '/' });
    } else if (layer.name === 'router' && layer.handle?.stack) collect(layer.handle.stack, prefix + mountPath(layer));
  }
}
let sent = 0;
async function send(bearer: string | null, method: string, path: string, body?: object) {
  if (++sent % 150 === 0) await mongoose.connection.collection('rate_limits').deleteMany({});
  let r = (request(app) as any)[method.toLowerCase()](path);
  if (bearer) r = r.set('Authorization', bearer);
  return method === 'GET' || method === 'DELETE' ? r : r.send(body ?? {});
}
const as = (t: T, role: string) => ({
  get: (p: string) => send(auth[`${t}:${role}`], 'GET', p),
  post: (p: string, b: object = {}) => send(auth[`${t}:${role}`], 'POST', p, b),
});
async function digest(t: T) {
  const db = mongoose.connection.db!;
  const parts: string[] = [];
  for (const { name } of (await db.listCollections().toArray()).sort((x, y) => x.name.localeCompare(y.name))) {
    if (['rate_limits', 'ai_calls', 'usage_ledger', 'budget_counters', 'budget_reservations', 'sessions', 'revoked_tokens'].includes(name)) continue;
    const docs = await db.collection(name).find({ $or: [{ institutionId: SCHOOL[t] }, { schoolId: SCHOOL[t] }, { school_id: SCHOOL[t] }] }).sort({ _id: 1 }).toArray();
    for (const d of docs) parts.push(`${name}:${JSON.stringify(d)}`);
  }
  return { hash: crypto.createHash('sha256').update(parts.join('\n')).digest('hex'), count: parts.length };
}
async function until(check: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 400; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error(`timed out waiting for ${what}`);
}

// One school, built through the real API. Class 1 and class 3 share batch 1
// (documents the batch-based rule); class 2 has its own batch.
async function buildSchool(t: T) {
  const inst = SCHOOL[t]; const tag = `T${t}_`; const R = rec[t];
  await M.Institution.create({ id: inst, name: `${tag}School`, features: FEATURES });
  await M.Batch.create([
    { id: `${inst}-b1`, name: `${tag}Batch 1`, institutionId: inst, academicYear: '2026', studentCount: 2 },
    { id: `${inst}-b2`, name: `${tag}Batch 2`, institutionId: inst, academicYear: '2026', studentCount: 1 },
  ]);
  R.batch1 = `${inst}-b1`; R.batch2 = `${inst}-b2`;
  for (const [s, b] of [['s1', 'b1'], ['s2', 'b1'], ['s3', 'b2']]) {
    await M.Student.create({ id: `${inst}-${s}`, name: `${tag}Student ${s}`, email: `${s}@${inst}.test`, grade: 'Grade 6', institutionId: inst, batchId: `${inst}-${b}` });
    await M.StudentCredit.create({ studentId: `${inst}-${s}`, institutionId: inst, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    R[s] = `${inst}-${s}`;
  }
  const hash = bcrypt.hashSync(PW, 4);
  const users: [string, string, string?][] = [['admin', 'admin'], ['academic_manager', 'academic_manager'], ['teacher1', 'teacher'], ['teacher2', 'teacher'], ['teacher3', 'teacher'], ['s1', 'student', R.s1], ['s2', 'student', R.s2], ['s3', 'student', R.s3]];
  for (const [key, role, studentId] of users) {
    const u = await M.User.create({ email: `${key}@${inst}.test`, password: hash, role, name: `${tag}${key}`, status: 'active', institutionId: inst, studentId });
    R[`user_${key}`] = u._id.toString();
    const r = await request(app).post('/api/auth/login').send({ email: `${key}@${inst}.test`, password: PW });
    expect(r.status, `login ${key}@${inst}`).toBe(200);
    auth[`${t}:${key}`] = `Bearer ${r.body.token}`;
  }
  await mongoose.connection.collection('rate_limits').deleteMany({});
  await M.CourseInstance.create([
    { id: `${inst}-c1`, courseId: `${inst}-course1`, courseName: `${tag}Class 1`, institutionId: inst, academicYear: '2026', batchId: R.batch1, studentIds: [], instructorIds: [R.user_teacher1], visibility: 'student' },
    { id: `${inst}-c2`, courseId: `${inst}-course2`, courseName: `${tag}Class 2`, institutionId: inst, academicYear: '2026', batchId: R.batch2, studentIds: [], instructorIds: [R.user_teacher2], visibility: 'student' },
    { id: `${inst}-c3`, courseId: `${inst}-course3`, courseName: `${tag}Class 3 (shares batch 1)`, institutionId: inst, academicYear: '2026', batchId: R.batch1, studentIds: [], instructorIds: [R.user_teacher3], visibility: 'student' },
  ]);
  R.c1 = `${inst}-c1`; R.c2 = `${inst}-c2`; R.c3 = `${inst}-c3`; R.course1 = `${inst}-course1`; R.course2 = `${inst}-course2`;
  // Lessons: teacher 1 publishes to class 1; teacher 2 to class 2; teacher 1 keeps one unpublished.
  for (const [teacher, cls, key] of [['teacher1', R.c1, 'cur1'], ['teacher2', R.c2, 'cur2'], ['teacher1', null, 'curDraft']] as const) {
    const cur = await as(t, teacher).post('/api/curriculums', { name: `${tag}${key}`, summary: `${tag}summary ${key}`, courseName: `${tag}${key}`, chapters: [{ title: `${tag}lesson ${key}`, description: `${tag}secret lesson body ${key}` }] });
    expect(cur.status, JSON.stringify(cur.body)).toBe(201);
    R[key] = cur.body.id; R[`${key}_ch`] = cur.body.chapters[0].id;
    if (cls) expect((await as(t, teacher).post(`/api/curriculums/${cur.body.id}/publish-to-class`, { classId: cls })).status).toBe(200);
  }
  // Assessment (MCQ + rubric) by teacher 1, assigned to class 1.
  const asm = await as(t, 'teacher1').post('/api/assessments', {
    title: `${tag}Assessment`, subject: 'Maths', curriculumId: R.cur1, lifecycle: 'draft',
    questions: [
      { id: 'q1', type: 'multiple-choice', text: `${tag}What is 1/2 + 1/4?`, options: ['3/4', '2/6'], correctAnswer: '3/4', explanation: `${tag}KEY explanation`, points: 1 },
      { id: 'q2', type: 'open-response', text: `${tag}Why a common denominator?`, modelAnswer: `${tag}MODEL ANSWER the parts must be the same size`,
        rubric: { criteria: [{ id: 'c1', title: 'Reasoning', levels: [{ id: 'l0', label: 'Missing', points: 0 }, { id: 'l1', label: 'Partial', points: 1 }, { id: 'l2', label: 'Clear', points: 2 }] }] } },
    ],
  });
  expect(asm.status, JSON.stringify(asm.body)).toBe(201);
  R.assessment = asm.body.id;
  expect((await as(t, 'teacher1').post(`/api/assessments/${R.assessment}/publish`)).status).toBe(200);
  const asg = await as(t, 'teacher1').post('/api/assignments', { assessmentId: R.assessment, classId: R.c1, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  expect(asg.status, JSON.stringify(asg.body)).toBe(201);
  R.assignment = asg.body.id;
  // Submissions (s1, s2 in class 1 via batch 1), graded by the (mocked) AI grader and released.
  for (const s of ['s1', 's2']) {
    const st = await as(t, s).post(`/api/me/assignments/${R.assignment}/attempts`);
    expect([200, 201]).toContain(st.status);
    const id = st.body.attempt.id; R[`attempt_${s}`] = id;
    const sub = await as(t, s).post(`/api/me/assignments/${R.assignment}/attempts/${id}/submit`, { answers: { q1: '3/4', q2: `${tag}answer from ${s}: the parts must be the same size` } });
    expect([200, 201, 202]).toContain(sub.status);
    await until(async () => (await M.AssessmentAttempt.findOne({ id }).lean())?.gradingStatus === 'released', `release ${inst} ${s}`);
  }
  const prop = await M.GradingProposal.findOne({ attemptId: R.attempt_s1 }).lean();
  if (prop) R.proposal = prop.id;
  // Tutor conversations (s1 class 1, s3 class 2).
  for (const [s, course, cur] of [['s1', R.course1, 'cur1'], ['s3', R.course2, 'cur2']] as const) {
    const ses = await as(t, s).post('/api/me/tutor/sessions', { courseId: course, lessonId: R[`${cur}_ch`], title: `${tag}tutor ${s}` });
    expect(ses.status, JSON.stringify(ses.body)).toBe(201);
    R[`tutor_${s}`] = ses.body.id;
    const msg = await as(t, s).post(`/api/me/tutor/sessions/${ses.body.id}/messages`, { text: `${tag}question from ${s}` });
    expect(msg.status, JSON.stringify(msg.body)).toBe(200);
    R[`request_${s}`] = String(msg.headers['x-request-id'] ?? '');
  }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    ANTHROPIC_API_KEY: 'test-key-not-real', CRON_SECRET: 'test-cron-secret-32-characters-min',
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
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Assignment', 'AssessmentAttempt', 'GradingProposal', 'TutorSession']) M[name] = (await import(`../src/models/${name}`))[name];
  M.Assessment = (await import('../src/models/Assessment')).Assessment;
  for (const m of Object.values(M)) await m.createIndexes();
  (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
  app = (await import('../src/app')).createApp();
  collect((app as any)._router.stack, '');
  await buildSchool('A');
  await buildSchool('B');
}, 300_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  await mongoose.disconnect();
  await mongo.stop();
});

const ok = (s: number) => s >= 200 && s < 300;
const leaksB = (res: any, echoed: string) => ok(res.status) && JSON.stringify(res.body ?? '').split(echoed || '\u0000').join('').match(/TB_|p19-b/);
const SKIP = new Set(['/api/auth/logout', '/api/cron/daily', '/api/auth/login']);

describe('P19 B1/B2: two complete schools, school A never reaches school B', () => {
  it('fixtures: both schools hold every journey record kind (graded submissions, AI feedback, tutor history, ledger)', async () => {
    for (const t of ['A', 'B'] as T[]) {
      const R = rec[t];
      for (const k of ['c1', 'c2', 'c3', 'cur1', 'cur2', 'curDraft', 'assessment', 'assignment', 'attempt_s1', 'attempt_s2', 'tutor_s1', 'tutor_s3', 'request_s1']) expect(R[k], `${t}.${k}`).toBeTruthy();
      const att = await M.AssessmentAttempt.findOne({ id: R.attempt_s1 }).lean();
      expect(att).toMatchObject({ institutionId: SCHOOL[t], gradingStatus: 'released' });
      expect(JSON.stringify(att!.answers)).toContain(`T${t}_feedback`);
      const ledger = await mongoose.connection.collection('usage_ledger').countDocuments({ institutionId: SCHOOL[t] });
      expect(ledger, `${t} ledger rows`).toBeGreaterThanOrEqual(6); // 2 attempts x 2 grading evaluations + 2 tutor calls
    }
    expect(routes.filter((r) => r.path.startsWith('/api/')).length).toBeGreaterThan(150);
  });

  it('positive control: the leak detector fires on school B data read by school B itself', async () => {
    const own = [await as('B', 'teacher1').get(`/api/teaching/classes/${rec.B.c1}/roster`), await as('B', 's1').get(`/api/me/tutor/sessions/${rec.B.tutor_s1}`), await as('B', 's1').get(`/api/me/assignments/${rec.B.assignment}/attempts/${rec.B.attempt_s1}/result`), await as('B', 'admin').get('/api/students')];
    for (const r of own) expect(leaksB(r, ''), `detector must see B data in ${r.req?.path}`).toBeTruthy();
  });

  it('explicit probes: every school-B resource is refused to school-A identities (direct ids, nested routes)', async () => {
    const B = rec.B;
    const probes: [string, string][] = [
      ['admin', `/api/course-instances/${B.c1}`], ['admin', `/api/students/${B.s1}`], ['admin', `/api/batches/${B.batch1}`],
      ['admin', `/api/curriculums/${B.cur1}`], ['admin', `/api/curriculums/${B.curDraft}`], ['admin', `/api/assessments/${B.assessment}`],
      ['teacher1', `/api/teaching/classes/${B.c1}/roster`], ['teacher1', `/api/teaching/students/${B.s1}/profile`], ['teacher1', `/api/assessments/${B.assessment}`],
      ['teacher1', `/api/assessments/${B.assessment}/attempts`], ['teacher1', `/api/assignments/${B.assignment}`], ['teacher1', `/api/grading/attempts/${B.attempt_s1}`],
      ['academic_manager', `/api/analytics/students/${B.s1}`],
      ['s1', `/api/me/courses/${B.course1}`], ['s1', `/api/me/courses/${B.course1}/lessons/${B.cur1_ch}`], ['s1', `/api/me/assignments/${B.assignment}`],
      ['s1', `/api/me/assignments/${B.assignment}/attempts/${B.attempt_s1}/result`], ['s1', `/api/me/tutor/sessions/${B.tutor_s1}`],
      ['s1', `/api/usage/me/requests/${B.request_s1}`],
    ];
    for (const [role, path] of probes) {
      const res = await as('A', role).get(path);
      expect(leaksB(res, ''), `${role} ${path} -> ${res.status}`).toBeFalsy();
      if (!path.startsWith('/api/usage/me/requests')) expect([400, 403, 404], `${role} ${path} -> ${res.status}`).toContain(res.status);
    }
    // Writes against school B ids are refused and change nothing in school B.
    const before = await digest('B');
    const writes: [string, string, string, object][] = [
      ['teacher1', 'POST', `/api/curriculums/${B.cur1}/publish-to-class`, { classId: B.c1 }],
      ['teacher1', 'POST', `/api/curriculums/${rec.A.cur1}/publish-to-class`, { classId: B.c1 }],
      ['teacher1', 'POST', '/api/assignments', { assessmentId: rec.A.assessment, classId: B.c1, dueAt: new Date(Date.now() + 86_400_000).toISOString() }],
      ['teacher1', 'POST', `/api/grading/attempts/${B.attempt_s1}/regrade`, { reason: 'x' }],
      ['admin', 'POST', `/api/course-instances/${B.c1}/students`, { studentId: rec.A.s1 }],
      ['admin', 'POST', `/api/course-instances/${rec.A.c1}/students`, { studentId: B.s1 }],
      ['admin', 'PUT', `/api/students/${B.s1}`, { name: 'hijacked' }],
      ['admin', 'DELETE', `/api/curriculums/${B.cur1}`, {}],
      ['s1', 'POST', `/api/me/assignments/${B.assignment}/attempts`, {}],
      ['s1', 'POST', `/api/me/tutor/sessions/${B.tutor_s1}/messages`, { text: 'x' }],
    ];
    for (const [role, method, path, body] of writes) {
      const res = await send(auth[`A:${role}`], method, path, body);
      expect([400, 403, 404, 409], `${role} ${method} ${path} -> ${res.status}`).toContain(res.status);
    }
    expect(await digest('B')).toEqual(before);
  });

  it('tampered parameters and bodies: institution/student/class ids in the query or payload never widen the scope', async () => {
    const B = rec.B;
    const q = `institutionId=${SCHOOL.B}&schoolId=${SCHOOL.B}&studentId=${B.s1}&classId=${B.c1}&courseId=${B.course1}&search=TB_&q=TB_&page=1&limit=500&pageSize=500&origin=all`;
    const leaks: string[] = [];
    for (const role of ['admin', 'academic_manager', 'teacher1', 's1']) {
      for (const r of routes.filter((x) => x.method === 'GET' && x.path.startsWith('/api/') && !x.path.includes(':') && !SKIP.has(x.path))) {
        const res = await send(auth[`A:${role}`], 'GET', `${r.path}?${q}`);
        if (leaksB(res, '')) leaks.push(`${role} GET ${r.path}?… ${res.status}`);
      }
    }
    // Creates with a foreign institution in the body land in the caller's own school (or are refused).
    const before = await digest('B');
    const created = await as('A', 'teacher1').post('/api/curriculums', { name: 'TA_tamper', summary: 'x', courseName: 'x', institutionId: SCHOOL.B, schoolId: SCHOOL.B, chapters: [{ title: 'x', description: 'x' }] });
    if (ok(created.status)) expect((await M.Curriculum.findOne({ id: created.body.id }).lean())!.institutionId).toBe(SCHOOL.A);
    const batch = await as('A', 'admin').post('/api/batches', { name: 'TA_tamper batch', academicYear: '2026', institutionId: SCHOOL.B });
    if (ok(batch.status)) expect((await M.Batch.findOne({ id: batch.body.id }).lean())!.institutionId).toBe(SCHOOL.A);
    const user = await as('A', 'admin').post('/api/auth/users', { email: 'tamper@p19-a.test', password: 'tamper-password-123', role: 'teacher', institutionId: SCHOOL.B });
    if (ok(user.status)) expect(user.body.user.institutionId).toBe(SCHOOL.A);
    const ses = await as('A', 's1').post('/api/me/tutor/sessions', { courseId: B.course1, lessonId: B.cur1_ch, institutionId: SCHOOL.B });
    expect([400, 403, 404]).toContain(ses.status);
    expect(await digest('B')).toEqual(before);
    if (leaks.length) console.error(`P19_QUERY_LEAKS\n${leaks.join('\n')}`);
    expect(leaks).toEqual([]);
  }, 600_000);

  it('aggregates: usage report, analytics and dashboards count only the caller\'s school', async () => {
    const own = await mongoose.connection.collection('usage_ledger').countDocuments({ institutionId: SCHOOL.A });
    const rep = await as('A', 'admin').get('/api/usage/report');
    expect(rep.status).toBe(200);
    expect(rep.body.total.operations).toBe(own);
    const ov = await as('A', 'teacher1').get('/api/teaching/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.classes.map((c: any) => c.id)).toEqual([rec.A.c1]);
    const queue = await as('A', 'teacher1').get('/api/grading/queue');
    expect(queue.body.items.every((i: any) => i.assignmentId === rec.A.assignment)).toBe(true);
    for (const [role, path] of [['admin', '/api/analytics/institution'], ['admin', '/api/students'], ['admin', '/api/course-instances'], ['admin', '/api/batches'], ['admin', '/api/curriculums'], ['academic_manager', '/api/learning/classes'], ['admin', '/api/workspace/users']] as const) {
      const res = await as('A', role).get(path);
      expect(leaksB(res, ''), `${role} ${path}`).toBeFalsy();
    }
  });

  it('background and internal paths: cron needs its secret; grading kicks from views are scoped to the caller', async () => {
    expect((await send(null, 'GET', '/api/cron/daily')).status).toBe(401);
    expect((await send(auth['A:admin'], 'GET', '/api/cron/daily')).status).toBe(401);
    // A school-A view of a school-B attempt cannot trigger (or read) its grading.
    const before = (await M.AssessmentAttempt.findOne({ id: rec.B.attempt_s1 }).lean())!;
    await as('A', 's1').get(`/api/me/assignments/${rec.B.assignment}/attempts/${rec.B.attempt_s1}/result`);
    const after = (await M.AssessmentAttempt.findOne({ id: rec.B.attempt_s1 }).lean())!;
    expect(after.gradingRuns).toBe(before.gradingRuns);
    // Ingestion is a signed service-to-service path: unsigned calls are refused.
    expect([401, 403]).toContain((await send(auth['A:admin'], 'POST', '/api/ingestion/submit', { schoolId: SCHOOL.B })).status);
  });

  it('full route sweep: every route, as every school-A identity, with every kind of real school-B id', async () => {
    const before = await digest('B');
    const B = rec.B;
    const ids = [B.c1, B.c2, B.batch1, B.s1, B.s3, B.cur1, B.curDraft, B.cur1_ch, B.assessment, B.assignment, B.attempt_s1, B.tutor_s1, B.course1, B.user_teacher1, B.user_s1, B.proposal, B.request_s1].filter(Boolean);
    const leaks: string[] = [];
    for (const role of ['admin', 'academic_manager', 'teacher1', 'teacher3', 's1', 's3']) {
      for (const r of routes.filter((x) => x.path.startsWith('/api/') && !SKIP.has(x.path))) {
        const targets = r.path.includes(':') ? ids.map((id) => [r.path.replace(/:([A-Za-z]+)/g, id), id]) : [[r.path, '']];
        for (const [path, id] of targets) {
          const res = await send(auth[`A:${role}`], r.method, path, { institutionId: SCHOOL.B, classId: B.c1, studentId: B.s1 });
          if (leaksB(res, id)) leaks.push(`${role} ${r.method} ${path} ${res.status}`);
        }
      }
    }
    if (leaks.length) console.error(`P19_SWEEP_LEAKS\n${leaks.join('\n')}`);
    expect(leaks).toEqual([]);
    expect(await digest('B')).toEqual(before);
  }, 1_200_000);
});

describe('P19 B3: same-school class access (observed behaviour, enrollment model unchanged)', () => {
  it('teacher of class 2 (own batch) reaches none of class 1: roster, profiles, attempts, grading', async () => {
    const A = rec.A;
    expect([403, 404]).toContain((await as('A', 'teacher2').get(`/api/teaching/classes/${A.c1}/roster`)).status);
    expect([403, 404]).toContain((await as('A', 'teacher2').get(`/api/teaching/students/${A.s1}/profile`)).status);
    expect([403, 404]).toContain((await as('A', 'teacher2').get(`/api/grading/attempts/${A.attempt_s1}`)).status);
    const q = await as('A', 'teacher2').get('/api/grading/queue');
    expect(JSON.stringify(q.body)).not.toContain(A.attempt_s1);
  });

  it('BATCH RULE: teacher of class 3 (shares batch 1) sees class-1 students on its roster and their profiles, but not class 1 itself or its assignment', async () => {
    const A = rec.A;
    const roster = await as('A', 'teacher3').get(`/api/teaching/classes/${A.c3}/roster`);
    expect(roster.status).toBe(200);
    const names = JSON.stringify(roster.body);
    // Documented behaviour (P15 C-policy, P17 section 8): every student of a batch is in every class on it.
    expect(names).toContain('TA_Student s1');
    expect(names).toContain('TA_Student s2');
    expect(names).not.toContain('TA_Student s3');
    expect([403, 404]).toContain((await as('A', 'teacher3').get(`/api/teaching/classes/${A.c1}/roster`)).status);
    expect([403, 404]).toContain((await as('A', 'teacher3').get(`/api/grading/attempts/${A.attempt_s1}`)).status);
    const q = await as('A', 'teacher3').get('/api/grading/queue');
    expect(JSON.stringify(q.body)).not.toContain(A.attempt_s1);
    // Record what the profile shows for a shared-batch student (reported, not asserted as policy).
    const prof = await as('A', 'teacher3').get(`/api/teaching/students/${A.s1}/profile`);
    console.log(`P19_B3 teacher3 profile of shared-batch s1: status ${prof.status}; shows class-1 result: ${JSON.stringify(prof.body).includes(A.attempt_s1)}; shows class-1 submission title: ${JSON.stringify(prof.body).includes('TA_Assessment')}`);
    // Students on a shared batch see class 3 too (it has no published lesson here).
    const courses = await as('A', 's1').get('/api/me/courses');
    console.log(`P19_B3 s1 courses: ${JSON.stringify((courses.body?.courses ?? courses.body ?? []).map?.((c: any) => c.id) ?? courses.body).slice(0, 300)}`);
  });

  it('server-side enforcement: a forged client claim (role/institution in the body) changes nothing', async () => {
    const res = await as('A', 's1').post('/api/me/tutor/sessions', { courseId: rec.A.course1, lessonId: rec.A.cur1_ch, role: 'enara-admin', institutionId: SCHOOL.B, studentId: rec.A.s2 });
    expect(res.status).toBe(201);
    const ses = (await M.TutorSession.findOne({ id: res.body.id }).lean())!;
    expect(ses).toMatchObject({ institutionId: SCHOOL.A, studentId: rec.A.s1 });
  });

  it('no request in this file reached the network', () => {
    expect(outbound).toBe(0);
  });
});
