import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, expectSame, get, ignoredSeen, offOn, offOnWith, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 5, feature 5: profile_context. With the feature on, the
// student's group for the age band list (GET /api/age-bands), the tutor's
// trusted age band (loadTrustedAgeBand) and the educator directory's class
// name (studentProfiles) come from class_enrollments. Byte-identical for every
// single-class shape.
//
// Q8 (ENROLLMENT_AGE_FROM_BIRTHDATE, boundaries decided by Mohamed 2026-11-17:
// child under 13, teen 13-17, adult 18+): off -> results equal today's; on ->
// a student with no valid own band gets one from their birth date, before any
// group band. Either way the feature off/on comparison is identical. The
// youngest group band applies only to students in several groups whose age is
// unknown (tested with a step-6 shape).

const ADMIN = 'admin@a.test';
const STUDENTS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b1'];

beforeAll(async () => {
  await startFixture();
  await ctx.M.Batch.updateOne({ id: 'gA' }, { $set: { learnerAgeBand: 'teen' } });
  await ctx.M.Batch.updateOne({ id: 'gA2' }, { $set: { learnerAgeBand: 'child' } });
  await ctx.M.Student.updateOne({ id: 'a3' }, { $set: { learnerAgeBand: 'adult' } });
  // Birth dates without a band of their own (Q8 candidates).
  await ctx.M.Student.updateOne({ id: 'a1' }, { $set: { birthDate: new Date('2016-03-15') } });
  await ctx.M.Student.updateOne({ id: 'a4' }, { $set: { birthDate: new Date('2001-03-15') } });
}, 120_000);

afterAll(async () => {
  console.log(`[step5 profile_context] ignored keys: ${[...ignoredSeen].join(', ') || 'none'}`);
  await stopFixture();
});

async function tutorBand(studentId: string, school: string) {
  const { loadTrustedAgeBand } = await import('../../src/services/languageTeachingContext');
  return loadTrustedAgeBand({ institutionId: school, studentId, learningSettings: {} });
}

async function directory(school: string) {
  const { studentProfiles } = await import('../../src/services/studentDirectory');
  const map = await studentProfiles(school, STUDENTS, new Map([['a1', ['Course cA']]]));
  return [...map.entries()];
}

for (const birth of ['false', 'true']) {
  describe(`profile_context: same answers off and on (ENROLLMENT_AGE_FROM_BIRTHDATE=${birth})`, () => {
    const vars = { ENROLLMENT_AGE_FROM_BIRTHDATE: birth };

    it('the age band list is identical (both schools)', async () => {
      const r = await offOn('profile_context', [[ADMIN, '/api/age-bands'], ['admin@b.test', '/api/age-bands']], { vars });
      expectSame(r);
      const rows = (r.off[0].body as { students: { id: string; classId: string | null; effective: { ageBand: string; source: string } }[] }).students;
      const row = (id: string) => rows.find((x) => x.id === id)!;
      // a1 was born 2016-03-15: a child by birth date (switch on), else the group band.
      expect(row('a1')).toMatchObject(birth === 'true' ? { classId: 'gA', effective: { ageBand: 'child', source: 'student_birth_date' } } : { classId: 'gA', effective: { ageBand: 'teen', source: 'class_age_band' } });
      expect(row('a3')).toMatchObject({ classId: 'gA2', effective: { ageBand: 'adult', source: 'student_age_band' } });
      expect(row('a5')).toMatchObject({ classId: 'gDel', effective: { ageBand: 'unknown' } }); // deleted group
      // a4 was born 2001-03-15 and has no group: an adult by birth date (switch on), else unknown.
      expect(row('a4')).toMatchObject(birth === 'true' ? { classId: null, effective: { ageBand: 'adult', source: 'student_birth_date' } } : { classId: null, effective: { ageBand: 'unknown' } });
    });

    it("the tutor's trusted age band is identical", async () => {
      const calls = STUDENTS.map((s) => [s, s === 'b1' ? 'B' : 'A'] as [string, string]);
      calls.push(['b1', 'A'], ['a1', 'B']); // wrong school: no student, no group
      const r = await offOnWith('profile_context', (s, school) => tutorBand(s, school), calls, { vars });
      expectSame(r);
      expect(r.off[0].body).toEqual(birth === 'true' ? { band: 'child', status: 'known', source: 'student_birth_date' } : { band: 'teen', status: 'known', source: 'class_age_band' });
    });

    it("the directory's class name is identical", async () => {
      const r = await offOnWith('profile_context', (school) => directory(school), [['A', ''], ['B', '']], { vars });
      expectSame(r);
      expect(JSON.stringify(r.off[0].body)).toContain('"className":"Group gA"');
    });
  });
}

describe('profile_context: rules and isolation', () => {
  it('switching back returns the old answer', async () => {
    const before = await get(ADMIN, '/api/age-bands');
    setSwitches({ ENROLLMENT_READ_FROM: 'profile_context' });
    await get(ADMIN, '/api/age-bands');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    expect(await get(ADMIN, '/api/age-bands')).toEqual(before);
  });

  it('several groups (step 6 shape): the youngest group band, only when the student has no band of their own', async () => {
    const enr = (id: string, studentId: string, targetId: string) => ctx.M.ClassEnrollment.create({ id, institutionId: 'A', studentId, scope: 'group', targetId, status: 'active', source: 'manual', startedAt: new Date() });
    await enr('enr_m1', 'a6', 'gA2'); // a6: gA (teen) + gA2 (child), no own band
    await enr('enr_m2', 'a3', 'gA');  // a3: gA2 (child) + gA (teen), own band adult
    setSwitches({ ENROLLMENT_READ_FROM: 'profile_context' });
    const a6 = await tutorBand('a6', 'A');
    const a3 = await tutorBand('a3', 'A');
    const list = (await get(ADMIN, '/api/age-bands')).body as { students: { id: string; classId: string; effective: { ageBand: string } }[] };
    const dir = new Map(await directory('A'));
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    await ctx.M.ClassEnrollment.deleteMany({ id: { $in: ['enr_m1', 'enr_m2'] } });
    expect(a6).toEqual({ band: 'child', status: 'known', source: 'class_age_band' });
    expect(a3).toEqual({ band: 'adult', status: 'known', source: 'student_age_band' });
    expect(list.students.find((s) => s.id === 'a6')).toMatchObject({ classId: 'gA2', effective: { ageBand: 'child' } });
    expect(dir.get('a6')!.className).toBe('Group gA, Group gA2');
  });

  it("with the feature on, the answer really comes from enrollments; another school's row never counts", async () => {
    await ctx.M.Student.updateOne({ id: 'a4' }, { $set: { batchId: 'gA' } }); // old field only
    await ctx.M.ClassEnrollment.create({ id: 'enr_x', institutionId: 'B', studentId: 'a2', scope: 'group', targetId: 'gA2', status: 'active', source: 'manual', startedAt: new Date() });
    const off = await tutorBand('a4', 'A');
    setSwitches({ ENROLLMENT_READ_FROM: 'profile_context' });
    const on = await tutorBand('a4', 'A');
    const a2 = await tutorBand('a2', 'A');
    const dir = new Map(await directory('A'));
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    await ctx.M.Student.updateOne({ id: 'a4' }, { $unset: { batchId: 1 } });
    await ctx.M.ClassEnrollment.deleteOne({ id: 'enr_x' });
    expect(off.band).toBe('teen');
    expect(on.band).toBe('unknown');
    expect(a2.band).toBe('unknown');
    expect(dir.get('a2')!.className).toBeNull();
  });
});

describe('Q8 boundaries (child under 13, teen 13-17, adult 18+)', () => {
  it('bandFromBirthDate uses the age on the given day', async () => {
    const { bandFromBirthDate } = await import('../../src/models/learnerAgeBand');
    const now = new Date('2026-11-17T12:00:00Z');
    expect(bandFromBirthDate(new Date('2013-11-18'), now)).toBe('child'); // 12, birthday tomorrow
    expect(bandFromBirthDate(new Date('2013-11-17'), now)).toBe('teen'); // 13 today
    expect(bandFromBirthDate(new Date('2008-11-18'), now)).toBe('teen'); // 17
    expect(bandFromBirthDate(new Date('2008-11-17'), now)).toBe('adult'); // 18 today
    expect(bandFromBirthDate(undefined, now)).toBeUndefined();
    expect(bandFromBirthDate('not a date', now)).toBeUndefined();
    expect(bandFromBirthDate(new Date('2030-01-01'), now)).toBeUndefined(); // future
  });

  it("a student's own stored band always wins over the birth date", async () => {
    await ctx.M.Student.updateOne({ id: 'a3' }, { $set: { birthDate: new Date('2016-01-01') } });
    setSwitches({ ENROLLMENT_AGE_FROM_BIRTHDATE: 'true' });
    const b = await tutorBand('a3', 'A');
    setSwitches({ ENROLLMENT_AGE_FROM_BIRTHDATE: undefined });
    await ctx.M.Student.updateOne({ id: 'a3' }, { $unset: { birthDate: 1 } });
    expect(b).toEqual({ band: 'adult', status: 'known', source: 'student_age_band' });
  });
});
