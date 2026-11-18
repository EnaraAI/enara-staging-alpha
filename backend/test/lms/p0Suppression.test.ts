import { createHmac, hkdfSync, randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE, type MockMember } from './mockPlatform';

// LMS Priority 0 item 3: the PDPL suppression list. A permanently deleted
// student's LMS identity (platform + LMS user id) goes on
// lms_suppressed_identities (a keyed hash; no name, email or raw LMS id) before
// the LMS rows are removed. Then a roster sync skips them (counted
// `suppressed`, shown in the course's sync summary) and a launch is refused
// with identity_suppressed before anything is provisioned. Only an ENARA admin
// can list and lift; a lifted identity is created again by the next sync.
// Local mock platform only (127.0.0.1; no network).

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', CRON_SECRET: 'cron-secret-for-tests-0123456789',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL', 'ENROLLMENT_DUAL_WRITE'];
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, ENROLLMENT_DUAL_WRITE: 'true', LMS_ROSTER_SYNC_ENABLED: 'true' };

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p0s-school-a';
const B = 'p0s-school-b';
const COURSE = 'p0s-course';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let pB: MockPlatform;
const auth: Record<string, string> = {};
const ids: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');
let drain: typeof import('../../src/integrations/lms/core/drain');
let erasure: typeof import('../../src/services/studentErasure');
let Models: {
  User: typeof import('../../src/models/User').User;
  Student: typeof import('../../src/models/Student').Student;
  ClassEnrollment: typeof import('../../src/models/ClassEnrollment').ClassEnrollment;
};

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ANTHROPIC_API_KEY']) delete process.env[k];
  setLmsEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  drain = await import('../../src/integrations/lms/core/drain');
  (await import('../../src/integrations/lms/core/roster')).setRosterCooldownForTests(0);
  erasure = await import('../../src/services/studentErasure');
  const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
  await ClassEnrollment.createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { Student } = await import('../../src/models/Student');
  Models = { User, Student, ClassEnrollment };
  const { Institution } = await import('../../src/models/Institution');
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, f !== 'ai_grading_enabled']));
  await Institution.create([{ id: A, name: 'School A', features }, { id: B, name: 'School B', features }]);

  const { signAccessToken } = await import('../../src/auth/jwt');
  const mkUser = async (key: string, role: string, institutionId?: string) => {
    const u = await User.create({ email: `${key}@staff.test`, password: 'x', role, name: key, institutionId });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
    ids[key] = u._id.toString();
  };
  await mkUser('enara', 'enara-admin');
  await mkUser('adminA', 'admin', A);

  pA = await new MockPlatform('https://moodle.p0s-a.test', 'client-p0s-a').start();
  pB = await new MockPlatform('https://lms.p0s-b.test', 'client-p0s-b').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  for (const [p, inst, key] of [[pA, A, 'A'], [pB, B, 'B']] as const) {
    const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({
      institutionId: inst, vendor: p === pB ? 'generic' : 'moodle', issuer: p.issuer, clientId: p.clientId,
      authLoginUrl: p.authLoginUrl, keysetUrl: p.keysetUrl, authTokenUrl: p.tokenUrl, deploymentIds: [p.deploymentId],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    ids[`platform${key}`] = r.body.platform.id;
  }
}, 180_000);

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

async function launch(p: MockPlatform, over: Record<string, unknown> = {}) {
  const lr = await request(app).post('/lti/login').type('form').send({ iss: p.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: p.clientId, lti_deployment_id: p.deploymentId });
  expect(lr.status, lr.text).toBe(302);
  const loc = new URL(lr.headers.location);
  const cookie = ([] as string[]).concat(lr.headers['set-cookie'] ?? [])[0].split(';')[0];
  const idToken = await p.sign(p.claims(loc.searchParams.get('nonce')!, TOOL, over));
  return request(app).post('/lti/launch').type('form').set('Cookie', cookie).send({ id_token: idToken, state: loc.searchParams.get('state')! });
}

async function launchAndExchange(p: MockPlatform, over: Record<string, unknown> = {}) {
  const r = await launch(p, over);
  expect(r.status, r.text).toBe(303);
  const token = new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('lt');
  const ex = await request(app).post('/api/lms/launch/exchange').send({ token });
  expect(ex.status, JSON.stringify(ex.body)).toBe(200);
  return ex.body;
}

const course = (p: MockPlatform, id: string) => ({
  'lti:context': { id, label: 'ENG', title: `Course ${id}` },
  'lti:resource_link': { id: `rl-${id}`, title: 'Activity' },
  ...p.nrpsClaim(id),
});
const learnerClaims = (p: MockPlatform, sub: string, id = COURSE) => ({ sub, name: `Pupil ${sub}`, given_name: 'Pupil', family_name: sub, email: `${sub}@pupil.example`, 'lti:roles': [ROLE.learner], ...course(p, id) });
const asLearner = (p: MockPlatform, sub: string, id = COURSE) => launchAndExchange(p, learnerClaims(p, sub, id));
const asTeacher = (p: MockPlatform, sub: string, id = COURSE) => launchAndExchange(p, { sub, name: `Teacher ${sub}`, email: `${sub}@staff.example`, 'lti:roles': [ROLE.instructor], ...course(p, id) });

const L = (sub: string): MockMember => ({ user_id: sub, roles: [ROLE.learner], status: 'Active', name: `Pupil ${sub}`, given_name: 'Pupil', family_name: sub, email: `${sub}@pupil.example` });
const T = (sub: string): MockMember => ({ user_id: sub, roles: [ROLE.instructor], status: 'Active', name: `Teacher ${sub}`, email: `${sub}@staff.example` });

const sync = (contextId: string) => request(app).post(`/api/lms/contexts/${contextId}/roster/sync`).set('Authorization', auth.adminA).send({});
async function account(p: MockPlatform, sub: string) {
  const lu = await M.LmsUser.findOne({ platformId: p === pA ? ids.platformA : ids.platformB, externalUserId: sub }).lean();
  const user = lu?.enaraUserId ? await Models.User.findById(lu.enaraUserId).lean() : null;
  return { lu, user, studentId: user?.studentId };
}
async function erase(p: MockPlatform, sub: string) {
  const { studentId } = await account(p, sub);
  expect(studentId).toBeTruthy();
  const s = (await Models.Student.findOne({ id: studentId }).lean())!;
  return { studentId: studentId!, out: await erasure.permanentlyDeleteStudent(s as never, { id: ids.enara, role: 'enara-admin' }) };
}
/** The hash as the design specifies it, computed independently of the code under test. */
function expectedHash(platformId: string, sub: string) {
  const key = Buffer.from(hkdfSync('sha256', Buffer.from(KEK, 'base64'), Buffer.alloc(0), 'enara-lms-identity-suppression-v1', 32));
  return createHmac('sha256', key).update(`${platformId}:${sub}`, 'utf8').digest('hex');
}

// --------------------------------------------------------------- tests

describe('PDPL suppression list', () => {
  it('erasing a student writes a suppression row first (keyed hash only: no raw LMS id, email or name) and audits it with IDs only', async () => {
    pA.memberships[COURSE] = [T('p0s-teacher'), L('p0s-erased'), L('p0s-kept')];
    await asTeacher(pA, 'p0s-teacher');
    await drain.settleLmsBackgroundForTests();
    const ctx = (await M.LmsContext.findOne({ platformId: ids.platformA, externalContextId: COURSE }).lean())!;
    ids.ctx = ctx.id;
    ids.classId = ctx.enaraClassId!;
    expect(ctx.rosterSync).toMatchObject({ outcome: 'ok', added: 2, suppressed: 0 });
    // The student opens ENARA once (a seat, an active membership), then the school asks for deletion.
    await asLearner(pA, 'p0s-erased');
    const before = await account(pA, 'p0s-erased');
    ids.erasedLmsUserId = before.lu!.id;
    ids.erasedUserId = String(before.user!._id);

    const { studentId, out } = await erase(pA, 'p0s-erased');
    ids.erasedStudentId = studentId;
    expect(out.anonymised).toMatchObject({ lms_identities_suppressed: 1 });
    expect(out.removed).toMatchObject({ lms_users: 1, lms_enrollments: 1, student: 1 });
    expect(await M.LmsUser.exists({ id: ids.erasedLmsUserId })).toBeNull();

    const rows = await M.LmsSuppressedIdentity.collection.find({}).toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    ids.suppressionId = row.id;
    expect(Object.keys(row).sort()).toEqual(['_id', 'createdAt', 'createdBy', 'id', 'identityHash', 'institutionId', 'keyId', 'platformId', 'reason'].sort());
    expect(row).toMatchObject({ institutionId: A, platformId: ids.platformA, reason: 'pdpl_erasure', createdBy: ids.enara, identityHash: expectedHash(ids.platformA, 'p0s-erased') });
    const raw = JSON.stringify(row);
    for (const needle of ['p0s-erased', 'Pupil', '@pupil.example', studentId, ids.erasedUserId, ids.erasedLmsUserId]) expect(raw).not.toContain(needle);

    const audit = await M.LmsAuditLog.find({ event: 'lms.identity_suppressed' }).lean();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ outcome: 'ok', institutionId: A, platformId: ids.platformA, actor: ids.enara, code: 'pdpl_erasure', refIds: { suppressionId: ids.suppressionId } });
    expect(JSON.stringify(audit)).not.toMatch(/p0s-erased|Pupil|@pupil\.example/);
    expect(JSON.stringify(audit)).not.toContain(studentId);
  });

  it('roster sync skips the suppressed member (no account, student, enrollment or seat) and counts it in the outcome and the course sync summary', async () => {
    const studentsBefore = await Models.Student.countDocuments({ institutionId: A });
    const r = await sync(ids.ctx);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.outcome).toMatchObject({ status: 'ok', members: 3, suppressed: 1, added: 0, conflicts: 0 });
    expect(r.body.context.sync).toMatchObject({ outcome: 'ok', suppressed: 1 });
    expect((await account(pA, 'p0s-erased')).lu).toBeNull();
    expect(await Models.Student.countDocuments({ institutionId: A })).toBe(studentsBefore);
    expect(await Models.User.exists({ email: { $regex: /p0s-erased/ } })).toBeNull();
    // The rest of the course is untouched.
    expect((await account(pA, 'p0s-kept')).studentId).toBeTruthy();
    // Admins see it in the course list too; the sync audit carries the count.
    const list = await request(app).get('/api/lms/contexts').set('Authorization', auth.adminA);
    expect(list.body.contexts.find((c: { id: string }) => c.id === ids.ctx).sync).toMatchObject({ suppressed: 1 });
    const audit = await M.LmsAuditLog.findOne({ event: 'roster.sync', 'refIds.contextId': ids.ctx }).sort({ createdAt: -1 }).lean();
    expect(audit?.refIds).toMatchObject({ suppressed: 1 });
  });

  it('a launch by the suppressed identity is refused with identity_suppressed (403, plain message) before anything is provisioned; any role', async () => {
    const r = await launch(pA, learnerClaims(pA, 'p0s-erased'));
    expect(r.status).toBe(403);
    expect(r.text).toContain('<code>identity_suppressed</code>');
    expect(r.text).toMatch(/This account was permanently deleted at your school(&#39;|&#x27;|')s request\. ENARA cannot recreate it\. Ask your school administrator\./);
    expect(r.text).not.toMatch(/Pupil|@pupil\.example/);
    expect((await account(pA, 'p0s-erased')).lu).toBeNull();
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch', code: 'identity_suppressed' }).sort({ createdAt: -1 }).lean();
    expect(audit).toMatchObject({ outcome: 'fail', institutionId: A, platformId: ids.platformA, refIds: { suppressionId: ids.suppressionId } });
    expect(JSON.stringify(audit)).not.toMatch(/p0s-erased|Pupil|@pupil\.example/);

    // The identity, not the role: an Instructor launch with the same sub is refused too.
    const asInstructor = await launch(pA, { ...learnerClaims(pA, 'p0s-erased'), 'lti:roles': [ROLE.instructor] });
    expect(asInstructor.status).toBe(403);
    expect(asInstructor.text).toContain('<code>identity_suppressed</code>');
    expect((await account(pA, 'p0s-erased')).lu).toBeNull();

    // Scoped to the platform: the same LMS user id on another LMS connection is someone else.
    const other = await asLearner(pB, 'p0s-erased', 'p0s-course-b');
    expect(other.user.role).toBe('student');
  });

  it('createEnaraAccount refuses a suppressed identity (last guard for any other path)', async () => {
    const { createEnaraAccount } = await import('../../src/integrations/lms/core/domainService');
    const fake = { id: 'lmsu_guard', platformId: ids.platformA, institutionId: A, externalUserId: 'p0s-erased', createdAt: new Date(), updatedAt: new Date() };
    await expect(createEnaraAccount({ role: 'student', institutionId: A, person: { name: 'X' } }, fake, { noSeatYet: true })).rejects.toMatchObject({ code: 'identity_suppressed' });
    await expect(createEnaraAccount({ role: 'teacher', institutionId: A, person: { name: 'X' } }, fake)).rejects.toMatchObject({ code: 'identity_suppressed' });
  });

  it('only ENARA admins list (counts and IDs per school, never the hash) and lift (audited)', async () => {
    expect((await request(app).get('/api/lms/suppressions').set('Authorization', auth.adminA)).status).toBe(403);
    expect((await request(app).post(`/api/lms/suppressions/${ids.suppressionId}/lift`).set('Authorization', auth.adminA).send({})).status).toBe(403);
    expect((await request(app).get('/api/lms/suppressions')).status).toBe(401);

    const list = await request(app).get('/api/lms/suppressions').set('Authorization', auth.enara);
    expect(list.status).toBe(200);
    expect(list.body.schools).toEqual([{ institutionId: A, active: 1, lifted: 0 }]);
    expect(list.body.suppressions).toHaveLength(1);
    expect(list.body.suppressions[0]).toMatchObject({ id: ids.suppressionId, institutionId: A, platformId: ids.platformA, reason: 'pdpl_erasure', createdBy: ids.enara, liftedAt: null });
    expect(JSON.stringify(list.body)).not.toContain(expectedHash(ids.platformA, 'p0s-erased'));
    expect((await request(app).get(`/api/lms/suppressions?institutionId=${B}`).set('Authorization', auth.enara)).body).toEqual({ schools: [], suppressions: [] });

    expect((await request(app).post('/api/lms/suppressions/lmss_nope/lift').set('Authorization', auth.enara).send({})).status).toBe(404);
    const lift = await request(app).post(`/api/lms/suppressions/${ids.suppressionId}/lift`).set('Authorization', auth.enara).send({});
    expect(lift.status, JSON.stringify(lift.body)).toBe(200);
    expect(lift.body.suppression).toMatchObject({ id: ids.suppressionId, liftedBy: ids.enara });
    expect(lift.body.suppression.liftedAt).toBeTruthy();
    expect((await request(app).post(`/api/lms/suppressions/${ids.suppressionId}/lift`).set('Authorization', auth.enara).send({})).status).toBe(409);
    expect(await M.LmsAuditLog.exists({ event: 'lms.identity_suppression_lifted', actor: ids.enara, 'refIds.suppressionId': ids.suppressionId })).toBeTruthy();

    // Lifted rows are listed only on request, and counted.
    expect((await request(app).get('/api/lms/suppressions').set('Authorization', auth.enara)).body).toMatchObject({ schools: [{ institutionId: A, active: 0, lifted: 1 }], suppressions: [] });
    expect((await request(app).get('/api/lms/suppressions?includeLifted=true').set('Authorization', auth.enara)).body.suppressions).toHaveLength(1);
  });

  it('after the lift, the next sync re-creates the member (not started) and the launch works', async () => {
    const r = await sync(ids.ctx);
    expect(r.body.outcome).toMatchObject({ status: 'ok', added: 1, suppressed: 0 });
    const again = await account(pA, 'p0s-erased');
    expect(again.studentId).toBeTruthy();
    expect(again.studentId).not.toBe(ids.erasedStudentId);
    expect(await M.LmsEnrollment.findOne({ contextId: ids.ctx, lmsUserId: again.lu!.id }).lean()).toMatchObject({ status: 'invited' });
    const l = await asLearner(pA, 'p0s-erased');
    expect(l.user.role).toBe('student');
  });

  it('erasing the same person again re-activates the same row (unique per platform + hash)', async () => {
    const { out } = await erase(pA, 'p0s-erased');
    expect(out.anonymised).toMatchObject({ lms_identities_suppressed: 1 });
    const rows = await M.LmsSuppressedIdentity.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: ids.suppressionId, createdBy: ids.enara });
    expect(rows[0].liftedAt).toBeUndefined();
    expect(rows[0].liftedBy).toBeUndefined();
    const r = await sync(ids.ctx);
    expect(r.body.outcome).toMatchObject({ suppressed: 1, added: 0 });
    expect((await launch(pA, learnerClaims(pA, 'p0s-erased'))).status).toBe(403);
  });

  it('LMS_KEK_PREVIOUS: rows made under the old key keep blocking after a rotation', async () => {
    const newKek = randomBytes(32).toString('base64');
    setLmsEnv({ ...ON, LMS_KEK: newKek, LMS_KEK_PREVIOUS: KEK });
    try {
      const { findSuppression, suppressedExternalIds } = await import('../../src/integrations/lms/core/suppression');
      expect(await findSuppression(ids.platformA, 'p0s-erased')).toMatchObject({ id: ids.suppressionId });
      expect([...(await suppressedExternalIds(ids.platformA, ['p0s-erased', 'p0s-kept']))]).toEqual(['p0s-erased']);
    } finally {
      setLmsEnv(ON);
    }
  });

  it('without LMS_KEK the deletion of a student with an LMS identity stops before anything is deleted', async () => {
    const kept = await account(pA, 'p0s-kept');
    const s = (await Models.Student.findOne({ id: kept.studentId }).lean())!;
    setLmsEnv({});
    try {
      await expect(erasure.permanentlyDeleteStudent(s as never, { id: ids.enara, role: 'enara-admin' })).rejects.toMatchObject({ statusCode: 503, code: 'LMS_SUPPRESSION_UNAVAILABLE' });
    } finally {
      setLmsEnv(ON);
    }
    expect(await Models.Student.exists({ id: kept.studentId })).toBeTruthy();
    expect(await M.LmsUser.exists({ id: kept.lu!.id })).toBeTruthy();
    expect(await Models.ClassEnrollment.exists({ studentId: kept.studentId, targetId: ids.classId, status: 'active' })).toBeTruthy();
    expect(await M.LmsSuppressedIdentity.countDocuments({})).toBe(1);
    // Owner follow-up: ENARA ops are alerted at once (critical) and the block is audited, IDs only.
    const { AlertEvent } = await import('../../src/models/AlertEvent');
    const alert = await AlertEvent.findOne({ kind: 'pdpl_erasure_blocked_lms_kek' }).lean();
    expect(alert).toMatchObject({ severity: 'critical' });
    expect((alert as { detail: Record<string, unknown> }).detail).toMatchObject({ studentId: kept.studentId, lmsIdentities: 1 });
    const audit = await mongoose.connection.collection('audit_logs').findOne({ action: 'student_erasure_blocked' }).catch(() => null);
    if (audit) expect(JSON.stringify(audit)).not.toMatch(/p0s-kept|@/);
  });

  it('the migration is additive and runs twice', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const mig = MIGRATIONS.find((x) => x.id === '2026-11-21-lms-p0-suppressed-identities')!;
    expect(mig).toBeTruthy();
    await mig.up();
    await mig.up();
    const idx = await M.LmsSuppressedIdentity.collection.indexes();
    expect(idx.some((i) => i.key.platformId === 1 && i.key.identityHash === 1 && i.unique)).toBe(true);
    expect(M.ALL_LMS_MODELS).toContain(M.LmsSuppressedIdentity);
  });
});
