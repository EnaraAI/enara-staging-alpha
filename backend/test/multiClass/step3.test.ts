import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Multi-class step 3 (docs/multi-class/STEP_3_NOTES.md): backfill from the old
// fields. Dry run writes nothing and reports counts, records that don't fit and
// conflicts (IDs only). Apply is idempotent; undo removes exactly what it made.

let mongo: MongoMemoryServer;
let M: Record<string, any>;
let B: typeof import('../../src/services/enrollmentBackfill');

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum',
    INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  });
  (await import('../../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const n of ['Student', 'Batch', 'CourseInstance', 'ClassEnrollment']) M[n] = (await import(`../../src/models/${n}`))[n];
  B = await import('../../src/services/enrollmentBackfill');
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

// Fake data covering every case the real data could have.
beforeEach(async () => {
  for (const n of Object.keys(M)) await M[n].deleteMany({});
  await M.ClassEnrollment.createIndexes();
  const g = (id: string, school: string) => M.Batch.create({ id, name: `Group ${id}`, institutionId: school, academicYear: '2026' });
  const c = (id: string, school: string | undefined, batchId: string, studentIds: string[]) =>
    M.CourseInstance.create({ id, courseId: id, courseName: id, academicYear: '2026', ...(school ? { institutionId: school } : {}), batchId, studentIds });
  const s = (id: string, school: string | undefined, batchId?: string) =>
    M.Student.create({ id, name: `Student ${id}`, email: `${id}@fake.test`, ...(school ? { institutionId: school } : {}), ...(batchId ? { batchId } : {}) });
  await g('gA', 'A'); await g('gA2', 'A'); await g('gB', 'B');
  await s('a1', 'A', 'gA');          // group only
  await s('a2', 'A');                // class only (below)
  await s('a3', 'A', 'gA2');         // group + class
  await s('a4', 'A');                // nothing
  await s('nos', undefined, 'gA');   // no school -> doesn't fit
  await s('gone', 'A', 'gDeleted');  // group missing -> doesn't fit
  await s('cross', 'A', 'gB');       // group in another school -> doesn't fit
  await s('b1', 'B', 'gB');
  await c('cA', 'A', 'gA', ['a2', 'a3', 'a2', 'ghost', 'b1']); // duplicate, missing student, other-school student
  await c('cNoSchool', undefined, 'gA', ['a1']);
  await c('cB', 'B', 'gB', []);
});

describe('dry run', () => {
  it('writes nothing and reports exactly what would change', async () => {
    const r = await B.planBackfill();
    expect(await M.ClassEnrollment.countDocuments()).toBe(0);
    expect(r.totals).toMatchObject({ students: 8, studentsWithGroup: 6, classes: 3, classMemberEntries: 6 });
    expect(r.wouldCreate).toEqual({ group: 3, class: 2 }); // a1,a3,b1 groups; a2,a3 in cA
    expect(r.doesNotFit.studentWithoutSchool.items).toEqual([{ studentId: 'nos', groupId: 'gA' }]);
    expect(r.doesNotFit.groupMissing.items).toEqual([{ studentId: 'gone', groupId: 'gDeleted' }]);
    expect(r.doesNotFit.groupInOtherSchool.items).toEqual([{ studentId: 'cross', groupId: 'gB' }]);
    expect(r.doesNotFit.classWithoutSchool.items).toEqual([{ classId: 'cNoSchool', members: 1 }]);
    expect(r.doesNotFit.classMemberMissing.items).toEqual([{ classId: 'cA', studentId: 'ghost' }]);
    expect(r.doesNotFit.classMemberInOtherSchool.items).toEqual([{ classId: 'cA', studentId: 'b1' }]);
    expect(r.doesNotFit.duplicateClassMember.items).toEqual([{ classId: 'cA', studentId: 'a2' }]);
    expect(r.inSync).toBe(false);
  });

  it('the report carries IDs and counts only, never names or emails', async () => {
    const text = JSON.stringify(await B.planBackfill());
    expect(text).not.toMatch(/Student a1|@fake\.test|Group gA/);
  });

  it('can be limited to one school', async () => {
    const r = await B.planBackfill({ institutionId: 'B' });
    expect(r.wouldCreate).toEqual({ group: 1, class: 0 });
    expect(r.totals.students).toBe(1);
  });
});

describe('apply and undo', () => {
  it('creates the planned rows; a second run creates nothing; then everything is in sync', async () => {
    const first = await B.applyBackfill();
    expect(first.created).toBe(5);
    const rows = await M.ClassEnrollment.find().lean();
    expect(rows.every((r: any) => r.status === 'active' && r.source === 'manual' && r.migratedFrom && r.id?.startsWith('enr_') && r.createdAt instanceof Date && r.startedAt instanceof Date)).toBe(true);
    expect((await B.applyBackfill()).created).toBe(0);
    const after = await B.planBackfill();
    expect(after.inSync).toBe(true);
    expect(after.alreadyMatching).toEqual({ group: 3, class: 2 });
  });

  it('the result matches the membership rule the app uses today', async () => {
    await B.applyBackfill();
    const { studentIdsInClass } = await import('../../src/services/enrollment');
    const { classStudentIds } = await import('../../src/services/learningAccess');
    const cA = await M.CourseInstance.findOne({ id: 'cA' }).lean();
    const legacy = (await classStudentIds(cA)).filter((id: string) => ['a2', 'a3', 'a1'].includes(id)).sort(); // real, same-school students
    expect((await studentIdsInClass(cA)).sort()).toEqual(legacy);
  });

  it('reactivates rows the old fields say are active, and never touches extra active rows (reported as conflicts)', async () => {
    await M.ClassEnrollment.create({ institutionId: 'A', studentId: 'a1', scope: 'group', targetId: 'gA', source: 'manual', status: 'removed', endedAt: new Date() });
    await M.ClassEnrollment.create({ institutionId: 'A', studentId: 'a4', scope: 'group', targetId: 'gA2', source: 'manual', status: 'active' });
    const plan = await B.planBackfill();
    expect(plan.wouldReactivate.items).toEqual([{ studentId: 'a1', scope: 'group', targetId: 'gA', status: 'removed' }]);
    expect(plan.conflicts.activeNotInOldFields.items).toEqual([{ studentId: 'a4', scope: 'group', targetId: 'gA2' }]);
    const res = await B.applyBackfill();
    expect(res.reactivated).toBe(1);
    expect(await M.ClassEnrollment.findOne({ studentId: 'a1', targetId: 'gA' }).lean()).toMatchObject({ status: 'active' });
    expect(await M.ClassEnrollment.findOne({ studentId: 'a4' }).lean()).toMatchObject({ status: 'active' }); // untouched
  });

  it('undo deletes exactly the backfilled rows and nothing written by the app', async () => {
    await M.ClassEnrollment.create({ institutionId: 'A', studentId: 'a4', scope: 'group', targetId: 'gA2', source: 'manual' }); // from dual write
    await B.applyBackfill();
    expect((await B.undoBackfill()).deleted).toBe(5);
    expect(await M.ClassEnrollment.find().lean()).toHaveLength(1);
  });

  it('never changes the old fields', async () => {
    const before = JSON.stringify([await M.Student.find().sort({ id: 1 }).lean(), await M.CourseInstance.find().sort({ id: 1 }).lean()]);
    await B.applyBackfill();
    await B.undoBackfill();
    expect(JSON.stringify([await M.Student.find().sort({ id: 1 }).lean(), await M.CourseInstance.find().sort({ id: 1 }).lean()])).toBe(before);
  });
});
