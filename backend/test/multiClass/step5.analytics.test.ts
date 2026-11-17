import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, expectSame, get, ignoredSeen, offOn, offOnWith, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 5, feature 4: analytics. With the feature on, course
// members, per-group stats, overdue work for "my group", the weekly summary
// (built from the overview) and the group on teaching-impact rows come from
// class_enrollments. Byte-identical JSON for every single-class shape. The
// clock is frozen for both runs (generatedAt, windows), so nothing time-based
// needs to be ignored.

const NOW = new Date('2026-11-17T12:00:00Z');
const ADMIN = 'admin@a.test';
const DAY = 86_400_000;

beforeAll(async () => {
  await startFixture();
  const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
  const { LessonProgress } = await import('../../src/models/LessonProgress');
  const { UsageEvent } = await import('../../src/models/UsageEvent');
  const { TutorSession } = await import('../../src/models/TutorSession');
  // Past-due work for a group (overdue counts follow the student's group).
  await ctx.M.Assessment.create({ id: 'asPast', title: 'Past due', subject: 'Maths', type: 'quiz', status: 'active', lifecycle: 'published', dueDate: '2026-11-01', institutionId: 'A', questions: [], batchId: 'gA' });
  await ctx.M.Assessment.create({ id: 'asPast2', title: 'Past due 2', subject: 'Maths', type: 'quiz', status: 'active', lifecycle: 'published', dueDate: '2026-11-02', institutionId: 'A', questions: [], batchId: 'gA' });
  await ctx.M.Assessment.create({ id: 'asPastDel', title: 'Past due del', subject: 'Maths', type: 'quiz', status: 'active', lifecycle: 'published', dueDate: '2026-11-02', institutionId: 'A', questions: [], batchId: 'gDel' });
  const at = (id: string, assessmentId: string, studentId: string, score: number, daysAgo: number, answers: { topic: string; isCorrect: boolean }[] = []) =>
    AssessmentAttempt.create({ id, assessmentId, assessmentTitle: assessmentId, subject: 'English', studentId, institutionId: 'A', status: 'submitted', score, submittedAt: new Date(NOW.getTime() - daysAgo * DAY), answers: answers.map((a, i) => ({ questionId: `q${i}`, answer: 'x', ...a })) });
  await at('an1', 'asG', 'a1', 82.5, 2, [{ topic: 'verbs', isCorrect: true }, { topic: 'nouns', isCorrect: false }]);
  await at('an2', 'asG2', 'a3', 41.3, 20, [{ topic: 'verbs', isCorrect: false }]);
  await at('an3', 'asS', 'a2', 67.7, 5);
  await at('an4', 'asG', 'a6', 91.1, 1);
  await LessonProgress.create({ studentId: 'a1', courseId: 'cA', lessonId: 'l1', institutionId: 'A', status: 'completed', completedAt: new Date(NOW.getTime() - 3 * DAY) });
  await LessonProgress.create({ studentId: 'a5', courseId: 'cA4', lessonId: 'l1', institutionId: 'A', status: 'completed', completedAt: new Date(NOW.getTime() - 9 * DAY) });
  await UsageEvent.create({ id: 'u1', userId: 'x', studentId: 'a1', institutionId: 'A', feature: 'chat', requestId: 'r1', creditsUsed: 120, status: 'settled', timestamp: new Date(NOW.getTime() - 2 * DAY), sessionId: 'ts1' });
  await UsageEvent.create({ id: 'u2', userId: 'x', studentId: 'a5', institutionId: 'A', feature: 'chat', requestId: 'r2', creditsUsed: 30, status: 'settled', timestamp: new Date(NOW.getTime() - 4 * DAY) });
  await TutorSession.create({ id: 'ts1', studentId: 'a1', institutionId: 'A', courseId: 'cA', lessonTitle: 'Lesson 1', messages: [{ id: 'm1', role: 'user', text: 'What is a verb?', timestamp: new Date(NOW.getTime() - 2 * DAY) }], lastMessageAt: new Date(NOW.getTime() - 2 * DAY) });
}, 120_000);

afterAll(async () => {
  console.log(`[step5 analytics] ignored keys: ${[...ignoredSeen].join(', ') || 'none'}`);
  await stopFixture();
});

describe('analytics: same answers off and on', () => {
  it('overview, course and student analytics are identical (both schools)', async () => {
    const calls: [string, string][] = [];
    for (const u of [ADMIN, 'admin@b.test']) {
      calls.push([u, '/api/analytics/overview']);
      calls.push([u, '/api/analytics/overview?origin=all']);
      for (const c of ['cA', 'cA2', 'cA3', 'cA4', 'cB']) calls.push([u, `/api/analytics/courses/${c}`]);
      for (const s of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b1']) calls.push([u, `/api/analytics/students/${s}`]);
    }
    const r = await offOn('analytics', calls, { now: NOW });
    expectSame(r);
    const overview = r.off.find((x) => x.u === ADMIN && x.p === '/api/analytics/overview')!.body as {
      courses: { id: string; students: number }[];
      batches: { batchId: string; students: number }[];
      students: { id: string; overdueAssessments: number }[];
    };
    // The fixture really exercises the rule (group and explicit members, per-group stats, overdue by group).
    expect(overview.courses.find((c) => c.id === 'cA')!.students).toBe(4);
    expect(overview.batches.map((b) => b.batchId)).toEqual(['gA', 'gA2', 'gDel']);
    expect(overview.students.find((s) => s.id === 'a6')!.overdueAssessments).toBe(2);
    expect(overview.students.find((s) => s.id === 'a5')!.overdueAssessments).toBe(1);
  });

  it('the weekly class summary is identical', async () => {
    const { clearWeeklySummaryCache } = await import('../../src/services/classSummaryService');
    const r = await offOn('analytics', [[ADMIN, '/api/analytics/weekly-summary'], ['admin@b.test', '/api/analytics/weekly-summary']], { now: NOW, before: clearWeeklySummaryCache });
    expectSame(r);
    expect(JSON.stringify(r.off[0].body)).toContain('Student a6');
  });

  it('the group on teaching-impact rows is identical', async () => {
    const { PedagogicalDecision } = await import('../../src/models/PedagogicalDecision');
    const { TeachingEpisode } = await import('../../src/models/TeachingEpisode');
    const { recomputeStudentEpisodes } = await import('../../src/services/teachingImpact');
    const ids = ['a1', 'a2', 'a3', 'a5', 'a6'];
    for (const s of ids) await PedagogicalDecision.create({ id: `pd-${s}`, institutionId: 'A', studentId: s, objectiveId: 'obj1', targetObjectiveId: 'obj1', strategyId: 'worked_example', at: new Date(NOW.getTime() - 10 * DAY) });
    const r = await offOnWith('analytics', async (s) => {
      await recomputeStudentEpisodes(s, NOW);
      const { _id, ...doc } = (await TeachingEpisode.findOne({ id: `ep-pd-${s}` }).lean()) as Record<string, unknown>;
      return { ...doc, _id: String(_id) };
    }, ids.map((s) => [s, ''] as [string, string]), { now: NOW });
    expectSame(r);
    expect((r.off[0].body as { batchId?: string }).batchId).toBe('gA');
    expect((r.off[3].body as { batchId?: string }).batchId).toBe('gDel');
    expect((r.off[1].body as { batchId?: string }).batchId).toBeUndefined();
  });

  it('the step 4 shadow check runs only while the old path is used', async () => {
    const { flushShadowCounts } = await import('../../src/services/enrollmentShadow');
    const { EnrollmentShadowStat } = await import('../../src/models/EnrollmentShadowStat');
    const checks = async () => {
      await flushShadowCounts();
      return (await EnrollmentShadowStat.find({ feature: 'analytics_course' }).lean()).reduce((n, r) => n + (r.checks ?? 0), 0);
    };
    setSwitches({ ENROLLMENT_SHADOW: 'true' });
    await get(ADMIN, '/api/analytics/overview');
    const offRun = await checks();
    setSwitches({ ENROLLMENT_SHADOW: 'true', ENROLLMENT_READ_FROM: 'analytics' });
    await get(ADMIN, '/api/analytics/overview');
    const onRun = await checks();
    setSwitches({ ENROLLMENT_SHADOW: undefined, ENROLLMENT_READ_FROM: undefined });
    expect(offRun).toBe(1);
    expect(onRun).toBe(offRun);
    expect(await EnrollmentShadowStat.countDocuments({ mismatches: { $gt: 0 } })).toBe(0);
  });

  it('switching back returns the old answer', async () => {
    const run = () => offOn('analytics', [[ADMIN, '/api/analytics/overview']], { now: NOW });
    const before = (await run()).off;
    setSwitches({ ENROLLMENT_READ_FROM: 'analytics' });
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    expect((await run()).off).toEqual(before);
  });

  it('with the feature on, the answer really comes from enrollments; no other school', async () => {
    await ctx.M.Student.updateOne({ id: 'a4' }, { $set: { batchId: 'gA' } }); // old field only
    await ctx.M.ClassEnrollment.create({ id: 'enr_x', institutionId: 'B', studentId: 'b1', scope: 'class', targetId: 'cA', status: 'active', source: 'manual', startedAt: new Date() });
    const r = await offOn('analytics', [[ADMIN, '/api/analytics/courses/cA']], { now: NOW });
    await ctx.M.Student.updateOne({ id: 'a4' }, { $unset: { batchId: 1 } });
    await ctx.M.ClassEnrollment.deleteOne({ id: 'enr_x' });
    const ids = (b: unknown) => JSON.stringify(b);
    expect(ids(r.off[0].body)).toContain('"a4"');
    expect(ids(r.on[0].body)).not.toContain('"a4"');
    expect(ids(r.on[0].body)).not.toContain('b1');
    expect((await get(ADMIN, '/api/analytics/courses/cA')).status).toBe(200);
  });
});
