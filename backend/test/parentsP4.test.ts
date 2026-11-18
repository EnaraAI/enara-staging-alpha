import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Parents P4 (docs/parents/P4_NOTES.md): PARENT_EMAILS_ENABLED wires the approved parent
// emails to their events. The last step (deliverRendered, which applies the lms-test
// safety path) is mocked: nothing is sent; the mock keeps what would be delivered.

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
const PW = 'parents-p4-test-password';
const as = (who: string) => ({
  get: (p: string) => request(app).get(p).set('Authorization', tok[who] ?? ''),
  post: (p: string, b: object = {}) => request(app).post(p).set('Authorization', tok[who] ?? '').send(b),
  put: (p: string, b: object = {}) => request(app).put(p).set('Authorization', tok[who] ?? '').send(b),
  del: (p: string) => request(app).delete(p).set('Authorization', tok[who] ?? ''),
});
const on = () => { process.env.PARENT_EMAILS_ENABLED = 'true'; process.env.PARENT_CODE_SIGNUP_ENABLED = 'true'; };
const off = () => { delete process.env.PARENT_EMAILS_ENABLED; };
const sent = (alias: RegExp, to?: string) => mail.calls.filter((c) => alias.test(c.alias) && (!to || c.to === to));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

async function parent(key: string, email: string) {
  const r = await request(app).post('/api/parents/register').send({ email, password: PW, name: `Mona ${key}` });
  expect(r.status).toBe(201);
  tok[key] = `Bearer ${r.body.token}`;
  return String((await M.User.findOne({ email }).lean())._id);
}
async function link(key: string, admin: string, studentId: string) {
  const code = (await as(admin).post(`/api/students/${studentId}/parent-codes`)).body.code;
  const r = await as(key).post('/api/parents/link/confirm', { code });
  expect(r.status).toBe(201);
  return r.body.linkId as string;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', APP_URL: 'https://lms-test.example.app',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'AI_PAUSED', 'GOOGLE_CLIENT_ID', 'ENARA_STAGING', 'PARENT_GRADES_AFTER_REVIEW_ENABLED', 'PARENT_SETTINGS_ENABLED', 'PARENT_CODE_TOOLS_ENABLED']) delete process.env[k];
  off();
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Student', 'AssessmentAttempt', 'ParentLearnerLink', 'ParentProfile', 'ParentEmailSend', 'AuditEvent']) M[name] = (await import(`../src/models/${name}`))[name];
  const hash = bcrypt.hashSync(PW, 4);
  for (const inst of ['p4-A', 'p4-B']) {
    await M.Institution.create({ id: inst, name: `School ${inst}` });
    await M.User.create({ email: `admin@${inst}.test`, password: hash, role: 'admin', name: `admin ${inst}`, status: 'active', institutionId: inst });
  }
  for (const [id, name, inst] of [['a1', 'Omar <b>Hassan</b>', 'p4-A'], ['a2', 'Laila Mostafa', 'p4-A'], ['a3', 'Nour Adel', 'p4-A'], ['a4', 'Ziad Kamal', 'p4-A'], ['b1', 'Bassem Nabil', 'p4-B']]) {
    await M.Student.create({ id, name, email: `${id}@${inst}.test`, institutionId: inst, learnerAgeBand: 'child' });
  }
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  tok.adminA = await login('admin@p4-A.test');
  tok.adminB = await login('admin@p4-B.test');
}, 120_000);
afterAll(async () => { off(); await mongoose.disconnect(); await mongo.stop(); });
beforeEach(() => { mail.calls.length = 0; });

describe('switch off', () => {
  it('no parent email at all; the buttons keep the lms-test block on staging', async () => {
    off();
    await parent('off', 'off.parent@family-mail.app');
    await link('off', 'adminA', 'a4');
    expect(mail.calls).toEqual([]);
    expect(await M.ParentEmailSend.countDocuments({})).toBe(0);
    const { parentEmailBlocked } = await import('../src/parents/emailBlock');
    process.env.ENARA_STAGING = 'true';
    try {
      expect(parentEmailBlocked()).toBe(true);
      on();
      expect(parentEmailBlocked()).toBe(false); // P4: the two buttons go through the safe path
    } finally {
      delete process.env.ENARA_STAGING;
      off();
    }
  });
});

describe('link confirmed / link ended (owner decision 2)', () => {
  it('confirmed: once, to the parent\'s own address, child first name escaped, no code-only account', async () => {
    on();
    const id = await parent('p1', 'p1@family-mail.app');
    await link('p1', 'adminA', 'a1');
    const c = sent(/^parent-link-confirmed-en$/, 'p1@family-mail.app');
    expect(c).toHaveLength(1);
    expect(c[0].subject).toBe('You are now linked to Omar on Enara');
    expect(c[0].html).not.toContain('<b>Hassan');
    expect(hrefs(c[0].html)).toEqual(['https://lms-test.example.app/parents']);
    const row = await M.ParentEmailSend.findOne({ parentUserId: id }).lean();
    expect(row).toMatchObject({ template: 'parent-link-confirmed-en', status: 'sent', studentId: 'a1', institutionId: 'p4-A' });
    expect(JSON.stringify(row)).not.toContain('@');
    // A code-only parent has no address: nothing is sent.
    const code = (await as('adminA').post('/api/students/a2/parent-codes')).body.code;
    mail.calls.length = 0;
    expect((await request(app).post('/api/parents/start').send({ code })).status).toBe(201);
    expect(sent(/parent-link-confirmed/)).toEqual([]);
  });

  it('the school switch turns it off', async () => {
    await as('adminA').put('/api/parents-admin/schools/p4-A/settings', { emails: { linkConfirmed: false } });
    await parent('p2', 'p2@family-mail.app');
    await link('p2', 'adminA', 'a3');
    expect(sent(/parent-link-confirmed/)).toEqual([]);
    await as('adminA').put('/api/parents-admin/schools/p4-A/settings', { emails: { linkConfirmed: true } });
  });

  it('ended: school unlink and archive send it; the parent\'s own unlink and a PDPL deletion do not', async () => {
    const links = await M.ParentLearnerLink.find({ studentId: { $in: ['a1', 'a3'] } }).lean();
    const p1a1 = links.find((l) => l.studentId === 'a1')!;
    expect((await as('adminA').del(`/api/students/a1/parent-links/${p1a1.id}`)).status).toBe(200);
    const e = sent(/^parent-link-ended-en$/, 'p1@family-mail.app');
    expect(e).toHaveLength(1);
    expect(e[0].subject).toBe("Your access to Omar's Enara progress has ended");
    mail.calls.length = 0;
    const p2a3 = links.find((l) => l.studentId === 'a3')!;
    expect((await as('p2').del(`/api/parents/links/${p2a3.id}`)).status).toBe(200);
    expect(sent(/parent-link-ended/)).toEqual([]);
    // Archive (a new link for p2 to a4 first).
    await link('p2', 'adminA', 'a4');
    mail.calls.length = 0;
    const { endParentLinksForStudent } = await import('../src/parents/linkLifecycle');
    await endParentLinksForStudent('a4', 'archived', { id: 'admin', role: 'admin' });
    expect(sent(/parent-link-ended/, 'p2@family-mail.app')).toHaveLength(1);
    mail.calls.length = 0;
    await endParentLinksForStudent('a2', 'deleted', { id: 'admin', role: 'admin' });
    expect(sent(/parent-link-ended/)).toEqual([]);
  });
});

describe('new results: released only, school switch (default off), parent opt-out, one per child per day', () => {
  it('works end to end through releaseAttempt', async () => {
    on();
    await parent('p3', 'p3@family-mail.app');
    await link('p3', 'adminA', 'a2');
    const mk = async (id: string, score: number) => M.AssessmentAttempt.create({ id, assessmentId: `as-${id}`, assessmentTitle: `Unit test ${id}`, studentId: 'a2', institutionId: 'p4-A', status: 'submitted', submittedAt: new Date(), score, totalPoints: score / 5, maxPoints: 20, gradingStatus: 'finalized' });
    const { releaseAttempt } = await import('../src/services/grading');
    // Default: the school's new-results switch is off.
    await releaseAttempt((await mk('r1', 80))!, 'teacher');
    expect(sent(/parent-new-results/)).toEqual([]);
    await as('adminA').put('/api/parents-admin/schools/p4-A/settings', { emails: { newResults: true } });
    await releaseAttempt((await mk('r2', 85))!, 'teacher');
    const n = sent(/^parent-new-results-en$/, 'p3@family-mail.app');
    expect(n).toHaveLength(1);
    expect(n[0].subject).toBe('New result for Laila: Unit test r2');
    expect(n[0].html).toContain('17 / 20');
    // A second result the same day: no second email (it is in the portal).
    await releaseAttempt((await mk('r3', 60))!, 'teacher');
    expect(sent(/parent-new-results/)).toHaveLength(1);
    // Not released (P3 rule) -> nothing, whatever the day.
    const { notifyResultVisible } = await import('../src/parents/parentEmails');
    await M.ParentEmailSend.deleteMany({ template: /new-results/ });
    mail.calls.length = 0;
    await mk('r4', 50);
    await notifyResultVisible('r4');
    expect(sent(/parent-new-results/)).toEqual([]);
    // The parent's own opt-out.
    expect((await as('p3').put('/api/parents/account/preferences', { newResultsEmail: false })).status).toBe(200);
    await releaseAttempt((await M.AssessmentAttempt.findOne({ id: 'r4' }))!, 'teacher');
    expect(sent(/parent-new-results/)).toEqual([]);
    expect((await as('p3').get('/api/parents/account')).body.preferences.emails).toEqual({ weeklySummary: true, newResults: false });
  });
});

describe('weekly summary: one email per parent, a section per child', () => {
  it('a parent of two children in two schools gets ONE email; once per week; the school switch and the parent opt-out apply', async () => {
    on();
    await parent('p4', 'p4@family-mail.app');
    await link('p4', 'adminA', 'a3');
    await link('p4', 'adminB', 'b1');
    const { runWeeklySummaries } = await import('../src/parents/parentEmails');
    // Wednesday: not yet (Sunday 18:00 Cairo of this week has not passed)... is it? A Saturday morning is safely before.
    const saturday = new Date('2026-11-21T08:00:00Z');
    expect((await runWeeklySummaries({ now: saturday })).skipped).toBe('not_yet');
    mail.calls.length = 0;
    const r = await runWeeklySummaries({ force: true });
    expect(r).toMatchObject({ parents: expect.any(Number) });
    const w = sent(/^parent-weekly-summary-en$/, 'p4@family-mail.app');
    expect(w).toHaveLength(1);
    expect(w[0].subject).toBe('This week in English: Nour and Bassem');
    expect(w[0].html).toContain('School p4-A');
    expect(w[0].html).toContain('School p4-B');
    // Each parent at most once per week.
    expect(new Set(sent(/parent-weekly-summary/).map((c) => c.to)).size).toBe(sent(/parent-weekly-summary/).length);
    mail.calls.length = 0;
    await runWeeklySummaries({ force: true });
    expect(sent(/parent-weekly-summary/)).toEqual([]);
    // School B switches the weekly summary off: next week only School A's child.
    await as('adminB').put('/api/parents-admin/schools/p4-B/settings', { emails: { weeklySummary: false } });
    const id = String((await M.User.findOne({ email: 'p4@family-mail.app' }).lean())._id);
    const { sendWeeklySummary } = await import('../src/parents/parentEmails');
    await sendWeeklySummary(id, { key: 'weekly:test:next', at: new Date(), weekStart: '2026-11-21', weekEnd: '2026-11-27' });
    expect(sent(/parent-weekly-summary/)[0].subject).toBe('This week in English: Nour');
    await as('p4').put('/api/parents/account/preferences', { weeklySummaryEmail: false });
    mail.calls.length = 0;
    await sendWeeklySummary(id, { key: 'weekly:test:optout', at: new Date(), weekStart: '2026-11-21', weekEnd: '2026-11-27' });
    expect(sent(/parent-weekly-summary/)).toEqual([]);
  });

  it('"Share this week -> Email": the approved summary with that child, to the parent\'s own address', async () => {
    const r = await as('p4').post('/api/parents/learners/a3/report/share', { channel: 'email' });
    expect(r.status).toBe(200);
    const w = sent(/^parent-weekly-summary-en$/, 'p4@family-mail.app');
    expect(w).toHaveLength(1);
    expect(w[0].subject).toBe('This week in English: Nour');
    expect((await as('p4').get('/api/parents/learners/a3/report')).body.shareEmail).toEqual({ blocked: false });
  });
});

describe('"Send code by email" (parent-invite)', () => {
  it('the approved invite: the code in the body only, the secret-code warning, the school\'s expiry', async () => {
    on();
    const r = await as('adminA').post('/api/students/a3/parent-codes', { sendToEmail: 'new.parent@family-mail.app' });
    expect(r.status).toBe(201);
    expect(r.body.emailed).toEqual({ ok: true });
    const i = sent(/^parent-invite-en$/, 'new.parent@family-mail.app');
    expect(i).toHaveLength(1);
    expect(i[0].subject).toBe('School p4-A invites you to follow Nour on Enara');
    expect(i[0].html).toContain(r.body.code);
    expect(i[0].html).toContain('This code is secret.');
    expect(i[0].html).toContain('7 days');
    for (const h of hrefs(i[0].html)) expect(h).not.toContain(r.body.code);
  });

  it('school settings: only known email switches, true/false', async () => {
    expect((await as('adminA').put('/api/parents-admin/schools/p4-A/settings', { emails: { marketing: true } })).status).toBe(400);
    expect((await as('adminA').put('/api/parents-admin/schools/p4-A/settings', { emails: { weeklySummary: 'yes' } })).status).toBe(400);
    expect((await as('adminB').put('/api/parents-admin/schools/p4-A/settings', { emails: { weeklySummary: false } })).status).toBe(403);
    expect((await as('adminA').get('/api/parents-admin/schools/p4-A/settings')).body.emails).toEqual({ linkConfirmed: true, weeklySummary: true, newResults: true, linkEnded: true });
  });
});
