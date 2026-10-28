import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P4 connected workflow, mocked end to end: approved source → AI draft with
// server-validated sources → publish and assign → student attempt →
// autonomous grading → gap → intervention and tutor → unassisted
// reassessment → verified outcome. Anthropic is mocked; the malware scanner
// is a test-only fake (never in production code). No network.
const ai = vi.hoisted(() => ({ calls: [] as any[], handler: (_b: any): string | Error => '{}' }));
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

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-flow-'));
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let scan: typeof import('../src/services/malwareScan');
let M: Record<string, mongoose.Model<any>>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', BCRYPT_ROUNDS: '10',
    UPLOAD_DIR: uploadDir, ANTHROPIC_API_KEY: 'test-key',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  ({ signAccessToken } = await import('../src/auth/jwt'));
  scan = await import('../src/services/malwareScan');
  M = {};
  for (const n of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'Assignment', 'AssessmentAttempt', 'LearningObjective', 'LearningEvent', 'LearningEvidence', 'StudentObjectiveMastery', 'TimeToUnderstand', 'LearningIntervention', 'TutorSession', 'TutorMessage', 'PedagogicalDecision', 'LessonPlan']) {
    M[n] = (await import(`../src/models/${n}`))[n];
  }
  const a = await import('../src/models/Assessment');
  M.Assessment = a.Assessment;
  M.AssessmentVersion = a.AssessmentVersion;
  const c = await import('../src/models/CurriculumChunk');
  M.CurriculumChunk = c.CurriculumChunk;
  M.CurriculumFileJob = c.CurriculumFileJob;
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
}, 60_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});
afterEach(() => scan.setMalwareScannerForTests(null));

type Who = { id: string; auth: string; get: (u: string) => request.Test; post: (u: string, b?: object) => request.Test };
let n = 0;
async function who(role: string, institutionId: string, studentId?: string): Promise<Who> {
  n += 1;
  const email = `${role}${n}@x.test`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email, role: role as never, institutionId, studentId })}`;
  return {
    id: user._id.toString(),
    auth,
    get: (u) => request(app).get(u).set('Authorization', auth),
    post: (u, b = {}) => request(app).post(u).set('Authorization', auth).send(b),
  };
}
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out');
}

const FLAGS = {
  teaching_workflow_enabled: true, ai_assessment_authoring_enabled: true, ai_lesson_planning_enabled: true, ai_grading_enabled: true,
  learning_intelligence_enabled: true, mastery_tracking_enabled: true, adaptive_pedagogy_enabled: true, diagnostics_enabled: true,
  documents_workspace_enabled: true, connected_workflow_enabled: true,
};
const clean = { name: 'fake-test-scanner', scan: vi.fn(async () => ({ verdict: 'clean' as const })) };
let T: Who, T2: Who, WA: Who, AM: Who, S1: Who, TB: Who;

beforeEach(async () => {
  ai.calls = [];
  ai.handler = () => '{}';
  for (const m of Object.values(M)) await mongoose.connection.collection(m.collection.name).deleteMany({});
  for (const c of ['rate_limits', 'budget_counters', 'budget_reservations', 'ai_calls']) await mongoose.connection.collection(c).deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  scan.setMalwareScannerForTests(null);
  await M.Institution.create([
    { id: 'instA', name: 'A', features: FLAGS },
    { id: 'instB', name: 'B', features: FLAGS },
    { id: 'instOff', name: 'Off', features: { ...FLAGS, connected_workflow_enabled: false } },
  ]);
  T = await who('teacher', 'instA');
  T2 = await who('teacher', 'instA');
  WA = await who('admin', 'instA');
  AM = await who('academic_manager', 'instA');
  TB = await who('teacher', 'instB');
  await M.Curriculum.create([
    { id: 'cur', name: 'Science', courseName: 'Science', institutionId: 'instA', summary: 's', lastUpdated: '2026-10-01', createdBy: T.id, chapters: [{ id: 'L1', title: 'Photosynthesis', uploads: [] }] },
    { id: 'curB', name: 'Science B', courseName: 'Science', institutionId: 'instB', summary: 's', lastUpdated: '2026-10-01', createdBy: TB.id, chapters: [{ id: 'L1', title: 'x', uploads: [] }] },
  ]);
  await M.CourseInstance.create([
    { id: 'cls', courseId: 'sci', courseName: 'Science 7A', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: ['stu1'], instructorIds: [T.id], visibility: 'student' },
    { id: 'cls2', courseId: 'sci2', courseName: 'Science 7B', institutionId: 'instA', academicYear: '2026', batchId: 'b2', curriculumId: 'cur', studentIds: ['stu2'], instructorIds: [T2.id], visibility: 'student' },
  ]);
  await M.Student.create([
    { id: 'stu1', name: 'Amira', email: 'a@x.test', grade: '7', institutionId: 'instA', batchId: 'b' },
    { id: 'stu2', name: 'Bilal', email: 'b@x.test', grade: '7', institutionId: 'instA', batchId: 'b2' },
    { id: 'demo1', name: 'Demo', email: 'd@x.test', grade: '7', institutionId: 'instA', batchId: 'b', origin: 'demo_seed' },
  ]);
  await M.LearningObjective.create({ id: 'obj', institutionId: 'instA', curriculumId: 'cur', code: 'SC.1', title: 'Explain photosynthesis', status: 'approved' });
  S1 = await who('student', 'instA', 'stu1');
});

const PHOTO = Buffer.from('Photosynthesis lesson. Plants use sunlight, water and carbon dioxide to make glucose and oxygen in their chloroplasts.');
const OTHER = Buffer.from('Fractions lesson. A fraction names equal parts of a whole, written as numerator over denominator.');
const upload = (w: Who, body: Buffer, name: string, cur = 'cur') =>
  request(app).post('/api/documents').set('Authorization', w.auth).field('curriculumId', cur).field('lessonId', 'L1').field('rightsAttested', 'true').attach('file', body, { filename: name, contentType: 'text/plain' });
async function cleanDoc() {
  scan.setMalwareScannerForTests(clean);
  const id = (await upload(T, PHOTO, 'photosynthesis.txt')).body.document.uploadId as string;
  await upload(T, OTHER, 'fractions.txt');
  scan.setMalwareScannerForTests(null);
  return id;
}
const mcq = (text: string, refs: number[]) => ({ type: 'multiple-choice', text, options: ['Glucose and oxygen', 'Salt', 'Iron'], correctAnswer: 'Glucose and oxygen', explanation: 'Plants make glucose.', points: 1, difficulty: 2, objectiveIds: ['obj'], sourceRefs: refs });
const draftReply = JSON.stringify({ title: 'Photosynthesis check', questions: [mcq('What do plants make in photosynthesis?', [1]), mcq('What do chloroplasts produce?', [7])] });
const generate = (w: Who, extra: Record<string, unknown> = {}) =>
  w.post('/api/assessments/generate', { curriculumId: 'cur', brief: 'photosynthesis sunlight glucose chloroplasts', objectiveIds: ['obj'], counts: { 'multiple-choice': 2 }, ...extra });

describe('P4.1 source-linked generation', () => {
  it('a clean, attested document: draft with server-validated sources; invented refs are labelled no supporting source', async () => {
    const id = await cleanDoc();
    ai.handler = () => draftReply;
    const r = await generate(T, { uploadIds: [id] });
    expect(r.status).toBe(201);
    const [q1, q2] = r.body.assessment.questions;
    expect(q1.sources).toEqual([expect.objectContaining({ uploadId: id, fileName: 'photosynthesis.txt' })]);
    expect(q1.sourceStatus).toBe('supported');
    expect(q2.sources ?? []).toEqual([]); // [7] was not a retrieved passage
    expect(q2.sourceStatus).toBe('no_supporting_source');
    expect(r.body.sources.every((s: any) => s.uploadId === id)).toBe(true);
    expect(JSON.stringify(ai.calls[0])).not.toContain('Fractions'); // narrowed to the chosen document
    // Publishing needs the teacher to correct or accept unsourced questions.
    const pub = await T.post(`/api/assessments/${r.body.assessment.id}/publish`);
    expect(pub.status).toBe(409);
    expect(pub.body.error.code).toBe('UNSOURCED_QUESTIONS');
    expect((await T.post(`/api/assessments/${r.body.assessment.id}/publish`, { acknowledgeUnsourced: true })).status).toBe(200);
  });

  it('no AI call when the gate is not satisfied; each failure is distinct', async () => {
    scan.setMalwareScannerForTests({ name: 'fake-test-scanner', scan: async () => ({ verdict: 'error' as const }) });
    const failed = (await upload(T, PHOTO, 'notes.txt')).body.document.uploadId; // a configured scan that failed
    scan.setMalwareScannerForTests(null);
    let r = await generate(T, { uploadIds: [failed] });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('SOURCE_SCAN_FAILED');
    const id = await cleanDoc();
    await M.CurriculumFileJob.updateOne({ id }, { scanStatus: 'pending' }); // stale/changed scan state
    expect((await generate(T, { uploadIds: [id] })).body.error.code).toBe('SOURCE_AWAITING_SCAN');
    await M.CurriculumFileJob.updateOne({ id }, { scanStatus: 'clean', status: 'no_text' });
    expect((await generate(T, { uploadIds: [id] })).body.error.code).toBe('SOURCE_NO_TEXT');
    await M.CurriculumFileJob.updateOne({ id }, { status: 'removed' });
    r = await generate(T, { uploadIds: [id] });
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('SOURCE_EXPIRED');
    expect(ai.calls).toHaveLength(0);
  });

  it("another teacher's or another school's document is not found; flag off refuses source-linking", async () => {
    scan.setMalwareScannerForTests(clean);
    const b = (await upload(TB, PHOTO, 'b.txt', 'curB')).body.document.uploadId;
    scan.setMalwareScannerForTests(null);
    expect((await generate(T, { uploadIds: [b] })).status).toBe(404);
    const id = await cleanDoc();
    // A teacher with no class linked to this curriculum has no read scope.
    const T3 = await who('teacher', 'instA');
    expect([403, 404]).toContain((await generate(T3, { uploadIds: [id] })).status);
    const off = await who('admin', 'instOff');
    await M.Curriculum.create({ id: 'curOff', name: 'O', institutionId: 'instOff', summary: 's', lastUpdated: '2026-10-01', createdBy: off.id, chapters: [] });
    expect((await off.post('/api/assessments/generate', { curriculumId: 'curOff', counts: { 'multiple-choice': 1 }, uploadIds: ['x'] })).body.error.code).toBe('FEATURE_DISABLED');
    expect(ai.calls).toHaveLength(0);
  });

  it('lesson plans: chosen documents narrow the sources; unsupported sections are labelled', async () => {
    const id = await cleanDoc();
    ai.handler = () => JSON.stringify({ title: 'Plan', sections: [
      { kind: 'sequence', title: 'Open', content: 'Start', durationMinutes: 5, sourceRefs: [] },
      { kind: 'explanation', title: 'Explain', content: 'Plants make glucose', durationMinutes: 20, sourceRefs: [1] },
      { kind: 'check_for_understanding', title: 'Check', content: 'Ask', durationMinutes: 10, sourceRefs: [3] },
    ] });
    const r = await T.post('/api/lesson-plans/generate', { curriculumId: 'cur', lessonId: 'L1', goals: 'photosynthesis sunlight glucose chloroplasts', uploadIds: [id] });
    expect(r.status).toBe(201);
    expect(r.body.plan.sections.map((s: any) => s.sourceStatus)).toEqual(['no_supporting_source', 'supported', 'no_supporting_source']);
    expect(r.body.plan.sections[1].sources[0]).toMatchObject({ uploadId: id });
  });
});

describe('P4.3 outcomes and timeline: roles, scope, origin', () => {
  beforeEach(async () => {
    await M.TimeToUnderstand.create([
      { id: 't1', institutionId: 'instA', studentId: 'stu1', objectiveId: 'obj', gapDetectedAt: new Date(), status: 'verified', understandingVerifiedAt: new Date(), activeInstructionSeconds: 600, measurementVersion: 'ttu-v1', lastComputedAt: new Date() },
      { id: 't2', institutionId: 'instA', studentId: 'stu2', objectiveId: 'obj', gapDetectedAt: new Date(), status: 'in_progress', activeInstructionSeconds: 100, measurementVersion: 'ttu-v1', lastComputedAt: new Date() },
      { id: 't3', institutionId: 'instA', studentId: 'demo1', objectiveId: 'obj', gapDetectedAt: new Date(), status: 'verified', activeInstructionSeconds: 60, measurementVersion: 'ttu-v1', lastComputedAt: new Date() },
      { id: 't4', institutionId: 'instB', studentId: 'x', objectiveId: 'obj', gapDetectedAt: new Date(), status: 'verified', activeInstructionSeconds: 60, measurementVersion: 'ttu-v1', lastComputedAt: new Date() },
    ]);
  });
  const item = (r: request.Response) => r.body.objectives.items[0];

  it('teacher: own classes only; admin and academic manager: school aggregates; demo excluded by default', async () => {
    const t = await T.get('/api/learning/analytics/outcomes');
    expect(t.status).toBe(200);
    expect(item(t)).toMatchObject({ studentsWithGap: 1, gapClosed: 1, notYetVerified: 0, ttuAvailable: true, medianActiveSecondsToUnderstand: 600 });
    expect(t.body.note).toMatch(/does not show what caused it/);
    const w = await WA.get('/api/learning/analytics/outcomes');
    expect(item(w)).toMatchObject({ studentsWithGap: 2, gapClosed: 1, notYetVerified: 1 });
    const am = await AM.get('/api/learning/analytics/outcomes');
    expect(item(am)).toMatchObject({ studentsWithGap: 2, gapClosed: 1 });
    expect(JSON.stringify(am.body)).not.toMatch(/stu1|stu2|Amira/);
    const demo = await WA.get('/api/learning/analytics/outcomes?origin=demo_seed');
    expect(item(demo)).toMatchObject({ studentsWithGap: 1, gapClosed: 1 });
    expect(item(await WA.get('/api/learning/analytics/outcomes?origin=all')).studentsWithGap).toBe(3);
  });

  it('class scope is checked; students and other schools get nothing; bounded range', async () => {
    expect((await T.get('/api/learning/analytics/outcomes?classId=cls2')).status).toBe(404);
    expect((await TB.get('/api/learning/analytics/outcomes?classId=cls')).status).toBe(404);
    expect((await S1.get('/api/learning/analytics/outcomes')).status).toBe(403);
    expect((await WA.get('/api/learning/analytics/outcomes?from=2020-01-01&to=2026-10-01')).status).toBe(400);
    expect(item(await TB.get('/api/learning/analytics/outcomes'))).toBeUndefined();
    const off = await who('admin', 'instOff');
    expect((await off.get('/api/learning/analytics/outcomes')).status).toBe(404);
  });

  it('timeline: teacher for own students, admin for the school; never academic managers or other teachers', async () => {
    const t = await T.get('/api/learning/students/stu1/timeline');
    expect(t.status).toBe(200);
    expect(t.body.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(['gap_detected', 'gap_closed_verified']));
    expect((await T.get('/api/learning/students/stu2/timeline')).status).toBe(404);
    expect((await WA.get('/api/learning/students/stu2/timeline')).status).toBe(200);
    expect((await AM.get('/api/learning/students/stu1/timeline')).status).toBe(403);
    expect((await TB.get('/api/learning/students/stu1/timeline')).status).toBe(404);
  });
});

describe('mocked end-to-end connected loop', () => {
  it('approved source → draft → publish/assign → attempt → autonomous grading → gap → intervention + tutor (gap stays open) → unassisted reassessment → verified', { timeout: 60_000 }, async () => {
    // 1. Approved source (test-only clean scan) → AI draft citing it.
    const id = await cleanDoc();
    ai.handler = () => JSON.stringify({ title: 'Photosynthesis check', questions: [mcq('What do plants make in photosynthesis?', [1]), mcq('What do chloroplasts produce?', [1]), mcq('What does sunlight power?', [1])] });
    const draft = await generate(T, { uploadIds: [id], counts: { 'multiple-choice': 3 } });
    expect(draft.status).toBe(201);
    expect(draft.body.assessment.questions.every((q: any) => q.sourceStatus === 'supported')).toBe(true);
    const assessmentId = draft.body.assessment.id;
    // 2. Teacher publishes and assigns to their own class only.
    expect((await T.post(`/api/assessments/${assessmentId}/publish`)).status).toBe(200);
    expect((await T.post('/api/assignments', { assessmentId, classId: 'cls2', dueAt: new Date(Date.now() + 86_400_000).toISOString() })).status).toBe(404);
    const asg = await T.post('/api/assignments', { assessmentId, classId: 'cls', dueAt: new Date(Date.now() + 86_400_000).toISOString(), tutorPolicy: 'blocked' });
    expect(asg.status).toBe(201);
    // 3. Student attempt, all wrong → autonomous grading released (no approval step).
    const att = (await S1.post(`/api/me/assignments/${asg.body.id}/attempts`)).body.attempt.id;
    const qs = (await M.Assessment.findOne({ id: assessmentId }).lean()).questions;
    await S1.post(`/api/me/assignments/${asg.body.id}/attempts/${att}/submit`, { answers: Object.fromEntries(qs.map((q: any) => [q.id, 'Salt'])) });
    await until(async () => {
      const t = await M.AssessmentAttempt.findOne({ id: att }).lean();
      return t?.gradingStatus === 'released' && t?.intelligenceStatus !== 'pending';
    });
    const { processPendingEvidence } = await import('../src/services/evidenceProcessor');
    await processPendingEvidence();
    // 4. A gap is observed and an episode opens.
    await until(async () => (await M.TimeToUnderstand.countDocuments({ studentId: 'stu1', status: 'in_progress' })) === 1);
    let out = await T.get('/api/learning/analytics/outcomes');
    expect(out.body.objectives.items[0]).toMatchObject({ studentsWithGap: 1, gapClosed: 0, notYetVerified: 1 });
    expect(out.body.grading.released).toBe(1);
    // 5. Teacher assigns an intervention; the student is tutored. Explanation alone does not close the gap.
    const iv = await T.post('/api/learning/interventions', { studentId: 'stu1', objectiveId: 'obj' });
    expect(iv.status).toBe(201);
    ai.handler = () => 'Think about what the plant needs light for. What does it build?';
    const startedIv = await S1.post(`/api/learning/interventions/${iv.body.id}/start`);
    expect(startedIv.status).toBe(200);
    const msg = await S1.post(`/api/me/tutor/sessions/${startedIv.body.tutorSessionId}/messages`, { text: 'Explain photosynthesis to me' });
    expect(msg.status).toBe(200);
    await S1.post(`/api/learning/interventions/${iv.body.id}/complete`);
    await processPendingEvidence();
    out = await T.get('/api/learning/analytics/outcomes');
    expect(out.body.objectives.items[0]).toMatchObject({ gapClosed: 0, notYetVerified: 1 }); // negative: tutoring is not verification
    // 6. Unassisted reassessment: a new assignment, tutor blocked, answered correctly.
    // A teacher-authored reassessment with distinct items (the mastery model
    // needs varied independent evidence); repeated until the existing
    // mastery/TTU rules are met (bounded).
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, type: 'multiple-choice', text: `Reassessment item ${i}: what do plants make?`, options: ['Glucose and oxygen', 'Salt'], correctAnswer: 'Glucose and oxygen', explanation: '', points: 1, objectiveIds: ['obj'] }));
    const reA = await T.post('/api/assessments', { title: 'Reassessment', subject: 'Science', curriculumId: 'cur', lifecycle: 'published', questions: items });
    expect(reA.status).toBe(201);
    const re = await T.post('/api/assignments', { assessmentId: reA.body.id, classId: 'cls', dueAt: new Date(Date.now() + 86_400_000).toISOString(), tutorPolicy: 'blocked', maxAttempts: 10 });
    for (let k = 0; k < 6 && !(await M.TimeToUnderstand.countDocuments({ studentId: 'stu1', status: 'verified' })); k++) {
      const rid = re.body.id;
      const t2 = (await S1.post(`/api/me/assignments/${rid}/attempts`)).body.attempt.id;
      await S1.post(`/api/me/assignments/${rid}/attempts/${t2}/submit`, { answers: Object.fromEntries(items.map((q) => [q.id, 'Glucose and oxygen'])) });
      await until(async () => {
        const t = await M.AssessmentAttempt.findOne({ id: t2 }).lean();
        return t?.gradingStatus === 'released' && t?.intelligenceStatus !== 'pending';
      });
      await processPendingEvidence();
    }
    await until(async () => (await M.TimeToUnderstand.countDocuments({ studentId: 'stu1', status: 'verified' })) === 1);
    out = await T.get('/api/learning/analytics/outcomes');
    expect(out.body.objectives.items[0]).toMatchObject({ studentsWithGap: 1, gapClosed: 1, notYetVerified: 0, ttuAvailable: true });
    // 7. The audit timeline shows the journey without answers.
    const tl = await T.get('/api/learning/students/stu1/timeline');
    const types = tl.body.events.map((e: any) => e.type);
    expect(types).toEqual(expect.arrayContaining(['attempt_started', 'attempt_submitted', 'grading_released', 'intervention_created', 'gap_detected', 'gap_closed_verified']));
    expect(JSON.stringify(tl.body)).not.toContain('Glucose and oxygen');
   }, 60_000);
});
