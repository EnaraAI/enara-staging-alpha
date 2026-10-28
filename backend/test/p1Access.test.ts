import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P1: permission layer, teacher authoring/publishing scope, academic manager,
// workspace admin, invitations, password reset, tenant isolation. Offline.
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn() };
    beta = { messages: { create: vi.fn(), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;
let tokens: typeof import('../src/services/accountTokens');
let P: typeof import('../src/auth/permissions');

const FLAGS = { teaching_workflow_enabled: true, ai_grading_enabled: true };
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
  ({ signAccessToken } = await import('../src/auth/jwt'));
  tokens = await import('../src/services/accountTokens');
  P = await import('../src/auth/permissions');
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'AiCall']) M[name] = (await import(`../src/models/${name}`))[name];
  const t = await import('../src/models/AccountToken');
  M.Invitation = t.Invitation;
  M.PasswordReset = t.PasswordReset;
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

type Who = { id: string; auth: string; get: (u: string) => request.Test; post: (u: string, b?: object) => request.Test; put: (u: string, b?: object) => request.Test; patch: (u: string, b?: object) => request.Test; del: (u: string) => request.Test };
async function who(role: string, institutionId?: string, extra: Record<string, unknown> = {}): Promise<Who> {
  const email = `${role}-${Math.random().toString(36).slice(2)}@t.test`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, ...extra });
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email, role: role as never, institutionId, studentId: extra.studentId as string })}`;
  const w = (m: 'get' | 'post' | 'put' | 'patch' | 'delete') => (u: string, b?: object) => (request(app) as any)[m](u).set('Authorization', auth).send(b);
  return { id: user._id.toString(), auth, get: w('get'), post: w('post'), put: w('put'), patch: w('patch'), del: w('delete') };
}

let T: Who, T2: Who, AM: Who, WA: Who, S: Who, WB: Who, TB: Who, E: Who;
beforeEach(async () => {
  for (const m of Object.values(M)) await m.deleteMany({});
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([{ id: 'instA', name: 'A', features: FLAGS }, { id: 'instB', name: 'B', features: FLAGS }]);
  T = await who('teacher', 'instA');
  T2 = await who('teacher', 'instA');
  AM = await who('academic_manager', 'instA');
  WA = await who('admin', 'instA');
  S = await who('student', 'instA', { studentId: 'stuA' });
  WB = await who('admin', 'instB');
  TB = await who('teacher', 'instB');
  E = await who('enara-admin');
  await M.Student.create({ id: 'stuA', name: 'Stu', email: 's@x.test', grade: '8', institutionId: 'instA' });
  await M.CourseInstance.create([
    { id: 'classA', courseId: 'c', courseName: 'A', institutionId: 'instA', academicYear: '2026', batchId: 'b', instructorIds: [T.id], studentIds: ['stuA'] },
    { id: 'classA2', courseId: 'c2', courseName: 'A2', institutionId: 'instA', academicYear: '2026', batchId: 'b', instructorIds: [T2.id], studentIds: [] },
    { id: 'classB', courseId: 'cb', courseName: 'B', institutionId: 'instB', academicYear: '2026', batchId: 'bb', instructorIds: [TB.id], studentIds: [] },
  ]);
});

const newCurriculum = (w: Who, over: object = {}) => w.post('/api/curriculums', { name: 'Reading', summary: 'Main ideas', chapters: [{ title: 'Ch 1' }], ...over });

describe('role permission defaults', () => {
  it('matches the pilot matrix; there is no content-creator role', async () => {
    const { USER_ROLES } = await import('../src/auth/roles');
    expect(USER_ROLES).toEqual(['student', 'teacher', 'academic_manager', 'admin', 'enara-admin']);
    expect(USER_ROLES.some((r) => /content/.test(r))).toBe(false);
    const of = (role: string, permissions?: string[]) => [...P.permissionsFor({ role: role as never, permissions })].sort();
    expect(of('teacher')).toEqual(['class:teach', 'content:author', 'content:publish']);
    expect(of('academic_manager')).toEqual(['insights:read_school']);
    expect(of('admin')).toEqual(['class:teach', 'content:author', 'content:manage_school', 'content:publish', 'insights:read_school', 'workspace:billing', 'workspace:users']);
    expect(of('student', ['content:author'])).toEqual([]);
    expect(of('admin', ['cost:internal'])).not.toContain('cost:internal');
    expect(of('enara-admin')).toContain('cost:internal');
  });
});

describe('teacher: AI Studio authoring and class-scoped publishing', () => {
  it('authors a draft curriculum and publishes it to a class they teach', async () => {
    const created = await newCurriculum(T);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'draft', createdBy: T.id, institutionId: 'instA' });
    const id = created.body.id;
    expect((await T.patch(`/api/curriculums/${id}`, { summary: 'Updated' })).status).toBe(200);
    expect((await T.get('/api/curriculums')).body.map((c: { id: string }) => c.id)).toEqual([id]);
    const pub = await T.post(`/api/curriculums/${id}/publish-to-class`, { classId: 'classA' });
    expect(pub.status).toBe(200);
    expect((await M.CourseInstance.findOne({ id: 'classA' }).lean())!.curriculumId).toBe(id);
  });

  it('cannot publish into another teacher\'s class or another school, nor edit others\' content', async () => {
    const id = (await newCurriculum(T)).body.id;
    expect((await T.post(`/api/curriculums/${id}/publish-to-class`, { classId: 'classA2' })).status).toBe(404);
    expect((await T.post(`/api/curriculums/${id}/publish-to-class`, { classId: 'classB' })).status).toBe(404);
    expect((await T2.patch(`/api/curriculums/${id}`, { summary: 'x' })).status).toBe(404);
    expect((await T2.get(`/api/curriculums/${id}`)).status).toBe(404);
    expect((await T2.post(`/api/curriculums/${id}/publish-to-class`, { classId: 'classA2' })).status).toBe(404);
    expect((await TB.get(`/api/curriculums/${id}`)).status).toBe(404);
    expect((await M.CourseInstance.findOne({ id: 'classA2' }).lean())!.curriculumId).toBeUndefined();
  });

  it('a curriculum linked to a class the teacher teaches is readable but not editable', async () => {
    const id = (await newCurriculum(WA)).body.id;
    await M.CourseInstance.updateOne({ id: 'classA' }, { curriculumId: id });
    expect((await T.get(`/api/curriculums/${id}`)).status).toBe(200);
    expect((await T.patch(`/api/curriculums/${id}`, { summary: 'x' })).status).toBe(404);
    expect((await T2.get(`/api/curriculums/${id}`)).status).toBe(404);
  });

  it('school-wide actions stay denied without a separate explicit grant', async () => {
    const id = (await newCurriculum(T)).body.id;
    expect((await newCurriculum(T, { status: 'deployed' })).status).toBe(403);
    expect((await T.patch(`/api/curriculums/${id}/deploy`)).status).toBe(403);
    expect((await T.del(`/api/curriculums/${id}`)).status).toBe(403);
    expect((await T.post(`/api/curriculums/${id}/assign-batch`, { batchId: 'b' })).status).toBe(403);
    expect((await T.get(`/api/curriculums/${id}/batches`)).status).toBe(403);
    // The Workspace Admin grants content:manage_school explicitly.
    const grant = await WA.put(`/api/workspace/users/${T.id}/permissions`, { permissions: ['content:manage_school'] });
    expect(grant.status).toBe(200);
    expect(grant.body.permissions).toContain('content:manage_school');
    expect((await T.patch(`/api/curriculums/${id}/deploy`)).status).toBe(200);
  });

  it('teaching routes stay limited to the teacher\'s own classes', async () => {
    const own = await T.get('/api/assignments/classes');
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.body)).toContain('classA');
    expect(JSON.stringify(own.body)).not.toContain('classA2');
    expect([403, 404]).toContain((await T.get('/api/teaching/classes/classA2/roster')).status);
    expect([403, 404]).toContain((await T.get('/api/teaching/classes/classB/roster')).status);
    expect((await T.get('/api/teaching/classes/classA/roster')).status).toBe(200);
  });

  it('cannot administer users or budgets, read internal costs, or use ENARA controls', async () => {
    for (const [m, u, b] of [
      ['get', '/api/workspace/users'], ['post', '/api/workspace/invitations', { email: 'x@x.test', role: 'teacher' }],
      ['get', '/api/ai-controls/budgets/instA'], ['put', '/api/ai-controls/pause', { paused: true }],
      ['get', '/api/analytics/overview'], ['get', '/api/analytics/ai-usage'], ['get', '/api/teaching/ops'],
      ['get', '/api/integrations/institutions'], ['post', '/api/auth/users', { email: 'y@y.test', password: 'password1', role: 'student' }],
    ] as [string, string, object?][]) {
      expect([403]).toContain((await (T as any)[m === 'delete' ? 'del' : m](u, b)).status);
    }
  });
});

describe('academic manager: read-mostly school insights', () => {
  it('reads school analytics without internal cost, and mutates nothing', async () => {
    expect((await AM.get('/api/analytics/overview')).status).toBe(200);
    const usage = await AM.get('/api/analytics/ai-usage');
    expect(usage.status).toBe(200);
    expect(JSON.stringify(usage.body)).not.toMatch(/costUsd|costIsEstimate/);
    for (const [m, u, b] of [
      ['post', '/api/curriculums', { name: 'x', summary: 'y' }], ['get', '/api/curriculums'], ['post', '/api/assessments', { title: 't' }],
      ['get', '/api/assignments'], ['post', '/api/lesson-plans/generate', {}], ['get', '/api/workspace/users'], ['get', '/api/ai-controls/budgets/instA'],
      ['get', '/api/teaching/overview'], ['get', '/api/grading/queue'], ['get', '/api/course-instances'], ['get', '/api/students'],
    ] as [string, string, object?][]) {
      expect((await (AM as any)[m](u, b)).status).toBe(403);
    }
  });
});

describe('workspace admin: own institution only, no internal costs', () => {
  it('manages users and invitations in its own school only', async () => {
    const users = await WA.get('/api/workspace/users?institutionId=instB');
    expect(users.status).toBe(200);
    // ?institutionId is ignored for a school admin: still its own school.
    const ids = users.body.users.map((u: { id: string }) => u.id);
    expect(ids).toEqual(expect.arrayContaining([T.id, AM.id, WA.id]));
    expect(ids).not.toContain(WB.id);
    expect(ids).not.toContain(TB.id);
    expect((await WA.put(`/api/workspace/users/${TB.id}/permissions`, { permissions: ['content:author'] })).status).toBe(404);
    expect((await WA.put(`/api/workspace/users/${T.id}/permissions`, { permissions: ['cost:internal'] })).status).toBe(400);
    expect((await WA.put(`/api/workspace/users/${T.id}/permissions`, { permissions: ['workspace:users'] })).status).toBe(400);
    expect((await WA.put(`/api/workspace/users/${S.id}/permissions`, { permissions: ['content:author'] })).status).toBe(400);
    const inv = await WA.post('/api/workspace/invitations', { email: 'new.teacher@a.test', role: 'teacher' });
    expect(inv.status).toBe(201);
    expect(inv.body.inviteLink).toMatch(/token=/);
    expect((await WA.post('/api/workspace/invitations', { email: 'boss@a.test', role: 'admin' })).status).toBe(403);
    expect((await WA.post('/api/workspace/invitations', { email: 'e@a.test', role: 'enara-admin' })).status).toBe(400);
    // Another school's admin sees and revokes nothing here.
    expect((await WB.get('/api/workspace/invitations')).body.invitations).toEqual([]);
    expect((await WB.del(`/api/workspace/invitations/${inv.body.invitation.id}`)).status).toBe(404);
    expect((await WA.del(`/api/workspace/invitations/${inv.body.invitation.id}`)).status).toBe(204);
  });

  it('cannot reach internal costs or ENARA controls', async () => {
    await M.AiCall.create({ feature: 'tutor_chat', provider: 'anthropic', modelName: 'claude-opus-5-5', status: 'ok', costUsd: 0.5, institutionId: 'instA' });
    const usage = await WA.get('/api/analytics/ai-usage');
    expect(usage.status).toBe(200);
    expect(usage.body.totals.calls).toBe(1);
    expect(JSON.stringify(usage.body)).not.toMatch(/costUsd/);
    const ops = await WA.get('/api/teaching/ops');
    expect(JSON.stringify(ops.body)).not.toMatch(/costUsd/);
    expect((await WA.get('/api/ai-controls/budgets/instA')).status).toBe(403);
    expect((await WA.put('/api/ai-controls/pause', { paused: true })).status).toBe(403);
    // ENARA admins still see internal cost.
    const internal = await E.get('/api/analytics/ai-usage');
    expect(internal.body.totals.costUsd).toBe(0.5);
  });
});

describe('students and staff tools', () => {
  it('students are denied every staff tool', async () => {
    for (const u of ['/api/curriculums', '/api/workspace/users', '/api/analytics/overview', '/api/assessments', '/api/assignments', '/api/teaching/overview', '/api/ai-controls/budgets/instA']) {
      expect((await S.get(u)).status).toBe(403);
    }
    expect((await S.post('/api/curriculums', { name: 'x', summary: 'y' })).status).toBe(403);
  });

  it('a student account with stored grants still has no staff permissions', async () => {
    await M.User.updateOne({ _id: S.id }, { permissions: ['content:author', 'insights:read_school'] });
    expect((await S.get('/api/curriculums')).status).toBe(403);
    expect((await S.get('/api/analytics/overview')).status).toBe(403);
  });
});

describe('invitations', () => {
  const invite = async (body: object = { email: 'invited@a.test', role: 'teacher' }) => {
    const r = await WA.post('/api/workspace/invitations', body);
    return new URL(r.body.inviteLink, 'http://x').searchParams.get('token')!;
  };
  const accept = (token: string, password = 'a-strong-password') => request(app).post('/api/workspace/invitations/accept').send({ token, password, name: 'Invited' });

  it('creates the account in the inviting school, once', async () => {
    const token = await invite({ email: 'invited@a.test', role: 'teacher', permissions: ['insights:read_school'] });
    expect((await M.Invitation.findOne({}).lean())!.tokenHash).not.toBe(token);
    const res = await accept(token);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'teacher', institutionId: 'instA', email: 'invited@a.test' });
    const user = await M.User.findOne({ email: 'invited@a.test' }).lean();
    expect(user!.permissions).toEqual(['insights:read_school']);
    const login = await request(app).post('/api/auth/login').send({ email: 'invited@a.test', password: 'a-strong-password' });
    expect(login.status).toBe(200);
    expect((await accept(token)).body.error.code).toBe('INVITATION_INVALID');
  });

  it('rejects expired, revoked, unknown and non-grantable invitations', async () => {
    const expired = await invite({ email: 'late@a.test', role: 'teacher' });
    await M.Invitation.updateOne({ email: 'late@a.test' }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await accept(expired)).status).toBe(400);
    const revoked = await invite({ email: 'rev@a.test', role: 'teacher' });
    const id = (await M.Invitation.findOne({ email: 'rev@a.test' }).lean())!.id;
    await WA.del(`/api/workspace/invitations/${id}`);
    expect((await accept(revoked)).status).toBe(400);
    expect((await accept('not-a-real-token')).status).toBe(400);
    expect((await WA.post('/api/workspace/invitations', { email: 'p@a.test', role: 'teacher', permissions: ['cost:internal'] })).status).toBe(400);
    expect((await WA.post('/api/workspace/invitations', { email: T.id ? (await M.User.findById(T.id).lean())!.email : '', role: 'teacher' })).status).toBe(409);
    expect(await M.User.countDocuments({ email: { $in: ['late@a.test', 'rev@a.test'] } })).toBe(0);
  });

  it('two concurrent accepts of one token create one account', async () => {
    const token = await invite({ email: 'race@a.test', role: 'student' });
    const results = await Promise.all([accept(token), accept(token), accept(token)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await M.User.countDocuments({ email: 'race@a.test' })).toBe(1);
    expect(await M.Student.countDocuments({ email: 'race@a.test', institutionId: 'instA' })).toBe(1);
  });

  it('self-registration can be switched to invite-only', async () => {
    const env = await import('../src/config/env');
    process.env.REGISTRATION_INVITE_ONLY = 'true';
    env.resetConfigForTests();
    try {
      const r = await request(app).post('/api/auth/register').send({ email: 'self@x.test', password: 'a-strong-password' });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('INVITE_ONLY');
    } finally {
      delete process.env.REGISTRATION_INVITE_ONLY;
      env.resetConfigForTests();
    }
    expect((await request(app).post('/api/auth/register').send({ email: 'self2@x.test', password: 'a-strong-password' })).status).toBe(201);
  });
});

describe('password reset', () => {
  it('a single-use, expiring token sets a new password; requests never reveal accounts', async () => {
    const email = (await M.User.findById(T.id).lean())!.email;
    expect((await request(app).post('/api/auth/password-reset/request').send({ email: 'nobody@x.test' })).status).toBe(202);
    expect((await request(app).post('/api/auth/password-reset/request').send({ email })).status).toBe(202);
    const token = (await tokens.requestPasswordReset(email, { sendMail: false }))!;
    expect(await M.PasswordReset.countDocuments({ tokenHash: token })).toBe(0); // only the hash is stored
    const confirm = (t: string, password = 'brand-new-password') => request(app).post('/api/auth/password-reset/confirm').send({ token: t, password });
    expect((await confirm(token)).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'brand-new-password' })).status).toBe(200);
    expect((await confirm(token, 'another-password-1')).body.error.code).toBe('RESET_TOKEN_INVALID');
    // The earlier request's token was invalidated by the successful reset.
    expect(await M.PasswordReset.countDocuments({ usedAt: null })).toBe(0);
    const old = (await tokens.requestPasswordReset(email, { sendMail: false }))!;
    await M.PasswordReset.updateOne({ tokenHash: tokens.hashToken(old) }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await confirm(old)).status).toBe(400);
  });
});

describe('demo/live separation on dashboards', () => {
  it('school analytics exclude demo_seed students by default and show them on request', async () => {
    await M.Student.create({ id: 'demo1', name: 'Demo Kid', email: 'd@x.test', grade: '8', institutionId: 'instA', origin: 'demo_seed' });
    const live = await WA.get('/api/analytics/overview');
    expect(live.body.origin).toBe('live');
    expect(JSON.stringify(live.body)).not.toContain('Demo Kid');
    expect(JSON.stringify(live.body)).toContain('Stu');
    const demo = await WA.get('/api/analytics/overview?origin=demo_seed');
    expect(JSON.stringify(demo.body)).toContain('Demo Kid');
    expect(JSON.stringify(demo.body)).not.toContain('"Stu"');
  });
});
