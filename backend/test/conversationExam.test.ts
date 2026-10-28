import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSING_TURN, answerFor, nextTurns, validateFollowUp } from '../src/services/conversationExam';

// Conversation exams: an AI examiner asks the questions one at a time (word for
// word), may ask one neutral follow-up per question, and the student's replies
// are graded like written answers. The AI is mocked.

const ai = vi.hoisted(() => ({ calls: [] as any[], handler: (_body: any): string | Error => '' }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = {
      create: vi.fn(async (body: any) => {
        ai.calls.push(body);
        const out = ai.handler(body);
        if (out instanceof Error) throw out;
        return { model: 'claude-test', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: out }] };
      }),
    };
    beta = { messages: { create: vi.fn(), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

const RUBRIC = [{ id: 'reason', title: 'Reasoning', maxPoints: 4, levels: [{ id: 'none', label: 'Missing', points: 0 }, { id: 'part', label: 'Partial', points: 2 }, { id: 'full', label: 'Complete', points: 4 }] }];
const MODEL_ANSWER = 'You can only add parts directly when every part is the same size as the others';
const rubricReply = (levelId = 'part') => JSON.stringify({
  criteria: [{ criterionId: 'reason', levelId, evidence: levelId === 'none' ? [] : ['the same size'], rationale: 'Names the idea.' }],
  scoreExplanation: 'You named the key idea.', strengths: ['Names the key idea'], improvements: ['Add an example'], feedback: 'Good start.', objectiveIds: ['obj'], confidence: 'medium', flags: [],
});
const isExaminer = (body: any) => /impartial examiner/.test(body.system);
let followUp: string | null = 'Can you explain how you know that?';
const DEFAULT = (body: any) => (isExaminer(body) ? JSON.stringify({ followUp }) : rubricReply('part'));

describe('examiner steps (unit)', () => {
  const qs = [{ id: 'a', type: 'open-response', text: 'Why?' }, { id: 'b', type: 'short-answer', text: 'How much?' }] as any[];
  it('opens with question 1 word for word, follows up once, moves on, and closes', () => {
    const open = nextTurns({ questions: qs, state: null });
    expect(open.turns).toHaveLength(1);
    expect(open.turns[0]).toMatchObject({ role: 'examiner', kind: 'question', questionId: 'a' });
    expect(open.turns[0].text).toContain('Question 1 of 2. Why?');
    const probe = nextTurns({ questions: qs, state: open.state, reply: ' because ', followUp: 'Can you say more?' });
    expect(probe.turns.map((t) => [t.role, t.kind ?? null, t.text])).toEqual([['student', null, 'because'], ['examiner', 'follow_up', 'Can you say more?']]);
    expect(probe.state).toEqual({ index: 0, probed: true, done: false });
    // Only one follow-up per question, even if the examiner asks for another.
    const next = nextTurns({ questions: qs, state: probe.state, reply: 'same size', followUp: 'Again?' });
    expect(next.turns[1]).toMatchObject({ kind: 'question', questionId: 'b', text: 'Question 2 of 2. How much?' });
    const end = nextTurns({ questions: qs, state: next.state, reply: 'half', followUp: null });
    expect(end.turns[1]).toMatchObject({ kind: 'closing', text: CLOSING_TURN });
    expect(end.state.done).toBe(true);
    expect(answerFor([...open.turns, ...probe.turns, ...next.turns, ...end.turns], 'a')).toBe('because\nsame size');
  });
  it('accepts only one short question or null as a follow-up', () => {
    expect(validateFollowUp({ followUp: null })).toBeNull();
    expect(validateFollowUp({ followUp: 'Can you explain? ' })).toBe('Can you explain?');
    expect(validateFollowUp({ followUp: 'هل يمكنك التوضيح؟' })).toBe('هل يمكنك التوضيح؟');
    expect(() => validateFollowUp({ followUp: 'That is right.' })).toThrow();
    expect(() => validateFollowUp({ followUp: 'x'.repeat(300) + '?' })).toThrow();
    expect(() => validateFollowUp({ followUp: 3 })).toThrow();
  });
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let AG: typeof import('../src/services/autoGrading');
let G: typeof import('../src/services/grading');
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
  AG = await import('../src/services/autoGrading');
  G = await import('../src/services/grading');
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'Assignment', 'AssessmentAttempt', 'LearningObjective', 'LearningEvent', 'LearningEvidence', 'GradingProposal', 'ReminderLog', 'StudyPlan']) {
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
  };
}
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out');
}
const attemptOf = (id: string) => M.AssessmentAttempt.findOne({ id }).lean() as Promise<any>;
// Grading run over (and, once released, the Phase 2 step too).
const settled = (id: string) =>
  until(async () => {
    const t = await attemptOf(id);
    return !['grading_queued', 'grading_in_progress'].includes(t?.gradingStatus) && (t?.gradingStatus !== 'released' || t?.intelligenceStatus !== 'pending');
  });
// Makes a failed attempt due for its next retry now.
const makeDue = (id: string) => M.AssessmentAttempt.updateOne({ id }, { $set: { nextGradingAt: new Date(Date.now() - 1000) } });

let teacher: Awaited<ReturnType<typeof bearer>>;
let student: Awaited<ReturnType<typeof bearer>>;
const FLAGS = { teaching_workflow_enabled: true, ai_grading_enabled: true, learning_intelligence_enabled: true, mastery_tracking_enabled: true, study_plans_enabled: true };
beforeEach(async () => {
  ai.calls = [];
  ai.handler = DEFAULT;
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([{ id: 'instA', name: 'A', features: FLAGS }, { id: 'instB', name: 'B', features: FLAGS }, { id: 'instC', name: 'C', features: { ...FLAGS, ai_grading_enabled: false } }]);
  await M.Curriculum.create({ id: 'cur', name: 'Fractions', courseName: 'Fractions', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [] });
  teacher = await bearer('teacher', 'instA');
  await M.CourseInstance.create({ id: 'cls', courseId: 'fr', courseName: 'Fractions 6A', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: [], instructorIds: [teacher.id], visibility: 'student' });
  await M.Student.create([{ id: 'stu1', name: 'Amira', email: 'a@x.com', grade: '6', institutionId: 'instA', batchId: 'b' }, { id: 'stu2', name: 'Bilal', email: 'b@x.com', grade: '6', institutionId: 'instA', batchId: 'b' }]);
  await M.LearningObjective.create({ id: 'obj', institutionId: 'instA', curriculumId: 'cur', code: 'FR.1', title: 'Add fractions', status: 'approved' });
  student = await bearer('student', 'instA', 'stu1');
});

type Q = Record<string, unknown>;
const OPEN: Q = { id: 'q2', type: 'open-response', text: 'Why same-size parts?', modelAnswer: MODEL_ANSWER, rubric: { criteria: RUBRIC.map((c) => ({ ...c, objectiveIds: ['obj'] })) } };
const SHORT: Q = { id: 'q3', type: 'short-answer', text: 'Write one half as a decimal.', correctAnswer: '0.5', explanation: '', points: 1, objectiveIds: ['obj'] };
const MCQ: Q = { id: 'q1', type: 'multiple-choice', text: '1/2+1/2?', options: ['1', '2'], correctAnswer: '1', explanation: '', points: 2, objectiveIds: ['obj'] };

async function assign(questions: Q[], format = 'conversation') {
  const created = await teacher.post('/api/assessments', { title: 'Oral check', subject: 'Math', curriculumId: 'cur', lifecycle: 'published', questions });
  return teacher.post('/api/assignments', { assessmentId: created.body.id, classId: 'cls', dueAt: new Date(Date.now() + 86_400_000).toISOString(), answerReveal: 'never', format });
}
const say = (asg: string, att: string, message?: string) => student.post(`/api/me/assignments/${asg}/attempts/${att}/conversation`, message === undefined ? {} : { message });

describe('conversation exams', () => {
  beforeEach(() => { followUp = 'Can you explain how you know that?'; });

  it('1. only allows questions answered in words', async () => {
    const bad = await assign([OPEN, MCQ]);
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/open-response and short-answer/);
    const ok = await assign([OPEN, SHORT]);
    expect(ok.status).toBe(201);
    expect(ok.body.format).toBe('conversation');
    expect((await assign([OPEN, MCQ], 'written')).status).toBe(201);
  });

  it('2. runs the exam, records the replies as answers, grades them with the rubric and shows the teacher the transcript', async () => {
    const asg = (await assign([OPEN])).body.id;
    const detail = await student.get(`/api/me/assignments/${asg}`);
    expect(detail.body.assignment.format).toBe('conversation');
    const att = (await student.post(`/api/me/assignments/${asg}/attempts`)).body.attempt.id;
    const open = await say(asg, att);
    expect(open.status).toBe(200);
    expect(open.body.turns[0].text).toContain('Why same-size parts?');
    expect(ai.calls).toHaveLength(0); // the questions are asked without AI
    const r1 = await say(asg, att, 'They have to be the same size');
    expect(r1.body.turns.map((t: any) => t.kind ?? t.role)).toEqual(['student', 'follow_up']);
    // The examiner never sees the model answer or the rubric.
    const examinerCall = JSON.stringify(ai.calls[0]);
    expect(examinerCall).not.toContain(MODEL_ANSWER);
    expect(examinerCall).not.toContain('Partial');
    const r2 = await say(asg, att, 'Because 1/3 is bigger than 1/6, so you change 1/3 to 2/6 first');
    expect(r2.body.turns.map((t: any) => t.kind ?? t.role)).toEqual(['student', 'closing']);
    expect(r2.body.state.done).toBe(true);
    expect(ai.calls).toHaveLength(1); // no second follow-up for the same question
    expect((await say(asg, att, 'more')).status).toBe(409);
    // Typed answers are ignored: what was said is what is graded.
    const sub = await student.post(`/api/me/assignments/${asg}/attempts/${att}/submit`, { answers: { q2: 'something else' } });
    expect(sub.status).toBe(200);
    await settled(att);
    const t = await attemptOf(att);
    expect(t.answers[0].studentAnswer).toBe('They have to be the same size\nBecause 1/3 is bigger than 1/6, so you change 1/3 to 2/6 first');
    expect(t).toMatchObject({ gradingStatus: 'released', totalPoints: 2, answers: [{ method: 'ai', points: 2 }] });
    const review = await teacher.get(`/api/grading/attempts/${att}`);
    expect(review.body.format).toBe('conversation');
    expect(review.body.attempt.conversation).toHaveLength(5);
  });

  it('3. moves on without a follow-up when the examiner AI fails or declines', async () => {
    const asg = (await assign([OPEN, SHORT])).body.id;
    const att = (await student.post(`/api/me/assignments/${asg}/attempts`)).body.attempt.id;
    await say(asg, att);
    ai.handler = () => new Error('provider down');
    const r1 = await say(asg, att, 'They must be the same size');
    expect(r1.body.turns[1]).toMatchObject({ kind: 'question', questionId: 'q3' });
    ai.handler = DEFAULT; followUp = null;
    const r2 = await say(asg, att, 'zero point five');
    expect(r2.body.turns[1].kind).toBe('closing');
  });

  it('4. refuses conversation turns on written assignments and on other students\' attempts, and empty replies', async () => {
    const written = (await assign([OPEN], 'written')).body.id;
    const att = (await student.post(`/api/me/assignments/${written}/attempts`)).body.attempt.id;
    expect((await say(written, att)).status).toBe(409);
    const asg = (await assign([OPEN])).body.id;
    const mine = (await student.post(`/api/me/assignments/${asg}/attempts`)).body.attempt.id;
    await say(asg, mine);
    expect((await say(asg, mine, '   ')).status).toBe(400);
    const other = await bearer('student', 'instA', 'stu2');
    expect((await other.post(`/api/me/assignments/${asg}/attempts/${mine}/conversation`, { message: 'hi' })).status).toBe(409);
  });

  it('5. keeps the format fixed once students have started', async () => {
    const asg = (await assign([OPEN])).body.id;
    await student.post(`/api/me/assignments/${asg}/attempts`);
    const res = await teacher.patch(`/api/assignments/${asg}`, { format: 'written' });
    expect(res.status).toBe(409);
  });
});
