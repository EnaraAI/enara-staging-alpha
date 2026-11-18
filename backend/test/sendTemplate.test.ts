import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

vi.mock('../src/config/env', async (orig) => ({
  ...(await orig<typeof import('../src/config/env')>()),
  getConfig: () => ({ appUrl: 'https://app.example.org/' }),
}));

import { logger } from '../src/utils/logging';
import fs from 'fs';
import path from 'path';
import { sendTemplate, resetEmailClientForTests, fillPlaceholders } from '../src/email/sendTemplate';
import { TEMPLATES_BUNDLE } from '../src/email/templatesBundle';
import { buildBundleSource } from '../../scripts/email/bundle-templates';
import { EMAIL_SENDER, TEMPLATE_REGISTRY } from '../src/email/templateRegistry';

// Not a reserved domain (sendTemplate refuses example.com, .test etc.: P0 item 4).
// Resend is mocked: nothing is sent.
const EMAIL = 'jane.doe@qa.enara.app';
const NAME = 'Jane Doe';
const TEMPLATES_DIR = path.join(__dirname, '../src/email/templates');

describe('sendTemplate', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sendMock.mockReset();
    resetEmailClientForTests();
    process.env.RESEND_API_KEY = 're_test_dummy';
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    errorSpy.mockRestore();
  });

  const loggedText = () => JSON.stringify(errorSpy.mock.calls);

  it('type-level: requires exactly the registry variables', () => {
    const typeOnly = () => {
      // @ts-expect-error extra variable
      void sendTemplate('enara-welcome', EMAIL, { NAME, EXTRA: 'y' });
      // @ts-expect-error unknown alias
      void sendTemplate('enara-nope', EMAIL, { NAME });
      // @ts-expect-error ACTION_URL is built in code for linked aliases
      void sendTemplate('enara-welcome', EMAIL, { NAME, ACTION_URL: 'x' });
      // @ts-expect-error ACTION_URL instead of token
      void sendTemplate('enara-password-reset', EMAIL, { NAME, ACTION_URL: 'x', EXPIRES_IN: '1 hour' });
      // @ts-expect-error missing token
      void sendTemplate('enara-password-reset', EMAIL, { NAME, EXPIRES_IN: '1 hour' });
      // @ts-expect-error missing token
      void sendTemplate('enara-class-invitation', EMAIL, { NAME, TEACHER_NAME: 'T', CLASS_NAME: 'C', EXPIRES_IN: '7 days' });
      // @ts-expect-error missing assessmentId
      void sendTemplate('enara-assessment-results', EMAIL, { NAME, CHILD_NAME: 'c', TEST_NAME: 't', SCORE: 1, LEVEL: 'l', SUMMARY: 's' });
      // @ts-expect-error missing courseId
      void sendTemplate('enara-lesson-reminder', EMAIL, { NAME, LESSON_TITLE: 'L' });
      // @ts-expect-error verify-email has no page: ACTION_URL stays required
      void sendTemplate('enara-verify-email', EMAIL, { NAME, EXPIRES_IN: '1 day' });
      void sendTemplate('enara-welcome', EMAIL, { NAME });
      void sendTemplate('enara-password-reset', EMAIL, { NAME, EXPIRES_IN: '1 hour', token: 't' });
      void sendTemplate('enara-assessment-results', EMAIL, { NAME, CHILD_NAME: 'c', TEST_NAME: 't', SCORE: 1, LEVEL: 'l', SUMMARY: 's', assessmentId: 'a' });
      void sendTemplate('enara-lesson-reminder', EMAIL, { NAME, LESSON_TITLE: 'L', courseId: 'c' });
      void sendTemplate('enara-verify-email', EMAIL, { NAME, ACTION_URL: 'https://x', EXPIRES_IN: '1 day' });
      // @ts-expect-error parent-consent: ACTION_URL is built in code (never carries the code)
      void sendTemplate('enara-parent-consent', EMAIL, { NAME, CHILD_NAME: 'c', LINK_CODE: 'ENR-ABCD-EFGH', ACTION_URL: 'https://x', EXPIRES_IN: '1 day' });
      // @ts-expect-error parent-consent: LINK_CODE is required
      void sendTemplate('enara-parent-consent', EMAIL, { NAME, CHILD_NAME: 'c', EXPIRES_IN: '1 day' });
      void sendTemplate('enara-parent-consent', EMAIL, { NAME, CHILD_NAME: 'c', LINK_CODE: 'ENR-ABCD-EFGH', EXPIRES_IN: '1 day' });
    };
    expect(typeof typeOnly).toBe('function');
  });

  it('sends rendered html + subject with both inline logos (success path)', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    const vars = { NAME, EXPIRES_IN: '1 hour', token: 'a b/c' };
    const result = await sendTemplate('enara-password-reset', EMAIL, vars);
    const app = 'https://app.example.org';
    expect(result).toEqual({ ok: true, id: 'email_123' });
    expect(sendMock).toHaveBeenCalledWith({
      from: EMAIL_SENDER,
      to: EMAIL,
      subject: 'Reset your Enara password',
      html: expect.any(String),
      attachments: [
        expect.objectContaining({ contentId: 'enara-logo', contentType: 'image/png', filename: 'enara-logo.png' }),
        expect.objectContaining({ contentId: 'enara-logo-white', contentType: 'image/png', filename: 'enara-logo-white.png' }),
      ],
    });
    const sent = sendMock.mock.calls[0][0];
    expect(sent).not.toHaveProperty('template');
    expect(sent.html).toContain(NAME);
    expect(sent.html).toContain('1 hour');
    expect(sent.html).toContain(`${app}/reset-password?token=a%20b%2Fc`);
    expect(sent.html).toContain('src="cid:enara-logo"');
    expect(sent.html).toContain('src="cid:enara-logo-white"');
    expect(sent.html).not.toContain('assets.enara.app/email/');
    expect(sent.html).not.toMatch(/\{\{/);
  });

  it('fills subject variables', async () => {
    sendMock.mockResolvedValue({ data: { id: 'e' }, error: null });
    await sendTemplate('enara-class-invitation', EMAIL, { NAME, TEACHER_NAME: 'Ms <B>', CLASS_NAME: 'Year 5 English', EXPIRES_IN: '7 days', token: 't' });
    const sent = sendMock.mock.calls[0][0];
    expect(sent.subject).toBe("You're invited to join Year 5 English on Enara");
    expect(sent.html).toContain('Ms <B>'); // triple-brace: not escaped, as in Resend
  });

  it('uses fallback_value from the template json when a value is empty', async () => {
    sendMock.mockResolvedValue({ data: { id: 'e' }, error: null });
    await sendTemplate('enara-welcome', EMAIL, { NAME: '' });
    const sent = sendMock.mock.calls[0][0];
    const meta = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, 'enara-welcome.json'), 'utf8'));
    const fb = meta.variables.find((v: any) => v.key === 'NAME').fallback_value;
    expect(sent.html).toContain(fb);
    expect(sent.html).not.toContain(NAME);
    expect(sent.html).not.toMatch(/\{\{/);
  });

  it('fillPlaceholders: triple raw, double escaped, fallback, unknown left in place', () => {
    const out = fillPlaceholders('{{{A}}}|{{A}}|{{{B}}}|{{{C}}}', { A: '<x&>' }, { B: 'fb' });
    expect(out).toBe('<x&>|&lt;x&amp;&gt;|fb|{{{C}}}');
  });

  it('fails with unfilled_placeholder if a placeholder remains, without calling Resend', async () => {
    const orig = TEMPLATES_BUNDLE['enara-welcome'];
    (TEMPLATES_BUNDLE as any)['enara-welcome'] = { ...orig, html: orig.html + '{{{UNKNOWN_VAR}}}' };
    try {
      const result = await sendTemplate('enara-welcome', EMAIL, { NAME });
      expect(result).toMatchObject({ ok: false, code: 'unfilled_placeholder' });
      expect(sendMock).not.toHaveBeenCalled();
    } finally {
      (TEMPLATES_BUNDLE as any)['enara-welcome'] = orig;
    }
  });

  it('templatesBundle.ts matches templates/*.html and *.json byte-for-byte (re-run bundle-templates.ts)', () => {
    const files = fs.readdirSync(TEMPLATES_DIR).filter((n) => n.endsWith('.html')).map((n) => n.replace(/\.html$/, '')).sort();
    expect(Object.keys(TEMPLATES_BUNDLE).sort()).toEqual(files);
    for (const alias of files) {
      const b = (TEMPLATES_BUNDLE as any)[alias];
      expect(b.html === fs.readFileSync(path.join(TEMPLATES_DIR, `${alias}.html`), 'utf8'), alias).toBe(true);
      const meta = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, `${alias}.json`), 'utf8'));
      expect(b.subject, alias).toBe(meta.subject);
      const fallbacks = Object.fromEntries(meta.variables.filter((v: any) => v.fallback_value != null).map((v: any) => [v.key, String(v.fallback_value)]));
      expect(b.fallbacks, alias).toEqual(fallbacks);
    }
    expect(fs.readFileSync(path.join(TEMPLATES_DIR, '../templatesBundle.ts'), 'utf8')).toBe(buildBundleSource());
  });

  it('templates use the hosted logos; the inline logo data matches the assets', async () => {
    const { LOGO_PNG_BASE64, LOGO_WHITE_PNG_BASE64 } = await import('../src/email/logoInline');
    const png = fs.readFileSync(path.join(__dirname, '../src/email/assets/enara-logo.png'));
    expect(Buffer.from(LOGO_PNG_BASE64, 'base64').equals(png)).toBe(true);
    const white = fs.readFileSync(path.join(__dirname, '../src/email/assets/enara-logo-white.png'));
    expect(Buffer.from(LOGO_WHITE_PNG_BASE64, 'base64').equals(white)).toBe(true);
    for (const f of fs.readdirSync(TEMPLATES_DIR).filter((n) => n.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8');
      expect(html, f).toContain('src="https://assets.enara.app/email/enara-logo.png"');
      expect(html, f).toContain('src="https://assets.enara.app/email/enara-logo-white.png"');
      expect(html, f).toContain('prefers-color-scheme: dark');
      expect(html, f).not.toContain('cid:');
    }
  });

  it('renders every alias with cid logos, filled subject and no leftover placeholders', async () => {
    sendMock.mockResolvedValue({ data: { id: 'e' }, error: null });
    for (const [alias, entry] of Object.entries(TEMPLATE_REGISTRY)) {
      const { TEMPLATE_LINKS } = await import('../src/email/links');
      const linkParams: readonly string[] = (TEMPLATE_LINKS as Record<string, { params: readonly string[] }>)[alias]?.params ?? [];
      const keys = alias in TEMPLATE_LINKS ? [...entry.variables.filter((k) => k !== 'ACTION_URL'), ...linkParams] : [...entry.variables];
      const vars = Object.fromEntries(keys.map((k) => [k, 'v']));
      const r = await sendTemplate(alias as any, EMAIL, vars as any);
      expect(r, alias).toMatchObject({ ok: true });
      const sent = sendMock.mock.lastCall![0];
      expect(sent.html, alias).toContain('src="cid:enara-logo"');
      expect(sent.html, alias).toContain('src="cid:enara-logo-white"');
      expect(sent.html, alias).not.toContain('assets.enara.app/email/');
      expect(sent.html, alias).not.toMatch(/\{\{/);
      expect(sent.subject, alias).not.toMatch(/\{\{/);
      expect(sent.subject, alias).toBe(fillPlaceholders(TEMPLATES_BUNDLE[alias as keyof typeof TEMPLATES_BUNDLE].subject, vars, {}));
    }
    expect(sendMock).toHaveBeenCalledTimes(8);
  });

  it('rejects missing and extra variables at runtime without calling Resend', async () => {
    const missing = await sendTemplate('enara-password-reset', EMAIL, { NAME, EXPIRES_IN: '1 hour' } as any);
    expect(missing).toMatchObject({ ok: false, code: 'invalid_variables' });
    expect((missing as any).message).toContain('token');
    const handUrl = await sendTemplate('enara-welcome', EMAIL, { NAME, ACTION_URL: 'x' } as any);
    expect(handUrl).toMatchObject({ ok: false, code: 'invalid_variables' });
    expect((handUrl as any).message).toContain('ACTION_URL');
    const empty = await sendTemplate('enara-lesson-reminder', EMAIL, { NAME, LESSON_TITLE: 'L', courseId: ' ' });
    expect(empty).toMatchObject({ ok: false, code: 'invalid_variables' });
    const extra = await sendTemplate('enara-welcome', EMAIL, { NAME, FOO: 'y' } as any);
    expect(extra).toMatchObject({ ok: false, code: 'invalid_variables' });
    expect((extra as any).message).toContain('FOO');
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(NAME);
  });

  it('logs API errors with alias + code only, no PII', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: `Invalid \`to\` field: ${EMAIL}`, statusCode: 422 },
    });
    const result = await sendTemplate('enara-welcome', EMAIL, { NAME });
    expect(result).toMatchObject({ ok: false, code: 'validation_error' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][1]).toMatchObject({ alias: 'enara-welcome', code: 'validation_error' });
    expect(loggedText()).not.toContain(EMAIL);
    expect(loggedText()).not.toContain(NAME);
    expect(JSON.stringify(result)).not.toContain(EMAIL);
  });

  it('handles thrown exceptions without PII', async () => {
    sendMock.mockRejectedValue(Object.assign(new Error(`network down for ${EMAIL}`), { code: 'ECONNRESET' }));
    const result = await sendTemplate('enara-welcome', [EMAIL], { NAME });
    expect(result).toMatchObject({ ok: false, code: 'ECONNRESET' });
    expect(loggedText()).not.toContain(EMAIL);
    expect(loggedText()).not.toContain(NAME);
  });

  it('returns missing_api_key when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendTemplate('enara-welcome', EMAIL, { NAME });
    expect(result).toMatchObject({ ok: false, code: 'missing_api_key' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(EMAIL);
  });
});
