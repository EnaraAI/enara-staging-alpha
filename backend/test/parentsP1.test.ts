import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Parents P1 (docs/parents/P1_NOTES.md):
//   PARENT_SETTINGS_ENABLED     per-school parent access (Off / Free), usage events, rollup, Parents cards,
//                               "Provided by <school>" instead of the mock plan.
//   PARENT_CODE_SIGNUP_ENABLED  code-first entry (no account), remembered device session, add another child.
// Email is mocked: no Resend calls (P1 sends no email).

const mail = vi.hoisted(() => ({ send: vi.fn(async () => ({ ok: true as const, id: 'mock-email-id' })) }));
vi.mock('../src/email/sendTemplate', async (orig) => ({ ...(await orig<object>()), sendTemplate: mail.send }));

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tok: Record<string, string> = {};
const PW = 'parents-p1-test-password';
const ON = () => Object.assign(process.env, { PARENT_SETTINGS_ENABLED: 'true', PARENT_CODE_SIGNUP_ENABLED: 'true' });
const OFF = () => { delete process.env.PARENT_SETTINGS_ENABLED; delete process.env.PARENT_CODE_SIGNUP_ENABLED; };

const as = (who: string) => ({
  get: (p: string) => request(app).get(p).set('Authorization', tok[who] ?? ''),
  post: (p: string, b: object = {}) => request(app).post(p).set('Authorization', tok[who] ?? '').send(b),
  put: (p: string, b: object = {}) => request(app).put(p).set('Authorization', tok[who] ?? '').send(b),
});
const pub = { post: (p: string, b: object = {}) => request(app).post(p).send(b) };

async function issue(admin: string, studentId: string): Promise<string> {
  const r = await as(admin).post(`/api/students/${studentId}/parent-codes`);
  expect(r.status).toBe(201);
  return r.body.code;
}
/** Every audit/usage row holds IDs only: no code, no email, no name. */
function idsOnly(row: unknown) {
  const s = JSON.stringify(row);
  expect(s).not.toMatch(/ENR-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  expect(s).not.toMatch(/@/);
  expect(s).not.toMatch(/Omar|Laila|Bassem/);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED', 'GOOGLE_CLIENT_ID']) delete process.env[k];
  OFF();
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Student', 'ParentLinkCode', 'ParentLearnerLink', 'ParentProfile', 'AuditEvent', 'ParentDeviceSession']) M[name] = (await import(`../src/models/${name}`))[name];
  const usage = await import('../src/models/ParentUsage');
  M.ParentUsageEvent = usage.ParentUsageEvent;
  M.ParentUsageDaily = usage.ParentUsageDaily;
  const hash = bcrypt.hashSync(PW, 4);
  for (const inst of ['p1-A', 'p1-B']) {
    await M.Institution.create({ id: inst, name: `School ${inst}`, features: {} });
    await M.User.create({ email: `admin@${inst}.test`, password: hash, role: 'admin', name: `admin ${inst}`, status: 'active', institutionId: inst });
  }
  await M.User.create({ email: 'ea@enara.test', password: hash, role: 'enara-admin', name: 'ENARA admin', status: 'active' });
  await M.Student.create({ id: 'a1', name: 'Omar Hassan', email: 'a1@p1-A.test', institutionId: 'p1-A', learnerAgeBand: 'child' });
  await M.Student.create({ id: 'a2', name: 'Laila Mostafa', email: 'a2@p1-A.test', institutionId: 'p1-A', learnerAgeBand: 'child' });
  await M.Student.create({ id: 'b1', name: 'Bassem Nabil', email: 'b1@p1-B.test', institutionId: 'p1-B', learnerAgeBand: 'teen' });
  await M.Student.create({ id: 'b2', name: 'Nour Adel', email: 'b2@p1-B.test', institutionId: 'p1-B', learnerAgeBand: 'teen' });
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  tok.adminA = await login('admin@p1-A.test');
  tok.adminB = await login('admin@p1-B.test');
  tok.ea = await login('ea@enara.test');
  const r = await request(app).post('/api/parents/register').send({ email: 'pw@parents.test', password: PW, name: 'Password Parent' });
  tok.pw = `Bearer ${r.body.token}`;
}, 120_000);

afterAll(async () => {
  OFF();
  await mongoose.disconnect();
  await mongo.stop();
});

describe('switches off: the site behaves as before', () => {
  it('code-first and admin routes are 404; the account keeps the mock plan; no usage is written', async () => {
    OFF();
    const code = await issue('adminA', 'a1');
    expect((await pub.post('/api/parents/start/preview', { code })).status).toBe(404);
    expect((await pub.post('/api/parents/start', { code })).status).toBe(404);
    expect((await pub.post('/api/parents/device/session', { deviceToken: 'pds_x' })).status).toBe(404);
    expect((await as('ea').get('/api/parents-admin/status')).status).toBe(404);
    expect((await request(app).get('/api/parents/auth-config')).body.codeSignup).toBeUndefined();
    // An existing (password) parent links and reads as before.
    expect((await as('pw').post('/api/parents/link/confirm', { code })).status).toBe(201);
    expect((await as('pw').get('/api/parents/learners/a1/home')).status).toBe(200);
    const acc = await as('pw').get('/api/parents/account');
    expect(acc.body.plan.mock).toBe(true);
    expect(await M.ParentUsageEvent.countDocuments({})).toBe(0);
    // A school marked Off has no effect while the switch is off.
    await M.Institution.updateOne({ id: 'p1-A' }, { $set: { parentPortal: { access: 'off' } } });
    expect((await as('pw').get('/api/parents/learners/a1/home')).status).toBe(200);
    await M.Institution.updateOne({ id: 'p1-A' }, { $unset: { parentPortal: 1 } });
  });
});

describe('code-first entry, remembered device, add another child (PARENT_CODE_SIGNUP_ENABLED)', () => {
  let codeA = '';
  it('preview: the child (first name + initial) and school only; a wrong code says only "not valid"', async () => {
    ON();
    expect((await request(app).get('/api/parents/auth-config')).body.codeSignup).toBe(true);
    codeA = await issue('adminA', 'a2');
    const bad = await pub.post('/api/parents/start/preview', { code: 'ENR-AAAA-AAAA' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_CODE');
    const ok = await pub.post('/api/parents/start/preview', { code: codeA.toLowerCase() });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ learner: 'Laila M.', school: 'School p1-A' });
  });

  it('start: a code-only parent account, linked, signed in, and a device token; the code is used up', async () => {
    const r = await pub.post('/api/parents/start', { code: codeA, language: 'ar' });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('parent');
    expect(r.body.deviceToken).toMatch(/^pds_/);
    expect(r.body.link).toMatchObject({ studentId: 'a2', status: 'active', role: 'owner' });
    tok.code = `Bearer ${r.body.token}`;
    tok.device = r.body.deviceToken;
    const u = await M.User.findOne({ email: r.body.user.email }).lean();
    expect(u.email).toMatch(/@code\.parents\.enara\.invalid$/); // reserved: never emailed, never a sign-in name
    expect(u.institutionId).toBeUndefined();
    expect(await M.ParentProfile.findOne({ userId: String(u._id) }).lean()).toMatchObject({ language: 'ar', signIn: 'code' });
    expect((await as('code').get('/api/parents/learners')).body.learners.map((l: { studentId: string }) => l.studentId)).toEqual(['a2']);
    // Single use.
    const again = await pub.post('/api/parents/start', { code: codeA });
    expect(again.status).toBe(400);
    expect(await M.User.countDocuments({ email: /code\.parents\.enara\.invalid$/ })).toBe(1); // no empty account left behind
    // The device token is stored hashed only; audits hold IDs only.
    const row = await M.ParentDeviceSession.findOne({ userId: String(u._id) }).select('+tokenHash').lean();
    expect(row.tokenHash).not.toContain(tok.device);
    for (const a of await M.AuditEvent.find({ action: { $in: ['parent_registered', 'parent_device_session_created', 'parent_code_redeemed'] }, actorId: String(u._id) }).lean()) idsOnly(a.detail);
    expect(await M.AuditEvent.exists({ action: 'parent_registered', actorId: String(u._id), 'detail.method': 'code' })).toBeTruthy();
  });

  it('the remembered device gets a fresh session; a wrong token, sign-out everywhere or device sign-out end it', async () => {
    const r = await pub.post('/api/parents/device/session', { deviceToken: tok.device });
    expect(r.status).toBe(200);
    expect((await request(app).get('/api/parents/learners').set('Authorization', `Bearer ${r.body.token}`)).status).toBe(200);
    expect((await pub.post('/api/parents/device/session', { deviceToken: 'pds_nope' })).status).toBe(401);
    expect((await pub.post('/api/parents/device/session', { deviceToken: 42 })).status).toBe(401);

    // A second device session for the same account, then sign out everywhere (logout): both stop working.
    const { createDeviceSession } = await import('../src/parents/deviceSession');
    const u = await M.User.findOne({ email: /code\.parents\.enara\.invalid$/ });
    const other = await createDeviceSession(u);
    expect((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${r.body.token}`)).status).toBe(204);
    expect((await pub.post('/api/parents/device/session', { deviceToken: tok.device })).status).toBe(401);
    expect((await pub.post('/api/parents/device/session', { deviceToken: other.deviceToken })).status).toBe(401);

    // A new device session after that works until this device signs out.
    const fresh = await createDeviceSession(await M.User.findById(u._id));
    const s = await pub.post('/api/parents/device/session', { deviceToken: fresh.deviceToken });
    expect(s.status).toBe(200);
    tok.code = `Bearer ${s.body.token}`;
    tok.device = fresh.deviceToken;
    const out = await as('code').post('/api/parents/device/sign-out', { deviceToken: 'pds_other' });
    expect(out.body.revoked).toBe(false);
    const keep = await createDeviceSession(await M.User.findById(u._id));
    expect((await as('code').post('/api/parents/device/sign-out', { deviceToken: keep.deviceToken })).body.revoked).toBe(true);
    expect((await pub.post('/api/parents/device/session', { deviceToken: keep.deviceToken })).status).toBe(401);
    expect((await pub.post('/api/parents/device/session', { deviceToken: tok.device })).status).toBe(200);
  });

  it('add another child: a second code (another school) links to the same account', async () => {
    const codeB = await issue('adminB', 'b1');
    const r = await as('code').post('/api/parents/link/confirm', { code: codeB });
    expect(r.status).toBe(201);
    const list = await as('code').get('/api/parents/learners');
    expect(list.body.learners.map((l: { studentId: string }) => l.studentId).sort()).toEqual(['a2', 'b1']);
    expect(await M.User.countDocuments({ email: /code\.parents\.enara\.invalid$/ })).toBe(1);
  });

  it('account: "Provided by" each school, no mock plan or price; sign-in method code, no email', async () => {
    const acc = await as('code').get('/api/parents/account');
    expect(acc.body.plan).toEqual({ mock: false, kind: 'school', providedBy: ['School p1-A', 'School p1-B'] });
    expect(JSON.stringify(acc.body)).not.toMatch(/PRICE|price/);
    expect(acc.body.signIn).toEqual({ method: 'code', hasEmail: false });
    const pw = await as('pw').get('/api/parents/account');
    expect(pw.body.signIn).toEqual({ method: 'password', hasEmail: true });
  });
});

describe('school parent access Off / Free (PARENT_SETTINGS_ENABLED)', () => {
  it('only an ENARA admin changes it; the value is checked; the change is audited', async () => {
    ON();
    expect((await as('adminB').put('/api/parents-admin/schools/p1-B/access', { access: 'off' })).status).toBe(403);
    expect((await as('ea').put('/api/parents-admin/schools/p1-B/access', { access: 'paid' })).status).toBe(400);
    expect((await as('ea').put('/api/parents-admin/schools/nope/access', { access: 'off' })).status).toBe(404);
    const r = await as('ea').put('/api/parents-admin/schools/p1-B/access', { access: 'off' });
    expect(r.body).toEqual({ institutionId: 'p1-B', access: 'off' });
    const a = await M.AuditEvent.findOne({ action: 'parent_access_changed', targetId: 'p1-B' }).lean();
    expect(a).toMatchObject({ institutionId: 'p1-B', detail: { from: 'free', to: 'off' } });
  });

  it("Off hides that school's children only; the link is kept, not ended; codes for it are refused", async () => {
    const list = await as('code').get('/api/parents/learners');
    expect(list.body.learners.map((l: { studentId: string }) => l.studentId)).toEqual(['a2']);
    expect(list.body.hiddenBySchool).toBe(1);
    const denied = await as('code').get('/api/parents/learners/b1/home');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PARENT_SCHOOL_ACCESS_OFF');
    expect((await as('code').get('/api/parents/learners/a2/home')).status).toBe(200);
    expect(await M.ParentLearnerLink.findOne({ studentId: 'b1' }).lean()).toMatchObject({ status: 'active' });
    const codeB2 = await issue('adminB', 'b2');
    expect((await pub.post('/api/parents/start/preview', { code: codeB2 })).body.error.code).toBe('PARENT_SCHOOL_ACCESS_OFF');
    expect((await pub.post('/api/parents/start', { code: codeB2 })).status).toBe(403);
    expect((await as('pw').post('/api/parents/link/confirm', { code: codeB2 })).status).toBe(403);
    // Not counted as a wrong code (no lockout).
    expect((await M.ParentProfile.findOne({ userId: String((await M.User.findOne({ email: 'pw@parents.test' }))._id) }).lean())?.failedRedeems ?? 0).toBe(0);
    // Free again: the child is back, same link.
    await as('ea').put('/api/parents-admin/schools/p1-B/access', { access: 'free' });
    expect((await as('code').get('/api/parents/learners/b1/home')).status).toBe(200);
  });
});

describe('usage events, rollup and the Parents cards', () => {
  it('events: right school, IDs and dates only, one row per parent/school/day/name with a count', async () => {
    ON();
    await as('code').get('/api/parents/learners/a2/progress');
    await as('code').get('/api/parents/learners/a2/progress');
    await as('code').put('/api/parents/learners/a2/controls', { weeklyGoalMin: 60 });
    const rows = await M.ParentUsageEvent.find({}).lean();
    expect(rows.length).toBeGreaterThan(0);
    const progress = rows.find((r) => r.name === 'progress' && r.studentId === 'a2');
    expect(progress).toMatchObject({ institutionId: 'p1-A', kind: 'screen', count: 2 });
    expect(rows.find((r) => r.name === 'controls_changed')).toMatchObject({ kind: 'feature', institutionId: 'p1-A' });
    expect(rows.some((r) => r.kind === 'login' && r.institutionId === 'p1-A')).toBe(true); // the device resume
    expect(rows.find((r) => r.studentId === 'b1')?.institutionId ?? 'p1-B').toBe('p1-B');
    for (const r of rows) {
      const { _id, ...rest } = r;
      void _id;
      expect(Object.keys(rest).sort()).toEqual(expect.arrayContaining(['at', 'count', 'day', 'institutionId', 'key', 'kind', 'lastAt', 'name', 'parentUserId']));
      idsOnly(rest);
    }
  });

  it('a password sign-in by a parent is a login event (through the sign-in log)', async () => {
    const before = await M.ParentUsageEvent.countDocuments({ kind: 'login' });
    expect((await request(app).post('/api/auth/login').send({ email: 'pw@parents.test', password: PW })).status).toBe(200);
    expect(await M.ParentUsageEvent.countDocuments({ kind: 'login' })).toBeGreaterThan(before);
  });

  it('the rollup counts distinct parents per school and day, and is idempotent', async () => {
    const { rollupDay } = await import('../src/parents/usage');
    const { cairoDay } = await import('../src/parents/time');
    const day = cairoDay(new Date());
    await as('pw').get('/api/parents/learners/a1/home');
    await rollupDay(day);
    await rollupDay(day);
    const a = await M.ParentUsageDaily.find({ institutionId: 'p1-A', day }).lean();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ activeParents: 2, linkedParents: 2 });
    expect(a[0].screens.progress).toBe(2);
    expect(a[0].features.controls_changed).toBe(1);
  });

  it('the 13-month expiry indexes exist', async () => {
    for (const m of [M.ParentUsageEvent, M.ParentUsageDaily, M.ParentDeviceSession]) await m.createIndexes();
    const ttl = (await M.ParentUsageEvent.collection.indexes()).find((i: { key: Record<string, number> }) => i.key.at === 1);
    expect(ttl?.expireAfterSeconds).toBe(396 * 86400);
    expect((await M.ParentUsageDaily.collection.indexes()).find((i: { key: Record<string, number> }) => i.key.at === 1)?.expireAfterSeconds).toBe(396 * 86400);
    expect((await M.ParentDeviceSession.collection.indexes()).find((i: { key: Record<string, number> }) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
  });

  it('cards: a school admin sees own school only (read-only); the ENARA admin sees every school and may change access', async () => {
    const mine = await as('adminA').get('/api/parents-admin/schools');
    expect(mine.status).toBe(200);
    expect(mine.body.canChangeAccess).toBe(false);
    expect(mine.body.schools.map((s: { id: string }) => s.id)).toEqual(['p1-A']);
    expect(mine.body.schools[0]).toMatchObject({ access: 'free', usage: { linkedParents: 2, active7: 2, active30: 2 } });
    expect(mine.body.schools[0].usage.topScreens).toContainEqual({ screen: 'progress', views: 2 });
    idsOnly(mine.body.schools[0].usage);
    const all = await as('ea').get('/api/parents-admin/schools');
    expect(all.body.canChangeAccess).toBe(true);
    expect(all.body.schools.map((s: { id: string }) => s.id)).toEqual(['p1-A', 'p1-B']);
    expect((await as('pw').get('/api/parents-admin/schools')).status).toBe(403);
  });

  it('PDPL: erasing a student deletes their usage events', async () => {
    const { permanentlyDeleteStudent } = await import('../src/services/studentErasure');
    expect(await M.ParentUsageEvent.countDocuments({ studentId: 'a2' })).toBeGreaterThan(0);
    const s = (await M.Student.findOne({ id: 'a2' }).lean())!;
    const result = await permanentlyDeleteStudent(s, { id: 'admin', role: 'admin', institutionId: 'p1-A' } as never);
    expect(result.removed.parent_usage_events).toBeGreaterThan(0);
    expect(await M.ParentUsageEvent.countDocuments({ studentId: 'a2' })).toBe(0);
    const { deleteParentUsage } = await import('../src/parents/usage');
    const u = await M.User.findOne({ email: /code\.parents\.enara\.invalid$/ }).lean();
    await deleteParentUsage(String(u._id));
    expect(await M.ParentUsageEvent.countDocuments({ parentUserId: String(u._id) })).toBe(0);
  });
});
