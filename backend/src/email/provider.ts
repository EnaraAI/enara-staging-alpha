import mongoose from 'mongoose';
import { Resend } from 'resend';
import { LmsEmailClaim } from '../integrations/lms/models/email';
import { recordAlert, recordAudit } from '../services/auditTrail';
import { logger, serializeError } from '../utils/logging';
import { LOGO_CONTENT_ID, LOGO_FILENAME, LOGO_PNG_BASE64, LOGO_WHITE_CONTENT_ID, LOGO_WHITE_FILENAME, LOGO_WHITE_PNG_BASE64 } from './logoInline';
import { emailSender } from './templateRegistry';

// The one place every email meets the provider (Resend), whatever the path:
// sendTemplate, deliverRendered (parent / LMS code templates, sendLmsEmail)
// and the legacy services/emailService sendEmail.
//   - Pacing: Resend allows 10 requests per second; calls are spaced at least
//     PACE_MS apart in this process (digests and bursts queue, nothing fails).
//   - Quota: Resend's free tier is 100 emails a day and 3,000 a month. A
//     refusal for quota (429, daily_quota_exceeded, monthly_quota_exceeded,
//     rate_limit_exceeded) is returned as a failure (never thrown), raises ONE
//     critical alert per Cairo day (recordAlert 'email_provider_quota_hit' +
//     audit), and after a daily/monthly quota refusal this process stops
//     calling Resend for the rest of the Cairo day (code provider_quota: the
//     email is held), so there is no retry storm.
// Logs hold the alias and codes only, never an address.

export type ProviderResult = { ok: true; id: string } | { ok: false; code: string; message: string };

export const CAIRO_TIME_ZONE = 'Africa/Cairo';

/** YYYY-MM-DD in Cairo: the daily ceiling's day (and the LMS digests' day). */
export function cairoDay(at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

let client: Resend | null = null;

/** The Resend client, or null without RESEND_API_KEY. */
export function getEmailClient(): Resend | null {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client = new Resend(key);
  return client;
}

// ------------------------------------------------------------ pacing

/** 10 requests per second at most (Resend); a little margin. */
const PACE_MS = 110;
let paceMs = PACE_MS;
let nextSlot = 0;

async function pace(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + paceMs;
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
}

// ------------------------------------------------------------ quota

const DAY_QUOTA = /^(daily_quota_exceeded|monthly_quota_exceeded)$/;
/** A refusal for quota or rate (Resend error names, or a bare HTTP 429). */
export function isQuotaRefusal(code: string): boolean {
  return /quota/i.test(code) || code === 'rate_limit_exceeded' || code === '429' || code === 'http_429';
}

let blockedDay: string | null = null;
let alertedDay: string | null = null;

/** Once per Cairo day across instances (lms_email_claims), and per process when the database is away. */
async function firstToday(id: string): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return true;
  try {
    await LmsEmailClaim.create({ _id: id, at: new Date(), count: 1 });
    return true;
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return false;
    throw e;
  }
}

async function onQuotaRefusal(kind: string, alias: string, code: string): Promise<void> {
  const day = cairoDay();
  if (DAY_QUOTA.test(code)) blockedDay = day;
  logger.error('email.provider_quota_hit', { kind, alias, code });
  if (alertedDay === day) return;
  alertedDay = day;
  try {
    if (!(await firstToday(`alert:provider-quota:${day}`))) return;
    await recordAlert('email_provider_quota_hit', 'critical', { scope: day, code, kind, alias });
    await recordAudit('email_provider_quota_hit', { id: 'system', role: 'system' }, { type: 'email', id: day }, { code, kind, alias });
  } catch (error) {
    logger.error('email.provider_quota_alert_failed', { error: serializeError(error) });
  }
}

/**
 * Runs one provider call with pacing and the quota rules. Never throws: an
 * exception becomes { ok: false, code: 'exception' }.
 */
export async function providerCall(kind: string, alias: string, call: () => Promise<ProviderResult>): Promise<ProviderResult> {
  if (blockedDay === cairoDay()) {
    logger.warn('email.provider_quota_held', { kind, alias, code: 'provider_quota' });
    return { ok: false, code: 'provider_quota', message: 'The email provider quota is used up for today; the email was held (not sent)' };
  }
  await pace();
  let result: ProviderResult;
  try {
    result = await call();
  } catch (err) {
    const e = err as { code?: unknown; name?: unknown; message?: unknown };
    const code = typeof e?.code === 'string' ? e.code : typeof e?.name === 'string' ? e.name : 'exception';
    result = { ok: false, code, message: typeof e?.message === 'string' ? e.message : 'Send failed' };
  }
  if (!result.ok && isQuotaRefusal(result.code)) await onQuotaRefusal(kind, alias, result.code);
  return result;
}

/** One email through Resend with both logos attached inline (paced, quota-aware; never throws). */
export async function resendSend(kind: string, alias: string, to: string | string[], subject: string, html: string): Promise<ProviderResult> {
  const resend = getEmailClient();
  if (!resend) return { ok: false, code: 'missing_api_key', message: 'RESEND_API_KEY is not set' };
  return providerCall(kind, alias, async () => {
    const { data, error } = await resend.emails.send({
      from: emailSender(),
      to,
      subject,
      html,
      // The rendered HTML references cid:enara-logo (light) and cid:enara-logo-white (dark mode), so both are always attached.
      attachments: [
        { filename: LOGO_FILENAME, content: LOGO_PNG_BASE64, contentType: 'image/png', contentId: LOGO_CONTENT_ID },
        { filename: LOGO_WHITE_FILENAME, content: LOGO_WHITE_PNG_BASE64, contentType: 'image/png', contentId: LOGO_WHITE_CONTENT_ID },
      ],
    });
    if (error || !data) {
      const status = (error as { statusCode?: number | null } | null)?.statusCode;
      return { ok: false, code: error?.name ?? (status === 429 ? 'http_429' : 'unknown_error'), message: error?.message ?? 'No data returned' };
    }
    return { ok: true, id: data.id };
  });
}

/** Test hook: drop the cached client (re-reads RESEND_API_KEY), the quota state and the pacing slot; set the spacing. */
export function resetEmailProviderForTests(opts: { paceMs?: number } = {}): void {
  client = null;
  blockedDay = null;
  alertedDay = null;
  nextSlot = 0;
  paceMs = opts.paceMs ?? PACE_MS;
}
