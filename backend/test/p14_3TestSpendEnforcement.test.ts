import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P14.3: the cumulative test-spend cap under concurrency, replays, retries,
// provider failures and pauses. Providers are mocked; in-memory MongoDB.
const ai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: ai.create };
    beta = { messages: { create: ai.create, stream: vi.fn() } };
  }
  return { default: Anthropic };
});

let mongo: MongoMemoryServer;
let B: typeof import('../src/services/aiBudget');
let GW: typeof import('../src/services/aiGateway');
let M: typeof import('../src/models/OrgBudget');
let env: typeof import('../src/config/env');
let askForJson: typeof import('../src/services/aiJson').askForJson;
let runWithCallContext: typeof import('../src/utils/callContext').runWithCallContext;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'test-key',
  });
  env = await import('../src/config/env');
  await mongoose.connect(mongo.getUri());
  B = await import('../src/services/aiBudget');
  GW = await import('../src/services/aiGateway');
  M = await import('../src/models/OrgBudget');
  ({ askForJson } = await import('../src/services/aiJson'));
  ({ runWithCallContext } = await import('../src/utils/callContext'));
  for (const m of [M.OrgBudget, M.BudgetCounter, M.BudgetReservation]) await m.createIndexes();
  GW.setGatewayRetryDelay(0);
});
afterAll(async () => {
  delete process.env.AI_TEST_SPEND_CAP_USD;
  delete process.env.AI_TEST_SPEND_ID;
  env.resetConfigForTests();
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const c of ['org_budgets', 'ai_controls', 'budget_counters', 'budget_reservations', 'usage_ledger', 'ai_calls', 'rate_limits']) {
    await mongoose.connection.collection(c).deleteMany({});
  }
  process.env.AI_TEST_SPEND_CAP_USD = '5';
  process.env.AI_TEST_SPEND_ID = 'p14';
  env.resetConfigForTests();
  B.forgetAiBudgetCache();
  ai.create.mockReset();
  vi.restoreAllMocks();
});

const cap = (usd: number) => {
  process.env.AI_TEST_SPEND_CAP_USD = String(usd);
  env.resetConfigForTests();
};
const used = async () => (await M.BudgetCounter.findById('test_spend:p14').lean()) ?? { committedMicros: 0, settledMicros: 0, unknownMicros: 0 };
const reserve = (key: string, feature: string, usd = 0.01, institutionId = 'instA') =>
  B.reserveAiBudget({ key, feature, provider: 'anthropic', institutionId, userId: 'u1', upperBoundUsd: usd });
const reply = () => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 }, content: [{ type: 'text', text: '{"ok":true}' }] });
const overloaded = () => Object.assign(new Error('overloaded'), { status: 529 });
const META = { feature: 'ai_grading', modelName: 'claude-opus-5-5', institutionId: 'instA', bound: { inputTokens: 2000, outputTokens: 500 } };
const ledger = () => mongoose.connection.collection('usage_ledger').find({}).sort({ attempt: 1 }).toArray();
const inCtx = <T>(fn: () => Promise<T>) => runWithCallContext({ requestId: 'r1', institutionId: 'instA', userId: 'u1', role: 'teacher' }, fn);

describe('concurrency', () => {
  it('concurrent reservations across schools and features never oversubscribe the cap', async () => {
    cap(0.05);
    const features = ['ai_grading', 'tutor_chat', 'lesson_plan', 'educator_chat'];
    const runs = await Promise.allSettled(
      Array.from({ length: 24 }, (_, i) => reserve(`c${i}`, features[i % 4], 0.01, i % 2 ? 'instA' : 'instB')),
    );
    expect(runs.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    for (const r of runs) if (r.status === 'rejected') expect(r.reason.code).toBe('AI_TEST_SPEND_CAP');
    expect((await used()).committedMicros).toBe(50_000);
    // Refused attempts leave no held reservation behind.
    expect(await M.BudgetReservation.countDocuments({ kind: 'test_spend', status: 'reserved' })).toBe(5);
  });
});

describe('replays and partial failures', () => {
  it('a reused attempt key is refused and never releases or re-reserves the first attempt', async () => {
    const first = await reserve('same', 'ai_grading');
    await expect(reserve('same', 'ai_grading')).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    expect((await used()).committedMicros).toBe(10_000);
    expect(await M.BudgetReservation.findById('same:test_spend').lean()).toMatchObject({ status: 'reserved' });
    // Even after settling, the key cannot buy an unreserved second call.
    await B.settleAiBudget(first, 0.004);
    await expect(reserve('same', 'ai_grading')).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    expect(await used()).toMatchObject({ committedMicros: 4_000, settledMicros: 4_000 });
  });

  it('unsettled reservations stay counted: an in-flight attempt blocks a call that would pass the cap', async () => {
    cap(0.015);
    await reserve('inflight', 'tutor_chat');
    await expect(reserve('next', 'ai_grading')).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
  });

  it('a failed settlement keeps the reservation held (counted), and the sweep turns it into unknown exposure', async () => {
    const t = await reserve('s1', 'ai_grading');
    vi.spyOn(M.BudgetReservation, 'findOneAndUpdate').mockRejectedValue(new Error('store down'));
    await B.settleAiBudget(t, 0.001);
    vi.restoreAllMocks();
    expect((await used()).committedMicros).toBe(10_000);
    await B.sweepStaleReservations({ now: new Date(Date.now() + 2 * 60 * 60 * 1000) });
    expect(await used()).toMatchObject({ committedMicros: 10_000, unknownMicros: 10_000 });
  });
});

describe('retries and provider failures through the gateway', () => {
  it('every retry attempt reserves and is accounted: failed attempts are kept whole as usage_unknown', async () => {
    ai.create.mockRejectedValueOnce(overloaded()).mockRejectedValueOnce(overloaded()).mockResolvedValueOnce(reply());
    await inCtx(() => GW.meteredMessage({ ...META, maxAttempts: 3 }, () => ai.create()));
    const res = await M.BudgetReservation.find({ kind: 'test_spend' }).lean();
    expect(res).toHaveLength(3);
    const bound = res[0].amountMicros;
    const rows = await ledger();
    expect(rows.map((r) => r.costStatus)).toEqual(['usage_unknown', 'usage_unknown', 'estimated']);
    const actual = Math.ceil(rows[2].costInternal * 1_000_000);
    expect(await used()).toMatchObject({ committedMicros: 2 * bound + actual, unknownMicros: 2 * bound, settledMicros: actual });
  });

  it('retries cannot run past the cap: the attempt that would exceed it is refused before the provider', async () => {
    // Room for exactly two attempts at this bound.
    const probe = await reserve('probe', 'ai_grading', 1);
    await B.releaseAiBudget(probe);
    ai.create.mockRejectedValue(overloaded());
    await inCtx(() => GW.meteredMessage({ ...META, maxAttempts: 1 }, () => ai.create())).catch(() => undefined);
    const bound = (await M.BudgetReservation.findOne({ kind: 'test_spend', status: 'settled' }).lean())!.amountMicros;
    await mongoose.connection.collection('budget_counters').deleteMany({});
    await mongoose.connection.collection('budget_reservations').deleteMany({});
    await mongoose.connection.collection('usage_ledger').deleteMany({});
    ai.create.mockClear();
    cap((2 * bound) / 1_000_000);
    const err = await inCtx(() => GW.meteredMessage({ ...META, maxAttempts: 5 }, () => ai.create())).catch((e) => e);
    expect(err.code).toBe('AI_TEST_SPEND_CAP');
    expect(ai.create).toHaveBeenCalledTimes(2);
    expect((await ledger()).map((r) => r.costStatus)).toEqual(['usage_unknown', 'usage_unknown']);
    expect(await used()).toMatchObject({ committedMicros: 2 * bound, unknownMicros: 2 * bound });
  });
});

describe('pauses and the grading exemption stay independent of the test cap', () => {
  it('global pause: non-grading is refused (and gives its test reservation back); grading runs and consumes the same test cap', async () => {
    await M.AiControl.create({ _id: 'global', aiPaused: true });
    await expect(reserve('n1', 'tutor_chat')).rejects.toMatchObject({ code: 'AI_PAUSED' });
    expect((await used()).committedMicros).toBe(0);
    await expect(reserve('g1', 'ai_grading')).resolves.toMatchObject({ state: 'reserved', testSpend: true });
    expect((await used()).committedMicros).toBe(10_000);
    cap(0.01);
    await expect(reserve('g2', 'ai_grading')).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
  });

  it('a school pause and an exhausted school budget do not stop grading, but never let it skip the test cap', async () => {
    await M.OrgBudget.create({ institutionId: 'instA', enforcementEnabled: true, aiPaused: true, dailyCapUsd: 0.000001, monthlyCapUsd: 0.000001, perUserDailyCapUsd: 1, gradingAllowanceUsd: 0.000001, intendedTools: ['anthropic:lesson_plan'] });
    cap(0.02);
    ai.create.mockResolvedValue(reply());
    await expect(reserve('t1', 'tutor_chat')).rejects.toMatchObject({ code: 'AI_PAUSED' });
    await expect(reserve('g1', 'ai_grading')).resolves.toMatchObject({ kind: 'grading_emergency', testSpend: true });
    await expect(reserve('g2', 'ai_grading')).resolves.toMatchObject({ kind: 'grading_emergency' });
    await expect(reserve('g3', 'ai_grading')).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    // The refused grading call reaches neither the provider nor the ledger.
    await expect(inCtx(() => askForJson({ feature: 'ai_grading', institutionId: 'instA', system: 's', user: 'u', maxTokens: 100, validate: (v) => v }))).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    expect(ai.create).not.toHaveBeenCalled();
    expect(await ledger()).toHaveLength(0);
  });
});
