import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'Assignment', 'AssessmentAttempt', 'LearningObjective', 'LearningEvent', 'LearningIntervention', 'StudentMisconception']) {
    M[name] = (await import(`../src/models/${name}`))[name];
  }
  const a = await import('../src/models/Assessment');
  M.Assessment = a.Assessment;
  M.AssessmentVersion = a.AssessmentVersion;
  M.StudentObjectiveMastery = (await import('../src/models/StudentObjectiveMastery')).StudentObjectiveMastery;
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
    patch: (url: string, body: object) => request(app).patch(url).set('Authorization', auth).send(body),
  };
}

const H = 3_600_000;
let teacher: Awaited<ReturnType<typeof bearer>>;
beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([
    { id: 'instA', name: 'A', features: { teaching_workflow_enabled: true } },
    { id: 'instB', name: 'B', features: { teaching_workflow_enabled: true } },
  ]);
  await M.Curriculum.create({ id: 'cur', name: 'Fractions', courseName: 'Fractions', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create([
    { id: 'cls', courseId: 'fr', courseName: 'Fractions 6A', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: [], instructorIds: [teacher.id], visibility: 'student' },
    { id: 'cls2', courseId: 'fr', courseName: 'Fractions 6B', institutionId: 'instA', academicYear: '2026', batchId: 'b2', curriculumId: 'cur', studentIds: [], instructorIds: [], visibility: 'student' },
  ]);
  await M.Student.create([
    { id: 'stu1', name: 'Amira', email: 'a@x.com', grade: '6', institutionId: 'instA', batchId: 'b' },
    { id: 'stu2', name: 'Bilal', email: 'b@x.com', grade: '6', institutionId: 'instA', batchId: 'b' },
    { id: 'stu3', name: 'Other', email: 'o@x.com', grade: '6', institutionId: 'instA', batchId: 'b2' },
  ]);
  await M.LearningObjective.create({ id: 'obj', institutionId: 'instA', curriculumId: 'cur', code: 'FR.1', title: 'Add fractions', status: 'approved' });
  await M.AssessmentVersion.create({ assessmentId: 'as1', institutionId: 'instA', version: 1, title: 'Quiz', subject: 'Math', questions: [], totalPoints: 4 });
  await M.Assignment.create([
    { id: 'past', institutionId: 'instA', assessmentId: 'as1', assessmentVersion: 1, title: 'Past quiz', classId: 'cls', state: 'published', opensAt: new Date(Date.now() - 48 * H), dueAt: new Date(Date.now() - H), createdBy: teacher.id },
    { id: 'soon', institutionId: 'instA', assessmentId: 'as1', assessmentVersion: 1, title: 'Due soon', classId: 'cls', state: 'published', opensAt: new Date(Date.now() - H), dueAt: new Date(Date.now() + 24 * H), createdBy: teacher.id },
  ]);
  // stu1 submitted the past quiz (awaiting review); stu2 missed it.
  await M.AssessmentAttempt.create({ id: 'att1', assessmentId: 'as1', assessmentTitle: 'Quiz', subject: 'Math', studentId: 'stu1', institutionId: 'instA', status: 'submitted', assignmentId: 'past',
    assessmentVersion: 1, gradingStatus: 'needs_review', submittedAt: new Date(Date.now() - 3 * H), startedAt: new Date(Date.now() - 4 * H), answers: [] });
  await M.LearningEvent.create({ id: 'ev1', studentId: 'stu1', institutionId: 'instA', type: 'assessment_started', source: 'assessment', verified: true, refs: { assessmentId: 'as1', attemptId: 'att1' }, at: new Date(Date.now() - 4 * H), objectiveIds: [], schemaVersion: 2 });
});

describe('instructor workspace', () => {
  it('summarises the teacher’s classes from real records', async () => {
    const o = (await teacher.get('/api/teaching/overview')).body;
    expect(o.classes).toEqual([expect.objectContaining({ id: 'cls', students: 2, activeAssignments: 1, awaitingReview: 1, missing: 1, nextDue: expect.objectContaining({ assignmentId: 'soon' }) })]);
    expect(o.review).toMatchObject({ needsReview: 1, scoredNotFinal: 0, finalNotReleased: 0 });
    expect(o.review.oldestWaitingHours).toBe(3);
    expect(o.upcoming.map((u: any) => u.id)).toEqual(['soon']);
    const roster = (await teacher.get('/api/teaching/classes/cls/roster')).body;
    expect(roster.students.find((s: any) => s.id === 'stu1')).toMatchObject({ submitted: 1, missing: 0, notStarted: 1, lastActiveAt: expect.any(String) });
    expect(roster.students.find((s: any) => s.id === 'stu2')).toMatchObject({ submitted: 0, missing: 1, lastActiveAt: null });
  });
  it('keeps profile sections apart and shows estimates only when enabled', async () => {
    let p = (await teacher.get('/api/teaching/students/stu1/profile')).body;
    expect(p.observed.submissions.find((s: any) => s.assignmentId === 'past')).toMatchObject({ status: 'awaiting_review' });
    expect(p.observed.activityLast30Days).toEqual([expect.objectContaining({ type: 'assessment_started', count: 1 })]);
    expect(p.results[0]).toMatchObject({ attemptId: 'att1', final: false, released: false });
    expect(p.estimates).toEqual({ enabled: false });
    expect(p.recommendations).toEqual({ enabled: false });
    expect(p.note).toMatch(/not grades or predictions/);

    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.learning_intelligence_enabled': true, 'features.mastery_tracking_enabled': true, 'features.misconception_detection_enabled': true } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    await M.StudentObjectiveMastery.create({ institutionId: 'instA', studentId: 'stu1', objectiveId: 'obj', masteryStatus: 'developing', masteryEstimate: 0.5, evidenceStrength: 'limited', evidenceCount: 2, independentEvidenceCount: 2, lastMasteryUpdateAt: new Date(), modelVersion: 'mastery-v1' });
    await M.StudentMisconception.create({ id: 'mis1', institutionId: 'instA', studentId: 'stu1', objectiveId: 'obj', ruleKey: 'r', category: 'procedural_error', description: 'Adds denominators', confidence: 0.6, supportingEvidenceIds: ['e1'], status: 'suspected', source: 'rule', detectionVersion: 'misc-rules-v1', detectedAt: new Date() });
    p = (await teacher.get('/api/teaching/students/stu1/profile')).body;
    expect(p.estimates.items).toEqual([expect.objectContaining({ code: 'FR.1', status: 'developing', evidenceStrength: 'limited' })]);
    expect(p.misconceptions.items).toEqual([expect.objectContaining({ code: 'FR.1', status: 'suspected', supportingEvidenceIds: ['e1'] })]);
  });
  it('limits everything to the teacher’s classes and the school', async () => {
    expect((await teacher.get('/api/teaching/students/stu3/profile')).status).toBe(404);
    expect((await teacher.get('/api/teaching/classes/cls2/roster')).status).toBe(404);
    expect((await (await bearer('admin', 'instB')).get('/api/teaching/students/stu1/profile')).status).toBe(404);
    expect((await (await bearer('admin', 'instA')).get('/api/teaching/students/stu3/profile')).status).toBe(200);
    expect((await (await bearer('student', 'instA', 'stu1')).get('/api/teaching/overview')).status).toBe(403);
    expect((await (await bearer('teacher', 'instA')).get('/api/teaching/overview')).body.classes).toEqual([]);
  });
  it('records educator interventions with rationale, owner, evidence and transitions', async () => {
    expect((await teacher.post('/api/teaching/interventions', { studentId: 'stu2', action: 'targeted_exercise', rationale: 'Missed the quiz' })).status).toBe(400);
    expect((await teacher.post('/api/teaching/interventions', { studentId: 'stu2', action: 'launch_rocket', rationale: 'x' })).status).toBe(400);
    const check = await teacher.post('/api/teaching/interventions', { studentId: 'stu2', action: 'check_in', rationale: 'Missed the quiz; ask why', dueAt: new Date(Date.now() + 24 * H).toISOString() });
    expect(check.status).toBe(201);
    expect(check.body).toMatchObject({ interventionType: 'check_in', ownerId: teacher.id, status: 'assigned', rationale: 'Missed the quiz; ask why' });
    const ex = await teacher.post('/api/teaching/interventions', { studentId: 'stu1', action: 'prerequisite_practice', objectiveId: 'obj', rationale: 'Adds denominators', supportingEvidenceIds: ['e1'] });
    expect(ex.body).toMatchObject({ objectiveId: 'obj', courseId: 'cls', sourceEvidenceIds: ['e1'] });
    expect((await teacher.post('/api/teaching/interventions', { studentId: 'stu1', action: 'revisit_lesson', objectiveId: 'obj', rationale: 'again' })).body.error.code).toBe('INTERVENTION_ACTIVE');
    expect((await teacher.post('/api/teaching/interventions', { studentId: 'stu3', action: 'check_in', rationale: 'x' })).status).toBe(404);

    expect((await teacher.get('/api/teaching/overview')).body.followUps).toHaveLength(2);
    const done = await teacher.patch(`/api/teaching/interventions/${check.body.id}`, { status: 'completed', outcomeNote: 'Was ill; extension given' });
    expect(done.body).toMatchObject({ status: 'completed', outcomeNote: 'Was ill; extension given' });
    expect((await teacher.patch(`/api/teaching/interventions/${check.body.id}`, { status: 'in_progress' })).body.error.code).toBe('INVALID_TRANSITION');
    const list = (await teacher.get('/api/teaching/interventions?mine=true')).body.interventions;
    expect(list.map((i: any) => i.interventionType).sort()).toEqual(['check_in', 'prerequisite_practice']);
    const profile = (await teacher.get('/api/teaching/students/stu2/profile')).body;
    expect(profile.interventions[0]).toMatchObject({ action: 'check_in', status: 'completed', objective: null });
  });
});
