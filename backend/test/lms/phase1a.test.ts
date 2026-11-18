import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SignJWT, UnsecuredJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE } from './mockPlatform';

// LMS Phase 1a (docs/lms/PHASE_1A_NOTES.md): LTI 1.3 OIDC login and launch
// against a local mock platform, every negative case of plan §4.1, the
// cookieless path, role mapping, context -> class + group, enrollment upsert,
// the one-time launch token, the manual "Add LMS" admin API with approval,
// seats and alerts, tenant isolation, and flags off = nothing changes.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL'];
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK };

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'lms-school-a';
const B = 'lms-school-b';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform; // school A's Moodle
let pB: MockPlatform; // school B's LMS
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
  await Institution.create([{ id: A, name: 'School A' }, { id: B, name: 'School B' }]);
  const { signAccessToken } = await import('../../src/auth/jwt');
  const mk = async (key: string, role: string, institutionId?: string) => {
    const u = await User.create({ email: `${key}@staff.test`, password: 'x', role, name: key, institutionId });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
  };
  await mk('enara', 'enara-admin');
  await mk('adminA', 'admin', A);
  await mk('adminB', 'admin', B);
  await mk('teacherA', 'teacher', A);
  await mk('managerA', 'academic_manager', A);
  pA = await new MockPlatform('https://moodle.school-a.test', 'client-a').start();
  pB = await new MockPlatform('https://lms.school-b.test', 'client-b').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  // Both platforms registered and approved by an ENARA admin (the API is tested below).
  for (const [p, inst] of [[pA, A], [pB, B]] as const) {
    const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({
      institutionId: inst, vendor: inst === A ? 'moodle' : 'generic', issuer: p.issuer, clientId: p.clientId,
      authLoginUrl: p.authLoginUrl, keysetUrl: p.keysetUrl, authTokenUrl: `${p.issuer}/mod/lti/token.php`, deploymentIds: [p.deploymentId],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.platform.status).toBe('active');
  }
}, 120_000);

afterAll(async () => {
  setLmsEnv({});
  await pA?.stop();
  await pB?.stop();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => undefined);
});

// ------------------------------------------------------------ helpers

interface Login {
  state: string;
  nonce: string;
  cookie: string;
  location: URL;
}

async function login(p: MockPlatform, extra: Record<string, string> = {}): Promise<Login> {
  const r = await request(app)
    .post('/lti/login')
    .type('form')
    .send({ iss: p.issuer, login_hint: 'hint-1', target_link_uri: `${TOOL}/lti/launch`, client_id: p.clientId, lti_deployment_id: p.deploymentId, lti_message_hint: 'mh', ...extra });
  expect(r.status, r.text).toBe(302);
  const location = new URL(r.headers.location);
  const setCookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []);
  const cookie = setCookie[0].split(';')[0];
  return { state: location.searchParams.get('state')!, nonce: location.searchParams.get('nonce')!, cookie, location };
}

async function postLaunch(form: Record<string, string>, cookie?: string) {
  const r = request(app).post('/lti/launch').type('form');
  if (cookie) r.set('Cookie', cookie);
  return r.send(form);
}

/** Full happy-path launch; returns the redirect and the exchanged session. */
async function launch(p: MockPlatform, over: Record<string, unknown> = {}, opts: { cookieless?: boolean } = {}) {
  const l = await login(p);
  const idToken = await p.sign(p.claims(l.nonce, TOOL, over));
  const r = await postLaunch({ id_token: idToken, state: l.state }, opts.cookieless ? undefined : l.cookie);
  return { r, l, idToken };
}

async function launchAndExchange(p: MockPlatform, over: Record<string, unknown> = {}, opts: { cookieless?: boolean } = {}) {
  const { r } = await launch(p, over, opts);
  expect(r.status, r.text).toBe(303);
  const frag = new URLSearchParams(new URL(r.headers.location).hash.slice(1));
  const ex = await request(app).post('/api/lms/launch/exchange').send({ token: frag.get('lt') });
  expect(ex.status, JSON.stringify(ex.body)).toBe(200);
  return { r, frag, ex, token: frag.get('lt')! };
}

async function expectLtiError(res: request.Response, code: string, status?: number) {
  expect(res.text, `expected ${code}`).toContain(`<code>${code}</code>`);
  if (status) expect(res.status).toBe(status);
  const row = await M.LmsAuditLog.findOne({ code }).sort({ createdAt: -1 }).lean();
  expect(row?.outcome).toBe('fail');
  expect(JSON.stringify(row)).not.toMatch(/Layla|Hassan|layla@/);
}

async function failingLaunch(p: MockPlatform, over: Record<string, unknown>, opts: { kid?: string; foreign?: boolean } = {}) {
  const l = await login(p);
  const idToken = await p.sign(p.claims(l.nonce, TOOL, over), { kid: opts.kid, key: opts.foreign ? await p.foreignKey() : undefined });
  return postLaunch({ id_token: idToken, state: l.state }, l.cookie);
}

// --------------------------------------------------------------- tests

describe('OIDC login', () => {
  it('redirects to the platform with the OIDC parameters and sets a partitioned state cookie', async () => {
    const r = await request(app).get('/lti/login').query({ iss: pA.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: pA.clientId });
    expect(r.status).toBe(302);
    const u = new URL(r.headers.location);
    expect(u.origin + u.pathname).toBe(pA.authLoginUrl);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none', client_id: pA.clientId, redirect_uri: `${TOOL}/lti/launch`, login_hint: 'h' });
    expect(u.searchParams.get('state')!.length).toBeGreaterThan(30);
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/^lti_st_[0-9a-f]{16}=1; Path=\/lti; Max-Age=600; HttpOnly; Secure; SameSite=None; Partitioned/);
    // Only hashes are stored.
    const row = await M.LmsOidcState.findOne({}).sort({ expiresAt: -1 }).lean();
    expect(JSON.stringify(row)).not.toContain(u.searchParams.get('state')!);
  });

  it('refuses missing parameters, a foreign target_link_uri, an unknown issuer and an ambiguous one', async () => {
    const base = { iss: pA.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch` };
    await expectLtiError(await request(app).post('/lti/login').type('form').send({ iss: pA.issuer }), 'missing_parameters', 400);
    await expectLtiError(await request(app).post('/lti/login').type('form').send({ ...base, target_link_uri: 'https://evil.example/lti/launch' }), 'invalid_target_link_uri', 400);
    await expectLtiError(await request(app).post('/lti/login').type('form').send({ ...base, iss: 'https://unknown.example' }), 'unknown_platform', 400);
    // Same issuer, second client id: login without client_id is ambiguous.
    await M.LmsPlatform.create({ institutionId: A, provider: 'lti13', vendor: 'moodle', issuer: pA.issuer, clientId: 'client-a-2', registeredVia: 'manual', status: 'active', authLoginUrl: pA.authLoginUrl, keysetUrl: pA.keysetUrl });
    await expectLtiError(await request(app).post('/lti/login').type('form').send(base), 'ambiguous_platform', 400);
    await M.LmsPlatform.deleteOne({ clientId: 'client-a-2' });
  });
});

describe('framing inside the LMS (regression: first MoodleCloud test, 2026-11-17)', () => {
  // Chrome applies CSP frame-ancestors to every response of a framed
  // navigation, redirects included. A success redirect that still said
  // frame-ancestors 'self' was blocked inside Moodle with Chrome's raw
  // "might be temporarily down" page and no Reference code.
  const ancestors = (r: request.Response) => /frame-ancestors ([^;]+)/.exec(String(r.headers['content-security-policy']))?.[1] ?? '';
  const platformOrigin = () => new URL(pA.issuer).origin;

  it('/lti/login (POST and GET): the redirect may be framed by the LMS, with no X-Frame-Options', async () => {
    const post = await request(app).post('/lti/login').type('form').send({ iss: pA.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: pA.clientId, lti_deployment_id: pA.deploymentId });
    const get = await request(app).get('/lti/login').query({ iss: pA.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: pA.clientId });
    for (const r of [post, get]) {
      expect(r.status).toBe(302);
      expect(r.headers['x-frame-options']).toBeUndefined();
      expect(ancestors(r)).toContain(platformOrigin());
      expect(ancestors(r).split(' ')).not.toContain('*');
    }
  });

  it('/lti/launch success redirect may be framed by the LMS, with no X-Frame-Options', async () => {
    const { r } = await launch(pA);
    expect(r.status, r.text).toBe(303);
    expect(r.headers['x-frame-options']).toBeUndefined();
    expect(ancestors(r)).toContain(platformOrigin());
  });

  it('an unexpected server error shows the ENARA error page with a Reference code, frameable, never the raw browser error', async () => {
    const target = (await import('../../src/integrations/lms/models')).LmsOidcState as unknown as { create: (...a: unknown[]) => unknown };
    const orig = target.create;
    target.create = () => { throw new Error('simulated database failure'); };
    try {
      const r = await request(app).post('/lti/login').type('form').send({ iss: pA.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: pA.clientId, lti_deployment_id: pA.deploymentId });
      expect(r.status).toBe(500);
      expect(r.headers['content-type']).toMatch(/html/);
      expect(r.text).toContain('<code>internal_error</code>');
      expect(r.text).not.toMatch(/simulated database failure/);
      expect(r.headers['x-frame-options']).toBeUndefined();
      // The platform isn't known here, so the page (no data, no actions) may be
      // framed by any https site, like the other error pages for an unknown LMS.
      expect(ancestors(r)).toBe("'self' https:");
    } finally {
      target.create = orig;
    }
  });
});

describe('launch: happy paths', () => {
  it('a teacher: class + group created, teacher on the class, one-time token -> ENARA session', async () => {
    const { r, ex, token } = await launchAndExchange(pA, { sub: 'teacher-1', 'lti:roles': [ROLE.instructor] });
    expect(r.headers.location.startsWith(`${TOOL}/lms/launch#lt=`)).toBe(true);
    expect(r.headers['x-frame-options']).toBeUndefined();
    expect(r.headers['set-cookie']?.[0]).toMatch(/Max-Age=0/); // state cookie cleared
    expect(ex.body.user.role).toBe('teacher');
    expect(ex.body.user.institutionId).toBe(A);
    expect(ex.body.launch).toMatchObject({ purpose: 'launch', role: 'teacher', presentation: 'iframe', cookieless: false });
    const ctx = await M.LmsContext.findOne({ externalContextId: 'course-101', institutionId: A }).lean();
    expect(ctx?.enaraClassId).toBe(ex.body.launch.classId);
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    const { Batch } = await import('../../src/models/Batch');
    const cls = await CourseInstance.findOne({ id: ctx!.enaraClassId }).lean();
    expect(cls).toMatchObject({ institutionId: A, courseName: 'Grade 7 Science', batchId: ctx!.enaraGroupId, visibility: 'student' });
    const { User } = await import('../../src/models/User');
    const teacher = await User.findOne({ email: { $regex: /@lms\.enara\.test$/ }, role: 'teacher' }).lean();
    expect(cls!.instructorIds).toContain(teacher!._id.toString());
    expect(await Batch.exists({ id: ctx!.enaraGroupId, institutionId: A })).toBeTruthy();
    // The session works on the normal API.
    const s = await request(app).get('/api/auth/session').set('Authorization', `Bearer ${ex.body.token}`);
    expect(s.status).toBe(200);
    // Single use.
    const again = await request(app).post('/api/lms/launch/exchange').send({ token });
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe('LAUNCH_TOKEN_USED');
  });

  it('a student: own ENARA account (never by email), class enrollment (scope class, source lms), seat-neutral data', async () => {
    const { ex } = await launchAndExchange(pA, { sub: 'student-1' });
    expect(ex.body.user.role).toBe('student');
    const lmsUser = await M.LmsUser.findOne({ platformId: { $exists: true }, externalUserId: 'student-1' }).lean();
    expect(lmsUser).toMatchObject({ institutionId: A, email: 'layla@school.example', givenName: 'Layla' });
    const { User } = await import('../../src/models/User');
    const u = await User.findById(lmsUser!.enaraUserId).lean();
    expect(u!.email).toBe(`${lmsUser!.id}@lms.enara.test`);
    expect(u!.name).toBe('Layla Hassan');
    const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
    const ctx = await M.LmsContext.findOne({ externalContextId: 'course-101', institutionId: A }).lean();
    const enr = await ClassEnrollment.findOne({ studentId: u!.studentId }).lean();
    expect(enr).toMatchObject({ institutionId: A, scope: 'class', targetId: ctx!.enaraClassId, source: 'lms', lmsContextId: ctx!.id, status: 'active' });
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    expect((await CourseInstance.findOne({ id: ctx!.enaraClassId }).lean())!.studentIds).toContain(u!.studentId);
    // Resource link keeps the line item URL for Phase 3 (keyed by link, not class).
    const rl = await M.LmsResourceLink.findOne({ contextId: ctx!.id, externalResourceLinkId: 'rl-1' }).lean();
    expect(rl).toMatchObject({ institutionId: A, presentation: 'iframe', customParams: { activity: 'unit-1' } });
    expect(rl!.lineItemUrl).toMatch(/lineitems\/5\/lineitem$/);
    const le = await M.LmsEnrollment.findOne({ contextId: ctx!.id, lmsUserId: lmsUser!.id }).lean();
    expect(le).toMatchObject({ enaraRole: 'student', status: 'active', source: 'launch' });
    // Audit: IDs only.
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch', actor: lmsUser!.id }).lean();
    expect(audit?.refIds).toMatchObject({ lmsUserId: lmsUser!.id, role: 'student', cookieless: false, createdUser: true });
    expect(JSON.stringify(audit)).not.toMatch(/Layla|Hassan|layla@/);
  });

  it('re-launch is idempotent; a second course gives a second class enrollment for the same person', async () => {
    const { User } = await import('../../src/models/User');
    const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    const before = { users: await User.countDocuments(), classes: await CourseInstance.countDocuments(), enr: await ClassEnrollment.countDocuments() };
    await launchAndExchange(pA, { sub: 'student-1' });
    await launchAndExchange(pA, { sub: 'student-1', 'lti:resource_link': { id: 'rl-2' } });
    expect(await User.countDocuments()).toBe(before.users);
    expect(await CourseInstance.countDocuments()).toBe(before.classes);
    expect(await ClassEnrollment.countDocuments()).toBe(before.enr);
    await launchAndExchange(pA, { sub: 'student-1', 'lti:context': { id: 'course-202', title: 'Grade 7 Maths' } });
    expect(await User.countDocuments()).toBe(before.users);
    expect(await CourseInstance.countDocuments()).toBe(before.classes + 1);
    const lmsUser = await M.LmsUser.findOne({ externalUserId: 'student-1', institutionId: A }).lean();
    const studentId = (await User.findById(lmsUser!.enaraUserId).lean())!.studentId;
    const rows = await ClassEnrollment.find({ studentId, status: 'active' }).lean();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.scope === 'class' && r.source === 'lms')).toBe(true);
    expect(new Set(rows.map((r) => r.lmsContextId)).size).toBe(2);
  });

  it('cookieless: allowed on the single-use server state, logged and counted, and flagged to the landing page', async () => {
    const before = (await M.LmsPlatform.findOne({ issuer: pA.issuer, clientId: pA.clientId }).lean())!;
    const { r, ex } = await launchAndExchange(pA, { sub: 'student-1' }, { cookieless: true });
    expect(new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('c')).toBe('1');
    expect(ex.body.launch.cookieless).toBe(true);
    const after = (await M.LmsPlatform.findOne({ id: before.id }).lean())!;
    expect(after.cookielessLaunchCount).toBe((before.cookielessLaunchCount ?? 0) + 1);
    expect(after.launchCount).toBe((before.launchCount ?? 0) + 1);
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch', code: 'cookieless' }).lean();
    expect(audit).toMatchObject({ outcome: 'warn', refIds: { cookieless: true } });
  });

  it('two simultaneous first launches of one new person make one account and one class', async () => {
    const { User } = await import('../../src/models/User');
    const { Student } = await import('../../src/models/Student');
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    const logins = await Promise.all([login(pA), login(pA), login(pA)]);
    const over = { sub: 'racer-1', 'lti:context': { id: 'course-race', title: 'Race' } };
    const res = await Promise.all(logins.map(async (l) => postLaunch({ id_token: await pA.sign(pA.claims(l.nonce, TOOL, over)), state: l.state }, l.cookie)));
    expect(res.map((r) => r.status)).toEqual([303, 303, 303]);
    const lu = await M.LmsUser.find({ externalUserId: 'racer-1' }).lean();
    expect(lu).toHaveLength(1);
    expect(await User.countDocuments({ email: `${lu[0].id}@lms.enara.test` })).toBe(1);
    const u = await User.findById(lu[0].enaraUserId).lean();
    expect(await Student.countDocuments({ email: `${lu[0].id}@lms.enara.test` })).toBe(1);
    expect(u!.studentId).toBeTruthy();
    expect(await CourseInstance.countDocuments({ courseName: 'Race' })).toBe(1);
  });
});

describe('role mapping', () => {
  it('Instructor + Learner -> teacher; Administrator without permission -> teacher (downgrade logged)', async () => {
    const { ex } = await launchAndExchange(pA, { sub: 'ta-1', 'lti:roles': [ROLE.learner, ROLE.instructor] });
    expect(ex.body.user.role).toBe('teacher');
    const { ex: ex2 } = await launchAndExchange(pA, { sub: 'siteadmin-1', 'lti:roles': [ROLE.instAdmin] });
    expect(ex2.body.user.role).toBe('teacher');
    const a = await M.LmsAuditLog.findOne({ event: 'lti.launch', 'refIds.warnings': 'admin_downgraded' }).lean();
    expect(a?.outcome).toBe('warn');
  });
  it('unknown roles -> student with a warning; Mentor -> refused (not linked)', async () => {
    const { ex } = await launchAndExchange(pA, { sub: 'odd-1', 'lti:roles': ['urn:lti:role:custom/Wizard'] });
    expect(ex.body.user.role).toBe('student');
    const r = await failingLaunch(pA, { sub: 'parent-1', 'lti:roles': [ROLE.mentor] });
    await expectLtiError(r, 'observer_not_supported', 403);
    expect(await M.LmsUser.exists({ externalUserId: 'parent-1' })).toBeNull();
  });
  it('an account never changes role from a launch: a student opened as Instructor is refused and told to ask an admin', async () => {
    const r = await failingLaunch(pA, { sub: 'student-1', 'lti:roles': [ROLE.instructor] });
    await expectLtiError(r, 'student_as_instructor', 409);
    expect(r.text).toMatch(/student account/);
    expect(r.text).toMatch(/ask your school administrator/i);
    const lu = await M.LmsUser.findOne({ externalUserId: 'student-1', institutionId: A }).lean();
    const { User } = await import('../../src/models/User');
    expect((await User.findById(lu!.enaraUserId).lean())!.role).toBe('student');
  });
});

describe('student preview (owner decision L1): staff opening the activity as a learner', () => {
  const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  async function counts() {
    const { Student } = await import('../../src/models/Student');
    const { User } = await import('../../src/models/User');
    const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    const { Batch } = await import('../../src/models/Batch');
    const { countSeats } = await import('../../src/integrations/lms/core/seats');
    return {
      students: await Student.countDocuments(),
      users: await User.countDocuments(),
      classEnrollments: await ClassEnrollment.countDocuments(),
      classes: await CourseInstance.countDocuments(),
      groups: await Batch.countDocuments(),
      lmsUsers: await M.LmsUser.countDocuments(),
      lmsEnrollments: await M.LmsEnrollment.countDocuments(),
      contexts: await M.LmsContext.countDocuments(),
      resourceLinks: await M.LmsResourceLink.countDocuments(),
      gradeJobs: await M.LmsGradeSyncJob.countDocuments(),
      seatsA: await countSeats(A),
      seatsB: await countSeats(B),
      orgSettings: JSON.stringify(await M.LmsOrgSettings.find({}).sort({ institutionId: 1 }).lean()),
    };
  }
  async function snapshotClass(classId: string) {
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    const c = await CourseInstance.findOne({ id: classId }).lean();
    return JSON.stringify({ s: c!.studentIds, i: c!.instructorIds });
  }

  it('teacher -> learner: a preview session, nothing created, no seat, no outbox, the account keeps its role', async () => {
    const { User } = await import('../../src/models/User');
    const { countSeats } = await import('../../src/integrations/lms/core/seats');
    // teacher.test opens the activity as a teacher first (account + class exist).
    const t = await launchAndExchange(pA, { sub: 'pv-teacher', 'lti:roles': [ROLE.instructor], 'lti:context': { id: 'course-pv', title: 'Preview course' } });
    const classId = t.ex.body.launch.classId as string;
    const lu = await M.LmsUser.findOne({ externalUserId: 'pv-teacher', institutionId: A }).lean();
    const teacherBefore = await User.findById(lu!.enaraUserId).lean();
    // Hard cap at the current count: a NEW student would be refused; a preview takes no seat.
    const used = await countSeats(A);
    await request(app).put('/api/lms/seats').set('Authorization', auth.enara).send({ institutionId: A, seatLimit: used, hardCap: true });
    try {
      const before = await counts();
      const cls = await snapshotClass(classId);
      // Moodle "Switch role to -> Student": same sub, Learner only, a new activity link.
      const { r, ex } = await launchAndExchange(pA, { sub: 'pv-teacher', 'lti:roles': [ROLE.learner], 'lti:context': { id: 'course-pv', title: 'Preview course' }, 'lti:resource_link': { id: 'rl-pv-new' } });
      expect(r.status).toBe(303);
      expect(ex.body.user.role).toBe('teacher');
      expect(ex.body.user.studentId).toBeUndefined();
      expect(ex.body.launch).toMatchObject({ purpose: 'launch', role: 'student', preview: true, classId });
      expect(decode(ex.body.token).pv).toBe(true);
      expect(await counts()).toEqual(before);
      expect(await snapshotClass(classId)).toBe(cls);
      const teacherAfter = await User.findById(lu!.enaraUserId).lean();
      expect(teacherAfter!.role).toBe('teacher');
      expect(teacherAfter!.studentId).toBeUndefined();
      expect(teacherAfter!.tokenVersion ?? 0).toBe(teacherBefore!.tokenVersion ?? 0);
      // No lms_enrollments row says "student" for this person.
      expect(await M.LmsEnrollment.exists({ lmsUserId: lu!.id, enaraRole: 'student' })).toBeNull();
      // Audit: preview_launch, IDs only.
      const audit = await M.LmsAuditLog.findOne({ event: 'preview_launch', actor: lu!.id }).sort({ createdAt: -1 }).lean();
      expect(audit).toMatchObject({ outcome: 'ok', institutionId: A, refIds: { lmsUserId: lu!.id, enaraUserId: lu!.enaraUserId, staffRole: 'teacher', detectedBy: 'staff_account', enaraClassId: classId } });
      expect(JSON.stringify(audit)).not.toMatch(/Layla|Hassan|layla@/);
      // The session itself works (reads).
      const s = await request(app).get('/api/auth/session').set('Authorization', `Bearer ${ex.body.token}`);
      expect(s.status).toBe(200);
      expect(s.body.user.role).toBe('teacher');
      // A normal NEW student is still refused by the hard cap at this moment (the cap is live).
      await expectLtiError(await failingLaunch(pA, { sub: 'pv-new-student' }), 'seat_limit_reached', 403);
    } finally {
      await request(app).put('/api/lms/seats').set('Authorization', auth.enara).send({ institutionId: A, seatLimit: null, hardCap: false, clearBillingFlag: true });
    }
  });

  it('writes are refused in a preview session (attempts, tutor sessions, progress, anything else); reads of student data say "preview"', async () => {
    const { ex } = await launchAndExchange(pA, { sub: 'pv-teacher', 'lti:roles': [ROLE.learner], 'lti:context': { id: 'course-pv', title: 'Preview course' } });
    const bearer = `Bearer ${ex.body.token}`;
    const writes: Array<[string, string]> = [
      ['post', '/api/me/tutor/sessions'],
      ['post', '/api/me/tutor/sessions/x/messages'],
      ['post', '/api/me/assessments/a1/attempts'],
      ['post', '/api/me/assessments/a1/attempts/t1/submit'],
      ['post', '/api/me/assignments/a1/attempts'],
      ['post', '/api/me/courses/c1/lessons/l1/complete'],
      ['post', '/api/me/events'],
      ['post', '/api/learning/diagnostics'],
      ['post', '/api/learning/students/STU1/mastery/recompute'],
      ['post', '/api/auth/tour/complete'],
      ['post', '/api/course-instances'],
      ['put', '/api/me/tutor-face'],
      ['delete', '/api/me/tutor/sessions'],
      ['patch', '/api/learning/misconceptions/m1'],
    ];
    for (const [method, path] of writes) {
      const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path).set('Authorization', bearer).send({});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code, `${method} ${path}`).toBe('LMS_PREVIEW_READ_ONLY');
      expect(res.body.error.message).toBe('Preview as student — nothing is saved.');
    }
    const read = await request(app).get('/api/me/tutor/sessions').set('Authorization', bearer);
    expect(read.status).toBe(403);
    expect(read.body.error.code).toBe('LMS_PREVIEW_NO_STUDENT_DATA');
    // The same teacher's normal (non-preview) session is not affected.
    const lu = await M.LmsUser.findOne({ externalUserId: 'pv-teacher', institutionId: A }).lean();
    const { User } = await import('../../src/models/User');
    const { signToken } = await import('../../src/controllers/auth.controller');
    const normal = signToken((await User.findById(lu!.enaraUserId))!);
    expect(decode(normal).pv).toBeUndefined();
    expect((await request(app).post('/api/auth/tour/complete').set('Authorization', `Bearer ${normal}`).send({})).body?.error?.code).not.toBe('LMS_PREVIEW_READ_ONLY');
    // "Open in new tab" is allowed and stays a preview.
    const h = await request(app).post('/api/lms/launch/handoff').set('Authorization', bearer).send({ classId: ex.body.launch.classId });
    expect(h.status, JSON.stringify(h.body)).toBe(200);
    const ex2 = await request(app).post('/api/lms/launch/handoff/exchange').send({ code: new URLSearchParams(new URL(h.body.url).hash.slice(1)).get('hc') });
    expect(ex2.body.launch).toMatchObject({ purpose: 'handoff', role: 'student', preview: true });
    expect(decode(ex2.body.token).pv).toBe(true);
    // Signing out is allowed.
    expect((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${ex2.body.token}`)).status).toBe(204);
  });

  it('admin -> learner: preview too; a course not yet opened by staff creates nothing (no class)', async () => {
    const { User } = await import('../../src/models/User');
    await launchAndExchange(pA, { sub: 'pv-admin', 'lti:roles': [ROLE.instructor], 'lti:context': { id: 'course-pv', title: 'Preview course' } });
    const lu = await M.LmsUser.findOne({ externalUserId: 'pv-admin', institutionId: A }).lean();
    await User.updateOne({ _id: lu!.enaraUserId }, { $set: { role: 'admin' } }); // the school made this person an admin
    const before = await counts();
    const { ex } = await launchAndExchange(pA, { sub: 'pv-admin', 'lti:roles': [ROLE.learner], 'lti:context': { id: 'course-never-opened', title: 'New course' } });
    expect(ex.body.user.role).toBe('admin');
    expect(ex.body.launch).toMatchObject({ role: 'student', preview: true, classId: null });
    expect(await counts()).toEqual(before);
    expect(await M.LmsContext.exists({ externalContextId: 'course-never-opened' })).toBeNull();
    const audit = await M.LmsAuditLog.findOne({ event: 'preview_launch', actor: lu!.id }).lean();
    expect(audit?.refIds).toMatchObject({ staffRole: 'admin', detectedBy: 'staff_account' });
    expect((await User.findById(lu!.enaraUserId).lean())!.role).toBe('admin');
    expect((await request(app).post('/api/me/tutor/sessions').set('Authorization', `Bearer ${ex.body.token}`).send({})).body.error.code).toBe('LMS_PREVIEW_READ_ONLY');
  });

  it('LTI TestUser role: a preview when linked to staff; an unlinked test student is refused and nothing is created', async () => {
    const TEST_USER = 'http://purl.imsglobal.org/vocab/lti/system/person#TestUser';
    const before = await counts();
    const r = await failingLaunch(pA, { sub: 'canvas-test-student', 'lti:roles': [ROLE.learner, TEST_USER] });
    await expectLtiError(r, 'test_user_not_supported', 403);
    expect(await counts()).toEqual(before);
    expect(await M.LmsUser.exists({ externalUserId: 'canvas-test-student' })).toBeNull();
    const { ex } = await launchAndExchange(pA, { sub: 'pv-teacher', 'lti:roles': [ROLE.learner, TEST_USER], 'lti:context': { id: 'course-pv', title: 'Preview course' } });
    expect(ex.body.launch.preview).toBe(true);
    const lu = await M.LmsUser.findOne({ externalUserId: 'pv-teacher', institutionId: A }).lean();
    const audit = await M.LmsAuditLog.findOne({ event: 'preview_launch', actor: lu!.id, 'refIds.detectedBy': 'test_user' }).lean();
    expect(audit).toBeTruthy();
    expect(await counts()).toEqual(before);
  });

  it('a normal student launch is unchanged: no preview flag, enrolled as before', async () => {
    const { ex } = await launchAndExchange(pA, { sub: 'pv-real-student', 'lti:context': { id: 'course-pv', title: 'Preview course' } });
    expect(ex.body.user.role).toBe('student');
    expect(ex.body.user.studentId).toBeTruthy();
    expect(ex.body.launch).toMatchObject({ role: 'student', preview: false });
    expect(decode(ex.body.token).pv).toBeUndefined();
    const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
    expect(await ClassEnrollment.exists({ studentId: ex.body.user.studentId, targetId: ex.body.launch.classId, status: 'active' })).toBeTruthy();
    const lu = await M.LmsUser.findOne({ externalUserId: 'pv-real-student', institutionId: A }).lean();
    expect(await M.LmsAuditLog.exists({ event: 'preview_launch', actor: lu!.id })).toBeNull();
    expect(await M.LmsAuditLog.exists({ event: 'lti.launch', actor: lu!.id, outcome: 'ok' })).toBeTruthy();
    // Writes are not blocked by the preview guard for a real student.
    const w = await request(app).post('/api/me/tutor/sessions').set('Authorization', `Bearer ${ex.body.token}`).send({});
    expect(w.body?.error?.code).not.toBe('LMS_PREVIEW_READ_ONLY');
  });

  it('tenant isolation: staff in school A is no one at school B; a link to another school\'s account is refused', async () => {
    const { User } = await import('../../src/models/User');
    // The same LMS user id at school B's platform is a different person: a normal new student there.
    const { ex } = await launchAndExchange(pB, { sub: 'pv-teacher' });
    expect(ex.body.launch.preview).toBe(false);
    expect(ex.body.user).toMatchObject({ role: 'student', institutionId: B });
    // An LMS user at school A linked (wrongly) to a school B teacher: refused, nothing written.
    const bTeacher = await User.create({ email: 'pv-b-teacher@staff.test', password: 'x', role: 'teacher', name: 'B teacher', institutionId: B });
    const platformA = (await M.LmsPlatform.findOne({ issuer: pA.issuer, clientId: pA.clientId }).lean())!;
    await M.LmsUser.create({ platformId: platformA.id, institutionId: A, externalUserId: 'pv-cross', enaraUserId: bTeacher._id.toString() });
    const before = await counts();
    await expectLtiError(await failingLaunch(pA, { sub: 'pv-cross' }), 'account_conflict', 409);
    expect(await counts()).toEqual(before);
    expect(await M.LmsAuditLog.exists({ event: 'preview_launch', institutionId: B })).toBeNull();
  });
});

describe('launch: every negative case (plan §4.1)', () => {
  it('bad signature', async () => {
    await expectLtiError(await failingLaunch(pA, {}, { foreign: true }), 'invalid_signature', 401);
  });
  it('unknown kid: refetches the JWKS, then refuses', async () => {
    const hits = pA.jwksHits;
    await expectLtiError(await failingLaunch(pA, {}, { kid: 'nope' }), 'unknown_kid', 401);
    expect(pA.jwksHits).toBeGreaterThan(hits);
  });
  it('platform key rotation: a new kid is picked up by refetching the JWKS', async () => {
    const p = new MockPlatform(pA.issuer, pA.clientId);
    await pA.rotate('k2');
    const { r } = await launch(pA, { sub: 'student-1' });
    expect(r.status, r.text).toBe(303);
    void p;
  });
  it('wrong iss, wrong aud, array aud without azp, wrong azp', async () => {
    await expectLtiError(await failingLaunch(pA, { iss: 'https://other.example' }), 'invalid_iss', 401);
    await expectLtiError(await failingLaunch(pA, { aud: 'someone-else' }), 'invalid_aud', 401);
    await expectLtiError(await failingLaunch(pA, { aud: [pA.clientId, 'other'] }), 'invalid_azp', 401);
    await expectLtiError(await failingLaunch(pA, { aud: [pA.clientId, 'other'], azp: 'other' }), 'invalid_azp', 401);
    const ok = await failingLaunch(pA, { sub: 'student-1', aud: [pA.clientId, 'other'], azp: pA.clientId });
    expect(ok.status, ok.text).toBe(303);
  });
  it('expired, and iat in the future beyond the skew', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expectLtiError(await failingLaunch(pA, { iat: now - 600, exp: now - 300 }), 'token_expired', 401);
    await expectLtiError(await failingLaunch(pA, { iat: now + 600, exp: now + 900 }), 'iat_in_future', 401);
  });
  it('nonce replay: a used state is refused; an old id_token with a fresh state is refused', async () => {
    const { r, l, idToken } = await launch(pA, { sub: 'student-1' });
    expect(r.status).toBe(303);
    await expectLtiError(await postLaunch({ id_token: idToken, state: l.state }, l.cookie), 'state_invalid', 400);
    const l2 = await login(pA);
    await expectLtiError(await postLaunch({ id_token: idToken, state: l2.state }, l2.cookie), 'nonce_invalid', 401);
    await expectLtiError(await failingLaunch(pA, { nonce: undefined }), 'nonce_invalid', 401);
  });
  it('missing or unknown state, expired state, a state cookie from another login, missing id_token', async () => {
    const l = await login(pA);
    const token = await pA.sign(pA.claims(l.nonce, TOOL));
    await expectLtiError(await postLaunch({ id_token: token }, l.cookie), 'state_missing', 400);
    await expectLtiError(await postLaunch({ id_token: token, state: 'made-up' }, l.cookie), 'state_invalid', 400);
    const other = await login(pA);
    await expectLtiError(await postLaunch({ id_token: token, state: l.state }, other.cookie), 'state_cookie_mismatch', 400);
    const l3 = await login(pA);
    await expectLtiError(await postLaunch({ state: l3.state }, l3.cookie), 'id_token_missing', 400);
    const l4 = await login(pA);
    await M.LmsOidcState.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expectLtiError(await postLaunch({ id_token: await pA.sign(pA.claims(l4.nonce, TOOL)), state: l4.state }, l4.cookie), 'state_invalid', 400);
  });
  it('unknown, pending and auto-created deployments', async () => {
    await expectLtiError(await failingLaunch(pA, { 'lti:deployment_id': 'dep-x' }), 'unknown_deployment', 403);
    await expectLtiError(await failingLaunch(pA, { 'lti:deployment_id': undefined }), 'missing_deployment', 400);
    await M.LmsPlatform.updateOne({ issuer: pA.issuer, clientId: pA.clientId }, { $set: { autoCreateDeployments: true } });
    await expectLtiError(await failingLaunch(pA, { 'lti:deployment_id': 'dep-auto' }), 'deployment_pending', 403);
    expect((await M.LmsDeployment.findOne({ deploymentId: 'dep-auto' }).lean())?.status).toBe('pending');
    await expectLtiError(await failingLaunch(pA, { 'lti:deployment_id': 'dep-auto' }), 'deployment_pending', 403);
    await M.LmsPlatform.updateOne({ issuer: pA.issuer, clientId: pA.clientId }, { $set: { autoCreateDeployments: false } });
  });
  it('missing claims: sub (anonymous), roles, context, resource_link; wrong version; wrong message type; foreign target_link_uri', async () => {
    await expectLtiError(await failingLaunch(pA, { sub: undefined }), 'anonymous_launch', 400);
    await expectLtiError(await failingLaunch(pA, { 'lti:roles': undefined }), 'missing_roles', 400);
    await expectLtiError(await failingLaunch(pA, { 'lti:roles': [] }), 'missing_roles', 400);
    await expectLtiError(await failingLaunch(pA, { 'lti:context': undefined }), 'missing_context', 400);
    await expectLtiError(await failingLaunch(pA, { 'lti:resource_link': undefined }), 'missing_resource_link', 400);
    await expectLtiError(await failingLaunch(pA, { 'lti:version': '1.1' }), 'invalid_version', 400);
    await expectLtiError(await failingLaunch(pA, { 'lti:message_type': 'LtiDeepLinkingRequest' }), 'unsupported_message_type', 400);
    await expectLtiError(await failingLaunch(pA, { 'lti:target_link_uri': 'https://evil.example/x' }), 'invalid_target_link_uri', 400);
  });
  it('alg none and HS256 tokens are refused', async () => {
    const l = await login(pA);
    const none = new UnsecuredJWT(pA.claims(l.nonce, TOOL)).encode();
    const r1 = await postLaunch({ id_token: none, state: l.state }, l.cookie);
    expect(r1.status).toBe(401);
    expect(r1.text).toMatch(/<code>(invalid_alg|invalid_token)<\/code>/);
    const l2 = await login(pA);
    const hs = await new SignJWT(pA.claims(l2.nonce, TOOL)).setProtectedHeader({ alg: 'HS256', kid: 'k2' }).sign(new TextEncoder().encode('x'.repeat(32)));
    await expectLtiError(await postLaunch({ id_token: hs, state: l2.state }, l2.cookie), 'invalid_alg', 401);
  });
  it('the platform JWKS cannot be fetched', async () => {
    pA.jwksStatus = 500;
    const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
    resetPlatformKeySetsForTests();
    await expectLtiError(await failingLaunch(pA, {}), 'jwks_unavailable', 503);
    pA.jwksStatus = 200;
  });
  it('a suspended school, a disabled account', async () => {
    const { Institution } = await import('../../src/models/Institution');
    const { forgetInstitutionStatus } = await import('../../src/middleware/auth.middleware');
    await Institution.updateOne({ id: A }, { $set: { status: 'suspended' } });
    forgetInstitutionStatus(A);
    await expectLtiError(await failingLaunch(pA, { sub: 'student-1' }), 'institution_suspended', 403);
    await Institution.updateOne({ id: A }, { $set: { status: 'active' } });
    forgetInstitutionStatus(A);
    const { User } = await import('../../src/models/User');
    const lu = await M.LmsUser.findOne({ externalUserId: 'odd-1' }).lean();
    await User.updateOne({ _id: lu!.enaraUserId }, { $set: { status: 'disabled' } });
    await expectLtiError(await failingLaunch(pA, { sub: 'odd-1' }), 'account_disabled', 403);
  });
  it('error pages can be framed by the platform only; the rest of the site keeps its frame headers', async () => {
    const r = await failingLaunch(pA, { 'lti:version': '1.1' });
    expect(r.headers['x-frame-options']).toBeUndefined();
    expect(r.headers['content-security-policy']).toContain(`frame-ancestors 'self' ${pA.issuer}`);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    const health = await request(app).get('/health');
    expect(health.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});

describe('launch token exchange and "Open in new tab"', () => {
  it('rejects garbage, a token signed with another key, and an expired one', async () => {
    expect((await request(app).post('/api/lms/launch/exchange').send({ token: 'abc' })).status).toBe(400);
    expect((await request(app).post('/api/lms/launch/exchange').send({})).status).toBe(400);
    const forged = await new SignJWT({ purpose: 'launch' }).setProtectedHeader({ alg: 'HS256' }).setJti('j').setSubject('u').setIssuer(TOOL).setAudience('enara-lms-landing').setExpirationTime('1m').sign(new TextEncoder().encode('y'.repeat(32)));
    expect((await request(app).post('/api/lms/launch/exchange').send({ token: forged })).status).toBe(400);
  });
  it('handoff: an LMS account gets a fresh one-time code for a new tab; other accounts cannot', async () => {
    const { ex } = await launchAndExchange(pA, { sub: 'student-1' });
    const h = await request(app).post('/api/lms/launch/handoff').set('Authorization', `Bearer ${ex.body.token}`).send({ classId: ex.body.launch.classId });
    expect(h.status, JSON.stringify(h.body)).toBe(200);
    expect(h.body.url).toMatch(new RegExp(`^${TOOL}/lms/launch#hc=[A-Za-z0-9_-]{43}$`));
    expect(h.body.token).toBeUndefined();
    const code = (r: request.Response) => new URLSearchParams(new URL(r.body.url).hash.slice(1)).get('hc');
    const ex2 = await request(app).post('/api/lms/launch/handoff/exchange').send({ code: code(h) });
    expect(ex2.status).toBe(200);
    expect(ex2.body.launch).toMatchObject({ purpose: 'handoff', presentation: 'window', classId: ex.body.launch.classId });
    // A class id from another school is dropped.
    const h2 = await request(app).post('/api/lms/launch/handoff').set('Authorization', `Bearer ${ex.body.token}`).send({ classId: 'inst-of-another-school' });
    expect((await request(app).post('/api/lms/launch/handoff/exchange').send({ code: code(h2) })).body.launch.classId).toBeNull();
    expect((await request(app).post('/api/lms/launch/handoff').set('Authorization', auth.teacherA).send({})).status).toBe(403);
    expect((await request(app).post('/api/lms/launch/handoff').send({})).status).toBe(401);
  });
});

describe('admin: manual "Add LMS", approval, roles, tenant isolation', () => {
  const reg = (p: { issuer: string; clientId: string }, extra: Record<string, unknown> = {}) => ({
    vendor: 'moodle', issuer: p.issuer, clientId: p.clientId, authLoginUrl: `${p.issuer}/mod/lti/auth.php`, keysetUrl: `${p.issuer}/mod/lti/certs.php`, deploymentIds: ['3'], ...extra,
  });

  it('a school admin connection starts pending; launches are refused until an ENARA admin approves', async () => {
    const p = await new MockPlatform('https://moodle2.school-a.test', 'client-a2', '3').start();
    try {
      const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.adminA).send(reg(p, { keysetUrl: p.keysetUrl }));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.platform).toMatchObject({ status: 'pending', institutionId: A, deployments: [{ deploymentId: '3', status: 'pending' }] });
      const id = r.body.platform.id;
      const lr = await request(app).post('/lti/login').type('form').send({ iss: p.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: p.clientId });
      await expectLtiError(lr, 'platform_pending', 403);
      expect((await request(app).post(`/api/lms/platforms/${id}/approve`).set('Authorization', auth.adminA)).status).toBe(403);
      const ap = await request(app).post(`/api/lms/platforms/${id}/approve`).set('Authorization', auth.enara);
      expect(ap.status).toBe(200);
      expect(ap.body.platform).toMatchObject({ status: 'active', deployments: [{ status: 'active' }] });
      const { ex } = await launchAndExchange(p, { sub: 'p2-student' });
      expect(ex.body.user.institutionId).toBe(A);
      // A deployment added later by the school admin also waits for approval.
      const d = await request(app).post(`/api/lms/platforms/${id}/deployments`).set('Authorization', auth.adminA).send({ deploymentId: '4' });
      expect(d.status).toBe(201);
      expect(d.body.platform.deployments.find((x: { deploymentId: string }) => x.deploymentId === '4').status).toBe('pending');
      // Disable: launches stop.
      expect((await request(app).post(`/api/lms/platforms/${id}/disable`).set('Authorization', auth.adminA)).status).toBe(200);
      await expectLtiError(await request(app).post('/lti/login').type('form').send({ iss: p.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: p.clientId }), 'platform_disabled', 403);
    } finally {
      await p.stop();
    }
  });

  it('with LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL=false a school admin connection is active at once', async () => {
    setLmsEnv({ ...ON, LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL: 'false' });
    try {
      const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.adminB).send(reg({ issuer: 'https://lms3.school-b.test', clientId: 'c3' }));
      expect(r.status).toBe(201);
      expect(r.body.platform.status).toBe('active');
      expect((await request(app).get('/api/lms/status').set('Authorization', auth.adminB)).body.requireApproval).toBe(false);
    } finally {
      setLmsEnv(ON);
    }
    expect((await request(app).get('/api/lms/status').set('Authorization', auth.adminB)).body.requireApproval).toBe(true);
  });

  it('status shows the tool URLs to paste into the LMS', async () => {
    const r = await request(app).get('/api/lms/status').set('Authorization', auth.adminA);
    expect(r.status).toBe(200);
    expect(r.body.tool).toEqual({ toolUrl: TOOL, loginUrl: `${TOOL}/lti/login`, launchUrl: `${TOOL}/lti/launch`, redirectUris: [`${TOOL}/lti/launch`], jwksUrl: `${TOOL}/.well-known/jwks.json` });
    expect(r.body.presets.map((p: { id: string }) => p.id).sort()).toEqual(['generic', 'moodle']);
  });

  it('validation: https URLs only, known vendor, deployment IDs, duplicates', async () => {
    const bad = async (body: Record<string, unknown>) => (await request(app).post('/api/lms/platforms').set('Authorization', auth.adminA).send(body)).status;
    expect(await bad(reg({ issuer: 'http://moodle.example', clientId: 'x' }))).toBe(400);
    expect(await bad(reg({ issuer: 'https://m.example', clientId: 'x' }, { keysetUrl: 'http://10.0.0.1/jwks' }))).toBe(400);
    expect(await bad(reg({ issuer: 'https://m.example', clientId: 'x' }, { vendor: 'canvas' }))).toBe(400);
    expect(await bad(reg({ issuer: 'https://m.example', clientId: 'x' }, { deploymentIds: [] }))).toBe(400);
    expect(await bad(reg({ issuer: 'https://m.example', clientId: 'x' }, { issuer: { $gt: '' } }))).toBe(400);
    // The same issuer + client id cannot be taken by another school.
    expect(await bad(reg({ issuer: pB.issuer, clientId: pB.clientId }))).toBe(409);
  });

  it('only admins: teachers, academic managers, students and anonymous callers are refused', async () => {
    const { ex } = await launchAndExchange(pA, { sub: 'student-1' });
    for (const who of [auth.teacherA, auth.managerA, `Bearer ${ex.body.token}`]) {
      expect((await request(app).get('/api/lms/platforms').set('Authorization', who)).status).toBe(403);
      expect((await request(app).post('/api/lms/platforms').set('Authorization', who).send(reg({ issuer: 'https://z.example', clientId: 'z' }))).status).toBe(403);
      expect((await request(app).get('/api/lms/seats').set('Authorization', who)).status).toBe(403);
    }
    expect((await request(app).get('/api/lms/platforms')).status).toBe(401);
  });

  it('tenant isolation: a school admin sees and changes only their own school', async () => {
    const listB = await request(app).get('/api/lms/platforms').set('Authorization', auth.adminB);
    expect(listB.body.platforms.every((p: { institutionId: string }) => p.institutionId === B)).toBe(true);
    const listBForA = await request(app).get('/api/lms/platforms').query({ institutionId: A }).set('Authorization', auth.adminB);
    expect(listBForA.body.platforms.every((p: { institutionId: string }) => p.institutionId === B)).toBe(true);
    const aId = (await M.LmsPlatform.findOne({ issuer: pA.issuer, clientId: pA.clientId }).lean())!.id;
    expect((await request(app).post(`/api/lms/platforms/${aId}/disable`).set('Authorization', auth.adminB)).status).toBe(404);
    expect((await request(app).post(`/api/lms/platforms/${aId}/deployments`).set('Authorization', auth.adminB).send({ deploymentId: '9' })).status).toBe(404);
    expect((await request(app).post('/api/lms/platforms').set('Authorization', auth.adminB).send({ ...reg({ issuer: 'https://q.example', clientId: 'q' }), institutionId: A })).status).toBe(403);
    const seatsB = await request(app).get('/api/lms/seats').query({ institutionId: A }).set('Authorization', auth.adminB);
    expect(seatsB.body.seats.institutionId).toBe(B);
    // ENARA admins see all.
    const all = await request(app).get('/api/lms/platforms').set('Authorization', auth.enara);
    expect(new Set(all.body.platforms.map((p: { institutionId: string }) => p.institutionId))).toEqual(new Set([A, B]));
  });

  it('LMS data is separate per platform: the same LMS ids at two schools never meet', async () => {
    const sub = 'shared-sub';
    const ctx = { id: 'shared-course', title: 'Shared' };
    const { ex: a } = await launchAndExchange(pA, { sub, 'lti:context': ctx });
    const { ex: b } = await launchAndExchange(pB, { sub, 'lti:context': ctx });
    expect(a.body.user.institutionId).toBe(A);
    expect(b.body.user.institutionId).toBe(B);
    expect(a.body.user.studentId).not.toBe(b.body.user.studentId);
    expect(a.body.launch.classId).not.toBe(b.body.launch.classId);
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    expect((await CourseInstance.findOne({ id: b.body.launch.classId }).lean())!.institutionId).toBe(B);
    // A school A session cannot open school B's LMS class.
    const r = await request(app).get(`/api/course-instances/${b.body.launch.classId}`).set('Authorization', `Bearer ${a.body.token}`);
    expect(r.status).toBeGreaterThanOrEqual(403);
  });
});

describe('seats (one seat per student per school)', () => {
  it('over the limit: launch allowed, admin alerted once, school flagged for billing; hard cap refuses new students only', async () => {
    const { countSeats } = await import('../../src/integrations/lms/core/seats');
    const used = await countSeats(A);
    expect((await request(app).put('/api/lms/seats').set('Authorization', auth.adminA).send({ institutionId: A, seatLimit: used + 1 })).status).toBe(403);
    const set = await request(app).put('/api/lms/seats').set('Authorization', auth.enara).send({ institutionId: A, seatLimit: used + 1 });
    expect(set.status).toBe(200);
    expect(set.body.seats).toMatchObject({ seatLimit: used + 1, overLimit: false, hardCap: false });

    await launchAndExchange(pA, { sub: 'seat-1' }); // fills the last seat
    let s = (await request(app).get('/api/lms/seats').set('Authorization', auth.adminA)).body.seats;
    expect(s).toMatchObject({ seatsUsed: used + 1, overLimit: false, billingFlaggedAt: null });

    await launchAndExchange(pA, { sub: 'seat-2' }); // over: allowed
    s = (await request(app).get('/api/lms/seats').set('Authorization', auth.adminA)).body.seats;
    expect(s.overLimit).toBe(true);
    expect(s.billingFlaggedAt).toBeTruthy();
    expect(s.lastAlertAt).toBeTruthy();
    await launchAndExchange(pA, { sub: 'seat-3' }); // still allowed; no second alert today
    const alerts = await M.LmsAuditLog.find({ event: 'seats.over_limit', institutionId: A }).lean();
    expect(alerts.map((x) => x.refIds.alerted)).toEqual([true, false]);
    // Teachers do not use seats.
    await launchAndExchange(pA, { sub: 'seat-teacher', 'lti:roles': [ROLE.instructor] });
    expect((await request(app).get('/api/lms/seats').set('Authorization', auth.adminA)).body.seats.seatsUsed).toBe(used + 3);
    // ENARA admins see flagged schools.
    const flagged = await request(app).get('/api/lms/seats').set('Authorization', auth.enara);
    expect(flagged.body.flagged.map((f: { institutionId: string }) => f.institutionId)).toContain(A);

    // Hard cap: a new student is refused (nothing created); existing ones still get in.
    await request(app).put('/api/lms/seats').set('Authorization', auth.enara).send({ institutionId: A, hardCap: true });
    await expectLtiError(await failingLaunch(pA, { sub: 'seat-4' }), 'seat_limit_reached', 403);
    const lu = await M.LmsUser.findOne({ externalUserId: 'seat-4' }).lean();
    expect(lu?.enaraUserId).toBeUndefined();
    const again = await launch(pA, { sub: 'seat-2' });
    expect(again.r.status).toBe(303);
    // Clear for the other tests.
    const cleared = await request(app).put('/api/lms/seats').set('Authorization', auth.enara).send({ institutionId: A, seatLimit: null, hardCap: false, clearBillingFlag: true });
    expect(cleared.body.seats).toMatchObject({ seatLimit: null, billingFlaggedAt: null, overLimit: false });
  });
});

describe('flags off: nothing changes', () => {
  it('every LMS route is the normal 404 and writes nothing', async () => {
    setLmsEnv({ LMS_KEK: KEK });
    try {
      const off = await makeApp();
      const states = await M.LmsOidcState.countDocuments();
      const audit = await M.LmsAuditLog.countDocuments();
      const checks = [
        request(off).get('/lti/login').query({ iss: pA.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch` }),
        request(off).post('/lti/login').type('form').send({ iss: pA.issuer }),
        request(off).post('/lti/launch').type('form').send({ state: 'x', id_token: 'y' }),
        request(off).post('/api/lms/launch/exchange').send({ token: 'x' }),
        request(off).post('/api/lms/launch/handoff').set('Authorization', auth.adminA),
        request(off).post('/api/lms/launch/handoff/exchange').send({ code: 'x' }),
        request(off).post('/api/lms/telemetry/mic').set('Authorization', auth.adminA).send({}),
        request(off).get('/api/lms/telemetry/mic').set('Authorization', auth.enara),
        request(off).get('/api/lms/status').set('Authorization', auth.adminA),
        request(off).get('/api/lms/platforms').set('Authorization', auth.enara),
        request(off).post('/api/lms/platforms').set('Authorization', auth.enara).send({}),
        request(off).get('/api/lms/seats').set('Authorization', auth.enara),
      ];
      for (const r of await Promise.all(checks)) {
        expect(r.status).toBe(404);
        expect(r.body?.error?.code).toBe('NOT_FOUND');
      }
      expect(await M.LmsOidcState.countDocuments()).toBe(states);
      expect(await M.LmsAuditLog.countDocuments()).toBe(audit);
    } finally {
      setLmsEnv(ON);
    }
  });
  it('the registry has the lti13 adapter, with capabilities from the preset and scopes', async () => {
    const { getProvider } = await import('../../src/integrations/lms/registry');
    const lti = getProvider('lti13')!;
    expect(lti.capabilities({ vendor: 'moodle' })).toMatchObject({ launch: true, grades: false, roster: false });
    expect(lti.capabilities({ vendor: 'unknown' }).launch).toBe(false);
  });
  it('the Phase 1a migration creates its collections and indexes and can run twice', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const mig = MIGRATIONS.find((x) => x.id === '2026-11-17-lms-phase1a-indexes')!;
    await mig.up();
    await mig.up();
    const ttl = await mongoose.connection.db!.collection('lms_launch_tokens').indexes();
    expect(ttl.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true);
    for (const model of M.LMS_PHASE1A_MODELS) expect((model.schema.path('institutionId') as { isRequired?: boolean }).isRequired).toBe(true);
  });
});
