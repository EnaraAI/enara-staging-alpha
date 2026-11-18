import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formOutcomes } from '../src/parents/levels';

// Parents P3 (docs/parents/P3_NOTES.md): PARENT_GRADES_AFTER_REVIEW_ENABLED and the
// school's "Show results to parents: immediately / after the teacher releases them"
// (default after release, D7). An unreleased result reaches a parent through NO path:
// progress, the "score dropped" status, the CEFR level from checkpoint tests, the home
// card and the weekly report. A result released automatically counts as released.

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tok: Record<string, string> = {};
const PW = 'parents-p3-test-password';
const DAY = 86_400_000;
const as = (who: string) => ({
  get: (p: string) => request(app).get(p).set('Authorization', tok[who] ?? ''),
  post: (p: string, b: object = {}) => request(app).post(p).set('Authorization', tok[who] ?? '').send(b),
  put: (p: string, b: object = {}) => request(app).put(p).set('Authorization', tok[who] ?? '').send(b),
});
const on = () => { process.env.PARENT_GRADES_AFTER_REVIEW_ENABLED = 'true'; };
const off = () => { delete process.env.PARENT_GRADES_AFTER_REVIEW_ENABLED; };

async function attempt(id: string, title: string, score: number, daysAgo: number, gradingStatus?: string, extra: Record<string, unknown> = {}) {
  await M.AssessmentAttempt.create({ id, assessmentId: `as-${id}`, assessmentTitle: title, studentId: 's1', institutionId: 'p3-A', status: 'submitted', submittedAt: new Date(Date.now() - daysAgo * DAY), score, ...(gradingStatus ? { gradingStatus } : {}), ...extra });
}
const items = async () => (await as('parent').get('/api/parents/learners/s1/progress')).body.assessments.items as { id: string; score: number | null; verified: boolean; waiting?: boolean; passed: boolean | null }[];
const byId = async () => new Map((await items()).map((i) => [i.id, i]));
const statusReason = async () => (await as('parent').get('/api/parents/learners/s1/status')).body.status.reason.code;
const level = async () => (await as('parent').get('/api/parents/learners/s1/home')).body.level.cefr;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'AI_PAUSED', 'GOOGLE_CLIENT_ID', 'PARENT_GRADES_AFTER_REVIEW_ENABLED', 'PARENT_CODE_TOOLS_ENABLED', 'PARENT_SETTINGS_ENABLED']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Student', 'AssessmentAttempt', 'StudentObjectiveMastery', 'AuditEvent']) M[name] = (await import(`../src/models/${name}`))[name];
  const hash = bcrypt.hashSync(PW, 4);
  for (const inst of ['p3-A', 'p3-B']) {
    await M.Institution.create({ id: inst, name: `School ${inst}` });
    await M.User.create({ email: `admin@${inst}.test`, password: hash, role: 'admin', name: `admin ${inst}`, status: 'active', institutionId: inst });
  }
  await M.User.create({ email: 'teacher@p3-A.test', password: hash, role: 'teacher', name: 'T', status: 'active', institutionId: 'p3-A' });
  await M.Student.create({ id: 's1', name: 'Omar Hassan', email: 's1@p3-A.test', institutionId: 'p3-A', learnerAgeBand: 'child' });
  // Every A1 form outcome mastered: the level is A1 until an A1 checkpoint is passed, then A2.
  for (const o of formOutcomes('A1')) await M.StudentObjectiveMastery.create({ studentId: 's1', objectiveId: o.id, masteryStatus: 'mastered', evidenceStrength: 'moderate', lastMasteryUpdateAt: new Date(), modelVersion: 't' });
  // A released quiz (80), an automatically released quiz (70), an older assessment with no grading
  // status (90), and two results the teacher has not released yet: a quiz at 30 (would read as a
  // score drop) and the A1 checkpoint at 95 (would raise the level).
  await attempt('att-released', 'Unit quiz 1', 80, 4, 'released', { releasedAt: new Date(), history: [{ at: new Date(), by: 'teacher', action: 'released' }] });
  await attempt('att-auto', 'Practice quiz', 70, 3, 'released', { releasedAt: new Date(), history: [{ at: new Date(), by: 'system:grader', action: 'released' }] });
  await attempt('att-nostatus', 'Old assessment', 90, 5);
  await attempt('att-held', 'Unit quiz 2', 30, 0.2, 'finalized');
  await attempt('att-checkpoint', 'A1 checkpoint test', 95, 2, 'finalized');
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  tok.adminA = await login('admin@p3-A.test');
  tok.adminB = await login('admin@p3-B.test');
  tok.teacher = await login('teacher@p3-A.test');
  const r = await request(app).post('/api/parents/register').send({ email: 'p@parents.test', password: PW, name: 'Parent' });
  tok.parent = `Bearer ${r.body.token}`;
  const code = (await as('adminA').post('/api/students/s1/parent-codes')).body.code;
  expect((await as('parent').post('/api/parents/link/confirm', { code })).status).toBe(201);
}, 120_000);

afterAll(async () => {
  off();
  await mongoose.disconnect();
  await mongo.stop();
});

describe('switch off: as before P3', () => {
  it('unreleased scores reach the parent (the gap P3 closes)', async () => {
    off();
    const m = await byId();
    expect(m.get('att-held')).toMatchObject({ score: 30, verified: true });
    expect(m.get('att-nostatus')).toMatchObject({ score: 90, verified: true }); // no status counted as verified
    expect(await statusReason()).toBe('score_drop');
    expect(await level()).toBe('A2'); // the unreleased checkpoint raised the level
  });
});

describe('after release (the default, D7)', () => {
  it('an unreleased result shows "waiting" with no score, on every path', async () => {
    on();
    const m = await byId();
    expect(m.get('att-held')).toEqual(expect.objectContaining({ score: null, passed: null, verified: false, waiting: true }));
    expect(m.get('att-checkpoint')).toEqual(expect.objectContaining({ score: null, waiting: true }));
    // No grading status: not released, so not shown (no longer counted as verified).
    expect(m.get('att-nostatus')).toEqual(expect.objectContaining({ score: null, verified: false, waiting: true }));
    expect(m.get('att-released')).toEqual(expect.objectContaining({ score: 80, verified: true }));
    expect(m.get('att-released')!.waiting).toBeUndefined();
    // Released automatically by the assignment = released (owner decision 3).
    expect(m.get('att-auto')).toEqual(expect.objectContaining({ score: 70, verified: true }));
    expect(await statusReason()).not.toBe('score_drop');
    expect(await level()).toBe('A1');
    const report = (await as('parent').get('/api/parents/learners/s1/report')).body.report;
    expect(report.level.cefr).toBe('A1');
    expect(JSON.stringify((await as('parent').get('/api/parents/learners/s1/progress')).body)).not.toMatch(/"score":(30|95|90)\b/);
  });

  it('after the teacher releases them, the scores, the drop and the level appear', async () => {
    await M.AssessmentAttempt.updateMany({ id: { $in: ['att-held', 'att-checkpoint'] } }, { $set: { gradingStatus: 'released', releasedAt: new Date() } });
    const m = await byId();
    expect(m.get('att-held')).toEqual(expect.objectContaining({ score: 30, verified: true }));
    expect(m.get('att-checkpoint')).toEqual(expect.objectContaining({ score: 95 }));
    expect(await statusReason()).toBe('score_drop');
    expect(await level()).toBe('A2');
    await M.AssessmentAttempt.updateMany({ id: { $in: ['att-held', 'att-checkpoint'] } }, { $set: { gradingStatus: 'finalized' }, $unset: { releasedAt: 1 } });
  });
});

describe('the school setting', () => {
  it('school admin (own school) or ENARA admin; values checked; audited; "immediately" shows every result', async () => {
    on();
    expect((await as('adminA').get('/api/parents-admin/schools/p3-A/settings')).body.showResults).toBe('after_release');
    expect((await as('adminA').put('/api/parents-admin/schools/p3-A/settings', { showResults: 'sometimes' })).status).toBe(400);
    expect((await as('adminB').put('/api/parents-admin/schools/p3-A/settings', { showResults: 'immediately' })).status).toBe(403);
    expect((await as('teacher').put('/api/parents-admin/schools/p3-A/settings', { showResults: 'immediately' })).status).toBe(403);
    // Code settings belong to P2's switch (off here).
    expect((await as('adminA').put('/api/parents-admin/schools/p3-A/settings', { codeTtlDays: 10 })).status).toBe(400);
    const r = await as('adminA').put('/api/parents-admin/schools/p3-A/settings', { showResults: 'immediately' });
    expect(r.status).toBe(200);
    expect(r.body.showResults).toBe('immediately');
    const a = await M.AuditEvent.findOne({ action: 'parent_settings_changed', targetId: 'p3-A' }).lean();
    expect(a.detail).toMatchObject({ before: { showResults: 'after_release' }, after: { showResults: 'immediately' } });
    expect((await as('adminA').get('/api/parents-admin/status')).body).toMatchObject({ settings: { showResults: 'immediately' }, canChangeSettings: true, settingsAvailable: { results: true, codes: false } });
    const m = await byId();
    expect(m.get('att-held')).toEqual(expect.objectContaining({ score: 30, verified: true }));
    expect(m.get('att-nostatus')).toEqual(expect.objectContaining({ score: 90, verified: false })); // shown, but not "checked"
    expect(await level()).toBe('A2');
    const back = await as('adminA').put('/api/parents-admin/schools/p3-A/settings', { showResults: 'after_release' });
    expect(back.body).toMatchObject({ showResults: 'after_release' });
    expect(await level()).toBe('A1');
  });

  it('with the switch off the setting cannot be changed (404)', async () => {
    off();
    expect((await as('adminA').put('/api/parents-admin/schools/p3-A/settings', { showResults: 'immediately' })).status).toBe(404);
  });
});
