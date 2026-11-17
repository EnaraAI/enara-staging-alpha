import request from 'supertest';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, expectSame, ignoredSeen, normalise, offOn, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 5, feature 7: attendance. With `attendance` in
// ENROLLMENT_READ_FROM the attendance roster comes from class_enrollments.
//   - ENROLLMENT_ATTENDANCE_FIX off: the roster is today's (the class's
//     explicit members only): byte-identical JSON.
//   - ENROLLMENT_ATTENDANCE_FIX on (Q7): students in the class only through
//     their group also appear: an intended, visible change.

const NOW = new Date('2026-11-17T12:00:00Z');
const TEACHER = 'teacher@a.test';
const ADMIN = 'admin@a.test';
const CLASSES = ['cA', 'cA2', 'cA3', 'cA4', 'cB'];
const calls: [string, string][] = [];
for (const u of [TEACHER, ADMIN, 'admin@b.test']) {
  calls.push([u, '/api/teacher/attendance/classes']);
  for (const c of CLASSES) calls.push([u, `/api/teacher/attendance/roster?courseInstanceId=${c}&date=2026-11-17`]);
}

async function save(user: string, courseInstanceId: string, studentId: string) {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => {});
  const r = await request(ctx.app).post('/api/teacher/attendance').set('Authorization', ctx.tokens[user])
    .send({ courseInstanceId, attendanceDate: '2026-11-16', records: [{ studentId, status: 'present' }] });
  return { status: r.status, body: r.body };
}

const rosterIds = (body: unknown) => ((body as { roster?: { studentId: string }[] }).roster ?? []).map((x) => x.studentId).sort();

beforeAll(async () => {
  await startFixture();
  // A saved day for cA (explicit member a2), so the roster shows a status.
  const r = await request(ctx.app).post('/api/teacher/attendance').set('Authorization', ctx.tokens[TEACHER])
    .send({ courseInstanceId: 'cA', attendanceDate: '2026-11-17', records: [{ studentId: 'a2', status: 'late', publicNote: 'bus' }] });
  if (r.status !== 200 && r.status !== 201) throw new Error(`seed attendance failed: ${r.status} ${JSON.stringify(r.body)}`);
}, 120_000);

afterAll(async () => {
  console.log(`[step5 attendance] ignored keys: ${[...ignoredSeen].join(', ') || 'none'}`);
  await stopFixture();
});

describe('attendance with ENROLLMENT_ATTENDANCE_FIX off: same answers off and on', () => {
  it('class list and rosters are identical (teacher, admins of both schools)', async () => {
    const r = await offOn('attendance', calls, { now: NOW, vars: { ENROLLMENT_ATTENDANCE_FIX: 'false' } });
    expectSame(r);
    const at = (u: string, c: string) => r.off.find((x) => x.u === u && x.p.includes(`=${c}&`))!;
    expect(rosterIds(at(TEACHER, 'cA').body)).toEqual(['a2', 'a3']); // today: explicit members only (Q7 gap)
    expect(JSON.stringify(at(TEACHER, 'cA').body)).toContain('"late"');
  });

  it('saving for a group-only student is refused exactly as today', async () => {
    const off = await save(TEACHER, 'cA', 'a1');
    setSwitches({ ENROLLMENT_READ_FROM: 'attendance', ENROLLMENT_ATTENDANCE_FIX: 'false' });
    const on = await save(TEACHER, 'cA', 'a1');
    setSwitches({ ENROLLMENT_READ_FROM: undefined, ENROLLMENT_ATTENDANCE_FIX: undefined });
    expect(off.status).toBe(400);
    expect(normalise(on)).toEqual(normalise(off));
  });

  it('the fix switch alone (without attendance in the list) changes nothing', async () => {
    const r = await offOn('student_app', calls, { now: NOW, vars: { ENROLLMENT_ATTENDANCE_FIX: 'true' } });
    expectSame(r);
  });
});

describe('attendance with ENROLLMENT_ATTENDANCE_FIX on (Q7, intended change)', () => {
  it('group-only students appear; nothing else changes', async () => {
    const r = await offOn('attendance', calls, { now: NOW, vars: { ENROLLMENT_ATTENDANCE_FIX: 'true' } });
    const expected: Record<string, string[]> = { cA: ['a1', 'a2', 'a3', 'a6'], cA2: ['a3'], cA4: ['a5'], cB: ['b1'] };
    for (let i = 0; i < r.off.length; i++) {
      const { u, p } = r.off[i];
      const cls = /courseInstanceId=(\w+)/.exec(p)?.[1];
      if (cls && expected[cls] && r.off[i].status === 200) {
        expect(rosterIds(r.on[i].body), `${u} ${p}`).toEqual(expected[cls]);
        // Only the roster rows differ: same session, class, date.
        const strip = (b: unknown) => ({ ...(b as object), roster: undefined });
        expect(strip(r.on[i].body)).toEqual(strip(r.off[i].body));
        // Rows that were there before are unchanged (status, note).
        const before = (r.off[i].body as { roster: { studentId: string }[] }).roster;
        for (const row of before) expect((r.on[i].body as { roster: { studentId: string }[] }).roster).toContainEqual(row);
      } else if (p.endsWith('/classes')) {
        const counts = (b: unknown) => Object.fromEntries((b as { courseInstanceId: string; studentCount: number }[]).map((c) => [c.courseInstanceId, c.studentCount]));
        const on = counts(r.on[i].body);
        for (const [c, ids] of Object.entries(expected)) if (c in on) expect(on[c], `${u} ${c}`).toBe(ids.length);
        const strip = (b: unknown) => (b as Record<string, unknown>[]).map((c) => ({ ...c, studentCount: undefined }));
        expect(strip(r.on[i].body)).toEqual(strip(r.off[i].body));
      } else {
        expect(r.on[i]).toEqual(r.off[i]); // refused or other school: unchanged
      }
    }
  });

  it('a group-only student can now be marked', async () => {
    setSwitches({ ENROLLMENT_READ_FROM: 'attendance', ENROLLMENT_ATTENDANCE_FIX: 'true' });
    const on = await save(TEACHER, 'cA', 'a1');
    const other = await save(TEACHER, 'cA', 'b1');
    setSwitches({ ENROLLMENT_READ_FROM: undefined, ENROLLMENT_ATTENDANCE_FIX: undefined });
    expect(on.status).toBe(200);
    expect(other.status).toBe(400);
  });

  it("another school's enrollment never shows up", async () => {
    await ctx.M.ClassEnrollment.create({ id: 'enr_x', institutionId: 'B', studentId: 'b1', scope: 'class', targetId: 'cA', status: 'active', source: 'manual', startedAt: new Date() });
    await ctx.M.ClassEnrollment.create({ id: 'enr_y', institutionId: 'B', studentId: 'b1', scope: 'group', targetId: 'gA', status: 'active', source: 'manual', startedAt: new Date() });
    const r = await offOn('attendance', [[TEACHER, '/api/teacher/attendance/roster?courseInstanceId=cA&date=2026-11-17'], [TEACHER, '/api/teacher/attendance/classes']], { now: NOW, vars: { ENROLLMENT_ATTENDANCE_FIX: 'true' } });
    await ctx.M.ClassEnrollment.deleteMany({ id: { $in: ['enr_x', 'enr_y'] } });
    expect(JSON.stringify(r.on[0].body)).not.toContain('b1');
    expect((r.on[1].body as { courseInstanceId: string; studentCount: number }[]).find((c) => c.courseInstanceId === 'cA')!.studentCount).toBe(4);
  });
});
