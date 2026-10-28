import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  uploadToS3: vi.fn(),
  submitFileToEngine: vi.fn(),
  updateIngestionJob: vi.fn(),
  getIngestionJobByEventId: vi.fn(),
  pollEngineStatus: vi.fn(),
  queryOrchestratorChat: vi.fn(),
}));

vi.mock('../src/services/s3Service', () => ({
  uploadToS3: serviceMocks.uploadToS3,
}));

vi.mock('../src/services/ingestionService', () => ({
  submitFileToEngine: serviceMocks.submitFileToEngine,
  updateIngestionJob: serviceMocks.updateIngestionJob,
  getIngestionJobByEventId: serviceMocks.getIngestionJobByEventId,
  pollEngineStatus: serviceMocks.pollEngineStatus,
}));

vi.mock('../src/services/enaraOrchestrator', () => ({
  fetchOrchestratorCourses: vi.fn(async () => []),
  fetchOrchestratorSections: vi.fn(async () => []),
  queryOrchestratorChat: serviceMocks.queryOrchestratorChat,
  buildFallbackTutorReply: (query: string, teachingMethod: string, lessonTitle?: string) => ({
    answer: `Fallback answer for ${lessonTitle || 'lesson'}: ${query}`,
    intent: 'fallback_local',
    context_found: 0,
    version: `fallback-${teachingMethod}`,
  }),
}));

type TestApp = ReturnType<typeof import('../src/app').createApp>;
type UserModel = typeof import('../src/models/User').User;
type StudentModel = typeof import('../src/models/Student').Student;
type CourseInstanceModel = typeof import('../src/models/CourseInstance').CourseInstance;
type CurriculumModel = typeof import('../src/models/Curriculum').Curriculum;
type AssessmentModel = typeof import('../src/models/Assessment').Assessment;
type AssessmentAttemptModel = typeof import('../src/models/AssessmentAttempt').AssessmentAttempt;
type StudentCreditModel = typeof import('../src/models/StudentCredit').StudentCredit;
type UsageEventModel = typeof import('../src/models/UsageEvent').UsageEvent;

let mongo: MongoMemoryServer;
let app: TestApp;
let User: UserModel;
let Student: StudentModel;
let CourseInstance: CourseInstanceModel;
let Curriculum: CurriculumModel;
let Assessment: AssessmentModel;
let AssessmentAttempt: AssessmentAttemptModel;
let StudentCredit: StudentCreditModel;
let UsageEvent: UsageEventModel;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;

const jwtSecret = 'test-jwt-secret-32-characters-minimum';
const hmacSecret = 'test-hmac-secret-32-characters-minimum';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend',
    JWT_AUDIENCE: 'enara-platform',
    INGEST_HMAC_SECRET: hmacSecret,
    INGEST_HMAC_TOLERANCE_SECONDS: '300',
    INGEST_ACCEPT_LEGACY_SIGNATURES: 'false',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999',
    ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998',
    AWS_S3_BUCKET: 'test-bucket',
    TRUST_PROXY: 'false',
    SERVE_LOCAL_UPLOADS: 'false',
  });

  const env = await import('../src/config/env');
  env.resetConfigForTests();

  ({ User } = await import('../src/models/User'));
  ({ Student } = await import('../src/models/Student'));
  ({ CourseInstance } = await import('../src/models/CourseInstance'));
  ({ Curriculum } = await import('../src/models/Curriculum'));
  ({ Assessment } = await import('../src/models/Assessment'));
  ({ AssessmentAttempt } = await import('../src/models/AssessmentAttempt'));
  ({ StudentCredit } = await import('../src/models/StudentCredit'));
  ({ UsageEvent } = await import('../src/models/UsageEvent'));
  ({ signAccessToken } = await import('../src/auth/jwt'));

  await mongoose.connect(mongo.getUri());
  const { createApp } = await import('../src/app');
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([
    User.deleteMany({}),
    Student.deleteMany({}),
    CourseInstance.deleteMany({}),
    Curriculum.deleteMany({}),
    Assessment.deleteMany({}),
    AssessmentAttempt.deleteMany({}),
    StudentCredit.deleteMany({}),
    UsageEvent.deleteMany({}),
  ]);

  serviceMocks.uploadToS3.mockResolvedValue('courses/courseA/materials/file.pdf');
  serviceMocks.submitFileToEngine.mockResolvedValue({ eventId: 'evt-upload', ingestionId: 'ing-upload' });
  serviceMocks.updateIngestionJob.mockResolvedValue(undefined);
  serviceMocks.getIngestionJobByEventId.mockResolvedValue(null);
  serviceMocks.pollEngineStatus.mockResolvedValue(null);
  serviceMocks.queryOrchestratorChat.mockResolvedValue({
    answer: 'Remote answer',
    intent: 'answered',
    context_found: 1,
    version: 'orchestrator-v1',
  });
});

async function createUser(params: {
  email: string;
  password?: string;
  role?: 'student' | 'teacher' | 'admin' | 'enara-admin';
  studentId?: string;
  institutionId?: string;
  status?: 'active' | 'disabled';
}) {
  const password = params.password || 'Password123!';
  return User.create({
    email: params.email,
    password: await bcrypt.hash(password, 10),
    role: params.role || 'student',
    name: params.email.split('@')[0],
    studentId: params.studentId,
    institutionId: params.institutionId,
    status: params.status || 'active',
  });
}

async function bearer(params: Parameters<typeof createUser>[0]) {
  const user = await createUser(params);
  return {
    user,
    token: signAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      institutionId: user.institutionId,
    }),
  };
}

function auth(token: string) {
  return `Bearer ${token}`;
}

async function seedInstitution(institutionId: string, prefix: string) {
  await Student.create([
    { id: `${prefix}1`, name: `${prefix} One`, email: `${prefix}1@example.com`, grade: 'Grade 10', institutionId, batchId: `${prefix}-batch` },
    { id: `${prefix}2`, name: `${prefix} Two`, email: `${prefix}2@example.com`, grade: 'Grade 10', institutionId, batchId: `${prefix}-batch` },
    { id: `${prefix}3`, name: `${prefix} Three`, email: `${prefix}3@example.com`, grade: 'Grade 10', institutionId, batchId: `${prefix}-batch` },
  ]);
}

describe('admin credits report', () => {
  beforeEach(async () => {
    await seedInstitution('instA', 'A');
    await seedInstitution('instB', 'B');
    await StudentCredit.create([
      { studentId: 'A1', institutionId: 'instA', limit: 100, usage: 90, status: 'active' },
      { studentId: 'A2', institutionId: 'instA', limit: 100, usage: 10, status: 'blocked' },
      { studentId: 'B1', institutionId: 'instB', limit: 100, usage: 50, status: 'active' },
    ]);
    const now = new Date();
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await UsageEvent.create([
      { id: 'u1', userId: 'x', studentId: 'A1', institutionId: 'instA', feature: 'chat', requestId: 'r1', creditsUsed: 5, status: 'settled', timestamp: now },
      { id: 'u2', userId: 'x', studentId: 'A1', institutionId: 'instA', feature: 'chat', requestId: 'r2', creditsUsed: 7, status: 'settled', timestamp: now },
      { id: 'u3', userId: 'x', studentId: 'A2', institutionId: 'instA', feature: 'tts', requestId: 'r3', creditsUsed: 3, status: 'settled', timestamp: now },
      { id: 'u4', userId: 'x', studentId: 'A2', institutionId: 'instA', feature: 'chat', requestId: 'r4', creditsUsed: 100, status: 'reserved', timestamp: now },
      { id: 'u5', userId: 'x', studentId: 'A1', institutionId: 'instA', feature: 'chat', requestId: 'r5', creditsUsed: 100, status: 'settled', timestamp: old },
      { id: 'u6', userId: 'x', studentId: 'B1', institutionId: 'instB', feature: 'chat', requestId: 'r6', creditsUsed: 40, status: 'settled', timestamp: now },
    ]);
  });

  it('rejects unauthenticated and student callers', async () => {
    expect((await request(app).get('/api/credits')).status).toBe(401);
    const student = await bearer({ email: 'a1@example.com', role: 'student', studentId: 'A1', institutionId: 'instA' });
    const res = await request(app).get('/api/credits').set('Authorization', auth(student.token));
    expect(res.status).toBe(403);
  });

  it('reports only the admin\'s institution, with defaults for students without a credit record', async () => {
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });
    const res = await request(app).get('/api/credits').set('Authorization', auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.students.map((s: { studentId: string }) => s.studentId)).toEqual(['A1', 'A2', 'A3']);
    expect(res.body.students[2]).toMatchObject({ studentId: 'A3', limit: 50000, usage: 0, status: 'active' });
    expect(res.body.summary).toMatchObject({ studentCount: 3, blocked: 1, nearLimit: 1, totalUsage: 100 });
    // Settled events in the last 30 days only; reserved and older events are excluded.
    expect(res.body.usageByFeature).toEqual([
      { feature: 'chat', credits: 12, events: 2 },
      { feature: 'tts', credits: 3, events: 1 },
    ]);
    expect(res.body.usageByDay).toHaveLength(30);
    expect(res.body.usageByDay[29]).toMatchObject({ date: new Date().toISOString().slice(0, 10), credits: 15, events: 3 });
    expect(res.body.usageByDay[0]).toMatchObject({ credits: 0, events: 0 });
  });

  it('ignores ?institutionId= for institution admins', async () => {
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });
    const res = await request(app).get('/api/credits?institutionId=instB').set('Authorization', auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.students.every((s: { institutionId: string }) => s.institutionId === 'instA')).toBe(true);
  });

  it('lets Enara admins see every institution or narrow to one', async () => {
    const enara = await bearer({ email: 'enara@example.com', role: 'enara-admin' });
    const all = await request(app).get('/api/credits').set('Authorization', auth(enara.token));
    expect(all.body.summary.studentCount).toBe(6);

    const one = await request(app).get('/api/credits?institutionId=instB').set('Authorization', auth(enara.token));
    expect(one.body.summary.studentCount).toBe(3);
    expect(one.body.usageByFeature).toEqual([{ feature: 'chat', credits: 40, events: 1 }]);
  });
});

describe('admin assessment attempts', () => {
  beforeEach(async () => {
    await seedInstitution('instA', 'A');
    await seedInstitution('instB', 'B');
    await Assessment.create({
      id: 'asmA',
      institutionId: 'instA',
      title: 'Algebra quiz',
      subject: 'Mathematics',
      duration: 20,
      status: 'active',
      dueDate: '2026-11-01',
      difficulty: 'Easy',
      batchId: 'A-batch',
      questions: [
        { id: 'q1', type: 'multiple-choice', text: '1+1?', topic: 'Arithmetic', options: ['1', '2'], correctAnswer: 1, explanation: '' },
        { id: 'q2', type: 'multiple-choice', text: '2+2?', topic: 'Arithmetic', options: ['4', '5'], correctAnswer: 0, explanation: '' },
      ],
    });
    const answer = (questionId: string, isCorrect: boolean) => ({
      questionId, questionText: questionId, studentAnswer: 0, correctAnswer: 0, isCorrect, explanation: '',
    });
    await AssessmentAttempt.create([
      // A1: an older failed attempt, then a newer full-marks one.
      { id: 'att1', assessmentId: 'asmA', assessmentTitle: 'Algebra quiz', studentId: 'A1', institutionId: 'instA', status: 'submitted', score: 50, answers: [answer('q1', true), answer('q2', false)], startedAt: new Date('2026-10-01'), submittedAt: new Date('2026-10-01') },
      { id: 'att2', assessmentId: 'asmA', assessmentTitle: 'Algebra quiz', studentId: 'A1', institutionId: 'instA', status: 'submitted', score: 100, answers: [answer('q1', true), answer('q2', true)], startedAt: new Date('2026-10-02'), submittedAt: new Date('2026-10-02') },
      { id: 'att3', assessmentId: 'asmA', assessmentTitle: 'Algebra quiz', studentId: 'A2', institutionId: 'instA', status: 'submitted', score: 0, answers: [answer('q1', false), answer('q2', false)], startedAt: new Date('2026-10-03'), submittedAt: new Date('2026-10-03') },
    ]);
  });

  it('summarises who submitted, latest scores and per-question correct rates', async () => {
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });
    const res = await request(app).get('/api/assessments/asmA/attempts').set('Authorization', auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      assigned: 3, submitted: 2, inProgress: 0, notStarted: 1, averageScore: 50, highestScore: 100, lowestScore: 0,
    });
    const byId = Object.fromEntries(res.body.students.map((s: { studentId: string }) => [s.studentId, s]));
    expect(byId.A1).toMatchObject({ status: 'submitted', score: 100, attemptId: 'att2', attemptCount: 2 });
    expect(byId.A3).toMatchObject({ status: 'not-started', score: null, attemptCount: 0 });
    expect(byId.A1.answers).toHaveLength(2);
    expect(byId.A3.answers).toEqual([]);
    expect(res.body.questions).toEqual([
      expect.objectContaining({ questionId: 'q1', answered: 2, correct: 1, correctRate: 50 }),
      expect.objectContaining({ questionId: 'q2', answered: 2, correct: 1, correctRate: 50 }),
    ]);
  });

  it('hides other institutions\' assessments and rejects students', async () => {
    const otherAdmin = await bearer({ email: 'admin-b@example.com', role: 'admin', institutionId: 'instB' });
    const res = await request(app).get('/api/assessments/asmA/attempts').set('Authorization', auth(otherAdmin.token));
    expect(res.status).toBe(404);

    const student = await bearer({ email: 'a1@example.com', role: 'student', studentId: 'A1', institutionId: 'instA' });
    const asStudent = await request(app).get('/api/assessments/asmA/attempts').set('Authorization', auth(student.token));
    expect(asStudent.status).toBe(403);
  });
});
