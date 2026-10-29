import fs from 'fs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// P7 full feature x role sweep. The app's own route table is enumerated and
// every route is called as every role (two synthetic schools, in-memory DB).
// Asserts the security invariants; with ROLE_MATRIX_OUT set it also writes the
// observed matrix for the QA report. No provider is configured (no AI calls).

type Who = { auth?: string };
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
const users: Record<string, Who> = {};
const routes: { method: string; path: string }[] = [];
const A = 'qa-school-a';
const B = 'qa-school-b';
const ALL_FLAGS = { educator_chat_enabled: true, documents_workspace_enabled: true, teaching_workflow_enabled: true, ai_lesson_planning_enabled: true, ai_assessment_authoring_enabled: true, connected_workflow_enabled: true };

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
    } else if (layer.name === 'router' && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + mountPath(layer));
    }
  }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: '', CRON_SECRET: 'test-cron-secret-32-characters-min',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const { seed4Level1 } = await import('../src/scripts/seed4Level1');
  const { User } = await import('../src/models/User');
  const { Institution } = await import('../src/models/Institution');
  const { signAccessToken } = await import('../src/auth/jwt');
  for (const inst of [A, B]) {
    await seed4Level1(inst);
    await Institution.updateOne({ id: inst }, { $set: Object.fromEntries(Object.entries(ALL_FLAGS).map(([k, v]) => [`features.${k}`, v])) });
  }
  const tok = (u: any) => `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId, studentId: u.studentId } as never)}`;
  for (const inst of [A, B]) {
    const tag = inst === A ? 'a' : 'b';
    for (const role of ['teacher', 'academic_manager', 'admin', 'student'] as const) {
      const u = await User.findOne({ institutionId: inst, role }).lean();
      users[`${role}_${tag}`] = { auth: tok(u) };
    }
  }
  const ea = await User.create({ email: 'enara.admin@qa.test', password: 'x', role: 'enara-admin', name: 'QA ENARA admin', status: 'active' });
  users.enara_admin = { auth: tok(ea) };
  const dis = await User.create({ email: 'disabled.teacher@qa.test', password: 'x', role: 'teacher', name: 'Disabled', status: 'disabled', institutionId: A });
  users.disabled_teacher = { auth: tok(dis) };
  users.anonymous = {};
  app = (await import('../src/app')).createApp();
  collect((app as any)._router.stack, '');
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const PUBLIC = [/^\/health$/, /^\/ready$/, /^\/$/, /^\/api-docs/, /^\/api\/auth\/(login|register|demo-login|password-reset|refresh|logout|invitations)/, /^\/api\/workspace\/invitations\/(accept|lookup|[^/]+$)/];
const isPublic = (p: string) => PUBLIC.some((r) => r.test(p));
const fill = (p: string) => p.replace(/:([A-Za-z]+)/g, 'qa-nonexistent');
let sent = 0;
// The API rate limiter (300/min) would turn a full sweep into 429s: reset its
// in-memory records every 150 requests. Rate limiting itself is tested elsewhere.
const call = async (who: Who, method: string, path: string) => {
  if (++sent % 150 === 0) await mongoose.connection.collection('rate_limits').deleteMany({});
  return send(who, method, path);
};
const send = (who: Who, method: string, path: string) => {
  const r = (request(app) as any)[method.toLowerCase()](path);
  if (who.auth) r.set('Authorization', who.auth);
  return method === 'GET' || method === 'DELETE' ? r : r.send({});
};

describe('P7 feature x role sweep', () => {
  const observed: { role: string; method: string; path: string; status: number; code: string }[] = [];

  it('enumerates the API', () => {
    expect(routes.filter((r) => r.path.startsWith('/api/')).length).toBeGreaterThan(150);
  });

  it('calls every route as every role and keeps the security invariants', async () => {
    const api = routes.filter((r) => r.path.startsWith('/api/'));
    for (const role of Object.keys(users)) {
      for (const r of api) {
        const res = await call(users[role], r.method, fill(r.path));
        observed.push({ role, method: r.method, path: r.path, status: res.status, code: res.body?.error?.code ?? '' });
      }
    }
    if (process.env.ROLE_MATRIX_OUT) fs.writeFileSync(process.env.ROLE_MATRIX_OUT, JSON.stringify(observed));
    const ok = (s: number) => s >= 200 && s < 300;
    const v: string[] = [];
    for (const o of observed) {
      if (o.status === 429) v.push(`rate-limited ${o.role} ${o.method} ${o.path}`);
      // 503 *_UNAVAILABLE: an external dependency is not configured here (avatar, video storage); reported, not a defect.
      if (o.status >= 500 && !(o.status === 503 && /_UNAVAILABLE$/.test(o.code))) v.push(`5xx ${o.role} ${o.method} ${o.path} ${o.status} ${o.code}`);
      if ((o.role === 'anonymous' || o.role === 'disabled_teacher') && ok(o.status) && !isPublic(o.path)) v.push(`unauthenticated-access ${o.role} ${o.method} ${o.path}`);
      if (o.role.startsWith('academic_manager') && o.method !== 'GET' && ok(o.status) && !isPublic(o.path)) v.push(`academic-manager-write ${o.method} ${o.path}`);
      if (o.role.startsWith('student') && ok(o.status) && /^\/api\/(students|documents|usage\/(report|budget|plan|current-tools|savings)|ai-controls|workspace|educator-chat|lesson-plans|grading|learning\/flags|analytics\/overview|credits)/.test(o.path)) v.push(`student-staff-access ${o.method} ${o.path}`);
      if (o.role.startsWith('teacher') && ok(o.status) && o.method !== 'GET' && /^\/api\/(ai-controls|learning\/flags|workspace\/(users|invitations)$)/.test(o.path)) v.push(`teacher-admin-write ${o.method} ${o.path}`);
      if (!o.role.startsWith('enara_admin') && ok(o.status) && /^\/api\/ai-controls/.test(o.path)) v.push(`non-enara-ai-controls ${o.role} ${o.method} ${o.path}`);
    }
    // Known, reviewed findings (QA report): F-1 ingestion status needs Postgres,
    // which staging does not use, and answers 500 instead of 503; F-2 ending an
    // avatar session only ever closes the caller's own session (idempotent 204).
    const KNOWN = [/^5xx \S+ GET \/api\/ingestion\/status\/:eventId 500 /, /^academic-manager-write DELETE \/api\/avatar\/session\/:id$/];
    expect(v.filter((x) => !KNOWN.some((k) => k.test(x)))).toEqual([]);
  }, 600_000);

  it('blocks cross-school reads of curricula, documents and budgets', async () => {
    const { Curriculum } = await import('../src/models/Curriculum');
    const curA = await Curriculum.findOne({ institutionId: A }).lean();
    expect(curA).toBeTruthy();
    for (const role of ['teacher_b', 'admin_b', 'academic_manager_b', 'student_b']) {
      const r = await call(users[role], 'GET', `/api/curriculums/${curA!.id}`);
      expect([403, 404], `${role} curriculum`).toContain(r.status);
      const b = await call(users[role], 'GET', `/api/ai-controls/budgets/${A}`);
      expect([401, 403, 404], `${role} budget`).toContain(b.status);
    }
    const own = await call(users.teacher_a, 'GET', `/api/curriculums/${curA!.id}`);
    expect(own.status).toBe(200);
    const list = await call(users.admin_b, 'GET', '/api/curriculums');
    expect(JSON.stringify(list.body)).not.toContain(A);
  });

  it('rejects disabled accounts outright', async () => {
    const r = await call(users.disabled_teacher, 'GET', '/api/curriculums');
    expect(r.status).toBe(401);
  });
});
