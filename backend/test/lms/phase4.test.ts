import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE, type MockMember } from './mockPlatform';

// LMS Phase 4 (docs/lms/PHASE_4_NOTES.md): roster sync through LTI NRPS,
// against the local mock platform (token endpoint and memberships with paging
// on 127.0.0.1; no network). Covers the NRPS client (token scope, media type,
// paging, other-origin next links, errors), the diff (add, remove, Inactive,
// re-add, role changes and conflicts), ownership (only what this course of
// this LMS connection added), "not started" until the first launch, seats
// (not-started students take no seat; the hard cap at the first launch), the
// switched-first-launch preview through NRPS and its fallback, the triggers
// (teacher launch older than 24 h, nightly, "Sync roster now", cron), the
// permissions and tenant isolation, flags off, and no PII in the audit log.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const CRON_SECRET = 'cron-secret-for-tests-0123456789';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', CRON_SECRET,
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL', 'ENROLLMENT_DUAL_WRITE'];
const LTI = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, ENROLLMENT_DUAL_WRITE: 'true' };
const ON = { ...LTI, LMS_ROSTER_SYNC_ENABLED: 'true' };

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p4-school-a';
const B = 'p4-school-b';
const NRPS_SCOPE = 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let pA2: MockPlatform;
let pB: MockPlatform;
const auth: Record<string, string> = {};
const ids: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');
let drain: typeof import('../../src/integrations/lms/core/drain');
let roster: typeof import('../../src/integrations/lms/core/roster');
let seats: typeof import('../../src/integrations/lms/core/seats');
let Models: {
  User: typeof import('../../src/models/User').User;
  Student: typeof import('../../src/models/Student').Student;
  CourseInstance: typeof import('../../src/models/CourseInstance').CourseInstance;
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
  roster = await import('../../src/integrations/lms/core/roster');
  seats = await import('../../src/integrations/lms/core/seats');
  roster.setRosterCooldownForTests(0);
  const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
  await ClassEnrollment.createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { Student } = await import('../../src/models/Student');
  const { CourseInstance } = await import('../../src/models/CourseInstance');
  Models = { User, Student, CourseInstance, ClassEnrollment };
  const { Institution } = await import('../../src/models/Institution');
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, f !== 'ai_grading_enabled']));
  await Institution.create([{ id: A, name: 'School A', features }, { id: B, name: 'School B', features }]);

  const { signAccessToken } = await import('../../src/auth/jwt');
  const mkUser = async (key: string, role: string, institutionId?: string, extra: Record<string, unknown> = {}) => {
    const u = await User.create({ email: `${key}@staff.test`, password: 'x', role, name: key, institutionId, ...extra });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
    ids[key] = u._id.toString();
    return u;
  };
  await mkUser('enara', 'enara-admin');
  await mkUser('adminA', 'admin', A);
  await mkUser('adminB', 'admin', B);
  await mkUser('teacherA', 'teacher', A);
  await mkUser('teacherA2', 'teacher', A);
  await mkUser('managerA', 'academic_manager', A);
  await Student.create({ id: 'STU-MANUAL', name: 'Manual Pupil', email: 'manual.pupil@school.example', grade: '', avatar: 'MP', institutionId: A });
  await mkUser('studentA', 'student', A, { studentId: 'STU-MANUAL' });

  pA = await new MockPlatform('https://moodle.school-a.test', 'client-a').start();
  pA2 = await new MockPlatform('https://moodle2.school-a.test', 'client-a2').start();
  pB = await new MockPlatform('https://lms.school-b.test', 'client-b').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  for (const [p, inst, key] of [[pA, A, 'A'], [pA2, A, 'A2'], [pB, B, 'B']] as const) {
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
  await pA2?.stop();
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
  return { session: `Bearer ${ex.body.token}`, launch: ex.body.launch, user: ex.body.user };
}

const course = (p: MockPlatform, id: string, opts: { nrps?: boolean } = {}) => ({
  'lti:context': { id, label: 'ENG', title: `Course ${id}` },
  'lti:resource_link': { id: `rl-${id}`, title: 'Activity' },
  'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': opts.nrps === false ? undefined : p.nrpsClaim(id)['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'],
});
const asTeacher = (p: MockPlatform, sub: string, id: string) => launchAndExchange(p, { sub, name: `Teacher ${sub}`, email: `${sub}@school.example`, 'lti:roles': [ROLE.instructor], ...course(p, id) });
const asLearner = (p: MockPlatform, sub: string, id: string, over: Record<string, unknown> = {}) =>
  launchAndExchange(p, { sub, name: `Pupil ${sub}`, given_name: 'Pupil', family_name: sub, email: `${sub}@school.example`, 'lti:roles': [ROLE.learner], ...course(p, id), ...over });

const L = (sub: string, status: MockMember['status'] = 'Active'): MockMember => ({ user_id: sub, roles: [ROLE.learner], status, name: `Pupil ${sub}`, given_name: 'Pupil', family_name: sub, email: `${sub}@school.example` });
const T = (sub: string): MockMember => ({ user_id: sub, roles: [ROLE.instructor], status: 'Active', name: `Teacher ${sub}`, email: `${sub}@school.example` });

const settle = () => drain.settleLmsBackgroundForTests();
const ctxOf = async (p: MockPlatform, id: string) => (await M.LmsContext.findOne({ platformId: p === pA ? ids.platformA : p === pA2 ? ids.platformA2 : ids.platformB, externalContextId: id }).lean())!;
const sync = (contextId: string, who = auth.adminA) => request(app).post(`/api/lms/contexts/${contextId}/roster/sync`).set('Authorization', who).send({});
async function account(p: MockPlatform, sub: string) {
  const lu = await M.LmsUser.findOne({ platformId: p === pA ? ids.platformA : p === pA2 ? ids.platformA2 : ids.platformB, externalUserId: sub }).lean();
  const user = lu?.enaraUserId ? await Models.User.findById(lu.enaraUserId).lean() : null;
  return { lu, user, studentId: user?.studentId };
}
const lmsRow = async (contextId: string, sub: string, p = pA) => {
  const { lu } = await account(p, sub);
  return lu ? M.LmsEnrollment.findOne({ contextId, lmsUserId: lu.id }).lean() : null;
};
const classRow = (studentId: string, classId: string) => Models.ClassEnrollment.findOne({ studentId, scope: 'class', targetId: classId }).lean();
const seatsA = async () => (await request(app).get('/api/lms/seats').set('Authorization', auth.adminA)).body.seats;

// --------------------------------------------------------------- tests

describe('NRPS client', () => {
  it('parses Link headers: only rel="next"', () => {
    return import('../../src/integrations/lms/adapters/lti13/nrps').then(({ nextLink }) => {
      expect(nextLink('<https://m.test/a?from=2>; rel="next"')).toBe('https://m.test/a?from=2');
      expect(nextLink('<https://m.test/d>; rel="differences", <https://m.test/n>; rel="next"')).toBe('https://m.test/n');
      expect(nextLink('<https://m.test/d>; rel="differences"')).toBeUndefined();
      expect(nextLink(null)).toBeUndefined();
    });
  });
});

describe('triggers: a teacher launch older than 24 h syncs in the background', () => {
  it('first teacher launch syncs (token scope, media type, bearer); a fresh sync is not repeated; 25 h later it is', async () => {
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s2'), L('s3')];
    const t = await asTeacher(pA, 'teacher-1', 'course-101');
    await settle();
    const ctx = await ctxOf(pA, 'course-101');
    ids.ctx101 = ctx.id;
    ids.class101 = ctx.enaraClassId!;
    ids.teacher1Session = t.session;
    expect(ctx.nrpsUrl).toBe(pA.membershipsUrl('course-101'));
    expect(ctx.lastRosterSyncAt).toBeTruthy();
    expect(ctx.rosterSync).toMatchObject({ trigger: 'launch', outcome: 'ok', added: 3, members: 4, pages: 1 });
    expect(pA.tokenRequests.at(-1)!.scope).toBe(NRPS_SCOPE);
    const req = pA.nrpsRequests.at(-1)!;
    expect(req.accept).toBe('application/vnd.ims.lti-nrps.v2.membershipcontainer+json');
    expect(req.auth).toMatch(/^Bearer tok-/);
    const n = pA.nrpsRequests.length;
    await asTeacher(pA, 'teacher-1', 'course-101');
    await settle();
    expect(pA.nrpsRequests.length).toBe(n);
    // A learner's launch never syncs (its first launch only asks NRPS for its own role: owner item, tested below).
    await M.LmsContext.updateOne({ id: ctx.id }, { $set: { lastRosterSyncAt: new Date(Date.now() - 25 * 3600_000) } });
    const attempt = (await ctxOf(pA, 'course-101')).rosterSync!.lastAttemptAt;
    await asLearner(pA, 's-other', 'course-101');
    await settle();
    expect((await ctxOf(pA, 'course-101')).rosterSync!.lastAttemptAt).toEqual(attempt);
    expect(new URLSearchParams(pA.nrpsRequests.at(-1)!.query).get('role')).toBe(ROLE.instructor);
    // The roster without s-other: s-other launched, so the next sync ends its membership.
    pA.memberships['course-101'].push(L('s-other'));
    await asTeacher(pA, 'teacher-1', 'course-101');
    await settle();
    expect(pA.nrpsRequests.length).toBe(n + 2);
    const again = await ctxOf(pA, 'course-101');
    expect(again.rosterSync).toMatchObject({ trigger: 'launch', outcome: 'ok', added: 0, unchanged: 5 });
  });
});

describe('roster diff and "not started"', () => {
  it('new learners: a student account with the reserved address, an LMS class enrollment, listed as not started; no seat', async () => {
    for (const sub of ['s1', 's2', 's3']) {
      const { lu, user, studentId } = await account(pA, sub);
      expect(lu!.lastLaunchAt).toBeUndefined();
      expect(user).toMatchObject({ role: 'student', institutionId: A, email: `${lu!.id}@lms.enara.test` });
      expect(user!.email).not.toContain('school.example');
      expect(await Models.Student.findOne({ id: studentId }).lean()).toMatchObject({ name: `Pupil ${sub}`, institutionId: A });
      expect(await classRow(studentId!, ids.class101)).toMatchObject({ status: 'active', source: 'lms', lmsContextId: ids.ctx101 });
      expect(await lmsRow(ids.ctx101, sub)).toMatchObject({ status: 'invited', source: 'nrps', enaraRole: 'student' });
    }
    const cls = await Models.CourseInstance.findOne({ id: ids.class101 }).lean();
    const sids = await Promise.all(['s1', 's2', 's3'].map(async (s) => (await account(pA, s)).studentId!));
    expect(cls!.studentIds).toEqual(expect.arrayContaining(sids));
    // Not started: listed separately and not counted as seats (owner decision).
    const r = await request(app).get(`/api/lms/contexts/${ids.ctx101}/roster`).set('Authorization', auth.adminA);
    expect(r.status).toBe(200);
    expect(r.body.notStarted.map((x: { studentId: string }) => x.studentId).sort()).toEqual([...sids].sort());
    expect(r.body.context.students).toMatchObject({ notStarted: 3, active: 1 });
    const s = await seatsA();
    // Seats: the manual student and s-other (launched); s1-s3 not started.
    expect(s).toMatchObject({ seatsUsed: 2, notStarted: 3, lmsStudents: 1 });
    // The teacher's class roster marks them.
    const tr = await request(app).get(`/api/teaching/classes/${ids.class101}/roster`).set('Authorization', ids.teacher1Session);
    expect(tr.status, JSON.stringify(tr.body)).toBe(200);
    expect(tr.body.lms).toMatchObject({ contextId: ids.ctx101, notStarted: 3 });
    const marked = tr.body.students.filter((x: { lmsNotStarted?: boolean }) => x.lmsNotStarted).map((x: { id: string }) => x.id);
    expect(marked.sort()).toEqual([...sids].sort());
  });

  it('first launch: not started -> active, the same account, and the seat starts now', async () => {
    const before = await account(pA, 's1');
    const users = await Models.User.countDocuments({ institutionId: A });
    const l = await asLearner(pA, 's1', 'course-101');
    expect(l.user.role).toBe('student');
    expect((await account(pA, 's1')).user!._id.toString()).toBe(before.user!._id.toString());
    expect(await Models.User.countDocuments({ institutionId: A })).toBe(users);
    const row = await lmsRow(ids.ctx101, 's1');
    expect(row).toMatchObject({ status: 'active' });
    expect(row!.firstLaunchAt).toBeTruthy();
    expect(await seatsA()).toMatchObject({ seatsUsed: 3, notStarted: 2 });
    // No NRPS role check for a person who already has an account.
    expect(await M.LmsAuditLog.exists({ event: 'preview_check', 'refIds.lmsUserId': before.lu!.id })).toBeNull();
    // A re-sync never double counts.
    await sync(ids.ctx101);
    expect(await seatsA()).toMatchObject({ seatsUsed: 3, notStarted: 2 });
  });

  it('removed in the LMS or Inactive there -> inactive with an end date; account and history kept; re-added -> reactivated', async () => {
    pA.memberships['course-101'] = [T('teacher-1'), L('s2', 'Inactive'), L('s-other')];
    const r = await sync(ids.ctx101);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.outcome).toMatchObject({ status: 'ok', removed: 3, added: 0 });
    for (const sub of ['s1', 's2', 's3']) {
      const { user, studentId } = await account(pA, sub);
      expect(user).toBeTruthy();
      expect(await Models.Student.exists({ id: studentId })).toBeTruthy();
      const cr = await classRow(studentId!, ids.class101);
      expect(cr).toMatchObject({ status: 'inactive', source: 'lms' });
      expect(cr!.endedAt).toBeTruthy();
      const row = await lmsRow(ids.ctx101, sub);
      expect(row).toMatchObject({ status: 'inactive' });
      expect(row!.endedAt).toBeTruthy();
      expect((await Models.CourseInstance.findOne({ id: ids.class101 }).lean())!.studentIds).not.toContain(studentId);
    }
    expect((await M.LmsAuditLog.find({ event: 'roster.member_removed', 'refIds.contextId': ids.ctx101 }).lean()).map((a) => a.refIds.reason).sort()).toEqual(['inactive_in_lms', 'not_in_lms', 'not_in_lms']);
    // s1 (started) left: the seat goes; s2/s3 never had one.
    expect(await seatsA()).toMatchObject({ seatsUsed: 2, notStarted: 0 });
    // Re-added.
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s2'), L('s-other')];
    const r2 = await sync(ids.ctx101);
    expect(r2.body.outcome).toMatchObject({ status: 'ok', reactivated: 2 });
    expect(await lmsRow(ids.ctx101, 's1')).toMatchObject({ status: 'active' });
    expect(await lmsRow(ids.ctx101, 's2')).toMatchObject({ status: 'invited' });
    const s1 = await account(pA, 's1');
    expect(await classRow(s1.studentId!, ids.class101)).toMatchObject({ status: 'active' });
    expect(await seatsA()).toMatchObject({ seatsUsed: 3, notStarted: 1 });
    expect(await Models.ClassEnrollment.countDocuments({ studentId: s1.studentId, targetId: ids.class101 })).toBe(1);
  });

  it('paging: all 3 pages are read; a next link to another origin or a failing page removes nobody', async () => {
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s2'), L('s-other'), L('s4'), L('s5')];
    pA.nrpsPageSize = 2;
    const before = pA.nrpsRequests.length;
    const r = await sync(ids.ctx101);
    expect(r.body.outcome).toMatchObject({ status: 'ok', pages: 3, members: 6, added: 2 });
    const reqs = pA.nrpsRequests.slice(before);
    expect(reqs.map((q) => new URLSearchParams(q.query).get('from') ?? '0')).toEqual(['0', '2', '4']);
    // Page 2 fails: failed, with its code, and nobody is removed.
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s2')];
    pA.nrpsStatuses = [200, 503];
    const f = await sync(ids.ctx101);
    expect(f.body.outcome).toMatchObject({ status: 'failed', code: 'memberships_http_503' });
    expect(await lmsRow(ids.ctx101, 's5')).toMatchObject({ status: 'invited' });
    const list = await request(app).get('/api/lms/contexts').set('Authorization', auth.adminA);
    const view = list.body.contexts.find((c: { id: string }) => c.id === ids.ctx101);
    expect(view.sync).toMatchObject({ outcome: 'failed', lastErrorCode: 'memberships_http_503' });
    // A next link to another origin is never followed (the token would go there).
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s2')];
    pA.nrpsNextOrigin = 'http://127.0.0.1:9';
    const o = await sync(ids.ctx101);
    expect(o.body.outcome).toMatchObject({ status: 'failed', code: 'memberships_next_other_origin' });
    expect(await lmsRow(ids.ctx101, 's5')).toMatchObject({ status: 'invited' });
    pA.nrpsNextOrigin = undefined;
    // An empty roster never removes anybody.
    pA.nrpsPageSize = 100;
    pA.memberships['course-101'] = [];
    const e = await sync(ids.ctx101);
    expect(e.body.outcome).toMatchObject({ status: 'partial', code: 'empty_roster', removed: 0 });
    expect(await lmsRow(ids.ctx101, 's1')).toMatchObject({ status: 'active' });
    // Back to the full list; then later with the last error kept visible but the outcome ok.
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s2'), L('s-other'), L('s4'), L('s5')];
    const ok = await sync(ids.ctx101);
    expect(ok.body.context.sync).toMatchObject({ outcome: 'ok', lastErrorCode: 'memberships_next_other_origin' });
  });

  it('role changes are handled as a launch does; instructors added and removed (only those the LMS added)', async () => {
    const cls = () => Models.CourseInstance.findOne({ id: ids.class101 }).lean();
    // An instructor assigned inside ENARA (not in the LMS).
    await Models.CourseInstance.updateOne({ id: ids.class101 }, { $addToSet: { instructorIds: ids.teacherA } });
    pA.memberships['course-101'] = [T('teacher-1'), T('teacher-2'), { ...L('s1'), roles: [ROLE.instructor] }, L('s2'), L('s-other'), L('s4'), L('s5')];
    const r = await sync(ids.ctx101);
    expect(r.body.outcome).toMatchObject({ status: 'ok', instructorsAdded: 1, conflicts: 1 });
    const t2 = await account(pA, 'teacher-2');
    expect(t2.user).toMatchObject({ role: 'teacher', institutionId: A, email: `${t2.lu!.id}@lms.enara.test` });
    expect((await cls())!.instructorIds).toEqual(expect.arrayContaining([t2.user!._id.toString(), ids.teacherA]));
    expect(await lmsRow(ids.ctx101, 'teacher-2')).toMatchObject({ addedInstructor: true, enaraRole: 'teacher' });
    // s1 (a student account) listed as Instructor: unchanged, audited, never upgraded.
    const s1 = await account(pA, 's1');
    expect(s1.user!.role).toBe('student');
    expect(await lmsRow(ids.ctx101, 's1')).toMatchObject({ status: 'active', enaraRole: 'student' });
    expect(await M.LmsAuditLog.exists({ event: 'roster.member_conflict', code: 'student_as_instructor', 'refIds.lmsUserId': s1.lu!.id })).toBeTruthy();
    // teacher-1 (staff account) listed as Learner: no student is made.
    pA.memberships['course-101'] = [{ ...T('teacher-1'), roles: [ROLE.learner] }, L('s1'), L('s2'), L('s-other'), L('s4'), L('s5')];
    const r2 = await sync(ids.ctx101);
    expect(r2.body.outcome).toMatchObject({ conflicts: 1, instructorsRemoved: 1 });
    const t1 = await account(pA, 'teacher-1');
    expect(t1.user!.role).toBe('teacher');
    expect(t1.user!.studentId).toBeUndefined();
    expect(await M.LmsAuditLog.exists({ event: 'roster.member_conflict', code: 'staff_as_learner', 'refIds.lmsUserId': t1.lu!.id })).toBeTruthy();
    // teacher-2 (added by the LMS) is gone from the LMS: removed from the instructors.
    // teacherA (assigned in ENARA) stays.
    const after = (await cls())!.instructorIds;
    expect(after).not.toContain(t2.user!._id.toString());
    expect(after).toContain(ids.teacherA);
    expect(after).toContain(t1.user!._id.toString());
    expect(await lmsRow(ids.ctx101, 'teacher-2')).toMatchObject({ status: 'inactive', addedInstructor: false });
    // A later switched launch by teacher-2 (linked by the sync, never launched) is a preview.
    const pv = await asLearner(pA, 'teacher-2', 'course-101');
    expect(pv.launch.preview).toBe(true);
    expect(pv.user.role).toBe('teacher');
    expect(await M.LmsAuditLog.exists({ event: 'preview_launch', 'refIds.detectedBy': 'staff_account', 'refIds.lmsUserId': t2.lu!.id })).toBeTruthy();
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s2'), L('s-other'), L('s4'), L('s5')];
    await sync(ids.ctx101);
  });
});

describe('ownership: a sync changes only what this course of this LMS connection added', () => {
  it('a manual ENARA student in the LMS class stays active', async () => {
    const add = await request(app).post(`/api/course-instances/${ids.class101}/students`).set('Authorization', auth.adminA).send({ studentId: 'STU-MANUAL' });
    expect([200, 201], JSON.stringify(add.body)).toContain(add.status);
    expect(await classRow('STU-MANUAL', ids.class101)).toMatchObject({ status: 'active', source: 'manual' });
    const r = await sync(ids.ctx101);
    expect(r.body.outcome.status).toBe('ok');
    expect(await classRow('STU-MANUAL', ids.class101)).toMatchObject({ status: 'active', source: 'manual' });
    expect((await Models.CourseInstance.findOne({ id: ids.class101 }).lean())!.studentIds).toContain('STU-MANUAL');
  });

  it('the same student enrolled manually too (group, or a manual class row): only the LMS membership ends', async () => {
    const { enroll, studentIdsInClass } = await import('../../src/services/enrollment');
    const cls = (await Models.CourseInstance.findOne({ id: ids.class101 }).lean())!;
    const s4 = await account(pA, 's4');
    await enroll({ institutionId: A, studentId: s4.studentId!, scope: 'group', targetId: cls.batchId!, source: 'manual', createdBy: ids.adminA });
    // s5's class row was made in ENARA (an admin), not by the LMS.
    const s5 = await account(pA, 's5');
    await Models.ClassEnrollment.updateOne({ studentId: s5.studentId, scope: 'class', targetId: ids.class101 }, { $set: { source: 'manual' }, $unset: { lmsContextId: 1 } });
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s2'), L('s-other')];
    const r = await sync(ids.ctx101);
    expect(r.body.outcome).toMatchObject({ status: 'ok', removed: 2 });
    expect(await classRow(s4.studentId!, ids.class101)).toMatchObject({ status: 'inactive', source: 'lms' });
    expect(await Models.ClassEnrollment.findOne({ studentId: s4.studentId, scope: 'group', targetId: cls.batchId }).lean()).toMatchObject({ status: 'active', source: 'manual' });
    expect(await studentIdsInClass(cls)).toContain(s4.studentId);
    expect(await classRow(s5.studentId!, ids.class101)).toMatchObject({ status: 'active', source: 'manual' });
    expect((await Models.CourseInstance.findOne({ id: ids.class101 }).lean())!.studentIds).toContain(s5.studentId);
    expect(await lmsRow(ids.ctx101, 's4')).toMatchObject({ status: 'inactive' });
    expect(await lmsRow(ids.ctx101, 's5')).toMatchObject({ status: 'inactive' });
    // Both students are still in the school through ENARA's own memberships: seats unchanged by the LMS removal.
    expect(await seats.droppedLmsStudentIds(A)).not.toContain(s4.studentId);
  });

  it('a second LMS connection of the same school is never touched', async () => {
    pA2.memberships['course-201'] = [T('t-201'), L('x1'), L('s1')];
    await asTeacher(pA2, 't-201', 'course-201');
    await settle();
    const c201 = await ctxOf(pA2, 'course-201');
    expect(c201.rosterSync).toMatchObject({ outcome: 'ok', added: 2 });
    // pA2's s1 is another person (identity = connection + LMS id), never pA's s1.
    expect((await account(pA2, 's1')).user!._id.toString()).not.toBe((await account(pA, 's1')).user!._id.toString());
    const x1 = await account(pA2, 'x1');
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s-other')];
    await sync(ids.ctx101);
    expect(await lmsRow(c201.id, 'x1', pA2)).toMatchObject({ status: 'invited' });
    expect(await classRow(x1.studentId!, c201.enaraClassId!)).toMatchObject({ status: 'active', lmsContextId: c201.id });
    expect(await lmsRow(c201.id, 's1', pA2)).toMatchObject({ status: 'invited' });
  });
});

describe('seats: one per student; not-started students take none; the hard cap applies at the first launch', () => {
  it('hard cap reached: a new member is still synced (not started); their first launch is refused; raising the limit lets them in', async () => {
    const base = await seatsA();
    const put = await request(app).put('/api/lms/seats').set('Authorization', auth.enara).send({ institutionId: A, seatLimit: base.seatsUsed, hardCap: true });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    pA.memberships['course-101'] = [T('teacher-1'), L('s1'), L('s-other'), L('s9')];
    const r = await sync(ids.ctx101);
    expect(r.body.outcome).toMatchObject({ status: 'ok', added: 1 });
    expect(await lmsRow(ids.ctx101, 's9')).toMatchObject({ status: 'invited' });
    expect(await seatsA()).toMatchObject({ seatsUsed: base.seatsUsed, notStarted: base.notStarted + 1 });
    // First launch: no seat left.
    const refused = await launch(pA, { sub: 's9', name: 'Pupil s9', 'lti:roles': [ROLE.learner], ...course(pA, 'course-101') });
    expect(refused.status).toBe(403);
    expect(refused.text).toContain('<code>seat_limit_reached</code>');
    expect(await lmsRow(ids.ctx101, 's9')).toMatchObject({ status: 'invited' });
    expect((await account(pA, 's9')).lu!.lastLaunchAt).toBeUndefined();
    // A student who already has a seat still gets in.
    await asLearner(pA, 's1', 'course-101');
    // More room: s9 gets in and takes the seat.
    await request(app).put('/api/lms/seats').set('Authorization', auth.enara).send({ institutionId: A, seatLimit: base.seatsUsed + 1, hardCap: true });
    await asLearner(pA, 's9', 'course-101');
    expect(await seatsA()).toMatchObject({ seatsUsed: base.seatsUsed + 1, notStarted: base.notStarted });
    expect(await lmsRow(ids.ctx101, 's9')).toMatchObject({ status: 'active' });
    // Re-syncs never double count.
    await sync(ids.ctx101);
    await sync(ids.ctx101);
    expect((await seatsA()).seatsUsed).toBe(base.seatsUsed + 1);
    await request(app).put('/api/lms/seats').set('Authorization', auth.enara).send({ institutionId: A, seatLimit: null, hardCap: false });
  });
});

describe('first launch already switched to student (owner item): the real course role through NRPS', () => {
  it('NRPS lists them as Instructor: a preview; their staff account is made; no student, no seat, no enrollment', async () => {
    pA.memberships['course-301'] = [T('teacher-9'), L('s30')];
    const seatsBefore = await seatsA();
    const students = await Models.Student.countDocuments({ institutionId: A });
    const pv = await asLearner(pA, 'teacher-9', 'course-301');
    expect(pv.launch.preview).toBe(true);
    expect(pv.user.role).toBe('teacher');
    expect(await Models.Student.countDocuments({ institutionId: A })).toBe(students);
    expect(await seatsA()).toMatchObject({ seatsUsed: seatsBefore.seatsUsed, notStarted: seatsBefore.notStarted });
    const t9 = await account(pA, 'teacher-9');
    expect(t9.user).toMatchObject({ role: 'teacher' });
    expect(await M.LmsEnrollment.exists({ lmsUserId: t9.lu!.id })).toBeNull();
    expect(await M.LmsContext.exists({ externalContextId: 'course-301' })).toBeNull();
    const audit = await M.LmsAuditLog.findOne({ event: 'preview_launch', 'refIds.lmsUserId': t9.lu!.id }).lean();
    expect(audit!.refIds).toMatchObject({ detectedBy: 'nrps', staffRole: 'teacher' });
    // The role filter was used.
    expect(new URLSearchParams(pA.nrpsRequests.at(-1)!.query).get('role')).toBe(ROLE.instructor);
    // Writes are refused in the preview.
    expect((await request(app).post(`/api/lms/contexts/${ids.ctx101}/roster/sync`).set('Authorization', pv.session).send({})).status).toBe(403);
    // A real student's first launch: NRPS says not staff; a normal student.
    const s30 = await asLearner(pA, 's30', 'course-301');
    expect(s30.launch.preview).toBe(false);
    expect(s30.user.role).toBe('student');
    expect(await M.LmsAuditLog.exists({ event: 'preview_check', code: 'nrps_not_staff' })).toBeTruthy();
    // Also when the platform ignores the role filter.
    pA.nrpsHonoursRoleFilter = false;
    pA.memberships['course-301'].push(T('teacher-8'));
    expect((await asLearner(pA, 'teacher-8', 'course-301')).launch.preview).toBe(true);
    pA.nrpsHonoursRoleFilter = true;
  });

  it('NRPS unavailable (error, or no memberships URL): today\'s behaviour, and the reason is audited', async () => {
    pA.memberships['course-302'] = [T('teacher-7')];
    pA.nrpsStatuses = [500];
    const l = await asLearner(pA, 'teacher-7', 'course-302');
    expect(l.launch.preview).toBe(false);
    expect(l.user.role).toBe('student');
    const t7 = await account(pA, 'teacher-7');
    const row = await M.LmsAuditLog.findOne({ event: 'preview_check', code: 'nrps_unavailable', 'refIds.reason': 'memberships_http_500' }).lean();
    expect(row).toBeTruthy();
    const noUrl = await asLearner(pA, 'teacher-6', 'course-303', course(pA, 'course-303', { nrps: false }));
    expect(noUrl.user.role).toBe('student');
    expect(await M.LmsAuditLog.exists({ event: 'preview_check', code: 'nrps_unavailable', 'refIds.reason': 'no_memberships_url' })).toBeTruthy();
    expect(t7.user!.role).toBe('student');
  });
});

describe('nightly and cron', () => {
  it('the daily cron syncs courses not synced for 20 h (last-sync time moves); the cron route is 404 unless listed', async () => {
    await M.LmsContext.updateMany({}, { $set: { lastRosterSyncAt: new Date(Date.now() - 30 * 3600_000) } });
    const r = await request(app).get('/api/cron/daily').set('Authorization', `Bearer ${CRON_SECRET}`);
    expect([200, 207]).toContain(r.status);
    expect(r.body.lmsRoster).toMatchObject({ ok: expect.any(Number) });
    expect(r.body.lmsRoster.contexts).toBeGreaterThanOrEqual(2);
    expect(r.body.failed).not.toContain('lmsRoster');
    const c = await ctxOf(pA, 'course-101');
    expect(Date.now() - new Date(c.lastRosterSyncAt!).getTime()).toBeLessThan(120_000);
    expect(c.rosterSync!.trigger).toBe('nightly');
    // Fresh courses are not synced again.
    const n = pA.nrpsRequests.length;
    expect((await roster.scheduledRosterSync({ trigger: 'nightly', budgetMs: 20_000 })).contexts).toBe(0);
    expect(pA.nrpsRequests.length).toBe(n);
    // /api/cron/lms-roster: 404 unless 'cron' is listed; then secret required.
    expect((await request(app).get('/api/cron/lms-roster').set('Authorization', `Bearer ${CRON_SECRET}`)).status).toBe(404);
    setLmsEnv({ ...ON, LMS_DRAIN_TRIGGERS: 'daily,cron' });
    expect((await request(app).get('/api/cron/lms-roster')).status).toBe(401);
    const ok = await request(app).get('/api/cron/lms-roster').set('Authorization', `Bearer ${CRON_SECRET}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ contexts: 0 });
    // Without 'daily' the nightly step is not run.
    setLmsEnv({ ...ON, LMS_DRAIN_TRIGGERS: 'cron' });
    const d = await request(app).get('/api/cron/daily').set('Authorization', `Bearer ${CRON_SECRET}`);
    expect(d.body.lmsRoster).toBeUndefined();
    setLmsEnv(ON);
  });
});

describe('"Sync roster now": permissions and tenant isolation', () => {
  it('school admin (own school), ENARA admin, the course\'s teacher: yes; other teachers 404; managers, students 403; other schools 404', async () => {
    expect((await sync(ids.ctx101, auth.adminA)).status).toBe(200);
    expect((await sync(ids.ctx101, auth.enara)).status).toBe(200);
    expect((await sync(ids.ctx101, ids.teacher1Session)).status).toBe(200);
    expect((await sync(ids.ctx101, auth.teacherA2)).status).toBe(404);
    expect((await sync(ids.ctx101, auth.adminB)).status).toBe(404);
    expect((await sync(ids.ctx101, auth.managerA)).status).toBe(403);
    expect((await sync(ids.ctx101, auth.studentA)).status).toBe(403);
    expect((await request(app).post(`/api/lms/contexts/${ids.ctx101}/roster/sync`).send({})).status).toBe(401);
    expect((await request(app).get(`/api/lms/contexts/${ids.ctx101}/roster`).set('Authorization', auth.adminB)).status).toBe(404);
    expect((await request(app).get(`/api/lms/contexts/${ids.ctx101}/roster`).set('Authorization', ids.teacher1Session)).status).toBe(200);
    // The list of courses: admins only, own school.
    expect((await request(app).get('/api/lms/contexts').set('Authorization', ids.teacher1Session)).status).toBe(403);
    const b = await request(app).get('/api/lms/contexts').set('Authorization', auth.adminB);
    expect(b.status).toBe(200);
    expect(b.body.contexts.some((c: { institutionId: string }) => c.institutionId === A)).toBe(false);
    const e = await request(app).get('/api/lms/contexts').query({ institutionId: A }).set('Authorization', auth.enara);
    expect(e.body.contexts.length).toBeGreaterThanOrEqual(3);
    // School B's own course syncs only B.
    pB.memberships['course-b1'] = [T('tb'), L('b1')];
    await asTeacher(pB, 'tb', 'course-b1');
    await settle();
    const cb = await ctxOf(pB, 'course-b1');
    expect((await sync(cb.id, auth.adminB)).status).toBe(200);
    expect((await sync(cb.id, auth.adminA)).status).toBe(404);
    expect((await account(pB, 'b1')).user).toMatchObject({ institutionId: B });
    // Too soon after the last attempt: 429.
    roster.setRosterCooldownForTests(60_000);
    expect((await sync(ids.ctx101)).status).toBe(429);
    roster.setRosterCooldownForTests(0);
    // One at a time: a held lease answers 409.
    await M.LmsContext.updateOne({ id: ids.ctx101 }, { $set: { rosterSyncLeaseUntil: new Date(Date.now() + 60_000) } });
    expect((await sync(ids.ctx101)).status).toBe(409);
    await M.LmsContext.updateOne({ id: ids.ctx101 }, { $unset: { rosterSyncLeaseUntil: 1 } });
  });
});

describe('flags off: nothing happens', () => {
  it('no NRPS call, no sync on teacher launch, routes are the normal 404, no roster in the teacher view', async () => {
    setLmsEnv(LTI);
    try {
      pA.memberships['course-off'] = [T('teacher-off'), L('off-1')];
      const n = pA.nrpsRequests.length;
      const t = await asTeacher(pA, 'teacher-off', 'course-off');
      await asLearner(pA, 'new-off-student', 'course-off');
      await settle();
      expect(pA.nrpsRequests.length).toBe(n);
      const c = await ctxOf(pA, 'course-off');
      expect(c.lastRosterSyncAt).toBeUndefined();
      expect(await M.LmsAuditLog.exists({ event: 'preview_check', 'refIds.contextId': c.id })).toBeNull();
      expect((await sync(c.id, auth.enara)).status).toBe(404);
      expect((await request(app).get('/api/lms/contexts').set('Authorization', auth.enara)).status).toBe(404);
      expect((await request(app).get(`/api/lms/contexts/${c.id}/roster`).set('Authorization', auth.enara)).status).toBe(404);
      const d = await request(app).get('/api/cron/daily').set('Authorization', `Bearer ${CRON_SECRET}`);
      expect(d.body.lmsRoster).toBeUndefined();
      const tr = await request(app).get(`/api/teaching/classes/${c.enaraClassId}/roster`).set('Authorization', t.session);
      expect(tr.body.lms).toBeNull();
      expect(tr.body.students.every((s: Record<string, unknown>) => !('lmsNotStarted' in s))).toBe(true);
      expect((await roster.syncContextRoster(c.id, { trigger: 'manual' })).status).toBe('skipped');
    } finally {
      setLmsEnv(ON);
    }
  });
});

describe('audit and migration', () => {
  it('no names or emails in lms_audit_log (IDs and codes only); every sync is audited', async () => {
    const rows = await M.LmsAuditLog.find({}).lean();
    expect(rows.some((r) => r.event === 'roster.sync')).toBe(true);
    expect(rows.some((r) => r.event === 'roster.member_added')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/Pupil|Teacher t|@school\.example|Manual Pupil/);
    // Context rows carry counts and codes only.
    expect(JSON.stringify(await M.LmsContext.find({}).select('rosterSync').lean())).not.toMatch(/Pupil|@school\.example/);
  });

  it('the Phase 4 migration is additive and runs twice', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const mig = MIGRATIONS.find((x) => x.id === '2026-11-19-lms-phase4-indexes')!;
    expect(mig).toBeTruthy();
    await mig.up();
    await mig.up();
    expect((await M.LmsContext.collection.indexes()).some((i) => i.key.status === 1 && i.key.lastRosterSyncAt === 1)).toBe(true);
  });
});
