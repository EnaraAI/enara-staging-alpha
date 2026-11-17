import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ON, api, ctx, mkClass, mkGroup, mkStudent, setSwitches, startArchiveFixture, stopFixture } from './archive.helpers';

// Multi-class step 6 archiving: one school's admin can never see or change
// another school's groups, classes or students through the new actions, and
// archiving in school A leaves school B's data byte-identical.

beforeAll(startArchiveFixture, 120_000);
afterAll(stopFixture);
beforeEach(() => setSwitches(ALL_ON));

async function schoolB() {
  const out: Record<string, unknown> = {};
  for (const m of ['Student', 'Batch', 'CourseInstance', 'ClassEnrollment', 'User']) {
    out[m] = await ctx.M[m].find({ institutionId: 'B' }).sort({ _id: 1 }).lean();
  }
  return JSON.stringify(out);
}

describe('tenant isolation', () => {
  it("school B's admin gets 404 on every school A archive action, and A's actions leave B untouched", async () => {
    const before = await schoolB();
    const g = await mkGroup();
    const c = await mkClass(g);
    const s = await mkStudent({ batchId: g });
    const confirm = { confirm: `DELETE ${s.id}` };
    for (const [method, path, body] of [
      ['post', `/api/batches/${g}/archive`], ['post', `/api/batches/${g}/restore`], ['get', `/api/batches/${g}/history`], ['delete', `/api/batches/${g}`],
      ['post', `/api/course-instances/${c}/archive`], ['post', `/api/course-instances/${c}/restore`], ['delete', `/api/course-instances/${c}`],
      ['post', `/api/students/${s.id}/archive`], ['post', `/api/students/${s.id}/restore`], ['delete', `/api/students/${s.id}`, confirm],
    ] as const) {
      expect({ path, method, status: (await api('admin@b.test', method, path, body)).status }).toEqual({ path, method, status: 404 });
    }
    // A's admin does everything in A.
    expect((await api('admin@a.test', 'post', `/api/students/${s.id}/archive`)).status).toBe(200);
    expect((await api('admin@a.test', 'post', `/api/course-instances/${c}/archive`)).status).toBe(200);
    expect((await api('admin@a.test', 'post', `/api/batches/${g}/archive`)).status).toBe(200);
    expect((await api('admin@a.test', 'post', `/api/students/${s.id}/restore`)).status).toBe(200);
    expect((await api('admin@a.test', 'delete', `/api/students/${s.id}`, confirm)).status).toBe(200);
    expect(await schoolB()).toBe(before);
  });

  it('lists and counts are per school; an ENARA admin can pick a school', async () => {
    const sB = await mkStudent({ admin: 'admin@b.test', login: false });
    await api('admin@b.test', 'post', `/api/students/${sB.id}/archive`);
    expect((await api('admin@a.test', 'get', '/api/students?archived=only&limit=100')).body.map((x: { id: string }) => x.id)).not.toContain(sB.id);
    expect((await api('admin@b.test', 'get', '/api/students?archived=only&limit=100')).body.map((x: { id: string }) => x.id)).toEqual([sB.id]);
    const unA = (await api('admin@a.test', 'get', '/api/students/without-active-group')).body.students;
    expect(unA.every((x: { institutionId: string }) => x.institutionId === 'A')).toBe(true);
    const unB = (await api('enara@x.test', 'get', '/api/students/without-active-group?institutionId=B')).body.students;
    expect(unB.every((x: { institutionId: string }) => x.institutionId === 'B')).toBe(true);
    const seatsA = (await api('admin@a.test', 'get', '/api/usage/seats')).body;
    const seatsB = (await api('admin@b.test', 'get', '/api/usage/seats')).body;
    expect(seatsA.seats).toBe(await ctx.M.Student.countDocuments({ institutionId: 'A', archivedAt: null }));
    expect(seatsB).toEqual({ seatBasis: 'students', seats: await ctx.M.Student.countDocuments({ institutionId: 'B', archivedAt: null }), archivedExcluded: 1 });
    await api('admin@b.test', 'post', `/api/students/${sB.id}/restore`);
  });
});
