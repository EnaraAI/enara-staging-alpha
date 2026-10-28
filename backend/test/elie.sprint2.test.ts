import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { estimateMastery, type EvidenceInput } from '../src/services/masteryModel';
import { evidenceFromEvent } from '../src/services/evidencePolicy';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
const ev = (id: string, correct: boolean, opts: Partial<EvidenceInput> = {}): EvidenceInput => ({
  id,
  result: correct ? 'correct' : 'incorrect',
  normalizedScore: correct ? 1 : 0,
  reliabilityWeight: 1,
  assistanceLevel: 'none',
  itemKey: `item-${id}`,
  occurredAt: day(0),
  ...opts,
});

describe('mastery estimator (unit)', () => {
  it('has no estimate without evidence', () => {
    expect(estimateMastery([])).toMatchObject({ masteryEstimate: null, masteryStatus: 'not_assessed', evidenceStrength: 'none' });
  });

  it('does not grant mastery from one answer', () => {
    const r = estimateMastery([ev('a', true)]);
    expect(r.masteryEstimate).toBe(0.75);
    expect(r).toMatchObject({ masteryStatus: 'proficient', evidenceStrength: 'limited', needsVerification: true });
  });

  it('grants mastery on several distinct correct items', () => {
    const r = estimateMastery([ev('a', true), ev('b', true), ev('c', true)]);
    expect(r).toMatchObject({ masteryEstimate: 0.875, masteryStatus: 'mastered', evidenceStrength: 'moderate', needsVerification: false });
  });

  it('does not let repeating one memorised question reach mastery', () => {
    const same = { itemKey: 'q1' };
    const r = estimateMastery([
      ev('a', true, { ...same, reliabilityWeight: 1 }),
      ev('b', true, { ...same, reliabilityWeight: 0.5 }),
      ev('c', true, { ...same, reliabilityWeight: 0.333 }),
      ev('d', true, { ...same, reliabilityWeight: 0.25 }),
    ]);
    expect(r.evidenceStrength).toBe('limited');
    expect(r.masteryStatus).not.toBe('mastered');
    expect(r.distinctIndependentItems).toBe(1);
  });

  it('weights recent evidence more and ignores invalidated evidence', () => {
    const older = estimateMastery([ev('a', false, { occurredAt: day(0) }), ev('b', true, { occurredAt: day(120) })]);
    const newer = estimateMastery([ev('a', true, { occurredAt: day(0) }), ev('b', false, { occurredAt: day(120) })]);
    expect(older.masteryEstimate!).toBeGreaterThan(newer.masteryEstimate!);
    expect(estimateMastery([ev('a', true), ev('b', false, { invalidatedAt: day(1) })]).evidenceCount).toBe(1);
  });

  it('is deterministic whatever the input order', () => {
    const list = [ev('a', true, { occurredAt: day(3) }), ev('b', false, { occurredAt: day(1) }), ev('c', true, { occurredAt: day(2) })];
    expect(estimateMastery(list)).toEqual(estimateMastery([...list].reverse()));
  });
});

describe('evidence policy (unit)', () => {
  const answer = { type: 'question_answered', source: 'assessment', verified: true, gradedBy: 'rule', outcome: { correct: true }, refs: { assessmentId: 'a', questionId: 'q' } } as const;
  it('counts rule-graded verified answers, discounted on repeat exposure', () => {
    expect(evidenceFromEvent(answer as any, 0)).toMatchObject({ evidenceType: 'independent_assessment', reliabilityWeight: 1, itemKey: 'q:a:q' });
    expect(evidenceFromEvent(answer as any, 1)!.reliabilityWeight).toBe(0.5);
    expect(evidenceFromEvent({ type: 'review_answered', source: 'review', verified: true, gradedBy: 'rule', outcome: { correct: false }, refs: { reviewItemId: 'r' } } as any, 0)).toMatchObject({
      evidenceType: 'retention_review',
      reliabilityWeight: 0.8,
      result: 'incorrect',
    });
  });
  it('never counts unverified, AI or activity events', () => {
    expect(evidenceFromEvent({ ...answer, verified: false } as any, 0)).toBeNull();
    expect(evidenceFromEvent({ ...answer, gradedBy: 'ai' } as any, 0)).toBeNull();
    expect(evidenceFromEvent({ type: 'lesson_completed', source: 'lesson', verified: true, refs: {} } as any, 0)).toBeNull();
    expect(evidenceFromEvent({ type: 'tutor_question', source: 'tutor_chat', verified: true, refs: {} } as any, 0)).toBeNull();
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
    AssessmentAttempt: (await import('../src/models/AssessmentAttempt')).AssessmentAttempt,
    LearningObjective: (await import('../src/models/LearningObjective')).LearningObjective,
    LearningEvent: (await import('../src/models/LearningEvent')).LearningEvent,
    LearningEvidence: (await import('../src/models/LearningEvidence')).LearningEvidence,
    StudentObjectiveMastery: (await import('../src/models/StudentObjectiveMastery')).StudentObjectiveMastery,
    MasteryHistory: (await import('../src/models/StudentObjectiveMastery')).MasteryHistory,
  };
  await mongoose.connect(mongo.getUri());
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

let n = 0;
async function bearer(role: 'student' | 'teacher' | 'admin', institutionId: string, studentId?: string) {
  n += 1;
  const email = `${role}${n}@x.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  return { id: user._id.toString(), auth: `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId, studentId })}` };
}

const QUESTIONS = ['q1', 'q2', 'q3'].map((id) => ({ id, type: 'multiple-choice', text: `${id}?`, options: ['a', 'b'], correctAnswer: 'a', explanation: '' }));
let objectiveId: string;
let teacher: { id: string; auth: string };

beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([
    { id: 'instA', name: 'A', features: { learning_intelligence_enabled: true, mastery_tracking_enabled: true } },
    { id: 'instB', name: 'B', features: { learning_intelligence_enabled: true, mastery_tracking_enabled: true } },
  ]);
  await M.Curriculum.create({ id: 'curA', name: 'Algebra', courseName: 'Algebra', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['bA'], chapters: [{ id: 'L1', title: 'Equations', uploads: [] }] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create({ id: 'cls', courseId: 'alg', courseName: 'Algebra', institutionId: 'instA', academicYear: '2026', batchId: 'bA', curriculumId: 'curA', studentIds: ['stu1'], instructorIds: [teacher.id], visibility: 'student' });
  await M.Student.create({ id: 'stu1', name: 'Sam', email: 'sam@x.com', grade: '10', institutionId: 'instA', batchId: 'bA' });
  await M.StudentCredit.create({ studentId: 'stu1', institutionId: 'instA', limit: 100, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  const obj = await M.LearningObjective.create({ id: 'obj1', institutionId: 'instA', curriculumId: 'curA', code: 'ALG.1', title: 'Solve equations', status: 'approved', lessonIds: ['L1'] });
  objectiveId = obj.id;
  await M.Assessment.create({ id: 'quiz', title: 'Quiz', institutionId: 'instA', subject: 'Math', status: 'active', dueDate: '2099-01-01', batchId: 'bA', curriculumId: 'curA', questions: QUESTIONS.map((q) => ({ ...q, objectiveIds: ['obj1'] })) });
});

async function takeQuiz(answers: Record<string, string>) {
  const student = await bearer('student', 'instA', 'stu1');
  const start = await request(app).post('/api/me/assessments/quiz/attempts').set('Authorization', student.auth).send({});
  const submit = await request(app).post(`/api/me/assessments/quiz/attempts/${start.body.attempt.id}/submit`).set('Authorization', student.auth).send({ answers });
  expect(submit.status).toBe(200);
  return student;
}

describe('evidence and mastery from real submissions', () => {
  it('turns tagged answers into evidence, mastery and history', async () => {
    const student = await takeQuiz({ q1: 'a', q2: 'a', q3: 'a' });
    expect(await M.LearningEvidence.countDocuments({ studentId: 'stu1', objectiveId })).toBe(3);
    const state = await M.StudentObjectiveMastery.findOne({ studentId: 'stu1', objectiveId }).lean();
    expect(state).toMatchObject({ masteryStatus: 'mastered', masteryEstimate: 0.875, evidenceStrength: 'moderate', modelVersion: 'mastery-v1' });
    expect(await M.MasteryHistory.countDocuments({ studentId: 'stu1' })).toBe(1);
    expect(await M.LearningEvent.countDocuments({ 'processing.evidence': 'pending' })).toBe(0);

    // Processing again creates nothing new.
    const { processPendingEvidence } = await import('../src/services/evidenceProcessor');
    await M.LearningEvent.updateMany({ type: 'question_answered' }, { $set: { 'processing.evidence': 'pending' } });
    await processPendingEvidence();
    expect(await M.LearningEvidence.countDocuments()).toBe(3);
    expect(await M.MasteryHistory.countDocuments()).toBe(1);

    const map = await request(app).get('/api/learning/students/me/knowledge-map').set('Authorization', student.auth);
    expect(map.status).toBe(200);
    expect(map.body.objectives[0]).toMatchObject({ code: 'ALG.1', masteryStatus: 'mastered', estimateIsHeuristic: true, isGap: false });
    const detail = await request(app).get(`/api/learning/students/me/mastery/${objectiveId}`).set('Authorization', student.auth);
    expect(detail.body.evidence).toHaveLength(3);
    expect(detail.body.history).toHaveLength(1);
  });

  it('shows a gap with its weak prerequisite', async () => {
    await M.LearningObjective.create({ id: 'obj0', institutionId: 'instA', curriculumId: 'curA', code: 'ALG.0', title: 'Expressions', status: 'approved' });
    await M.LearningObjective.updateOne({ id: 'obj1' }, { $set: { prerequisiteObjectiveIds: ['obj0'] } });
    const student = await takeQuiz({ q1: 'b', q2: 'b', q3: 'a' });
    const map = await request(app).get('/api/learning/students/me/knowledge-map').set('Authorization', student.auth);
    const alg1 = map.body.objectives.find((o: any) => o.code === 'ALG.1');
    expect(alg1).toMatchObject({ masteryStatus: 'emerging', isGap: true });
    expect(alg1.weakPrerequisites).toEqual([{ id: 'obj0', code: 'ALG.0', depth: 1 }]);
    expect(map.body.objectives.find((o: any) => o.code === 'ALG.0').readyToLearn).toBe(true);
  });

  it('keeps events pending while mastery tracking is off', async () => {
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.mastery_tracking_enabled': false } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    const student = await takeQuiz({ q1: 'a', q2: 'a', q3: 'a' });
    expect(await M.LearningEvidence.countDocuments()).toBe(0);
    expect(await M.LearningEvent.countDocuments({ 'processing.evidence': 'pending' })).toBe(3);
    expect((await request(app).get('/api/learning/students/me/mastery').set('Authorization', student.auth)).status).toBe(404);
  });
});

describe('who can read mastery', () => {
  it('limits access to the student, their teachers and their school', async () => {
    await takeQuiz({ q1: 'a', q2: 'a', q3: 'a' });
    const other = await bearer('student', 'instA', 'stu2');
    const otherTeacher = await bearer('teacher', 'instA');
    const adminA = await bearer('admin', 'instA');
    const adminB = await bearer('admin', 'instB');
    const url = '/api/learning/students/stu1/mastery';
    expect((await request(app).get(url).set('Authorization', other.auth)).status).toBe(404);
    expect((await request(app).get(url).set('Authorization', otherTeacher.auth)).status).toBe(404);
    expect((await request(app).get(url).set('Authorization', adminB.auth)).status).toBe(404);
    expect((await request(app).get(url).set('Authorization', teacher.auth)).status).toBe(200);
    expect((await request(app).get(url).set('Authorization', adminA.auth)).status).toBe(200);
  });
});

describe('linking, invalidation and recomputation', () => {
  it('applies a new link to past answers and an unlink invalidates their evidence', async () => {
    await M.Assessment.updateOne({ id: 'quiz' }, { $set: { 'questions.$[].objectiveIds': [] } });
    await takeQuiz({ q1: 'a', q2: 'a', q3: 'b' });
    expect(await M.LearningEvidence.countDocuments()).toBe(0);
    const admin = await bearer('admin', 'instA');

    const linked = await request(app)
      .put(`/api/learning/objectives/${objectiveId}/questions`)
      .set('Authorization', admin.auth)
      .send({ links: [{ assessmentId: 'quiz', questionId: 'q1' }, { assessmentId: 'quiz', questionId: 'q3' }] });
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ linked: 2, pastAnswersLinked: 2 });
    // Only the tags change: answer keys and options stay intact.
    const stored = await M.Assessment.findOne({ id: 'quiz' }).lean();
    expect(stored.questions.map((q: any) => [q.correctAnswer, q.options.length, q.type])).toEqual([['a', 2, 'multiple-choice'], ['a', 2, 'multiple-choice'], ['a', 2, 'multiple-choice']]);
    expect(stored.questions.map((q: any) => q.objectiveIds)).toEqual([['obj1'], [], ['obj1']]);
    expect(await M.LearningEvidence.countDocuments({ objectiveId })).toBe(2);

    const unlinked = await request(app)
      .put(`/api/learning/objectives/${objectiveId}/questions`)
      .set('Authorization', admin.auth)
      .send({ links: [{ assessmentId: 'quiz', questionId: 'q1' }] });
    expect(unlinked.body).toMatchObject({ unlinked: 1, evidenceInvalidated: 1 });
    expect(await M.LearningEvidence.countDocuments({ objectiveId })).toBe(2);
    const state = await M.StudentObjectiveMastery.findOne({ studentId: 'stu1', objectiveId }).lean();
    expect(state.evidenceCount).toBe(1);
    const list = await request(app).get(`/api/learning/objectives/${objectiveId}/questions`).set('Authorization', admin.auth);
    expect(list.body.assessments[0].questions.map((q: any) => q.linked)).toEqual([true, false, false]);
  });

  it('invalidates evidence with an audit trail and recomputes deterministically', async () => {
    await takeQuiz({ q1: 'a', q2: 'a', q3: 'a' });
    const one = await M.LearningEvidence.findOne({}).lean();
    const student = await bearer('student', 'instA', 'stu1');
    expect((await request(app).post(`/api/learning/evidence/${one.id}/invalidate`).set('Authorization', student.auth).send({ reason: 'x' })).status).toBe(403);
    const res = await request(app).post(`/api/learning/evidence/${one.id}/invalidate`).set('Authorization', teacher.auth).send({ reason: 'copied answers' });
    expect(res.status).toBe(200);
    const kept = await M.LearningEvidence.findOne({ id: one.id }).lean();
    expect(kept).toMatchObject({ invalidationReason: 'copied answers' });
    const state = await M.StudentObjectiveMastery.findOne({ studentId: 'stu1', objectiveId }).lean();
    expect(state.masteryStatus).not.toBe('mastered');

    const before = await M.MasteryHistory.countDocuments();
    await request(app).post('/api/learning/students/stu1/mastery/recompute').set('Authorization', teacher.auth);
    const again = await M.StudentObjectiveMastery.findOne({ studentId: 'stu1', objectiveId }).lean();
    expect(again.masteryEstimate).toBe(state.masteryEstimate);
    expect(await M.MasteryHistory.countDocuments()).toBe(before);
  });
});
