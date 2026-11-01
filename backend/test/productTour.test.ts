import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Product tour for new accounts: sign-in says whether it is pending; finishing
// or skipping it is stored on the account, so it does not come back. No AI
// provider is involved.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let User: mongoose.Model<any>;
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
  await User.createIndexes();
  app = (await import('../src/app')).createApp();
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

const PW = 'tour-test-password-1';
// New accounts are dated after the tour's release, so the test does not depend on today's date.
let NEW_ACCOUNT_DATE: Date;
async function account(email: string, role: string, createdAt?: Date) {
  NEW_ACCOUNT_DATE ??= new Date((await import('../src/controllers/auth.controller')).TOUR_FOR_ACCOUNTS_CREATED_SINCE.getTime() + 86_400_000);
  const u = await User.create({ email, password: await bcrypt.hash(PW, 4), role, name: email, status: 'active', institutionId: 'instA' });
  await User.collection.updateOne({ _id: u._id }, { $set: { createdAt: createdAt ?? NEW_ACCOUNT_DATE } });
}
const login = (email: string) => request(app).post('/api/auth/login').send({ email, password: PW });

describe('product tour', () => {
  it('is pending for a new account, for every role, and not for older accounts', async () => {
    for (const role of ['student', 'teacher', 'admin', 'academic_manager']) {
      await account(`new-${role}@x.test`, role);
      expect((await login(`new-${role}@x.test`)).body.user.tourPending).toBe(true);
    }
    await account('old@x.test', 'teacher', new Date('2026-09-01T00:00:00Z'));
    expect((await login('old@x.test')).body.user.tourPending).toBe(false);
  });

  it('stays finished once finished or skipped', async () => {
    await account('done@x.test', 'student');
    const first = await login('done@x.test');
    expect(first.body.user.tourPending).toBe(true);
    const done = await request(app).post('/api/auth/tour/complete').set('Authorization', `Bearer ${first.body.token}`);
    expect(done.status).toBe(200);
    expect((await login('done@x.test')).body.user.tourPending).toBe(false);
    // A second call keeps the first time.
    const at = (await User.findOne({ email: 'done@x.test' }).lean() as any).tourCompletedAt;
    await request(app).post('/api/auth/tour/complete').set('Authorization', `Bearer ${(await login('done@x.test')).body.token}`);
    expect((await User.findOne({ email: 'done@x.test' }).lean() as any).tourCompletedAt).toEqual(at);
  });

  it('needs a signed-in account to record it', async () => {
    expect((await request(app).post('/api/auth/tour/complete')).status).toBe(401);
  });
});
