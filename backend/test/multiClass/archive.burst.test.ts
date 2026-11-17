import bcrypt from 'bcryptjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The lms-test churn burst (src/scripts/lmsTestBurst.ts) run end to end
// against a LOCAL app and an in-memory database: global fetch is replaced so
// every request to the lms-test address is answered by this process (no
// network). The maintenance endpoints are answered by the same services the
// maintenance router calls. Shadow, dual write and both archive switches on,
// as they would be on lms-test for this check.

const BASE = 'https://lms-test.enara.app';
const PW = 'Passw0rd!x';
let mongo: MongoMemoryServer;
let app: any; // eslint-disable-line @typescript-eslint/no-explicit-any
let dir: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    ENROLLMENT_DUAL_WRITE: 'true', ENROLLMENT_SHADOW: 'true', ENROLLMENT_GROUP_ARCHIVE: 'true', ENROLLMENT_STUDENT_ARCHIVE: 'true',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ENROLLMENT_READ_FROM', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete process.env[k];
  (await import('../../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const M: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const n of ['User', 'Institution', 'Student', 'Batch', 'CourseInstance', 'ClassEnrollment']) M[n] = (await import(`../../src/models/${n}`))[n];
  await M.ClassEnrollment.createIndexes();
  const hash = bcrypt.hashSync(PW, 4);
  const S = 'LT-SCHOOL-A';
  await M.Institution.create({ id: S, name: 'LT School A', features: { ai_tutor_enabled: true, learning_intelligence_enabled: true, teaching_engine_enabled: true, teaching_workflow_enabled: true } });
  for (const g of ['LT-G1', 'LT-G2', 'LT-G3']) await M.Batch.create({ id: g, name: `Group ${g}`, institutionId: S, academicYear: '2026' });
  for (let i = 1; i <= 12; i++) {
    const id = `LT-S-A${String(i).padStart(2, '0')}`;
    await M.Student.create({ id, name: `Seed ${id}`, email: `${id.toLowerCase()}@lms-test.example`, grade: '7', institutionId: S, ...(i <= 9 ? { batchId: `LT-G${(i % 3) + 1}` } : {}) });
    await M.User.create({ email: `${id.toLowerCase()}@lms-test.example`, password: hash, role: 'student', name: id, status: 'active', institutionId: S, studentId: id });
  }
  await M.Batch.updateMany({}, [{ $set: { studentCount: 3 } }]);
  const admin = await M.User.create({ email: 'admin.a@lms-test.example', password: hash, role: 'admin', name: 'Admin', status: 'active', institutionId: S });
  void admin;
  for (const [id, g, members] of [['LT-C1', 'LT-G1', ['LT-S-A10']], ['LT-C2', 'LT-G2', []], ['LT-C3', 'LT-G3', ['LT-S-A11', 'LT-S-A01']]] as const) {
    await M.CourseInstance.create({ id, courseId: id, courseName: `Course ${id}`, academicYear: '2026', institutionId: S, batchId: g, studentIds: members, visibility: 'student', instructorIds: [] });
  }
  await (await import('../../src/services/enrollmentBackfill')).applyBackfill();
  app = (await import('../../src/app')).createApp();

  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'burst-'));
  fs.writeFileSync(path.join(dir, 'pw'), PW);
  fs.writeFileSync(path.join(dir, 'maint'), 'local-maintenance-token');
  process.env.LMS_TEST_PASSWORD_FILE = path.join(dir, 'pw');
  process.env.MAINTENANCE_TOKEN_FILE = path.join(dir, 'maint');

  const { shadowReport } = await import('../../src/services/enrollmentShadowReport');
  const { planBackfill } = await import('../../src/services/enrollmentBackfill');
  const answer = (status: number, json: unknown) => ({ status, ok: status < 300, text: async () => JSON.stringify(json), json: async () => json });
  vi.stubGlobal('fetch', async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    if (!url.startsWith(`${BASE}/api/`)) throw new Error(`unexpected address ${url}`);
    const p = url.slice(BASE.length);
    await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => {});
    if (p.startsWith('/api/maintenance/enrollment-shadow-report')) return answer(200, await shadowReport({ days: 2, requiredCleanDays: 1 }));
    if (p.startsWith('/api/maintenance/enrollment-backfill')) return answer(200, { mode: 'dry-run', report: await planBackfill({ institutionId: JSON.parse(init.body ?? '{}').institutionId }) });
    const method = (init.method ?? 'GET').toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
    let r = request(app)[method](p);
    for (const [k, v] of Object.entries(init.headers ?? {})) r = r.set(k, v);
    const res = init.body === undefined ? await r : await r.send(JSON.parse(init.body));
    return answer(res.status, res.body);
  });
}, 120_000);

afterAll(async () => {
  vi.stubGlobal('fetch', realFetch);
  for (const k of ['ENROLLMENT_DUAL_WRITE', 'ENROLLMENT_SHADOW', 'ENROLLMENT_GROUP_ARCHIVE', 'ENROLLMENT_STUDENT_ARCHIVE', 'LMS_TEST_PASSWORD_FILE', 'MAINTENANCE_TOKEN_FILE']) delete process.env[k];
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('lms-test burst with archiving (local)', () => {
  it('runs every kind, including the archive kinds, with every check clean', async () => {
    const out = path.join(dir, 'log.json');
    const argv = process.argv;
    process.argv = [...argv.slice(0, 2), '--batches', '4', '--ops', '14', '--with-archive', '--seed', '7', '--out', out];
    const { main } = await import('../../src/scripts/lmsTestBurst');
    try {
      await main();
    } finally {
      process.argv = argv;
    }
    const log = JSON.parse(fs.readFileSync(out, 'utf8'));
    const ops = log.batches.flatMap((b: { ops: { op: string; status: number }[] }) => b.ops);
    const bad = log.batches.map((b: any) => ({ batch: b.batch, checks: b.checks, failedOps: b.ops.filter((o: { status: number }) => o.status >= 400 || o.status < 0), reads: b.reads.failed, inSync: b.consistency.inSync })); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect({ stoppedAt: log.stoppedAt, bad: bad.filter((b: any) => b.checks.length || b.failedOps.length || b.reads.length || !b.inSync) }).toEqual({ stoppedAt: null, bad: [] }); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(log.archive).toEqual({ group: true, student: true });
    const kinds = new Set(ops.map((o: { op: string }) => o.op));
    const counts: Record<string, number> = {};
    for (const o of ops) counts[o.op] = (counts[o.op] ?? 0) + 1;
    console.log(`[burst local] ops by kind: ${JSON.stringify(counts)}`);
    for (const k of ['temp_group', 'restore_group', 'archive_student', 'restore_student', 'delete_permanent']) expect(kinds).toContain(k);
    for (const f of Object.values(log.shadowAtEnd) as { mismatches: number; errors: number }[]) expect([f.mismatches, f.errors]).toEqual([0, 0]);
    // Seeded students are never archived or deleted.
    const { Student } = await import('../../src/models/Student');
    expect(await Student.countDocuments({ id: /^LT-S-A/, archivedAt: null })).toBe(12);
    process.exitCode = 0;
  }, 300_000);
});
