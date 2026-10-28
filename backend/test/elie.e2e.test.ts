import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Phase 2 end-to-end learning loop (spec §21), deterministic, with the AI
// provider mocked. One student, one teacher, real HTTP routes throughout.

const ai = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn(async () => ({ model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: '{}' }] })) };
    beta = {
      messages: {
        create: vi.fn(async (body: any) => {
          ai.calls.push(body);
          return { model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Let us start from what a fraction means.' }] };
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
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'StudentCredit', 'Assessment', 'AssessmentAttempt', 'LearningObjective',
    'LearningEvent', 'LearningEvidence', 'DiagnosticSession', 'LearningIntervention', 'PedagogicalDecision', 'TimeToUnderstand', 'TutorSession', 'TutorMessage',
    'ObjectiveRetentionState', 'ReviewItem']) {
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

async function bearer(role: 'student' | 'teacher', studentId?: string) {
  const email = `${role}@e2e.test`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId: 'inst', studentId });
  return { id: user._id.toString(), auth: `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId: 'inst', studentId })}` };
}
const api = (auth: string) => ({
  post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', auth).send(body),
  get: (url: string) => request(app).get(url).set('Authorization', auth),
});
const question = (id: string, objectiveId: string) => ({
  id, type: 'multiple-choice', text: `${id}?`, options: ['right', 'wrong'], correctAnswer: 'right', explanation: 'Because.', objectiveIds: [objectiveId], difficulty: 3,
});

async function runDiagnostic(s: ReturnType<typeof api>, start: { id: string } | null, value: string) {
  let d = start ? (await s.get(`/api/learning/diagnostics/${start.id}`)).body : (await s.post('/api/learning/diagnostics', { courseId: 'course' })).body;
  while (d.status === 'in_progress') {
    expect(JSON.stringify(d.currentQuestion)).not.toContain('correctAnswer');
    d = (await s.post(`/api/learning/diagnostics/${d.id}/answer`, { assessmentId: d.currentQuestion.assessmentId, questionId: d.currentQuestion.questionId, answer: value })).body;
  }
  return d;
}

describe('end-to-end learning loop', () => {
  it('objectives → diagnostic → gap → recommendation → tutoring → reassessment → teacher view → retention review', async () => {
    await M.Institution.create({
      id: 'inst', name: 'E2E School',
      features: {
        learning_intelligence_enabled: true, diagnostics_enabled: true, mastery_tracking_enabled: true, misconception_detection_enabled: true,
        adaptive_pedagogy_enabled: true, learning_pathways_enabled: true, teacher_learning_insights_enabled: true, retention_intelligence_enabled: true,
      },
    });
    await M.Curriculum.create({ id: 'cur', name: 'Fractions', courseName: 'Fractions', institutionId: 'inst', summary: 's', lastUpdated: '2026-01-01', status: 'deployed',
      assignedBatches: ['b'], chapters: [{ id: 'L1', title: 'Meaning', uploads: [] }, { id: 'L2', title: 'Adding', uploads: [] }] });
    const teacher = await bearer('teacher');
    await M.CourseInstance.create({ id: 'course', courseId: 'fr', courseName: 'Fractions', institutionId: 'inst', academicYear: '2026', batchId: 'b', curriculumId: 'cur',
      studentIds: ['stu'], instructorIds: [teacher.id], visibility: 'student' });
    await M.Student.create({ id: 'stu', name: 'Sam', email: 'sam@e2e.test', grade: '6', institutionId: 'inst', batchId: 'b' });
    await M.StudentCredit.create({ studentId: 'stu', institutionId: 'inst', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    await M.LearningObjective.create([
      { id: 'P', institutionId: 'inst', curriculumId: 'cur', code: 'FR.1', title: 'Understand fractions', status: 'draft', lessonIds: ['L1'] },
      { id: 'T', institutionId: 'inst', curriculumId: 'cur', code: 'FR.2', title: 'Add fractions', status: 'draft', lessonIds: ['L2'], prerequisiteObjectiveIds: ['P'] },
    ]);
    await M.Assessment.create({ id: 'bank', title: 'Bank', institutionId: 'inst', subject: 'Math', status: 'completed', curriculumId: 'cur',
      questions: [...['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => question(id, 'P')), ...['t1', 't2', 't3', 't4'].map((id) => question(id, 'T'))] });
    await M.Assessment.create({ id: 'quiz', title: 'Quiz', institutionId: 'inst', subject: 'Math', status: 'active', dueDate: '2099-01-01', batchId: 'b', curriculumId: 'cur',
      questions: [question('qz1', 'P')] });
    const t = api(teacher.auth);
    const student = await bearer('student', 'stu');
    const s = api(student.auth);

    // 1. The teacher approves the objectives, prerequisites first.
    expect((await t.post('/api/learning/objectives/T/approve')).body.error.code).toBe('PREREQUISITES_NOT_APPROVED');
    expect((await t.post('/api/learning/objectives/P/approve')).body.status).toBe('approved');
    expect((await t.post('/api/learning/objectives/T/approve')).body.status).toBe('approved');

    // 2-4. A diagnostic, answered wrongly, finds a supported prerequisite gap.
    const diag = await runDiagnostic(s, null, 'wrong');
    expect(diag.status).toBe('completed');
    const report = (await s.get(`/api/learning/diagnostics/${diag.id}/report`)).body;
    expect(JSON.stringify(report)).not.toContain('correctAnswer');
    const gapP = await M.StudentObjectiveMastery.findOne({ studentId: 'stu', objectiveId: 'P' }).lean();
    expect(gapP).toMatchObject({ masteryStatus: 'emerging' });
    expect(gapP.independentEvidenceCount).toBeGreaterThanOrEqual(2);
    // Questions on the dependant objective aren't asked once its prerequisite is a gap.
    expect(await M.LearningEvidence.countDocuments({ studentId: 'stu', objectiveId: 'T' })).toBe(0);

    // 5. The student is recommended work on the prerequisite, with evidence.
    const recs = (await s.get('/api/learning/students/me/recommendations')).body.recommendations;
    const first = recs[0];
    expect(first.objectiveId).toBe('P');
    expect(['practise', 'review_prerequisite']).toContain(first.type);
    expect(first.supportingEvidenceIds.length).toBeGreaterThan(0);
    expect(first.explanation).toMatch(/FR.1/);

    // 6-7. Tutoring on the gap gets the objective and a strategy as context.
    const created = await s.post('/api/learning/interventions', { objectiveId: 'P' });
    expect(created.status).toBe(201);
    const started = await s.post(`/api/learning/interventions/${created.body.id}/start`);
    const strategyId = started.body.strategy.id;
    expect(strategyId).toBeTruthy();
    const reply = await s.post(`/api/me/tutor/sessions/${started.body.tutorSessionId}/messages`, { text: 'What is a fraction?' });
    expect(reply.status).toBe(200);
    const system = JSON.stringify(ai.calls.at(-1).system);
    expect(system).toContain('FR.1');
    expect(system).toContain(strategyId.replace(/_/g, ' '));
    expect(system).not.toContain('correctAnswer');

    // 8. Completing the intervention does not change mastery.
    await s.post(`/api/learning/interventions/${created.body.id}/complete`);
    expect((await M.StudentObjectiveMastery.findOne({ studentId: 'stu', objectiveId: 'P' }).lean()).masteryStatus).toBe('emerging');

    // 9-10. An independent reassessment updates mastery.
    const re = await s.post(`/api/learning/interventions/${created.body.id}/reassess`);
    expect(re.status).toBe(201);
    await runDiagnostic(s, { id: re.body.diagnosticId }, 'right');
    const after = await M.StudentObjectiveMastery.findOne({ studentId: 'stu', objectiveId: 'P' }).lean();
    expect(after.masteryEstimate).toBeGreaterThan(gapP.masteryEstimate);
    const outcome = (await s.get(`/api/learning/interventions/${created.body.id}/outcomes`)).body.outcome;
    expect(outcome).toMatchObject({ improved: true, masteryStatus: after.masteryStatus });

    // 11. The teacher sees the updated state for the class.
    const insights = (await t.get('/api/learning/classes/course/insights')).body;
    const cell = insights.heatmap.find((r: any) => r.studentId === 'stu').cells.find((c: any) => c.objectiveId === 'P');
    expect(cell).toMatchObject({ masteryStatus: after.masteryStatus, masteryEstimate: after.masteryEstimate });
    expect(insights.interventions.reassessed).toBe(1);

    // 12. Two distinct independent correct answers schedule an objective review.
    const retention = (await s.get('/api/learning/students/me/retention')).body.retention;
    expect(retention.find((r: any) => r.objectiveId === 'P')).toMatchObject({ status: 'scheduled' });

    // 13. A quiz mistake becomes a spaced review; answering it adds retention evidence.
    const start = await s.post('/api/me/assessments/quiz/attempts');
    expect((await s.post(`/api/me/assessments/quiz/attempts/${start.body.attempt.id}/submit`, { answers: { qz1: 'wrong' } })).status).toBe(200);
    const item = await M.ReviewItem.findOne({ studentId: 'stu' }).lean();
    expect(item).toBeTruthy();
    const historyBefore = await M.MasteryHistory.countDocuments({ studentId: 'stu', objectiveId: 'P' });
    expect((await s.post(`/api/me/reviews/${item.id}/answer`, { answer: 'right' })).status).toBe(200);
    expect(await M.LearningEvidence.countDocuments({ studentId: 'stu', objectiveId: 'P', evidenceType: 'retention_review' })).toBe(1);
    expect(await M.MasteryHistory.countDocuments({ studentId: 'stu', objectiveId: 'P' })).toBeGreaterThanOrEqual(historyBefore);
    const latest = await M.StudentObjectiveMastery.findOne({ studentId: 'stu', objectiveId: 'P' }).lean();
    expect(latest.evidenceCount).toBe(after.evidenceCount + 2); // the wrong quiz answer and the right review answer
  });
});
