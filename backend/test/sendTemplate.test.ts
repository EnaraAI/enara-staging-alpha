import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { logger } from '../src/utils/logging';
import { sendTemplate, resetEmailClientForTests } from '../src/email/sendTemplate';
import { EMAIL_SENDER, TEMPLATE_REGISTRY } from '../src/email/templateRegistry';

const EMAIL = 'jane.doe@example.com';
const NAME = 'Jane Doe';

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
      // @ts-expect-error missing ACTION_URL
      void sendTemplate('enara-welcome', EMAIL, { NAME });
      // @ts-expect-error extra variable
      void sendTemplate('enara-welcome', EMAIL, { NAME, ACTION_URL: 'x', EXTRA: 'y' });
      // @ts-expect-error unknown alias
      void sendTemplate('enara-nope', EMAIL, { NAME });
      void sendTemplate('enara-password-reset', EMAIL, { NAME, ACTION_URL: 'x', EXPIRES_IN: '1 hour' });
    };
    expect(typeof typeOnly).toBe('function');
  });

  it('sends by template id with the sender and variables (success path)', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    const vars = { NAME, ACTION_URL: 'https://enara.app/r', EXPIRES_IN: '1 hour' };
    const result = await sendTemplate('enara-password-reset', EMAIL, vars);
    expect(result).toEqual({ ok: true, id: 'email_123' });
    expect(sendMock).toHaveBeenCalledWith({
      from: EMAIL_SENDER,
      to: EMAIL,
      template: { id: '15397fc6-acaa-453d-a103-b80d9e0f6394', variables: vars },
      attachments: [expect.objectContaining({ contentId: 'enara-logo', contentType: 'image/png', filename: 'enara-logo.png' })],
    });
    expect(sendMock.mock.calls[0][0]).not.toHaveProperty('html');
  });

  it('attaches the inline logo that every template references as cid:enara-logo', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { LOGO_PNG_BASE64 } = await import('../src/email/logoInline');
    const png = fs.readFileSync(path.join(__dirname, '../src/email/assets/enara-logo.png'));
    expect(Buffer.from(LOGO_PNG_BASE64, 'base64').equals(png)).toBe(true);
    const dir = path.join(__dirname, '../src/email/templates');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(html, f).toContain('src="cid:enara-logo"');
      expect(html, f).not.toContain('assets.enara.app/email/enara-logo.png');
    }
  });

  it('maps every alias to its registry id', async () => {
    sendMock.mockResolvedValue({ data: { id: 'e' }, error: null });
    for (const [alias, entry] of Object.entries(TEMPLATE_REGISTRY)) {
      const vars = Object.fromEntries(entry.variables.map((k) => [k, 'v']));
      await sendTemplate(alias as any, EMAIL, vars as any);
      expect(sendMock.mock.lastCall![0].template.id).toBe(entry.id);
    }
    expect(sendMock).toHaveBeenCalledTimes(8);
  });

  it('rejects missing and extra variables at runtime without calling Resend', async () => {
    const missing = await sendTemplate('enara-welcome', EMAIL, { NAME } as any);
    expect(missing).toMatchObject({ ok: false, code: 'invalid_variables' });
    expect((missing as any).message).toContain('ACTION_URL');
    const extra = await sendTemplate('enara-welcome', EMAIL, { NAME, ACTION_URL: 'x', FOO: 'y' } as any);
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
    const result = await sendTemplate('enara-welcome', EMAIL, { NAME, ACTION_URL: 'https://enara.app' });
    expect(result).toMatchObject({ ok: false, code: 'validation_error' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][1]).toMatchObject({ alias: 'enara-welcome', code: 'validation_error' });
    expect(loggedText()).not.toContain(EMAIL);
    expect(loggedText()).not.toContain(NAME);
    expect(JSON.stringify(result)).not.toContain(EMAIL);
  });

  it('handles thrown exceptions without PII', async () => {
    sendMock.mockRejectedValue(Object.assign(new Error(`network down for ${EMAIL}`), { code: 'ECONNRESET' }));
    const result = await sendTemplate('enara-welcome', [EMAIL], { NAME, ACTION_URL: 'x' });
    expect(result).toMatchObject({ ok: false, code: 'ECONNRESET' });
    expect(loggedText()).not.toContain(EMAIL);
    expect(loggedText()).not.toContain(NAME);
  });

  it('returns missing_api_key when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendTemplate('enara-welcome', EMAIL, { NAME, ACTION_URL: 'x' });
    expect(result).toMatchObject({ ok: false, code: 'missing_api_key' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(EMAIL);
  });
});
