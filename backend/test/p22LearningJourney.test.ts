import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// P22 Workstream I: the learning journey through the real application, on a
// synthetic school, with no AI provider (no key; nothing is called or faked).
// Assessment creation -> publication/assignment -> student attempt ->
// autonomous grading (answer key) -> result release -> evidence/mastery ->
// gap -> targeted intervention -> unassisted reassessment -> measured
// progress -> analytics report (table and chart agree).
// AI tutoring and AI grading of open answers need a provider: NOT RUN here.

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;
const SCHOOL = 'p22-journey-school';
const OTHER = 'p22-other-school';
const FEATURES = {
  teaching_workflow_enabled: true, learning_intelligence_enabled: true, mastery_tracking_enabled: true, adaptive_pedagogy_enabled: true,
  teacher_learning_insights_enabled: true, educator_chat_enabled: true, educator_analytics_enabled: true,
};
const who: Record<string, { id: string; auth: string }> = {};
const ids: Record<string, string> = {};
const QUESTIONS = (objective: string) => [
  { id: 'q1', type: 'multiple-choice', text: 'What is 1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', points: 1, objectiveIds: [objective] },
  { id: 'q2', type: 'multiple-choice', text: 'What is 1/3 + 1/3?', options: ['2/3', '2/6'], correctAnswer: '2/3', points: 1, objectiveIds: [objective] },
];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'DATABASE_URL', 'ENARA_ORCHESTRATOR_URL', 'AI_ENGINE_URL']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {};
  for (const n of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'Batch', 'Assignment', 'AssessmentAttempt', 'LearningObjective', 'StudentObjectiveMastery', 'LearningEvidence', 'LearningIntervention']) {
    M[n] = (await import(`../src/models/${n}`))[n];
  }
  await M.Institution.create([{ id: SCHOOL, name: 'Synthetic Journey School', features: FEATURES }, { id: OTHER, name: 'Synthetic Other School', features: FEATURES }]);
  await M.Batch.create({ id: 'p22-batch', name: 'Grade 6 A', institutionId: SCHOOL, academicYear: '2026', studentCount: 2 });
  await M.Student.create([
    { id: 'p22-stu-1', name: 'Synthetic Learner One', email: 'one@p22.synthetic.test', grade: 'Grade 6', institutionId: SCHOOL, batchId: 'p22-batch' },
    { id: 'p22-stu-2', name: 'Synthetic Learner Two', email: 'two@p22.synthetic.test', grade: 'Grade 6', institutionId: SCHOOL, batchId: 'p22-batch' },
  ]);
  const mk = async (key: string, role: string, institutionId: string, studentId?: string) => {
    const email = `${key}@p22.synthetic.test`;
    const u = await M.User.create({ email, password: 'x', role, name: key, status: 'active', institutionId, studentId });
    who[key] = { id: u._id.toString(), auth: `Bearer ${signAccessToken({ id: u._id.toString(), email, role, institutionId, studentId } as any)}` };
  };
  await mk('teacher', 'teacher', SCHOOL);
  await mk('otherTeacher', 'teacher', OTHER);
  await mk('stu1', 'student', SCHOOL, 'p22-stu-1');
  await mk('stu2', 'student', SCHOOL, 'p22-stu-2');
  await M.Curriculum.create({ id: 'p22-cur', name: 'Fractions', courseName: 'Fractions', institutionId: SCHOOL, summary: 's', lastUpdated: '2026-11-01', status: 'deployed', assignedBatches: ['p22-batch'], chapters: [{ id: 'p22-lesson', title: 'Adding fractions', uploads: [] }], createdBy: who.teacher.id });
  await M.CourseInstance.create({ id: 'p22-class', courseId: 'p22-course', courseName: 'Fractions 6A', curriculumId: 'p22-cur', institutionId: SCHOOL, academicYear: '2026', batchId: 'p22-batch', studentIds: [], instructorIds: [who.teacher.id], visibility: 'student' });
  await M.LearningObjective.create({ id: 'p22-obj', institutionId: SCHOOL, curriculumId: 'p22-cur', courseId: 'p22-course', code: 'FR.1', title: 'Add fractions with unlike denominators', lessonIds: ['p22-lesson'], status: 'approved', prerequisiteObjectiveIds: [] });
  app = (await import('../src/app')).createApp();
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

const as = (key: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', who[key].auth),
  post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', who[key].auth).send(body),
});
async function until(check: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error(`timed out waiting for ${what}`);
}
async function assign(title: string, tutorPolicy: string) {
  const created = await as('teacher').post('/api/assessments', { title, subject: 'Maths', curriculumId: 'p22-cur', lifecycle: 'draft', questions: QUESTIONS('p22-obj') });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  expect((await as('teacher').post(`/api/assessments/${created.body.id}/publish`)).status).toBe(200);
  const asg = await as('teacher').post('/api/assignments', { assessmentId: created.body.id, classId: 'p22-class', dueAt: new Date(Date.now() + 86400_000).toISOString(), tutorPolicy, answerReveal: 'never' });
  expect(asg.status, JSON.stringify(asg.body)).toBe(201);
  return asg.body.id as string;
}
async function attempt(student: string, assignmentId: string, answers: Record<string, string>, whileOpen?: () => Promise<void>) {
  const start = await as(student).post(`/api/me/assignments/${assignmentId}/attempts`);
  expect(start.status, JSON.stringify(start.body)).toBeLessThan(300);
  const attemptId = start.body.attemptId ?? start.body.attempt?.id ?? start.body.id;
  // Unassisted: the attempt a student sees carries no answer key or model answer.
  expect(JSON.stringify(start.body)).not.toMatch(/correctAnswer|modelAnswer/);
  if (whileOpen) await whileOpen();
  const sub = await as(student).post(`/api/me/assignments/${assignmentId}/attempts/${attemptId}/submit`, { answers });
  expect(sub.status, JSON.stringify(sub.body)).toBeLessThan(300);
  await until(async () => (await M.AssessmentAttempt.findOne({ id: attemptId }).lean())?.gradingStatus === 'released', `release of ${attemptId}`);
  return attemptId as string;
}
const mastery = () => M.StudentObjectiveMastery.findOne({ institutionId: SCHOOL, studentId: 'p22-stu-1', objectiveId: 'p22-obj' }).lean();

describe('P22 synthetic learning journey (sequential, provider-free)', () => {
  it('1-5. teacher assesses; the student attempt is graded autonomously and released', async () => {
    ids.a1 = await assign('Fractions check', 'blocked');
    ids.t1 = await attempt('stu1', ids.a1, { q1: '2/6', q2: '2/6' });
    await attempt('stu2', ids.a1, { q1: '3/4', q2: '2/3' });
    const t = await M.AssessmentAttempt.findOne({ id: ids.t1 }).lean();
    expect(t.score).toBe(0);
    const result = await as('stu1').get(`/api/me/assignments/${ids.a1}/attempts/${ids.t1}/result`);
    expect(result.status).toBe(200);
    expect(result.body.released ?? result.body.result?.released ?? true).toBeTruthy();
  });

  it('6. evidence and objective mastery are recorded from the graded work', async () => {
    await until(async () => !!(await mastery()), 'mastery record');
    const m = await mastery();
    expect(['emerging', 'developing', 'not_assessed']).toContain(m.masteryStatus);
    expect(await M.LearningEvidence.countDocuments({ studentId: 'p22-stu-1', objectiveId: 'p22-obj' })).toBeGreaterThan(0);
    ids.before = String(m.masteryEstimate);
  });

  it("7. the gap is identified for the teacher, and only within the teacher's own scope", async () => {
    const r = await as('teacher').get('/api/learning/classes/p22-class/insights');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const row = (r.body.heatmap ?? []).find((x: any) => x.studentId === 'p22-stu-1');
    expect(row).toBeTruthy();
    expect([403, 404]).toContain((await as('otherTeacher').get('/api/learning/classes/p22-class/insights')).status);
  });

  it('8. the teacher records a targeted intervention (AI tutoring itself: NOT RUN, needs a provider)', async () => {
    const r = await as('teacher').post('/api/learning/interventions', { studentId: 'p22-stu-1', objectiveId: 'p22-obj', interventionType: 'teacher_assigned' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    ids.intervention = r.body.id;
  });

  it('9. the reassessment is unassisted: tutor blocked while it is open, no answers or earlier feedback leak', async () => {
    ids.a2 = await assign('Fractions check again', 'blocked');
    const view = await as('stu1').get(`/api/me/assignments/${ids.a2}`);
    expect(view.status).toBe(200);
    expect(JSON.stringify(view.body)).not.toMatch(/correctAnswer|modelAnswer|2\/6 is wrong/);
    // The tutor refuses while the unassisted reassessment attempt is open (before any AI work).
    ids.t2 = await attempt('stu1', ids.a2, { q1: '3/4', q2: '2/3' }, async () => {
      const session = await as('stu1').post('/api/me/tutor/sessions', { courseId: 'p22-course', lessonId: 'p22-lesson', title: 'Adding fractions' });
      const sessionId = session.body.id ?? session.body.session?.id ?? session.body.sessionId;
      const blocked = await as('stu1').post(`/api/me/tutor/sessions/${sessionId}/messages`, { text: 'What is the answer to question 1?' });
      expect(blocked.status, JSON.stringify(blocked.body).slice(0, 300)).toBe(403);
      expect(blocked.body.error.code).toBe('TUTOR_BLOCKED');
    });

  });

  it('10. progress is measured from the attempt records, not illustrated', async () => {
    const first = await M.AssessmentAttempt.findOne({ id: ids.t1 }).lean();
    const second = await M.AssessmentAttempt.findOne({ id: ids.t2 }).lean();
    expect([first.score, second.score]).toEqual([0, 100]);
    await until(async () => Number((await mastery())?.masteryEstimate) > Number(ids.before), 'mastery to rise');
  });

  it('11. the class analytics report agrees exactly between narrative metrics, table and chart', async () => {
    // Time passes: both assignments are now past their due date (future work
    // is excluded from scores by the shared definition).
    await M.Assignment.updateMany({ id: { $in: [ids.a1, ids.a2] } }, { $set: { dueAt: new Date(Date.now() - 3600_000) } });
    const r = await as('teacher').post('/api/educator-chat/ask', { question: 'Show the score distribution for my class', classId: 'p22-class' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const report = r.body.analytics ?? r.body.message?.analytics ?? r.body.report;
    expect(report, JSON.stringify(r.body).slice(0, 400)).toBeTruthy();
    expect(report.status).toBe('answered');
    // The same deterministic result feeds every view.
    expect(report.table, JSON.stringify(report).slice(0, 1500)).toBeTruthy();
    expect(report.chart, 'chart').toBeTruthy();
    {
      const chartTotal = report.chart.series.reduce((n: number, s: any) => n + s.values.reduce((a: number, b: number) => a + (b ?? 0), 0), 0);
      const tableTotal = report.table.rows.reduce((n: number, row: any) => n + Number(Object.values(row).find((v) => typeof v === 'number') ?? 0), 0);
      expect(chartTotal).toBe(tableTotal);
    }
    expect(JSON.stringify(report)).not.toMatch(/correctAnswer/);
  });
});
