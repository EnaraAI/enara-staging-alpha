import bcrypt from 'bcryptjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { vi } from 'vitest';

// The lms-test churn burst (src/scripts/lmsTestBurst.ts) run end to end
// against a LOCAL app and an in-memory database: global fetch is replaced so
// every request to the lms-test address is answered by this process (no
// network). The maintenance endpoints are answered by the same services the
// maintenance router calls. Used by archive.burst.test.ts and
// step6.burst.test.ts, each with its own switches.

const BASE = 'https://lms-test.enara.app';
const PW = 'Passw0rd!x';
const realFetch = globalThis.fetch;
const st: { mongo?: MongoMemoryServer; dir?: string; env: string[] } = { env: [] };

export async function startBurstFixture(env: Record<string, string>) {
  st.mongo = await MongoMemoryServer.create();
  st.env = Object.keys(env);
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: st.mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'ENROLLMENT_READ_FROM', 'ENROLLMENT_MULTI_CLASS', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete process.env[k];
  Object.assign(process.env, env);
  (await import('../../src/config/env')).resetConfigForTests();
  await mongoose.connect(st.mongo.getUri());
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
  await M.User.create({ email: 'admin.a@lms-test.example', password: hash, role: 'admin', name: 'Admin', status: 'active', institutionId: S });
  for (const [id, g, members] of [['LT-C1', 'LT-G1', ['LT-S-A10']], ['LT-C2', 'LT-G2', []], ['LT-C3', 'LT-G3', ['LT-S-A11', 'LT-S-A01']]] as const) {
    await M.CourseInstance.create({ id, courseId: id, courseName: `Course ${id}`, academicYear: '2026', institutionId: S, batchId: g, studentIds: members, visibility: 'student', instructorIds: [] });
  }
  await (await import('../../src/services/enrollmentBackfill')).applyBackfill();
  const app = (await import('../../src/app')).createApp();

  st.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'burst-'));
  fs.writeFileSync(path.join(st.dir, 'pw'), PW);
  fs.writeFileSync(path.join(st.dir, 'maint'), 'local-maintenance-token');
  process.env.LMS_TEST_PASSWORD_FILE = path.join(st.dir, 'pw');
  process.env.MAINTENANCE_TOKEN_FILE = path.join(st.dir, 'maint');

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
  return { M, app };
}

export async function stopBurstFixture() {
  vi.stubGlobal('fetch', realFetch);
  for (const k of [...st.env, 'LMS_TEST_PASSWORD_FILE', 'MAINTENANCE_TOKEN_FILE']) delete process.env[k];
  await mongoose.disconnect();
  await st.mongo?.stop();
  if (st.dir) fs.rmSync(st.dir, { recursive: true, force: true });
}

/** Runs the burst's main() with these arguments; returns its JSON log. */
export async function runBurst(args: string[]) {
  const out = path.join(st.dir!, `log-${Date.now()}.json`);
  const argv = process.argv;
  process.argv = [...argv.slice(0, 2), ...args, '--out', out];
  const { main } = await import('../../src/scripts/lmsTestBurst');
  try {
    await main();
  } finally {
    process.argv = argv;
    process.exitCode = 0;
  }
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

type Log = { stoppedAt: number | null; batches: { batch: number; checks: string[]; ops: { op: string; status: number }[]; reads: { failed: string[] }; consistency: { inSync: boolean } }[] };

/** Batches with a failed check, op or read, or out of sync. */
export function badBatches(log: Log) {
  return log.batches
    .map((b) => ({ batch: b.batch, checks: b.checks, failedOps: b.ops.filter((o) => o.status >= 400 || o.status < 0), reads: b.reads.failed, inSync: b.consistency.inSync }))
    .filter((b) => b.checks.length || b.failedOps.length || b.reads.length || !b.inSync);
}

export function opCounts(log: Log): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of log.batches.flatMap((b) => b.ops)) counts[o.op] = (counts[o.op] ?? 0) + 1;
  return counts;
}
