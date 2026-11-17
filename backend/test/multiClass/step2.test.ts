import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Multi-class step 2 (docs/multi-class/PLAN.md): "write both". With
// ENROLLMENT_DUAL_WRITE off nothing new is written and every response is as
// before; with it on, class_enrollments always agrees with Student.batchId and
// CourseInstance.studentIds, and an enrollment failure never breaks a request.

const PW = 'Passw0rd!x';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../../src/app')['createApp']>;
let M: Record<string, any>;
let admin: string;
let resetConfig: () => void;

function setDualWrite(on: boolean) {
  if (on) process.env.ENROLLMENT_DUAL_WRITE = 'true';
  else delete process.env.ENROLLMENT_DUAL_WRITE;
  resetConfig();
}

// The old fields, as a set of "scope:target" per student, for comparison.
async function legacyMemberships(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const s of await M.Student.find({ institutionId: 'mc-A' }).lean()) out[s.id] = s.batchId ? [`group:${s.batchId}`] : [];
  for (const c of await M.CourseInstance.find({ institutionId: 'mc-A' }).lean()) for (const id of c.studentIds) (out[id] ??= []).push(`class:${c.id}`);
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}
async function enrollmentMemberships(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const s of await M.Student.find({ institutionId: 'mc-A' }).lean()) out[s.id] = [];
  for (const e of await M.ClassEnrollment.find({ institutionId: 'mc-A', status: 'active' }).lean()) if (out[e.studentId]) out[e.studentId].push(`${e.scope}:${e.targetId}`);
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ENROLLMENT_DUAL_WRITE']) delete process.env[k];
  resetConfig = (await import('../../src/config/env')).resetConfigForTests;
  resetConfig();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Student', 'Batch', 'CourseInstance', 'ClassEnrollment']) M[name] = (await import(`../../src/models/${name}`))[name];
  await M.ClassEnrollment.createIndexes();
  await M.Institution.create({ id: 'mc-A', name: 'School A', features: {} });
  await M.User.create({ email: 'admin@mc-a.test', password: bcrypt.hashSync(PW, 4), role: 'admin', name: 'Admin A', status: 'active', institutionId: 'mc-A' });
  app = (await import('../../src/app')).createApp();
  admin = `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'admin@mc-a.test', password: PW })).body.token}`;
});
afterAll(async () => {
  delete process.env.ENROLLMENT_DUAL_WRITE;
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => {});
  for (const n of ['Student', 'Batch', 'CourseInstance', 'ClassEnrollment']) await M[n].deleteMany({});
  for (const g of ['g1', 'g2']) await M.Batch.create({ id: g, name: `Group ${g}`, institutionId: 'mc-A', academicYear: '2026' });
  await M.CourseInstance.create({ id: 'c1', courseId: 'eng', courseName: 'English', academicYear: '2026', institutionId: 'mc-A', batchId: 'g1' });
  await M.CourseInstance.create({ id: 'c2', courseId: 'math', courseName: 'Maths', academicYear: '2026', institutionId: 'mc-A', batchId: 'g2' });
});

const api = () => request(app);
const createStudent = (email: string, batchId?: string) =>
  api().post('/api/students').set('Authorization', admin).send({ name: email.split('@')[0], email, grade: '7', ...(batchId ? { batchId } : {}) });

// Runs the same sequence of admin actions; returns every response body that matters.
async function scenario() {
  const out: unknown[] = [];
  const a = await createStudent('ali@mc-a.test', 'g1');
  const b = await createStudent('bea@mc-a.test');
  const c = await createStudent('cem@mc-a.test', 'g2');
  out.push(a.status, b.status, c.status);
  out.push((await api().patch(`/api/students/${a.body.id}`).set('Authorization', admin).send({ batchId: 'g2' })).status); // move group
  out.push((await api().patch(`/api/students/${c.body.id}`).set('Authorization', admin).send({ batchId: '' })).status); // leave group
  out.push((await api().post('/api/course-instances/c1/students').set('Authorization', admin).send({ studentId: b.body.id })).status);
  out.push((await api().post('/api/course-instances/c1/students').set('Authorization', admin).send({ studentId: b.body.id })).status); // duplicate: 400 as before
  out.push((await api().post('/api/course-instances/c2/students').set('Authorization', admin).send({ studentId: a.body.id })).status);
  out.push((await api().delete(`/api/course-instances/c2/students/${a.body.id}`).set('Authorization', admin)).status);
  out.push((await api().delete(`/api/course-instances/c2/students/not-a-member`).set('Authorization', admin)).status);
  out.push((await api().get('/api/course-instances/c1/students').set('Authorization', admin)).body.map((s: { email: string }) => s.email));
  const listed = (await api().get('/api/students').set('Authorization', admin)).body;
  out.push((Array.isArray(listed) ? listed : listed.students ?? listed.data ?? []).map((s: { email: string; batchId?: string }) => `${s.email}:${s.batchId ?? ''}`).sort());
  return { out, ids: { a: a.body.id as string, b: b.body.id as string, c: c.body.id as string } };
}

describe('switch off (default)', () => {
  it('writes no enrollment rows', async () => {
    setDualWrite(false);
    await scenario();
    expect(await M.ClassEnrollment.countDocuments()).toBe(0);
  });
});

describe('switch on', () => {
  it('responses are identical to switch-off', async () => {
    setDualWrite(false);
    const off = (await scenario()).out;
    await M.Student.deleteMany({});
    await M.CourseInstance.updateMany({}, { $set: { studentIds: [] } });
    setDualWrite(true);
    const on = (await scenario()).out;
    setDualWrite(false);
    expect(on).toEqual(off);
  });

  it('enrollments always agree with Student.batchId and CourseInstance.studentIds', async () => {
    setDualWrite(true);
    const { ids } = await scenario();
    expect(await enrollmentMemberships()).toEqual(await legacyMemberships());
    // History: the old group of the moved student and the removed class are kept, not active.
    const moved = await M.ClassEnrollment.find({ studentId: ids.a }).lean();
    expect(moved.find((e: any) => e.targetId === 'g1')).toMatchObject({ status: 'removed' });
    expect(moved.find((e: any) => e.targetId === 'c2')).toMatchObject({ status: 'removed' });
    expect(moved.every((e: any) => e.source === 'manual' && e.institutionId === 'mc-A')).toBe(true);
    setDualWrite(false);
  });

  it('deleting a student or a class ends its memberships and keeps them as history', async () => {
    setDualWrite(true);
    const { ids } = await scenario();
    expect((await api().delete(`/api/students/${ids.b}`).set('Authorization', admin)).status).toBe(200);
    expect(await M.ClassEnrollment.countDocuments({ studentId: ids.b, status: 'active' })).toBe(0);
    expect(await M.ClassEnrollment.countDocuments({ studentId: ids.b, status: 'removed' })).toBe(1);
    await createStudent('dan@mc-a.test', 'g1');
    const dan = await M.Student.findOne({ email: 'dan@mc-a.test' }).lean();
    await api().post('/api/course-instances/c2/students').set('Authorization', admin).send({ studentId: dan.id });
    expect((await api().delete('/api/course-instances/c2').set('Authorization', admin)).status).toBe(200);
    expect(await M.ClassEnrollment.countDocuments({ scope: 'class', targetId: 'c2', status: 'active' })).toBe(0);
    expect(await M.ClassEnrollment.countDocuments({ studentId: dan.id, scope: 'group', targetId: 'g1', status: 'active' })).toBe(1); // group untouched
    setDualWrite(false);
  });

  it('an enrollment failure never breaks the request (old write still succeeds, failure logged with IDs only)', async () => {
    setDualWrite(true);
    const { logger } = await import('../../src/utils/logging');
    const warn = vi.spyOn(logger, 'warn');
    const boom = vi.spyOn(M.ClassEnrollment, 'create').mockRejectedValueOnce(Object.assign(new Error('write refused'), { code: 'BOOM' }));
    const r = await createStudent('eve@mc-a.test', 'g1');
    expect(r.status).toBe(201);
    expect((await M.Student.findOne({ email: 'eve@mc-a.test' }).lean()).batchId).toBe('g1');
    expect(await M.ClassEnrollment.countDocuments({ studentId: r.body.id })).toBe(0);
    const call = warn.mock.calls.find((c) => c[0] === 'enrollment_dual_write_failed');
    expect(call?.[1]).toMatchObject({ op: 'student_group', studentId: r.body.id, toGroupId: 'g1' });
    expect(JSON.stringify(call?.[1])).not.toContain('eve@');
    boom.mockRestore();
    warn.mockRestore();
    setDualWrite(false);
  });

  it('the demo template mirrors its group and class, and re-running it adds nothing', async () => {
    setDualWrite(true);
    const { buildDemoTemplate } = await import('../../src/services/demoTemplate');
    const t = await buildDemoTemplate();
    const n = await M.ClassEnrollment.countDocuments({ institutionId: t.institutionId, status: 'active' });
    expect(n).toBe(t.students * 2); // one group + one class row per student
    await buildDemoTemplate();
    expect(await M.ClassEnrollment.countDocuments({ institutionId: t.institutionId })).toBe(n);
    setDualWrite(false);
  });
});

describe('decision A: deleting a student leaves no dangling class IDs', () => {
  it('removes the student from every class list and ends their enrollments; old and new agree', async () => {
    setDualWrite(true);
    const s = await createStudent('del@mc-a.test', 'g1');
    await api().post('/api/course-instances/c2/students').set('Authorization', admin).send({ studentId: s.body.id });
    await api().post('/api/course-instances/c1/students').set('Authorization', admin).send({ studentId: s.body.id });
    expect((await api().delete(`/api/students/${s.body.id}`).set('Authorization', admin)).status).toBe(200);
    for (const c of await M.CourseInstance.find().lean()) expect(c.studentIds).not.toContain(s.body.id);
    expect(await M.ClassEnrollment.countDocuments({ studentId: s.body.id, status: 'active' })).toBe(0);
    expect(await M.ClassEnrollment.countDocuments({ studentId: s.body.id })).toBeGreaterThan(0); // history kept
    expect(await enrollmentMemberships()).toEqual(await legacyMemberships());
    setDualWrite(false);
  });

  it('the cleanup finds and removes dangling IDs left by older deletes, and nothing else', async () => {
    const { planDanglingClassMembers, cleanDanglingClassMembers } = await import('../../src/services/danglingClassMembers');
    const s = await createStudent('keep@mc-a.test');
    await M.CourseInstance.updateOne({ id: 'c1' }, { $set: { studentIds: [s.body.id, 'ghost1', 'ghost2'] } });
    const plan = await planDanglingClassMembers({ institutionId: 'mc-A' });
    expect(plan.dangling).toBe(2);
    expect(plan.items).toEqual([{ classId: 'c1', studentId: 'ghost1' }, { classId: 'c1', studentId: 'ghost2' }]);
    const r = await cleanDanglingClassMembers({ institutionId: 'mc-A' });
    expect(r.removed).toBe(2);
    expect((await M.CourseInstance.findOne({ id: 'c1' }).lean()).studentIds).toEqual([s.body.id]);
    expect((await planDanglingClassMembers({ institutionId: 'mc-A' })).dangling).toBe(0);
  });
});
