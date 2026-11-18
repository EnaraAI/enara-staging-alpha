import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';

// LMS emails wired to events (lms-test): every trigger fires once, with the
// right template and language; the gates (LMS_EMAILS_ENABLED, REMINDERS_ENABLED,
// RESEND_API_KEY, the E2E capture); the test inbox redirect, the subject prefix
// and the daily safety ceiling; the digests' grouping; the teacher opt-in (D2); no student
// names (D3). Resend is mocked: nothing is ever sent. No network.
const sendMock = vi.fn();
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })) }));

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.app';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const ENV_KEYS = [
  'LMS_LTI_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_DRAIN_TRIGGERS', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_EMAILS_ENABLED', 'REMINDERS_ENABLED', 'RESEND_API_KEY', 'APP_URL',
  'REMINDER_TEST_RECIPIENT', 'EMAIL_SUBJECT_PREFIX', 'EMAIL_DAILY_CEILING', 'LMS_EMAIL_CAPTURE', 'LMS_OPS_EMAILS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL',
];
const OPS = 'ops@ops.enara.app';
const ON = {
  LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, APP_URL: TOOL, LMS_DRAIN_TRIGGERS: 'cron', LMS_ROSTER_SYNC_ENABLED: 'true',
  LMS_EMAILS_ENABLED: 'true', REMINDERS_ENABLED: 'true', RESEND_API_KEY: 're_test_dummy', LMS_OPS_EMAILS: `${OPS}, not-an-address`,
};
function setEnv(vars: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'mail-school-a'; // Egypt, Arabic
const B = 'mail-school-b'; // English
const ADMIN_A = 'mona.adel@school-a.enara.app';
const ADMIN_B = 'head@school-b.enara.app';
const TEACHER_EMAIL = 'ahmed.t@school-a.enara.app';
const STUDENT_NAME = 'Zeynab Studentname';

let mongo: MongoMemoryServer;
let app: import('express').Express;
let M: typeof import('../../src/integrations/lms/models');
let E: typeof import('../../src/integrations/lms/core/lmsEmailEvents');
let D: typeof import('../../src/integrations/lms/core/lmsEmailDaily');
let L: typeof import('../../src/integrations/lms/core/lmsEmail');
let settle: () => Promise<void>;
const auth: Record<string, string> = {};
const ids: Record<string, string> = {};

async function mkUser(key: string, email: string, role: string, institutionId?: string, name = key) {
  const { User } = await import('../../src/models/User');
  const { signAccessToken } = await import('../../src/auth/jwt');
  const u = await User.create({ email, password: 'x', role, name, institutionId });
  ids[key] = u._id.toString();
  auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL']) delete process.env[k];
  setEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { Institution } = await import('../../src/models/Institution');
  await Institution.create({ id: A, name: 'Nile School (fake)', country: 'EG', emailLanguage: 'ar', timeZone: 'Africa/Cairo' });
  await Institution.create({ id: B, name: 'Thames School (fake)', country: 'GB', timeZone: 'Europe/London' });
  await mkUser('enara', 'enara@staff.test', 'enara-admin');
  await mkUser('adminA', ADMIN_A, 'admin', A, 'Mona Adel');
  await mkUser('adminA2', 'second@lms.enara.test', 'admin', A, 'Never Emailed'); // a reserved .test address: never
  await mkUser('adminB', ADMIN_B, 'admin', B, 'Jane Head');
  await mkUser('teacherA', '1234@lms.enara.test', 'teacher', A, 'Ahmed Teacher');
  await mkUser('teacherA2', '5678@lms.enara.test', 'teacher', A, 'Silent Teacher');
  await mkUser('studentA', 'kid@school-a.enara.app', 'student', A, STUDENT_NAME);
  app = (await import('../../src/app')).createApp();
  E = await import('../../src/integrations/lms/core/lmsEmailEvents');
  D = await import('../../src/integrations/lms/core/lmsEmailDaily');
  L = await import('../../src/integrations/lms/core/lmsEmail');
  settle = (await import('../../src/integrations/lms/core/drain')).settleLmsBackgroundForTests;
}, 120_000);

afterAll(async () => {
  await settle?.().catch(() => undefined);
  setEnv({});
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await settle();
  setEnv(ON);
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'em_1' }, error: null });
  (await import('../../src/email/sendTemplate')).resetEmailClientForTests();
  E.resetLmsEmailThrottleForTests();
  for (const model of M.ALL_LMS_MODELS) {
    if (model === M.LmsToolKey) continue;
    await (model as unknown as { deleteMany(f: object): Promise<unknown> }).deleteMany({});
  }
});

type Sent = { to: string; subject: string; html: string; from: string; attachments: { contentId: string }[] };
const sent = (): Sent[] => sendMock.mock.calls.map((c) => c[0] as Sent);
const sentTo = (to: string) => sent().filter((s) => s.to === to);
const logs = (template?: string) => M.LmsEmailLog.find(template ? { template } : {}).sort({ createdAt: 1 }).lean();

let seq = 0;
async function platform(institutionId: string, over: Record<string, unknown> = {}) {
  seq++;
  return (await M.LmsPlatform.create({ institutionId, provider: 'lti13', vendor: 'moodle', issuer: `https://moodle${seq}.school.example`, clientId: `c${seq}`, keysetUrl: `https://moodle${seq}.school.example/mod/lti/certs.php`, authLoginUrl: `https://moodle${seq}.school.example/mod/lti/auth.php`, registeredVia: 'manual', status: 'active', approvedAt: new Date(), ...over })).toObject();
}
async function audit(row: { event: string; outcome: 'ok' | 'warn' | 'fail'; institutionId?: string; platformId?: string; code?: string; refIds?: Record<string, unknown> }) {
  const { writeLmsAudit } = await import('../../src/integrations/lms/core/audit');
  await writeLmsAudit(row);
}

/** An LMS course with an opted-in teacher (teacherA), a silent teacher (teacherA2, no opt-in) and an LMS student. */
async function course(p: { id: string; institutionId: string }, title = 'Grade 8 English (fake)', optIn = true) {
  seq++;
  const ctx = (await M.LmsContext.create({ platformId: p.id, institutionId: p.institutionId, externalContextId: `ctx${seq}`, title, enaraClassId: `cls_${seq}`, status: 'active' })).toObject();
  for (const key of ['teacherA', 'teacherA2']) {
    const lu = await M.LmsUser.findOneAndUpdate({ platformId: p.id, externalUserId: `t-${key}` }, { $setOnInsert: { institutionId: p.institutionId, enaraUserId: ids[key], email: key === 'teacherA' ? TEACHER_EMAIL : 'silent@school-a.enara.app' } }, { upsert: true, new: true }).lean();
    await M.LmsEnrollment.create({ contextId: ctx.id, lmsUserId: lu!.id, institutionId: p.institutionId, ltiRoles: [], enaraRole: 'teacher', status: 'active', source: 'launch' });
  }
  const su = await M.LmsUser.create({ platformId: p.id, institutionId: p.institutionId, externalUserId: `s${seq}`, enaraUserId: ids.studentA, email: 'kid@school-a.enara.app', givenName: 'Zeynab' });
  await M.LmsEnrollment.create({ contextId: ctx.id, lmsUserId: su.id, institutionId: p.institutionId, ltiRoles: [], enaraRole: 'student', status: 'invited', source: 'nrps' });
  if (optIn) await M.LmsEmailOptIn.updateOne({ enaraUserId: ids.teacherA }, { $set: { institutionId: A, state: 'in', email: TEACHER_EMAIL, decidedAt: new Date() } }, { upsert: true });
  return ctx;
}

// ------------------------------------------------------------ gates

describe('gates', () => {
  it('nothing is sent or recorded unless LMS_EMAILS_ENABLED, REMINDERS_ENABLED and RESEND_API_KEY are all set', async () => {
    for (const off of ['LMS_EMAILS_ENABLED', 'REMINDERS_ENABLED', 'RESEND_API_KEY'] as const) {
      setEnv({ ...ON, [off]: undefined });
      const p = await platform(A);
      await audit({ event: 'platform.approved', outcome: 'ok', institutionId: A, platformId: p.id });
      await settle();
      expect(L.lmsEmailsActive(), off).toBe(false);
      expect(await E.notifyConnectionActive(p), off).toMatchObject({ sent: 0, codes: ['lms_emails_off'] });
    }
    expect(sendMock).not.toHaveBeenCalled();
    expect(await logs()).toEqual([]);
    // The daily cron step is inert too.
    setEnv({ ...ON, LMS_EMAILS_ENABLED: undefined });
    expect(await D.runLmsEmailDaily()).toMatchObject({ skipped: 'lms_emails_off' });
  });

  it('staging interlock: on a staging deployment (ENARA_STAGING, e.g. lms-test) LMS emails stay off without a test inbox', async () => {
    const { getConfig } = await import('../../src/config/env');
    (getConfig() as { stagingMode: boolean }).stagingMode = true;
    expect(L.lmsEmailsActive()).toBe(false);
    expect(await E.notifyConnectionActive(await platform(A))).toMatchObject({ sent: 0, codes: ['lms_emails_off'] });
    setEnv({ ...ON, REMINDER_TEST_RECIPIENT: 'owner-inbox@qa.enara.app' });
    (getConfig() as { stagingMode: boolean }).stagingMode = true;
    expect(L.lmsEmailsActive()).toBe(true);
    resetConfigForTests();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('LMS_EMAIL_CAPTURE (E2E stack): rendered and recorded as captured without any RESEND_API_KEY; Resend is never called', async () => {
    setEnv({ ...ON, RESEND_API_KEY: undefined, LMS_EMAIL_CAPTURE: 'true' });
    const p = await platform(A);
    expect(await E.notifyConnectionActive(p)).toMatchObject({ captured: 1, sent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
    const [row] = await logs('lms-connection-active');
    expect(row).toMatchObject({ status: 'captured', lang: 'ar', recipientRef: `user:${ids.adminA}`, redirected: false });
    expect(row.subject).toContain('Moodle');
    expect(JSON.stringify(row)).not.toContain('@'); // the log keeps no address
  });

  it('parent emails are not wired and stay off (PARENT_EMAILS_ENABLED unset)', async () => {
    const { sendParentTemplate } = await import('../../src/email/sendParentTemplate');
    expect(await sendParentTemplate('parent-link-ended-en', ADMIN_B, { NAME: 'x', CHILD_NAME: 'y', SCHOOL_NAME: 'z' })).toMatchObject({ ok: false, code: 'parent_emails_off' });
  });
});

// ------------------------------------------------------------ connections

describe('connection events (immediate)', () => {
  it('3 + 18: an ENARA admin registers a connection -> lms-connection-active in Arabic to the school admins (never a .test address) and lms-ops-school-connected in English to ops; once', async () => {
    const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({
      institutionId: A, vendor: 'moodle', issuer: 'https://moodle.nile.example', clientId: 'cx', authLoginUrl: 'https://moodle.nile.example/mod/lti/auth.php', keysetUrl: 'https://moodle.nile.example/mod/lti/certs.php', deploymentIds: ['1'],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    await settle();
    const admin = sentTo(ADMIN_A);
    expect(admin).toHaveLength(1);
    expect(admin[0].subject).toBe('تم ربط Moodle (moodle.nile.example) بإنارة');
    expect(admin[0].html).toContain('<html lang="ar" dir="rtl">');
    expect(admin[0].html).toContain('مرحبًا Mona');
    expect(admin[0].html).toContain(`${TOOL}/?page=lms&amp;platform=${r.body.platform.id}`);
    expect(admin[0].attachments.map((a) => a.contentId).sort()).toEqual(['enara-logo', 'enara-logo-white']);
    const ops = sentTo(OPS);
    expect(ops).toHaveLength(1);
    expect(ops[0].subject).toBe('[LMS] New school connected: Nile School (fake) (Moodle (moodle.nile.example))');
    expect(ops[0].html).toContain('an Enara administrator');
    expect(sent().some((s) => /\.test$/.test(s.to))).toBe(false);
    // Once: the same activation again sends nothing new.
    const p = (await M.LmsPlatform.findOne({ id: r.body.platform.id }).lean())!;
    expect(await E.notifyConnectionActive(p)).toMatchObject({ sent: 0, duplicate: 1 });
    expect(await E.notifyOpsSchoolConnected(p)).toMatchObject({ sent: 0, duplicate: 1 });
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('4a + 19 then 4b: a school admin connection waits (pending, ops asked), approval sends lms-connection-active (English school)', async () => {
    const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.adminB).send({
      vendor: 'moodle', issuer: 'https://moodle.thames.example', clientId: 'cy', authLoginUrl: 'https://moodle.thames.example/mod/lti/auth.php', keysetUrl: 'https://moodle.thames.example/mod/lti/certs.php', deploymentIds: ['2'],
    });
    expect(r.body.platform.status).toBe('pending');
    await settle();
    expect(sentTo(ADMIN_B).map((s) => s.subject)).toEqual(["We're reviewing your Moodle connection"]);
    expect(sentTo(ADMIN_B)[0].html).toContain('the connection for Moodle (moodle.thames.example)');
    expect(sentTo(OPS).map((s) => s.subject)).toEqual(['[LMS] Approval needed: Thames School (fake)']);
    expect(sentTo(OPS)[0].html).toContain('new connection added by a school admin');
    sendMock.mockClear();
    expect((await request(app).post(`/api/lms/platforms/${r.body.platform.id}/approve`).set('Authorization', auth.enara)).status).toBe(200);
    await settle();
    expect(sentTo(ADMIN_B).map((s) => s.subject)).toEqual(['Moodle (moodle.thames.example) is now connected to Enara']);
    expect(sentTo(OPS).map((s) => s.subject)).toEqual(['[LMS] New school connected: Thames School (fake) (Moodle (moodle.thames.example))']);
  });

  it('4c: Reject (ENARA admins only, a fixed reason) -> rejected status and lms-connection-rejected with the code-owned reason', async () => {
    const p = await platform(A, { status: 'pending', approvedAt: undefined });
    expect((await request(app).post(`/api/lms/platforms/${p.id}/reject`).set('Authorization', auth.adminA).send({ reason: 'values_mismatch' })).status).toBe(403);
    const bad = await request(app).post(`/api/lms/platforms/${p.id}/reject`).set('Authorization', auth.enara).send({ reason: 'because I said so' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post(`/api/lms/platforms/${p.id}/reject`).set('Authorization', auth.enara).send({ reason: 'values_mismatch' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.platform).toMatchObject({ status: 'rejected', rejectedReason: 'values_mismatch' });
    expect((await request(app).post(`/api/lms/platforms/${p.id}/reject`).set('Authorization', auth.enara).send({ reason: 'values_mismatch' })).status).toBe(409);
    await settle();
    const mail = sentTo(ADMIN_A);
    expect(mail.map((s) => s.subject)).toEqual(['لم تتم الموافقة على طلب ربط Moodle']);
    expect(mail[0].html).toContain('معرّف المنصة أو معرّف العميل لا يطابق موقع Moodle.');
    // Approving it later switches it on and clears the rejection.
    const again = await request(app).post(`/api/lms/platforms/${p.id}/approve`).set('Authorization', auth.enara);
    expect(again.body.platform.status).toBe('active');
    expect(again.body.platform.rejectedReason).toBeUndefined();
  });

  it('E3 + 6: a new pending deployment (school admin) and one auto-created at a launch; switched off -> lms-connection-switched-off', async () => {
    const p = await platform(A);
    const dep = await request(app).post(`/api/lms/platforms/${p.id}/deployments`).set('Authorization', auth.adminA).send({ deploymentId: 'D-77' });
    expect(dep.status).toBe(201);
    await settle();
    expect(sentTo(ADMIN_A)).toHaveLength(1);
    expect(sentTo(ADMIN_A)[0].html).toContain('رقم التثبيت <span dir="ltr" style="unicode-bidi:embed;">D-77</span>');
    expect(sentTo(OPS)[0].html).toContain('new deployment added by a school admin');
    // A launch that auto-created a pending deployment (oidc.ts audits it this way).
    await M.LmsDeployment.create({ platformId: p.id, deploymentId: 'AUTO-9', institutionId: A, status: 'pending' });
    await audit({ event: 'lti.launch', outcome: 'fail', institutionId: A, platformId: p.id, code: 'deployment_pending', refIds: { deploymentId: 'AUTO-9', autoCreated: true } });
    await settle();
    expect(sentTo(ADMIN_A)).toHaveLength(2);
    expect(sentTo(OPS).map((s) => s.html.includes('deployment created automatically at a launch'))).toEqual([false, true]);
    sendMock.mockClear();
    expect((await request(app).post(`/api/lms/platforms/${p.id}/disable`).set('Authorization', auth.adminA)).status).toBe(200);
    await settle();
    const off = sentTo(ADMIN_A);
    expect(off.map((s) => s.subject)).toEqual([`تم إيقاف ربط Moodle (${new URL(p.issuer).host}) في إنارة`]);
    expect(off[0].html).toContain('أحد مسؤولي المدرسة');
  });
});

// ------------------------------------------------------------ problems

describe('problems (immediate, thresholds)', () => {
  it('7: three key failures within 60 minutes -> one lms-key-problem; more failures the same day send nothing', async () => {
    const p = await platform(B);
    await audit({ event: 'lti.launch', outcome: 'fail', institutionId: B, platformId: p.id, code: 'unknown_kid' });
    await audit({ event: 'lti.launch', outcome: 'fail', institutionId: B, platformId: p.id, code: 'unknown_kid' });
    await settle();
    expect(sentTo(ADMIN_B)).toHaveLength(0);
    await audit({ event: 'grade.failed', outcome: 'fail', institutionId: B, platformId: p.id, code: 'token_http_401' });
    await settle();
    const mail = sentTo(ADMIN_B);
    expect(mail.map((s) => s.subject)).toEqual(["Action needed: Moodle and Enara can't verify each other"]);
    expect(mail[0].html).toContain('Moodle signed sign-ins with a key Enara doesn&#39;t recognise'); // escaped like every value
    for (let i = 0; i < 3; i++) await audit({ event: 'lti.launch', outcome: 'fail', institutionId: B, platformId: p.id, code: 'invalid_signature' });
    await settle();
    expect(sentTo(ADMIN_B)).toHaveLength(1);
  });

  it('20: >= 20 failures and >= 30 % of the school\'s LMS events in 60 minutes -> one lms-ops-error-spike (not again within 6 h)', async () => {
    const p = await platform(B);
    for (let i = 0; i < 10; i++) await M.LmsAuditLog.create({ event: 'lti.launch', outcome: 'ok', institutionId: B, platformId: p.id });
    for (let i = 0; i < 19; i++) await M.LmsAuditLog.create({ event: 'lti.launch', outcome: 'fail', institutionId: B, platformId: p.id, code: 'nonce_invalid' });
    await audit({ event: 'lti.launch', outcome: 'fail', institutionId: B, platformId: p.id, code: 'nonce_invalid' });
    await settle();
    const ops = sentTo(OPS);
    expect(ops.map((s) => s.subject)).toEqual(['[LMS] Error spike: Thames School (fake)']);
    expect(ops[0].html).toContain('nonce_invalid');
    E.resetLmsEmailThrottleForTests();
    await audit({ event: 'lti.launch', outcome: 'fail', institutionId: B, platformId: p.id, code: 'nonce_invalid' });
    await settle();
    expect(sentTo(OPS)).toHaveLength(1);
  });

  it('5: the connection check failed -> lms-connection-check-failed with the step\'s cause and fix; once per connection and cause per 24 h', async () => {
    const p = await platform(B);
    const at = new Date();
    expect(await E.notifyConnectionCheckFailed(p, { key: 'roster', code: 'nrps_not_allowed' }, at, 'moodle.thames.example')).toMatchObject({ sent: 1 });
    expect(await E.notifyConnectionCheckFailed(p, { key: 'roster', code: 'nrps_not_allowed' }, new Date(at.getTime() + 1000))).toBeNull();
    const mail = sentTo(ADMIN_B);
    expect(mail.map((s) => s.subject)).toEqual(['Action needed: check your Moodle connection']);
    expect(mail[0].html).toContain(`${p.id} · nrps_not_allowed`);
  });
});

// ------------------------------------------------------------ seats

describe('seats', () => {
  it('10a: 80 % and 90 % once each per seat limit; a new limit starts again', async () => {
    expect(await E.notifySeatsWarning(B, 79, 100)).toBeNull();
    expect(await E.notifySeatsWarning(B, 80, 100)).toMatchObject({ sent: 1 });
    expect(await E.notifySeatsWarning(B, 85, 100)).toBeNull();
    expect(await E.notifySeatsWarning(B, 90, 100)).toMatchObject({ sent: 1 });
    expect(await E.notifySeatsWarning(B, 95, 100)).toBeNull();
    expect(sentTo(ADMIN_B).map((s) => s.subject)).toEqual(['Thames School (fake) has used 80% of its Enara seats', 'Thames School (fake) has used 90% of its Enara seats']);
    expect(await E.notifySeatsWarning(B, 95, 110)).toMatchObject({ sent: 1 }); // a new limit: 86 % -> 80 % again
    expect(await E.notifySeatsWarning(B, 70, 110)).toBeNull(); // under 75 %: starts again
    expect(await E.notifySeatsWarning(B, 90, 110)).toMatchObject({ sent: 1 });
    expect(sentTo(ADMIN_B)).toHaveLength(4);
  });

  it('10b + E2 + E1 through the real seat check: over the limit (once a day), the billing flag (ops, once), the hard cap (once a day)', async () => {
    const { checkSeatForNewStudent } = await import('../../src/integrations/lms/core/seats');
    await M.LmsOrgSettings.create({ institutionId: A, seatLimit: 0 });
    expect(await checkSeatForNewStudent(A)).toMatchObject({ allowed: true, overLimit: true });
    expect(await checkSeatForNewStudent(A)).toMatchObject({ allowed: true, overLimit: true });
    await settle();
    expect(sentTo(ADMIN_A).map((s) => s.subject)).toEqual(['تجاوزت Nile School (fake) حدّ مقاعد إنارة']);
    expect(sentTo(OPS).map((s) => s.subject)).toEqual(['[LMS] Billing flag: Nile School (fake) is over its seat limit']);
    await M.LmsOrgSettings.updateOne({ institutionId: A }, { $set: { hardCap: true } });
    expect(await checkSeatForNewStudent(A)).toMatchObject({ allowed: false });
    expect(await checkSeatForNewStudent(A)).toMatchObject({ allowed: false });
    await settle();
    const capped = sentTo(ADMIN_A).filter((s) => s.subject.includes('مقاعد على إنارة'));
    expect(capped).toHaveLength(1);
    expect(capped[0].subject).toBe('لم يتبقَّ لدى Nile School (fake) مقاعد على إنارة');
  });
});

// ------------------------------------------------------------ teachers (D2)

describe('teacher opt-in (D2) and teacher emails', () => {
  it('asked once with the Moodle address pre-filled; yes sends lms-teacher-welcome once; no answer or no -> no teacher email', async () => {
    const p = await platform(A);
    await course(p, 'Grade 8 English (fake)', false);
    const ask = await request(app).get('/api/lms/email-optin').set('Authorization', auth.teacherA);
    expect(ask.body).toEqual({ state: 'ask', prefill: TEACHER_EMAIL });
    // Not for other roles; and off when LMS emails are off.
    expect((await request(app).get('/api/lms/email-optin').set('Authorization', auth.adminA)).body).toEqual({ state: 'off' });
    setEnv({ ...ON, LMS_EMAILS_ENABLED: undefined });
    expect((await request(app).get('/api/lms/email-optin').set('Authorization', auth.teacherA)).body).toEqual({ state: 'off' });
    setEnv(ON);
    expect((await request(app).post('/api/lms/email-optin').set('Authorization', auth.teacherA).send({ optIn: true, email: 'x@y.test' })).status).toBe(400);
    const yes = await request(app).post('/api/lms/email-optin').set('Authorization', auth.teacherA).send({ optIn: true, email: 'Ahmed.Real@School-A.enara.app' });
    expect(yes.body).toEqual({ state: 'in', email: 'ahmed.real@school-a.enara.app' });
    await settle();
    const welcome = sentTo('ahmed.real@school-a.enara.app');
    expect(welcome.map((s) => s.subject)).toEqual(['مقررك في Moodle جاهز على إنارة']);
    expect(welcome[0].html).toContain('Grade 8 English (fake)');
    expect(welcome[0].html).toContain('?page=class-assignments&amp;class=cls_');
    await request(app).post('/api/lms/email-optin').set('Authorization', auth.teacherA).send({ optIn: true, email: 'ahmed.real@school-a.enara.app' });
    await settle();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect((await request(app).get('/api/lms/email-optin').set('Authorization', auth.teacherA)).body).toEqual({ state: 'in', email: 'ahmed.real@school-a.enara.app' });
    // teacherA2 never answered: no row, never emailed; saying no keeps no address.
    const no = await request(app).post('/api/lms/email-optin').set('Authorization', auth.teacherA2).send({ optIn: false });
    expect(no.body).toEqual({ state: 'out', email: null });
    expect((await M.LmsEmailOptIn.findOne({ enaraUserId: ids.teacherA2 }).lean())?.email).toBeUndefined();
  });

  it('16 + 17 + 15: daily teacher digests go to opted-in teachers only, one per teacher, counts and course only (no student names)', async () => {
    const p = await platform(A);
    const c1 = await course(p, 'Grade 8 English (fake)');
    const c2 = await course(p, 'Grade 9 English (fake)');
    const l1 = await M.LmsResourceLink.create({ contextId: c1.id, institutionId: A, externalResourceLinkId: 'r1', enaraActivityId: 'asg1', presentation: 'iframe', lineItemGoneAt: new Date() });
    const l2 = await M.LmsResourceLink.create({ contextId: c2.id, institutionId: A, externalResourceLinkId: 'r2', enaraActivityId: 'asg2', presentation: 'iframe' });
    for (const [link, user] of [[l1, 'u1'], [l1, 'u2'], [l2, 'u3']] as const) await audit({ event: 'grade.lms_changed', outcome: 'warn', institutionId: A, platformId: p.id, refIds: { resourceLinkId: link.id, lmsUserId: user, attemptId: `att-${user}` } });
    await audit({ event: 'grade.kept_released', outcome: 'ok', institutionId: A, platformId: p.id, refIds: { resourceLinkId: l2.id, lmsUserId: 'u3', attemptId: 'att-9' } });
    const totals: Record<string, number> = {};
    const now = new Date();
    await D.gradeChangedDigest(now, totals);
    await D.newerAttemptDigest(now, totals);
    await D.activityDigest(now, totals, false);
    const mail = sentTo(TEACHER_EMAIL);
    expect(mail.map((s) => s.subject)).toEqual(['درجات عُدّلت في Moodle: اختر ما تعتمده', 'محاولات أحدث بانتظار مراجعتك', 'ربما حُذف نشاط في Moodle مرتبط بإنارة']);
    expect(mail[0].html).toContain('مقرران'); // 2 courses (Arabic dual)
    expect(mail[0].html).toMatch(/>3</); // CHANGED_COUNT
    expect(mail[2].html).toContain('Grade 8 English (fake)');
    for (const m of mail) expect(m.html).not.toContain('Zeynab');
    expect(sentTo('silent@school-a.enara.app')).toHaveLength(0);
    // A second run the same day: nothing new.
    sendMock.mockClear();
    await D.gradeChangedDigest(now, totals);
    await D.newerAttemptDigest(now, totals);
    await D.activityDigest(now, totals, false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('14 (Monday): students not started, per teacher; a course at most 3 weeks in a row, then only when its count rises', async () => {
    const p = await platform(A);
    const c = await course(p);
    const weeks = [0, 7, 14, 21, 28].map((d) => new Date(Date.now() + d * 86_400_000));
    const sentWeeks: number[] = [];
    for (const [i, now] of weeks.entries()) {
      if (i === 4) await M.LmsEnrollment.create({ contextId: c.id, lmsUserId: `extra${seq}`, institutionId: A, ltiRoles: [], enaraRole: 'student', status: 'invited', source: 'nrps' });
      sendMock.mockClear();
      await D.notStartedDigest(now, {});
      if (sentTo(TEACHER_EMAIL).length) sentWeeks.push(i);
    }
    expect(sentWeeks).toEqual([0, 1, 2, 4]);
    expect(D.isCairoMonday(new Date('2026-11-16T10:00:00Z'))).toBe(true);
    expect(D.isCairoMonday(new Date('2026-11-18T10:00:00Z'))).toBe(false);
  });
});

// ------------------------------------------------------------ admin digests

describe('admin and ops digests (daily cron)', () => {
  it('8 / 9 / E6 / 2a / 2b / 19 / E4 / 11 / E5: grouped per connection, once per day; the cron route runs them', async () => {
    const p = await platform(B);
    const c = await course(p, 'Year 7 English (fake)', false);
    for (const jobId of ['j1', 'j2']) {
      await M.LmsGradeSyncJob.create({ id: jobId, idempotencyKey: jobId, institutionId: B, platformId: p.id, contextId: c.id, lineItemRef: 'link:x', lmsUserId: 'u', enaraAttemptId: `a-${jobId}`, scoreMaximum: 1, scoreTimestamp: new Date(), status: 'dead', attempts: 5 } as never);
      await audit({ event: 'grade.failed', outcome: 'fail', institutionId: B, platformId: p.id, code: 'score_http_403', refIds: { jobId, dead: true } });
    }
    await audit({ event: 'grade.failed', outcome: 'fail', institutionId: B, platformId: p.id, code: 'lms_value_differs', refIds: { jobId: 'held', dead: true } });
    await audit({ event: 'roster.sync', outcome: 'fail', institutionId: B, platformId: p.id, code: 'nrps_not_allowed', refIds: { contextId: c.id, trigger: 'nightly' } });
    await audit({ event: 'roster.sync', outcome: 'fail', institutionId: B, platformId: p.id, code: 'nrps_not_allowed', refIds: { contextId: c.id, trigger: 'manual' } });
    await audit({ event: 'roster.removals_skipped', outcome: 'warn', institutionId: B, platformId: p.id, code: 'empty_roster', refIds: { contextId: c.id, trigger: 'nightly' } });
    // An onboarding invite that expires in 2 days, another expired yesterday.
    const { Institution } = await import('../../src/models/Institution');
    await Institution.updateOne({ id: B }, { $set: { contactEmail: ADMIN_B, contactName: 'Jane Head' } });
    for (const [days, oid] of [[2, 'lmso_soon'], [-1, 'lmso_gone']] as const) {
      const code = await M.LmsRegistrationCode.create({ institutionId: B, codeHash: `h${oid}`, createdBy: ids.enara, createdByRole: 'enara-admin', status: 'unused', expiresAt: new Date(Date.now() + days * 86_400_000) } as never);
      await M.LmsOnboarding.create({ id: oid, institutionId: oid === 'lmso_soon' ? B : `${B}-x`, createdBy: ids.enara, registrationLinkId: code.id, inviteSentAt: new Date() });
    }
    await Institution.create({ id: `${B}-x`, name: 'Second Fake School', country: 'GB', contactEmail: 'second@second.enara.app', contactName: 'Sam' });
    // A connection pending for 2 days (ops reminder) and a 'next' signing key older than 24 h.
    await platform(B, { status: 'pending', createdAt: new Date(Date.now() - 2 * 86_400_000) });
    await M.LmsToolKey.deleteMany({});
    await M.LmsToolKey.create({ kid: 'kid-active', alg: 'RS256', privateKeyEnc: 'x', publicJwk: {}, status: 'active', createdAt: new Date('2026-08-02'), activatedAt: new Date('2026-08-02') });
    await M.LmsToolKey.create({ kid: 'kid-next', alg: 'RS256', privateKeyEnc: 'x', publicJwk: {}, status: 'next', createdAt: new Date(Date.now() - 2 * 86_400_000) });
    await audit({ event: 'lti.launch', outcome: 'ok', institutionId: B, platformId: p.id });
    sendMock.mockClear();

    process.env.CRON_SECRET = 'cron-secret-for-tests-0123456789';
    resetConfigForTests();
    const run = await request(app).get('/api/cron/daily').set('Authorization', 'Bearer cron-secret-for-tests-0123456789');
    expect(run.body.lmsEmails, JSON.stringify(run.body)).toMatchObject({ emails: expect.any(Object) });
    const subjects = sent().map((s) => `${s.to} | ${s.subject}`);
    expect(subjects).toEqual(expect.arrayContaining([
      `${ADMIN_B} | Thames School (fake): grades not sent to Moodle (${L.formatDay(new Date(), 'en', 'Europe/London')})`,
      `${ADMIN_B} | Thames School (fake): class lists not updated from Moodle`,
      `${ADMIN_B} | Class list not fully updated for Year 7 English (fake)`,
      `${ADMIN_B} | Reminder: your Enara connection link expires on ${L.formatDay(new Date(Date.now() + 2 * 86_400_000), 'en', 'Europe/London')}`,
      'second@second.enara.app | Your Enara connection link has expired',
      `${OPS} | [LMS] Approval needed: Thames School (fake)`,
      `${OPS} | [LMS] Enara signing key: action due`,
      `${OPS} | [LMS] Daily summary ${L.formatDay(new Date(), 'en')}`,
    ]));
    const digest = sentTo(ADMIN_B).find((s) => s.subject.includes('grades not sent'))!;
    expect(digest.html).toMatch(/>2</); // FAILED_COUNT 2 (the held LMS_VALUE_DIFFERS job is not counted)
    expect(digest.html).toContain('Moodle refused access');
    const opsDigest = sentTo(OPS).find((s) => s.subject.startsWith('[LMS] Daily summary'))!;
    expect(opsDigest.html).toContain('Email safety ceiling (all emails, per day)');
    expect(opsDigest.html).toMatch(/per day\)<\/td><td[^>]*>none</); // no ceiling outside staging unless EMAIL_DAILY_CEILING is set
    expect(sentTo(OPS).find((s) => s.subject.includes('signing key'))!.html).toContain('kid-next');
    expect(sentTo(TEACHER_EMAIL)).toHaveLength(0); // nobody opted in here
    // Again the same day: nothing new.
    sendMock.mockClear();
    await request(app).get('/api/cron/daily').set('Authorization', 'Bearer cron-secret-for-tests-0123456789');
    expect(sendMock).not.toHaveBeenCalled();
    // 11 (Monday): adoption, one per active connection with activity.
    await D.adoptionWeekly(new Date(), {});
    expect(sentTo(ADMIN_B).map((s) => s.subject)).toEqual(['Thames School (fake): Enara in Moodle this week']);
    delete process.env.CRON_SECRET;
  });
});

// ------------------------------------------------------------ lms-test: redirect, prefix, safety ceiling

describe('lms-test: test inbox redirect, subject prefix and the daily safety ceiling', () => {
  const INBOX = 'owner-inbox@qa.enara.app';
  const staging = async (vars: Record<string, string | undefined>) => {
    setEnv(vars);
    const { getConfig } = await import('../../src/config/env');
    (getConfig() as { stagingMode: boolean }).stagingMode = true; // as ENARA_STAGING=true on lms-test
  };

  it('no 20-a-day cap any more: every email is sent when its event happens (25 in a day), one copy each to the test inbox, "Test copy" line, "[lms-test] " prefix', async () => {
    await staging({ ...ON, REMINDER_TEST_RECIPIENT: INBOX, EMAIL_SUBJECT_PREFIX: '[lms-test]' });
    await mkUser(`adminB2-${seq}`, `deputy${seq}@school-b.enara.app`, 'admin', B, 'Deputy Head');
    const ps = [];
    for (let i = 0; i < 25; i++) ps.push(await platform(B));
    for (const p of ps) expect(await E.notifyConnectionActive(p)).toMatchObject({ sent: 1, held: 0 });
    expect(sent()).toHaveLength(25);
    expect(sent().every((s) => s.to === INBOX)).toBe(true);
    expect(sent()[0].subject).toBe(`[lms-test] Moodle (${new URL(ps[0].issuer).host}) is now connected to Enara`);
    expect(sent()[0].html).toContain(`Test copy: this email was for ${ADMIN_B}, deputy`);
    const rows = await logs('lms-connection-active');
    expect(rows.every((r) => r.status === 'sent' && r.recipientRef === 'redirect' && r.redirected && r.recipientCount === 2)).toBe(true);
    expect(await L.ceilingCount(L.cairoDay())).toBe(25); // of the default 300
    expect((await import('../../src/email/testInbox')).emailPolicy().ceiling).toBe(300);
  });

  it('the safety ceiling (EMAIL_DAILY_CEILING): above it held (recorded, not sent), ONE alert email (exempt) to the test inbox, one critical alert + audit; the ops digest reports it', async () => {
    await staging({ ...ON, REMINDER_TEST_RECIPIENT: INBOX, EMAIL_SUBJECT_PREFIX: '[lms-test]', EMAIL_DAILY_CEILING: '2' });
    const ps = [await platform(B), await platform(B), await platform(B), await platform(B)];
    expect(await E.notifyConnectionActive(ps[0])).toMatchObject({ sent: 1 });
    expect(await E.notifyConnectionActive(ps[1])).toMatchObject({ sent: 1 });
    expect(await E.notifyConnectionActive(ps[2])).toMatchObject({ sent: 0, held: 1 });
    expect(await E.notifyConnectionActive(ps[2])).toMatchObject({ sent: 0, duplicate: 1 }); // held stays held
    expect(await E.notifyConnectionActive(ps[3])).toMatchObject({ sent: 0, held: 1 });
    // 2 LMS emails + exactly one alert email, which is exempt from the ceiling.
    expect(sent().map((s) => s.subject)).toEqual([expect.stringMatching(/^\[lms-test\] Moodle/), expect.stringMatching(/^\[lms-test\] Moodle/), '[lms-test] Email safety ceiling hit: 1 held']);
    const alert = sent()[2];
    expect(alert.to).toBe(INBOX);
    expect(alert.html).toContain(`Test copy: this email was for ${OPS}`);
    expect(alert.html).toContain('The email safety ceiling (2 emails per Cairo day, all send paths)');
    expect(await L.ceilingCount(L.cairoDay())).toBe(2);
    const { AlertEvent } = await import('../../src/models/AlertEvent');
    const { AuditEvent } = await import('../../src/models/AuditEvent');
    expect(await AlertEvent.countDocuments({ kind: 'email_daily_ceiling_hit', severity: 'critical' })).toBe(1);
    expect(await AuditEvent.countDocuments({ action: 'email_daily_ceiling_hit' })).toBe(1);
    const day = L.cairoDay();
    expect(await L.heldToday(day)).toEqual({ total: 2, byTemplate: [{ template: 'lms-connection-active', n: 2 }] });
    expect((await logs('lms-connection-active')).map((r) => [r.status, r.code ?? null])).toEqual([['sent', null], ['sent', null], ['held', 'daily_ceiling'], ['held', 'daily_ceiling']]);
    // With room again (the ceiling raised by hand), the ops digest states what was held.
    await staging({ ...ON, REMINDER_TEST_RECIPIENT: INBOX, EMAIL_SUBJECT_PREFIX: '[lms-test]', EMAIL_DAILY_CEILING: '10' });
    await platform(B, { status: 'pending', createdAt: new Date(Date.now() - 3 * 86_400_000) }); // a non-zero row
    await D.opsDailyDigest(new Date(), {});
    const digest = sent().find((s) => s.subject.startsWith('[lms-test] [LMS] Daily summary'))!;
    expect(digest.to).toBe(INBOX);
    expect(digest.html).toContain('Email safety ceiling (all emails, per day)');
    expect(digest.html).toContain('ceiling hit: 2 held (lms-connection-active 2)');
    expect(sent().filter((s) => s.subject.includes('Email safety ceiling hit'))).toHaveLength(1); // still one alert
  });

  it('the ceiling is atomic under parallel sends', async () => {
    await staging({ ...ON, REMINDER_TEST_RECIPIENT: INBOX, EMAIL_DAILY_CEILING: '3' });
    const ps = await Promise.all(Array.from({ length: 8 }, () => platform(B)));
    const results = await Promise.all(ps.map((p) => E.notifyConnectionActive(p)));
    expect(results.reduce((a, r) => a + (r?.sent ?? 0), 0)).toBe(3);
    expect(results.reduce((a, r) => a + (r?.held ?? 0), 0)).toBe(5);
    expect(sent().filter((s) => !s.subject.includes('Email safety ceiling hit'))).toHaveLength(3);
    expect(sent().filter((s) => s.subject.includes('Email safety ceiling hit'))).toHaveLength(1);
  });

  it('not staging, no EMAIL_DAILY_CEILING: no ceiling, no prefix unless EMAIL_SUBJECT_PREFIX is set, reserved addresses (.example) never emailed', async () => {
    setEnv(ON);
    const { User } = await import('../../src/models/User');
    await User.create({ email: `a${seq}@school.example`, password: 'x', role: 'admin', name: 'Fake', institutionId: B });
    const ps = [await platform(B), await platform(B)];
    for (const p of ps) expect(await E.notifyConnectionActive(p)).toMatchObject({ sent: 2 });
    expect(sent().map((s) => s.to).sort()).toEqual([ADMIN_B, ADMIN_B, expect.stringMatching(/^deputy/), expect.stringMatching(/^deputy/)].sort());
    expect(sent().every((s) => !s.subject.startsWith('['))).toBe(true);
    expect(sent().every((s) => !s.html.includes('Test copy'))).toBe(true);
    expect(await L.ceilingCount(L.cairoDay())).toBe(0);
  });
});
