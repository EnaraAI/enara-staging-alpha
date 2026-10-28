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
  queryDirectTutorModel: vi.fn(),
  isDirectTutorModelConfigured: vi.fn(),
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

vi.mock('../src/services/directTutorModel', () => ({
  queryDirectTutorModel: serviceMocks.queryDirectTutorModel,
  isDirectTutorModelConfigured: serviceMocks.isDirectTutorModelConfigured,
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
type LessonProgressModel = typeof import('../src/models/LessonProgress').LessonProgress;
type TutorSessionModel = typeof import('../src/models/TutorSession').TutorSession;
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
let LessonProgress: LessonProgressModel;
let TutorSession: TutorSessionModel;
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
    ENARA_DEFAULT_COURSE_ID: 'default-orchestrator-course',
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
  ({ LessonProgress } = await import('../src/models/LessonProgress'));
  ({ TutorSession } = await import('../src/models/TutorSession'));
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
    LessonProgress.deleteMany({}),
    TutorSession.deleteMany({}),
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

async function seedUnlinkedCourse() {
  await seedInstitution('instA', 'A');
  await Curriculum.create({
    id: 'curA', name: 'Algebra', courseName: 'Algebra', institutionId: 'instA', type: 'core', level: '10',
    languages: ['en'], summary: 'Algebra basics', description: 'd', lastUpdated: '2026-10-01', subjectsCount: 1,
    assignedBatches: ['A-batch'], status: 'deployed',
    chapters: [{ id: 'ch1', title: 'Linear equations', uploads: [], enaraSectionId: 'section-of-another-course' }],
  });
  await CourseInstance.create({
    id: 'ciA', courseId: 'ALG10', courseName: 'Algebra 10', institutionId: 'instA', academicYear: '2026',
    batchId: 'A-batch', curriculumId: 'curA', studentIds: [], instructorIds: [], visibility: 'student',
  });
  await StudentCredit.create({ studentId: 'A1', institutionId: 'instA', limit: 100, usage: 0, status: 'active' });
  return bearer({ email: 'a1@example.com', role: 'student', studentId: 'A1', institutionId: 'instA' });
}

async function ask(token: string, text: string) {
  const session = await request(app)
    .post('/api/me/tutor/sessions')
    .set('Authorization', auth(token))
    .send({ courseId: 'ALG10', lessonId: 'ch1' });
  return request(app)
    .post(`/api/me/tutor/sessions/${session.body.id}/messages`)
    .set('Authorization', auth(token))
    .send({ text });
}

describe('tutor reply sources', () => {
  beforeEach(() => {
    serviceMocks.isDirectTutorModelConfigured.mockReturnValue(true);
    serviceMocks.queryDirectTutorModel.mockResolvedValue({
      answer: 'Direct model answer', intent: 'direct_model', context_found: 0, version: 'anthropic:claude-opus-5-5',
    });
  });

  it('uses the default orchestrator course, without foreign section ids, when the curriculum is not linked', async () => {
    const student = await seedUnlinkedCourse();
    const res = await ask(student.token, 'How do I solve 2x+3=7?');

    expect(res.status).toBe(200);
    expect(serviceMocks.queryOrchestratorChat).toHaveBeenCalledWith(
      expect.objectContaining({ course_id: 'default-orchestrator-course', section_ids: undefined })
    );
    expect(serviceMocks.queryDirectTutorModel).not.toHaveBeenCalled();
    expect(res.body.assistantMessage.text).toBe('Remote answer');
  });

  it('falls back to the direct model when the orchestrator returns nothing, and charges for it', async () => {
    const student = await seedUnlinkedCourse();
    serviceMocks.queryOrchestratorChat.mockResolvedValue(null);
    const res = await ask(student.token, 'How do I solve 2x+3=7?');

    expect(res.status).toBe(200);
    expect(res.body.assistantMessage.text).toBe('Direct model answer');
    expect(res.body.meta).toMatchObject({ intent: 'direct_model', version: 'anthropic:claude-opus-5-5' });
    const credits = await StudentCredit.findOne({ studentId: 'A1' });
    expect(credits?.usage).toBeGreaterThan(0);
  });

  it('says the tutor is unavailable, without charging, when no AI service answers', async () => {
    const student = await seedUnlinkedCourse();
    serviceMocks.queryOrchestratorChat.mockResolvedValue(null);
    serviceMocks.queryDirectTutorModel.mockResolvedValue(null);
    const res = await ask(student.token, 'How do I solve 2x+3=7?');

    expect(res.status).toBe(200);
    expect(res.body.meta.intent).toBe('fallback_local');
    const credits = await StudentCredit.findOne({ studentId: 'A1' });
    expect(credits?.usage).toBe(0);
  });
});
