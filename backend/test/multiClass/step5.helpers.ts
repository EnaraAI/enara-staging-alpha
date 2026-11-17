import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Shared fixture for the multi-class step 5 same-answer tests. One school with
// every single-class shape, a second school for isolation, users for students,
// a teacher and admins, assessments for a group and for one student. The
// backfill fills class_enrollments, so the old fields and enrollments agree.

export const PW = 'Passw0rd!x';
export const ctx: {
  mongo?: MongoMemoryServer;
  app?: any;
  M: Record<string, any>;
  tokens: Record<string, string>;
  resetConfig?: () => void;
} = { M: {}, tokens: {} };

const MODELS = ['User', 'Institution', 'Student', 'Batch', 'CourseInstance', 'ClassEnrollment', 'Assessment', 'Curriculum'];

export function setSwitches(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  ctx.resetConfig?.();
}

export async function startFixture() {
  ctx.mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: ctx.mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ENROLLMENT_DUAL_WRITE', 'ENROLLMENT_READ_FROM', 'ENROLLMENT_SHADOW']) delete process.env[k];
  ctx.resetConfig = (await import('../../src/config/env')).resetConfigForTests;
  ctx.resetConfig();
  await mongoose.connect(ctx.mongo.getUri());
  for (const n of MODELS) ctx.M[n] = (await import(`../../src/models/${n}`))[n];
  await ctx.M.ClassEnrollment.createIndexes();
  await seed();
  ctx.app = (await import('../../src/app')).createApp();
  for (const u of await ctx.M.User.find().lean()) {
    const r = await request(ctx.app).post('/api/auth/login').send({ email: u.email, password: PW });
    ctx.tokens[u.email] = `Bearer ${r.body.token}`;
  }
}

export async function stopFixture() {
  await mongoose.disconnect();
  await ctx.mongo?.stop();
}

async function seed() {
  const { M } = ctx;
  const hash = bcrypt.hashSync(PW, 4);
  const all = { ai_tutor_enabled: true, learning_intelligence_enabled: true, teaching_engine_enabled: true };
  await M.Institution.create({ id: 'A', name: 'School A', features: all });
  await M.Institution.create({ id: 'B', name: 'School B', features: all });
  const g = (id: string, school: string) => M.Batch.create({ id, name: `Group ${id}`, institutionId: school, academicYear: '2026' });
  await g('gA', 'A'); await g('gA2', 'A'); await g('gB', 'B');
  const c = (id: string, school: string, batchId: string, studentIds: string[], createdAt: string) =>
    M.CourseInstance.create({ id, courseId: id, courseName: `Course ${id}`, academicYear: '2026', institutionId: school, batchId, studentIds, visibility: 'student', instructorIds: [], createdAt: new Date(createdAt) });
  await c('cA', 'A', 'gA', ['a2', 'a3'], '2026-09-01');
  await c('cA2', 'A', 'gA2', [], '2026-09-02');
  await c('cA3', 'A', 'gNone', ['a2'], '2026-09-03'); // a class whose group doesn't exist
  await c('cB', 'B', 'gB', [], '2026-09-04');
  const s = (id: string, school: string, batchId?: string) =>
    M.Student.create({ id, name: `Student ${id}`, email: `${id}@t.test`, grade: '7', institutionId: school, ...(batchId ? { batchId } : {}) });
  await s('a1', 'A', 'gA');  // group only
  await s('a2', 'A');        // classes only
  await s('a3', 'A', 'gA2'); // group + explicit class
  await s('a4', 'A');        // nothing
  await s('b1', 'B', 'gB');
  for (const id of ['a1', 'a2', 'a3', 'a4', 'b1']) {
    await M.User.create({ email: `${id}@t.test`, password: hash, role: 'student', name: `Student ${id}`, status: 'active', institutionId: id === 'b1' ? 'B' : 'A', studentId: id });
  }
  await M.User.create({ email: 'admin@a.test', password: hash, role: 'admin', name: 'Admin A', status: 'active', institutionId: 'A' });
  await M.User.create({ email: 'admin@b.test', password: hash, role: 'admin', name: 'Admin B', status: 'active', institutionId: 'B' });
  const t = await M.User.create({ email: 'teacher@a.test', password: hash, role: 'teacher', name: 'Teacher A', status: 'active', institutionId: 'A' });
  await M.CourseInstance.updateMany({ id: { $in: ['cA', 'cA2'] } }, { $set: { instructorIds: [t._id.toString()] } });
  const a = (id: string, school: string, extra: Record<string, unknown>) =>
    M.Assessment.create({ id, title: `Assessment ${id}`, subject: 'English', type: 'quiz', status: 'active', lifecycle: 'published', dueDate: '2026-12-01', institutionId: school, questions: [], ...extra });
  await a('asG', 'A', { batchId: 'gA' });
  await a('asG2', 'A', { batchId: 'gA2' });
  await a('asS', 'A', { studentId: 'a2' });
  await a('asB', 'B', { batchId: 'gB' });
  const { applyBackfill } = await import('../../src/services/enrollmentBackfill');
  await applyBackfill();
}

export async function get(user: string, path: string) {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => {});
  const r = await request(ctx.app).get(path).set('Authorization', ctx.tokens[user]);
  return { status: r.status, body: r.body };
}

/**
 * Runs `paths` for each user with the feature off and then on, and returns both.
 * Nothing is ignored: callers compare the raw JSON. If a comparison ever needs
 * to ignore something, it must be named in the step 5 report.
 */
export async function offOn(feature: string, calls: [string, string][]) {
  setSwitches({ ENROLLMENT_READ_FROM: undefined });
  const off = [];
  for (const [u, p] of calls) { const r = await get(u, p); off.push({ u, p, status: r.status, body: normalise(r.body) }); }
  setSwitches({ ENROLLMENT_READ_FROM: feature });
  const on = [];
  for (const [u, p] of calls) { const r = await get(u, p); on.push({ u, p, status: r.status, body: normalise(r.body) }); }
  setSwitches({ ENROLLMENT_READ_FROM: undefined });
  return { off, on };
}

/**
 * The ONLY things a same-answer comparison may ignore, each with its reason.
 * Every use is recorded in `ignoredSeen` and listed in the step 5 report.
 */
export const IGNORED_KEYS: Record<string, string> = {
  requestId: 'a random ID generated for every request (error replies); it differs between any two calls, switch on or off',
};
export const ignoredSeen = new Set<string>();

export function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k in IGNORED_KEYS) { ignoredSeen.add(k); out[k] = `<ignored:${k}>`; } else out[k] = normalise(x);
    }
    return out;
  }
  return v;
}
