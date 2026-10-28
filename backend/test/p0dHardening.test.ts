import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P0d review fixes: an unreadable budget policy is never taken as "not
// enforced"; bounded staleness for cached settings; grading keeps running as
// a recorded emergency exposure; P0d indexes are declared and migrated.
// Providers mocked; in-memory MongoDB.
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
let askForJson: typeof import('../src/services/aiJson').askForJson;
let runWithCallContext: typeof import('../src/utils/callContext').runWithCallContext;
let logger: typeof import('../src/utils/logging').logger;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'test-key',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  B = await import('../src/services/aiBudget');
  M = await import('../src/models/OrgBudget');
  ({ askForJson } = await import('../src/services/aiJson'));
  ({ runWithCallContext } = await import('../src/utils/callContext'));
  ({ logger } = await import('../src/utils/logging'));
  (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const c of ['org_budgets', 'ai_controls', 'budget_counters', 'budget_reservations', 'usage_ledger', 'ai_calls', 'rate_limits', 'grading_proposals']) {
    await mongoose.connection.collection(c).deleteMany({});
  }
  B.forgetAiBudgetCache();
  ai.create.mockReset();
  ai.create.mockResolvedValue({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 10 }, content: [{ type: 'text', text: '{"correct":true,"scoreExplanation":"ok","feedback":"ok","flags":[]}' }] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const CTX = { requestId: 'r1', institutionId: 'instA', userId: 'u1', role: 'teacher' };
const ask = () => runWithCallContext(CTX, () => askForJson({ feature: 'lesson_plan', system: 'sys', user: 'secret student text', maxTokens: 200, validate: (v) => v }));
const grade = (id = 'att1') =>
  import('../src/services/gradingProposals').then(({ evaluateShortAnswer }) =>
    evaluateShortAnswer({ attempt: { id, institutionId: 'instA', assignmentId: 'asg' } as never, question: { id: 'q', type: 'short-answer', text: 'Half of 4?', correctAnswer: '2', points: 1 } as never, answer: 'two', run: 1 }),
  );
const failReads = () => vi.spyOn(M.OrgBudget, 'find').mockImplementation(() => { throw new Error('store down'); });
const later = (ms: number) => vi.useFakeTimers({ now: Date.now() + ms, toFake: ['Date'] });

describe('budget policy unavailable', () => {
  it('cold start with the budget store unreadable: the provider is not called', async () => {
    failReads();
    const error = vi.spyOn(logger, 'error');
    await expect(ask()).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE', statusCode: 503 });
    expect(ai.create).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('ai_budget_settings_unavailable', expect.objectContaining({ what: 'org_budget', institutionId: 'instA', severity: 'critical' }));
    expect(error).toHaveBeenCalledWith('ai_budget_policy_unavailable', expect.objectContaining({ policy: 'fail_closed' }));
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret student text');
  });

  it('no cache and the database not connected: fails closed (a configured database must be readable)', async () => {
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0 as never);
    await expect(ask()).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    expect(ai.create).not.toHaveBeenCalled();
  });

  it('the global controls unreadable with no cache: fails closed', async () => {
    vi.spyOn(M.AiControl, 'findById').mockImplementation(() => { throw new Error('store down'); });
    await expect(ask()).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    expect(ai.create).not.toHaveBeenCalled();
  });

  it('a stale cache with a failed refresh fails closed; within the staleness limit it is used and logged', async () => {
    await ask(); // settings (none) and global controls read and cached
    expect(ai.create).toHaveBeenCalledTimes(1);
    failReads();
    vi.spyOn(M.AiControl, 'findById').mockImplementation(() => { throw new Error('store down'); });
    const warn = vi.spyOn(logger, 'warn');
    later(30_000);
    await ask();
    expect(ai.create).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('ai_budget_stale_settings_used', expect.objectContaining({ what: 'org_budget' }));
    vi.useRealTimers();
    later(B.BUDGET_SETTINGS_MAX_STALE_MS + 1000);
    await expect(ask()).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    expect(ai.create).toHaveBeenCalledTimes(2);
  });

  it('a school read successfully with no enforcement keeps the existing behaviour', async () => {
    await M.OrgBudget.create({ institutionId: 'instA', enforcementEnabled: false });
    await ask();
    await ask();
    expect(ai.create).toHaveBeenCalledTimes(2);
    expect(await M.BudgetReservation.countDocuments()).toBe(0);
  });

  it('a newer pause cannot be bypassed by a stale cached "not paused" beyond the staleness limit', async () => {
    await ask(); // cached: not paused
    await M.OrgBudget.create({ institutionId: 'instA', aiPaused: true });
    // A refresh that succeeds sees the pause once the cache is due.
    later(16_000);
    await expect(ask()).rejects.toMatchObject({ code: 'AI_PAUSED' });
    vi.useRealTimers();
    // If refreshes fail instead, the old "not paused" is trusted for at most the limit.
    B.forgetAiBudgetCache();
    await M.OrgBudget.deleteMany({});
    await ask();
    await M.OrgBudget.create({ institutionId: 'instA', aiPaused: true });
    failReads();
    later(B.BUDGET_SETTINGS_MAX_STALE_MS + 1000);
    await expect(ask()).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
  });

  it('duplicate budget rows for one school are refused, not guessed', async () => {
    await M.OrgBudget.collection.dropIndexes().catch(() => undefined);
    await M.OrgBudget.collection.insertMany([{ institutionId: 'instA', enforcementEnabled: false }, { institutionId: 'instA', enforcementEnabled: true }]);
    const error = vi.spyOn(logger, 'error');
    await expect(ask()).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    expect(error).toHaveBeenCalledWith('ai_budget_duplicate_policy', expect.objectContaining({ institutionId: 'instA' }));
    await M.OrgBudget.collection.deleteMany({});
    await M.OrgBudget.createIndexes();
  });
});

describe('grading during a policy-store outage', () => {
  it('grading runs autonomously and its exposure is recorded as a critical emergency', async () => {
    failReads();
    const error = vi.spyOn(logger, 'error');
    const proposal = await grade();
    expect(proposal.status).toBe('proposed');
    expect(ai.create).toHaveBeenCalledTimes(1);
    const [r] = await M.BudgetReservation.find().lean();
    expect(r).toMatchObject({ kind: 'grading_emergency', status: 'settled', feature: 'ai_grading' });
    expect(r.amountMicros).toBeGreaterThan(0); // the call's bound, not zero
    expect(error).toHaveBeenCalledWith('ai_budget_grading_emergency', expect.objectContaining({ reason: 'policy_unavailable', severity: 'critical' }));
    const month = new Date().toISOString().slice(0, 7);
    expect((await M.BudgetCounter.findById(`instA:grading_emergency:${month}`).lean())!.settledMicros).toBeGreaterThan(0);
  });

  it('if the exposure cannot even be written, grading still runs and a critical log carries it', async () => {
    failReads();
    vi.spyOn(M.BudgetReservation, 'create').mockRejectedValue(new Error('store down') as never);
    const error = vi.spyOn(logger, 'error');
    expect((await grade('att2')).status).toBe('proposed');
    expect(error).toHaveBeenCalledWith('ai_budget_grading_exposure_unrecorded', expect.objectContaining({ institutionId: 'instA', reason: 'policy_unavailable', severity: 'critical', boundMicros: expect.any(Number) }));
  });

  it('grading is never stopped by pauses even while settings are unreadable', async () => {
    await M.AiControl.create({ _id: 'global', aiPaused: true });
    failReads();
    expect((await grade('att3')).status).toBe('proposed');
  });
});

describe('P0d indexes', () => {
  it('the models declare the indexes P0d relies on', () => {
    const idx = (schema: mongoose.Schema) => schema.indexes();
    expect(M.OrgBudget.schema.path('institutionId').options).toMatchObject({ unique: true });
    expect(idx(M.BudgetCounter.schema)).toEqual(expect.arrayContaining([[{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })]]));
    expect(idx(M.BudgetReservation.schema)).toEqual(expect.arrayContaining([[{ status: 1, expiresAt: 1 }, expect.anything()]]));
  });

  it('the migration creates and verifies them, is idempotent, and fails loudly on duplicate budgets', async () => {
    const { MIGRATIONS } = await import('../src/migrations');
    const m = MIGRATIONS.find((x) => x.id === '2026-10-29-p0d-budget-indexes')!;
    const ids = MIGRATIONS.map((x) => x.id);
    expect(ids.indexOf(m.id)).toBe(ids.indexOf('2026-10-29-avatar-session-retention') + 1);
    for (const c of [M.OrgBudget, M.BudgetCounter, M.BudgetReservation]) await c.collection.dropIndexes().catch(() => undefined);
    await m.up();
    await m.up();
    const orgIdx = await M.OrgBudget.collection.indexes();
    expect(orgIdx.find((i) => i.key.institutionId === 1)).toMatchObject({ unique: true });
    expect((await M.BudgetCounter.collection.indexes()).find((i) => i.key.expiresAt === 1)).toMatchObject({ expireAfterSeconds: 0 });
    expect((await M.BudgetReservation.collection.indexes()).some((i) => i.key.status === 1 && i.key.expiresAt === 1)).toBe(true);
    await M.OrgBudget.collection.dropIndexes();
    await M.OrgBudget.collection.insertMany([{ institutionId: 'dup' }, { institutionId: 'dup' }]);
    await expect(m.up()).rejects.toThrow();
    await M.OrgBudget.collection.deleteMany({});
    await M.OrgBudget.createIndexes();
  });
});
