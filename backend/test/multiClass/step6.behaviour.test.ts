import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, startFixture, stopFixture } from './step5.helpers';
import { addUser, allOff, call, multi } from './step6.helpers';

// Multi-class step 6: a student in 2 groups and 3 classes, checked against the
// approved answers Q1-Q9 (docs/multi-class/PLAN.md §9).
//
// a1 starts in group gA (class cA). An admin adds a1 to group gA2 (class cA2)
// and to class cA3: a1 is then in groups gA + gA2 and classes cA, cA2, cA3.
// Teacher 1 (teacher@a.test) teaches cA; teacher 2 teaches cA2. a6 stays a
// single-class student (group gA only); a3 is single-class the old way (group
// gA2 plus cA's own list).

const NOW = new Date();
const DAY = 86_400_000;
const T1 = 'teacher@a.test';
const T2 = 'teacher2@a.test';
const ADMIN = 'admin@a.test';
let t1Id = '';
let t2Id = '';

beforeAll(async () => {
  await startFixture();
  const { Assignment } = await import('../../src/models/Assignment');
  const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
  const { AssessmentVersion } = await import('../../src/models/Assessment');
  const { LearningIntervention } = await import('../../src/models/LearningIntervention');
  const { TutorSession } = await import('../../src/models/TutorSession');
  const { UsageEvent } = await import('../../src/models/UsageEvent');
  const { ParentLearnerLink } = await import('../../src/models/ParentLearnerLink');
  for (const school of ['A', 'B']) await ctx.M.Institution.updateOne({ id: school }, { $set: { 'features.adaptive_pedagogy_enabled': true, 'features.connected_workflow_enabled': true, 'features.study_plans_enabled': true } });
  t1Id = (await ctx.M.User.findOne({ email: T1 }).lean())._id.toString();
  t2Id = (await addUser(T2, 'teacher', 'A'))._id.toString();
  await ctx.M.CourseInstance.updateOne({ id: 'cA' }, { $set: { instructorIds: [t1Id] } });
  await ctx.M.CourseInstance.updateOne({ id: 'cA2' }, { $set: { instructorIds: [t2Id] } });
  await ctx.M.Batch.updateOne({ id: 'gA' }, { $set: { learnerAgeBand: 'teen' } });
  await ctx.M.Batch.updateOne({ id: 'gA2' }, { $set: { learnerAgeBand: 'child' } });
  await ctx.M.Assessment.create({ id: 'asX', title: 'Assessment asX', subject: 'English', type: 'quiz', status: 'active', lifecycle: 'published', dueDate: '2026-12-01', institutionId: 'A', questions: [] });
  for (const id of ['asG', 'asX']) await AssessmentVersion.create({ assessmentId: id, institutionId: 'A', version: 1, title: `Assessment ${id}`, questions: [] });
  const asg = (id: string, classId: string, assessmentId: string, dueIn: number, by: string) =>
    Assignment.create({ id, institutionId: 'A', assessmentId, assessmentVersion: 1, title: `Assignment ${id}`, classId, state: 'published', opensAt: new Date(NOW.getTime() - 10 * DAY), dueAt: new Date(NOW.getTime() + dueIn * DAY), createdBy: by });
  await asg('q6a', 'cA', 'asG', 3, t1Id); // the same assessment in cA ...
  await asg('q6b', 'cA2', 'asG', 5, t2Id); // ... and in cA2
  await asg('q6d', 'cA2', 'asX', 4, t2Id); // only cA2
  await asg('q6e', 'cA2', 'asG2', 6, t2Id); // only cA2, not started
  // a1's work: on cA2's own assignment, and on gA2's group assessment (no assignment).
  const attempt = (id: string, studentId: string, assessmentId: string, assignmentId: string | undefined, score: number) =>
    AssessmentAttempt.create({ id, assessmentId, assessmentTitle: `Assessment ${assessmentId}`, studentId, institutionId: 'A', ...(assignmentId ? { assignmentId } : {}), status: 'submitted', gradingStatus: 'released', submittedAt: new Date(NOW.getTime() - DAY), score, answers: [] });
  await attempt('t-a1-d', 'a1', 'asX', 'q6d', 55);
  await attempt('t-a1-g2', 'a1', 'asG2', undefined, 65);
  await attempt('t-a3-d', 'a3', 'asX', 'q6d', 75); // a3 (single-class): teacher 1 keeps seeing it
  // Interventions: one by teacher 2 for cA2, one automatic.
  const base = { institutionId: 'A', studentId: 'a1', interventionType: 'review', status: 'assigned', sourceEvidenceIds: [], tutorSessionIds: [], history: [] };
  await LearningIntervention.create({ ...base, id: 'int-t2', objectiveId: 'obj-1', assignedBy: 'teacher', assignedByUserId: t2Id, courseId: 'cA2', note: 'from teacher 2' });
  await LearningIntervention.create({ ...base, id: 'int-sys', objectiveId: 'obj-2', assignedBy: 'system' });
  // Tutor sessions in cA, cA2 and in no class (sessions store the course id).
  const session = (id: string, courseId?: string) =>
    TutorSession.create({ id, studentId: 'a1', institutionId: 'A', ...(courseId ? { courseId } : {}), title: `Chat ${id}`, lastMessageAt: new Date(NOW.getTime() - DAY), messages: [{ id: `${id}-m`, role: 'user', text: 'hi', timestamp: new Date(NOW.getTime() - DAY) }] });
  await session('ts-cA', 'cA');
  await session('ts-cA2', 'cA2');
  await session('ts-none');
  // AI use (Q9): in cA's session, cA2's session, with no session, and one that stores the class id.
  const use = (id: string, credits: number, sessionId?: string, feature = 'chat') =>
    UsageEvent.create({ id, userId: 'u', studentId: 'a1', institutionId: 'A', feature, requestId: id, ...(sessionId ? { sessionId } : {}), creditsUsed: credits, status: 'settled', timestamp: new Date(NOW.getTime() - DAY) });
  await use('u1', 10, 'ts-cA');
  await use('u2', 20, 'ts-cA2');
  await use('u3', 5);
  await use('u4', 7, 'cA3', 'visualize');
  const parent = await addUser('parent@p.test', 'parent');
  for (const s of ['a1', 'a6']) await ParentLearnerLink.create({ id: `pl-${s}`, parentUserId: parent._id.toString(), studentId: s, institutionId: 'A', role: 'owner', status: 'active' });
  // Baselines before a1 becomes multi-class (Q1).
  multi(true);
  baseline.credits = (await call(ADMIN, 'get', '/api/credits')).body.summary.studentCount;
  baseline.overview = (await call(ADMIN, 'get', '/api/analytics/overview')).body.totals.students;
  baseline.school = (await call(ADMIN, 'get', '/api/learning/analytics/school')).body;
  // a1 joins a second group and a third class.
  for (const body of [{ scope: 'group', targetId: 'gA2' }, { scope: 'class', targetId: 'cA3' }]) {
    const r = await call(ADMIN, 'post', '/api/multi-class/students/a1/enrollments', body);
    if (r.status !== 201) throw new Error(`setup add failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
}, 120_000);

const baseline: { credits?: number; overview?: number; school?: unknown } = {};

afterAll(async () => {
  allOff();
  await stopFixture();
});

describe('the shape', () => {
  it('a1 is in 2 groups and 3 classes', async () => {
    const r = await call(ADMIN, 'get', '/api/multi-class/students/a1/enrollments');
    expect(r.body.groups.map((g: { id: string }) => g.id)).toEqual(['gA', 'gA2']);
    expect(r.body.classes.map((c: { id: string }) => c.id)).toEqual(['cA', 'cA2', 'cA3']);
    const courses = await call('a1@t.test', 'get', '/api/me/courses');
    expect(courses.body.map((c: { instanceId: string }) => c.instanceId)).toEqual(['cA3', 'cA2', 'cA']);
  });
});

describe('Q1 one seat per student', () => {
  it('school totals count a1 once', async () => {
    expect((await call(ADMIN, 'get', '/api/credits')).body.summary.studentCount).toBe(baseline.credits);
    expect((await call(ADMIN, 'get', '/api/analytics/overview')).body.totals.students).toBe(baseline.overview);
    const school = (await call(ADMIN, 'get', '/api/learning/analytics/school')).body;
    expect(JSON.stringify(school).match(/"studentsTotal":\d+/g)).toEqual(JSON.stringify(baseline.school).match(/"studentsTotal":\d+/g));
    expect(baseline.overview).toBe(6); // a1..a6 in school A
    expect(JSON.stringify(school)).toContain('"studentsTotal":6');
  });
});

describe('Q2 student app: last class used, switcher only with 2+ classes', () => {
  it('opens the most recent enrollment first, then the last class used; "All my classes" is one choice', async () => {
    let r = await call('a1@t.test', 'get', '/api/multi-class/me/classes');
    expect(r.body).toMatchObject({ enabled: true, showSwitcher: true, current: 'cA3', currentSource: 'most_recent_enrollment' });
    expect(r.body.classes.map((c: { id: string }) => c.id)).toEqual(['cA3', 'cA2', 'cA']);
    expect(r.body.classes.find((c: { id: string }) => c.id === 'cA2')).toMatchObject({ name: 'Course cA2', groupId: 'gA2', groupName: 'Group gA2' });
    r = await call('a1@t.test', 'put', '/api/multi-class/me/classes/current', { classId: 'cA' });
    expect(r.body).toMatchObject({ current: 'cA', currentSource: 'last_used' });
    await call('a1@t.test', 'get', '/api/me/courses/cA2'); // opening a class makes it the last used
    expect((await call('a1@t.test', 'get', '/api/multi-class/me/classes')).body.current).toBe('cA2');
    expect((await call('a1@t.test', 'put', '/api/multi-class/me/classes/current', { classId: 'all' })).body.current).toBe('all');
    expect((await call('a1@t.test', 'put', '/api/multi-class/me/classes/current', { classId: 'cB' })).status).toBe(404);
    expect((await call('a1@t.test', 'put', '/api/multi-class/me/classes/current', { classId: 'cA4' })).status).toBe(404);
  });

  it('a single-class student sees no switcher', async () => {
    expect((await call('a6@t.test', 'get', '/api/multi-class/me/classes')).body).toMatchObject({ showSwitcher: false, current: null });
  });
});

describe('Q3 parents: one view, activity labelled by class, filter only with 2+ classes', () => {
  it('sessions are labelled by class and can be filtered', async () => {
    const r = await call('parent@p.test', 'get', '/api/parents/learners/a1/activity');
    expect(r.status).toBe(200);
    const label = (id: string) => r.body.sessions.find((s: { id: string }) => s.id === id).class;
    expect(label('ts-cA')).toEqual({ id: 'cA', name: 'Course cA' });
    expect(label('ts-cA2')).toEqual({ id: 'cA2', name: 'Course cA2' });
    expect(label('ts-none')).toBeNull();
    expect(r.body.classes).toEqual({ items: [{ id: 'cA3', name: 'Course cA3' }, { id: 'cA2', name: 'Course cA2' }, { id: 'cA', name: 'Course cA' }], filter: null });
    const f = await call('parent@p.test', 'get', '/api/parents/learners/a1/activity?classId=cA2');
    expect(f.body.sessions.map((s: { id: string }) => s.id)).toEqual(['ts-cA2']);
    expect(f.body.classes.filter).toBe('cA2');
    expect(f.body.calendar).toEqual(r.body.calendar); // still one view of the child
  });

  it('results are labelled by class (assignment class, else the group assessment\'s class)', async () => {
    const r = await call('parent@p.test', 'get', '/api/parents/learners/a1/progress');
    const label = (id: string) => r.body.assessments.items.find((a: { id: string }) => a.id === id).class;
    expect(label('t-a1-d')).toEqual({ id: 'cA2', name: 'Course cA2' });
    expect(label('t-a1-g2')).toEqual({ id: 'cA2', name: 'Course cA2' });
    const f = await call('parent@p.test', 'get', '/api/parents/learners/a1/progress?classId=cA');
    expect(f.body.assessments.items).toEqual([]);
    expect(f.body.level).toEqual(r.body.level); // the level stays the child's
  });

  it('a single-class child: no labels and no filter', async () => {
    for (const p of ['activity', 'progress', 'activity?classId=cA']) {
      const r = await call('parent@p.test', 'get', `/api/parents/learners/a6/${p}`);
      expect(r.status).toBe(200);
      expect(r.body.classes).toBeUndefined();
      expect(JSON.stringify(r.body)).not.toContain('"class"');
    }
  });
});

describe('Q4 teachers: own class work plus the shared profile; admins see everything', () => {
  const profile = async (u: string, s = 'a1') => (await call(u, 'get', `/api/teaching/students/${s}/profile`)).body;
  const ids = (xs: { [k: string]: string }[], k: string) => xs.map((x) => x[k]).sort();

  it('teacher 1 (cA) sees cA work only', async () => {
    const p = await profile(T1);
    expect(p.classScope).toMatchObject({ restricted: true, classIds: ['cA'] });
    expect(ids(p.observed.classes, 'id')).toEqual(['cA']);
    expect(ids(p.observed.submissions, 'assignmentId')).toEqual(['q6a']);
    expect(p.results).toEqual([]); // a1's results are cA2's (q6d) and gA2's group assessment
    expect(ids(p.interventions, 'id')).toEqual(['int-sys']); // not teacher 2's
  });

  it('teacher 2 (cA2) sees cA2 work only, the other direction', async () => {
    const p = await profile(T2);
    expect(ids(p.observed.classes, 'id')).toEqual(['cA2']);
    expect(ids(p.observed.submissions, 'assignmentId')).toEqual(['q6b', 'q6d', 'q6e']);
    expect(ids(p.results, 'attemptId')).toEqual(['t-a1-d', 't-a1-g2']);
    expect(ids(p.interventions, 'id')).toEqual(['int-sys', 'int-t2']);
  });

  it('the shared learner profile is the same for both teachers', async () => {
    const [a, b] = [await profile(T1), await profile(T2)];
    for (const k of ['estimates', 'misconceptions', 'recommendations', 'teaching']) expect(a[k]).toEqual(b[k]);
  });

  it('the timeline and interventions list follow the same rule', async () => {
    const t1 = (await call(T1, 'get', '/api/learning/students/a1/timeline')).body.events.map((e: { ref: string }) => e.ref);
    expect(t1).not.toContain('t-a1-d');
    expect(t1).not.toContain('int-t2');
    const t2 = (await call(T2, 'get', '/api/learning/students/a1/timeline')).body.events.map((e: { ref: string }) => e.ref);
    expect(t2).toContain('t-a1-d');
    expect(t2).toContain('int-t2');
    const l1 = await call(T1, 'get', '/api/learning/students/a1/interventions');
    expect(JSON.stringify(l1.body)).not.toContain('int-t2');
  });

  it("the staff view of a1's study plan follows the same rule (admin: everything)", async () => {
    const items = async (u: string) => ((await call(u, 'get', '/api/teaching/students/a1/study-plan')).body.items ?? []).map((i: { assignmentId?: string }) => i.assignmentId).filter(Boolean).sort();
    expect(await items(ADMIN)).toEqual(['q6a', 'q6e']); // q6b is the same assessment as q6a: once (Q6)
    expect(await items(T1)).toEqual(['q6a']);
    expect(await items(T2)).toEqual(['q6a', 'q6e']); // q6a's assessment is also set in cA2
  });

  it('the school admin keeps full visibility', async () => {
    const p = await profile(ADMIN);
    expect(p.classScope).toBeUndefined();
    expect(ids(p.observed.classes, 'id')).toEqual(['cA', 'cA2', 'cA3']);
    expect(ids(p.results, 'attemptId')).toEqual(['t-a1-d', 't-a1-g2']);
    expect(ids(p.interventions, 'id')).toEqual(['int-sys', 'int-t2']);
  });

  it('a single-class student is unchanged: teacher 1 still sees all of a3\'s work', async () => {
    const p = await profile(T1, 'a3');
    expect(p.classScope).toBeUndefined();
    expect(ids(p.results, 'attemptId')).toEqual(['t-a3-d']); // cA2's work, as today
    multi(false);
    const off = await profile(T1, 'a3');
    multi(true);
    expect(p).toEqual(off);
  });
});

describe('Q5 per-student profile, per-class reports, school totals once', () => {
  it('a1 counts in both groups, once in the school, and in each class report', async () => {
    const o = (await call(ADMIN, 'get', '/api/analytics/overview')).body;
    const group = (id: string) => o.batches.find((b: { batchId: string }) => b.batchId === id);
    expect(group('gA').students).toBe(2); // a1, a6
    expect(group('gA2').students).toBe(2); // a3, a1
    expect(o.students.filter((s: { id: string; studentId?: string }) => (s.id ?? s.studentId) === 'a1')).toHaveLength(1);
    for (const c of ['cA', 'cA2', 'cA3']) expect(JSON.stringify((await call(ADMIN, 'get', `/api/analytics/courses/${c}`)).body)).toContain('a1');
  });
});

describe('Q6 assessments of both groups; the same one once; one result for both classes', () => {
  it("a1 gets both groups' assessments, each once", async () => {
    const r = await call('a1@t.test', 'get', '/api/me/assessments');
    const got = r.body.map((a: { id: string }) => a.id).sort();
    expect(got).toEqual(['asG', 'asG2']);
  });

  it('the same assessment set in cA and cA2 is shown once', async () => {
    const r = await call('a1@t.test', 'get', '/api/me/assignments');
    const list = r.body.assignments.map((a: { id: string }) => a.id);
    expect(list.filter((id: string) => id === 'q6a' || id === 'q6b')).toEqual(['q6a']); // the earlier due
    expect(r.body.assignments.find((a: { id: string }) => a.id === 'q6a').alsoInClassIds).toEqual(['cA2']);
    expect(list).toContain('q6d');
  });

  it('one attempt counts for both classes, and no second attempt is possible', async () => {
    const start = await call('a1@t.test', 'post', '/api/me/assignments/q6b/attempts'); // the folded duplicate
    expect(start.status).toBe(201);
    const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
    const made = await AssessmentAttempt.findOne({ id: start.body.attempt.id }).lean();
    expect(made.assignmentId).toBe('q6a');
    await AssessmentAttempt.updateOne({ id: made.id }, { $set: { status: 'submitted', gradingStatus: 'released', submittedAt: new Date(), score: 80 } });
    for (const id of ['q6a', 'q6b']) {
      const again = await call('a1@t.test', 'post', `/api/me/assignments/${id}/attempts`);
      expect([again.status, again.body.error?.code]).toEqual([403, 'ATTEMPT_LIMIT_REACHED']);
    }
    expect(await AssessmentAttempt.countDocuments({ studentId: 'a1', assessmentId: 'asG' })).toBe(1);
    // Teacher 2's assignment shows the result made in cA.
    const t2 = await call(T2, 'get', '/api/assignments/q6b');
    expect(t2.body.roster.find((x: { studentId: string }) => x.studentId === 'a1')).toMatchObject({ status: 'released', score: 80, latestAttemptId: made.id });
    const t1 = await call(T1, 'get', '/api/assignments/q6a');
    expect(t1.body.roster.find((x: { studentId: string }) => x.studentId === 'a1')).toMatchObject({ status: 'released', score: 80 });
    // ... and in teacher 2's view of a1, and in the class overview statuses.
    const p = (await call(T2, 'get', '/api/teaching/students/a1/profile')).body;
    expect(p.observed.submissions.find((x: { assignmentId: string }) => x.assignmentId === 'q6b').status).toBe('released');
    expect(p.results.map((x: { attemptId: string }) => x.attemptId)).toContain(made.id);
  });

  it("the student's study plan lists the shared assessment once", async () => {
    const r = await call('a1@t.test', 'get', '/api/me/study-plan');
    expect(r.status).toBe(200);
    const ids = r.body.items.map((i: { assignmentId?: string }) => i.assignmentId).filter(Boolean);
    expect(ids.filter((id: string) => id === 'q6a' || id === 'q6b').length).toBeLessThanOrEqual(1);
  });

  it('a single-class student in both classes the old way still gets both assignments', async () => {
    const r = await call('a3@t.test', 'get', '/api/me/assignments');
    expect(r.body.assignments.map((a: { id: string }) => a.id).filter((id: string) => id === 'q6a' || id === 'q6b').sort()).toEqual(['q6a', 'q6b']);
  });
});

describe('Q7 attendance: on every class roster', () => {
  it('a1 is on cA, cA2 and cA3 with the attendance fix on; on cA3 (added to the class) even without it', async () => {
    const roster = async (u: string, c: string) => ((await call(u, 'get', `/api/teacher/attendance/roster?courseInstanceId=${c}&date=2026-11-17`)).body.roster ?? []).map((x: { studentId: string }) => x.studentId);
    multi(true, { ENROLLMENT_ATTENDANCE_FIX: 'true' });
    expect(await roster(T1, 'cA')).toContain('a1');
    expect(await roster(T2, 'cA2')).toContain('a1');
    expect(await roster(ADMIN, 'cA3')).toContain('a1');
    multi(true, { ENROLLMENT_ATTENDANCE_FIX: undefined });
    expect(await roster(ADMIN, 'cA3')).toContain('a1');
  });
});

describe('Q8 age band: no own band, several groups: the youngest group band', () => {
  it('a1 (gA teen, gA2 child) gets child', async () => {
    const r = await call(ADMIN, 'get', '/api/age-bands');
    expect(r.body.students.find((s: { id: string }) => s.id === 'a1')).toMatchObject({ classId: 'gA2', classAgeBand: 'child', effective: { ageBand: 'child' } });
    expect(r.body.students.find((s: { id: string }) => s.id === 'a6')).toMatchObject({ classId: 'gA', effective: { ageBand: 'teen' } });
  });
});

describe('Q9 AI credits by the class the use happened in, else "No class"', () => {
  it('a1 has a per-class breakdown; single-class students are unchanged', async () => {
    const r = await call(ADMIN, 'get', '/api/credits');
    const a1 = r.body.students.find((s: { studentId: string }) => s.studentId === 'a1');
    expect(a1.groupIds).toEqual(['gA', 'gA2']);
    expect(a1.usageByClass).toEqual([
      { classId: 'cA3', className: 'Course cA3', credits: 7, events: 1 },
      { classId: 'cA2', className: 'Course cA2', credits: 20, events: 1 },
      { classId: 'cA', className: 'Course cA', credits: 10, events: 1 },
      { classId: null, className: 'No class', credits: 5, events: 1 },
    ]);
    const a6 = r.body.students.find((s: { studentId: string }) => s.studentId === 'a6');
    expect(a6.usageByClass).toBeUndefined();
    expect(a6.groupIds).toBeUndefined();
  });
});

describe('undo: switch off, then end the second memberships', () => {
  it('switch off hides the new screens; the undo ends exactly the extra memberships', async () => {
    multi(false);
    expect((await call('a1@t.test', 'get', '/api/multi-class/me/classes')).body).toEqual({ enabled: false });
    expect((await call(ADMIN, 'get', '/api/credits')).body.students.find((s: { studentId: string }) => s.studentId === 'a1').usageByClass).toBeUndefined();
    const { endExtraMemberships } = await import('../../src/services/multiClass');
    const dry = await endExtraMemberships({ apply: false });
    expect(dry).toMatchObject({ groups: 1, classes: 1, students: 1, ended: 0 });
    expect(await ctx.M.ClassEnrollment.countDocuments({ studentId: 'a1', status: 'active' })).toBe(3);
    const done = await endExtraMemberships({ apply: true, by: 'test' });
    expect(done).toMatchObject({ groups: 1, classes: 1, ended: 2 });
    const rows = await ctx.M.ClassEnrollment.find({ studentId: 'a1' }).sort({ targetId: 1 }).lean();
    expect(rows.map((r: { targetId: string; status: string }) => [r.targetId, r.status])).toEqual([['cA3', 'inactive'], ['gA', 'active'], ['gA2', 'inactive']]);
    // Back to the old answer: a1 is in cA only.
    multi(false);
    const courses = await call('a1@t.test', 'get', '/api/me/courses');
    expect(courses.body.map((c: { instanceId: string }) => c.instanceId)).toEqual(['cA']);
    expect((await endExtraMemberships({ apply: true })).ended).toBe(0);
  });
});
