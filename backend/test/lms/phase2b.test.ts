import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { PAGE_TARGETS, resolvePageTarget } from '../../src/integrations/lms/core/pageTargets';
import { checkPickerDue, formatDueLine, zonedLocalToUtc } from '../../src/integrations/lms/core/dueDate';
import { kidsTabForLmsPage, lmsLandingPage } from '../../../frontend/services/roleRouting';
import { MockPlatform, ROLE } from './mockPlatform';

// LMS Phase 2b (docs/lms/PHASE_2_NOTES.md, "Phase 2b"): the generic launch
// target enara_target (page allowlist per role, unknown/forbidden -> the
// role's home, kids mapping), its exclusion with enara_assessment /
// enara_assignment, no grade for page links, the course link for students
// and teachers, the picker's page plug-in types (teacherOnly, no grade
// column, Arabic titles) and the optional due date (owner decision D13):
// checked, sent as enara_due, written into the description in the school's
// time zone and the picker's language, and applied once at the first binding.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_DEEP_LINKING_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_DRAIN_TRIGGERS'];
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, LMS_GRADE_PASSBACK_ENABLED: 'true', LMS_DRAIN_TRIGGERS: 'daily', LMS_DEEP_LINKING_ENABLED: 'true' };
const DL = 'https://purl.imsglobal.org/spec/lti-dl/claim/';
const DAY = 86_400_000;

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p2b-school-a';
const B = 'p2b-school-b';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let pB: MockPlatform;
let M: typeof import('../../src/integrations/lms/models');

async function makeApp() {
  return (await import('../../src/app')).createApp();
}
const MC = (id: string) => ({ id, type: 'multiple-choice', text: `Question ${id}`, topic: 'T', options: ['a', 'b'], correctAnswer: 'a', explanation: '', points: 2 });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  setLmsEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { Institution } = await import('../../src/models/Institution');
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, true]));
  // School A has no time zone set (default Africa/Cairo); school B sets its own.
  await Institution.create([{ id: A, name: 'School A', features }, { id: B, name: 'School B', features, timeZone: 'Asia/Riyadh' }]);
  const { Assessment } = await import('../../src/models/Assessment');
  const { publishAssessment } = await import('../../src/services/assessmentVersions');
  const mk = async (id: string, institutionId: string, over: Record<string, unknown> = {}) => {
    const a = await Assessment.create({ id, title: `Quiz ${id}`, institutionId, subject: 'English', status: 'active', lifecycle: 'draft', maxAttempts: 3, questions: [MC('q1'), MC('q2')], ...over });
    await publishAssessment(a, 'seed');
  };
  await mk('AS-ENG', A);
  await mk('AS-MATH', A, { subject: 'Mathematics', instructions: 'Answer every question.' });
  await mk('AS-B', B);
  const { CourseInstance } = await import('../../src/models/CourseInstance');
  await CourseInstance.create({ id: 'CLS-A', courseId: 'X', courseName: 'Class 7A', institutionId: A, batchId: 'B-A', visibility: 'student', isDemo: false, academicYear: '2026', instructorIds: [], studentIds: [] });
  const { Assignment } = await import('../../src/models/Assignment');
  await Assignment.create({ id: 'ASG-QUIZ', title: 'Family quiz', state: 'published', institutionId: A, assessmentId: 'AS-ENG', assessmentVersion: 1, classId: 'CLS-A', opensAt: new Date(), dueAt: new Date(Date.now() + 7 * DAY), createdBy: 'seed' });

  const { signAccessToken } = await import('../../src/auth/jwt');
  const u = await User.create({ email: 'enara@staff2b.test', password: 'x', role: 'enara-admin', name: 'enara' });
  const enaraAuth = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role } as never)}`;

  pA = await new MockPlatform('https://moodle.p2b-a.test', 'client-2b-a').start();
  pB = await new MockPlatform('https://moodle.p2b-b.test', 'client-2b-b').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  for (const [p, inst] of [[pA, A], [pB, B]] as const) {
    const r = await request(app).post('/api/lms/platforms').set('Authorization', enaraAuth).send({
      institutionId: inst, vendor: 'moodle', issuer: p.issuer, clientId: p.clientId,
      authLoginUrl: p.authLoginUrl, keysetUrl: p.keysetUrl, authTokenUrl: p.tokenUrl, deploymentIds: [p.deploymentId],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
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
  setLmsEnv(ON);
  app = await makeApp();
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => undefined);
});

// ------------------------------------------------------------ helpers

async function ltiPost(p: MockPlatform, over: Record<string, unknown>) {
  const lr = await request(app).post('/lti/login').type('form').send({ iss: p.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: p.clientId, lti_deployment_id: p.deploymentId });
  expect(lr.status, lr.text).toBe(302);
  const loc = new URL(lr.headers.location);
  const cookie = ([] as string[]).concat(lr.headers['set-cookie'] ?? [])[0].split(';')[0];
  const idToken = await p.sign(p.claims(loc.searchParams.get('nonce')!, TOOL, over));
  return request(app).post('/lti/launch').type('form').set('Cookie', cookie).send({ id_token: idToken, state: loc.searchParams.get('state')! });
}

const COURSE = { id: 'course-2b', label: 'ENG', title: 'English (LMS)' };

/** A normal launch, then the token exchange. Returns the session, the launch info and the user. */
async function launch(p: MockPlatform, opts: { sub: string; role: 'student' | 'teacher'; custom: Record<string, string>; link?: string; course?: typeof COURSE }) {
  const r = await ltiPost(p, {
    sub: opts.sub,
    name: 'Test Person',
    'lti:roles': [opts.role === 'student' ? ROLE.learner : ROLE.instructor],
    'lti:context': opts.course ?? COURSE,
    'lti:resource_link': { id: opts.link ?? `rl-${opts.sub}`, title: 'ENARA link' },
    'lti:custom': opts.custom,
  });
  expect(r.status, r.text).toBe(303);
  const token = new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('lt');
  const ex = await request(app).post('/api/lms/launch/exchange').send({ token });
  expect(ex.status, JSON.stringify(ex.body)).toBe(200);
  return { session: `Bearer ${ex.body.token}`, launch: ex.body.launch, user: ex.body.user };
}

const settings = (p: MockPlatform) => ({
  deep_link_return_url: `${p.issuer}/mod/lti/contentitem_return.php?course=101`,
  accept_types: ['ltiResourceLink'],
  accept_presentation_document_targets: ['iframe', 'window'],
  accept_multiple: true,
  accept_lineitem: true,
});

async function openPicker(p: MockPlatform, opts: { locale?: string; course?: string } = {}): Promise<string> {
  const r = await ltiPost(p, {
    sub: 'picker-teacher',
    'lti:message_type': 'LtiDeepLinkingRequest',
    'lti:resource_link': undefined,
    'lti:roles': [ROLE.instructor],
    'lti:context': { id: opts.course ?? COURSE.id, label: 'ENG', title: 'English (LMS)' },
    'lti:launch_presentation': { document_target: 'iframe', locale: opts.locale ?? 'en' },
    [`${DL}deep_linking_settings`]: settings(p),
  });
  expect(r.status, r.text).toBe(303);
  return new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('ps')!;
}

type Pick = { type: string; id: string; due?: string };
const api = (secret: string) => ({
  session: () => request(app).get('/api/lms/picker/session').set('X-Lms-Picker', secret),
  items: () => request(app).get('/api/lms/picker/items').set('X-Lms-Picker', secret),
  submit: (items: Pick[]) => request(app).post('/api/lms/picker/submit').set('X-Lms-Picker', secret).send({ items }),
});

async function contentItems(p: MockPlatform, jwt: string): Promise<Record<string, any>[]> {
  const jwks = await request(app).get('/.well-known/jwks.json');
  const { payload } = await jwtVerify(jwt, createLocalJWKSet(jwks.body), { issuer: p.clientId, audience: p.issuer, algorithms: ['RS256'] });
  return payload[`${DL}content_items`] as Record<string, any>[];
}

const contextClass = async (course = COURSE.id) => (await M.LmsContext.findOne({ externalContextId: course }).lean())!.enaraClassId!;

// A due date safely ahead: 25 November next year, 23:59 school time (winter: Cairo is UTC+2).
const NEXT_YEAR = new Date().getUTCFullYear() + 1;
const DUE_LOCAL = `${NEXT_YEAR}-11-25T23:59`;
const DUE_UTC = `${NEXT_YEAR}-11-25T21:59:00.000Z`;

// -------------------------------------------------------------- tests

describe('page targets: the allowlist per role (pageTargets.resolvePageTarget)', () => {
  const STUDENT: Record<string, string> = { home: 'dashboard', 'my-learning': 'courses', 'my-progress': 'progress', 'my-assignments': 'assignments-student', 'study-plan': 'study-plan', results: 'results' };
  const STAFF: Record<string, string> = { home: 'teaching', teaching: 'teaching', 'class-assignments': 'class-assignments', grading: 'grading', 'class-insights': 'class-insights', 'lesson-planner': 'lesson-planner', 'assessment-builder': 'assessment-builder', curriculum: 'curriculum' };

  it('every key lands on its page for an allowed role, and on that role\'s home otherwise', () => {
    expect(PAGE_TARGETS.map((p) => p.key).sort()).toEqual([...new Set([...Object.keys(STUDENT), ...Object.keys(STAFF)])].sort());
    for (const p of PAGE_TARGETS) {
      const s = resolvePageTarget(p.key, 'student');
      if (STUDENT[p.key]) expect(s, p.key).toEqual({ key: p.key, page: STUDENT[p.key] });
      else expect(s, p.key).toEqual({ key: 'home', page: 'dashboard', fallback: 'forbidden' });
      for (const role of ['teacher', 'admin'] as const) {
        const t = resolvePageTarget(p.key, role);
        if (STAFF[p.key]) expect(t, `${role} ${p.key}`).toEqual({ key: p.key, page: STAFF[p.key] });
        else expect(t, `${role} ${p.key}`).toEqual({ key: 'home', page: 'teaching', fallback: 'forbidden' });
      }
    }
  });

  it('unknown keys (and school-admin pages, which are not on the list) land on the role\'s home', () => {
    for (const k of ['nope', 'dashboard', 'lms', 'people', 'usage', '$ResourceLink.id', 'live-avatars']) {
      expect(resolvePageTarget(k, 'student')).toEqual({ key: 'home', page: 'dashboard', fallback: 'unknown' });
      expect(resolvePageTarget(k, 'teacher')).toEqual({ key: 'home', page: 'teaching', fallback: 'unknown' });
    }
    expect(resolvePageTarget('My-Progress', 'student').page).toBe('progress'); // case-insensitive
  });

  it('the app keeps a resolved page for its role; Enara Kids maps student pages to kids tabs or home', () => {
    for (const page of ['dashboard', 'courses', 'progress', 'assignments-student', 'study-plan', 'results']) expect(lmsLandingPage('student', 'student', { page }, 'x')).toBe(page);
    for (const page of ['teaching', 'class-assignments', 'grading', 'class-insights', 'lesson-planner', 'assessment-builder', 'curriculum']) expect(lmsLandingPage('admin', 'teacher', { page }, 'x')).toBe(page);
    expect(lmsLandingPage('admin', 'teacher', { page: 'people' }, 'x')).toBe('teaching'); // never a school-admin page
    expect(kidsTabForLmsPage('dashboard')).toBe('home');
    expect(kidsTabForLmsPage('courses')).toBe('learning');
    expect(kidsTabForLmsPage('progress')).toBe('progress');
    expect(kidsTabForLmsPage('assignments-student')).toBe('assignments');
    expect(kidsTabForLmsPage('study-plan')).toBe('plan');
    expect(kidsTabForLmsPage('results')).toBe('results');
    expect(kidsTabForLmsPage('grading')).toBe('home');
    expect(kidsTabForLmsPage(undefined)).toBe('home');
  });
});

describe('launches with enara_target', () => {
  it('a student lands on student pages; a teacher-only or unknown page lands on their own home', async () => {
    const cases: [string, string][] = [['my-progress', 'progress'], ['my-assignments', 'assignments-student'], ['results', 'results'], ['grading', 'dashboard'], ['curriculum', 'dashboard'], ['made-up', 'dashboard']];
    for (const [target, page] of cases) {
      const s = await launch(pA, { sub: 'st-pages', role: 'student', custom: { enara_target: target }, link: `rl-st-${target}` });
      expect(s.launch.target, target).toEqual({ kind: 'page', page });
      expect(s.user.role).toBe('student');
    }
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch', 'refIds.pageTarget': 'home', 'refIds.pageFallback': 'forbidden' }).lean();
    expect(audit?.refIds).toMatchObject({ page: 'dashboard', role: 'student' });
  });

  it("a teacher lands on teacher pages for the course's class; a student-only or unknown page lands on the Teaching Dashboard", async () => {
    const cases: [string, string][] = [['teaching', 'teaching'], ['grading', 'grading'], ['class-insights', 'class-insights'], ['lesson-planner', 'lesson-planner'], ['assessment-builder', 'assessment-builder'], ['curriculum', 'curriculum'], ['my-progress', 'teaching'], ['nope', 'teaching']];
    for (const [target, page] of cases) {
      const t = await launch(pA, { sub: 'tc-pages', role: 'teacher', custom: { enara_target: target }, link: `rl-tc-${target}` });
      expect(t.launch.target, target).toEqual({ kind: 'page', page });
      expect(t.launch.classId).toBe(await contextClass());
    }
  });

  it('a teacher previewing as a student gets the student page (a teacher-only link: their student home)', async () => {
    await launch(pA, { sub: 'tc-preview', role: 'teacher', custom: { enara_target: 'home' }, link: 'rl-preview' });
    const p = await launch(pA, { sub: 'tc-preview', role: 'student', custom: { enara_target: 'grading' }, link: 'rl-preview' });
    expect(p.launch.preview).toBe(true);
    expect(p.launch.target).toEqual({ kind: 'page', page: 'dashboard' });
  });

  it('enara_target together with enara_assessment or enara_assignment is refused (invalid_activity_binding)', async () => {
    for (const custom of [{ enara_target: 'home', enara_assessment: 'AS-ENG' }, { enara_target: 'grading', enara_assignment: 'ASG-QUIZ' }]) {
      const r = await ltiPost(pA, { sub: 'tc-both', 'lti:roles': [ROLE.instructor], 'lti:context': COURSE, 'lti:resource_link': { id: 'rl-both', title: 'x' }, 'lti:custom': custom });
      expect(r.status).toBe(400);
      expect(r.text).toContain('invalid_activity_binding');
    }
    expect(await M.LmsResourceLink.exists({ externalResourceLinkId: 'rl-both' })).toBeNull();
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch', code: 'invalid_activity_binding' }).sort({ createdAt: -1 }).lean();
    expect(audit?.refIds).toMatchObject({ reason: 'target_and_work' });
  });

  it('no grade is ever sent for a page link: nothing is bound, and the outbox never queues it (even if it was bound before)', async () => {
    const s = await launch(pA, { sub: 'st-nograde', role: 'student', custom: { enara_target: 'home' }, link: 'rl-nograde' });
    expect(s.launch.target.kind).toBe('page');
    const link = (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-nograde' }).lean())!;
    expect(link.enaraActivityId).toBeUndefined();
    const { enqueueForLink } = await import('../../src/integrations/lms/core/outbox');
    expect((await enqueueForLink(link, 'any-student', 'test')).outcome).toBe('page_target');

    // An activity first bound to a quiz, then changed in Moodle to a page link.
    const t = await launch(pA, { sub: 'tc-changed', role: 'teacher', custom: { enara_assessment: 'AS-ENG' }, link: 'rl-changed' });
    expect(t.launch.target.kind).toBe('assignment');
    const after = await launch(pA, { sub: 'tc-changed', role: 'teacher', custom: { enara_target: 'grading' }, link: 'rl-changed' });
    expect(after.launch.target).toEqual({ kind: 'page', page: 'grading' });
    const changed = (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-changed' }).lean())!;
    expect((await enqueueForLink(changed, 'any-student', 'test')).outcome).toBe('page_target');
    expect(await M.LmsGradeSyncJob.countDocuments({ resourceLinkId: { $in: [link.id, changed.id] } })).toBe(0);
  });
});

describe('the course link (D12: one role-routed ENARA link)', () => {
  it("a student opens their dashboard in the course's class; a teacher the Teaching Dashboard for that class", async () => {
    const course = { id: 'course-home', label: 'H', title: 'Home course' };
    const t = await launch(pA, { sub: 'tc-home', role: 'teacher', custom: { enara_target: 'home' }, link: 'rl-home', course });
    const classId = await contextClass('course-home');
    expect(t.launch).toMatchObject({ classId, target: { kind: 'page', page: 'teaching' } });
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    const teacherLink = (await M.LmsUser.findOne({ externalUserId: 'tc-home' }).lean())!;
    expect((await CourseInstance.findOne({ id: classId }).lean())!.instructorIds).toContain(teacherLink.enaraUserId);

    const s = await launch(pA, { sub: 'st-home', role: 'student', custom: { enara_target: 'home' }, link: 'rl-home', course });
    expect(s.launch).toMatchObject({ classId, target: { kind: 'page', page: 'dashboard' } });
    expect((await CourseInstance.findOne({ id: classId }).lean())!.studentIds).toContain(s.user.studentId);
    // The same link for both, with no grade column and nothing bound.
    const link = (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-home' }).lean())!;
    expect(link.enaraActivityId).toBeUndefined();
  });
});

describe('the picker: page plug-in types', () => {
  it('lists "ENARA home (course link)" and "ENARA pages" (no grade column, teacher-only pages flagged), and the school time zone', async () => {
    const secret = await openPicker(pA, { course: 'course-fresh' });
    const s = await api(secret).session();
    expect(s.body.timeZone).toBe('Africa/Cairo'); // school A has none set: the default
    const types = Object.fromEntries(s.body.types.map((t: { type: string }) => [t.type, t]));
    expect(types.course_link).toEqual({ type: 'course_link', label: { en: 'ENARA home (course link)', ar: 'الصفحة الرئيسية لإنارة (رابط المقرر)' }, dueDate: false });
    expect(types.enara_page).toMatchObject({ label: { en: 'ENARA pages', ar: 'صفحات إنارة' }, dueDate: false });
    expect(types.assessment.dueDate).toBe(true);
    expect(types.assignment.dueDate).toBe(true);

    const items = (await api(secret).items()).body.items as Record<string, any>[];
    const home = items.filter((i) => i.type === 'course_link');
    expect(home).toHaveLength(1);
    expect(home[0]).toMatchObject({ id: 'home', title: 'ENARA home (course link)', graded: false, needsMedia: false, alreadyAdded: false });
    expect(home[0].teacherOnly).toBeUndefined();
    const pages = Object.fromEntries(items.filter((i) => i.type === 'enara_page').map((i) => [i.id, i]));
    expect(Object.keys(pages).sort()).toEqual(['assessment-builder', 'class-assignments', 'class-insights', 'curriculum', 'grading', 'lesson-planner', 'my-assignments', 'my-learning', 'my-progress', 'results', 'study-plan', 'teaching']);
    for (const k of ['teaching', 'class-assignments', 'grading', 'class-insights', 'lesson-planner', 'assessment-builder', 'curriculum']) expect(pages[k].teacherOnly, k).toBe(true);
    for (const k of ['my-learning', 'my-progress', 'my-assignments', 'study-plan', 'results']) expect(pages[k].teacherOnly, k).toBeUndefined();
    expect(Object.values(pages).every((i) => i.graded === false)).toBe(true);
    expect(pages['my-progress'].ar.title).toBe('تقدّمي');
    expect(JSON.stringify(items)).not.toContain('enara_target');
  });

  it('picked page links carry enara_target and no grade column; an Arabic picker sends Arabic titles', async () => {
    const r = await api(await openPicker(pA)).submit([{ type: 'course_link', id: 'home' }, { type: 'enara_page', id: 'grading' }, { type: 'enara_page', id: 'my-progress' }]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [home, grading, progress] = await contentItems(pA, r.body.jwt);
    expect(home).toMatchObject({ type: 'ltiResourceLink', title: 'ENARA home (course link)', url: `${TOOL}/lti/launch`, custom: { enara_target: 'home' } });
    expect(grading.custom).toEqual({ enara_target: 'grading' });
    expect(progress.custom).toEqual({ enara_target: 'my-progress' });
    for (const i of [home, grading, progress]) {
      expect(i.lineItem).toBeUndefined();
      expect(i.window).toBeUndefined();
    }
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.deep_link', 'refIds.step': 'response', 'refIds.pages': 3 }).lean();
    expect(audit?.refIds).toMatchObject({ graded: 0, withDue: 0 });

    const ar = await api(await openPicker(pA, { locale: 'ar' })).submit([{ type: 'course_link', id: 'home' }]);
    const [arHome] = await contentItems(pA, ar.body.jwt);
    expect(arHome.title).toBe('الصفحة الرئيسية لإنارة (رابط المقرر)');
    expect(arHome.custom).toEqual({ enara_target: 'home' });
  });

  it('unknown page keys are refused; "home" is only the course link; a launched course link shows as already added', async () => {
    const secret = await openPicker(pA, { course: 'course-home' });
    expect((await api(secret).submit([{ type: 'enara_page', id: 'people' }])).status).toBe(409);
    expect((await api(secret).submit([{ type: 'enara_page', id: 'home' }])).status).toBe(409);
    const items = (await api(secret).items()).body.items as Record<string, any>[];
    expect(items.find((i) => i.type === 'course_link').alreadyAdded).toBe(true); // rl-home in course-home
  });
});

describe('the optional due date (D13)', () => {
  it('helpers: local school time to UTC, checks, and the description line in English and Arabic', () => {
    expect(zonedLocalToUtc(DUE_LOCAL, 'Africa/Cairo')!.toISOString()).toBe(DUE_UTC);
    expect(zonedLocalToUtc(`${NEXT_YEAR}-07-01T09:05`, 'Africa/Cairo')!.toISOString()).toBe(`${NEXT_YEAR}-07-01T06:05:00.000Z`); // summer time (UTC+3)
    expect(checkPickerDue('2020-01-01T10:00', 'Africa/Cairo')).toEqual({ ok: false, error: 'due_in_past' });
    expect(checkPickerDue(`${NEXT_YEAR + 2}-12-31T10:00`, 'Africa/Cairo')).toEqual({ ok: false, error: 'due_too_far' });
    for (const bad of ['tomorrow', `${NEXT_YEAR}-02-30T10:00`, `${NEXT_YEAR}-13-01T10:00`, 42]) expect(checkPickerDue(bad, 'Africa/Cairo')).toEqual({ ok: false, error: 'due_invalid' });
    const due = new Date(DUE_UTC);
    expect(formatDueLine(due, 'Africa/Cairo', 'en')).toBe(`Due: 25 Nov ${NEXT_YEAR}, 11:59 PM (Cairo time)`);
    expect(formatDueLine(due, 'Africa/Cairo', 'ar')).toBe(`موعد التسليم: 25 نوفمبر ${NEXT_YEAR}، 11:59 م (توقيت القاهرة)`);
    expect(formatDueLine(new Date(`${NEXT_YEAR}-03-02T06:05:00.000Z`), 'Asia/Riyadh', 'en')).toBe(`Due: 2 Mar ${NEXT_YEAR}, 9:05 AM (Riyadh time)`);
  });

  it('a valid due date is sent as enara_due (UTC) and added to the description in the school time zone', async () => {
    const r = await api(await openPicker(pA)).submit([{ type: 'assessment', id: 'AS-MATH', due: DUE_LOCAL }, { type: 'assessment', id: 'AS-ENG' }]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [math, eng] = await contentItems(pA, r.body.jwt);
    expect(math.custom).toEqual({ enara_assessment: 'AS-MATH', enara_due: DUE_UTC });
    expect(math.text).toBe(`Answer every question.\n\nDue: 25 Nov ${NEXT_YEAR}, 11:59 PM (Cairo time)`);
    expect(math.lineItem.scoreMaximum).toBe(100);
    expect(eng.custom).toEqual({ enara_assessment: 'AS-ENG' }); // no due date picked: nothing added
    expect(eng.text).toBeUndefined();
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.deep_link', 'refIds.step': 'response', 'refIds.withDue': 1 }).lean();
    expect(audit).toBeTruthy();
  });

  it('an Arabic picker writes the Arabic line (Western digits); a school with its own time zone uses it', async () => {
    const ar = await api(await openPicker(pA, { locale: 'ar-EG' })).submit([{ type: 'assignment', id: 'ASG-QUIZ', due: DUE_LOCAL }]);
    expect(ar.status, JSON.stringify(ar.body)).toBe(200);
    const [quiz] = await contentItems(pA, ar.body.jwt);
    expect(quiz.custom).toEqual({ enara_assignment: 'ASG-QUIZ', enara_due: DUE_UTC });
    expect(quiz.text).toBe(`موعد التسليم: 25 نوفمبر ${NEXT_YEAR}، 11:59 م (توقيت القاهرة)`);

    const secretB = await openPicker(pB);
    expect((await api(secretB).session()).body.timeZone).toBe('Asia/Riyadh');
    const b = await api(secretB).submit([{ type: 'assessment', id: 'AS-B', due: DUE_LOCAL }]);
    const [itemB] = await contentItems(pB, b.body.jwt);
    expect(itemB.custom.enara_due).toBe(`${NEXT_YEAR}-11-25T20:59:00.000Z`); // Riyadh is UTC+3
    expect(itemB.text).toBe(`Due: 25 Nov ${NEXT_YEAR}, 11:59 PM (Riyadh time)`);
  });

  it('past, too far, malformed, or on an item type without due dates: refused, and the session stays usable', async () => {
    const secret = await openPicker(pA);
    const cases: [Pick, string][] = [
      [{ type: 'assessment', id: 'AS-ENG', due: '2020-01-01T10:00' }, 'due_in_past'],
      [{ type: 'assessment', id: 'AS-ENG', due: `${NEXT_YEAR + 2}-12-31T10:00` }, 'due_too_far'],
      [{ type: 'assessment', id: 'AS-ENG', due: 'next friday' }, 'due_invalid'],
      [{ type: 'course_link', id: 'home', due: DUE_LOCAL }, 'due_not_supported'],
    ];
    for (const [pick, error] of cases) {
      const r = await api(secret).submit([pick]);
      expect(r.status, error).toBe(400);
      expect(r.body).toEqual({ error, type: pick.type, id: pick.id });
    }
    expect((await api(secret).submit([{ type: 'assessment', id: 'AS-ENG', due: '' }])).status).toBe(200);
  });

  it('the first binding stores the picked due date (UTC) on the ENARA assignment, in the school time zone', async () => {
    const t = await launch(pA, { sub: 'tc-due', role: 'teacher', custom: { enara_assessment: 'AS-MATH', enara_due: DUE_UTC }, link: 'rl-due' });
    const { Assignment } = await import('../../src/models/Assignment');
    const a = (await Assignment.findOne({ id: t.launch.target.assignmentId }).lean())!;
    expect(a.dueAt.toISOString()).toBe(DUE_UTC);
    expect(a.timeZone).toBe('Africa/Cairo');
    expect(a.classId).toBe(await contextClass());
    const audit = await M.LmsAuditLog.findOne({ event: 'activity.bound', 'refIds.resourceLinkId': (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-due' }).lean())!.id }).lean();
    expect(audit?.refIds).toMatchObject({ dueFrom: 'picker', created: true });

    // An assignment of another class: the picked date replaces the source's.
    const t2 = await launch(pA, { sub: 'tc-due', role: 'teacher', custom: { enara_assignment: 'ASG-QUIZ', enara_due: DUE_UTC }, link: 'rl-due-asg' });
    expect((await Assignment.findOne({ id: t2.launch.target.assignmentId }).lean())!.dueAt.toISOString()).toBe(DUE_UTC);
  });

  it('applied once: a later change in ENARA wins, and later launches (even with another enara_due) never re-apply it', async () => {
    const { Assignment } = await import('../../src/models/Assignment');
    const link = (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-due' }).lean())!;
    const edited = new Date(Date.now() + 40 * DAY);
    await Assignment.updateOne({ id: link.enaraActivityId }, { $set: { dueAt: edited } });
    await launch(pA, { sub: 'st-due', role: 'student', custom: { enara_assessment: 'AS-MATH', enara_due: DUE_UTC }, link: 'rl-due' });
    await launch(pA, { sub: 'tc-due', role: 'teacher', custom: { enara_assessment: 'AS-MATH', enara_due: `${NEXT_YEAR}-12-01T10:00:00.000Z` }, link: 'rl-due' });
    expect((await Assignment.findOne({ id: link.enaraActivityId }).lean())!.dueAt.toISOString()).toBe(edited.toISOString());
    expect(await Assignment.countDocuments({ id: /^asg-lms-/, 'history.detail.lmsResourceLinkId': link.id })).toBe(1);
  });

  it('no due date: the old default (one year); a picked date that passed before the first launch: the default too', async () => {
    const { Assignment } = await import('../../src/models/Assignment');
    const near = (d: Date, ms: number) => Math.abs(d.getTime() - ms) < 60_000;
    const t = await launch(pA, { sub: 'tc-due', role: 'teacher', custom: { enara_assessment: 'AS-ENG' }, link: 'rl-nodue' });
    const a = (await Assignment.findOne({ id: t.launch.target.assignmentId }).lean())!;
    expect(near(a.dueAt, Date.now() + 365 * DAY)).toBe(true);
    expect(a.timeZone).toBe('UTC');

    const passed = await launch(pA, { sub: 'tc-due', role: 'teacher', custom: { enara_assessment: 'AS-ENG', enara_due: '2020-01-01T10:00:00.000Z' }, link: 'rl-passed' });
    expect(near((await Assignment.findOne({ id: passed.launch.target.assignmentId }).lean())!.dueAt, Date.now() + 365 * DAY)).toBe(true);
    const audit = await M.LmsAuditLog.findOne({ event: 'activity.bound', 'refIds.assignmentId': passed.launch.target.assignmentId }).lean();
    expect(audit?.refIds.dueFrom).toBe('picker_passed');

    // A malformed enara_due (typed by hand) is ignored, not a launch error.
    const odd = await launch(pA, { sub: 'tc-due', role: 'teacher', custom: { enara_assessment: 'AS-ENG', enara_due: 'soon' }, link: 'rl-odd' });
    expect(odd.launch.target.kind).toBe('assignment');
  });
});
