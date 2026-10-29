import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P14.2: grading bypasses school budget caps but stays metered, and the
// deployment's cumulative test-spend cap holds every call, grading included.
// Every provider is mocked; in-memory MongoDB; no network, no spend.
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
  delete process.env.AI_TEST_SPEND_CAP_USD;
  delete process.env.AI_TEST_SPEND_ID;
  env = await import('../src/config/env');
  env.resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  B = await import('../src/services/aiBudget');
  M = await import('../src/models/OrgBudget');
  ({ askForJson } = await import('../src/services/aiJson'));
  ({ runWithCallContext } = await import('../src/utils/callContext'));
  for (const m of [M.OrgBudget, M.BudgetCounter, M.BudgetReservation]) await m.createIndexes();
  (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
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
  delete process.env.AI_TEST_SPEND_CAP_USD;
  delete process.env.AI_TEST_SPEND_ID;
  env.resetConfigForTests();
  B.forgetAiBudgetCache();
  ai.create.mockReset();
  vi.restoreAllMocks();
});
afterEach(() => vi.restoreAllMocks());

const CTX = { requestId: 'r1', institutionId: 'instA', userId: 'u1', role: 'teacher' };
const inCtx = <T>(fn: () => Promise<T>) => runWithCallContext(CTX, fn);
// Ordinary caps already exhausted: $0.000001/day leaves no room for any call.
const exhausted = (over: Record<string, unknown> = {}) =>
  M.OrgBudget.create({
    institutionId: 'instA', enforcementEnabled: true, dailyCapUsd: 0.000001, monthlyCapUsd: 100, perUserDailyCapUsd: 100, gradingAllowanceUsd: 5,
    intendedTools: ['anthropic:lesson_plan'], ...over,
  });
const withTestCap = (usd: number, id = 'p14') => {
  process.env.AI_TEST_SPEND_CAP_USD = String(usd);
  process.env.AI_TEST_SPEND_ID = id;
  env.resetConfigForTests();
};
const reply = (text = '{"ok":true}') => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 }, content: [{ type: 'text', text }] });
const ask = (feature: string) => inCtx(() => askForJson({ feature, institutionId: 'instA', system: 'sys', user: 'synthetic answer', maxTokens: 500, validate: (v) => v }));
const reserve = (key: string, feature: string, usd = 0.01, over: Record<string, unknown> = {}) =>
  B.reserveAiBudget({ key, feature, provider: 'anthropic', institutionId: 'instA', userId: 'u1', upperBoundUsd: usd, ...over });
const month = new Date().toISOString().slice(0, 7);
const counter = (id: string) => M.BudgetCounter.findById(id).lean();
const ledger = () => mongoose.connection.collection('usage_ledger').find({}).toArray();

describe('grading bypasses school budget caps (product decision 2.1)', () => {
  it('1. grading is allowed after the ordinary budget is exhausted (it uses the grading allowance)', async () => {
    await exhausted();
    await expect(reserve('g1', 'ai_grading')).resolves.toMatchObject({ state: 'reserved', kind: 'grading_allowance' });
    ai.create.mockResolvedValue(reply());
    await ask('ai_grading');
    expect(ai.create).toHaveBeenCalledTimes(1);
  });

  it('2. grading is allowed after the grading allowance is consumed too (observable emergency overrun)', async () => {
    await exhausted({ gradingAllowanceUsd: 0.000001 });
    await expect(reserve('g1', 'ai_grading')).resolves.toMatchObject({ state: 'reserved', kind: 'grading_emergency' });
    ai.create.mockResolvedValue(reply());
    await ask('ai_grading');
    expect(ai.create).toHaveBeenCalledTimes(1);
    expect((await counter(`instA:grading_emergency:${month}`))!.committedMicros).toBeGreaterThan(0);
  });

  it('3. non-grading AI is denied after exhaustion, before the provider is called', async () => {
    await exhausted();
    await expect(ask('lesson_plan')).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    expect(ai.create).not.toHaveBeenCalled();
  });

  it('4. the exemption covers ai_grading only: tutor, drafting, chat and grading-adjacent tools are capped', async () => {
    await exhausted({ maxReservationUsdPerCall: { 'anthropic:tutor_chat': 0.05 } });
    expect([...B.GRADING_FEATURES]).toEqual(['ai_grading']);
    for (const feature of ['tutor_chat', 'educator_chat', 'ai_assessment_draft', 'ai_question_regenerate', 'ai_grading_proposal', 'ai_lesson_plan']) {
      await expect(reserve(`k-${feature}`, feature), feature).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    }
  });
});

describe('grading stays tracked (product decision 2.2)', () => {
  it('5. grading attempts past the caps are written to usage_ledger with a list-price (estimated) cost and settled', async () => {
    await exhausted({ gradingAllowanceUsd: 0.000001 });
    ai.create.mockResolvedValue(reply());
    await ask('ai_grading');
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'ai_grading', institutionId: 'instA', status: 'ok', costStatus: 'estimated', attempt: 1 });
    expect(rows[0].costInternal).toBeGreaterThan(0);
    const r = await M.BudgetReservation.findOne({ feature: 'ai_grading' }).lean();
    expect(r).toMatchObject({ kind: 'grading_emergency', status: 'settled' });
    expect((await counter(`instA:grading_emergency:${month}`))!.settledMicros).toBe(Math.ceil(rows[0].costInternal * 1_000_000));
  });

  it('6. unknown grading usage is explicit (usage_unknown, null cost) and its whole reservation is kept, never zero', async () => {
    await exhausted({ gradingAllowanceUsd: 0.000001 });
    ai.create.mockRejectedValue(Object.assign(new Error('provider down'), { status: 400 }));
    await ask('ai_grading').catch(() => undefined);
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'ai_grading', status: 'error', costStatus: 'usage_unknown', costInternal: null });
    const r = await M.BudgetReservation.findOne({ feature: 'ai_grading' }).lean();
    expect(r!.amountMicros).toBeGreaterThan(0);
    expect(r).toMatchObject({ status: 'settled', actualMicros: null });
    const c = (await counter(`instA:grading_emergency:${month}`))!;
    expect(c.unknownMicros).toBe(r!.amountMicros);
    expect(c.committedMicros).toBe(r!.amountMicros);
  });
});

describe('cumulative test-spend cap (product decision 2.3)', () => {
  it('7. independent controls still stop calls: the test cap stops grading; the global pause stops non-grading', async () => {
    withTestCap(0.000001);
    await exhausted();
    ai.create.mockResolvedValue(reply());
    await expect(ask('ai_grading')).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP', statusCode: 429 });
    expect(ai.create).not.toHaveBeenCalled();
    expect(await ledger()).toHaveLength(0);

    withTestCap(5);
    await M.AiControl.create({ _id: 'global', aiPaused: true });
    B.forgetAiBudgetCache();
    await expect(ask('lesson_plan')).rejects.toMatchObject({ code: 'AI_PAUSED' });
    expect(ai.create).not.toHaveBeenCalled();
    // The test reservation taken before the pause refusal is given back.
    expect((await counter('test_spend:p14'))!.committedMicros).toBe(0);
  });

  it('8. the cap is cumulative across features, schools and cold starts, and blocks every call once spent', async () => {
    withTestCap(0.03);
    // No school budget at all (enforcement off): only the test cap applies.
    expect(await M.OrgBudget.countDocuments()).toBe(0);
    await expect(reserve('a', 'lesson_plan', 0.01)).resolves.toMatchObject({ state: 'reserved' });
    await expect(reserve('b', 'ai_grading', 0.01, { institutionId: 'instB' })).resolves.toMatchObject({ state: 'reserved' });
    // Cold start: settings re-read, the counter is in the database.
    env.resetConfigForTests();
    B.forgetAiBudgetCache();
    await expect(reserve('c', 'tutor_chat', 0.01)).resolves.toMatchObject({ state: 'reserved' });
    await expect(reserve('d', 'ai_grading', 0.01)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    await expect(reserve('e', 'lesson_plan', 0.01)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    expect((await counter('test_spend:p14'))!.committedMicros).toBe(30_000);

    // A known cost refunds the unused part; an unknown cost keeps it all.
    await B.settleAiBudget({ key: 'a', state: 'reserved', testSpend: true }, 0.002);
    await B.settleAiBudget({ key: 'b', state: 'reserved', testSpend: true }, null);
    const c = (await counter('test_spend:p14'))!;
    expect(c).toMatchObject({ committedMicros: 22_000, settledMicros: 2_000, unknownMicros: 10_000 });
    await expect(reserve('f', 'ai_grading', 0.008)).resolves.toMatchObject({ state: 'reserved' });
    await expect(reserve('g', 'ai_grading', 0.000001)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });

    // A new test window (new id) starts its own counter.
    withTestCap(0.03, 'p15');
    await expect(reserve('h', 'ai_grading', 0.01)).resolves.toMatchObject({ state: 'reserved' });
    // School views never list the test counter.
    expect(await M.BudgetCounter.countDocuments({ institutionId: 'instA', _id: /^test_spend/ })).toBe(0);
  });

  it('8b. through the gateway: grading is refused once the cap is spent, and the ledger holds what ran', async () => {
    await exhausted({ gradingAllowanceUsd: 0.000001 });
    ai.create.mockResolvedValue(reply());
    await ask('ai_grading');
    const first = (await ledger())[0];
    const bound = (await M.BudgetReservation.findOne({ kind: 'test_spend' }).lean())?.amountMicros;
    expect(bound).toBeUndefined(); // no cap configured yet: nothing reserved for it
    withTestCap(first.costInternal * 1.5);
    await expect(ask('ai_grading')).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    expect(ai.create).toHaveBeenCalledTimes(1);
    expect(await ledger()).toHaveLength(1);
  });

  it('calls without a positive bound cannot be held under the cap and are refused, grading included', async () => {
    withTestCap(5);
    await expect(B.reserveAiBudget({ key: 'u1', feature: 'ai_grading', provider: 'anthropic', institutionId: 'instA', upperBoundUsd: null })).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    await expect(B.reserveAiBudget({ key: 'u2', feature: 'avatar_session', provider: 'anam', institutionId: 'instA' })).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
  });

  it('release (provider never called) gives the test reservation back; a replayed key is refused (P14.3)', async () => {
    withTestCap(0.02);
    const t = await reserve('r', 'lesson_plan', 0.01);
    expect(t).toMatchObject({ state: 'reserved', testSpend: true });
    await expect(reserve('r', 'lesson_plan', 0.01)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    expect((await counter('test_spend:p14'))!.committedMicros).toBe(10_000);
    await B.releaseAiBudget(t);
    expect((await counter('test_spend:p14'))!.committedMicros).toBe(0);
  });

  it('a school-cap refusal gives the test reservation back', async () => {
    withTestCap(1);
    await exhausted();
    await expect(reserve('x', 'lesson_plan', 0.01)).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    expect((await counter('test_spend:p14'))!.committedMicros).toBe(0);
  });

  it('stale test reservations are kept as unknown exposure by the sweep', async () => {
    withTestCap(1);
    await reserve('s', 'ai_grading', 0.01, { ttlMs: 1 });
    await B.sweepStaleReservations({ now: new Date(Date.now() + 60_000) });
    expect((await counter('test_spend:p14'))!).toMatchObject({ committedMicros: 10_000, unknownMicros: 10_000 });
  });
});

describe('ordinary reservation failures fail safely', () => {
  it('9. a school budget store failure refuses non-grading before the provider; grading proceeds as recorded exposure', async () => {
    await exhausted({ dailyCapUsd: 10 });
    vi.spyOn(M.BudgetCounter, 'updateOne').mockRejectedValueOnce(new Error('store down'));
    ai.create.mockResolvedValue(reply());
    await expect(ask('lesson_plan')).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    expect(ai.create).not.toHaveBeenCalled();
    vi.spyOn(M.BudgetCounter, 'updateOne').mockRejectedValueOnce(new Error('store down'));
    await expect(reserve('g', 'ai_grading')).resolves.toMatchObject({ kind: 'grading_emergency' });
  });

  it('9b. a test-spend store failure fails closed for every feature, grading included', async () => {
    withTestCap(5);
    vi.spyOn(M.BudgetReservation, 'create').mockRejectedValueOnce(new Error('store down'));
    await expect(reserve('g1', 'ai_grading')).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    vi.spyOn(M.BudgetCounter, 'updateOne').mockRejectedValueOnce(new Error('store down'));
    await expect(reserve('g2', 'ai_grading')).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    ai.create.mockResolvedValue(reply());
    vi.spyOn(M.BudgetReservation, 'create').mockRejectedValueOnce(new Error('store down'));
    await expect(ask('ai_grading')).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    expect(ai.create).not.toHaveBeenCalled();
  });
});
