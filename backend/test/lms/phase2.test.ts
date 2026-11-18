import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE } from './mockPlatform';

// LMS Phase 2 (docs/lms/PHASE_2_NOTES.md): the activity picker through LTI
// Deep Linking 2.0, against the local mock platform. Covers the switch, who
// may open the picker, the deep-linking settings checks, the picker session
// (single use, expiry), the items (this school only, published only, language
// facts only for language courses, no custom parameters leaked), the signed
// response (issuer, audience, deployment, data, nonce, content items, grade
// column only for graded items, max 100, new window for mic items),
// "already added in this course", one-at-a-time LMSs, school isolation, and
// that a picked activity launches through the Phase 3 binding. Owner decision
// D3: practice is graded (its own grade column, best attempt), and a practice
// activity picked before D3 (enara_graded=0) sends its best attempt too.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_DEEP_LINKING_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_DRAIN_TRIGGERS'];
const LTI = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, LMS_GRADE_PASSBACK_ENABLED: 'true', LMS_DRAIN_TRIGGERS: 'daily' };
const ON = { ...LTI, LMS_DEEP_LINKING_ENABLED: 'true' };
const DL = 'https://purl.imsglobal.org/spec/lti-dl/claim/';
const C = 'https://purl.imsglobal.org/spec/lti/claim/';

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p2-school-a';
const B = 'p2-school-b';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let pB: MockPlatform;
let enaraAuth = '';
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
  await Institution.create([{ id: A, name: 'School A', features }, { id: B, name: 'School B', features }]);
  const { Curriculum } = await import('../../src/models/Curriculum');
  await Curriculum.create([
    { id: 'CUR-ENG', name: 'English A2', institutionId: A, courseName: 'English A2', type: 'Language', level: 'A2', languages: ['English'], summary: 's', description: 'd', lastUpdated: '2026-11-18', subjectsCount: 1, chapters: [{ id: 'L1', title: 'Family', uploads: [], languageSpec: { skills: ['reading', 'speaking'] } }] },
    { id: 'CUR-MATH', name: 'Maths', institutionId: A, courseName: 'Maths', type: 'National', level: 'G7', languages: ['English'], summary: 's', description: 'd', lastUpdated: '2026-11-18', subjectsCount: 1, chapters: [{ id: 'M1', title: 'Fractions', uploads: [] }] },
  ]);
  const { Assessment } = await import('../../src/models/Assessment');
  const { publishAssessment } = await import('../../src/services/assessmentVersions');
  const mk = async (id: string, institutionId: string, over: Record<string, unknown> = {}, publish = true) => {
    const a = await Assessment.create({ id, title: `Quiz ${id}`, institutionId, subject: 'English', status: 'active', lifecycle: 'draft', maxAttempts: 3, questions: [MC('q1'), MC('q2')], ...over });
    if (publish) await publishAssessment(a, 'seed');
  };
  await mk('AS-ENG', A, { curriculumId: 'CUR-ENG' });
  await mk('AS-MATH', A, { curriculumId: 'CUR-MATH', subject: 'Mathematics' });
  await mk('AS-PRACTICE', A, { curriculumId: 'CUR-MATH', subject: 'Mathematics', assessmentKind: 'practice' });
  await mk('AS-DRAFT', A, {}, false);
  await mk('AS-B', B);
  const { CourseInstance } = await import('../../src/models/CourseInstance');
  await CourseInstance.create({ id: 'CLS-A', courseId: 'X', courseName: 'Class 7A', institutionId: A, batchId: 'B-A', visibility: 'student', isDemo: false, academicYear: '2026', instructorIds: [], studentIds: [] });
  const { Assignment } = await import('../../src/models/Assignment');
  const base = { institutionId: A, assessmentId: 'AS-ENG', assessmentVersion: 1, classId: 'CLS-A', opensAt: new Date(), dueAt: new Date(Date.now() + 7 * 86_400_000), createdBy: 'seed' };
  await Assignment.create([
    { ...base, id: 'ASG-QUIZ', title: 'Family quiz', state: 'published' },
    { ...base, id: 'ASG-SPEAK', title: 'Speaking exam', state: 'published', format: 'english_conversation', speaking: { settingsVersion: 1, language: 'en', planMode: 'free', requiredTopics: [], disallowedTopics: [] } },
    { ...base, id: 'ASG-DRAFT', title: 'Draft', state: 'draft' },
  ]);

  const { signAccessToken } = await import('../../src/auth/jwt');
  const u = await User.create({ email: 'enara@staff.test', password: 'x', role: 'enara-admin', name: 'enara' });
  enaraAuth = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role } as never)}`;

  pA = await new MockPlatform('https://moodle.school-a.test', 'client-a').start();
  pB = await new MockPlatform('https://lms.school-b.test', 'client-b').start();
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

const settings = (p: MockPlatform, over: Record<string, unknown> = {}) => ({
  deep_link_return_url: `${p.issuer}/mod/lti/contentitem_return.php?course=101`,
  accept_types: ['ltiResourceLink'],
  accept_presentation_document_targets: ['iframe', 'window'],
  accept_multiple: true,
  accept_lineitem: true,
  data: 'opaque-moodle-data',
  ...over,
});

async function ltiPost(p: MockPlatform, over: Record<string, unknown>) {
  const lr = await request(app).post('/lti/login').type('form').send({ iss: p.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: p.clientId, lti_deployment_id: p.deploymentId });
  expect(lr.status, lr.text).toBe(302);
  const loc = new URL(lr.headers.location);
  const cookie = ([] as string[]).concat(lr.headers['set-cookie'] ?? [])[0].split(';')[0];
  const idToken = await p.sign(p.claims(loc.searchParams.get('nonce')!, TOOL, over));
  return request(app).post('/lti/launch').type('form').set('Cookie', cookie).send({ id_token: idToken, state: loc.searchParams.get('state')! });
}

const dlRequest = (p: MockPlatform, opts: { roles?: string[]; settings?: Record<string, unknown>; course?: string; locale?: string } = {}) =>
  ltiPost(p, {
    sub: 'teacher-1',
    'lti:message_type': 'LtiDeepLinkingRequest',
    'lti:resource_link': undefined,
    'lti:roles': opts.roles ?? [ROLE.instructor],
    'lti:context': { id: opts.course ?? 'course-101', label: 'ENG', title: 'English (LMS)' },
    'lti:launch_presentation': { document_target: 'iframe', locale: opts.locale ?? 'en' },
    [`${DL}deep_linking_settings`]: { ...settings(p), ...(opts.settings ?? {}) },
  });

async function openPicker(p: MockPlatform, opts: Parameters<typeof dlRequest>[1] = {}): Promise<string> {
  const r = await dlRequest(p, opts);
  expect(r.status, r.text).toBe(303);
  const loc = new URL(r.headers.location);
  expect(loc.origin + loc.pathname).toBe(`${TOOL}/lms/picker`);
  return new URLSearchParams(loc.hash.slice(1)).get('ps')!;
}

const api = (secret: string) => ({
  session: () => request(app).get('/api/lms/picker/session').set('X-Lms-Picker', secret),
  items: () => request(app).get('/api/lms/picker/items').set('X-Lms-Picker', secret),
  submit: (items: { type: string; id: string }[]) => request(app).post('/api/lms/picker/submit').set('X-Lms-Picker', secret).send({ items }),
});

async function verifyResponse(p: MockPlatform, jwt: string) {
  const jwks = await request(app).get('/.well-known/jwks.json');
  const { payload } = await jwtVerify(jwt, createLocalJWKSet(jwks.body), { issuer: p.clientId, audience: p.issuer, algorithms: ['RS256'] });
  return payload as Record<string, unknown>;
}

async function launchAndExchange(p: MockPlatform, over: Record<string, unknown>) {
  const r = await ltiPost(p, over);
  expect(r.status, r.text).toBe(303);
  const token = new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('lt');
  const ex = await request(app).post('/api/lms/launch/exchange').send({ token });
  expect(ex.status, JSON.stringify(ex.body)).toBe(200);
  return { session: `Bearer ${ex.body.token}`, launch: ex.body.launch, user: ex.body.user };
}

const modules = async () => ({ outbox: await import('../../src/integrations/lms/core/outbox'), drain: await import('../../src/integrations/lms/core/drain') });

/** Start and submit one attempt on an assignment through the student API. */
async function submitAttempt(session: string, assignmentId: string, answers: Record<string, string>) {
  const s = await request(app).post(`/api/me/assignments/${assignmentId}/attempts`).set('Authorization', session).send({});
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const r = await request(app).post(`/api/me/assignments/${assignmentId}/attempts/${s.body.attempt.id}/submit`).set('Authorization', session).send({ answers });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

// -------------------------------------------------------------- tests

describe('switch and access', () => {
  it('switched off: the request is refused like an unknown message type, and the picker API is 404', async () => {
    setLmsEnv(LTI);
    app = await makeApp();
    const r = await dlRequest(pA);
    expect(r.status).toBe(400);
    expect(r.text).toContain('unsupported_message_type');
    expect((await request(app).get('/api/lms/picker/session').set('X-Lms-Picker', 'x'.repeat(43))).status).toBe(404);
  });

  it('a student cannot open the picker', async () => {
    const r = await dlRequest(pA, { roles: [ROLE.learner] });
    expect(r.status).toBe(403);
    expect(r.text).toContain('deep_link_not_allowed');
  });

  it('a return URL on another site, or an LMS that does not accept resource links, is refused', async () => {
    expect((await dlRequest(pA, { settings: { deep_link_return_url: 'https://evil.example/collect' } })).text).toContain('deep_link_invalid');
    expect((await dlRequest(pA, { settings: { accept_types: ['file'] } })).text).toContain('deep_link_invalid');
  });

  it('a teacher gets a picker session: IDs only, following the LMS language, nothing provisioned', async () => {
    const users = await M.LmsUser.countDocuments();
    const secret = await openPicker(pA, { locale: 'ar-EG' });
    expect(secret.length).toBeGreaterThan(30);
    const row = await M.LmsDeepLinkSession.findOne({}).sort({ createdAt: -1 }).lean();
    expect(row).toMatchObject({ institutionId: A, externalContextId: 'course-101', role: 'teacher', locale: 'ar', acceptMultiple: true, data: 'opaque-moodle-data' });
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(await M.LmsUser.countDocuments()).toBe(users);
    const s = await api(secret).session();
    expect(s.body).toMatchObject({ locale: 'ar', courseTitle: 'English (LMS)', acceptMultiple: true });
    // Phase 2b adds the page plug-in types (phase2b.test.ts).
    expect(s.body.types.map((t: { type: string }) => t.type)).toEqual(['assessment', 'assignment', 'course_link', 'enara_page']);
    expect((await request(app).get('/api/lms/picker/session').set('X-Lms-Picker', 'wrong-secret-0000000000000')).status).toBe(401);
  });
});

describe('items', () => {
  it("this school's published items only, language facts only for language courses, no custom parameters", async () => {
    const r = await api(await openPicker(pA)).items();
    expect(r.status).toBe(200);
    const work = r.body.items.filter((i: { type: string }) => i.type === 'assessment' || i.type === 'assignment'); // pages: phase2b.test.ts
    const keys = work.map((i: { type: string; id: string }) => `${i.type}:${i.id}`).sort();
    expect(keys).toEqual(['assessment:AS-ENG', 'assessment:AS-MATH', 'assessment:AS-PRACTICE', 'assignment:ASG-QUIZ', 'assignment:ASG-SPEAK']);
    const by = (id: string) => r.body.items.find((i: { id: string }) => i.id === id);
    expect(by('AS-ENG').language).toEqual({ level: 'A2', skills: ['reading', 'speaking'] });
    expect(by('AS-MATH').language).toBeUndefined();
    expect(by('AS-ENG')).toMatchObject({ graded: true, needsMedia: false, questions: 2, points: 4, alreadyAdded: false });
    expect(by('AS-PRACTICE').graded).toBe(true); // D3: practice is graded
    expect(by('ASG-SPEAK')).toMatchObject({ needsMedia: true, kind: 'speaking' });
    expect(by('ASG-QUIZ').meta).toContain('Class 7A');
    expect(JSON.stringify(r.body)).not.toContain('enara_assessment');
  });
});

describe('the signed response', () => {
  it('several items: signed by ENARA for this LMS; grade column (max 100) for graded items, practice included (D3); new window for mic items', async () => {
    const secret = await openPicker(pA);
    const r = await api(secret).submit([{ type: 'assessment', id: 'AS-ENG' }, { type: 'assessment', id: 'AS-PRACTICE' }, { type: 'assignment', id: 'ASG-SPEAK' }, { type: 'assessment', id: 'AS-ENG' }]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.returnUrl).toBe(`${pA.issuer}/mod/lti/contentitem_return.php?course=101`);
    const kid = decodeProtectedHeader(r.body.jwt).kid;
    expect(kid).toBeTruthy();
    const payload = await verifyResponse(pA, r.body.jwt);
    expect(payload[`${C}message_type`]).toBe('LtiDeepLinkingResponse');
    expect(payload[`${C}version`]).toBe('1.3.0');
    expect(payload[`${C}deployment_id`]).toBe(pA.deploymentId);
    expect(payload[`${DL}data`]).toBe('opaque-moodle-data');
    expect(typeof payload.nonce).toBe('string');
    const items = payload[`${DL}content_items`] as Record<string, any>[];
    expect(items).toHaveLength(3); // the duplicate in one submit is dropped
    const [eng, practice, speak] = items;
    expect(eng).toMatchObject({ type: 'ltiResourceLink', title: 'Quiz AS-ENG', url: `${TOOL}/lti/launch`, custom: { enara_assessment: 'AS-ENG' }, lineItem: { scoreMaximum: 100, label: 'Quiz AS-ENG', resourceId: 'assessment:AS-ENG', tag: 'enara' } });
    expect(eng.window).toBeUndefined();
    // D3: practice gets its own grade column and no enara_graded=0.
    expect(practice.lineItem).toEqual({ scoreMaximum: 100, label: 'Quiz AS-PRACTICE', resourceId: 'assessment:AS-PRACTICE', tag: 'enara' });
    expect(practice.custom).toEqual({ enara_assessment: 'AS-PRACTICE' });
    expect(speak.custom).toEqual({ enara_assignment: 'ASG-SPEAK' });
    expect(speak.window).toBeDefined();
    expect(speak.lineItem.scoreMaximum).toBe(100);

    // Single use.
    expect((await api(secret).submit([])).status).toBe(410);
    expect((await api(secret).items()).status).toBe(410);
  });

  it('an empty submit (Cancel) returns no items; an expired session is refused', async () => {
    const cancel = await api(await openPicker(pA)).submit([]);
    expect(cancel.status).toBe(200);
    expect((await verifyResponse(pA, cancel.body.jwt))[`${DL}content_items`]).toEqual([]);
    const secret = await openPicker(pA);
    await M.LmsDeepLinkSession.updateMany({ usedAt: { $exists: false } }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api(secret).submit([{ type: 'assessment', id: 'AS-ENG' }])).status).toBe(410);
  });

  it('draft, unknown or other-school items are refused; an LMS that takes one item at a time gets one', async () => {
    const s1 = await openPicker(pA);
    expect((await api(s1).submit([{ type: 'assessment', id: 'AS-DRAFT' }])).status).toBe(409);
    expect((await api(s1).submit([{ type: 'assessment', id: 'AS-B' }])).body.error).toBe('item_not_available');
    expect((await api(s1).submit([{ type: 'lesson', id: 'L1' }])).status).toBe(400);
    expect((await api(s1).submit([{ type: 'assignment', id: 'ASG-DRAFT' }])).status).toBe(409);
    const s2 = await openPicker(pB);
    expect((await api(s2).items()).body.items.filter((i: { type: string }) => i.type === 'assessment' || i.type === 'assignment').map((i: { id: string }) => i.id)).toEqual(['AS-B']);
    expect((await api(s2).submit([{ type: 'assessment', id: 'AS-ENG' }])).status).toBe(409);
    const single = await openPicker(pA, { settings: { accept_multiple: false } });
    expect((await api(single).submit([{ type: 'assessment', id: 'AS-ENG' }, { type: 'assessment', id: 'AS-MATH' }])).status).toBe(400);
    expect((await api(single).submit([{ type: 'assessment', id: 'AS-MATH' }])).status).toBe(200);
  });

  it('an LMS that does not accept grade columns or new windows gets neither', async () => {
    const r = await api(await openPicker(pA, { settings: { accept_lineitem: false, accept_presentation_document_targets: ['iframe'] } })).submit([{ type: 'assignment', id: 'ASG-SPEAK' }]);
    const [item] = (await verifyResponse(pA, r.body.jwt))[`${DL}content_items`] as Record<string, unknown>[];
    expect(item.lineItem).toBeUndefined();
    expect(item.window).toBeUndefined();
  });
});

describe('"Already added in this course" (decision P4)', () => {
  it('items picked before in this LMS course carry the badge; another course does not', async () => {
    await api(await openPicker(pA, { course: 'course-202' })).submit([{ type: 'assessment', id: 'AS-MATH' }]);
    const items = (await api(await openPicker(pA, { course: 'course-202' })).items()).body.items;
    expect(items.find((i: { id: string }) => i.id === 'AS-MATH').alreadyAdded).toBe(true);
    expect(items.find((i: { id: string }) => i.id === 'AS-ENG').alreadyAdded).toBe(false);
    const other = (await api(await openPicker(pA, { course: 'course-303' })).items()).body.items;
    expect(other.every((i: { alreadyAdded: boolean }) => !i.alreadyAdded)).toBe(true);
  });

  it('activities launched with a binding (made by hand before Phase 2) also count', async () => {
    const r = await ltiPost(pA, {
      sub: 'teacher-2', 'lti:roles': [ROLE.instructor],
      'lti:context': { id: 'course-404', label: 'X', title: 'Course 404' },
      'lti:resource_link': { id: 'rl-hand', title: 'Hand made' },
      'lti:custom': { enara_assessment: 'AS-ENG' },
    });
    expect(r.status, r.text).toBe(303);
    const items = (await api(await openPicker(pA, { course: 'course-404' })).items()).body.items;
    expect(items.find((i: { id: string }) => i.id === 'AS-ENG').alreadyAdded).toBe(true);
  });
});

describe('a picked activity opens through the Phase 3 binding', () => {
  it('practice picked before D3 (enara_graded=0) is graded anyway: it queues and sends the BEST attempt to its column', async () => {
    pA.resetAgs();
    const custom = { enara_assessment: 'AS-PRACTICE', enara_graded: '0' };
    const course = { id: 'course-505', label: 'P', title: 'Practice course' };
    const t = await launchAndExchange(pA, { sub: 'teacher-3', 'lti:roles': [ROLE.instructor], 'lti:context': course, 'lti:resource_link': { id: 'rl-practice', title: 'Quiz AS-PRACTICE' }, 'lti:custom': custom, ...pA.agsClaim() });
    const assignmentId = t.launch.target.assignmentId as string;
    const link = await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-practice' }).lean();
    expect(link).toMatchObject({ enaraActivityId: assignmentId, activityKind: 'practice', title: 'Quiz AS-PRACTICE', lineItemUrl: pA.lineItemUrl() });
    expect(link!.customParams).toMatchObject({ enara_graded: '0' });

    const s = await launchAndExchange(pA, { sub: 'student-p2', name: 'Layla Hassan', email: 'student-p2@school.example', 'lti:roles': [ROLE.learner], 'lti:context': course, 'lti:resource_link': { id: 'rl-practice', title: 'Quiz AS-PRACTICE' }, 'lti:custom': custom, ...pA.agsClaim() });
    const { outbox, drain } = await modules();
    const send = async (answers: Record<string, string>) => {
      await submitAttempt(s.session, assignmentId, answers);
      await drain.settleLmsBackgroundForTests();
      await outbox.drainGradeJobs({ trigger: 'test', filter: { contextIds: [link!.contextId] } });
    };
    const scoresOf = () => pA.scores.map((x) => x.body.scoreGiven);

    await send({ q1: 'a', q2: 'b' }); // 2 of 4 points
    expect(pA.scores).toHaveLength(1);
    expect(pA.scores[0].path).toBe('/lineitems/5/lineitem/scores');
    expect(pA.scores[0].body).toMatchObject({ scoreGiven: 2, scoreMaximum: 4, gradingProgress: 'FullyGraded', userId: 'student-p2' });
    await send({ q1: 'a', q2: 'a' }); // 4 of 4: the new best is sent
    expect(scoresOf()).toEqual([2, 4]);
    await send({ q1: 'b', q2: 'b' }); // 0 of 4: best stays 4, nothing new sent
    expect(scoresOf()).toEqual([2, 4]);
    const jobs = await M.LmsGradeSyncJob.find({ resourceLinkId: link!.id }).sort({ scoreTimestamp: 1 }).lean();
    expect(jobs.every((j) => j.status === 'sent')).toBe(true);
    expect(jobs.map((j) => j.scoreGiven)).toEqual([2, 4]);
    // Asked again: the best result is already queued (not 'not_graded').
    const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
    const studentId = (await AssessmentAttempt.findOne({ assignmentId }).lean())!.studentId;
    expect((await outbox.enqueueForLink(link!, studentId, 'test')).outcome).toBe('duplicate');
  });

  it('enara_graded=0 still keeps a graded quiz (not practice) out of the gradebook', async () => {
    const r = await ltiPost(pA, {
      sub: 'teacher-3', 'lti:roles': [ROLE.instructor],
      'lti:context': { id: 'course-505', label: 'P', title: 'Practice course' },
      'lti:resource_link': { id: 'rl-ungraded-quiz', title: 'Quiz AS-ENG' },
      'lti:custom': { enara_assessment: 'AS-ENG', enara_graded: '0' },
    });
    expect(r.status, r.text).toBe(303);
    const link = await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-ungraded-quiz' }).lean();
    expect(link?.activityKind).toBe('assessment');
    const { outbox } = await modules();
    expect((await outbox.enqueueForLink(link!, 'any-student', 'test')).outcome).toBe('not_graded');
  });
});

describe('audit', () => {
  it('request and response are audited with IDs and counts only', async () => {
    const rows = await M.LmsAuditLog.find({ event: 'lti.deep_link' }).lean();
    expect(rows.some((r) => r.refIds.step === 'request')).toBe(true);
    const resp = rows.find((r) => r.refIds.step === 'response' && r.refIds.items === 3);
    expect(resp?.refIds).toMatchObject({ graded: 3, newWindow: 1 });
    expect(JSON.stringify(rows)).not.toMatch(/Layla|school\.example|opaque-moodle-data/);
  });
});
