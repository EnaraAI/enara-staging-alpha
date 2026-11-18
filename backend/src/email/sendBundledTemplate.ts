import { logger } from '../utils/logging';
import { LOGO_CONTENT_ID, LOGO_WHITE_CONTENT_ID } from './logoInline';
import { resendSend } from './provider';
import { isReservedRecipient } from './reservedRecipients';
import { fillPlaceholders, HOSTED_LOGO_URL, HOSTED_LOGO_WHITE_URL, linkCarriesCode, type SendTemplateResult } from './sendTemplate';
import { guardOutgoing } from './testInbox';

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
  /**
   * Set ONLY by sendLmsEmail, which applies the test inbox rules itself (same
   * redirect, prefix, Test copy line and shared daily cap, plus idempotency).
   * Every other caller gets them here (email/testInbox.ts).
   */
  testInboxApplied?: boolean;
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
  // Staging (lms-test): only the test inbox, prefixed, capped, or captured (null: not staging, unchanged).
  const guard = input.testInboxApplied ? null : await guardOutgoing({ kind, alias, to: [to], subject, html });
  if (guard && !guard.send) return guard.result;
  if (!guard || !guard.redirected) return sendNow(kind, alias, to, subject, html); // not staging: exactly as before
  const result = await sendNow(kind, alias, guard.to, guard.subject, guard.html);
  await guard.record(result);
  return result;
}

async function sendNow(kind: CodeTemplateKind, alias: string, to: string | string[], subject: string, html: string): Promise<SendTemplateResult> {
  // Paced and quota-aware (email/provider.ts); never throws.
  const r = await resendSend(kind, alias, to, subject, html);
  return r.ok ? r : fail(kind, alias, r.code, r.message);
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
