import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Multi-class step 1 (docs/multi-class/PLAN.md): the class_enrollments
// collection and services/enrollment.ts exist, keep the membership rule and
// the school boundary, and nothing in the app uses them yet.

let mongo: MongoMemoryServer;
let E: typeof import('../../src/services/enrollment');
let ClassEnrollment: typeof import('../../src/models/ClassEnrollment')['ClassEnrollment'];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum',
    INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  });
  (await import('../../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  E = await import('../../src/services/enrollment');
  ClassEnrollment = (await import('../../src/models/ClassEnrollment')).ClassEnrollment;
  const { Student } = await import('../../src/models/Student');
  const { Batch } = await import('../../src/models/Batch');
  const { CourseInstance } = await import('../../src/models/CourseInstance');
  for (const s of ['A', 'B']) {
    await Batch.create({ id: `g1-${s}`, name: `Group 1 ${s}`, institutionId: `school-${s}`, academicYear: '2026' });
    await Batch.create({ id: `g2-${s}`, name: `Group 2 ${s}`, institutionId: `school-${s}`, academicYear: '2026' });
    await CourseInstance.create({ id: `c1-${s}`, courseId: 'eng', courseName: 'English', academicYear: '2026', institutionId: `school-${s}`, batchId: `g1-${s}` });
    await CourseInstance.create({ id: `c2-${s}`, courseId: 'math', courseName: 'Maths', academicYear: '2026', institutionId: `school-${s}`, batchId: `g2-${s}` });
    for (const n of [1, 2, 3]) await Student.create({ id: `s${n}-${s}`, name: `Student ${n} ${s}`, email: `s${n}@${s}.test`, institutionId: `school-${s}` });
  }
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await ClassEnrollment.deleteMany({});
  await ClassEnrollment.createIndexes();
});

describe('enroll and end', () => {
  it('creates one active row, and enrolling again changes nothing', async () => {
    const a = await E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'group', targetId: 'g1-A', source: 'manual', createdBy: 'u1' });
    expect(a).toMatchObject({ status: 'active', role: 'learner', source: 'manual', createdBy: 'u1', scope: 'group', targetId: 'g1-A' });
    expect(a.id).toMatch(/^enr_/);
    const again = await E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'group', targetId: 'g1-A', source: 'lms' });
    expect(again.id).toBe(a.id);
    expect(again.source).toBe('manual'); // set on first creation only
    expect(await ClassEnrollment.countDocuments()).toBe(1);
  });

  it('simultaneous enrolls of the same student and target make one row', async () => {
    await Promise.all(Array.from({ length: 8 }, () => E.enroll({ institutionId: 'school-A', studentId: 's2-A', scope: 'class', targetId: 'c1-A', source: 'manual' })));
    expect(await ClassEnrollment.countDocuments({ studentId: 's2-A' })).toBe(1);
  });

  it('ending keeps the row (history); re-enrolling reactivates it with a new start date', async () => {
    const first = await E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'class', targetId: 'c2-A', source: 'manual', startedAt: new Date('2026-01-01') });
    expect(await E.endEnrollment({ studentId: 's1-A', scope: 'class', targetId: 'c2-A', status: 'inactive', endedBy: 'u2' })).toBe(true);
    expect(await E.endEnrollment({ studentId: 's1-A', scope: 'class', targetId: 'c2-A', status: 'removed' })).toBe(false); // already ended
    const ended = await ClassEnrollment.findOne({ id: first.id }).lean();
    expect(ended).toMatchObject({ status: 'inactive', endedBy: 'u2' });
    expect(ended!.endedAt).toBeInstanceOf(Date);
    const back = await E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'class', targetId: 'c2-A', source: 'manual' });
    expect(back.id).toBe(first.id);
    expect(back.status).toBe('active');
    expect(back.endedAt).toBeUndefined();
    expect(back.startedAt.getTime()).toBeGreaterThan(new Date('2026-01-01').getTime());
  });
});

describe('school boundary', () => {
  it('refuses a student or a group/class from another school, or unknown ones', async () => {
    await expect(E.enroll({ institutionId: 'school-A', studentId: 's1-B', scope: 'group', targetId: 'g1-A', source: 'manual' })).rejects.toMatchObject({ code: 'STUDENT_NOT_FOUND' });
    await expect(E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'group', targetId: 'g1-B', source: 'manual' })).rejects.toMatchObject({ code: 'ENROLLMENT_TARGET_NOT_FOUND' });
    await expect(E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'class', targetId: 'c1-B', source: 'manual' })).rejects.toMatchObject({ code: 'ENROLLMENT_TARGET_NOT_FOUND' });
    await expect(E.enroll({ institutionId: 'school-A', studentId: 'nobody', scope: 'class', targetId: 'c1-A', source: 'manual' })).rejects.toMatchObject({ code: 'STUDENT_NOT_FOUND' });
    await expect(E.enroll({ institutionId: '', studentId: 's1-A', scope: 'class', targetId: 'c1-A', source: 'manual' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await ClassEnrollment.countDocuments()).toBe(0);
  });

  it('every row requires a school', async () => {
    const err = new ClassEnrollment({ studentId: 's', scope: 'class', targetId: 't', source: 'manual' }).validateSync();
    expect(err?.errors.institutionId).toBeDefined();
  });
});

describe('the membership rule (same as today)', () => {
  it('a class has its explicit members plus members of its group; ended rows do not count', async () => {
    await E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'group', targetId: 'g1-A', source: 'manual' }); // via group
    await E.enroll({ institutionId: 'school-A', studentId: 's2-A', scope: 'class', targetId: 'c1-A', source: 'manual' }); // explicit
    await E.enroll({ institutionId: 'school-A', studentId: 's3-A', scope: 'class', targetId: 'c1-A', source: 'manual' });
    await E.endEnrollment({ studentId: 's3-A', scope: 'class', targetId: 'c1-A', status: 'removed' });
    expect((await E.studentIdsInClass({ id: 'c1-A', batchId: 'g1-A', institutionId: 'school-A' })).sort()).toEqual(['s1-A', 's2-A']);
    expect(await E.studentIdsInClass({ id: 'c2-A', batchId: 'g2-A', institutionId: 'school-A' })).toEqual([]);
    expect(await E.studentIdsInGroup('g1-A', 'school-A')).toEqual(['s1-A']);
  });

  it("a student's classes filter matches explicit classes and every class of their groups", async () => {
    const { CourseInstance } = await import('../../src/models/CourseInstance');
    expect(await E.enrolledClassFilter('s1-A')).toBeNull();
    await E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'group', targetId: 'g1-A', source: 'manual' });
    await E.enroll({ institutionId: 'school-A', studentId: 's1-A', scope: 'class', targetId: 'c2-A', source: 'manual' });
    const filter = await E.enrolledClassFilter('s1-A', 'school-A');
    const ids = (await CourseInstance.find({ institutionId: 'school-A', ...filter! }).lean()).map((c) => c.id).sort();
    expect(ids).toEqual(['c1-A', 'c2-A']);
    expect(await E.activeTargets('s1-A')).toEqual({ groupIds: ['g1-A'], classIds: ['c2-A'] });
  });
});

describe('migration and isolation from the app', () => {
  it('the step 1 migration creates the indexes and is safe to run twice', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const m = MIGRATIONS.find((x) => x.id === '2026-11-17-class-enrollments-step1')!;
    await m.up();
    await m.up();
    const names = (await mongoose.connection.db!.collection('class_enrollments').indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['one_enrollment_per_target', 'roster', 'student_classes', 'backfilled']));
  });

  it('only the step 2 write-both helper imports the enrollment service (no reads are switched yet)', () => {
    const src = path.resolve(__dirname, '../../src');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith(path.join('services', 'enrollment.ts')) && /(services\/|\.\/)enrollment['"]/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(src, p));
      }
    };
    walk(src);
    expect(hits).toEqual([path.join('services', 'enrollmentSync.ts')]);
  });
});
