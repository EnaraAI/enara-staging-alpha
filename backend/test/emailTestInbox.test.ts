import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfig, resetConfigForTests } from '../src/config/env';

// Owner rules (lms-test), for EVERY email path: sendTemplate (parent code
// email, "Share this week", password reset, staff invitation),
// sendParentTemplate / deliverRendered, the legacy sendEmail, and sendLmsEmail.
//   - staging (ENARA_STAGING): only to the test inbox (REMINDER_TEST_RECIPIENT),
//     with EMAIL_SUBJECT_PREFIX and the "Test copy: this email was for ..." line;
//     refused without a test inbox; captured with LMS_EMAIL_CAPTURE;
//   - no 20-a-day cap: every email is sent when its event happens;
//   - ONE safety ceiling across all paths (EMAIL_DAILY_CEILING, default 300 a
//     Cairo day on staging): above it held, one critical alert + audit, and ONE
//     alert email a day, itself exempt;
//   - the provider (Resend free tier: 100/day, 3,000/month, 10 req/s): paced,
//     a quota refusal is held/failed with one alert a day, no retry storm, no crash;
//   - not staging (production): unchanged.
// Resend and fetch are mocked: nothing is ever sent. No network.
const sendMock = vi.fn();
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })) }));
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.app';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const ENV_KEYS = [
  'LMS_LTI_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_EMAILS_ENABLED', 'REMINDERS_ENABLED', 'RESEND_API_KEY', 'APP_URL', 'REMINDER_FROM',
  'REMINDER_TEST_RECIPIENT', 'EMAIL_SUBJECT_PREFIX', 'EMAIL_DAILY_CEILING', 'LMS_EMAIL_CAPTURE', 'PARENT_EMAILS_ENABLED', 'ENARA_STAGING', 'LMS_OPS_EMAILS', 'LMS_EMAIL_OPEN_DELIVERY',
];
const OPS = 'ops@ops.enara.app';
const ON = {
  LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK, APP_URL: TOOL, LMS_EMAILS_ENABLED: 'true', LMS_OPS_EMAILS: OPS,
  REMINDERS_ENABLED: 'true', RESEND_API_KEY: 're_test_dummy', REMINDER_FROM: 'ENARA <hello@mail.enara.app>', PARENT_EMAILS_ENABLED: 'true',
};
const INBOX = 'owner-inbox@qa.enara.app';
const LMS_TEST = { ...ON, REMINDER_TEST_RECIPIENT: INBOX, EMAIL_SUBJECT_PREFIX: '[lms-test]' };
const PARENT = "o'brien+mum@family.enara.app"; // the escaped form shows in the Test copy line
const PARENT_ESCAPED = 'o&#39;brien+mum@family.enara.app';

function setEnv(vars: Record<string, string | undefined>, opts: { staging?: boolean } = {}) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
  // As on lms-test (ENARA_STAGING=true). Set on the loaded config: the real
  // flag also runs the staging isolation check at start-up (p6StagingGuard).
  if (opts.staging) (getConfig() as { stagingMode: boolean }).stagingMode = true;
}

let mongo: MongoMemoryServer;
let T: typeof import('../src/email/sendTemplate');
let P: typeof import('../src/email/sendParentTemplate');
let B: typeof import('../src/email/sendBundledTemplate');
let S: typeof import('../src/services/emailService');
let A: typeof import('../src/services/accountTokens');
let R: typeof import('../src/parents/reportSender');
let L: typeof import('../src/integrations/lms/core/lmsEmail');
let I: typeof import('../src/email/testInbox');
let V: typeof import('../src/email/provider');
let M: typeof import('../src/integrations/lms/models');
let Alerts: typeof import('../src/models/AlertEvent')['AlertEvent'];
let Audits: typeof import('../src/models/AuditEvent')['AuditEvent'];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  setEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  T = await import('../src/email/sendTemplate');
  P = await import('../src/email/sendParentTemplate');
  B = await import('../src/email/sendBundledTemplate');
  S = await import('../src/services/emailService');
  A = await import('../src/services/accountTokens');
  R = await import('../src/parents/reportSender');
  L = await import('../src/integrations/lms/core/lmsEmail');
  I = await import('../src/email/testInbox');
  V = await import('../src/email/provider');
  Alerts = (await import('../src/models/AlertEvent')).AlertEvent;
  Audits = (await import('../src/models/AuditEvent')).AuditEvent;
  const { User } = await import('../src/models/User');
  await User.create({ email: 'jane.teacher@school.enara.app', password: 'x', role: 'teacher', name: 'Jane Teacher', institutionId: 'inst-a' });
}, 120_000);

afterAll(async () => {
  setEnv({});
  await mongoose.disconnect();
  await mongo?.stop();
  vi.unstubAllGlobals();
});

let n = 0;
let t0 = new Date();
const audits = (action: string) => Audits.countDocuments({ action, at: { $gte: t0 } });
beforeEach(async () => {
  sendMock.mockReset().mockImplementation(async () => ({ data: { id: `re_${++n}` }, error: null }));
  fetchMock.mockReset().mockImplementation(async () => new Response('{"id":"re_legacy"}', { status: 200 }));
  T.resetEmailClientForTests(); // also the provider's pacing (0 in tests) and quota state
  await M.LmsEmailClaim.deleteMany({});
  await M.LmsEmailLog.deleteMany({});
  await Alerts.deleteMany({});
  t0 = new Date(); // audit_events is append-only: count from here
  setEnv(ON);
});

type Sent = { to: string | string[]; subject: string; html: string };
const sent = (): Sent[] => sendMock.mock.calls.map((c) => c[0] as Sent);
const posted = (): { to: string[]; subject: string; html: string }[] => fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
const rows = () => M.LmsEmailLog.find({}).sort({ createdAt: 1, _id: 1 }).lean();
const day = () => I.cairoDay();
const alertMails = () => sent().filter((s) => s.subject.includes('Email safety ceiling hit'));

const consent = (to: string) => T.sendTemplate('enara-parent-consent', to, { NAME: 'there', CHILD_NAME: 'Omar', LINK_CODE: 'ENR-ABCD-EFGH', EXPIRES_IN: '7 days' });
const parentInvite = (to: string) =>
  // The approved (18 Nov 2026) parent-invite: one row per child (CHILD_CODES, built by code), code in the body only.
  P.sendParentTemplate('parent-invite-en', to, { NAME: 'Mona', SCHOOL_NAME: 'Nile School', CHILDREN_NAMES: 'Omar', CHILD_CODES: '<table><tr><td>Omar</td><td>ENR-ABCD-EFGH</td></tr></table>', EXPIRES_IN: '7 days', ACTION_URL: `${TOOL}/parents/link` });
const weekly = (to: string) =>
  R.emailReportSender.send(to, { parentName: 'Mona', childName: 'Omar', lessonsDone: 3, outcomesMastered: 2, minutesDone: 40, goalMinutes: 60, practiceTip: 'Read aloud.', statusLine: 'on track' });
const legacy = (to: string) => S.sendEmail({ to, subject: 'Your reminder', html: '<p>Hello</p>' });

/** One LMS email through sendLmsEmail (the LMS service), all variables filled. */
let lmsSeq = 0;
function lmsEmail() {
  const template = 'lms-ops-daily-digest';
  const found = L.lmsTemplate(template, 'en')!;
  return L.sendLmsEmail({
    template, key: `test:${++lmsSeq}`, lang: 'en',
    recipients: [{ ref: 'ops:x', email: OPS }],
    vars: () => Object.fromEntries(found.t.variables.map((v) => [v, v === 'ACTION_URL' ? `${TOOL}/admin` : '1'])),
  });
}

describe('not staging (production): every path unchanged', () => {
  it('sendTemplate, sendParentTemplate, "Share this week": the real address, no prefix, no Test copy line, nothing recorded or counted', async () => {
    // Even with the lms-test variables present: without ENARA_STAGING (and no EMAIL_DAILY_CEILING) the guard does nothing.
    setEnv({ ...LMS_TEST, LMS_EMAIL_CAPTURE: 'true' });
    expect(I.emailPolicy()).toMatchObject({ staging: false, ceiling: undefined });
    for (let i = 0; i < 3; i++) expect(await consent(PARENT)).toMatchObject({ ok: true });
    expect(await parentInvite(PARENT)).toMatchObject({ ok: true });
    expect(await weekly(PARENT)).toMatchObject({ ok: true, channel: 'email' });
    expect(sent()).toHaveLength(5);
    expect(sent().map((s) => s.to)).toEqual([PARENT, PARENT, PARENT, PARENT, PARENT]);
    expect(sent().every((s) => !s.subject.startsWith('[lms-test]') && !s.html.includes('Test copy'))).toBe(true);
    expect(sent()[0].subject).toBe("Please approve Omar's Enara account");
    expect(await rows()).toEqual([]);
    expect(await I.ceilingCount(day())).toBe(0);
  });

  it('account emails and the legacy sendEmail: as before (REMINDER_TEST_RECIPIENT redirect with the old line; real address without it)', async () => {
    await A.requestPasswordReset('jane.teacher@school.enara.app');
    expect(sent()[0]).toMatchObject({ to: 'jane.teacher@school.enara.app', subject: 'Reset your Enara password' });
    setEnv(LMS_TEST);
    await A.requestPasswordReset('jane.teacher@school.enara.app');
    expect(sent()[1].to).toBe(INBOX);
    expect(sent()[1].subject).toBe('Reset your Enara password'); // no prefix outside staging
    expect(sent()[1].html).not.toContain('Test copy');
    setEnv(ON);
    expect(await legacy('jane.teacher@school.enara.app')).toBe(true);
    expect(posted()[0]).toMatchObject({ to: ['jane.teacher@school.enara.app'], subject: 'Your reminder', html: '<p>Hello</p>' });
    expect(await rows()).toEqual([]);
  });

  it('EMAIL_DAILY_CEILING set outside staging: the ceiling applies, the real recipients stay, the alert goes to LMS_OPS_EMAILS', async () => {
    setEnv({ ...ON, EMAIL_DAILY_CEILING: '2' });
    expect(await consent(PARENT)).toMatchObject({ ok: true });
    expect(await legacy('jane.teacher@school.enara.app')).toBe(true);
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'daily_ceiling' });
    expect(sent().map((s) => [s.to, s.subject])).toEqual([[PARENT, "Please approve Omar's Enara account"], [[OPS], 'Email safety ceiling hit: 1 held']]);
    expect(posted()[0].to).toEqual(['jane.teacher@school.enara.app']);
    expect((await rows()).map((r) => [r.template, r.status, r.redirected])).toEqual([['email-ceiling-alert', 'sent', false], ['enara-parent-consent', 'held', false]]);
  });
});

describe('staging (lms-test) with a test inbox: every path redirected, prefixed, marked', () => {
  beforeEach(() => setEnv(LMS_TEST, { staging: true }));

  it('parent code email (sendTemplate): one copy to the test inbox, "[lms-test] " prefix, escaped Test copy line, recorded', async () => {
    expect(await consent(PARENT)).toEqual({ ok: true, id: expect.stringMatching(/^re_/) });
    expect(sent()).toHaveLength(1);
    expect(sent()[0].to).toBe(INBOX);
    expect(sent()[0].subject).toBe("[lms-test] Please approve Omar's Enara account");
    expect(sent()[0].html).toContain(`Test copy: this email was for ${PARENT_ESCAPED}.`);
    expect(sent()[0].html).not.toContain(PARENT);
    expect(sent()[0].html).toContain('ENR-ABCD-EFGH'); // the body is unchanged otherwise
    const [row] = await rows();
    expect(row).toMatchObject({ template: 'enara-parent-consent', status: 'sent', recipientRef: 'redirect', redirected: true, recipientCount: 1 });
    expect(row.subject).toBeUndefined(); // no child name in the log
    expect(JSON.stringify(row)).not.toContain('family.enara.app');
  });

  it('several recipients: ONE copy naming all of them', async () => {
    await T.sendTemplate('enara-welcome', ['a@school.enara.app', 'b@school.enara.app'], { NAME: 'A' });
    expect(sent()).toHaveLength(1);
    expect(sent()[0].to).toBe(INBOX);
    expect(sent()[0].html).toContain('Test copy: this email was for a@school.enara.app, b@school.enara.app.');
  });

  it('"Share this week", parent templates (sendParentTemplate / deliverRendered), password reset, staff invitation, legacy sendEmail', async () => {
    expect(await weekly(PARENT)).toMatchObject({ ok: true });
    expect(await parentInvite(PARENT)).toMatchObject({ ok: true });
    expect(await B.deliverRendered({ kind: 'parent', alias: 'parent-invite-ar', to: PARENT, subject: 'S', html: '<html><body><p>x</p></body></html>' })).toMatchObject({ ok: true });
    await A.requestPasswordReset('jane.teacher@school.enara.app');
    await A.createInvitation({ institutionId: 'inst-a', email: 'new.staff@school.enara.app', role: 'teacher', invitedBy: 'nobody' });
    expect(sent()).toHaveLength(5);
    expect(sent().every((s) => s.to === INBOX && s.subject.startsWith('[lms-test] ') && s.html.includes('Test copy: this email was for '))).toBe(true);
    expect(sent()[0].html).toContain(`this email was for ${PARENT_ESCAPED}.`);
    expect(sent()[2].html).toMatch(/<body[^>]*><div dir="ltr"[^>]*>Test copy: this email was for /); // right after <body>
    // The account emails keep working: the reset link is in the redirected copy, and it names the real account.
    expect(sent()[3].subject).toBe('[lms-test] Reset your Enara password');
    expect(sent()[3].html).toContain('Test copy: this email was for jane.teacher@school.enara.app.');
    expect(sent()[3].html).toContain(`${TOOL}/reset-password?token=`);
    expect(sent()[4].html).toContain('Test copy: this email was for new.staff@school.enara.app.');
    expect(await legacy('jane.teacher@school.enara.app')).toBe(true);
    expect(posted()[0].to).toEqual([INBOX]);
    expect(posted()[0].subject).toBe('[lms-test] Your reminder');
    expect(posted()[0].html).toContain('Test copy: this email was for jane.teacher@school.enara.app.');
    expect((await rows()).map((r) => [r.template, r.status])).toEqual([
      ['enara-weekly-progress', 'sent'], ['parent-invite-en', 'sent'], ['parent-invite-ar', 'sent'],
      ['enara-password-reset', 'sent'], ['enara-class-invitation', 'sent'], ['legacy-email', 'sent'],
    ]);
    expect(await I.ceilingCount(day())).toBe(6);
  });

  it('reserved recipients are still refused first (nothing counted)', async () => {
    expect(await consent('someone@school.example')).toMatchObject({ ok: false, code: 'reserved_recipient' });
    expect(await legacy('demo@lms.enara.test')).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await I.ceilingCount(day())).toBe(0);
  });
});

// Owner, 25 Nov 2026: "make Resend send emails to any email (open)". LMS_EMAIL_OPEN_DELIVERY=true on staging: the real
// recipients, no prefix, no Test copy line; reserved addresses are still never sent to; the ceiling still counts.
describe('staging with LMS_EMAIL_OPEN_DELIVERY: real recipients', () => {
  beforeEach(() => setEnv({ ...LMS_TEST, LMS_EMAIL_OPEN_DELIVERY: 'true' }, { staging: true }));

  it('every path goes to the real address, no "[lms-test]" prefix, no Test copy line; counted against the ceiling', async () => {
    expect(await consent(PARENT)).toMatchObject({ ok: true });
    expect(await parentInvite(PARENT)).toMatchObject({ ok: true });
    await A.requestPasswordReset('jane.teacher@school.enara.app');
    expect(sent().map((x) => x.to)).toEqual([PARENT, PARENT, 'jane.teacher@school.enara.app']);
    expect(sent().every((x) => !x.subject.startsWith('[lms-test]') && !x.html.includes('Test copy'))).toBe(true);
    expect(sent()[0].subject).toBe("Please approve Omar's Enara account");
    expect(await legacy('jane.teacher@school.enara.app')).toBe(true);
    expect(posted()[0].to).toEqual(['jane.teacher@school.enara.app']);
    expect(posted()[0].html).not.toContain('Test copy');
    const r = await lmsEmail();
    expect(r.sent).toBe(1);
    expect(sent().at(-1)!.to).toBe(OPS);
    expect(sent().at(-1)!.subject.startsWith('[lms-test]')).toBe(false);
    expect((await rows()).every((x) => x.redirected === false)).toBe(true);
    expect(await I.ceilingCount(day())).toBe(5);
  });

  it('several recipients: each real address; reserved addresses dropped, never sent to', async () => {
    await T.sendTemplate('enara-welcome', ['a@school.enara.app', 'b@school.enara.app'], { NAME: 'A' });
    expect(sent()[0].to).toEqual(['a@school.enara.app', 'b@school.enara.app']);
    expect(await consent('someone@school.example')).toMatchObject({ ok: false, code: 'reserved_recipient' });
    expect(await legacy('demo@lms.enara.test')).toBe(false);
    expect(sent()).toHaveLength(1);
  });
});

describe('staging: no daily cap, ONE safety ceiling across every path', () => {
  it('no cap at 21+: 19 LMS + 2 parent emails (and more) are all sent when their event happens', async () => {
    setEnv(LMS_TEST, { staging: true });
    expect(I.emailPolicy().ceiling).toBe(300); // the default on staging
    for (let i = 0; i < 19; i++) expect(await lmsEmail()).toMatchObject({ sent: 1, held: 0 });
    expect(await consent(PARENT)).toMatchObject({ ok: true }); // the 20th
    expect(await consent(PARENT)).toMatchObject({ ok: true }); // the 21st: sent (no 20-a-day cap any more)
    expect(await weekly(PARENT)).toMatchObject({ ok: true });
    expect(await parentInvite(PARENT)).toMatchObject({ ok: true });
    expect(await legacy('jane.teacher@school.enara.app')).toBe(true);
    expect(sent()).toHaveLength(23);
    expect(posted()).toHaveLength(1);
    expect(sent().every((s) => s.to === INBOX)).toBe(true);
    expect(await I.ceilingCount(day())).toBe(24);
    expect(await I.heldToday()).toEqual({ total: 0, byTemplate: [] });
    expect(alertMails()).toHaveLength(0);
  });

  it('the ceiling at 300 (default): the 301st email of the day is held; ONE critical alert + audit + ONE alert email (exempt) a day', async () => {
    setEnv(LMS_TEST, { staging: true });
    // 300 emails across the paths (LMS, parent, legacy), in parallel bursts.
    for (let b = 0; b < 15; b++) {
      const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 3 === 0 ? lmsEmail().then((r) => r.sent === 1) : i % 3 === 1 ? consent(PARENT).then((r) => r.ok) : legacy('jane.teacher@school.enara.app'))));
      expect(burst.every(Boolean)).toBe(true);
    }
    expect(await I.ceilingCount(day())).toBe(300);
    expect(alertMails()).toHaveLength(0);
    // 301st, 302nd ... on every path: held, recorded, not sent.
    const calls = sendMock.mock.calls.length + fetchMock.mock.calls.length;
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'daily_ceiling' });
    expect(await weekly(PARENT)).toMatchObject({ ok: false, code: 'daily_ceiling' });
    expect(await parentInvite(PARENT)).toMatchObject({ ok: false, code: 'daily_ceiling' });
    expect(await legacy('jane.teacher@school.enara.app')).toBe(false);
    await A.requestPasswordReset('jane.teacher@school.enara.app');
    expect(await lmsEmail()).toMatchObject({ sent: 0, held: 1 });
    // Exactly one extra provider call: the alert email, exempt from the ceiling (the count stays 300).
    expect(sendMock.mock.calls.length + fetchMock.mock.calls.length).toBe(calls + 1);
    expect(alertMails()).toHaveLength(1);
    const alert = alertMails()[0];
    expect(alert.to).toBe(INBOX);
    expect(alert.subject).toBe('[lms-test] Email safety ceiling hit: 1 held');
    expect(alert.html).toContain('The email safety ceiling (300 emails per Cairo day, all send paths)');
    expect(alert.html).toContain(`Test copy: this email was for ${OPS}.`);
    expect(await I.ceilingCount(day())).toBe(300);
    expect(await Alerts.countDocuments({ kind: 'email_daily_ceiling_hit', severity: 'critical' })).toBe(1);
    expect(await audits('email_daily_ceiling_hit')).toBe(1);
    const held = await I.heldToday();
    expect(held.total).toBe(6);
    expect(held.byTemplate).toEqual(expect.arrayContaining([
      { template: 'enara-parent-consent', n: 1 }, { template: 'enara-weekly-progress', n: 1 }, { template: 'parent-invite-en', n: 1 },
      { template: 'legacy-email', n: 1 }, { template: 'enara-password-reset', n: 1 }, { template: 'lms-ops-daily-digest', n: 1 },
    ]));
    expect((await M.LmsEmailLog.find({ template: 'email-ceiling-alert' }).lean()).map((r) => r.status)).toEqual(['sent']);
  });

  it('one alert only, even under parallel sends past the ceiling', async () => {
    setEnv({ ...LMS_TEST, EMAIL_DAILY_CEILING: '5' }, { staging: true });
    const results = await Promise.all([
      ...Array.from({ length: 6 }, () => consent(PARENT).then((r) => r.ok)),
      ...Array.from({ length: 6 }, () => parentInvite(PARENT).then((r) => r.ok)),
      ...Array.from({ length: 6 }, () => lmsEmail().then((r) => r.sent === 1)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(sent().length - alertMails().length).toBe(5);
    expect(alertMails()).toHaveLength(1);
    expect(await Alerts.countDocuments({ kind: 'email_daily_ceiling_hit' })).toBe(1);
    expect(await audits('email_daily_ceiling_hit')).toBe(1);
    expect(await I.ceilingCount(day())).toBe(5);
  });
});

describe('staging without REMINDER_TEST_RECIPIENT: nothing is sent to a real address', () => {
  it('every path refuses with staging_no_test_inbox (logged), Resend / fetch never called', async () => {
    setEnv(ON, { staging: true });
    const refused = { ok: false, code: 'staging_no_test_inbox' };
    expect(await consent(PARENT)).toMatchObject(refused);
    expect(await weekly(PARENT)).toMatchObject(refused);
    expect(await parentInvite(PARENT)).toMatchObject(refused);
    expect(await B.deliverRendered({ kind: 'lms', alias: 'lms-x-en', to: PARENT, subject: 'S', html: '<p>x</p>' })).toMatchObject(refused);
    expect(await legacy('jane.teacher@school.enara.app')).toBe(false);
    await A.requestPasswordReset('jane.teacher@school.enara.app');
    await A.createInvitation({ institutionId: 'inst-a', email: 'other.staff@school.enara.app', role: 'teacher', invitedBy: 'nobody' });
    expect(await lmsEmail()).toMatchObject({ sent: 0, codes: ['lms_emails_off'] }); // the LMS interlock
    expect(sendMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it('ENARA_STAGING=true but the config cannot be read: still refused (fails closed)', async () => {
    process.env.ENARA_STAGING = 'true';
    resetConfigForTests(); // the staging isolation check makes getConfig() throw in this test process
    expect(() => getConfig()).toThrow();
    expect(await B.deliverRendered({ kind: 'parent', alias: 'parent-invite-en', to: PARENT, subject: 'S', html: '<p>x</p>' })).toMatchObject({ ok: false, code: 'staging_no_test_inbox' });
    delete process.env.ENARA_STAGING;
    resetConfigForTests();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('staging + LMS_EMAIL_CAPTURE (the E2E stack): recorded, never sent', () => {
  it('captured without any RESEND_API_KEY, counted against the ceiling; the alert is captured too; Resend never called', async () => {
    setEnv({ ...LMS_TEST, RESEND_API_KEY: undefined, LMS_EMAIL_CAPTURE: 'true', EMAIL_DAILY_CEILING: '2' }, { staging: true });
    expect(await consent(PARENT)).toEqual({ ok: true, id: 'captured' });
    expect(await parentInvite(PARENT)).toEqual({ ok: true, id: 'captured' });
    expect(await weekly(PARENT)).toMatchObject({ ok: false, code: 'daily_ceiling' });
    expect(sendMock).not.toHaveBeenCalled();
    expect((await rows()).map((r) => [r.template, r.status, r.redirected])).toEqual([
      ['enara-parent-consent', 'captured', true], ['parent-invite-en', 'captured', true], ['email-ceiling-alert', 'captured', true], ['enara-weekly-progress', 'held', true],
    ]);
  });
});

describe('the provider (Resend free tier: 100/day, 3,000/month, 10 requests/second)', () => {
  const quota = (name: string) => async () => ({ data: null, error: { name, message: 'You have reached your daily email sending quota.', statusCode: 429 } });

  it('daily quota refused: failed and recorded, ONE critical alert + audit a day, then held without calling Resend again (no retry storm), never thrown', async () => {
    setEnv(LMS_TEST, { staging: true });
    sendMock.mockImplementation(quota('daily_quota_exceeded'));
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'daily_quota_exceeded' });
    expect(sendMock).toHaveBeenCalledTimes(1);
    // Every later email today is held before Resend: on every path.
    expect(await weekly(PARENT)).toMatchObject({ ok: false, code: 'provider_quota' });
    expect(await parentInvite(PARENT)).toMatchObject({ ok: false, code: 'provider_quota' });
    expect(await lmsEmail()).toMatchObject({ sent: 0, held: 1, codes: ['provider_quota'] });
    expect(await legacy('jane.teacher@school.enara.app')).toBe(false); // the legacy path shares the same state
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await Alerts.countDocuments({ kind: 'email_provider_quota_hit', severity: 'critical' })).toBe(1);
    expect(await audits('email_provider_quota_hit')).toBe(1);
    const statuses = (await rows()).map((r) => [r.template, r.status, r.code]);
    expect(statuses).toEqual(expect.arrayContaining([
      ['enara-parent-consent', 'failed', 'daily_quota_exceeded'], ['enara-weekly-progress', 'held', 'provider_quota'],
      ['parent-invite-en', 'held', 'provider_quota'], ['lms-ops-daily-digest', 'held', 'provider_quota'], ['legacy-email', 'held', 'provider_quota'],
    ]));
  });

  it('a 429 from the legacy HTTP path (monthly quota) and rate limiting: failed, never thrown, still one alert a day', async () => {
    setEnv(LMS_TEST, { staging: true });
    sendMock.mockImplementation(quota('rate_limit_exceeded'));
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'rate_limit_exceeded' });
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'rate_limit_exceeded' }); // a rate limit does not block the day
    expect(sendMock).toHaveBeenCalledTimes(2);
    fetchMock.mockImplementation(async () => new Response('{"name":"monthly_quota_exceeded","message":"quota"}', { status: 429 }));
    expect(await legacy('jane.teacher@school.enara.app')).toBe(false);
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'provider_quota' }); // monthly quota: held for the day
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(await Alerts.countDocuments({ kind: 'email_provider_quota_hit' })).toBe(1);
    // An exception inside the SDK is a failure, not a crash.
    T.resetEmailClientForTests();
    sendMock.mockImplementation(async () => { throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }); });
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'ECONNRESET' });
  });

  it('not staging: a quota refusal is still handled (no throw, one alert), the email otherwise unchanged', async () => {
    sendMock.mockImplementation(quota('daily_quota_exceeded'));
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'daily_quota_exceeded' });
    expect(await consent(PARENT)).toMatchObject({ ok: false, code: 'provider_quota' });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sent()[0].to).toBe(PARENT);
    expect(await Alerts.countDocuments({ kind: 'email_provider_quota_hit' })).toBe(1);
  });

  it('paces provider calls under 10 requests per second (bursts queue, nothing is dropped)', async () => {
    setEnv(LMS_TEST, { staging: true });
    V.resetEmailProviderForTests({ paceMs: 110 });
    const at: number[] = [];
    sendMock.mockImplementation(async () => { at.push(Date.now()); return { data: { id: `re_${++n}` }, error: null }; });
    const results = await Promise.all(Array.from({ length: 12 }, () => consent(PARENT)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(at).toHaveLength(12);
    const sorted = [...at].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(100);
    // No more than 10 in any one-second window.
    for (let i = 0; i < sorted.length; i++) expect(sorted.filter((t) => t >= sorted[i] && t < sorted[i] + 1000).length).toBeLessThanOrEqual(10);
    V.resetEmailProviderForTests({ paceMs: 0 });
  });
});
