import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { ACTIVITY_TARGETS, PAGE_TARGETS, resolvePageTarget } from '../../src/integrations/lms/core/pageTargets';
import { lmsActivityOfPage, lmsLandingPage, kidsTabForLmsPage } from '../../../frontend/services/roleRouting';
import { MockPlatform, ROLE } from './mockPlatform';

// LMS Phase 8 ("more activities, no grade"; docs/lms/PHASE_8_NOTES.md): the
// AI tutor session, the live avatar session and the diagnostic check as
// picker items (no grade column, custom enara_target only), their launch per
// role, the flag LMS_NO_GRADE_ACTIVITIES_ENABLED, readiness without any AI
// call (provider not configured, AI paused, diagnostics off, no objectives),
// the teacher's class overview (school-scoped), "Open in a new tab" landing on
// the activity again, the audit rows and the problem help texts.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
// Every switch and provider variable this file sets; all are cleared between settings (never real values).
const KEYS = [
  'LMS_LTI_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_DEEP_LINKING_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_DRAIN_TRIGGERS', 'LMS_NO_GRADE_ACTIVITIES_ENABLED',
  'ANTHROPIC_API_KEY', 'ANAM_API_KEY', 'ANAM_AVATAR_ID', 'ANAM_VOICE_ID_EN', 'ANAM_VOICE_ID_AR', 'AI_PAUSED', 'ENARA_DEFAULT_COURSE_ID', 'DEFAULT_COURSE_ID', 'ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY',
];
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, LMS_GRADE_PASSBACK_ENABLED: 'true', LMS_DRAIN_TRIGGERS: 'daily', LMS_DEEP_LINKING_ENABLED: 'true', LMS_NO_GRADE_ACTIVITIES_ENABLED: 'true' };
const OFF = { ...ON, LMS_NO_GRADE_ACTIVITIES_ENABLED: undefined };
// Fake placeholders: readiness only checks that the variables are set; nothing is ever called.
const TUTOR = { ANTHROPIC_API_KEY: 'test-placeholder' };
const AVATAR = { ...TUTOR, ANAM_API_KEY: 'test-placeholder', ANAM_AVATAR_ID: 'test-avatar', ANAM_VOICE_ID_EN: 'test-voice-en', ANAM_VOICE_ID_AR: 'test-voice-ar' };
const DL = 'https://purl.imsglobal.org/spec/lti-dl/claim/';

function setEnv(vars: Record<string, string | undefined>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p8-school-a';
const B = 'p8-school-b';
const C = 'p8-school-c'; // diagnostics switched off
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let pB: MockPlatform;
let pC: MockPlatform;
let M: typeof import('../../src/integrations/lms/models');

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  setEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { Institution } = await import('../../src/models/Institution');
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  const all = Object.fromEntries(ALL_FLAGS.map((f) => [f, true]));
  await Institution.create([
    { id: A, name: 'School A', features: all },
    { id: B, name: 'School B', features: all },
    { id: C, name: 'School C', features: { ...all, diagnostics_enabled: false } },
  ]);
  const { signAccessToken } = await import('../../src/auth/jwt');
  const u = await User.create({ email: 'enara@staff8.test', password: 'x', role: 'enara-admin', name: 'enara' });
  const enaraAuth = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role } as never)}`;

  pA = await new MockPlatform('https://moodle.p8-a.test', 'client-8-a').start();
  pB = await new MockPlatform('https://moodle.p8-b.test', 'client-8-b').start();
  pC = await new MockPlatform('https://moodle.p8-c.test', 'client-8-c').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  for (const [p, inst] of [[pA, A], [pB, B], [pC, C]] as const) {
    const r = await request(app).post('/api/lms/platforms').set('Authorization', enaraAuth).send({
      institutionId: inst, vendor: 'moodle', issuer: p.issuer, clientId: p.clientId,
      authLoginUrl: p.authLoginUrl, keysetUrl: p.keysetUrl, authTokenUrl: p.tokenUrl, deploymentIds: [p.deploymentId],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  }
}, 180_000);

afterAll(async () => {
  setEnv({});
  await pA?.stop();
  await pB?.stop();
  await pC?.stop();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  setEnv(ON);
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

const COURSE = { id: 'course-8', label: 'ENG', title: 'English (LMS)' };

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

async function openPicker(p: MockPlatform, opts: { locale?: string; course?: string } = {}): Promise<string> {
  const r = await ltiPost(p, {
    sub: 'picker-teacher',
    'lti:message_type': 'LtiDeepLinkingRequest',
    'lti:resource_link': undefined,
    'lti:roles': [ROLE.instructor],
    'lti:context': { id: opts.course ?? COURSE.id, label: 'ENG', title: 'English (LMS)' },
    'lti:launch_presentation': { document_target: 'iframe', locale: opts.locale ?? 'en' },
    [`${DL}deep_linking_settings`]: {
      deep_link_return_url: `${p.issuer}/mod/lti/contentitem_return.php?course=101`,
      accept_types: ['ltiResourceLink'],
      accept_presentation_document_targets: ['iframe', 'window'],
      accept_multiple: true,
      accept_lineitem: true,
    },
  });
  expect(r.status, r.text).toBe(303);
  return new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('ps')!;
}

const picker = (secret: string) => ({
  session: () => request(app).get('/api/lms/picker/session').set('X-Lms-Picker', secret),
  items: () => request(app).get('/api/lms/picker/items').set('X-Lms-Picker', secret),
  submit: (items: { type: string; id: string; due?: string }[]) => request(app).post('/api/lms/picker/submit').set('X-Lms-Picker', secret).send({ items }),
});

async function contentItems(p: MockPlatform, jwt: string): Promise<Record<string, any>[]> {
  const jwks = await request(app).get('/.well-known/jwks.json');
  const { payload } = await jwtVerify(jwt, createLocalJWKSet(jwks.body), { issuer: p.clientId, audience: p.issuer, algorithms: ['RS256'] });
  return payload[`${DL}content_items`] as Record<string, any>[];
}

const contextClass = async (course = COURSE.id) => (await M.LmsContext.findOne({ externalContextId: course }).lean())!.enaraClassId!;
const status = (auth: string, kind: string, classId?: string) =>
  request(app).get(`/api/lms/activities/${kind}${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`).set('Authorization', auth);

const ACTIVITY_PICKS = [
  { type: 'tutor_session', id: 'tutor-session' },
  { type: 'live_avatar', id: 'live-avatar' },
  { type: 'diagnostic', id: 'diagnostic' },
];

// -------------------------------------------------------------- tests

describe('page targets: the three activity keys (B1)', () => {
  it('each key opens its activity page for students and staff while the flag is on', () => {
    expect(ACTIVITY_TARGETS.map((t) => [t.key, t.activity, t.student, t.staff])).toEqual([
      ['tutor-session', 'tutor', 'activity-tutor', 'activity-tutor'],
      ['live-avatar', 'avatar', 'activity-avatar', 'activity-avatar'],
      ['diagnostic', 'diagnostic', 'activity-diagnostic', 'activity-diagnostic'],
    ]);
    // Not on the Phase 2b page list ("ENARA pages" in the picker).
    for (const t of ACTIVITY_TARGETS) expect(PAGE_TARGETS.some((p) => p.key === t.key)).toBe(false);
    for (const role of ['student', 'teacher', 'admin'] as const) {
      expect(resolvePageTarget('tutor-session', role)).toEqual({ key: 'tutor-session', page: 'activity-tutor', activity: 'tutor' });
      expect(resolvePageTarget('Live-Avatar', role)).toEqual({ key: 'live-avatar', page: 'activity-avatar', activity: 'avatar' });
      expect(resolvePageTarget('diagnostic', role)).toEqual({ key: 'diagnostic', page: 'activity-diagnostic', activity: 'diagnostic' });
    }
  });

  it('flag off: the key lands on the role\'s home (fallback "disabled")', () => {
    setEnv(OFF);
    expect(resolvePageTarget('tutor-session', 'student')).toEqual({ key: 'home', page: 'dashboard', fallback: 'disabled' });
    expect(resolvePageTarget('diagnostic', 'teacher')).toEqual({ key: 'home', page: 'teaching', fallback: 'disabled' });
  });

  it('the app keeps the activity pages for both portals; Enara Kids gets kids home', () => {
    for (const page of ['activity-tutor', 'activity-avatar', 'activity-diagnostic']) {
      expect(lmsLandingPage('student', 'student', { page }, 'x')).toBe(page);
      expect(lmsLandingPage('admin', 'teacher', { page }, 'x')).toBe(page);
      expect(kidsTabForLmsPage(page)).toBe('home');
    }
    expect(lmsActivityOfPage('activity-tutor')).toBe('tutor');
    expect(lmsActivityOfPage('activity-avatar')).toBe('avatar');
    expect(lmsActivityOfPage('activity-diagnostic')).toBe('diagnostic');
    expect(lmsActivityOfPage('dashboard')).toBeNull();
    expect(lmsActivityOfPage('constructor')).toBeNull();
  });
});

describe('the picker (B2): three no-grade types behind the flag', () => {
  it('lists the three types (EN/AR labels) and one item each: no grade, mic for tutor and avatar, no custom parameters leaked', async () => {
    const api = picker(await openPicker(pA));
    const s = await api.session();
    expect(s.status).toBe(200);
    const types = s.body.types as { type: string; label: { en: string; ar: string }; dueDate: boolean }[];
    for (const t of ['tutor_session', 'live_avatar', 'diagnostic']) {
      const found = types.find((x) => x.type === t);
      expect(found, t).toBeTruthy();
      expect(found!.label.en).toBeTruthy();
      expect(found!.label.ar).toMatch(/[؀-ۿ]/);
      expect(found!.dueDate).toBe(false);
    }
    const items = (await api.items()).body.items as Record<string, any>[];
    const mine = items.filter((i) => i.activity);
    expect(mine.map((i) => [i.type, i.id, i.activity, i.graded, i.needsMedia])).toEqual([
      ['tutor_session', 'tutor-session', 'tutor', false, true],
      ['live_avatar', 'live-avatar', 'avatar', false, true],
      ['diagnostic', 'diagnostic', 'diagnostic', false, false],
    ]);
    for (const i of mine) {
      expect(i.custom).toBeUndefined();
      expect(i.ar.title).toMatch(/[؀-ۿ]/);
    }
    // Not offered again under "ENARA pages".
    expect(items.some((i) => i.type === 'enara_page' && ['tutor-session', 'live-avatar', 'diagnostic'].includes(i.id))).toBe(false);
  });

  it('the signed response: custom enara_target only, no lineItem (no grade column asked), a new window for the mic items; audited', async () => {
    const api = picker(await openPicker(pA));
    const r = await api.submit(ACTIVITY_PICKS);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const cis = await contentItems(pA, r.body.jwt);
    expect(cis.map((c) => c.custom)).toEqual([{ enara_target: 'tutor-session' }, { enara_target: 'live-avatar' }, { enara_target: 'diagnostic' }]);
    for (const c of cis) {
      expect(c.lineItem).toBeUndefined();
      expect(c.url).toBe(`${TOOL}/lti/launch`);
      expect(JSON.stringify(c)).not.toMatch(/token|code|secret/i);
    }
    expect(cis.map((c) => !!c.window)).toEqual([true, true, false]);
    expect(cis.map((c) => c.title)).toEqual(['AI tutor session', 'Live avatar session', 'Diagnostic check']);
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.deep_link', 'refIds.step': 'response', 'refIds.noGradeActivities': 3 }).lean();
    expect(audit?.refIds).toMatchObject({ items: 3, graded: 0, newWindow: 2, pages: 0 });
  });

  it('an Arabic picker sends the Arabic titles; "already added" marks them in this course afterwards', async () => {
    const course = 'course-8-ar';
    const ar = picker(await openPicker(pA, { locale: 'ar', course }));
    const r = await ar.submit([ACTIVITY_PICKS[0]]);
    expect(r.status).toBe(200);
    expect((await contentItems(pA, r.body.jwt))[0].title).toBe('جلسة مع المعلم الذكي');
    const again = picker(await openPicker(pA, { course }));
    const items = (await again.items()).body.items as Record<string, any>[];
    expect(items.find((i) => i.id === 'tutor-session')?.alreadyAdded).toBe(true);
    expect(items.find((i) => i.id === 'live-avatar')?.alreadyAdded).toBe(false);
  });

  it('flag off: the types are not offered and cannot be submitted', async () => {
    setEnv(OFF);
    app = await makeApp();
    const api = picker(await openPicker(pA));
    expect((await api.session()).body.types.map((t: { type: string }) => t.type)).not.toEqual(expect.arrayContaining(['tutor_session']));
    expect(((await api.items()).body.items as Record<string, any>[]).some((i) => i.activity)).toBe(false);
    for (const pick of ACTIVITY_PICKS) {
      const r = await api.submit([pick]);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('unknown item type');
    }
    // And not through "ENARA pages" either.
    expect((await api.submit([{ type: 'enara_page', id: 'diagnostic' }])).status).toBe(409);
  });
});

describe('launches', () => {
  it("students and teachers land on the activity page, with the course's class; audited with the activity; nothing bound, never graded", async () => {
    for (const [target, page, activity] of [['tutor-session', 'activity-tutor', 'tutor'], ['live-avatar', 'activity-avatar', 'avatar'], ['diagnostic', 'activity-diagnostic', 'diagnostic']]) {
      const link = `rl-launch-${target}`;
      const t = await launch(pA, { sub: 'tc-launch', role: 'teacher', custom: { enara_target: target }, link });
      expect(t.launch.target, target).toEqual({ kind: 'page', page });
      expect(t.launch.classId).toBe(await contextClass());
      const s = await launch(pA, { sub: 'st-launch', role: 'student', custom: { enara_target: target }, link });
      expect(s.launch.target, target).toEqual({ kind: 'page', page });
      expect(s.user.role).toBe('student');
      const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch', 'refIds.pageTarget': target, 'refIds.role': 'student' }).lean();
      expect(audit?.refIds).toMatchObject({ page, activity });
      const rl = (await M.LmsResourceLink.findOne({ externalResourceLinkId: link }).lean())!;
      expect(rl.enaraActivityId).toBeUndefined();
      const { enqueueForLink } = await import('../../src/integrations/lms/core/outbox');
      expect((await enqueueForLink(rl, s.user.studentId ?? 'x', 'test')).outcome).toBe('page_target');
    }
  });

  it('a teacher previewing as a student gets the student activity page', async () => {
    await launch(pA, { sub: 'tc-prev', role: 'teacher', custom: { enara_target: 'home' }, link: 'rl-prev8' });
    const p = await launch(pA, { sub: 'tc-prev', role: 'student', custom: { enara_target: 'live-avatar' }, link: 'rl-prev8' });
    expect(p.launch.preview).toBe(true);
    expect(p.launch.target).toEqual({ kind: 'page', page: 'activity-avatar' });
  });

  it('flag off: the launch lands on the role\'s home, audited pageFallback "disabled"', async () => {
    setEnv(OFF);
    app = await makeApp();
    const s = await launch(pA, { sub: 'st-off', role: 'student', custom: { enara_target: 'tutor-session' }, link: 'rl-off' });
    expect(s.launch.target).toEqual({ kind: 'page', page: 'dashboard' });
    const t = await launch(pA, { sub: 'tc-off', role: 'teacher', custom: { enara_target: 'tutor-session' }, link: 'rl-off' });
    expect(t.launch.target).toEqual({ kind: 'page', page: 'teaching' });
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch', 'refIds.pageFallback': 'disabled' }).lean();
    expect(audit?.refIds).toMatchObject({ pageTarget: 'home', page: 'dashboard' });
  });
});

describe('readiness (never calls an AI provider)', () => {
  it('lms-test today (no anthropic, no anam): tutor and avatar say provider_not_configured, with a warn audit; never a 500', async () => {
    const s = await launch(pA, { sub: 'st-ready', role: 'student', custom: { enara_target: 'tutor-session' }, link: 'rl-ready' });
    for (const kind of ['tutor', 'avatar']) {
      const r = await status(s.session, kind, s.launch.classId);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ kind, ready: false, code: 'activity_provider_not_configured', graded: false, needsMicrophone: true, overview: null });
    }
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.activity', outcome: 'warn', code: 'activity_provider_not_configured', 'refIds.activity': 'avatar' }).lean();
    expect(audit?.institutionId).toBe(A);
    expect(audit?.refIds).toMatchObject({ role: 'student', enaraClassId: s.launch.classId, ready: false });
  });

  it('tutor: ready with a tutor model; avatar needs Anam too; AI paused says activity_ai_paused', async () => {
    const s = await launch(pA, { sub: 'st-ready', role: 'student', custom: { enara_target: 'tutor-session' }, link: 'rl-ready' });
    setEnv({ ...ON, ...TUTOR });
    app = await makeApp();
    expect((await status(s.session, 'tutor')).body).toMatchObject({ ready: true, code: null });
    expect((await status(s.session, 'avatar')).body).toMatchObject({ ready: false, code: 'activity_provider_not_configured' });
    setEnv({ ...ON, ...AVATAR });
    app = await makeApp();
    expect((await status(s.session, 'avatar')).body).toMatchObject({ ready: true, code: null });
    setEnv({ ...ON, ...AVATAR, AI_PAUSED: 'true' });
    app = await makeApp();
    expect((await status(s.session, 'tutor')).body).toMatchObject({ ready: false, code: 'activity_ai_paused' });
    expect((await status(s.session, 'avatar')).body).toMatchObject({ ready: false, code: 'activity_ai_paused' });
    // The school's own AI pause counts too.
    setEnv({ ...ON, ...AVATAR });
    app = await makeApp();
    const { OrgBudget } = await import('../../src/models/OrgBudget');
    await OrgBudget.create({ institutionId: A, aiPaused: true });
    expect((await status(s.session, 'tutor')).body).toMatchObject({ ready: false, code: 'activity_ai_paused' });
    await OrgBudget.deleteMany({ institutionId: A });
  });

  it('diagnostic: an LMS-made class has no objectives; with a curriculum and an approved objective it is ready; another class or none: no_class', async () => {
    const s = await launch(pA, { sub: 'st-diag', role: 'student', custom: { enara_target: 'diagnostic' }, link: 'rl-diag' });
    const classId = s.launch.classId as string;
    expect((await status(s.session, 'diagnostic', classId)).body).toMatchObject({ ready: false, code: 'activity_no_objectives', needsMicrophone: false });
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    const { LearningObjective } = await import('../../src/models/LearningObjective');
    await CourseInstance.updateOne({ id: classId }, { $set: { curriculumId: 'CUR-8A' } });
    await LearningObjective.create({ id: 'LO-8A-draft', institutionId: A, curriculumId: 'CUR-8A', code: 'D1', title: 'Draft one', status: 'draft' });
    expect((await status(s.session, 'diagnostic', classId)).body.code).toBe('activity_no_objectives');
    await LearningObjective.create({ id: 'LO-8A', institutionId: A, curriculumId: 'CUR-8A', code: 'O1', title: 'Objective one', status: 'approved' });
    expect((await status(s.session, 'diagnostic', classId)).body).toMatchObject({ ready: true, code: null });
    // An approved objective of another school with the same curriculum id does not count.
    await LearningObjective.deleteOne({ id: 'LO-8A' });
    await LearningObjective.create({ id: 'LO-8B', institutionId: B, curriculumId: 'CUR-8A', code: 'O1', title: 'Other school', status: 'approved' });
    expect((await status(s.session, 'diagnostic', classId)).body.code).toBe('activity_no_objectives');
    await LearningObjective.create({ id: 'LO-8A', institutionId: A, curriculumId: 'CUR-8A', code: 'O1', title: 'Objective one', status: 'approved' });
    // A class the student is not in, or none at all.
    const other = await launch(pA, { sub: 'tc-other', role: 'teacher', custom: { enara_target: 'home' }, link: 'rl-other', course: { id: 'course-8-other', label: 'O', title: 'Other' } });
    expect((await status(s.session, 'diagnostic', other.launch.classId)).body.code).toBe('activity_no_class');
    expect((await status(s.session, 'diagnostic')).body.code).toBe('activity_no_class');
  });

  it("diagnostic: the school's diagnostics switched off says activity_feature_off", async () => {
    const s = await launch(pC, { sub: 'st-c', role: 'student', custom: { enara_target: 'diagnostic' }, link: 'rl-c', course: { id: 'course-8-c', label: 'C', title: 'C' } });
    expect((await status(s.session, 'diagnostic', s.launch.classId)).body).toMatchObject({ ready: false, code: 'activity_feature_off' });
  });

  it('flag off: 404; unknown kind: 404; no session: 401; a parent or ENARA admin account: 403', async () => {
    const s = await launch(pA, { sub: 'st-ready', role: 'student', custom: { enara_target: 'tutor-session' }, link: 'rl-ready' });
    expect((await status(s.session, 'nope')).status).toBe(404);
    expect((await request(app).get('/api/lms/activities/tutor')).status).toBe(401);
    const { User } = await import('../../src/models/User');
    const { signAccessToken } = await import('../../src/auth/jwt');
    const enara = await User.findOne({ role: 'enara-admin' });
    expect((await status(`Bearer ${signAccessToken({ id: enara!._id.toString(), email: enara!.email, role: enara!.role } as never)}`, 'tutor')).status).toBe(403);
    setEnv(OFF);
    app = await makeApp();
    expect((await status(s.session, 'tutor')).status).toBe(404);
  });
});

describe("the teacher's overview (school-scoped)", () => {
  it("counts the course's class only (last 7 days), for a teacher of that class; other classes and School B are refused", async () => {
    const course = { id: 'course-8-ov', label: 'OV', title: 'Overview course' };
    const t = await launch(pA, { sub: 'tc-ov', role: 'teacher', custom: { enara_target: 'tutor-session' }, link: 'rl-ov', course });
    const s1 = await launch(pA, { sub: 'st-ov1', role: 'student', custom: { enara_target: 'tutor-session' }, link: 'rl-ov', course });
    const s2 = await launch(pA, { sub: 'st-ov2', role: 'student', custom: { enara_target: 'tutor-session' }, link: 'rl-ov', course });
    const outsider = await launch(pA, { sub: 'st-out', role: 'student', custom: { enara_target: 'home' }, link: 'rl-out', course: { id: 'course-8-out', label: 'X', title: 'X' } });
    const classId = t.launch.classId as string;
    const { TutorSession } = await import('../../src/models/TutorSession');
    const { DiagnosticSession } = await import('../../src/models/DiagnosticSession');
    const old = new Date(Date.now() - 9 * 86_400_000);
    await TutorSession.create([
      { id: 'ts-8-1', studentId: s1.user.studentId, institutionId: A, mode: 'chat' },
      { id: 'ts-8-2', studentId: s1.user.studentId, institutionId: A, mode: 'chat' },
      { id: 'ts-8-3', studentId: s2.user.studentId, institutionId: A, mode: 'voice' },
      { id: 'ts-8-4', studentId: outsider.user.studentId, institutionId: A, mode: 'chat' }, // not in the class
    ]);
    await TutorSession.collection.insertOne({ id: 'ts-8-old', studentId: s2.user.studentId, institutionId: A, mode: 'chat', createdAt: old, updatedAt: old });
    await DiagnosticSession.create([
      { id: 'dg-8-1', institutionId: A, studentId: s1.user.studentId, courseId: classId, curriculumId: 'x', objectiveIds: [], status: 'completed', maxQuestions: 5, maxMinutes: 10, startedAt: new Date(), algorithmVersion: 't' },
      { id: 'dg-8-2', institutionId: A, studentId: s2.user.studentId, courseId: classId, curriculumId: 'x', objectiveIds: [], status: 'in_progress', maxQuestions: 5, maxMinutes: 10, startedAt: new Date(), algorithmVersion: 't' },
    ]);

    const tutor = await status(t.session, 'tutor', classId);
    expect(tutor.status, JSON.stringify(tutor.body)).toBe(200);
    expect(tutor.body).toMatchObject({ ready: false, code: 'activity_provider_not_configured', overview: { classId, className: expect.any(String), students: 2, days: 7, studentsStarted: 1, sessions: 2 } });
    expect((await status(t.session, 'avatar', classId)).body.overview).toMatchObject({ studentsStarted: 1, sessions: 1 });
    expect((await status(t.session, 'diagnostic', classId)).body.overview).toMatchObject({ studentsStarted: 2, sessions: 2, completed: 1 });
    // Counts only, never names.
    expect(JSON.stringify(tutor.body)).not.toMatch(/Test Person|st-ov/);
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.activity', 'refIds.role': 'teacher', 'refIds.enaraClassId': classId }).lean();
    expect(audit?.code).toBe('activity_provider_not_configured');

    // A class this teacher does not teach (same school), and a School B teacher asking for School A's class.
    expect((await status(t.session, 'tutor', outsider.launch.classId)).status).toBe(404);
    const tb = await launch(pB, { sub: 'tc-ov', role: 'teacher', custom: { enara_target: 'tutor-session' }, link: 'rl-ov', course });
    expect(tb.launch.classId).not.toBe(classId);
    expect((await status(tb.session, 'tutor', classId)).status).toBe(404);
    const own = await status(tb.session, 'tutor', tb.launch.classId);
    expect(own.body.overview).toMatchObject({ students: 0, studentsStarted: 0, sessions: 0 });
  });
});

describe('"Open in a new tab" from an activity', () => {
  it('lands on the same activity page (the server derives it from the LMS activity), for students and previews', async () => {
    const s = await launch(pA, { sub: 'st-tab', role: 'student', custom: { enara_target: 'live-avatar' }, link: 'rl-tab' });
    const minted = await request(app).post('/api/lms/launch/handoff').set('Authorization', s.session).send({ resourceLinkId: s.launch.resourceLinkId, classId: s.launch.classId });
    expect(minted.status, JSON.stringify(minted.body)).toBe(200);
    expect(minted.body.url).toMatch(new RegExp(`^${TOOL}/lms/launch#hc=[A-Za-z0-9_-]{43}$`));
    const code = new URLSearchParams(new URL(minted.body.url).hash.slice(1)).get('hc');
    const ex = await request(app).post('/api/lms/launch/handoff/exchange').send({ code });
    expect(ex.status, JSON.stringify(ex.body)).toBe(200);
    expect(ex.body.launch).toMatchObject({ purpose: 'handoff', role: 'student', classId: s.launch.classId, target: { kind: 'page', page: 'activity-avatar' } });
    // An explicit page (the frame bar's) wins.
    const explicit = await request(app).post('/api/lms/launch/handoff').set('Authorization', s.session).send({ page: 'activity-tutor' });
    const ex2 = await request(app).post('/api/lms/launch/handoff/exchange').send({ code: new URLSearchParams(new URL(explicit.body.url).hash.slice(1)).get('hc') });
    expect(ex2.body.launch.target).toEqual({ kind: 'page', page: 'activity-tutor' });
  });
});

describe('problem help', () => {
  it('every activity code has an English and an Arabic explanation and fix', async () => {
    const { helpFor } = await import('../../src/integrations/lms/core/problemHelp');
    const { ACTIVITY_PROBLEMS } = await import('../../src/integrations/lms/core/activities');
    for (const code of ACTIVITY_PROBLEMS) {
      const h = helpFor(code, 'lti.activity');
      expect(h.known, code).toBe(true);
      for (const lang of ['en', 'ar'] as const) {
        expect(h[lang].what.length, `${code} ${lang}`).toBeGreaterThan(20);
        expect(h[lang].fix.length, `${code} ${lang}`).toBeGreaterThan(10);
      }
      expect(h.ar.what).toMatch(/[؀-ۿ]/);
    }
  });
});
