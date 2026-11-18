import { logger } from '../utils/logging';
import { LOGO_CONTENT_ID, LOGO_FILENAME, LOGO_PNG_BASE64, LOGO_WHITE_CONTENT_ID, LOGO_WHITE_FILENAME, LOGO_WHITE_PNG_BASE64 } from './logoInline';
import { isReservedRecipient } from './reservedRecipients';
import { fillPlaceholders, getEmailClient, HOSTED_LOGO_URL, HOSTED_LOGO_WHITE_URL, linkCarriesCode, type SendTemplateResult } from './sendTemplate';
import { emailSender } from './templateRegistry';

// Shared renderer/sender for the code-sent email sets that are NOT Resend-hosted
// templates: ./lms (sendLmsTemplate) and ./parents (sendParentTemplate). Each set
// is one file per language (<alias>-en / <alias>-ar), bundled by
// scripts/email/bundle-lms-templates.ts. Rendering matches sendTemplate:
// Resend-style placeholders ({{{VAR}}} raw, {{VAR}} HTML-escaped, fallback_value
// for a missing/empty value), hosted logos swapped for inline cid attachments,
// leftover placeholders refused, reserved recipients refused, and a link that
// carries a parent link code (ENR-XXXX-XXXX or the given LINK_CODE) refused.

export interface CodeTemplate {
  subject: string;
  variables: readonly string[];
  fallbacks: Readonly<Record<string, string>>;
  html: string;
}

/** Which set: names the log events (email.send_<kind>_template_failed / _refused). */
export type CodeTemplateKind = 'lms' | 'parent';

const LEFTOVER = /\{\{\{?\s*[A-Za-z0-9_]+\s*\}?\}\}/;
const EMAIL_PATTERN = /[^\s@<>"']+@[^\s@<>"']+/g;

function fail(kind: CodeTemplateKind, alias: string, code: string, message: string): SendTemplateResult {
  const safe = message.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
  logger.error(`email.send_${kind}_template_failed`, { alias, code, message: safe });
  return { ok: false, code, message: safe };
}

export function renderCodeTemplate(t: CodeTemplate, values: Record<string, string>): { subject: string; html: string } {
  const html = fillPlaceholders(t.html, values, t.fallbacks)
    .split(HOSTED_LOGO_WHITE_URL).join(`cid:${LOGO_WHITE_CONTENT_ID}`)
    .split(HOSTED_LOGO_URL).join(`cid:${LOGO_CONTENT_ID}`);
  return { subject: fillPlaceholders(t.subject, values, t.fallbacks), html };
}

export interface DeliverInput {
  kind: CodeTemplateKind;
  alias: string;
  to: string;
  subject: string;
  html: string;
  /** The parent link code the email shows (never allowed in a link). */
  linkCode?: unknown;
  /** Render and check everything, but do not call Resend (LMS_EMAIL_CAPTURE, the E2E stack). */
  capture?: boolean;
}

/**
 * The last step of every code-sent email: refuses a reserved recipient, a
 * leftover placeholder or a link carrying a parent link code, then sends with
 * both logos attached inline (or, with capture, stops right before Resend and
 * returns { ok: true, id: 'captured' }).
 */
export async function deliverRendered(input: DeliverInput): Promise<SendTemplateResult> {
  const { kind, alias, to, subject, html } = input;
  if (!to || isReservedRecipient(to)) {
    logger.warn(`email.send_${kind}_template_refused`, { alias, code: 'reserved_recipient' });
    return { ok: false, code: 'reserved_recipient', message: 'Recipient is on a reserved domain; nothing was sent' };
  }
  if (LEFTOVER.test(html) || LEFTOVER.test(subject)) return fail(kind, alias, 'unfilled_placeholder', 'Rendered template still contains a {{{...}}} placeholder');
  if (linkCarriesCode(html, input.linkCode)) return fail(kind, alias, 'code_in_url', 'A link in the email carries a parent link code');
  if (input.capture) return { ok: true, id: 'captured' };
  const resend = getEmailClient();
  if (!resend) return fail(kind, alias, 'missing_api_key', 'RESEND_API_KEY is not set');
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
    if (error || !data) return fail(kind, alias, error?.name ?? 'unknown_error', error?.message ?? 'No data returned');
    return { ok: true, id: data.id };
  } catch (err) {
    const e = err as { code?: unknown; name?: unknown; message?: unknown };
    const code = typeof e?.code === 'string' ? e.code : typeof e?.name === 'string' ? e.name : 'exception';
    return fail(kind, alias, code, typeof e?.message === 'string' ? e.message : 'Send failed');
  }
}

export async function sendCodeTemplate(
  kind: CodeTemplateKind,
  bundle: Readonly<Record<string, CodeTemplate>>,
  alias: string,
  to: string,
  variables: Record<string, string>,
): Promise<SendTemplateResult> {
  const t = Object.prototype.hasOwnProperty.call(bundle, alias) ? bundle[alias] : undefined;
  if (!t) return fail(kind, String(alias), 'unknown_template', `Unknown ${kind === 'lms' ? 'LMS' : 'parent'} template alias`);
  if (!to || isReservedRecipient(to)) {
    logger.warn(`email.send_${kind}_template_refused`, { alias, code: 'reserved_recipient' });
    return { ok: false, code: 'reserved_recipient', message: 'Recipient is on a reserved domain; nothing was sent' };
  }
  const mismatch = variablesMismatch(t, variables);
  if (mismatch) return fail(kind, alias, 'invalid_variables', mismatch);
  const { subject, html } = renderCodeTemplate(t, variables);
  // The parent link code (LINK_CODE) or a 6-digit sign-in / verification code (CODE): never in a link.
  return deliverRendered({ kind, alias, to, subject, html, linkCode: variables.LINK_CODE ?? variables.CODE });
}

/** null when the given variables are exactly the template's (all required, no extras), else the message. */
export function variablesMismatch(t: CodeTemplate, variables: Record<string, unknown>): string | null {
  const given = Object.keys(variables ?? {});
  const missing = t.variables.filter((k) => !given.includes(k));
  const extra = given.filter((k) => !t.variables.includes(k));
  if (!missing.length && !extra.length) return null;
  return `Template variables mismatch (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'})`;
}
