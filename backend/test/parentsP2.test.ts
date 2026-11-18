import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Parents P2 (docs/parents/P2_NOTES.md):
//   PARENT_EMAIL_SIGNIN_ENABLED  "Add your email" (6-digit code), passwordless email sign-in,
//                                merge of two parent accounts on a verified email.
//   PARENT_CODE_TOOLS_ENABLED    class code sheets, teachers issuing codes, per-school code expiry.
// The code emails are mocked at sendCodeTemplate: nothing is sent; the mock keeps the code.

const mail = vi.hoisted(() => ({ calls: [] as { alias: string; to: string; vars: Record<string, string> }[] }));
vi.mock('../src/email/sendBundledTemplate', async (orig) => ({
  ...(await orig<object>()),
  sendCodeTemplate: vi.fn(async (_kind: string, _bundle: unknown, alias: string, to: string, vars: Record<string, string>) => {
    mail.calls.push({ alias, to, vars });
    return { ok: true, id: 'mock' };
  }),
}));

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tok: Record<string, string> = {};
const PW = 'parents-p2-test-password';
const FLAGS = ['PARENT_SETTINGS_ENABLED', 'PARENT_CODE_SIGNUP_ENABLED', 'PARENT_CODE_TOOLS_ENABLED', 'PARENT_EMAIL_SIGNIN_ENABLED'];
const ON = () => { for (const f of FLAGS) process.env[f] = 'true'; };
const OFF = () => { for (const f of FLAGS) delete process.env[f]; };
const EMAIL = 'sara.parent@family-mail.app';

const as = (who: string) => ({
  get: (p: string) => request(app).get(p).set('Authorization', tok[who] ?? ''),
  post: (p: string, b: object = {}) => request(app).post(p).set('Authorization', tok[who] ?? '').send(b),
  put: (p: string, b: object = {}) => request(app).put(p).set('Authorization', tok[who] ?? '').send(b),
  del: (p: string) => request(app).delete(p).set('Authorization', tok[who] ?? ''),
});
const pub = { post: (p: string, b: object = {}) => request(app).post(p).send(b) };
const lastCode = (to: string, alias: RegExp) => [...mail.calls].reverse().find((c) => c.to === to && alias.test(c.alias))!.vars.CODE;
/** Audit and log rows: IDs only (no address, no 6-digit or link code). */
function idsOnly(row: unknown) {
  const s = JSON.stringify(row);
  expect(s).not.toMatch(/@/);
  expect(s).not.toMatch(/ENR-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  expect(s).not.toMatch(/\b\d{3} ?\d{3}\b/);
}
async function issue(admin: string, studentId: string): Promise<string> {
  const r = await as(admin).post(`/api/students/${studentId}/parent-codes`);
  expect(r.status).toBe(201);
  return r.body.code;
}
/** A code-first parent (P1) linked to one child; returns its token key. */
async function codeParent(key: string, admin: string, studentId: string) {
  const r = await pub.post('/api/parents/start', { code: await issue(admin, studentId) });
  expect(r.status).toBe(201);
  tok[key] = `Bearer ${r.body.token}`;
  tok[`${key}.device`] = r.body.deviceToken;
  return r.body;
}
const ago = async (ms: number) => M.ParentEmailCode.updateMany({}, { $set: { createdAt: new Date(Date.now() - ms) } });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED', 'GOOGLE_CLIENT_ID', 'ENARA_STAGING']) delete process.env[k];
  OFF();
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Student', 'CourseInstance', 'ParentLinkCode', 'ParentLearnerLink', 'ParentProfile', 'AuditEvent', 'ParentDeviceSession', 'ParentEmailCode']) M[name] = (await import(`../src/models/${name}`))[name];
  M.ParentUsageEvent = (await import('../src/models/ParentUsage')).ParentUsageEvent;
  const hash = bcrypt.hashSync(PW, 4);
  for (const inst of ['p2-A', 'p2-B']) {
    await M.Institution.create({ id: inst, name: `School ${inst}` });
    await M.User.create({ email: `admin@${inst}.test`, password: hash, role: 'admin', name: `admin ${inst}`, status: 'active', institutionId: inst });
  }
  const t1 = await M.User.create({ email: 'teacher1@p2-A.test', password: hash, role: 'teacher', name: 'Teacher One', status: 'active', institutionId: 'p2-A' });
  await M.User.create({ email: 'teacher2@p2-A.test', password: hash, role: 'teacher', name: 'Teacher Two', status: 'active', institutionId: 'p2-A' });
  await M.User.create({ email: 'staff@p2-A.test', password: hash, role: 'teacher', name: 'Staff', status: 'active', institutionId: 'p2-A' });
  await M.User.create({ email: 'ea@enara.test', password: hash, role: 'enara-admin', name: 'ENARA admin', status: 'active' });
  for (const [id, name, inst] of [['a1', 'Omar Hassan', 'p2-A'], ['a2', 'Laila Mostafa', 'p2-A'], ['a3', 'Nour Adel', 'p2-A'], ['a4', 'Archived Kid', 'p2-A'], ['b1', 'Bassem Nabil', 'p2-B']]) {
    await M.Student.create({ id, name, email: `${id}@${inst}.test`, institutionId: inst, learnerAgeBand: 'child', ...(id === 'a4' ? { archivedAt: new Date() } : {}) });
  }
  await M.CourseInstance.create({ id: 'cls-7a', courseId: 'ENG', courseName: 'English 7A', institutionId: 'p2-A', academicYear: '2026', batchId: 'g-none', studentIds: ['a1', 'a2', 'a3', 'a4'], instructorIds: [String(t1._id)] });
  await M.CourseInstance.create({ id: 'cls-b', courseId: 'ENG', courseName: 'English 9', institutionId: 'p2-B', academicYear: '2026', batchId: 'g-none-b', studentIds: ['b1'], instructorIds: [] });
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  tok.adminA = await login('admin@p2-A.test');
  tok.adminB = await login('admin@p2-B.test');
  tok.t1 = await login('teacher1@p2-A.test');
  tok.t2 = await login('teacher2@p2-A.test');
  tok.ea = await login('ea@enara.test');
}, 120_000);

afterAll(async () => {
  OFF();
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(() => { ON(); });

describe('switches off', () => {
  it('email and code-tool routes are 404; auth-config says nothing; codes last 7 days', async () => {
    OFF();
    process.env.PARENT_CODE_SIGNUP_ENABLED = 'true';
    expect((await pub.post('/api/parents/email/sign-in/start', { email: EMAIL })).status).toBe(404);
    expect((await request(app).get('/api/parents/auth-config')).body.emailSignin).toBeUndefined();
    expect((await as('adminA').get('/api/parents-admin/classes')).status).toBe(404);
    const r = await as('adminA').post('/api/students/a1/parent-codes');
    expect(Math.round((new Date(r.body.expiresAt).getTime() - Date.now()) / 86_400_000)).toBe(7);
  });
});

describe('"Add your email" with a 6-digit code (PARENT_EMAIL_SIGNIN_ENABLED)', () => {
  it('sends a code (no link), checks it (5 tries), replaces it on a new request, and limits requests', async () => {
    await codeParent('p1', 'adminA', 'a1');
    expect((await request(app).get('/api/parents/auth-config')).body.emailSignin).toBe(true);
    const acc = await as('p1').get('/api/parents/account');
    expect(acc.body.signIn).toMatchObject({ method: 'code', hasEmail: false, emailSignin: true });
    expect((await as('p1').post('/api/parents/email/start', { email: 'x@example.com' })).body.error.code).toBe('EMAIL_NOT_USABLE');
    expect((await as('p1').post('/api/parents/email/start', { email: 'staff@p2-A.test'.replace('.test', '.app') })).status).toBe(200); // not an account yet: fine
    await ago(120_000);
    const staff = await M.User.create({ email: 'teacher.real@school-mail.app', password: 'x', role: 'teacher', name: 'T', institutionId: 'p2-A' });
    expect((await as('p1').post('/api/parents/email/start', { email: staff.email })).body.error.code).toBe('EMAIL_NOT_FOR_PARENT');

    const r = await as('p1').post('/api/parents/email/start', { email: EMAIL.toUpperCase() });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ sent: true, expiresInSec: 600 });
    const call = mail.calls[mail.calls.length - 1];
    expect(call).toMatchObject({ alias: 'parent-email-verify-en', to: EMAIL });
    expect(call.vars.CODE).toMatch(/^\d{3} \d{3}$/);
    expect(call.vars.EXPIRES_IN).toBe('10 minutes');
    // Too soon for another one.
    expect((await as('p1').post('/api/parents/email/start', { email: EMAIL })).body.error.code).toBe('EMAIL_CODE_TOO_SOON');
    // Wrong codes: 5 tries, then the code is dead even with the right digits.
    const right = call.vars.CODE;
    const wrong = right === '000 000' ? '111 111' : '000 000';
    for (let i = 0; i < 5; i++) expect((await as('p1').post('/api/parents/email/verify', { email: EMAIL, code: wrong })).status).toBe(400);
    expect((await as('p1').post('/api/parents/email/verify', { email: EMAIL, code: right })).status).toBeGreaterThanOrEqual(400);
    // A new request (after the minute) gives a new code; the old one no longer works.
    await ago(120_000);
    await as('p1').post('/api/parents/email/start', { email: EMAIL });
    const fresh = lastCode(EMAIL, /parent-email-verify/);
    const ok = await as('p1').post('/api/parents/email/verify', { email: EMAIL, code: fresh.replace(' ', '') });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ verified: true, email: EMAIL });
    // Used once only.
    expect((await as('p1').post('/api/parents/email/verify', { email: EMAIL, code: fresh })).status).toBe(400);
    const u = await M.User.findOne({ email: EMAIL }).lean();
    expect(u.role).toBe('parent');
    expect((await M.ParentProfile.findOne({ userId: String(u._id) }).lean()).emailVerifiedAt).toBeTruthy();
    expect((await as('p1').get('/api/parents/account')).body.signIn).toMatchObject({ hasEmail: true, email: EMAIL, emailVerified: true });
    // Stored as hashes only; audits hold IDs only.
    const rows = await M.ParentEmailCode.find({}).select('+codeHash').lean();
    for (const row of rows) { expect(JSON.stringify(row)).not.toContain(EMAIL); expect(JSON.stringify(row)).not.toContain(fresh.replace(' ', '')); }
    for (const a of await M.AuditEvent.find({ action: /parent_email/ }).lean()) idsOnly(a);
  });

  it('an hour holds at most 5 codes per address', async () => {
    const addr = 'busy.parent@family-mail.app';
    await codeParent('busy', 'adminA', 'a2');
    for (let i = 0; i < 5; i++) {
      await M.ParentEmailCode.updateMany({}, { $set: { createdAt: new Date(Date.now() - 61_000 * (6 - i)) } });
      expect((await as('busy').post('/api/parents/email/start', { email: addr })).status).toBe(200);
      await M.ParentEmailCode.updateMany({ emailHash: (await import('../src/parents/emailSignin')).hashEmail(addr) }, { $set: { createdAt: new Date(Date.now() - 61_000 * (6 - i)) } });
    }
    expect((await as('busy').post('/api/parents/email/start', { email: addr })).body.error.code).toBe('EMAIL_CODE_RATE_LIMITED');
  });
});

describe('passwordless sign-in on a second device', () => {
  it('the answer never says whether an account exists; the code signs in and remembers the device', async () => {
    const n = mail.calls.length;
    const unknown = await pub.post('/api/parents/email/sign-in/start', { email: 'nobody@family-mail.app' });
    expect(unknown.body).toEqual({ sent: true, expiresInSec: 600 });
    expect(mail.calls.length).toBe(n); // nothing sent for an unknown address
    expect((await pub.post('/api/parents/email/sign-in/verify', { email: 'nobody@family-mail.app', code: '123456' })).status).toBe(400);

    const r = await pub.post('/api/parents/email/sign-in/start', { email: EMAIL });
    expect(r.body).toEqual(unknown.body);
    const code = lastCode(EMAIL, /parent-sign-in-code-en/);
    expect((await pub.post('/api/parents/email/sign-in/verify', { email: EMAIL, code: '999 999' === code ? '888 888' : '999 999' })).status).toBe(400);
    const ok = await pub.post('/api/parents/email/sign-in/verify', { email: EMAIL, code });
    expect(ok.status).toBe(200);
    expect(ok.body.deviceToken).toMatch(/^pds_/);
    tok.p1b = `Bearer ${ok.body.token}`;
    const list = await as('p1b').get('/api/parents/learners');
    expect(list.body.learners.map((l: { studentId: string }) => l.studentId)).toEqual(['a1']);
    expect((await pub.post('/api/parents/device/session', { deviceToken: ok.body.deviceToken })).status).toBe(200);
    expect(await M.AuditEvent.exists({ action: 'parent_signed_in', 'detail.method': 'email_code' })).toBeTruthy();
  });
});

describe('merge on a verified email', () => {
  it('a second account verifying the same email is offered a merge; only the verified ticket merges; links, consent and history move', async () => {
    const second = await codeParent('p2', 'adminB', 'b1');
    const secondId = (await M.User.findOne({ email: second.user.email }).lean())._id.toString();
    await M.ParentUsageEvent.create({ key: `x|${secondId}`, parentUserId: secondId, institutionId: 'p2-B', kind: 'screen', name: 'home', day: '2026-11-18', count: 1, at: new Date(), lastAt: new Date() });
    // No merge without the code.
    expect((await as('p2').post('/api/parents/email/merge', { ticket: 'pec_x.y' })).status).toBe(400);
    await M.ParentEmailCode.updateMany({}, { $set: { createdAt: new Date(Date.now() - 3_700_000) } });
    await as('p2').post('/api/parents/email/start', { email: EMAIL });
    const v = await as('p2').post('/api/parents/email/verify', { email: EMAIL, code: lastCode(EMAIL, /parent-email-verify/) });
    expect(v.status).toBe(200);
    expect(v.body.merge).toMatchObject({ otherChildren: ['Omar'], yourChildren: ['Bassem'] });
    // Another account cannot use this ticket.
    expect((await as('busy').post('/api/parents/email/merge', { ticket: v.body.merge.ticket })).status).toBe(400);
    const m = await as('p2').post('/api/parents/email/merge', { ticket: v.body.merge.ticket });
    expect(m.status).toBe(200);
    expect(m.body).toMatchObject({ linksMoved: 1, linksDropped: 0 });
    tok.merged = `Bearer ${m.body.token}`;
    const list = await as('merged').get('/api/parents/learners');
    expect(list.body.learners.map((l: { studentId: string }) => l.studentId).sort()).toEqual(['a1', 'b1']);
    // The merged-away account and its devices stop working; its history moved.
    expect((await as('p2').get('/api/parents/learners')).status).toBe(401);
    expect((await pub.post('/api/parents/device/session', { deviceToken: tok['p2.device'] })).status).toBe(401);
    const survivor = (await M.User.findOne({ email: EMAIL }).lean())._id.toString();
    expect(await M.ParentUsageEvent.countDocuments({ parentUserId: secondId })).toBe(0);
    expect(await M.ParentUsageEvent.countDocuments({ parentUserId: survivor, institutionId: 'p2-B' })).toBeGreaterThan(0);
    expect(await M.ParentLinkCode.exists({ redeemedBy: secondId })).toBeNull();
    expect((await M.ParentProfile.findOne({ userId: secondId }).lean()).mergedInto).toBe(survivor);
    const a = await M.AuditEvent.findOne({ action: 'parent_accounts_merged' }).lean();
    expect(a).toMatchObject({ actorId: secondId, targetId: survivor, detail: { fromUserId: secondId, intoUserId: survivor } });
    idsOnly(a);
    // The ticket is single use.
    expect((await as('merged').post('/api/parents/email/merge', { ticket: v.body.merge.ticket })).status).toBe(400);
  });

  it('when both accounts were linked to the same child, the active link is kept', async () => {
    const { mergeParentAccounts } = await import('../src/parents/emailSignin');
    const u1 = await M.User.create({ email: 'm1@family-mail.app', password: 'x', role: 'parent', name: 'M1' });
    const u2 = await M.User.create({ email: 'm2@family-mail.app', password: 'x', role: 'parent', name: 'M2' });
    await M.ParentLearnerLink.create({ id: 'l-ended', parentUserId: String(u1._id), studentId: 'a3', institutionId: 'p2-A', role: 'owner', status: 'ended', endReason: 'unlinked_by_parent' });
    await M.ParentLearnerLink.create({ id: 'l-active', parentUserId: String(u2._id), studentId: 'a3', institutionId: 'p2-A', role: 'full', status: 'active', consent: 'pending' });
    const r = await mergeParentAccounts(String(u2._id), String(u1._id));
    expect(r).toEqual({ linksMoved: 1, linksDropped: 1 });
    expect(await M.ParentLearnerLink.findOne({ studentId: 'a3', parentUserId: String(u1._id) }).lean()).toMatchObject({ id: 'l-active', status: 'active', consent: 'pending' });
  });
});

describe('class code sheets (PARENT_CODE_TOOLS_ENABLED)', () => {
  let sheet: { rows: { studentId: string; code: string }[]; expiresAt: string };
  it('school settings: code expiry 1-60 days and "teachers may issue codes", school admin only, audited', async () => {
    expect((await as('adminA').put('/api/parents-admin/schools/p2-A/settings', { codeTtlDays: 0 })).status).toBe(400);
    expect((await as('adminA').put('/api/parents-admin/schools/p2-A/settings', { codeTtlDays: 61 })).status).toBe(400);
    expect((await as('adminB').put('/api/parents-admin/schools/p2-A/settings', { codeTtlDays: 10 })).status).toBe(403);
    expect((await as('t1').put('/api/parents-admin/schools/p2-A/settings', { teachersMayIssueCodes: true })).status).toBe(403);
    const r = await as('adminA').put('/api/parents-admin/schools/p2-A/settings', { codeTtlDays: 14 });
    expect(r.body).toEqual({ institutionId: 'p2-A', codeTtlDays: 14, teachersMayIssueCodes: false, showResults: 'after_release' });
    expect(await M.AuditEvent.exists({ action: 'parent_settings_changed', targetId: 'p2-A' })).toBeTruthy();
    const c = await as('adminA').post('/api/students/a2/parent-codes');
    expect(Math.round((new Date(c.body.expiresAt).getTime() - Date.now()) / 86_400_000)).toBe(14);
  });

  it('print: one code per active student (archived skipped), shown once, one audit row with no codes', async () => {
    const list = await as('adminA').get('/api/parents-admin/classes');
    expect(list.body.classes).toEqual([{ id: 'cls-7a', name: 'English 7A', students: 3, activeCodes: 0 }]);
    const r = await as('adminA').post('/api/parents-admin/classes/cls-7a/code-sheet');
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    sheet = r.body;
    expect(r.body.class).toEqual({ id: 'cls-7a', name: 'English 7A' });
    expect(r.body.school).toBe('School p2-A');
    expect(r.body.rows.map((x: { studentId: string }) => x.studentId).sort()).toEqual(['a1', 'a2', 'a3']);
    for (const row of r.body.rows) expect(row.code).toMatch(/^ENR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(Math.round((new Date(r.body.expiresAt).getTime() - Date.now()) / 86_400_000)).toBe(14);
    const a = await M.AuditEvent.findOne({ action: 'parent_codes_batch_created' }).lean();
    expect(a).toMatchObject({ targetId: 'cls-7a', detail: { count: 3, revoked: 0, skippedArchived: 1 } });
    idsOnly(a);
    // A code from the sheet works (preview).
    expect((await pub.post('/api/parents/start/preview', { code: sheet.rows[0].code })).status).toBe(200);
    // Listing shows no code.
    const codes = await as('adminA').get('/api/parents-admin/classes/cls-7a/codes');
    expect(codes.body.codes).toHaveLength(3);
    expect(JSON.stringify(codes.body)).not.toMatch(/ENR-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  });

  it('a reprint makes new codes and revokes the earlier unused ones', async () => {
    const r = await as('adminA').post('/api/parents-admin/classes/cls-7a/code-sheet');
    expect(r.body.revoked).toBe(3);
    expect((await pub.post('/api/parents/start/preview', { code: sheet.rows[0].code })).status).toBe(400);
    expect((await pub.post('/api/parents/start/preview', { code: r.body.rows[0].code })).status).toBe(200);
    sheet = r.body;
  });

  it('revoke one, then the whole class', async () => {
    const codes = (await as('adminA').get('/api/parents-admin/classes/cls-7a/codes')).body.codes;
    expect((await as('adminA').del(`/api/parents-admin/classes/cls-7a/codes/${codes[0].id}`)).body).toEqual({ revoked: 1 });
    expect((await as('adminA').del('/api/parents-admin/classes/cls-7a/codes/plc_nope')).status).toBe(404);
    expect((await as('adminA').post('/api/parents-admin/classes/cls-7a/codes/revoke')).body).toEqual({ revoked: 2 });
    for (const row of sheet.rows) expect((await pub.post('/api/parents/start/preview', { code: row.code })).status).toBe(400);
  });

  it('teachers: refused unless the school allows it, and then only for their own classes; other schools 403', async () => {
    expect((await as('t1').get('/api/parents-admin/classes')).status).toBe(403);
    expect((await as('t1').post('/api/parents-admin/classes/cls-7a/code-sheet')).body.error.code).toBe('TEACHER_CODES_OFF');
    expect((await as('t1').get('/api/parents-admin/status')).status).toBe(404); // nothing for a teacher to see
    await as('adminA').put('/api/parents-admin/schools/p2-A/settings', { teachersMayIssueCodes: true });
    expect((await as('t1').get('/api/parents-admin/status')).body).toMatchObject({ codeTools: true, usage: false, canChangeAccess: false });
    expect((await as('t1').get('/api/parents-admin/classes')).body.classes.map((c: { id: string }) => c.id)).toEqual(['cls-7a']);
    expect((await as('t1').post('/api/parents-admin/classes/cls-7a/code-sheet')).status).toBe(201);
    expect((await as('t2').get('/api/parents-admin/classes')).body.classes).toEqual([]);
    expect((await as('t2').post('/api/parents-admin/classes/cls-7a/code-sheet')).status).toBe(403);
    expect((await as('adminB').post('/api/parents-admin/classes/cls-7a/code-sheet')).status).toBe(403);
    expect((await as('t1').post('/api/parents-admin/classes/cls-b/code-sheet')).status).toBe(403);
    expect((await as('t1').get('/api/parents-admin/schools')).status).toBe(403); // usage stays for admins
  });

  it('a school with parent access Off issues no sheet', async () => {
    await as('ea').put('/api/parents-admin/schools/p2-B/access', { access: 'off' });
    expect((await as('adminB').post('/api/parents-admin/classes/cls-b/code-sheet')).body.error.code).toBe('PARENT_SCHOOL_ACCESS_OFF');
    await as('ea').put('/api/parents-admin/schools/p2-B/access', { access: 'free' });
  });
});
