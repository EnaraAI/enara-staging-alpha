import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, startFixture, stopFixture } from './step5.helpers';
import { addUser, allOff, call, multi } from './step6.helpers';

// Multi-class step 6, part 1: an admin adds a student to a second (third...)
// group or class and removes them. School admins (their school) and Enara
// admins (the student's school) only; every write goes to class_enrollments
// (source 'manual'); Student.batchId stays the main group; nothing crosses schools.

const ADMIN = 'admin@a.test';
const enr = (p = '') => `/api/multi-class/students/a1/enrollments${p}`;

beforeAll(async () => {
  await startFixture();
  await addUser('root@enara.test', 'enara-admin');
  multi(true);
}, 120_000);
afterAll(async () => {
  allOff();
  await stopFixture();
});

describe('add and remove (school admin)', () => {
  it('lists the main group and its classes', async () => {
    const r = await call(ADMIN, 'get', enr());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ studentId: 'a1', primaryGroupId: 'gA', multiClass: false });
    expect(r.body.groups).toEqual([expect.objectContaining({ id: 'gA', name: 'Group gA', primary: true, removable: false })]);
    expect(r.body.classes.map((c: { id: string }) => c.id)).toEqual(['cA']);
  });

  it('adds a second group and a class: a1 is then in 2 groups and 3 classes', async () => {
    const g = await call(ADMIN, 'post', enr(), { scope: 'group', targetId: 'gA2' });
    expect(g.status).toBe(201);
    expect(g.body).toMatchObject({ scope: 'group', targetId: 'gA2', status: 'active' });
    const c = await call(ADMIN, 'post', enr(), { scope: 'class', targetId: 'cA3' });
    expect(c.status).toBe(201);
    const row = await ctx.M.ClassEnrollment.findOne({ studentId: 'a1', targetId: 'gA2' }).lean();
    expect(row).toMatchObject({ institutionId: 'A', source: 'manual', status: 'active', scope: 'group' });
    // The old fields are untouched: batchId stays the main group, cA3's own list is unchanged.
    expect((await ctx.M.Student.findOne({ id: 'a1' }).lean()).batchId).toBe('gA');
    expect((await ctx.M.CourseInstance.findOne({ id: 'cA3' }).lean()).studentIds).toEqual(['a2']);
    const r = await call(ADMIN, 'get', enr());
    expect(r.body.multiClass).toBe(true);
    expect(r.body.groups.map((x: { id: string; primary: boolean; removable: boolean }) => [x.id, x.primary, x.removable])).toEqual([['gA', true, false], ['gA2', false, true]]);
    expect(r.body.classes.map((x: { id: string; via: string[]; removable: boolean }) => [x.id, x.via, x.removable])).toEqual([
      ['cA', ['group'], false], ['cA2', ['group'], false], ['cA3', ['class'], true],
    ]);
    // Adding again changes nothing.
    expect((await call(ADMIN, 'post', enr(), { scope: 'group', targetId: 'gA2' })).status).toBe(201);
    expect(await ctx.M.ClassEnrollment.countDocuments({ studentId: 'a1' })).toBe(3);
  });

  it('removes an extra membership (kept as history) and re-adding reactivates the same row', async () => {
    const before = await ctx.M.ClassEnrollment.findOne({ studentId: 'a1', targetId: 'cA3' }).lean();
    const d = await call(ADMIN, 'delete', enr('/class/cA3'));
    expect(d).toMatchObject({ status: 200, body: { scope: 'class', targetId: 'cA3', status: 'removed' } });
    expect(await ctx.M.ClassEnrollment.findOne({ id: before.id }).lean()).toMatchObject({ status: 'removed', endedBy: expect.any(String) });
    expect((await call(ADMIN, 'delete', enr('/class/cA3'))).status).toBe(404);
    await call(ADMIN, 'post', enr(), { scope: 'class', targetId: 'cA3' });
    expect(await ctx.M.ClassEnrollment.findOne({ studentId: 'a1', targetId: 'cA3' }).lean()).toMatchObject({ id: before.id, status: 'active' });
  });

  it("refuses to remove the main group, or a class from that class's own list", async () => {
    const g = await call(ADMIN, 'delete', enr('/group/gA'));
    expect([g.status, g.body.error.code]).toEqual([409, 'PRIMARY_GROUP']);
    const c = await call(ADMIN, 'delete', '/api/multi-class/students/a2/enrollments/class/cA');
    expect([c.status, c.body.error.code]).toEqual([409, 'CLASS_ROSTER']);
    expect(await ctx.M.ClassEnrollment.countDocuments({ studentId: { $in: ['a1', 'a2'] }, status: 'active', targetId: { $in: ['gA', 'cA'] } })).toBe(2);
  });

  it('a second group needs a main group first', async () => {
    const r = await call(ADMIN, 'post', '/api/multi-class/students/a4/enrollments', { scope: 'group', targetId: 'gA2' });
    expect([r.status, r.body.error.code]).toEqual([409, 'NO_PRIMARY_GROUP']);
  });

  it('validates the body', async () => {
    expect((await call(ADMIN, 'post', enr(), { scope: 'school', targetId: 'gA2' })).status).toBe(400);
    expect((await call(ADMIN, 'post', enr(), { scope: 'group' })).status).toBe(400);
    expect((await call(ADMIN, 'post', enr(), { scope: 'group', targetId: { $ne: 'x' } })).status).toBe(400);
  });
});

describe('who may do it, and tenant isolation', () => {
  it("cannot add a student to another school's group or class (404)", async () => {
    for (const [scope, targetId] of [['group', 'gB'], ['class', 'cB'], ['group', 'nope']]) {
      const r = await call(ADMIN, 'post', enr(), { scope, targetId });
      expect([r.status, r.body.error.code]).toEqual([404, 'ENROLLMENT_TARGET_NOT_FOUND']);
    }
    expect(await ctx.M.ClassEnrollment.countDocuments({ studentId: 'a1', targetId: { $in: ['gB', 'cB'] } })).toBe(0);
  });

  it("another school's admin cannot see or change the student (404)", async () => {
    expect((await call('admin@b.test', 'get', enr())).status).toBe(404);
    expect((await call('admin@b.test', 'post', enr(), { scope: 'group', targetId: 'gB' })).status).toBe(404);
    expect((await call('admin@b.test', 'delete', enr('/group/gA2'))).status).toBe(404);
    expect((await call(ADMIN, 'get', '/api/multi-class/students/b1/enrollments')).status).toBe(404);
    expect(await ctx.M.ClassEnrollment.countDocuments({ studentId: 'a1', status: 'active' })).toBe(3);
  });

  it('teachers and students are refused (403)', async () => {
    for (const u of ['teacher@a.test', 'a1@t.test']) {
      expect((await call(u, 'get', enr())).status).toBe(403);
      expect((await call(u, 'post', enr(), { scope: 'group', targetId: 'gA2' })).status).toBe(403);
      expect((await call(u, 'delete', enr('/group/gA2'))).status).toBe(403);
    }
  });

  it("an Enara admin works in the student's own school only", async () => {
    expect((await call('root@enara.test', 'get', '/api/multi-class/students/b1/enrollments')).status).toBe(200);
    const cross = await call('root@enara.test', 'post', '/api/multi-class/students/b1/enrollments', { scope: 'group', targetId: 'gA' });
    expect([cross.status, cross.body.error.code]).toEqual([404, 'ENROLLMENT_TARGET_NOT_FOUND']);
    const ok = await call('root@enara.test', 'post', '/api/multi-class/students/a6/enrollments', { scope: 'class', targetId: 'cA2' });
    expect(ok.status).toBe(201);
    expect(await ctx.M.ClassEnrollment.findOne({ studentId: 'a6', targetId: 'cA2' }).lean()).toMatchObject({ institutionId: 'A', status: 'active' });
  });

  it('every change is in the audit trail (ids only)', async () => {
    const { AuditEvent } = await import('../../src/models/AuditEvent');
    const rows = await AuditEvent.find({ action: { $in: ['student_membership_added', 'student_membership_removed'] } }).lean();
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(rows)).not.toContain('Student a1');
  });
});
