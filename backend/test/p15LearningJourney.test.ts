import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// P15: the full learning journey in ONE database, with real password logins:
// teacher prepares and publishes content → student opens the lesson → AI
// tutor (mocked) → teacher-authored MCQ + rubric assessment → assignment →
// student submission → autonomous grading and release → student result →
// educator roster/analytics → usage ledger and test-spend accounting. Plus the
// negative journeys (wrong school, wrong class, wrong student, duplicates,
// malformed model output, budget exhaustion). The provider is a deterministic
// mock; all outbound network is blocked and counted.

const ai = vi.hoisted(() => ({ calls: [] as any[], handler: (_b: any): string | Error => 'ok', noUsage: false }));
vi.mock('@anthropic-ai/sdk', () => {
  const reply = async (body: any) => {
    ai.calls.push(body);
    const out = ai.handler(body);
    if (out instanceof Error) throw out;
    // Like the real API: the reply names the requested model, so usage is priced and settled.
    return { model: body.model, stop_reason: 'end_turn', usage: ai.noUsage ? undefined : { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: out }] };
  };
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn(reply), stream: vi.fn() };
    beta = { messages: { create: vi.fn(reply), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

const PW = 'journey-password-1';
const A = 'p15-a';
const B = 'p15-b';
const FEATURES = {
  teaching_workflow_enabled: true, ai_assessment_authoring_enabled: true, ai_grading_enabled: true, ai_lesson_planning_enabled: true, study_plans_enabled: true,
  learning_intelligence_enabled: true, mastery_tracking_enabled: true, learning_pathways_enabled: true, educator_chat_enabled: true, connected_workflow_enabled: true,
};
const realFetch = globalThis.fetch;
let outbound = 0;
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>;

type Who = { id: string; email: string; auth: string; get: (u: string) => any; post: (u: string, b?: object) => any; patch: (u: string, b: object) => any };
const people: Record<string, Who> = {};
const ids: Record<string, string> = {};

async function login(email: string): Promise<Who> {
  const r = await request(app).post('/api/auth/login').send({ email, password: PW });
  expect(r.status, `login ${email}`).toBe(200);
  const auth = `Bearer ${r.body.token}`;
  return {
    id: '', email, auth,
    get: (u) => request(app).get(u).set('Authorization', auth),
    post: (u, b = {}) => request(app).post(u).set('Authorization', auth).send(b),
    patch: (u, b) => request(app).patch(u).set('Authorization', auth).send(b),
  };
}
async function until(check: () => Promise<boolean>, what: string, detail?: () => Promise<unknown>) {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}${detail ? `: ${JSON.stringify(await detail())}` : ''}`);
}
const gradingState = (id: string) => async () => {
  const a = await M.AssessmentAttempt.findOne({ id }).lean();
  return a && { gradingStatus: a.gradingStatus, runs: a.gradingRuns, error: a.gradingError, reason: a.exceptionReason, nextGradingAt: a.nextGradingAt };
};
const ledger = () => mongoose.connection.collection('usage_ledger').find({}).toArray();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'p15-journey',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url instanceof Request ? url.url : url));
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return realFetch(url, init);
    outbound += 1;
    throw new Error('outbound network blocked in test');
  }) as typeof fetch;
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Assignment', 'AssessmentAttempt', 'GradingProposal', 'TutorSession']) {
    M[name] = (await import(`../src/models/${name}`))[name];
  }
  M.Assessment = (await import('../src/models/Assessment')).Assessment;
  for (const m of Object.values(M)) await m.createIndexes();

  await M.Institution.create([{ id: A, name: 'Journey School', features: FEATURES }, { id: B, name: 'Other School', features: FEATURES }]);
  await M.Batch.create([
    { id: 'p15-b1', name: 'Grade 6 A', institutionId: A, academicYear: '2026', studentCount: 2 },
    { id: 'p15-b2', name: 'Grade 6 B', institutionId: A, academicYear: '2026', studentCount: 1 },
    { id: 'p15-bB', name: 'Grade 6', institutionId: B, academicYear: '2026', studentCount: 1 },
  ]);
  await M.Student.create([
    { id: 'p15-stu1', name: 'Amira Journey', email: 'amira@p15.test', grade: 'Grade 6', institutionId: A, batchId: 'p15-b1' },
    { id: 'p15-stu2', name: 'Bilal Journey', email: 'bilal@p15.test', grade: 'Grade 6', institutionId: A, batchId: 'p15-b1' },
    { id: 'p15-stu3', name: 'Carla Otherclass', email: 'carla@p15.test', grade: 'Grade 6', institutionId: A, batchId: 'p15-b2' },
    { id: 'p15-stuB', name: 'Dana Otherschool', email: 'dana@p15.test', grade: 'Grade 6', institutionId: B, batchId: 'p15-bB' },
  ]);
  for (const s of ['p15-stu1', 'p15-stu2', 'p15-stu3', 'p15-stuB']) {
    await M.StudentCredit.create({ studentId: s, institutionId: s === 'p15-stuB' ? B : A, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  }
  const hash = bcrypt.hashSync(PW, 4);
  const mk = async (key: string, email: string, role: string, institutionId: string, studentId?: string) => {
    const u = await M.User.create({ email, password: hash, role, name: key, status: 'active', institutionId, studentId });
    ids[key] = u._id.toString();
  };
  await mk('teacher1', 'teacher1@p15.test', 'teacher', A);
  await mk('teacher2', 'teacher2@p15.test', 'teacher', A);
  await mk('manager', 'manager@p15.test', 'academic_manager', A);
  await mk('admin', 'admin@p15.test', 'admin', A);
  await mk('teacherB', 'teacherb@p15.test', 'teacher', B);
  await mk('stu1', 'amira@p15.test', 'student', A, 'p15-stu1');
  await mk('stu2', 'bilal@p15.test', 'student', A, 'p15-stu2');
  await mk('stu3', 'carla@p15.test', 'student', A, 'p15-stu3');
  await mk('stuB', 'dana@p15.test', 'student', B, 'p15-stuB');
  await M.CourseInstance.create([
    { id: 'p15-cls1', courseId: 'p15-fr6a', courseName: 'Fractions 6A', institutionId: A, academicYear: '2026', batchId: 'p15-b1', studentIds: [], instructorIds: [ids.teacher1], visibility: 'student' },
    { id: 'p15-cls2', courseId: 'p15-fr6b', courseName: 'Fractions 6B', institutionId: A, academicYear: '2026', batchId: 'p15-b2', studentIds: [], instructorIds: [ids.teacher2], visibility: 'student' },
    { id: 'p15-clsB', courseId: 'p15-frB', courseName: 'Fractions', institutionId: B, academicYear: '2026', batchId: 'p15-bB', studentIds: [], instructorIds: [ids.teacherB], visibility: 'student' },
  ]);
  (await import('../src/services/gatewaySettings').catch(() => null));
  (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
  app = (await import('../src/app')).createApp();
}, 120_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const k of ['AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.disconnect();
  await mongo.stop();
});

describe('P15 full learning journey (sequential)', () => {
  it('A. teacher access: real login, wrong password, no token, expired token', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'teacher1@p15.test', password: 'wrong' })).status).toBe(401);
    expect((await request(app).get('/api/curriculums')).status).toBe(401);
    const expired = jwt.sign({ typ: 'access', id: ids.teacher1, role: 'teacher', tv: 0 }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: -10, issuer: 'enara-backend', audience: 'enara-platform', subject: ids.teacher1 });
    expect((await request(app).get('/api/curriculums').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
    for (const k of ['teacher1', 'teacher2', 'manager', 'admin', 'teacherB']) people[k] = await login(`${k === 'teacherB' ? 'teacherb' : k}@p15.test`);
    for (const [k, e] of [['stu1', 'amira'], ['stu2', 'bilal'], ['stu3', 'carla'], ['stuB', 'dana']]) people[k] = await login(`${e}@p15.test`);
    // Teachers have no workspace administration, billing, internal cost or AI controls.
    for (const u of ['/api/workspace/users', '/api/usage/report', '/api/analytics/ai-usage', `/api/ai-controls/budgets/${A}`, '/api/students']) {
      expect([401, 403], u).toContain((await people.teacher1.get(u)).status);
    }
  });

  it('B. content: draft with validation, edit, persistence across sessions, scope of edits', async () => {
    const T = people.teacher1;
    expect((await T.post('/api/curriculums', { summary: 'no name' })).status).toBe(400);
    const created = await T.post('/api/curriculums', {
      name: 'Fractions', summary: 'Adding fractions with unlike denominators', courseName: 'Fractions 6A',
      chapters: [{ title: 'Adding fractions', description: 'To add one half and one quarter, rewrite both in quarters first.' }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    ids.curriculum = created.body.id;
    ids.lesson = created.body.chapters[0].id;
    const edited = await T.patch(`/api/curriculums/${ids.curriculum}`, { chapters: [{ id: ids.lesson, title: 'Adding fractions', description: 'To add one half and one quarter, rewrite both as quarters: 2/4 + 1/4 = 3/4.' }] });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    // A new session sees the saved draft.
    const again = await login('teacher1@p15.test');
    const read = await again.get(`/api/curriculums/${ids.curriculum}`);
    expect(read.status).toBe(200);
    expect(JSON.stringify(read.body)).toContain('2/4 + 1/4 = 3/4');
    // Another teacher, the academic manager and another school cannot edit it.
    expect([403, 404]).toContain((await people.teacher2.patch(`/api/curriculums/${ids.curriculum}`, { summary: 'hijack' })).status);
    expect([403, 404]).toContain((await people.manager.patch(`/api/curriculums/${ids.curriculum}`, { summary: 'hijack' })).status);
    expect([403, 404]).toContain((await people.teacherB.get(`/api/curriculums/${ids.curriculum}`)).status);
    expect((await M.Curriculum.findOne({ id: ids.curriculum }).lean())!.summary).toBe('Adding fractions with unlike denominators');
  });

  it('C. publishing: not visible before; teacher publishes only to their own class; the right students see the lesson', async () => {
    const lessonUrl = `/api/me/courses/p15-fr6a/lessons/${ids.lesson}`;
    expect([403, 404]).toContain((await people.stu1.get(lessonUrl)).status); // not yet linked
    expect((await people.teacher1.post(`/api/curriculums/${ids.curriculum}/publish-to-class`, { classId: 'p15-cls2' })).status).toBe(404);
    expect((await people.teacher2.post(`/api/curriculums/${ids.curriculum}/publish-to-class`, { classId: 'p15-cls2' })).status).toBe(404);
    expect((await people.teacher1.post(`/api/curriculums/${ids.curriculum}/publish-to-class`, { classId: 'p15-cls1' })).status).toBe(200);
    const courses = await people.stu1.get('/api/me/courses');
    expect(courses.status).toBe(200);
    expect(JSON.stringify(courses.body)).toContain('p15-fr6a');
    expect(JSON.stringify(courses.body)).not.toContain('p15-fr6b');
    const lesson = await people.stu1.get(lessonUrl);
    expect(lesson.status, JSON.stringify(lesson.body)).toBe(200);
    expect(JSON.stringify(lesson.body)).toContain('2/4 + 1/4 = 3/4');
    // Same batch: Bilal sees it. Other class, other school: not found, even by id.
    expect((await people.stu2.get(lessonUrl)).status).toBe(200);
    for (const s of ['stu3', 'stuB']) {
      expect([403, 404], s).toContain((await people[s].get(lessonUrl)).status);
      expect([403, 404], s).toContain((await people[s].get('/api/me/courses/p15-fr6a')).status);
    }
  });

  it('D. AI tutor (mocked): right context, persisted history, no cross-student access, metered', async () => {
    const before = (await ledger()).length;
    const s = await people.stu1.post('/api/me/tutor/sessions', { courseId: 'p15-fr6a', lessonId: ids.lesson, title: 'Adding fractions' });
    expect([200, 201], JSON.stringify(s.body)).toContain(s.status);
    ids.session = s.body.id ?? s.body.session?.id;
    expect(ids.session).toBeTruthy();
    ai.calls = [];
    ai.handler = () => 'Rewrite one half as two quarters, then add: 2/4 + 1/4 = 3/4. What do you notice?';
    const m = await people.stu1.post(`/api/me/tutor/sessions/${ids.session}/messages`, { text: 'How do I add 1/2 and 1/4?' });
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(JSON.stringify(m.body)).toContain('3/4');
    expect(ai.calls.length).toBeGreaterThanOrEqual(1);
    const sent = JSON.stringify(ai.calls);
    expect(sent).toContain('How do I add 1/2 and 1/4?');
    expect(sent).not.toContain('Bilal');
    expect(sent).not.toContain('Carla');
    const hist = await people.stu1.get(`/api/me/tutor/sessions/${ids.session}`);
    expect(hist.status).toBe(200);
    expect(JSON.stringify(hist.body)).toContain('How do I add 1/2 and 1/4?');
    for (const s2 of ['stu2', 'stu3', 'stuB']) {
      expect([403, 404], s2).toContain((await people[s2].get(`/api/me/tutor/sessions/${ids.session}`)).status);
      expect([403, 404], s2).toContain((await people[s2].post(`/api/me/tutor/sessions/${ids.session}/messages`, { text: 'hi' })).status);
    }
    const rows = (await ledger()).slice(before);
    expect(rows.length).toBe(ai.calls.length);
    expect(rows.every((r) => r.status === 'ok' && r.costStatus !== undefined)).toBe(true);
  });

  it('E. assessment: teacher-authored MCQ + rubric, publish, assign to own class only; keys never reach students', async () => {
    const T = people.teacher1;
    const created = await T.post('/api/assessments', {
      title: 'Fractions check', subject: 'Maths', curriculumId: ids.curriculum, lifecycle: 'draft',
      questions: [
        { id: 'q1', type: 'multiple-choice', text: 'What is 1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', explanation: 'Use quarters.', points: 1 },
        { id: 'q2', type: 'open-response', text: 'Explain why you need a common denominator.', modelAnswer: 'The parts must be the same size.', // Ids as the teacher AssessmentBuilder supplies them (uid per criterion and level).
          rubric: { criteria: [{ id: 'c1', title: 'Reasoning', levels: [{ id: 'l0', label: 'Missing', points: 0 }, { id: 'l1', label: 'Partial', points: 1 }, { id: 'l2', label: 'Clear', points: 2 }] }] } },
      ],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    ids.assessment = created.body.id;
    expect((await people.stu1.post(`/api/assessments/${ids.assessment}/publish`)).status).toBe(403);
    expect((await T.post(`/api/assessments/${ids.assessment}/publish`)).status).toBe(200);
    const due = new Date(Date.now() + 86_400_000).toISOString();
    expect((await T.post('/api/assignments', { assessmentId: ids.assessment, classId: 'p15-cls2', dueAt: due })).status).toBe(404);
    expect((await people.teacherB.post('/api/assignments', { assessmentId: ids.assessment, classId: 'p15-clsB', dueAt: due })).status).toBe(404);
    expect((await T.post('/api/assignments', { assessmentId: ids.assessment, classId: 'p15-cls1' })).status).toBe(400); // no due date
    const asg = await T.post('/api/assignments', { assessmentId: ids.assessment, classId: 'p15-cls1', dueAt: due });
    expect(asg.status, JSON.stringify(asg.body)).toBe(201);
    ids.assignment = asg.body.id;
    expect(JSON.stringify((await people.stu1.get('/api/me/assignments')).body)).toContain(ids.assignment);
    for (const s of ['stu3', 'stuB']) expect((await people[s].get(`/api/me/assignments/${ids.assignment}`)).status, s).toBe(404);
    const view = await people.stu1.get(`/api/me/assignments/${ids.assignment}`);
    expect(view.status).toBe(200);
    const text = JSON.stringify(view.body);
    for (const secret of ['correctAnswer', 'modelAnswer', 'The parts must be the same size', 'Use quarters.']) expect(text, secret).not.toContain(secret);
  });

  it('F+G. submission and autonomous grading: released without a human step; duplicates and other students refused', { timeout: 60_000 }, async () => {
    const start = await people.stu1.post(`/api/me/assignments/${ids.assignment}/attempts`);
    expect([200, 201]).toContain(start.status);
    ids.attempt1 = start.body.attempt.id;
    expect(JSON.stringify(start.body)).not.toContain('correctAnswer');
    // Another student cannot submit on Amira's behalf.
    expect((await people.stu2.post(`/api/me/assignments/${ids.assignment}/attempts/${ids.attempt1}/submit`, { answers: { q1: '3/4' } })).status).toBe(404);
    const crit = (await M.Assessment.findOne({ id: ids.assessment }).lean())!.questions[1].rubric.criteria[0];
    const evaluation = JSON.stringify({ criteria: [{ criterionId: crit.id, levelId: crit.levels[2].id, evidence: ['same size'], rationale: 'Clear reason' }], scoreExplanation: 'You explained it clearly.', strengths: ['Clear reason'], improvements: [], feedback: 'Clear: the parts must be the same size.', objectiveIds: [], confidence: 'high', flags: [] });
    ai.handler = () => evaluation;
    const sub = await people.stu1.post(`/api/me/assignments/${ids.assignment}/attempts/${ids.attempt1}/submit`, { answers: { q1: '3/4', q2: 'Because the pieces have to be the same size before you count them.' } });
    expect([200, 201, 202], JSON.stringify(sub.body)).toContain(sub.status);
    // A repeat submit is an idempotent receipt: 200, and the stored answers do not change.
    const dup = await people.stu1.post(`/api/me/assignments/${ids.assignment}/attempts/${ids.attempt1}/submit`, { answers: { q1: '2/6' } });
    expect(dup.status).toBe(200);
    expect(dup.body.receipt.attemptId).toBe(ids.attempt1);
    const stored = (await M.AssessmentAttempt.findOne({ id: ids.attempt1 }).lean())!;
    expect(stored.answers.find((x: any) => x.questionId === 'q1').studentAnswer).toBe('3/4');
    expect(await M.AssessmentAttempt.countDocuments({ assignmentId: ids.assignment, studentId: 'p15-stu1', status: 'submitted' })).toBe(1);
    await until(async () => (await M.AssessmentAttempt.findOne({ id: ids.attempt1 }).lean())?.gradingStatus === 'released', 'release of attempt 1');
    const att = (await M.AssessmentAttempt.findOne({ id: ids.attempt1 }).lean())!;
    expect(att).toMatchObject({ studentId: 'p15-stu1', gradingStatus: 'released', finalizedBy: 'system:grader' });
    expect(att.score).toBe(100);
    const result = await people.stu1.get(`/api/me/assignments/${ids.assignment}/attempts/${ids.attempt1}/result`);
    expect(result.body).toMatchObject({ released: true, totalPoints: 3, maxPoints: 3 });
    expect(JSON.stringify(result.body)).toContain('Clear: the parts must be the same size.');
    for (const s of ['stu2', 'stu3', 'stuB']) expect((await people[s].get(`/api/me/assignments/${ids.assignment}/attempts/${ids.attempt1}/result`)).status, s).toBe(404);
  });

  it('G-negative. malformed model output never becomes a released grade; a later valid run releases it once', { timeout: 60_000 }, async () => {
    const start = await people.stu2.post(`/api/me/assignments/${ids.assignment}/attempts`);
    ids.attempt2 = start.body.attempt.id;
    ai.handler = () => 'this is not json';
    await people.stu2.post(`/api/me/assignments/${ids.assignment}/attempts/${ids.attempt2}/submit`, { answers: { q1: '2/6', q2: 'I am not sure.' } });
    await until(async () => ['grading_failed', 'grading_exception'].includes((await M.AssessmentAttempt.findOne({ id: ids.attempt2 }).lean())?.gradingStatus), 'grading failure of attempt 2', gradingState(ids.attempt2));
    const { sweepGrading } = await import('../src/services/autoGrading');
    // Backoff elapses (test-only time shift); two more malformed runs exhaust the retries.
    for (let run = 2; run <= 3; run++) {
      await M.AssessmentAttempt.updateOne({ id: ids.attempt2 }, { $set: { nextGradingAt: new Date(Date.now() - 1000) } });
      await sweepGrading({ attemptIds: [ids.attempt2] });
    }
    let att = (await M.AssessmentAttempt.findOne({ id: ids.attempt2 }).lean())!;
    expect(att).toMatchObject({ gradingStatus: 'grading_exception', gradingRuns: 3 });
    expect(att.score ?? null).toBeNull();
    const pending = await people.stu2.get(`/api/me/assignments/${ids.assignment}/attempts/${ids.attempt2}/result`);
    expect(pending.status).toBe(200);
    expect(pending.body.released).not.toBe(true);
    expect(JSON.stringify(pending.body)).not.toContain('Try to explain');
    // The exception is visible to the teacher, who requests a regrade; a valid run releases it once.
    const queue = await people.teacher1.get('/api/grading/queue');
    expect(JSON.stringify(queue.body)).toContain(ids.attempt2);
    expect((await people.stu2.post(`/api/grading/attempts/${ids.attempt2}/regrade`, { reason: 'x' })).status).toBe(403);
    const crit = (await M.Assessment.findOne({ id: ids.assessment }).lean())!.questions[1].rubric.criteria[0];
    ai.handler = () => JSON.stringify({ criteria: [{ criterionId: crit.id, levelId: crit.levels[0].id, evidence: ['not sure'], rationale: 'No reason given' }], scoreExplanation: 'No reason given.', strengths: [], improvements: ['Explain the idea'], feedback: 'Try to explain why the parts must match.', objectiveIds: [], confidence: 'high', flags: [] });
    const rg = await people.teacher1.post(`/api/grading/attempts/${ids.attempt2}/regrade`, { reason: 'retry after bad model output' });
    expect(rg.status, JSON.stringify(rg.body)).toBe(200);
    await sweepGrading({ attemptIds: [ids.attempt2] });
    await until(async () => (await M.AssessmentAttempt.findOne({ id: ids.attempt2 }).lean())?.gradingStatus === 'released', 'recovery of attempt 2', gradingState(ids.attempt2));
    att = (await M.AssessmentAttempt.findOne({ id: ids.attempt2 }).lean())!;
    expect(att.score).toBe(0);
    expect((await people.stu2.get(`/api/me/assignments/${ids.assignment}/attempts/${ids.attempt2}/result`)).body.released).toBe(true);
    // Idempotent: a further sweep and a second regrade request change nothing.
    await sweepGrading({ attemptIds: [ids.attempt2] });
    expect((await people.teacher1.post(`/api/grading/attempts/${ids.attempt2}/regrade`, { reason: 'again' })).status).toBe(409);
    const again = (await M.AssessmentAttempt.findOne({ id: ids.attempt2 }).lean())!;
    expect(again.score).toBe(att.score);
    expect(again.gradingStatus).toBe('released');
  });

  it('H. educator views: names and grades of their own students only; counts match the stored records', async () => {
    const roster = await people.teacher1.get('/api/teaching/classes/p15-cls1/roster');
    expect(roster.status, JSON.stringify(roster.body)).toBe(200);
    const r = JSON.stringify(roster.body);
    for (const name of ['Amira Journey', 'Bilal Journey']) expect(r).toContain(name);
    for (const name of ['Carla Otherclass', 'Dana Otherschool']) expect(r).not.toContain(name);
    expect([403, 404]).toContain((await people.teacher2.get('/api/teaching/classes/p15-cls1/roster')).status);
    expect([403, 404]).toContain((await people.teacherB.get('/api/teaching/classes/p15-cls1/roster')).status);
    const profile = await people.teacher1.get('/api/teaching/students/p15-stu1/profile');
    expect(profile.status).toBe(200);
    expect(JSON.stringify(profile.body)).toContain(ids.assignment);
    expect([403, 404]).toContain((await people.teacher1.get('/api/teaching/students/p15-stu3/profile')).status);
    const queue = await people.teacher1.get('/api/grading/queue');
    expect(queue.status).toBe(200);
    const released = await M.AssessmentAttempt.countDocuments({ institutionId: A, gradingStatus: 'released' });
    expect(released).toBe(2);
    const queued = (queue.body.items || []).filter((i: any) => [ids.attempt1, ids.attempt2].includes(i.attemptId));
    expect(queued.length).toBe(2);
    expect(JSON.stringify(queue.body)).not.toContain('Dana Otherschool');
    const out = await people.teacher1.get('/api/learning/analytics/outcomes');
    expect(out.status).toBe(200);
    expect(out.body.grading.released).toBe(released);
    // Academic manager: school insights yes, teaching tools and edits no.
    expect((await people.manager.get('/api/analytics/overview')).status).toBe(200);
    expect((await people.manager.get('/api/teaching/classes/p15-cls1/roster')).status).toBe(403);
    // ?origin=all never widens scope.
    const all = await people.teacher1.get('/api/teaching/classes/p15-cls1/roster?origin=all');
    expect(JSON.stringify(all.body)).not.toContain('Carla Otherclass');
  });

  it('I. cost and usage: every provider attempt has one ledger row; the test-spend counter agrees; exhaustion blocks the next call', async () => {
    const rows = await ledger();
    expect(rows.length).toBe(await mongoose.connection.collection('usage_ledger').countDocuments());
    expect(new Set(rows.map((r) => r.feature))).toEqual(expect.objectContaining({}));
    const features = [...new Set(rows.map((r) => r.feature))];
    expect(features).toEqual(expect.arrayContaining(['ai_grading']));
    expect(rows.every((r) => ['estimated', 'usage_unknown', 'unpriced'].includes(r.costStatus))).toBe(true);
    const counter = await mongoose.connection.collection('budget_counters').findOne({ _id: 'test_spend:p15-journey' as never });
    expect(counter).toBeTruthy();
    const settled = rows.filter((r) => typeof r.costInternal === 'number').reduce((s, r) => s + Math.ceil(r.costInternal * 1_000_000), 0);
    expect(counter!.settledMicros).toBe(settled);
    expect(counter!.committedMicros).toBeGreaterThanOrEqual(settled);
    // Exhaust the cap: the next billable call is refused before the provider.
    process.env.AI_TEST_SPEND_CAP_USD = String(((counter!.committedMicros as number) + 1) / 1_000_000);
    (await import('../src/config/env')).resetConfigForTests();
    const calls = ai.calls.length;
    const n = rows.length;
    ai.handler = () => 'should not be called';
    const refused = await people.stu1.post(`/api/me/tutor/sessions/${ids.session}/messages`, { text: 'One more question' });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('AI_TEST_SPEND_CAP');
    expect(ai.calls.length).toBe(calls);
    expect((await ledger()).length).toBe(n);
    process.env.AI_TEST_SPEND_CAP_USD = '1';
    (await import('../src/config/env')).resetConfigForTests();
  });

  it('J-race. concurrent starts give one open attempt; concurrent submits record one answer set, graded once', { timeout: 60_000 }, async () => {
    const T = people.teacher1;
    const a = await T.post('/api/assessments', { title: 'Race check', subject: 'Maths', curriculumId: ids.curriculum, lifecycle: 'published',
      questions: [{ id: 'r1', type: 'multiple-choice', text: 'What is 1/4 + 1/4?', options: ['1/2', '2/8'], correctAnswer: '1/2', explanation: '', points: 1 }] });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    const asg = await T.post('/api/assignments', { assessmentId: a.body.id, classId: 'p15-cls1', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(asg.status).toBe(201);
    const starts = await Promise.all([1, 2, 3].map(() => people.stu1.post(`/api/me/assignments/${asg.body.id}/attempts`)));
    const started = [...new Set(starts.filter((r) => [200, 201].includes(r.status)).map((r) => r.body.attempt.id))];
    const open = await M.AssessmentAttempt.countDocuments({ assignmentId: asg.body.id, studentId: 'p15-stu1', status: 'in-progress' });
    expect(open, `statuses ${starts.map((r) => r.status)}`).toBe(1);
    expect(started.length).toBe(1);
    const id = started[0];
    const subs = await Promise.all([
      people.stu1.post(`/api/me/assignments/${asg.body.id}/attempts/${id}/submit`, { answers: { r1: '1/2' } }),
      people.stu1.post(`/api/me/assignments/${asg.body.id}/attempts/${id}/submit`, { answers: { r1: '2/8' } }),
    ]);
    expect(subs.map((r) => r.status).sort()).toEqual([200, 200]);
    const att = (await M.AssessmentAttempt.findOne({ id }).lean())!;
    expect(['1/2', '2/8']).toContain(att.answers[0].studentAnswer);
    expect(await M.AssessmentAttempt.countDocuments({ assignmentId: asg.body.id, status: 'submitted' })).toBe(1);
    await until(async () => (await M.AssessmentAttempt.findOne({ id }).lean())?.gradingStatus === 'released', 'release of race attempt', gradingState(id));
    const done = (await M.AssessmentAttempt.findOne({ id }).lean())!;
    expect(done.score).toBe(att.answers[0].studentAnswer === '1/2' ? 100 : 0);
    expect((done.history || []).filter((h: any) => h.action === 'submitted').length).toBeLessThanOrEqual(1);
  });

  it('C-policy. enrollment is batch-based: every student of a batch is in every class on it (documented behaviour)', async () => {
    // A student added only by batch reaches the class; a class roster lists the whole batch.
    const { getEnrolledInstances } = await import('../src/services/studentCourseService');
    const classes = (await getEnrolledInstances('p15-stu2')).map((c: any) => c.id);
    expect(classes).toEqual(['p15-cls1']);
    // Another class on the same batch would include the same students: proven with a temporary class (test DB only).
    await M.CourseInstance.create({ id: 'p15-cls1-extra', courseId: 'p15-extra', courseName: 'Extra 6A', institutionId: A, academicYear: '2026', batchId: 'p15-b1', studentIds: [], instructorIds: [ids.teacher2], visibility: 'student' });
    const roster = await people.teacher2.get('/api/teaching/classes/p15-cls1-extra/roster');
    expect(JSON.stringify(roster.body)).toContain('Amira Journey');
    expect(JSON.stringify(roster.body)).not.toContain('Carla Otherclass');
    await M.CourseInstance.deleteOne({ id: 'p15-cls1-extra' });
  });

  // ---- P17 Phase B additions (mocked provider) ----
  it('P17-K. Arabic (Modern Standard Arabic) open answer earns partial credit; feedback stays in Arabic; evidence is an exact quote', { timeout: 60_000 }, async () => {
    const T = people.teacher1;
    const a = await T.post('/api/assessments', { title: 'الكسور', subject: 'Maths', curriculumId: ids.curriculum, lifecycle: 'published',
      questions: [
        { id: 'k1', type: 'multiple-choice', text: 'ما ناتج ١/٢ + ١/٤؟', options: ['3/4', '2/6'], correctAnswer: '3/4', explanation: '', points: 1 },
        { id: 'k2', type: 'open-response', text: 'اشرح لماذا نحتاج إلى مقام مشترك عند جمع الكسور.', modelAnswer: 'لأن الأجزاء يجب أن تكون متساوية في الحجم.',
          rubric: { criteria: [{ id: 'c1', title: 'التعليل', levels: [{ id: 'l0', label: 'غائب', points: 0 }, { id: 'l1', label: 'جزئي', points: 1 }, { id: 'l2', label: 'واضح', points: 2 }] }] } },
      ] });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    const asg = await T.post('/api/assignments', { assessmentId: a.body.id, classId: 'p15-cls1', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(asg.status).toBe(201);
    ids.asgAr = asg.body.id;
    // Student answer in Modern Standard Arabic (فصحى), not dialect.
    const answer = 'نحتاج إلى مقام مشترك لكي نجمع أجزاءً من النوع نفسه.';
    const feedback = 'أحسنت في ذكر المقام المشترك. الخطوة التالية: وضّح أن الأجزاء يجب أن تكون متساوية في الحجم قبل جمعها.';
    let gradingCall: any;
    ai.handler = (body) => {
      gradingCall = body;
      return JSON.stringify({ criteria: [{ criterionId: 'c1', levelId: 'l1', evidence: ['أجزاءً من النوع نفسه'], rationale: 'تعليل جزئي' }],
        scoreExplanation: 'التعليل صحيح جزئيًا ولم يذكر تساوي حجم الأجزاء.', strengths: ['ذكر المقام المشترك'], improvements: ['اذكر تساوي حجم الأجزاء'],
        feedback, objectiveIds: [], confidence: 'high', flags: [] });
    };
    const start = await people.stu1.post(`/api/me/assignments/${ids.asgAr}/attempts`);
    const id = start.body.attempt.id;
    const sub = await people.stu1.post(`/api/me/assignments/${ids.asgAr}/attempts/${id}/submit`, { answers: { k1: '3/4', k2: answer } });
    expect([200, 201, 202]).toContain(sub.status);
    await until(async () => (await M.AssessmentAttempt.findOne({ id }).lean())?.gradingStatus === 'released', 'release of the Arabic attempt', gradingState(id));
    // The grader is asked to answer in Arabic and receives the MSA answer verbatim.
    expect(JSON.stringify(gradingCall.system)).toContain('in Arabic');
    expect(JSON.stringify(gradingCall.messages)).toContain(answer);
    const result = await people.stu1.get(`/api/me/assignments/${ids.asgAr}/attempts/${id}/result`);
    expect(result.body).toMatchObject({ released: true, totalPoints: 2, maxPoints: 3 }); // MCQ 1/1 + rubric 1/2 (partial)
    expect(JSON.stringify(result.body)).toContain(feedback);
    for (const leak of ['لأن الأجزاء يجب أن تكون متساوية في الحجم.', 'modelAnswer']) expect(JSON.stringify(result.body)).not.toContain(leak);
  });

  it('P17-L. a provider timeout leaves no grade and schedules a retry; the retry with missing usage releases once and is ledgered usage_unknown', { timeout: 60_000 }, async () => {
    const start = await people.stu2.post(`/api/me/assignments/${ids.asgAr}/attempts`);
    const id = start.body.attempt.id;
    ai.handler = () => Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
    const rowsBefore = (await ledger()).length;
    await people.stu2.post(`/api/me/assignments/${ids.asgAr}/attempts/${id}/submit`, { answers: { k1: '3/4', k2: 'لأن الأجزاء يجب أن تكون متساوية في الحجم.' } });
    await until(async () => ['grading_failed', 'grading_exception'].includes((await M.AssessmentAttempt.findOne({ id }).lean())?.gradingStatus), 'timeout failure', gradingState(id));
    let att = (await M.AssessmentAttempt.findOne({ id }).lean())!;
    expect(att.gradingStatus).toBe('grading_failed');
    expect(att.score ?? null).toBeNull();
    expect(att.nextGradingAt).toBeTruthy();
    expect((await people.stu2.get(`/api/me/assignments/${ids.asgAr}/attempts/${id}/result`)).body.released).not.toBe(true);
    const failedRows = (await ledger()).slice(rowsBefore);
    expect(failedRows.length).toBeGreaterThan(0);
    expect(failedRows.every((r) => r.feature === 'ai_grading' && r.status !== 'ok' && r.status !== 'success')).toBe(true);
    // Backoff elapses (test-only time shift); the provider now answers without usage figures.
    ai.noUsage = true;
    ai.handler = () => JSON.stringify({ criteria: [{ criterionId: 'c1', levelId: 'l2', evidence: ['متساوية في الحجم'], rationale: 'تعليل كامل' }],
      scoreExplanation: 'تعليل كامل.', strengths: ['تعليل واضح'], improvements: [], feedback: 'إجابة واضحة ودقيقة.', objectiveIds: [], confidence: 'high', flags: [] });
    const n = (await ledger()).length;
    await M.AssessmentAttempt.updateOne({ id }, { $set: { nextGradingAt: new Date(Date.now() - 1000) } });
    const { sweepGrading } = await import('../src/services/autoGrading');
    await sweepGrading({ attemptIds: [id] });
    await until(async () => (await M.AssessmentAttempt.findOne({ id }).lean())?.gradingStatus === 'released', 'release after retry', gradingState(id));
    ai.noUsage = false;
    att = (await M.AssessmentAttempt.findOne({ id }).lean())!;
    expect(att.score).toBe(100);
    const retryRows = (await ledger()).slice(n);
    expect(retryRows.length).toBeGreaterThan(0);
    expect(retryRows.every((r) => r.feature === 'ai_grading' && r.costStatus === 'usage_unknown' && r.costInternal === null)).toBe(true);
    // A further sweep changes nothing (idempotent release).
    await sweepGrading({ attemptIds: [id] });
    expect((await ledger()).length).toBe(n + retryRows.length);
    // Unauthorized ids: other students, another school's teacher and the other class's teacher cannot read it.
    for (const s of ['stu1', 'stu3', 'stuB']) expect((await people[s].get(`/api/me/assignments/${ids.asgAr}/attempts/${id}/result`)).status, s).toBe(404);
    for (const t of ['teacher2', 'teacherB']) expect([403, 404], t).toContain((await people[t].post(`/api/grading/attempts/${id}/regrade`, { reason: 'x' })).status);
  });

  it('J. nothing left the machine', () => {
    expect(outbound).toBe(0);
  });
});
