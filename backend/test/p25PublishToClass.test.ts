import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Seen 2 Nov (Gateway English): a teacher published a new draft curriculum to
// the class; students got it, but the Curriculum page still showed the old one
// as published for that group and the new one as an unassigned draft.
// In-memory MongoDB; no AI provider involved.
const A = 'p25-school';
const PW = 'p25-password-1';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>;
let T: (m: 'get' | 'post' | 'patch', u: string, b?: object) => request.Test;
let S: (u: string) => request.Test;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: '',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'Batch']) M[name] = (await import(`../src/models/${name}`))[name];
  await M.Institution.create({ id: A, name: 'Publish School', features: { teaching_workflow_enabled: true } });
  await M.Batch.create({ id: 'p25-b1', name: 'Beginner 1 (2026)', institutionId: A, academicYear: '2026', studentCount: 1 });
  await M.Student.create({ id: 'p25-stu', name: 'Sara Student', email: 'sara@p25.test', grade: 'Adult', institutionId: A, batchId: 'p25-b1' });
  const hash = bcrypt.hashSync(PW, 4);
  const teacher = await M.User.create({ email: 'teacher@p25.test', password: hash, role: 'teacher', name: 'Teacher', status: 'active', institutionId: A });
  await M.User.create({ email: 'sara@p25.test', password: hash, role: 'student', name: 'Sara', status: 'active', institutionId: A, studentId: 'p25-stu' });
  await M.CourseInstance.create({ id: 'p25-cls', courseId: 'p25-course', courseName: 'Connectivity Beginner 1', institutionId: A, academicYear: '2026', batchId: 'p25-b1', studentIds: [], instructorIds: [String(teacher._id)], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  const tl = await request(app).post('/api/auth/login').send({ email: 'teacher@p25.test', password: PW });
  const sl = await request(app).post('/api/auth/login').send({ email: 'sara@p25.test', password: PW });
  T = (m, u, b) => (m === 'get' ? request(app).get(u) : request(app)[m](u).send(b ?? {})).set('Authorization', `Bearer ${tl.body.token}`);
  S = (u) => request(app).get(u).set('Authorization', `Bearer ${sl.body.token}`);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const make = async (name: string, chapters: { title: string; description: string }[], summary = `${name} summary`) => {
  const r = await T('post', '/api/curriculums', { name, summary, courseName: 'Connectivity Beginner 1', chapters });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return (r.body.curriculum ?? r.body).id as string;
};
const cur = async (id: string) => M.Curriculum.findOne({ id }).lean() as Promise<any>;

describe('publish to class keeps the Curriculum page truthful', () => {
  it('the published curriculum becomes deployed and takes over the class group; the old one lets go of it', async () => {
    const book = await make('Connectivity Beginner 1', [1, 2, 3].map((n) => ({ title: `Lesson ${n}`, description: `Lesson ${n} text` })));
    expect((await T('post', `/api/curriculums/${book}/publish-to-class`, { classId: 'p25-cls' })).status).toBe(200);
    expect(await cur(book)).toMatchObject({ status: 'deployed', assignedBatches: ['Beginner 1 (2026)'] });
    expect((await M.Batch.findOne({ id: 'p25-b1' }).lean() as any).curriculumId).toBe(book);

    const food = await make('Food and drinks', [{ title: 'Food and drinks', description: 'Food words' }]);
    expect((await cur(food)).status).not.toBe('deployed');
    const r = await T('post', `/api/curriculums/${food}/publish-to-class`, { classId: 'p25-cls' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    // What the student sees and what the page shows now agree.
    const courses = await S('/api/me/courses');
    expect(JSON.stringify(courses.body)).toContain(food);
    expect(await cur(food)).toMatchObject({ status: 'deployed', assignedBatches: ['Beginner 1 (2026)'] });
    expect((await cur(book)).assignedBatches).toEqual([]);
    expect((await M.Batch.findOne({ id: 'p25-b1' }).lean() as any).curriculumId).toBe(food);

    // Switching back restores the book everywhere.
    expect((await T('post', `/api/curriculums/${book}/publish-to-class`, { classId: 'p25-cls' })).status).toBe(200);
    expect((await cur(book)).assignedBatches).toEqual(['Beginner 1 (2026)']);
    expect((await cur(food)).assignedBatches).toEqual([]);
    expect(JSON.stringify((await S('/api/me/courses')).body)).toContain(book);
  });

  it('keeps the group on the old curriculum while another class in it still uses that one', async () => {
    const teacher = await M.User.findOne({ email: 'teacher@p25.test' }).lean() as any;
    await M.CourseInstance.create({ id: 'p25-cls2', courseId: 'p25-course2', courseName: 'Second class', institutionId: A, academicYear: '2026', batchId: 'p25-b1', studentIds: [], instructorIds: [String(teacher._id)], visibility: 'student' });
    const book = (await M.CourseInstance.findOne({ id: 'p25-cls' }).lean() as any).curriculumId;
    await M.CourseInstance.updateOne({ id: 'p25-cls2' }, { $set: { curriculumId: book } });
    const extra = await make('Extra practice', [{ title: 'Extra', description: 'More practice' }]);
    expect((await T('post', `/api/curriculums/${extra}/publish-to-class`, { classId: 'p25-cls' })).status).toBe(200);
    expect((await cur(book)).assignedBatches).toEqual(['Beginner 1 (2026)']);
    expect((await cur(extra)).assignedBatches).toEqual(['Beginner 1 (2026)']);
  });

  it('refuses to publish a curriculum with no lessons', async () => {
    const teacher = await M.User.findOne({ email: 'teacher@p25.test' }).lean() as any;
    const empty = await M.Curriculum.create({ createdBy: String(teacher._id), id: 'p25-empty', name: 'Empty', summary: 'Nothing yet', chapters: [], status: 'draft', institutionId: A, assignedBatches: [], lastUpdated: '2026-11-03' });
    const r = await T('post', `/api/curriculums/${empty.id}/publish-to-class`, { classId: 'p25-cls' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('CURRICULUM_INCOMPLETE');
  });
});
