import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { LMS_ROLE_NOT_SUPPORTED, lmsLaunchPortal, showOldAssessmentsTab, staffLandingPage, staffPageAllowed } from '../../../frontend/services/roleRouting';
import { MockPlatform, ROLE } from './mockPlatform';

// LMS Priority 0, items 1, 5 and 6:
//  1. A launch opens a portal from the ENARA account's own role: student ->
//     student app, teacher/admin -> staff portal (teachers kept to teacher
//     pages), parent -> Parents Portal. Any other role never gets the admin
//     UI: the landing page shows an error with a reference code, and the
//     exchange refuses the token (LMS_ROLE_NOT_SUPPORTED, no session).
//  5. A student's launch makes the Moodle course's ENARA class their current
//     class (multi-class only, only when actively enrolled; audited, IDs only).
//  6. LMS students: the older "Assessments" tab is hidden and an attempt
//     without an assignment is refused (LMS_USE_CLASS_ASSIGNMENT); class
//     assignments keep working.
// Local mock platform only (127.0.0.1); no network.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const KEYS = [
  'LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_DEEP_LINKING_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS',
  'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL', 'ENROLLMENT_DUAL_WRITE', 'ENROLLMENT_READ_FROM', 'ENROLLMENT_MULTI_CLASS',
];
const LTI = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK };
const ALL7 = 'student_app,teacher_rosters,assessments,analytics,profile_context,credits,attendance';
const MULTI = { ...LTI, ENROLLMENT_DUAL_WRITE: 'true', ENROLLMENT_READ_FROM: ALL7, ENROLLMENT_MULTI_CLASS: 'true' };

function setEnv(vars: Record<string, string | undefined>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p0-school-a';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let platformA: string;
const auth: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');
let User: typeof import('../../src/models/User').User;
let StudentClassChoice: typeof import('../../src/models/StudentClassChoice').StudentClassChoice;
let issueLaunchToken: typeof import('../../src/integrations/lms/core/launchToken').issueLaunchToken;

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

const MC = (id: string, correct: string) => ({ id, type: 'multiple-choice', text: `Question ${id}`, topic: 'Grammar', options: [correct, 'other'], correctAnswer: correct, explanation: '', points: 1 });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete process.env[k];
  setEnv(LTI);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  ({ User } = await import('../../src/models/User'));
  await User.createIndexes();
  ({ StudentClassChoice } = await import('../../src/models/StudentClassChoice'));
  const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
  await ClassEnrollment.createIndexes();
  const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
  await AssessmentAttempt.createIndexes();
  ({ issueLaunchToken } = await import('../../src/integrations/lms/core/launchToken'));
  const { Institution } = await import('../../src/models/Institution');
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, f !== 'ai_grading_enabled']));
  await Institution.create({ id: A, name: 'School A', features });

  const { Assessment } = await import('../../src/models/Assessment');
  const { publishAssessment } = await import('../../src/services/assessmentVersions');
  const a = await Assessment.create({ id: 'AS-P0', title: 'Quiz P0', institutionId: A, subject: 'English', status: 'active', lifecycle: 'draft', maxAttempts: 5, questions: [MC('q1', 'yes'), MC('q2', 'no')] });
  await publishAssessment(a, 'seed');

  const { CourseInstance } = await import('../../src/models/CourseInstance');
  // A second ENARA class of the school, and one the LMS student is never in.
  await CourseInstance.create([
    { id: 'CLS-P0-EXTRA', courseId: 'X', courseName: 'Extra class', institutionId: A, batchId: 'B-P0-EXTRA', visibility: 'student', isDemo: false, academicYear: '2026', instructorIds: [], studentIds: [] },
    { id: 'CLS-P0-OTHER', courseId: 'Y', courseName: 'Other class', institutionId: A, batchId: 'B-P0-OTHER', visibility: 'student', isDemo: false, academicYear: '2026', instructorIds: [], studentIds: [] },
  ]);

  const { signAccessToken } = await import('../../src/auth/jwt');
  const mkUser = async (key: string, role: string, institutionId?: string) => {
    const u = await User.create({ email: `${key}@staff.test`, password: 'x', role, name: key, institutionId });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
    return u;
  };
  await mkUser('enara', 'enara-admin');
  await mkUser('adminA', 'admin', A);

  pA = await new MockPlatform('https://moodle.p0.test', 'client-p0').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({
    institutionId: A, vendor: 'moodle', issuer: pA.issuer, clientId: pA.clientId, authLoginUrl: pA.authLoginUrl, keysetUrl: pA.keysetUrl, authTokenUrl: pA.tokenUrl, deploymentIds: [pA.deploymentId],
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  platformA = r.body.platform.id;
}, 180_000);

afterAll(async () => {
  setEnv({});
  await pA?.stop();
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

async function launchToken(p: MockPlatform, over: Record<string, unknown> = {}) {
  const r = await launch(p, over);
  expect(r.status, r.text).toBe(303);
  return new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('lt')!;
}

const exchange = (token: string) => request(app).post('/api/lms/launch/exchange').send({ token });

async function launchAndExchange(p: MockPlatform, over: Record<string, unknown> = {}) {
  const ex = await exchange(await launchToken(p, over));
  expect(ex.status, JSON.stringify(ex.body)).toBe(200);
  return { session: `Bearer ${ex.body.token}`, launch: ex.body.launch, user: ex.body.user };
}

const course = (id: string, rl = `rl-${id}`, custom: Record<string, string> = {}) => ({
  'lti:context': { id, label: id.toUpperCase(), title: `Course ${id}` },
  'lti:resource_link': { id: rl, title: `Activity ${rl}` },
  'lti:custom': custom,
});
const learner = (sub: string, c: Record<string, unknown>) =>
  launchAndExchange(pA, { sub, name: 'Layla Hassan', given_name: 'Layla', family_name: 'Hassan', email: `${sub}@school.example`, 'lti:roles': [ROLE.learner], ...c });
const instructor = (sub: string, c: Record<string, unknown>) => launchAndExchange(pA, { sub, 'lti:roles': [ROLE.instructor], ...c });
const noPii = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/Layla|Hassan|@school\.example/);

/** A launch token for an existing ENARA account (as a validated launch would issue). */
async function tokenFor(userId: string, extra: Record<string, unknown> = {}) {
  const lu = await M.LmsUser.create({ platformId: platformA, institutionId: A, externalUserId: `ext-${userId}`, enaraUserId: userId });
  return issueLaunchToken({ institutionId: A, enaraUserId: userId, purpose: 'launch', enaraRole: 'student', platformId: platformA, lmsUserId: lu.id, presentation: 'iframe', cookieless: false, ...extra } as never);
}

// --------------------------------------------------------------- item 1

describe('P0-1: the launch portal comes from the ENARA account role (frontend roleRouting.lmsLaunchPortal)', () => {
  it('student -> student app; teacher and school admin -> staff portal; parent -> Parents Portal', () => {
    expect(lmsLaunchPortal('student')).toEqual({ role: 'student', code: null });
    expect(lmsLaunchPortal('teacher')).toEqual({ role: 'admin', code: null });
    expect(lmsLaunchPortal('admin')).toEqual({ role: 'admin', code: null });
    expect(lmsLaunchPortal('parent')).toEqual({ role: 'parent', code: null });
    // The staff portal keeps a teacher on teacher pages, landing on the Teaching Dashboard.
    expect(staffLandingPage('teacher')).toBe('teaching');
    expect(staffPageAllowed('teacher', 'lms')).toBe(false);
    expect(staffPageAllowed('teacher', 'people')).toBe(false);
  });

  it('every other or unknown role gets the error view (never the admin UI)', () => {
    for (const role of ['enara-admin', 'academic_manager', 'observer', 'Instructor', 'mentor', '', 'constructor', '__proto__', 'toString', undefined, null]) {
      expect(lmsLaunchPortal(role as string), String(role)).toEqual({ role: null, code: LMS_ROLE_NOT_SUPPORTED });
    }
    expect(LMS_ROLE_NOT_SUPPORTED).toBe('lms_role_not_supported');
  });

  it('a preview stays the student view, and only for a teacher or school admin account', () => {
    expect(lmsLaunchPortal('teacher', true)).toEqual({ role: 'student', code: null });
    expect(lmsLaunchPortal('admin', true)).toEqual({ role: 'student', code: null });
    for (const role of ['student', 'parent', 'enara-admin', 'academic_manager', 'observer']) {
      expect(lmsLaunchPortal(role, true).role, role).toBeNull();
    }
  });
});

describe('P0-1: the launch exchange refuses unsupported account roles (server side)', () => {
  it('a learner, an instructor: a session as before, with the account role', async () => {
    const s = await learner('p0-stu-1', course('course-p0-1'));
    expect(s.user.role).toBe('student');
    expect(lmsLaunchPortal(s.user.role, s.launch.preview === true).role).toBe('student');
    const t = await instructor('p0-teacher-1', course('course-p0-1'));
    expect(t.user.role).toBe('teacher');
    expect(lmsLaunchPortal(t.user.role).role).toBe('admin');
  });

  it('ENARA admin, academic manager or an unknown role: 403 LMS_ROLE_NOT_SUPPORTED, no session, audited', async () => {
    for (const role of ['enara-admin', 'academic_manager', 'observer']) {
      const u = await User.create({ email: `p0-${role}@staff.test`, password: 'x', role: role === 'observer' ? 'teacher' : role, name: role, institutionId: A });
      // An unknown role cannot be stored through the model: write it as raw data.
      if (role === 'observer') await User.collection.updateOne({ _id: u._id }, { $set: { role: 'observer' } });
      const ex = await exchange(await tokenFor(u._id.toString()));
      expect(ex.status, role).toBe(403);
      expect(ex.body.error.code).toBe('LMS_ROLE_NOT_SUPPORTED');
      expect(ex.body.token).toBeUndefined();
      expect(ex.body.user).toBeUndefined();
    }
    const rows = await M.LmsAuditLog.find({ event: 'lms.session', code: 'role_not_supported' }).lean();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.outcome === 'fail' && r.institutionId === A)).toBe(true);
  });

  it('an account whose role changed after the launch (teacher -> academic manager) is refused at the exchange', async () => {
    const token = await launchToken(pA, { sub: 'p0-teacher-2', 'lti:roles': [ROLE.instructor], ...course('course-p0-1') });
    const lu = await M.LmsUser.findOne({ externalUserId: 'p0-teacher-2' }).lean();
    await User.updateOne({ _id: lu!.enaraUserId }, { $set: { role: 'academic_manager' } });
    const ex = await exchange(token);
    expect([ex.status, ex.body.error?.code]).toEqual([403, 'LMS_ROLE_NOT_SUPPORTED']);
  });

  it('a parent account: a session for the Parents Portal; a school admin: the staff portal', async () => {
    for (const [role, portal] of [['parent', 'parent'], ['admin', 'admin']] as const) {
      const u = await User.create({ email: `p0-ok-${role}@staff.test`, password: 'x', role, name: role, institutionId: A });
      const ex = await exchange(await tokenFor(u._id.toString()));
      expect(ex.status, JSON.stringify(ex.body)).toBe(200);
      expect(ex.body.user.role).toBe(role);
      expect(lmsLaunchPortal(ex.body.user.role, ex.body.launch.preview === true).role).toBe(portal);
    }
  });
});

// --------------------------------------------------------------- item 5

describe('P0-5: the launch selects the course class as the current class (multi-class)', () => {
  let studentId: string;
  let session: string;
  let lmsClass: string;

  afterAll(() => setEnv(LTI));

  const myClasses = async (s: string) => (await request(app).get('/api/multi-class/me/classes').set('Authorization', s)).body;

  it('a multi-class student who switched to another class gets the LMS class back at the next launch (audited, IDs only)', async () => {
    setEnv(MULTI);
    const first = await learner('p0-mc-1', course('course-mc-1'));
    lmsClass = first.launch.classId;
    studentId = first.user.studentId;
    // An admin adds them to a second ENARA class: now a multi-class student.
    const add = await request(app).post(`/api/multi-class/students/${studentId}/enrollments`).set('Authorization', auth.adminA).send({ scope: 'class', targetId: 'CLS-P0-EXTRA' });
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    session = first.session;
    const sw = await request(app).put('/api/multi-class/me/classes/current').set('Authorization', session).send({ classId: 'CLS-P0-EXTRA' });
    expect(sw.status, JSON.stringify(sw.body)).toBe(200);
    expect(sw.body.current).toBe('CLS-P0-EXTRA');

    const again = await learner('p0-mc-1', course('course-mc-1'));
    session = again.session;
    const mine = await myClasses(session);
    expect(mine).toMatchObject({ enabled: true, showSwitcher: true, current: lmsClass, currentSource: 'last_used' });
    const audit = await M.LmsAuditLog.findOne({ event: 'lms.current_class', code: 'selected' }).sort({ createdAt: -1 }).lean();
    expect(audit).toMatchObject({ outcome: 'ok', institutionId: A, platformId: platformA, refIds: { studentId, enaraClassId: lmsClass } });
    noPii(audit);
  });

  it('nothing changes when the student is not actively enrolled in that class (audited as not_enrolled)', async () => {
    await StudentClassChoice.updateOne({ studentId }, { $set: { classId: 'CLS-P0-EXTRA' } });
    const lu = await M.LmsUser.findOne({ externalUserId: 'p0-mc-1' }).lean();
    const token = await issueLaunchToken({ institutionId: A, enaraUserId: lu!.enaraUserId!, purpose: 'launch', enaraRole: 'student', platformId: platformA, lmsUserId: lu!.id, enaraClassId: 'CLS-P0-OTHER', presentation: 'iframe', cookieless: false });
    const ex = await exchange(token);
    expect(ex.status).toBe(200);
    expect((await StudentClassChoice.findOne({ studentId }).lean())!.classId).toBe('CLS-P0-EXTRA');
    const audit = await M.LmsAuditLog.findOne({ event: 'lms.current_class', code: 'not_enrolled' }).lean();
    expect(audit).toMatchObject({ outcome: 'warn', refIds: { studentId, enaraClassId: 'CLS-P0-OTHER' } });
    // A removed membership counts as not enrolled too.
    const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
    await ClassEnrollment.updateOne({ studentId, targetId: 'CLS-P0-EXTRA' }, { $set: { status: 'removed' } });
    await StudentClassChoice.updateOne({ studentId }, { $set: { classId: lmsClass } });
    const t2 = await issueLaunchToken({ institutionId: A, enaraUserId: lu!.enaraUserId!, purpose: 'launch', enaraRole: 'student', platformId: platformA, lmsUserId: lu!.id, enaraClassId: 'CLS-P0-EXTRA', presentation: 'iframe', cookieless: false });
    expect((await exchange(t2)).status).toBe(200);
    expect((await StudentClassChoice.findOne({ studentId }).lean())!.classId).toBe(lmsClass);
    await ClassEnrollment.updateOne({ studentId, targetId: 'CLS-P0-EXTRA' }, { $set: { status: 'active' } });
  });

  it('a handoff ("Open in new tab") or a preview never changes it', async () => {
    await StudentClassChoice.updateOne({ studentId }, { $set: { classId: 'CLS-P0-EXTRA' } });
    const lu = await M.LmsUser.findOne({ externalUserId: 'p0-mc-1' }).lean();
    const h = await issueLaunchToken({ institutionId: A, enaraUserId: lu!.enaraUserId!, purpose: 'handoff', enaraRole: 'student', platformId: platformA, lmsUserId: lu!.id, enaraClassId: lmsClass, presentation: 'window', cookieless: false });
    expect((await exchange(h)).status).toBe(200);
    expect((await StudentClassChoice.findOne({ studentId }).lean())!.classId).toBe('CLS-P0-EXTRA');
  });

  it('a single-class student: nothing is written (they see every class, as without the switch)', async () => {
    const s = await learner('p0-mc-single', course('course-mc-1'));
    expect(await StudentClassChoice.exists({ studentId: s.user.studentId })).toBeNull();
    expect(await myClasses(s.session)).toMatchObject({ enabled: true, showSwitcher: false, current: null });
  });

  it('with ENROLLMENT_MULTI_CLASS off: no change, nothing written, no audit row', async () => {
    setEnv(LTI);
    await StudentClassChoice.updateOne({ studentId }, { $set: { classId: 'CLS-P0-EXTRA' } });
    const before = await M.LmsAuditLog.countDocuments({ event: 'lms.current_class' });
    const s = await learner('p0-mc-1', course('course-mc-1'));
    expect((await StudentClassChoice.findOne({ studentId }).lean())!.classId).toBe('CLS-P0-EXTRA');
    expect(await M.LmsAuditLog.countDocuments({ event: 'lms.current_class' })).toBe(before);
    expect(await myClasses(s.session)).toEqual({ enabled: false });
  });
});

// --------------------------------------------------------------- item 6

describe('P0-6: LMS students do their work through class assignments', () => {
  it('the older "Assessments" tab is hidden for LMS students (frontend roleRouting.showOldAssessmentsTab)', () => {
    expect(showOldAssessmentsTab({ assignmentsEnabled: true, oldAssessmentCount: 3, lmsStudent: true })).toBe(false);
    expect(showOldAssessmentsTab({ assignmentsEnabled: false, oldAssessmentCount: 0, lmsStudent: true })).toBe(false);
    // Everyone else: unchanged.
    expect(showOldAssessmentsTab({ assignmentsEnabled: false, oldAssessmentCount: 0, lmsStudent: false })).toBe(true);
    expect(showOldAssessmentsTab({ assignmentsEnabled: true, oldAssessmentCount: 0, lmsStudent: false })).toBe(false);
    expect(showOldAssessmentsTab({ assignmentsEnabled: true, oldAssessmentCount: 2, lmsStudent: false })).toBe(true);
  });

  it('the session says lmsAccount for an LMS student, and the server refuses an attempt without an assignment', async () => {
    setEnv(LTI);
    const s = await learner('p0-old-1', course('course-old-1'));
    expect(s.user.lmsAccount).toBe(true);
    const session = await request(app).get('/api/auth/session').set('Authorization', s.session);
    expect(session.body.user.lmsAccount).toBe(true);
    const r = await request(app).post('/api/me/assessments/AS-P0/attempts').set('Authorization', s.session).send({});
    expect([r.status, r.body.error.code]).toEqual([403, 'LMS_USE_CLASS_ASSIGNMENT']);
    const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
    expect(await AssessmentAttempt.countDocuments({ studentId: s.user.studentId })).toBe(0);
  });

  it('class assignments (bound LMS activities) still start for the LMS student', async () => {
    await instructor('p0-teacher-old', course('course-old-1', 'rl-old-bound', { enara_assessment: 'AS-P0' }));
    const s = await learner('p0-old-1', course('course-old-1', 'rl-old-bound', { enara_assessment: 'AS-P0' }));
    const assignmentId = s.launch.target.assignmentId as string;
    expect(assignmentId).toBeTruthy();
    const r = await request(app).post(`/api/me/assignments/${assignmentId}/attempts`).set('Authorization', s.session).send({});
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.attempt.assignmentId ?? assignmentId).toBe(assignmentId);
  });

  it('students not from an LMS, staff accounts, and every student while LMS launches are off: unchanged', async () => {
    const { Student } = await import('../../src/models/Student');
    await Student.create({ id: 'STU-P0-PLAIN', name: 'Plain', email: 'plain@p0.test', grade: '', avatar: 'P', institutionId: A });
    const plain = await User.create({ email: 'plain@p0.test', password: 'x', role: 'student', name: 'Plain', institutionId: A, studentId: 'STU-P0-PLAIN' });
    const { signAccessToken } = await import('../../src/auth/jwt');
    const bearer = `Bearer ${signAccessToken({ id: plain._id.toString(), email: plain.email, role: 'student', studentId: 'STU-P0-PLAIN', institutionId: A } as never)}`;
    const sess = await request(app).get('/api/auth/session').set('Authorization', bearer);
    expect(sess.body.user.lmsAccount).toBeUndefined();
    const r = await request(app).post('/api/me/assessments/AS-P0/attempts').set('Authorization', bearer).send({});
    expect(r.body.error?.code).not.toBe('LMS_USE_CLASS_ASSIGNMENT');

    // LMS launches off: the LMS student's existing session is treated as before.
    const s = await learner('p0-old-2', course('course-old-1'));
    setEnv({});
    try {
      const off = await request(app).get('/api/auth/session').set('Authorization', s.session);
      expect(off.status).toBe(200);
      expect(off.body.user.lmsAccount).toBeUndefined();
      const r2 = await request(app).post('/api/me/assessments/AS-P0/attempts').set('Authorization', s.session).send({});
      expect(r2.body.error?.code).not.toBe('LMS_USE_CLASS_ASSIGNMENT');
    } finally {
      setEnv(LTI);
    }
  });
});
