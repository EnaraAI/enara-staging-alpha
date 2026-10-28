import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 3 end to end: instructor generates, edits and publishes an
// assessment, assigns it, a student submits, the grader evaluates, validates,
// finalizes and releases with no teacher step, the student sees feedback and
// a next step, Phase 2 evidence updates, and the teacher can still correct.
// AI is mocked. Plus security, migration and operations checks.

const ai = vi.hoisted(() => ({ calls: [] as any[], replies: [] as string[] }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = {
      create: vi.fn(async (body: any) => {
        ai.calls.push(body);
        return { model: 'claude-test', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: ai.replies.shift() ?? '{}' }] };
      }),
    };
    beta = { messages: { create: vi.fn(async () => ({ model: 'claude-test', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'ok' }] })), stream: vi.fn() } };
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
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'StudentCredit', 'Assignment', 'AssessmentAttempt', 'LearningObjective', 'LearningEvent',
    'LearningEvidence', 'GradingProposal', 'StudyPlan', 'ReminderLog', 'AiCall']) {
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
    put: (url: string, body: object) => request(app).put(url).set('Authorization', auth).send(body),
    patch: (url: string, body: object) => request(app).patch(url).set('Authorization', auth).send(body),
  };
}
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out');
}

const ALL = {
  teaching_workflow_enabled: true, ai_assessment_authoring_enabled: true, ai_grading_enabled: true, ai_lesson_planning_enabled: true, study_plans_enabled: true,
  learning_intelligence_enabled: true, mastery_tracking_enabled: true, learning_pathways_enabled: true,
};
let teacher: Awaited<ReturnType<typeof bearer>>;
beforeEach(async () => {
  ai.calls = [];
  ai.replies = [];
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  await mongoose.connection.collection('migrations').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([{ id: 'instA', name: 'A', features: ALL }, { id: 'instB', name: 'B', features: ALL }]);
  await M.Curriculum.create({ id: 'cur', name: 'Fractions', courseName: 'Fractions', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [{ id: 'L1', title: 'Adding', uploads: [] }] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create({ id: 'cls', courseId: 'fr', courseName: 'Fractions 6A', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: [], instructorIds: [teacher.id], visibility: 'student' });
  await M.Student.create([{ id: 'stu1', name: 'Amira', email: 'a@x.com', grade: '6', institutionId: 'instA', batchId: 'b' }, { id: 'stuB', name: 'Other school', email: 'o@x.com', grade: '6', institutionId: 'instB', batchId: 'bB' }]);
  await M.StudentCredit.create({ studentId: 'stu1', institutionId: 'instA', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.LearningObjective.create({ id: 'obj', institutionId: 'instA', curriculumId: 'cur', code: 'FR.1', title: 'Add fractions with unlike denominators', status: 'approved', lessonIds: ['L1'] });
});

describe('Phase 3 end to end', () => {
  it('generate → edit → publish → assign → submit → automatic grade + release → feedback, next step, evidence → teacher oversight', async () => {
    // 1. The instructor gets an AI draft.
    ai.replies = [JSON.stringify({
      title: 'Unlike denominators',
      questions: [
        { type: 'multiple-choice', text: 'What is 1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', explanation: 'Use quarters.', objectiveIds: ['obj'] },
        { type: 'open-response', text: 'Explain why you need a common denominator.', modelAnswer: 'Same-size parts.', objectiveIds: ['obj'], rubric: { criteria: [{ title: 'Reasoning', objectiveIds: ['obj'], levels: [{ label: 'Missing', points: 0 }, { label: 'Partial', points: 1 }, { label: 'Clear', points: 2 }] }] } },
      ],
    })];
    const gen = await teacher.post('/api/assessments/generate', { curriculumId: 'cur', objectiveIds: ['obj'], counts: { 'multiple-choice': 1, 'open-response': 1 } });
    const draft = gen.body.assessment;
    expect(draft.lifecycle).toBe('draft');

    // 2. Edits it (rewords the first question) and publishes.
    const questions = draft.questions.map((q: any, i: number) => (i === 0 ? { ...q, text: 'Work out 1/2 + 1/4.' } : q));
    expect((await teacher.patch(`/api/assessments/${draft.id}`, { questions })).body.lifecycle).toBe('draft');
    expect((await teacher.post(`/api/assessments/${draft.id}/publish`)).body.version.version).toBe(1);

    // 3. Assigns it to the class.
    const asg = (await teacher.post('/api/assignments', { assessmentId: draft.id, classId: 'cls', dueAt: new Date(Date.now() + 86_400_000).toISOString(), releasePolicy: 'manual', answerReveal: 'after-submit' })).body;
    expect(await M.ReminderLog.countDocuments({ kind: 'assignment_published' })).toBe(1);

    // 4. The student submits (one wrong objective answer).
    const student = await bearer('student', 'instA', 'stu1');
    const start = await student.post(`/api/me/assignments/${asg.id}/attempts`);
    expect(start.body.questions[0].text).toBe('Work out 1/2 + 1/4.');
    const answer = 'You need the same size pieces before you can count them together.';
    const crit = questions[1].rubric.criteria[0];
    const evaluation = JSON.stringify({ criteria: [{ criterionId: crit.id, levelId: crit.levels[1].id, evidence: ['same size pieces'], rationale: 'Idea without example' }], scoreExplanation: 'You named the idea but gave no example.', strengths: ['Names the idea'], improvements: ['Show an example'], feedback: 'Right idea; show it with an example.', objectiveIds: ['obj'], confidence: 'medium', flags: [] });
    ai.replies = [evaluation, evaluation];
    await student.post(`/api/me/assignments/${asg.id}/attempts/${start.body.attempt.id}/submit`, { answers: { [questions[0].id]: '2/6', [questions[1].id]: answer } });
    const attemptId = start.body.attempt.id;

    // 5. The grader evaluates twice, validates, finalizes and releases. No teacher step.
    await until(async () => (await M.AssessmentAttempt.findOne({ id: attemptId }).lean())?.intelligenceStatus === 'done');
    expect(await M.AssessmentAttempt.findOne({ id: attemptId }).lean()).toMatchObject({ gradingStatus: 'released', score: 33, finalizedBy: 'system:grader' });
    expect(await M.GradingProposal.countDocuments({ attemptId, status: 'proposed' })).toBe(2);

    // 6. The student sees feedback and a next step.
    const result = (await student.get(`/api/me/assignments/${asg.id}/attempts/${attemptId}/result`)).body;
    expect(result).toMatchObject({ released: true, totalPoints: 1, maxPoints: 3 });
    expect(result.answers[1].feedback).toBe('Right idea; show it with an example.');
    expect(result.answers[0].correctAnswer).toBe('3/4');
    const plan = (await student.get('/api/me/study-plan')).body;
    expect(plan.items.map((i: any) => i.kind)).toEqual(expect.arrayContaining(['review_feedback', 'practise']));
    expect(plan.items.find((i: any) => i.kind === 'practise').evidenceIds.length).toBeGreaterThan(0);

    // 7. Phase 2 evidence and mastery reflect the final grades.
    const evidence = await M.LearningEvidence.find({ studentId: 'stu1', objectiveId: 'obj' }).lean();
    expect(evidence.map((e: any) => [e.result, e.normalizedScore, e.reliabilityWeight]).sort()).toEqual([['incorrect', 0, 1], ['partially_correct', 0.5, 0.8]]);
    expect((await M.StudentObjectiveMastery.findOne({ studentId: 'stu1', objectiveId: 'obj' }).lean()).evidenceCount).toBe(2);

    // 8. Oversight: the teacher sees it as released and corrects it, with a reason.
    expect((await teacher.get('/api/grading/queue')).body.items).toEqual([expect.objectContaining({ attemptId, gradingStatus: 'released', gradedByAi: 1 })]);
    expect((await teacher.post(`/api/grading/attempts/${attemptId}/correct`, { questionId: questions[1].id, points: 2, reason: 'Explanation is complete.' })).body).toMatchObject({ score: 67 });
    expect((await student.get(`/api/me/assignments/${asg.id}/attempts/${attemptId}/result`)).body).toMatchObject({ score: 67, totalPoints: 2 });

    // Operations metrics count what happened.
    const admin = await bearer('admin', 'instA');
    const ops = (await admin.get('/api/teaching/ops')).body;
    expect(ops.proposals).toEqual({ proposed: 2 });
    expect(ops.autoGrading).toMatchObject({ released: 1, retries: 0, correctedAfterRelease: 1, exceptionsByReason: {} });
    expect(ops.reviewActions).toMatchObject({ corrections: 1 });
    expect(ops.aiCalls.map((c: any) => c.feature).sort()).toEqual(['ai_assessment_draft', 'ai_grading']);
    expect((await teacher.get('/api/teaching/ops')).status).toBe(403);
  });
});

describe('Phase 3 security', () => {
  it('students cannot author, publish, grade, or read keys and other students’ work', async () => {
    const student = await bearer('student', 'instA', 'stu1');
    const created = await teacher.post('/api/assessments', { title: 'T', subject: 'M', curriculumId: 'cur', lifecycle: 'draft', questions: [{ id: 'q1', type: 'true-false', text: 't', correctAnswer: 'True' }] });
    for (const call of [
      student.get('/api/assessments'),
      student.get(`/api/assessments/${created.body.id}`),
      student.post(`/api/assessments/${created.body.id}/publish`),
      student.post('/api/assessments/generate', { curriculumId: 'cur' }),
      student.post('/api/assignments', { assessmentId: created.body.id, classId: 'cls', dueAt: new Date().toISOString() }),
      student.get('/api/grading/queue'),
      student.get('/api/teaching/overview'),
      student.get('/api/lesson-plans'),
    ]) {
      expect((await call).status).toBe(403);
    }
  });
  it('IDs do not cross schools', async () => {
    const created = await teacher.post('/api/assessments', { title: 'T', subject: 'M', curriculumId: 'cur', lifecycle: 'published', questions: [{ id: 'q1', type: 'true-false', text: 't', correctAnswer: 'True' }] });
    const asg = (await teacher.post('/api/assignments', { assessmentId: created.body.id, classId: 'cls', dueAt: new Date(Date.now() + 86_400_000).toISOString() })).body;
    const adminB = await bearer('admin', 'instB');
    const studentB = await bearer('student', 'instB', 'stuB');
    expect((await adminB.get(`/api/assessments/${created.body.id}`)).status).toBe(404);
    expect((await adminB.post('/api/assignments', { assessmentId: created.body.id, classId: 'cls', dueAt: new Date().toISOString() })).status).toBe(404);
    expect((await adminB.get(`/api/assignments/${asg.id}`)).status).toBe(404);
    expect((await adminB.get('/api/teaching/students/stu1/profile')).status).toBe(404);
    expect((await studentB.get(`/api/me/assignments/${asg.id}`)).status).toBe(404);
    expect((await studentB.post('/api/me/tutor/handoff', { kind: 'assignment', refId: asg.id })).status).toBe(404);
    // A client-supplied school id is ignored for non-Enara staff.
    const forged = await teacher.post('/api/assessments', { title: 'X', subject: 'M', curriculumId: 'cur', institutionId: 'instB', lifecycle: 'draft' });
    expect(forged.status === 201 ? forged.body.institutionId : 'instA').toBe('instA');
  });
});

describe('Phase 3 migration', () => {
  it('versions existing assessments once, without changing them, and the legacy flow uses that version', async () => {
    await M.Assessment.collection.insertOne({ id: 'legacy', title: 'Old quiz', institutionId: 'instA', subject: 'Math', status: 'active', batchId: 'b', dueAt: '', duration: 30, difficulty: 'Medium', maxAttempts: 1, answerReveal: 'after-submit',
      questions: [{ id: 'q1', type: 'multiple-choice', text: 'Pick', options: ['a', 'b'], correctAnswer: 'a', explanation: '' }] });
    const { MIGRATIONS } = await import('../src/migrations');
    const { runMigrations } = await import('../src/migrations/runner');
    const ran = await runMigrations(MIGRATIONS);
    expect(ran).toContain('2026-10-26-phase3-assessment-versions');
    expect(await runMigrations(MIGRATIONS)).toEqual([]);
    const v = await M.AssessmentVersion.findOne({ assessmentId: 'legacy' }).lean();
    expect(v).toMatchObject({ version: 1, title: 'Old quiz', totalPoints: 1, publishedBy: 'migration' });
    const a = await M.Assessment.findOne({ id: 'legacy' }).lean();
    expect(a).toMatchObject({ publishedVersion: 1, lifecycle: 'published', title: 'Old quiz' });
    expect(a.questions).toHaveLength(1);
    const student = await bearer('student', 'instA', 'stu1');
    const start = await student.post('/api/me/assessments/legacy/attempts');
    expect(start.body.attempt.assessmentVersion).toBe(1);
  });
});
