import { randomBytes } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Deploy health check (src/maintenance/mockLms.ts, healthCheck.ts,
// docs/lms/CONTINUOUS_DELIVERY.md): the built-in mock LMS exists only behind
// the maintenance guards; setup registers it for the fake school LT-SCHOOL-A
// (idempotent); run does the whole LTI round trip over real HTTP against the
// app's own public URL (here a local server: LMS_TOOL_BASE_URL points at it)
// and returns IDs and codes only.

const OPERATOR_TOKEN = 'o'.repeat(40);
const CI_TOKEN = 'c'.repeat(48);
const TEST_URI = 'mongodb+srv://u:p@enara-lms-test.abc123.mongodb.net/enara_staging_alpha';
const REAL_URI = 'mongodb+srv://u:p@enara-production.abc123.mongodb.net/enara_staging_alpha';
const KEK = randomBytes(32).toString('base64');
const CI = `Bearer ${CI_TOKEN}`;

let mongo: MongoMemoryServer;
let server: http.Server;
let base: string;
let app: import('express').Express | undefined;
let resetConfig: () => void;
const ON: Record<string, string> = {};

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  resetConfig();
}
async function freshApp() {
  app = (await import('../src/app')).createApp();
  return app;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h', JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform',
    INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '',
    TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ANTHROPIC_API_KEY', 'APP_URL', 'LMS_DRAIN_TRIGGERS', 'MAINTENANCE_TOKEN']) delete process.env[k];
  resetConfig = (await import('../src/config/env')).resetConfigForTests;
  await mongoose.connect(mongo.getUri());
  // The app's public URL: a real local server, so the health run's own fetch() calls reach it.
  server = http.createServer((req, res) => (app ? app(req, res) : res.writeHead(503).end()));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(ON, {
    MONGODB_URI: TEST_URI, MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: OPERATOR_TOKEN, MAINTENANCE_CI_TOKEN: CI_TOKEN,
    LMS_LTI_ENABLED: 'true', LMS_GRADE_PASSBACK_ENABLED: 'true', LMS_ROSTER_SYNC_ENABLED: 'true', LMS_TOOL_BASE_URL: base, LMS_KEK: KEK,
  });
  setEnv(ON);
  const M = await import('../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  await (await import('../src/models/ClassEnrollment')).ClassEnrollment.createIndexes();
  await (await import('../src/models/User')).User.createIndexes();
  await (await import('../src/models/AssessmentAttempt')).AssessmentAttempt.createIndexes();
  const { resetPlatformKeySetsForTests } = await import('../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  await freshApp();
}, 180_000);

afterAll(async () => {
  setEnv({ MAINTENANCE_ENDPOINTS_ENABLED: undefined, MAINTENANCE_TOKEN: undefined, MAINTENANCE_CI_TOKEN: undefined, LMS_LTI_ENABLED: undefined, LMS_GRADE_PASSBACK_ENABLED: undefined, LMS_ROSTER_SYNC_ENABLED: undefined, LMS_TOOL_BASE_URL: undefined, LMS_KEK: undefined });
  await new Promise<void>((r) => server.close(() => r()));
  await mongoose.disconnect();
  await mongo.stop();
});

const noPii = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/Health Student|Health Teacher|@lms-test\.example|Bearer|eyJ/);

describe('guards: the mock LMS and the health check exist only behind the maintenance guards', () => {
  it('switch off, or another cluster: every mock-lms and health-check route is 404', async () => {
    for (const vars of [{ ...ON, MAINTENANCE_ENDPOINTS_ENABLED: undefined }, { ...ON, MONGODB_URI: REAL_URI }, { ...ON, MAINTENANCE_TOKEN: undefined, MAINTENANCE_CI_TOKEN: 'short' }]) {
      setEnv(vars);
      const a = await freshApp();
      expect((await request(a).get('/api/maintenance/mock-lms/jwks')).status).toBe(404);
      expect((await request(a).post('/api/maintenance/mock-lms/token').type('form').send({ grant_type: 'client_credentials' })).status).toBe(404);
      expect((await request(a).get('/api/maintenance/mock-lms/auth').set('Authorization', CI)).status).toBe(404);
      expect((await request(a).post('/api/maintenance/health-check/setup').set('Authorization', CI)).status).toBe(404);
      expect((await request(a).post('/api/maintenance/health-check/run').set('Authorization', CI)).status).toBe(404);
    }
    setEnv(ON);
    await freshApp();
  });

  it('health-check routes and the mock sign-in need a maintenance token; the protocol endpoints have their own checks', async () => {
    const a = app!;
    expect((await request(a).post('/api/maintenance/health-check/setup')).status).toBe(401);
    expect((await request(a).post('/api/maintenance/health-check/run').set('Authorization', `Bearer ${'x'.repeat(48)}`)).status).toBe(401);
    expect((await request(a).get('/api/maintenance/mock-lms/auth').query({ login_hint: 'health-student-1' })).status).toBe(401);
    // Token endpoint: no assertion -> 400; an assertion not signed by ENARA's key -> 401.
    expect((await request(a).post('/api/maintenance/mock-lms/token').type('form').send({ grant_type: 'client_credentials' })).status).toBe(400);
    const { loadJose } = await import('../src/integrations/lms/core/jose');
    const { SignJWT, generateKeyPair } = await loadJose();
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'nope' }).setIssuer('health-check-mock-lms').setSubject('health-check-mock-lms')
      .setAudience(`${base}/api/maintenance/mock-lms/token`).setIssuedAt().setExpirationTime('5m').setJti('j1').sign(privateKey);
    const t = await request(a).post('/api/maintenance/mock-lms/token').type('form')
      .send({ grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: forged, scope: 'https://purl.imsglobal.org/spec/lti-ags/scope/score' });
    expect(t.status).toBe(401);
    // Services without (or with a made-up) access token.
    expect((await request(a).post('/api/maintenance/mock-lms/lineitems/health-1/lineitem/scores').send({})).status).toBe(401);
    expect((await request(a).get('/api/maintenance/mock-lms/memberships/health-course-1').set('Authorization', 'Bearer made-up')).status).toBe(401);
  });
});

describe('setup', () => {
  it('needs the fake school (run the seed first)', async () => {
    const r = await request(app!).post('/api/maintenance/health-check/setup').set('Authorization', CI);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('school_missing_run_seed_first');
  });

  it('run before setup: fails at setup_present, nothing else runs', async () => {
    const r = await request(app!).post('/api/maintenance/health-check/run').set('Authorization', CI);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
    expect(r.body.steps).toEqual([expect.objectContaining({ name: 'setup_present', ok: false, code: 'not_set_up' })]);
  });

  it('registers the mock LMS for LT-SCHOOL-A, idempotently; the key pair is made once, private key encrypted', async () => {
    const { seedLmsTest } = await import('../src/maintenance/lmsTestSeed');
    await seedLmsTest('FakeTestPass-2026!');
    const first = await request(app!).post('/api/maintenance/health-check/setup').set('Authorization', CI);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ ok: true, name: 'Mock LMS (health check)', institutionId: 'LT-SCHOOL-A', assessmentId: 'LT-AS-HEALTH-CHECK', created: { platform: true, deployment: true, assessment: true } });
    // The operator's token works as well.
    const again = await request(app!).post('/api/maintenance/health-check/setup').set('Authorization', `Bearer ${OPERATOR_TOKEN}`);
    expect(again.body).toMatchObject({ ok: true, platformId: first.body.platformId, deploymentId: first.body.deploymentId, created: { platform: false, deployment: false, assessment: false } });

    const M = await import('../src/integrations/lms/models');
    const p = await M.LmsPlatform.findOne({ id: first.body.platformId }).lean();
    expect(p).toMatchObject({ institutionId: 'LT-SCHOOL-A', status: 'active', issuer: `${base}/api/maintenance/mock-lms`, clientId: 'health-check-mock-lms', keysetUrl: `${base}/api/maintenance/mock-lms/jwks` });
    expect(await M.LmsPlatform.countDocuments({ clientId: 'health-check-mock-lms' })).toBe(1);
    expect(await M.LmsDeployment.countDocuments({ platformId: p!.id, status: 'active' })).toBe(1);
    const { Assessment } = await import('../src/models/Assessment');
    expect((await Assessment.findOne({ id: 'LT-AS-HEALTH-CHECK' }).lean())).toMatchObject({ institutionId: 'LT-SCHOOL-A', lifecycle: 'published' });

    const keys = await mongoose.connection.collection('lms_mock_lms_keys').find({}).toArray();
    expect(keys).toHaveLength(1);
    expect(String(keys[0].privateKeyEnc).startsWith('lk1.')).toBe(true);
    expect(String(keys[0].privateKeyEnc)).not.toContain('PRIVATE KEY');
    const jwks = await request(app!).get('/api/maintenance/mock-lms/jwks');
    expect(jwks.body.keys).toHaveLength(1);
    expect(jwks.body.keys[0]).not.toHaveProperty('d');
  }, 60_000);

  it('the mock sign-in checks the tool\'s login parameters', async () => {
    const q = { scope: 'openid', response_type: 'id_token', client_id: 'health-check-mock-lms', redirect_uri: `${base}/lti/launch`, login_hint: 'health-student-1', state: 's', nonce: 'n' };
    const ok = await request(app!).get('/api/maintenance/mock-lms/auth').query(q).set('Authorization', CI).set('Accept', 'application/json');
    expect(ok.status).toBe(200);
    expect(typeof ok.body.id_token).toBe('string');
    const form = await request(app!).get('/api/maintenance/mock-lms/auth').query(q).set('Authorization', CI);
    expect(form.text).toContain(`action="${base}/lti/launch"`);
    expect(form.headers['content-security-policy']).toMatch(/script-src 'nonce-/);
    for (const [k, v, code] of [['client_id', 'other', 'invalid_client'], ['redirect_uri', 'https://evil.example/lti/launch', 'invalid_redirect_uri'], ['login_hint', 'someone', 'unknown_login_hint']]) {
      const r = await request(app!).get('/api/maintenance/mock-lms/auth').query({ ...q, [k]: v }).set('Authorization', CI).set('Accept', 'application/json');
      expect(r.status).toBe(400);
      expect(r.body.error).toBe(code);
    }
  });
});

describe('run: the whole round trip over HTTP', () => {
  const EXPECTED = [
    'setup_present', 'ready', 'tool_jwks', 'mock_jwks',
    'teacher_lti_login', 'teacher_mock_auth', 'teacher_lti_launch', 'teacher_launch_exchange',
    'lti_login', 'mock_auth', 'lti_launch', 'launch_exchange', 'lms_records', 'nrps_roster',
    'keep_assignment_open', 'submit_attempt', 'grade_send', 'grade_received',
  ];

  it('passes: login, launch, exchange, roster, submit, grade sent and received by the mock (IDs only)', async () => {
    const r = await request(app!).post('/api/maintenance/health-check/run').set('Authorization', CI);
    expect(r.status).toBe(200);
    expect(r.body.ok, JSON.stringify(r.body.steps)).toBe(true);
    expect(r.body.steps.map((s: { name: string }) => s.name)).toEqual(EXPECTED);
    expect(r.body.steps.every((s: { ok: boolean; ms: number }) => s.ok && typeof s.ms === 'number')).toBe(true);
    expect(Object.keys(r.body.ids).sort()).toEqual(['assignmentId', 'attemptId', 'contextId', 'jobId', 'lmsUserId', 'platformId', 'resourceLinkId']);
    noPii(r.body);

    const scores = await mongoose.connection.collection('lms_mock_scores').find({ userId: 'health-student-1' }).toArray();
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ lineItem: 'health-1', scoreGiven: 1, scoreMaximum: 1, gradingProgress: 'FullyGraded', activityProgress: 'Completed' });
    const M = await import('../src/integrations/lms/models');
    expect(await M.LmsGradeSyncJob.findOne({ id: r.body.ids.jobId }).lean()).toMatchObject({ status: 'sent', institutionId: 'LT-SCHOOL-A' });
    // Everything it made belongs to the fake school.
    for (const model of [M.LmsContext, M.LmsUser, M.LmsResourceLink]) {
      const rows = await (model as typeof M.LmsContext).find({ platformId: r.body.ids.platformId }).lean().catch(() => []);
      expect(rows.every((x: { institutionId: string }) => x.institutionId === 'LT-SCHOOL-A')).toBe(true);
    }
    const ctx = await M.LmsContext.findOne({ id: r.body.ids.contextId }).lean();
    expect(ctx).toMatchObject({ externalContextId: 'health-course-1', institutionId: 'LT-SCHOOL-A' });
  }, 60_000);

  it('runs again and again: one new attempt each time until none are left, then the last result is re-sent; nothing is deleted', async () => {
    const { AssessmentAttempt } = await import('../src/models/AssessmentAttempt');
    const { Assignment } = await import('../src/models/Assignment');
    const otherBefore = await AssessmentAttempt.countDocuments({ assessmentId: { $ne: 'LT-AS-HEALTH-CHECK' } });
    const r2 = await request(app!).post('/api/maintenance/health-check/run').set('Authorization', CI);
    expect(r2.body.ok, JSON.stringify(r2.body.steps)).toBe(true);
    expect(await AssessmentAttempt.countDocuments({ assessmentId: 'LT-AS-HEALTH-CHECK', status: 'submitted' })).toBe(2);
    // No attempts left (at most 10 in real life; 2 here to keep the test short).
    await Assignment.updateOne({ id: r2.body.ids.assignmentId }, { $set: { maxAttempts: 2 } });
    for (let i = 0; i < 2; i++) {
      const r = await request(app!).post('/api/maintenance/health-check/run').set('Authorization', CI);
      expect(r.body.ok, JSON.stringify(r.body.steps)).toBe(true);
      expect(r.body.steps.find((s: { name: string }) => s.name === 'submit_attempt')).toMatchObject({ ok: true, code: 'attempts_used_resend_last' });
      expect(r.body.ids.attemptId).toBeUndefined();
    }
    expect(await AssessmentAttempt.countDocuments({ assessmentId: 'LT-AS-HEALTH-CHECK' })).toBe(2);
    expect(await AssessmentAttempt.countDocuments({ assessmentId: { $ne: 'LT-AS-HEALTH-CHECK' } })).toBe(otherBefore);
    expect(await mongoose.connection.collection('lms_mock_scores').countDocuments({ userId: 'health-student-1' })).toBe(4);
    // The fake assignment's due date is kept ahead.
    await Assignment.updateOne({ id: r2.body.ids.assignmentId }, { $set: { dueAt: new Date(Date.now() + 86_400_000) } });
    expect((await request(app!).post('/api/maintenance/health-check/run').set('Authorization', CI)).body.ok).toBe(true);
    expect((await Assignment.findOne({ id: r2.body.ids.assignmentId }).lean())!.dueAt.getTime()).toBeGreaterThan(Date.now() + 300 * 86_400_000);
  }, 90_000);

  it('a back-off left on its own job by an earlier cold-start timeout does not block the next run', async () => {
    const M = await import('../src/integrations/lms/models');
    const job = await M.LmsGradeSyncJob.findOne({ institutionId: 'LT-SCHOOL-A', reason: 'health_check' }).sort({ updatedAt: -1 }).lean();
    expect(job).toBeTruthy();
    // As after the 25 Nov 2026 rollbacks: the re-sent job timed out once and waits a minute before its next try.
    await M.LmsGradeSyncJob.updateOne({ id: job!.id }, { $set: { status: 'pending', attempts: 1, lastError: 'timeout', nextAttemptAt: new Date(Date.now() + 10 * 60_000) } });
    const r = await request(app!).post('/api/maintenance/health-check/run').set('Authorization', CI);
    expect(r.body.ok, JSON.stringify(r.body.steps)).toBe(true);
    expect(await M.LmsGradeSyncJob.findOne({ id: job!.id }).lean()).toMatchObject({ status: 'sent' });
  }, 60_000);

  it('reports the failing step with a short code, and skips the rest (grade passback off)', async () => {
    setEnv({ ...ON, LMS_GRADE_PASSBACK_ENABLED: 'false' });
    await freshApp();
    const r = await request(app!).post('/api/maintenance/health-check/run').set('Authorization', CI);
    expect(r.body.ok).toBe(false);
    const last = r.body.steps.at(-1);
    expect(last).toMatchObject({ name: 'grade_send', ok: false, code: 'grade_passback_off' });
    expect(r.body.steps.map((s: { name: string }) => s.name)).not.toContain('grade_received');
    setEnv(ON);
    await freshApp();
  }, 60_000);

  it('the base URL and fetch are injectable: a site that does not answer fails at "ready"', async () => {
    const { runHealthCheck } = await import('../src/maintenance/healthCheck');
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const r = await runHealthCheck({ authorization: CI, fetchImpl: down });
    expect(r.ok).toBe(false);
    expect(r.steps.at(-1)).toMatchObject({ name: 'ready', ok: false, code: 'network' });
    // A launch refused by the tool reports its reference code.
    const refuse = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('/lti/launch')) return new Response('<p>Reference: <code>invalid_signature</code></p>', { status: 401 });
      return fetch(url, init);
    }) as typeof fetch;
    const r2 = await runHealthCheck({ authorization: CI, fetchImpl: refuse, baseUrl: base });
    expect(r2.steps.at(-1)).toMatchObject({ name: 'teacher_lti_launch', ok: false, code: 'http_401_invalid_signature' });
  }, 60_000);

  it('status names the serving deployment (for the pipeline\'s deploy and rollback checks)', async () => {
    setEnv({ ...ON, VERCEL_URL: 'enara-lms-test-abc.vercel.app' });
    const s = await request(await freshApp()).get('/api/maintenance/status').set('Authorization', CI);
    expect(s.body.deployment).toEqual({ url: 'enara-lms-test-abc.vercel.app', id: null });
    setEnv({ ...ON, VERCEL_URL: undefined });
    await freshApp();
  });
});
