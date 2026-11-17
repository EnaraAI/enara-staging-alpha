import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, get, ignoredSeen, offOn, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 5, feature 1: student_app. With the feature on, the
// student's classes and "assessments for my group" come from class_enrollments.
// For every single-class shape the JSON must be byte-identical (nothing ignored).

const STUDENTS = ['a1@t.test', 'a2@t.test', 'a3@t.test', 'a4@t.test', 'b1@t.test'];
const PAGES = ['/api/me', '/api/me/courses', '/api/me/dashboard', '/api/me/assessments', '/api/me/results', '/api/me/next-steps'];

beforeAll(startFixture, 120_000);
afterAll(async () => {
  // Report what was ignored (only keys listed in IGNORED_KEYS can appear here).
  console.log(`[step5 student_app] ignored keys: ${[...ignoredSeen].join(', ') || 'none'}`);
  await stopFixture();
});

describe('student_app: same answers off and on', () => {
  it('every student page is identical for every single-class shape', async () => {
    const calls = STUDENTS.flatMap((u) => PAGES.map((p) => [u, p] as [string, string]));
    const { off, on } = await offOn('student_app', calls);
    for (let i = 0; i < off.length; i++) expect({ u: on[i].u, p: on[i].p, status: on[i].status, body: on[i].body }).toEqual({ u: off[i].u, p: off[i].p, status: off[i].status, body: off[i].body });
    // The fixture really exercises the rule (not empty answers).
    const courses = (u: string) => off.find((x) => x.u === u && x.p === '/api/me/courses')!.body;
    expect(JSON.stringify(courses('a1@t.test'))).toContain('cA');
    expect(JSON.stringify(courses('a2@t.test'))).toContain('cA3');
  }, 120_000);

  it('a course page and its tree are identical', async () => {
    const { off, on } = await offOn('student_app', [['a3@t.test', '/api/me/courses/cA'], ['a3@t.test', '/api/me/courses/cA2'], ['a1@t.test', '/api/me/courses/cA2']]);
    expect(on).toEqual(off);
  });

  it('switching back returns the old answer', async () => {
    const before = await get('a3@t.test', '/api/me/courses');
    setSwitches({ ENROLLMENT_READ_FROM: 'student_app' });
    await get('a3@t.test', '/api/me/courses');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    expect(await get('a3@t.test', '/api/me/courses')).toEqual(before);
  });

  it('with the feature on, the answer really comes from enrollments', async () => {
    // Drift on purpose: the old field says a4 is in gA; enrollments don't.
    await ctx.M.Student.updateOne({ id: 'a4' }, { $set: { batchId: 'gA' } });
    const off = await get('a4@t.test', '/api/me/courses');
    setSwitches({ ENROLLMENT_READ_FROM: 'student_app' });
    const on = await get('a4@t.test', '/api/me/courses');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    await ctx.M.Student.updateOne({ id: 'a4' }, { $unset: { batchId: 1 } });
    expect(JSON.stringify(off.body)).toContain('cA');
    expect(JSON.stringify(on.body)).not.toContain('"cA"');
  });

  it('school isolation: another school\'s enrollment never shows up', async () => {
    await ctx.M.ClassEnrollment.create({ id: 'enr_x', institutionId: 'B', studentId: 'a1', scope: 'class', targetId: 'cB', status: 'active', source: 'manual', startedAt: new Date() });
    setSwitches({ ENROLLMENT_READ_FROM: 'student_app' });
    const on = await get('a1@t.test', '/api/me/courses');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    await ctx.M.ClassEnrollment.deleteOne({ id: 'enr_x' });
    expect(JSON.stringify(on.body)).not.toContain('cB');
  });
});
