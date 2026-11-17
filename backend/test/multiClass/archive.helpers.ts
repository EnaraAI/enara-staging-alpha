import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { expect } from 'vitest';
import { ctx, PW, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 6 archiving tests: the step 5 fixture (school A with every
// single-class shape, school B, the deleted group gDel), plus helpers to call
// the API, make data through the app (so the dual write runs) and check that
// old fields and enrollments still agree (backfill inSync + roster equality).

export { ctx, PW, setSwitches, stopFixture };

export const ALL_ON = { ENROLLMENT_DUAL_WRITE: 'true', ENROLLMENT_GROUP_ARCHIVE: 'true', ENROLLMENT_STUDENT_ARCHIVE: 'true' };
export const ALL_OFF = { ENROLLMENT_DUAL_WRITE: 'true', ENROLLMENT_GROUP_ARCHIVE: undefined, ENROLLMENT_STUDENT_ARCHIVE: undefined };

export async function startArchiveFixture() {
  for (const k of ['ENROLLMENT_GROUP_ARCHIVE', 'ENROLLMENT_STUDENT_ARCHIVE']) delete process.env[k];
  await startFixture();
  for (const n of ['ParentLearnerLink', 'AssessmentAttempt', 'UsageLedger', 'AuditEvent']) ctx.M[n] = (await import(`../../src/models/${n}`))[n];
  const hash = bcrypt.hashSync(PW, 4);
  await ctx.M.User.create({ email: 'enara@x.test', password: hash, role: 'enara-admin', name: 'Enara', status: 'active' });
  await ctx.M.User.create({ email: 'parent@a.test', password: hash, role: 'parent', name: 'Parent', status: 'active', institutionId: 'A' });
  for (const email of ['enara@x.test']) ctx.tokens[email] = `Bearer ${(await request(ctx.app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
}

export type Res = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function api(user: string, method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: unknown): Promise<Res> {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => {});
  let r = request(ctx.app)[method](path).set('Authorization', ctx.tokens[user]);
  if (body !== undefined) r = r.send(body as object);
  const res = await r;
  return { status: res.status, body: res.body };
}

export async function login(email: string): Promise<number> {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => {});
  const r = await request(ctx.app).post('/api/auth/login').send({ email, password: PW });
  if (r.status === 200) ctx.tokens[email] = `Bearer ${r.body.token}`;
  return r.status;
}

let n = 0;
export async function mkGroup(admin = 'admin@a.test', name = `Arch group ${++n}`): Promise<string> {
  const r = await api(admin, 'post', '/api/batches', { name, academicYear: '2026' });
  expect(r.status).toBe(201);
  return r.body.id;
}

/** A student made through the API (dual write runs), with a login. */
export async function mkStudent(opts: { batchId?: string; admin?: string; login?: boolean } = {}): Promise<{ id: string; email: string }> {
  const k = ++n;
  const email = `arch${k}@t.test`;
  const r = await api(opts.admin ?? 'admin@a.test', 'post', '/api/students', { name: `Arch Student ${k}`, email, grade: '7', ...(opts.batchId ? { batchId: opts.batchId } : {}) });
  expect(r.status).toBe(201);
  if (opts.login !== false) {
    await ctx.M.User.create({ email, password: bcrypt.hashSync(PW, 4), role: 'student', name: `Arch Student ${k}`, status: 'active', institutionId: r.body.institutionId, studentId: r.body.id });
    expect(await login(email)).toBe(200);
  }
  return { id: r.body.id, email };
}

export async function mkClass(batchId: string, admin = 'admin@a.test'): Promise<string> {
  const r = await api(admin, 'post', '/api/course-instances', { courseId: `arch-${++n}`, courseName: `Arch class ${n}`, academicYear: '2026', batchId, visibility: 'student' });
  expect(r.status).toBe(201);
  return r.body.id;
}

/** Old fields and class_enrollments agree: backfill dry run in sync, every roster equal. */
export async function expectConsistent(institutionId = 'A') {
  const { planBackfill } = await import('../../src/services/enrollmentBackfill');
  const report = await planBackfill({ institutionId });
  expect({ inSync: report.inSync, wouldCreate: report.wouldCreate, wouldReactivate: report.wouldReactivate.items, conflicts: report.conflicts.activeNotInOldFields.items }).toEqual({ inSync: true, wouldCreate: { group: 0, class: 0 }, wouldReactivate: [], conflicts: [] });
  const { classStudentIds } = await import('../../src/services/learningAccess');
  const { studentIdsInClass } = await import('../../src/services/enrollment');
  const existing = new Set((await ctx.M.Student.find({ institutionId }).select('id').lean()).map((s: { id: string }) => s.id));
  for (const c of await ctx.M.CourseInstance.find({ institutionId }).lean()) {
    const old = (await classStudentIds(c)).filter((id: string) => existing.has(id)).sort();
    const fresh = (await studentIdsInClass(c)).filter((id: string) => existing.has(id)).sort();
    expect({ classId: c.id, ids: fresh }).toEqual({ classId: c.id, ids: old });
  }
  return report;
}

export const enrollmentRows = (studentId: string) => ctx.M.ClassEnrollment.find({ studentId }).select('scope targetId status endedAt').lean();
