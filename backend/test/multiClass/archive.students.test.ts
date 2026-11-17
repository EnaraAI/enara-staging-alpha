import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ON, api, ctx, enrollmentRows, expectConsistent, login, mkClass, mkGroup, mkStudent, setSwitches, startArchiveFixture, stopFixture } from './archive.helpers';

// Multi-class step 6, ENROLLMENT_STUDENT_ARCHIVE (decision C): "Archive
// student" is the normal action (account closed, enrollments ended, history,
// grades and parent link kept, restorable); "Delete permanently" is for school
// and ENARA admins with a typed confirmation, and leaves no ghosts.

beforeAll(startArchiveFixture, 120_000);
afterAll(stopFixture);
beforeEach(() => setSwitches(ALL_ON));

async function setup() {
  const g = await mkGroup();
  const c1 = await mkClass(g);
  const c2 = await mkClass(await mkGroup());
  const s = await mkStudent({ batchId: g });
  await api('admin@a.test', 'post', `/api/course-instances/${c2}/students`, { studentId: s.id });
  await ctx.M.ParentLearnerLink.create({ id: `pl-${s.id}`, parentUserId: 'parent-1', studentId: s.id, institutionId: 'A', role: 'owner', status: 'active' });
  await ctx.M.AssessmentAttempt.collection.insertOne({ id: `att-${s.id}`, studentId: s.id, institutionId: 'A', assessmentId: 'asG', score: 70 });
  return { g, c1, c2, s };
}
const ids = (r: { body: { id: string }[] }) => r.body.map((x) => x.id);
const seats = async () => (await api('admin@a.test', 'get', '/api/usage/seats')).body.seats;

describe('archive and restore a student', () => {
  it('closes the account, ends enrollments, leaves rosters and seats; keeps grades, parent link and history', async () => {
    const { g, c1, c2, s } = await setup();
    const seatsBefore = await seats();
    const countBefore = (await ctx.M.Batch.findOne({ id: g }).lean()).studentCount;
    const oldToken = ctx.tokens[s.email];
    await expectConsistent();

    const a = await api('admin@a.test', 'post', `/api/students/${s.id}/archive`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ group: g, classesLeft: 1, enrollmentsEnded: 2, accountsClosed: 1 });
    // Account closed: no sign-in, and the old session ends.
    expect((await ctx.M.User.findOne({ studentId: s.id }).lean()).status).toBe('disabled');
    expect(await login(s.email)).not.toBe(200);
    ctx.tokens[s.email] = oldToken;
    expect((await api(s.email, 'get', '/api/me/courses')).status).toBe(401);
    // Rosters and seats.
    const st = await ctx.M.Student.findOne({ id: s.id }).lean();
    expect([st.batchId, !!st.archivedAt, st.archive.batchId, st.archive.classIds]).toEqual([undefined, true, g, [c2]]);
    expect((await ctx.M.CourseInstance.findOne({ id: c2 }).lean()).studentIds).not.toContain(s.id);
    const { classStudentIds } = await import('../../src/services/learningAccess');
    for (const c of [c1, c2]) expect(await classStudentIds(await ctx.M.CourseInstance.findOne({ id: c }).lean())).not.toContain(s.id);
    expect((await ctx.M.Batch.findOne({ id: g }).lean()).studentCount).toBe(countBefore - 1);
    expect(await seats()).toBe(seatsBefore - 1);
    expect((await enrollmentRows(s.id)).map((r: { status: string; endedAt?: Date }) => [r.status, !!r.endedAt])).toEqual([['inactive', true], ['inactive', true]]);
    // Kept: grades, parent link, the record itself (history view).
    expect(await ctx.M.AssessmentAttempt.countDocuments({ studentId: s.id })).toBe(1);
    expect(await ctx.M.ParentLearnerLink.countDocuments({ studentId: s.id })).toBe(1);
    expect((await api('admin@a.test', 'get', `/api/students/${s.id}`)).status).toBe(200);
    // Lists: hidden normally, visible on request.
    expect(ids(await api('admin@a.test', 'get', '/api/students?limit=100'))).not.toContain(s.id);
    expect(ids(await api('admin@a.test', 'get', '/api/students?archived=only&limit=100'))).toEqual([s.id]);
    expect(ids(await api('admin@a.test', 'get', '/api/students?includeArchived=true&limit=100'))).toContain(s.id);
    // Not "unplaced": archived students are not in the list of students to place.
    expect((await api('admin@a.test', 'get', '/api/students/without-active-group')).body.students.map((x: { studentId: string }) => x.studentId)).not.toContain(s.id);
    // Can't be put back into a group or class while archived.
    expect((await api('admin@a.test', 'patch', `/api/students/${s.id}`, { batchId: g })).body.error.code).toBe('STUDENT_ARCHIVED');
    expect((await api('admin@a.test', 'post', `/api/course-instances/${c2}/students`, { studentId: s.id })).body.error.code).toBe('STUDENT_ARCHIVED');
    expect((await api('admin@a.test', 'post', `/api/students/${s.id}/archive`)).body.error.code).toBe('ALREADY_ARCHIVED');
    await expectConsistent();

    const r = await api('admin@a.test', 'post', `/api/students/${s.id}/restore`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ group: g, classes: [c2], enrollmentsReactivated: 2, accountsReopened: 1, skipped: [] });
    expect(await login(s.email)).toBe(200);
    expect((await ctx.M.Student.findOne({ id: s.id }).lean()).batchId).toBe(g);
    expect((await ctx.M.CourseInstance.findOne({ id: c2 }).lean()).studentIds).toContain(s.id);
    expect((await ctx.M.Batch.findOne({ id: g }).lean()).studentCount).toBe(countBefore);
    expect(await seats()).toBe(seatsBefore);
    expect((await enrollmentRows(s.id)).map((x: { status: string }) => x.status)).toEqual(['active', 'active']);
    expect(ids(await api('admin@a.test', 'get', '/api/students?limit=100'))).toContain(s.id);
    await expectConsistent();
  });

  it('restore reactivates only what the archive ended; a group archived meanwhile is skipped', async () => {
    const { g, c2, s } = await setup();
    // An older class membership that had already ended stays ended.
    const c3 = await mkClass(await mkGroup());
    await api('admin@a.test', 'post', `/api/course-instances/${c3}/students`, { studentId: s.id });
    await api('admin@a.test', 'delete', `/api/course-instances/${c3}/students/${s.id}`);
    await api('admin@a.test', 'post', `/api/students/${s.id}/archive`);
    // Last student gone: the group can now be archived on its own.
    expect((await api('admin@a.test', 'post', `/api/batches/${g}/archive`)).status).toBe(200);
    const r = await api('admin@a.test', 'post', `/api/students/${s.id}/restore`);
    expect(r.body.group).toBeNull();
    expect(r.body.skipped).toEqual([{ kind: 'group', id: g, reason: 'archived' }]);
    expect(r.body.classes).toEqual([c2]);
    const rows = Object.fromEntries((await enrollmentRows(s.id)).map((x: { targetId: string; status: string }) => [x.targetId, x.status]));
    expect(rows).toEqual({ [g]: 'inactive', [c2]: 'active', [c3]: 'removed' });
    expect((await api('admin@a.test', 'get', '/api/students/without-active-group')).body.students.find((x: { studentId: string }) => x.studentId === s.id)).toMatchObject({ reason: 'no_group' });
    await expectConsistent();
  });

  it('only admins of the student\'s school (or ENARA admins) can archive or restore', async () => {
    const s = await mkStudent();
    expect((await api('teacher@a.test', 'post', `/api/students/${s.id}/archive`)).status).toBe(403);
    expect((await api('admin@b.test', 'post', `/api/students/${s.id}/archive`)).status).toBe(404);
    expect((await api('enara@x.test', 'post', `/api/students/${s.id}/archive`)).status).toBe(200);
    expect((await api('admin@b.test', 'post', `/api/students/${s.id}/restore`)).status).toBe(404);
    expect(ids(await api('admin@b.test', 'get', '/api/students?archived=only'))).toEqual([]);
    expect((await api('admin@a.test', 'post', `/api/students/${s.id}/restore`)).status).toBe(200);
  });
});

describe('delete permanently', () => {
  it('needs the typed confirmation and an admin of the school', async () => {
    const s = await mkStudent();
    let r = await api('admin@a.test', 'delete', `/api/students/${s.id}`);
    expect([r.status, r.body.error.code, r.body.error.details.confirm]).toEqual([400, 'CONFIRMATION_REQUIRED', `DELETE ${s.id}`]);
    r = await api('admin@a.test', 'delete', `/api/students/${s.id}`, { confirm: 'DELETE someone-else' });
    expect(r.status).toBe(400);
    expect((await api('teacher@a.test', 'delete', `/api/students/${s.id}`, { confirm: `DELETE ${s.id}` })).status).toBe(403);
    expect((await api(s.email, 'delete', `/api/students/${s.id}`, { confirm: `DELETE ${s.id}` })).status).toBe(403);
    expect((await api('admin@b.test', 'delete', `/api/students/${s.id}`, { confirm: `DELETE ${s.id}` })).status).toBe(404);
    expect(await ctx.M.Student.exists({ id: s.id })).toBeTruthy();
  });

  for (const archivedFirst of [false, true]) {
    it(`removes every reference and leaves no ghosts${archivedFirst ? ' (student archived first)' : ''}`, async () => {
      const { g, c2, s } = await setup();
      // Another class's archive record and a per-student assignment list name the student too.
      const c4 = await mkClass(await mkGroup());
      await api('admin@a.test', 'post', `/api/course-instances/${c4}/students`, { studentId: s.id });
      await api('admin@a.test', 'post', `/api/course-instances/${c4}/archive`);
      await ctx.M.UsageLedger.collection.insertOne({ id: `ul-${s.id}`, operationKey: `op-${s.id}`, studentId: s.id, userId: 'u1', institutionId: 'A', feature: 'tutor', amount: 3 });
      const countBefore = (await ctx.M.Batch.findOne({ id: g }).lean()).studentCount;
      if (archivedFirst) await api('admin@a.test', 'post', `/api/students/${s.id}/archive`);

      const r = await api('admin@a.test', 'delete', `/api/students/${s.id}`, { confirm: `DELETE ${s.id}` });
      expect(r.status).toBe(200);
      expect(r.body.removed).toMatchObject({ student: 1, user_accounts: 1, parent_learner_links: 1, assessment_attempts: 1 });
      expect(r.body.removed.class_enrollments).toBeGreaterThanOrEqual(2);
      // No ghosts anywhere.
      expect(await ctx.M.Student.countDocuments({ id: s.id })).toBe(0);
      expect(await ctx.M.CourseInstance.countDocuments({ studentIds: s.id })).toBe(0);
      expect(await ctx.M.CourseInstance.countDocuments({ 'archive.memberIds': s.id })).toBe(0);
      expect(await ctx.M.Batch.countDocuments({ 'archive.memberIds': s.id })).toBe(0);
      expect(await ctx.M.ClassEnrollment.countDocuments({ studentId: s.id })).toBe(0);
      expect(await ctx.M.ParentLearnerLink.countDocuments({ studentId: s.id })).toBe(0);
      expect(await ctx.M.User.countDocuments({ $or: [{ studentId: s.id }, { email: s.email }] })).toBe(0);
      expect(await ctx.M.AssessmentAttempt.countDocuments({ studentId: s.id })).toBe(0);
      expect((await ctx.M.Batch.findOne({ id: g }).lean()).studentCount).toBe(countBefore - 1);
      expect((await ctx.M.CourseInstance.findOne({ id: c2 }).lean()).studentIds).not.toContain(s.id);
      // The append-only usage ledger is kept unchanged (reported for the owner to decide).
      expect(r.body.kept).toEqual({ usage_ledger_rows_with_ids: 1, safety_alerts: 0 });
      expect(await ctx.M.UsageLedger.collection.countDocuments({ id: `ul-${s.id}` })).toBe(1);
      // The deletion itself is audited with IDs and counts only.
      const audit = await ctx.M.AuditEvent.findOne({ action: 'student.deleted_permanently', targetId: s.id }).lean();
      expect(audit).toBeTruthy();
      expect(JSON.stringify(audit.detail)).not.toContain('@');
      // The student can't sign in again (no account is re-created on login).
      expect(await login(s.email)).not.toBe(200);
      expect(await ctx.M.Student.countDocuments({ email: s.email })).toBe(0);
      await expectConsistent();
    });
  }
});
