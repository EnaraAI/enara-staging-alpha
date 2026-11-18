import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE, type MockMember } from './mockPlatform';

// Priority 0, item 2 (owner decision D8): a roster sync that leaves an LMS
// student in no class at all ends their parent links (status 'ended', reason
// lms_left_all_classes; rows kept; unused codes revoked; audited with IDs
// only). Dropped from one of two courses: links stay active. Runs against the
// local mock platform (127.0.0.1 only; no network).

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL', 'ENROLLMENT_DUAL_WRITE'];
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, ENROLLMENT_DUAL_WRITE: 'true', LMS_ROSTER_SYNC_ENABLED: 'true' };
function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p0-school-a';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../../src/app')['createApp']>;
let pA: MockPlatform;
let M: typeof import('../../src/integrations/lms/models');
let drain: typeof import('../../src/integrations/lms/core/drain');
let Core: Record<string, mongoose.Model<any>>;
const auth: Record<string, string> = {};
const ids: Record<string, string> = {};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ANTHROPIC_API_KEY', 'RESEND_API_KEY']) delete process.env[k];
  setLmsEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  drain = await import('../../src/integrations/lms/core/drain');
  (await import('../../src/integrations/lms/core/roster')).setRosterCooldownForTests(0);
  Core = {};
  for (const n of ['User', 'Student', 'ClassEnrollment', 'Institution', 'ParentLearnerLink', 'ParentLinkCode', 'AuditEvent']) Core[n] = (await import(`../../src/models/${n}`))[n];
  await Core.ClassEnrollment.createIndexes();
  await Core.User.createIndexes();
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  await Core.Institution.create({ id: A, name: 'School A', features: Object.fromEntries(ALL_FLAGS.map((f) => [f, f !== 'ai_grading_enabled'])) });
  const { signAccessToken } = await import('../../src/auth/jwt');
  for (const [key, role, inst] of [['enara', 'enara-admin', undefined], ['adminA', 'admin', A]] as const) {
    const u = await Core.User.create({ email: `${key}@staff.test`, password: 'x', role, name: key, institutionId: inst });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
  }
  pA = await new MockPlatform('https://moodle.p0.test', 'client-p0').start();
  (await import('../../src/integrations/lms/adapters/lti13/jwks')).resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = (await import('../../src/app')).createApp();
  const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({
    institutionId: A, vendor: 'moodle', issuer: pA.issuer, clientId: pA.clientId,
    authLoginUrl: pA.authLoginUrl, keysetUrl: pA.keysetUrl, authTokenUrl: pA.tokenUrl, deploymentIds: [pA.deploymentId],
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  ids.platform = r.body.platform.id;
}, 180_000);

afterAll(async () => {
  setLmsEnv({});
  await pA?.stop();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => undefined);
});

async function teacherLaunch(course: string) {
  const lr = await request(app).post('/lti/login').type('form').send({ iss: pA.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: pA.clientId, lti_deployment_id: pA.deploymentId });
  expect(lr.status, lr.text).toBe(302);
  const loc = new URL(lr.headers.location);
  const cookie = ([] as string[]).concat(lr.headers['set-cookie'] ?? [])[0].split(';')[0];
  const idToken = await pA.sign(pA.claims(loc.searchParams.get('nonce')!, TOOL, {
    sub: 'teacher-1', name: 'Teacher One', email: 'teacher-1@school.example', 'lti:roles': [ROLE.instructor],
    'lti:context': { id: course, label: 'ENG', title: `Course ${course}` },
    'lti:resource_link': { id: `rl-${course}`, title: 'Activity' },
    ...pA.nrpsClaim(course),
  }));
  const r = await request(app).post('/lti/launch').type('form').set('Cookie', cookie).send({ id_token: idToken, state: loc.searchParams.get('state')! });
  expect(r.status, r.text).toBe(303);
  await drain.settleLmsBackgroundForTests();
  return (await M.LmsContext.findOne({ platformId: ids.platform, externalContextId: course }).lean())!;
}
const L = (sub: string): MockMember => ({ user_id: sub, roles: [ROLE.learner], status: 'Active', name: `Pupil ${sub}`, given_name: 'Pupil', family_name: sub, email: `${sub}@school.example` });
const T = (sub: string): MockMember => ({ user_id: sub, roles: [ROLE.instructor], status: 'Active', name: `Teacher ${sub}`, email: `${sub}@school.example` });
const sync = (contextId: string) => request(app).post(`/api/lms/contexts/${contextId}/roster/sync`).set('Authorization', auth.adminA).send({});
async function studentOf(sub: string) {
  const lu = await M.LmsUser.findOne({ platformId: ids.platform, externalUserId: sub }).lean();
  return (await Core.User.findById(lu!.enaraUserId).lean())!.studentId as string;
}
const link = (id: string) => Core.ParentLearnerLink.findOne({ id }).lean() as Promise<any>;

describe('roster sync: parent links end when the student is left in no class at all', () => {
  it('dropped from one of two courses: still active; dropped from the last: ended lms_left_all_classes, kept, audited', async () => {
    pA.memberships['course-a'] = [T('teacher-1'), L('s1'), L('s2')];
    pA.memberships['course-b'] = [T('teacher-1'), L('s1')];
    const ca = await teacherLaunch('course-a');
    const cb = await teacherLaunch('course-b');
    const s1 = await studentOf('s1');
    const s2 = await studentOf('s2');
    for (const [sid, id] of [[s1, 'pl-s1'], [s2, 'pl-s2']]) {
      await Core.ParentLearnerLink.create({ id, parentUserId: `parent-${sid}`, studentId: sid, institutionId: A, role: 'owner', status: 'active' });
    }
    await Core.ParentLinkCode.create({ id: 'plc-s2', codeHash: 'h-s2', hint: 'AB', studentId: s2, institutionId: A, createdBy: 'x', status: 'active', expiresAt: new Date(Date.now() + 86_400_000) });

    // Both leave course A: s1 is still in course B, s2 is in nothing.
    // (A roster with no active learner removes nobody, by design: keep one.)
    pA.memberships['course-a'] = [T('teacher-1'), L('keep-list-non-empty')];
    const r = await sync(ca.id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.outcome).toMatchObject({ status: 'ok', removed: 2 });
    expect(await link('pl-s1')).toMatchObject({ status: 'active' });
    expect(await link('pl-s2')).toMatchObject({ status: 'ended', endReason: 'lms_left_all_classes', endedBy: 'system:lms', endedAt: expect.any(Date) });
    expect(await Core.ParentLearnerLink.countDocuments({ studentId: s2 })).toBe(1);
    expect(await Core.ParentLinkCode.findOne({ id: 'plc-s2' }).lean()).toMatchObject({ status: 'revoked' });
    const a = await Core.AuditEvent.findOne({ action: 'parent_link_ended', 'detail.linkId': 'pl-s2' }).lean();
    expect(a).toMatchObject({ actorId: 'system:lms', actorRole: 'system', institutionId: A, targetType: 'student', targetId: s2, detail: { reason: 'lms_left_all_classes', previousStatus: 'active' } });
    expect(JSON.stringify(a)).not.toMatch(/@|Pupil/);
    const removedS2 = (await M.LmsAuditLog.find({ event: 'roster.member_removed', 'refIds.contextId': ca.id }).lean()).map((x) => x.refIds);
    expect(removedS2.filter((x: any) => x.parentLinksEnded === 1)).toHaveLength(1);

    // s1 leaves course B too: now in no class -> ended.
    pA.memberships['course-b'] = [T('teacher-1'), L('keep-list-non-empty-b')];
    expect((await sync(cb.id)).body.outcome).toMatchObject({ status: 'ok', removed: 1 });
    expect(await link('pl-s1')).toMatchObject({ status: 'ended', endReason: 'lms_left_all_classes' });

    // Re-added to a course: the link stays ended (a new code is needed, as on restore).
    pA.memberships['course-b'].push(L('s1'));
    expect((await sync(cb.id)).body.outcome).toMatchObject({ status: 'ok', reactivated: 1 });
    expect(await link('pl-s1')).toMatchObject({ status: 'ended' });
  });
});
