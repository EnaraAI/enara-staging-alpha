import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Owner decision 2026-11-01: no test-spend cap for the live avatar. Live-avatar
// features skip the environment cap; every other feature stays under it.
// No AI provider is involved; in-memory MongoDB.
let mongo: MongoMemoryServer;
let B: typeof import('../src/services/aiBudget');
let M: typeof import('../src/models/OrgBudget');
let env: typeof import('../src/config/env');

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  env = await import('../src/config/env');
  await mongoose.connect(mongo.getUri());
  B = await import('../src/services/aiBudget');
  M = await import('../src/models/OrgBudget');
  for (const m of [M.OrgBudget, M.BudgetCounter, M.BudgetReservation]) await m.createIndexes();
});
afterAll(async () => {
  delete process.env.AI_TEST_SPEND_CAP_USD; delete process.env.AI_TEST_SPEND_ID;
  env.resetConfigForTests();
  await mongoose.disconnect(); await mongo.stop();
});
beforeEach(async () => {
  for (const c of ['org_budgets', 'ai_controls', 'budget_counters', 'budget_reservations']) await mongoose.connection.collection(c).deleteMany({});
  process.env.AI_TEST_SPEND_CAP_USD = '1'; process.env.AI_TEST_SPEND_ID = 'p23';
  env.resetConfigForTests(); B.forgetAiBudgetCache();
});

const reserve = (key: string, feature: string, provider: string, usd: number) =>
  B.reserveAiBudget({ key, feature, provider, institutionId: 'instA', userId: 'u1', upperBoundUsd: usd });
const env$ = async () => (await M.BudgetCounter.findById('test_spend:__environment__').lean())?.committedMicros ?? 0;

describe('live avatar and the test-spend cap', () => {
  it('fills the cap with ordinary AI, then still starts live-avatar calls', async () => {
    await reserve('a1', 'tutor_chat', 'anthropic', 0.9);
    await expect(reserve('a2', 'tutor_chat', 'anthropic', 0.5)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    for (const [i, [feature, provider]] of ([['avatar_session', 'anam'], ['tutor_voice', 'anthropic'], ['avatar_visual', 'anthropic'], ['stt', 'elevenlabs'], ['tts', 'elevenlabs']] as const).entries()) {
      const t = await reserve(`av${i}`, feature, provider, 0.5);
      expect(t.testSpend).toBeFalsy();
    }
  });
  it('live-avatar calls never add to the environment counter', async () => {
    const before = await env$();
    await reserve('s1', 'avatar_session', 'anam', 0.5);
    await reserve('s2', 'avatar_session', 'anam', 0.5);
    expect(await env$()).toBe(before);
  });
  it('a live-avatar call without a per-call bound is not refused by the cap', async () => {
    await expect(B.reserveAiBudget({ key: 'nb', feature: 'avatar_session', provider: 'anam', institutionId: 'instA', userId: 'u1' })).resolves.toBeTruthy();
  });
  it('speaking exams are not held under the cap', async () => {
    await reserve('f1', 'tutor_chat', 'anthropic', 0.95);
    const before = await env$();
    for (const [i, [feature, provider]] of ([['speaking_exam_stt', 'elevenlabs'], ['speaking_exam_tts', 'elevenlabs'], ['conversation_exam', 'anthropic']] as const).entries()) {
      const t = await reserve(`se${i}`, feature, provider, 0.5);
      expect(t.testSpend).toBeFalsy();
    }
    await expect(B.reserveAiBudget({ key: 'se-nb', feature: 'speaking_exam_stt', provider: 'elevenlabs', institutionId: 'instA', userId: 'u1' })).resolves.toBeTruthy();
    expect(await env$()).toBe(before);
  });
  it('grading and other features stay under the cap', async () => {
    await expect(reserve('g1', 'ai_grading', 'anthropic', 1.5)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    await expect(reserve('l1', 'ai_lesson_plan', 'anthropic', 1.5)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    // Text-tutor visuals are not part of the live call: they stay under the cap.
    await expect(reserve('tv1', 'tutor_visual', 'anthropic', 1.5)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
  });
});
