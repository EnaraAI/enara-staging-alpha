import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectStrategy } from '../src/services/pedagogyPolicy';

const ai = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn(async () => ({ model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: '{}' }] })) };
    beta = {
      messages: {
        create: vi.fn(async (body: any) => {
          ai.calls.push(body);
          return { model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Let us try an example.' }] };
        }),
        stream: vi.fn(),
      },
    };
  }
  return { default: Anthropic };
});

describe('strategy selection (unit)', () => {
  const base = { objectiveId: 'o', evidenceStrength: 'limited', weakPrerequisiteIds: [], misconceptions: [], supportingEvidenceIds: ['e1'] };
  it('remediates a weak prerequisite first', () => {
    expect(selectStrategy({ ...base, masteryStatus: 'emerging', weakPrerequisiteIds: ['p'] })).toMatchObject({
      strategyId: 'prerequisite_remediation',
      targetObjectiveId: 'p',
      reasonCodes: ['PREREQUISITE_GAP'],
    });
  });
  it('responds to misconceptions and switches strategy when the first was already used', () => {
    const conceptual = { ...base, masteryStatus: 'emerging', misconceptions: [{ id: 'm', category: 'conceptual_misunderstanding' }] };
    expect(selectStrategy(conceptual).strategyId).toBe('analogy');
    expect(selectStrategy({ ...conceptual, previousStrategyId: 'analogy' })).toMatchObject({ strategyId: 'visual_explanation', reasonCodes: ['CONCEPTUAL_MISCONCEPTION', 'STRATEGY_CHANGED'] });
    expect(selectStrategy({ ...base, masteryStatus: 'developing', misconceptions: [{ id: 'm', category: 'procedural_error' }] }).strategyId).toBe('worked_example');
  });
  it('follows mastery status and teacher choices', () => {
    expect(selectStrategy({ ...base, masteryStatus: 'not_assessed' }).strategyId).toBe('socratic_questioning');
    expect(selectStrategy({ ...base, masteryStatus: 'developing' }).strategyId).toBe('guided_practice');
    expect(selectStrategy({ ...base, masteryStatus: 'proficient' }).strategyId).toBe('independent_practice');
    expect(selectStrategy({ ...base, masteryStatus: 'mastered' })).toMatchObject({ strategyId: 'retrieval_practice', requiresReassessment: false });
    expect(selectStrategy({ ...base, masteryStatus: 'emerging', weakPrerequisiteIds: ['p'], teacherStrategyId: 'analogy' })).toMatchObject({ strategyId: 'analogy', reasonCodes: ['TEACHER_ASSIGNED'] });
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
    ANTHROPIC_API_KEY: 'test-key',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  const names = [
    ['User', 'User'], ['Institution', 'Institution'], ['Curriculum', 'Curriculum'], ['CourseInstance', 'CourseInstance'], ['Student', 'Student'],
    ['StudentCredit', 'StudentCredit'], ['Assessment', 'Assessment'], ['LearningObjective', 'LearningObjective'], ['LearningEvent', 'LearningEvent'],
    ['LearningEvidence', 'LearningEvidence'], ['DiagnosticSession', 'DiagnosticSession'], ['LearningIntervention', 'LearningIntervention'],
    ['PedagogicalDecision', 'PedagogicalDecision'], ['TimeToUnderstand', 'TimeToUnderstand'], ['TutorSession', 'TutorSession'], ['TutorMessage', 'TutorMessage'],
  ];
  M = {};
  for (const [file, name] of names) M[name] = (await import(`../src/models/${file}`))[name];
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
  diagnostics_enabled: true,
  misconception_detection_enabled: true,
  adaptive_pedagogy_enabled: true,
};
let n = 0;
let teacher: { id: string; auth: string };
async function bearer(role: 'student' | 'teacher' | 'admin', institutionId: string, studentId?: string) {
  n += 1;
  const email = `${role}${n}@x.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  return { id: user._id.toString(), auth: `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId, studentId })}` };
}
const q = (id: string) => ({ id, type: 'multiple-choice', text: `${id}?`, options: ['right', 'wrong'], correctAnswer: 'right', explanation: '', objectiveIds: ['obj'], difficulty: 3 });

beforeEach(async () => {
  ai.calls = [];
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create({ id: 'instA', name: 'A', features: FLAGS });
  await M.Curriculum.create({ id: 'cur', name: 'Algebra', courseName: 'Algebra', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [{ id: 'L1', title: 'L', uploads: [] }] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create({ id: 'course', courseId: 'alg', courseName: 'Algebra', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: ['stu1'], instructorIds: [teacher.id], visibility: 'student' });
  await M.Student.create({ id: 'stu1', name: 'Sam', email: 'sam@x.com', grade: '10', institutionId: 'instA', batchId: 'b' });
  await M.StudentCredit.create({ studentId: 'stu1', institutionId: 'instA', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.LearningObjective.create({ id: 'obj', institutionId: 'instA', curriculumId: 'cur', code: 'FR.1', title: 'Add fractions', status: 'approved', lessonIds: ['L1'] });
  await M.Assessment.create({ id: 'bank', title: 'Bank', institutionId: 'instA', subject: 'Math', status: 'completed', curriculumId: 'cur', questions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'].map(q) });
});

const api = (auth: string) => ({
  post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', auth).send(body),
  get: (url: string) => request(app).get(url).set('Authorization', auth),
});

async function runDiagnostic(s: ReturnType<typeof api>, diagnosticId: string | null, value: string) {
  let d = diagnosticId ? (await s.get(`/api/learning/diagnostics/${diagnosticId}`)).body : (await s.post('/api/learning/diagnostics', { courseId: 'course' })).body;
  while (d.status === 'in_progress') {
    d = (await s.post(`/api/learning/diagnostics/${d.id}/answer`, { assessmentId: d.currentQuestion.assessmentId, questionId: d.currentQuestion.questionId, answer: value })).body;
  }
  return d;
}

describe('the learning loop', () => {
  it('gap → intervention → focused tutoring → independent reassessment → outcome and time to understand', async () => {
    const student = await bearer('student', 'instA', 'stu1');
    const s = api(student.auth);

    // 1. A diagnostic shows a gap; a time-to-understand episode opens.
    await runDiagnostic(s, null, 'wrong');
    expect((await M.StudentObjectiveMastery.findOne({ objectiveId: 'obj' }).lean()).masteryStatus).toBe('emerging');
    expect(await M.TimeToUnderstand.countDocuments({ status: 'in_progress' })).toBe(1);

    // 2. The student starts an intervention; only one can be active.
    const created = await s.post('/api/learning/interventions', { objectiveId: 'obj' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ assignedBy: 'student', status: 'assigned', completionIsNotMastery: true });
    expect((await s.post('/api/learning/interventions', { objectiveId: 'obj' })).body.error.code).toBe('INTERVENTION_ACTIVE');
    const started = await s.post(`/api/learning/interventions/${created.body.id}/start`);
    expect(started.body.strategy).toMatchObject({ id: 'direct_instruction', reasonCodes: ['EMERGING'] });
    expect(started.body.intervention.baseline.masteryStatus).toBe('emerging');

    // 3. Tutoring in that session gets the objective and strategy as context.
    const tutorSessionId = started.body.tutorSessionId;
    const reply = await s.post(`/api/me/tutor/sessions/${tutorSessionId}/messages`, { text: 'How do I add 1/2 and 1/3?' });
    expect(reply.status).toBe(200);
    const system = JSON.stringify(ai.calls.at(-1).system);
    expect(system).toContain('FR.1');
    expect(system).toContain('direct instruction');
    expect(system).toContain('never give the answers');
    expect(await M.PedagogicalDecision.countDocuments({ interventionId: created.body.id })).toBe(1);

    // 4. Completing the activity doesn't change mastery.
    const done = await s.post(`/api/learning/interventions/${created.body.id}/complete`);
    expect(done.body.reassessmentRecommended).toBe(true);
    expect((await M.StudentObjectiveMastery.findOne({ objectiveId: 'obj' }).lean()).masteryStatus).toBe('emerging');

    // 5. The independent reassessment updates mastery and records the outcome.
    const re = await s.post(`/api/learning/interventions/${created.body.id}/reassess`);
    expect(re.status).toBe(201);
    await runDiagnostic(s, re.body.diagnosticId, 'right');
    const outcomes = await s.get(`/api/learning/interventions/${created.body.id}/outcomes`);
    // 2 wrong then 2 right: estimate (2 + 0.5) / (4 + 1) = 0.5, developing.
    expect(outcomes.body.outcome).toMatchObject({ improved: true, masteryStatus: 'developing' });
    expect(outcomes.body.decisions[0].strategyId).toBe('direct_instruction');
    expect(await M.TimeToUnderstand.countDocuments({ status: 'in_progress' })).toBe(1);

    // 6. More independent correct answers later verify understanding; the
    // episode gets the tutoring time from the focused session.
    const { recordLearningEvents } = await import('../src/services/learningEvents');
    const { processPendingEvidence } = await import('../src/services/evidenceProcessor');
    const later = new Date(Date.now() + 120_000);
    await recordLearningEvents(
      ['x1', 'x2', 'x3', 'x4', 'x5'].map((qid) => ({
        studentId: 'stu1',
        institutionId: 'instA',
        type: 'question_answered' as const,
        source: 'assessment' as const,
        verified: true,
        gradedBy: 'rule' as const,
        objectiveIds: ['obj'],
        refs: { assessmentId: 'quiz2', attemptId: 'att2', questionId: qid },
        outcome: { correct: true },
        idempotencyKey: `loop:${qid}`,
        at: later,
      })),
    );
    await processPendingEvidence();
    const episode = await M.TimeToUnderstand.findOne({}).lean();
    expect(episode).toMatchObject({ status: 'verified', interventionIds: [created.body.id], strategiesUsed: ['direct_instruction'] });
    expect(episode.activeInstructionSeconds).toBeGreaterThanOrEqual(30);
    expect(episode.elapsedSeconds).toBeGreaterThan(0);
  });

  it('degrades to ordinary tutoring when adaptive pedagogy is off', async () => {
    await M.LearningObjective.updateOne({ id: 'obj' }, {});
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.adaptive_pedagogy_enabled': false } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    const { buildObjectiveContext } = await import('../src/services/learningContext');
    expect(await buildObjectiveContext({ institutionId: 'instA', studentId: 'stu1', objectiveId: 'obj' })).toBeNull();
    const student = await bearer('student', 'instA', 'stu1');
    const session = await M.TutorSession.create({ id: 'ts', studentId: 'stu1', institutionId: 'instA', objectiveId: 'obj', title: 't', messageCount: 0, lastMessageAt: new Date() });
    const res = await api(student.auth).post(`/api/me/tutor/sessions/${session.id}/messages`, { text: 'hi' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(ai.calls.at(-1).system)).not.toContain('Learning focus');
  });
});

describe('teacher-assigned interventions', () => {
  it('uses the teacher strategy, and only the teacher can cancel it', async () => {
    const t = api(teacher.auth);
    const created = await t.post('/api/learning/interventions', { studentId: 'stu1', objectiveId: 'obj', interventionType: 'teacher_assigned', strategyId: 'analogy', note: 'Try pizza slices' });
    expect(created.body).toMatchObject({ assignedBy: 'teacher', strategyId: 'analogy' });
    expect((await t.post('/api/learning/interventions', { studentId: 'stu1', objectiveId: 'obj', strategyId: 'made_up' })).status).toBe(400);

    const student = await bearer('student', 'instA', 'stu1');
    const started = await api(student.auth).post(`/api/learning/interventions/${created.body.id}/start`);
    expect(started.body.strategy).toMatchObject({ id: 'analogy', reasonCodes: ['TEACHER_ASSIGNED'] });
    expect((await api(student.auth).post(`/api/learning/interventions/${created.body.id}/cancel`)).status).toBe(403);
    expect((await t.post(`/api/learning/interventions/${created.body.id}/cancel`)).body.status).toBe('cancelled');

    const otherTeacher = await bearer('teacher', 'instA');
    expect((await api(otherTeacher.auth).post('/api/learning/interventions', { studentId: 'stu1', objectiveId: 'obj' })).status).toBe(404);
    expect((await api(otherTeacher.auth).get('/api/learning/students/stu1/interventions')).status).toBe(404);
  });
});

describe('time to understand', () => {
  it('counts tutor turns with a 5-minute pause cap and lesson time, not assessment time', async () => {
    const { activeInstructionSeconds } = await import('../src/services/timeToUnderstand');
    await M.TutorSession.create({ id: 'ts1', studentId: 'stu1', institutionId: 'instA', objectiveId: 'obj', title: 't', messageCount: 0, lastMessageAt: new Date() });
    const t0 = new Date('2026-03-01T10:00:00Z').getTime();
    const ev = (type: string, at: number, extra: object = {}) => ({
      id: `e${at}${type}`, studentId: 'stu1', institutionId: 'instA', type, source: 'tutor_chat', verified: false, at: new Date(t0 + at * 1000), conceptIds: [], objectiveIds: [], ...extra,
    });
    await M.LearningEvent.collection.insertMany([
      ev('tutor_question', 0, { refs: { sessionId: 'ts1', messageId: 'a' } }),
      ev('tutor_reply', 60, { refs: { sessionId: 'ts1', messageId: 'b' } }),
      ev('tutor_question', 60 + 3600, { refs: { sessionId: 'ts1', messageId: 'c' } }),
      ev('lesson_viewed', 100, { source: 'client', refs: { courseId: 'course', lessonId: 'L1' }, durationMs: 120_000 }),
      ev('lesson_viewed', 200, { source: 'client', refs: { courseId: 'course', lessonId: 'L1' }, durationMs: 5 * 60 * 60 * 1000 }),
      ev('question_answered', 300, { source: 'assessment', refs: { assessmentId: 'a', questionId: 'q' }, durationMs: 999_000 }),
    ]);
    // 30 (first turn) + 60 + 300 (capped pause) + 120 + 3600 (capped view) = 4110
    expect(await activeInstructionSeconds('stu1', 'obj', new Date(t0 - 1000), new Date(t0 + 10_000_000))).toBe(4110);
  });

  it('reports distributions only for the school, with caveats', async () => {
    await M.TimeToUnderstand.create([
      { id: 't1', institutionId: 'instA', studentId: 'stu1', objectiveId: 'obj', gapDetectedAt: new Date(), status: 'verified', activeInstructionSeconds: 600, elapsedSeconds: 86400, strategiesUsed: ['worked_example'], measurementVersion: 'ttu-v1', lastComputedAt: new Date() },
      { id: 't2', institutionId: 'instA', studentId: 'stu2', objectiveId: 'obj', gapDetectedAt: new Date(), status: 'in_progress', activeInstructionSeconds: 60, measurementVersion: 'ttu-v1', lastComputedAt: new Date() },
      { id: 't3', institutionId: 'instB', studentId: 'x', objectiveId: 'obj', gapDetectedAt: new Date(), status: 'verified', activeInstructionSeconds: 6000, measurementVersion: 'ttu-v1', lastComputedAt: new Date() },
    ]);
    const admin = await bearer('admin', 'instA');
    const res = await api(admin.auth).get('/api/learning/analytics/ttu?objectiveId=obj');
    expect(res.body.counts).toEqual({ verified: 1, inProgress: 1, abandoned: 0 });
    expect(res.body.verified.activeInstructionMinutes.median).toBe(10);
    expect(res.body.byStrategy).toEqual([{ strategyId: 'worked_example', verified: 1, medianActiveMinutes: 10 }]);
    expect(res.body.caveats.length).toBeGreaterThan(0);
    const t = await api(teacher.auth).get('/api/learning/analytics/ttu');
    expect(t.body.counts.verified).toBe(1);
    expect(t.body.counts.inProgress).toBe(0);
  });
});
