import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCsv } from '../src/parents/csvInvites';

// Parents P5 (docs/parents/P5_NOTES.md): CSV invitations. PARENT_CSV_INVITES_ENABLED and
// the school's own "CSV invites" setting (default off). Rows with the same parent email
// become ONE parent-invite email (each child's first name and code, in the body only);
// no email binding; the invited address is a suggestion when the parent adds an email.
// The last step (deliverRendered) is mocked: nothing is sent.

const mail = vi.hoisted(() => ({ calls: [] as { alias: string; to: string; subject: string; html: string }[] }));
vi.mock('../src/email/sendBundledTemplate', async (orig) => ({
  ...(await orig<object>()),
  deliverRendered: vi.fn(async (i: { alias: string; to: string; subject: string; html: string }) => {
    mail.calls.push({ alias: i.alias, to: i.to, subject: i.subject, html: i.html });
    return { ok: true, id: 'mock' };
  }),
}));

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tok: Record<string, string> = {};
const PW = 'parents-p5-test-password';
const FLAGS = ['PARENT_CSV_INVITES_ENABLED', 'PARENT_EMAILS_ENABLED', 'PARENT_CODE_SIGNUP_ENABLED', 'PARENT_EMAIL_SIGNIN_ENABLED'];
const on = () => { for (const f of FLAGS) process.env[f] = 'true'; };
const as = (who: string) => ({
  get: (p: string) => request(app).get(p).set('Authorization', tok[who] ?? ''),
  post: (p: string, b: object = {}) => request(app).post(p).set('Authorization', tok[who] ?? '').send(b),
  put: (p: string, b: object = {}) => request(app).put(p).set('Authorization', tok[who] ?? '').send(b),
});
const CODE = /ENR-[A-Z0-9]{4}-[A-Z0-9]{4}/g;
const CSV = [
  'student_ref,parent_email,parent_name,language',
  'c1,Sara.Family@family-mail.app,Sara Ali,en', // ok
  'c2,sara.family@family-mail.app,,', // ok, same parent (case differs): grouped
  'c3,other.parent@family-mail.app,,ar', // ok, another parent, Arabic
  'nobody,x@family-mail.app,,', // unknown student
  'b1,y@family-mail.app,,', // another school's student: unknown (nothing revealed)
  'c4,z@family-mail.app,,', // archived
  'c1,sara.family@family-mail.app,,', // duplicate
  'c2,not-an-email,,', // bad email
  'c2,p@example.com,,', // reserved domain: bad email
  ',q@family-mail.app,,', // missing
  '"777","quoted.parent@family-mail.app","Mona ""M"" Adel",en', // ok by Moodle user ID, quoted
].join('\r\n');

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', APP_URL: 'https://lms-test.example.app',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'AI_PAUSED', 'GOOGLE_CLIENT_ID', 'ENARA_STAGING', 'PARENT_SETTINGS_ENABLED', 'PARENT_CODE_TOOLS_ENABLED', 'PARENT_GRADES_AFTER_REVIEW_ENABLED', ...FLAGS]) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Student', 'ParentLinkCode', 'ParentInvite', 'ParentEmailSend', 'AuditEvent']) M[name] = (await import(`../src/models/${name}`))[name];
  const { LmsUser } = await import('../src/integrations/lms/models');
  const hash = bcrypt.hashSync(PW, 4);
  for (const inst of ['p5-A', 'p5-B']) {
    await M.Institution.create({ id: inst, name: `School ${inst}` });
    await M.User.create({ email: `admin@${inst}.test`, password: hash, role: 'admin', name: `admin ${inst}`, status: 'active', institutionId: inst });
  }
  for (const [id, name, inst, archived] of [['c1', 'Omar Hassan', 'p5-A'], ['c2', 'Laila Hassan', 'p5-A'], ['c3', 'Nour Adel', 'p5-A'], ['c4', 'Old Kid', 'p5-A', true], ['c5', 'Moodle Kid', 'p5-A'], ['b1', 'Bassem Nabil', 'p5-B']] as const) {
    await M.Student.create({ id, name, email: `${id}@${inst}.test`, institutionId: inst, learnerAgeBand: 'child', ...(archived ? { archivedAt: new Date() } : {}) });
  }
  const acc = await M.User.create({ email: 'c5@lms.enara.test', password: hash, role: 'student', name: 'Moodle Kid', status: 'active', institutionId: 'p5-A', studentId: 'c5' });
  await LmsUser.create({ platformId: 'plat-1', institutionId: 'p5-A', externalUserId: '777', enaraUserId: String(acc._id) });
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  tok.adminA = await login('admin@p5-A.test');
  tok.adminB = await login('admin@p5-B.test');
}, 120_000);
afterAll(async () => { for (const f of FLAGS) delete process.env[f]; await mongoose.disconnect(); await mongo.stop(); });
beforeEach(() => { mail.calls.length = 0; });

describe('the CSV reader', () => {
  it('reads quotes, doubled quotes, CRLF and blank lines', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']]);
  });
});

describe('switches', () => {
  it('404 with the switch off; 403 until the school turns CSV invites on; school admins only', async () => {
    expect((await as('adminA').post('/api/parents-admin/csv-invites/preview', { csv: CSV })).status).toBe(404);
    on();
    expect((await as('adminA').post('/api/parents-admin/csv-invites/preview', { csv: CSV })).body.error.code).toBe('CSV_INVITES_OFF');
    expect((await as('adminA').put('/api/parents-admin/schools/p5-A/settings', { csvInvites: 'yes' })).status).toBe(400);
    expect((await as('adminB').put('/api/parents-admin/schools/p5-A/settings', { csvInvites: true })).status).toBe(403);
    expect((await as('adminA').put('/api/parents-admin/schools/p5-A/settings', { csvInvites: true })).body.csvInvites).toBe(true);
    expect((await as('adminA').get('/api/parents-admin/status')).body.csvInvites).toBe(true);
  });
});

describe('preview: nothing created or sent', () => {
  it('marks every row; addresses masked; other schools\' students read as unknown', async () => {
    const r = await as('adminA').post('/api/parents-admin/csv-invites/preview', { csv: CSV });
    expect(r.status).toBe(200);
    expect(r.body.rows.map((x: { status: string }) => x.status)).toEqual(['ok', 'ok', 'ok', 'unknown_student', 'unknown_student', 'archived', 'duplicate', 'bad_email', 'bad_email', 'missing', 'ok']);
    expect(r.body.counts).toEqual({ ok: 4, bad_email: 2, unknown_student: 2, archived: 1, duplicate: 1, missing: 1 });
    expect(r.body.emails).toBe(3);
    expect(r.body.rows[0]).toMatchObject({ row: 2, studentRef: 'c1', studentName: 'Omar Hassan', email: 's•••@family-mail.app' });
    expect(r.body.rows[4].studentName).toBeUndefined(); // b1 (School B): nothing revealed
    expect(r.body.rows[10]).toMatchObject({ studentRef: '777', studentName: 'Moodle Kid' }); // by Moodle user ID
    expect(JSON.stringify(r.body)).not.toContain('sara.family@');
    expect(await M.ParentLinkCode.countDocuments({})).toBe(0);
    expect(await M.ParentInvite.countDocuments({})).toBe(0);
    expect(mail.calls).toEqual([]);
    expect((await as('adminA').post('/api/parents-admin/csv-invites/preview', { csv: 'email,student\nx,y' })).body.error.code).toBe('CSV_HEADER');
  });
});

describe('confirm: one email per parent address, codes in the body only', () => {
  let batch = '';
  it('groups the two children of the same parent into ONE email; the admin never sees a code', async () => {
    const r = await as('adminA').post('/api/parents-admin/csv-invites', { csv: CSV });
    expect(r.status).toBe(201);
    batch = r.body.batchId;
    expect(r.body).toMatchObject({ invited: 4, emails: 3, emailResults: { sent: 3 } });
    expect(JSON.stringify(r.body)).not.toMatch(CODE);
    expect(mail.calls).toHaveLength(3);
    const sara = mail.calls.filter((c) => c.to === 'sara.family@family-mail.app');
    expect(sara).toHaveLength(1);
    expect(sara[0].alias).toBe('parent-invite-en');
    expect(sara[0].subject).toBe('School p5-A invites you to follow Omar and Laila on Enara');
    expect(sara[0].html.match(CODE)).toHaveLength(2);
    expect(sara[0].html).toContain('Hello Sara');
    expect(sara[0].html).toContain('This code is secret.');
    for (const h of [...sara[0].html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])) expect(h).not.toMatch(CODE);
    const other = mail.calls.find((c) => c.to === 'other.parent@family-mail.app')!;
    expect(other.alias).toBe('parent-invite-ar');
    expect(mail.calls.find((c) => c.to === 'quoted.parent@family-mail.app')!.html).toContain('Mona');
    // Stored: invites with the address hidden and hashed; codes as hashes; one audit row, counts only.
    const inv = await M.ParentInvite.find({ batchId: batch }).lean();
    expect(inv).toHaveLength(4);
    expect(inv[0].email).toBeUndefined();
    const a = await M.AuditEvent.findOne({ action: 'parent_csv_invites_sent' }).lean();
    expect(a.detail).toMatchObject({ invited: 4, emails: 3, skipped: 7 });
    expect(JSON.stringify(a)).not.toMatch(/@|ENR-/);
    expect(await M.ParentEmailSend.countDocuments({ key: new RegExp(`^csvinvite:${batch}:`) })).toBe(3);
  });

  it('no email binding: any parent account redeems; the invited address is then only a suggestion', async () => {
    // The test reads the code from the mocked email body (as the parent would).
    const r = await as('adminA').post('/api/parents-admin/csv-invites', { csv: 'student_ref,parent_email\nc3,suggest.me@family-mail.app' });
    expect(r.status).toBe(201);
    const code3 = mail.calls[0].html.match(CODE)![0];
    const start = await request(app).post('/api/parents/start').send({ code: code3 }); // a code-only account, no email
    expect(start.status).toBe(201);
    tok.codeParent = `Bearer ${start.body.token}`;
    const acc = await as('codeParent').get('/api/parents/account');
    expect(acc.body.signIn).toMatchObject({ hasEmail: false, suggestedEmail: 'suggest.me@family-mail.app' });
  });

  it('the list: statuses (sent, redeemed, revoked, expired), masked addresses; Resend makes a new code, Revoke stops it', async () => {
    const list = (await as('adminA').get('/api/parents-admin/csv-invites')).body.invites as { id: string; studentId: string; status: string; email: string }[];
    expect(list.find((i) => i.email === 's•••@family-mail.app')).toBeTruthy();
    expect(JSON.stringify(list)).not.toContain('sara.family@');
    expect(list.find((i) => i.studentId === 'c3' && i.status === 'redeemed')).toBeTruthy();
    const omar = list.find((i) => i.studentId === 'c1')!;
    expect(omar.status).toBe('sent');
    const before = await M.ParentInvite.findOne({ id: omar.id }).lean();
    mail.calls.length = 0;
    const re = await as('adminA').post(`/api/parents-admin/csv-invites/${omar.id}/resend`);
    expect(re.body).toEqual({ ok: true, emailStatus: 'sent' });
    expect(mail.calls).toHaveLength(1);
    expect(mail.calls[0].subject).toBe('School p5-A invites you to follow Omar on Enara');
    expect((await M.ParentLinkCode.findOne({ id: before.codeId }).lean()).status).toBe('revoked');
    expect((await as('adminA').post(`/api/parents-admin/csv-invites/${omar.id}/revoke`)).body).toEqual({ ok: true });
    const after = (await as('adminA').get('/api/parents-admin/csv-invites')).body.invites.find((i: { id: string }) => i.id === omar.id);
    expect(after.status).toBe('revoked');
    expect((await request(app).post('/api/parents/start/preview').send({ code: mail.calls[0].html.match(CODE)![0] })).status).toBe(400);
    expect((await as('adminA').post(`/api/parents-admin/csv-invites/${omar.id}/resend`)).status).toBe(409);
    // Another school's admin cannot touch it.
    expect((await as('adminB').post(`/api/parents-admin/csv-invites/${omar.id}/revoke`)).status).toBe(403);
    // Expired.
    const laila = list.find((i) => i.studentId === 'c2')!;
    await M.ParentLinkCode.updateOne({ id: (await M.ParentInvite.findOne({ id: laila.id }).lean()).codeId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await as('adminA').get('/api/parents-admin/csv-invites')).body.invites.find((i: { id: string }) => i.id === laila.id).status).toBe('expired');
  });

  it('PDPL: erasing a student deletes their invites', async () => {
    const { permanentlyDeleteStudent } = await import('../src/services/studentErasure');
    const s = (await M.Student.findOne({ id: 'c2' }).lean())!;
    const r = await permanentlyDeleteStudent(s, { id: 'admin', role: 'admin', institutionId: 'p5-A' } as never);
    expect(r.removed.parent_invites).toBeGreaterThan(0);
    expect(await M.ParentInvite.countDocuments({ studentId: 'c2' })).toBe(0);
  });
});
