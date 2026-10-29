import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGING_DB_NAME, STAGING_MAX_TEST_SPEND_USD, stagingProblems } from '../src/config/stagingGuard';

// P14.8 readiness fixes: S-1 server-side logout/revocation, F-1 503 for
// ingestion status without Postgres, GAP-1 reservation on an Anam language
// switch, GAP-2 no AI-written email when email is off, and the staging $5
// ceiling on the test-spend cap. Providers are mocked; in-memory MongoDB.

const ai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: ai.create };
    beta = { messages: { create: ai.create, stream: vi.fn() } };
  }
  return { default: Anthropic };
});

const realFetch = globalThis.fetch;
const anamFetch = vi.fn();
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let env: typeof import('../src/config/env');
let User: typeof import('../src/models/User').User;
let M: typeof import('../src/models/OrgBudget');
const PASSWORD = 'p14-8-test-password-not-real';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    ANTHROPIC_API_KEY: 'test-key', ANAM_API_KEY: 'anam-key', ANAM_AVATAR_ID: 'avatar-1', ANAM_VOICE_ID_EN: 'voice-en', ANAM_VOICE_ID_AR: 'voice-ar',
  });
  for (const k of ['DATABASE_URL', 'RESEND_API_KEY', 'REMINDER_FROM', 'REMINDERS_ENABLED', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID']) delete process.env[k];
  env = await import('../src/config/env');
  env.resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  ({ User } = await import('../src/models/User'));
  M = await import('../src/models/OrgBudget');
  for (const m of [M.OrgBudget, M.BudgetCounter, M.BudgetReservation]) await m.createIndexes();
  app = (await import('../src/app')).createApp();
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
    String(url).startsWith('https://api.anam.ai/') ? anamFetch(url, init) : realFetch(url, init)) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  delete process.env.AI_TEST_SPEND_CAP_USD;
  delete process.env.AI_TEST_SPEND_ID;
  env.resetConfigForTests();
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const c of ['users', 'org_budgets', 'budget_counters', 'budget_reservations', 'avatarsessions', 'reminderlogs', 'rate_limits', 'passwordresets']) {
    await mongoose.connection.collection(c).deleteMany({});
  }
  delete process.env.AI_TEST_SPEND_CAP_USD;
  delete process.env.AI_TEST_SPEND_ID;
  env.resetConfigForTests();
  (await import('../src/services/aiBudget')).forgetAiBudgetCache();
  ai.create.mockReset();
  anamFetch.mockReset();
  anamFetch.mockImplementation(async () => new Response(JSON.stringify({ sessionToken: 'anam-token' }), { status: 200 }));
});

const makeUser = (email: string, role: 'teacher' | 'admin' = 'teacher') =>
  User.create({ email, password: bcrypt.hashSync(PASSWORD, 10), role, name: 'P14.8', institutionId: 'inst' });
const login = async (email: string) => {
  const r = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(r.status).toBe(200);
  return `Bearer ${r.body.token}`;
};
const read = (auth: string) => request(app).get('/api/curriculums').set('Authorization', auth);

describe('S-1: server-side logout and revocation', () => {
  it('logout revokes the token, and every other token of the account; a fresh login works', async () => {
    await makeUser('s1@p148.test');
    const a = await login('s1@p148.test');
    const b = await login('s1@p148.test'); // another device
    expect((await read(a)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set('Authorization', a)).status).toBe(204);
    const after = await read(a);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('INVALID_TOKEN');
    expect((await read(b)).status).toBe(401);
    // Logging out again with a revoked token is refused, not an error.
    expect((await request(app).post('/api/auth/logout').set('Authorization', a)).status).toBe(401);
    const c = await login('s1@p148.test');
    expect((await read(c)).status).toBe(200);
  });

  it('logout needs authentication', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
  });

  it('tokens issued before S-1 (no tv claim) stay valid until the first logout', async () => {
    const u = await makeUser('legacy@p148.test');
    const legacy = jwt.sign({ typ: 'access', id: u._id.toString(), email: u.email, role: 'teacher', institutionId: 'inst' }, process.env.JWT_SECRET!, {
      algorithm: 'HS256', expiresIn: '1h', issuer: 'enara-backend', audience: 'enara-platform', subject: u._id.toString(),
    });
    expect((await read(`Bearer ${legacy}`)).status).toBe(200);
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${legacy}`);
    expect((await read(`Bearer ${legacy}`)).status).toBe(401);
  });

  it('a malformed version claim is refused', async () => {
    const u = await makeUser('tv@p148.test');
    for (const tv of ['0', -1, 1.5]) {
      const t = jwt.sign({ typ: 'access', id: u._id.toString(), role: 'teacher', tv }, process.env.JWT_SECRET!, {
        algorithm: 'HS256', expiresIn: '1h', issuer: 'enara-backend', audience: 'enara-platform', subject: u._id.toString(),
      });
      expect((await read(`Bearer ${t}`)).status, String(tv)).toBe(401);
    }
  });

  it('a password reset revokes existing tokens', async () => {
    await makeUser('reset@p148.test');
    const a = await login('reset@p148.test');
    const { requestPasswordReset, confirmPasswordReset } = await import('../src/services/accountTokens');
    const token = await requestPasswordReset('reset@p148.test', { sendMail: false });
    await confirmPasswordReset(token!, 'p14-8-new-password-not-real');
    expect((await read(a)).status).toBe(401);
  });

  it('a disabled account is refused at once (existing behaviour kept)', async () => {
    await makeUser('off@p148.test');
    const a = await login('off@p148.test');
    await User.updateOne({ email: 'off@p148.test' }, { $set: { status: 'disabled' } });
    expect((await read(a)).status).toBe(401);
  });
});

describe('F-1: ingestion status without Postgres', () => {
  it('answers 503 INGESTION_UNAVAILABLE, not 500', async () => {
    await makeUser('f1@p148.test');
    const a = await login('f1@p148.test');
    const r = await request(app).get('/api/ingestion/status/evt-1').set('Authorization', a);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('INGESTION_UNAVAILABLE');
  });
});

describe('GAP-2: no AI-written email when email is off', () => {
  it('reminders and weekly summaries skip before any AI call or log write', async () => {
    const { sendReminders } = await import('../src/services/reminderService');
    const { sendWeeklySummaries } = await import('../src/services/classSummaryService');
    await makeUser('staff@p148.test');
    expect(await sendReminders({})).toEqual({ planned: 0, sent: 0, skipped: 'email_disabled' });
    expect(await sendWeeklySummaries()).toEqual({ sent: 0, skipped: 'email_disabled' });
    expect(ai.create).not.toHaveBeenCalled();
    expect(await mongoose.connection.collection('reminderlogs').countDocuments()).toBe(0);
  });
});

describe('GAP-1: an Anam language switch reserves like a session start', () => {
  const capWith = async (usd: number) => {
    process.env.AI_TEST_SPEND_CAP_USD = String(usd);
    process.env.AI_TEST_SPEND_ID = 'p148';
    env.resetConfigForTests();
    await M.OrgBudget.create({ institutionId: 'inst', enforcementEnabled: false, maxReservationUsdPerCall: { 'anam:avatar_session': 0.4 } });
  };
  const used = async () => (await M.BudgetCounter.findById('test_spend:p148').lean())?.committedMicros ?? 0;

  it('each switch reserves against the test cap, and the cap stops further switches before Anam', async () => {
    await capWith(1);
    await makeUser('av@p148.test', 'admin');
    const a = await login('av@p148.test');
    const s = await request(app).post('/api/avatar/session').set('Authorization', a).send({ preferred_language: 'english' });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(await used()).toBe(400_000);
    const sw = await request(app).post(`/api/avatar/session/${s.body.session_id}/language`).set('Authorization', a).send({ target_language: 'arabic' });
    expect(sw.status, JSON.stringify(sw.body)).toBe(200);
    expect(await used()).toBe(800_000);
    const calls = anamFetch.mock.calls.length;
    const refused = await request(app).post(`/api/avatar/session/${s.body.session_id}/language`).set('Authorization', a).send({ target_language: 'english' });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('AI_TEST_SPEND_CAP');
    expect(anamFetch.mock.calls.length).toBe(calls); // Anam was not asked
  });

  it('a switch Anam refuses gives its reservation back', async () => {
    await capWith(5);
    await makeUser('av2@p148.test', 'admin');
    const a = await login('av2@p148.test');
    const s = await request(app).post('/api/avatar/session').set('Authorization', a).send({ preferred_language: 'english' });
    const before = await used();
    anamFetch.mockImplementation(async () => new Response('{}', { status: 500 }));
    const sw = await request(app).post(`/api/avatar/session/${s.body.session_id}/language`).set('Authorization', a).send({ target_language: 'arabic' });
    expect(sw.status).toBeGreaterThanOrEqual(500);
    expect(await used()).toBe(before);
  });
});

describe('staging test-spend cap ceiling', () => {
  const base = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
    NODE_ENV: 'development', ENARA_STAGING: 'true', MONGODB_URI: `mongodb://h:27017/${STAGING_DB_NAME}`,
    JWT_SECRET: 'jwt-staging-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa', INGEST_HMAC_SECRET: 'hmac-staging-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb',
    CRON_SECRET: 'cron-staging-secret-ccccccccccccccccccccccccccc', RUN_MIGRATIONS_ON_START: 'false',
    R2_ACCOUNT_ID: 'a', R2_BUCKET: 'enara-staging-alpha-uploads', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', SERVE_LOCAL_UPLOADS: 'false',
    CORS_ALLOWED_ORIGINS: 'https://staging.example.test', FRONTEND_URL: 'https://staging.example.test', ANTHROPIC_API_KEY: 'x', AI_TEST_SPEND_ID: 'p14', ...over,
  });
  it('accepts a cap up to the approved $5 and refuses anything above it', () => {
    expect(STAGING_MAX_TEST_SPEND_USD).toBe(5);
    for (const v of ['4.50', '5', '0.01']) expect(stagingProblems(base({ AI_TEST_SPEND_CAP_USD: v })), v).toEqual([]);
    for (const v of ['5.01', '50', '0', '-1', 'five']) expect(stagingProblems(base({ AI_TEST_SPEND_CAP_USD: v })).join(' '), v).toMatch(/at most 5/);
  });
});
