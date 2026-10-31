import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// P20: settling or releasing a budget reservation and releasing student credits
// now take one database round trip instead of one per counter / three. The
// accounting must be exactly what it was. Real local MongoDB, no AI provider.

let mongo: MongoMemoryServer;
let budget: typeof import('../src/services/aiBudget');
let credits: typeof import('../src/services/creditsService');
let M: typeof import('../src/models/OrgBudget');
let StudentCredit: typeof import('../src/models/StudentCredit')['StudentCredit'];
let UsageEvent: mongoose.Model<any>;
const later = new Date(Date.now() + 86_400_000);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'DATABASE_URL']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  budget = await import('../src/services/aiBudget');
  credits = await import('../src/services/creditsService');
  M = await import('../src/models/OrgBudget');
  StudentCredit = (await import('../src/models/StudentCredit')).StudentCredit;
  UsageEvent = (await import('../src/models/UsageEvent')).UsageEvent as mongoose.Model<any>;
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const counters = ['s:day:2026-10-30', 's:month:2026-10', 's:user:u1:day:2026-10-30'];
async function seed(key: string, amountMicros: number, kind: 'standard' | 'test_spend' = 'standard') {
  for (const id of counters) await M.BudgetCounter.updateOne({ _id: id }, { $setOnInsert: { institutionId: 's', expiresAt: later }, $inc: { committedMicros: amountMicros } }, { upsert: true });
  await M.BudgetReservation.create({ _id: key, institutionId: 's', userId: 'u1', feature: 'tutor_chat', provider: 'anthropic', kind, amountMicros, counters, status: 'reserved', expiresAt: later });
}
const snapshot = async () => Object.fromEntries((await M.BudgetCounter.find({ _id: { $in: counters } }).lean()).map((c: any) => [c._id, { committed: c.committedMicros, settled: c.settledMicros, unknown: c.unknownMicros }]));

beforeEach(async () => {
  await M.BudgetCounter.deleteMany({});
  await M.BudgetReservation.deleteMany({});
});

describe('P20 budget settle/release in one round trip: same accounting', () => {
  it('settle with a known cost refunds the unused part on every counter, once', async () => {
    await seed('op-1', 150_000);
    await budget.settleAiBudget({ key: 'op-1', state: 'reserved' }, 0.04);
    for (const c of Object.values(await snapshot())) expect(c).toEqual({ committed: 40_000, settled: 40_000, unknown: 0 });
    await budget.settleAiBudget({ key: 'op-1', state: 'reserved' }, 0.04); // idempotent
    for (const c of Object.values(await snapshot())) expect(c).toEqual({ committed: 40_000, settled: 40_000, unknown: 0 });
    expect((await M.BudgetReservation.findById('op-1').lean())!.status).toBe('settled');
  });

  it('settle with an unknown cost keeps the whole reservation as unknown exposure', async () => {
    await seed('op-2', 150_000);
    await budget.settleAiBudget({ key: 'op-2', state: 'reserved' }, null);
    for (const c of Object.values(await snapshot())) expect(c).toEqual({ committed: 150_000, settled: 0, unknown: 150_000 });
  });

  it('release gives the reservation back on every counter, once', async () => {
    await seed('op-3', 150_000);
    await budget.releaseAiBudget({ key: 'op-3', state: 'reserved' });
    await budget.releaseAiBudget({ key: 'op-3', state: 'reserved' });
    for (const c of Object.values(await snapshot())) expect(c).toEqual({ committed: 0, settled: 0, unknown: 0 });
    expect((await M.BudgetReservation.findById('op-3').lean())!.status).toBe('released');
  });

  it('the test-spend reservation is settled alongside', async () => {
    await seed('op-4', 100_000);
    await M.BudgetReservation.create({ _id: 'op-4:test_spend', institutionId: 's', feature: 'tutor_chat', provider: 'anthropic', kind: 'test_spend', amountMicros: 100_000, counters: ['ts:p20'], status: 'reserved', expiresAt: later });
    await M.BudgetCounter.create({ _id: 'ts:p20', institutionId: 's', committedMicros: 100_000, expiresAt: later });
    await budget.settleAiBudget({ key: 'op-4', state: 'reserved', testSpend: true }, 0.01);
    expect((await M.BudgetCounter.findById('ts:p20').lean())!.committedMicros).toBe(10_000);
    for (const c of Object.values(await snapshot())) expect(c.committed).toBe(10_000);
  });
});

describe('P20 credit release in one atomic update: same result as the three-step version', () => {
  const reservation = (studentId: string, reservedCredits: number, eventId: string) => ({ eventId, userId: 'u1', studentId, feature: 'chat' as never, reservedCredits });
  async function credit(studentId: string, usage: number, limit: number, status: string) {
    await StudentCredit.deleteMany({ studentId });
    await StudentCredit.create({ studentId, institutionId: 's', usage, limit, period: 'monthly', status, restrictedFeatures: [] });
    await UsageEvent.create({ id: `ev-${studentId}`, userId: 'u1', studentId, feature: 'chat', creditsUsed: 0, status: 'reserved', timestamp: new Date() }).catch(() => undefined);
  }
  const read = async (studentId: string) => { const c: any = await StudentCredit.findOne({ studentId }).lean(); return { usage: c.usage, status: c.status }; };

  it('gives the credits back', async () => {
    await credit('c1', 50, 100, 'active');
    await credits.releaseUsage(reservation('c1', 10, 'ev-c1'));
    expect(await read('c1')).toEqual({ usage: 40, status: 'active' });
  });
  it('never goes below zero', async () => {
    await credit('c2', 5, 100, 'active');
    await credits.releaseUsage(reservation('c2', 10, 'ev-c2'));
    expect(await read('c2')).toEqual({ usage: 0, status: 'active' });
  });
  it('lifts a throttle once usage is under the limit', async () => {
    await credit('c3', 105, 100, 'throttled');
    await credits.releaseUsage(reservation('c3', 10, 'ev-c3'));
    expect(await read('c3')).toEqual({ usage: 95, status: 'active' });
  });
  it('keeps the throttle while still at or over the limit', async () => {
    await credit('c4', 150, 100, 'throttled');
    await credits.releaseUsage(reservation('c4', 20, 'ev-c4'));
    expect(await read('c4')).toEqual({ usage: 130, status: 'throttled' });
    await credit('c5', 110, 100, 'throttled');
    await credits.releaseUsage(reservation('c5', 10, 'ev-c5'));
    expect(await read('c5')).toEqual({ usage: 100, status: 'throttled' });
  });
  it('never touches a blocked account status', async () => {
    await credit('c6', 50, 100, 'blocked');
    await credits.releaseUsage(reservation('c6', 10, 'ev-c6'));
    expect(await read('c6')).toEqual({ usage: 40, status: 'blocked' });
  });
});
