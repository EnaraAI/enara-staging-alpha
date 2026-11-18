import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ctx, expectSame, setSwitches, startFixture, stopFixture } from './step5.helpers';
import { ALL7, addUser, allOff, call, multi, multiOffOn } from './step6.helpers';

// Multi-class step 6: the ENROLLMENT_MULTI_CLASS switch.
//   - Off (the default): nothing changes; the new routes say so.
//   - It takes effect only with dual write on and all seven step 5 features in
//     ENROLLMENT_READ_FROM; otherwise it is treated as off, with one warning.
//   - On, for a school where every student is single-class (the step 5
//     fixture, every shape): every reply is byte-identical to the switch off.
//     That includes a3, who is in group gA2 and on class cA's own list, so is
//     in two classes the old way, and has an attempt on an assessment that both
//     of a3's classes set (it is NOT folded: a3 is single-class).

const NOW = new Date('2026-11-17T12:00:00Z');
const DAY = 86_400_000;
const STUDENTS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b1'];
const TEACHER = 'teacher@a.test';

beforeAll(async () => {
  await startFixture();
  const { Assignment } = await import('../../src/models/Assignment');
  const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
  const { AssessmentVersion } = await import('../../src/models/Assessment');
  const { LearningIntervention } = await import('../../src/models/LearningIntervention');
  const { TutorSession } = await import('../../src/models/TutorSession');
  const { UsageEvent } = await import('../../src/models/UsageEvent');
  const { ParentLearnerLink } = await import('../../src/models/ParentLearnerLink');
  const teacherId = (await ctx.M.User.findOne({ email: TEACHER }).lean())._id.toString();
  for (const school of ['A', 'B']) await ctx.M.Institution.updateOne({ id: school }, { $set: { 'features.adaptive_pedagogy_enabled': true, 'features.connected_workflow_enabled': true, 'features.study_plans_enabled': true } });
  await AssessmentVersion.create({ assessmentId: 'asG', institutionId: 'A', version: 1, title: 'Assessment asG', questions: [] });
  // The same assessment set in cA and cA2 (a3 is in both, the old way).
  const asg = (id: string, classId: string, dueIn: number) =>
    Assignment.create({ id, institutionId: 'A', assessmentId: 'asG', assessmentVersion: 1, title: `Assignment ${id}`, classId, state: 'published', opensAt: new Date(NOW.getTime() - 10 * DAY), dueAt: new Date(NOW.getTime() + dueIn * DAY), createdBy: teacherId });
  await asg('sw1', 'cA', 3);
  await asg('sw2', 'cA2', 4);
  await AssessmentAttempt.create({ id: 'swt1', assessmentId: 'asG', assessmentTitle: 'Assessment asG', studentId: 'a3', institutionId: 'A', assignmentId: 'sw1', status: 'submitted', gradingStatus: 'released', submittedAt: new Date(NOW.getTime() - DAY), score: 70, answers: [] });
  await LearningIntervention.create({ id: 'int1', institutionId: 'A', studentId: 'a3', interventionType: 'review', status: 'assigned', assignedBy: 'teacher', assignedByUserId: 'someone-else', courseId: 'cA2', sourceEvidenceIds: [], tutorSessionIds: [], history: [] });
  await TutorSession.create({ id: 'ts-a3', studentId: 'a3', institutionId: 'A', courseId: 'cA', title: 'Chat', lastMessageAt: new Date(NOW.getTime() - DAY), messages: [{ id: 'm1', role: 'user', text: 'hello', timestamp: new Date(NOW.getTime() - DAY) }] });
  await UsageEvent.create({ id: 'ue1', userId: 'u', studentId: 'a3', institutionId: 'A', feature: 'chat', requestId: 'r1', sessionId: 'ts-a3', creditsUsed: 5, status: 'settled', timestamp: new Date(NOW.getTime() - DAY) });
  const parent = await addUser('parent@p.test', 'parent');
  await ParentLearnerLink.create({ id: 'pl-a3', parentUserId: parent._id.toString(), studentId: 'a3', institutionId: 'A', role: 'owner', status: 'active' });
}, 120_000);

afterAll(stopFixture);

describe('step 6 switch', () => {
  it('is off by default: the status says so, the admin routes are hidden, students see nothing new', async () => {
    allOff();
    expect((await call('admin@a.test', 'get', '/api/multi-class/status')).body).toEqual({ multiClass: false });
    expect((await call('a1@t.test', 'get', '/api/multi-class/me/classes')).body).toEqual({ enabled: false });
    const list = await call('admin@a.test', 'get', '/api/multi-class/students/a1/enrollments');
    expect([list.status, list.body.error?.code]).toEqual([404, 'FEATURE_DISABLED']);
    const add = await call('admin@a.test', 'post', '/api/multi-class/students/a1/enrollments', { scope: 'group', targetId: 'gA2' });
    expect([add.status, add.body.error?.code]).toEqual([404, 'FEATURE_DISABLED']);
    expect(await ctx.M.ClassEnrollment.countDocuments({ studentId: 'a1', targetId: 'gA2' })).toBe(0);
  });

  it('is ignored (and a warning logged once) unless dual write is on and all seven features read from enrollments', async () => {
    const { logger } = await import('../../src/utils/logging');
    const { multiClassOn, resetMultiClassWarningForTests } = await import('../../src/services/enrollmentReads');
    const warn = vi.spyOn(logger, 'warn');
    resetMultiClassWarningForTests();
    for (const vars of [
      { ENROLLMENT_MULTI_CLASS: 'true' },
      { ENROLLMENT_MULTI_CLASS: 'true', ENROLLMENT_DUAL_WRITE: 'true', ENROLLMENT_READ_FROM: ALL7.split(',').slice(0, 6).join(',') },
      { ENROLLMENT_MULTI_CLASS: 'true', ENROLLMENT_DUAL_WRITE: undefined, ENROLLMENT_READ_FROM: ALL7 },
    ]) {
      setSwitches(vars);
      expect(multiClassOn()).toBe(false);
      expect((await call('admin@a.test', 'get', '/api/multi-class/status')).body).toEqual({ multiClass: false });
    }
    const ignored = warn.mock.calls.filter((c) => c[0] === 'enrollment_multi_class_ignored');
    expect(ignored).toHaveLength(1);
    expect(ignored[0][1]).toMatchObject({ missingReadFrom: ['student_app', 'teacher_rosters', 'assessments', 'analytics', 'profile_context', 'credits', 'attendance'], dualWrite: false });
    multi(true);
    expect(multiClassOn()).toBe(true);
    allOff();
    warn.mockRestore();
  });

  it('on, with only single-class students: every page is byte-identical to off', async () => {
    const calls: [string, string][] = [];
    for (const s of STUDENTS) {
      for (const p of ['/api/me', '/api/me/courses', '/api/me/dashboard', '/api/me/assessments', '/api/me/results', '/api/me/assignments', '/api/me/next-steps']) calls.push([`${s}@t.test`, p]);
      calls.push([`${s}@t.test`, '/api/me/courses/cA']);
      calls.push([`${s}@t.test`, '/api/me/assignments/sw1']);
      calls.push([`${s}@t.test`, '/api/me/assignments/sw2']);
      calls.push([`${s}@t.test`, '/api/me/study-plan']);
    }
    for (const u of [TEACHER, 'admin@a.test', 'admin@b.test']) {
      for (const s of STUDENTS) {
        calls.push([u, `/api/teaching/students/${s}/profile`]);
        calls.push([u, `/api/learning/students/${s}/interventions`]);
        calls.push([u, `/api/learning/students/${s}/timeline`]);
        calls.push([u, `/api/teaching/students/${s}/study-plan`]);
      }
      for (const c of ['cA', 'cA2', 'cA3', 'cA4', 'cB']) {
        calls.push([u, `/api/teaching/classes/${c}/roster`]);
        calls.push([u, `/api/teacher/attendance/roster?courseInstanceId=${c}&date=2026-11-17`]);
      }
      calls.push([u, '/api/teaching/overview']);
      calls.push([u, '/api/assignments/sw1']);
      calls.push([u, '/api/assignments/sw2']);
      calls.push([u, '/api/teacher/attendance/classes']);
    }
    for (const u of ['admin@a.test', 'admin@b.test']) {
      calls.push([u, '/api/credits']);
      calls.push([u, '/api/analytics/overview']);
      calls.push([u, '/api/age-bands']);
      calls.push([u, '/api/learning/analytics/school']);
      for (const s of STUDENTS) calls.push([u, `/api/analytics/students/${s}`]);
    }
    for (const p of ['progress', 'activity', 'activity?classId=cA', 'home']) calls.push(['parent@p.test', `/api/parents/learners/a3/${p}`]);
    const { clearWeeklySummaryCache } = await import('../../src/services/classSummaryService');
    clearWeeklySummaryCache();
    const r = await multiOffOn(calls, { now: NOW });
    expectSame(r);
    // The fixture really exercises the paths that change for multi-class students.
    const at = (u: string, p: string) => r.off.find((x) => x.u === u && x.p === p)!;
    expect(at('a3@t.test', '/api/me/assignments').body.assignments.map((a: { id: string }) => a.id)).toEqual(['sw1', 'sw2']); // not folded
    expect(at(TEACHER, '/api/assignments/sw2').body.roster.find((x: { studentId: string }) => x.studentId === 'a3').status).toBe('not_started'); // not shared
    expect(at(TEACHER, '/api/teaching/students/a3/profile').body.results).toHaveLength(1);
    expect(JSON.stringify(at(TEACHER, '/api/learning/students/a3/interventions').body)).toContain('int1');
    expect(at('parent@p.test', '/api/parents/learners/a3/activity').status).toBe(200);
    expect(at('parent@p.test', '/api/parents/learners/a3/activity').body.sessions).toHaveLength(1);
    expect(at('admin@a.test', '/api/credits').status).toBe(200);
    const statuses: Record<string, number> = {};
    for (const x of r.off) statuses[x.status] = (statuses[x.status] ?? 0) + 1;
    console.log(`[step6 switch] ${r.off.length} replies compared, by status: ${JSON.stringify(statuses)}`);
    expect(statuses[200]).toBeGreaterThan(r.off.length * 0.6);
  }, 180_000);

  it('on: single-class students get no switcher and cannot pick a class', async () => {
    multi(true);
    for (const s of ['a1', 'a3', 'a4']) {
      const r = await call(`${s}@t.test`, 'get', '/api/multi-class/me/classes');
      expect(r.body).toMatchObject({ enabled: true, showSwitcher: false, current: null });
    }
    const put = await call('a3@t.test', 'put', '/api/multi-class/me/classes/current', { classId: 'cA' });
    expect([put.status, put.body.error?.code]).toEqual([409, 'SINGLE_CLASS']);
    const { StudentClassChoice } = await import('../../src/models/StudentClassChoice');
    await call('a3@t.test', 'get', '/api/me/courses/cA');
    expect(await StudentClassChoice.countDocuments({})).toBe(0);
    allOff();
  });
});
