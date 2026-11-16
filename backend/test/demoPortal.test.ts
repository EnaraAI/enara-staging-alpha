import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Partner demo portal: one-click sign-in into a fresh copy of the demo
// template school, isolated per session and wiped when the session ends.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let enaraAdmin: string;

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
    AI_ENGINE_URL: 'http://127.0.0.1:9998',
    AWS_S3_BUCKET: 'test-bucket',
    TRUST_PROXY: 'false',
    SERVE_LOCAL_UPLOADS: 'false',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  app = (await import('../src/app')).createApp();
  const { User } = await import('../src/models/User');
  const { signAccessToken } = await import('../src/auth/jwt');
  const admin = await User.create({ email: 'ops@enara.ai', password: 'x', role: 'enara-admin', name: 'Ops' });
  enaraAdmin = `Bearer ${signAccessToken({ id: admin._id.toString(), email: admin.email, role: 'enara-admin' } as never)}`;
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const { DemoSession } = await import('../src/models/DemoSession');
  await DemoSession.deleteMany({});
  // Every test request comes from the same address: reset the hourly start limit.
  await mongoose.connection.db!.collection('rate_limits').deleteMany({}).catch(() => undefined);
});

const start = (role: string, _ip = '') => request(app).post('/api/demo/start').send({ role });

async function countFor(inst: string) {
  let n = 0;
  for (const name of mongoose.modelNames()) {
    const m = mongoose.model(name);
    if (m.schema.path('institutionId') && !['AiCall', 'UsageLedger', 'BudgetCounter', 'BudgetReservation', 'AlertEvent', 'AuditEvent', 'DemoSession'].includes(name)) {
      n += await m.countDocuments({ institutionId: inst });
    }
  }
  return n;
}

describe('partner demo portal', () => {
  it('is unavailable until an Enara admin builds the template', async () => {
    expect((await request(app).get('/api/demo/status')).body).toEqual({ available: false, full: false });
    expect((await start('student')).status).toBe(503);
    const built = await request(app).post('/api/demo/admin/template').set('Authorization', enaraAdmin);
    expect(built.status).toBe(200);
    expect(built.body).toMatchObject({ institutionId: 'demo-template', students: 6, lessons: 4 });
    expect((await request(app).get('/api/demo/status')).body.available).toBe(true);
    // Only Enara admins can build it.
    const sessionStudent = await start('student', '10.9.9.9');
    expect((await request(app).post('/api/demo/admin/template').set('Authorization', `Bearer ${sessionStudent.body.token}`)).status).toBe(403);
  });

  it('gives every click its own fresh school, with the course ready to use', async () => {
    const a = await start('student', '10.0.0.2');
    const b = await start('student', '10.0.0.3');
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ role: 'student', user: { name: 'Lina Hassan', role: 'student' } });
    const { DemoSession } = await import('../src/models/DemoSession');
    const [sa, sb] = await Promise.all([DemoSession.findOne({ id: a.body.sessionId }).lean(), DemoSession.findOne({ id: b.body.sessionId }).lean()]);
    expect(sa!.institutionId).toMatch(/^demo-s-/);
    expect(sa!.institutionId).not.toBe(sb!.institutionId);
    // Same contents as the template, under new ids.
    const template = await countFor('demo-template');
    expect(await countFor(sa!.institutionId)).toBe(template);
    const { Curriculum } = await import('../src/models/Curriculum');
    expect(await Curriculum.countDocuments({ institutionId: sa!.institutionId, id: /demo-template/ })).toBe(0);
    // The student sees the course straight away.
    const courses = await request(app).get('/api/me/courses').set('Authorization', `Bearer ${a.body.token}`);
    expect(courses.status).toBe(200);
    expect(courses.body.map((c: { title: string }) => c.title)).toEqual(['Everyday English A2']);
    // And not the other session's or the template's.
    const { Student } = await import('../src/models/Student');
    expect((await Student.find({ institutionId: sa!.institutionId }).lean()).every((s) => !s.id.includes('demo-template'))).toBe(true);
  });

  it('switches role inside the same demo, and keeps the session alive while open', async () => {
    const s = await start('student', '10.0.0.4');
    const auth = `Bearer ${s.body.token}`;
    const teacher = await request(app).post('/api/demo/switch').set('Authorization', auth).send({ role: 'teacher' });
    expect(teacher.status).toBe(200);
    expect(teacher.body.user).toMatchObject({ name: 'Maya Teacher', role: 'teacher' });
    expect((await request(app).post('/api/demo/heartbeat').set('Authorization', `Bearer ${teacher.body.token}`)).status).toBe(200);
  });

  it('wipes the demo school when the browser closes the session', async () => {
    const s = await start('teacher', '10.0.0.5');
    const { DemoSession } = await import('../src/models/DemoSession');
    const inst = (await DemoSession.findOne({ id: s.body.sessionId }).lean())!.institutionId;
    expect(await countFor(inst)).toBeGreaterThan(10);
    // navigator.sendBeacon: the token in a text body, no headers.
    const end = await request(app).post('/api/demo/end').set('Content-Type', 'text/plain').send(JSON.stringify({ token: s.body.token }));
    expect(end.status).toBe(204);
    expect(await countFor(inst)).toBe(0);
    expect((await DemoSession.findOne({ id: s.body.sessionId }).lean())!.status).toBe('ended');
    // The ended session's token no longer opens anything demo-related.
    expect((await request(app).post('/api/demo/heartbeat').set('Authorization', `Bearer ${s.body.token}`)).status).toBe(401);
    // The template is untouched.
    expect(await countFor('demo-template')).toBeGreaterThan(10);
  });

  it('wipes sessions whose browser stopped checking in, and caps sessions per address', async () => {
    const s = await start('student', '10.0.0.6');
    const { DemoSession } = await import('../src/models/DemoSession');
    const inst = (await DemoSession.findOne({ id: s.body.sessionId }).lean())!.institutionId;
    await DemoSession.updateOne({ id: s.body.sessionId }, { $set: { lastSeenAt: new Date(Date.now() - 11 * 60_000) } });
    const { sweepDemoSessions } = await import('../src/services/demoSandbox');
    expect(await sweepDemoSessions()).toEqual({ ended: 1 });
    expect(await countFor(inst)).toBe(0);
    expect((await start('student', '10.0.0.6')).status).toBe(201);
    expect((await start('student', '10.0.0.6')).status).toBe(201);
    const fourth = await start('student', '10.0.0.6');
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe('DEMO_LIMIT');
  });

  it('keeps demo accounts from reaching outside the demo', async () => {
    const s = await start('admin', '10.0.0.7');
    const auth = `Bearer ${s.body.token}`;
    const invite = await request(app).post('/api/workspace/invitations').set('Authorization', auth).send({ email: 'real.person@example.com', role: 'teacher' });
    expect(invite.status).toBe(403);
    expect(invite.body.error.code).toBe('DEMO_RESTRICTED');
    expect((await request(app).post('/api/auth/users').set('Authorization', auth).send({})).status).toBe(403);
    expect((await request(app).post('/api/documents').set('Authorization', auth).send({})).status).toBe(403);
    // Reading the school works as usual.
    expect((await request(app).get('/api/students').set('Authorization', auth)).status).toBe(200);
  });

  it('gives each session its own budget and counts demo spend on the demo ceiling, not the test cap', async () => {
    const s = await start('student', '10.0.0.8');
    const { DemoSession } = await import('../src/models/DemoSession');
    const inst = (await DemoSession.findOne({ id: s.body.sessionId }).lean())!.institutionId;
    const { OrgBudget, BudgetCounter } = await import('../src/models/OrgBudget');
    expect(await OrgBudget.findOne({ institutionId: inst }).lean()).toMatchObject({ enforcementEnabled: true, dailyCapUsd: 25, monthlyCapUsd: 25, perUserDailyCapUsd: 25 });
    const { reserveAiBudget } = await import('../src/services/aiBudget');
    const ticket = await reserveAiBudget({ key: 'demo-test-1', feature: 'tutor_chat', provider: 'anthropic', institutionId: inst, userId: 'u1', upperBoundUsd: 0.05 });
    expect(ticket.state).toBe('reserved');
    const month = new Date().toISOString().slice(0, 7);
    expect((await BudgetCounter.findById(`demo_spend:${month}`).lean())?.committedMicros).toBe(50_000);
    // Over the monthly demo ceiling: refused.
    await BudgetCounter.updateOne({ _id: `demo_spend:${month}` }, { $set: { committedMicros: 200_000_000 } });
    await expect(reserveAiBudget({ key: 'demo-test-2', feature: 'tutor_chat', provider: 'anthropic', institutionId: inst, userId: 'u1', upperBoundUsd: 0.05 })).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    expect((await start('student', '10.0.0.9')).body.error.code).toBe('DEMO_FULL');
    await BudgetCounter.deleteMany({ _id: `demo_spend:${month}` });
  });

  it('refuses to wipe anything that is not a demo session school', async () => {
    const { purgeDemoSchool } = await import('../src/services/demoSandbox');
    await expect(purgeDemoSchool('demo-template')).rejects.toThrow(/not a demo session/);
    await expect(purgeDemoSchool('inst-408b12539ab1')).rejects.toThrow(/not a demo session/);
  });
});
