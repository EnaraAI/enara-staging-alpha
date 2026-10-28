import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Sprint 7: shadow mode, remaining security checks, migration validation and
// forward recovery (rebuilding derived learning data from events).

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
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'StudentCredit', 'Assessment', 'AssessmentAttempt', 'LearningObjective',
    'LearningEvent', 'LearningEvidence', 'ObjectiveRetentionState', 'ReviewItem', 'TimeToUnderstand']) {
    M[name] = (await import(`../src/models/${name}`))[name];
  }
  const mastery = await import('../src/models/StudentObjectiveMastery');
  M.StudentObjectiveMastery = mastery.StudentObjectiveMastery;
  M.MasteryHistory = mastery.MasteryHistory;
  await mongoose.connect(mongo.getUri());
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const ALL_FLAGS = {
  learning_intelligence_enabled: true, diagnostics_enabled: true, mastery_tracking_enabled: true, misconception_detection_enabled: true,
  adaptive_pedagogy_enabled: true, learning_pathways_enabled: true, teacher_learning_insights_enabled: true, retention_intelligence_enabled: true,
};
let n = 0;
async function bearer(role: 'student' | 'teacher' | 'admin' | 'enara-admin', institutionId?: string, studentId?: string) {
  n += 1;
  const email = `${role}${n}@x.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  return { id: user._id.toString(), auth: `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId, studentId })}` };
}
const api = (auth: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', auth),
  post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', auth).send(body),
  put: (url: string, body: object) => request(app).put(url).set('Authorization', auth).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set('Authorization', auth).send(body),
});
const question = (id: string, objectiveId: string) => ({ id, type: 'multiple-choice', text: `${id}?`, options: ['right', 'wrong'], correctAnswer: 'right', explanation: '', objectiveIds: [objectiveId], difficulty: 3 });

let teacher: { id: string; auth: string };
beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  await mongoose.connection.collection('migrations').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([{ id: 'instA', name: 'A', features: ALL_FLAGS }, { id: 'instB', name: 'B', features: ALL_FLAGS }]);
  await M.Curriculum.create({ id: 'cur', name: 'Algebra', courseName: 'Algebra', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [{ id: 'L1', title: 'L', uploads: [] }] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create({ id: 'course', courseId: 'alg', courseName: 'Algebra', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: [], instructorIds: [teacher.id], visibility: 'student' });
  await M.Student.create([
    { id: 'stu1', name: 'Amira', email: 'a@x.com', grade: '10', institutionId: 'instA', batchId: 'b' },
    { id: 'stu2', name: 'Bilal', email: 'b@x.com', grade: '10', institutionId: 'instA', batchId: 'other' },
  ]);
  await M.StudentCredit.create({ studentId: 'stu1', institutionId: 'instA', limit: 100, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.LearningObjective.create({ id: 'obj', institutionId: 'instA', curriculumId: 'cur', code: 'ALG.1', title: 'Equations', status: 'approved', lessonIds: ['L1'] });
  await M.Assessment.create({ id: 'quiz', title: 'Quiz', institutionId: 'instA', subject: 'Math', status: 'active', dueDate: '2099-01-01', batchId: 'b', curriculumId: 'cur',
    questions: ['q1', 'q2', 'q3', 'q4'].map((id) => question(id, 'obj')) });
});

async function takeQuiz(auth: string, answers: Record<string, string>) {
  const s = api(auth);
  const start = await s.post('/api/me/assessments/quiz/attempts');
  const submit = await s.post(`/api/me/assessments/quiz/attempts/${start.body.attempt.id}/submit`, { answers });
  expect(submit.status).toBe(200);
}

describe('shadow mode', () => {
  it('computes everything, shows it to staff only, and leaves the student experience unchanged', async () => {
    const enara = api((await bearer('enara-admin')).auth);
    const admin = api((await bearer('admin', 'instA')).auth);
    expect((await admin.put('/api/learning/settings', { shadowMode: true })).status).toBe(403);
    const set = await enara.put('/api/learning/settings', { institutionId: 'instA', shadowMode: true });
    expect(set.body.settings.shadowMode).toBe(true);

    const student = await bearer('student', 'instA', 'stu1');
    // The quiz is high-scoring, but answers on the tagged questions are mixed.
    await takeQuiz(student.auth, { q1: 'right', q2: 'right', q3: 'right', q4: 'wrong' });
    const state = await M.StudentObjectiveMastery.findOne({ studentId: 'stu1', objectiveId: 'obj' }).lean();
    expect(state.evidenceCount).toBe(4);

    const s = api(student.auth);
    for (const url of ['/api/learning/students/me/knowledge-map', '/api/learning/students/me/recommendations', '/api/learning/students/me/retention']) {
      const res = await s.get(url);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    }
    expect((await s.post('/api/learning/diagnostics', { courseId: 'course' })).status).toBe(404);
    expect((await s.post('/api/learning/interventions', { objectiveId: 'obj' })).status).toBe(404);
    const { buildObjectiveContext } = await import('../src/services/learningContext');
    expect(await buildObjectiveContext({ institutionId: 'instA', studentId: 'stu1', objectiveId: 'obj' })).toBeNull();

    // Staff still see the results.
    const insights = await api(teacher.auth).get('/api/learning/classes/course/insights');
    expect(insights.status).toBe(200);
    expect(insights.body.heatmap[0].cells[0].masteryStatus).toBe(state.masteryStatus);
    expect((await api(teacher.auth).get('/api/learning/students/stu1/mastery')).status).toBe(200);

    // The comparison report checks estimates against existing assessment scores.
    const cmp = await admin.get('/api/learning/analytics/shadow-comparison');
    expect(cmp.status).toBe(200);
    expect(cmp.body).toMatchObject({ statesCompared: 1, agree: expect.any(Number), disagree: expect.any(Number), noScore: 0 });
    expect(cmp.body.agree + cmp.body.disagree).toBe(1);
    expect(cmp.body.definitions.caveat).toMatch(/not a measure of accuracy/);

    // Turning shadow mode off shows students their results again.
    await enara.put('/api/learning/settings', { institutionId: 'instA', shadowMode: false });
    expect((await s.get('/api/learning/students/me/knowledge-map')).status).toBe(200);
  });

  it('lists strong disagreements for review', async () => {
    const admin = api((await bearer('admin', 'instA')).auth);
    await M.StudentObjectiveMastery.create({ institutionId: 'instA', studentId: 'stu1', objectiveId: 'obj', masteryStatus: 'mastered', masteryEstimate: 0.9,
      evidenceStrength: 'moderate', evidenceCount: 5, independentEvidenceCount: 5, lastMasteryUpdateAt: new Date(), modelVersion: 'mastery-v1' });
    await M.AssessmentAttempt.create({ id: 'att', assessmentId: 'quiz', assessmentTitle: 'Quiz', subject: 'Math', studentId: 'stu1', institutionId: 'instA',
      status: 'submitted', answers: [], score: 25, startedAt: new Date(), submittedAt: new Date() });
    const cmp = (await admin.get('/api/learning/analytics/shadow-comparison')).body;
    expect(cmp).toMatchObject({ agree: 0, disagree: 1 });
    expect(cmp.toReview).toEqual([expect.objectContaining({ studentId: 'stu1', code: 'ALG.1', masteryStatus: 'mastered', assessmentScore: 25 })]);
    expect((await api((await bearer('admin', 'instB')).auth).get('/api/learning/analytics/shadow-comparison')).body.statesCompared).toBe(0);
    expect((await api(teacher.auth).get('/api/learning/analytics/shadow-comparison')).status).toBe(403);
  });
});

describe('security', () => {
  it('students cannot change objectives or read other students', async () => {
    const student = api((await bearer('student', 'instA', 'stu1')).auth);
    expect((await student.post('/api/learning/objectives', { curriculumId: 'cur', code: 'X', title: 'x' })).status).toBe(403);
    expect((await student.patch('/api/learning/objectives/obj', { title: 'hacked' })).status).toBe(403);
    expect((await student.post('/api/learning/objectives/obj/approve')).status).toBe(403);
    expect((await student.get('/api/learning/students/stu2/mastery')).status).toBe(404);
    expect((await student.get('/api/learning/classes/course/insights')).status).toBe(403);
    expect((await M.LearningObjective.findOne({ id: 'obj' }).lean()).title).toBe('Equations');
  });
  it('teachers only reach their own classes; other schools see nothing', async () => {
    const otherTeacher = api((await bearer('teacher', 'instA')).auth);
    expect((await otherTeacher.get('/api/learning/classes/course/insights')).status).toBe(404);
    expect((await api(teacher.auth).get('/api/learning/students/stu2/mastery')).status).toBe(404);
    const otherSchool = api((await bearer('admin', 'instB')).auth);
    expect((await otherSchool.get('/api/learning/objectives/obj')).status).toBe(404);
    expect((await otherSchool.get('/api/learning/students/stu1/mastery')).status).toBe(404);
    expect((await otherSchool.patch('/api/learning/objectives/obj', { title: 'x' })).status).toBe(404);
  });
  it('limits learning API use per signed-in user, not per shared school IP', async () => {
    const heavy = api((await bearer('student', 'instA', 'stu1')).auth);
    const statuses: number[] = [];
    for (let i = 0; i < 245; i++) statuses.push((await heavy.get('/api/learning/students/me/knowledge-map')).status);
    expect(statuses.slice(0, 240).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(240).every((s) => s === 429)).toBe(true);
    // A classmate on the same IP address is unaffected.
    expect((await api((await bearer('student', 'instA', 'stu2')).auth).get('/api/learning/students/me/knowledge-map')).status).toBe(200);
    // Unauthenticated requests are rejected before reaching the counter.
    expect((await request(app).get('/api/learning/students/me/knowledge-map').set('Authorization', 'Bearer junk')).status).toBe(401);
  }, 60_000);
  it('rejects query operators in bodies', async () => {
    const admin = api((await bearer('admin', 'instA')).auth);
    const res = await admin.post('/api/learning/interventions', { studentId: { $ne: null }, objectiveId: 'obj' });
    expect(res.status).toBe(400);
  });
});

describe('migrations and recovery', () => {
  it('run cleanly on existing data, are idempotent, and recover after the documented undo', async () => {
    const base = { studentId: 'stu1', institutionId: 'instA', type: 'question_answered', source: 'assessment', verified: true, outcome: { correct: true } };
    await M.LearningEvent.collection.insertMany([
      { ...base, id: 'old-1', refs: { assessmentId: 'quiz', attemptId: 'att', questionId: 'q1' }, at: new Date('2026-01-01'), conceptIds: [] },
      { ...base, id: 'old-2', refs: { assessmentId: 'quiz', attemptId: 'att', questionId: 'q1' }, at: new Date('2026-01-02'), conceptIds: [] },
      { ...base, id: 'old-3', refs: { assessmentId: 'quiz', attemptId: 'att', questionId: 'q2' }, at: new Date('2026-01-03'), conceptIds: [] },
    ]);
    const { MIGRATIONS } = await import('../src/migrations');
    const { runMigrations, pendingMigrations } = await import('../src/migrations/runner');
    const ran = await runMigrations(MIGRATIONS);
    expect(ran).toEqual(expect.arrayContaining(MIGRATIONS.filter((m) => m.id.includes('elie')).map((m) => m.id)));
    expect(await pendingMigrations(MIGRATIONS)).toEqual([]);
    expect(await runMigrations(MIGRATIONS)).toEqual([]);
    const snapshot = await M.LearningEvent.find({}).sort({ id: 1 }).select('-_id id idempotencyKey supersededBy processing').lean();
    expect(await M.LearningEvent.countDocuments()).toBe(3);

    // Documented undo: remove the added fields and the record, then run again.
    await M.LearningEvent.collection.updateMany({}, { $unset: { idempotencyKey: '', processing: '', supersededBy: '' } });
    await mongoose.connection.collection('migrations').deleteOne({ _id: '2026-10-25-elie-foundations' } as any);
    expect(await runMigrations(MIGRATIONS)).toEqual(['2026-10-25-elie-foundations']);
    expect(await M.LearningEvent.find({}).sort({ id: 1 }).select('-_id id idempotencyKey supersededBy processing').lean()).toEqual(snapshot);

    // Every new collection has its indexes.
    for (const name of ['curriculum_chunks', 'learning_evidence', 'student_objective_mastery', 'objective_retention_states']) {
      expect((await mongoose.connection.collection(name).indexes()).length).toBeGreaterThan(1);
    }
  });

  it('rebuilds evidence and mastery from events with the same result', async () => {
    const student = await bearer('student', 'instA', 'stu1');
    await takeQuiz(student.auth, { q1: 'right', q2: 'wrong', q3: 'right', q4: 'right' });
    const before = await M.StudentObjectiveMastery.findOne({ studentId: 'stu1' }).select('-_id masteryEstimate masteryStatus evidenceStrength evidenceCount').lean();
    const evidenceBefore = await M.LearningEvidence.countDocuments();

    // Derived data lost: delete it and mark the events for processing again.
    await M.LearningEvidence.deleteMany({});
    await M.StudentObjectiveMastery.deleteMany({});
    await M.LearningEvent.updateMany({ type: 'question_answered' }, { $set: { 'processing.evidence': 'pending', 'processing.attempts': 0 } });
    const { processPendingEvidence } = await import('../src/services/evidenceProcessor');
    await processPendingEvidence();

    expect(await M.LearningEvidence.countDocuments()).toBe(evidenceBefore);
    expect(await M.StudentObjectiveMastery.findOne({ studentId: 'stu1' }).select('-_id masteryEstimate masteryStatus evidenceStrength evidenceCount').lean()).toEqual(before);
  });
});
