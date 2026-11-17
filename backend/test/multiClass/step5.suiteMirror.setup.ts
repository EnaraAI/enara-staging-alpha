import { beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AsyncLocalStorage } from 'node:async_hooks';

// Multi-class step 5, whole-suite check with every feature on
// (vitest.step5-suite.config.ts). Most suites create students and classes
// directly in the database, so class_enrollments is empty there: with the
// features on they would see nobody in any class, which says nothing about the
// switch. In production the switch is turned on only after the backfill, with
// dual write on. This setup stands in for a perfect dual write from day one:
// before every class_enrollments read it rebuilds the mirrored rows from the
// old fields (Student.batchId -> group row in the student's school, unless the
// group belongs to another school; CourseInstance.studentIds -> class row when
// the student is in the class's school). A group that no longer exists is
// treated like a group deleted after the dual write (the row stays, as in the
// app). Rows a test created itself (no migratedFrom) are kept. Mirrored rows
// are deterministic (ids, _id and dates derive from the membership), so a
// rebuild leaves the stored data byte-identical (the P14.9/P19 isolation
// sweeps hash every stored document). The mirror also runs before each test.
// Left alone: test/multiClass and the backfill/shadow maintenance route suite
// (they set up, count and drift enrollments on purpose).
// Test-only; nothing in src uses this.

type State = { enabled: boolean; chain: Promise<unknown>; inside: AsyncLocalStorage<boolean> };
const g = globalThis as unknown as { __step5Mirror?: State };
const state: State = (g.__step5Mirror ??= { enabled: false, chain: Promise.resolve(), inside: new AsyncLocalStorage<boolean>() });

const READS = new Set(['find', 'findOne', 'countDocuments', 'distinct']);
const proto = mongoose.Query.prototype as unknown as { exec: (...a: unknown[]) => Promise<unknown>; __step5Mirror?: boolean };
if (!proto.__step5Mirror) {
  proto.__step5Mirror = true;
  const exec = proto.exec;
  proto.exec = function (this: { model?: { modelName?: string }; op?: string }, ...args: unknown[]) {
    if (!state.enabled || this.model?.modelName !== 'ClassEnrollment' || !READS.has(this.op ?? '') || state.inside.getStore() || !process.env.ENROLLMENT_READ_FROM) {
      return exec.apply(this, args);
    }
    return locked(async () => {
      await mirror();
      return exec.apply(this, args);
    });
  };
}

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = () => state.inside.run(true, fn);
  const p = state.chain.then(run, run);
  state.chain = p.catch(() => undefined);
  return p;
}

async function mirror() {
  const db = mongoose.connection.db!;
  const rows = db.collection('class_enrollments');
  await rows.deleteMany({ migratedFrom: { $exists: true } });
  const groupSchool = new Map((await db.collection('batches').find({}, { projection: { id: 1, institutionId: 1 } }).toArray()).map((b) => [b.id, b.institutionId]));
  const students = await db.collection('students').find({}, { projection: { id: 1, institutionId: 1, batchId: 1 } }).toArray();
  const studentSchool = new Map(students.map((s) => [s.id, s.institutionId]));
  const now = new Date(0);
  const docs: Record<string, unknown>[] = [];
  const row = (institutionId: string, studentId: string, scope: string, targetId: string, migratedFrom: string) =>
    docs.push({
      _id: new mongoose.Types.ObjectId(crypto.createHash('sha1').update(`${scope}|${studentId}|${targetId}`).digest('hex').slice(0, 24)),
      id: `enr_m_${scope}_${studentId}_${targetId}`, institutionId, studentId, scope, targetId, role: 'learner', status: 'active', source: 'manual', migratedFrom, startedAt: now, createdAt: now, updatedAt: now,
    });
  for (const s of students) {
    if (!s.institutionId || !s.batchId) continue;
    const school = groupSchool.get(s.batchId);
    if (school !== undefined && school !== s.institutionId) continue;
    row(s.institutionId, s.id, 'group', s.batchId, 'student.batchId');
  }
  for (const c of await db.collection('courseinstances').find({}, { projection: { id: 1, institutionId: 1, studentIds: 1 } }).toArray()) {
    if (!c.institutionId) continue;
    for (const sid of new Set<string>(c.studentIds ?? [])) if (studentSchool.get(sid) === c.institutionId) row(c.institutionId, sid, 'class', c.id, 'courseInstance.studentIds');
  }
  if (docs.length) await rows.insertMany(docs, { ordered: false }).catch(() => undefined); // a test's own row wins
}

const SKIP = ['/test/multiClass/', '/test/maintenanceLmsTest.test.ts'];

beforeAll((suite) => {
  const file = (suite as unknown as { file?: { filepath?: string }; filepath?: string });
  const path = (file.file?.filepath ?? file.filepath ?? '').replace(/\\/g, '/');
  state.enabled = !SKIP.some((s) => path.includes(s));
});

beforeEach(async () => {
  if (state.enabled && process.env.ENROLLMENT_READ_FROM && mongoose.connection.readyState === 1) await locked(mirror).catch(() => undefined);
});
