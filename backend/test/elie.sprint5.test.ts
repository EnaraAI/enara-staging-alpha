import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { replayRetention, retentionStatus } from '../src/services/retention';

const DAY = 86_400_000;
const t0 = new Date('2026-01-01T00:00:00Z').getTime();
const ev = (day: number, correct: boolean, item: string, type = 'independent_assessment') => ({
  occurredAt: new Date(t0 + day * DAY),
  result: correct ? 'correct' : 'incorrect',
  evidenceType: type,
  assistanceLevel: 'none',
  itemKey: item,
});

describe('objective retention (unit)', () => {
  it('schedules after two distinct correct items and spaces reviews', () => {
    expect(replayRetention([ev(0, true, 'a')]).scheduled).toBe(false);
    expect(replayRetention([ev(0, true, 'a'), ev(0, true, 'a')]).scheduled).toBe(false);
    const r = replayRetention([ev(0, true, 'a'), ev(1, true, 'b')]);
    expect(r).toMatchObject({ scheduled: true, consecutiveSuccessfulReviews: 0, nextReviewAt: new Date(t0 + 4 * DAY) });
  });
  it('gives no credit for early answers, advances after the due date, resets on a miss', () => {
    const base = [ev(0, true, 'a'), ev(1, true, 'b')];
    expect(replayRetention([...base, ev(2, true, 'c')]).consecutiveSuccessfulReviews).toBe(0);
    const advanced = replayRetention([...base, ev(5, true, 'c', 'retention_review')]);
    expect(advanced).toMatchObject({ consecutiveSuccessfulReviews: 1, nextReviewAt: new Date(t0 + 12 * DAY) });
    const missed = replayRetention([...base, ev(5, true, 'c'), ev(6, false, 'd')]);
    expect(missed).toMatchObject({ consecutiveSuccessfulReviews: 0, nextReviewAt: new Date(t0 + 7 * DAY) });
  });
  it('ignores assisted and invalidated evidence; reports due and overdue', () => {
    expect(replayRetention([{ ...ev(0, true, 'a'), assistanceLevel: 'hint' }, ev(1, true, 'b')]).scheduled).toBe(false);
    expect(replayRetention([{ ...ev(0, true, 'a'), invalidatedAt: new Date() } as any, ev(1, true, 'b')]).scheduled).toBe(false);
    const next = new Date(t0);
    expect(retentionStatus({ scheduled: true, nextReviewAt: next }, new Date(t0 - DAY))).toBe('scheduled');
    expect(retentionStatus({ scheduled: true, nextReviewAt: next }, new Date(t0 + DAY))).toBe('due');
    expect(retentionStatus({ scheduled: true, nextReviewAt: next }, new Date(t0 + 9 * DAY))).toBe('overdue');
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
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'LearningObjective', 'LearningEvent', 'LearningEvidence',
    'LearningIntervention', 'StudentMisconception', 'DiagnosticSession', 'ObjectiveRetentionState', 'ReviewItem']) {
    M[name] = (await import(`../src/models/${name}`))[name];
  }
  const mastery = await import('../src/models/StudentObjectiveMastery');
  M.StudentObjectiveMastery = mastery.StudentObjectiveMastery;
  M.MasteryHistory = mastery.MasteryHistory;
  await mongoose.connect(mongo.getUri());
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const FLAGS = {
  learning_intelligence_enabled: true,
  mastery_tracking_enabled: true,
  learning_pathways_enabled: true,
  retention_intelligence_enabled: true,
  teacher_learning_insights_enabled: true,
};
let n = 0;
let teacher: { id: string; auth: string };
async function bearer(role: 'student' | 'teacher' | 'admin', institutionId: string, studentId?: string) {
  n += 1;
  const email = `${role}${n}@x.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  return { id: user._id.toString(), auth: `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId, studentId })}` };
}
const api = (auth: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', auth),
  put: (url: string, body: object) => request(app).put(url).set('Authorization', auth).send(body),
});

async function setState(studentId: string, objectiveId: string, masteryStatus: string, extra: object = {}) {
  await M.StudentObjectiveMastery.create({
    institutionId: 'instA', studentId, objectiveId, masteryStatus, masteryEstimate: 0.3, evidenceStrength: 'moderate',
    evidenceCount: 3, independentEvidenceCount: 3, lastMasteryUpdateAt: new Date(), modelVersion: 'mastery-v1', ...extra,
  });
}
async function evidence(studentId: string, objectiveId: string, correct: boolean[]) {
  await M.LearningEvidence.insertMany(correct.map((c, i) => ({
    id: `ev-${studentId}-${objectiveId}-${i}`, institutionId: 'instA', studentId, objectiveId, sourceEventId: `src-${studentId}-${objectiveId}-${i}`,
    evidenceType: 'independent_assessment', result: c ? 'correct' : 'incorrect', normalizedScore: c ? 1 : 0, assistanceLevel: 'none',
    reliabilityWeight: 1, evidenceVersion: 'evidence-v1', itemKey: `q${i}`, occurredAt: new Date(Date.now() - (10 - i) * 60000), recordedAt: new Date(),
  })));
}

beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([{ id: 'instA', name: 'A', features: FLAGS }, { id: 'instB', name: 'B', features: FLAGS }]);
  await M.Curriculum.create({ id: 'cur', name: 'Algebra', courseName: 'Algebra', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'],
    chapters: [{ id: 'L1', title: '1', uploads: [] }, { id: 'L2', title: '2', uploads: [] }, { id: 'L3', title: '3', uploads: [] }] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create({ id: 'course', courseId: 'alg', courseName: 'Algebra', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: [], instructorIds: [teacher.id], visibility: 'student' });
  await M.Student.create([
    { id: 'stu1', name: 'Amira', email: 'a@x.com', grade: '10', institutionId: 'instA', batchId: 'b' },
    { id: 'stu2', name: 'Bilal', email: 'b@x.com', grade: '10', institutionId: 'instA', batchId: 'b' },
  ]);
  await M.LearningObjective.create([
    { id: 'A', institutionId: 'instA', curriculumId: 'cur', code: 'A', title: 'Expressions', status: 'approved', lessonIds: ['L1'] },
    { id: 'B', institutionId: 'instA', curriculumId: 'cur', code: 'B', title: 'Equations', status: 'approved', lessonIds: ['L2'], prerequisiteObjectiveIds: ['A'] },
    { id: 'C', institutionId: 'instA', curriculumId: 'cur', code: 'C', title: 'Graphs', status: 'approved', lessonIds: ['L3'] },
    { id: 'D', institutionId: 'instA', curriculumId: 'cur', code: 'D', title: 'Draft only', status: 'draft', lessonIds: ['L1'] },
  ]);
});

describe('pathways and recommendations', () => {
  it('follows the curriculum order in strict modes and moves ahead in adaptive mode', async () => {
    const student = api((await bearer('student', 'instA', 'stu1')).auth);
    const strict = await student.get('/api/learning/students/me/recommendations');
    expect(strict.body.mode).toBe('teacher_controlled');
    expect(strict.body.recommendations.map((r: any) => [r.type, r.objectiveCode])).toEqual([['learn_next', 'A']]);

    const admin = api((await bearer('admin', 'instA')).auth);
    await admin.put('/api/learning/settings', { pathwayMode: 'adaptive' });
    const adaptive = await student.get('/api/learning/students/me/recommendations');
    expect(adaptive.body.recommendations.map((r: any) => r.objectiveCode)).toEqual(['A', 'C']);
    const pathway = await student.get('/api/learning/students/me/pathway');
    expect(pathway.body.sequence.map((o: any) => o.code)).toEqual(['A', 'B', 'C']);
  });

  it('recommends prerequisite review, checks and teacher work first, with evidence', async () => {
    await setState('stu1', 'A', 'emerging');
    await evidence('stu1', 'A', [false, false, true]);
    await setState('stu1', 'B', 'developing');
    await evidence('stu1', 'B', [true, false, false]);
    await setState('stu1', 'C', 'proficient', { needsVerification: true, independentEvidenceCount: 1, masteryEstimate: 0.75, evidenceStrength: 'limited' });
    await M.LearningIntervention.create({ id: 'int1', institutionId: 'instA', studentId: 'stu1', objectiveId: 'A', courseId: 'course', interventionType: 'teacher_assigned', status: 'assigned', assignedBy: 'teacher', note: 'See me Tuesday' });
    const student = api((await bearer('student', 'instA', 'stu1')).auth);
    const recs = (await student.get('/api/learning/students/me/recommendations')).body.recommendations;
    expect(recs.map((r: any) => [r.type, r.objectiveCode])).toEqual([
      ['continue_intervention', 'A'],
      ['review_prerequisite', 'A'],
      ['reassess', 'C'],
    ]);
    expect(recs[0]).toMatchObject({ assignedByTeacher: true, explanation: expect.stringContaining('See me Tuesday') });
    expect(recs[1].explanation).toBe('Review A before B: B builds on it, and on A 1 of 3 recent independent answers correct.');
    expect(recs[1].supportingEvidenceIds.length).toBe(6);
    expect(recs[2].explanation).toContain('rests on 1 answer');
    expect(JSON.stringify(recs)).not.toContain('Draft only');
  });

  it('recommends a review when an objective is due, and keeps question reviews separate', async () => {
    await setState('stu1', 'A', 'mastered', { masteryEstimate: 0.9 });
    await M.ObjectiveRetentionState.create({ studentId: 'stu1', objectiveId: 'A', institutionId: 'instA', scheduled: true, nextReviewAt: new Date(Date.now() - DAY), lastSuccessfulRetrievalAt: new Date(Date.now() - 4 * DAY), consecutiveSuccessfulReviews: 0, schedulingVersion: 'ret-v1' });
    const item = await M.ReviewItem.create({ id: 'rev1', studentId: 'stu1', institutionId: 'instA', sourceKey: 'quiz:q1', topic: 'x', question: 'q', answer: 'a', dueAt: new Date('2027-01-01') });
    const student = api((await bearer('student', 'instA', 'stu1')).auth);
    const recs = (await student.get('/api/learning/students/me/recommendations')).body.recommendations;
    expect(recs.find((r: any) => r.type === 'review_due')).toMatchObject({ objectiveCode: 'A' });
    const retention = (await student.get('/api/learning/students/me/retention')).body.retention;
    expect(retention[0]).toMatchObject({ code: 'A', status: 'due' });

    const { updateRetention } = await import('../src/services/retention');
    await updateRetention('stu1', 'A', 'instA');
    expect((await M.ReviewItem.findOne({ id: 'rev1' }).lean()).dueAt).toEqual(item.dueAt);
  });
});

describe('teacher class insights', () => {
  beforeEach(async () => {
    await setState('stu1', 'A', 'emerging');
    await setState('stu2', 'A', 'developing');
    await setState('stu2', 'B', 'mastered', { masteryEstimate: 0.9 });
    await M.StudentMisconception.create([
      { id: 'm1', institutionId: 'instA', studentId: 'stu1', objectiveId: 'A', ruleKey: 'r1', category: 'conceptual_misunderstanding', description: 'Adds denominators', confidence: 0.7, detectedAt: new Date(), detectionVersion: 'misc-rules-v1' },
      { id: 'm2', institutionId: 'instA', studentId: 'stu2', objectiveId: 'A', ruleKey: 'r1', category: 'conceptual_misunderstanding', description: 'Adds denominators', confidence: 0.7, detectedAt: new Date(), detectionVersion: 'misc-rules-v1' },
    ]);
    await M.MasteryHistory.create([
      { institutionId: 'instA', studentId: 'stu2', objectiveId: 'B', masteryEstimate: 0.4, masteryStatus: 'emerging', trigger: 't', modelVersion: 'mastery-v1', at: new Date(Date.now() - DAY) },
      { institutionId: 'instA', studentId: 'stu2', objectiveId: 'B', masteryEstimate: 0.9, masteryStatus: 'mastered', trigger: 't', modelVersion: 'mastery-v1', at: new Date() },
    ]);
  });

  it('shows the heatmap, common gaps, misconceptions and changes for the class', async () => {
    const t = api(teacher.auth);
    expect((await t.get('/api/learning/classes')).body.classes.map((c: any) => c.id)).toEqual(['course']);
    const res = await t.get('/api/learning/classes/course/insights');
    expect(res.status).toBe(200);
    expect(res.body.objectives.map((o: any) => o.code)).toEqual(['A', 'B', 'C']);
    expect(res.body.heatmap.map((r: any) => [r.name, r.cells.map((c: any) => c.masteryStatus)])).toEqual([
      ['Amira', ['emerging', 'not_assessed', 'not_assessed']],
      ['Bilal', ['developing', 'mastered', 'not_assessed']],
    ]);
    expect(res.body.commonGaps[0]).toMatchObject({ code: 'A', studentsWithGap: [{ name: 'Amira' }, { name: 'Bilal' }] });
    expect(res.body.misconceptionsToReview[0]).toMatchObject({ description: 'Adds denominators', items: [{ name: 'Amira' }, { name: 'Bilal' }] });
    expect(res.body.baselineToLatest.objectives.find((o: any) => o.code === 'B')).toMatchObject({ students: 1, meanBaseline: 0.4, meanLatest: 0.9 });
  });

  it('is limited to the teacher\'s classes and the school, and to staff', async () => {
    const other = api((await bearer('teacher', 'instA')).auth);
    expect((await other.get('/api/learning/classes/course/insights')).status).toBe(404);
    expect((await other.get('/api/learning/classes')).body.classes).toEqual([]);
    expect((await api((await bearer('admin', 'instB')).auth).get('/api/learning/classes/course/insights')).status).toBe(404);
    expect((await api((await bearer('admin', 'instA')).auth).get('/api/learning/classes/course/insights')).status).toBe(200);
    expect((await api((await bearer('student', 'instA', 'stu1')).auth).get('/api/learning/classes/course/insights')).status).toBe(403);
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.teacher_learning_insights_enabled': false } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    expect((await api(teacher.auth).get('/api/learning/classes/course/insights')).body.error.code).toBe('FEATURE_DISABLED');
  });
});
