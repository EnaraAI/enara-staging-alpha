import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, startFixture, stopFixture } from './step5.helpers';
import { allOff, call, multi } from './step6.helpers';

// S7 (owner decision 2026-11-17): every tutor session records the class it
// happened in (TutorSession.classId) at creation, whether or not multi-class
// is on. When two of the student's classes share a courseId, the student's
// current class choice (Q2 switcher) wins, else the first in class order.
// The Q9 credits report (usageByClass) credits uses by session.classId while
// multi-class is on; older sessions without classId keep the old mapping.
//
// Added here: classes cX1 (group gA, created first) and cX2 (a1 on its own
// list, created later) share courseId 'shared'. a1 is in both. Class order is
// newest first, so the old mapping picks cX2 for 'shared'.

const ADMIN = 'admin@a.test';
const A1 = 'a1@t.test';
const NOW = new Date();
const DAY = 86_400_000;
let TutorSession: any; // eslint-disable-line @typescript-eslint/no-explicit-any
let UsageEvent: any; // eslint-disable-line @typescript-eslint/no-explicit-any

const newSession = async (body: Record<string, unknown>) => {
  const r = await call(A1, 'post', '/api/me/tutor/sessions', body);
  expect(r.status).toBe(201);
  return TutorSession.findOne({ id: r.body.id }).lean();
};
const use = (id: string, sessionId: string, credits: number) =>
  UsageEvent.create({ id, userId: 'u', studentId: 'a1', institutionId: 'A', feature: 'chat', requestId: id, sessionId, creditsUsed: credits, status: 'settled', timestamp: new Date(NOW.getTime() - DAY) });
const usage = async () => (await call(ADMIN, 'get', '/api/credits')).body.students.find((s: { studentId: string }) => s.studentId === 'a1').usageByClass;

beforeAll(async () => {
  await startFixture();
  TutorSession = (await import('../../src/models/TutorSession')).TutorSession;
  UsageEvent = (await import('../../src/models/UsageEvent')).UsageEvent;
  const c = (id: string, batchId: string, studentIds: string[], createdAt: string, school = 'A') =>
    ctx.M.CourseInstance.create({ id, courseId: 'shared', courseName: `Course ${id}`, academicYear: '2026', institutionId: school, batchId, studentIds, visibility: 'student', instructorIds: [], createdAt: new Date(createdAt) });
  await c('cX1', 'gA', [], '2026-10-01');
  await c('cX2', 'gNone', ['a1'], '2026-10-02');
  await c('cXB', 'gB', ['b1'], '2026-10-03', 'B'); // school B shares the courseId too
  const { applyBackfill } = await import('../../src/services/enrollmentBackfill');
  await applyBackfill();
}, 120_000);
afterAll(async () => {
  allOff();
  await stopFixture();
});

describe('S7 the class is recorded on every new session', () => {
  it('multi-class off (all switches at their defaults): recorded anyway', async () => {
    allOff();
    expect((await newSession({ courseId: 'cX1' })).classId).toBe('cX1'); // a class id: that class
    expect((await newSession({ courseId: 'cA' })).classId).toBe('cA');
    expect((await newSession({ courseId: 'shared' })).classId).toBe('cX2'); // shared courseId, no choice: the first (old mapping)
    expect((await newSession({})).classId).toBeUndefined(); // no course, no class
  });

  it('two classes share the courseId: the current class choice (Q2 switcher) wins', async () => {
    multi(true);
    expect((await call(ADMIN, 'post', '/api/multi-class/students/a1/enrollments', { scope: 'group', targetId: 'gA2' })).status).toBe(201); // a1 is now multi-class
    expect((await call(A1, 'put', '/api/multi-class/me/classes/current', { classId: 'cX1' })).status).toBe(200);
    expect((await newSession({ courseId: 'shared' })).classId).toBe('cX1');
    expect((await call(A1, 'put', '/api/multi-class/me/classes/current', { classId: 'cX2' })).status).toBe(200);
    expect((await newSession({ courseId: 'shared' })).classId).toBe('cX2');
    expect((await call(A1, 'put', '/api/multi-class/me/classes/current', { classId: 'all' })).status).toBe(200);
    expect((await newSession({ courseId: 'shared' })).classId).toBe('cX2'); // "All my classes": the first
    // The choice only breaks ties: a class id is always that class.
    expect((await newSession({ courseId: 'cX1' })).classId).toBe('cX1');
  });

  it('an assignment handoff records the assignment\'s class', async () => {
    const { Assignment } = await import('../../src/models/Assignment');
    const { AssessmentVersion } = await import('../../src/models/Assessment');
    await AssessmentVersion.create({ assessmentId: 'asG', institutionId: 'A', version: 1, title: 'Assessment asG', questions: [] });
    await Assignment.create({ id: 'hX1', institutionId: 'A', assessmentId: 'asG', assessmentVersion: 1, title: 'Homework', classId: 'cX1', state: 'published', opensAt: new Date(NOW.getTime() - DAY), dueAt: new Date(NOW.getTime() + DAY), createdBy: 'x' });
    const r = await call(A1, 'post', '/api/me/tutor/handoff', { kind: 'assignment', refId: 'hX1' });
    expect(r.status).toBe(201);
    expect((await TutorSession.findOne({ id: r.body.sessionId }).lean()).classId).toBe('cX1');
  });

  it('tenant isolation: a class of another school is never stored', async () => {
    const { resolveSessionClassId } = await import('../../src/services/sessionClass');
    // School B's class id, or a session claimed for another school: nothing.
    expect(await resolveSessionClassId({ studentId: 'a1', institutionId: 'A', courseId: 'cXB' })).toBeUndefined();
    expect(await resolveSessionClassId({ studentId: 'a1', institutionId: 'B', courseId: 'cX1' })).toBeUndefined();
    expect(await resolveSessionClassId({ studentId: 'a1', institutionId: 'B', courseId: 'shared' })).toBeUndefined();
    // Even with a drifted enrollment row pointing a1 at school B's class.
    await ctx.M.ClassEnrollment.create({ institutionId: 'A', studentId: 'a1', scope: 'class', targetId: 'cXB', source: 'manual' });
    expect(await resolveSessionClassId({ studentId: 'a1', institutionId: 'A', courseId: 'cXB' })).toBeUndefined();
    expect((await resolveSessionClassId({ studentId: 'a1', institutionId: 'A', courseId: 'shared' }))).not.toBe('cXB');
    await ctx.M.ClassEnrollment.deleteOne({ studentId: 'a1', targetId: 'cXB' });
    // Through the API: a course the student is not in is refused as before.
    expect((await call(A1, 'post', '/api/me/tutor/sessions', { courseId: 'cXB' })).status).toBe(404);
    expect(await TutorSession.countDocuments({ classId: 'cXB' })).toBe(0);
  });
});

describe('S7 credits by the recorded class (multi-class on)', () => {
  it('two classes sharing a courseId: each use goes to the class its session recorded; old sessions keep the old mapping', async () => {
    multi(true);
    await UsageEvent.deleteMany({});
    const inX1 = (await TutorSession.findOne({ studentId: 'a1', courseId: 'shared', classId: 'cX1' }).lean()).id;
    const inX2 = (await TutorSession.findOne({ studentId: 'a1', courseId: 'shared', classId: 'cX2' }).lean()).id;
    await TutorSession.create({ id: 'ts-old', studentId: 'a1', institutionId: 'A', courseId: 'shared', title: 'old', lastMessageAt: new Date() }); // before S7: no classId
    await use('e1', inX1, 10);
    await use('e2', inX2, 20);
    await use('e3', 'ts-old', 4);
    const rows = await usage();
    const by = Object.fromEntries(rows.map((r: { classId: string | null; credits: number }) => [r.classId ?? 'none', r.credits]));
    expect(by).toMatchObject({ cX1: 10, cX2: 24, none: 0 }); // ts-old: the first class with that courseId (cX2), as before
  });

  it('a class the student has left is still credited (named); a class of another school or a deleted one is "No class"', async () => {
    await TutorSession.create({ id: 'ts-left', studentId: 'a1', institutionId: 'A', courseId: 'cA4', classId: 'cA4', title: 'left', lastMessageAt: new Date() });
    await TutorSession.create({ id: 'ts-forged', studentId: 'a1', institutionId: 'A', courseId: 'cXB', classId: 'cXB', title: 'forged', lastMessageAt: new Date() });
    await TutorSession.create({ id: 'ts-gone', studentId: 'a1', institutionId: 'A', courseId: 'cGone', classId: 'cGone', title: 'gone', lastMessageAt: new Date() });
    await TutorSession.create({ id: 'ts-other', studentId: 'a6', institutionId: 'A', courseId: 'cX1', classId: 'cX1', title: 'a6', lastMessageAt: new Date() });
    await use('e4', 'ts-left', 3);
    await use('e5', 'ts-forged', 5);
    await use('e6', 'ts-gone', 6);
    await use('e7', 'ts-other', 7); // another student's session: its class is not a1's record
    const rows = await usage();
    expect(rows.find((r: { classId: string }) => r.classId === 'cA4')).toEqual({ classId: 'cA4', className: 'Course cA4', credits: 3, events: 1 });
    expect(rows.find((r: { classId: string }) => r.classId === 'cXB')).toBeUndefined();
    expect(rows.at(-1)).toEqual({ classId: null, className: 'No class', credits: 11, events: 2 }); // forged + gone
    expect(rows.find((r: { classId: string }) => r.classId === 'cX1').credits).toBe(17); // 10 + e7 by the old mapping (course cX1)
  });

  it('switch off: no usageByClass at all (classId is only recorded)', async () => {
    multi(false);
    const r = await call(ADMIN, 'get', '/api/credits');
    expect(r.body.students.find((s: { studentId: string }) => s.studentId === 'a1').usageByClass).toBeUndefined();
    multi(true);
  });
});
