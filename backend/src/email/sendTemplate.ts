import { Resend } from 'resend';
import { logger } from '../utils/logging';
import {
  EMAIL_SENDER,
  TEMPLATE_REGISTRY,
  isTemplateAlias,
  type TemplateAlias,
} from './templateRegistry';
import {
  LOGO_CONTENT_ID,
  LOGO_FILENAME,
  LOGO_PNG_BASE64,
  LOGO_WHITE_CONTENT_ID,
  LOGO_WHITE_FILENAME,
  LOGO_WHITE_PNG_BASE64,
} from './logoInline';
import { MissingAppUrlError, TEMPLATE_LINKS, buildActionUrl, isLinkedAlias, type TemplateSendVariables } from './links';

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
  variables: TemplateSendVariables<A>,
): Promise<SendTemplateResult> {
  if (!isTemplateAlias(alias)) return fail(String(alias), 'unknown_template', 'Unknown template alias');
  const entry = TEMPLATE_REGISTRY[alias];
  const linked = isLinkedAlias(alias);
  // Linked aliases take link params instead of ACTION_URL; the URL is built here.
  const linkParams: readonly string[] = linked ? TEMPLATE_LINKS[alias].params : [];
  const expected: readonly string[] = linked
    ? [...entry.variables.filter((k) => k !== 'ACTION_URL'), ...linkParams]
    : entry.variables;
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

  const input = variables as Record<string, string | number>;
  const emptyParams = linkParams.filter((k) => typeof input[k] !== 'string' || !String(input[k]).trim());
  if (emptyParams.length) {
    return fail(alias, 'invalid_variables', `Link params must be non-empty strings (${emptyParams.join(',')})`);
  }
  let templateVariables: Record<string, string | number> = input;
  if (linked) {
    try {
      const actionUrl = buildActionUrl(alias, input as never);
      templateVariables = Object.fromEntries([
        ...Object.entries(input).filter(([k]) => !linkParams.includes(k)),
        ['ACTION_URL', actionUrl],
      ]);
    } catch (err) {
      if (err instanceof MissingAppUrlError) return fail(alias, err.code, err.message);
      throw err;
    }
  }

  const resend = getClient();
  if (!resend) return fail(alias, 'missing_api_key', 'RESEND_API_KEY is not set');

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_SENDER,
      to,
      template: { id: entry.id, variables: templateVariables },
      // Every template references cid:enara-logo (light) and cid:enara-logo-white (dark mode), so both are always attached.
      attachments: [
        { filename: LOGO_FILENAME, content: LOGO_PNG_BASE64, contentType: 'image/png', contentId: LOGO_CONTENT_ID },
        { filename: LOGO_WHITE_FILENAME, content: LOGO_WHITE_PNG_BASE64, contentType: 'image/png', contentId: LOGO_WHITE_CONTENT_ID },
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
