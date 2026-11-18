import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Priority 0, items 2 and 4 (owner decisions D8, D9, D15, 18 Nov 2026):
//   2. parent access ends when the student is archived, deleted or leaves:
//      the read-time check, each hook, links ended (never deleted, except PDPL
//      erasure), no relink on restore, audit rows with IDs only;
//   4. the parent link code is never in a URL (email body only, the portal
//      never reads it from the URL), and sendTemplate refuses reserved
//      recipient domains.
// Resend is mocked: nothing is ever sent. No live site is called.

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })) }));

const APP = 'https://parents.qa.enara.app';
const PW = 'p0-parents-test-password';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>;
const tok: Record<string, string> = {};
const uid: Record<string, string> = {};

const as = (who: string) => ({
  get: (p: string) => request(app).get(p).set('Authorization', tok[who] ?? ''),
  post: (p: string, b: object = {}) => request(app).post(p).set('Authorization', tok[who] ?? '').send(b),
  del: (p: string) => request(app).delete(p).set('Authorization', tok[who] ?? ''),
});
const ADMIN = { id: 'admin-actor', role: 'admin' };

async function linkTo(parent: string, studentId: string, inst = 'S1') {
  const id = `pl-${parent}-${studentId}`;
  await M.ParentLearnerLink.create({ id, parentUserId: uid[parent], studentId, institutionId: inst, role: 'owner', status: 'active' });
  return id;
}
async function issue(studentId: string, body: object = {}) {
  const r = await as('admin').post(`/api/students/${studentId}/parent-codes`, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { id: string; code: string; emailed?: { ok: boolean; reason?: string } };
}
const link = (id: string) => M.ParentLearnerLink.findOne({ id }).lean() as Promise<any>;
const ended = (r: request.Response) => {
  expect(r.status).toBe(403);
  expect(r.body.error?.code ?? r.body.code).toBe('PARENT_LINK_ENDED');
};
/** Audit detail for parent link/code events holds IDs and codes only. */
function idsOnly(row: any) {
  expect(Object.keys(row.detail).every((k) => ['linkId', 'parentUserId', 'reason', 'previousStatus', 'codeId', 'role'].includes(k))).toBe(true);
  expect(JSON.stringify(row)).not.toMatch(/@|Pupil|Parent P/);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', APP_URL: APP,
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED', 'ENROLLMENT_STUDENT_ARCHIVE', 'RESEND_API_KEY']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Student', 'ParentLinkCode', 'ParentLearnerLink', 'AuditEvent']) M[name] = (await import(`../src/models/${name}`))[name];
  const hash = bcrypt.hashSync(PW, 4);
  for (const inst of ['S1', 'S2']) await M.Institution.create({ id: inst, name: `School ${inst}`, features: {} });
  await M.User.create({ email: 'admin@s1.test', password: hash, role: 'admin', name: 'Admin S1', status: 'active', institutionId: 'S1' });
  for (const id of ['st-ok', 'st-move', 'st-flag', 'st-gone', 'st-arch', 'st-del', 'st-pdpl', 'st-unlink', 'st-code', 'st-mail']) {
    await M.Student.create({ id, name: `Pupil ${id}`, email: `${id}@s1.test`, institutionId: 'S1', learnerAgeBand: 'teen' });
  }
  app = (await import('../src/app')).createApp();
  tok.admin = `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'admin@s1.test', password: PW })).body.token}`;
  for (const p of ['pa', 'pb', 'pc']) {
    const r = await request(app).post('/api/parents/register').send({ email: `${p}@parents.test`, password: PW, name: `Parent P${p}` });
    expect(r.status).toBe(201);
    tok[p] = `Bearer ${r.body.token}`;
    uid[p] = String((await M.User.findOne({ email: `${p}@parents.test` }).lean())!._id);
  }
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

// ---------------------------------------------------------------------------
describe('item 2a: read-time check (requireLearner and listLearners)', () => {
  it('a student in the link\'s school, not archived: the parent sees them', async () => {
    await linkTo('pa', 'st-ok');
    expect((await as('pa').get('/api/parents/learners/st-ok/home')).status).toBe(200);
    const list = await as('pa').get('/api/parents/learners');
    expect(list.body.learners.map((l: any) => l.studentId)).toContain('st-ok');
    expect(list.body.ended).toEqual([]);
  });

  it('left the school (another school now): 403 PARENT_LINK_ENDED, the link is ended left_school, audited', async () => {
    const id = await linkTo('pa', 'st-move');
    await M.Student.updateOne({ id: 'st-move' }, { $set: { institutionId: 'S2' } });
    ended(await as('pa').get('/api/parents/learners/st-move/progress'));
    expect(await link(id)).toMatchObject({ status: 'ended', endReason: 'left_school', endedBy: 'system:parents_read_check', endedAt: expect.any(Date) });
    const a = await M.AuditEvent.findOne({ action: 'parent_link_ended', 'detail.linkId': id }).lean();
    expect(a).toMatchObject({ actorId: 'system:parents_read_check', targetType: 'student', targetId: 'st-move', detail: { reason: 'left_school', previousStatus: 'active', parentUserId: uid.pa } });
    idsOnly(a);
    // Every learner endpoint: the same.
    for (const p of ['status', 'home', 'activity', 'alerts', 'report', 'controls']) ended(await as('pa').get(`/api/parents/learners/st-move/${p}`));
  });

  it('archived without the hook (archivedAt set directly): listLearners omits the child and ends the link', async () => {
    const id = await linkTo('pb', 'st-flag');
    await M.Student.updateOne({ id: 'st-flag' }, { $set: { archivedAt: new Date() } });
    const list = await as('pb').get('/api/parents/learners');
    expect(list.status).toBe(200);
    expect(list.body.learners).toEqual([]);
    // Ended links are listed apart, with nothing about the child.
    expect(list.body.ended).toEqual([{ linkId: id, status: 'ended', endedAt: expect.any(String) }]);
    expect(JSON.stringify(list.body)).not.toMatch(/"studentId":"st-flag"|Pupil|School S1|archived/);
    expect(await link(id)).toMatchObject({ status: 'ended', endReason: 'archived' });
    ended(await as('pb').get('/api/parents/learners/st-flag/home'));
    // The account page lists no guardians for an ended child either.
    const acc = await as('pb').get('/api/parents/account');
    expect(acc.body.learners).toEqual([]);
    expect(acc.body.guardians.byLearner).toEqual([]);
  });

  it('student record gone (deleted without the hook): 403 PARENT_LINK_ENDED, link ended deleted, row kept', async () => {
    const id = await linkTo('pc', 'st-gone');
    await M.Student.deleteOne({ id: 'st-gone' });
    ended(await as('pc').get('/api/parents/learners/st-gone/home'));
    expect(await link(id)).toMatchObject({ status: 'ended', endReason: 'deleted' });
  });

  it('a link with no school grants nothing (fails the check)', async () => {
    await M.ParentLearnerLink.create({ id: 'pl-noschool', parentUserId: uid.pc, studentId: 'st-ok', role: 'view', status: 'active' });
    ended(await as('pc').get('/api/parents/learners/st-ok/home'));
    expect(await link('pl-noschool')).toMatchObject({ status: 'ended', endReason: 'left_school' });
  });
});

// ---------------------------------------------------------------------------
describe('item 2b: hooks end the links; ended, not deleted; no relink on restore', () => {
  it('archiveStudent ends every link (archived) and revokes unused codes at once; restore does not relink (D9)', async () => {
    const { archiveStudent, restoreStudent } = await import('../src/services/archive');
    const la = await linkTo('pa', 'st-arch');
    const lb = await linkTo('pb', 'st-arch');
    const unused = await issue('st-arch');
    expect((await as('pa').get('/api/parents/learners/st-arch/home')).status).toBe(200);

    await archiveStudent((await M.Student.findOne({ id: 'st-arch' }).lean())!, ADMIN);
    // Ended by the hook (not the read check), rows kept.
    for (const id of [la, lb]) expect(await link(id)).toMatchObject({ status: 'ended', endReason: 'archived', endedBy: ADMIN.id });
    expect(await M.ParentLearnerLink.countDocuments({ studentId: 'st-arch' })).toBe(2);
    expect(await M.ParentLinkCode.findOne({ id: unused.id }).lean()).toMatchObject({ status: 'revoked', revokedBy: ADMIN.id });
    const audits = await M.AuditEvent.find({ action: 'parent_link_ended', targetId: 'st-arch' }).lean();
    expect(audits.map((a: any) => a.detail.linkId).sort()).toEqual([la, lb].sort());
    audits.forEach(idsOnly);
    const codeAudit = await M.AuditEvent.findOne({ action: 'parent_code_revoked', 'detail.codeId': unused.id }).lean();
    expect(codeAudit).toMatchObject({ actorId: ADMIN.id, detail: { reason: 'archived' } });
    idsOnly(codeAudit);
    ended(await as('pa').get('/api/parents/learners/st-arch/home'));
    // The code issued before the archive makes no link.
    expect((await as('pc').post('/api/parents/link/confirm', { code: unused.code })).status).toBe(400);
    // No new code while archived.
    const refused = await as('admin').post('/api/students/st-arch/parent-codes');
    expect(refused.status).toBe(409);
    expect(refused.body.error?.code ?? refused.body.code).toBe('STUDENT_ARCHIVED');

    await restoreStudent((await M.Student.findOne({ id: 'st-arch' }).lean())!, ADMIN);
    for (const id of [la, lb]) expect(await link(id)).toMatchObject({ status: 'ended', endReason: 'archived' });
    ended(await as('pa').get('/api/parents/learners/st-arch/home'));
    expect((await as('pa').get('/api/parents/learners')).body.learners.map((l: any) => l.studentId)).not.toContain('st-arch');

    // The school issues a new code: redeeming it reactivates the SAME row.
    const fresh = await issue('st-arch');
    const c = await as('pa').post('/api/parents/link/confirm', { code: fresh.code });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.linkId).toBe(la);
    const row = await link(la);
    expect(row).toMatchObject({ status: 'active', codeId: fresh.id });
    expect(row.endedAt).toBeUndefined();
    expect(row.endReason).toBeUndefined();
    expect(await M.AuditEvent.findOne({ action: 'parent_code_redeemed', 'detail.linkId': la }).lean()).toMatchObject({ detail: { previousStatus: 'ended' } });
    expect((await as('pa').get('/api/parents/learners/st-arch/home')).status).toBe(200);
    // The other parent stays ended.
    ended(await as('pb').get('/api/parents/learners/st-arch/home'));
  });

  it('delete (legacy, archive switch off): links ended deleted, rows kept, audited', async () => {
    const id = await linkTo('pa', 'st-del');
    const code = await issue('st-del');
    const r = await as('admin').del('/api/students/st-del');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await M.Student.exists({ id: 'st-del' })).toBeNull();
    expect(await link(id)).toMatchObject({ status: 'ended', endReason: 'deleted' });
    expect(await M.ParentLinkCode.findOne({ id: code.id }).lean()).toMatchObject({ status: 'revoked' });
    const a = await M.AuditEvent.findOne({ action: 'parent_link_ended', 'detail.linkId': id }).lean();
    expect(a).toMatchObject({ detail: { reason: 'deleted' } });
    idsOnly(a);
    ended(await as('pa').get('/api/parents/learners/st-del/home'));
  });

  it('PDPL permanent deletion: links ended and audited first, then the rows are erased (existing PDPL rule)', async () => {
    const { permanentlyDeleteStudent } = await import('../src/services/studentErasure');
    const id = await linkTo('pb', 'st-pdpl');
    await issue('st-pdpl');
    const s = (await M.Student.findOne({ id: 'st-pdpl' }).lean())!;
    const result = await permanentlyDeleteStudent(s, ADMIN);
    expect(result.removed).toMatchObject({ parent_learner_links: 1, parent_link_codes: 1, student: 1 });
    expect(await M.ParentLearnerLink.countDocuments({ studentId: 'st-pdpl' })).toBe(0);
    const a = await M.AuditEvent.findOne({ action: 'parent_link_ended', 'detail.linkId': id }).lean();
    expect(a).toMatchObject({ actorId: ADMIN.id, targetId: 'st-pdpl', detail: { reason: 'deleted' } });
    idsOnly(a);
    // Nothing to show: no learner, and no ended entry (the row is erased).
    const list = await as('pb').get('/api/parents/learners');
    expect(JSON.stringify(list.body)).not.toContain(id);
    expect((await as('pb').get('/api/parents/learners/st-pdpl/home')).status).toBe(403);
  });

  it('school unlink and parent unlink: ended (unlinked_by_school / unlinked_by_parent), never deleted; a second unlink changes nothing', async () => {
    const ls = await linkTo('pa', 'st-unlink');
    const lp = await linkTo('pb', 'st-unlink');
    expect((await as('admin').del(`/api/students/st-unlink/parent-links/${ls}`)).status).toBe(200);
    expect((await as('pb').del(`/api/parents/links/${lp}`)).status).toBe(200);
    expect(await link(ls)).toMatchObject({ status: 'ended', endReason: 'unlinked_by_school' });
    expect(await link(lp)).toMatchObject({ status: 'ended', endReason: 'unlinked_by_parent', endedBy: uid.pb });
    expect(await M.ParentLearnerLink.countDocuments({ studentId: 'st-unlink' })).toBe(2);
    expect((await as('admin').del(`/api/students/st-unlink/parent-links/${ls}`)).status).toBe(200);
    expect(await M.AuditEvent.countDocuments({ action: 'parent_link_ended', 'detail.linkId': ls })).toBe(1);
    for (const a of await M.AuditEvent.find({ action: 'parent_link_ended', targetId: 'st-unlink' }).lean()) idsOnly(a);
    ended(await as('pa').get('/api/parents/learners/st-unlink/home'));
    // The school still sees the history.
    const hist = await as('admin').get('/api/students/st-unlink/parent-codes');
    expect(hist.body.links.map((l: any) => [l.linkId, l.status, l.endReason]).sort()).toEqual([[lp, 'ended', 'unlinked_by_parent'], [ls, 'ended', 'unlinked_by_school']].sort());
  });

  it('a code for a student who has since left the school makes no link', async () => {
    const code = await issue('st-code');
    await M.Student.updateOne({ id: 'st-code' }, { $set: { institutionId: 'S2' } });
    const r = await as('pc').post('/api/parents/link/confirm', { code: code.code });
    expect(r.status).toBe(400);
    expect(await M.ParentLearnerLink.exists({ studentId: 'st-code' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('item 4: the link code is never in a URL', () => {
  beforeEach(async () => {
    sendMock.mockReset().mockResolvedValue({ data: { id: 'mock-email' }, error: null });
    process.env.RESEND_API_KEY = 're_test_dummy_not_real';
    (await import('../src/email/sendTemplate')).resetEmailClientForTests();
  });
  afterEach(async () => {
    delete process.env.RESEND_API_KEY;
    (await import('../src/email/sendTemplate')).resetEmailClientForTests();
  });

  it('lms-test (ENARA_STAGING): "Send code by email" is blocked (409 PARENT_EMAIL_BLOCKED_STAGING, nothing created or sent); a code without email still works', async () => {
    const env = await import('../src/config/env');
    (env.getConfig() as { stagingMode: boolean }).stagingMode = true;
    try {
      const before = await M.ParentLinkCode.countDocuments({ studentId: 'st-mail' });
      const r = await as('admin').post('/api/students/st-mail/parent-codes', { sendToEmail: 'family@qa.enara.app' });
      expect(r.status).toBe(409);
      expect(r.body.error).toMatchObject({ code: 'PARENT_EMAIL_BLOCKED_STAGING', message: 'Parent emails are switched on in a later step.' });
      expect(r.body.error.messages.ar).toMatch(/[\u0600-\u06FF]/);
      expect(await M.ParentLinkCode.countDocuments({ studentId: 'st-mail' })).toBe(before);
      expect(sendMock).not.toHaveBeenCalled();
      // The service refuses it too (any other caller).
      const { createCode } = await import('../src/parents/codes');
      await expect(createCode({ id: ADMIN.id, role: 'admin', institutionId: 'S1' } as never, 'st-mail', { sendToEmail: 'family@qa.enara.app' })).rejects.toMatchObject({ statusCode: 409, code: 'PARENT_EMAIL_BLOCKED_STAGING' });
      // The UI is told, and a code without email still works.
      expect((await as('admin').get('/api/students/st-mail/parent-codes')).body.parentEmail).toMatchObject({ blocked: true, code: 'PARENT_EMAIL_BLOCKED_STAGING' });
      expect((await issue('st-mail')).emailed).toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    } finally {
      env.resetConfigForTests();
    }
    expect((await as('admin').get('/api/students/st-mail/parent-codes')).body.parentEmail).toEqual({ blocked: false });
  });

  it('the emailed code is in the body only; the button opens /parents/link with no code', async () => {
    const r = await issue('st-mail', { sendToEmail: 'family@qa.enara.app' });
    expect(r.emailed).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0];
    expect(sent.to).toBe('family@qa.enara.app');
    expect(sent.html).toContain(r.code);
    const urls = [...sent.html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m: RegExpMatchArray) => m[1]);
    expect(urls).toContain(`${APP}/parents/link`);
    const bare = r.code.replace(/[^A-Z0-9]/g, '');
    for (const u of urls) {
      expect(decodeURIComponent(u).toUpperCase().replace(/[^A-Z0-9]/g, '')).not.toContain(bare);
      expect(u).not.toMatch(/[?&]code=/i);
    }
    expect(JSON.stringify(sent)).not.toMatch(/[?&]code=/i);
  });

  it('a reserved address gets nothing; the code is still issued', async () => {
    const r = await issue('st-mail', { sendToEmail: 'family@example.com' });
    expect(r.emailed).toEqual({ ok: false, reason: 'reserved_recipient' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('parent-consent links never take params; sendTemplate refuses a link that carries a code (code_in_url)', async () => {
    const { TEMPLATE_LINKS } = await import('../src/email/links');
    expect(TEMPLATE_LINKS['enara-parent-consent']).toEqual({ path: '/parents/link', params: [] });
    const { sendTemplate } = await import('../src/email/sendTemplate');
    const { TEMPLATES_BUNDLE } = await import('../src/email/templatesBundle');
    const orig = TEMPLATES_BUNDLE['enara-parent-consent'];
    try {
      (TEMPLATES_BUNDLE as any)['enara-parent-consent'] = { ...orig, html: orig.html.replace('href="{{{ACTION_URL}}}"', 'href="{{{ACTION_URL}}}?c={{LINK_CODE}}"') };
      const r = await sendTemplate('enara-parent-consent', 'family@qa.enara.app', { NAME: 'x', CHILD_NAME: 'y', LINK_CODE: 'ENR-ABCD-EFGH', EXPIRES_IN: '7 days' });
      expect(r).toMatchObject({ ok: false, code: 'code_in_url' });
      (TEMPLATES_BUNDLE as any)['enara-parent-consent'] = { ...orig, html: `${orig.html}<a href="https://x.qa.enara.app/l?k=enr-wxyz-2345">x</a>` };
      expect(await sendTemplate('enara-parent-consent', 'family@qa.enara.app', { NAME: 'x', CHILD_NAME: 'y', LINK_CODE: 'ENR-ABCD-EFGH', EXPIRES_IN: '7 days' })).toMatchObject({ ok: false, code: 'code_in_url' });
      expect(sendMock).not.toHaveBeenCalled();
    } finally {
      (TEMPLATES_BUNDLE as any)['enara-parent-consent'] = orig;
    }
    // An empty code is refused (no fallback): never an email without its code.
    expect(await sendTemplate('enara-parent-consent', 'family@qa.enara.app', { NAME: 'x', CHILD_NAME: 'y', LINK_CODE: '', EXPIRES_IN: '7 days' })).toMatchObject({ ok: false, code: 'unfilled_placeholder' });
  });

  it('no template link or bundled template carries a code parameter, and the portal never reads ?code=', async () => {
    const { TEMPLATES_BUNDLE } = await import('../src/email/templatesBundle');
    for (const [alias, t] of Object.entries(TEMPLATES_BUNDLE)) expect(t.html, alias).not.toMatch(/[?&]code=/i);
    const app = fs.readFileSync(path.join(__dirname, '../../frontend/parents/ParentsApp.tsx'), 'utf8');
    expect(app).not.toMatch(/get\(['"]code['"]\)/);
    expect(app).toMatch(/params\.delete\('code'\)/);
    const screen = fs.readFileSync(path.join(__dirname, '../../frontend/parents/screens/LinkChild.tsx'), 'utf8');
    expect(screen).not.toContain('initialCode');
  });
});

describe('item 4: sendTemplate refuses reserved recipient domains', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    sendMock.mockReset().mockResolvedValue({ data: { id: 'mock-email' }, error: null });
    process.env.RESEND_API_KEY = 're_test_dummy_not_real';
    (await import('../src/email/sendTemplate')).resetEmailClientForTests();
    const { logger } = await import('../src/utils/logging');
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    delete process.env.RESEND_API_KEY;
    warn.mockRestore();
    error.mockRestore();
  });

  const RESERVED = [
    'a@b.test', 'kid@pp-A.TEST', 'x@lms.enara.test', 'u123@sub.lms.enara.test', 'Pupil <p@lms.enara.test>',
    'x@foo.example', 'x@foo.invalid', 'x@localhost', 'x@box.localhost', 'jane@example.com', 'j@EXAMPLE.ORG.', 'j@mail.example.net',
    'no-at-sign', '',
  ];
  it.each(RESERVED)('refuses %j: reserved_recipient, nothing sent, only the code logged', async (to) => {
    const { sendTemplate } = await import('../src/email/sendTemplate');
    const r = await sendTemplate('enara-welcome', to, { NAME: 'N' });
    expect(r).toMatchObject({ ok: false, code: 'reserved_recipient' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('email.send_template_refused', { alias: 'enara-welcome', code: 'reserved_recipient' });
    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
    if (to.includes('@')) expect(logged).not.toContain(to.replace(/.*<|>.*/g, '').split('@')[0] + '@');
  });

  it('a list with one reserved address is refused whole', async () => {
    const { sendTemplate } = await import('../src/email/sendTemplate');
    expect(await sendTemplate('enara-welcome', ['ok@qa.enara.app', 'kid@lms.enara.test'], { NAME: 'N' })).toMatchObject({ ok: false, code: 'reserved_recipient' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('ordinary domains (including look-alikes) are sent through the (mocked) client', async () => {
    const { sendTemplate } = await import('../src/email/sendTemplate');
    for (const to of ['ok@qa.enara.app', 'x@notexample.com', 'x@example.co', 'x@testing.org', 'Name <x@school.eg>']) {
      expect(await sendTemplate('enara-welcome', to, { NAME: 'N' }), to).toMatchObject({ ok: true });
    }
    expect(sendMock).toHaveBeenCalledTimes(5);
  });

  it('isReservedRecipient / recipientDomain', async () => {
    const { isReservedRecipient, recipientDomain } = await import('../src/email/reservedRecipients');
    expect(recipientDomain('A <x@Sub.Example.COM.>')).toBe('sub.example.com');
    expect(recipientDomain('nope')).toBeNull();
    expect(isReservedRecipient(undefined)).toBe(true);
    expect(isReservedRecipient('x@enara.test')).toBe(true);
    expect(isReservedRecipient('x@enara.app')).toBe(false);
  });
});
