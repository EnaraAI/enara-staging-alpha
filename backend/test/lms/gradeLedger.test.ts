import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE } from './mockPlatform';

// Grade ledger (owner decision 4, 2026-11-18; docs/lms/GRADE_LEDGER_NOTES.md):
// (a) every attempt its own record, (b) an append-only ledger entry per grade
// change, (c) the LMS sync log, (d) the teacher's grade history API (and its
// permissions), (e) grades changed directly in the LMS (detected, held, keep
// LMS / keep ENARA), (f) append-only enforcement and PDPL anonymisation,
// (g) the backfill; and GRADE_LEDGER_ENABLED off changes nothing. LMS parts run
// against the local mock platform (127.0.0.1 only).

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const CRON_SECRET = 'cron-secret-for-tests-0123456789';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', CRON_SECRET,
};
const KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL', 'GRADE_LEDGER_ENABLED'];
const LEDGER = { GRADE_LEDGER_ENABLED: 'true' };
const LTI = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK };
const LMS_ON = { ...LTI, LMS_GRADE_PASSBACK_ENABLED: 'true' };
const ON = { ...LMS_ON, ...LEDGER };
const QUEUED = { ...ON, LMS_DRAIN_TRIGGERS: 'targeted,daily' };

function setEnv(vars: Record<string, string | undefined>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'gl-school-a';
const B = 'gl-school-b';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let platformA: string;
const auth: Record<string, string> = {};
const ids: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');
let L: typeof import('../../src/models/GradeLedger');
let outbox: typeof import('../../src/integrations/lms/core/outbox');
let drain: typeof import('../../src/integrations/lms/core/drain');
let results: typeof import('../../src/integrations/lms/core/lmsResults');
let Models: {
  Assignment: typeof import('../../src/models/Assignment').Assignment;
  AssessmentAttempt: typeof import('../../src/models/AssessmentAttempt').AssessmentAttempt;
  User: typeof import('../../src/models/User').User;
  Student: typeof import('../../src/models/Student').Student;
};

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

const MC = (id: string, topic: string, correct: string) => ({ id, type: 'multiple-choice', text: `Question ${id}`, topic, options: [correct, 'other', 'third'], correctAnswer: correct, explanation: '', points: 1 });
const OPEN = { id: 'q2', type: 'open-response', text: 'Explain', modelAnswer: 'secret model answer', rubric: { criteria: [{ id: 'c', title: 'Reasoning', maxPoints: 2, levels: [{ id: 'l0', label: 'No', points: 0 }, { id: 'l2', label: 'Yes', points: 2 }] }] } };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ANTHROPIC_API_KEY']) delete process.env[k];
  setEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  L = await import('../../src/models/GradeLedger');
  outbox = await import('../../src/integrations/lms/core/outbox');
  drain = await import('../../src/integrations/lms/core/drain');
  results = await import('../../src/integrations/lms/core/lmsResults');
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
  Models = { Assignment, AssessmentAttempt, User, Student };
  const { Institution } = await import('../../src/models/Institution');
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, f !== 'ai_grading_enabled']));
  await Institution.create([{ id: A, name: 'School A', features }, { id: B, name: 'School B', features }]);

  const { Assessment } = await import('../../src/models/Assessment');
  const { publishAssessment } = await import('../../src/services/assessmentVersions');
  const mk = async (id: string, institutionId: string, questions: unknown[]) => {
    const a = await Assessment.create({ id, title: `Quiz ${id}`, institutionId, subject: 'Mathematics', status: 'active', lifecycle: 'draft', maxAttempts: 5, questions });
    await publishAssessment(a, 'seed');
  };
  await mk('AS-FOUR', A, [MC('q1', 'a', 'one'), MC('q2', 'b', 'two'), MC('q3', 'c', 'three'), MC('q4', 'd', 'four')]);
  await mk('AS-OPEN', A, [MC('q1', 'a', 'one'), OPEN]);
  await mk('AS-TWO', A, [MC('q1', 'a', 'one'), MC('q2', 'b', 'two')]);
  await mk('AS-THREE', A, [MC('q1', 'a', 'one'), MC('q2', 'b', 'two'), MC('q3', 'c', 'three')]);
  await mk('AS-B', B, [MC('q1', 'a', 'one')]);

  const { signAccessToken } = await import('../../src/auth/jwt');
  const mkUser = async (key: string, role: string, institutionId?: string, studentId?: string) => {
    const u = await User.create({ email: `${key}@ledger.test`, password: 'x', role, name: `Name ${key}`, institutionId, ...(studentId ? { studentId } : {}) });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId, studentId } as never)}`;
    ids[key] = u._id.toString();
    return u;
  };
  await mkUser('enara', 'enara-admin');
  await mkUser('adminA', 'admin', A);
  await mkUser('adminB', 'admin', B);
  await mkUser('teacherA', 'teacher', A);
  await mkUser('teacherA2', 'teacher', A);
  await mkUser('teacherB', 'teacher', B);
  const students = ['STU-1', 'STU-2', 'STU-3', 'STU-DEL', 'STU-BF', 'STU-OFF'];
  for (const sid of students) {
    await Student.create({ id: sid, name: `Pupil ${sid}`, email: `${sid.toLowerCase()}@pupils.test`, grade: '', avatar: 'P', institutionId: A });
    await mkUser(sid, 'student', A, sid);
  }
  await Student.create({ id: 'STU-OUT', name: 'Outsider', email: 'out@pupils.test', grade: '', avatar: 'O', institutionId: A });
  await CourseInstance.create({ id: 'CLS-PLAIN', courseId: 'X', courseName: 'Plain class', institutionId: A, batchId: 'B-PLAIN', visibility: 'student', isDemo: false, academicYear: '2026', instructorIds: [ids.teacherA], studentIds: students });
  await CourseInstance.create({ id: 'CLS-B', courseId: 'X', courseName: 'B class', institutionId: B, batchId: 'B-B', visibility: 'student', isDemo: false, academicYear: '2026', instructorIds: [ids.teacherB], studentIds: [] });
  const asg = (id: string, assessmentId: string, institutionId = A, classId = 'CLS-PLAIN', createdBy = ids.teacherA) =>
    Assignment.create({
      id, institutionId, assessmentId, assessmentVersion: 1, title: `Assignment ${id}`, classId, state: 'published',
      opensAt: new Date(Date.now() - 86_400_000), dueAt: new Date(Date.now() + 30 * 86_400_000), maxAttempts: 5, releasePolicy: 'auto', answerReveal: 'never', createdBy,
    });
  await asg('ASG-FOUR', 'AS-FOUR');
  await asg('ASG-OPEN', 'AS-OPEN');
  await asg('ASG-B', 'AS-B', B, 'CLS-B', ids.teacherB);

  pA = await new MockPlatform('https://moodle.ledger-a.test', 'client-gl').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({
    institutionId: A, vendor: 'moodle', issuer: pA.issuer, clientId: pA.clientId,
    authLoginUrl: pA.authLoginUrl, keysetUrl: pA.keysetUrl, authTokenUrl: pA.tokenUrl, deploymentIds: [pA.deploymentId],
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

const settle = () => drain.settleLmsBackgroundForTests();
const noPii = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/Layla|Hassan|@school\.example|Pupil /);

async function submitAs(session: string, assignmentId: string, answers: Record<string, string>) {
  const s = await request(app).post(`/api/me/assignments/${assignmentId}/attempts`).set('Authorization', session).send({});
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const r = await request(app).post(`/api/me/assignments/${assignmentId}/attempts/${s.body.attempt.id}/submit`).set('Authorization', session).send({ answers });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  await settle();
  return s.body.attempt.id as string;
}

const history = (who: string, assignmentId: string, studentId: string) => request(app).get(`/api/assignments/${assignmentId}/students/${studentId}/grade-history`).set('Authorization', who);
const entriesOf = (attemptId: string) => L.GradeLedgerEntry.find({ attemptId }).sort({ at: 1, _id: 1 }).lean();

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

const LINE = 21;
const LINE_PATH = `/lineitems/${LINE}/lineitem`;
const activity = (rl: string, custom: Record<string, string>) => ({
  'lti:resource_link': { id: rl, title: `Activity ${rl}` },
  'lti:custom': custom,
  'lti:context': { id: 'course-gl', label: 'MATH', title: 'Maths (LMS)' },
  ...pA.agsClaim({ lineitem: pA.lineItemUrl(LINE) }),
});
const lmsTeacher = (rl: string, custom: Record<string, string>) => launchAndExchange(pA, { sub: 'gl-teacher', 'lti:roles': [ROLE.instructor], ...activity(rl, custom) });
const lmsLearner = (sub: string, rl: string, custom: Record<string, string>) =>
  launchAndExchange(pA, { sub, name: 'Layla Hassan', given_name: 'Layla', family_name: 'Hassan', email: `${sub}@school.example`, 'lti:roles': [ROLE.learner], ...activity(rl, custom) });
const studentIdOf = async (sub: string) => {
  const lu = await M.LmsUser.findOne({ externalUserId: sub }).lean();
  return (await Models.User.findById(lu!.enaraUserId).lean())!.studentId as string;
};

const FOUR_75 = { q1: 'one', q2: 'two', q3: 'three', q4: 'other' };
const FOUR_25 = { q1: 'one', q2: 'other', q3: 'other', q4: 'other' };

// --------------------------------------------------------------- tests

describe('(a)(b) every attempt is its own record; every grade change is a ledger entry (LMS switches off)', () => {
  beforeAll(() => setEnv(LEDGER));
  afterAll(() => setEnv(ON));

  it('two attempts, 75 then 25: both attempts kept, each with its own entries; the history shows both', async () => {
    const a1 = await submitAs(auth['STU-1'], 'ASG-FOUR', FOUR_75);
    const a2 = await submitAs(auth['STU-1'], 'ASG-FOUR', FOUR_25);
    const [t1, t2] = await Promise.all([a1, a2].map((id) => Models.AssessmentAttempt.findOne({ id }).lean()));
    expect(t1).toMatchObject({ status: 'submitted', gradingStatus: 'released', score: 75, totalPoints: 3, maxPoints: 4 });
    expect(t2).toMatchObject({ status: 'submitted', gradingStatus: 'released', score: 25, totalPoints: 1, maxPoints: 4 });

    const e1 = await entriesOf(a1);
    expect(e1.map((e) => e.reason)).toEqual(['submitted', 'auto_graded']);
    expect(e1[0]).toMatchObject({ attemptNumber: 1, actor: 'student', studentId: 'STU-1', assignmentId: 'ASG-FOUR', institutionId: A, from: null, to: { points: 3, maxPoints: 4, percent: 75, status: 'grading_queued' } });
    expect(e1[1]).toMatchObject({ attemptNumber: 1, actor: 'system', from: { status: 'grading_queued' }, to: { points: 3, maxPoints: 4, percent: 75, status: 'released' } });
    const e2 = await entriesOf(a2);
    expect(e2.map((e) => e.reason)).toEqual(['newer_attempt', 'auto_graded']);
    expect(e2[1]).toMatchObject({ attemptNumber: 2, to: { points: 1, percent: 25, status: 'released' } });
    // No LMS: nothing in the sync log.
    expect(await L.GradeSyncLog.countDocuments({ attemptId: { $in: [a1, a2] } })).toBe(0);

    const h = await history(auth.teacherA, 'ASG-FOUR', 'STU-1');
    expect(h.status, JSON.stringify(h.body)).toBe(200);
    expect(h.body.student).toEqual({ id: 'STU-1', name: 'Pupil STU-1' });
    expect(h.body.attempts).toHaveLength(2);
    expect(h.body.attempts[0]).toMatchObject({ attemptId: a1, number: 1, gradingStatus: 'released', points: 3, maxPoints: 4, percent: 75, gradedBy: 'auto' });
    expect(h.body.attempts[1]).toMatchObject({ attemptId: a2, number: 2, percent: 25, gradedBy: 'auto' });
    expect(h.body.entries.map((e: { reason: string; attemptNumber: number }) => `${e.attemptNumber}:${e.reason}`)).toEqual(['1:submitted', '1:auto_graded', '2:newer_attempt', '2:auto_graded']);
    expect(h.body.syncLog).toEqual([]);
    expect(h.body.lms).toEqual([]);
    expect(h.body.lmsDecisions).toBe(false);
  });

  it('teacher override, scoring, finalize/release and correction: each an entry with old -> new, the teacher ID and the reason', async () => {
    const id = await submitAs(auth['STU-2'], 'ASG-OPEN', { q1: 'one', q2: 'Because the parts are equal.' });
    expect((await Models.AssessmentAttempt.findOne({ id }).lean())!.gradingStatus).toBe('needs_review');
    const put = (q: string, body: Record<string, unknown>) => request(app).put(`/api/grading/attempts/${id}/answers/${q}`).set('Authorization', auth.teacherA).send(body);
    expect((await put('q1', { points: 0, reason: 'answer copied from a neighbour' })).status).toBe(200);
    expect((await put('q2', { points: 2 })).status).toBe(200);
    expect((await request(app).post(`/api/grading/attempts/${id}/finalize`).set('Authorization', auth.teacherA).send({})).status).toBe(200);
    const c = await request(app).post(`/api/grading/attempts/${id}/correct`).set('Authorization', auth.teacherA).send({ questionId: 'q2', points: 1, reason: 'second look' });
    expect(c.status, JSON.stringify(c.body)).toBe(200);

    const e = await entriesOf(id);
    expect(e.map((x) => x.reason)).toEqual(['submitted', 'teacher_override', 'teacher_scored', 'teacher_finalized', 'released', 'teacher_correction']);
    expect(e[1]).toMatchObject({ actor: ids.teacherA, questionId: 'q1', note: 'answer copied from a neighbour', from: { points: 1, maxPoints: 3, status: 'needs_review' }, to: { points: 0, maxPoints: 3, status: 'needs_review' } });
    expect(e[2]).toMatchObject({ actor: ids.teacherA, from: { points: 0 }, to: { points: 2, status: 'graded_draft' } });
    expect(e[3]).toMatchObject({ actor: ids.teacherA, to: { points: 2, percent: 67, status: 'finalized' } });
    expect(e[4]).toMatchObject({ actor: ids.teacherA, from: { status: 'finalized' }, to: { status: 'released', percent: 67 } });
    expect(e[5]).toMatchObject({ actor: ids.teacherA, questionId: 'q2', note: 'second look', from: { points: 2, percent: 67, status: 'released' }, to: { points: 1, percent: 33, status: 'released' } });
    // The live attempt keeps the current score (overwritten in place); the ledger keeps every step.
    expect((await Models.AssessmentAttempt.findOne({ id }).lean())!.score).toBe(33);

    const h = await history(auth.teacherA, 'ASG-OPEN', 'STU-2');
    expect(h.body.attempts[0].gradedBy).toBe('teacher');
    expect(h.body.actors[ids.teacherA]).toEqual({ name: 'Name teacherA', role: 'teacher' });
    expect(h.body.entries[1]).toMatchObject({ reason: 'teacher_override', actor: ids.teacherA, note: 'answer copied from a neighbour' });
  });

  it('regrade: the teacher\'s request and the grader\'s new result are entries (regrade_after_grader_fix)', async () => {
    const id = await submitAs(auth['STU-3'], 'ASG-FOUR', FOUR_75);
    // The grader had stopped on this one (simulated), then a fix: the teacher sends it back.
    await Models.AssessmentAttempt.updateOne({ id }, { $set: { gradingStatus: 'grading_exception', exceptionReason: 'unsupported_question' } });
    const r = await request(app).post(`/api/grading/attempts/${id}/regrade`).set('Authorization', auth.teacherA).send({ reason: 'grader fixed' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.outcome).toBe('released');
    const e = await entriesOf(id);
    expect(e.map((x) => x.reason)).toEqual(['submitted', 'auto_graded', 'regrade_requested', 'regrade_after_grader_fix']);
    expect(e[2]).toMatchObject({ actor: ids.teacherA, note: 'grader fixed', to: { status: 'grading_queued' } });
    expect(e[3]).toMatchObject({ actor: 'system', to: { status: 'released', percent: 75 } });
    const h = await history(auth.teacherA, 'ASG-FOUR', 'STU-3');
    expect(h.body.attempts[0].gradedBy).toBe('regrade');
  });
});

describe('(d) grade history: who may see it (teacher of the class, school admin, ENARA admin; tenant-isolated)', () => {
  beforeAll(() => setEnv(ON));

  it('allows the class teacher, the school admin and an ENARA admin; refuses everyone else', async () => {
    for (const who of ['teacherA', 'adminA', 'enara']) expect((await history(auth[who], 'ASG-FOUR', 'STU-1')).status, who).toBe(200);
    // Another teacher of the same school (not this class), another school's admin and teacher: 404.
    for (const who of ['teacherA2', 'adminB', 'teacherB']) expect((await history(auth[who], 'ASG-FOUR', 'STU-1')).status, who).toBe(404);
    // A student (even the one concerned): 403. Anonymous: 401.
    expect((await history(auth['STU-1'], 'ASG-FOUR', 'STU-1')).status).toBe(403);
    expect((await request(app).get('/api/assignments/ASG-FOUR/students/STU-1/grade-history')).status).toBe(401);
    // A student who is not on the assignment, or an unknown one: 404.
    expect((await history(auth.teacherA, 'ASG-FOUR', 'STU-OUT')).status).toBe(404);
    expect((await history(auth.teacherA, 'ASG-FOUR', 'NOPE')).status).toBe(404);
    // School B's admin sees school B's assignment, not A's student through it.
    expect((await history(auth.adminB, 'ASG-B', 'STU-1')).status).toBe(404);
    // The LMS decision has the same gate.
    const d = (who: string) => request(app).post('/api/assignments/ASG-FOUR/students/STU-1/lms-decision').set('Authorization', auth[who]).send({ resourceLinkId: 'x', keep: 'lms' });
    expect((await d('teacherA2')).status).toBe(404);
    expect((await d('adminB')).status).toBe(404);
    expect((await d('STU-1')).status).toBe(403);
    expect((await d('teacherA')).status).toBe(404); // allowed, but no such LMS cell
  });

  it('the class assignment and grading screens offer it (and flag LMS changes) only when on', async () => {
    const on = await request(app).get('/api/assignments/ASG-FOUR').set('Authorization', auth.teacherA);
    expect(on.body.gradeLedger).toBe(true);
    expect(on.body.roster.find((r: { studentId: string }) => r.studentId === 'STU-1').lmsValueDiffers).toBe(false);
    const att = await Models.AssessmentAttempt.findOne({ studentId: 'STU-1', assignmentId: 'ASG-FOUR' }).lean();
    const rev = await request(app).get(`/api/grading/attempts/${att!.id}`).set('Authorization', auth.teacherA);
    expect(rev.body.gradeLedger).toBe(true);
  });
});

describe('(c)(e) LMS: sync log and grades changed in the LMS', () => {
  let assignmentId: string;
  let teacherSession: string;
  let link: { id: string; contextId: string };
  const st: Record<string, { session: string; studentId: string; lmsUserId: string }> = {};

  beforeAll(async () => {
    setEnv(ON);
    pA.resetAgs();
    const t = await lmsTeacher('rl-gl', { enara_assessment: 'AS-TWO' });
    assignmentId = t.launch.target.assignmentId;
    teacherSession = t.session;
    link = (await M.LmsResourceLink.findOne({ externalResourceLinkId: 'rl-gl' }).lean())!;
    for (const sub of ['gl-1', 'gl-2', 'gl-3', 'gl-4']) {
      const { session } = await lmsLearner(sub, 'rl-gl', { enara_assessment: 'AS-TWO' });
      st[sub] = { session, studentId: await studentIdOf(sub), lmsUserId: (await M.LmsUser.findOne({ externalUserId: sub }).lean())!.id };
    }
  });
  afterAll(() => setEnv(ON));

  it('a sent score gets a sync log row: what was sent, the job, the ledger entry; no names', async () => {
    const id = await submitAs(st['gl-1'].session, assignmentId, { q1: 'one', q2: 'two' });
    const rows = await L.GradeSyncLog.find({ attemptId: id }).lean();
    expect(rows).toHaveLength(1);
    const job = await M.LmsGradeSyncJob.findOne({ enaraAttemptId: id }).lean();
    const graded = (await entriesOf(id)).find((e) => e.reason === 'auto_graded');
    expect(rows[0]).toMatchObject({
      result: 'sent', jobId: job!.id, ledgerEntryId: graded!.id, platformId: platformA, resourceLinkId: link.id, lmsUserId: st['gl-1'].lmsUserId, tries: 1, studentId: st['gl-1'].studentId, assignmentId,
      sent: { scoreGiven: 2, scoreMaximum: 2, gradingProgress: 'FullyGraded', activityProgress: 'Completed', commentShort: 'Score: 2/2 (100%).' },
    });
    expect(rows[0].sent.commentHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rows[0].errorCode).toBeUndefined();
    noPii(rows);
    expect(pA.gradebookValue(LINE_PATH, 'gl-1')).toMatchObject({ resultScore: 100, resultMaximum: 100 });
  });

  it('failed (will retry), then retried (sent after a failure), and dead: one append-only row per try', async () => {
    setEnv(QUEUED);
    const id = await submitAs(st['gl-2'].session, assignmentId, { q1: 'one', q2: 'two' });
    const job = (await M.LmsGradeSyncJob.findOne({ enaraAttemptId: id }).lean())!;
    setEnv(ON);
    pA.scoreStatuses = [503];
    await outbox.drainGradeJobs({ trigger: 'test', filter: { jobId: job.id } });
    await M.LmsGradeSyncJob.updateOne({ id: job.id }, { $set: { nextAttemptAt: new Date() } });
    await outbox.drainGradeJobs({ trigger: 'test', filter: { jobId: job.id } });
    setEnv(QUEUED);
    const id2 = await submitAs(st['gl-2'].session, assignmentId, { q1: 'one', q2: 'other' });
    const job2 = (await M.LmsGradeSyncJob.findOne({ enaraAttemptId: id2 }).lean())!;
    setEnv(ON);
    pA.scoreStatuses = [400];
    await outbox.drainGradeJobs({ trigger: 'test', filter: { jobId: job2.id } });
    const rows = await L.GradeSyncLog.find({ lmsUserId: st['gl-2'].lmsUserId }).sort({ at: 1 }).lean();
    expect(rows.map((r) => [r.jobId, r.result, r.errorCode ?? null, r.tries])).toEqual([
      [job.id, 'failed', 'score_http_503', 1],
      [job.id, 'retried', null, 2],
      [job2.id, 'dead', 'score_http_400', 1],
    ]);
    expect(rows[0].nextAttemptAt).toBeInstanceOf(Date);
    const h = await history(teacherSession, assignmentId, st['gl-2'].studentId);
    expect(h.status).toBe(200);
    expect(h.body.syncLog.map((r: { result: string }) => r.result)).toEqual(['failed', 'retried', 'dead']);
    expect(h.body.syncLog[2]).toMatchObject({ attemptNumber: 2, errorCode: 'score_http_400', sent: { scoreGiven: 1, scoreMaximum: 2 } });
  });

  it('matching values (Moodle scales to 100) are in sync, within the tolerance', async () => {
    expect(results.sameValue(0.6667, 2 / 3)).toBe(true);
    expect(results.sameValue(0.5, 0.52)).toBe(false);
    expect(results.sameValue(null, null)).toBe(true);
    expect(results.sameValue(null, 0.5)).toBe(false);
    // 2/2 sent, Moodle shows 100/100.
    const s = await results.checkLmsResults({ resourceLinkId: link.id, institutionId: A });
    expect(s).toMatchObject({ differs: 0, newlyFlagged: 0 });
    expect(s.inSync).toBeGreaterThanOrEqual(1);
    // 2/3 sent, Moodle shows 66.67/100: the same.
    pA.setGradebook(LINE_PATH, 'gl-1', 66.67);
    await M.LmsGradeSyncJob.updateOne({ lmsUserId: st['gl-1'].lmsUserId, status: 'sent' }, { $set: { scoreGiven: 2, scoreMaximum: 3 } });
    await L.GradeSyncLog.collection.updateMany({ lmsUserId: st['gl-1'].lmsUserId }, { $set: { 'sent.scoreMaximum': 3 } }); // test setup only (raw)
    const s2 = await results.checkLmsResults({ resourceLinkId: link.id, institutionId: A });
    expect(s2.differs).toBe(0);
    // The request: {lineitem}/results with the line item's query kept, user_id, the result media type.
    const get = pA.resultGets.find((g) => g.query.includes('user_id=gl-1'))!;
    expect(get.path).toBe(`${LINE_PATH}/results`);
    expect(get.query).toContain('type_id=1');
    expect(get.accept).toBe('application/vnd.ims.lis.v2.resultcontainer+json');
    expect(pA.tokenRequests.at(-1)!.scope).toContain('https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly');
  });

  it('a grade changed in Moodle is detected on "Re-sync grades": ledger entry with both values, the cell is held, nothing is overwritten', async () => {
    const studentId = st['gl-3'].studentId;
    const first = await submitAs(st['gl-3'].session, assignmentId, { q1: 'one', q2: 'two' });
    expect(pA.gradebookValue(LINE_PATH, 'gl-3')!.resultScore).toBe(100);
    // The Moodle teacher types 40 in the gradebook.
    pA.setGradebook(LINE_PATH, 'gl-3', 40);
    const before = pA.scores.length;
    const r = await request(app).post(`/api/lms/platforms/${platformA}/grades/resync`).set('Authorization', auth.adminA).send({});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.lmsCheck.newlyFlagged).toBe(1);
    await settle();
    // Re-sync queued gl-3 again, but the held cell got nothing; Moodle still shows 40.
    expect(pA.scores.slice(before).filter((s) => s.body.userId === 'gl-3')).toHaveLength(0);
    expect(pA.gradebookValue(LINE_PATH, 'gl-3')!.resultScore).toBe(40);
    const detected = (await entriesOf(first)).find((e) => e.reason === 'lms_change_detected')!;
    expect(detected).toMatchObject({ actor: 'system', from: { points: 2, maxPoints: 2, fraction: 1 }, to: { points: 40, maxPoints: 100, fraction: 0.4, status: 'lms' }, lms: { resourceLinkId: link.id, platformId: platformA } });
    const slot = await L.GradeLmsSlot.findOne({ resourceLinkId: link.id, lmsUserId: st['gl-3'].lmsUserId }).lean();
    expect(slot).toMatchObject({ status: 'differs', studentId, assignmentId, lmsValue: { scoreGiven: 40, scoreMaximum: 100, fraction: 0.4 }, enaraValue: { scoreGiven: 2, scoreMaximum: 2, fraction: 1 } });
    const dead = await L.GradeSyncLog.findOne({ lmsUserId: st['gl-3'].lmsUserId, result: 'dead' }).lean();
    expect(dead?.errorCode).toBe('lms_value_differs');
    // A newer ENARA result is held too.
    await submitAs(st['gl-3'].session, assignmentId, { q1: 'one', q2: 'other' });
    expect(pA.scores.slice(before).filter((s) => s.body.userId === 'gl-3')).toHaveLength(0);
    // Checking again changes nothing (no second entry for the same LMS value).
    await results.checkLmsResults({ resourceLinkId: link.id, institutionId: A });
    expect((await L.GradeLedgerEntry.find({ studentId, reason: 'lms_change_detected' }).lean())).toHaveLength(1);

    // The teacher sees it: roster flag, history with both values.
    const asg = await request(app).get(`/api/assignments/${assignmentId}`).set('Authorization', teacherSession);
    expect(asg.body.roster.find((x: { studentId: string }) => x.studentId === studentId).lmsValueDiffers).toBe(true);
    const h = await history(teacherSession, assignmentId, studentId);
    expect(h.body.lmsDecisions).toBe(true);
    expect(h.body.lms).toEqual([expect.objectContaining({ resourceLinkId: link.id, status: 'differs', lmsValue: { scoreGiven: 40, scoreMaximum: 100, fraction: 0.4 } })]);
    expect(h.body.entries.map((e: { reason: string }) => e.reason)).toContain('lms_change_detected');
    noPii(h.body.entries);
  });

  it('"Keep LMS value": recorded, nothing sent, later checks compare with the kept value', async () => {
    const studentId = st['gl-3'].studentId;
    const before = pA.scores.length;
    const d = await request(app).post(`/api/assignments/${assignmentId}/students/${studentId}/lms-decision`).set('Authorization', teacherSession).send({ resourceLinkId: link.id, keep: 'lms' });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect(d.body).toEqual({ resolution: 'kept_lms_value', queued: 0 });
    await settle();
    expect(pA.scores.length).toBe(before);
    const kept = await L.GradeLedgerEntry.findOne({ studentId, reason: 'kept_lms_value' }).lean();
    expect(kept).toMatchObject({ actor: expect.any(String), from: { points: 2, maxPoints: 2 }, to: { points: 40, maxPoints: 100 } });
    expect(kept!.actor).not.toBe('system');
    expect(await L.GradeLmsSlot.findOne({ resourceLinkId: link.id, lmsUserId: st['gl-3'].lmsUserId }).lean()).toMatchObject({ status: 'resolved', resolution: 'kept_lms_value', agreedFraction: 0.4 });
    const again = await request(app).post(`/api/assignments/${assignmentId}/students/${studentId}/lms-decision`).set('Authorization', teacherSession).send({ resourceLinkId: link.id, keep: 'lms' });
    expect(again.status).toBe(409);
    const s = await results.checkLmsResults({ resourceLinkId: link.id, institutionId: A });
    expect(s.newlyFlagged).toBe(0);
  });

  it('"Keep ENARA value": a new LMS change (found through the context, as the Phase 4 roster hook calls it) is re-sent with ENARA\'s current value', async () => {
    const studentId = st['gl-3'].studentId;
    pA.setGradebook(LINE_PATH, 'gl-3', 10, { overridden: false });
    const context = (await M.LmsContext.findOne({ id: link.contextId }).lean())!;
    const s = await results.checkLmsResults(context);
    expect(s.newlyFlagged).toBe(1);
    const before = pA.scores.length;
    const d = await request(app).post(`/api/assignments/${assignmentId}/students/${studentId}/lms-decision`).set('Authorization', teacherSession).send({ resourceLinkId: link.id, keep: 'enara' });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect(d.body.resolution).toBe('kept_enara_value');
    await settle();
    // Latest policy: ENARA's current value is the second attempt (1/2), now in Moodle as 50.
    const sent = pA.scores.slice(before).filter((x) => x.body.userId === 'gl-3');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ scoreGiven: 1, scoreMaximum: 2 });
    expect(pA.gradebookValue(LINE_PATH, 'gl-3')!.resultScore).toBe(50);
    const kept = await L.GradeLedgerEntry.findOne({ studentId, reason: 'kept_enara_value' }).lean();
    expect(kept).toMatchObject({ from: { points: 10, maxPoints: 100 }, to: { points: 1, maxPoints: 2, status: 'FullyGraded' } });
    expect(await L.GradeLmsSlot.findOne({ resourceLinkId: link.id, lmsUserId: st['gl-3'].lmsUserId }).lean()).toMatchObject({ status: 'resolved', resolution: 'kept_enara_value' });
    const after = await results.checkLmsResults({ resourceLinkId: link.id, institutionId: A });
    expect(after).toMatchObject({ differs: 0, newlyFlagged: 0 });
    const h = await history(teacherSession, assignmentId, studentId);
    expect(h.body.entries.filter((e: { reason: string }) => e.reason.startsWith('lms_') || e.reason.startsWith('kept_')).map((e: { reason: string }) => e.reason)).toEqual(['lms_change_detected', 'kept_lms_value', 'lms_change_detected', 'kept_enara_value']);
    expect(h.body.syncLog.at(-1)).toMatchObject({ result: 'sent', sent: { scoreGiven: 1, scoreMaximum: 2 } });
  });

  it('the Phase 4 roster sync hook (afterRosterSync) runs this check when the ledger is on, and nothing when it is off', async () => {
    const { afterRosterSync } = await import('../../src/integrations/lms/core/rosterHooks');
    const context = (await M.LmsContext.findOne({ id: link.contextId }).lean())!;
    pA.setGradebook(LINE_PATH, 'gl-2', 3, { overridden: false });
    setEnv({ ...ON, GRADE_LEDGER_ENABLED: undefined });
    await afterRosterSync(context as never, {} as never);
    expect(await L.GradeLmsSlot.findOne({ lmsUserId: st['gl-2'].lmsUserId, status: 'differs' }).lean()).toBeNull();
    setEnv(ON);
    await afterRosterSync(context as never, {} as never);
    expect(await L.GradeLmsSlot.findOne({ lmsUserId: st['gl-2'].lmsUserId }).lean()).toMatchObject({ status: 'differs' });
  });

  it('the daily cron checks too (before its drain); a read failure is a code, not a crash', async () => {
    setEnv({ ...ON, LMS_DRAIN_TRIGGERS: 'daily' });
    pA.setGradebook(LINE_PATH, 'gl-1', 0);
    const r = await request(app).get('/api/cron/daily').set('Authorization', `Bearer ${CRON_SECRET}`);
    expect(r.body.lmsResultsCheck, JSON.stringify(r.body)).toMatchObject({ newlyFlagged: 1 });
    expect(await L.GradeLmsSlot.findOne({ lmsUserId: st['gl-1'].lmsUserId }).lean()).toMatchObject({ status: 'differs' });
    pA.resultStatuses = [503, 503, 503, 503, 503, 503];
    const s = await results.checkLmsResults({ all: true });
    expect(s.errors.results_http_503).toBeGreaterThanOrEqual(1);
    pA.resultStatuses = [];
    setEnv(ON);
  });

  it('switch off: no ledger writes, no sync log, holds are ignored, the extra API fields and routes are gone', async () => {
    setEnv(LMS_ON);
    const studentId = st['gl-1'].studentId; // held cell (cron test)
    const entries = await L.GradeLedgerEntry.countDocuments({});
    const rows = await L.GradeSyncLog.countDocuments({});
    const before = pA.scores.length;
    const id = await submitAs(st['gl-1'].session, assignmentId, { q1: 'other', q2: 'other' });
    expect(await L.GradeLedgerEntry.countDocuments({})).toBe(entries);
    expect(await L.GradeSyncLog.countDocuments({})).toBe(rows);
    // Exactly the Phase 3 behaviour: the score is sent although the cell was held while the ledger was on.
    expect(pA.scores.slice(before).filter((x) => x.body.userId === 'gl-1')).toHaveLength(1);
    expect(await M.LmsGradeSyncJob.findOne({ enaraAttemptId: id }).lean()).toMatchObject({ status: 'sent' });
    expect(await results.checkLmsResults({ all: true })).toMatchObject({ skipped: 'off', slots: 0 });
    expect((await history(teacherSession, assignmentId, studentId)).status).toBe(404);
    expect((await request(app).post(`/api/assignments/${assignmentId}/students/${studentId}/lms-decision`).set('Authorization', teacherSession).send({ resourceLinkId: link.id, keep: 'lms' })).status).toBe(404);
    const resync = await request(app).post(`/api/lms/platforms/${platformA}/grades/resync`).set('Authorization', auth.adminA).send({});
    expect(resync.body.lmsCheck).toBeUndefined();
    await settle();
    setEnv(ON);
  });
});

describe('switch off: identical API answers', () => {
  it('GET /api/assignments/:id and the grading screen: on = off + the ledger fields only', async () => {
    const att = await Models.AssessmentAttempt.findOne({ studentId: 'STU-1', assignmentId: 'ASG-FOUR' }).lean();
    setEnv({});
    const offA = (await request(app).get('/api/assignments/ASG-FOUR').set('Authorization', auth.teacherA)).body;
    const offR = (await request(app).get(`/api/grading/attempts/${att!.id}`).set('Authorization', auth.teacherA)).body;
    const entries = await L.GradeLedgerEntry.countDocuments({});
    // Hand grading with the switch off writes nothing.
    const id = await submitAs(auth['STU-OFF'], 'ASG-OPEN', { q1: 'one', q2: 'An answer.' });
    expect((await request(app).put(`/api/grading/attempts/${id}/answers/q1`).set('Authorization', auth.teacherA).send({ points: 0, reason: 'x' })).status).toBe(200);
    expect(await L.GradeLedgerEntry.countDocuments({})).toBe(entries);
    expect(offA).not.toHaveProperty('gradeLedger');
    expect(offA.roster[0]).not.toHaveProperty('lmsValueDiffers');
    expect(offR).not.toHaveProperty('gradeLedger');
    expect((await history(auth.teacherA, 'ASG-FOUR', 'STU-1')).status).toBe(404);

    setEnv(LEDGER);
    const onA = (await request(app).get('/api/assignments/ASG-FOUR').set('Authorization', auth.teacherA)).body;
    const onR = (await request(app).get(`/api/grading/attempts/${att!.id}`).set('Authorization', auth.teacherA)).body;
    const strip = (b: Record<string, unknown>) => {
      const { gradeLedger: _g, ...rest } = b;
      void _g;
      return { ...rest, ...(Array.isArray(rest.roster) ? { roster: (rest.roster as Record<string, unknown>[]).map(({ lmsValueDiffers: _x, ...r }) => r) } : {}) };
    };
    // Only STU-OFF's new attempt differs between the two reads; compare the other rows.
    const others = (b: { roster: { studentId: string }[] }) => ({ ...b, roster: b.roster.filter((r) => r.studentId !== 'STU-OFF'), summary: undefined });
    expect(others(strip(onA) as never)).toEqual(others(offA));
    expect(strip(onR)).toEqual(offR);
    setEnv(ON);
  });
});

describe('(f) append-only, and PDPL permanent deletion', () => {
  beforeAll(() => setEnv(ON));

  it('ledger and sync log rows cannot be updated or deleted through the models', async () => {
    const e = await L.GradeLedgerEntry.create({ institutionId: A, attemptId: 'AT-X', studentId: 'STU-X', reason: 'released', actor: 'system' });
    const s = await L.GradeSyncLog.create({ institutionId: A, platformId: 'p', attemptId: 'AT-X', result: 'sent' });
    for (const [Model, row] of [[L.GradeLedgerEntry, e], [L.GradeSyncLog, s]] as const) {
      const m = Model as unknown as typeof L.GradeLedgerEntry;
      await expect(m.updateOne({ id: row.id }, { $set: { actor: 'x' } })).rejects.toThrow(/append-only/);
      await expect(m.updateMany({}, { $set: { actor: 'x' } })).rejects.toThrow(/append-only/);
      await expect(m.findOneAndUpdate({ id: row.id }, { $set: { actor: 'x' } })).rejects.toThrow(/append-only/);
      await expect(m.replaceOne({ id: row.id }, { actor: 'x' } as never)).rejects.toThrow(/append-only/);
      await expect(m.findOneAndReplace({ id: row.id }, { actor: 'x' } as never)).rejects.toThrow(/append-only/);
      await expect(m.deleteOne({ id: row.id })).rejects.toThrow(/append-only/);
      await expect(m.deleteMany({})).rejects.toThrow(/append-only/);
      await expect(m.findOneAndDelete({ id: row.id })).rejects.toThrow(/append-only/);
      await expect(m.bulkWrite([{ deleteOne: { filter: { id: row.id } } }] as never)).rejects.toThrow(/append-only/);
      const doc = (await m.findOne({ id: row.id }))!;
      (doc as unknown as { actor: string }).actor = 'changed';
      await expect(doc.save()).rejects.toThrow(/append-only/);
      await expect(doc.deleteOne()).rejects.toThrow(/append-only/);
      expect(await m.countDocuments({ id: row.id })).toBe(1);
    }
  });

  it('no code path updates or deletes ledger rows (except PDPL), no route edits them, and only PDPL erasure deletes attempts', () => {
    const src = path.resolve(__dirname, '../../src');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (f.isDirectory()) walk(path.join(d, f.name));
        else if (f.name.endsWith('.ts')) files.push(path.join(d, f.name));
      }
    };
    walk(src);
    const rel = (f: string) => path.relative(src, f).split(path.sep).join('/');
    const writes = /(GradeLedgerEntry|GradeSyncLog)\s*\.\s*(updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|replaceOne|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete|findOneAndRemove|bulkWrite)\b/;
    const raw = /(GradeLedgerEntry|GradeSyncLog)\s*\.\s*collection\b|collection\(\s*['"]grade_(ledger|sync_log)['"]/;
    const attemptDelete = /AssessmentAttempt(\s*\.\s*collection)?\s*\.\s*(deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete|findOneAndRemove|remove)\b|collection\(\s*['"]assessmentattempts['"]\s*\)\s*\.\s*(deleteOne|deleteMany|drop)/;
    const offenders = { writes: [] as string[], raw: [] as string[], attempts: [] as string[], routes: [] as string[] };
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      if (writes.test(text)) offenders.writes.push(rel(f));
      if (raw.test(text)) offenders.raw.push(rel(f));
      if (attemptDelete.test(text)) offenders.attempts.push(rel(f));
      if (/\.(put|patch|delete)\(\s*['"`][^'"`]*(grade-history|ledger|sync-log)/i.test(text)) offenders.routes.push(rel(f));
    }
    expect(offenders.writes).toEqual([]);
    expect(offenders.routes).toEqual([]);
    // Raw collection access only in the PDPL function.
    expect(offenders.raw).toEqual(['services/gradeLedger.ts']);
    const ledgerSrc = fs.readFileSync(path.join(src, 'services/gradeLedger.ts'), 'utf8');
    const pdplStart = ledgerSrc.indexOf('export async function anonymiseGradeLedger');
    expect(pdplStart).toBeGreaterThan(0);
    for (const m of ledgerSrc.matchAll(/(GradeLedgerEntry|GradeSyncLog)\s*\.\s*collection/g)) expect(m.index!).toBeGreaterThan(pdplStart);
    // Attempts: deleted only by PDPL erasure (and the local dev seed, which wipes a dev database).
    expect(offenders.attempts.sort()).toEqual(['scripts/seed.ts', 'services/studentErasure.ts']);
  });

  it('PDPL: the kept result\'s entries move to its anonymous ID and new attempt ID, free text dropped; the rest is deleted', async () => {
    const kept = await submitAs(auth['STU-DEL'], 'ASG-FOUR', FOUR_75);
    const open = await submitAs(auth['STU-DEL'], 'ASG-OPEN', { q1: 'one', q2: 'My own words.' }); // needs review: not kept
    expect((await request(app).post(`/api/grading/attempts/${kept}/correct`).set('Authorization', auth.teacherA).send({ questionId: 'q4', points: 1, reason: 'Pupil STU-DEL explained it in class' })).status).toBe(200);
    await L.GradeSyncLog.create({ institutionId: A, platformId: platformA, resourceLinkId: 'rl-x', lmsUserId: 'lmsu-del', jobId: 'lmsj-del', attemptId: kept, studentId: 'STU-DEL', result: 'sent', sent: { scoreGiven: 4, scoreMaximum: 4 } });
    await L.GradeLmsSlot.create({ institutionId: A, platformId: platformA, contextId: 'c', resourceLinkId: 'rl-x', lmsUserId: 'lmsu-del', studentId: 'STU-DEL', attemptId: kept, status: 'differs' });
    expect(await L.GradeLedgerEntry.countDocuments({ studentId: 'STU-DEL' })).toBe(4); // kept: submitted, auto_graded, teacher_correction; not kept: submitted

    const { permanentlyDeleteStudent } = await import('../../src/services/studentErasure');
    const s = (await Models.Student.findOne({ id: 'STU-DEL' }).lean())!;
    const out = await permanentlyDeleteStudent(s as never, { id: ids.adminA, role: 'admin' });
    expect(out.anonymised).toMatchObject({ assessment_attempts: 1, grade_ledger: 3, grade_sync_log: 1 });
    expect(out.removed).toMatchObject({ grade_ledger: 1, grade_lms_slots: 1 });

    const anon = (await Models.AssessmentAttempt.findOne({ anonymised: true, assignmentId: 'ASG-FOUR', score: 100 }).lean())!;
    expect(anon.id).not.toBe(kept);
    const rows = await L.GradeLedgerEntry.find({ attemptId: anon.id }).sort({ at: 1 }).lean();
    expect(rows.map((r) => r.reason)).toEqual(['submitted', 'auto_graded', 'teacher_correction']);
    for (const r of rows) {
      expect(r).toMatchObject({ studentId: anon.studentId, anonymised: true });
      expect(r.note).toBeUndefined();
    }
    expect(rows[2]).toMatchObject({ from: { points: 3 }, to: { points: 4 }, actor: ids.teacherA });
    const sync = await L.GradeSyncLog.findOne({ attemptId: anon.id }).lean();
    expect(sync).toMatchObject({ studentId: anon.studentId, anonymised: true, sent: { scoreGiven: 4 } });
    expect(sync!.lmsUserId).toBeUndefined();
    expect(sync!.jobId).toBeUndefined();
    // Nothing in the three collections names the student, the old attempt IDs, or the teacher's text.
    const all = JSON.stringify([
      ...(await L.GradeLedgerEntry.collection.find({}).toArray()),
      ...(await L.GradeSyncLog.collection.find({}).toArray()),
      ...(await L.GradeLmsSlot.collection.find({}).toArray()),
    ]);
    for (const needle of ['STU-DEL', kept, open, 'explained it in class', 'lmsu-del']) expect(all).not.toContain(needle);
    // The history API does not show anonymised rows.
    expect((await history(auth.teacherA, 'ASG-FOUR', 'STU-DEL')).status).toBe(404);
  });
});

describe('(g) backfill of existing attempts', () => {
  it('dry run writes nothing; apply gives each earlier attempt one entry from its stored state (and sent jobs a sync row); idempotent', async () => {
    setEnv(LMS_ON); // the earlier quiz: before the ledger existed
    const a1 = await submitAs(auth['STU-BF'], 'ASG-FOUR', FOUR_75);
    const a2 = await submitAs(auth['STU-BF'], 'ASG-FOUR', FOUR_25);
    const unlogged = await M.LmsGradeSyncJob.find({ status: 'sent' }).select('id').lean();
    const loggedJobs = new Set(await L.GradeSyncLog.distinct('jobId'));
    const jobsWithoutRow = unlogged.filter((j) => !loggedJobs.has(j.id)).map((j) => j.id);
    expect(jobsWithoutRow.length).toBeGreaterThanOrEqual(1); // the switch-off test's send
    expect(await L.GradeLedgerEntry.countDocuments({ attemptId: { $in: [a1, a2] } })).toBe(0);
    setEnv(ON);

    const { backfillGradeLedger } = await import('../../src/services/gradeLedgerBackfill');
    const total = await L.GradeLedgerEntry.countDocuments({});
    const dry = await backfillGradeLedger({ apply: false, institutionId: A });
    expect(dry.writes).toBe(0);
    expect(dry.ledgerEntries).toBeGreaterThanOrEqual(2);
    expect(dry.syncLogRows).toBeGreaterThanOrEqual(1);
    expect(await L.GradeLedgerEntry.countDocuments({})).toBe(total);

    const applied = await backfillGradeLedger({ apply: true, institutionId: A });
    expect(applied.writes).toBe(dry.ledgerEntries + dry.syncLogRows);
    const e1 = await entriesOf(a1);
    const e2 = await entriesOf(a2);
    expect(e1).toHaveLength(1);
    expect(e1[0]).toMatchObject({ reason: 'released', backfilled: true, attemptNumber: 1, actor: 'system', from: null, to: { points: 3, maxPoints: 4, percent: 75, status: 'released' } });
    expect(e2[0]).toMatchObject({ reason: 'released', attemptNumber: 2, to: { percent: 25 } });
    expect(await L.GradeSyncLog.countDocuments({ jobId: { $in: jobsWithoutRow }, backfilled: true, result: { $in: ['sent', 'retried'] } })).toBe(jobsWithoutRow.length);
    const h = await history(auth.teacherA, 'ASG-FOUR', 'STU-BF');
    expect(h.body.entries.map((x: { reason: string; backfilled: boolean }) => [x.reason, x.backfilled])).toEqual([['released', true], ['released', true]]);

    const again = await backfillGradeLedger({ apply: true, institutionId: A });
    expect(again).toMatchObject({ ledgerEntries: 0, syncLogRows: 0, writes: 0 });
  });

  it('the index migration creates the collections and their indexes, twice without harm', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const m = MIGRATIONS.find((x) => x.id === '2026-11-18-grade-ledger-indexes')!;
    await m.up();
    await m.up();
    const idx = await L.GradeLmsSlot.collection.indexes();
    expect(idx.some((i) => i.key.resourceLinkId === 1 && i.key.lmsUserId === 1 && i.unique)).toBe(true);
    expect((await L.GradeLedgerEntry.collection.indexes()).some((i) => i.key.attemptId === 1)).toBe(true);
  });
});
