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
type InstitutionModel = typeof import('../src/models/Institution').Institution;
type ApiKeyModel = typeof import('../src/models/ApiKey').ApiKey;
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
let Institution: InstitutionModel;
let ApiKey: ApiKeyModel;
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
  ({ Institution } = await import('../src/models/Institution'));
  ({ ApiKey } = await import('../src/models/ApiKey'));
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
    Institution.deleteMany({}),
    ApiKey.deleteMany({}),
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

function pdfBuffer() {
  return Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
}

async function onboard(token: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/integrations/institutions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      institutionName: 'Cairo Science School',
      lmsSystem: 'Moodle',
      adminName: 'Laila Hassan',
      adminEmail: 'laila@cairo.example.com',
      adminPhone: '+20 100 000 0000',
      ...overrides,
    });
}

describe('partner integrations', () => {
  it('lets only Enara admins onboard institutions', async () => {
    const schoolAdmin = await bearer({ email: 'admin@a.example.com', role: 'admin', institutionId: 'instA' });
    const res = await onboard(schoolAdmin.token);
    expect(res.status).toBe(403);
    expect(await Institution.countDocuments()).toBe(0);
  });

  it('creates the institution, a working admin login and a hashed API key', async () => {
    const enara = await bearer({ email: 'ops@enara.example.com', role: 'enara-admin' });
    const res = await onboard(enara.token);

    expect(res.status).toBe(201);
    const { institutionId, apiKey, credentials } = res.body;
    expect(institutionId).toMatch(/^inst-[0-9a-f]{12}$/);
    expect(apiKey).toMatch(/^enara_live_[A-Za-z0-9_-]{32}$/);
    expect(credentials.username).toBe('laila@cairo.example.com');

    const admin = await User.findOne({ email: 'laila@cairo.example.com' });
    expect(admin?.role).toBe('admin');
    expect(admin?.institutionId).toBe(institutionId);

    const stored = await ApiKey.findOne({ institutionId }).select('+keyHash');
    expect(stored?.keyHash).toBeTruthy();
    expect(stored?.keyHash).not.toContain(apiKey);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.username, password: credentials.password });
    expect(login.status).toBe(200);

    const duplicate = await onboard(enara.token, { institutionName: 'Another' });
    expect(duplicate.status).toBe(409);
    expect(await Institution.countDocuments()).toBe(1);
  });

  it('validates keys against admin, institution and LMS, and reports revocation', async () => {
    const enara = await bearer({ email: 'ops@enara.example.com', role: 'enara-admin' });
    const { body } = await onboard(enara.token);
    const validate = (payload: Record<string, unknown>) =>
      request(app)
        .post('/api/integrations/api-keys/validate')
        .set('Authorization', `Bearer ${enara.token}`)
        .send(payload);

    const ok = await validate({
      apiKey: body.apiKey,
      adminIdentifier: 'LAILA@cairo.example.com',
      institutionIdentifier: 'cairo science school',
      lmsSystemId: 'moodle',
    });
    expect(ok.body.isValid).toBe(true);
    expect(ok.body.details.permissions).toEqual(['curriculum:ingest', 'ingestion:read']);

    const wrongInstitution = await validate({
      apiKey: body.apiKey,
      adminIdentifier: 'laila@cairo.example.com',
      institutionIdentifier: 'Other School',
    });
    expect(wrongInstitution.body.isValid).toBe(false);
    expect(wrongInstitution.body.details.institutionMatch).toBe(false);

    const unknown = await validate({
      apiKey: 'enara_live_' + 'x'.repeat(32),
      adminIdentifier: 'a',
      institutionIdentifier: 'b',
    });
    expect(unknown.body.details.apiKeyStatus).toBe('not_found');

    const revoke = await request(app)
      .post(`/api/integrations/api-keys/${body.apiKeyInfo.id}/revoke`)
      .set('Authorization', `Bearer ${enara.token}`);
    expect(revoke.status).toBe(200);
    const revoked = await validate({
      apiKey: body.apiKey,
      adminIdentifier: 'laila@cairo.example.com',
      institutionIdentifier: body.institutionId,
    });
    expect(revoked.body.isValid).toBe(false);
    expect(revoked.body.details.apiKeyStatus).toBe('revoked');
  });

  it('accepts API keys for course uploads in their own institution only', async () => {
    const enara = await bearer({ email: 'ops@enara.example.com', role: 'enara-admin' });
    const { body } = await onboard(enara.token);
    await CourseInstance.create([
      { id: 'own-course', courseId: 'courseOwn', courseName: 'Physics', institutionId: body.institutionId, academicYear: '2026', batchId: 'b1', studentIds: [], instructorIds: [] },
      { id: 'other-course', courseId: 'courseOther', courseName: 'Physics', institutionId: 'instB', academicYear: '2026', batchId: 'b2', studentIds: [], instructorIds: [] },
    ]);
    const upload = (courseId: string, key: string) =>
      request(app)
        .post(`/api/upload/course/${courseId}`)
        .set('Authorization', `Bearer ${key}`)
        .attach('file', pdfBuffer(), { filename: 'notes.pdf', contentType: 'application/pdf' });

    const own = await upload('courseOwn', body.apiKey);
    expect(own.status).toBe(202);
    expect(serviceMocks.submitFileToEngine).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: body.institutionId, courseId: 'courseOwn' })
    );

    const other = await upload('courseOther', body.apiKey);
    expect(other.status).toBe(404);

    const bogus = await upload('courseOwn', 'enara_live_' + 'y'.repeat(32));
    expect(bogus.status).toBe(401);

    const stored = await ApiKey.findOne({ id: body.apiKeyInfo.id });
    expect(stored?.lastUsedAt).toBeTruthy();

    await ApiKey.updateOne({ id: body.apiKeyInfo.id }, { $set: { status: 'revoked' } });
    const afterRevoke = await upload('courseOwn', body.apiKey);
    expect(afterRevoke.status).toBe(401);
  });

  it('does not accept API keys on routes that have not opted in', async () => {
    const enara = await bearer({ email: 'ops@enara.example.com', role: 'enara-admin' });
    const { body } = await onboard(enara.token);
    const res = await request(app).get('/api/students').set('Authorization', `Bearer ${body.apiKey}`);
    expect(res.status).toBe(401);
  });
});
