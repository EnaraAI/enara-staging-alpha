import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, startFixture, stopFixture } from './step5.helpers';
import { allOff, call, multi } from './step6.helpers';

// S4: while multi-class is on, a group's student count (Batch.studentCount and
// the group counts the API reports) is every ACTIVE member: main group (old
// field) plus extra group enrollments, each student once. Off: unchanged.
// S5: the admin class list (CurriculumCenter roster chips) also lists students
// added to a class outside its own list (extraStudentIds), when on only.
//
// Fixture (step5.helpers): gA = a1, a6; gA2 = a3; cA (gA, list a2 a3);
// cA2 (gA2); cA3 (list a2). Stored counts start at 0 (rows made directly).

const ADMIN = 'admin@a.test';
const enr = (s: string, p = '') => `/api/multi-class/students/${s}/enrollments${p}`;
const stored = async (id: string) => (await ctx.M.Batch.findOne({ id }).lean()).studentCount;
const listed = async (id: string) => (await call(ADMIN, 'get', '/api/batches')).body.find((b: { id: string }) => b.id === id)?.studentCount;
const overview = async (id: string) => (await call(ADMIN, 'get', '/api/analytics/overview')).body.batches.find((b: { batchId: string }) => b.batchId === id)?.students;
const instance = async (id: string) => (await call(ADMIN, 'get', '/api/course-instances')).body.find((c: { id: string }) => c.id === id);

beforeAll(async () => {
  await startFixture();
  await ctx.M.Curriculum.create({ id: 'cur-1', name: 'English', courseName: 'English', institutionId: 'A', summary: 's', lastUpdated: '2026-11-17', status: 'deployed', assignedBatches: [], chapters: [] });
}, 120_000);
afterAll(async () => {
  allOff();
  await stopFixture();
});

describe('S4 group counts', () => {
  it('off: the stored count is reported as before (no live count)', async () => {
    multi(false);
    await ctx.M.Batch.updateOne({ id: 'gA' }, { $set: { studentCount: 7 } }); // a drifted stored value
    expect(await listed('gA')).toBe(7);
    expect((await call(ADMIN, 'get', '/api/batches/gA')).body.studentCount).toBe(7);
    expect((await call(ADMIN, 'get', '/api/curriculums/cur-1/batches')).body.find((b: { id: string }) => b.id === 'gA').studentCount).toBe(7);
  });

  it('on: every reported group count is the live count of active members', async () => {
    multi(true);
    expect(await listed('gA')).toBe(2);
    expect(await listed('gA2')).toBe(1);
    expect((await call(ADMIN, 'get', '/api/batches/gA')).body.studentCount).toBe(2);
    expect((await call(ADMIN, 'get', '/api/curriculums/cur-1/batches')).body.find((b: { id: string }) => b.id === 'gA2').studentCount).toBe(1);
    expect(await overview('gA')).toBe(2);
  });

  it('an extra group member counts in both groups, each student once; Batch.studentCount is stored', async () => {
    expect((await call(ADMIN, 'post', enr('a1'), { scope: 'group', targetId: 'gA2' })).status).toBe(201);
    expect([await stored('gA2'), await listed('gA2'), await overview('gA2')]).toEqual([2, 2, 2]); // a3, a1
    expect([await stored('gA'), await listed('gA')]).toEqual([7, 2]); // gA not touched yet: stored stays, reply is live
    // a6: extra gA2, then gA2 becomes the main group: counted once there, gone from gA.
    expect((await call(ADMIN, 'post', enr('a6'), { scope: 'group', targetId: 'gA2' })).status).toBe(201);
    expect(await stored('gA2')).toBe(3);
    expect((await call(ADMIN, 'patch', '/api/students/a6', { batchId: 'gA2' })).status).toBe(200);
    expect([await stored('gA2'), await listed('gA2'), await overview('gA2')]).toEqual([3, 3, 3]); // a3, a1, a6 once
    expect([await stored('gA'), await listed('gA'), await overview('gA')]).toEqual([1, 1, 1]); // a1
    // Back: a6's main group is gA again (the dual write ends gA2, a6's extra went with it).
    expect((await call(ADMIN, 'patch', '/api/students/a6', { batchId: 'gA' })).status).toBe(200);
    expect([await stored('gA'), await stored('gA2')]).toEqual([2, 2]);
  });

  it('removing an extra group lowers the count; a new student and a deleted student are counted live', async () => {
    expect((await call(ADMIN, 'delete', enr('a1', '/group/gA2'))).status).toBe(200);
    expect([await stored('gA2'), await listed('gA2')]).toEqual([1, 1]);
    const created = await call(ADMIN, 'post', '/api/students', { name: 'New One', email: 'new1@t.test', grade: '7', batchId: 'gA2' });
    expect(created.status).toBe(201);
    expect(await stored('gA2')).toBe(2);
    expect((await call(ADMIN, 'post', enr(created.body.id), { scope: 'group', targetId: 'gA' })).status).toBe(201);
    expect(await stored('gA')).toBe(3);
    expect((await call(ADMIN, 'delete', `/api/students/${created.body.id}`)).status).toBe(200);
    expect([await stored('gA'), await stored('gA2')]).toEqual([2, 1]); // both groups it was in
  });

  it('never counts an archived student or a row of another school', async () => {
    await ctx.M.ClassEnrollment.create({ institutionId: 'B', studentId: 'b1', scope: 'group', targetId: 'gA', source: 'manual' }); // drift across schools
    await ctx.M.Student.create({ id: 'a9', name: 'Student a9', email: 'a9@t.test', grade: '7', institutionId: 'A', batchId: 'gA', archivedAt: new Date() });
    expect(await listed('gA')).toBe(2);
    const { refreshGroupCounts } = await import('../../src/services/groupCounts');
    await refreshGroupCounts(['gA']);
    expect(await stored('gA')).toBe(2);
    await ctx.M.ClassEnrollment.deleteOne({ studentId: 'b1', targetId: 'gA' });
    await ctx.M.Student.deleteOne({ id: 'a9' });
    // School B's admin sees only school B's groups, counted in school B.
    const b = (await call('admin@b.test', 'get', '/api/batches')).body;
    expect(b.map((g: { id: string; studentCount: number }) => [g.id, g.studentCount])).toEqual([['gB', 1]]);
  });
});

describe('S5 class roster chips: students added to a class outside its own list', () => {
  it('on, before any extra: the class list is the same as off (no new field)', async () => {
    multi(false);
    const off = (await call(ADMIN, 'get', '/api/course-instances')).body;
    multi(true);
    const on = (await call(ADMIN, 'get', '/api/course-instances')).body;
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  });

  it('on: an extra class member is listed in extraStudentIds (list, one class, assign/remove replies); off: never', async () => {
    expect((await call(ADMIN, 'post', enr('a1'), { scope: 'class', targetId: 'cA3' })).status).toBe(201);
    expect((await call(ADMIN, 'post', enr('a6'), { scope: 'class', targetId: 'cA3' })).status).toBe(201);
    const cA3 = await instance('cA3');
    expect({ studentIds: cA3.studentIds, extraStudentIds: cA3.extraStudentIds }).toEqual({ studentIds: ['a2'], extraStudentIds: ['a1', 'a6'] });
    expect((await instance('cA')).extraStudentIds).toBeUndefined(); // a1 is in cA through its group, as today
    expect((await call(ADMIN, 'get', '/api/course-instances/cA3')).body.extraStudentIds).toEqual(['a1', 'a6']);
    // Putting a6 on the class's own list: a chip of the list, no longer an extra.
    const assigned = await call(ADMIN, 'post', '/api/course-instances/cA3/students', { studentId: 'a6' });
    expect([assigned.body.studentIds, assigned.body.extraStudentIds]).toEqual([['a2', 'a6'], ['a1']]);
    const removed = await call(ADMIN, 'delete', '/api/course-instances/cA3/students/a2');
    expect([removed.body.studentIds, removed.body.extraStudentIds]).toEqual([['a6'], ['a1']]);
    // Removing the extra membership (what the chip's X does for an added student).
    expect((await call(ADMIN, 'delete', enr('a1', '/class/cA3'))).status).toBe(200);
    expect((await instance('cA3')).extraStudentIds).toBeUndefined();
    expect((await call(ADMIN, 'post', enr('a1'), { scope: 'class', targetId: 'cA3' })).status).toBe(201);
    multi(false);
    const off = await instance('cA3');
    expect(off.extraStudentIds).toBeUndefined();
    expect(off.studentIds).toEqual(['a6']);
    multi(true);
  });

  it('chips come from the same class enrollments as the teacher roster', async () => {
    const { classStudentIds } = await import('../../src/services/learningAccess');
    const cls = await ctx.M.CourseInstance.findOne({ id: 'cA3' }).lean();
    const roster = await classStudentIds(cls);
    const chips = await instance('cA3');
    expect([...chips.studentIds, ...(chips.extraStudentIds ?? [])].sort()).toEqual([...roster].sort());
  });

  it('tenant isolation: another school\'s student or an archived student is never a chip', async () => {
    await ctx.M.ClassEnrollment.create({ institutionId: 'B', studentId: 'b1', scope: 'class', targetId: 'cA3', source: 'manual' });
    await ctx.M.ClassEnrollment.create({ institutionId: 'A', studentId: 'b1', scope: 'class', targetId: 'cA2', source: 'manual' });
    await ctx.M.Student.create({ id: 'a10', name: 'Student a10', email: 'a10@t.test', grade: '7', institutionId: 'A', archivedAt: new Date() });
    await ctx.M.ClassEnrollment.create({ institutionId: 'A', studentId: 'a10', scope: 'class', targetId: 'cA2', source: 'manual' });
    expect((await instance('cA3')).extraStudentIds).toEqual(['a1']);
    expect((await instance('cA2')).extraStudentIds).toBeUndefined();
    // School B's admin never sees school A's classes.
    expect((await call('admin@b.test', 'get', '/api/course-instances')).body.map((c: { id: string }) => c.id)).toEqual(['cB']);
  });
});

describe('S4 and the undo', () => {
  it('after the switch is off, the undo brings the stored counts back to main-group members', async () => {
    await ctx.M.ClassEnrollment.deleteMany({ studentId: { $in: ['b1', 'a10'] } });
    expect((await call(ADMIN, 'post', enr('a1'), { scope: 'group', targetId: 'gA2' })).status).toBe(201);
    expect(await stored('gA2')).toBe(2);
    multi(false);
    expect(await listed('gA2')).toBe(2); // off: the stored value is reported (it still includes a1)
    const { endExtraMemberships } = await import('../../src/services/multiClass');
    expect(await endExtraMemberships({ apply: true, by: 'test' })).toMatchObject({ groups: 1 });
    expect([await stored('gA2'), await listed('gA2'), await stored('gA')]).toEqual([1, 1, 2]);
  });
});
