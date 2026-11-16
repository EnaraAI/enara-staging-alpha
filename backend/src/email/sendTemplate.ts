import { Resend } from 'resend';
import { logger } from '../utils/logging';
import {
  EMAIL_SENDER,
  TEMPLATE_REGISTRY,
  isTemplateAlias,
  type TemplateAlias,
  type TemplateVariables,
} from './templateRegistry';
import { LOGO_CONTENT_ID, LOGO_FILENAME, LOGO_PNG_BASE64 } from './logoInline';

export type SendTemplateResult =
  | { ok: true; id: string }
  | { ok: false; code: string; message: string };

let client: Resend | null = null;

function getClient(): Resend | null {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client = new Resend(key);
  return client;
}

/** Test hook: drop the cached client so the next call re-reads RESEND_API_KEY. */
export function resetEmailClientForTests(): void {
  client = null;
}

const EMAIL_PATTERN = /[^\s@<>"']+@[^\s@<>"']+/g;
function scrub(message: string): string {
  return message.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
}

function fail(alias: string, code: string, message: string): SendTemplateResult {
  const safe = scrub(message);
  logger.error('email.send_template_failed', { alias, code, message: safe });
  return { ok: false, code, message: safe };
}

/**
 * Send one of the Resend-hosted templates. The HTML lives in Resend (mirrored in
 * ./templates via scripts/email/pull-templates.ts); no markup is built here.
 */
export async function sendTemplate<A extends TemplateAlias>(
  alias: A,
  to: string | string[],
  variables: TemplateVariables<A>,
): Promise<SendTemplateResult> {
  if (!isTemplateAlias(alias)) return fail(String(alias), 'unknown_template', 'Unknown template alias');
  const entry = TEMPLATE_REGISTRY[alias];
  const expected: readonly string[] = entry.variables;
  const given = Object.keys(variables ?? {});
  const missing = expected.filter((k) => !given.includes(k));
  const extra = given.filter((k) => !expected.includes(k));
  if (missing.length || extra.length) {
    return fail(
      alias,
      'invalid_variables',
      `Template variables mismatch (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'})`,
    );
  }

  const resend = getClient();
  if (!resend) return fail(alias, 'missing_api_key', 'RESEND_API_KEY is not set');

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_SENDER,
      to,
      template: { id: entry.id, variables: variables as Record<string, string | number> },
      // Every template references the logo as cid:enara-logo, so it must always be attached.
      attachments: [
        { filename: LOGO_FILENAME, content: LOGO_PNG_BASE64, contentType: 'image/png', contentId: LOGO_CONTENT_ID },
      ],
    });
    if (error || !data) {
      return fail(alias, error?.name ?? 'unknown_error', error?.message ?? 'No data returned');
    }
    return { ok: true, id: data.id };
  } catch (err) {
    const e = err as { code?: unknown; name?: unknown; message?: unknown };
    const code = typeof e?.code === 'string' ? e.code : typeof e?.name === 'string' ? e.name : 'exception';
    return fail(alias, code, typeof e?.message === 'string' ? e.message : String(err));
  }
}
