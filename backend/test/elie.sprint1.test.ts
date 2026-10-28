import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findCycle, prerequisiteClosure, readyToLearn, weakPrerequisites } from '../src/services/objectiveGraph';

const ai = vi.hoisted(() => ({ reply: '' }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn(async () => ({ model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: ai.reply }] })) };
    beta = { messages: { create: vi.fn(), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: 'test-jwt-secret-32-characters-minimum',
    JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend',
    JWT_AUDIENCE: 'enara-platform',
    INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999',
    ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998',
    AWS_S3_BUCKET: 'test-bucket',
    TRUST_PROXY: 'false',
    SERVE_LOCAL_UPLOADS: 'false',
    ANTHROPIC_API_KEY: 'test-key',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {
    User: (await import('../src/models/User')).User,
    Institution: (await import('../src/models/Institution')).Institution,
    Curriculum: (await import('../src/models/Curriculum')).Curriculum,
    CourseInstance: (await import('../src/models/CourseInstance')).CourseInstance,
    Student: (await import('../src/models/Student')).Student,
    StudentCredit: (await import('../src/models/StudentCredit')).StudentCredit,
    Assessment: (await import('../src/models/Assessment')).Assessment,
    AssessmentAttempt: (await import('../src/models/AssessmentAttempt')).AssessmentAttempt,
    LearningObjective: (await import('../src/models/LearningObjective')).LearningObjective,
    LearningEvent: (await import('../src/models/LearningEvent')).LearningEvent,
  };
  await mongoose.connect(mongo.getUri());
  await M.LearningEvent.createIndexes();
  await M.LearningObjective.createIndexes();
  app = (await import('../src/app')).createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  await mongoose.connection.collection('migrations').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([
    { id: 'instA', name: 'School A', features: { learning_intelligence_enabled: true } },
    { id: 'instB', name: 'School B', features: { learning_intelligence_enabled: true } },
    { id: 'instOff', name: 'School Off' },
  ]);
  await M.Curriculum.create([
    { id: 'curA', name: 'Algebra', courseName: 'Algebra', institutionId: 'instA', summary: 'Algebra', lastUpdated: '2026-01-01', chapters: [{ id: 'L1', title: 'Expressions', uploads: [] }, { id: 'L2', title: 'Equations', uploads: [] }] },
    { id: 'curB', name: 'Biology', courseName: 'Biology', institutionId: 'instB', summary: 'Cells', lastUpdated: '2026-01-01', chapters: [{ id: 'B1', title: 'Cells', uploads: [] }] },
    { id: 'curOff', name: 'Off', courseName: 'Off', institutionId: 'instOff', summary: 'x', lastUpdated: '2026-01-01', chapters: [] },
  ]);
});

const users = { n: 0 };
async function bearer(role: 'student' | 'teacher' | 'admin' | 'enara-admin', institutionId?: string, studentId?: string) {
  users.n += 1;
  const email = `${role}${users.n}@example.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  return { id: user._id.toString(), auth: `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId, studentId })}` };
}

const post = (url: string, auth: string, body: object = {}) => request(app).post(url).set('Authorization', auth).send(body);
const patch = (url: string, auth: string, body: object) => request(app).patch(url).set('Authorization', auth).send(body);
const get = (url: string, auth: string) => request(app).get(url).set('Authorization', auth);

describe('prerequisite graph (unit)', () => {
  const nodes = [
    { id: 'a', prerequisiteObjectiveIds: [] },
    { id: 'b', prerequisiteObjectiveIds: ['a'] },
    { id: 'c', prerequisiteObjectiveIds: ['b'] },
    { id: 'd', prerequisiteObjectiveIds: ['a', 'c'] },
  ];
  it('finds cycles and ignores archived nodes', () => {
    expect(findCycle(nodes)).toBeNull();
    expect(findCycle([...nodes, { id: 'a2', prerequisiteObjectiveIds: ['d'] }].map((n) => (n.id === 'a' ? { ...n, prerequisiteObjectiveIds: ['a2'] } : n)))).toEqual(
      expect.arrayContaining(['a', 'a2', 'd']),
    );
    expect(findCycle([{ id: 'x', prerequisiteObjectiveIds: ['y'] }, { id: 'y', prerequisiteObjectiveIds: ['x'], status: 'archived' }])).toBeNull();
  });
  it('walks prerequisites, nearest first', () => {
    expect(prerequisiteClosure(nodes, 'd')).toEqual([
      { id: 'a', depth: 1 },
      { id: 'c', depth: 1 },
      { id: 'b', depth: 2 },
    ]);
  });
  it('finds what is ready to learn and which prerequisites are weak', () => {
    const met = new Set(['a']);
    expect(readyToLearn(nodes, (id) => met.has(id))).toEqual(['b']);
    expect(weakPrerequisites(nodes, 'd', (id) => met.has(id)).map((p) => p.id)).toEqual(['c', 'b']);
  });
});

describe('feature flags', () => {
  it('keeps the engine off until an Enara admin enables it for the school', async () => {
    const admin = await bearer('admin', 'instOff');
    expect((await get('/api/learning/objectives', admin.auth)).body.error.code).toBe('FEATURE_DISABLED');
    expect((await request(app).put('/api/learning/flags').set('Authorization', admin.auth).send({ institutionId: 'instOff', flags: { learning_intelligence_enabled: true } })).status).toBe(403);

    const enara = await bearer('enara-admin');
    const set = await request(app).put('/api/learning/flags').set('Authorization', enara.auth).send({ institutionId: 'instOff', flags: { diagnostics_enabled: true } });
    expect(set.body.flags.diagnostics_enabled).toBe(false); // needs the master flag
    await request(app).put('/api/learning/flags').set('Authorization', enara.auth).send({ institutionId: 'instOff', flags: { learning_intelligence_enabled: true } });
    expect((await get('/api/learning/flags', admin.auth)).body.flags).toMatchObject({ learning_intelligence_enabled: true, diagnostics_enabled: true });
    expect((await get('/api/learning/objectives', admin.auth)).status).toBe(200);
    expect((await request(app).put('/api/learning/flags').set('Authorization', enara.auth).send({ institutionId: 'instOff', flags: { bogus: true } })).status).toBe(400);
  });
});

describe('learning objectives', () => {
  it('creates, edits with history, and approves in prerequisite order', async () => {
    const admin = await bearer('admin', 'instA');
    const a = await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'ALG.1', title: 'Simplify expressions', lessonIds: ['L1'] });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ status: 'draft', version: 1, origin: 'teacher', institutionId: 'instA' });
    const b = await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'ALG.2', title: 'Solve linear equations', lessonIds: ['L2'], prerequisiteObjectiveIds: [a.body.id] });
    expect(b.status).toBe(201);

    expect((await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'ALG.1', title: 'dup' })).status).toBe(409);
    expect((await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'ALG.3', title: 'x', lessonIds: ['B1'] })).status).toBe(400);

    const early = await post(`/api/learning/objectives/${b.body.id}/approve`, admin.auth);
    expect(early.body.error.code).toBe('PREREQUISITES_NOT_APPROVED');
    expect((await post(`/api/learning/objectives/${a.body.id}/approve`, admin.auth)).body.status).toBe('approved');
    expect((await post(`/api/learning/objectives/${b.body.id}/approve`, admin.auth)).body.status).toBe('approved');

    const edited = await patch(`/api/learning/objectives/${a.body.id}`, admin.auth, { title: 'Simplify algebraic expressions', translations: { ar: { title: 'تبسيط العبارات الجبرية' } } });
    expect(edited.body).toMatchObject({ version: 2, status: 'approved', translations: { ar: { title: 'تبسيط العبارات الجبرية' } } });
    expect(edited.body.history.at(-1).fields).toEqual(expect.arrayContaining(['title', 'translations']));

    const pre = await get(`/api/learning/objectives/${b.body.id}/prerequisites`, admin.auth);
    expect(pre.body.prerequisites.map((p: any) => p.objective.code)).toEqual(['ALG.1']);
  });

  it('rejects prerequisite cycles', async () => {
    const admin = await bearer('admin', 'instA');
    const a = await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'A', title: 'A' });
    const b = await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'B', title: 'B', prerequisiteObjectiveIds: [a.body.id] });
    const c = await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'C', title: 'C', prerequisiteObjectiveIds: [b.body.id] });
    const loop = await patch(`/api/learning/objectives/${a.body.id}`, admin.auth, { prerequisiteObjectiveIds: [c.body.id] });
    expect(loop.status).toBe(400);
    expect(loop.body.error.code).toBe('PREREQUISITE_CYCLE');
    expect((await patch(`/api/learning/objectives/${a.body.id}`, admin.auth, { prerequisiteObjectiveIds: [a.body.id] })).status).toBe(400);
  });

  it('archives instead of deleting, but not while others depend on it', async () => {
    const admin = await bearer('admin', 'instA');
    const a = await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'A', title: 'A' });
    const b = await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'B', title: 'B', prerequisiteObjectiveIds: [a.body.id] });
    expect((await patch(`/api/learning/objectives/${a.body.id}`, admin.auth, { status: 'archived' })).body.error.code).toBe('OBJECTIVE_IN_USE');
    await patch(`/api/learning/objectives/${b.body.id}`, admin.auth, { prerequisiteObjectiveIds: [] });
    expect((await patch(`/api/learning/objectives/${a.body.id}`, admin.auth, { status: 'archived' })).body.status).toBe('archived');
    const list = await get('/api/learning/objectives?curriculumId=curA', admin.auth);
    expect(list.body.objectives.map((o: any) => o.code)).toEqual(['B']);
    expect(await M.LearningObjective.countDocuments({ code: 'A' })).toBe(1);
    expect((await patch(`/api/learning/objectives/${a.body.id}`, admin.auth, { status: 'approved' })).status).toBe(400);
  });

  it('keeps schools and classes apart', async () => {
    const adminA = await bearer('admin', 'instA');
    const adminB = await bearer('admin', 'instB');
    const obj = await post('/api/learning/objectives', adminA.auth, { curriculumId: 'curA', code: 'A', title: 'A' });
    expect((await get(`/api/learning/objectives/${obj.body.id}`, adminB.auth)).status).toBe(404);
    expect((await patch(`/api/learning/objectives/${obj.body.id}`, adminB.auth, { title: 'hijack' })).status).toBe(404);
    expect((await post('/api/learning/objectives', adminB.auth, { curriculumId: 'curA', code: 'Z', title: 'Z' })).status).toBe(404);
    expect((await get('/api/learning/objectives', adminB.auth)).body.objectives).toHaveLength(0);

    const teacher = await bearer('teacher', 'instA');
    expect((await post('/api/learning/objectives', teacher.auth, { curriculumId: 'curA', code: 'T', title: 'T' })).status).toBe(403);
    await M.CourseInstance.create({ id: 'cls', courseId: 'algebra', courseName: 'Algebra', institutionId: 'instA', academicYear: '2026', batchId: 'bA', curriculumId: 'curA', studentIds: [], instructorIds: [teacher.id] });
    expect((await post('/api/learning/objectives', teacher.auth, { curriculumId: 'curA', code: 'T', title: 'T' })).status).toBe(201);
    expect((await get('/api/learning/objectives', teacher.auth)).body.objectives).toHaveLength(2);

    const student = await bearer('student', 'instA', 'stu1');
    expect((await get('/api/learning/objectives', student.auth)).status).toBe(403);
  });

  it('stores AI proposals as validated drafts and never overwrites existing codes', async () => {
    const admin = await bearer('admin', 'instA');
    await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'ALG.1', title: 'Existing' });
    ai.reply = JSON.stringify({
      objectives: [
        { code: 'ALG.1', title: 'Would overwrite', lessonIds: ['L1'] },
        { code: 'ALG.2', title: 'Solve equations', lessonIds: ['L2', 'NOT-A-LESSON'], prerequisiteCodes: ['ALG.1', 'ALG.3'], difficultyLevel: 9 },
        { code: 'ALG.3', title: 'Check solutions', lessonIds: ['L2'], prerequisiteCodes: ['ALG.2'] },
        { code: 'bad code!', title: 'Invalid' },
      ],
    });
    const res = await post('/api/learning/objectives/extract', admin.auth, { curriculumId: 'curA' });
    expect(res.status).toBe(201);
    expect(res.body.skippedExistingCodes).toEqual(['ALG.1']);
    expect(res.body.created.map((o: any) => o.code).sort()).toEqual(['ALG.2', 'ALG.3']);
    expect(res.body.droppedCyclicLinks).toBe(1);
    const alg2 = res.body.created.find((o: any) => o.code === 'ALG.2');
    expect(alg2).toMatchObject({ status: 'draft', origin: 'ai', lessonIds: ['L2'], difficultyLevel: 5 });
    expect(alg2.extraction.method).toBe('claude-objective-extraction-v1');
    expect((await M.LearningObjective.findOne({ code: 'ALG.1' }))!.title).toBe('Existing');
    const all = await M.LearningObjective.find({ curriculumId: 'curA' }).lean();
    expect(findCycle(all as any)).toBeNull();
  });
});

describe('question tags and events', () => {
  it('tags questions with objectives of the same school and records them on events, once', async () => {
    const admin = await bearer('admin', 'instA');
    const adminB = await bearer('admin', 'instB');
    const obj = await post('/api/learning/objectives', admin.auth, { curriculumId: 'curA', code: 'A', title: 'A' });
    const question = { id: 'q1', type: 'multiple-choice', text: '2+2', options: ['3', '4'], correctAnswer: '4', objectiveIds: [obj.body.id], difficulty: 2 };
    expect((await post('/api/assessments', adminB.auth, { title: 'X', subject: 'Math', questions: [question] })).status).toBe(400);
    const created = await post('/api/assessments', admin.auth, { title: 'Quiz', subject: 'Math', status: 'active', batchId: 'bA', questions: [question] });
    expect(created.status).toBe(201);
    expect(created.body.questions[0]).toMatchObject({ objectiveIds: [obj.body.id], difficulty: 2 });

    await M.Student.create({ id: 'stu1', name: 'S', email: 's@x.com', grade: '10', institutionId: 'instA', batchId: 'bA' });
    await M.StudentCredit.create({ studentId: 'stu1', institutionId: 'instA', limit: 100, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    const student = await bearer('student', 'instA', 'stu1');
    const start = await post(`/api/me/assessments/${created.body.id}/attempts`, student.auth);
    await post(`/api/me/assessments/${created.body.id}/attempts/${start.body.attempt.id}/submit`, student.auth, { answers: { q1: '4' } });

    const answered = await M.LearningEvent.findOne({ type: 'question_answered' }).lean();
    expect(answered).toMatchObject({
      objectiveIds: [obj.body.id],
      idempotencyKey: `attempt:${start.body.attempt.id}:q:q1`,
      schemaVersion: 2,
      processing: { evidence: 'pending' },
    });

    // Replaying the same action stores nothing new.
    const { recordLearningEvents } = await import('../src/services/learningEvents');
    await recordLearningEvents([{ ...answered, id: undefined } as any]);
    expect(await M.LearningEvent.countDocuments({ type: 'question_answered' })).toBe(1);
  });

  it('rejects malformed and spoofed events', async () => {
    const { validateLearningEvent } = await import('../src/services/learningEvents');
    expect(validateLearningEvent({ studentId: 's', type: 'question_answered', source: 'assessment', verified: true, refs: { assessmentId: 'a' } })).toMatch(/questionId/);
    expect(validateLearningEvent({ studentId: 's', type: 'lesson_viewed', source: 'client', verified: true, refs: { courseId: 'c', lessonId: 'l' } })).toMatch(/cannot be verified/);
    expect(validateLearningEvent({ studentId: 's', type: 'tutor_reply', source: 'tutor_chat', verified: true, refs: { sessionId: 's', messageId: 'm' } })).toMatch(/cannot be verified/);
  });
});

describe('foundations migration', () => {
  it('keys older events and marks duplicates instead of deleting them', async () => {
    const base = { studentId: 'stu1', institutionId: 'instA', type: 'question_answered', source: 'assessment', verified: true, refs: { assessmentId: 'a', attemptId: 'att', questionId: 'q1' }, outcome: { correct: true } };
    await M.LearningEvent.collection.insertMany([
      { ...base, id: 'old-1', at: new Date('2026-01-01'), conceptIds: [] },
      { ...base, id: 'old-2', at: new Date('2026-01-02'), conceptIds: [] },
      { id: 'old-3', studentId: 'stu1', type: 'lesson_viewed', source: 'client', verified: false, refs: { courseId: 'c', lessonId: 'l' }, at: new Date(), conceptIds: [] },
    ]);
    const { MIGRATIONS } = await import('../src/migrations');
    const { runMigrations } = await import('../src/migrations/runner');
    await runMigrations(MIGRATIONS);
    const [first, second, viewed] = await M.LearningEvent.find({}).sort({ id: 1 }).lean();
    expect(first).toMatchObject({ idempotencyKey: 'attempt:att:q:q1', processing: { evidence: 'pending' } });
    expect(second).toMatchObject({ supersededBy: 'old-1', processing: { evidence: 'not_applicable' } });
    expect(viewed.processing.evidence).toBe('not_applicable');
    expect(await M.LearningEvent.countDocuments()).toBe(3);
  });
});
