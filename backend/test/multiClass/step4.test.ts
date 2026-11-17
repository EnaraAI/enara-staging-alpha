import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Multi-class step 4 (docs/multi-class/STEP_4_NOTES.md): shadow reads. With
// ENROLLMENT_SHADOW on, the four places that apply the membership rule also
// compute the answer from class_enrollments, return the OLD answer, and count
// mismatches (IDs only in logs, counts only in enrollment_shadow_stats).

let mongo: MongoMemoryServer;
let M: Record<string, any>;
let env: typeof import('../../src/config/env');
let access: typeof import('../../src/services/learningAccess');
let courses: typeof import('../../src/services/studentCourseService');
let analytics: typeof import('../../src/services/analyticsService');
let pedagogy: typeof import('../../src/controllers/learningPedagogy.controller');
let backfill: typeof import('../../src/services/enrollmentBackfill');
let logging: typeof import('../../src/utils/logging');
let shadow: typeof import('../../src/services/enrollmentShadow');

function setShadow(on: boolean, rate?: string) {
  process.env.ENROLLMENT_SHADOW = on ? 'true' : 'false';
  if (rate === undefined) delete process.env.ENROLLMENT_SHADOW_SAMPLE_RATE;
  else process.env.ENROLLMENT_SHADOW_SAMPLE_RATE = rate;
  env.resetConfigForTests();
}

async function stats() {
  await shadow.flushShadowCounts();
  const rows = await M.EnrollmentShadowStat.find().lean();
  const out: Record<string, { checks: number; mismatches: number; errors: number }> = {};
  for (const r of rows) {
    const o = (out[r.feature] ??= { checks: 0, mismatches: 0, errors: 0 });
    o.checks += r.checks; o.mismatches += r.mismatches; o.errors += r.errors;
  }
  return out;
}

async function callPedagogy(courseId: string) {
  return new Promise<any>((resolve, reject) => {
    const req: any = { user: { id: 'adminA', role: 'school_admin', institutionId: 'A' }, query: { courseId } };
    const res: any = { json: (b: unknown) => resolve(b), status: () => res };
    pedagogy.getTtuAnalytics(req, res, (e?: unknown) => (e ? reject(e) : resolve(undefined)));
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum',
    INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  });
  env = await import('../../src/config/env');
  env.resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const n of ['Student', 'Batch', 'CourseInstance', 'ClassEnrollment', 'EnrollmentShadowStat']) M[n] = (await import(`../../src/models/${n}`))[n];
  access = await import('../../src/services/learningAccess');
  courses = await import('../../src/services/studentCourseService');
  analytics = await import('../../src/services/analyticsService');
  pedagogy = await import('../../src/controllers/learningPedagogy.controller');
  backfill = await import('../../src/services/enrollmentBackfill');
  logging = await import('../../src/utils/logging');
  shadow = await import('../../src/services/enrollmentShadow');
});
afterAll(async () => {
  setShadow(false);
  await mongoose.disconnect();
  await mongo.stop();
});

// One school with every single-class shape, plus a second school for isolation.
beforeEach(async () => {
  setShadow(false);
  vi.restoreAllMocks();
  await shadow.flushShadowCounts();
  for (const n of Object.keys(M)) await M[n].deleteMany({});
  await M.ClassEnrollment.createIndexes();
  const g = (id: string, school: string) => M.Batch.create({ id, name: `Group ${id}`, institutionId: school, academicYear: '2026' });
  const c = (id: string, school: string, batchId: string, studentIds: string[]) =>
    M.CourseInstance.create({ id, courseId: id, courseName: id, academicYear: '2026', institutionId: school, batchId, studentIds, visibility: 'student' });
  const s = (id: string, school: string, batchId?: string) =>
    M.Student.create({ id, name: `Student ${id}`, email: `${id}@fake.test`, institutionId: school, ...(batchId ? { batchId } : {}) });
  await g('gA', 'A'); await g('gA2', 'A'); await g('gB', 'B');
  await s('a1', 'A', 'gA');  // group only
  await s('a2', 'A');        // class only
  await s('a3', 'A', 'gA2'); // group + explicit class
  await s('a4', 'A');        // nothing
  await s('b1', 'B', 'gB');
  await c('cA', 'A', 'gA', ['a2', 'a3']);
  await c('cA2', 'A', 'gA2', []);
  await c('cB', 'B', 'gB', []);
  // In sync: the backfill writes exactly what the old fields say.
  await backfill.applyBackfill();
});

describe('shadow off (the default)', () => {
  it('returns the same answers and records nothing', async () => {
    expect((await access.classStudentIds({ id: 'cA', batchId: 'gA', institutionId: 'A', studentIds: ['a2', 'a3'] })).sort()).toEqual(['a1', 'a2', 'a3']);
    expect((await courses.getEnrolledInstances('a3')).map((i: any) => i.id).sort()).toEqual(['cA', 'cA2']);
    await analytics.buildOverview({ institutionId: 'A' });
    await callPedagogy('cA');
    expect(await M.EnrollmentShadowStat.countDocuments()).toBe(0);
  });
});

describe('cost', () => {
  it('a clean check adds only the enrollment read; counts are written in batches', async () => {
    setShadow(true);
    const upd = vi.spyOn(M.EnrollmentShadowStat, 'updateOne');
    for (let i = 0; i < 5; i++) await courses.getEnrolledInstances('a1');
    expect(upd).not.toHaveBeenCalled();
    expect((await stats()).student_classes).toEqual({ checks: 5, mismatches: 0, errors: 0 });
  });
});

describe('shadow on, data in sync', () => {
  it('returns the old answer and counts a check with no mismatch for all four features', async () => {
    setShadow(true);
    expect((await access.classStudentIds({ id: 'cA', batchId: 'gA', institutionId: 'A', studentIds: ['a2', 'a3'] })).sort()).toEqual(['a1', 'a2', 'a3']);
    for (const sid of ['a1', 'a2', 'a3', 'a4']) await courses.getEnrolledInstances(sid);
    await analytics.buildOverview({ institutionId: 'A' });
    await callPedagogy('cA');
    const st = await stats();
    expect(st.class_roster).toEqual({ checks: 1, mismatches: 0, errors: 0 });
    expect(st.student_classes).toEqual({ checks: 4, mismatches: 0, errors: 0 });
    expect(st.analytics_course).toEqual({ checks: 1, mismatches: 0, errors: 0 });
    expect(st.pedagogy_roster).toEqual({ checks: 1, mismatches: 0, errors: 0 });
  });

  it('gives identical results with the shadow on and off', async () => {
    const run = async () => ({
      roster: (await access.classStudentIds({ id: 'cA', batchId: 'gA', institutionId: 'A', studentIds: ['a2', 'a3'] })).sort(),
      classes: await Promise.all(['a1', 'a2', 'a3', 'a4'].map(async (s) => (await courses.getEnrolledInstances(s)).map((i: any) => i.id).sort())),
      overview: JSON.stringify(await analytics.buildOverview({ institutionId: 'A' }, new Date('2026-11-17T10:00:00Z'))),
    });
    const off = await run();
    setShadow(true);
    expect(await run()).toEqual(off);
  });
});

describe('shadow on, data out of sync', () => {
  it('still returns the old answer, counts the mismatch and logs IDs only', async () => {
    // Old field gains a member that class_enrollments doesn't have (e.g. dual write was off).
    await M.CourseInstance.updateOne({ id: 'cA' }, { $push: { studentIds: 'a4' } });
    // And an enrollment exists that the old fields don't have.
    await M.ClassEnrollment.create({ id: 'enr_x', institutionId: 'A', studentId: 'a1', scope: 'class', targetId: 'cA2', status: 'active', source: 'manual', startedAt: new Date() });
    setShadow(true);
    const warn = vi.spyOn(logging.logger, 'warn');
    const cls = (await M.CourseInstance.findOne({ id: 'cA' }).lean())!;
    expect((await access.classStudentIds(cls)).sort()).toEqual(['a1', 'a2', 'a3', 'a4']); // old answer
    expect((await courses.getEnrolledInstances('a1')).map((i: any) => i.id).sort()).toEqual(['cA']); // old answer
    const st = await stats();
    expect(st.class_roster).toEqual({ checks: 1, mismatches: 1, errors: 0 });
    expect(st.student_classes).toEqual({ checks: 1, mismatches: 1, errors: 0 });
    const logged = warn.mock.calls.filter((c) => c[0] === 'enrollment_shadow_mismatch').map((c) => c[1]);
    expect(logged).toContainEqual(expect.objectContaining({ feature: 'class_roster', classId: 'cA', onlyOld: ['a4'], onlyNew: [] }));
    expect(logged).toContainEqual(expect.objectContaining({ feature: 'student_classes', studentId: 'a1', onlyOld: [], onlyNew: ['cA2'] }));
    // IDs only: no names or emails anywhere in what was logged.
    expect(JSON.stringify(logged)).not.toMatch(/Student a|@fake\.test/);
  });

  it('analytics and pedagogy report the same drift as pairs and rosters', async () => {
    await M.CourseInstance.updateOne({ id: 'cA' }, { $push: { studentIds: 'a4' } });
    setShadow(true);
    const warn = vi.spyOn(logging.logger, 'warn');
    await analytics.buildOverview({ institutionId: 'A' });
    await callPedagogy('cA');
    const logged = warn.mock.calls.filter((c) => c[0] === 'enrollment_shadow_mismatch').map((c) => c[1]);
    expect(logged).toContainEqual(expect.objectContaining({ feature: 'analytics_course', onlyOld: ['cA:a4'] }));
    expect(logged).toContainEqual(expect.objectContaining({ feature: 'pedagogy_roster', onlyOld: ['a4'] }));
  });
});

describe('safety', () => {
  it('an error in the enrollment read never changes the answer; it is counted', async () => {
    setShadow(true);
    vi.spyOn(M.ClassEnrollment, 'find').mockImplementation(() => { throw new Error('db down'); });
    expect((await access.classStudentIds({ id: 'cA', batchId: 'gA', institutionId: 'A', studentIds: ['a2', 'a3'] })).sort()).toEqual(['a1', 'a2', 'a3']);
    expect((await stats()).class_roster).toEqual({ checks: 1, mismatches: 0, errors: 1 });
  });

  it('sample rate 0 checks nothing', async () => {
    setShadow(true, '0');
    await access.classStudentIds({ id: 'cA', batchId: 'gA', institutionId: 'A', studentIds: ['a2', 'a3'] });
    await courses.getEnrolledInstances('a1');
    expect(await M.EnrollmentShadowStat.countDocuments()).toBe(0);
  });

  it('a class without an id (old callers) is not shadow-checked', async () => {
    setShadow(true);
    await access.classStudentIds({ batchId: 'gA', institutionId: 'A', studentIds: ['a2'] });
    expect(await M.EnrollmentShadowStat.countDocuments()).toBe(0);
  });

  it('school isolation: a school-B enrollment never shows up in school A answers', async () => {
    await M.ClassEnrollment.create({ id: 'enr_y', institutionId: 'B', studentId: 'b1', scope: 'class', targetId: 'cA', status: 'active', source: 'manual', startedAt: new Date() });
    setShadow(true);
    await access.classStudentIds({ id: 'cA', batchId: 'gA', institutionId: 'A', studentIds: ['a2', 'a3'] });
    expect((await stats()).class_roster).toEqual({ checks: 1, mismatches: 0, errors: 0 });
  });
});
