import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/enaraOrchestrator', () => ({
  fetchOrchestratorCourses: vi.fn(async () => []),
  fetchOrchestratorSections: vi.fn(async () => []),
  queryOrchestratorChat: vi.fn(async () => ({ answer: 'Tutor answer', intent: 'answered', context_found: 1, version: 'orchestrator-v1' })),
  buildFallbackTutorReply: (query: string) => ({ answer: `Fallback: ${query}`, intent: 'fallback_local', context_found: 0, version: 'fallback' }),
}));

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
    ENARA_DEFAULT_COURSE_ID: 'orchestrator-course',
    AI_ENGINE_URL: 'http://127.0.0.1:9998',
    AWS_S3_BUCKET: 'test-bucket',
    TRUST_PROXY: 'false',
    SERVE_LOCAL_UPLOADS: 'false',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {
    User: (await import('../src/models/User')).User,
    Student: (await import('../src/models/Student')).Student,
    Curriculum: (await import('../src/models/Curriculum')).Curriculum,
    CourseInstance: (await import('../src/models/CourseInstance')).CourseInstance,
    Assessment: (await import('../src/models/Assessment')).Assessment,
    AssessmentAttempt: (await import('../src/models/AssessmentAttempt')).AssessmentAttempt,
    StudentCredit: (await import('../src/models/StudentCredit')).StudentCredit,
    ReviewItem: (await import('../src/models/ReviewItem')).ReviewItem,
    LessonProgress: (await import('../src/models/LessonProgress')).LessonProgress,
    TutorSession: (await import('../src/models/TutorSession')).TutorSession,
    TutorMessage: (await import('../src/models/TutorMessage')).TutorMessage,
    LearningEvent: (await import('../src/models/LearningEvent')).LearningEvent,
  };
  await mongoose.connect(mongo.getUri());
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
});

async function bearer(email: string, role: 'student' | 'admin', extra: { studentId?: string; institutionId?: string }) {
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', ...extra });
  return `Bearer ${signAccessToken({ id: user._id.toString(), email, role, ...extra })}`;
}

async function seedStudent(id = 'stu1', institutionId = 'instA') {
  await M.Student.create({ id, name: `Student ${id}`, email: `${id}@example.com`, grade: '10', institutionId, batchId: `batch-${institutionId}` });
  await M.StudentCredit.create({ studentId: id, institutionId, limit: 100, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  return bearer(`${id}@example.com`, 'student', { studentId: id, institutionId });
}

async function seedCourse(studentId = 'stu1') {
  await M.Curriculum.create({
    id: 'curA',
    name: 'Algebra',
    courseName: 'Algebra',
    institutionId: 'instA',
    summary: 'Linear equations',
    lastUpdated: '2026-01-01',
    assignedBatches: ['batch-instA'],
    status: 'deployed',
    chapters: [{ id: 'lesson1', title: 'Equations', uploads: [] }],
  });
  await M.CourseInstance.create({
    id: 'courseInst',
    courseId: 'courseA',
    courseName: 'Algebra',
    institutionId: 'instA',
    academicYear: '2026',
    batchId: 'batch-instA',
    curriculumId: 'curA',
    studentIds: [studentId],
    instructorIds: [],
    visibility: 'student',
  });
}

const events = (filter: Record<string, unknown> = {}) => M.LearningEvent.find(filter).sort({ at: 1 }).lean();

describe('events written by learning actions', () => {
  it('records a lesson completion once, as verified', async () => {
    const auth = await seedStudent();
    await seedCourse();
    const url = '/api/me/courses/courseInst/lessons/lesson1/complete';
    const first = await request(app).post(url).set('Authorization', auth);
    expect(first.status).toBe(200);
    await request(app).post(url).set('Authorization', auth);
    const list = await events({ type: 'lesson_completed' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ studentId: 'stu1', institutionId: 'instA', source: 'lesson', verified: true, refs: { lessonId: 'lesson1' } });
  });

  it('records each graded answer and the submission', async () => {
    const auth = await seedStudent();
    await M.Assessment.create({
      id: 'quiz1',
      title: 'Quiz',
      institutionId: 'instA',
      subject: 'Math',
      status: 'active',
      dueDate: '2099-01-01',
      batchId: 'batch-instA',
      questions: [
        { id: 'q1', type: 'multiple-choice', text: '2+2', topic: 'Addition', options: ['3', '4'], correctAnswer: '4', explanation: '' },
        { id: 'q2', type: 'true-false', text: '1>2', topic: 'Comparison', options: ['true', 'false'], correctAnswer: 'false', explanation: '' },
      ],
    });
    const start = await request(app).post('/api/me/assessments/quiz1/attempts').set('Authorization', auth).send({});
    await request(app)
      .post(`/api/me/assessments/quiz1/attempts/${start.body.attempt.id}/submit`)
      .set('Authorization', auth)
      .send({ answers: { q1: '4', q2: 'true' }, timeSpentSec: 90 });

    expect(await events({ type: 'assessment_started' })).toHaveLength(1);
    const answers = await events({ type: 'question_answered' });
    expect(answers.map((a) => [a.topic, a.outcome.correct, a.verified, a.gradedBy])).toEqual([
      ['Addition', true, true, 'rule'],
      ['Comparison', false, true, 'rule'],
    ]);
    const submitted = await events({ type: 'assessment_submitted' });
    expect(submitted[0]).toMatchObject({ outcome: { score: 50 }, durationMs: 90_000, institutionId: 'instA' });
  });

  it('records review answers', async () => {
    const auth = await seedStudent();
    await M.ReviewItem.create({
      id: 'rev1',
      studentId: 'stu1',
      institutionId: 'instA',
      sourceKey: 'quiz1:q1',
      topic: 'Addition',
      question: '2+2',
      options: ['3', '4'],
      answer: '1',
      dueAt: new Date(Date.now() - 1000),
    });
    const res = await request(app).post('/api/me/reviews/rev1/answer').set('Authorization', auth).send({ answer: 1 });
    expect(res.status).toBe(200);
    const [e] = await events({ type: 'review_answered' });
    expect(e).toMatchObject({ topic: 'Addition', verified: true, outcome: { correct: true }, refs: { reviewItemId: 'rev1' } });
  });

  it('records tutor chat turns: the question verified, the AI reply not', async () => {
    const auth = await seedStudent();
    const session = await request(app).post('/api/me/tutor/sessions').set('Authorization', auth).send({});
    await request(app).post(`/api/me/tutor/sessions/${session.body.id}/messages`).set('Authorization', auth).send({ text: 'What is x?' });
    const list = await events({ source: 'tutor_chat' });
    expect(list.map((e) => [e.type, e.verified])).toEqual([
      ['tutor_question', true],
      ['tutor_reply', false],
    ]);
    expect(list[0].refs.sessionId).toBe(session.body.id);
  });
});

describe('browser-reported events', () => {
  it('accepts lesson time for the student\'s own lessons only, as unverified', async () => {
    const auth = await seedStudent();
    await seedCourse();
    const bad = await request(app).post('/api/me/events').set('Authorization', auth).send({ type: 'lesson_completed', courseId: 'courseInst', lessonId: 'lesson1' });
    expect(bad.status).toBe(400);
    const notMine = await request(app).post('/api/me/events').set('Authorization', auth).send({ type: 'lesson_viewed', courseId: 'courseInst', lessonId: 'nope' });
    expect(notMine.status).toBe(404);
    const tooLong = await request(app)
      .post('/api/me/events')
      .set('Authorization', auth)
      .send({ type: 'lesson_viewed', courseId: 'courseInst', lessonId: 'lesson1', durationMs: 10 * 60 * 60 * 1000 });
    expect(tooLong.status).toBe(400);
    const ok = await request(app)
      .post('/api/me/events')
      .set('Authorization', auth)
      .send({ type: 'lesson_viewed', courseId: 'courseInst', lessonId: 'lesson1', durationMs: 42_000, verified: true });
    expect(ok.status).toBe(201);
    const [e] = await events({ type: 'lesson_viewed' });
    expect(e).toMatchObject({ source: 'client', verified: false, durationMs: 42_000 });
  });
});

describe('reading events', () => {
  async function seedTwoSchools() {
    const { recordLearningEvents } = await import('../src/services/learningEvents');
    await recordLearningEvents([
      { studentId: 'stuA', institutionId: 'instA', type: 'lesson_completed', source: 'lesson', verified: true, refs: { courseId: 'c', lessonId: 'l1' } },
      { studentId: 'stuA', institutionId: 'instA', type: 'tutor_reply', source: 'tutor_chat', verified: false, refs: { sessionId: 's', messageId: 'm' } },
      { studentId: 'stuB', institutionId: 'instB', type: 'lesson_completed', source: 'lesson', verified: true, refs: { courseId: 'c', lessonId: 'l1' } },
    ]);
  }

  it('keeps each school to its own events', async () => {
    await seedTwoSchools();
    const adminA = await bearer('a@a.com', 'admin', { institutionId: 'instA' });
    const all = await request(app).get('/api/analytics/events').set('Authorization', adminA);
    expect(all.status).toBe(200);
    expect(all.body.events.map((e: { studentId: string }) => e.studentId)).toEqual(['stuA', 'stuA']);
    expect(all.body.counts.lesson_completed).toEqual({ total: 1, verified: 1 });
    // Asking for another school's student or institution returns nothing.
    const other = await request(app).get('/api/analytics/events?studentId=stuB&institutionId=instB').set('Authorization', adminA);
    expect(other.body.events).toHaveLength(0);
    const verifiedOnly = await request(app).get('/api/analytics/events?verified=true').set('Authorization', adminA);
    expect(verifiedOnly.body.events).toHaveLength(1);
    expect((await request(app).get('/api/analytics/events?type=bogus').set('Authorization', adminA)).status).toBe(400);
  });

  it('shows students only their own events', async () => {
    await seedTwoSchools();
    const auth = await bearer('stuA@example.com', 'student', { studentId: 'stuA', institutionId: 'instA' });
    const res = await request(app).get('/api/me/events').set('Authorization', auth);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.events.every((e: { studentId: string }) => e.studentId === 'stuA')).toBe(true);
    expect((await request(app).get('/api/analytics/events').set('Authorization', auth)).status).toBe(403);
  });

  it('pages backwards in time', async () => {
    const { recordLearningEvents } = await import('../src/services/learningEvents');
    await recordLearningEvents(
      Array.from({ length: 5 }, (_, i) => ({
        studentId: 'stuA',
        institutionId: 'instA',
        type: 'lesson_viewed' as const,
        source: 'client' as const,
        verified: false,
        refs: { courseId: 'c', lessonId: 'l1' },
        at: new Date(Date.UTC(2026, 0, i + 1)),
      })),
    );
    const adminA = await bearer('a@a.com', 'admin', { institutionId: 'instA' });
    const first = await request(app).get('/api/analytics/events?limit=3').set('Authorization', adminA);
    expect(first.body.events).toHaveLength(3);
    const second = await request(app)
      .get(`/api/analytics/events?limit=3&before=${encodeURIComponent(first.body.nextBefore)}`)
      .set('Authorization', adminA);
    expect(second.body.events).toHaveLength(2);
    expect(second.body.nextBefore).toBeNull();
  });
});

describe('backfill migration', () => {
  it('creates events for past work once', async () => {
    await M.AssessmentAttempt.create({
      id: 'att-old',
      assessmentId: 'quiz-old',
      assessmentTitle: 'Old quiz',
      subject: 'Math',
      studentId: 'stu1',
      institutionId: 'instA',
      status: 'submitted',
      score: 100,
      submittedAt: new Date('2026-03-01'),
      answers: [{ questionId: 'q1', questionText: '?', topic: 'Addition', studentAnswer: '4', correctAnswer: '4', isCorrect: true, explanation: '' }],
    });
    await M.LessonProgress.create({ studentId: 'stu1', institutionId: 'instA', courseId: 'c1', lessonId: 'l1', status: 'completed', completedAt: new Date('2026-03-02') });
    const { MIGRATIONS } = await import('../src/migrations');
    const { runMigrations } = await import('../src/migrations/runner');
    await runMigrations(MIGRATIONS);
    expect(await M.LearningEvent.countDocuments()).toBe(3);
    await mongoose.connection.collection('migrations').deleteMany({});
    await runMigrations(MIGRATIONS);
    expect(await M.LearningEvent.countDocuments()).toBe(3);
  });
});
