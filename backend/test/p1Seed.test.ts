import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// P1: the 4Level1 demo seed. Synthetic data, one Teacher account (no separate
// content-creator account), idempotent, labelled demo_seed, reset scoped to
// one institution's demo rows. In-memory MongoDB only.
let mongo: MongoMemoryServer;
let S: typeof import('../src/scripts/seed4Level1');
let M: Record<string, mongoose.Model<any>>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', BCRYPT_ROUNDS: '10',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  S = await import('../src/scripts/seed4Level1');
  M = {};
  for (const n of ['User', 'Student', 'Batch', 'Curriculum', 'CourseInstance', 'AssessmentAttempt', 'LearningEvent', 'TutorSession', 'Institution']) M[n] = (await import(`../src/models/${n}`))[n];
  M.Assessment = (await import('../src/models/Assessment')).Assessment;
  for (const m of Object.values(M)) await m.createIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const m of Object.values(M)) await m.deleteMany({});
});

const counts = async (inst: string) =>
  Object.fromEntries(await Promise.all(Object.entries(M).filter(([n]) => n !== 'Institution').map(async ([n, m]) => [n, await m.countDocuments({ institutionId: inst })])));

describe('4Level1 seed', () => {
  it('creates one Teacher, one Academic Manager, one Workspace Admin, synthetic students, all labelled demo', async () => {
    const out = await S.seed4Level1('4level1-pilot');
    expect(out.staff.map((s) => s.role)).toEqual(['teacher', 'academic_manager', 'admin']);
    const staff = await M.User.find({ institutionId: '4level1-pilot', role: { $ne: 'student' } }).lean();
    expect(staff.map((u) => u.role).sort()).toEqual(['academic_manager', 'admin', 'teacher']);
    expect(staff.filter((u) => u.role === 'teacher')).toHaveLength(1);
    expect(JSON.stringify(staff).toLowerCase()).not.toContain('content creator');
    for (const [name, m] of Object.entries(M)) {
      if (name === 'Institution') continue;
      const rows = await m.find({ institutionId: '4level1-pilot' }).lean();
      expect(rows.length, name).toBeGreaterThan(0);
      expect(rows.every((r) => r.origin === 'demo_seed'), name).toBe(true);
    }
    // The teacher teaches the demo class and authored its curriculum.
    const teacher = staff.find((u) => u.role === 'teacher')!;
    const cls = await M.CourseInstance.findOne({ institutionId: '4level1-pilot' }).lean();
    expect(cls!.instructorIds).toEqual([teacher._id.toString()]);
    expect((await M.Curriculum.findOne({ id: cls!.curriculumId }).lean())!.createdBy).toBe(teacher._id.toString());
    expect(out.setupLinks).toEqual({});
  });

  it('is idempotent', async () => {
    await S.seed4Level1('4level1-pilot');
    const first = await counts('4level1-pilot');
    await S.seed4Level1('4level1-pilot');
    expect(await counts('4level1-pilot')).toEqual(first);
  });

  it('reset deletes only that institution\'s demo rows: live and other-school data survive', async () => {
    await S.seed4Level1('4level1-pilot');
    await S.seed4Level1('other-school');
    await M.User.create({ email: 'real.teacher@4level1.test', password: 'x', role: 'teacher', institutionId: '4level1-pilot' });
    await M.Student.create({ id: 'live-stu', name: 'Real Student', email: 'r@x.test', grade: '8', institutionId: '4level1-pilot' });
    await M.AssessmentAttempt.create({ id: 'live-att', assessmentId: 'a', assessmentTitle: 'A', studentId: 'live-stu', institutionId: '4level1-pilot', status: 'submitted' });
    const other = await counts('other-school');
    const removed = await S.reset4Level1('4level1-pilot');
    expect(removed.users).toBe(9);
    const left = await counts('4level1-pilot');
    expect(left).toMatchObject({ User: 1, Student: 1, AssessmentAttempt: 1, Batch: 0, Curriculum: 0, CourseInstance: 0, LearningEvent: 0, TutorSession: 0, Assessment: 0 });
    expect(await counts('other-school')).toEqual(other);
    expect(await M.Institution.exists({ id: '4level1-pilot' })).toBeTruthy();
  });

  it('never takes over a real account with a demo email', async () => {
    await M.User.create({ email: 'teacher@4level1-pilot.demo.enara.test', password: 'x', role: 'admin', institutionId: '4level1-pilot' });
    await expect(S.seed4Level1('4level1-pilot')).rejects.toThrow(/refusing to overwrite/);
    expect((await M.User.findOne({ email: 'teacher@4level1-pilot.demo.enara.test' }).lean())!.role).toBe('admin');
  });

  it('staff get single-use setup tokens only when asked; no reusable passwords are stored or returned', async () => {
    const out = await S.seed4Level1('4level1-pilot', { emitSetupLinks: true });
    expect(Object.keys(out.setupLinks).sort()).toEqual(['academic_manager', 'teacher', 'workspace_admin']);
    const { confirmPasswordReset } = await import('../src/services/accountTokens');
    await confirmPasswordReset(out.setupLinks.teacher, 'teacher-chosen-password');
    await expect(confirmPasswordReset(out.setupLinks.teacher, 'again-password-1')).rejects.toMatchObject({ code: 'RESET_TOKEN_INVALID' });
    expect(JSON.stringify(out)).not.toMatch(/password/i);
  });
});
