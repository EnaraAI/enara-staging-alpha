import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P0d: budgets, atomic reservations, alerts, pauses and rate limits. Every
// provider is mocked; in-memory MongoDB; no network.
const ai = vi.hoisted(() => ({ create: vi.fn(), sttToken: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: ai.create };
    beta = { messages: { create: ai.create, stream: vi.fn() } };
  }
  return { default: Anthropic };
});
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    tokens = { singleUse: { create: ai.sttToken } };
    textToSpeech = { stream: vi.fn() };
  },
}));

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let B: typeof import('../src/services/aiBudget');
let GW: typeof import('../src/services/aiGateway');
let M: typeof import('../src/models/OrgBudget');
let askForJson: typeof import('../src/services/aiJson').askForJson;
let runWithCallContext: typeof import('../src/utils/callContext').runWithCallContext;
let logger: typeof import('../src/utils/logging').logger;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let User: mongoose.Model<any>;
let Institution: mongoose.Model<any>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'test-key',
    ELEVENLABS_API_KEY: 'el-key',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  B = await import('../src/services/aiBudget');
  GW = await import('../src/services/aiGateway');
  M = await import('../src/models/OrgBudget');
  ({ askForJson } = await import('../src/services/aiJson'));
  ({ runWithCallContext } = await import('../src/utils/callContext'));
  ({ logger } = await import('../src/utils/logging'));
  ({ signAccessToken } = await import('../src/auth/jwt'));
  ({ User } = await import('../src/models/User'));
  ({ Institution } = await import('../src/models/Institution'));
  for (const m of [M.OrgBudget, M.BudgetCounter, M.BudgetReservation, User, Institution]) await m.createIndexes();
  GW.setGatewayRetryDelay(0);
  app = (await import('../src/app')).createApp();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const c of ['org_budgets', 'ai_controls', 'budget_counters', 'budget_reservations', 'usage_ledger', 'ai_calls', 'rate_limits', 'users', 'institutions', 'grading_proposals']) {
    await mongoose.connection.collection(c).deleteMany({});
  }
  await Institution.create([{ id: 'instA', name: 'A' }, { id: 'instB', name: 'B' }]);
  B.forgetAiBudgetCache();
  ai.create.mockReset();
  ai.sttToken.mockReset();
  vi.restoreAllMocks();
});

const CTX = { requestId: 'r1', institutionId: 'instA', userId: 'u1', role: 'teacher' };
const inCtx = <T>(fn: () => Promise<T>, ctx: Record<string, string> = CTX) => runWithCallContext(ctx, fn);
const enforce = (over: Record<string, unknown> = {}) =>
  M.OrgBudget.create({
    institutionId: 'instA', enforcementEnabled: true, dailyCapUsd: 10, monthlyCapUsd: 100, perUserDailyCapUsd: 10, gradingAllowanceUsd: 5,
    intendedTools: ['anthropic:lesson_plan'], ...over,
  });
const counter = (window: string) => {
  const d = new Date().toISOString();
  const id = window === 'day' ? `instA:day:${d.slice(0, 10)}` : window === 'month' ? `instA:month:${d.slice(0, 7)}` : window === 'grading' ? `instA:grading:${d.slice(0, 7)}` : window === 'emergency' ? `instA:grading_emergency:${d.slice(0, 7)}` : `instA:user:${window}:day:${d.slice(0, 10)}`;
  return M.BudgetCounter.findById(id).lean();
};
const reply = (text = '{"ok":true}') => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 }, content: [{ type: 'text', text }] });
const ask = (over: Record<string, unknown> = {}) => askForJson({ feature: 'lesson_plan', system: 'sys', user: 'student text', maxTokens: 500, validate: (v) => v, ...over });
const reserve = (key: string, usd: number, over: Record<string, unknown> = {}) =>
  B.reserveAiBudget({ key, feature: 'lesson_plan', provider: 'anthropic', institutionId: 'instA', userId: 'u1', upperBoundUsd: usd, ...over });

describe('P0d reservations', () => {
  it('existing schools are unaffected: no budget document means no enforcement', async () => {
    ai.create.mockResolvedValue(reply());
    await inCtx(() => ask());
    expect(ai.create).toHaveBeenCalledTimes(1);
    expect(await M.BudgetReservation.countDocuments()).toBe(0);
  });

  it('concurrent reservations cannot exceed the daily, monthly or per-user caps', async () => {
    await enforce({ dailyCapUsd: 3, monthlyCapUsd: 100, perUserDailyCapUsd: 100 });
    const day = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => reserve(`d${i}`, 1)));
    expect(day.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(day.filter((r) => r.status === 'rejected' && r.reason.code === 'AI_BUDGET_EXCEEDED')).toHaveLength(9);
    expect((await counter('day'))!.committedMicros).toBe(3_000_000);

    await M.OrgBudget.updateOne({ institutionId: 'instA' }, { dailyCapUsd: 100, monthlyCapUsd: 5 });
    B.forgetAiBudgetCache();
    const monthRun = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => reserve(`m${i}`, 1)));
    expect(monthRun.filter((r) => r.status === 'fulfilled')).toHaveLength(2); // 3 already used
    expect((await counter('month'))!.committedMicros).toBe(5_000_000);

    await M.OrgBudget.updateOne({ institutionId: 'instA' }, { monthlyCapUsd: 100, perUserDailyCapUsd: 6 });
    B.forgetAiBudgetCache();
    const users = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => reserve(`u${i}`, 1)));
    expect(users.filter((r) => r.status === 'fulfilled')).toHaveLength(1); // u1 had 5
    // Another user of the same school has their own allowance.
    expect((await Promise.allSettled([reserve('other', 1, { userId: 'u2' })]))[0].status).toBe('fulfilled');
    // Refused attempts leave no consumption behind.
    expect((await counter('u1'))!.committedMicros).toBe(6_000_000);
  });

  it('replaying an attempt key reserves and settles only once', async () => {
    await enforce();
    const t1 = await reserve('same', 2);
    const t2 = await reserve('same', 2);
    expect(t2.state).toBe('reserved');
    expect((await counter('day'))!.committedMicros).toBe(2_000_000);
    await B.settleAiBudget(t1, 0.5);
    await B.settleAiBudget(t2, 0.5);
    const day = (await counter('day'))!;
    expect(day).toMatchObject({ committedMicros: 500_000, settledMicros: 500_000 });
  });

  it('a refused reservation never calls the provider and the error carries no internal cost', async () => {
    await enforce({ dailyCapUsd: 0.000001 });
    const err = await inCtx(() => ask()).catch((e) => e);
    expect(err).toMatchObject({ code: 'AI_BUDGET_EXCEEDED', statusCode: 429 });
    expect(err.message).not.toMatch(/\$|\d/);
    expect(ai.create).not.toHaveBeenCalled();
    expect(await mongoose.connection.collection('usage_ledger').countDocuments()).toBe(0);
  });

  it('a known-priced success settles to its actual cost; a failure keeps the reservation as unknown exposure', async () => {
    await enforce();
    ai.create.mockResolvedValueOnce(reply());
    await inCtx(() => ask());
    const [r] = await M.BudgetReservation.find().lean();
    expect(r).toMatchObject({ status: 'settled', kind: 'standard', actualMicros: 6000 }); // 1000*4/M + 100*20/M
    expect(r.amountMicros).toBeGreaterThan(6000);
    expect((await counter('day'))).toMatchObject({ committedMicros: 6000, settledMicros: 6000, unknownMicros: 0 });

    ai.create.mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }));
    await expect(inCtx(() => ask())).rejects.toThrow('bad request');
    const failed = (await M.BudgetReservation.find({ status: 'settled', actualMicros: null }).lean())[0];
    expect(failed).toBeDefined();
    const day = (await counter('day'))!;
    expect(day.committedMicros).toBe(6000 + failed.amountMicros);
    expect(day.unknownMicros).toBe(failed.amountMicros);
  });

  it('each billable retry attempt reserves and settles on its own', async () => {
    await enforce();
    ai.create.mockRejectedValueOnce(Object.assign(new Error('overloaded'), { status: 529 })).mockResolvedValueOnce(reply());
    await inCtx(() => ask());
    const rows = await M.BudgetReservation.find().sort({ createdAt: 1, _id: 1 }).lean();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r._id.split(':').pop()).sort()).toEqual(['1', '2']);
    const byAttempt = Object.fromEntries(rows.map((r) => [r._id.split(':').pop(), r]));
    expect(byAttempt['1']).toMatchObject({ status: 'settled', actualMicros: null }); // failed attempt: unknown, kept
    expect(byAttempt['2']).toMatchObject({ status: 'settled', actualMicros: 6000 });
  });

  it('stale reservations are expired once and kept as unknown exposure', async () => {
    await enforce();
    const t = await reserve('stale', 1, { ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await B.sweepStaleReservations()).toEqual({ stale: 1, expired: 1 });
    expect(await B.sweepStaleReservations()).toEqual({ stale: 0, expired: 0 });
    expect((await counter('day'))).toMatchObject({ committedMicros: 1_000_000, unknownMicros: 1_000_000 });
    await B.settleAiBudget(t, 0.1); // a late settle changes nothing
    expect((await counter('day'))!.committedMicros).toBe(1_000_000);
  });
});

describe('P0d unknown-priced operations', () => {
  it('without a configured ceiling they are refused before the provider is called', async () => {
    await enforce();
    const call = vi.fn(async () => ({ token: 't' }));
    const err = await inCtx(() => GW.meteredCall({ feature: 'stt', provider: 'elevenlabs', modelName: 'scribe' }, call)).catch((e) => e);
    expect(err).toMatchObject({ code: 'AI_BUDGET_POLICY_MISSING' });
    expect(call).not.toHaveBeenCalled();
    // The real STT path too.
    const { createTranscriptionToken } = await import('../src/services/elevenlabsVoice');
    await expect(inCtx(() => createTranscriptionToken())).rejects.toMatchObject({ code: 'AI_BUDGET_POLICY_MISSING' });
    expect(ai.sttToken).not.toHaveBeenCalled();
  });

  it('with a ceiling they reserve it and keep it all (never settled as free)', async () => {
    await enforce({ maxReservationUsdPerCall: { 'elevenlabs:stt': 0.25 } });
    ai.sttToken.mockResolvedValue({ token: 'tok' });
    const { createTranscriptionToken } = await import('../src/services/elevenlabsVoice');
    await inCtx(() => createTranscriptionToken({ sessionId: 'av-1' }));
    const [r] = await M.BudgetReservation.find().lean();
    expect(r).toMatchObject({ amountMicros: 250_000, status: 'settled', actualMicros: null });
    expect((await counter('day'))).toMatchObject({ committedMicros: 250_000, settledMicros: 0, unknownMicros: 250_000 });
  });

  it('a tutor call carrying a PDF has no defensible bound and needs a ceiling', async () => {
    await enforce();
    const { upperBoundUsd, textTokenBound } = await import('../src/services/priceCatalog');
    expect(upperBoundUsd('anthropic', 'claude-mystery', { inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(upperBoundUsd('anthropic', 'claude-haiku-5-5', { inputTokens: 1000, outputTokens: 100, anyModel: true })).toBeCloseTo((1000 * 5 + 100 * 20) / 1e6);
    expect(textTokenBound('abc')).toBe(Buffer.byteLength('["abc"]') + 1024);
    const err = await inCtx(() => GW.meteredMessage({ feature: 'tutor_chat', modelName: 'claude-opus-5-5' }, async () => reply())).catch((e) => e);
    expect(err).toMatchObject({ code: 'AI_BUDGET_POLICY_MISSING' });
  });
});

describe('P0d alerts', () => {
  it('fire once each at 50, 80 and 100 percent', async () => {
    await enforce({ dailyCapUsd: 10, monthlyCapUsd: 1000, perUserDailyCapUsd: 1000 });
    const warn = vi.spyOn(logger, 'warn');
    const error = vi.spyOn(logger, 'error');
    for (const [i, usd] of [5, 1, 2, 0.5, 1.5].entries()) await reserve(`a${i}`, usd);
    await reserve('a9', 1).catch(() => undefined); // refused: no new alert
    const day = (c: unknown[]) => (c[1] as { window: string }).window === 'day';
    const alerts = [...warn.mock.calls, ...error.mock.calls].filter((c) => c[0] === 'ai_budget_alert' && day(c)).map((c) => (c[1] as { threshold: number }).threshold);
    expect(alerts.sort((a, b) => a - b)).toEqual([50, 80, 100]);
    expect(error.mock.calls.some((c) => c[0] === 'ai_budget_alert' && (c[1] as { threshold: number }).threshold === 100)).toBe(true);
    expect(JSON.stringify(warn.mock.calls.filter((c) => c[0] === 'ai_budget_alert'))).not.toMatch(/Usd|Micros|student text/);
    expect((await counter('day'))!.alerts.sort()).toEqual(['100', '50', '80']);
  });
});

describe('P0d kill switches', () => {
  it('a school pause blocks non-grading AI (even without caps) and not other schools', async () => {
    await M.OrgBudget.create({ institutionId: 'instA', aiPaused: true });
    ai.create.mockResolvedValue(reply());
    await expect(inCtx(() => ask())).rejects.toMatchObject({ code: 'AI_PAUSED', statusCode: 503 });
    expect(ai.create).not.toHaveBeenCalled();
    await inCtx(() => ask(), { ...CTX, institutionId: 'instB' });
    expect(ai.create).toHaveBeenCalledTimes(1);
  });

  it('the global pause blocks non-grading AI everywhere; grading continues', async () => {
    await M.AiControl.create({ _id: 'global', aiPaused: true });
    ai.create.mockResolvedValue(reply('{"correct":true,"scoreExplanation":"ok","feedback":"ok","flags":[]}'));
    await expect(inCtx(() => ask(), { ...CTX, institutionId: 'instB' })).rejects.toMatchObject({ code: 'AI_PAUSED' });
    const { evaluateShortAnswer } = await import('../src/services/gradingProposals');
    const p = await evaluateShortAnswer({ attempt: { id: 'att1', institutionId: 'instA', assignmentId: 'asg' } as never, question: { id: 'q', type: 'short-answer', text: 'Half of 4?', correctAnswer: '2', points: 1 } as never, answer: 'two', run: 1 });
    expect(p.status).toBe('proposed');
  });

  it('AI_PAUSED in the environment needs no database', async () => {
    const env = await import('../src/config/env');
    process.env.AI_PAUSED = 'true';
    env.resetConfigForTests();
    try {
      await expect(inCtx(() => ask(), { ...CTX, institutionId: 'instB' })).rejects.toMatchObject({ code: 'AI_PAUSED' });
    } finally {
      delete process.env.AI_PAUSED;
      env.resetConfigForTests();
    }
  });
});

describe('P0d grading autonomy', () => {
  const grade = (id: string) =>
    import('../src/services/gradingProposals').then(({ evaluateShortAnswer }) =>
      evaluateShortAnswer({ attempt: { id, institutionId: 'instA', assignmentId: 'asg' } as never, question: { id: 'q', type: 'short-answer', text: 'Half of 4?', correctAnswer: '2', points: 1 } as never, answer: 'two', run: 1 }),
    );
  beforeEach(() => ai.create.mockResolvedValue(reply('{"correct":true,"scoreExplanation":"ok","feedback":"ok","flags":[]}')));

  it('at the ordinary cap grading uses its allowance, with an alert', async () => {
    await enforce({ dailyCapUsd: 0.000001, gradingAllowanceUsd: 5 });
    const warn = vi.spyOn(logger, 'warn');
    expect((await grade('att1')).status).toBe('proposed');
    const [r] = await M.BudgetReservation.find().lean();
    expect(r.kind).toBe('grading_allowance');
    expect(warn).toHaveBeenCalledWith('ai_budget_grading_allowance_used', expect.objectContaining({ institutionId: 'instA' }));
    expect((await counter('grading'))!.settledMicros).toBeGreaterThan(0);
  });

  it('with both exhausted grading still runs as an observable emergency overrun', async () => {
    await enforce({ dailyCapUsd: 0.000001, gradingAllowanceUsd: 0.000001 });
    const error = vi.spyOn(logger, 'error');
    expect((await grade('att2')).status).toBe('proposed');
    const [r] = await M.BudgetReservation.find().lean();
    expect(r.kind).toBe('grading_emergency');
    expect(error).toHaveBeenCalledWith('ai_budget_grading_emergency', expect.objectContaining({ severity: 'critical' }));
    expect((await counter('emergency'))!.settledMicros).toBeGreaterThan(0);
  });

  it('a budget store failure fails closed for pilot calls and never blocks grading', async () => {
    await enforce();
    await reserve('warm', 0.01); // the school's config is now known to this process
    vi.spyOn(M.BudgetCounter, 'updateOne').mockRejectedValue(new Error('store down'));
    const error = vi.spyOn(logger, 'error');
    await expect(inCtx(() => ask())).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
    expect(ai.create).not.toHaveBeenCalled();
    expect((await grade('att3')).status).toBe('proposed');
    expect(error).toHaveBeenCalledWith('ai_budget_store_failed', expect.objectContaining({ policy: 'grading_proceeds', severity: 'critical' }));
  });

  it('a config read failure with settings older than the staleness limit fails closed (never silently unenforced)', async () => {
    await enforce({ dailyCapUsd: 0.000001 });
    B.forgetAiBudgetCache();
    await reserve('k0', 0.000001).catch(() => undefined); // load config
    vi.spyOn(M.OrgBudget, 'find').mockImplementation(() => { throw new Error('store down'); });
    // Cache is still fresh here; expire it to force a read.
    vi.useFakeTimers({ now: Date.now() + 60_000, toFake: ['Date'] });
    try {
      await expect(inCtx(() => ask())).rejects.toMatchObject({ code: 'AI_BUDGET_UNAVAILABLE' });
      expect(ai.create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('P0d rate limits', () => {
  const mini = async (limiters: express.RequestHandler[]) => {
    const a = express();
    a.use((req, _res, next) => {
      (req as any).user = { id: String(req.headers['x-user']), institutionId: String(req.headers['x-inst']), role: 'student' };
      next();
    });
    a.get('/t', ...limiters, (_req, res) => res.json({ ok: true }));
    return a;
  };

  it('the tutor limit is per user within a school; other users and schools are unaffected', async () => {
    const { tutorUserLimiter } = await import('../src/middleware/aiRateLimits');
    const a = await mini([tutorUserLimiter(2)]);
    const hit = (user: string, inst: string) => request(a).get('/t').set('x-user', user).set('x-inst', inst);
    expect((await hit('u1', 'instA')).status).toBe(200);
    expect((await hit('u1', 'instA')).status).toBe(200);
    const limited = await hit('u1', 'instA');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect((await hit('u2', 'instA')).status).toBe(200);
    expect((await hit('u1', 'instB')).status).toBe(200); // same id in another school: separate
  });

  it('the school limit is shared within a school and isolated across schools', async () => {
    const { tutorInstitutionLimiter } = await import('../src/middleware/aiRateLimits');
    const a = await mini([tutorInstitutionLimiter(3)]);
    const hit = (user: string, inst: string) => request(a).get('/t').set('x-user', user).set('x-inst', inst);
    for (const u of ['u1', 'u2', 'u3']) expect((await hit(u, 'instA')).status).toBe(200);
    expect((await hit('u4', 'instA')).status).toBe(429);
    expect((await hit('u9', 'instB')).status).toBe(200);
  });

  it('the gateway limit per school skips grading and logs store failures instead of silently passing', async () => {
    const R = await import('../src/services/aiRateLimit');
    const { MongoRateLimitStore } = await import('../src/services/mongoRateLimitStore');
    for (let i = 0; i < R.AI_ATTEMPTS_PER_INSTITUTION_PER_MINUTE; i++) await R.checkInstitutionAiRate('instA', 'lesson_plan');
    await expect(R.checkInstitutionAiRate('instA', 'lesson_plan')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(R.checkInstitutionAiRate('instA', 'ai_grading')).resolves.toBeUndefined();
    await expect(R.checkInstitutionAiRate('instB', 'lesson_plan')).resolves.toBeUndefined();
    const error = vi.spyOn(logger, 'error');
    vi.spyOn(MongoRateLimitStore.prototype, 'increment').mockRejectedValue(new Error('down'));
    await expect(R.checkInstitutionAiRate('instB', 'lesson_plan')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('ai_rate_limit_store_failed', expect.objectContaining({ policy: 'allow' }));
  });
});

describe('P0d admin routes and tenant isolation', () => {
  const token = async (role: string, institutionId?: string) => {
    const email = `${role}-${Math.random()}@t.test`;
    const user = await User.create({ email, password: 'x', role, name: email, status: 'active', institutionId });
    return `Bearer ${signAccessToken({ id: user._id.toString(), email, role: role as never, institutionId })}`;
  };

  it('only ENARA admins can read or change budgets and pauses', async () => {
    const routes: [string, string, object?][] = [['get', '/api/ai-controls/budgets/instA'], ['put', '/api/ai-controls/budgets/instA', { aiPaused: true }], ['put', '/api/ai-controls/budgets/instA/pause', { paused: true }], ['put', '/api/ai-controls/pause', { paused: true }], ['get', '/api/ai-controls/budgets/instA/status']];
    const admin = await token('admin', 'instA');
    const teacher = await token('teacher', 'instA');
    const otherAdmin = await token('admin', 'instB');
    for (const [method, url, body] of routes) {
      expect((await (request(app) as any)[method](url).send(body)).status).toBe(401);
      for (const auth of [admin, teacher, otherAdmin]) expect((await (request(app) as any)[method](url).set('Authorization', auth).send(body)).status).toBe(403);
    }
    expect(await M.OrgBudget.countDocuments()).toBe(0);
    expect(await M.AiControl.countDocuments()).toBe(0);
  });

  it('enabling enforcement requires explicit caps and ceilings for unknown-priced tools; changes are versioned', async () => {
    const auth = await token('enara-admin');
    const put = (body: object, inst = 'instA') => request(app).put(`/api/ai-controls/budgets/${inst}`).set('Authorization', auth).send(body);
    const bare = await put({ enforcementEnabled: true });
    expect(bare.status).toBe(400);
    expect(bare.body.error.code).toBe('BUDGET_CONFIG_INCOMPLETE');
    const caps = { dailyCapUsd: 10, monthlyCapUsd: 100, perUserDailyCapUsd: 2, gradingAllowanceUsd: 5 };
    const noCeiling = await put({ enforcementEnabled: true, ...caps, intendedTools: ['anthropic:tutor_chat', 'anam:avatar_session'] });
    expect(noCeiling.status).toBe(400);
    expect(noCeiling.body.error.message).toContain('maxReservationUsdPerCall.anam:avatar_session');
    const ok = await put({ enforcementEnabled: true, ...caps, intendedTools: ['anthropic:tutor_chat', 'anam:avatar_session'], maxReservationUsdPerCall: { 'anam:avatar_session': 3 } });
    expect(ok.status).toBe(200);
    expect(ok.body.budget).toMatchObject({ enforcementEnabled: true, version: 1, institutionId: 'instA' });
    const second = await put({ dailyCapUsd: 20 });
    expect(second.body.budget.version).toBe(2);
    expect(second.body.budget.history.map((h: { changes: object }) => h.changes)).toEqual([expect.objectContaining({ enforcementEnabled: true }), { dailyCapUsd: 20 }]);
    expect((await put({ bogus: 1 })).status).toBe(400);
    expect((await put({ dailyCapUsd: -1 })).status).toBe(400);
    expect((await put({ aiPaused: true }, 'nope')).status).toBe(404);
    // Another school is untouched.
    expect(await M.OrgBudget.countDocuments({ institutionId: 'instB' })).toBe(0);
  });

  it('pauses through the routes take effect for that school only, and globally', async () => {
    const auth = await token('enara-admin');
    ai.create.mockResolvedValue(reply());
    await request(app).put('/api/ai-controls/budgets/instA/pause').set('Authorization', auth).send({ paused: true }).expect(200);
    await expect(inCtx(() => ask())).rejects.toMatchObject({ code: 'AI_PAUSED' });
    await inCtx(() => ask(), { ...CTX, institutionId: 'instB' });
    await request(app).put('/api/ai-controls/pause').set('Authorization', auth).send({ paused: true }).expect(200);
    await expect(inCtx(() => ask(), { ...CTX, institutionId: 'instB' })).rejects.toMatchObject({ code: 'AI_PAUSED' });
    await request(app).put('/api/ai-controls/pause').set('Authorization', auth).send({ paused: false }).expect(200);
    await inCtx(() => ask(), { ...CTX, institutionId: 'instB' });
    const control = await M.AiControl.findById('global').lean();
    expect(control).toMatchObject({ aiPaused: false, version: 2 });
    expect(control!.history).toHaveLength(2);
  });

  it('a budget refusal reaches the client as a stable code without internal cost', async () => {
    const { errorHandler } = await import('../src/middleware/errorHandler');
    const a = express();
    a.get('/x', (_req, _res, next) => next(new B.AiBudgetError('AI_BUDGET_EXCEEDED')));
    a.use(errorHandler as express.ErrorRequestHandler);
    const res = await request(a).get('/x');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('AI_BUDGET_EXCEEDED');
    expect(JSON.stringify(res.body)).not.toMatch(/usd|micros|\$\d/i);
  });
});
