import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, expectSame, get, ignoredSeen, offOn, offOnWith, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 5, feature 2: teacher_rosters. With the feature on, "who is
// in this class" (classStudentIds, the time-to-understand roster) and "may this
// teacher read this student" come from class_enrollments. For every
// single-class shape the JSON must be byte-identical; only IGNORED_KEYS may
// differ. The clock is frozen for both runs where replies carry times.

const NOW = new Date();
const TEACHER = 'teacher@a.test';
const ADMIN = 'admin@a.test';
const STUDENT_IDS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b1'];
const CLASSES = ['cA', 'cA2', 'cA3', 'cA4', 'cB'];

beforeAll(async () => {
  await startFixture();
  const { Assignment } = await import('../../src/models/Assignment');
  const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
  const { TimeToUnderstand } = await import('../../src/models/TimeToUnderstand');
  const day = 86_400_000;
  const teacherId = (await ctx.M.User.findOne({ email: TEACHER }).lean())._id.toString();
  // Assignments for whole classes (members come from the roster) and one for chosen students.
  const asg = (id: string, classId: string, dueIn: number, extra: Record<string, unknown> = {}) =>
    Assignment.create({ id, institutionId: 'A', assessmentId: 'asG', assessmentVersion: 1, title: `Assignment ${id}`, classId, opensAt: new Date(NOW.getTime() - 10 * day), dueAt: new Date(NOW.getTime() + dueIn * day), createdBy: teacherId, ...extra });
  await asg('asg1', 'cA', 3);
  await asg('asg2', 'cA', -2);
  await asg('asg3', 'cA2', 5);
  await asg('asg4', 'cA4', 1);
  await asg('asg5', 'cA', 2, { studentIds: ['a2'] });
  await AssessmentAttempt.create({ id: 'att1', assessmentId: 'asG', assessmentTitle: 'Assessment asG', studentId: 'a1', institutionId: 'A', assignmentId: 'asg2', status: 'submitted', submittedAt: new Date(NOW.getTime() - 3 * day), score: 80, answers: [] });
  const ttu = (id: string, studentId: string, status: string, secs: number) =>
    TimeToUnderstand.create({ id, institutionId: 'A', studentId, objectiveId: 'obj1', gapDetectedAt: new Date(NOW.getTime() - 5 * day), status, activeInstructionSeconds: secs, elapsedSeconds: secs * 3, strategiesUsed: ['worked_example'], measurementVersion: 'v1', lastComputedAt: NOW });
  await ttu('t1', 'a1', 'verified', 600);
  await ttu('t2', 'a2', 'verified', 1200);
  await ttu('t3', 'a3', 'abandoned', 0);
  await ttu('t4', 'a4', 'verified', 300);
  await ttu('t5', 'a5', 'verified', 900);
  await ttu('t6', 'a6', 'in_progress', 100);
}, 120_000);

afterAll(async () => {
  console.log(`[step5 teacher_rosters] ignored keys: ${[...ignoredSeen].join(', ') || 'none'}`);
  await stopFixture();
});

describe('teacher_rosters: same answers off and on', () => {
  it('class rosters, overview, learner profiles (allowed and refused), as teacher and admin', async () => {
    const calls: [string, string][] = [];
    for (const u of [TEACHER, ADMIN, 'admin@b.test']) {
      for (const c of CLASSES) calls.push([u, `/api/teaching/classes/${c}/roster`]);
      calls.push([u, '/api/teaching/overview']);
      for (const s of STUDENT_IDS) calls.push([u, `/api/teaching/students/${s}/profile`]);
    }
    const r = await offOn('teacher_rosters', calls, { now: NOW });
    expectSame(r);
    // The fixture really exercises the rule.
    const at = (u: string, p: string) => r.off.find((x) => x.u === u && x.p === p)!;
    expect(JSON.stringify(at(TEACHER, '/api/teaching/classes/cA/roster').body)).toContain('a6');
    expect(JSON.stringify(at(TEACHER, '/api/teaching/classes/cA4/roster').body)).toContain('a5');
    expect(at(TEACHER, '/api/teaching/students/a1/profile').status).toBe(200); // through the group
    expect(at(TEACHER, '/api/teaching/students/a2/profile').status).toBe(200); // explicit
    expect(at(TEACHER, '/api/teaching/students/a5/profile').status).toBe(200); // deleted group's class
    expect(at(TEACHER, '/api/teaching/students/a4/profile').status).toBe(404); // in no class
    expect(at(TEACHER, '/api/teaching/students/b1/profile').status).toBe(404); // other school
  }, 120_000);

  it('time to understand by course, assignments and their per-student statuses', async () => {
    const calls: [string, string][] = [];
    for (const u of [TEACHER, ADMIN]) {
      calls.push([u, '/api/learning/analytics/ttu']);
      for (const c of CLASSES) calls.push([u, `/api/learning/analytics/ttu?courseId=${c}`]);
      for (const c of CLASSES) calls.push([u, `/api/assignments?classId=${c}`]);
      for (const a of ['asg1', 'asg2', 'asg3', 'asg4', 'asg5']) calls.push([u, `/api/assignments/${a}`]);
    }
    const r = await offOn('teacher_rosters', calls, { now: NOW });
    expectSame(r);
    const ttu = r.off.find((x) => x.u === TEACHER && x.p === '/api/learning/analytics/ttu?courseId=cA')!.body as { counts: { verified: number } };
    expect(ttu.counts.verified).toBe(2); // a1 (group) and a2 (explicit); not a4
  }, 120_000);

  it('educator analytics class scope (withMembers) is identical', async () => {
    const { analyticsScope } = await import('../../src/services/educatorAnalytics');
    const users: Record<string, unknown> = {};
    for (const email of [TEACHER, ADMIN]) {
      const u = await ctx.M.User.findOne({ email }).lean();
      users[email] = { id: u._id.toString(), role: u.role, institutionId: u.institutionId, email };
    }
    const r = await offOnWith('teacher_rosters', (u, p) => analyticsScope({ user: users[u] } as never, p === 'all' ? 'how is my class doing' : `how is ${p}`, p === 'all' ? undefined : p), [
      [TEACHER, 'all'], [TEACHER, 'cA'], [TEACHER, 'cA4'], [ADMIN, 'all'], [ADMIN, 'cA3'],
    ]);
    expectSame(r);
    expect(JSON.stringify(r.off[0].body)).toContain('a6');
  });

  it('classStudentIds gives the same ids in the same order (explicit first, then the group in insertion order)', async () => {
    const { classStudentIds } = await import('../../src/services/learningAccess');
    const classes = await ctx.M.CourseInstance.find().sort({ id: 1 }).lean();
    const r = await offOnWith('teacher_rosters', async (id) => classStudentIds(classes.find((c: { id: string }) => c.id === id)), classes.map((c: { id: string }) => [c.id, ''] as [string, string]));
    expectSame(r);
    expect(r.off.find((x) => x.u === 'cA')!.body).toEqual(['a2', 'a3', 'a1', 'a6']);
  });

  it('the step 4 shadow check runs only while the old path is used', async () => {
    const { flushShadowCounts } = await import('../../src/services/enrollmentShadow');
    const { EnrollmentShadowStat } = await import('../../src/models/EnrollmentShadowStat');
    const checks = async () => {
      await flushShadowCounts();
      const rows = await EnrollmentShadowStat.find({ feature: { $in: ['class_roster', 'pedagogy_roster', 'student_classes'] } }).lean();
      return Object.fromEntries(['class_roster', 'pedagogy_roster', 'student_classes'].map((f) => [f, rows.filter((r) => r.feature === f).reduce((n, r) => n + (r.checks ?? 0), 0)]));
    };
    const pages = async () => {
      await get(TEACHER, '/api/teaching/classes/cA/roster');
      await get(TEACHER, '/api/learning/analytics/ttu?courseId=cA');
      await get(TEACHER, '/api/teaching/students/a1/profile');
    };
    const start = await checks();
    setSwitches({ ENROLLMENT_SHADOW: 'true' });
    await pages();
    const offRun = await checks();
    setSwitches({ ENROLLMENT_SHADOW: 'true', ENROLLMENT_READ_FROM: 'teacher_rosters' });
    await pages();
    const onRun = await checks();
    setSwitches({ ENROLLMENT_SHADOW: undefined, ENROLLMENT_READ_FROM: undefined });
    for (const f of ['class_roster', 'pedagogy_roster', 'student_classes']) expect(offRun[f], f).toBeGreaterThan(start[f]);
    // teacher_rosters reads are no longer shadowed. (The profile page's own
    // student_app read is still on the old path, so student_classes keeps counting.)
    expect(onRun.class_roster).toBe(offRun.class_roster);
    expect(onRun.pedagogy_roster).toBe(offRun.pedagogy_roster);
    expect(await EnrollmentShadowStat.countDocuments({ mismatches: { $gt: 0 } })).toBe(0);
  });

  it('switching back returns the old answer', async () => {
    const before = await get(TEACHER, '/api/teaching/classes/cA/roster');
    setSwitches({ ENROLLMENT_READ_FROM: 'teacher_rosters' });
    await get(TEACHER, '/api/teaching/classes/cA/roster');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    expect(await get(TEACHER, '/api/teaching/classes/cA/roster')).toEqual(before);
  });

  it('with the feature on, the answer really comes from enrollments', async () => {
    // Drift on purpose: the old field says a4 is in gA; enrollments don't.
    await ctx.M.Student.updateOne({ id: 'a4' }, { $set: { batchId: 'gA' } });
    const off = [await get(TEACHER, '/api/teaching/classes/cA/roster'), await get(TEACHER, '/api/teaching/students/a4/profile')];
    setSwitches({ ENROLLMENT_READ_FROM: 'teacher_rosters' });
    const on = [await get(TEACHER, '/api/teaching/classes/cA/roster'), await get(TEACHER, '/api/teaching/students/a4/profile')];
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    await ctx.M.Student.updateOne({ id: 'a4' }, { $unset: { batchId: 1 } });
    expect(JSON.stringify(off[0].body)).toContain('"a4"');
    expect(off[1].status).toBe(200);
    expect(JSON.stringify(on[0].body)).not.toContain('"a4"');
    expect(on[1].status).toBe(404);
  });

  it("school isolation: another school's enrollment never shows up", async () => {
    // A row claiming b1 is in school A's class cA, but filed under school B.
    await ctx.M.ClassEnrollment.create({ id: 'enr_x', institutionId: 'B', studentId: 'b1', scope: 'class', targetId: 'cA', status: 'active', source: 'manual', startedAt: new Date() });
    await ctx.M.ClassEnrollment.create({ id: 'enr_y', institutionId: 'B', studentId: 'b1', scope: 'group', targetId: 'gA', status: 'active', source: 'manual', startedAt: new Date() });
    setSwitches({ ENROLLMENT_READ_FROM: 'teacher_rosters' });
    const roster = await get(TEACHER, '/api/teaching/classes/cA/roster');
    const ttu = await get(ADMIN, '/api/learning/analytics/ttu?courseId=cA');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    await ctx.M.ClassEnrollment.deleteMany({ id: { $in: ['enr_x', 'enr_y'] } });
    expect(JSON.stringify(roster.body)).not.toContain('b1');
    expect(roster.status).toBe(200);
    expect(ttu.status).toBe(200);
  });
});
