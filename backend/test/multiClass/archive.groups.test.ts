import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ON, api, ctx, enrollmentRows, expectConsistent, mkClass, mkGroup, mkStudent, setSwitches, startArchiveFixture, stopFixture } from './archive.helpers';

// Multi-class step 6, ENROLLMENT_GROUP_ARCHIVE (PLAN §10): refuse deleting a
// group or class that still has active students, archive/restore groups and
// classes (history kept), and the "students without an active group" list.

beforeAll(startArchiveFixture, 120_000);
afterAll(stopFixture);
beforeEach(() => setSwitches(ALL_ON));

describe('deleting a group or class that still has students is refused', () => {
  it('a group with students (old field) answers 409 GROUP_HAS_STUDENTS and nothing changes', async () => {
    const g = await mkGroup();
    const s = await mkStudent({ batchId: g });
    const r = await api('admin@a.test', 'delete', `/api/batches/${g}`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('GROUP_HAS_STUDENTS');
    expect(r.body.message).toBe('Move or remove the students first.');
    expect(r.body.error.details).toMatchObject({ activeStudents: 1, byGroupField: 1, byEnrollment: 1 });
    expect(await ctx.M.Batch.exists({ id: g })).toBeTruthy();
    expect((await ctx.M.Student.findOne({ id: s.id }).lean()).batchId).toBe(g);
  });

  it('a group whose only member is an active enrollment is refused too', async () => {
    const g = await mkGroup();
    const s = await mkStudent();
    await ctx.M.ClassEnrollment.create({ institutionId: 'A', studentId: s.id, scope: 'group', targetId: g, source: 'manual' });
    const r = await api('admin@a.test', 'delete', `/api/batches/${g}`);
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ activeStudents: 1, byGroupField: 0, byEnrollment: 1 });
    await ctx.M.ClassEnrollment.deleteOne({ studentId: s.id, targetId: g });
  });

  it('an empty group is deleted as before', async () => {
    const g = await mkGroup();
    expect((await api('admin@a.test', 'delete', `/api/batches/${g}`)).status).toBe(200);
    expect(await ctx.M.Batch.exists({ id: g })).toBeFalsy();
  });

  it('a class with explicit students or group students answers 409 CLASS_HAS_STUDENTS', async () => {
    const g = await mkGroup();
    const c = await mkClass(g);
    const s = await mkStudent();
    expect((await api('admin@a.test', 'post', `/api/course-instances/${c}/students`, { studentId: s.id })).status).toBe(200);
    let r = await api('admin@a.test', 'delete', `/api/course-instances/${c}`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CLASS_HAS_STUDENTS');
    expect(r.body.message).toBe('Move or remove the students first.');
    expect(r.body.error.details).toMatchObject({ activeStudents: 1, explicit: 1, viaGroup: 0 });
    expect((await api('admin@a.test', 'delete', `/api/course-instances/${c}/students/${s.id}`)).status).toBe(200);
    await mkStudent({ batchId: g });
    r = await api('admin@a.test', 'delete', `/api/course-instances/${c}`);
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ activeStudents: 1, explicit: 0, viaGroup: 1 });
  });

  it('an empty class is deleted as before; another school gets 404 as before', async () => {
    const c = await mkClass(await mkGroup());
    expect((await api('admin@b.test', 'delete', `/api/course-instances/${c}`)).status).toBe(404);
    expect((await api('admin@a.test', 'delete', `/api/course-instances/${c}`)).status).toBe(200);
    expect((await api('admin@b.test', 'delete', '/api/batches/gA')).status).toBe(404);
  });
});

describe('archive and restore a group', () => {
  it('archiving ends the enrollments, keeps the history, hides the group; restoring puts it back', async () => {
    const g = await mkGroup();
    const c = await mkClass(g);
    const s1 = await mkStudent({ batchId: g });
    const s2 = await mkStudent({ batchId: g });
    await ctx.M.AssessmentAttempt.collection.insertOne({ id: 'att-g1', studentId: s1.id, institutionId: 'A', assessmentId: 'asG', score: 80 });
    expect((await ctx.M.Batch.findOne({ id: g }).lean()).studentCount).toBe(2);
    await expectConsistent();

    const a = await api('admin@a.test', 'post', `/api/batches/${g}/archive`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ id: g, members: 2, studentsUnplaced: 2, enrollmentsEnded: 2 });
    const batch = await ctx.M.Batch.findOne({ id: g }).lean();
    expect(batch.archivedAt).toBeTruthy();
    expect(batch.archive.memberIds.sort()).toEqual([s1.id, s2.id].sort());
    expect(batch.studentCount).toBe(0);
    for (const s of [s1, s2]) {
      const st = await ctx.M.Student.findOne({ id: s.id }).lean();
      expect(st).toBeTruthy(); // nothing deleted
      expect(st.batchId).toBeUndefined();
      const rows = await enrollmentRows(s.id);
      expect(rows.map((r: { status: string; endedAt?: Date }) => [r.status, !!r.endedAt])).toEqual([['inactive', true]]);
    }
    expect(await ctx.M.AssessmentAttempt.countDocuments({ id: 'att-g1' })).toBe(1); // grades kept
    // Hidden from the normal list, visible with includeArchived and in the history view.
    expect((await api('admin@a.test', 'get', '/api/batches')).body.map((b: { id: string }) => b.id)).not.toContain(g);
    expect((await api('admin@a.test', 'get', '/api/batches?includeArchived=true')).body.map((b: { id: string }) => b.id)).toContain(g);
    expect((await api('admin@a.test', 'get', '/api/batches?archived=only')).body.map((b: { id: string }) => b.id)).toEqual([g]);
    const h = await api('admin@a.test', 'get', `/api/batches/${g}/history`);
    expect(h.status).toBe(200);
    expect(h.body.memberships.map((m: { status: string }) => m.status)).toEqual(['inactive', 'inactive']);
    expect(h.body.membersAtArchive).toHaveLength(2);
    // The class of the archived group has nobody, on both read paths.
    const { classStudentIds } = await import('../../src/services/learningAccess');
    expect(await classStudentIds(await ctx.M.CourseInstance.findOne({ id: c }).lean())).toEqual([]);
    // Unplaced list shows them, reason group_archived.
    const u = await api('admin@a.test', 'get', '/api/students/without-active-group');
    expect(u.body.students.filter((x: { studentId: string }) => [s1.id, s2.id].includes(x.studentId)).map((x: { reason: string; groupId: string }) => [x.reason, x.groupId])).toEqual([['group_archived', g], ['group_archived', g]]);
    // Twice is refused; a student can't be placed in an archived group.
    expect((await api('admin@a.test', 'post', `/api/batches/${g}/archive`)).body.error.code).toBe('ALREADY_ARCHIVED');
    expect((await api('admin@a.test', 'patch', `/api/students/${s1.id}`, { batchId: g })).body.error.code).toBe('GROUP_ARCHIVED');
    await expectConsistent();

    const r = await api('admin@a.test', 'post', `/api/batches/${g}/restore`);
    expect(r.status).toBe(200);
    expect(r.body.returned.sort()).toEqual([s1.id, s2.id].sort());
    expect(r.body.enrollmentsReactivated).toBe(2);
    expect((await ctx.M.Batch.findOne({ id: g }).lean()).studentCount).toBe(2);
    for (const s of [s1, s2]) {
      expect((await ctx.M.Student.findOne({ id: s.id }).lean()).batchId).toBe(g);
      expect((await enrollmentRows(s.id)).map((x: { status: string }) => x.status)).toEqual(['active']);
    }
    expect((await api('admin@a.test', 'get', '/api/batches')).body.map((b: { id: string }) => b.id)).toContain(g);
    expect((await api('admin@a.test', 'get', '/api/students/without-active-group')).body.students.map((x: { studentId: string }) => x.studentId)).not.toContain(s1.id);
    await expectConsistent();
  });

  it('a member placed elsewhere while archived is not moved back', async () => {
    const g = await mkGroup();
    const g2 = await mkGroup();
    const s1 = await mkStudent({ batchId: g });
    const s2 = await mkStudent({ batchId: g });
    await api('admin@a.test', 'post', `/api/batches/${g}/archive`);
    expect((await api('admin@a.test', 'patch', `/api/students/${s2.id}`, { batchId: g2 })).status).toBe(200);
    const r = await api('admin@a.test', 'post', `/api/batches/${g}/restore`);
    expect(r.body.returned).toEqual([s1.id]);
    expect(r.body.notReturned).toEqual([{ studentId: s2.id, reason: 'moved' }]);
    expect((await ctx.M.Student.findOne({ id: s2.id }).lean()).batchId).toBe(g2);
    await expectConsistent();
  });

  it('only admins of the school (or ENARA admins) can archive or restore', async () => {
    const g = await mkGroup();
    expect((await api('teacher@a.test', 'post', `/api/batches/${g}/archive`)).status).toBe(403);
    expect((await api('admin@b.test', 'post', `/api/batches/${g}/archive`)).status).toBe(404);
    expect((await api('enara@x.test', 'post', `/api/batches/${g}/archive`)).status).toBe(200);
    expect((await api('admin@b.test', 'post', `/api/batches/${g}/restore`)).status).toBe(404);
    expect((await api('admin@b.test', 'get', '/api/batches?archived=only')).body).toEqual([]);
    expect((await api('admin@a.test', 'post', `/api/batches/${g}/restore`)).status).toBe(200);
  });
});

describe('archive and restore a class', () => {
  it('ends the explicit enrollments, hides the class from students and lists, and restores', async () => {
    const g = await mkGroup();
    const c = await mkClass(g);
    const inGroup = await mkStudent({ batchId: g });
    const explicit = await mkStudent();
    await api('admin@a.test', 'post', `/api/course-instances/${c}/students`, { studentId: explicit.id });
    const courses = async (email: string) => (await api(email, 'get', '/api/me/courses')).body;
    expect(JSON.stringify(await courses(explicit.email))).toContain(c);
    expect(JSON.stringify(await courses(inGroup.email))).toContain(c);
    await expectConsistent();

    const a = await api('admin@a.test', 'post', `/api/course-instances/${c}/archive`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ explicitMembers: 1, enrollmentsEnded: 1 });
    const cls = await ctx.M.CourseInstance.findOne({ id: c }).lean();
    expect([cls.visibility, cls.studentIds, cls.archive.visibility, cls.archive.memberIds]).toEqual(['archived', [], 'student', [explicit.id]]);
    expect((await enrollmentRows(explicit.id)).map((x: { status: string; endedAt?: Date }) => [x.status, !!x.endedAt])).toEqual([['inactive', true]]);
    expect(JSON.stringify(await courses(explicit.email))).not.toContain(c);
    expect(JSON.stringify(await courses(inGroup.email))).not.toContain(c);
    expect((await api('admin@a.test', 'get', '/api/course-instances')).body.map((x: { id: string }) => x.id)).not.toContain(c);
    expect((await api('admin@a.test', 'get', '/api/course-instances?includeArchived=true')).body.map((x: { id: string }) => x.id)).toContain(c);
    expect((await api('admin@a.test', 'post', `/api/course-instances/${c}/students`, { studentId: explicit.id })).body.error.code).toBe('CLASS_ARCHIVED');
    // The group student stays in the (archived) class's group: deleting the class is still refused.
    expect((await api('admin@a.test', 'delete', `/api/course-instances/${c}`)).body.error.code).toBe('CLASS_HAS_STUDENTS');
    await expectConsistent();

    const r = await api('admin@a.test', 'post', `/api/course-instances/${c}/restore`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ returned: [explicit.id], enrollmentsReactivated: 1 });
    const back = await ctx.M.CourseInstance.findOne({ id: c }).lean();
    expect([back.visibility, back.studentIds, back.archivedAt]).toEqual(['student', [explicit.id], undefined]);
    expect(JSON.stringify(await courses(explicit.email))).toContain(c);
    await expectConsistent();
  });
});

describe('students without an active group', () => {
  it('lists students with no active group, with the reason, school by school; nothing is deleted', async () => {
    const before = await ctx.M.Student.countDocuments();
    const r = await api('admin@a.test', 'get', '/api/students/without-active-group');
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.body.students.map((s: { studentId: string; reason: string; groupId?: string }) => [s.studentId, [s.reason, s.groupId ?? null]]));
    expect(byId.a5).toEqual(['group_deleted', 'gDel']); // points at a deleted group
    expect(byId.a2).toEqual(['no_group', null]);
    expect(byId.a4).toEqual(['no_group', null]);
    for (const placed of ['a1', 'a3', 'a6', 'b1']) expect(byId[placed]).toBeUndefined();
    expect(r.body.count).toBe(r.body.students.length);
    expect(r.body.students.every((s: { institutionId: string }) => s.institutionId === 'A')).toBe(true);
    const b = await api('admin@b.test', 'get', '/api/students/without-active-group');
    expect(b.body.students.every((s: { institutionId: string }) => s.institutionId === 'B')).toBe(true);
    expect((await api('teacher@a.test', 'get', '/api/students/without-active-group')).status).toBe(403);
    expect(await ctx.M.Student.countDocuments()).toBe(before);
    // Placing the student removes them from the list.
    expect((await api('admin@a.test', 'patch', '/api/students/a4', { batchId: 'gA2' })).status).toBe(200);
    expect((await api('admin@a.test', 'get', '/api/students/without-active-group')).body.students.map((s: { studentId: string }) => s.studentId)).not.toContain('a4');
    await api('admin@a.test', 'patch', '/api/students/a4', { batchId: '' });
  });

  it('the backfill dry run counts them (and keeps groupMissing / classMemberMissing)', async () => {
    const { planBackfill } = await import('../../src/services/enrollmentBackfill');
    const rep = await planBackfill({ institutionId: 'A' });
    const list = (await api('admin@a.test', 'get', '/api/students/without-active-group')).body;
    expect(rep.studentsWithoutActiveGroup.count).toBe(list.count);
    expect(rep.studentsWithoutActiveGroup.byReason).toEqual(list.byReason);
    expect(rep.studentsWithoutActiveGroup.items.find((i) => i.studentId === 'a5')).toEqual({ studentId: 'a5', reason: 'group_deleted', groupId: 'gDel' });
    expect(JSON.stringify(rep.studentsWithoutActiveGroup)).not.toContain('@'); // IDs only
    expect(rep.doesNotFit.groupMissing.items).toContainEqual({ studentId: 'a5', groupId: 'gDel' });
    expect(rep.doesNotFit).toHaveProperty('classMemberMissing');
  });
});
