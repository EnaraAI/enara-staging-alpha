import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// P20: under a simultaneous class start each instance has only ~10 database
// connections, so the number of database round trips per student request decides
// how long everyone waits. This counts every MongoDB command (driver command
// monitoring) per request on the student pages of the P20 journey, and keeps a
// budget so the counts cannot silently grow back. No AI provider is configured
// here (no key): the tutor message path is measured up to the provider call.

const PW = 'p20-query-password';
const S = 'p20q';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
const ids: Record<string, string> = {};
let auth = '';
let teacher = '';
let commands: string[] = [];
let counting = false;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri(), { monitorCommands: true });
  mongoose.connection.getClient().on('commandStarted', (e) => { if (counting) commands.push(`${e.commandName}:${(e.command as any)[e.commandName]}`); });
  const M: Record<string, mongoose.Model<any>> = {};
  for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch']) M[name] = (await import(`../src/models/${name}`))[name];
  const features = { teaching_workflow_enabled: true, ai_grading_enabled: true, study_plans_enabled: true, learning_intelligence_enabled: true, mastery_tracking_enabled: true, learning_pathways_enabled: true, connected_workflow_enabled: true };
  await M.Institution.create({ id: S, name: 'Query School', features });
  await M.Batch.create({ id: 'p20q-b1', name: 'Grade 6 A', institutionId: S, academicYear: '2026', studentCount: 1 });
  await M.Student.create({ id: 'p20q-stu1', name: 'Query Student', email: 'stu@p20q.test', grade: 'Grade 6', institutionId: S, batchId: 'p20q-b1' });
  await M.StudentCredit.create({ studentId: 'p20q-stu1', institutionId: S, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  const hash = bcrypt.hashSync(PW, 4);
  const t = await M.User.create({ email: 'teacher@p20q.test', password: hash, role: 'teacher', name: 'T', status: 'active', institutionId: S });
  await M.User.create({ email: 'stu@p20q.test', password: hash, role: 'student', name: 'Query Student', status: 'active', institutionId: S, studentId: 'p20q-stu1' });
  await M.CourseInstance.create({ id: 'p20q-cls1', courseId: 'p20q-course', courseName: 'Fractions 6A', institutionId: S, academicYear: '2026', batchId: 'p20q-b1', studentIds: [], instructorIds: [t._id.toString()], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  teacher = await login('teacher@p20q.test');
  auth = await login('stu@p20q.test');
  const T = (m: 'post' | 'patch', u: string, b: object) => request(app)[m](u).set('Authorization', teacher).send(b);
  const cur = await T('post', '/api/curriculums', { name: 'Fractions', summary: 'Adding fractions', courseName: 'Fractions 6A', chapters: [{ title: 'Adding fractions', description: 'Rewrite one half as two quarters.' }, { title: 'Comparing fractions', description: 'Use a common denominator.' }] });
  ids.curriculum = cur.body.id; ids.lesson = cur.body.chapters[0].id;
  expect((await T('post', `/api/curriculums/${ids.curriculum}/publish-to-class`, { classId: 'p20q-cls1' })).status).toBe(200);
  const asm = await T('post', '/api/assessments', { title: 'Fractions check', subject: 'Maths', curriculumId: ids.curriculum, lifecycle: 'draft', questions: [
    { id: 'q1', type: 'multiple-choice', text: 'What is 1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', points: 1 },
    { id: 'q2', type: 'open-response', text: 'Explain.', modelAnswer: 'The parts must be the same size.', rubric: { criteria: [{ id: 'c1', title: 'Reasoning', levels: [{ id: 'l0', label: 'Missing', points: 0 }, { id: 'l1', label: 'Partial', points: 1 }, { id: 'l2', label: 'Clear', points: 2 }] }] } },
  ] });
  expect((await T('post', `/api/assessments/${asm.body.id}/publish`, {})).status).toBe(200);
  const asg = await T('post', '/api/assignments', { assessmentId: asm.body.id, classId: 'p20q-cls1', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  expect(asg.status, JSON.stringify(asg.body)).toBe(201);
  ids.assignment = asg.body.id;
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

async function measure(method: 'get' | 'post', url: string, body?: object) {
  commands = []; counting = true;
  const r = await request(app)[method](url).set('Authorization', auth).send(body);
  await new Promise((res) => setTimeout(res, 50)); // let fire-and-forget writes start
  counting = false;
  return { status: r.status, body: r.body, count: commands.length, commands: [...commands] };
}

export const QUERY_REPORT: Record<string, { count: number; commands: string[] }> = {};

describe('P20 database round trips per student request', () => {
  it('counts the P20 journey pages', async () => {
    const steps: [string, 'get' | 'post', () => string, (() => object)?][] = [
      ['dashboard', 'get', () => '/api/me/dashboard'],
      ['courses', 'get', () => '/api/me/courses'],
      ['assignments', 'get', () => '/api/me/assignments'],
      ['next-steps', 'get', () => '/api/me/next-steps'],
      ['lesson', 'get', () => `/api/me/courses/p20q-course/lessons/${ids.lesson}`],
      ['tutor session', 'post', () => '/api/me/tutor/sessions', () => ({ courseId: 'p20q-course', lessonId: ids.lesson, title: 'Q' })],
      ['tutor message (no provider)', 'post', () => `/api/me/tutor/sessions/${ids.session}/messages`, () => ({ text: 'How do I add 1/2 and 1/4?' })],
      ['attempt start', 'post', () => `/api/me/assignments/${ids.assignment}/attempts`],
    ];
    const rows: string[] = [];
    for (const [name, m, url, body] of steps) {
      await measure(m, url(), body?.()); // warm caches the way a second student would see them
      if (name === 'tutor session') { const r = await measure(m, url(), body?.()); ids.session = r.body.id ?? r.body.session?.id; }
      const r = await measure(m, url(), body?.());
      if (name === 'tutor session') ids.session = r.body.id ?? r.body.session?.id;
      if (name === 'attempt start') ids.attempt = r.body.attempt?.id;
      expect([200, 201], `${name}: ${JSON.stringify(r.body).slice(0, 200)}`).toContain(r.status);
      QUERY_REPORT[name] = { count: r.count, commands: r.commands };
      const by: Record<string, number> = {};
      for (const c of r.commands) by[c] = (by[c] ?? 0) + 1;
      rows.push(`${name.padEnd(28)} ${String(r.count).padStart(3)}  ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ')}`);
    }
    console.log(`P20_QUERY_COUNTS\n${rows.join('\n')}`);
    // Budgets (P20, measured after the per-request memo; before: dashboard 13, courses 9, next-steps 15).
    const BUDGET: Record<string, number> = { dashboard: 10, courses: 7, assignments: 7, 'next-steps': 12, lesson: 7, 'tutor session': 13, 'tutor message (no provider)': 17, 'attempt start': 8 };
    for (const [name, max] of Object.entries(BUDGET)) expect(QUERY_REPORT[name].count, `${name}: ${QUERY_REPORT[name].commands.join(' > ')}`).toBeLessThanOrEqual(max);
    for (const name of Object.keys(BUDGET)) {
      const students = QUERY_REPORT[name].commands.filter((c) => c === 'find:students').length;
      expect(students, `${name}: the student record is read once per request`).toBeLessThanOrEqual(1);
    }
  }, 120_000);
});

describe('P20 tutor message on the AI path (provider unreachable: network blocked, no mock)', () => {
  it('counts the database work around the provider call', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(url instanceof Request ? url.url : url));
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return realFetch(url, init);
      throw new Error('outbound network blocked in test');
    }) as typeof fetch;
    Object.assign(process.env, { ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'p20-query' });
    try {
      (await import('../src/config/env')).resetConfigForTests();
      (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
      app = (await import('../src/app')).createApp();
      await measure('post', `/api/me/tutor/sessions/${ids.session}/messages`, { text: 'warm' });
      const r = await measure('post', `/api/me/tutor/sessions/${ids.session}/messages`, { text: 'How do I add 1/2 and 1/4?' });
      const by: Record<string, number> = {};
      for (const c of r.commands) by[c] = (by[c] ?? 0) + 1;
      QUERY_REPORT['tutor message (AI path)'] = { count: r.count, commands: r.commands };
      // Budget (P20; before: 39 on this path, credits released in 3 round trips, counters one by one).
      expect(r.count, r.commands.join(' > ')).toBeLessThanOrEqual(37);
      expect(r.commands.filter((c) => c === 'update:studentcredits').length, 'credit release is one update').toBeLessThanOrEqual(1);
      console.log(`P20_QUERY_TUTOR_AI status=${r.status} count=${r.count}\n${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ')}\n${r.commands.join(' > ')}`);
    } finally {
      globalThis.fetch = realFetch;
      for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID']) delete process.env[k];
      (await import('../src/config/env')).resetConfigForTests();
    }
  }, 60_000);
});
