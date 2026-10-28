import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assignmentStatus, studentStatus, submissionWindow } from '../src/services/assignments';
import { gradeAnswers, totals } from '../src/services/grading';
import { publishProblems } from '../src/services/assessmentVersions';

const H = 3600_000;
const t0 = new Date('2026-03-01T10:00:00Z');
const rules = (over: object = {}) => ({ state: 'published' as const, opensAt: t0, dueAt: new Date(t0.getTime() + 24 * H), latePolicy: 'not_accepted' as const, extensions: [], ...over });

describe('assignment rules (unit)', () => {
  it('opens, closes, accepts late work only when allowed, and honours extensions', () => {
    expect(submissionWindow(rules(), 's', new Date(t0.getTime() - H))).toEqual({ open: false, reason: 'not_open_yet' });
    expect(submissionWindow(rules(), 's', new Date(t0.getTime() + H))).toEqual({ open: true, late: false });
    expect(submissionWindow(rules(), 's', new Date(t0.getTime() + 25 * H))).toEqual({ open: false, reason: 'past_due' });
    const late = rules({ latePolicy: 'accept_late', closesAt: new Date(t0.getTime() + 48 * H) });
    expect(submissionWindow(late, 's', new Date(t0.getTime() + 25 * H))).toEqual({ open: true, late: true });
    expect(submissionWindow(late, 's', new Date(t0.getTime() + 49 * H))).toEqual({ open: false, reason: 'past_due' });
    const ext = rules({ extensions: [{ studentId: 's', dueAt: new Date(t0.getTime() + 30 * H), by: 't', at: t0, reason: 'ill' }] });
    expect(submissionWindow(ext, 's', new Date(t0.getTime() + 25 * H))).toEqual({ open: true, late: false });
    expect(submissionWindow(ext, 'other', new Date(t0.getTime() + 25 * H))).toEqual({ open: false, reason: 'past_due' });
    expect(submissionWindow(rules({ state: 'closed' }), 's', new Date(t0.getTime() + H))).toEqual({ open: false, reason: 'closed' });
  });
  it('reports assignment and student statuses from real records', () => {
    expect(assignmentStatus(rules(), new Date(t0.getTime() - H))).toBe('scheduled');
    expect(assignmentStatus(rules(), new Date(t0.getTime() + H))).toBe('active');
    expect(assignmentStatus(rules(), new Date(t0.getTime() + 25 * H))).toBe('closed');
    const now = new Date(t0.getTime() + 25 * H);
    expect(studentStatus(rules(), 's', [], now).status).toBe('missing');
    expect(studentStatus(rules(), 's', [{ status: 'submitted', gradingStatus: 'needs_review', submittedAt: new Date(t0.getTime() + 2 * H) }], now)).toEqual({ status: 'awaiting_review', late: false });
    expect(studentStatus(rules(), 's', [{ status: 'submitted', gradingStatus: 'released', submittedAt: new Date(t0.getTime() + 26 * H) }], now)).toEqual({ status: 'released', late: true });
  });
  it('scores by points, keeps open answers for a person, and validates before publishing', () => {
    const questions = [
      { id: 'a', type: 'multiple-choice', text: 'a', options: ['1', '2'], correctAnswer: '2', explanation: '', points: 2 },
      { id: 'b', type: 'open-response', text: 'b', explanation: '', rubric: { criteria: [{ id: 'c', title: 'Reasoning', maxPoints: 4, levels: [{ id: 'l0', label: 'None', points: 0 }, { id: 'l4', label: 'Full', points: 4 }] }] } },
    ] as any;
    const graded = gradeAnswers(questions, { a: '2', b: 'Because the denominators match' });
    expect(graded[0]).toMatchObject({ points: 2, maxPoints: 2, method: 'rule', isCorrect: true });
    expect(graded[1]).toMatchObject({ points: null, maxPoints: 4, needsReview: true, studentAnswer: 'Because the denominators match' });
    expect(totals(graded)).toMatchObject({ totalPoints: 2, maxPoints: 6, complete: false });
    expect(gradeAnswers(questions, { a: '1' })[1]).toMatchObject({ points: 0, method: 'rule' });
    expect(publishProblems({ title: 't', questions } as any)).toEqual([]);
    const bad = [{ ...questions[0], correctAnswer: '9' }, { ...questions[1], rubric: { criteria: [{ id: 'c', title: 'R', maxPoints: 5, levels: [{ id: 'l', label: 'x', points: 3 }] }] } }];
    expect(publishProblems({ title: 't', questions: bad } as any)).toHaveLength(2);
  });
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: 'test-jwt-secret-32-characters-minimum',
    JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend',
    JWT_AUDIENCE: 'enara-platform',
    INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999',
    ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998',
    AWS_S3_BUCKET: 'test-bucket',
    TRUST_PROXY: 'false',
    SERVE_LOCAL_UPLOADS: 'false',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'StudentCredit', 'Assignment', 'AssessmentAttempt', 'LearningObjective', 'LearningEvent', 'LearningEvidence', 'ReminderLog']) {
    M[name] = (await import(`../src/models/${name}`))[name];
  }
  const a = await import('../src/models/Assessment');
  M.Assessment = a.Assessment;
  M.AssessmentVersion = a.AssessmentVersion;
  await mongoose.connect(mongo.getUri());
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

let n = 0;
async function bearer(role: 'student' | 'teacher' | 'admin', institutionId: string, studentId?: string) {
  n += 1;
  const email = `${role}${n}@x.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId, studentId })}`;
  return {
    id: user._id.toString(),
    get: (url: string) => request(app).get(url).set('Authorization', auth),
    post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', auth).send(body),
    put: (url: string, body: object) => request(app).put(url).set('Authorization', auth).send(body),
    patch: (url: string, body: object) => request(app).patch(url).set('Authorization', auth).send(body),
    del: (url: string) => request(app).delete(url).set('Authorization', auth),
  };
}

const mc = (id: string, correct = 'right', obj?: string) => ({ id, type: 'multiple-choice', text: `${id}?`, options: ['right', 'wrong'], correctAnswer: correct, explanation: `why ${id}`, points: 2, ...(obj ? { objectiveIds: [obj] } : {}) });
const open = (id: string) => ({
  id, type: 'open-response', text: `Explain ${id}`, modelAnswer: 'secret model answer',
  rubric: { criteria: [{ id: 'reason', title: 'Reasoning', levels: [{ id: 'none', label: 'Missing', points: 0 }, { id: 'part', label: 'Partial', points: 2 }, { id: 'full', label: 'Complete', points: 4 }] }] },
});

let teacher: Awaited<ReturnType<typeof bearer>>;
let student: Awaited<ReturnType<typeof bearer>>;
beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  const features = { teaching_workflow_enabled: true, learning_intelligence_enabled: true, mastery_tracking_enabled: true };
  await M.Institution.create([{ id: 'instA', name: 'A', features }, { id: 'instB', name: 'B', features }]);
  await M.Curriculum.create([
    { id: 'cur', name: 'Fractions', courseName: 'Fractions', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [] },
    { id: 'cur2', name: 'Other', courseName: 'Other', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: [], chapters: [] },
  ]);
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create([
    { id: 'cls', courseId: 'fr', courseName: 'Fractions 6A', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: [], instructorIds: [teacher.id], visibility: 'student' },
    { id: 'cls2', courseId: 'ot', courseName: 'Other', institutionId: 'instA', academicYear: '2026', batchId: 'b2', curriculumId: 'cur2', studentIds: [], instructorIds: [], visibility: 'student' },
  ]);
  await M.Student.create([
    { id: 'stu1', name: 'Amira', email: 'a@x.com', grade: '6', institutionId: 'instA', batchId: 'b' },
    { id: 'stu2', name: 'Bilal', email: 'b@x.com', grade: '6', institutionId: 'instA', batchId: 'b' },
    { id: 'out', name: 'Other', email: 'o@x.com', grade: '6', institutionId: 'instA', batchId: 'b2' },
  ]);
  await M.LearningObjective.create({ id: 'obj', institutionId: 'instA', curriculumId: 'cur', code: 'FR.1', title: 'Add fractions', status: 'approved' });
  student = await bearer('student', 'instA', 'stu1');
});

async function publishedAssessment(questions: object[] = [mc('q1', 'right', 'obj'), mc('q2')]) {
  const created = await teacher.post('/api/assessments', { title: 'Fractions check', subject: 'Math', curriculumId: 'cur', questions, lifecycle: 'draft' });
  expect(created.status).toBe(201);
  const pub = await teacher.post(`/api/assessments/${created.body.id}/publish`);
  expect(pub.status).toBe(200);
  return created.body.id as string;
}
async function assign(assessmentId: string, extra: object = {}) {
  const res = await teacher.post('/api/assignments', { assessmentId, classId: 'cls', dueAt: new Date(Date.now() + 24 * H).toISOString(), ...extra });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('assessment authoring and versions', () => {
  it('lets teachers author drafts for curricula they teach, and publish versions', async () => {
    const draft = await teacher.post('/api/assessments', { title: 'Draft', subject: 'Math', curriculumId: 'cur', questions: [mc('q1'), open('q2')], lifecycle: 'draft' });
    expect(draft.body).toMatchObject({ lifecycle: 'draft', publishedVersion: 0, createdBy: teacher.id });
    expect((await teacher.post('/api/assessments', { title: 'X', subject: 'M', curriculumId: 'cur2', lifecycle: 'draft' })).status).toBe(403);
    expect((await teacher.post('/api/assessments', { title: 'X', subject: 'M', curriculumId: 'cur', batchId: 'b' })).status).toBe(403);
    expect((await teacher.post(`/api/assessments/${draft.body.id}/validate`)).body).toMatchObject({ valid: true, totalPoints: 6 });
    const v1 = await teacher.post(`/api/assessments/${draft.body.id}/publish`);
    expect(v1.body.version).toMatchObject({ version: 1, totalPoints: 6 });
    // Publishing again without changes returns the same version.
    expect((await teacher.post(`/api/assessments/${draft.body.id}/publish`)).body.version.version).toBe(1);
    // An edit to a published assessment becomes version 2; version 1 stays.
    await teacher.patch(`/api/assessments/${draft.body.id}`, { questions: [mc('q1'), open('q2'), mc('q3')] });
    const versions = (await teacher.get(`/api/assessments/${draft.body.id}/versions`)).body.versions;
    expect(versions.map((v: any) => v.version)).toEqual([2, 1]);
    expect((await teacher.get(`/api/assessments/${draft.body.id}/versions/1`)).body.questions).toHaveLength(2);
    // Invalid content isn't published.
    const bad = await teacher.post('/api/assessments', { title: 'Bad', subject: 'M', curriculumId: 'cur', lifecycle: 'draft', questions: [{ ...mc('q1'), correctAnswer: 'nope' }] });
    expect((await teacher.post(`/api/assessments/${bad.body.id}/publish`)).body.error.code).toBe('ASSESSMENT_INVALID');
  });
  it('never shows drafts or unpublished edits to students, and keeps student work', async () => {
    const admin = await bearer('admin', 'instA');
    const legacy = await admin.post('/api/assessments', { title: 'Legacy quiz', subject: 'Math', batchId: 'b', status: 'active', questions: [mc('q1')] });
    expect(legacy.body.publishedVersion).toBe(1);
    const draft = await admin.post('/api/assessments', { title: 'Hidden draft', subject: 'Math', batchId: 'b', status: 'active', questions: [mc('q1')], lifecycle: 'draft' });
    const list = (await student.get('/api/me/assessments')).body.map((a: any) => a.title);
    expect(list).toContain('Legacy quiz');
    expect(list).not.toContain('Hidden draft');
    expect((await student.post(`/api/me/assessments/${draft.body.id}/attempts`)).status).toBe(404);
    const start = await student.post(`/api/me/assessments/${legacy.body.id}/attempts`);
    expect(start.body.attempt.assessmentVersion).toBe(1);
    expect((await admin.del(`/api/assessments/${legacy.body.id}`)).body.error.code).toBe('ASSESSMENT_IN_USE');
    expect((await admin.post(`/api/assessments/${legacy.body.id}/archive`)).body.lifecycle).toBe('archived');
    expect((await student.get('/api/me/assessments')).body.map((a: any) => a.title)).not.toContain('Legacy quiz');
  });
  it('needs the teaching workflow flag for teachers, not for admins', async () => {
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.teaching_workflow_enabled': false } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    expect((await teacher.get('/api/assessments')).body.error.code).toBe('FEATURE_DISABLED');
    expect((await (await bearer('admin', 'instA')).get('/api/assessments')).status).toBe(200);
    expect((await student.get('/api/me/assignments')).status).toBe(404);
  });
});

describe('assignments and submissions', () => {
  it('assigns a published version, with real statuses, deadlines and an idempotent submit', async () => {
    const assessmentId = await publishedAssessment();
    const draftOnly = await teacher.post('/api/assessments', { title: 'D', subject: 'M', curriculumId: 'cur', lifecycle: 'draft', questions: [mc('q1')] });
    expect((await teacher.post('/api/assignments', { assessmentId: draftOnly.body.id, classId: 'cls', dueAt: new Date(Date.now() + H).toISOString() })).body.error.code).toBe('ASSESSMENT_NOT_PUBLISHED');
    expect((await teacher.post('/api/assignments', { assessmentId, classId: 'cls', studentIds: ['out'], dueAt: new Date(Date.now() + H).toISOString() })).status).toBe(400);
    const id = await assign(assessmentId, { releasePolicy: 'manual' });

    // A later edit of the assessment doesn't change the assigned version.
    await teacher.patch(`/api/assessments/${assessmentId}`, { questions: [mc('q1', 'wrong'), mc('q2'), mc('q3')] });

    const list = (await student.get('/api/me/assignments')).body.assignments;
    expect(list).toEqual([expect.objectContaining({ id, status: 'not_started', canSubmit: true, attemptsUsed: 0 })]);
    const start = await student.post(`/api/me/assignments/${id}/attempts`);
    expect(start.status).toBe(201);
    expect(start.body.questions).toHaveLength(2);
    expect(JSON.stringify(start.body)).not.toMatch(/correctAnswer|why q1|explanation/);
    // Starting again returns the same open attempt.
    expect((await student.post(`/api/me/assignments/${id}/attempts`)).body.attempt.id).toBe(start.body.attempt.id);

    const attemptId = start.body.attempt.id;
    await student.put(`/api/me/assignments/${id}/attempts/${attemptId}/draft`, { answers: { q1: 'right' } });
    expect((await student.post(`/api/me/assignments/${id}/attempts`)).body.attempt.draftAnswers).toEqual({ q1: 'right' });
    const submit = await student.post(`/api/me/assignments/${id}/attempts/${attemptId}/submit`, { answers: { q2: 'wrong' } });
    expect(submit.status).toBe(200);
    // Answer-key questions only: graded, validated and released at once (autograde-v1).
    expect(submit.body.result).toMatchObject({ attemptId, released: true, totalPoints: 2, maxPoints: 4, score: 50 });
    // A retried submit returns the same submission, not a second one.
    const retry = await student.post(`/api/me/assignments/${id}/attempts/${attemptId}/submit`, { answers: { q2: 'right' } });
    expect(retry.body.receipt).toEqual(submit.body.receipt);
    expect(await M.AssessmentAttempt.countDocuments({ assignmentId: id, status: 'submitted' })).toBe(1);
    const stored = await M.AssessmentAttempt.findOne({ id: attemptId }).lean();
    expect(stored).toMatchObject({ assessmentVersion: 1, gradingStatus: 'released', finalizedBy: 'system:grader', totalPoints: 2, maxPoints: 4 });
    expect(stored.answers.map((a: any) => a.studentAnswer)).toEqual(['right', 'wrong']);
    expect(stored.history.map((h: any) => h.action)).toEqual(['started', 'submitted', 'grading_started', 'validated', 'finalized', 'released', 'learning_intelligence_updated']);

    // One attempt by default.
    expect((await student.post(`/api/me/assignments/${id}/attempts`)).body.error.code).toBe('ATTEMPT_LIMIT_REACHED');
    const roster = (await teacher.get(`/api/assignments/${id}`)).body;
    expect(roster.summary).toMatchObject({ students: 2, released: 1, awaitingReview: 0, notStarted: 1 });
    expect(roster.roster.find((r: any) => r.studentId === 'stu1')).toMatchObject({ status: 'released', score: 50 });
  });
  it('auto-releases objective work when allowed and records evidence then', async () => {
    const id = await assign(await publishedAssessment(), { releasePolicy: 'auto', answerReveal: 'after-submit' });
    const start = await student.post(`/api/me/assignments/${id}/attempts`);
    const submit = await student.post(`/api/me/assignments/${id}/attempts/${start.body.attempt.id}/submit`, { answers: { q1: 'right', q2: 'wrong' } });
    expect(submit.body.result).toMatchObject({ released: true, totalPoints: 2, maxPoints: 4, score: 50, answerKeyShown: true });
    expect(submit.body.result.answers[1]).toMatchObject({ points: 0, correctAnswer: 'right' });
    expect(await M.LearningEvidence.countDocuments({ studentId: 'stu1', objectiveId: 'obj' })).toBe(1);
    expect((await student.get('/api/me/assignments')).body.assignments[0].status).toBe('released');
  });
  it('keeps open responses for review and never shows the model answer', async () => {
    const id = await assign(await publishedAssessment([mc('q1'), open('q2')]), { releasePolicy: 'auto' });
    const start = await student.post(`/api/me/assignments/${id}/attempts`);
    expect(JSON.stringify(start.body)).not.toContain('secret model answer');
    expect(start.body.questions[1].rubric.criteria[0].levels).toHaveLength(3);
    const submit = await student.post(`/api/me/assignments/${id}/attempts/${start.body.attempt.id}/submit`, { answers: { q1: 'right', q2: 'The parts must be the same size first.' } });
    expect(submit.body.result.released).toBe(false);
    expect((await M.AssessmentAttempt.findOne({ id: start.body.attempt.id }).lean()).gradingStatus).toBe('needs_review');
  });
  it('enforces opening times, deadlines, late work, extensions and time limits', async () => {
    const assessmentId = await publishedAssessment();
    const later = await assign(assessmentId, { opensAt: new Date(Date.now() + H).toISOString(), dueAt: new Date(Date.now() + 2 * H).toISOString() });
    expect((await student.post(`/api/me/assignments/${later}/attempts`)).body.error.code).toBe('ASSIGNMENT_NOT_OPEN_YET');

    const past = await M.Assignment.create({
      id: 'asg-past', institutionId: 'instA', assessmentId, assessmentVersion: 1, title: 'Past', classId: 'cls', state: 'published',
      opensAt: new Date(Date.now() - 3 * H), dueAt: new Date(Date.now() - H), createdBy: teacher.id,
    });
    expect((await student.post(`/api/me/assignments/${past.id}/attempts`)).body.error.code).toBe('ASSIGNMENT_PAST_DUE');
    expect((await teacher.post(`/api/assignments/${past.id}/extensions`, { studentId: 'stu1', dueAt: new Date(Date.now() + H).toISOString(), reason: 'Was ill' })).status).toBe(201);
    const ext = await student.post(`/api/me/assignments/${past.id}/attempts`);
    expect(ext.status).toBe(201);
    const stored = await M.Assignment.findOne({ id: past.id }).lean();
    expect(stored.dueAt.getTime()).toBe(past.dueAt.getTime());
    expect(stored.extensions[0]).toMatchObject({ studentId: 'stu1', by: teacher.id, reason: 'Was ill' });

    await M.Assignment.updateOne({ id: past.id }, { $set: { latePolicy: 'accept_late', closesAt: new Date(Date.now() + 2 * H), extensions: [] } });
    const late = await student.post(`/api/me/assignments/${past.id}/attempts/${ext.body.attempt.id}/submit`, { answers: { q1: 'right' } });
    expect(late.body.receipt.late).toBe(true);

    const timed = await assign(assessmentId, { timeLimitMinutes: 10 });
    const start = await student.post(`/api/me/assignments/${timed}/attempts`);
    expect(new Date(start.body.attempt.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60_000 + 1000);
    await student.put(`/api/me/assignments/${timed}/attempts/${start.body.attempt.id}/draft`, { answers: { q1: 'right' } });
    await M.AssessmentAttempt.updateOne({ id: start.body.attempt.id }, { $set: { expiresAt: new Date(Date.now() - 10 * 60_000) } });
    const over = await student.post(`/api/me/assignments/${timed}/attempts/${start.body.attempt.id}/submit`, { answers: { q1: 'wrong', q2: 'right' } });
    expect(over.status).toBe(200);
    const kept = await M.AssessmentAttempt.findOne({ id: start.body.attempt.id }).lean();
    expect(kept.answers.map((a: any) => a.studentAnswer)).toEqual(['right', '']);
    expect(kept.history.find((h: any) => h.action === 'submitted')).toMatchObject({ by: 'system:time-limit' });
  });
  it('keeps assignments within the teacher’s classes, the school and the student’s classes', async () => {
    const id = await assign(await publishedAssessment());
    const otherTeacher = await bearer('teacher', 'instA');
    expect((await otherTeacher.get(`/api/assignments/${id}`)).status).toBe(404);
    expect((await otherTeacher.post('/api/assignments', { assessmentId: 'x', classId: 'cls', dueAt: new Date().toISOString() })).status).toBe(404);
    expect((await (await bearer('admin', 'instB')).get(`/api/assignments/${id}`)).status).toBe(404);
    expect((await (await bearer('admin', 'instA')).get(`/api/assignments/${id}`)).status).toBe(200);
    const outsider = await bearer('student', 'instA', 'out');
    expect((await outsider.get(`/api/me/assignments/${id}`)).status).toBe(404);
    expect((await outsider.post(`/api/me/assignments/${id}/attempts`)).status).toBe(404);
    expect((await student.get('/api/assignments')).status).toBe(403);
    // Another student's attempt can't be submitted or read.
    const s2 = await bearer('student', 'instA', 'stu2');
    const start = await s2.post(`/api/me/assignments/${id}/attempts`);
    expect((await student.post(`/api/me/assignments/${id}/attempts/${start.body.attempt.id}/submit`, { answers: {} })).status).toBe(404);
    expect((await student.get(`/api/me/assignments/${id}/attempts/${start.body.attempt.id}/result`)).status).toBe(404);
  });
  it('moves through the assignment lifecycle with history', async () => {
    const id = await assign(await publishedAssessment(), { draft: true });
    expect((await student.get('/api/me/assignments')).body.assignments).toEqual([]);
    expect((await teacher.post(`/api/assignments/${id}/close`)).body.error.code).toBe('INVALID_ASSIGNMENT_STATE');
    expect((await teacher.post(`/api/assignments/${id}/publish`)).body.status).toBe('active');
    expect((await teacher.post(`/api/assignments/${id}/close`)).body.status).toBe('closed');
    expect((await student.post(`/api/me/assignments/${id}/attempts`)).body.error.code).toBe('ASSIGNMENT_CLOSED');
    expect((await teacher.post(`/api/assignments/${id}/reopen`)).body.status).toBe('active');
    expect((await teacher.post(`/api/assignments/${id}/archive`)).body.status).toBe('archived');
    const stored = await M.Assignment.findOne({ id }).lean();
    expect(stored.history.map((h: any) => h.action)).toEqual(['created_draft', 'published', 'closed', 'reopened', 'archived']);
  });
});
