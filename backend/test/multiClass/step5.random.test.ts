import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 5, randomised same-answer check (STEP_5_PLAN §4.2): 200
// generated single-class schools (2-4 groups, 2-5 classes, 3-10 students,
// random explicit class members, some students in no group). After the
// backfill, every class roster (classStudentIds) and every student's class
// list (getEnrolledInstances) must be the same with teacher_rosters /
// student_app off and on: same ids, in the same order. Fixed seed.

const SEED = 20261117;
const SCHOOLS = 200;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const classes: { id: string; studentIds: string[]; batchId: string; institutionId: string }[] = [];
const students: string[] = [];

beforeAll(async () => {
  await startFixture();
  const rand = mulberry32(SEED);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const batches: Record<string, unknown>[] = [];
  const studentDocs: Record<string, unknown>[] = [];
  const classDocs: Record<string, unknown>[] = [];
  const base = new Date('2026-01-01T00:00:00Z').getTime();
  for (let n = 0; n < SCHOOLS; n++) {
    const school = `R${n}`;
    const groups = Array.from({ length: int(2, 4) }, (_, i) => `${school}-g${i}`);
    for (const id of groups) batches.push({ id, name: `Group ${id}`, institutionId: school, academicYear: '2026' });
    const ids = Array.from({ length: int(3, 10) }, (_, i) => `${school}-s${i}`);
    for (const id of ids) {
      const g = rand() < 0.25 ? undefined : groups[int(0, groups.length - 1)]; // some students in no group
      studentDocs.push({ id, name: `Student ${id}`, email: `${id}@r.test`, grade: '7', institutionId: school, ...(g ? { batchId: g } : {}) });
      students.push(id);
    }
    for (let i = 0, k = int(2, 5); i < k; i++) {
      const explicit = ids.filter(() => rand() < 0.3);
      // Explicit list in random order (order matters for the roster).
      for (let j = explicit.length - 1; j > 0; j--) { const x = int(0, j); [explicit[j], explicit[x]] = [explicit[x], explicit[j]]; }
      const cls = { id: `${school}-c${i}`, studentIds: explicit, batchId: groups[int(0, groups.length - 1)], institutionId: school };
      classes.push(cls);
      classDocs.push({ ...cls, courseId: cls.id, courseName: `Course ${cls.id}`, academicYear: '2026', visibility: rand() < 0.85 ? 'student' : 'internal', instructorIds: [], createdAt: new Date(base + classDocs.length * 60_000) });
    }
  }
  await ctx.M.Batch.insertMany(batches);
  await ctx.M.Student.insertMany(studentDocs);
  await ctx.M.CourseInstance.insertMany(classDocs);
  const { applyBackfill } = await import('../../src/services/enrollmentBackfill');
  await applyBackfill();
}, 300_000);

afterAll(stopFixture);

describe('random single-class schools: same answers off and on', () => {
  it(`${SCHOOLS} schools: every class roster and every student's classes are identical`, async () => {
    const { classStudentIds } = await import('../../src/services/learningAccess');
    const { getEnrolledInstances } = await import('../../src/services/studentCourseService');
    const run = async (list: string | undefined) => {
      setSwitches({ ENROLLMENT_READ_FROM: list });
      const rosters: Record<string, string[]> = {};
      for (const c of classes) rosters[c.id] = await classStudentIds(c);
      const enrolled: Record<string, string[]> = {};
      for (const s of students) {
        enrolled[s] = (await getEnrolledInstances(s, 'teacher_rosters')).map((i) => i.id);
        enrolled[`${s}#app`] = (await getEnrolledInstances(s)).map((i) => i.id);
      }
      return { rosters, enrolled };
    };
    const off = await run(undefined);
    const on = await run('student_app,teacher_rosters');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    let diffs = 0;
    for (const id of Object.keys(off.rosters)) if (JSON.stringify(off.rosters[id]) !== JSON.stringify(on.rosters[id])) diffs++;
    for (const id of Object.keys(off.enrolled)) if (JSON.stringify(off.enrolled[id]) !== JSON.stringify(on.enrolled[id])) diffs++;
    expect(diffs).toBe(0);
    expect(on).toEqual(off);
    // Not vacuous: rosters with both explicit and group members, students in classes.
    expect(classes.length).toBeGreaterThan(SCHOOLS * 2);
    expect(Object.values(off.rosters).filter((r) => r.length > 0).length).toBeGreaterThan(classes.length / 2);
    expect(Object.values(off.enrolled).filter((r) => r.length > 1).length).toBeGreaterThan(50);
  }, 300_000);
});
