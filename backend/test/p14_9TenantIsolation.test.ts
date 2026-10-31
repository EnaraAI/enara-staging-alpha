import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// P14.9: tenant and class isolation with REAL foreign record ids (the P7 sweep
// fills ids with a placeholder). Two complete synthetic schools from the
// repository's own seed, plus a second class in school A. Every route is
// called, as every school-A identity (students included), with school B's
// real ids and with the other class's real ids; responses must not carry the
// foreign records and school B's stored records must be unchanged after every
// write attempt. In-memory MongoDB; providers mocked; all outbound network is
// blocked and counted.

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn(async () => { throw new Error('provider blocked in test'); }) };
    beta = { messages: { create: vi.fn(async () => { throw new Error('provider blocked in test'); }), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

const A = 'p149-a';
const B = 'p149-b';
const ALL_FLAGS = { educator_chat_enabled: true, documents_workspace_enabled: true, teaching_workflow_enabled: true, ai_lesson_planning_enabled: true, ai_assessment_authoring_enabled: true, connected_workflow_enabled: true, study_plans_enabled: true };
const CLASS2 = `${A}-class2`;
const BATCH2 = `${A}-batch2`;
const STU7 = `${A}-stu7`;
const CLASS1_STUDENTS = Array.from({ length: 6 }, (_, i) => `${A}-demo-stu-${i + 1}`);

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
const routes: { method: string; path: string }[] = [];
const who: Record<string, string> = {};
const foreignIds: string[] = []; // school B: one real id per record kind
const realFetch = globalThis.fetch;
let outbound = 0;

function mountPath(layer: any): string {
  const src: string = layer.regexp?.source ?? '';
  if (layer.regexp?.fast_slash) return '';
  return src.replace('^\\', '').replace(/\\\/\?\(\?=\\\/\|\$\)$/i, '').replace(/\\\//g, '/').replace(/\$$/, '').replace(/^\^/, '');
}
function collect(stack: any[], prefix: string) {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) for (const m of Object.keys(layer.route.methods)) if (typeof p === 'string') routes.push({ method: m.toUpperCase(), path: (prefix + p).replace(/\/+$/, '') || '/' });
    } else if (layer.name === 'router' && layer.handle?.stack) collect(layer.handle.stack, prefix + mountPath(layer));
  }
}

// Every stored document that belongs to school B, as a stable digest.
async function schoolBDigest(): Promise<{ hash: string; count: number }> {
  const db = mongoose.connection.db!;
  const parts: string[] = [];
  for (const { name } of (await db.listCollections().toArray()).sort((x, y) => x.name.localeCompare(y.name))) {
    if (['rate_limits', 'ai_calls', 'usage_ledger'].includes(name)) continue;
    const docs = await db.collection(name).find({ $or: [{ institutionId: B }, { id: { $regex: `^${B}` } }] }).sort({ _id: 1 }).toArray();
    for (const d of docs) parts.push(`${name}:${JSON.stringify(d)}`);
  }
  return { hash: crypto.createHash('sha256').update(parts.join('\n')).digest('hex'), count: parts.length };
}

let sent = 0;
const send = async (auth: string, method: string, path: string) => {
  if (++sent % 150 === 0) await mongoose.connection.collection('rate_limits').deleteMany({});
  const r = (request(app) as any)[method.toLowerCase()](path).set('Authorization', auth);
  return method === 'GET' || method === 'DELETE' ? r : r.send({});
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: '', CRON_SECRET: 'test-cron-secret-32-characters-min',
  });
  for (const k of ['ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID']) delete process.env[k];
  // No network beyond this machine: any provider call would be counted here.
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url instanceof Request ? url.url : url));
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return realFetch(url, init);
    outbound += 1;
    throw new Error('outbound network blocked in test');
  }) as typeof fetch;
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const { seed4Level1 } = await import('../src/scripts/seed4Level1');
  const { User } = await import('../src/models/User');
  const { Institution } = await import('../src/models/Institution');
  const { Student } = await import('../src/models/Student');
  const { CourseInstance } = await import('../src/models/CourseInstance');
  const { Batch } = await import('../src/models/Batch');
  const { signAccessToken } = await import('../src/auth/jwt');
  for (const inst of [A, B]) {
    await seed4Level1(inst);
    await Institution.updateOne({ id: inst }, { $set: Object.fromEntries(Object.entries(ALL_FLAGS).map(([k, v]) => [`features.${k}`, v])) });
  }
  // School A, class 2: its own batch, teacher and student, nobody from class 1.
  // (Enrollment is batch-based: every student of a batch is in every class on it.)
  await Batch.create({ id: BATCH2, name: 'Grade 8 B', institutionId: A, academicYear: '2026', studentCount: 1 });
  const t2 = await User.create({ email: `teacher2@${A}.test`, password: 'x', role: 'teacher', name: 'Teacher Two', institutionId: A, status: 'active' });
  await Student.create({ id: STU7, name: 'Student Seven', email: `student7@${A}.test`, grade: 'Grade 8', avatar: 'S7', institutionId: A, batchId: BATCH2 });
  const s7 = await User.create({ email: `student7@${A}.test`, password: 'x', role: 'student', name: 'Student Seven', institutionId: A, studentId: STU7, status: 'active' });
  await CourseInstance.create({ id: CLASS2, courseId: `${A}-course2`, courseName: 'English 8B', institutionId: A, academicYear: '2026', batchId: BATCH2, curriculumId: `${A}-demo-curriculum`, instructorIds: [t2._id.toString()], studentIds: [STU7], visibility: 'student' });

  const tok = (u: any) => `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId, studentId: u.studentId } as never)}`;
  for (const role of ['teacher', 'academic_manager', 'admin'] as const) who[`${role}_a`] = tok(await User.findOne({ institutionId: A, role }).lean());
  who.student_a = tok(await User.findOne({ institutionId: A, role: 'student', studentId: CLASS1_STUDENTS[0] }).lean());
  who.teacher2_a = tok(t2);
  who.student7_a = tok(s7);

  // One real school-B id per record kind, plus a B user id.
  const db = mongoose.connection.db!;
  for (const c of ['courseinstances', 'curricula', 'assessments', 'assessmentattempts', 'students', 'batches', 'tutorsessions', 'learningevents', 'curriculumfilejobs']) {
    const d = await db.collection(c).findOne({ institutionId: B });
    if (d?.id) foreignIds.push(String(d.id));
  }
  foreignIds.push(`${B}-demo-course`, `${B}-demo-ch-1`);
  const bUser = await User.findOne({ institutionId: B, role: 'teacher' }).lean();
  foreignIds.push(bUser!._id.toString());

  app = (await import('../src/app')).createApp();
  collect((app as any)._router.stack, '');
}, 180_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  await mongoose.disconnect();
  await mongo.stop();
});

const SKIP = new Set(['/api/auth/logout', '/api/cron/daily']); // logout revokes the caller (S-1); cron is secret-gated
const apiRoutes = () => routes.filter((r) => r.path.startsWith('/api/') && !SKIP.has(r.path));
const ok = (s: number) => s >= 200 && s < 300;
const serverError = (res: any) => res.status >= 500 && !(res.status === 503 && /_UNAVAILABLE$/.test(res.body?.error?.code ?? ''));

describe('P14.9 tenant isolation with real foreign ids', () => {
  it('fixtures: two schools, two classes in school A, foreign ids of every seeded kind', async () => {
    expect(apiRoutes().length).toBeGreaterThan(150);
    expect(foreignIds.length).toBeGreaterThanOrEqual(9);
    for (const id of foreignIds.slice(0, -1)) expect(id.startsWith(B), id).toBe(true);
    expect(Object.keys(who).sort()).toEqual(['academic_manager_a', 'admin_a', 'student7_a', 'student_a', 'teacher2_a', 'teacher_a']);
  });

  it('no school-A identity reads or changes school-B data through any route, with or without ?origin=all', async () => {
    const before = await schoolBDigest();
    expect(before.count).toBeGreaterThan(20);
    const leaks: string[] = [];
    const errors: string[] = [];
    for (const [name, auth] of Object.entries(who)) {
      for (const r of apiRoutes()) {
        const targets = r.path.includes(':') ? foreignIds.map((id) => [r.path.replace(/:([A-Za-z]+)/g, id), id]) : [[r.path, '']];
        const variants = r.method === 'GET' ? targets.flatMap(([t, id]) => [[t, id], [`${t}${t.includes('?') ? '&' : '?'}origin=all`, id]]) : targets;
        for (const [path, id] of variants) {
          const res = await send(auth, r.method, path);
          if (serverError(res)) errors.push(`${name} ${r.method} ${r.path} ${res.status} ${res.body?.error?.code ?? ''}`);
          // A returned B record carries "institutionId":"p149-b", so removing
          // an echo of the requested id never hides a real disclosure.
          const body = JSON.stringify(res.body ?? '').split(id || '\u0000').join('');
          if (ok(res.status) && body.includes(B)) leaks.push(`${name} ${r.method} ${path} ${res.status}`);
        }
      }
    }
    const after = await schoolBDigest();
    if (leaks.length || errors.length) console.error(`P149_LEAKS\n${leaks.join('\n')}\nP149_ERRORS\n${errors.join('\n')}`);
    expect(leaks).toEqual([]);
    expect(after).toEqual(before);
    // F-1 is fixed; only reviewed dependency-unavailable answers are allowed.
    expect(errors).toEqual([]);
  }, 600_000);

  it('class boundary: each teacher and student of school A reaches only their own class', async () => {
    const leaks: string[] = [];
    // Class-1 identities must never see class 2 or its student; class-2 identities never class 1 or its students.
    const cases: [string, string[], string[]][] = [
      ['teacher_a', [CLASS2, STU7], [STU7]],
      ['student_a', [CLASS2, STU7, `${A}-course2`], [STU7]],
      ['teacher2_a', [`${A}-demo-class`, ...CLASS1_STUDENTS.slice(0, 2), `${A}-demo-course`], CLASS1_STUDENTS],
      ['student7_a', [`${A}-demo-class`, CLASS1_STUDENTS[0], `${A}-demo-course`, `${A}-demo-attempt-1`, `${A}-demo-tutor-1`], CLASS1_STUDENTS],
    ];
    for (const [name, targets, forbidden] of cases) {
      for (const r of apiRoutes().filter((x) => x.method === 'GET')) {
        const paths = r.path.includes(':') ? targets.map((id) => [r.path.replace(/:([A-Za-z]+)/g, id), id]) : [[r.path, '']];
        for (const [path, id] of paths.flatMap(([p, id]) => [[p, id], [`${p}${p.includes('?') ? '&' : '?'}origin=all`, id]])) {
          const res = await send(who[name], 'GET', path);
          const body = JSON.stringify(res.body ?? '').split(id || '\u0000').join('');
          if (ok(res.status) && forbidden.some((f) => body.includes(f))) leaks.push(`${name} GET ${path}`);
        }
      }
    }
    if (leaks.length) console.error(`P149_CLASS_LEAKS\n${leaks.join('\n')}`);
    expect(leaks).toEqual([]);
  }, 600_000);

  it('explicit probes: rosters, profiles and student content across classes and schools are refused', async () => {
    const denied = (s: number) => [400, 403, 404].includes(s);
    const probes: [string, string][] = [
      ['teacher_a', `/api/teaching/classes/${CLASS2}/roster`],
      ['teacher_a', `/api/teaching/students/${STU7}/profile`],
      ['teacher2_a', `/api/teaching/classes/${A}-demo-class/roster`],
      ['teacher2_a', `/api/teaching/students/${CLASS1_STUDENTS[0]}/profile`],
      ['teacher_a', `/api/teaching/classes/${B}-demo-class/roster`],
      ['admin_a', `/api/students/${B}-demo-stu-1`],
      ['admin_a', `/api/course-instances/${B}-demo-class`],
      ['admin_a', `/api/curriculums/${B}-demo-curriculum`],
      ['academic_manager_a', `/api/analytics/students/${B}-demo-stu-1`],
      ['student_a', `/api/me/tutor/sessions/${A}-demo-tutor-2`],
      ['student_a', `/api/me/results/${A}-demo-attempt-2`],
      ['student_a', `/api/me/courses/${B}-demo-course`],
      ['student7_a', `/api/me/courses/${A}-demo-course`],
    ];
    const got = await Promise.all(probes.map(async ([name, path]) => [name, path, (await send(who[name], 'GET', path)).status] as const));
    for (const [name, path, status] of got) expect(denied(status), `${name} ${path} -> ${status}`).toBe(true);
    const classes = await send(who.teacher_a, 'GET', '/api/assignments/classes');
    expect(JSON.stringify(classes.body)).not.toContain(CLASS2);
    const classes2 = await send(who.teacher2_a, 'GET', '/api/assignments/classes');
    expect(JSON.stringify(classes2.body)).not.toContain(`${A}-demo-class`);
  });

  it('no request in this file reached the network', () => {
    expect(outbound).toBe(0);
  });
});
