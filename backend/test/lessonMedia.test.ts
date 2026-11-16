import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Lesson videos and quizzes reach students: a chapter's uploaded video becomes
// the lesson's videoUrl (signed, not listed as a download), and the practice quiz
// staff set through PUT …/chapters/:chapterId/quiz is sent with the lesson.
// No AI provider is involved.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let M: Record<string, mongoose.Model<any>>;
const A = 'instMediaA', B = 'instMediaB';
const PW = 'lesson-media-password-1';
let video = '', sheet = '';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {
    User: (await import('../src/models/User')).User,
    Student: (await import('../src/models/Student')).Student,
    Curriculum: (await import('../src/models/Curriculum')).Curriculum,
    CourseInstance: (await import('../src/models/CourseInstance')).CourseInstance,
  };
  await M.User.createIndexes();
  app = (await import('../src/app')).createApp();

  const { storedUploadName } = await import('../src/services/uploadAccess');
  video = `/uploads/${storedUploadName(A, 'lesson-1.mp4')}`;
  sheet = `/uploads/${storedUploadName(A, 'worksheet.pdf')}`;
  const hash = await bcrypt.hash(PW, 4);
  const admin = await M.User.create({ email: 'admin@media-a.test', password: hash, role: 'admin', name: 'Admin A', status: 'active', institutionId: A });
  await M.User.create({ email: 'admin@media-b.test', password: hash, role: 'admin', name: 'Admin B', status: 'active', institutionId: B });
  await M.Curriculum.create({
    id: 'cur-media', name: 'Numbers', institutionId: A, summary: 'Counting', lastUpdated: '2026-11-16', status: 'deployed', createdBy: String(admin._id),
    chapters: [
      { id: 'ch1', title: 'Counting in tens', description: 'Ten ones make one ten.', uploads: [video, sheet] },
      { id: 'ch2', title: 'Bigger or smaller', description: 'Compare numbers.', uploads: [] },
    ],
  });
  await M.CourseInstance.create({ id: 'ci-media', courseId: 'course-media', courseName: 'Numbers 2A', institutionId: A, academicYear: '2026', batchId: 'b-media', curriculumId: 'cur-media', studentIds: [], instructorIds: [], visibility: 'student' });
  await M.Student.create({ id: 'stu-media', name: 'Layla', email: 'layla@media-a.test', grade: 'Grade 2', avatar: 'L', institutionId: A, batchId: 'b-media' });
  await M.User.create({ email: 'layla@media-a.test', password: hash, role: 'student', name: 'Layla', status: 'active', institutionId: A, studentId: 'stu-media' });
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

const login = async (email: string) => (await request(app).post('/api/auth/login').send({ email, password: PW })).body.token as string;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const QUIZ = {
  questions: [
    { text: 'What comes after 30 when counting in tens?', options: ['31', '40', '300'], correctAnswer: 1, explanation: '30 + 10 = 40.' },
    { text: 'How many tens are in 50?', options: ['5', '50'], correctAnswer: 0 },
  ],
};

describe('lesson quizzes (staff)', () => {
  it('rejects bad quizzes', async () => {
    const t = await login('admin@media-a.test');
    const put = (body: unknown) => request(app).put('/api/curriculums/cur-media/chapters/ch1/quiz').set(auth(t)).send(body);
    expect((await put({ questions: [{ text: 'Q', options: ['only one'], correctAnswer: 0 }] })).status).toBe(400);
    expect((await put({ questions: [{ text: 'Q', options: ['a', 'b'], correctAnswer: 2 }] })).status).toBe(400);
    expect((await put({ questions: [{ text: 'Q', options: ['a', 'b'], correctAnswer: '0' }] })).status).toBe(400);
    expect((await put({ questions: Array.from({ length: 11 }, () => ({ text: 'Q', options: ['a', 'b'], correctAnswer: 0 })) })).status).toBe(400);
    expect((await put({ questions: 'nope' })).status).toBe(400);
  });

  it('saves a quiz on one chapter; another school cannot', async () => {
    const t = await login('admin@media-a.test');
    const res = await request(app).put('/api/curriculums/cur-media/chapters/ch1/quiz').set(auth(t)).send(QUIZ);
    expect(res.status).toBe(200);
    const ch1 = res.body.chapters.find((c: any) => c.id === 'ch1');
    expect(ch1.quiz.questions).toHaveLength(2);
    expect(ch1.quiz.questions[0]).toMatchObject({ options: ['31', '40', '300'], correctAnswer: 1, explanation: '30 + 10 = 40.' });
    expect(ch1.quiz.questions[0].id).toBeTruthy();
    expect((await request(app).put('/api/curriculums/cur-media/chapters/nope/quiz').set(auth(t)).send(QUIZ)).status).toBe(404);
    const other = await login('admin@media-b.test');
    expect((await request(app).put('/api/curriculums/cur-media/chapters/ch1/quiz').set(auth(other)).send(QUIZ)).status).toBe(404);
  });

  it('editing the curriculum keeps the quiz and ignores a quiz sent with the chapters', async () => {
    const t = await login('admin@media-a.test');
    const cur = (await request(app).get('/api/curriculums/cur-media').set(auth(t))).body;
    const chapters = cur.chapters.map((c: any) => ({ id: c.id, title: c.title + '!', description: c.description, uploads: c.uploads.map((u: string) => u.split('?')[0]) }));
    chapters[1].quiz = { questions: [{ id: 'x', text: 'Sneaky', options: ['a', 'b'], correctAnswer: 0 }] };
    const res = await request(app).patch('/api/curriculums/cur-media').set(auth(t)).send({ chapters });
    expect(res.status).toBe(200);
    expect(res.body.chapters[0].title).toBe('Counting in tens!');
    expect(res.body.chapters[0].quiz.questions).toHaveLength(2);
    expect(res.body.chapters[1].quiz).toBeUndefined();
  });
});

describe('lesson video and quiz (student)', () => {
  it('sends the video (signed, not as a download) and the quiz with the lesson', async () => {
    const t = await login('layla@media-a.test');
    const res = await request(app).get('/api/me/courses/course-media').set(auth(t));
    expect(res.status).toBe(200);
    const [l1, l2] = res.body.modules[0].lessons;
    expect(l1.videoUrl).toMatch(new RegExp(`^${video.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?exp=\\d+&sig=[a-f0-9]+$`));
    expect(l1.materials.some((m: string) => m.startsWith(video))).toBe(false);
    expect(res.body.modules[0].materials.some((m: string) => m.startsWith(video))).toBe(false);
    expect(l1.quiz.questions.map((q: any) => q.correctAnswer)).toEqual([1, 0]);
    expect(l2.videoUrl).toBeUndefined();
    expect(l2.quiz).toBeUndefined();
  });

  it('an empty list removes the quiz', async () => {
    const t = await login('admin@media-a.test');
    expect((await request(app).put('/api/curriculums/cur-media/chapters/ch1/quiz').set(auth(t)).send({ questions: [] })).status).toBe(200);
    const s = await login('layla@media-a.test');
    const res = await request(app).get('/api/me/courses/course-media').set(auth(s));
    expect(res.body.modules[0].lessons[0].quiz).toBeUndefined();
  });
});
