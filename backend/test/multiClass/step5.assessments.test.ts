import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, expectSame, get, ignoredSeen, offOn, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 5, feature 3: assessments. With the feature on, the
// students reached by an assessment given to a group (the school admin's
// "assigned to" list on GET /api/assessments/:id/attempts) come from
// class_enrollments. Byte-identical JSON for every single-class shape.

const ADMIN = 'admin@a.test';
const IDS = ['asG', 'asG2', 'asS', 'asDel', 'asNone', 'asB'];

beforeAll(async () => {
  await startFixture();
  const { AssessmentAttempt } = await import('../../src/models/AssessmentAttempt');
  await ctx.M.Assessment.create({ id: 'asDel', title: 'Assessment asDel', subject: 'English', type: 'quiz', status: 'active', lifecycle: 'published', dueDate: '2026-12-01', institutionId: 'A', questions: [], batchId: 'gDel' });
  await ctx.M.Assessment.create({ id: 'asNone', title: 'Assessment asNone', subject: 'English', type: 'quiz', status: 'active', lifecycle: 'published', dueDate: '2026-12-01', institutionId: 'A', questions: [], batchId: 'gNone' });
  const at = (id: string, assessmentId: string, studentId: string, status: string, score?: number) =>
    AssessmentAttempt.create({ id, assessmentId, assessmentTitle: assessmentId, studentId, institutionId: 'A', status, score, startedAt: new Date('2026-10-01T10:00:00Z'), ...(status === 'submitted' ? { submittedAt: new Date('2026-10-01T10:20:00Z') } : {}), answers: [] });
  await at('at1', 'asG', 'a1', 'submitted', 70);
  await at('at2', 'asG', 'a6', 'in-progress');
  await at('at3', 'asG', 'a4', 'submitted', 50); // attempted without being assigned
  await at('at4', 'asDel', 'a5', 'submitted', 90);
}, 120_000);

afterAll(async () => {
  console.log(`[step5 assessments] ignored keys: ${[...ignoredSeen].join(', ') || 'none'}`);
  await stopFixture();
});

describe('assessments: same answers off and on', () => {
  it('assigned-to lists and results are identical (admins of both schools, teacher)', async () => {
    const calls: [string, string][] = [];
    for (const u of [ADMIN, 'admin@b.test', 'teacher@a.test']) for (const id of IDS) calls.push([u, `/api/assessments/${id}/attempts`]);
    const r = await offOn('assessments', calls);
    expectSame(r);
    const body = (id: string) => r.off.find((x) => x.u === ADMIN && x.p === `/api/assessments/${id}/attempts`)!.body as { students: { studentId: string }[] };
    expect(body('asG').students.map((s) => s.studentId).sort()).toEqual(['a1', 'a4', 'a6']);
    expect(body('asG2').students.map((s) => s.studentId)).toEqual(['a3']);
    expect(body('asDel').students.map((s) => s.studentId)).toEqual(['a5']);
  });

  it('switching back returns the old answer', async () => {
    const before = await get(ADMIN, '/api/assessments/asG/attempts');
    setSwitches({ ENROLLMENT_READ_FROM: 'assessments' });
    await get(ADMIN, '/api/assessments/asG/attempts');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    expect(await get(ADMIN, '/api/assessments/asG/attempts')).toEqual(before);
  });

  it('with the feature on, the answer really comes from enrollments; no other school', async () => {
    await ctx.M.Student.updateOne({ id: 'a2' }, { $set: { batchId: 'gA2' } }); // old field only
    await ctx.M.ClassEnrollment.create({ id: 'enr_x', institutionId: 'B', studentId: 'b1', scope: 'group', targetId: 'gA2', status: 'active', source: 'manual', startedAt: new Date() });
    const off = await get(ADMIN, '/api/assessments/asG2/attempts');
    setSwitches({ ENROLLMENT_READ_FROM: 'assessments' });
    const on = await get(ADMIN, '/api/assessments/asG2/attempts');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    await ctx.M.Student.updateOne({ id: 'a2' }, { $unset: { batchId: 1 } });
    await ctx.M.ClassEnrollment.deleteOne({ id: 'enr_x' });
    expect(JSON.stringify(off.body)).toContain('"a2"');
    expect(JSON.stringify(on.body)).not.toContain('"a2"');
    expect(JSON.stringify(on.body)).not.toContain('b1');
  });
});
