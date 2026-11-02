import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Sign-in history (owner decision 2026-11-02): every attempt is stored with the
// full IP and browser; only ENARA admins can read it; the reply to the user is
// unchanged. In-memory MongoDB; no AI provider involved.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let User: typeof import('../src/models/User').User;
let SignInEvent: typeof import('../src/models/SignInEvent').SignInEvent;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let clientIp: typeof import('../src/services/signInHistory').clientIp;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ User } = await import('../src/models/User'));
  ({ SignInEvent } = await import('../src/models/SignInEvent'));
  ({ signAccessToken } = await import('../src/auth/jwt'));
  ({ clientIp } = await import('../src/services/signInHistory'));
  await mongoose.connect(mongo.getUri());
  app = (await import('../src/app')).createApp();
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => { await Promise.all([User.deleteMany({}), SignInEvent.deleteMany({}), mongoose.connection.collection('rate_limits').deleteMany({})]); });

const make = async (email: string, role: string, status = 'active', institutionId = 'inst-a') =>
  User.create({ email, password: await bcrypt.hash('Password123!', 10), role, name: email.split('@')[0], institutionId, status });
const tokenFor = (u: InstanceType<typeof User>) => signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId });
const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').set('User-Agent', 'TestBrowser/1.0').send({ email, password });

describe('sign-in history', () => {
  it('records success and each kind of failure, without changing the reply', async () => {
    await make('t@a.test', 'teacher');
    await make('off@a.test', 'teacher', 'disabled');
    expect((await login('t@a.test', 'Password123!')).status).toBe(200);
    const wrong = await login('t@a.test', 'nope');
    const unknown = await login('ghost@a.test', 'Password123!');
    const disabled = await login('off@a.test', 'Password123!');
    // Same 401 and message whatever the reason (no account discovery).
    for (const r of [wrong, unknown, disabled]) { expect(r.status).toBe(401); expect(r.body.error.message).toBe('Invalid credentials'); }
    expect((await login('', '')).status).toBe(400);
    const rows = await SignInEvent.find({}).sort({ at: 1 }).lean();
    expect(rows.map((r) => r.result)).toEqual(['success', 'wrong_password', 'unknown_account', 'account_disabled', 'invalid_request']);
    expect(rows[0]).toMatchObject({ email: 't@a.test', role: 'teacher', institutionId: 'inst-a', userAgent: 'TestBrowser/1.0' });
    expect(rows[0].ip).toBeTruthy();
    expect(rows[2].userId).toBeUndefined();
    for (const r of rows) expect(JSON.stringify(r)).not.toMatch(/Password123|nope/);
  });

  it('only ENARA admins can read it, with full IPs', async () => {
    const enara = await make('e@enara.test', 'enara-admin', 'active', 'enara');
    const admin = await make('admin@a.test', 'admin');
    await make('s@a.test', 'student');
    await login('s@a.test', 'Password123!');
    const r = await request(app).get('/api/security/sign-ins?days=1').set('Authorization', `Bearer ${tokenFor(enara)}`);
    expect(r.status).toBe(200);
    expect(r.body.signIns[0]).toMatchObject({ email: 's@a.test', result: 'success' });
    expect(r.body.signIns[0].ip).toBeTruthy();
    expect((await request(app).get('/api/security/sign-ins').set('Authorization', `Bearer ${tokenFor(admin)}`)).status).toBe(403);
    expect((await request(app).get('/api/security/sign-ins')).status).toBe(401);
  });

  it('filters by school, result and email', async () => {
    const enara = await make('e@enara.test', 'enara-admin', 'active', 'enara');
    await make('x@b.test', 'teacher', 'active', 'inst-b');
    await login('x@b.test', 'bad');
    await login('x@b.test', 'Password123!');
    const r = await request(app).get('/api/security/sign-ins?institutionId=inst-b&result=wrong_password&email=X@B.test').set('Authorization', `Bearer ${tokenFor(enara)}`);
    expect(r.body.total).toBe(1);
    expect(r.body.signIns[0]).toMatchObject({ result: 'wrong_password', institutionId: 'inst-b' });
  });

  it('on Vercel takes the client IP from the edge headers', () => {
    process.env.VERCEL = '1';
    try {
      expect(clientIp({ headers: { 'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1' }, ip: '10.0.0.1' } as never)).toBe('203.0.113.7');
      expect(clientIp({ headers: { 'x-forwarded-for': '198.51.100.2' }, ip: '10.0.0.1' } as never)).toBe('198.51.100.2');
    } finally { delete process.env.VERCEL; }
    expect(clientIp({ headers: {}, ip: '::ffff:127.0.0.1' } as never)).toBe('127.0.0.1');
  });
});
