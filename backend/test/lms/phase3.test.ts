import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE } from './mockPlatform';

// LMS Phase 3 (docs/lms/PHASE_3_NOTES.md): grades through LTI Advantage AGS
// and the outbox, against a local mock platform (token endpoint, line items,
// scores on 127.0.0.1; no network). Covers the custom-parameter binding,
// the token (client assertion + encrypted cache), line items (from the launch,
// found, created), the score payload, toLmsScore end to end (language and
// not), only real linked students (never a preview, another school or an
// unlinked student), idempotency and supersede, lease and concurrency,
// backoff, dead and retry, re-sync, the delivery triggers, flags off, and
// tenant isolation of the admin endpoints.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const CRON_SECRET = 'cron-secret-for-tests-0123456789';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', CRON_SECRET,
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL'];
const LTI = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK };
const ON = { ...LTI, LMS_GRADE_PASSBACK_ENABLED: 'true' };
// Inline push off: jobs wait for a drain (lets the tests look at the queue).
const QUEUED = { ...ON, LMS_DRAIN_TRIGGERS: 'targeted,daily' };

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p3-school-a';
const B = 'p3-school-b';
const AGS = 'https://purl.imsglobal.org/spec/lti-ags/scope/';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let pB: MockPlatform;
let platformA: string;
let platformB: string;
const auth: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');
let outbox: typeof import('../../src/integrations/lms/core/outbox');
let drain: typeof import('../../src/integrations/lms/core/drain');
let events: typeof import('../../src/integrations/lms/core/gradeEvents');
let Models: {
  Assignment: typeof import('../../src/models/Assignment').Assignment;
  AssessmentAttempt: typeof import('../../src/models/AssessmentAttempt').AssessmentAttempt;
  User: typeof import('../../src/models/User').User;
  Student: typeof import('../../src/models/Student').Student;
  CourseInstance: typeof import('../../src/models/CourseInstance').CourseInstance;
};

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

const MC = (id: string, topic: string, correct: string) => ({ id, type: 'multiple-choice', text: `Question ${id}`, topic, options: [correct, 'other', 'third'], correctAnswer: correct, explanation: '', points: 1 });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ANTHROPIC_API_KEY']) delete process.env[k];
  setLmsEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  outbox = await import('../../src/integrations/lms/core/outbox');
  drain = await import('../../src/integrations/lms/core/drain');
  events = await import('../../src/integrations/lms/core/gradeEvents');
  outbox.setQuickRetriesForTests([5, 5, 5]);
  const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
  await ClassEnrollment.createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
  await AssessmentAttempt.createIndexes();
  const { Assignment } = await import('../../src/models/Assignment');
  const { Student } = await import('../../src/models/Student');
  const { CourseInstance } = await import('../../src/models/CourseInstance');
  Models = { Assignment, AssessmentAttempt, User, Student, CourseInstance };
  const { Institution } = await import('../../src/models/Institution');
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  // Every feature on except AI grading (no AI here): hand grading where needed.
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, f !== 'ai_grading_enabled']));
  await Institution.create([{ id: A, name: 'School A', features }, { id: B, name: 'School B', features }]);

  const { Curriculum } = await import('../../src/models/Curriculum');
  await Curriculum.create([
    { id: 'CUR-ENG', name: 'English A2', institutionId: A, courseName: 'English A2', type: 'Language', level: 'A2', languages: ['English'], summary: 's', description: 'd', lastUpdated: '2026-11-17', subjectsCount: 1, chapters: [{ id: 'L1', title: 'Family', uploads: [], languageSpec: { skills: ['reading'] } }] },
    { id: 'CUR-MATH', name: 'Maths', institutionId: A, courseName: 'Maths', type: 'National', level: 'A2', languages: ['English'], summary: 's', description: 'd', lastUpdated: '2026-11-17', subjectsCount: 1, chapters: [{ id: 'M1', title: 'Fractions', uploads: [] }] },
  ]);
  const { Assessment } = await import('../../src/models/Assessment');
  const { publishAssessment } = await import('../../src/services/assessmentVersions');
  const mk = async (id: string, institutionId: string, over: Record<string, unknown> = {}, publish = true) => {
    const a = await Assessment.create({
      id, title: `Quiz ${id}`, institutionId, subject: 'English', status: 'active', lifecycle: 'draft', maxAttempts: 5,
      questions: [MC('q1', 'Grammar', 'has got'), MC('q2', 'Vocabulary', 'sister')], ...over,
    });
    if (publish) await publishAssessment(a, 'seed');
  };
  await mk('AS-ENG', A, { curriculumId: 'CUR-ENG' });
  await mk('AS-MATH', A, { curriculumId: 'CUR-MATH', subject: 'Mathematics', questions: [MC('q1', 'Writing', '1/2'), MC('q2', 'Fractions', '3/4')] });
  await mk('AS-PRACTICE', A, { curriculumId: 'CUR-MATH', subject: 'Mathematics', assessmentKind: 'practice' });
  await mk('AS-HELD', A, { curriculumId: 'CUR-MATH', subject: 'Mathematics' });
  await mk('AS-DRAFT', A, {}, false);
  await mk('AS-B', B);

  const { signAccessToken } = await import('../../src/auth/jwt');
  const mkUser = async (key: string, role: string, institutionId?: string) => {
    const u = await User.create({ email: `${key}@staff.test`, password: 'x', role, name: key, institutionId });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
    return u;
  };
  await mkUser('enara', 'enara-admin');
  await mkUser('adminA', 'admin', A);
  await mkUser('adminB', 'admin', B);
  const teacherA = await mkUser('teacherA', 'teacher', A);
  // An assignment of a normal ENARA class with results released by hand (copied into the LMS class).
  await CourseInstance.create({ id: 'CLS-A-OTHER', courseId: 'X', courseName: 'Other class', institutionId: A, batchId: 'B-OTHER', visibility: 'student', isDemo: false, academicYear: '2026', instructorIds: [teacherA._id.toString()], studentIds: [] });
  await Assignment.create({
    id: 'ASG-HELD', institutionId: A, assessmentId: 'AS-HELD', assessmentVersion: 1, title: 'Held quiz', classId: 'CLS-A-OTHER', state: 'published',
    opensAt: new Date(Date.now() - 86_400_000), dueAt: new Date(Date.now() + 30 * 86_400_000), maxAttempts: 2, releasePolicy: 'manual', answerReveal: 'never', createdBy: teacherA._id.toString(),
  });
  await Assignment.create({
    id: 'ASG-DRAFT', institutionId: A, assessmentId: 'AS-ENG', assessmentVersion: 1, title: 'Draft', classId: 'CLS-A-OTHER', state: 'draft',
    opensAt: new Date(), dueAt: new Date(Date.now() + 86_400_000), createdBy: teacherA._id.toString(),
  });

  pA = await new MockPlatform('https://moodle.school-a.test', 'client-a').start();
  pB = await new MockPlatform('https://lms.school-b.test', 'client-b').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  for (const [p, inst] of [[pA, A], [pB, B]] as const) {
    const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({
      institutionId: inst, vendor: inst === A ? 'moodle' : 'generic', issuer: p.issuer, clientId: p.clientId,
      authLoginUrl: p.authLoginUrl, keysetUrl: p.keysetUrl, authTokenUrl: p.tokenUrl, deploymentIds: [p.deploymentId],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    if (inst === A) platformA = r.body.platform.id;
    else platformB = r.body.platform.id;
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
  return { session: `Bearer ${ex.body.token}`, launch: ex.body.launch, user: ex.body.user };
}

/** An activity in course-101 bound to ENARA work, with this mock's AGS claim. */
const activity = (p: MockPlatform, rl: string, custom: Record<string, string>, ags: Parameters<MockPlatform['agsClaim']>[0] = {}, course = 'course-101') => ({
  'lti:resource_link': { id: rl, title: `Activity ${rl}` },
  'lti:custom': custom,
  'lti:context': { id: course, label: 'ENG', title: 'English (LMS)' },
  ...p.agsClaim(ags),
});

const teacher = (p: MockPlatform, rl: string, custom: Record<string, string>, ags?: Parameters<MockPlatform['agsClaim']>[0], course?: string) =>
  launchAndExchange(p, { sub: 'teacher-1', 'lti:roles': [ROLE.instructor], ...activity(p, rl, custom, ags, course) });
const learner = (p: MockPlatform, sub: string, rl: string, custom: Record<string, string>, ags?: Parameters<MockPlatform['agsClaim']>[0], course?: string) =>
  launchAndExchange(p, { sub, name: 'Layla Hassan', given_name: 'Layla', family_name: 'Hassan', email: `${sub}@school.example`, 'lti:roles': [ROLE.learner], ...activity(p, rl, custom, ags, course) });

/** Start and submit one attempt on an assignment through the student API. */
async function submit(session: string, assignmentId: string, answers: Record<string, string>) {
  const s = await request(app).post(`/api/me/assignments/${assignmentId}/attempts`).set('Authorization', session).send({});
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const r = await request(app).post(`/api/me/assignments/${assignmentId}/attempts/${s.body.attempt.id}/submit`).set('Authorization', session).send({ answers });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  await drain.settleLmsBackgroundForTests();
  return s.body.attempt.id as string;
}

const RIGHT = { q1: 'has got', q2: 'sister' };
const HALF = { q1: 'has got', q2: 'other' };
const settle = () => drain.settleLmsBackgroundForTests();
const jobsFor = (filter: Record<string, unknown>) => M.LmsGradeSyncJob.find(filter).sort({ scoreTimestamp: 1 }).lean();
const noPii = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/Layla|Hassan|@school\.example/);

// --------------------------------------------------------------- tests

describe('binding an LMS activity to ENARA work (custom parameter)', () => {
  it('enara_assessment=<id>: the course class gets the assignment once; teacher and student land on it', async () => {
    const t = await teacher(pA, 'rl-eng', { enara_assessment: 'AS-ENG' });
    expect(t.launch.target).toMatchObject({ kind: 'assignment' });
    const id = t.launch.target.assignmentId as string;
    const asg = await Models.Assignment.findOne({ id }).lean();
    expect(asg).toMatchObject({ institutionId: A, assessmentId: 'AS-ENG', assessmentVersion: 1, classId: t.launch.classId, state: 'published', createdBy: 'system:lms', maxAttempts: 5 });
    const link = await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-eng' }).lean();
    expect(link).toMatchObject({ enaraActivityId: id, enaraSourceType: 'assessment', enaraSourceId: 'AS-ENG', activityKind: 'assessment', lineItemUrl: pA.lineItemUrl() });
    const ctx = await M.LmsContext.findOne({ id: link!.contextId }).lean();
    expect(ctx!.agsScopes).toContain(`${AGS}score`);
    // Again (teacher and a student): the same assignment, no second one.
    const t2 = await teacher(pA, 'rl-eng', { enara_assessment: 'AS-ENG' });
    const s = await learner(pA, 'student-1', 'rl-eng', { enara_assessment: 'AS-ENG' });
    expect(t2.launch.target.assignmentId).toBe(id);
    expect(s.launch.target.assignmentId).toBe(id);
    expect(await Models.Assignment.countDocuments({ assessmentId: 'AS-ENG', classId: t.launch.classId })).toBe(1);
    // The student can open it; the teacher sees it in the class.
    expect((await request(app).get(`/api/me/assignments/${id}`).set('Authorization', s.session)).status).toBe(200);
    const list = await request(app).get('/api/assignments').query({ classId: t.launch.classId }).set('Authorization', t.session);
    expect(list.body.assignments.map((a: { id: string }) => a.id)).toContain(id);
    const audit = await M.LmsAuditLog.findOne({ event: 'activity.bound', 'refIds.resourceLinkId': link!.id }).lean();
    expect(audit?.refIds).toMatchObject({ source: 'assessment', sourceId: 'AS-ENG', assignmentId: id, created: true });
  });

  it('refuses another school\'s assessment, an unpublished one, unknown ids, a draft assignment, malformed or doubled parameters', async () => {
    for (const [custom, reason] of [
      [{ enara_assessment: 'AS-B' }, 'not_found'],
      [{ enara_assessment: 'AS-DRAFT' }, 'not_published'],
      [{ enara_assessment: 'NOPE' }, 'not_found'],
      [{ enara_assignment: 'ASG-DRAFT' }, 'not_available'],
      [{ enara_assessment: '$ResourceLink.id' }, 'malformed'],
      [{ enara_assessment: 'AS-ENG', enara_assignment: 'ASG-HELD' }, 'ambiguous'],
    ] as const) {
      const r = await launch(pA, { sub: 'teacher-1', 'lti:roles': [ROLE.instructor], ...activity(pA, 'rl-bad', custom) });
      expect(r.status, JSON.stringify(custom)).toBe(400);
      expect(r.text).toContain('<code>invalid_activity_binding</code>');
      const row = await M.LmsAuditLog.findOne({ code: 'invalid_activity_binding' }).sort({ createdAt: -1 }).lean();
      expect(row?.refIds.reason).toBe(reason);
    }
    expect(await M.LmsResourceLink.exists({ externalResourceLinkId: 'rl-bad' })).toBeNull();
    expect(await Models.Assignment.exists({ assessmentId: 'AS-B', institutionId: A })).toBeNull();
    // School B's own launch can use its own assessment.
    const b = await launchAndExchange(pB, { sub: 'teacher-b', 'lti:roles': [ROLE.instructor], ...activity(pB, 'rl-b', { enara_assessment: 'AS-B' }) });
    expect(b.launch.target.assignmentId).toBeTruthy();
    // ...but not school A's.
    const r = await launch(pB, { sub: 'teacher-b', 'lti:roles': [ROLE.instructor], ...activity(pB, 'rl-b2', { enara_assessment: 'AS-ENG' }) });
    expect(r.text).toContain('<code>invalid_activity_binding</code>');
  });

  it('enara_assignment=<id> of another class is copied into the course class with its settings', async () => {
    const t = await teacher(pA, 'rl-held', { enara_assignment: 'ASG-HELD' });
    const asg = await Models.Assignment.findOne({ id: t.launch.target.assignmentId }).lean();
    expect(asg).toMatchObject({ assessmentId: 'AS-HELD', classId: t.launch.classId, releasePolicy: 'manual', maxAttempts: 2, title: 'Held quiz', createdBy: 'system:lms' });
    expect(asg!.id).not.toBe('ASG-HELD');
  });

  it('an assignment already in the course class is used as it is', async () => {
    const { launch: l } = await teacher(pA, 'rl-eng', { enara_assessment: 'AS-ENG' });
    const own = await Models.Assignment.create({ id: 'ASG-IN-LMS-CLASS', institutionId: A, assessmentId: 'AS-MATH', assessmentVersion: 1, title: 'Own', classId: l.classId, opensAt: new Date(), dueAt: new Date(Date.now() + 86_400_000), createdBy: 'x' });
    const t = await teacher(pA, 'rl-own', { enara_assignment: own.id });
    expect(t.launch.target.assignmentId).toBe('ASG-IN-LMS-CLASS');
  });
});

describe('grade passback: token, payload, comment, line item', () => {
  let assignmentId: string;
  let session: string;

  beforeAll(() => setLmsEnv(ON));

  it('a released result is sent at once: token with a signed client assertion, score payload, CEFR comment for a language course', async () => {
    pA.resetAgs();
    const t = await teacher(pA, 'rl-eng', { enara_assessment: 'AS-ENG' });
    assignmentId = t.launch.target.assignmentId;
    ({ session } = await learner(pA, 'student-1', 'rl-eng', { enara_assessment: 'AS-ENG' }));
    const attemptId = await submit(session, assignmentId, RIGHT);

    // Token: client_credentials + JWT assertion signed by the tool key in our JWKS, aud = token URL.
    expect(pA.tokenRequests).toHaveLength(1);
    const tr = pA.tokenRequests[0];
    expect(tr).toMatchObject({ grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' });
    expect(tr.scope.split(' ').sort()).toEqual([`${AGS}lineitem`, `${AGS}result.readonly`, `${AGS}score`].sort());
    const jwks = (await request(app).get('/.well-known/jwks.json')).body;
    const { payload, protectedHeader } = await jwtVerify(tr.client_assertion, createLocalJWKSet(jwks), { audience: pA.tokenUrl, issuer: 'client-a', subject: 'client-a' });
    expect(protectedHeader.alg).toBe('RS256');
    expect(jwks.keys.map((k: { kid: string }) => k.kid)).toContain(decodeProtectedHeader(tr.client_assertion).kid);
    expect(typeof payload.jti).toBe('string');
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);

    // Score: {lineitem}/scores (query kept), score media type, the bearer token.
    expect(pA.scores).toHaveLength(1);
    const sp = pA.scores[0];
    expect(sp.path).toBe('/lineitems/5/lineitem/scores');
    expect(sp.query).toBe('?type_id=1');
    expect(sp.contentType).toBe('application/vnd.ims.lis.v1.score+json');
    expect(sp.auth).toBe('Bearer tok-1');
    expect(sp.body).toMatchObject({ userId: 'student-1', scoreGiven: 2, scoreMaximum: 2, activityProgress: 'Completed', gradingProgress: 'FullyGraded' });
    expect(new Date(sp.body.timestamp as string).toISOString()).toBe(sp.body.timestamp);
    expect(sp.body.comment).toBe('Score: 2/2 (100%). Level: A2. Skills: Grammar 1/1, Vocabulary 1/1. Details in ENARA.');
    noPii(sp.body);

    const job = await M.LmsGradeSyncJob.findOne({ enaraAttemptId: attemptId }).lean();
    expect(job).toMatchObject({ status: 'sent', platformId: platformA, lineItemRef: pA.lineItemUrl(), gradingProgress: 'FullyGraded', reason: 'released', levelScheme: 'cefr', levelLabel: 'A2' });
    const sent = await M.LmsAuditLog.findOne({ event: 'grade.sent', 'refIds.jobId': job!.id }).lean();
    expect(sent?.outcome).toBe('ok');
    noPii(await M.LmsAuditLog.find({ event: /^grade\./ }).lean());
  });

  it('the token is cached encrypted and reused until near expiry; a 401 refreshes it once', async () => {
    const row = await M.LmsAccessToken.findOne({ platformId: platformA }).select('+tokenEnc').lean();
    expect(row!.tokenEnc.startsWith('lk1.')).toBe(true);
    expect(row!.tokenEnc).not.toContain('tok-1');
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3000_000);
    // Latest policy (assessment): a lower second attempt replaces the first, same token.
    await submit(session, assignmentId, HALF);
    expect(pA.tokenRequests).toHaveLength(1);
    expect(pA.scores.at(-1)!.body).toMatchObject({ scoreGiven: 1, scoreMaximum: 2 });
    expect(new Date(pA.scores.at(-1)!.body.timestamp as string) > new Date(pA.scores[0].body.timestamp as string)).toBe(true);
    // The platform forgets the token: one 401, a new token, then success.
    pA.validTokens.clear();
    await submit(session, assignmentId, RIGHT);
    expect(pA.tokenRequests).toHaveLength(2);
    expect(pA.scores.at(-1)!.auth).toBe('Bearer tok-2');
    expect(pA.scores.at(-1)!.body.scoreGiven).toBe(2);
    // Reused while valid; near expiry a new token is fetched.
    const { serviceToken, tokenScopes } = await import('../../src/integrations/lms/adapters/lti13/ags');
    const p = (await M.LmsPlatform.findOne({ id: platformA }).lean())!;
    expect(await serviceToken(p, tokenScopes(undefined))).toBe('tok-2');
    expect(pA.tokenRequests).toHaveLength(2);
    await M.LmsAccessToken.updateOne({ platformId: platformA }, { $set: { expiresAt: new Date(Date.now() + 30_000) } });
    expect(await serviceToken(p, tokenScopes(undefined))).toBe('tok-3');
    expect(pA.tokenRequests).toHaveLength(3);
  });

  it('non-language course: no CEFR, even with a CEFR-looking curriculum level', async () => {
    const t = await teacher(pA, 'rl-math', { enara_assessment: 'AS-MATH' });
    const { session: s } = await learner(pA, 'student-1', 'rl-math', { enara_assessment: 'AS-MATH' });
    pA.scores = [];
    await submit(s, t.launch.target.assignmentId, { q1: '1/2', q2: 'nope' });
    expect(pA.scores).toHaveLength(1);
    expect(pA.scores[0].body.comment).toBe('Score: 1/2 (50%). Details in ENARA.');
    const job = await M.LmsGradeSyncJob.findOne({ resourceLinkId: (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-math' }).lean())!.id }).lean();
    expect(job?.levelScheme).toBeUndefined();
  });

  it('no line item in the launch: created through the line items service, then remembered', async () => {
    pA.resetAgs();
    const t = await teacher(pA, 'rl-practice', { enara_assessment: 'AS-PRACTICE' }, { lineitem: null });
    const { session: s } = await learner(pA, 'student-1', 'rl-practice', { enara_assessment: 'AS-PRACTICE' }, { lineitem: null });
    await submit(s, t.launch.target.assignmentId, RIGHT);
    expect(pA.lineItemGets).toEqual(['?resource_link_id=rl-practice']);
    expect(pA.lineItemPosts).toHaveLength(1);
    expect(pA.lineItemPosts[0]).toMatchObject({ scoreMaximum: 2, label: 'Quiz AS-PRACTICE', resourceLinkId: 'rl-practice', resourceId: t.launch.target.assignmentId, tag: 'enara' });
    expect(pA.scores).toHaveLength(1);
    expect(pA.scores[0].path).toBe('/lineitems/100/lineitem/scores');
    const link = await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-practice' }).lean();
    expect(link!.lineItemUrl).toBe(`${pA.serviceBase}/lineitems/100/lineitem`);
    expect(await M.LmsLineItem.exists({ externalLineItemUrl: link!.lineItemUrl, resourceLinkId: link!.id })).toBeTruthy();
    // Practice = best: a lower second attempt changes nothing in the gradebook.
    await submit(s, t.launch.target.assignmentId, HALF);
    expect(pA.scores).toHaveLength(1);
    expect(pA.lineItemPosts).toHaveLength(1);
    // A link can be switched to latest.
    await M.LmsResourceLink.updateOne({ id: link!.id }, { $set: { scoringPolicy: 'latest' } });
    await submit(s, t.launch.target.assignmentId, HALF);
    expect(pA.scores).toHaveLength(2);
    expect(pA.scores[1].body.scoreGiven).toBe(1);
  });

  it('no line item in the launch: an existing one is found by resource link (no create)', async () => {
    pA.resetAgs();
    pA.lineItems.push({ id: `${pA.serviceBase}/lineitems/7/lineitem`, scoreMaximum: 100, resourceLinkId: 'rl-found' });
    const t = await teacher(pA, 'rl-found', { enara_assessment: 'AS-ENG' }, { lineitem: null });
    const { session: s } = await learner(pA, 'student-1', 'rl-found', { enara_assessment: 'AS-ENG' }, { lineitem: null });
    await submit(s, t.launch.target.assignmentId, RIGHT);
    expect(pA.lineItemPosts).toHaveLength(0);
    expect(pA.scores.map((x) => x.path)).toEqual(['/lineitems/7/lineitem/scores']);
  });

  it('no line item and no lineitem scope: the job is dead (line_item_create_not_allowed), nothing posted', async () => {
    pA.resetAgs();
    const scope = [`${AGS}score`, `${AGS}result.readonly`];
    // Its own course: a course's granted scopes come from its launches.
    const t = await teacher(pA, 'rl-nocreate', { enara_assessment: 'AS-ENG' }, { lineitem: null, scope }, 'course-nocreate');
    const { session: s } = await learner(pA, 'student-1', 'rl-nocreate', { enara_assessment: 'AS-ENG' }, { lineitem: null, scope }, 'course-nocreate');
    await submit(s, t.launch.target.assignmentId, RIGHT);
    expect(pA.scores).toHaveLength(0);
    const job = await M.LmsGradeSyncJob.findOne({ resourceLinkId: (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-nocreate' }).lean())!.id }).lean();
    expect(job).toMatchObject({ status: 'dead', lastError: 'line_item_create_not_allowed' });
    // Only the granted scopes were asked for.
    expect(pA.tokenRequests.at(-1)!.scope.split(' ').sort()).toEqual(scope.sort());
  });

  it('a result held for manual release goes as PendingManual (no score); the teacher\'s release sends the score', async () => {
    pA.resetAgs();
    const t = await teacher(pA, 'rl-held', { enara_assignment: 'ASG-HELD' });
    const { session: s } = await learner(pA, 'student-1', 'rl-held', { enara_assignment: 'ASG-HELD' });
    const attemptId = await submit(s, t.launch.target.assignmentId, RIGHT);
    expect((await Models.AssessmentAttempt.findOne({ id: attemptId }).lean())!.gradingStatus).toBe('finalized');
    expect(pA.scores).toHaveLength(1);
    expect(pA.scores[0].body).toMatchObject({ gradingProgress: 'PendingManual', activityProgress: 'Submitted', userId: 'student-1' });
    expect(pA.scores[0].body).not.toHaveProperty('scoreGiven');
    const rel = await request(app).post(`/api/grading/attempts/${attemptId}/release`).set('Authorization', t.session).send({});
    expect(rel.status, JSON.stringify(rel.body)).toBe(200);
    await settle();
    expect(pA.scores).toHaveLength(2);
    expect(pA.scores[1].body).toMatchObject({ gradingProgress: 'FullyGraded', scoreGiven: 2, scoreMaximum: 2 });
    // A correction sends the corrected score.
    const c = await request(app).post(`/api/grading/attempts/${attemptId}/correct`).set('Authorization', t.session).send({ questionId: 'q2', points: 0, reason: 'checked again' });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    await settle();
    expect(pA.scores.at(-1)!.body).toMatchObject({ scoreGiven: 1, gradingProgress: 'FullyGraded' });
  });
});

describe('only real students linked to that LMS user', () => {
  beforeAll(() => setLmsEnv(ON));

  it('a staff preview gets the target but can submit nothing, so no job', async () => {
    const t = await teacher(pA, 'rl-eng', { enara_assessment: 'AS-ENG' });
    const before = await M.LmsGradeSyncJob.countDocuments({});
    const pv = await launchAndExchange(pA, { sub: 'teacher-1', 'lti:roles': [ROLE.learner], ...activity(pA, 'rl-eng', { enara_assessment: 'AS-ENG' }) });
    expect(pv.launch).toMatchObject({ preview: true, target: { kind: 'assignment', assignmentId: t.launch.target.assignmentId } });
    const r = await request(app).post(`/api/me/assignments/${t.launch.target.assignmentId}/attempts`).set('Authorization', pv.session).send({});
    expect(r.status).toBe(403);
    await settle();
    expect(await M.LmsGradeSyncJob.countDocuments({})).toBe(before);
  });

  it('a preview of an unbound link never binds or creates anything', async () => {
    await teacher(pA, 'rl-unbound', {});
    const pv = await launchAndExchange(pA, { sub: 'teacher-1', 'lti:roles': [ROLE.learner], ...activity(pA, 'rl-unbound', { enara_assessment: 'AS-MATH' }) });
    expect(pv.launch.preview).toBe(true);
    expect(pv.launch.target).toBeNull();
    expect((await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-unbound' }).lean())!.enaraActivityId).toBeUndefined();
  });

  it('an ENARA student without an LMS link, and an attempt of another school, get no job', async () => {
    const t = await teacher(pA, 'rl-eng', { enara_assessment: 'AS-ENG' });
    const id = t.launch.target.assignmentId;
    await Models.Student.create({ id: 'STU-PLAIN', name: 'Plain Student', email: 'plain@x.test', grade: '', avatar: 'PS', institutionId: A });
    await Models.User.create({ email: 'plain@x.test', password: 'x', role: 'student', name: 'Plain', institutionId: A, studentId: 'STU-PLAIN' });
    await Models.AssessmentAttempt.create({ id: 'AT-PLAIN', assessmentId: 'AS-ENG', assessmentTitle: 'x', studentId: 'STU-PLAIN', institutionId: A, status: 'submitted', assignmentId: id, gradingStatus: 'released', totalPoints: 2, maxPoints: 2, score: 100, submittedAt: new Date() });
    await Models.AssessmentAttempt.create({ id: 'AT-OTHER-SCHOOL', assessmentId: 'AS-ENG', assessmentTitle: 'x', studentId: 'STU-B', institutionId: B, status: 'submitted', assignmentId: id, gradingStatus: 'released', totalPoints: 2, maxPoints: 2, score: 100, submittedAt: new Date() });
    const r1 = await outbox.enqueueForAttempt('AT-PLAIN', 'test');
    const r2 = await outbox.enqueueForAttempt('AT-OTHER-SCHOOL', 'test');
    expect(r1).toEqual({ jobIds: [], outcomes: ['not_linked'] });
    expect(r2).toEqual({ jobIds: [], outcomes: [] });
    expect(await M.LmsGradeSyncJob.exists({ enaraAttemptId: { $in: ['AT-PLAIN', 'AT-OTHER-SCHOOL'] } })).toBeNull();
  });

  it('checked again before sending: a job whose learner is no longer linked is dead (not_eligible), nothing posted', async () => {
    setLmsEnv(QUEUED);
    try {
      const t = await teacher(pA, 'rl-eng', { enara_assessment: 'AS-ENG' });
      const { session: s } = await learner(pA, 'student-unlink', 'rl-eng', { enara_assessment: 'AS-ENG' });
      await submit(s, t.launch.target.assignmentId, RIGHT);
      const lu = await M.LmsUser.findOne({ externalUserId: 'student-unlink' }).lean();
      const job = await M.LmsGradeSyncJob.findOne({ lmsUserId: lu!.id, status: 'pending' }).lean();
      expect(job).toBeTruthy();
      await M.LmsEnrollment.updateOne({ lmsUserId: lu!.id }, { $set: { status: 'inactive' } });
      pA.scores = [];
      setLmsEnv(ON);
      await outbox.drainGradeJobs({ filter: { lmsUserId: lu!.id }, trigger: 'test' });
      expect(pA.scores).toHaveLength(0);
      expect(await M.LmsGradeSyncJob.findOne({ id: job!.id }).lean()).toMatchObject({ status: 'dead', lastError: 'not_eligible' });
    } finally {
      setLmsEnv(ON);
    }
  });
});

describe('the outbox: idempotency, supersede, lease, concurrency, backoff, dead, retry', () => {
  let assignmentId: string;
  const students: { sub: string; session: string; lmsUserId: string }[] = [];

  beforeAll(async () => {
    setLmsEnv(QUEUED);
    const t = await teacher(pA, 'rl-outbox', { enara_assessment: 'AS-ENG' });
    assignmentId = t.launch.target.assignmentId;
    for (const sub of ['ob-1', 'ob-2', 'ob-3', 'ob-4']) {
      const { session } = await learner(pA, sub, 'rl-outbox', { enara_assessment: 'AS-ENG' });
      students.push({ sub, session, lmsUserId: (await M.LmsUser.findOne({ externalUserId: sub }).lean())!.id });
    }
  });
  afterAll(() => setLmsEnv(ON));

  it('the same result queued twice is one job; a newer result replaces the older one still pending', async () => {
    const st = students[0];
    const attemptId = await submit(st.session, assignmentId, RIGHT);
    expect(await jobsFor({ lmsUserId: st.lmsUserId })).toHaveLength(1);
    await events.lmsResultChanged(attemptId, 'again');
    await events.lmsResultChanged(attemptId, 'again');
    const jobs = await jobsFor({ lmsUserId: st.lmsUserId });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('pending');
    // A newer attempt (latest policy): the old pending job is replaced.
    await submit(st.session, assignmentId, HALF);
    const after = await jobsFor({ lmsUserId: st.lmsUserId });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: 'pending', scoreGiven: 1 });
    expect(after[0].id).not.toBe(jobs[0].id);
    expect(after[0].scoreTimestamp.getTime()).toBeGreaterThan(jobs[0].scoreTimestamp.getTime());
  });

  it('two drains at once never send a job twice; an expired lease goes back to pending', async () => {
    for (const st of students.slice(1)) await submit(st.session, assignmentId, RIGHT);
    const pending = await M.LmsGradeSyncJob.countDocuments({ resourceLinkId: { $exists: true }, status: 'pending', lmsUserId: { $in: students.map((s) => s.lmsUserId) } });
    expect(pending).toBe(4);
    pA.resetAgs();
    pA.scoreDelayMs = 30;
    setLmsEnv(ON);
    const contextId = (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-outbox' }).lean())!.contextId;
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => outbox.drainGradeJobs({ filter: { contextIds: [contextId] }, trigger: 'test' })));
    expect(d1.sent + d2.sent + d3.sent).toBe(4);
    expect(pA.scores).toHaveLength(4);
    expect(new Set(pA.scores.map((s) => s.body.userId)).size).toBe(4);
    // A crashed run: processing with an expired lease -> back to pending, sent once.
    const job = await M.LmsGradeSyncJob.findOne({ lmsUserId: students[1].lmsUserId, status: 'sent' }).lean();
    await M.LmsGradeSyncJob.updateOne({ id: job!.id }, { $set: { status: 'processing', leaseUntil: new Date(Date.now() - 1000), leaseOwner: 'crashed' } });
    const live = await M.LmsGradeSyncJob.findOne({ lmsUserId: students[2].lmsUserId, status: 'sent' }).lean();
    await M.LmsGradeSyncJob.updateOne({ id: live!.id }, { $set: { status: 'processing', leaseUntil: new Date(Date.now() + 60_000), leaseOwner: 'alive' } });
    pA.scores = [];
    const r = await outbox.drainGradeJobs({ trigger: 'test', filter: { lmsUserId: students[1].lmsUserId } });
    expect(r.released).toBeGreaterThanOrEqual(1);
    expect(r.sent).toBe(1);
    expect(pA.scores).toHaveLength(1);
    // A job with a live lease is left alone.
    const r2 = await outbox.drainGradeJobs({ trigger: 'test', filter: { lmsUserId: students[2].lmsUserId } });
    expect(r2.claimed).toBe(0);
    await M.LmsGradeSyncJob.updateOne({ id: live!.id }, { $set: { status: 'sent' }, $unset: { leaseUntil: 1, leaseOwner: 1 } });
    pA.scoreDelayMs = 0;
  });

  it('an older job is never sent after a newer one (superseded)', async () => {
    setLmsEnv(QUEUED);
    const st = students[3];
    const old = await M.LmsGradeSyncJob.findOne({ lmsUserId: st.lmsUserId, status: 'sent' }).lean();
    await submit(st.session, assignmentId, HALF); // newer, pending
    await M.LmsGradeSyncJob.updateOne({ id: old!.id }, { $set: { status: 'pending', nextAttemptAt: new Date(0) } });
    setLmsEnv(ON);
    pA.scores = [];
    const r = await outbox.drainGradeJobs({ trigger: 'test', filter: { lmsUserId: st.lmsUserId } });
    expect(r.superseded).toBe(1);
    expect(pA.scores).toHaveLength(1);
    expect(pA.scores[0].body.scoreGiven).toBe(1);
    expect(await M.LmsGradeSyncJob.exists({ id: old!.id })).toBeNull();
  });

  it('failures back off (1 m, then longer, with jitter); the 5th failure is dead; Retry sends it', async () => {
    setLmsEnv(QUEUED);
    const st = students[0];
    await submit(st.session, assignmentId, RIGHT);
    const job = (await M.LmsGradeSyncJob.findOne({ lmsUserId: st.lmsUserId, status: 'pending' }).lean())!;
    setLmsEnv(ON);
    pA.resetAgs();
    pA.scoreStatuses = [503, 503, 503, 503, 503];
    const waits: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const before = Date.now();
      await outbox.drainGradeJobs({ trigger: 'test', filter: { jobId: job.id } });
      const row = (await M.LmsGradeSyncJob.findOne({ id: job.id }).lean())!;
      expect(row.attempts).toBe(i);
      expect(row.lastError).toBe('score_http_503');
      if (i < 5) {
        expect(row.status).toBe('pending');
        waits.push(row.nextAttemptAt.getTime() - before);
        await M.LmsGradeSyncJob.updateOne({ id: job.id }, { $set: { nextAttemptAt: new Date() } });
      } else expect(row.status).toBe('dead');
    }
    expect(waits[0]).toBeGreaterThanOrEqual(54_000);
    expect(waits[0]).toBeLessThanOrEqual(67_000);
    expect(waits[1]).toBeGreaterThanOrEqual(270_000);
    expect(waits[3]).toBeGreaterThanOrEqual(2 * 3_600_000 * 0.9);
    const fail = await M.LmsAuditLog.findOne({ event: 'grade.failed', 'refIds.jobId': job.id, 'refIds.dead': true }).lean();
    expect(fail).toMatchObject({ outcome: 'fail', code: 'score_http_503' });
    // Visible to the school admin, then retried.
    const g = await request(app).get('/api/lms/grades').set('Authorization', auth.adminA);
    expect(g.status).toBe(200);
    const row = g.body.platforms.find((p: { platformId: string }) => p.platformId === platformA);
    expect(row.dead).toBeGreaterThanOrEqual(1);
    expect(row.lastErrorCode).toBe('score_http_503');
    expect(row.recentDead.map((d: { id: string }) => d.id)).toContain(job.id);
    noPii(g.body);
    const retry = await request(app).post(`/api/lms/platforms/${platformA}/grades/retry-dead`).set('Authorization', auth.adminA).send({});
    expect(retry.status).toBe(200);
    expect(retry.body.retried).toBeGreaterThanOrEqual(1);
    await settle();
    expect((await M.LmsGradeSyncJob.findOne({ id: job.id }).lean())!.status).toBe('sent');
  });

  it('a refusal a retry cannot fix (400) is dead at once; Retry-After can only lengthen the wait; the inline push retries quickly in-process', async () => {
    setLmsEnv(QUEUED);
    const st = students[1];
    await submit(st.session, assignmentId, HALF);
    const job = (await M.LmsGradeSyncJob.findOne({ lmsUserId: st.lmsUserId, status: 'pending' }).lean())!;
    setLmsEnv(ON);
    pA.scoreStatuses = [400];
    await outbox.drainGradeJobs({ trigger: 'test', filter: { jobId: job.id } });
    expect(await M.LmsGradeSyncJob.findOne({ id: job.id }).lean()).toMatchObject({ status: 'dead', attempts: 1, lastError: 'score_http_400' });
    // Inline: a 503 then OK in the same background push.
    pA.resetAgs();
    pA.scoreStatuses = [503];
    await submit(st.session, assignmentId, RIGHT);
    expect(pA.scores).toHaveLength(2);
    const latest = await M.LmsGradeSyncJob.findOne({ lmsUserId: st.lmsUserId }).sort({ scoreTimestamp: -1 }).lean();
    expect(latest).toMatchObject({ status: 'sent', attempts: 1 });
    const { backoffMs } = outbox;
    expect(backoffMs(1, 3600)).toBe(3_600_000);
  });

  it('flags off: nothing is queued or sent, the grade routes are the normal 404', async () => {
    setLmsEnv(LTI);
    const before = await M.LmsGradeSyncJob.countDocuments({});
    pA.resetAgs();
    await submit(students[2].session, assignmentId, RIGHT);
    expect(await M.LmsGradeSyncJob.countDocuments({})).toBe(before);
    expect(pA.scores).toHaveLength(0);
    expect((await request(app).get('/api/lms/grades').set('Authorization', auth.adminA)).status).toBe(404);
    expect((await request(app).post(`/api/lms/platforms/${platformA}/grades/resync`).set('Authorization', auth.adminA)).status).toBe(404);
    expect((await request(app).get('/api/cron/lms-drain').set('Authorization', `Bearer ${CRON_SECRET}`)).status).toBe(404);
    expect(await outbox.drainGradeJobs({ trigger: 'test' })).toMatchObject({ claimed: 0 });
    await events.lmsResultChanged('anything', 'x');
    // Everything off: the LMS routes are gone too.
    setLmsEnv({});
    expect((await request(app).get('/api/lms/grades').set('Authorization', auth.adminA)).status).toBe(404);
    setLmsEnv(ON);
  });
});

describe('delivery triggers and Re-sync', () => {
  let classId: string;
  let assignmentId: string;
  let teacherSession: string;
  let st: { session: string; lmsUserId: string };

  beforeAll(async () => {
    setLmsEnv(QUEUED);
    const t = await teacher(pA, 'rl-trig', { enara_assessment: 'AS-ENG' });
    classId = t.launch.classId;
    assignmentId = t.launch.target.assignmentId;
    teacherSession = t.session;
    const s = await learner(pA, 'trig-1', 'rl-trig', { enara_assessment: 'AS-ENG' });
    st = { session: s.session, lmsUserId: (await M.LmsUser.findOne({ externalUserId: 'trig-1' }).lean())!.id };
  });
  afterAll(() => setLmsEnv(ON));

  it('targeted: a teacher opening the class flushes its pending grades', async () => {
    setLmsEnv(QUEUED);
    await submit(st.session, assignmentId, RIGHT);
    expect(await M.LmsGradeSyncJob.countDocuments({ lmsUserId: st.lmsUserId, status: 'pending' })).toBe(1);
    pA.resetAgs();
    await request(app).get('/api/assignments').query({ classId }).set('Authorization', teacherSession);
    await settle();
    expect(pA.scores).toHaveLength(1);
    expect(await M.LmsGradeSyncJob.countDocuments({ lmsUserId: st.lmsUserId, status: 'pending' })).toBe(0);
  });

  it('targeted: the learner\'s own launch flushes their pending grades', async () => {
    await submit(st.session, assignmentId, HALF);
    pA.resetAgs();
    await learner(pA, 'trig-1', 'rl-trig', { enara_assessment: 'AS-ENG' });
    await settle();
    expect(pA.scores).toHaveLength(1);
    expect(pA.scores[0].body).toMatchObject({ userId: 'trig-1', scoreGiven: 1 });
  });

  it('piggyback: an API request drains in the background, at most once a minute across instances', async () => {
    setLmsEnv(QUEUED);
    await submit(st.session, assignmentId, RIGHT); // queued, nothing drains it yet
    expect(await M.LmsGradeSyncJob.countDocuments({ lmsUserId: st.lmsUserId, status: 'pending' })).toBe(1);
    setLmsEnv({ ...ON, LMS_DRAIN_TRIGGERS: 'piggyback' });
    await M.LmsLock.deleteMany({});
    drain.resetPiggybackForTests();
    pA.resetAgs();
    await request(app).get('/api/auth/session').set('Authorization', st.session);
    await settle();
    expect(pA.scores).toHaveLength(1);
    expect(await M.LmsGradeSyncJob.countDocuments({ lmsUserId: st.lmsUserId, status: 'pending' })).toBe(0);
    expect(await M.LmsLock.exists({ _id: 'lms-grade-drain' })).toBeTruthy();
    // The lock is held: another instance (local throttle reset) does nothing for a minute.
    setLmsEnv(QUEUED);
    await submit(st.session, assignmentId, HALF);
    setLmsEnv({ ...ON, LMS_DRAIN_TRIGGERS: 'piggyback' });
    drain.resetPiggybackForTests();
    await request(app).get('/api/auth/session').set('Authorization', st.session);
    await settle();
    expect(await M.LmsGradeSyncJob.countDocuments({ lmsUserId: st.lmsUserId, status: 'pending' })).toBe(1);
    await M.LmsLock.deleteMany({});
  });

  it('daily cron entry and the protected per-minute route', async () => {
    setLmsEnv({ ...ON, LMS_DRAIN_TRIGGERS: 'daily' });
    expect(await M.LmsGradeSyncJob.countDocuments({ lmsUserId: st.lmsUserId, status: 'pending' })).toBe(1);
    const r = await drain.scheduledDrain('daily');
    expect(r).toMatchObject({ sent: 1 });
    setLmsEnv({ ...ON, LMS_DRAIN_TRIGGERS: 'cron' });
    expect((await request(app).get('/api/cron/lms-drain')).status).toBe(401);
    expect((await request(app).get('/api/cron/lms-drain').set('Authorization', 'Bearer wrong-secret-of-the-same-length-x')).status).toBe(401);
    const ok = await request(app).get('/api/cron/lms-drain').set('Authorization', `Bearer ${CRON_SECRET}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ claimed: 0 });
    setLmsEnv({ ...ON, LMS_DRAIN_TRIGGERS: 'daily' });
    expect((await request(app).get('/api/cron/lms-drain').set('Authorization', `Bearer ${CRON_SECRET}`)).status).toBe(404);
  });

  it('Re-sync grades: the current result of every learner is queued again and sent with a newer timestamp', async () => {
    setLmsEnv(ON);
    pA.resetAgs();
    const before = await M.LmsGradeSyncJob.findOne({ lmsUserId: st.lmsUserId, status: 'sent' }).sort({ scoreTimestamp: -1 }).lean();
    const r = await request(app).post(`/api/lms/platforms/${platformA}/grades/resync`).set('Authorization', auth.adminA).send({ resourceLinkId: before!.resourceLinkId });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.links).toBe(1);
    expect(r.body.outcomes.requeued).toBe(1);
    await settle();
    expect(pA.scores).toHaveLength(1);
    expect(new Date(pA.scores[0].body.timestamp as string).getTime()).toBeGreaterThan(before!.scoreTimestamp.getTime());
    expect(await M.LmsAuditLog.exists({ event: 'grade.resync', platformId: platformA })).toBeTruthy();
    // The whole platform (ENARA admin).
    const all = await request(app).post(`/api/lms/platforms/${platformA}/grades/resync`).set('Authorization', auth.enara).send({});
    expect(all.status).toBe(200);
    expect(all.body.links).toBeGreaterThan(1);
    await settle();
  });
});

describe('admin endpoints: roles and tenant isolation', () => {
  beforeAll(() => setLmsEnv(ON));

  it('school admins see and act on their own school only; ENARA admins on all; others are refused', async () => {
    const own = await request(app).get('/api/lms/grades').set('Authorization', auth.adminB);
    expect(own.status).toBe(200);
    expect(own.body.platforms.map((p: { platformId: string }) => p.platformId)).toEqual([platformB]);
    for (const path of [`/api/lms/platforms/${platformA}/grades/resync`, `/api/lms/platforms/${platformA}/grades/retry-dead`]) {
      const r = await request(app).post(path).set('Authorization', auth.adminB).send({});
      expect(r.status, path).toBe(404);
      expect((await request(app).post(path).set('Authorization', auth.teacherA).send({})).status).toBe(403);
      expect((await request(app).post(path).send({})).status).toBe(401);
    }
    const enara = await request(app).get('/api/lms/grades').set('Authorization', auth.enara);
    expect(enara.body.platforms.map((p: { platformId: string }) => p.platformId).sort()).toEqual([platformA, platformB].sort());
    const scoped = await request(app).get('/api/lms/grades').query({ institutionId: B }).set('Authorization', auth.enara);
    expect(scoped.body.platforms.map((p: { platformId: string }) => p.platformId)).toEqual([platformB]);
    expect((await request(app).get('/api/lms/grades').set('Authorization', auth.teacherA)).status).toBe(403);
  });

  it('the migration is additive and runs twice', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const mig = MIGRATIONS.find((x) => x.id === '2026-11-18-lms-phase3-indexes')!;
    await mig.up();
    await mig.up();
    const idx = await M.LmsGradeSyncJob.collection.indexes();
    expect(idx.some((i) => i.key.resourceLinkId === 1 && i.key.lmsUserId === 1)).toBe(true);
  });

  it('every job and audit row is IDs and codes only', async () => {
    noPii(await M.LmsGradeSyncJob.find({}).lean());
    noPii(await M.LmsAuditLog.find({ event: { $in: ['grade.queued', 'grade.sent', 'grade.failed', 'grade.resync', 'grade.superseded', 'activity.bound'] } }).lean());
    expect(decodeJwt).toBeTypeOf('function');
  });
});
