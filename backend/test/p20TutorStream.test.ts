import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Real tutor streaming (server-sent events): same session, policy and credit
// checks as the JSON endpoint, a fallback reply when the model cannot answer,
// and both messages saved. No AI provider and no mock: the model is either not
// configured, or configured with all outbound network blocked (unreachable).

const PW = 'p20-query-password';
const S = 'p20q';
let other = '';
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
  await M.Student.create({ id: 'p20q-stu2', name: 'Other Student', email: 'stu2@p20q.test', grade: 'Grade 6', institutionId: S, batchId: 'p20q-b1' });
  await M.User.create({ email: 'stu2@p20q.test', password: hash, role: 'student', name: 'Other Student', status: 'active', institutionId: S, studentId: 'p20q-stu2' });
  await M.CourseInstance.create({ id: 'p20q-cls1', courseId: 'p20q-course', courseName: 'Fractions 6A', institutionId: S, academicYear: '2026', batchId: 'p20q-b1', studentIds: [], instructorIds: [t._id.toString()], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  teacher = await login('teacher@p20q.test');
  auth = await login('stu@p20q.test');
  other = await login('stu2@p20q.test');
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

function events(text: string) {
  return text.split('\n\n').filter((b) => b.startsWith('data: ')).map((b) => JSON.parse(b.slice(6)));
}
const stream = (sid: string, body: object, who = auth) => request(app).post(`/api/me/tutor/sessions/${sid}/messages/stream`).set('Authorization', who).send(body).buffer(true).parse((res, cb) => { let d = ''; res.on('data', (c: Buffer) => { d += c.toString(); }); res.on('end', () => cb(null, d)); });
async function newSession() {
  const r = await request(app).post('/api/me/tutor/sessions').set('Authorization', auth).send({ courseId: 'p20q-course', lessonId: ids.lesson, title: 'Stream' });
  expect(r.status).toBe(201);
  return r.body.id ?? r.body.session?.id;
}
const credits = async () => (await mongoose.connection.collection('studentcredits').findOne({ studentId: 'p20q-stu1' }))!.usage;

describe('tutor streaming endpoint', () => {
  it('refuses before streaming, as ordinary HTTP errors: unknown or other student\'s session 404, empty text 400, no token 401', async () => {
    const sid = await newSession();
    expect((await stream('tut-does-not-exist', { text: 'hi' })).status).toBe(404);
    expect((await stream(sid, { text: 'hi' }, other)).status).toBe(404);
    expect((await stream(sid, { text: '  ' })).status).toBe(400);
    expect((await request(app).post(`/api/me/tutor/sessions/${sid}/messages/stream`).send({ text: 'hi' })).status).toBe(401);
  });

  it('no model configured: streams the user message, the fallback reply and done; both messages saved; no credits used', async () => {
    const sid = await newSession();
    const before = await credits();
    const r = await stream(sid, { text: 'How do I add 1/2 and 1/4?' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/event-stream/);
    const ev = events(r.body);
    expect(ev.map((e) => e.type)).toEqual(['user', 'replace', 'done']);
    expect(ev[0].message.text).toBe('How do I add 1/2 and 1/4?');
    expect(ev[2].assistantMessage.text).toBe(ev[1].text);
    expect(ev[2].session.messages.slice(-2).map((m: any) => m.role)).toEqual(['user', 'ai']);
    expect(await credits()).toBe(before);
  });

  it('model configured but unreachable (network blocked): fallback reply, credits given back, error logged not thrown', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(url instanceof Request ? url.url : url));
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return realFetch(url, init);
      throw new Error('outbound network blocked in test');
    }) as typeof fetch;
    Object.assign(process.env, { ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'p20-stream' });
    try {
      (await import('../src/config/env')).resetConfigForTests();
      (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
      app = (await import('../src/app')).createApp();
      const sid = await newSession();
      const before = await credits();
      const r = await stream(sid, { text: 'Explain equivalent fractions.' });
      expect(r.status).toBe(200);
      const ev = events(r.body);
      expect(ev.map((e) => e.type)).toEqual(['user', 'replace', 'done']);
      expect(ev[2].assistantMessage.meta.intent).not.toBe('direct_model');
      expect(await credits(), 'credits reserved for the call are given back').toBe(before);
      const saved = await request(app).get(`/api/me/tutor/sessions/${sid}`).set('Authorization', auth);
      const msgs = (saved.body.session ?? saved.body).messages;
      expect(msgs.slice(-2).map((m: any) => m.text)).toEqual(['Explain equivalent fractions.', ev[1].text]);
      // the JSON endpoint gives the same kind of answer for the same situation
      const j = await request(app).post(`/api/me/tutor/sessions/${sid}/messages`).set('Authorization', auth).send({ text: 'Explain equivalent fractions.' });
      expect(j.status).toBe(200);
      expect(j.body.assistantMessage.meta.intent).toBe(ev[2].assistantMessage.meta.intent);
    } finally {
      globalThis.fetch = realFetch;
      for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID']) delete process.env[k];
      (await import('../src/config/env')).resetConfigForTests();
    }
  }, 60_000);
});
