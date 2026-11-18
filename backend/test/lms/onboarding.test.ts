import { randomBytes } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform, ROLE } from './mockPlatform';

// Resend is mocked: nothing is ever sent (the "Send email" tests).
const sendMock = vi.fn();
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })) }));

// LMS step 2, self-serve school onboarding: "New school" (permissions,
// defaults incl. emailLanguage, the invitation, the active link), the invite
// text in English and Arabic, "New link", "Send email" (only when LMS emails
// are on), the automatic connection check (every step ok / fail / waiting,
// Moodle unreachable, the pasted-public-key fallback), the nightly re-check
// selection, the status page (permissions, school isolation, the hand-ticked
// Moodle settings and their audit) and the "Elapsed since invite" timer.
// A local mock Moodle on 127.0.0.1; no other network.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const ENV_KEYS = [
  'LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_DEEP_LINKING_ENABLED', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK',
  'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL', 'LMS_EMAILS_ENABLED', 'REMINDERS_ENABLED', 'RESEND_API_KEY', 'APP_URL', 'REMINDER_TEST_RECIPIENT',
];
// Background grade pushes off (drain triggers 'cron' only), so nothing runs behind the tests' back.
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, LMS_DEEP_LINKING_ENABLED: 'true', APP_URL: TOOL, LMS_DRAIN_TRIGGERS: 'cron' };

function setEnv(vars: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'onb-school-a';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let moodle: MockPlatform;
const auth: Record<string, string> = {};
const userIds: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');
let settle: () => Promise<void>;

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

async function mkUser(key: string, role: string, institutionId?: string) {
  const { User } = await import('../../src/models/User');
  const { signAccessToken } = await import('../../src/auth/jwt');
  await User.deleteOne({ email: `${key}@staff.test` });
  const u = await User.create({ email: `${key}@staff.test`, password: 'x', role, name: key, institutionId });
  userIds[key] = u._id.toString();
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
  await Institution.create({ id: A, name: 'School A' });
  await mkUser('enara', 'enara-admin');
  await mkUser('adminA', 'admin', A);
  await mkUser('teacherA', 'teacher', A);
  moodle = (await new MockPlatform('', '').start()).adoptServiceBaseAsIssuer();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  settle = (await import('../../src/integrations/lms/core/drain')).settleLmsBackgroundForTests;
  app = await makeApp();
}, 120_000);

afterAll(async () => {
  await settle?.().catch(() => undefined);
  setEnv({});
  await moodle?.stop();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await settle();
  setEnv(ON);
  sendMock.mockReset();
  (await import('../../src/email/sendTemplate')).resetEmailClientForTests();
  moodle.resetRegistration();
  moodle.resetAgs();
  moodle.jwksStatus = 200;
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => undefined);
  for (const model of M.ALL_LMS_MODELS) {
    if (model === M.LmsToolKey) continue;
    await (model as unknown as { deleteMany(f: object): Promise<unknown> }).deleteMany({});
  }
  const { Institution } = await import('../../src/models/Institution');
  await Institution.deleteMany({ id: { $ne: A } });
  const { Invitation } = await import('../../src/models/AccountToken');
  await Invitation.deleteMany({});
  const { User } = await import('../../src/models/User');
  await User.deleteMany({ email: { $not: /@staff\.test$/ } });
});

// ------------------------------------------------------------ helpers

const SCHOOL = {
  name: 'Test School C (fake)',
  country: 'EG',
  schoolAdminName: 'Mona Adel',
  schoolAdminEmail: 'head@school-c.enara.app',
  moodleAdminEmail: 'moodle-it@school-c.enara.app',
};

async function newSchool(over: Record<string, unknown> = {}) {
  const r = await request(app).post('/api/lms/onboarding/schools').set('Authorization', auth.enara).send({ ...SCHOOL, ...over });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as {
    institution: { id: string; name: string; country: string; timeZone: string; emailLanguage: 'ar' | 'en'; features: string };
    onboarding: { id: string };
    invitation: { id: string; expiresAt: string };
    inviteLink: string;
    registrationLink: { id: string; status: string; createdByRole: string; expiresAt: string };
    url: string;
    connectionWillBe: string;
    invite: { en: string; ar: string };
    emailAvailable: boolean;
  };
}

function regToken() {
  return `regtok-${randomBytes(24).toString('base64url')}`;
}

/** What Moodle does after the admin pastes the URL. */
async function register(url: string) {
  const token = regToken();
  moodle.expectedRegistrationToken = token;
  const r = await request(app).get(new URL(url).pathname).query({ openid_configuration: moodle.openidConfigurationUrl, registration_token: token });
  expect(r.status, r.text).toBe(200);
  await settle();
  const p = await M.LmsPlatform.findOne({}).sort({ createdAt: -1 }).lean();
  const d = await M.LmsDeployment.findOne({ platformId: p!.id }).lean();
  return { platform: p!, deploymentId: d!.deploymentId };
}

/** A launch from the mock Moodle for the connection. */
async function launch(clientId: string, deploymentId: string, sub: string, roles = [ROLE.learner], extra: Record<string, unknown> = {}) {
  moodle.clientId = clientId;
  moodle.deploymentId = deploymentId;
  const lr = await request(app).post('/lti/login').type('form').send({ iss: moodle.issuer, login_hint: 'h', target_link_uri: `${TOOL}/lti/launch`, client_id: clientId, lti_deployment_id: deploymentId });
  expect(lr.status, lr.text).toBe(302);
  const loc = new URL(lr.headers.location);
  const cookie = String(([] as string[]).concat(lr.headers['set-cookie'] ?? [])[0]).split(';')[0];
  const idToken = await moodle.sign(moodle.claims(loc.searchParams.get('nonce')!, TOOL, { sub, 'lti:roles': roles, 'lti:context': { id: 'course-101', title: 'Enara Course' }, ...extra }));
  const r = await request(app).post('/lti/launch').type('form').set('Cookie', cookie).send({ id_token: idToken, state: loc.searchParams.get('state')! });
  return r;
}

async function launchOk(clientId: string, deploymentId: string, sub: string, roles = [ROLE.learner], extra: Record<string, unknown> = {}) {
  const r = await launch(clientId, deploymentId, sub, roles, extra);
  expect(r.status, r.text).toBe(303);
  await settle();
  return r;
}

async function status(institutionId: string, who = 'enara') {
  const r = await request(app).get(`/api/lms/onboarding/${institutionId}/status`).set('Authorization', auth[who]);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
}

async function runCheck(platformId: string) {
  const { runConnectionCheck } = await import('../../src/integrations/lms/core/connectionCheck');
  return (await runConnectionCheck(platformId, { trigger: 'manual', actor: userIds.enara }))!;
}

const step = (view: { steps: { key: string; status: string; code: string; help: { en: { what: string; fix: string }; ar: { what: string; fix: string } } }[] }, key: string) =>
  view.steps.find((s) => s.key === key)!;

/** A port nothing listens on. */
async function closedPort(): Promise<number> {
  const s = http.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

// ------------------------------------------------------------ New school

describe('New school (ENARA admins)', () => {
  it('creates the school (defaults: Africa/Cairo, Arabic emails for Egypt, all features), the admin invitation and an active one-URL link, returned once', async () => {
    const out = await newSchool({ seatLimit: 120 });
    expect(out.institution).toMatchObject({ name: SCHOOL.name, country: 'EG', timeZone: 'Africa/Cairo', emailLanguage: 'ar', features: 'all' });
    const { Institution } = await import('../../src/models/Institution');
    const school = await Institution.findOne({ id: out.institution.id }).lean();
    expect(school).toMatchObject({ name: SCHOOL.name, country: 'EG', timeZone: 'Africa/Cairo', emailLanguage: 'ar', contactName: SCHOOL.schoolAdminName, contactEmail: SCHOOL.schoolAdminEmail, createdBy: userIds.enara });
    const { ALL_FLAGS } = await import('../../src/services/featureFlags');
    const raw = school!.features as unknown as Map<string, boolean> | Record<string, boolean>;
    const features = raw instanceof Map ? Object.fromEntries(raw) : raw;
    for (const f of ALL_FLAGS) expect(features[f], f).toBe(true);

    // The existing invitation flow: a pending school-admin invitation (link returned once, hash stored).
    const { Invitation } = await import('../../src/models/AccountToken');
    const inv = await Invitation.findOne({ id: out.invitation.id }).lean();
    expect(inv).toMatchObject({ institutionId: out.institution.id, email: SCHOOL.schoolAdminEmail, role: 'admin', status: 'pending', invitedBy: userIds.enara });
    expect(out.inviteLink).toMatch(new RegExp(`^${TOOL}/accept-invitation\\?token=`));
    expect(JSON.stringify(inv)).not.toContain(decodeURIComponent(out.inviteLink.split('token=')[1]));

    // The Phase 1b link, made by the ENARA admin: the connection will be active.
    expect(out.connectionWillBe).toBe('active');
    expect(out.registrationLink).toMatchObject({ status: 'unused', createdByRole: 'enara-admin' });
    const code = new URL(out.url).pathname.split('/').pop()!;
    expect(out.url).toBe(`${TOOL}/lti/register/${code}`);
    const link = await M.LmsRegistrationCode.findOne({ id: out.registrationLink.id }).lean();
    expect(link).toMatchObject({ institutionId: out.institution.id, createdBy: userIds.enara, onboardingId: out.onboarding.id });
    expect(JSON.stringify(link)).not.toContain(code);
    const onb = await M.LmsOnboarding.findOne({ id: out.onboarding.id }).lean();
    expect(onb).toMatchObject({ institutionId: out.institution.id, createdBy: userIds.enara, schoolAdminInvitationId: out.invitation.id, registrationLinkId: link!.id, moodleAdminEmail: SCHOOL.moodleAdminEmail });

    // Seat limit; emails off (lms-test) so nothing was sent.
    expect((await M.LmsOrgSettings.findOne({ institutionId: out.institution.id }).lean())?.seatLimit).toBe(120);
    expect(out.emailAvailable).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();

    // The link list (Phase 1b API) never shows the code; audit rows carry IDs only.
    const list = await request(app).get(`/api/lms/registration-links?institutionId=${out.institution.id}`).set('Authorization', auth.enara);
    expect(JSON.stringify(list.body)).not.toContain(code);
    const audit = await M.LmsAuditLog.find({ institutionId: out.institution.id }).lean();
    expect(audit.map((a) => a.event)).toEqual(expect.arrayContaining(['onboarding.school_created', 'registration.link_created', 'seats.settings']));
    const text = JSON.stringify(audit);
    for (const secret of [code, SCHOOL.schoolAdminEmail, SCHOOL.moodleAdminEmail, SCHOOL.schoolAdminName]) expect(text).not.toContain(secret);
  });

  it('emailLanguage: Arabic by default for Egypt, English elsewhere, the form choice wins; no features with "none"; validation', async () => {
    const sa = await newSchool({ country: 'SA', schoolAdminEmail: 'a@sa-school.enara.app', timeZone: 'Asia/Riyadh', features: 'none' });
    expect(sa.institution).toMatchObject({ emailLanguage: 'en', timeZone: 'Asia/Riyadh', features: 'none' });
    const { Institution } = await import('../../src/models/Institution');
    expect((await Institution.findOne({ id: sa.institution.id }).lean())?.features).toBeUndefined();
    const egEn = await newSchool({ emailLanguage: 'en', schoolAdminEmail: 'b@eg-school.enara.app', country: 'eg' });
    expect(egEn.institution).toMatchObject({ emailLanguage: 'en', country: 'EG' });

    const bad = async (body: Record<string, unknown>, status = 400) => {
      const r = await request(app).post('/api/lms/onboarding/schools').set('Authorization', auth.enara).send({ ...SCHOOL, schoolAdminEmail: 'c@x-school.enara.app', ...body });
      expect(r.status, JSON.stringify(body)).toBe(status);
      return r;
    };
    await bad({ country: 'Egypt' });
    await bad({ timeZone: 'Mars/Olympus' });
    await bad({ emailLanguage: 'fr' });
    await bad({ seatLimit: -1 });
    await bad({ seatLimit: '10' });
    await bad({ name: '' });
    await bad({ schoolAdminEmail: 'not-an-email' });
    await bad({ moodleAdminEmail: 'nope' });
    await bad({ features: 'some' });
    // The school admin's address already has an account: nothing is created.
    const before = await Institution.countDocuments({});
    await bad({ schoolAdminEmail: 'adminA@staff.test' }, 409);
    expect(await Institution.countDocuments({})).toBe(before);
  });

  it('only ENARA admins: school admins and teachers 403, signed out 401, LMS off 404', async () => {
    expect((await request(app).post('/api/lms/onboarding/schools').set('Authorization', auth.adminA).send(SCHOOL)).status).toBe(403);
    expect((await request(app).post('/api/lms/onboarding/schools').set('Authorization', auth.teacherA).send(SCHOOL)).status).toBe(403);
    expect((await request(app).post('/api/lms/onboarding/schools').send(SCHOOL)).status).toBe(401);
    setEnv({});
    const off = await makeApp();
    expect((await request(off).post('/api/lms/onboarding/schools').set('Authorization', auth.enara).send(SCHOOL)).status).toBe(404);
    expect((await request(off).get(`/api/lms/onboarding/${A}/status`).set('Authorization', auth.enara)).status).toBe(404);
    const { Institution } = await import('../../src/models/Institution');
    expect(await Institution.countDocuments({ name: SCHOOL.name })).toBe(0);
  });
});

// ------------------------------------------------------------ the invite

describe('the invite', () => {
  it('has the school-specific link, its expiry in school time and the 5-step guide, in English and Arabic', async () => {
    const out = await newSchool();
    const { en, ar } = out.invite;
    for (const t of [en, ar]) {
      expect(t).toContain(out.url);
      expect(t).toContain(SCHOOL.name);
      for (const n of ['1.', '2.', '3.', '4.', '5.']) expect(t).toContain(`\n${n} `);
      for (const ui of ['Tool URL', 'Add LTI Advantage', 'Register as a new external tool', 'Activate', 'Accept grades from the tool', 'Always', 'Show in activity chooser and as a preconfigured tool', 'Restrict to category', 'Select content']) expect(t, ui).toContain(ui);
    }
    expect(en).toContain('expires on');
    expect(en).toMatch(/\(Cairo time\)/);
    expect(en).toContain('Never enrol parents in Moodle courses');
    expect(en).toContain('no fixed IP');
    expect(ar).toMatch(/[؀-ۿ]/);
    expect(ar).toContain('توقيت القاهرة');
    expect(ar).toContain('لا تسجّل أولياء الأمور');
    expect(ar).not.toMatch(/[٠-٩]/);
    // The expiry is the link's (7 days), in the school's time zone.
    const { formatSchoolDateTime } = await import('../../src/integrations/lms/core/dueDate');
    expect(en).toContain(formatSchoolDateTime(new Date(out.registrationLink.expiresAt), 'Africa/Cairo', 'en'));
    expect(ar).toContain(formatSchoolDateTime(new Date(out.registrationLink.expiresAt), 'Africa/Cairo', 'ar'));
  });

  it('New link cancels the old unused link; school admins of the school may make one (pre-approved until connected); others 404/403', async () => {
    const out = await newSchool();
    const C = out.institution.id;
    const r = await request(app).post(`/api/lms/onboarding/${C}/new-link`).set('Authorization', auth.enara).send({});
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.cancelledLinkIds).toEqual([out.registrationLink.id]);
    expect((await M.LmsRegistrationCode.findOne({ id: out.registrationLink.id }).lean())?.status).toBe('revoked');
    expect(r.body).toMatchObject({ connectionWillBe: 'active', link: { status: 'unused', createdByRole: 'enara-admin' } });
    expect(r.body.invite.en).toContain(r.body.url);
    expect(r.body.invite.ar).toContain(r.body.url);
    // The old link no longer registers.
    const old = await request(app).get(new URL(out.url).pathname).query({ openid_configuration: moodle.openidConfigurationUrl, registration_token: regToken() });
    expect(old.status).toBe(404);

    // The school's own admin (after accepting the invitation).
    await mkUser('adminC', 'admin', C);
    await mkUser('teacherC', 'teacher', C);
    const own = await request(app).post(`/api/lms/onboarding/${C}/new-link`).set('Authorization', auth.adminC).send({});
    expect(own.status).toBe(201);
    expect(own.body).toMatchObject({ connectionWillBe: 'active', link: { createdByRole: 'admin' }, cancelledLinkIds: [r.body.link.id] });
    expect((await M.LmsRegistrationCode.findOne({ id: own.body.link.id }).lean())?.preApprovedBy).toBe(userIds.enara);
    expect((await request(app).post(`/api/lms/onboarding/${C}/new-link`).set('Authorization', auth.adminA).send({})).status).toBe(404);
    expect((await request(app).post(`/api/lms/onboarding/${C}/new-link`).set('Authorization', auth.teacherC).send({})).status).toBe(403);
    // School A was not onboarded: 404.
    expect((await request(app).post(`/api/lms/onboarding/${A}/new-link`).set('Authorization', auth.adminA).send({})).status).toBe(404);

    // The school admin's pre-approved link registers an ACTIVE connection, approved by the ENARA admin.
    const { platform } = await register(own.body.url);
    expect(platform).toMatchObject({ institutionId: C, status: 'active', approvedBy: userIds.enara, createdBy: userIds.adminC });
    // Once connected, a school admin's new link follows R1 again (pending).
    const later = await request(app).post(`/api/lms/onboarding/${C}/new-link`).set('Authorization', auth.adminC).send({});
    expect(later.body.connectionWillBe).toBe('pending');
  });

  it('Send email: refused while LMS emails are off; with emails on, lms-invite-connect in the school language, no link code, starts the timer', async () => {
    const out = await newSchool();
    const C = out.institution.id;
    const off = await request(app).post(`/api/lms/onboarding/${C}/send-email`).set('Authorization', auth.enara).send({});
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe('LMS_EMAILS_OFF');
    expect((await status(C)).emailAvailable).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();

    setEnv({ ...ON, LMS_EMAILS_ENABLED: 'true', REMINDERS_ENABLED: 'true', RESEND_API_KEY: 're_test_dummy' });
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    expect((await status(C)).emailAvailable).toBe(true);
    // Only ENARA admins send it.
    await mkUser('adminC2', 'admin', C);
    expect((await request(app).post(`/api/lms/onboarding/${C}/send-email`).set('Authorization', auth.adminC2).send({})).status).toBe(403);
    const ok = await request(app).post(`/api/lms/onboarding/${C}/send-email`).set('Authorization', auth.enara).send({});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { to: string; subject: string; html: string; from: string };
    expect(sent.to).toBe(SCHOOL.schoolAdminEmail);
    expect(sent.subject).toBe(`اربط Moodle في ${SCHOOL.name} بإنارة`);
    expect(sent.html).toContain('dir="rtl"');
    expect(sent.html).toContain('مرحبًا Mona');
    expect(sent.html).toContain(`${TOOL}/?page=lms-status`);
    expect(sent.html).toContain(out.onboarding.id);
    expect(sent.html).toContain('cid:enara-logo');
    expect(sent.html).not.toMatch(/\{\{/);
    // D5: never the Moodle link or its code.
    expect(sent.html).not.toContain('/lti/register/');
    expect(sent.html).not.toContain(new URL(out.url).pathname.split('/').pop()!);
    const st = await status(C);
    expect(st.onboarding).toMatchObject({ inviteSentVia: 'email' });
    expect(st.onboarding.inviteSentAt).toBeTruthy();
    expect(st.timer.startedFrom).toBe('invite_sent');

    // English school: the English template; EMAIL_SENDER is configurable (D11).
    process.env.EMAIL_SENDER = 'ENARA Schools <schools@enara.app>';
    const en = await newSchool({ country: 'GB', timeZone: 'Europe/London', schoolAdminEmail: 'head@uk-school.enara.app' });
    sendMock.mockClear();
    expect((await request(app).post(`/api/lms/onboarding/${en.institution.id}/send-email`).set('Authorization', auth.enara).send({})).status).toBe(200);
    const sentEn = sendMock.mock.calls.find((c) => String(c[0].subject).startsWith('Connect'))![0] as { subject: string; html: string; from: string };
    delete process.env.EMAIL_SENDER;
    expect(sentEn.subject).toBe(`Connect ${SCHOOL.name}'s Moodle to Enara`);
    expect(sentEn.from).toBe('ENARA Schools <schools@enara.app>');
    expect(sentEn.html).toContain('London time');
    expect(sentEn.html).not.toContain('/lti/register/');

    // A used / cancelled link: make a new one first.
    await request(app).post(`/api/lms/registration-links/${en.registrationLink.id}/revoke`).set('Authorization', auth.enara);
    const noLink = await request(app).post(`/api/lms/onboarding/${en.institution.id}/send-email`).set('Authorization', auth.enara).send({});
    expect(noLink.status).toBe(409);
    expect(noLink.body.error.code).toBe('LMS_ONBOARDING_NO_LINK');
    // Audit: IDs and codes only.
    const audit = JSON.stringify(await M.LmsAuditLog.find({ event: { $regex: /^onboarding\./ } }).lean());
    expect(audit).not.toContain('@');
  });

  it('the LMS email templates bundle matches the files, and both languages use every variable', async () => {
    const { buildLmsBundleSource, LMS_BUNDLE_PATH } = await import('../../../scripts/email/bundle-lms-templates');
    const fs = await import('fs');
    expect(fs.readFileSync(LMS_BUNDLE_PATH, 'utf8')).toBe(buildLmsBundleSource());
    const { LMS_TEMPLATES_BUNDLE } = await import('../../src/email/lms/lmsTemplatesBundle');
    for (const alias of ['lms-invite-connect-en', 'lms-invite-connect-ar'] as const) {
      const t = LMS_TEMPLATES_BUNDLE[alias];
      expect([...t.variables].sort()).toEqual(['ACTION_URL', 'EXPIRES_ON', 'NAME', 'REFERENCE_CODE', 'SCHOOL_NAME']);
      for (const v of t.variables) expect(t.html, `${alias} ${v}`).toContain(`{{{${v}}}}`);
      expect(t.html).toContain('https://assets.enara.app/email/enara-logo.png');
      expect(t.html).toContain('https://assets.enara.app/email/enara-logo-white.png');
    }
    expect(LMS_TEMPLATES_BUNDLE['lms-invite-connect-ar'].html).toContain('<html lang="ar" dir="rtl">');
  });
});

// ------------------------------------------------------------ registration and the check

describe('registration and the automatic connection check', () => {
  it('the onboarding link registers an active connection; the check runs right after (background); the status page ticks link opened and registered', async () => {
    const out = await newSchool();
    const C = out.institution.id;
    const { platform } = await register(out.url);
    expect(platform).toMatchObject({ institutionId: C, status: 'active', registeredVia: 'dynamic', approvedBy: userIds.enara });
    const check = await M.LmsConnectionCheck.findOne({ platformId: platform.id }).lean();
    expect(check).toMatchObject({ trigger: 'registration', institutionId: C });
    const byKey = Object.fromEntries(check!.steps.map((s) => [s.key, s.status]));
    expect(byKey).toMatchObject({ registered: 'ok', reachable: 'ok', services: 'ok', activated: 'waiting', roster: 'waiting', grades: 'waiting' });
    expect(check!.outcome).toBe('waiting');
    // The service sign-in used the connection's own client id and scopes.
    expect(moodle.tokenRequests.length).toBeGreaterThanOrEqual(1);
    expect(moodle.tokenRequests[0].scope.split(' ')).toEqual(expect.arrayContaining(['https://purl.imsglobal.org/spec/lti-ags/scope/score', 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly']));
    const audit = await M.LmsAuditLog.findOne({ event: 'connection.check', platformId: platform.id }).lean();
    expect(audit).toMatchObject({ outcome: 'warn', refIds: { trigger: 'registration', registered: 'ok', reachable: 'ok', services: 'ok', activated: 'waiting' } });

    const st = await status(C);
    const items = Object.fromEntries(st.checklist.map((c: { key: string; done: boolean }) => [c.key, c.done]));
    expect(items).toMatchObject({ invite_sent: false, link_opened: true, registered: true, activated: false, first_teacher_launch: false, first_student_launch: false, roster_ok: false, first_grade_sent: false });
    expect(st.platforms[0].check.steps).toHaveLength(6);
    expect(st.platforms[0].check.steps[0].help.ar.what).toMatch(/[؀-ۿ]/);
  });

  it('a link opened but not finished: "link opened" is ticked; Moodle that cannot be read gives the on-premise hint on "registered"', async () => {
    const out = await newSchool();
    const C = out.institution.id;
    // Moodle's configuration address cannot be reached: the registration fails; the link stays usable.
    const port = await closedPort();
    const r = await request(app).get(new URL(out.url).pathname).query({ openid_configuration: `http://127.0.0.1:${port}/mod/lti/openid-configuration.php`, registration_token: regToken() });
    expect(r.status).toBe(502);
    const st = await status(C);
    const opened = st.checklist.find((c: { key: string }) => c.key === 'link_opened');
    const reg = st.checklist.find((c: { key: string }) => c.key === 'registered');
    expect(opened.done).toBe(true);
    expect(reg).toMatchObject({ done: false, code: 'registration_could_not_reach' });
    expect(reg.next.en).toContain('no fixed IP');
    expect(reg.next.ar).toMatch(/[؀-ۿ]/);
    // Not opened at all: "The link wasn't used yet"; expired: "make a new one".
    const fresh = await newSchool({ schoolAdminEmail: 'x@fresh-school.enara.app' });
    expect((await status(fresh.institution.id)).checklist.find((c: { key: string }) => c.key === 'registered')).toMatchObject({ code: 'link_not_used' });
    await M.LmsRegistrationCode.updateOne({ id: fresh.registrationLink.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const exp = (await status(fresh.institution.id)).checklist.find((c: { key: string }) => c.key === 'registered');
    expect(exp).toMatchObject({ code: 'link_expired' });
    expect(exp.next.en).toContain('make a new link'.replace('make', 'Make'));
  });

  it('every step: services waiting before activation then fail after; activated, roster and grades ok / fail / waiting', async () => {
    setEnv({ ...ON, LMS_GRADE_PASSBACK_ENABLED: 'true', LMS_ROSTER_SYNC_ENABLED: 'true' });
    const out = await newSchool();
    moodle.tokenStatuses = [401];
    const { platform, deploymentId } = await register(out.url);
    // Right after registration Moodle refused the service sign-in (tool not activated yet): waiting, not failed.
    let view = (await M.LmsConnectionCheck.findOne({ platformId: platform.id }).lean())!;
    expect(view.steps.find((s) => s.key === 'services')).toMatchObject({ status: 'waiting', code: 'services_after_activate' });
    expect(view.steps.find((s) => s.key === 'roster')).toMatchObject({ status: 'waiting', code: 'roster_not_yet' });
    expect(view.steps.find((s) => s.key === 'grades')).toMatchObject({ status: 'waiting', code: 'grades_not_yet' });

    // A teacher launch (with the AGS line items service) = activated.
    await launchOk(platform.clientId, deploymentId, 'teacher-1', [ROLE.instructor], moodle.agsClaim());
    moodle.tokenStatuses = [];
    let v = await runCheck(platform.id);
    expect(step(v, 'activated')).toMatchObject({ status: 'ok', code: 'first_launch_seen' });
    expect(step(v, 'services')).toMatchObject({ status: 'ok', code: 'token_ok' });
    expect(step(v, 'grades')).toMatchObject({ status: 'ok', code: 'lineitems_readable' });

    // After activation, a refused service sign-in is a failure.
    moodle.tokenStatuses = [401, 401, 401];
    v = await runCheck(platform.id);
    expect(step(v, 'services')).toMatchObject({ status: 'fail', code: 'token_http_401' });
    expect(step(v, 'services').help.en.what).toContain("didn't allow grades");
    expect(v.outcome).toBe('fail');
    moodle.tokenStatuses = [];

    // Roster: a failed sync = fail (with its code); an ok sync = ok.
    const ctx = (await M.LmsContext.findOne({ platformId: platform.id }).lean())!;
    await M.LmsContext.updateOne({ id: ctx.id }, { $set: { rosterSync: { outcome: 'failed', lastErrorCode: 'memberships_http_403', lastAttemptAt: new Date() } } });
    v = await runCheck(platform.id);
    expect(step(v, 'roster')).toMatchObject({ status: 'fail', code: 'memberships_http_403' });
    expect(step(v, 'roster').help.en.what).toContain("Class lists can't be read");
    await M.LmsContext.updateOne({ id: ctx.id }, { $set: { rosterSync: { outcome: 'ok', lastAttemptAt: new Date() }, lastRosterSyncAt: new Date() } });
    v = await runCheck(platform.id);
    expect(step(v, 'roster')).toMatchObject({ status: 'ok', code: 'roster_ok' });

    // Grades: the line items cannot be read = fail; a grade sent = ok.
    moodle.tokenStatuses = [];
    await M.LmsContext.updateOne({ id: ctx.id }, { $set: { agsLineItemsUrl: `${moodle.serviceBase}/nope/lineitems` } });
    v = await runCheck(platform.id);
    expect(step(v, 'grades')).toMatchObject({ status: 'fail', code: 'lineitems_http_404' });
    expect(step(v, 'grades').help.en.what).toContain("Grades can't be sent");
    await M.LmsGradeSyncJob.collection.insertOne({ id: 'lmsj_test', idempotencyKey: 'k1', institutionId: out.institution.id, platformId: platform.id, contextId: ctx.id, lineItemRef: 'x', lmsUserId: 'u', enaraAttemptId: 'a', status: 'sent', sentAt: new Date() });
    v = await runCheck(platform.id);
    expect(step(v, 'grades')).toMatchObject({ status: 'ok', code: 'grade_sent' });
    expect(v.outcome).toBe('ok');

    // Reachable: Moodle's key address answers with an error = fail with the HTTP code (not "unreachable").
    moodle.jwksStatus = 500;
    v = await runCheck(platform.id);
    expect(step(v, 'reachable')).toMatchObject({ status: 'fail', code: 'keyset_http_500' });
    expect(v.unreachable).toBe(false);
    moodle.jwksStatus = 200;

    // Registered: a connection switched off, or one without a deployment.
    await M.LmsPlatform.updateOne({ id: platform.id }, { $set: { status: 'pending' } });
    expect(step(await runCheck(platform.id), 'registered')).toMatchObject({ status: 'waiting', code: 'platform_pending' });
    await M.LmsPlatform.updateOne({ id: platform.id }, { $set: { status: 'disabled' } });
    expect(step(await runCheck(platform.id), 'registered')).toMatchObject({ status: 'fail', code: 'platform_disabled' });
  });

  it('roster and grades wait (not fail) while their flags are off', async () => {
    const out = await newSchool();
    const { platform } = await register(out.url);
    const v = await runCheck(platform.id);
    expect(step(v, 'roster')).toMatchObject({ status: 'waiting', code: 'roster_off' });
    expect(step(v, 'grades')).toMatchObject({ status: 'waiting', code: 'grades_off' });
  });

  it('Moodle unreachable from the internet (network error, timeout, private address): the on-premise text; launches still work with a pasted public key', async () => {
    const out = await newSchool();
    const { platform, deploymentId } = await register(out.url);
    const port = await closedPort();
    // Network error (nothing listens): keys and token both unreachable.
    await M.LmsPlatform.updateOne({ id: platform.id }, { $set: { keysetUrl: `http://127.0.0.1:${port}/jwks`, authTokenUrl: `http://127.0.0.1:${port}/token` } });
    let v = await runCheck(platform.id);
    expect(step(v, 'reachable')).toMatchObject({ status: 'fail', code: 'moodle_unreachable' });
    expect(step(v, 'services')).toMatchObject({ status: 'fail', code: 'moodle_unreachable' });
    expect(v.unreachable).toBe(true);
    const h = step(v, 'reachable').help;
    expect(h.en.what).toContain("can't be reached from the internet");
    expect(h.en.what).toContain('Students and teachers can still open ENARA');
    expect(h.en.fix).toContain('no fixed IP');
    expect(h.en.fix).toContain('by name');
    expect(h.en.fix).toContain(new URL(moodle.issuer).hostname);
    expect(h.en.fix).toContain('public key');
    expect(h.ar.fix).toContain('ليس لـ ENARA عنوان IP ثابت');
    const audit = await M.LmsAuditLog.findOne({ event: 'connection.check', platformId: platform.id }).sort({ createdAt: -1 }).lean();
    expect(audit).toMatchObject({ outcome: 'fail', code: 'moodle_unreachable', refIds: { unreachable: true, reachableReason: 'network' } });
    // The Problems view knows the code.
    const { helpFor } = await import('../../src/integrations/lms/core/problemHelp');
    expect(helpFor('moodle_unreachable', 'connection.check')).toMatchObject({ known: true });

    // Timeout.
    const slow = http.createServer((_req, res) => setTimeout(() => res.end('{}'), 1_000));
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r));
    const { setConnectionCheckTimeoutForTests } = await import('../../src/integrations/lms/core/connectionCheck');
    setConnectionCheckTimeoutForTests(200);
    await M.LmsPlatform.updateOne({ id: platform.id }, { $set: { keysetUrl: `http://127.0.0.1:${(slow.address() as AddressInfo).port}/jwks` } });
    v = await runCheck(platform.id);
    setConnectionCheckTimeoutForTests(5_000);
    slow.closeAllConnections?.();
    await new Promise<void>((r) => slow.close(() => r()));
    expect(step(v, 'reachable')).toMatchObject({ status: 'fail', code: 'moodle_unreachable' });
    expect((await M.LmsAuditLog.findOne({ event: 'connection.check', platformId: platform.id }).sort({ createdAt: -1 }).lean())?.refIds.reachableReason).toBe('timeout');

    // A private address (an intranet Moodle): no request is made.
    await M.LmsPlatform.updateOne({ id: platform.id }, { $set: { keysetUrl: 'https://moodle.school.internal/mod/lti/certs.php', authTokenUrl: 'https://10.1.2.3/mod/lti/token.php' } });
    v = await runCheck(platform.id);
    expect(step(v, 'reachable')).toMatchObject({ status: 'fail', code: 'moodle_unreachable' });
    expect(step(v, 'services')).toMatchObject({ status: 'fail', code: 'moodle_unreachable' });
    expect((await M.LmsAuditLog.findOne({ event: 'connection.check', platformId: platform.id }).sort({ createdAt: -1 }).lean())?.refIds).toMatchObject({ reachableReason: 'private_address', servicesReason: 'private_address' });

    // Launches with an unreachable keyset fail (jwks_unavailable)...
    await M.LmsPlatform.updateOne({ id: platform.id }, { $set: { keysetUrl: `http://127.0.0.1:${port}/jwks` } });
    const failed = await launch(platform.clientId, deploymentId, 'student-x');
    expect(failed.status).not.toBe(303);
    // ...until Moodle's public key is pasted (the fallback): verified locally, ENARA fetches nothing.
    const bad = await request(app).post(`/api/lms/platforms/${platform.id}/public-key`).set('Authorization', auth.enara).send({ publicKey: 'not a key' });
    expect(bad.status).toBe(400);
    const pasted = await request(app).post(`/api/lms/platforms/${platform.id}/public-key`).set('Authorization', auth.enara).send({ publicKey: JSON.stringify({ keys: moodle.keys.map((k) => k.publicJwk) }) });
    expect(pasted.status, JSON.stringify(pasted.body)).toBe(200);
    expect(pasted.body.platform.hasPublicKey).toBe(true);
    const hits = moodle.jwksHits;
    await launchOk(platform.clientId, deploymentId, 'student-x');
    expect(moodle.jwksHits).toBe(hits);
    expect((await status(out.institution.id)).platforms[0].hasPublicKey).toBe(true);
    // Another school's admin cannot set it.
    expect((await request(app).post(`/api/lms/platforms/${platform.id}/public-key`).set('Authorization', auth.adminA).send({ publicKey: 'x' })).status).toBe(404);
  });

  it('manual registration with a pasted public key (PEM or JWK) instead of a keyset URL; private keys are refused', async () => {
    const jose = await import('jose');
    const pem = await jose.exportSPKI((await jose.importJWK(moodle.keys[0].publicJwk, 'RS256')) as CryptoKey);
    const { publicKey: other, privateKey } = await jose.generateKeyPair('RS256', { extractable: true });
    void other;
    const privatePem = await jose.exportPKCS8(privateKey);
    const privJwk = await jose.exportJWK(privateKey);
    const base = { institutionId: A, vendor: 'moodle', issuer: moodle.issuer, authLoginUrl: moodle.authLoginUrl, deploymentIds: ['77'] };
    for (const [key, reason] of [[privatePem, 'private_key'], [JSON.stringify(privJwk), 'private_key'], [JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' }), 'not_rsa'], ['-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----', 'not_a_key']] as const) {
      const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({ ...base, clientId: `c-${reason}`, publicKey: key });
      expect(r.status, reason).toBe(400);
      expect(r.body.error.message).toContain(reason);
    }
    // Neither a keyset URL nor a key: refused.
    expect((await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({ ...base, clientId: 'c-none' })).status).toBe(400);
    const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({ ...base, clientId: 'manual-pem', publicKey: pem });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.platform).toMatchObject({ keysetUrl: null, hasPublicKey: true, status: 'active' });
    const stored = await M.LmsPlatform.findOne({ clientId: 'manual-pem' }).lean();
    expect(JSON.parse(stored!.publicJwks!).keys[0]).toMatchObject({ kty: 'RSA', n: moodle.keys[0].publicJwk.n, e: moodle.keys[0].publicJwk.e });
    expect(stored!.publicJwks).not.toMatch(/"d"/);
    const hits = moodle.jwksHits;
    await launchOk('manual-pem', '77', 'manual-student');
    expect(moodle.jwksHits).toBe(hits);
    // The check: launches use the pasted key ("manual_key"); no token URL = fail with its code.
    const v = await runCheck(stored!.id);
    expect(step(v, 'reachable')).toMatchObject({ status: 'ok', code: 'manual_key' });
    expect(step(v, 'services')).toMatchObject({ status: 'fail', code: 'no_token_url' });
    expect(step(v, 'registered')).toMatchObject({ status: 'ok', code: 'registered_manual' });
  });
});

// ------------------------------------------------------------ nightly

describe('nightly re-check (S3)', () => {
  it('re-runs only connections whose last check failed (oldest first), skipping switched-off ones; inert with the LMS off', async () => {
    const mk = async (clientId: string, status: 'active' | 'disabled', outcome: 'ok' | 'fail' | 'waiting', ageMin: number) => {
      const p = await M.LmsPlatform.create({ institutionId: A, provider: 'lti13', vendor: 'moodle', issuer: moodle.issuer, clientId, authLoginUrl: moodle.authLoginUrl, keysetUrl: moodle.keysetUrl, authTokenUrl: moodle.tokenUrl, status, registeredVia: 'manual' });
      await M.LmsDeployment.create({ platformId: p.id, deploymentId: '1', institutionId: A, status: 'active' });
      await M.LmsConnectionCheck.create({ platformId: p.id, institutionId: A, outcome, trigger: 'manual', checkedAt: new Date(Date.now() - ageMin * 60_000), steps: [] });
      return p.id;
    };
    const failedOld = await mk('n-1', 'active', 'fail', 300);
    const failedNew = await mk('n-2', 'active', 'fail', 10);
    const ok = await mk('n-3', 'active', 'ok', 600);
    const waiting = await mk('n-4', 'active', 'waiting', 600);
    const off = await mk('n-5', 'disabled', 'fail', 900);
    const { recheckFailedConnections } = await import('../../src/integrations/lms/core/connectionCheck');
    const out = await recheckFailedConnections({ budgetMs: 30_000 });
    expect(out.checked).toBe(2);
    const rows = Object.fromEntries((await M.LmsConnectionCheck.find({}).lean()).map((r) => [r.platformId, r]));
    expect(rows[failedOld].trigger).toBe('nightly');
    expect(rows[failedNew].trigger).toBe('nightly');
    for (const id of [ok, waiting, off]) expect(rows[id].trigger, id).toBe('manual');
    // Oldest first.
    const audits = await M.LmsAuditLog.find({ event: 'connection.check' }).sort({ createdAt: 1 }).lean();
    expect(audits.map((a) => a.platformId)).toEqual([failedOld, failedNew]);
    expect(audits[0].refIds.trigger).toBe('nightly');
    // The limit is honoured.
    await M.LmsConnectionCheck.updateMany({}, { $set: { outcome: 'fail' } });
    await M.LmsPlatform.updateMany({}, { $set: { status: 'active' } });
    expect((await recheckFailedConnections({ budgetMs: 30_000, limit: 1 })).checked).toBe(1);
    setEnv({});
    expect(await recheckFailedConnections({ budgetMs: 30_000 })).toMatchObject({ checked: 0, skipped: 'lti_off' });
  });
});

// ------------------------------------------------------------ status page

describe('the school connection status page', () => {
  it('school admins see their own school only; ENARA admins any; teachers never; Check again is rate-limited per connection', async () => {
    const out = await newSchool();
    const C = out.institution.id;
    await mkUser('adminC', 'admin', C);
    await mkUser('teacherC', 'teacher', C);
    expect((await request(app).get(`/api/lms/onboarding/${C}/status`).set('Authorization', auth.adminC)).status).toBe(200);
    expect((await request(app).get(`/api/lms/onboarding/${C}/status`).set('Authorization', auth.enara)).status).toBe(200);
    expect((await request(app).get(`/api/lms/onboarding/${C}/status`).set('Authorization', auth.adminA)).status).toBe(404);
    expect((await request(app).get(`/api/lms/onboarding/${A}/status`).set('Authorization', auth.adminC)).status).toBe(404);
    expect((await request(app).get(`/api/lms/onboarding/${C}/status`).set('Authorization', auth.teacherC)).status).toBe(403);
    expect((await request(app).get(`/api/lms/onboarding/${C}/status`)).status).toBe(401);
    expect((await request(app).get('/api/lms/onboarding/nope/status').set('Authorization', auth.enara)).status).toBe(404);
    // A school not set up with the form still has a status page (no invite, no timer).
    const a = await status(A, 'adminA');
    expect(a).toMatchObject({ onboarding: null, timer: null });
    expect(a.checklist).toHaveLength(8);
    // The onboarding list: ENARA all, school admins their own.
    expect((await request(app).get('/api/lms/onboarding').set('Authorization', auth.enara)).body.onboardings.map((o: { institutionId: string }) => o.institutionId)).toContain(C);
    expect((await request(app).get('/api/lms/onboarding').set('Authorization', auth.adminA)).body.onboardings).toEqual([]);
    expect((await request(app).get('/api/lms/onboarding').set('Authorization', auth.teacherC)).status).toBe(403);
    // Invite-sent and Check again: own school only.
    expect((await request(app).post(`/api/lms/onboarding/${C}/invite-sent`).set('Authorization', auth.adminA).send({})).status).toBe(404);
    expect((await request(app).post(`/api/lms/onboarding/${C}/check`).set('Authorization', auth.adminA).send({})).status).toBe(404);
    expect((await request(app).post(`/api/lms/onboarding/${C}/check`).set('Authorization', auth.teacherC).send({})).status).toBe(403);

    const { platform } = await register(out.url);
    await M.LmsConnectionCheck.updateOne({ platformId: platform.id }, { $set: { checkedAt: new Date(Date.now() - 60_000) } });
    const first = await request(app).post(`/api/lms/onboarding/${C}/check`).set('Authorization', auth.adminC).send({});
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ checked: 1, skippedRecent: 0 });
    expect(first.body.status.platforms[0].check.trigger).toBe('manual');
    expect((await M.LmsConnectionCheck.findOne({ platformId: platform.id }).lean())?.checkedBy).toBe(userIds.adminC);
    const again = await request(app).post(`/api/lms/onboarding/${C}/check`).set('Authorization', auth.adminC).send({});
    expect(again.body).toMatchObject({ checked: 0, skippedRecent: 1 });
    expect((await request(app).post(`/api/lms/onboarding/${C}/check`).set('Authorization', auth.adminC).send({ platformId: 'lmsp_other' })).status).toBe(404);
  });

  it('the 4 hand-ticked Moodle settings: tick and untick each, ENARA records who and when; audited with IDs only; other schools refused', async () => {
    const out = await newSchool();
    const C = out.institution.id;
    await mkUser('adminC', 'admin', C);
    await mkUser('teacherC', 'teacher', C);
    const { platform } = await register(out.url);
    let st = await status(C, 'adminC');
    expect(st.platforms[0].manualSettings.map((m: { key: string; checked: boolean }) => [m.key, m.checked])).toEqual([
      ['acceptGradesAlways', false], ['activityChooser', false], ['restrictToCategory', false], ['activated', false],
    ]);
    for (const m of st.platforms[0].manualSettings) {
      expect(m.label.en.length).toBeGreaterThan(5);
      expect(m.how.ar).toMatch(/[؀-ۿ]/);
    }
    const tick = (who: string, key: string, checked: unknown, platformId = platform.id) =>
      request(app).put(`/api/lms/onboarding/${C}/manual-settings`).set('Authorization', auth[who]).send({ platformId, key, checked });
    for (const key of ['acceptGradesAlways', 'activityChooser', 'restrictToCategory', 'activated']) {
      const r = await tick('adminC', key, true);
      expect(r.status, key).toBe(200);
      expect(r.body.setting).toMatchObject({ key, checked: true, by: userIds.adminC });
    }
    const un = await tick('enara', 'restrictToCategory', false);
    expect(un.body.setting).toMatchObject({ checked: false, by: userIds.enara });
    st = await status(C, 'adminC');
    const ms = Object.fromEntries(st.platforms[0].manualSettings.map((m: { key: string }) => [m.key, m]));
    expect(ms.acceptGradesAlways).toMatchObject({ checked: true, by: userIds.adminC });
    expect(new Date(ms.acceptGradesAlways.at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(ms.restrictToCategory).toMatchObject({ checked: false, by: userIds.enara });
    // Audit: one row per tick, IDs only.
    const audit = await M.LmsAuditLog.find({ event: 'connection.manual_setting', platformId: platform.id }).sort({ createdAt: 1 }).lean();
    expect(audit).toHaveLength(5);
    expect(audit[0]).toMatchObject({ outcome: 'ok', institutionId: C, actor: userIds.adminC, refIds: { setting: 'acceptGradesAlways', checked: true } });
    expect(audit[4]).toMatchObject({ actor: userIds.enara, refIds: { setting: 'restrictToCategory', checked: false } });
    expect(JSON.stringify(audit)).not.toMatch(/@|adminC|Mona/);
    // Ticks survive a later automatic check.
    await runCheck(platform.id);
    expect((await M.LmsConnectionCheck.findOne({ platformId: platform.id }).lean())?.manualSettings?.activated?.checked).toBe(true);
    // Refused: bad key / value, another school, a teacher, a platform of another school.
    expect((await tick('adminC', 'nope', true)).status).toBe(400);
    expect((await tick('adminC', 'activated', 'yes')).status).toBe(400);
    expect((await tick('adminA', 'activated', true)).status).toBe(404);
    expect((await tick('teacherC', 'activated', true)).status).toBe(403);
    const otherP = await M.LmsPlatform.create({ institutionId: A, provider: 'lti13', vendor: 'moodle', issuer: moodle.issuer, clientId: 'other-a', keysetUrl: moodle.keysetUrl, status: 'active', registeredVia: 'manual' });
    expect((await tick('adminC', 'activated', true, otherP.id)).status).toBe(404);
  });

  it('the checklist and the "Elapsed since invite" timer (15-minute goal)', async () => {
    const out = await newSchool();
    const C = out.institution.id;
    let st = await status(C);
    // Before the invite is marked sent: the timer runs from when it was made.
    expect(st.timer).toMatchObject({ startedFrom: 'invite_created', goalMs: 15 * 60_000, running: true, goalMet: false, goalReachedAt: null });
    const copy = await request(app).post(`/api/lms/onboarding/${C}/invite-sent`).set('Authorization', auth.enara).send({});
    expect(copy.status).toBe(200);
    const sentAt = copy.body.inviteSentAt;
    // A second copy does not move the start.
    expect((await request(app).post(`/api/lms/onboarding/${C}/invite-sent`).set('Authorization', auth.enara).send({})).body.inviteSentAt).toBe(sentAt);
    expect(await M.LmsAuditLog.countDocuments({ event: 'onboarding.invite_sent' })).toBe(1);
    st = await status(C);
    expect(st.timer).toMatchObject({ startedFrom: 'invite_sent', running: true });
    expect(st.timer.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(st.timer.elapsedMs).toBeLessThan(60_000);
    expect(st.checklist.find((c: { key: string }) => c.key === 'invite_sent').done).toBe(true);

    const { platform, deploymentId } = await register(out.url);
    await launchOk(platform.clientId, deploymentId, 'teacher-1', [ROLE.instructor]);
    st = await status(C);
    expect(st.timer.running).toBe(true);
    expect(st.checklist.find((c: { key: string }) => c.key === 'first_teacher_launch').done).toBe(true);
    expect(st.checklist.find((c: { key: string }) => c.key === 'first_student_launch')).toMatchObject({ done: false, next: { en: expect.stringContaining('student') } });
    await launchOk(platform.clientId, deploymentId, 'student-1', [ROLE.learner]);
    st = await status(C);
    const done = Object.fromEntries(st.checklist.map((c: { key: string; done: boolean }) => [c.key, c.done]));
    expect(done).toMatchObject({ invite_sent: true, link_opened: true, registered: true, activated: true, first_teacher_launch: true, first_student_launch: true, roster_ok: false, first_grade_sent: false });
    expect(st.allDone).toBe(false);
    // Goal reached: the timer stops at the last of registered / activated / first teacher / first student.
    expect(st.timer.running).toBe(false);
    expect(st.timer.goalMet).toBe(true);
    const student = st.checklist.find((c: { key: string }) => c.key === 'first_student_launch').at;
    expect(st.timer.goalReachedAt).toBe(student);
    expect(st.timer.elapsedMs).toBe(new Date(student).getTime() - new Date(sentAt).getTime());
    // An invite sent 20 minutes before: goal missed.
    await M.LmsOnboarding.updateOne({ institutionId: C }, { $set: { inviteSentAt: new Date(new Date(student).getTime() - 20 * 60_000) } });
    st = await status(C);
    expect(st.timer).toMatchObject({ goalMet: false, running: false, elapsedMs: 20 * 60_000 });
  });

  it('the onboarding migration creates its indexes and can run twice', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const mig = MIGRATIONS.find((x) => x.id === '2026-11-24-lms-onboarding')!;
    expect(mig).toBeTruthy();
    await mig.up();
    await mig.up();
    const onb = await mongoose.connection.db!.collection('lms_onboardings').indexes();
    expect(onb.some((i) => i.key.institutionId === 1 && i.unique)).toBe(true);
    const cc = await mongoose.connection.db!.collection('lms_connection_checks').indexes();
    expect(cc.some((i) => i.key.platformId === 1 && i.unique)).toBe(true);
    expect(cc.some((i) => i.key.outcome === 1 && i.key.checkedAt === 1)).toBe(true);
  });
});
