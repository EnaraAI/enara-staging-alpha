import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ctx, expectSame, get, ignoredSeen, offOn, PW, setSwitches, startFixture, stopFixture } from './step5.helpers';

// Multi-class step 5, feature 6: credits. With the feature on, the group label
// on AI credit usage rows (GET /api/credits, `batchId`) comes from
// class_enrollments. Byte-identical JSON for every single-class shape; the
// clock is frozen for both runs (the report has a 30-day window by day).

const NOW = new Date('2026-11-17T12:00:00Z');
const ADMIN = 'admin@a.test';
const ENARA = 'enara@x.test';

beforeAll(async () => {
  await startFixture();
  const { StudentCredit } = await import('../../src/models/StudentCredit');
  const { UsageEvent } = await import('../../src/models/UsageEvent');
  await StudentCredit.create({ studentId: 'a1', institutionId: 'A', limit: 1000, usage: 900 });
  await StudentCredit.create({ studentId: 'a5', institutionId: 'A', limit: 1000, usage: 100, status: 'throttled' });
  await StudentCredit.create({ studentId: 'b1', institutionId: 'B', limit: 500, usage: 20 });
  await UsageEvent.create({ id: 'u1', userId: 'x', studentId: 'a1', institutionId: 'A', feature: 'chat', requestId: 'r1', creditsUsed: 120, status: 'settled', timestamp: new Date(NOW.getTime() - 2 * 86_400_000) });
  await UsageEvent.create({ id: 'u2', userId: 'x', studentId: 'b1', institutionId: 'B', feature: 'voice', requestId: 'r2', creditsUsed: 20, status: 'settled', timestamp: new Date(NOW.getTime() - 86_400_000) });
  await ctx.M.User.create({ email: ENARA, password: bcrypt.hashSync(PW, 4), role: 'enara-admin', name: 'Enara Admin', status: 'active' });
  const r = await request(ctx.app).post('/api/auth/login').send({ email: ENARA, password: PW });
  ctx.tokens[ENARA] = `Bearer ${r.body.token}`;
}, 120_000);

afterAll(async () => {
  console.log(`[step5 credits] ignored keys: ${[...ignoredSeen].join(', ') || 'none'}`);
  await stopFixture();
});

describe('credits: same answers off and on', () => {
  it('the credits report is identical (school admins, Enara admin all schools and one school)', async () => {
    const r = await offOn('credits', [[ADMIN, '/api/credits'], ['admin@b.test', '/api/credits'], [ENARA, '/api/credits'], [ENARA, '/api/credits?institutionId=A']], { now: NOW });
    expectSame(r);
    const rows = (r.off[0].body as { students: { studentId: string; batchId?: string }[] }).students;
    expect(rows.find((x) => x.studentId === 'a1')!.batchId).toBe('gA');
    expect(rows.find((x) => x.studentId === 'a5')!.batchId).toBe('gDel');
    expect('batchId' in rows.find((x) => x.studentId === 'a2')!).toBe(false);
    expect(r.off[2].status).toBe(200);
  });

  it('switching back returns the old answer', async () => {
    const before = await get(ADMIN, '/api/credits');
    setSwitches({ ENROLLMENT_READ_FROM: 'credits' });
    await get(ADMIN, '/api/credits');
    setSwitches({ ENROLLMENT_READ_FROM: undefined });
    const after = await get(ADMIN, '/api/credits');
    expect(after.body.students).toEqual(before.body.students);
  });

  it("with the feature on, the label really comes from enrollments; another school's row never counts", async () => {
    await ctx.M.Student.updateOne({ id: 'a4' }, { $set: { batchId: 'gA' } }); // old field only
    await ctx.M.ClassEnrollment.create({ id: 'enr_x', institutionId: 'B', studentId: 'a2', scope: 'group', targetId: 'gB', status: 'active', source: 'manual', startedAt: new Date() });
    const r = await offOn('credits', [[ADMIN, '/api/credits'], [ENARA, '/api/credits']], { now: NOW });
    await ctx.M.Student.updateOne({ id: 'a4' }, { $unset: { batchId: 1 } });
    await ctx.M.ClassEnrollment.deleteOne({ id: 'enr_x' });
    const row = (x: { body: unknown }, id: string) => (x.body as { students: { studentId: string; batchId?: string }[] }).students.find((s) => s.studentId === id)!;
    expect(row(r.off[0], 'a4').batchId).toBe('gA');
    expect(row(r.on[0], 'a4').batchId).toBeUndefined();
    expect(row(r.on[0], 'a2').batchId).toBeUndefined();
    expect(row(r.on[1], 'a2').batchId).toBeUndefined();
  });
});
