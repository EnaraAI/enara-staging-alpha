import { createHmac } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
let createSignedHeaders: typeof import('../src/utils/hmac').createSignedHeaders;
let reserveUsage: typeof import('../src/services/creditsService').reserveUsage;
let loadConfig: typeof import('../src/config/env').loadConfig;
let logger: typeof import('../src/utils/logging').logger;

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
  ({ createSignedHeaders } = await import('../src/utils/hmac'));
  ({ reserveUsage } = await import('../src/services/creditsService'));
  ({ loadConfig } = env);
  ({ logger } = await import('../src/utils/logging'));

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

function pdfBuffer() {
  return Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
}

async function seedCourseForUpload() {
  await CourseInstance.create({
    id: 'instA',
    courseId: 'courseA',
    courseName: 'Algebra',
    institutionId: 'instA',
    academicYear: '2026',
    batchId: 'batchA',
    curriculumId: 'curA',
    studentIds: [],
    instructorIds: [],
  });
}

async function seedStudentWithCourse(studentId = 'studentA') {
  await Student.create({
    id: studentId,
    name: 'Student A',
    email: `${studentId}@example.com`,
    grade: 'Grade 10',
    institutionId: 'instA',
    batchId: 'batchA',
  });
  await Curriculum.create({
    id: 'curA',
    name: 'Algebra Curriculum',
    courseName: 'Algebra',
    institutionId: 'instA',
    summary: 'Linear equations',
    lastUpdated: '2026-01-01',
    assignedBatches: ['batchA'],
    status: 'deployed',
    enaraCourseId: 'orchestrator-course-a',
    chapters: [{ id: 'lessonA', title: 'Equations', uploads: [], enaraSectionId: 'section-a' }],
  });
  await CourseInstance.create({
    id: 'instA',
    courseId: 'courseA',
    courseName: 'Algebra',
    institutionId: 'instA',
    academicYear: '2026',
    batchId: 'batchA',
    curriculumId: 'curA',
    studentIds: [studentId],
    instructorIds: [],
    visibility: 'student',
  });
}

function signIngestion(method: string, path: string, payload: object, timestamp?: number) {
  const body = JSON.stringify(payload);
  const headers = createSignedHeaders(method, path, body, timestamp);
  return { body, headers };
}

describe('auth hardening', () => {
  it('allows normal public student registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'newstudent@example.com', password: 'Password123!' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('student');
    expect(await User.findOne({ email: 'newstudent@example.com', role: 'student' })).toBeTruthy();
  });

  it('rejects public privileged role injection', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'attacker@example.com', password: 'Password123!', role: 'enara-admin' });

    expect(res.status).toBe(403);
    expect(await User.findOne({ email: 'attacker@example.com' })).toBeNull();
  });

  it('rejects Mongo operator role payloads during registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'operator@example.com', password: 'Password123!', role: { $ne: 'student' } });

    expect(res.status).toBe(400);
    expect(await User.findOne({ email: 'operator@example.com' })).toBeNull();
  });

  it('logs in with a valid password and rejects a wrong password', async () => {
    await createUser({ email: 'login@example.com', password: 'Password123!', role: 'student' });

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'Password123!' });
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrong-password' });

    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));
    expect(bad.status).toBe(401);
  });

  it('rejects malformed, expired, and wrong-secret JWTs', async () => {
    const user = await createUser({ email: 'jwt@example.com', role: 'student', studentId: 'studentA' });
    const expired = jwt.sign(
      { typ: 'access', role: 'student' },
      jwtSecret,
      {
        algorithm: 'HS256',
        issuer: 'enara-backend',
        audience: 'enara-platform',
        subject: user._id.toString(),
        expiresIn: '-1s',
      }
    );
    const wrongSecret = jwt.sign(
      { typ: 'access', role: 'student' },
      'different-secret',
      {
        algorithm: 'HS256',
        issuer: 'enara-backend',
        audience: 'enara-platform',
        subject: user._id.toString(),
        expiresIn: '1h',
      }
    );

    const malformed = await request(app).get('/api/me').set('Authorization', 'Bearer nope');
    const expiredRes = await request(app).get('/api/me').set('Authorization', auth(expired));
    const wrongSecretRes = await request(app).get('/api/me').set('Authorization', auth(wrongSecret));

    expect(malformed.status).toBe(401);
    expect(expiredRes.status).toBe(401);
    expect(wrongSecretRes.status).toBe(401);
  });

  it('authorizes from the database user, not client-controlled JWT claims', async () => {
    await Student.create({
      id: 'studentA',
      name: 'Student A',
      email: 'student-a@example.com',
      grade: 'Grade 10',
      institutionId: 'instA',
    });
    const user = await createUser({
      email: 'claimswap@example.com',
      role: 'student',
      studentId: 'studentA',
      institutionId: 'instA',
    });
    const forgedClaims = jwt.sign(
      { typ: 'access', role: 'enara-admin', studentId: 'other-student' },
      jwtSecret,
      {
        algorithm: 'HS256',
        issuer: 'enara-backend',
        audience: 'enara-platform',
        subject: user._id.toString(),
        expiresIn: '1h',
      }
    );

    const me = await request(app).get('/api/me').set('Authorization', auth(forgedClaims));
    const adminRoute = await request(app).get('/api/students').set('Authorization', auth(forgedClaims));

    expect(me.status).toBe(200);
    expect(me.body.id).toBe('studentA');
    expect(adminRoute.status).toBe(403);
  });
});

describe('RBAC and tenant isolation', () => {
  it('blocks students and teachers from admin-only student management', async () => {
    const student = await bearer({ email: 'student@example.com', role: 'student', studentId: 'studentA' });
    const teacher = await bearer({ email: 'teacher@example.com', role: 'teacher', institutionId: 'instA' });

    const studentRes = await request(app).get('/api/students').set('Authorization', auth(student.token));
    const teacherRes = await request(app).get('/api/students').set('Authorization', auth(teacher.token));

    expect(studentRes.status).toBe(403);
    expect(teacherRes.status).toBe(403);
  });

  it('prevents an institution admin from reading another institution student', async () => {
    await Student.create({
      id: 'studentA',
      name: 'Student A',
      email: 'student-a@example.com',
      grade: 'Grade 10',
      institutionId: 'instA',
    });
    await Student.create({
      id: 'studentB',
      name: 'Student B',
      email: 'student-b@example.com',
      grade: 'Grade 10',
      institutionId: 'instB',
    });
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });

    const own = await request(app).get('/api/students/studentA').set('Authorization', auth(admin.token));
    const other = await request(app).get('/api/students/studentB').set('Authorization', auth(admin.token));

    expect(own.status).toBe(200);
    expect(other.status).toBe(404);
  });

  it('prevents student A from reading student B by tampering with JWT studentId claims', async () => {
    await Student.create({
      id: 'studentA',
      name: 'Student A',
      email: 'student-a@example.com',
      grade: 'Grade 10',
      institutionId: 'instA',
    });
    await Student.create({
      id: 'studentB',
      name: 'Student B',
      email: 'student-b@example.com',
      grade: 'Grade 10',
      institutionId: 'instA',
    });
    const user = await createUser({
      email: 'student-a-user@example.com',
      role: 'student',
      studentId: 'studentA',
      institutionId: 'instA',
    });
    const token = jwt.sign(
      { typ: 'access', role: 'student', studentId: 'studentB' },
      jwtSecret,
      {
        algorithm: 'HS256',
        issuer: 'enara-backend',
        audience: 'enara-platform',
        subject: user._id.toString(),
        expiresIn: '1h',
      }
    );

    const res = await request(app).get('/api/me').set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('studentA');
  });
});

describe('upload security', () => {
  it('rejects anonymous and student course uploads', async () => {
    await seedCourseForUpload();
    const student = await bearer({ email: 'upload-student@example.com', role: 'student', studentId: 'studentA' });

    const anonymous = await request(app)
      .post('/api/upload/course/courseA')
      .attach('file', pdfBuffer(), { filename: 'notes.pdf', contentType: 'application/pdf' });
    const studentUpload = await request(app)
      .post('/api/upload/course/courseA')
      .set('Authorization', auth(student.token))
      .attach('file', pdfBuffer(), { filename: 'notes.pdf', contentType: 'application/pdf' });

    expect(anonymous.status).toBe(401);
    expect(studentUpload.status).toBe(403);
    expect(serviceMocks.uploadToS3).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant teacher course uploads and accepts authorized uploads', async () => {
    await CourseInstance.create({
      id: 'instA-course',
      courseId: 'courseA',
      courseName: 'Algebra',
      institutionId: 'instA',
      academicYear: '2026',
      batchId: 'batchA',
      studentIds: [],
      instructorIds: [],
    });
    const teacherOther = await bearer({
      email: 'teacher-b@example.com',
      role: 'teacher',
      institutionId: 'instB',
    });
    const teacherOwn = await bearer({
      email: 'teacher-a@example.com',
      role: 'teacher',
      institutionId: 'instA',
    });
    await CourseInstance.updateOne(
      { courseId: 'courseA' },
      { $set: { instructorIds: [teacherOwn.user._id.toString()] } }
    );

    const other = await request(app)
      .post('/api/upload/course/courseA')
      .set('Authorization', auth(teacherOther.token))
      .attach('file', pdfBuffer(), { filename: 'notes.pdf', contentType: 'application/pdf' });
    const own = await request(app)
      .post('/api/upload/course/courseA')
      .set('Authorization', auth(teacherOwn.token))
      .field('institutionId', 'instA')
      .attach('file', pdfBuffer(), { filename: 'notes.pdf', contentType: 'application/pdf' });

    expect(other.status).toBe(404);
    expect(own.status).toBe(202);
    expect(serviceMocks.uploadToS3).toHaveBeenCalledTimes(1);
    expect(serviceMocks.submitFileToEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'instA',
        courseId: 'courseA',
        instructorId: teacherOwn.user._id.toString(),
      })
    );
  });

  it('rejects forbidden upload types', async () => {
    await CourseInstance.create({
      id: 'instA-course',
      courseId: 'courseA',
      courseName: 'Algebra',
      institutionId: 'instA',
      academicYear: '2026',
      batchId: 'batchA',
      studentIds: [],
      instructorIds: [],
    });
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });

    const res = await request(app)
      .post('/api/upload/course/courseA')
      .set('Authorization', auth(admin.token))
      .attach('file', Buffer.from('MZ executable'), {
        filename: '../../secret.pdf.exe',
        contentType: 'application/x-msdownload',
      });

    expect(res.status).toBe(415);
    expect(serviceMocks.uploadToS3).not.toHaveBeenCalled();
  });
});

describe('ingestion HMAC and IDOR protection', () => {
  it('rejects unsigned, bad, stale, and tampered ingestion callbacks', async () => {
    const payload = { event_id: 'evtA', status: 'completed' };
    const valid = signIngestion('POST', '/api/ingestion/callback', payload);
    const stale = signIngestion(
      'POST',
      '/api/ingestion/callback',
      payload,
      Math.floor(Date.now() / 1000) - 1000
    );

    const unsigned = await request(app).post('/api/ingestion/callback').send(payload);
    const bad = await request(app)
      .post('/api/ingestion/callback')
      .set('X-Enara-Timestamp', valid.headers['X-Enara-Timestamp'])
      .set('X-Enara-Signature', 'v1=bad')
      .send(payload);
    const old = await request(app)
      .post('/api/ingestion/callback')
      .set(stale.headers)
      .set('Content-Type', 'application/json')
      .send(stale.body);
    const tampered = await request(app)
      .post('/api/ingestion/callback')
      .set(valid.headers)
      .send({ event_id: 'evtA', status: 'failed' });

    expect(unsigned.status).toBe(401);
    expect(bad.status).toBe(401);
    expect(old.status).toBe(401);
    expect(tampered.status).toBe(401);
    expect(serviceMocks.updateIngestionJob).not.toHaveBeenCalled();
  });

  it('accepts a valid signed ingestion callback', async () => {
    const payload = { event_id: 'evtA', status: 'completed', chunk_count: 3 };
    const signed = signIngestion('POST', '/api/ingestion/callback', payload);

    const res = await request(app)
      .post('/api/ingestion/callback')
      .set(signed.headers)
      .set('Content-Type', 'application/json')
      .send(signed.body);

    expect(res.status).toBe(200);
    expect(serviceMocks.updateIngestionJob).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 'evtA', status: 'completed', chunk_count: 3 })
    );
  });

  it('accepts the engine plain-HMAC callback signature (BACKEND_API.md §2.1) but only on /callback', async () => {
    const body = JSON.stringify({ event_id: 'evtA', status: 'completed', chunk_count: null, error: null });
    const plain = createHmac('sha256', hmacSecret).update(body).digest('hex');

    const callback = await request(app)
      .post('/api/ingestion/callback')
      .set('X-Enara-Signature', plain)
      .set('Content-Type', 'application/json')
      .send(body);
    const submit = await request(app)
      .post('/api/ingestion/submit')
      .set('X-Enara-Signature', plain)
      .set('Content-Type', 'application/json')
      .send(body);
    const wrongSecret = await request(app)
      .post('/api/ingestion/callback')
      .set('X-Enara-Signature', createHmac('sha256', 'not-the-secret').update(body).digest('hex'))
      .set('Content-Type', 'application/json')
      .send(body);

    expect(callback.status).toBe(200);
    expect(submit.status).toBe(401);
    expect(wrongSecret.status).toBe(401);
  });

  // Ingestion status lives in Postgres; without it the route answers 503
  // (F-1, P14.8). These cases model a deployment that has it (service mocked).
  async function withPostgresConfigured<T>(fn: () => PromiseLike<T>): Promise<T> {
    const env = await import('../src/config/env');
    process.env.DATABASE_URL = 'postgres://localhost:5432/enara-test-not-connected';
    env.resetConfigForTests();
    try {
      return await fn();
    } finally {
      delete process.env.DATABASE_URL;
      env.resetConfigForTests();
    }
  }

  it('prevents another institution from reading ingestion status', async () => {
    serviceMocks.getIngestionJobByEventId.mockResolvedValue({
      event_id: 'evtA',
      status: 'queued',
      school_id: 'instB',
      created_by_user_id: 'someone-else',
    });
    const adminA = await bearer({ email: 'ing-admin@example.com', role: 'admin', institutionId: 'instA' });

    const res = await withPostgresConfigured(() => request(app)
      .get('/api/ingestion/status/evtA')
      .set('Authorization', auth(adminA.token)));

    expect(res.status).toBe(404);
  });

  it('allows the owning institution to read ingestion status', async () => {
    serviceMocks.getIngestionJobByEventId.mockResolvedValue({
      event_id: 'evtA',
      status: 'queued',
      school_id: 'instA',
      created_by_user_id: 'someone-else',
    });
    const adminA = await bearer({ email: 'ing-admin@example.com', role: 'admin', institutionId: 'instA' });

    const res = await withPostgresConfigured(() => request(app)
      .get('/api/ingestion/status/evtA')
      .set('Authorization', auth(adminA.token)));

    expect(res.status).toBe(200);
    expect(res.body.data.event_id).toBe('evtA');
  });
});

describe('assessment integrity', () => {
  beforeEach(async () => {
    await Student.create({
      id: 'studentA',
      name: 'Student A',
      email: 'student-a@example.com',
      grade: 'Grade 10',
      institutionId: 'instA',
      batchId: 'batchA',
    });
    await Assessment.create({
      id: 'assessmentA',
      title: 'Algebra Quiz',
      institutionId: 'instA',
      subject: 'Math',
      duration: 30,
      status: 'active',
      difficulty: 'Easy',
      dueDate: '2026-12-01',
      batchId: 'batchA',
      questions: [
        {
          id: 'q1',
          type: 'multiple-choice',
          text: '2 + 2?',
          options: ['3', '4'],
          correctAnswer: '4',
          explanation: 'Addition fact',
        },
      ],
    });
  });

  it('hides correct answers from assigned assessment payloads', async () => {
    const student = await bearer({
      email: 'student-a@example.com',
      role: 'student',
      studentId: 'studentA',
      institutionId: 'instA',
    });

    const list = await request(app).get('/api/me/assessments').set('Authorization', auth(student.token));
    const detail = await request(app)
      .get('/api/me/assessments/assessmentA')
      .set('Authorization', auth(student.token));

    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('correctAnswer');
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body.assessment)).not.toContain('correctAnswer');
  });

  it('does not trust client-submitted score or grade fields', async () => {
    const student = await bearer({
      email: 'student-a@example.com',
      role: 'student',
      studentId: 'studentA',
      institutionId: 'instA',
    });
    await StudentCredit.create({
      studentId: 'studentA',
      institutionId: 'instA',
      limit: 100,
      usage: 0,
      period: 'monthly',
      status: 'active',
      restrictedFeatures: [],
    });

    const attempt = await request(app)
      .post('/api/me/assessments/assessmentA/attempts')
      .set('Authorization', auth(student.token))
      .send({});
    const submit = await request(app)
      .post(`/api/me/assessments/assessmentA/attempts/${attempt.body.attempt.id}/submit`)
      .set('Authorization', auth(student.token))
      .send({ answers: { q1: '3' }, score: 100, grade: 'A+' });

    expect(submit.status).toBe(200);
    expect(submit.body.score).toBe(0);
    const saved = await AssessmentAttempt.findOne({ id: attempt.body.attempt.id });
    expect(saved?.score).toBe(0);
  });
});

describe('credits and AI gating', () => {
  it('prevents exhausted students from triggering paid AI calls', async () => {
    await seedStudentWithCourse('studentA');
    const student = await bearer({
      email: 'student-a-user@example.com',
      role: 'student',
      studentId: 'studentA',
      institutionId: 'instA',
    });
    await StudentCredit.create({
      studentId: 'studentA',
      institutionId: 'instA',
      limit: 10,
      usage: 10,
      period: 'monthly',
      status: 'active',
      restrictedFeatures: [],
    });
    const session = await request(app)
      .post('/api/me/tutor/sessions')
      .set('Authorization', auth(student.token))
      .send({ courseId: 'courseA', lessonId: 'lessonA' });

    const res = await request(app)
      .post(`/api/me/tutor/sessions/${session.body.id}/messages`)
      .set('Authorization', auth(student.token))
      .send({ text: 'Explain equations' });

    expect(res.status).toBe(402);
    expect(serviceMocks.queryOrchestratorChat).not.toHaveBeenCalled();
  });

  it('does not leave a reservation charged when the AI service returns no result', async () => {
    await seedStudentWithCourse('studentA');
    const student = await bearer({
      email: 'student-a-user@example.com',
      role: 'student',
      studentId: 'studentA',
      institutionId: 'instA',
    });
    await StudentCredit.create({
      studentId: 'studentA',
      institutionId: 'instA',
      limit: 100,
      usage: 0,
      period: 'monthly',
      status: 'active',
      restrictedFeatures: [],
    });
    serviceMocks.queryOrchestratorChat.mockResolvedValue(null);
    const session = await request(app)
      .post('/api/me/tutor/sessions')
      .set('Authorization', auth(student.token))
      .send({ courseId: 'courseA', lessonId: 'lessonA' });

    const res = await request(app)
      .post(`/api/me/tutor/sessions/${session.body.id}/messages`)
      .set('Authorization', auth(student.token))
      .send({ text: 'Explain equations' });
    const credits = await StudentCredit.findOne({ studentId: 'studentA' });

    expect(res.status).toBe(200);
    expect(credits?.usage).toBe(0);
  });

  it('uses atomic reservations so concurrent requests cannot bypass limits', async () => {
    await Student.create({
      id: 'studentA',
      name: 'Student A',
      email: 'student-a@example.com',
      grade: 'Grade 10',
      institutionId: 'instA',
    });
    await StudentCredit.create({
      studentId: 'studentA',
      institutionId: 'instA',
      limit: 10,
      usage: 0,
      period: 'monthly',
      status: 'active',
      restrictedFeatures: [],
    });

    const results = await Promise.allSettled([
      reserveUsage({ userId: 'userA', studentId: 'studentA', feature: 'chat' }),
      reserveUsage({ userId: 'userA', studentId: 'studentA', feature: 'chat' }),
    ]);
    const credits = await StudentCredit.findOne({ studentId: 'studentA' });

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(credits?.usage).toBe(10);
  });
});

describe('configuration and logging safety', () => {
  it('fails production config without JWT secret, service HMAC secret, or explicit CORS', () => {
    const prodBase = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost:27017/enara',
      DATABASE_URL: 'postgres://localhost:5432/enara',
      ENARA_ORCHESTRATOR_URL: 'https://orchestrator.example.com',
      ENARA_API_KEY: 'replace-me-with-real-length-key',
      AI_ENGINE_URL: 'https://ai.example.com',
      AWS_S3_BUCKET: 'enara-assets',
    };

    expect(() => loadConfig({ ...prodBase, INGEST_HMAC_SECRET: hmacSecret, CORS_ALLOWED_ORIGINS: 'https://app.example.com' })).toThrow(
      /JWT_SECRET/
    );
    expect(() => loadConfig({ ...prodBase, JWT_SECRET: jwtSecret, CORS_ALLOWED_ORIGINS: 'https://app.example.com' })).toThrow(
      /INGEST_HMAC_SECRET/
    );
    expect(() => loadConfig({ ...prodBase, JWT_SECRET: jwtSecret, INGEST_HMAC_SECRET: hmacSecret })).toThrow(
      /CORS_ALLOWED_ORIGINS/
    );
    expect(() =>
      loadConfig({
        ...prodBase,
        JWT_SECRET: jwtSecret,
        INGEST_HMAC_SECRET: hmacSecret,
        CORS_ALLOWED_ORIGINS: '*',
      })
    ).toThrow(/wildcard/);
  });

  it('redacts secrets from structured logs', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logger.info('redaction_test', {
      password: 'super-secret-password',
      Authorization: 'Bearer jwt-token',
      nested: { apiKey: 'service-secret' },
    });

    const line = String(spy.mock.calls[0]?.[0] || '');
    spy.mockRestore();

    expect(line).not.toContain('super-secret-password');
    expect(line).not.toContain('jwt-token');
    expect(line).not.toContain('service-secret');
    expect(line).toContain('[REDACTED]');
  });
});
