import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P5: school-scoped usage, customer credits, budget view, savings center and
// scale simulator. Built from mocked ledger rows only; no provider calls.
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn() };
    beta = { messages: { create: vi.fn(), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let appendUsage: typeof import('../src/services/usageLedger').appendUsage;
let M: Record<string, mongoose.Model<any>>;

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
  ({ signAccessToken } = await import('../src/auth/jwt'));
  ({ appendUsage } = await import('../src/services/usageLedger'));
  M = {};
  for (const n of ['User', 'Institution', 'UsageLedger', 'OrgBudget']) M[n] = (await import(`../src/models/${n}`))[n];
  const c = await import('../src/models/CommercialPlan');
  M.CommercialPlan = c.CommercialPlan;
  M.CurrentToolSpend = c.CurrentToolSpend;
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
}, 60_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

type Who = { id: string; auth: string; get: (u: string) => request.Test; post: (u: string, b?: object) => request.Test; put: (u: string, b?: object) => request.Test; del: (u: string) => request.Test };
let n = 0;
async function who(role: string, institutionId?: string): Promise<Who> {
  n += 1;
  const email = `${role}${n}@x.test`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId });
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email, role: role as never, institutionId })}`;
  return {
    id: user._id.toString(), auth,
    get: (u) => request(app).get(u).set('Authorization', auth),
    post: (u, b = {}) => request(app).post(u).set('Authorization', auth).send(b),
    put: (u, b = {}) => request(app).put(u).set('Authorization', auth).send(b),
    del: (u) => request(app).delete(u).set('Authorization', auth),
  };
}

const SECRET_COST = 0.987654;
let key = 0;
const row = (over: Record<string, unknown>) =>
  appendUsage({ operationKey: `op-${++key}`, institutionId: 'instA', feature: 'educator_chat', provider: 'anthropic', modelName: 'claude-opus-5-5', status: 'ok', priceCatalogVersion: 'v1', costStatus: 'measured', costInternal: SECRET_COST, units: { inputTokens: 1000, outputTokens: 200 }, origin: 'live', ...over } as never);

let firstKey = '';
let WA: Who, WB: Who, T: Who, S: Who, AM: Who, EA: Who;
beforeEach(async () => {
  for (const m of Object.values(M)) await mongoose.connection.collection(m.collection.name).deleteMany({});
  await mongoose.connection.collection('rate_limits').deleteMany({});
  await M.Institution.create([{ id: 'instA', name: 'A' }, { id: 'instB', name: 'B' }]);
  WA = await who('admin', 'instA');
  WB = await who('admin', 'instB');
  T = await who('teacher', 'instA');
  S = await who('student', 'instA');
  AM = await who('academic_manager', 'instA');
  EA = await who('enara-admin');
  firstKey = (await row({ userId: T.id, requestId: 'req-1' })).row.operationKey;
  await row({ userId: T.id, status: 'error', costStatus: 'usage_unknown', costInternal: null, units: {} });
  await row({ userId: T.id, feature: 'speaking_exam_stt', provider: 'elevenlabs', modelName: 'scribe_v2', costStatus: 'unpriced', costInternal: null, units: { audioSeconds: 120 } });
  await row({ userId: T.id, feature: 'speaking_exam_stt', provider: 'elevenlabs', modelName: 'scribe_v2', costStatus: 'usage_unknown', costInternal: null, units: {} });
  await row({ userId: T.id, origin: 'demo_seed' });
  await row({ institutionId: 'instB', userId: WB.id });
  // A legacy row stored before origin existed: counts as live.
  await mongoose.connection.collection('usage_ledger').insertOne({ id: 'legacy-1', operationKey: 'legacy-1', institutionId: 'instA', feature: 'educator_chat', provider: 'anthropic', modelName: 'x', status: 'ok', priceCatalogVersion: 'v1', costStatus: 'measured', costInternal: SECRET_COST, units: {}, attempt: 1, currency: 'USD', createdAt: new Date() });
});

const plan = (over: Record<string, unknown> = {}) =>
  EA.put('/api/ai-controls/commercial/instA', {
    status: 'proposed', currency: 'EGP', basePrice: 600, includedCredits: 1000, overagePricePerCredit: 1,
    creditRates: { educator_chat: { unit: 'operation', credits: 2 }, speaking_exam_stt: { unit: 'minute', credits: 3 } }, maxCustomerMonthlyCredits: 5000, ...over,
  });
const noCost = (body: unknown) => {
  const text = JSON.stringify(body);
  expect(text).not.toContain(String(SECRET_COST));
  expect(text).not.toMatch(/costInternal|costUsd|internal_cost|dailyCapUsd|monthlyCapUsd/);
};

describe('access', () => {
  it('Workspace Admin only; teachers, students and academic managers are refused', async () => {
    for (const w of [T, S, AM]) {
      for (const u of ['/api/usage/report', '/api/usage/plan', '/api/usage/budget', '/api/usage/savings', '/api/usage/current-tools']) expect((await w.get(u)).status, u).toBe(403);
      expect((await w.post('/api/usage/simulate', { quantities: {} })).status).toBe(403);
      expect((await w.post('/api/usage/current-tools', { toolName: 'X', amount: 1, currency: 'EGP', period: 'monthly' })).status).toBe(403);
    }
    expect((await WA.get('/api/usage/report')).status).toBe(200);
  });

  it('the commercial price is set only by ENARA admins', async () => {
    expect((await WA.put('/api/ai-controls/commercial/instA', { status: 'proposed', currency: 'EGP', basePrice: 1, includedCredits: 1 })).status).toBe(403);
    expect((await plan({ currency: 'egp' })).status).toBe(400);
    expect((await plan({ creditRates: { educator_chat: { unit: 'parsec', credits: 1 } } })).status).toBe(400);
    const ok = await plan();
    expect(ok.status).toBe(200);
    expect(ok.body.plan.version).toBe(1);
    expect((await plan({ basePrice: 700 })).body.plan.history).toHaveLength(2);
  });
});

describe('usage report', () => {
  it('own school only, server-side scope; counts outcomes and unknowns; never internal cost', async () => {
    const r = await WA.get('/api/usage/report?groupBy=feature');
    expect(r.status).toBe(200);
    noCost(r.body);
    // Live default: 4 live rows + 1 legacy row; demo and other school excluded.
    expect(r.body.total).toMatchObject({ operations: 5, succeeded: 4, failed: 1, unpriced: 1, usageUnknown: 2 });
    expect(r.body.coverage.status).toBe('incomplete');
    expect(r.body.total.credits).toEqual({ status: 'not_configured', value: null });
    const chat = r.body.groups.items.find((g: any) => g.key === 'educator_chat');
    expect(chat).toMatchObject({ label: 'AI Chat', operations: 3 });
    const b = await WB.get('/api/usage/report');
    expect(b.body.total.operations).toBe(1);
    // A client-supplied institution is ignored.
    expect((await WB.get('/api/usage/report?institutionId=instA')).body.total.operations).toBe(1);
  });

  it('demo and all views are explicit; legacy rows without origin count as live', async () => {
    expect((await WA.get('/api/usage/report?origin=demo_seed')).body.total.operations).toBe(1);
    const all = await WA.get('/api/usage/report?origin=all');
    expect(all.body.total.operations).toBe(6);
    expect(all.body.originNote).toMatch(/All origins/);
  });

  it('bounded ranges and pages; grouping by user and day', async () => {
    expect((await WA.get('/api/usage/report?from=2026-01-01&to=2026-10-01')).status).toBe(400);
    expect((await WA.get('/api/usage/report?from=2026-10-10&to=2026-10-01')).status).toBe(400);
    expect((await WA.get('/api/usage/report?pageSize=1000')).body.groups.pageSize).toBe(100);
    const byUser = await WA.get('/api/usage/report?groupBy=user');
    expect(byUser.body.groups.items.find((g: any) => g.key === T.id).operations).toBe(4);
    const byDay = await WA.get('/api/usage/report?groupBy=day');
    expect(byDay.body.groups.items[0].key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('credits come only from the plan: partial when a unit is unknown, never zero for unknowns', async () => {
    await plan();
    const r = await WA.get('/api/usage/report?groupBy=feature');
    noCost(r.body);
    // chat: 2 successful ops x 2 credits (legacy + one); STT: 2 minutes x 3 = 6 and one unknown.
    expect(r.body.total.credits).toMatchObject({ status: 'partial', value: 10, unknownOperations: 1 });
    const stt = r.body.groups.items.find((g: any) => g.key === 'speaking_exam_stt');
    expect(stt.credits).toMatchObject({ status: 'partial', value: 6, unknownOperations: 1 });
    expect(stt.units.audioMinutes).toBe(2);
  });
});

describe('usage chips', () => {
  it('own request only; nothing invented when there is no metering', async () => {
    await plan();
    const mine = await T.get('/api/usage/me/requests/req-1');
    expect(mine.body).toMatchObject({ state: 'measured', operations: 1, credits: { status: 'measured', value: 2 } });
    noCost(mine.body);
    expect((await WA.get('/api/usage/me/requests/req-1')).body).toEqual({ state: 'none' });
    expect((await T.get('/api/usage/me/requests/unknown')).body).toEqual({ state: 'none' });
    const today = await T.get('/api/usage/me/today?features=speaking_exam_stt');
    expect(today.body).toMatchObject({ operations: 2, unpriced: 1, usageUnknown: 1, credits: { status: 'partial', value: 6, unknownOperations: 1 } });
    noCost(today.body);
  });

  it('the ledger stays append-only: a repeated write does not double count', async () => {
    const before = (await WA.get('/api/usage/report')).body.total.operations;
    const again = await appendUsage({ operationKey: firstKey, institutionId: 'instA', feature: 'educator_chat', provider: 'anthropic', modelName: 'claude-opus-5-5', status: 'ok', priceCatalogVersion: 'v1', costStatus: 'measured', costInternal: SECRET_COST, units: { inputTokens: 1000, outputTokens: 200 }, origin: 'live', userId: T.id, requestId: 'req-1' } as never);
    expect(again.created).toBe(false);
    expect((await WA.get('/api/usage/report')).body.total.operations).toBe(before);
    await expect(M.UsageLedger.updateOne({ operationKey: firstKey }, { $set: { status: 'error' } })).rejects.toThrow(/append-only/);
  });
});

describe('budget view (P0d)', () => {
  it('policy, pause and coarse bands only; school credit limits stay within the ENARA ceiling and are alerts', async () => {
    let r = await WA.get('/api/usage/budget');
    expect(r.body).toMatchObject({ policy: 'not_configured', aiPaused: false, windows: null, customerLimitsEnforced: false });
    await M.OrgBudget.create({ institutionId: 'instA', enforcementEnabled: true, aiPaused: true, dailyCapUsd: 10, monthlyCapUsd: 100, perUserDailyCapUsd: 5, gradingAllowanceUsd: 5, intendedTools: [] });
    await mongoose.connection.collection('budget_counters').insertOne({ _id: `instA:day:${new Date().toISOString().slice(0, 10)}`, institutionId: 'instA', committedMicros: 8_500_000, settledMicros: 0, unknownMicros: 0, alerts: [] } as never);
    r = await WA.get('/api/usage/budget');
    expect(r.body).toMatchObject({ policy: 'enforced', aiPaused: true, windows: { day: '80_100', month: 'below_50' } });
    expect(r.body.grading).toMatch(/never held for approval/);
    noCost(r.body);
    expect((await WA.put('/api/usage/budget/limits', { monthlyCredits: 100 })).body.error.code).toBe('NO_CREDIT_PLAN');
    await plan();
    expect((await WA.put('/api/usage/budget/limits', { monthlyCredits: 999999 })).status).toBe(400);
    expect((await WA.put('/api/usage/budget/limits', { monthlyCredits: 1.5 })).status).toBe(400);
    const ok = await WA.put('/api/usage/budget/limits', { monthlyCredits: 2000, dailyCredits: 100 });
    expect(ok.body).toMatchObject({ customerLimits: { monthlyCredits: 2000, dailyCredits: 100 }, enforced: false });
    const stored = await M.OrgBudget.findOne({ institutionId: 'instA' }).lean();
    // ENARA's own limits are untouched; the change is in the audit history.
    expect(stored).toMatchObject({ dailyCapUsd: 10, monthlyCapUsd: 100, enforcementEnabled: true });
    expect(stored.history.at(-1)).toMatchObject({ by: WA.id, changes: { customerLimits: { monthlyCredits: 2000 } } });
    expect((await WA.put('/api/usage/budget/limits', { dailyCapUsd: 99999 })).body.customerLimits).toEqual({});
    expect((await M.OrgBudget.findOne({ institutionId: 'instA' }).lean()).dailyCapUsd).toBe(10);
    expect((await T.put('/api/usage/budget/limits', { monthlyCredits: 1 })).status).toBe(403);
  });
});

describe('savings center and simulator', () => {
  const tool = (w: Who, over: Record<string, unknown> = {}) => w.post('/api/usage/current-tools', { toolName: 'ChatGPT Team', provider: 'OpenAI', seats: 10, amount: 1000, currency: 'EGP', period: 'monthly', ...over });

  it('Not enough data when either side is missing; no invented price', async () => {
    let r = await WA.get('/api/usage/savings');
    expect(r.body.result).toBe('Not enough data');
    expect(r.body.missing).toEqual(expect.arrayContaining(["the school's current AI-tool spend", 'an ENARA commercial price for this school']));
    await tool(WA);
    r = await WA.get('/api/usage/savings');
    expect(r.body.result).toBe('Not enough data');
    expect(r.body.missing).toContain('an ENARA commercial price for this school');
    expect((await WA.get('/api/usage/plan')).body.configured).toBe(false);
  });

  it('different currencies are not compared; no exchange rate is used', async () => {
    await plan();
    await tool(WA, { currency: 'USD' });
    const r = await WA.get('/api/usage/savings');
    expect(r.body.result).toBe('Not enough data');
    expect(r.body.missing.join(' ')).toMatch(/one currency.*no verified exchange rate/);
    expect(r.body.assumptions.exchangeRates).toBe('none used');
  });

  it('measured usage with unknown credit amounts is not comparable', async () => {
    await plan();
    await tool(WA);
    const r = await WA.get('/api/usage/savings');
    expect(r.body.result).toBe('Not enough data');
    expect(r.body.missing.join(' ')).toMatch(/credit amounts for every tool|credit rates for/);
  });

  it('comparable inputs: correct estimate with assumptions and sources; demo data does not inflate it', async () => {
    await M.UsageLedger.collection.deleteMany({}); // test-only reset of the mocked ledger
    await row({ userId: T.id });
    await row({ userId: T.id });
    for (let i = 0; i < 5; i++) await row({ userId: T.id, origin: 'demo_seed' });
    await plan({ includedCredits: 2, overagePricePerCredit: 10 });
    await tool(WA, { amount: 1000 });
    await tool(WA, { toolName: 'Grammarly', amount: 1200, period: 'annual' });
    await tool(WA, { toolName: 'Kept tool', amount: 5000, replacedByEnara: false });
    const r = await WA.get('/api/usage/savings');
    // Live credits: 2 ops x 2 = 4; price 600 + (4 - 2) x 10 = 620. Current: 1000 + 1200/12 = 1100.
    expect(r.body).toMatchObject({ result: 'estimate', currency: 'EGP', usageCredits: 4, enaraMonthlyPrice: 620, currentMonthlySpend: 1100, grossMonthlySavings: 480 });
    expect(r.body.label).toMatch(/Estimate/);
    expect(r.body.sources).toEqual({ currentSpend: 'user_entered', enaraPrice: 'enara_commercial_plan', usage: 'measured' });
    expect(r.body.assumptions.usageBasis).toMatch(/demo data excluded/);
    noCost(r.body);
  });

  it('current tools: validated, audited edits and soft removal, own school only', async () => {
    expect((await tool(WA, { currency: 'pounds' })).status).toBe(400);
    expect((await tool(WA, { amount: -1 })).status).toBe(400);
    expect((await tool(WA, { toolName: 'x'.repeat(200) })).status).toBe(400);
    const id = (await tool(WA)).body.item.id;
    expect((await WA.put(`/api/usage/current-tools/${id}`, { amount: 900 })).body.item).toMatchObject({ amount: 900, updatedBy: WA.id, source: 'user_entered' });
    expect((await WB.put(`/api/usage/current-tools/${id}`, { amount: 1 })).status).toBe(404);
    expect((await WB.del(`/api/usage/current-tools/${id}`)).status).toBe(404);
    expect((await WA.del(`/api/usage/current-tools/${id}`)).status).toBe(204);
    expect((await WA.get('/api/usage/current-tools')).body.items).toEqual([]);
    const stored = await M.CurrentToolSpend.findOne({ id }).lean();
    expect(stored.history.map((h: any) => h.action)).toEqual(['created', 'updated', 'removed']);
  });

  it('simulator: lists what is missing; projects from the plan only; never from provider cost', async () => {
    let r = await WA.post('/api/usage/simulate', { students: 300, staff: 20, quantities: { educator_chat: 500 } });
    expect(r.body.enaraPrice).toMatchObject({ result: 'Not enough data' });
    expect(r.body.projection).toBe(true);
    await plan({ seatPrice: 5, seatBasis: 'staff' });
    r = await WA.post('/api/usage/simulate', { students: 300, staff: 20, quantities: { educator_chat: 500, avatar_session: 100 } });
    expect(r.body.enaraPrice.result).toBe('Not enough data');
    expect(r.body.enaraPrice.missing.join(' ')).toMatch(/Avatar session/);
    r = await WA.post('/api/usage/simulate', { students: 300, staff: 20, quantities: { educator_chat: 500, speaking_exam_stt: 100 } });
    // 500 x 2 + 100 min x 3 = 1300 credits; 600 + 20 x 5 + 300 x 1 = 1000 EGP.
    expect(r.body.credits).toBe(1300);
    expect(r.body.enaraPrice).toEqual({ value: 1000, currency: 'EGP' });
    expect(r.body.assumptions).toMatchObject({ students: 300, staff: 20, includedCredits: 1000 });
    expect(r.body.savings.result).toBe('Not enough data'); // no current spend entered
    noCost(r.body);
    expect((await WA.post('/api/usage/simulate', { students: -1 })).status).toBe(400);
    expect((await WA.post('/api/usage/simulate', { quantities: { 'bad key': 1 } })).status).toBe(400);
  });
});

describe('UI source', () => {
  it('no fixed currency amounts or internal cost fields in the P5 UI', async () => {
    const fs = await import('fs');
    const path = await import('path');
    for (const f of ['pages/workspace/Usage.tsx', 'pages/workspace/SavingsCenter.tsx', 'components/UsageChip.tsx']) {
      const src = fs.readFileSync(path.join(__dirname, '../../frontend', f), 'utf8');
      expect(src, f).not.toMatch(/\$\s?\d|\d[\d,.]*\s?(EGP|USD|SAR|AED)\b|costInternal|costUsd/);
    }
  });
});
