import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { designPlatformStatusOn } from '../src/config/env';

// GET /api/platform/status (design app "Models & Mishkat" screen): 404 unless LMS_DESIGN_PLATFORM_STATUS=true; ENARA admins only;
// configuration presence, names and counts only; no network call (Mishkat is never pinged).
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let User: typeof import('../src/models/User').User;
let AssessmentAttempt: typeof import('../src/models/AssessmentAttempt').AssessmentAttempt;
let LmsEmailLog: typeof import('../src/integrations/lms/models/email').LmsEmailLog;
let cairoDay: typeof import('../src/email/provider').cairoDay;
const fetchSpy = vi.spyOn(globalThis, 'fetch');

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    MISHKAT_ENDPOINT: 'https://mishkat.invalid/score', MISHKAT_TOKEN: 'test-mishkat-token', ENARA_ENGINE_V2: 'mishkatSplit',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  ({ User } = await import('../src/models/User'));
  ({ AssessmentAttempt } = await import('../src/models/AssessmentAttempt'));
  ({ LmsEmailLog } = await import('../src/integrations/lms/models/email'));
  ({ cairoDay } = await import('../src/email/provider'));
  await mongoose.connect(mongo.getUri());
  app = (await import('../src/app')).createApp();
}, 120_000);

afterAll(async () => {
  delete process.env.LMS_DESIGN_PLATFORM_STATUS;
  for (const k of ['MISHKAT_ENDPOINT', 'MISHKAT_TOKEN', 'ENARA_ENGINE_V2']) delete process.env[k];
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(() => { delete process.env.LMS_DESIGN_PLATFORM_STATUS; });

async function bearer(role: 'enara-admin' | 'admin' | 'teacher', email: string) {
  const u = await User.create({ email, password: 'x'.repeat(60), role, name: role, status: 'active', ...(role === 'enara-admin' ? {} : { institutionId: 'inst-a' }) });
  return `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId })}`;
}

describe('platform status switch', () => {
  it('reads only exactly true', () => {
    expect(designPlatformStatusOn({ LMS_DESIGN_PLATFORM_STATUS: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    for (const v of [undefined, '', 'false', '1', 'yes']) expect(designPlatformStatusOn({ LMS_DESIGN_PLATFORM_STATUS: v } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('off: 404 for everyone, even an ENARA admin', async () => {
    const auth = await bearer('enara-admin', 'ea-off@example.com');
    expect((await request(app).get('/api/platform/status')).status).toBe(404);
    expect((await request(app).get('/api/platform/status').set('Authorization', auth)).status).toBe(404);
  });

  it('on: mounted; 401 without a token, 403 for a school admin or teacher', async () => {
    process.env.LMS_DESIGN_PLATFORM_STATUS = 'true';
    expect((await request(app).get('/api/platform/status')).status).toBe(401);
    expect((await request(app).get('/api/platform/status').set('Authorization', await bearer('admin', 'sa@example.com'))).status).toBe(403);
    expect((await request(app).get('/api/platform/status').set('Authorization', await bearer('teacher', 't@example.com'))).status).toBe(403);
  });

  it('on: an ENARA admin gets presence, names and counts only, with no network call', async () => {
    process.env.LMS_DESIGN_PLATFORM_STATUS = 'true';
    const now = new Date();
    const day = cairoDay(now);
    const answer = (engine?: string) => ({ questionId: 'q1', questionText: 'Q', studentAnswer: 'a', isCorrect: false, explanation: '', ...(engine ? { engine } : {}) });
    await AssessmentAttempt.create([
      { id: 'at1', assessmentId: 'as1', assessmentTitle: 'A', studentId: 's1', institutionId: 'inst-a', status: 'submitted', submittedAt: new Date(now.getTime() - 60_000), finalizedAt: now, answers: [answer('mishkat-1+v3b')] },
      { id: 'at2', assessmentId: 'as1', assessmentTitle: 'A', studentId: 's2', institutionId: 'inst-a', status: 'submitted', submittedAt: new Date(now.getTime() - 3 * 86_400_000), answers: [answer('mishkat-1+v3b')] },
      { id: 'at3', assessmentId: 'as1', assessmentTitle: 'A', studentId: 's3', institutionId: 'inst-a', status: 'submitted', submittedAt: now, answers: [answer()] },
    ]);
    await LmsEmailLog.create([
      { key: 'k1', template: 't', lang: 'en', recipientRef: 'user:1', status: 'sent', cairoDay: day },
      { key: 'k2', template: 't', lang: 'en', recipientRef: 'user:2', status: 'sent', cairoDay: day },
      { key: 'k3', template: 't', lang: 'en', recipientRef: 'user:3', status: 'held', code: 'daily_ceiling', cairoDay: day },
      { key: 'k4', template: 't', lang: 'en', recipientRef: 'user:4', status: 'failed', cairoDay: day },
      { key: 'k5', template: 't', lang: 'en', recipientRef: 'user:5', status: 'sent', cairoDay: '2000-01-01' },
    ]);
    fetchSpy.mockClear();
    const r = await request(app).get('/api/platform/status').set('Authorization', await bearer('enara-admin', 'ea-on@example.com'));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(Object.keys(r.body).sort()).toEqual(['checkedAt', 'email', 'mishkat', 'models']);
    expect(r.body.mishkat).toEqual({
      ar: { configured: true, splitOn: true }, en: { configured: true, splitOn: true },
      lastScoredAt: now.toISOString(), scoredLast24h: 1,
    });
    expect(r.body.email).toMatchObject({ configured: false, resendKeyPresent: false, emailsEnabled: false, cairoDay: day, today: { sent: 2, held: 1, failed: 1 } });
    expect(typeof r.body.models.tutor).toBe('string');
    expect(r.body.models.fallback).toBeNull();
    expect(Number.isNaN(Date.parse(r.body.checkedAt))).toBe(false);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain('mishkat.invalid');
    expect(text).not.toContain('test-mishkat-token');
    expect(text).not.toMatch(/https?:\/\//);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
