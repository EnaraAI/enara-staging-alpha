import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { objectiveSessionState, selectNextItem, type PoolItem, type ResponseLite } from '../src/services/diagnosticEngine';

const A = { id: 'A', code: 'A', prerequisiteObjectiveIds: [], priorEvidenceCount: 0 };
const B = { id: 'B', code: 'B', prerequisiteObjectiveIds: ['A'], priorEvidenceCount: 0 };
const item = (obj: string, q: string, difficulty?: number, seenBefore = false): PoolItem => ({ assessmentId: 'x', questionId: q, objectiveIds: [obj], difficulty, seenBefore });
const resp = (obj: string, q: string, correct: boolean, difficulty = 3): ResponseLite => ({ assessmentId: 'x', questionId: q, objectiveIds: [obj], correct, difficulty });

describe('diagnostic selection (unit)', () => {
  const pool = [item('A', 'a1', 3), item('A', 'a2', 4), item('A', 'a3', 2), item('B', 'b1', 3), item('B', 'b2', 3)];

  it('asks prerequisites first, starting at difficulty 3', () => {
    const next = selectNextItem({ objectives: [B, A], pool, responses: [], maxQuestions: 10 }) as any;
    expect(next).toMatchObject({ objectiveId: 'A', item: { questionId: 'a1' } });
  });

  it('moves difficulty up after a right answer and down after a wrong one', () => {
    expect((selectNextItem({ objectives: [A], pool, responses: [resp('A', 'a1', true)], maxQuestions: 10 }) as any).item.questionId).toBe('a2');
    expect((selectNextItem({ objectives: [A], pool, responses: [resp('A', 'a1', false)], maxQuestions: 10 }) as any).item.questionId).toBe('a3');
  });

  it('prefers questions the student has not seen', () => {
    const p = [item('A', 'old', 3, true), item('A', 'new', 5)];
    expect((selectNextItem({ objectives: [A], pool: p, responses: [], maxQuestions: 10 }) as any).item.questionId).toBe('new');
  });

  it('settles objectives and supports inconclusive results', () => {
    expect(objectiveSessionState('A', [resp('A', 'a1', true), resp('A', 'a2', true)])).toMatchObject({ result: 'secure', settled: true });
    expect(objectiveSessionState('A', [resp('A', 'a1', false), resp('A', 'a2', false)])).toMatchObject({ result: 'gap', settled: true });
    expect(objectiveSessionState('A', [resp('A', 'a1', true), resp('A', 'a2', false)])).toMatchObject({ result: 'inconclusive', settled: false });
    expect(objectiveSessionState('A', [resp('A', 'a1', true), resp('A', 'a2', false), resp('A', 'a3', true)])).toMatchObject({ result: 'secure', settled: true });
  });

  it('stops: dependants of a prerequisite gap are not asked; limits; exhausted pool', () => {
    expect(selectNextItem({ objectives: [A, B], pool, responses: [resp('A', 'a1', false), resp('A', 'a3', false)], maxQuestions: 10 })).toEqual({ stop: 'enough_evidence' });
    expect(selectNextItem({ objectives: [A], pool, responses: [resp('A', 'a1', true)], maxQuestions: 1 })).toEqual({ stop: 'max_questions' });
    expect(selectNextItem({ objectives: [A], pool: [item('A', 'a1')], responses: [resp('A', 'a1', true)], maxQuestions: 10 })).toEqual({ stop: 'pool_exhausted' });
  });
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
    LearningObjective: (await import('../src/models/LearningObjective')).LearningObjective,
    LearningEvent: (await import('../src/models/LearningEvent')).LearningEvent,
    LearningEvidence: (await import('../src/models/LearningEvidence')).LearningEvidence,
    StudentObjectiveMastery: (await import('../src/models/StudentObjectiveMastery')).StudentObjectiveMastery,
    MasteryHistory: (await import('../src/models/StudentObjectiveMastery')).MasteryHistory,
    DiagnosticSession: (await import('../src/models/DiagnosticSession')).DiagnosticSession,
    StudentMisconception: (await import('../src/models/StudentMisconception')).StudentMisconception,
  };
  await mongoose.connect(mongo.getUri());
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const ALL_FLAGS = {
  learning_intelligence_enabled: true,
  mastery_tracking_enabled: true,
  diagnostics_enabled: true,
  misconception_detection_enabled: true,
};
let n = 0;
let teacher: { id: string; auth: string };
async function bearer(role: 'student' | 'teacher' | 'admin', institutionId: string, studentId?: string) {
  n += 1;
  const email = `${role}${n}@x.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  return { id: user._id.toString(), auth: `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId, studentId })}` };
}

const q = (id: string, obj: string, correct: string, extra: object = {}) => ({
  id,
  type: 'multiple-choice',
  text: `${id}?`,
  options: ['right', 'wrong', 'swap'],
  correctAnswer: correct,
  explanation: 'secret explanation',
  objectiveIds: [obj],
  difficulty: 3,
  ...extra,
});

beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([{ id: 'instA', name: 'A', features: ALL_FLAGS }, { id: 'instB', name: 'B', features: ALL_FLAGS }]);
  await M.Curriculum.create({ id: 'cur', name: 'Algebra', courseName: 'Algebra', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [{ id: 'L1', title: 'L', uploads: [] }] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create({ id: 'course', courseId: 'alg', courseName: 'Algebra', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: ['stu1'], instructorIds: [teacher.id], visibility: 'student' });
  await M.Student.create({ id: 'stu1', name: 'Sam', email: 'sam@x.com', grade: '10', institutionId: 'instA', batchId: 'b' });
  await M.StudentCredit.create({ studentId: 'stu1', institutionId: 'instA', limit: 100, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.LearningObjective.create([
    { id: 'A', institutionId: 'instA', curriculumId: 'cur', code: 'A', title: 'Fractions', status: 'approved' },
    { id: 'B', institutionId: 'instA', curriculumId: 'cur', code: 'B', title: 'Ratios', status: 'approved', prerequisiteObjectiveIds: ['A'] },
  ]);
  const swap = [{ option: 'swap', category: 'conceptual_misunderstanding', description: 'Swaps numerator and denominator' }];
  await M.Assessment.create({
    id: 'bank',
    title: 'Bank',
    institutionId: 'instA',
    subject: 'Math',
    status: 'completed',
    curriculumId: 'cur',
    questions: [q('a1', 'A', 'right', { distractors: swap }), q('a2', 'A', 'right', { distractors: swap }), q('a3', 'A', 'right'), q('b1', 'B', 'right'), q('b2', 'B', 'right'), q('b3', 'B', 'right')],
  });
});

const student = () => bearer('student', 'instA', 'stu1');
const start = (auth: string, body: object = { courseId: 'course' }) => request(app).post('/api/learning/diagnostics').set('Authorization', auth).send(body);
const answer = (auth: string, d: any, value: string) =>
  request(app).post(`/api/learning/diagnostics/${d.id}/answer`).set('Authorization', auth).send({ assessmentId: d.currentQuestion.assessmentId, questionId: d.currentQuestion.questionId, answer: value });

describe('diagnostic sessions', () => {
  it('serves one question at a time without the answer key, and resumes', async () => {
    const s = await student();
    const first = await start(s.auth);
    expect(first.status).toBe(201);
    expect(first.body.currentQuestion).toMatchObject({ questionId: 'a1', options: ['right', 'wrong', 'swap'] });
    const raw = JSON.stringify(first.body);
    for (const leak of ['correctAnswer', 'secret explanation', 'distractors', 'Swaps numerator']) expect(raw).not.toContain(leak);
    const again = await start(s.auth);
    expect(again.body).toMatchObject({ resumed: true, id: first.body.id });
  });

  it('only accepts the current question and never advances twice', async () => {
    const s = await student();
    const d = (await start(s.auth)).body;
    const stale = await request(app).post(`/api/learning/diagnostics/${d.id}/answer`).set('Authorization', s.auth).send({ assessmentId: 'bank', questionId: 'b1', answer: 'right' });
    expect(stale.body.error.code).toBe('STALE_QUESTION');
    const [x, y] = await Promise.all([answer(s.auth, d, 'right'), answer(s.auth, d, 'right')]);
    expect([x.status, y.status]).toEqual([200, 200]);
    const repeat = await answer(s.auth, d, 'wrong');
    expect(repeat.body.duplicate).toBe(true);
    const stored = await M.DiagnosticSession.findOne({ id: d.id }).lean();
    expect(stored.responses).toHaveLength(1);
    expect(stored.responses[0].correct).toBe(true);
  });

  it('finds a prerequisite gap, records evidence, and reports it', async () => {
    const s = await student();
    let d = (await start(s.auth)).body;
    while (d.status === 'in_progress') d = (await answer(s.auth, d, 'swap')).body;
    expect(d).toMatchObject({ status: 'completed', stopReason: 'enough_evidence', questionsAnswered: 2 });

    const evidence = await M.LearningEvidence.find({ studentId: 'stu1' }).lean();
    expect(evidence.map((e) => [e.evidenceType, e.result])).toEqual([['diagnostic', 'incorrect'], ['diagnostic', 'incorrect']]);
    expect((await M.StudentObjectiveMastery.findOne({ objectiveId: 'A' }).lean()).masteryStatus).toBe('emerging');

    const report = await request(app).get(`/api/learning/diagnostics/${d.id}/report`).set('Authorization', s.auth);
    const [a, b] = report.body.objectives;
    expect(a).toMatchObject({ diagnostic: { result: 'gap', answered: 2 }, recommendation: { type: 'practise' } });
    expect(b).toMatchObject({ diagnostic: { result: 'inconclusive', blockedByPrerequisite: 'A' }, recommendation: { type: 'review_prerequisite', objectiveId: 'A' } });
    expect(report.body.gaps).toEqual(['A']);
    // Picking the tagged distractor on two questions suggests a misconception, as a possibility.
    expect(a.possibleMisconceptions).toEqual([
      expect.objectContaining({ description: 'Swaps numerator and denominator', status: 'suspected', confidenceIsHeuristic: true }),
    ]);
  });

  it('respects school limits and the time limit', async () => {
    const admin = await bearer('admin', 'instA');
    await request(app).put('/api/learning/settings').set('Authorization', admin.auth).send({ diagnosticMaxQuestions: 3 });
    const s = await student();
    let d = (await start(s.auth)).body;
    expect(d.maxQuestions).toBe(3);
    d = (await answer(s.auth, d, 'right')).body;
    d = (await answer(s.auth, d, 'wrong')).body;
    d = (await answer(s.auth, d, 'right')).body;
    expect(d).toMatchObject({ status: 'completed', stopReason: 'max_questions' });

    await M.DiagnosticSession.deleteMany({});
    const timed = (await start(s.auth)).body;
    await M.DiagnosticSession.updateOne({ id: timed.id }, { $set: { startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    const late = await answer(s.auth, timed, 'right');
    expect(late.body.error.code).toBe('DIAGNOSTIC_FINISHED');
    expect((await M.DiagnosticSession.findOne({ id: timed.id }).lean()).stopReason).toBe('max_duration');
  });

  it('lets the student stop early and keeps access scoped', async () => {
    const s = await student();
    const d = (await start(s.auth)).body;
    const done = await request(app).post(`/api/learning/diagnostics/${d.id}/complete`).set('Authorization', s.auth);
    expect(done.body).toMatchObject({ status: 'completed', stopReason: 'student_ended' });
    const report = await request(app).get(`/api/learning/diagnostics/${d.id}/report`).set('Authorization', s.auth);
    expect(report.body.inconclusive).toBe(true);

    const other = await bearer('student', 'instA', 'stu2');
    const adminB = await bearer('admin', 'instB');
    expect((await request(app).get(`/api/learning/diagnostics/${d.id}/report`).set('Authorization', other.auth)).status).toBe(404);
    expect((await request(app).get(`/api/learning/diagnostics/${d.id}/report`).set('Authorization', adminB.auth)).status).toBe(404);
    const byTeacher = await request(app).get(`/api/learning/diagnostics/${d.id}`).set('Authorization', teacher.auth);
    expect(byTeacher.status).toBe(200);
    expect((await request(app).post(`/api/learning/diagnostics/${d.id}/answer`).set('Authorization', teacher.auth).send({})).status).toBe(403);
  });

  it('is off when the school has diagnostics disabled', async () => {
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.diagnostics_enabled': false } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    const s = await student();
    expect((await start(s.auth)).body.error.code).toBe('FEATURE_DISABLED');
  });
});

describe('misconception review', () => {
  async function detect() {
    const s = await student();
    let d = (await start(s.auth)).body;
    while (d.status === 'in_progress') d = (await answer(s.auth, d, 'swap')).body;
    return s;
  }

  it('shows students a possibility, gives teachers the evidence, and keeps their decision', async () => {
    const s = await detect();
    const mine = await request(app).get('/api/learning/students/me/misconceptions').set('Authorization', s.auth);
    expect(mine.body.misconceptions[0]).toMatchObject({ label: 'Possible misconception (not confirmed)', status: 'suspected' });
    expect(mine.body.misconceptions[0].supportingEvidence).toBeUndefined();

    const forTeacher = await request(app).get('/api/learning/students/stu1/misconceptions').set('Authorization', teacher.auth);
    const m = forTeacher.body.misconceptions[0];
    expect(m.supportingEvidence).toHaveLength(2);
    expect((await request(app).patch(`/api/learning/misconceptions/${m.id}`).set('Authorization', s.auth).send({ status: 'dismissed' })).status).toBe(403);
    const dismissed = await request(app).patch(`/api/learning/misconceptions/${m.id}`).set('Authorization', teacher.auth).send({ status: 'dismissed', note: 'Misread the question' });
    expect(dismissed.body.status).toBe('dismissed');
    expect(dismissed.body.statusHistory.at(-1)).toMatchObject({ from: 'suspected', to: 'dismissed', note: 'Misread the question' });

    const { detectMisconceptions } = await import('../src/services/misconceptionRules');
    await detectMisconceptions('stu1', ['A'], 'instA');
    expect((await M.StudentMisconception.findOne({ id: m.id }).lean()).status).toBe('dismissed');
    expect((await request(app).get('/api/learning/students/me/misconceptions').set('Authorization', s.auth)).body.misconceptions).toHaveLength(0);
  });

  it('resolves a suspected misconception when later evidence shows proficiency', async () => {
    await detect();
    const { recordLearningEvents } = await import('../src/services/learningEvents');
    const { processPendingEvidence } = await import('../src/services/evidenceProcessor');
    const later = new Date(Date.now() + 60_000);
    await recordLearningEvents(
      ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map((qid) => ({
        studentId: 'stu1',
        institutionId: 'instA',
        type: 'question_answered' as const,
        source: 'assessment' as const,
        verified: true,
        gradedBy: 'rule' as const,
        objectiveIds: ['A'],
        refs: { assessmentId: 'later', questionId: qid, attemptId: 'att' },
        outcome: { correct: true },
        idempotencyKey: `t:${qid}`,
        at: later,
      })),
    );
    await processPendingEvidence();
    const m = await M.StudentMisconception.findOne({ ruleKey: /^distractor:A/ }).lean();
    expect(m.status).toBe('resolved');
    expect(m.statusHistory.at(-1).note).toMatch(/later evidence/);
  });
});
