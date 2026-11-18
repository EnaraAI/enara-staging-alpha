import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { COMMENT_MAX, NEWER_ATTEMPT_WAITING_LINE, withNewerAttemptWaiting } from '../../src/integrations/lms/core/scoring';
import { activityHealth, courseUrl, platformName, STALE_DAYS } from '../../src/integrations/lms/core/activityHealth';
import { MockPlatform, ROLE } from './mockPlatform';

// LMS Phase 3 follow-ups (docs/lms/PHASE_3_NOTES.md, "Follow-ups"):
//  G2  latest policy: a newer attempt waiting for a teacher re-sends the last
//      RELEASED grade with a "newer attempt waiting" line instead of
//      PendingManual; the teacher's ENARA view says so too;
//  the LMS activity an assignment belongs to (teacher views);
//  archive of an LMS assignment (who may; hidden from students; no grade sync);
//  "LMS activity may have been deleted" (404/410 for the line item; 30 days
//  without a launch or a result), in the teacher views and GET /api/lms/grades;
//  tenant isolation.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', CRON_SECRET: 'cron-secret-for-tests-0123456789',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL'];
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, LMS_GRADE_PASSBACK_ENABLED: 'true' };
const QUEUED = { ...ON, LMS_DRAIN_TRIGGERS: 'daily' };

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'p3f-school-a';
const B = 'p3f-school-b';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
let pB: MockPlatform;
let platformA: string;
const auth: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');
let outbox: typeof import('../../src/integrations/lms/core/outbox');
let drain: typeof import('../../src/integrations/lms/core/drain');
let health: typeof import('../../src/integrations/lms/core/activityHealth');
let Models: {
  Assignment: typeof import('../../src/models/Assignment').Assignment;
  AssessmentAttempt: typeof import('../../src/models/AssessmentAttempt').AssessmentAttempt;
  User: typeof import('../../src/models/User').User;
};

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

const MC = (id: string, correct: string) => ({ id, type: 'multiple-choice', text: `Question ${id}`, topic: 'Fractions', options: [correct, 'other', 'third'], correctAnswer: correct, explanation: '', points: 1 });
const Q4 = ['a', 'b', 'c', 'd'].map((c, i) => MC(`q${i + 1}`, c));
const ANS = (right: number) => Object.fromEntries(Q4.map((q, i) => [q.id, i < right ? q.correctAnswer : 'other']));

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
  health = await import('../../src/integrations/lms/core/activityHealth');
  outbox.setQuickRetriesForTests([5, 5, 5]);
  const { ClassEnrollment } = await import('../../src/models/ClassEnrollment');
  await ClassEnrollment.createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
  await AssessmentAttempt.createIndexes();
  const { Assignment } = await import('../../src/models/Assignment');
  const { CourseInstance } = await import('../../src/models/CourseInstance');
  Models = { Assignment, AssessmentAttempt, User };
  const { Institution } = await import('../../src/models/Institution');
  const { ALL_FLAGS } = await import('../../src/services/featureFlags');
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, f !== 'ai_grading_enabled']));
  await Institution.create([{ id: A, name: 'School A', features }, { id: B, name: 'School B', features }]);
  const { Curriculum } = await import('../../src/models/Curriculum');
  await Curriculum.create({ id: 'CUR-MATH', name: 'Maths', institutionId: A, courseName: 'Maths', type: 'National', level: 'A2', languages: ['English'], summary: 's', description: 'd', lastUpdated: '2026-11-18', subjectsCount: 1, chapters: [{ id: 'M1', title: 'Fractions', uploads: [] }] });
  const { Assessment } = await import('../../src/models/Assessment');
  const { publishAssessment } = await import('../../src/services/assessmentVersions');
  const mk = async (id: string, institutionId: string, over: Record<string, unknown> = {}) => {
    const a = await Assessment.create({ id, title: `Quiz ${id}`, institutionId, subject: 'Mathematics', status: 'active', lifecycle: 'draft', maxAttempts: 5, curriculumId: 'CUR-MATH', questions: Q4, ...over });
    await publishAssessment(a, 'seed');
  };
  await mk('AS-Q4', A);
  await mk('AS-Q4-PRACTICE', A, { assessmentKind: 'practice' });
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
  const otherTeacher = await mkUser('otherTeacherA', 'teacher', A);
  // Manual release (results held until the teacher releases them): copied into the LMS class.
  await CourseInstance.create({ id: 'CLS-A-OTHER', courseId: 'X', courseName: 'Other class', institutionId: A, batchId: 'B-OTHER', visibility: 'student', isDemo: false, academicYear: '2026', instructorIds: [otherTeacher._id.toString()], studentIds: [] });
  for (const [id, assessmentId] of [['ASG-HELD4', 'AS-Q4'], ['ASG-HELD4-PRACTICE', 'AS-Q4-PRACTICE']]) {
    await Assignment.create({
      id, institutionId: A, assessmentId, assessmentVersion: 1, title: `Held ${assessmentId}`, classId: 'CLS-A-OTHER', state: 'published',
      opensAt: new Date(Date.now() - 86_400_000), dueAt: new Date(Date.now() + 30 * 86_400_000), maxAttempts: 5, releasePolicy: 'manual', answerReveal: 'never', createdBy: otherTeacher._id.toString(),
    });
  }

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

const activity = (p: MockPlatform, rl: string, custom: Record<string, string>, course = '42') => ({
  'lti:resource_link': { id: rl, title: `Activity ${rl}` },
  'lti:custom': custom,
  'lti:context': { id: course, label: 'MATH', title: 'Maths (LMS)' },
  ...p.agsClaim({}),
});
const teacher = (p: MockPlatform, rl: string, custom: Record<string, string>, course?: string) =>
  launchAndExchange(p, { sub: 'teacher-1', 'lti:roles': [ROLE.instructor], ...activity(p, rl, custom, course) });
const learner = (p: MockPlatform, sub: string, rl: string, custom: Record<string, string>, course?: string) =>
  launchAndExchange(p, { sub, name: 'Layla Hassan', given_name: 'Layla', family_name: 'Hassan', email: `${sub}@school.example`, 'lti:roles': [ROLE.learner], ...activity(p, rl, custom, course) });

async function submit(session: string, assignmentId: string, answers: Record<string, string>) {
  const s = await request(app).post(`/api/me/assignments/${assignmentId}/attempts`).set('Authorization', session).send({});
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const r = await request(app).post(`/api/me/assignments/${assignmentId}/attempts/${s.body.attempt.id}/submit`).set('Authorization', session).send({ answers });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  await drain.settleLmsBackgroundForTests();
  return s.body.attempt.id as string;
}

async function release(session: string, attemptId: string) {
  const r = await request(app).post(`/api/grading/attempts/${attemptId}/release`).set('Authorization', session).send({});
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  await drain.settleLmsBackgroundForTests();
}

const settle = () => drain.settleLmsBackgroundForTests();
const linkOf = async (rl: string) => (await M.LmsResourceLink.findOne({ externalResourceLinkId: rl }).lean())!;
const rosterRow = async (session: string, assignmentId: string, studentId: string) =>
  (await request(app).get(`/api/assignments/${assignmentId}`).set('Authorization', session)).body.roster.find((r: { studentId: string }) => r.studentId === studentId);
const noPii = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/Layla|Hassan|@school\.example/);

// --------------------------------------------------------------- G2

describe('G2: a newer attempt waiting for the teacher keeps the last released grade in the LMS (latest)', () => {
  it('released 75 → newer attempt held → 75 re-sent with the waiting line → teacher releases 25 → 25 sent without it', async () => {
    pA.resetAgs();
    const t = await teacher(pA, 'rl-g2', { enara_assignment: 'ASG-HELD4' });
    const asg = t.launch.target.assignmentId as string;
    const { session, user } = await learner(pA, 'g2-1', 'rl-g2', { enara_assignment: 'ASG-HELD4' });
    expect(user.studentId).toBeTruthy();

    // Never released yet: PendingManual (unchanged).
    const first = await submit(session, asg, ANS(3));
    expect(pA.scores).toHaveLength(1);
    expect(pA.scores[0].body).toMatchObject({ gradingProgress: 'PendingManual', activityProgress: 'Submitted' });
    expect(pA.scores[0].body).not.toHaveProperty('scoreGiven');

    await release(t.session, first);
    expect(pA.scores).toHaveLength(2);
    expect(pA.scores[1].body).toMatchObject({ gradingProgress: 'FullyGraded', scoreGiven: 3, scoreMaximum: 4, comment: 'Score: 3/4 (75%). Details in ENARA.' });

    // A newer attempt held for the teacher: no PendingManual; the released 75 again, with the line.
    const second = await submit(session, asg, ANS(1));
    expect((await Models.AssessmentAttempt.findOne({ id: second }).lean())!.gradingStatus).toBe('finalized');
    expect(pA.scores).toHaveLength(3);
    const resent = pA.scores[2].body;
    expect(resent).toMatchObject({ gradingProgress: 'FullyGraded', activityProgress: 'Completed', scoreGiven: 3, scoreMaximum: 4 });
    expect(resent.comment).toBe(`Score: 3/4 (75%). Details in ENARA. ${NEWER_ATTEMPT_WAITING_LINE}`);
    expect(new Date(resent.timestamp as string) > new Date(pA.scores[1].body.timestamp as string)).toBe(true);
    expect(pA.scores.some((s) => s.body.gradingProgress === 'PendingManual' && s !== pA.scores[0])).toBe(false);
    const job = await M.LmsGradeSyncJob.findOne({ resourceLinkId: (await linkOf('rl-g2')).id }).sort({ scoreTimestamp: -1 }).lean();
    expect(job).toMatchObject({ enaraAttemptId: first, status: 'sent', scoreGiven: 3 });
    expect(await M.LmsAuditLog.exists({ event: 'grade.kept_released', 'refIds.attemptId': second })).toBeTruthy();

    // The same event again: nothing new is sent.
    const { lmsResultChanged } = await import('../../src/integrations/lms/core/gradeEvents');
    await lmsResultChanged(second, 'again');
    await settle();
    expect(pA.scores).toHaveLength(3);

    // ENARA: the teacher's row says so.
    const row = await rosterRow(t.session, asg, user.studentId);
    expect(row).toMatchObject({ newerAttemptWaiting: true, lastReleasedScore: 75, gradingStatus: 'finalized' });

    // Released: the new (lower) score, normal comment.
    await release(t.session, second);
    expect(pA.scores).toHaveLength(4);
    expect(pA.scores[3].body).toMatchObject({ gradingProgress: 'FullyGraded', scoreGiven: 1, scoreMaximum: 4, comment: 'Score: 1/4 (25%). Details in ENARA.' });
    expect(await rosterRow(t.session, asg, user.studentId)).toMatchObject({ newerAttemptWaiting: false, lastReleasedScore: null, score: 25 });
    noPii(pA.scores.map((s) => s.body));
  });

  it('a newer attempt that needs review (not just held) re-sends the last released grade too; a correction of it is sent with the line', async () => {
    pA.resetAgs();
    const t = await teacher(pA, 'rl-g2', { enara_assignment: 'ASG-HELD4' });
    const asg = t.launch.target.assignmentId as string;
    const lu = await M.LmsUser.findOne({ externalUserId: 'g2-1' }).lean();
    const user = await Models.User.findById(lu!.enaraUserId).lean();
    await Models.AssessmentAttempt.create({ id: 'AT-G2-REVIEW', assessmentId: 'AS-Q4', assessmentVersion: 1, assessmentTitle: 'x', studentId: user!.studentId, institutionId: A, status: 'submitted', assignmentId: asg, gradingStatus: 'needs_review', maxPoints: 4, submittedAt: new Date() });
    const r = await outbox.enqueueForAttempt('AT-G2-REVIEW', 'needs_review');
    expect(r.outcomes).toEqual(['queued']);
    await outbox.pushNow(r.jobIds);
    expect(pA.scores).toHaveLength(1);
    expect(pA.scores[0].body).toMatchObject({ gradingProgress: 'FullyGraded', scoreGiven: 1 });
    expect(pA.scores[0].body.comment).toBe(`Score: 1/4 (25%). Details in ENARA. ${NEWER_ATTEMPT_WAITING_LINE}`);
    expect((await rosterRow(t.session, asg, user!.studentId!)).newerAttemptWaiting).toBe(true);
    await Models.AssessmentAttempt.deleteOne({ id: 'AT-G2-REVIEW' });
  });

  it('best (practice) is unaffected: a newer held attempt and its lower release change nothing', async () => {
    pA.resetAgs();
    const t = await teacher(pA, 'rl-g2-best', { enara_assignment: 'ASG-HELD4-PRACTICE' });
    const asg = t.launch.target.assignmentId as string;
    expect((await linkOf('rl-g2-best')).activityKind).toBe('practice');
    const { session } = await learner(pA, 'g2-best', 'rl-g2-best', { enara_assignment: 'ASG-HELD4-PRACTICE' });
    const first = await submit(session, asg, ANS(3));
    expect(pA.scores.map((s) => s.body.gradingProgress)).toEqual(['PendingManual']);
    await release(t.session, first);
    expect(pA.scores).toHaveLength(2);
    const second = await submit(session, asg, ANS(1));
    expect(pA.scores).toHaveLength(2);
    await release(t.session, second);
    expect(pA.scores).toHaveLength(2);
    expect(pA.scores.every((s) => !String(s.body.comment ?? '').includes(NEWER_ATTEMPT_WAITING_LINE))).toBe(true);
    expect(await M.LmsAuditLog.exists({ event: 'grade.kept_released', 'refIds.attemptId': second })).toBeNull();
  });

  it('the comment length cap is respected and the line is never cut', () => {
    const long = `Score: 3/4 (75%). Criteria: ${'Reasoning 1/2, '.repeat(200)}Details in ENARA.`;
    const c = withNewerAttemptWaiting(long);
    expect(c.length).toBeLessThanOrEqual(COMMENT_MAX);
    expect(c.endsWith(NEWER_ATTEMPT_WAITING_LINE)).toBe(true);
    expect(withNewerAttemptWaiting('Score: 1/2 (50%).')).toBe(`Score: 1/2 (50%). ${NEWER_ATTEMPT_WAITING_LINE}`);
  });
});

// ------------------------------------------- linked activity, deleted, archive

describe('the LMS activity of an assignment, and "may have been deleted"', () => {
  it('teacher views show the platform, the activity title and a link to the Moodle course', async () => {
    const t = await teacher(pA, 'rl-show', { enara_assessment: 'AS-Q4' });
    const asg = t.launch.target.assignmentId as string;
    const list = await request(app).get('/api/assignments').query({ classId: t.launch.classId }).set('Authorization', t.session);
    const item = list.body.assignments.find((a: { id: string }) => a.id === asg);
    const host = new URL(pA.issuer).host;
    expect(item.lmsActivities).toEqual([
      expect.objectContaining({ platformName: `Moodle (${host})`, activityTitle: 'Activity rl-show', courseTitle: 'Maths (LMS)', courseUrl: `${pA.issuer}/course/view.php?id=42`, mayBeDeleted: false, reason: null }),
    ]);
    const detail = await request(app).get(`/api/assignments/${asg}`).set('Authorization', t.session);
    expect(detail.body.assignment.lmsActivities[0]).toMatchObject({ activityTitle: 'Activity rl-show' });
    // A plain ENARA assignment has none.
    const plain = await request(app).get('/api/assignments/ASG-HELD4').set('Authorization', auth.adminA);
    expect(plain.body.assignment.lmsActivities).toBeUndefined();
    // LTI off: no LMS block (and no LMS query).
    setLmsEnv({});
    const off = await request(app).get(`/api/assignments/${asg}`).set('Authorization', auth.adminA);
    expect(off.body.assignment.lmsActivities).toBeUndefined();
  });

  it('platform name and course URL helpers', () => {
    expect(platformName({ vendor: 'moodle', issuer: 'https://lms-test-enara.moodlecloud.com' })).toBe('Moodle (lms-test-enara.moodlecloud.com)');
    expect(courseUrl({ vendor: 'moodle', issuer: 'https://x.test/moodle/' }, '7')).toBe('https://x.test/moodle/course/view.php?id=7');
    expect(courseUrl({ vendor: 'moodle', issuer: 'https://x.test' }, 'abc')).toBeNull();
    expect(courseUrl({ vendor: 'generic', issuer: 'https://x.test' }, '7')).toBeNull();
    expect(courseUrl({ vendor: 'moodle', issuer: 'http://x.test' }, '7')).toBeNull();
  });

  for (const status of [404, 410]) {
    it(`the LMS answers ${status} for the line item: job dead (lineitem_gone), link flagged, shown to teacher and admin; nothing more is sent until the activity is launched again`, async () => {
      setLmsEnv(QUEUED);
      const rl = `rl-gone-${status}`;
      const t = await teacher(pA, rl, { enara_assessment: 'AS-Q4' });
      const asg = t.launch.target.assignmentId as string;
      const { session } = await learner(pA, `gone-${status}`, rl, { enara_assessment: 'AS-Q4' });
      await submit(session, asg, ANS(4));
      const link = await linkOf(rl);
      const job = (await M.LmsGradeSyncJob.findOne({ resourceLinkId: link.id, status: 'pending' }).lean())!;
      setLmsEnv(ON);
      pA.resetAgs();
      pA.scoreStatuses = [status];
      await outbox.drainGradeJobs({ trigger: 'test', filter: { jobId: job.id } });
      expect(await M.LmsGradeSyncJob.findOne({ id: job.id }).lean()).toMatchObject({ status: 'dead', lastError: 'lineitem_gone', attempts: 1 });
      expect(await linkOf(rl)).toMatchObject({ lineItemGoneStatus: status, lineItemUrl: pA.lineItemUrl() });
      expect((await linkOf(rl)).lineItemGoneAt).toBeInstanceOf(Date);

      // Teacher's view and the admin's grade view.
      const detail = await request(app).get(`/api/assignments/${asg}`).set('Authorization', t.session);
      expect(detail.body.assignment.lmsActivities[0]).toMatchObject({ mayBeDeleted: true, reason: 'lineitem_gone' });
      const g = await request(app).get('/api/lms/grades').set('Authorization', auth.adminA);
      const flagged = g.body.platforms.find((p: { platformId: string }) => p.platformId === platformA).activitiesMayBeDeleted;
      expect(flagged).toEqual(expect.arrayContaining([expect.objectContaining({ resourceLinkId: link.id, assignmentId: asg, activityTitle: `Activity ${rl}`, reason: 'lineitem_gone' })]));
      noPii(g.body);

      // No new job while flagged; "Retry failed" does not call the LMS again.
      pA.resetAgs();
      const again = await outbox.enqueueForLink((await linkOf(rl)), (await Models.User.findById((await M.LmsUser.findOne({ externalUserId: `gone-${status}` }).lean())!.enaraUserId).lean())!.studentId!, 'test');
      expect(again.outcome).toBe('lineitem_gone');
      await request(app).post(`/api/lms/platforms/${platformA}/grades/retry-dead`).set('Authorization', auth.adminA).send({});
      await settle();
      await outbox.drainGradeJobs({ trigger: 'test', filter: { jobId: job.id } });
      expect(pA.scores).toHaveLength(0);
      expect((await M.LmsGradeSyncJob.findOne({ id: job.id }).lean())!.lastError).toBe('lineitem_gone');

      // The activity is launched again: flag cleared; the next result is sent.
      await learner(pA, `gone-${status}`, rl, { enara_assessment: 'AS-Q4' });
      expect((await linkOf(rl)).lineItemGoneAt).toBeUndefined();
      await submit(session, asg, ANS(2));
      expect(pA.scores.at(-1)!.body).toMatchObject({ scoreGiven: 2, gradingProgress: 'FullyGraded' });
    });
  }

  it('30 days without a launch and without a result: flagged (fixed clock); a recent launch or result clears it', async () => {
    const now = new Date('2030-06-30T12:00:00Z');
    const day = 86_400_000;
    const old = new Date(now.getTime() - (STALE_DAYS + 1) * day);
    const recent = new Date(now.getTime() - 2 * day);
    expect(activityHealth({ lastLaunchAt: old }, null, now)).toMatchObject({ mayBeDeleted: true, reason: 'stale' });
    expect(activityHealth({ lastLaunchAt: old }, old, now)).toMatchObject({ mayBeDeleted: true, reason: 'stale' });
    expect(activityHealth({ lastLaunchAt: old }, recent, now)).toMatchObject({ mayBeDeleted: false });
    expect(activityHealth({ lastLaunchAt: recent }, null, now)).toMatchObject({ mayBeDeleted: false });
    expect(activityHealth({ lastLaunchAt: new Date(now.getTime() - (STALE_DAYS - 1) * day) }, null, now).mayBeDeleted).toBe(false);
    // Links from before lastLaunchAt existed: bound/created time stands in.
    expect(activityHealth({ boundAt: old, createdAt: old }, null, now).reason).toBe('stale');
    expect(activityHealth({ lineItemGoneAt: recent, lastLaunchAt: recent }, recent, now).reason).toBe('lineitem_gone');

    // Through the data: a link launched 31 days before the fixed "now", its assignment's only result older still.
    const t = await teacher(pA, 'rl-stale', { enara_assessment: 'AS-Q4' });
    const asg = t.launch.target.assignmentId as string;
    const link = await linkOf('rl-stale');
    await M.LmsResourceLink.updateOne({ id: link.id }, { $set: { lastLaunchAt: old } });
    const views = await health.linkedActivities(A, [asg], now);
    expect(views.get(asg)![0]).toMatchObject({ mayBeDeleted: true, reason: 'stale' });
    expect((await health.flaggedActivities(platformA, now)).map((f) => f.resourceLinkId)).toContain(link.id);
    // A recent result clears it.
    await Models.AssessmentAttempt.create({ id: 'AT-STALE-RECENT', assessmentId: 'AS-Q4', assessmentTitle: 'x', studentId: 'STU-X', institutionId: A, status: 'submitted', assignmentId: asg, gradingStatus: 'released', submittedAt: recent });
    expect((await health.linkedActivities(A, [asg], now)).get(asg)![0].mayBeDeleted).toBe(false);
    await Models.AssessmentAttempt.deleteOne({ id: 'AT-STALE-RECENT' });
    // Through GET /api/lms/grades (real clock); a launch updates lastLaunchAt and clears it.
    await M.LmsResourceLink.updateOne({ id: link.id }, { $set: { lastLaunchAt: new Date(Date.now() - (STALE_DAYS + 5) * day) } });
    const g = await request(app).get('/api/lms/grades').set('Authorization', auth.adminA);
    expect(g.body.platforms.find((p: { platformId: string }) => p.platformId === platformA).activitiesMayBeDeleted.map((f: { resourceLinkId: string }) => f.resourceLinkId)).toContain(link.id);
    await teacher(pA, 'rl-stale', { enara_assessment: 'AS-Q4' });
    expect((await linkOf('rl-stale')).lastLaunchAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const g2 = await request(app).get('/api/lms/grades').set('Authorization', auth.adminA);
    expect(g2.body.platforms.find((p: { platformId: string }) => p.platformId === platformA).activitiesMayBeDeleted.map((f: { resourceLinkId: string }) => f.resourceLinkId)).not.toContain(link.id);
  });
});

describe('archiving an LMS assignment', () => {
  it('teacher of the class: yes; another teacher: no; school admin: yes; another school\'s admin: no; ENARA admin: yes', async () => {
    const ids: string[] = [];
    for (const n of [1, 2, 3]) ids.push((await teacher(pA, `rl-arch-${n}`, { enara_assessment: 'AS-Q4' })).launch.target.assignmentId);
    const t = await teacher(pA, 'rl-arch-1', { enara_assessment: 'AS-Q4' });
    expect((await request(app).post(`/api/assignments/${ids[0]}/archive`).set('Authorization', auth.otherTeacherA)).status).toBe(404);
    expect((await request(app).post(`/api/assignments/${ids[0]}/archive`).set('Authorization', auth.adminB)).status).toBe(404);
    expect((await Models.Assignment.findOne({ id: ids[0] }).lean())!.state).toBe('published');
    const byTeacher = await request(app).post(`/api/assignments/${ids[0]}/archive`).set('Authorization', t.session);
    expect(byTeacher.status, JSON.stringify(byTeacher.body)).toBe(200);
    expect(byTeacher.body.state).toBe('archived');
    expect((await request(app).post(`/api/assignments/${ids[1]}/archive`).set('Authorization', auth.adminA)).body.state).toBe('archived');
    expect((await request(app).post(`/api/assignments/${ids[2]}/archive`).set('Authorization', auth.enara)).body.state).toBe('archived');
    const history = (await Models.Assignment.findOne({ id: ids[0] }).lean())!.history.map((h) => h.action);
    expect(history).toContain('archived');
    // Archived assignments leave the teacher's list (unless asked for), and keep their LMS block.
    const list = await request(app).get('/api/assignments').query({ classId: t.launch.classId }).set('Authorization', t.session);
    expect(list.body.assignments.map((a: { id: string }) => a.id)).not.toContain(ids[0]);
    const all = await request(app).get('/api/assignments').query({ classId: t.launch.classId, includeArchived: 'true' }).set('Authorization', t.session);
    expect(all.body.assignments.find((a: { id: string }) => a.id === ids[0]).lmsActivities[0].activityTitle).toBe('Activity rl-arch-1');
    // Archived activities are not reported as "may have been deleted".
    await M.LmsResourceLink.updateOne({ externalResourceLinkId: 'rl-arch-2' }, { $set: { lineItemGoneAt: new Date() } });
    expect((await health.flaggedActivities(platformA)).map((f) => f.assignmentId)).not.toContain(ids[1]);
  });

  it('an archived assignment is hidden from students, not opened by a launch, and never grade-synced', async () => {
    setLmsEnv(QUEUED);
    const t = await teacher(pA, 'rl-arch-sync', { enara_assessment: 'AS-Q4' });
    const asg = t.launch.target.assignmentId as string;
    const st = await learner(pA, 'arch-1', 'rl-arch-sync', { enara_assessment: 'AS-Q4' });
    const attemptId = await submit(st.session, asg, ANS(4));
    const link = await linkOf('rl-arch-sync');
    const pending = (await M.LmsGradeSyncJob.findOne({ resourceLinkId: link.id, status: 'pending' }).lean())!;
    expect(pending).toBeTruthy();
    expect((await request(app).post(`/api/assignments/${asg}/archive`).set('Authorization', t.session)).status).toBe(200);
    setLmsEnv(ON);

    // Students: not listed, not openable; the LMS launch no longer opens it.
    const mine = await request(app).get('/api/me/assignments').set('Authorization', st.session);
    expect(mine.status).toBe(200);
    expect(mine.body.assignments.map((a: { id: string }) => a.id)).not.toContain(asg);
    expect((await request(app).get(`/api/me/assignments/${asg}`).set('Authorization', st.session)).status).toBe(404);
    const again = await learner(pA, 'arch-1', 'rl-arch-sync', { enara_assessment: 'AS-Q4' });
    expect(again.launch.target).toBeNull();

    // No grade sync: the queued job is dead at send time, nothing posted; new results and Re-sync queue nothing.
    pA.resetAgs();
    await outbox.drainGradeJobs({ trigger: 'test', filter: { jobId: pending.id } });
    expect(pA.scores).toHaveLength(0);
    expect(await M.LmsGradeSyncJob.findOne({ id: pending.id }).lean()).toMatchObject({ status: 'dead', lastError: 'assignment_archived' });
    expect(await outbox.enqueueForAttempt(attemptId, 'corrected')).toEqual({ jobIds: [], outcomes: ['assignment_archived'] });
    const rs = await request(app).post(`/api/lms/platforms/${platformA}/grades/resync`).set('Authorization', auth.adminA).send({ resourceLinkId: link.id });
    expect(Object.keys(rs.body.outcomes)).toEqual(['assignment_archived']);
    await settle();
    expect(pA.scores).toHaveLength(0);
  });

  it('tenant isolation: another school sees no LMS activities or flags of school A', async () => {
    const tb = await launchAndExchange(pB, { sub: 'teacher-b', 'lti:roles': [ROLE.instructor], ...activity(pB, 'rl-b', { enara_assessment: 'AS-B' }, '9') });
    const asgB = tb.launch.target.assignmentId as string;
    await M.LmsResourceLink.updateOne({ externalResourceLinkId: 'rl-b' }, { $set: { lineItemGoneAt: new Date() } });
    const gB = await request(app).get('/api/lms/grades').set('Authorization', auth.adminB);
    expect(gB.body.platforms).toHaveLength(1);
    expect(gB.body.platforms[0].activitiesMayBeDeleted.map((f: { assignmentId: string }) => f.assignmentId)).toEqual([asgB]);
    const gA = await request(app).get('/api/lms/grades').set('Authorization', auth.adminA);
    expect(JSON.stringify(gA.body)).not.toContain(asgB);
    // School A's ids through school B's (or the other way): nothing.
    const linkA = await linkOf('rl-show');
    expect((await health.linkedActivities(B, [linkA.enaraActivityId!])).size).toBe(0);
    expect((await request(app).get(`/api/assignments/${linkA.enaraActivityId}`).set('Authorization', auth.adminB)).status).toBe(404);
    expect((await request(app).get(`/api/assignments/${asgB}`).set('Authorization', auth.adminB)).body.assignment.lmsActivities[0]).toMatchObject({ platformName: platformName({ vendor: 'generic', issuer: pB.issuer }), courseUrl: null });
    expect(platformName({ vendor: 'generic', issuer: pB.issuer })).toContain(new URL(pB.issuer).host);
  });
});
