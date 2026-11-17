import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, startFixture, stopFixture } from './step5.helpers';
import { allOff, call, multi } from './step6.helpers';

// S3 (owner decision 2026-11-17): the backfill dry run (planBackfill, the
// lms-test burst's STOP condition) reports step 6 extra memberships separately
// from drift, and validates them. Rows the multi-class service makes carry
// extraVia 'multi_class'; rows from before the marker are recognised by their
// 'student_membership_added' audit event (same student, scope, target, school).

const ADMIN = 'admin@a.test';
const enr = (s: string, p = '') => `/api/multi-class/students/${s}/enrollments${p}`;
const plan = async () => (await import('../../src/services/enrollmentBackfill')).planBackfill({ institutionId: 'A' });
const summary = (r: Awaited<ReturnType<typeof plan>>) => ({
  inSync: r.inSync,
  conflicts: r.conflicts.activeNotInOldFields.items,
  valid: r.extraMemberships.valid,
  invalid: r.extraMemberships.invalid.items.map((i) => `${i.studentId}|${i.scope}|${i.targetId}|${i.reason}`).sort(),
  legacyUnmarked: r.extraMemberships.legacyUnmarked,
});
const row = (studentId: string, targetId: string) => ctx.M.ClassEnrollment.findOne({ studentId, targetId }).lean();
let AuditEvent: any; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  await startFixture();
  AuditEvent = (await import('../../src/models/AuditEvent')).AuditEvent;
  multi(true);
}, 120_000);
afterAll(async () => {
  allOff();
  await stopFixture();
});

describe('the dry run with step 6 extras', () => {
  it('in sync before any extra (fixture), with an empty extras section', async () => {
    expect(summary(await plan())).toEqual({ inSync: true, conflicts: [], valid: 0, invalid: [], legacyUnmarked: 0 });
    const r = await plan();
    expect(r.extraMemberships.invalid).toMatchObject({ count: 0, targetMissing: 0, otherSchool: 0, targetArchived: 0, studentInactive: 0 });
  });

  it('extra groups and classes made by the multi-class service are marked, valid and not conflicts', async () => {
    expect((await call(ADMIN, 'post', enr('a1'), { scope: 'group', targetId: 'gA2' })).status).toBe(201);
    expect((await call(ADMIN, 'post', enr('a1'), { scope: 'class', targetId: 'cA3' })).status).toBe(201);
    expect(await row('a1', 'gA2')).toMatchObject({ extraVia: 'multi_class', status: 'active' });
    expect(await row('a1', 'cA3')).toMatchObject({ extraVia: 'multi_class', status: 'active' });
    // Rows written by the dual write / backfill carry no marker.
    expect((await row('a1', 'gA')).extraVia).toBeUndefined();
    expect(summary(await plan())).toEqual({ inSync: true, conflicts: [], valid: 2, invalid: [], legacyUnmarked: 0 });
  });

  it('the marker follows the writer: re-adding after a removal marks again; a dual-write reactivation clears it', async () => {
    expect((await call(ADMIN, 'delete', enr('a1', '/class/cA3'))).status).toBe(200);
    expect(summary(await plan())).toMatchObject({ inSync: true, valid: 1 });
    await ctx.M.ClassEnrollment.updateOne({ studentId: 'a1', targetId: 'cA3' }, { $unset: { extraVia: 1 } });
    expect((await call(ADMIN, 'post', enr('a1'), { scope: 'class', targetId: 'cA3' })).status).toBe(201);
    expect((await row('a1', 'cA3')).extraVia).toBe('multi_class');
    // a6's extra class cA2 ends; then cA2's own list takes a6 (dual write): the reactivated row is no longer an extra.
    expect((await call(ADMIN, 'post', enr('a6'), { scope: 'class', targetId: 'cA2' })).status).toBe(201);
    expect((await call(ADMIN, 'delete', enr('a6', '/class/cA2'))).status).toBe(200);
    expect((await call(ADMIN, 'post', '/api/course-instances/cA2/students', { studentId: 'a6' })).status).toBe(200);
    expect(await row('a6', 'cA2')).toMatchObject({ status: 'active' });
    expect((await row('a6', 'cA2')).extraVia).toBeUndefined();
    expect(summary(await plan())).toEqual({ inSync: true, conflicts: [], valid: 2, invalid: [], legacyUnmarked: 0 });
    // Back to the fixture's lists.
    expect((await call(ADMIN, 'delete', '/api/course-instances/cA2/students/a6')).status).toBe(200);
  });

  it('drift is still a conflict: an unmarked row the old fields do not hold and no audit event explains', async () => {
    await ctx.M.ClassEnrollment.create({ institutionId: 'A', studentId: 'a6', scope: 'group', targetId: 'gA2', source: 'manual', createdBy: 'someone' });
    expect(summary(await plan())).toEqual({ inSync: false, conflicts: [{ studentId: 'a6', scope: 'group', targetId: 'gA2' }], valid: 2, invalid: [], legacyUnmarked: 0 });
  });

  it('legacy rule: an unmarked row with a student_membership_added audit event (same school) is an extra', async () => {
    // An audit event in another school does not count.
    await AuditEvent.create({ at: new Date(), action: 'student_membership_added', institutionId: 'B', targetType: 'student', targetId: 'a6', detail: { scope: 'group', targetId: 'gA2' } });
    expect(summary(await plan())).toMatchObject({ inSync: false, conflicts: [{ studentId: 'a6', scope: 'group', targetId: 'gA2' }] });
    // Nor one for another target.
    await AuditEvent.create({ at: new Date(), action: 'student_membership_added', institutionId: 'A', targetType: 'student', targetId: 'a6', detail: { scope: 'class', targetId: 'gA2' } });
    expect(summary(await plan())).toMatchObject({ inSync: false });
    await AuditEvent.create({ at: new Date(), action: 'student_membership_added', institutionId: 'A', targetType: 'student', targetId: 'a6', detail: { scope: 'group', targetId: 'gA2' } });
    expect(summary(await plan())).toEqual({ inSync: true, conflicts: [], valid: 3, invalid: [], legacyUnmarked: 1 });
    await ctx.M.ClassEnrollment.deleteOne({ studentId: 'a6', targetId: 'gA2' });
  });
});

describe('extras are validated, never ignored', () => {
  const extra = (studentId: string, scope: 'group' | 'class', targetId: string, institutionId = 'A') =>
    ctx.M.ClassEnrollment.create({ institutionId, studentId, scope, targetId, source: 'manual', extraVia: 'multi_class' });

  it('each invalid kind is counted by reason, listed, and makes inSync false', async () => {
    await ctx.M.Batch.create({ id: 'gArch', name: 'Archived group', institutionId: 'A', academicYear: '2026', archivedAt: new Date() });
    await ctx.M.CourseInstance.create({ id: 'cArch', courseId: 'cArch', courseName: 'Archived class', academicYear: '2026', institutionId: 'A', batchId: 'gA', studentIds: [], visibility: 'archived', instructorIds: [] });
    await ctx.M.Student.create({ id: 'a7', name: 'Student a7', email: 'a7@t.test', grade: '7', institutionId: 'A', archivedAt: new Date() });
    await extra('a6', 'group', 'gGone'); // the group does not exist
    await extra('a6', 'class', 'cB'); // school B's class
    await extra('a6', 'group', 'gArch'); // archived group
    await extra('a6', 'class', 'cArch'); // archived class
    await extra('a7', 'group', 'gA2'); // archived student
    await extra('aGone', 'group', 'gA2'); // deleted student
    const r = await plan();
    expect(summary(r)).toEqual({
      inSync: false,
      conflicts: [],
      valid: 2,
      invalid: ['a6|class|cArch|targetArchived', 'a6|class|cB|otherSchool', 'a6|group|gArch|targetArchived', 'a6|group|gGone|targetMissing', 'a7|group|gA2|studentInactive', 'aGone|group|gA2|studentInactive'],
      legacyUnmarked: 0,
    });
    expect(r.extraMemberships.invalid).toMatchObject({ count: 6, targetMissing: 1, otherSchool: 1, targetArchived: 2, studentInactive: 2 });
    // The report never names anyone: IDs and counts only.
    expect(JSON.stringify(r.extraMemberships)).not.toMatch(/Student a|@t\.test/);
    await ctx.M.ClassEnrollment.deleteMany({ studentId: { $in: ['a6', 'a7', 'aGone'] }, extraVia: 'multi_class' });
    expect(summary(await plan())).toEqual({ inSync: true, conflicts: [], valid: 2, invalid: [], legacyUnmarked: 0 });
  });

  it('a row of school A pointing at school B is otherSchool even when marked, and school B\'s report is unaffected', async () => {
    await extra('b1', 'group', 'gA2', 'A'); // b1 is school B's student
    expect(summary(await plan()).invalid).toEqual(['b1|group|gA2|otherSchool']);
    const { planBackfill } = await import('../../src/services/enrollmentBackfill');
    expect((await planBackfill({ institutionId: 'B' })).inSync).toBe(true);
    await ctx.M.ClassEnrollment.deleteOne({ studentId: 'b1', targetId: 'gA2' });
  });

  it('the multi-class service refuses to make an invalid extra (archived student, group or class)', async () => {
    await ctx.M.Student.create({ id: 'a8', name: 'Student a8', email: 'a8@t.test', grade: '7', institutionId: 'A', batchId: 'gA' });
    expect((await call(ADMIN, 'post', enr('a8'), { scope: 'group', targetId: 'gArch' })).body.error?.code).toBe('GROUP_ARCHIVED');
    expect((await call(ADMIN, 'post', enr('a8'), { scope: 'class', targetId: 'cArch' })).body.error?.code).toBe('CLASS_ARCHIVED');
    expect((await call(ADMIN, 'post', enr('a7'), { scope: 'group', targetId: 'gA2' })).body.error?.code).toBe('STUDENT_ARCHIVED');
    expect((await call(ADMIN, 'post', enr('a8'), { scope: 'group', targetId: 'gB' })).status).toBe(404); // other school, as before
    expect(await ctx.M.ClassEnrollment.countDocuments({ studentId: { $in: ['a7', 'a8'] }, extraVia: 'multi_class' })).toBe(0);
  });
});
