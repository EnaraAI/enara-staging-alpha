import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// P21 C3: examination results as first-class learning evidence. Optional
// assessment kind and question cognitive level (backward compatible), rubric
// criteria evidencing their own objectives, and the exam context of each piece of
// evidence. Real local MongoDB, synthetic school; no AI provider (grading itself
// is not run here and is not changed).

const PW = 'p21-exam-password';
const S = 'p21x';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let teacher = '';
const ids: Record<string, string> = {};
let M: Record<string, mongoose.Model<any>>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'DATABASE_URL']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const n of ['User', 'Institution', 'CourseInstance', 'Student', 'Batch', 'LearningObjective', 'LearningEvent', 'LearningEvidence', 'Curriculum']) M[n] = (await import(`../src/models/${n}`))[n];
  const { Assessment, AssessmentVersion } = await import('../src/models/Assessment');
  M.Assessment = Assessment as never; M.AssessmentVersion = AssessmentVersion as never;
  M.AssessmentAttempt = (await import('../src/models/AssessmentAttempt')).AssessmentAttempt as never;
  M.Assignment = (await import('../src/models/Assignment')).Assignment as never;
  await M.Institution.create({ id: S, name: 'Exam School', features: { teaching_workflow_enabled: true, learning_intelligence_enabled: true, mastery_tracking_enabled: true } });
  await M.Batch.create({ id: 'x-b1', name: 'G6', institutionId: S, academicYear: '2026', studentCount: 1 });
  await M.Student.create({ id: 'x-stu', name: 'Synthetic Student', email: 'stu@p21x.test', grade: 'Grade 6', institutionId: S, batchId: 'x-b1' });
  const hash = bcrypt.hashSync(PW, 4);
  const t = await M.User.create({ email: 'teacher@p21x.test', password: hash, role: 'teacher', name: 'T', status: 'active', institutionId: S });
  await M.CourseInstance.create({ id: 'x-cls', courseId: 'x-course', courseName: 'Fractions', institutionId: S, academicYear: '2026', batchId: 'x-b1', studentIds: [], instructorIds: [t._id.toString()], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  teacher = `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'teacher@p21x.test', password: PW })).body.token}`;
  const cur = await request(app).post('/api/curriculums').set('Authorization', teacher).send({ name: 'Fractions', summary: 'x', courseName: 'Fractions', chapters: [{ title: 'Adding', description: 'd' }] });
  ids.curriculum = cur.body.id;
  expect((await request(app).post(`/api/curriculums/${ids.curriculum}/publish-to-class`).set('Authorization', teacher).send({ classId: 'x-cls' })).status).toBe(200);
  const obj = (id: string, code: string) => ({ id, institutionId: S, curriculumId: ids.curriculum, courseId: 'x-course', code, title: code, lessonIds: [], status: 'approved', prerequisiteObjectiveIds: [] });
  await M.LearningObjective.create([obj('o-q', 'Q1'), obj('o-reason', 'R1'), obj('o-calc', 'C1')]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const questions = (extra: Record<string, unknown> = {}) => [
  { id: 'q1', type: 'multiple-choice', text: '1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', points: 1, objectiveIds: ['o-q'], cognitiveLevel: 1, difficulty: 2, ...extra },
  { id: 'q2', type: 'open-response', text: 'Explain and compute.', modelAnswer: 'x', objectiveIds: ['o-q'], cognitiveLevel: 3,
    rubric: { criteria: [
      { id: 'c-reason', title: 'Reasoning', objectiveIds: ['o-reason'], levels: [{ id: 'l0', label: 'no', points: 0 }, { id: 'l1', label: 'part', points: 1 }, { id: 'l2', label: 'yes', points: 2 }] },
      { id: 'c-calc', title: 'Calculation', objectiveIds: ['o-calc'], levels: [{ id: 'k0', label: 'no', points: 0 }, { id: 'k1', label: 'yes', points: 2 }] },
    ] } },
];

describe('optional exam metadata (backward compatible)', () => {
  it('an assessment stores assessmentKind and question cognitiveLevel when given; invalid values are refused', async () => {
    const r = await request(app).post('/api/assessments').set('Authorization', teacher).send({ title: 'Unit test', subject: 'Maths', curriculumId: ids.curriculum, lifecycle: 'draft', assessmentKind: 'unit_test', questions: questions() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    ids.assessment = r.body.id;
    const saved: any = await M.Assessment.findOne({ id: ids.assessment }).lean();
    expect(saved.assessmentKind).toBe('unit_test');
    expect(saved.questions.map((q: any) => q.cognitiveLevel)).toEqual([1, 3]);
    expect((await request(app).post('/api/assessments').set('Authorization', teacher).send({ title: 'x', subject: 'M', curriculumId: ids.curriculum, lifecycle: 'draft', assessmentKind: 'exam', questions: questions() })).status).toBe(400);
    expect((await request(app).post('/api/assessments').set('Authorization', teacher).send({ title: 'x', subject: 'M', curriculumId: ids.curriculum, lifecycle: 'draft', questions: questions({ cognitiveLevel: 7 }) })).status).toBe(400);
  });

  it('without the new fields an assessment is created exactly as before (no kind stored)', async () => {
    const r = await request(app).post('/api/assessments').set('Authorization', teacher).send({ title: 'Plain', subject: 'Maths', curriculumId: ids.curriculum, lifecycle: 'draft', questions: [{ id: 'q1', type: 'multiple-choice', text: 't', options: ['a', 'b'], correctAnswer: 'a', points: 1 }] });
    expect(r.status).toBe(201);
    const saved: any = await M.Assessment.findOne({ id: r.body.id }).lean();
    expect(saved.assessmentKind).toBeUndefined();
    expect(saved.questions[0].cognitiveLevel).toBeUndefined();
  });

  it('an assignment can override the kind; the published version keeps the cognitive levels', async () => {
    expect((await request(app).post(`/api/assessments/${ids.assessment}/publish`).set('Authorization', teacher).send({})).status).toBe(200);
    const asg = await request(app).post('/api/assignments').set('Authorization', teacher).send({ assessmentId: ids.assessment, classId: 'x-cls', dueAt: new Date(Date.now() + 86_400_000).toISOString(), assessmentKind: 'midterm' });
    expect(asg.status, JSON.stringify(asg.body)).toBe(201);
    ids.assignment = asg.body.id;
    expect(((await M.Assignment.findOne({ id: ids.assignment }).lean()) as any).assessmentKind).toBe('midterm');
    const v: any = await M.AssessmentVersion.findOne({ assessmentId: ids.assessment }).lean();
    expect(v.questions.map((q: any) => q.cognitiveLevel)).toEqual([1, 3]);
    expect((await request(app).post('/api/assignments').set('Authorization', teacher).send({ assessmentId: ids.assessment, classId: 'x-cls', dueAt: new Date(Date.now() + 86_400_000).toISOString(), assessmentKind: 'nonsense' })).status).toBe(400);
  });
});

describe('rubric criteria evidence their own objectives; mapping only where the author tagged it', () => {
  it('a graded open response gives each criterion objective its own score; the question objective keeps the question score', async () => {
    const v: any = await M.AssessmentVersion.findOne({ assessmentId: ids.assessment }).lean();
    const attempt = await M.AssessmentAttempt.create({
      id: 'att-x1', assessmentId: ids.assessment, assessmentTitle: 'Unit test', subject: 'Maths', studentId: 'x-stu', institutionId: S, status: 'submitted',
      assignmentId: ids.assignment, assessmentVersion: v.version, startedAt: new Date(), submittedAt: new Date(), score: 50,
      answers: [
        { questionId: 'q1', studentAnswer: '3/4', isCorrect: true, points: 1, maxPoints: 1, method: 'rule' },
        { questionId: 'q2', studentAnswer: 'because...', points: 2, maxPoints: 4, method: 'ai', criterionScores: [{ criterionId: 'c-reason', levelId: 'l2', points: 2 }, { criterionId: 'c-calc', levelId: 'k0', points: 0 }] },
      ],
    });
    const { recordAttemptEvidence } = await import('../src/services/grading');
    await recordAttemptEvidence(attempt as never, v.questions, 'Maths');
    await recordAttemptEvidence(attempt as never, v.questions, 'Maths'); // idempotent
    const events: any[] = await M.LearningEvent.find({ 'refs.attemptId': 'att-x1', type: 'question_answered' }).lean();
    const byKey = Object.fromEntries(events.map((e) => [`${e.refs.questionId}${e.refs.criterionId ? `:${e.refs.criterionId}` : ''}`, e]));
    expect(Object.keys(byKey).sort()).toEqual(['q1', 'q2', 'q2:c-calc', 'q2:c-reason']);
    expect(byKey.q2.objectiveIds).toEqual(['o-q']); // question-level objective only
    expect(byKey.q2.outcome.score).toBe(0.5);
    expect(byKey['q2:c-reason']).toMatchObject({ objectiveIds: ['o-reason'], gradedBy: 'ai', outcome: { score: 1, correct: true } });
    expect(byKey['q2:c-calc']).toMatchObject({ objectiveIds: ['o-calc'], outcome: { score: 0, correct: false } });
    const evidence: any[] = await M.LearningEvidence.find({ studentId: 'x-stu' }).lean();
    const scoreOf = (o: string) => evidence.filter((e) => e.objectiveId === o).map((e) => e.normalizedScore).sort();
    expect(scoreOf('o-reason')).toEqual([1]);
    expect(scoreOf('o-calc')).toEqual([0]);
    expect(scoreOf('o-q')).toEqual([0.5, 1]);
    expect(evidence.find((e) => e.objectiveId === 'o-reason').reliabilityWeight, 'AI-graded weight unchanged (0.8)').toBeCloseTo(0.8);
  });

  it('a rule-graded answer, or a question without criterion scores, behaves exactly as before', async () => {
    const events: any[] = await M.LearningEvent.find({ 'refs.attemptId': 'att-x1', 'refs.questionId': 'q1' }).lean();
    expect(events).toHaveLength(1);
    expect(events[0].objectiveIds).toEqual(['o-q']);
  });

  it('exam context: kind from the assignment override, cognitive level and difficulty from the version taken, criterion and grader kept', async () => {
    const { examContextFor } = await import('../src/services/assessmentEvidenceContext');
    const evidence: any[] = await M.LearningEvidence.find({ studentId: 'x-stu' }).lean();
    const ctx = await examContextFor(evidence);
    const rows = evidence.map((e) => ({ o: e.objectiveId, ...ctx.get(e.id)! }));
    for (const r of rows) expect(r.assessmentKind).toBe('midterm');
    const reason = rows.find((r) => r.o === 'o-reason')!;
    expect(reason).toMatchObject({ questionId: 'q2', criterionId: 'c-reason', cognitiveLevel: 3, gradedBy: 'ai' });
    expect(rows.find((r) => r.o === 'o-q' && r.questionId === 'q1')).toMatchObject({ cognitiveLevel: 1, difficulty: 2, gradedBy: 'rule' });
  });

  it('missing metadata stays missing: no kind -> unspecified, no level -> undefined', async () => {
    const { examContextFor } = await import('../src/services/assessmentEvidenceContext');
    const ctx = await examContextFor([{ id: 'ev-none', sourceEventId: 'event-that-does-not-exist' }]);
    expect(ctx.get('ev-none')).toMatchObject({ assessmentKind: 'unspecified', cognitiveLevel: undefined });
  });
});

describe('recall vs application signal (only from levelled questions)', () => {
  it('detects recall right / application wrong; unknown without levels', async () => {
    const { applicationGapFrom } = await import('../src/services/assessmentEvidenceContext');
    const at = (d: number) => new Date(2026, 9, d);
    expect(applicationGapFrom([{ score: 1, level: 1, at: at(1) }, { score: 0, level: 3, at: at(2) }])).toBe(true);
    expect(applicationGapFrom([{ score: 1, level: 1, at: at(1) }, { score: 0, level: 3, at: at(2) }, { score: 1, level: 4, at: at(3) }])).toBe(false);
    expect(applicationGapFrom([{ score: 0.2, level: 1, at: at(1) }, { score: 0, level: 3, at: at(2) }])).toBe(false);
    expect(applicationGapFrom([{ score: 1, at: at(1) }, { score: 0, at: at(2) }])).toBeUndefined();
    expect(applicationGapFrom([{ score: 1, level: 2, at: at(1) }])).toBeUndefined();
  });
});
