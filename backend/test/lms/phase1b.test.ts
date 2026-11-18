import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE } from './mockPlatform';

// LMS Phase 1b part A (docs/lms/PHASE_1B_NOTES.md): the one-URL "Connect
// Moodle" link and LTI Dynamic Registration 1.0 against a local mock Moodle
// (openid-configuration + registration endpoint), owner decisions R1–R4, and
// one Moodle site with ENARA connections for two schools.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_DEEP_LINKING_ENABLED', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL'];
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, LMS_DEEP_LINKING_ENABLED: 'true' };
const AGS = 'https://purl.imsglobal.org/spec/lti-ags/scope/';
const NRPS = 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
const TOOL_CONF = 'https://purl.imsglobal.org/spec/lti-tool-configuration';

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'dr-school-a';
const B = 'dr-school-b';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let moodle: MockPlatform; // one Moodle site (both schools use it in the two-school tests)
const auth: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL']) delete process.env[k];
  setLmsEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
  await ClassEnrollment.createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { Institution } = await import('../../src/models/Institution');
  await Institution.create([{ id: A, name: 'School A' }, { id: B, name: 'Test School B' }]);
  const { signAccessToken } = await import('../../src/auth/jwt');
  const mk = async (key: string, role: string, institutionId?: string) => {
    const u = await User.create({ email: `${key}@staff.test`, password: 'x', role, name: key, institutionId });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
  };
  await mk('enara', 'enara-admin');
  await mk('adminA', 'admin', A);
  await mk('adminB', 'admin', B);
  await mk('teacherA', 'teacher', A);
  moodle = (await new MockPlatform('', '').start()).adoptServiceBaseAsIssuer();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
}, 120_000);

afterAll(async () => {
  setLmsEnv({});
  await moodle?.stop();
  await mongoose.disconnect();
  await mongo.stop();
});

/** Every test starts with no connection from the mock Moodle. */
async function clean() {
  moodle.resetRegistration();
  moodle.resetAgs();
  for (const model of [M.LmsPlatform, M.LmsDeployment, M.LmsRegistrationCode, M.LmsAuditLog, M.LmsUser, M.LmsContext, M.LmsEnrollment, M.LmsResourceLink, M.LmsAccessToken, M.LmsOidcState, M.LmsLaunchToken]) {
    await (model as unknown as { deleteMany(f: object): Promise<unknown> }).deleteMany({});
  }
}

beforeEach(async () => {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => undefined);
  await clean();
});

// ------------------------------------------------------------ helpers

async function createLink(who: string, institutionId?: string) {
  const r = await request(app).post('/api/lms/registration-links').set('Authorization', auth[who]).send(institutionId ? { institutionId } : {});
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const url = new URL(r.body.url as string);
  expect(url.origin).toBe(TOOL);
  return { body: r.body, path: url.pathname, code: url.pathname.split('/').pop()! };
}

function regToken() {
  return `regtok-${randomBytes(24).toString('base64url')}`;
}

/** What Moodle does after the admin pastes the URL: open it with its openid configuration and a registration token. */
async function register(path: string, opts: { token?: string | null; configUrl?: string } = {}) {
  const token = opts.token === null ? undefined : opts.token ?? regToken();
  if (token) moodle.expectedRegistrationToken = token;
  const query: Record<string, string> = { openid_configuration: opts.configUrl ?? moodle.openidConfigurationUrl };
  if (token) query.registration_token = token;
  const r = await request(app).get(path).query(query);
  return { r, token };
}

async function expectRegistrationError(r: request.Response, code: string, status: number) {
  expect(r.status, r.text).toBe(status);
  expect(r.headers['content-type']).toMatch(/html/);
  expect(r.text).toContain(`<code>${code}</code>`);
  expect(r.text).toContain('org.imsglobal.lti.close');
  expect(r.headers['x-frame-options']).toBeUndefined();
  const row = await M.LmsAuditLog.findOne({ event: 'registration.failed', code }).sort({ createdAt: -1 }).lean();
  expect(row?.outcome).toBe('fail');
}

/** Launch from the mock Moodle with the given connection's client_id and deployment, as `sub`. */
async function launchAs(clientId: string, deploymentId: string, sub: string, roles = [ROLE.learner], context = 'course-101') {
  moodle.clientId = clientId;
  moodle.deploymentId = deploymentId;
  const lr = await request(app).post('/lti/login').type('form').send({ iss: moodle.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: clientId, lti_deployment_id: deploymentId });
  expect(lr.status, lr.text).toBe(302);
  const loc = new URL(lr.headers.location);
  const cookie = String(([] as string[]).concat(lr.headers['set-cookie'] ?? [])[0]).split(';')[0];
  const idToken = await moodle.sign(moodle.claims(loc.searchParams.get('nonce')!, TOOL, { sub, 'lti:roles': roles, 'lti:context': { id: context, title: 'Enara Course' } }));
  const r = await request(app).post('/lti/launch').type('form').set('Cookie', cookie).send({ id_token: idToken, state: loc.searchParams.get('state')! });
  expect(r.status, r.text).toBe(303);
  const frag = new URLSearchParams(new URL(r.headers.location).hash.slice(1));
  const ex = await request(app).post('/api/lms/launch/exchange').send({ token: frag.get('lt') });
  expect(ex.status, JSON.stringify(ex.body)).toBe(200);
  const body = ex.body as { token: string; user: { id: string; email: string; studentId?: string; institutionId: string; role: string }; launch: { classId: string } };
  const { User } = await import('../../src/models/User');
  body.user.id = (await User.findOne({ email: body.user.email }).select('_id').lean())!._id.toString();
  return body;
}

// --------------------------------------------------------------- tests

describe('registration links (admin API)', () => {
  it('an ENARA admin makes a link for any school (URL shown once, only a hash stored); school admins for their own school', async () => {
    const { body, code } = await createLink('enara', A);
    expect(body).toMatchObject({ expiresInDays: 7, connectionWillBe: 'active', link: { institutionId: A, status: 'unused', createdByRole: 'enara-admin' } });
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await M.LmsRegistrationCode.findOne({ id: body.link.id }).lean();
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row!.expiresAt.getTime() - Date.now()).toBeGreaterThan(7 * 86400_000 - 60_000);

    const own = await createLink('adminA');
    expect(own.body).toMatchObject({ connectionWillBe: 'pending', link: { institutionId: A, createdByRole: 'admin' } });

    // List: never the code or its hash. School admins see their school only.
    const list = await request(app).get('/api/lms/registration-links').set('Authorization', auth.adminA);
    expect(list.status).toBe(200);
    expect(list.body.links).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toMatch(new RegExp(`${code}|${own.code}|codeHash`));
    const listB = await request(app).get('/api/lms/registration-links').set('Authorization', auth.adminB);
    expect(listB.body.links).toHaveLength(0);
  });

  it('refuses: other roles, another school, no school for an ENARA admin; revoke is own-school only and once', async () => {
    expect((await request(app).post('/api/lms/registration-links').set('Authorization', auth.teacherA).send({})).status).toBe(403);
    expect((await request(app).post('/api/lms/registration-links').send({})).status).toBe(401);
    expect((await request(app).post('/api/lms/registration-links').set('Authorization', auth.adminA).send({ institutionId: B })).status).toBe(403);
    expect((await request(app).post('/api/lms/registration-links').set('Authorization', auth.enara).send({})).status).toBe(400);
    expect((await request(app).post('/api/lms/registration-links').set('Authorization', auth.enara).send({ institutionId: 'nope' })).status).toBe(404);

    const { body, path } = await createLink('adminA');
    expect((await request(app).post(`/api/lms/registration-links/${body.link.id}/revoke`).set('Authorization', auth.adminB)).status).toBe(404);
    const rv = await request(app).post(`/api/lms/registration-links/${body.link.id}/revoke`).set('Authorization', auth.adminA);
    expect(rv.status).toBe(200);
    expect(rv.body.link.status).toBe('revoked');
    expect((await request(app).post(`/api/lms/registration-links/${body.link.id}/revoke`).set('Authorization', auth.enara)).status).toBe(409);
    // A revoked link no longer registers.
    const { r } = await register(path);
    await expectRegistrationError(r, 'registration_code_invalid', 404);
    expect(moodle.openidHits).toBe(0);
  });
});

describe('Dynamic Registration: happy paths (R1)', () => {
  it("an ENARA admin's link: Moodle registers ENARA, the connection and deployment are active, the code is used up", async () => {
    const { body, path } = await createLink('enara', A);
    const { r, token } = await register(path);
    expect(r.status, r.text).toBe(200);
    expect(r.text).toContain('ENARA is registered.');
    expect(r.text).toContain('Click <b>Activate</b> in Moodle.');
    expect(r.text).toContain('تم تسجيل ENARA');
    // The spec's close message, to window.opener || window.parent, target '*', run by nonce.
    expect(r.text).toContain('window.opener||window.parent');
    expect(r.text).toContain("postMessage({subject:'org.imsglobal.lti.close'},'*')");
    const csp = String(r.headers['content-security-policy']);
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(r.text).toContain(`<script nonce="${nonce}">`);
    expect(csp).toMatch(/frame-ancestors 'self' https:/);
    expect(r.headers['x-frame-options']).toBeUndefined();
    expect(r.headers['cache-control']).toBe('no-store');

    const p = await M.LmsPlatform.findOne({ institutionId: A }).lean();
    expect(p).toMatchObject({
      provider: 'lti13', vendor: 'moodle', issuer: moodle.issuer, clientId: 'dyn-client-1', registeredVia: 'dynamic', status: 'active',
      authLoginUrl: moodle.authLoginUrl, authTokenUrl: moodle.tokenUrl, keysetUrl: moodle.keysetUrl, autoCreateDeployments: false,
    });
    expect(p!.createdBy).toBeTruthy();
    expect(p!.scopes.sort()).toEqual([`${AGS}lineitem`, `${AGS}lineitem.readonly`, `${AGS}result.readonly`, `${AGS}score`, NRPS].sort());
    const d = await M.LmsDeployment.findOne({ platformId: p!.id }).lean();
    expect(d).toMatchObject({ deploymentId: '1', status: 'active', institutionId: A });
    const code = await M.LmsRegistrationCode.findOne({ id: body.link.id }).lean();
    expect(code).toMatchObject({ status: 'used', platformId: p!.id });
    expect(code!.reservedUntil).toBeUndefined();
    const audit = await M.LmsAuditLog.findOne({ event: 'platform.registered', platformId: p!.id }).lean();
    expect(audit?.refIds).toMatchObject({ via: 'dynamic', status: 'active', registrationId: body.link.id, deepLinking: true });
    expect(await M.LmsAuditLog.countDocuments({ event: 'registration.duplicate_lms' })).toBe(0);

    // The registration request carried Moodle's token as a Bearer token.
    expect(moodle.registrationRequests).toHaveLength(1);
    expect(moodle.registrationRequests[0].auth).toBe(`Bearer ${token}`);
    expect(moodle.registrationRequests[0].contentType).toMatch(/application\/json/);

    // And the connection works: a launch with the client_id and deployment Moodle gave.
    const s = await launchAs('dyn-client-1', '1', 'moodle-user-7');
    expect(s.user.institutionId).toBe(A);
    expect(s.user.role).toBe('student');

    // The same link again (a retry, or someone else): used.
    const again = await register(path);
    await expectRegistrationError(again.r, 'registration_code_used', 410);
    expect(moodle.registrationRequests).toHaveLength(1);
  });

  it("a school admin's link: the connection and deployment are pending until an ENARA admin approves (setting on)", async () => {
    const { path } = await createLink('adminA');
    const { r } = await register(path);
    expect(r.status, r.text).toBe(200);
    expect(r.text).toContain('ENARA will approve this connection');
    const p = await M.LmsPlatform.findOne({ institutionId: A }).lean();
    expect(p).toMatchObject({ status: 'pending', registeredVia: 'dynamic' });
    expect(p!.approvedBy).toBeUndefined();
    expect((await M.LmsDeployment.findOne({ platformId: p!.id }).lean())!.status).toBe('pending');
    const lr = await request(app).post('/lti/login').type('form').send({ iss: moodle.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: p!.clientId });
    expect(lr.text).toContain('<code>platform_pending</code>');
    const ok = await request(app).post(`/api/lms/platforms/${p!.id}/approve`).set('Authorization', auth.enara);
    expect(ok.status).toBe(200);
    expect(ok.body.platform).toMatchObject({ status: 'active', registeredVia: 'dynamic', deployments: [{ deploymentId: '1', status: 'active' }] });
    await launchAs(p!.clientId, '1', 'moodle-user-8');
  });

  it('with the approval setting off, a school admin link connects active', async () => {
    setLmsEnv({ ...ON, LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL: 'false' });
    try {
      const { body, path } = await createLink('adminA');
      expect(body.connectionWillBe).toBe('active');
      expect((await register(path)).r.status).toBe(200);
      expect((await M.LmsPlatform.findOne({ institutionId: A }).lean())!.status).toBe('active');
    } finally {
      setLmsEnv(ON);
    }
  });
});

describe('the registration request ENARA sends (owner note 2)', () => {
  it('asks for AGS + NRPS, name and email, Deep Linking, with ENARA URLs and keys', async () => {
    const { path } = await createLink('enara', A);
    expect((await register(path)).r.status).toBe(200);
    const body = moodle.registrationRequests[0].body;
    expect(body).toMatchObject({
      application_type: 'web',
      response_types: ['id_token'],
      initiate_login_uri: `${TOOL}/lti/login`,
      redirect_uris: [`${TOOL}/lti/launch`],
      client_name: 'ENARA',
      logo_uri: `${TOOL}/favicon.svg`,
      jwks_uri: `${TOOL}/.well-known/jwks.json`,
      token_endpoint_auth_method: 'private_key_jwt',
    });
    expect((body.grant_types as string[]).sort()).toEqual(['client_credentials', 'implicit']);
    expect(String(body.scope).split(' ').sort()).toEqual([`${AGS}lineitem`, `${AGS}lineitem.readonly`, `${AGS}result.readonly`, `${AGS}score`, NRPS].sort());
    const conf = body[TOOL_CONF] as Record<string, unknown>;
    expect(conf).toMatchObject({ domain: 'tool.enara.test', target_link_uri: `${TOOL}/lti/launch` });
    expect(conf.claims).toEqual(['iss', 'sub', 'name', 'given_name', 'family_name', 'email']);
    expect(conf.messages).toEqual([
      { type: 'LtiResourceLinkRequest', target_link_uri: `${TOOL}/lti/launch` },
      { type: 'LtiDeepLinkingRequest', target_link_uri: `${TOOL}/lti/launch`, label: 'ENARA', placements: ['ContentArea'] },
    ]);
    expect(typeof conf.description).toBe('string');
  });

  it('without the Deep Linking flag, no LtiDeepLinkingRequest message is offered', async () => {
    setLmsEnv({ ...ON, LMS_DEEP_LINKING_ENABLED: undefined });
    try {
      const { path } = await createLink('enara', A);
      expect((await register(path)).r.status).toBe(200);
      const conf = moodle.registrationRequests[0].body[TOOL_CONF] as { messages: { type: string }[] };
      expect(conf.messages.map((m) => m.type)).toEqual(['LtiResourceLinkRequest']);
    } finally {
      setLmsEnv(ON);
    }
  });
});

describe('Dynamic Registration: refusals (the code stays usable unless it was used)', () => {
  it('unknown, malformed and expired codes', async () => {
    await expectRegistrationError((await register(`/lti/register/${randomBytes(32).toString('base64url')}`)).r, 'registration_code_invalid', 404);
    await expectRegistrationError((await register('/lti/register/short')).r, 'registration_code_invalid', 404);
    const { body, path } = await createLink('enara', A);
    await M.LmsRegistrationCode.updateOne({ id: body.link.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expectRegistrationError((await register(path)).r, 'registration_code_expired', 410);
    expect(moodle.openidHits).toBe(0);
    const list = await request(app).get('/api/lms/registration-links').set('Authorization', auth.enara).query({ institutionId: A });
    expect(list.body.links[0].status).toBe('expired');
  });

  it('an http (not https) openid configuration URL is refused before any call', async () => {
    const { body, path } = await createLink('enara', A);
    await expectRegistrationError((await register(path, { configUrl: 'http://moodle.example.com/mod/lti/openid-configuration.php' })).r, 'registration_insecure_url', 400);
    await expectRegistrationError((await register(path, { configUrl: 'ftp://moodle.example.com/x' })).r, 'registration_insecure_url', 400);
    await expectRegistrationError((await register(path, { configUrl: 'not a url' })).r, 'registration_openid_invalid', 502);
    expect((await M.LmsRegistrationCode.findOne({ id: body.link.id }).lean())!.status).toBe('unused');
  });

  it('an issuer that does not match the openid configuration URL (spec §3.5.1) is refused; nothing is registered', async () => {
    const { body, path } = await createLink('enara', A);
    moodle.openidOverrides = { issuer: 'https://moodle.other-school.example' };
    await expectRegistrationError((await register(path)).r, 'registration_issuer_mismatch', 400);
    moodle.openidOverrides = { issuer: `${moodle.issuer}/moodle` }; // a path the configuration URL is not under
    await expectRegistrationError((await register(path)).r, 'registration_issuer_mismatch', 400);
    expect(moodle.registrationRequests).toHaveLength(0);
    expect(await M.LmsPlatform.countDocuments({})).toBe(0);
    const row = await M.LmsRegistrationCode.findOne({ id: body.link.id }).lean();
    expect(row).toMatchObject({ status: 'unused', failedAttempts: 2, lastErrorCode: 'registration_issuer_mismatch' });
    expect(row!.reservedUntil).toBeUndefined();
    // The link still works afterwards.
    moodle.openidOverrides = {};
    expect((await register(path)).r.status).toBe(200);
  });

  it('issuer and configuration URL rules (unit)', async () => {
    const { issuerMatchesConfigUrl, isPrivateHost } = await import('../../src/integrations/lms/adapters/lti13/dynamicRegistration');
    expect(issuerMatchesConfigUrl('https://m.example', 'https://m.example/mod/lti/openid-configuration.php')).toBe(true);
    expect(issuerMatchesConfigUrl('https://m.example/', 'https://m.example/.well-known/openid-configuration?x=1')).toBe(true);
    expect(issuerMatchesConfigUrl('https://m.example/moodle', 'https://m.example/moodle/mod/lti/openid-configuration.php')).toBe(true);
    expect(issuerMatchesConfigUrl('https://m.example/moodle', 'https://m.example/moodle2/mod/lti/openid-configuration.php')).toBe(false);
    expect(issuerMatchesConfigUrl('https://m.example', 'https://evil.example/mod/lti/openid-configuration.php')).toBe(false);
    expect(issuerMatchesConfigUrl('https://m.example:8443', 'https://m.example/x')).toBe(false);
    expect(issuerMatchesConfigUrl('https://m.example?x=1', 'https://m.example/x')).toBe(false);
    for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '[::1]', 'fd00::1', '::ffff:10.0.0.1']) expect(isPrivateHost(h), h).toBe(true);
    for (const h of ['moodle.example.com', '8.8.8.8', '172.32.0.1']) expect(isPrivateHost(h), h).toBe(false);
  });

  it('a missing registration_token (Moodle always sends one) or openid_configuration is refused; nothing is posted', async () => {
    const { body, path } = await createLink('enara', A);
    await expectRegistrationError((await register(path, { token: null })).r, 'registration_missing_parameters', 400);
    expect(moodle.registrationRequests).toHaveLength(0);
    const noConf = await request(app).get(path).query({ registration_token: 'x' });
    await expectRegistrationError(noConf, 'registration_missing_parameters', 400);
    expect((await M.LmsRegistrationCode.findOne({ id: body.link.id }).lean())!.status).toBe('unused');
  });

  it('the LMS refuses the registration (4xx): registration_failed, nothing stored, the code is NOT used and works on retry', async () => {
    const { body, path } = await createLink('enara', A);
    moodle.registrationStatuses = [400];
    await expectRegistrationError((await register(path)).r, 'registration_failed', 502);
    const fail = await M.LmsAuditLog.findOne({ event: 'registration.failed', code: 'registration_failed' }).lean();
    expect(fail?.refIds).toMatchObject({ httpStatus: 400, registrationId: body.link.id });
    expect(await M.LmsPlatform.countDocuments({})).toBe(0);
    expect(await M.LmsDeployment.countDocuments({})).toBe(0);
    expect((await M.LmsRegistrationCode.findOne({ id: body.link.id }).lean())).toMatchObject({ status: 'unused', failedAttempts: 1 });
    // A wrong token: Moodle answers 401.
    moodle.expectedRegistrationToken = 'something-else';
    const wrong = await request(app).get(path).query({ openid_configuration: moodle.openidConfigurationUrl, registration_token: 'not-the-one' });
    await expectRegistrationError(wrong, 'registration_failed', 502);
    // Retry from Moodle with the same link: it works.
    expect((await register(path)).r.status).toBe(200);
    expect((await M.LmsRegistrationCode.findOne({ id: body.link.id }).lean())!.status).toBe('used');
  });

  it("Moodle's \"Update\" choice (a reg-update token) is refused before anything is sent", async () => {
    const { path } = await createLink('enara', A);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const updateToken = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ sub: '3', scope: 'reg-update', iat: 1, exp: 9999999999 })}.c2ln`;
    await expectRegistrationError((await register(path, { token: updateToken })).r, 'registration_update_not_supported', 400);
    expect(moodle.registrationRequests).toHaveLength(0);
    // A new-registration token (scope 'reg') goes through.
    const newToken = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ sub: 'abc', scope: 'reg', iat: 1, exp: 9999999999 })}.c2ln`;
    expect((await register(path, { token: newToken })).r.status).toBe(200);
  });

  it('two browsers opening the same link at once make one connection', async () => {
    const { path } = await createLink('enara', A);
    const token = regToken();
    moodle.expectedRegistrationToken = token;
    const q = { openid_configuration: moodle.openidConfigurationUrl, registration_token: token };
    const [r1, r2] = await Promise.all([request(app).get(path).query(q), request(app).get(path).query(q)]);
    expect([r1.status, r2.status].filter((s) => s === 200)).toHaveLength(1);
    const loser = r1.status === 200 ? r2 : r1;
    expect(loser.text).toMatch(/registration_in_progress|registration_code_used/);
    expect(await M.LmsPlatform.countDocuments({})).toBe(1);
  });

  it('a client_id this LMS already gave ENARA for another school is never moved (registration_conflict; code not used)', async () => {
    const a = await createLink('enara', A);
    expect((await register(a.path)).r.status).toBe(200);
    const b = await createLink('enara', B);
    moodle.nextClientId = 'dyn-client-1';
    await expectRegistrationError((await register(b.path)).r, 'registration_conflict', 409);
    expect(await M.LmsPlatform.countDocuments({ institutionId: B })).toBe(0);
    expect((await M.LmsPlatform.findOne({ clientId: 'dyn-client-1' }).lean())!.institutionId).toBe(A);
    expect((await M.LmsRegistrationCode.findOne({ id: b.body.link.id }).lean())!.status).toBe('unused');
  });

  it('flags off: /lti/register is the normal 404 and nothing is called', async () => {
    const { path } = await createLink('enara', A);
    setLmsEnv({});
    try {
      const r = await request(app).get(path).query({ openid_configuration: moodle.openidConfigurationUrl, registration_token: 'x' });
      expect(r.status).toBe(404);
      expect(moodle.openidHits).toBe(0);
    } finally {
      setLmsEnv(ON);
    }
  });
});

describe('R3 and R4: the same Moodle registered again', () => {
  it('R3: a second registration of the same Moodle for the same school keeps both and warns "already connected"', async () => {
    const first = await createLink('enara', A);
    expect((await register(first.path)).r.status).toBe(200);
    const second = await createLink('enara', A);
    const { r } = await register(second.path);
    expect(r.status).toBe(200);
    expect(r.text).toContain('already connected');
    const platforms = await M.LmsPlatform.find({ institutionId: A, issuer: moodle.issuer }).sort({ createdAt: 1 }).lean();
    expect(platforms.map((p) => p.clientId)).toEqual(['dyn-client-1', 'dyn-client-2']);
    expect(platforms.every((p) => p.status === 'active')).toBe(true);
    const warn = await M.LmsAuditLog.findOne({ event: 'registration.duplicate_lms' }).lean();
    expect(warn).toMatchObject({ outcome: 'warn', code: 'already_connected', institutionId: A, platformId: platforms[1].id });
    expect(warn!.refIds).toMatchObject({ newPlatformId: platforms[1].id, existingPlatformIds: platforms[0].id, registrationId: second.body.link.id });
    // R4: same school, so still plain "ENARA".
    expect(moodle.registrationRequests.map((x) => x.body.client_name)).toEqual(['ENARA', 'ENARA']);
    // Both work (Moodle sends client_id at login).
    await launchAs('dyn-client-1', '1', 'u-r3');
    await launchAs('dyn-client-2', '2', 'u-r3');
  });

  it('R4: when the Moodle already has ENARA for another school, the tool name carries the school name', async () => {
    expect((await register((await createLink('enara', A)).path)).r.status).toBe(200);
    expect((await register((await createLink('enara', B)).path)).r.status).toBe(200);
    expect(moodle.registrationRequests.map((x) => x.body.client_name)).toEqual(['ENARA', 'ENARA (Test School B)']);
    const { toolClientName } = await import('../../src/integrations/lms/adapters/lti13/dynamicRegistration');
    expect(toolClientName('<b>Evil</b>\nSchool', true)).toBe('ENARA (b Evil /b School)');
    expect(toolClientName(undefined, true)).toBe('ENARA');
  });
});

describe('no secret is stored or logged', () => {
  const spies: ReturnType<typeof vi.spyOn>[] = [];
  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore();
  });

  it('the registration token and the code never appear in the audit log, the database rows or the server log', async () => {
    const lines: string[] = [];
    for (const m of ['log', 'warn', 'error', 'info'] as const) spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' '))));
    const ok = await createLink('enara', A);
    const okRun = await register(ok.path);
    expect(okRun.r.status).toBe(200);
    const bad = await createLink('enara', A);
    moodle.registrationStatuses = [400];
    const badRun = await register(bad.path);
    expect(badRun.r.status).toBe(502);
    const missing = await register(bad.path, { token: null });
    expect(missing.r.status).toBe(400);

    const dump = JSON.stringify([
      await M.LmsAuditLog.find({}).lean(),
      await M.LmsRegistrationCode.find({}).lean(),
      await M.LmsPlatform.find({}).lean(),
      await M.LmsDeployment.find({}).lean(),
      lines,
    ]);
    for (const secret of [okRun.token!, badRun.token!, ok.code, bad.code]) expect(dump).not.toContain(secret);
    expect(okRun.r.text).not.toContain(okRun.token!);
    expect(badRun.r.text).not.toContain(badRun.token!);

    // The request log path and the logger redact the code and the token.
    const { logPath } = await import('../../src/middleware/requestContext');
    expect(logPath(`/lti/register/${ok.code}?openid_configuration=x&registration_token=${okRun.token}`)).toBe('/lti/register/[REDACTED]');
    const { redactSignedLinks } = await import('../../src/utils/logging');
    expect(redactSignedLinks(`https://x/y?openid_configuration=a&registration_token=${okRun.token}`)).not.toContain(okRun.token!);
  });
});

describe('one Moodle site, two schools (owner note 1)', () => {
  it('separate ENARA accounts for the same Moodle user, no cross-school data, both schools keep working; service tokens per connection', async () => {
    moodle.nextClientId = 'moodle-tool-a';
    moodle.nextDeploymentId = '11';
    expect((await register((await createLink('enara', A)).path)).r.status).toBe(200);
    moodle.nextClientId = 'moodle-tool-b';
    moodle.nextDeploymentId = '12';
    expect((await register((await createLink('enara', B)).path)).r.status).toBe(200);
    const pa = (await M.LmsPlatform.findOne({ institutionId: A }).lean())!;
    const pb = (await M.LmsPlatform.findOne({ institutionId: B }).lean())!;
    expect(pa.issuer).toBe(pb.issuer);

    // The same Moodle person (same sub), the same Moodle course id, from School A then School B.
    const sa = await launchAs('moodle-tool-a', '11', 'moodle-sub-42', [ROLE.learner], 'course-7');
    const sb = await launchAs('moodle-tool-b', '12', 'moodle-sub-42', [ROLE.learner], 'course-7');
    expect(sa.user.institutionId).toBe(A);
    expect(sb.user.institutionId).toBe(B);
    expect(sb.user.id).not.toBe(sa.user.id);
    // Reserved addresses are per LMS link, so they never collide or reuse School A's account.
    const { User } = await import('../../src/models/User');
    const [ua, ub] = await Promise.all([User.findById(sa.user.id).lean(), User.findById(sb.user.id).lean()]);
    expect(ua!.email).toMatch(/@lms\.enara\.test$/);
    expect(ub!.email).toMatch(/@lms\.enara\.test$/);
    expect(ub!.email).not.toBe(ua!.email);
    expect(ub!.studentId).not.toBe(ua!.studentId);
    const links = await M.LmsUser.find({ externalUserId: 'moodle-sub-42' }).lean();
    expect(links.map((l) => [l.platformId, l.institutionId, l.enaraUserId]).sort()).toEqual(
      [[pa.id, A, sa.user.id], [pb.id, B, sb.user.id]].sort(),
    );
    // Separate courses and classes; School B's student is enrolled only in School B's class.
    const contexts = await M.LmsContext.find({ externalContextId: 'course-7' }).lean();
    expect(contexts).toHaveLength(2);
    expect(new Set(contexts.map((c) => c.institutionId))).toEqual(new Set([A, B]));
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    const classB = await CourseInstance.findOne({ id: sb.launch.classId }).lean();
    expect(classB!.institutionId).toBe(B);
    const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
    const enrB = await ClassEnrollment.find({ studentId: ub!.studentId }).lean();
    expect(enrB.length).toBeGreaterThan(0);
    for (const e of enrB) {
      expect(e.institutionId).toBe(B);
      expect(e.targetId).not.toBe(sa.launch.classId);
    }
    expect(enrB.some((e) => e.scope === 'class' && e.targetId === sb.launch.classId)).toBe(true);
    expect(await ClassEnrollment.countDocuments({ studentId: ub!.studentId, institutionId: A })).toBe(0);
    // School B's session cannot open School A's class.
    const peek = await request(app).get(`/api/course-instances/${sa.launch.classId}`).set('Authorization', `Bearer ${sb.token}`);
    expect([401, 403, 404]).toContain(peek.status);

    // School A keeps working: the same person relaunches into the same School A account.
    const sa2 = await launchAs('moodle-tool-a', '11', 'moodle-sub-42', [ROLE.learner], 'course-7');
    expect(sa2.user.id).toBe(sa.user.id);
    const sb2 = await launchAs('moodle-tool-b', '12', 'moodle-sub-42', [ROLE.learner], 'course-7');
    expect(sb2.user.id).toBe(sb.user.id);

    // Grade and roster service tokens are per connection (client_id), cached per platform.
    const { serviceToken, tokenScopes } = await import('../../src/integrations/lms/adapters/lti13/ags');
    const ta = await serviceToken(pa as never, tokenScopes(undefined));
    const tb = await serviceToken(pb as never, tokenScopes(undefined));
    expect(ta).not.toBe(tb);
    const { decodeJwt } = await import('jose');
    expect(moodle.tokenRequests.map((t) => decodeJwt(t.client_assertion).iss)).toEqual(['moodle-tool-a', 'moodle-tool-b']);
    const cached = await M.LmsAccessToken.find({}).lean();
    expect(new Set(cached.map((c) => c.platformId))).toEqual(new Set([pa.id, pb.id]));
    expect(cached.find((c) => c.platformId === pb.id)!.institutionId).toBe(B);
  });

  it('login: Moodle sends client_id, so each school is found; without client_id two connections on one issuer are ambiguous', async () => {
    moodle.nextClientId = 'tool-a';
    expect((await register((await createLink('enara', A)).path)).r.status).toBe(200);
    moodle.nextClientId = 'tool-b';
    expect((await register((await createLink('enara', B)).path)).r.status).toBe(200);
    const base = { iss: moodle.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch` };
    const ra = await request(app).post('/lti/login').type('form').send({ ...base, client_id: 'tool-a' });
    const rb = await request(app).post('/lti/login').type('form').send({ ...base, client_id: 'tool-b' });
    expect(ra.status).toBe(302);
    expect(rb.status).toBe(302);
    expect(new URL(ra.headers.location).searchParams.get('client_id')).toBe('tool-a');
    expect(new URL(rb.headers.location).searchParams.get('client_id')).toBe('tool-b');
    const amb = await request(app).post('/lti/login').type('form').send(base);
    expect(amb.status).toBe(400);
    expect(amb.text).toContain('<code>ambiguous_platform</code>');
  });
});

describe('migration', () => {
  it('the Phase 1b migration creates lms_registration_codes indexes and can run twice', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const mig = MIGRATIONS.find((x) => x.id === '2026-11-23-lms-phase1b-registration')!;
    expect(mig).toBeTruthy();
    await mig.up();
    await mig.up();
    const idx = await mongoose.connection.db!.collection('lms_registration_codes').indexes();
    expect(idx.some((i) => i.key.codeHash === 1 && i.unique)).toBe(true);
    for (const model of M.LMS_PHASE1B_MODELS) expect((model.schema.path('institutionId') as { isRequired?: boolean }).isRequired).toBe(true);
  });
});
