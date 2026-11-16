import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Email links built in code + account emails switched to Resend templates.
const cfg = vi.hoisted(() => ({ appUrl: 'https://app.example.org/' as string, testRecipient: undefined as string | undefined }));
vi.mock('../src/config/env', async (orig) => {
  const actual = await orig<typeof import('../src/config/env')>();
  return {
    ...actual,
    getConfig: () => ({ appUrl: cfg.appUrl, bcryptRounds: 4, email: { enabled: false, testRecipient: cfg.testRecipient } }),
  };
});

const sendMock = vi.fn();
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })) }));

const db = vi.hoisted(() => ({
  user: null as null | { _id: string; email: string; name?: string },
  inviter: null as null | { name?: string },
  school: null as null | { name?: string },
}));
const lean = (v: unknown) => ({ select: () => ({ lean: async () => v }), lean: async () => v });
vi.mock('../src/models/AccountToken', () => ({
  Invitation: {
    updateMany: vi.fn(async () => ({})),
    create: vi.fn(async (doc: Record<string, unknown>) => doc),
  },
  PasswordReset: { create: vi.fn(async () => ({})) },
}));
vi.mock('../src/models/User', () => ({
  User: {
    exists: vi.fn(async () => null),
    findOne: vi.fn(() => ({ select: async () => db.user })),
    findById: vi.fn(() => lean(db.inviter)),
  },
}));
vi.mock('../src/models/Institution', () => ({ Institution: { findOne: vi.fn(() => lean(db.school)) } }));
const legacySend = vi.fn(async (_p: unknown) => false);
vi.mock('../src/services/emailService', async (orig) => ({
  ...(await orig<typeof import('../src/services/emailService')>()),
  sendEmail: (p: unknown) => legacySend(p),
}));

import { logger } from '../src/utils/logging';
import { buildActionUrl } from '../src/email/links';
import { sendTemplate, resetEmailClientForTests, renderTemplate } from '../src/email/sendTemplate';
import { createInvitation, requestPasswordReset, formatTtl } from '../src/services/accountTokens';

/** The sent email is exactly the bundled template rendered with these variables. */
function expectRendered(arg: any, alias: Parameters<typeof renderTemplate>[0], vars: Record<string, string | number>) {
  const r = renderTemplate(alias, vars);
  expect(arg.subject).toBe(r.subject);
  expect(arg.html).toBe(r.html);
  expect(arg).not.toHaveProperty('template');
}

const INVITER_ID = '64b7f0c2a1b2c3d4e5f60718';

describe('buildActionUrl', () => {
  it('builds each alias link from the app URL', () => {
    const app = 'https://app.example.org';
    expect(buildActionUrl('enara-welcome', {}, app)).toBe(`${app}/`);
    expect(buildActionUrl('enara-weekly-progress', {}, app)).toBe(`${app}/`);
    expect(buildActionUrl('enara-password-reset', { token: 'tok' }, app)).toBe(`${app}/reset-password?token=tok`);
    expect(buildActionUrl('enara-class-invitation', { token: 'tok' }, app)).toBe(`${app}/accept-invitation?token=tok`);
    expect(buildActionUrl('enara-assessment-results', { assessmentId: 'as-1' }, app)).toBe(`${app}/?assessment=as-1`);
    expect(buildActionUrl('enara-lesson-reminder', { courseId: 'c-1' }, app)).toBe(`${app}/?course=c-1`);
  });

  it('trims trailing slashes and encodes params', () => {
    expect(buildActionUrl('enara-welcome', {}, 'https://a.org///')).toBe('https://a.org/');
    expect(buildActionUrl('enara-password-reset', { token: 'a+b/c=&d e' }, 'https://a.org/')).toBe(
      'https://a.org/reset-password?token=a%2Bb%2Fc%3D%26d%20e',
    );
    expect(buildActionUrl('enara-lesson-reminder', { courseId: 'x&y=z' }, 'https://a.org')).toBe('https://a.org/?course=x%26y%3Dz');
  });

  it('throws missing_app_url without an app URL', () => {
    expect(() => buildActionUrl('enara-welcome', {}, '')).toThrow(expect.objectContaining({ code: 'missing_app_url' }));
  });

  it('type-level: params per alias', () => {
    const typeOnly = () => {
      // @ts-expect-error missing token
      buildActionUrl('enara-password-reset', {});
      // @ts-expect-error missing assessmentId
      buildActionUrl('enara-assessment-results', {});
      // @ts-expect-error missing courseId
      buildActionUrl('enara-lesson-reminder', {});
      // @ts-expect-error no page for verify-email
      buildActionUrl('enara-verify-email', {});
    };
    expect(typeof typeOnly).toBe('function');
  });
});

describe('sendTemplate links + account emails', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    cfg.appUrl = 'https://app.example.org/';
    cfg.testRecipient = undefined;
    sendMock.mockReset().mockResolvedValue({ data: { id: 'email_1' }, error: null });
    legacySend.mockClear();
    resetEmailClientForTests();
    process.env.RESEND_API_KEY = 're_test_dummy';
    db.user = { _id: 'u1', email: 'jane@example.com', name: 'Jane' };
    db.inviter = { name: 'Ms Teacher' };
    db.school = { name: 'Alpha School' };
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    errorSpy.mockRestore();
  });

  it('fails with missing_app_url and sends nothing', async () => {
    cfg.appUrl = '';
    const r = await sendTemplate('enara-welcome', 'jane@example.com', { NAME: 'Jane' });
    expect(r).toMatchObject({ ok: false, code: 'missing_app_url' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('builds ACTION_URL for assessment and lesson templates', async () => {
    await sendTemplate('enara-assessment-results', 'j@example.com', { NAME: 'J', CHILD_NAME: 'K', TEST_NAME: 'T', SCORE: 9, LEVEL: 'B1', SUMMARY: 'S', assessmentId: 'as 1' });
    expectRendered(sendMock.mock.lastCall![0], 'enara-assessment-results', { NAME: 'J', CHILD_NAME: 'K', TEST_NAME: 'T', SCORE: 9, LEVEL: 'B1', SUMMARY: 'S', ACTION_URL: 'https://app.example.org/?assessment=as%201' });
    await sendTemplate('enara-lesson-reminder', 'j@example.com', { NAME: 'J', LESSON_TITLE: 'L', courseId: 'c1' });
    expect(sendMock.mock.lastCall![0].html).toContain('href="https://app.example.org/?course=c1"');
    await sendTemplate('enara-verify-email', 'j@example.com', { NAME: 'J', ACTION_URL: 'https://custom/verify', EXPIRES_IN: '1 day' });
    expect(sendMock.mock.lastCall![0].html).toContain('href="https://custom/verify"');
  });

  it('password reset uses enara-password-reset with the token link and real expiry', async () => {
    const token = await requestPasswordReset('jane@example.com');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe('jane@example.com');
    expectRendered(arg, 'enara-password-reset', { NAME: 'Jane', EXPIRES_IN: '30 minutes', ACTION_URL: `https://app.example.org/reset-password?token=${encodeURIComponent(token!)}` });
    expect(arg.attachments).toHaveLength(2);
    expect(legacySend).not.toHaveBeenCalled();
  });

  it('invitation uses enara-class-invitation with inviter, school and 7-day expiry', async () => {
    const { token } = await createInvitation({ institutionId: 'instA', email: 'new@example.com', role: 'teacher', invitedBy: INVITER_ID });
    const arg = sendMock.mock.calls[0][0];
    expectRendered(arg, 'enara-class-invitation', { NAME: 'there', TEACHER_NAME: 'Ms Teacher', CLASS_NAME: 'Alpha School', EXPIRES_IN: '7 days', ACTION_URL: `https://app.example.org/accept-invitation?token=${encodeURIComponent(token)}` });
  });

  it('invitation falls back to the school name, then ENARA', async () => {
    db.inviter = null;
    await createInvitation({ institutionId: 'instA', email: 'new@example.com', role: 'teacher', invitedBy: 'not-an-object-id' });
    expect(sendMock.mock.lastCall![0].subject).toBe("You're invited to join Alpha School on Enara");
    expect(sendMock.mock.lastCall![0].html).not.toContain('Ms Teacher');
    db.school = null;
    await createInvitation({ institutionId: 'instA', email: 'new2@example.com', role: 'teacher', invitedBy: INVITER_ID });
    expect(sendMock.mock.lastCall![0].subject).toBe("You're invited to join ENARA on Enara");
    expect(sendMock.mock.lastCall![0].html).not.toContain('Alpha School');
  });

  it('skips .test addresses and honours the test recipient', async () => {
    await createInvitation({ institutionId: 'instA', email: 'x@a.test', role: 'teacher', invitedBy: INVITER_ID });
    expect(sendMock).not.toHaveBeenCalled();
    cfg.testRecipient = 'inbox@example.com';
    await requestPasswordReset('jane@example.com');
    expect(sendMock.mock.calls[0][0].to).toBe('inbox@example.com');
  });

  it('without RESEND_API_KEY keeps the previous sendEmail path', async () => {
    delete process.env.RESEND_API_KEY;
    await requestPasswordReset('jane@example.com');
    await createInvitation({ institutionId: 'instA', email: 'new@example.com', role: 'teacher', invitedBy: INVITER_ID });
    expect(sendMock).not.toHaveBeenCalled();
    expect(legacySend).toHaveBeenCalledTimes(2);
  });

  it('formats TTLs', () => {
    expect(formatTtl(30 * 60 * 1000)).toBe('30 minutes');
    expect(formatTtl(7 * 86_400_000)).toBe('7 days');
    expect(formatTtl(3_600_000)).toBe('1 hour');
  });
});
