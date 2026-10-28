import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn(async () => ({ model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: '{}' }] })) };
    beta = {
      messages: {
        create: vi.fn(async (body: any) => {
          ai.calls.push(body);
          return { model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Let us think about it.' }] };
        }),
        stream: vi.fn(),
      },
    };
  }
  return { default: Anthropic };
});

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
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'test-key',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'StudentCredit', 'Assignment', 'AssessmentAttempt', 'LearningObjective', 'LearningEvidence', 'LearningIntervention', 'StudyPlan', 'TutorSession', 'TutorMessage']) {
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
let student: Awaited<ReturnType<typeof bearer>>;
const FLAGS = { teaching_workflow_enabled: true, study_plans_enabled: true };
const QUESTIONS = [
  { id: 'q1', type: 'multiple-choice', text: 'Pick 2', options: ['1', '2'], correctAnswer: '2', explanation: 'secret explanation', points: 2, objectiveIds: ['obj'] },
  { id: 'q2', type: 'open-response', text: 'Explain', modelAnswer: 'secret model answer', rubric: { criteria: [{ id: 'c', title: 'R', maxPoints: 2, levels: [{ id: 'a', label: 'No', points: 0 }, { id: 'b', label: 'Yes', points: 2 }] }] } },
];
beforeEach(async () => {
  ai.calls = [];
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create({ id: 'instA', name: 'A', features: FLAGS });
  await M.Curriculum.create({ id: 'cur', name: 'Fractions', courseName: 'Fractions', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [{ id: 'L1', title: 'L1', uploads: [] }] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create({ id: 'cls', courseId: 'fr', courseName: 'Fractions 6A', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: [], instructorIds: [teacher.id], visibility: 'student' });
  await M.Student.create([{ id: 'stu1', name: 'Amira', email: 'a@x.com', grade: '6', institutionId: 'instA', batchId: 'b' }, { id: 'stu2', name: 'Bilal', email: 'b@x.com', grade: '6', institutionId: 'instA', batchId: 'b' }]);
  await M.StudentCredit.create({ studentId: 'stu1', institutionId: 'instA', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.LearningObjective.create({ id: 'obj', institutionId: 'instA', curriculumId: 'cur', code: 'FR.1', title: 'Add fractions', status: 'approved', lessonIds: ['L1'] });
  await M.AssessmentVersion.create({ assessmentId: 'as1', institutionId: 'instA', version: 1, title: 'Quiz', subject: 'Math', questions: QUESTIONS, totalPoints: 4 });
  student = await bearer('student', 'instA', 'stu1');
});

const assignment = (over: object = {}) =>
  M.Assignment.create({ id: 'asg', institutionId: 'instA', assessmentId: 'as1', assessmentVersion: 1, title: 'Fractions quiz', classId: 'cls', state: 'published',
    opensAt: new Date(Date.now() - H), dueAt: new Date(Date.now() + 24 * H), createdBy: teacher.id, ...over });

describe('study plans', () => {
  it('has nothing to invent for a student with no records', async () => {
    const plan = (await student.get('/api/me/study-plan')).body;
    expect(plan.items).toEqual([]);
    expect(await M.StudyPlan.countDocuments()).toBe(1);
  });
  it('builds from assignments, teacher actions and released results; replans without duplicates', async () => {
    await assignment();
    await teacher.post('/api/teaching/interventions', { studentId: 'stu1', action: 'check_in', rationale: 'Talk about homework' });
    await M.AssessmentAttempt.create({ id: 'old', assessmentId: 'as1', assessmentTitle: 'Earlier quiz', subject: 'Math', studentId: 'stu1', institutionId: 'instA', status: 'submitted',
      assignmentId: 'asg-old', gradingStatus: 'released', releasedAt: new Date(), score: 40, startedAt: new Date(), submittedAt: new Date(), answers: [] });
    const p1 = (await student.get('/api/me/study-plan')).body;
    expect(p1.items.map((i: any) => [i.kind, i.source])).toEqual([['assignment', 'assignment'], ['teacher_action', 'teacher'], ['review_feedback', 'result']]);
    expect(p1.items[0]).toMatchObject({ key: 'assignment:asg', status: 'todo', dueAt: expect.any(String) });
    expect(p1.items[2].rationale).toMatch(/40%/);
    // Viewing again, or twice at once, changes nothing.
    await Promise.all([student.get('/api/me/study-plan'), student.get('/api/me/study-plan')]);
    const p2 = (await student.get('/api/me/study-plan')).body;
    expect(p2.version).toBe(p1.version);
    expect(p2.items).toHaveLength(3);
    expect(await M.StudyPlan.countDocuments()).toBe(1);

    // Marking done is kept across replans and is not evidence.
    await student.patch('/api/me/study-plan/items', { key: 'result:old', status: 'done' });
    // Submitting the assignment takes it out of the plan.
    const start = await student.post('/api/me/assignments/asg/attempts');
    await student.post(`/api/me/assignments/asg/attempts/${start.body.attempt.id}/submit`, { answers: { q1: '2', q2: 'because' } });
    const p3 = (await student.get('/api/me/study-plan')).body;
    expect(p3.items.map((i: any) => i.key)).toEqual(['int:' + p1.items[1].interventionId, 'result:old']);
    expect(p3.items[1].status).toBe('done');
    expect(p3.history[0]).toMatchObject({ trigger: 'viewed', removed: ['assignment:asg'] });
    expect(await M.LearningEvidence.countDocuments({ studentId: 'stu1' })).toBe(0);
  });
  it('adds Phase 2 recommendations only when enabled, never in shadow mode', async () => {
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.learning_intelligence_enabled': true, 'features.learning_pathways_enabled': true, 'features.mastery_tracking_enabled': true } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    expect((await student.get('/api/me/study-plan')).body.items.filter((i: any) => i.source === 'recommendation').map((i: any) => i.kind)).toEqual(['learn_next']);
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'learningSettings.shadowMode': true } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    expect((await student.get('/api/me/study-plan')).body.items.filter((i: any) => i.source === 'recommendation')).toEqual([]);
  });
  it('is the student’s own; staff of the class can read it', async () => {
    await assignment();
    await student.get('/api/me/study-plan');
    expect((await teacher.get('/api/teaching/students/stu1/study-plan')).body.items).toHaveLength(1);
    expect((await (await bearer('teacher', 'instA')).get('/api/teaching/students/stu1/study-plan')).status).toBe(404);
    expect((await (await bearer('student', 'instA', 'stu2')).patch('/api/me/study-plan/items', { key: 'assignment:asg', status: 'done' })).status).toBe(404);
  });
});

describe('tutor handoff and the assignment tutor policy', () => {
  it('blocks the tutor during a no-tutor assignment and adds a hints-only rule otherwise', async () => {
    await assignment({ tutorPolicy: 'blocked' });
    expect((await student.post('/api/me/tutor/handoff', { kind: 'assignment', refId: 'asg' })).body.error.code).toBe('TUTOR_BLOCKED');
    const session = await student.post('/api/me/tutor/sessions', { title: 'chat' });
    await student.post('/api/me/assignments/asg/attempts');
    expect((await student.post(`/api/me/tutor/sessions/${session.body.id}/messages`, { text: 'What is 1/2+1/2?' })).body.error.code).toBe('TUTOR_BLOCKED');

    await M.Assignment.updateOne({ id: 'asg' }, { $set: { tutorPolicy: 'hints_only' } });
    const h = await student.post('/api/me/tutor/handoff', { kind: 'assignment', refId: 'asg' });
    expect(h.status).toBe(201);
    const reply = await student.post(`/api/me/tutor/sessions/${h.body.sessionId}/messages`, { text: 'Help with question 1' });
    expect(reply.status).toBe(200);
    const system = JSON.stringify(ai.calls.at(-1).system);
    expect(system).toContain('allows hints only');
    expect(system).toContain('FR.1');
    expect(system).not.toMatch(/secret|correctAnswer/);
    // An ordinary chat during the same open attempt gets the rule too.
    await student.post(`/api/me/tutor/sessions/${session.body.id}/messages`, { text: 'hi' });
    expect(JSON.stringify(ai.calls.at(-1).system)).toContain('allows hints only');
  });
  it('hands over released work only, without unreleased keys, model answers or AI proposals', async () => {
    await assignment({ answerReveal: 'after-close' });
    await M.AssessmentAttempt.create({ id: 'att', assessmentId: 'as1', assessmentTitle: 'Fractions quiz', subject: 'Math', studentId: 'stu1', institutionId: 'instA', status: 'submitted', assignmentId: 'asg',
      assessmentVersion: 1, gradingStatus: 'finalized', score: 50, startedAt: new Date(), submittedAt: new Date(),
      answers: [{ questionId: 'q1', questionText: 'Pick 2', studentAnswer: '1', correctAnswer: '2', isCorrect: false, explanation: 'secret explanation', points: 0, maxPoints: 2, method: 'rule' },
        { questionId: 'q2', questionText: 'Explain', studentAnswer: 'idk', isCorrect: false, explanation: '', points: 2, maxPoints: 2, method: 'ai_proposal', feedback: 'Good effort, add an example.', proposalId: 'gp-x' }] });
    expect((await student.post('/api/me/tutor/handoff', { kind: 'result', refId: 'att' })).status).toBe(404);
    await M.AssessmentAttempt.updateOne({ id: 'att' }, { $set: { gradingStatus: 'released', releasedAt: new Date() } });
    const h = await student.post('/api/me/tutor/handoff', { kind: 'result', refId: 'att' });
    const prompt = (await M.TutorSession.findOne({ id: h.body.sessionId }).lean()).handoff.prompt;
    expect(prompt).toContain('Teacher feedback: Good effort, add an example.');
    expect(prompt).toContain('Correct answers are not released yet');
    expect(prompt).not.toMatch(/Correct answer: 2|secret|gp-x/);
    // Someone else's result is not reachable.
    expect((await (await bearer('student', 'instA', 'stu2')).post('/api/me/tutor/handoff', { kind: 'result', refId: 'att' })).status).toBe(404);
  });
  it('hands over a plan item with its reason', async () => {
    await teacher.post('/api/teaching/interventions', { studentId: 'stu1', action: 'tutor_support', objectiveId: 'obj', rationale: 'Mixes up numerators and denominators' });
    const plan = (await student.get('/api/me/study-plan')).body;
    const h = await student.post('/api/me/tutor/handoff', { kind: 'plan_item', refId: plan.items[0].key });
    const s = await M.TutorSession.findOne({ id: h.body.sessionId }).lean();
    expect(s).toMatchObject({ objectiveId: 'obj', handoff: { kind: 'plan_item' } });
    expect(s.handoff.prompt).toContain('Mixes up numerators and denominators');
    expect(s.handoff.prompt).toContain('FR.1');
  });
});
