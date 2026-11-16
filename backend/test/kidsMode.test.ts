import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Enara Kids is switched on per student by school staff (Student.uiMode). Sign-in
// and GET /api/auth/session report it, so the app can pick the kids interface.
// No AI provider is involved.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let User: mongoose.Model<any>;
let Student: mongoose.Model<any>;
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
  User = (await import('../src/models/User')).User;
  Student = (await import('../src/models/Student')).Student;
  await User.createIndexes();
  app = (await import('../src/app')).createApp();
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

const PW = 'kids-mode-password-1';
async function account(email: string, role: string, institutionId = 'instK') {
  await User.create({ email, password: await bcrypt.hash(PW, 4), role, name: email, status: 'active', institutionId });
}
const login = (email: string) => request(app).post('/api/auth/login').send({ email, password: PW });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Enara Kids mode per student', () => {
  it('is standard by default, for students and staff', async () => {
    await account('plain-student@k.test', 'student');
    await account('kids-teacher@k.test', 'teacher');
    expect((await login('plain-student@k.test')).body.user.uiMode).toBe('standard');
    expect((await login('kids-teacher@k.test')).body.user.uiMode).toBe('standard');
  });

  it('a school admin turns it on for one student; sign-in and the session report it', async () => {
    await account('kids-admin@k.test', 'admin');
    const admin = (await login('kids-admin@k.test')).body.token;
    const created = await request(app).post('/api/students').set(auth(admin))
      .send({ name: 'Layla', email: 'layla@k.test', grade: 'Grade 2', uiMode: 'kids' });
    expect(created.status).toBe(201);
    expect(created.body.uiMode).toBe('kids');

    await account('layla@k.test', 'student');
    const first = await login('layla@k.test');
    expect(first.body.user.uiMode).toBe('kids');
    const sess = await request(app).get('/api/auth/session').set(auth(first.body.token));
    expect(sess.status).toBe(200);
    expect(sess.body.user).toMatchObject({ email: 'layla@k.test', role: 'student', uiMode: 'kids' });

    // Turning it off shows in the session without signing in again.
    const off = await request(app).patch(`/api/students/${created.body.id}`).set(auth(admin)).send({ uiMode: 'standard' });
    expect(off.status).toBe(200);
    expect(off.body.uiMode).toBe('standard');
    expect((await request(app).get('/api/auth/session').set(auth(first.body.token))).body.user.uiMode).toBe('standard');
  });

  it('only accepts standard or kids', async () => {
    const admin = (await login('kids-admin@k.test')).body.token;
    const s = await Student.findOne({ email: 'layla@k.test' }).lean() as any;
    const bad = await request(app).patch(`/api/students/${s.id}`).set(auth(admin)).send({ uiMode: 'toddler' });
    expect(bad.status).toBe(400);
  });

  it('a student cannot switch the mode, and staff accounts never get it', async () => {
    const student = (await login('layla@k.test')).body.token;
    const s = await Student.findOne({ email: 'layla@k.test' }).lean() as any;
    const denied = await request(app).patch(`/api/students/${s.id}`).set(auth(student)).send({ uiMode: 'kids' });
    expect(denied.status).toBe(403);
    // A teacher with the same email as a kids student record still gets the standard app.
    await Student.updateOne({ id: s.id }, { $set: { uiMode: 'kids' } });
    expect((await login('kids-teacher@k.test')).body.user.uiMode).toBe('standard');
  });

  it('the session needs a sign-in', async () => {
    expect((await request(app).get('/api/auth/session')).status).toBe(401);
  });
});
