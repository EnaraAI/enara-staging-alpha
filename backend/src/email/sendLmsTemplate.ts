import { logger } from '../utils/logging';
import { LMS_TEMPLATES_BUNDLE, type LmsTemplateAlias } from './lms/lmsTemplatesBundle';
import { LOGO_CONTENT_ID, LOGO_FILENAME, LOGO_PNG_BASE64, LOGO_WHITE_CONTENT_ID, LOGO_WHITE_FILENAME, LOGO_WHITE_PNG_BASE64 } from './logoInline';
import { isReservedRecipient } from './reservedRecipients';
import { fillPlaceholders, getEmailClient, HOSTED_LOGO_URL, HOSTED_LOGO_WHITE_URL, type SendTemplateResult } from './sendTemplate';
import { emailSender } from './templateRegistry';

// LMS emails (lms-*-en / lms-*-ar, owner decision D1: one template per
// language). The HTML lives in ./lms (bundled into lmsTemplatesBundle.ts), not
// in ./templates: these are not Resend-hosted templates and are never pushed or
// published there. Rendered the same way as sendTemplate (Resend-style
// placeholders, inline logos). Callers (integrations/lms/core/lmsEmail.ts) add
// the LMS gates (LMS_EMAILS_ENABLED, REMINDERS_ENABLED, RESEND_API_KEY) and
// never pass a token, a link code or personal data other than the
// recipient's own name.

const LEFTOVER = /\{\{\{?\s*[A-Za-z0-9_]+\s*\}?\}\}/;
const EMAIL_PATTERN = /[^\s@<>"']+@[^\s@<>"']+/g;

function fail(alias: string, code: string, message: string): SendTemplateResult {
  const safe = message.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
  logger.error('email.send_lms_template_failed', { alias, code, message: safe });
  return { ok: false, code, message: safe };
}

export function renderLmsTemplate(alias: LmsTemplateAlias, values: Record<string, string>): { subject: string; html: string } {
  const t = LMS_TEMPLATES_BUNDLE[alias];
  const html = fillPlaceholders(t.html, values, t.fallbacks)
    .split(HOSTED_LOGO_WHITE_URL).join(`cid:${LOGO_WHITE_CONTENT_ID}`)
    .split(HOSTED_LOGO_URL).join(`cid:${LOGO_CONTENT_ID}`);
  return { subject: fillPlaceholders(t.subject, values, t.fallbacks), html };
}

export async function sendLmsTemplate(alias: LmsTemplateAlias, to: string, variables: Record<string, string>): Promise<SendTemplateResult> {
  const t = LMS_TEMPLATES_BUNDLE[alias] as { variables: readonly string[] } | undefined;
  if (!t) return fail(String(alias), 'unknown_template', 'Unknown LMS template alias');
  if (!to || isReservedRecipient(to)) {
    logger.warn('email.send_lms_template_refused', { alias, code: 'reserved_recipient' });
    return { ok: false, code: 'reserved_recipient', message: 'Recipient is on a reserved domain; nothing was sent' };
  }
  const given = Object.keys(variables);
  const missing = t.variables.filter((k) => !given.includes(k));
  const extra = given.filter((k) => !t.variables.includes(k));
  if (missing.length || extra.length) return fail(alias, 'invalid_variables', `Template variables mismatch (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'})`);
  const { subject, html } = renderLmsTemplate(alias, variables);
  if (LEFTOVER.test(html) || LEFTOVER.test(subject)) return fail(alias, 'unfilled_placeholder', 'Rendered template still contains a {{{...}}} placeholder');
  const resend = getEmailClient();
  if (!resend) return fail(alias, 'missing_api_key', 'RESEND_API_KEY is not set');
  try {
    const { data, error } = await resend.emails.send({
      from: emailSender(),
      to,
      subject,
      html,
      attachments: [
        { filename: LOGO_FILENAME, content: LOGO_PNG_BASE64, contentType: 'image/png', contentId: LOGO_CONTENT_ID },
        { filename: LOGO_WHITE_FILENAME, content: LOGO_WHITE_PNG_BASE64, contentType: 'image/png', contentId: LOGO_WHITE_CONTENT_ID },
      ],
    });
    if (error || !data) return fail(alias, error?.name ?? 'unknown_error', error?.message ?? 'No data returned');
    return { ok: true, id: data.id };
  } catch (err) {
    const e = err as { code?: unknown; name?: unknown; message?: unknown };
    const code = typeof e?.code === 'string' ? e.code : typeof e?.name === 'string' ? e.name : 'exception';
    return fail(alias, code, typeof e?.message === 'string' ? e.message : 'Send failed');
  }
}
