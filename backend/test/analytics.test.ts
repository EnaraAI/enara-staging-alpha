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

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const answer = (topic: string, isCorrect: boolean) => ({
  questionId: `${topic}-${isCorrect}`, questionText: 'q', topic, studentAnswer: 0, correctAnswer: 0, isCorrect, explanation: '',
});

async function seedCourse() {
  await seedInstitution('instA', 'A');
  await seedInstitution('instB', 'B');
  await Curriculum.create({
    id: 'curA', name: 'Algebra', courseName: 'Algebra', institutionId: 'instA', type: 'core', level: '10',
    languages: ['en'], summary: 's', description: 'd', lastUpdated: '2026-10-01', subjectsCount: 1,
    assignedBatches: ['A-batch'], status: 'deployed',
    chapters: [{ id: 'ch1', title: 'Linear equations', uploads: [] }, { id: 'ch2', title: 'Quadratics', uploads: [] }],
  });
  await CourseInstance.create({
    id: 'ciA', courseId: 'ALG10', courseName: 'Algebra 10', institutionId: 'instA', academicYear: '2026',
    batchId: 'A-batch', curriculumId: 'curA', studentIds: [], instructorIds: [], visibility: 'student',
  });
  await Assessment.create({
    id: 'asmPast', institutionId: 'instA', title: 'Linear quiz', subject: 'Mathematics', duration: 20, status: 'completed',
    dueDate: isoDay(daysAgo(2)), difficulty: 'Easy', batchId: 'A-batch', curriculumId: 'curA',
    questions: [{ id: 'q1', type: 'multiple-choice', text: 'x?', topic: 'Linear', options: ['1', '2'], correctAnswer: 0, explanation: '' }],
  });
  // A1: active and strong. A2: assigned the past-due quiz but never did it. A3: weak scores, active long ago.
  await AssessmentAttempt.create([
    { id: 'a1', assessmentId: 'asmPast', assessmentTitle: 'Linear quiz', subject: 'Mathematics', studentId: 'A1', institutionId: 'instA', status: 'submitted', score: 90, answers: [answer('Linear', true), answer('Linear', true), answer('Graphs', false)], startedAt: daysAgo(3), submittedAt: daysAgo(3) },
    { id: 'a3', assessmentId: 'asmPast', assessmentTitle: 'Linear quiz', subject: 'Mathematics', studentId: 'A3', institutionId: 'instA', status: 'submitted', score: 30, answers: [answer('Linear', false), answer('Graphs', false), answer('Graphs', false)], startedAt: daysAgo(40), submittedAt: daysAgo(40) },
    { id: 'b1', assessmentId: 'other', assessmentTitle: 'Other', subject: 'Physics', studentId: 'B1', institutionId: 'instB', status: 'submitted', score: 10, answers: [], startedAt: daysAgo(1), submittedAt: daysAgo(1) },
  ]);
  await UsageEvent.create([
    { id: 'u1', userId: 'x', studentId: 'A1', institutionId: 'instA', feature: 'chat', modelName: 'm', requestId: 'r1', sessionId: 'ts1', creditsUsed: 7, status: 'settled', timestamp: daysAgo(1) },
    { id: 'u2', userId: 'x', studentId: 'A1', institutionId: 'instA', feature: 'assessment', modelName: 'm', requestId: 'r2', sessionId: 'a1', creditsUsed: 5, status: 'settled', timestamp: daysAgo(3) },
    { id: 'u3', userId: 'x', studentId: 'A1', institutionId: 'instA', feature: 'research', modelName: 'm', requestId: 'r3', creditsUsed: 2, status: 'settled', timestamp: daysAgo(2) },
  ]);
  await LessonProgress.create({ studentId: 'A1', institutionId: 'instA', courseId: 'ALG10', lessonId: 'ch1', status: 'completed', completedAt: daysAgo(1) });
  await TutorSession.create({
    id: 'ts1', studentId: 'A1', institutionId: 'instA', title: 'Help', courseId: 'ALG10', lessonTitle: 'Linear equations',
    lastMessageAt: daysAgo(1),
    messages: [
      { id: 'm1', role: 'user', text: 'How do I isolate x?', timestamp: daysAgo(1) },
      { id: 'm2', role: 'ai', text: 'Move terms', timestamp: new Date(daysAgo(1).getTime() + 60000), meta: { contextFound: 2 } },
      { id: 'm3', role: 'user', text: 'how do I isolate X', timestamp: new Date(daysAgo(1).getTime() + 120000) },
      { id: 'm4', role: 'ai', text: 'Divide', timestamp: new Date(daysAgo(1).getTime() + 180000), meta: { contextFound: 0 } },
    ],
  });
}

describe('admin analytics', () => {
  beforeEach(seedCourse);

  it('computes the institution overview from recorded activity only', async () => {
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });
    const res = await request(app).get('/api/analytics/overview').set('Authorization', auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ students: 3, activeStudents7d: 1, avgScore: 60, lessonsCompleted: 1, assessmentsSubmitted: 2, tutorQuestions30d: 2 });
    expect(res.body.performance).toEqual({ excellent: 1, good: 0, average: 0, needsHelp: 1, noScores: 1 });
    const byId = Object.fromEntries(res.body.students.map((s: { id: string }) => [s.id, s]));
    expect(byId.A1).toMatchObject({ status: 'excelling', lessonsCompleted: 1, lessonsAvailable: 2, lessonCompletionRate: 50, riskFlags: [] });
    expect(byId.A2).toMatchObject({ status: 'at risk', overdueAssessments: 1, riskFlags: ['overdue'] });
    expect(byId.A3).toMatchObject({ status: 'at risk', riskFlags: ['low_scores', 'inactive'] });
    expect(res.body.weekly).toHaveLength(8);
    expect(res.body.courses[0]).toMatchObject({ courseId: 'ALG10', students: 3, lessonCompletionRate: 17, tutorQuestions30d: 2, creditsUsed30d: 12 });
    expect(res.body.totals).toMatchObject({ creditsUsed30d: 14, creditsUnattributed30d: 2 });
    expect(res.body.subjects).toEqual([expect.objectContaining({ subject: 'Mathematics', avgScore: 60, attempts: 2 })]);
    expect(res.body.students.some((s: { id: string }) => s.id === 'B1')).toBe(false);
  });

  it('reports course engagement, repeated questions, chapters and topics', async () => {
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });
    const res = await request(app).get('/api/analytics/courses/ciA').set('Authorization', auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.course).toMatchObject({ courseId: 'ALG10', students: 3, lessons: 2, assessments: 1 });
    expect(res.body.stats).toMatchObject({ sessions30d: 1, questions30d: 2, avgQuestionsPerSession: 2, groundedReplyRate: 50, repeatQuestionRate: 100 });
    expect(res.body.mostAsked[0]).toMatchObject({ count: 2, lessonTitle: 'Linear equations' });
    expect(res.body.chapters).toEqual([
      expect.objectContaining({ chapterId: 'ch1', completedStudents: 1, completionRate: 33 }),
      expect.objectContaining({ chapterId: 'ch2', completedStudents: 0, completionRate: 0 }),
    ]);
    expect(res.body.topics).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic: 'Linear', correctRate: 67, answers: 3 }),
      expect.objectContaining({ topic: 'Graphs', correctRate: 0, answers: 3 }),
    ]));
    expect(res.body.preExam).toMatchObject({ assessmentTitle: 'Linear quiz' });
    expect(res.body.insights.some((i: { type: string }) => i.type === 'warning')).toBe(true);

    const byCourseId = await request(app).get('/api/analytics/courses/ALG10').set('Authorization', auth(admin.token));
    expect(byCourseId.status).toBe(200);
  });

  it('reports one student and keeps institutions apart', async () => {
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });
    const res = await request(app).get('/api/analytics/students/A1').set('Authorization', auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ id: 'A1', avgScore: 90, status: 'excelling' });
    expect(res.body.scoreHistory).toEqual([expect.objectContaining({ title: 'Linear quiz', score: 90 })]);
    expect(res.body.tutorUsage).toEqual([{ label: 'Algebra 10', questions: 2 }]);
    expect(res.body.activity).toHaveLength(14);
    expect(res.body.activity.reduce((n: number, d: { questions: number }) => n + d.questions, 0)).toBe(2);

    const otherAdmin = await bearer({ email: 'admin-b@example.com', role: 'admin', institutionId: 'instB' });
    expect((await request(app).get('/api/analytics/students/A1').set('Authorization', auth(otherAdmin.token))).status).toBe(404);
    expect((await request(app).get('/api/analytics/courses/ciA').set('Authorization', auth(otherAdmin.token))).status).toBe(404);

    const student = await bearer({ email: 'a1@example.com', role: 'student', studentId: 'A1', institutionId: 'instA' });
    expect((await request(app).get('/api/analytics/overview').set('Authorization', auth(student.token))).status).toBe(403);

    const enara = await bearer({ email: 'ops@enara.example.com', role: 'enara-admin' });
    const all = await request(app).get('/api/analytics/overview').set('Authorization', auth(enara.token));
    expect(all.body.totals.students).toBe(6);
    const scoped = await request(app).get('/api/analytics/overview?institutionId=instB').set('Authorization', auth(enara.token));
    expect(scoped.body.totals.students).toBe(3);
  });
});
