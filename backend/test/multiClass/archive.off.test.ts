import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ALL_OFF, ALL_ON, api, ctx, mkClass, mkGroup, mkStudent, setSwitches, startArchiveFixture, stopFixture, type Res } from './archive.helpers';

// Multi-class step 6 archiving with ENROLLMENT_GROUP_ARCHIVE and
// ENROLLMENT_STUDENT_ARCHIVE off (the default): every endpoint behaves as
// before this step, the new routes do not exist, and the new guards make no
// database calls. (The dual write is on here, as on lms-test; it changes
// nothing about these checks.)

beforeAll(async () => {
  await startArchiveFixture();
  setSwitches(ALL_OFF);
}, 120_000);
afterAll(stopFixture);
afterEach(() => setSwitches(ALL_OFF));

const strip = (r: Res) => ({ status: r.status, body: JSON.parse(JSON.stringify(r.body, (k, v) => (k === 'requestId' ? undefined : v))) });

/** Mongo operations made during fn, as "collection.method". */
async function ops(fn: () => Promise<unknown>): Promise<string[]> {
  const seen: string[] = [];
  mongoose.set('debug', (coll: string, method: string) => { seen.push(`${coll}.${method}`); });
  try {
    await fn();
  } finally {
    mongoose.set('debug', false);
  }
  // Only the collections this step reads or writes (other writes, e.g. logs and
  // rate limits, can land asynchronously and are not part of the measure).
  return seen.filter((x) => /^(students|batches|courseinstances|class_enrollments)\./.test(x));
}

describe('switches off: the new routes do not exist', () => {
  it('each answers exactly what the same path answered before this step', async () => {
    const s = await mkStudent();
    const g = await mkGroup();
    const c = await mkClass(g);
    const pairs: [Parameters<typeof api>[1], string, string][] = [
      // [method, new route, a path that falls through the same way before this step]
      ['post', `/api/students/${s.id}/archive`, `/api/students/${s.id}/no-such-route`],
      ['post', `/api/students/${s.id}/restore`, `/api/students/${s.id}/no-such-route`],
      ['get', '/api/students/without-active-group', '/api/students/no-such-student'],
      ['get', '/api/students/archive-settings', '/api/students/no-such-student'],
      ['post', `/api/batches/${g}/archive`, `/api/batches/${g}/no-such-route`],
      ['post', `/api/batches/${g}/restore`, `/api/batches/${g}/no-such-route`],
      ['get', `/api/batches/${g}/history`, `/api/batches/${g}/no-such-route`],
      ['post', `/api/course-instances/${c}/archive`, `/api/course-instances/${c}/no-such-route`],
      ['post', `/api/course-instances/${c}/restore`, `/api/course-instances/${c}/no-such-route`],
      ['get', '/api/usage/seats', '/api/usage/no-such-route'],
    ];
    for (const [method, path, before] of pairs) {
      const now = strip(await api('admin@a.test', method, path));
      expect({ path, ...now }).toEqual({ path, ...strip(await api('admin@a.test', method, before)) });
      expect(now.status).toBe(404);
    }
    expect(await ctx.M.Batch.exists({ id: g, archivedAt: { $ne: null } })).toBeFalsy();
  });
});

describe('switches off: deletes and lists work as before', () => {
  it('deleting a group with students succeeds and leaves Student.batchId (old behaviour)', async () => {
    const g = await mkGroup();
    const s = await mkStudent({ batchId: g });
    const r = await api('admin@a.test', 'delete', `/api/batches/${g}`);
    expect(strip(r)).toEqual({ status: 200, body: { message: 'Batch deleted' } });
    expect((await ctx.M.Student.findOne({ id: s.id }).lean()).batchId).toBe(g);
    expect((await ctx.M.ClassEnrollment.findOne({ studentId: s.id, targetId: g }).lean()).status).toBe('active');
  });

  it('deleting a class with students succeeds', async () => {
    const c = await mkClass(await mkGroup());
    const s = await mkStudent();
    await api('admin@a.test', 'post', `/api/course-instances/${c}/students`, { studentId: s.id });
    expect(strip(await api('admin@a.test', 'delete', `/api/course-instances/${c}`))).toEqual({ status: 200, body: { message: 'Course instance deleted' } });
  });

  it('deleting a student needs no confirmation and keeps the old effects (login account left in place)', async () => {
    const s = await mkStudent();
    expect(strip(await api('admin@a.test', 'delete', `/api/students/${s.id}`))).toEqual({ status: 200, body: { message: 'Student deleted' } });
    expect(await ctx.M.Student.exists({ id: s.id })).toBeFalsy();
    expect(await ctx.M.User.exists({ studentId: s.id })).toBeTruthy(); // unchanged old behaviour (decision C changes it only behind the switch)
  });

  it('lists ignore archive fields and parameters; archived rows (if any) are listed as before', async () => {
    const s = await mkStudent();
    const g = await mkGroup();
    const c = await mkClass(g);
    await ctx.M.Student.updateOne({ id: s.id }, { $set: { archivedAt: new Date() } });
    await ctx.M.Batch.updateOne({ id: g }, { $set: { archivedAt: new Date() } });
    await ctx.M.CourseInstance.updateOne({ id: c }, { $set: { archivedAt: new Date() } });
    for (const [list, id] of [['/api/students?limit=100', s.id], ['/api/batches?limit=100', g], ['/api/course-instances?limit=100', c]]) {
      const plain = await api('admin@a.test', 'get', list);
      expect(plain.body.map((x: { id: string }) => x.id)).toContain(id);
      expect(await api('admin@a.test', 'get', `${list}&archived=only`)).toEqual(plain);
      expect(await api('admin@a.test', 'get', `${list}&includeArchived=true`)).toEqual(plain);
    }
    // Writes against those rows are not blocked either.
    expect((await api('admin@a.test', 'patch', `/api/students/${s.id}`, { batchId: g })).status).toBe(200);
    expect((await api('admin@a.test', 'post', `/api/course-instances/${c}/students`, { studentId: s.id })).status).toBe(200);
    await ctx.M.Student.updateOne({ id: s.id }, { $unset: { archivedAt: 1 } });
    await ctx.M.Batch.updateOne({ id: g }, { $unset: { archivedAt: 1 } });
    await ctx.M.CourseInstance.updateOne({ id: c }, { $unset: { archivedAt: 1 } });
  });
});

describe('switches off: no extra database work', () => {
  it('the guards and list filters make no database calls', async () => {
    setSwitches({ ...ALL_OFF, ENROLLMENT_DUAL_WRITE: undefined }); // the dual write's own reads are not part of this step
    const g = await mkGroup();
    expect(await ops(() => api('admin@a.test', 'delete', `/api/batches/${g}`))).toEqual(['batches.findOne', 'batches.deleteOne']);
    const g2 = await mkGroup();
    const created = await ops(() => api('admin@a.test', 'post', '/api/students', { name: 'Ops Student', email: 'ops1@t.test', grade: '7', batchId: g2 }));
    expect(created.filter((x) => x.startsWith('batches.'))).toEqual(['batches.findOne', 'batches.updateOne']);
    expect(await ops(() => api('admin@a.test', 'get', '/api/students'))).toEqual(['students.find']);
    expect(await ops(() => api('admin@a.test', 'get', '/api/batches'))).toEqual(['batches.find']);
    // With the switch on, the guard does its check (proves the measure works).
    setSwitches({ ...ALL_ON, ENROLLMENT_DUAL_WRITE: undefined });
    const g3 = await mkGroup();
    expect((await ops(() => api('admin@a.test', 'delete', `/api/batches/${g3}`))).filter((x) => x.startsWith('batches.'))).toEqual(['batches.findOne', 'batches.findOne', 'batches.deleteOne']);
  });
});

describe('switches on, nothing archived yet: reads are identical to off', () => {
  it('student, group and class lists and the class roster are byte-identical', async () => {
    const paths = ['/api/students?limit=100', '/api/batches?limit=100', '/api/course-instances?limit=100', '/api/students/a1', '/api/course-instances/cA/students', '/api/course-instances/cA/available-students'];
    const read = async () => { const out = []; for (const p of paths) out.push(strip(await api('admin@a.test', 'get', p))); return out; };
    const off = await read();
    setSwitches(ALL_ON);
    const on = await read();
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
    const me = async () => strip(await api('a3@t.test', 'get', '/api/me/courses'));
    const meOn = await me();
    setSwitches(ALL_OFF);
    expect(JSON.stringify(meOn)).toBe(JSON.stringify(await me()));
  });
});
