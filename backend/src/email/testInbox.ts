import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { DEFAULT_EMAIL_DAILY_CEILING, getConfig } from '../config/env';
import { isStagingMode } from '../config/stagingGuard';
import { LmsEmailClaim, LmsEmailLog } from '../integrations/lms/models/email';
import { recordAlert, recordAudit } from '../services/auditTrail';
import { logger, serializeError } from '../utils/logging';
import { cairoDay, resendSend } from './provider';
import type { SendTemplateResult } from './sendTemplate';

export { cairoDay, CAIRO_TIME_ZONE } from './provider';

// The email safety rules, shared by EVERY send path: sendTemplate (account,
// parent, weekly progress emails), deliverRendered (parent / LMS code
// templates), the legacy services/emailService sendEmail, and the LMS email
// service (integrations/lms/core/lmsEmail.ts, which applies the redirect itself,
// with its idempotency, and takes the ceiling from here).
//
// On a staging deployment (ENARA_STAGING=true, e.g. lms-test):
//   - without REMINDER_TEST_RECIPIENT nothing is sent (refused, logged);
//   - with it, every email is sent when its event happens, as ONE copy to that
//     inbox only, with EMAIL_SUBJECT_PREFIX ("[lms-test] ") on the subject and
//     a "Test copy: this email was for ..." line (the original addresses,
//     HTML-escaped);
//   - with LMS_EMAIL_CAPTURE (the E2E stack) it is recorded, never sent.
// The safety ceiling against bugs (EMAIL_DAILY_CEILING; default 300 a Cairo
// day on staging, none elsewhere unless set): one atomic counter
// (lms_email_claims ceiling:<day>) across ALL paths. Above it an email is held
// (recorded in lms_email_log, not sent), and the first time each day a
// critical alert (recordAlert 'email_daily_ceiling_hit') + an audit row + ONE
// alert email (to the test inbox on staging, LMS_OPS_EMAILS elsewhere; itself
// exempt from the ceiling) go out.
// Not staging and no ceiling set: guardOutgoing returns null and the caller
// sends exactly as before (production: the real recipients).
// lms_email_log rows written here hold the alias, the status and a code only
// (no address, no subject: parent subjects carry a child's name).

export const CEILING_ALERT_ALIAS = 'email-ceiling-alert';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Puts the "Test copy: this email was for ..." line right after <body> (or in front). Addresses are HTML-escaped. */
export function testCopy(html: string, forWhom: string[]): string {
  const line = `<div dir="ltr" style="font-family:Arial, Helvetica, sans-serif;font-size:13px;line-height:18px;color:#64748b;text-align:left;padding:8px 16px;border-bottom:1px solid #e2e8f0;background:#ffffff;">Test copy: this email was for ${escapeHtml(forWhom.join(', '))}.</div>`;
  const m = /<body[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + line + html.slice(m.index + m[0].length) : line + html;
}

// ------------------------------------------------------------ policy

export interface EmailPolicy {
  staging: boolean;
  /** REMINDER_TEST_RECIPIENT; on staging, unset = nothing may be sent. */
  redirect?: string;
  /** EMAIL_SUBJECT_PREFIX with its space ("[lms-test] "), or ''. */
  prefix: string;
  /** LMS_EMAIL_CAPTURE: record, never send. */
  capture: boolean;
  /** EMAIL_DAILY_CEILING (default 300 on staging), or undefined: no ceiling. */
  ceiling?: number;
  /** LMS_OPS_EMAILS: who the ceiling alert is for. */
  opsEmails: string[];
}

/**
 * The rules in force. Staging is the loaded config's stagingMode or
 * ENARA_STAGING itself; if the config cannot be read on staging, no test inbox
 * is known, so nothing is sent.
 */
export function emailPolicy(): EmailPolicy {
  let c: Partial<ReturnType<typeof getConfig>> | undefined;
  try {
    c = getConfig();
  } catch {
    c = undefined;
  }
  const staging = c?.stagingMode === true || isStagingMode(process.env);
  return {
    staging,
    redirect: c?.email?.testRecipient || undefined,
    prefix: c?.email?.subjectPrefix ?? '',
    capture: c?.lms?.emailCapture === true,
    ceiling: c?.email?.dailyCeiling ?? (staging ? DEFAULT_EMAIL_DAILY_CEILING : undefined),
    opsEmails: c?.lms?.opsEmails ?? [],
  };
}

// ------------------------------------------------------------ log

type Status = 'sent' | 'captured' | 'held' | 'failed';

async function logRow(alias: string, status: Status, day: string, opts: { count: number; redirected: boolean; code?: string; resendId?: string }): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  try {
    await LmsEmailLog.create({
      key: `mail:${alias}:${randomUUID()}`.slice(0, 300),
      template: alias.slice(0, 80),
      lang: /-ar$/.test(alias) ? 'ar' : 'en',
      recipientRef: opts.redirected ? 'redirect' : 'direct',
      recipientCount: opts.count,
      redirected: opts.redirected,
      status,
      ...(opts.code ? { code: opts.code.slice(0, 80) } : {}),
      cairoDay: day,
      attempts: 1,
      ...(status === 'sent' || status === 'captured' ? { sentAt: new Date() } : {}),
      ...(opts.resendId ? { resendId: opts.resendId } : {}),
    });
  } catch (error) {
    logger.error('email.log_failed', { alias, status, error: serializeError(error) });
  }
}

// ------------------------------------------------------------ ceiling

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;
const ceilingId = (day: string) => `ceiling:${day}`;

/** One slot under the day's ceiling (atomic; false when the ceiling is reached). */
async function takeCeilingSlot(day: string, ceiling: number): Promise<boolean> {
  const _id = ceilingId(day);
  for (let i = 0; i < 2; i++) {
    try {
      const r = await LmsEmailClaim.findOneAndUpdate({ _id, count: { $lt: ceiling } }, { $inc: { count: 1 }, $set: { at: new Date() } }, { upsert: i === 0, new: true }).lean();
      return !!r;
    } catch (e) {
      if (!isDup(e)) throw e; // a parallel first insert, or the ceiling is reached: look again without upserting
    }
  }
  return false;
}

/** How many emails counted against the ceiling on that Cairo day (all send paths). */
export async function ceilingCount(day: string): Promise<number> {
  return (await LmsEmailClaim.findById(ceilingId(day)).lean())?.count ?? 0;
}

/** Emails held by the ceiling on that Cairo day, per template (every path). */
export async function heldToday(day = cairoDay()): Promise<{ total: number; byTemplate: { template: string; n: number }[] }> {
  const rows = await LmsEmailLog.aggregate<{ _id: string; n: number }>([{ $match: { cairoDay: day, status: 'held', code: 'daily_ceiling' } }, { $group: { _id: '$template', n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }]);
  return { total: rows.reduce((a, r) => a + r.n, 0), byTemplate: rows.map((r) => ({ template: r._id, n: r.n })) };
}

async function firstToday(id: string): Promise<boolean> {
  try {
    await LmsEmailClaim.create({ _id: id, at: new Date(), count: 1 });
    return true;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}

/** The first hit of the day: one critical alert, one audit row, one alert email (exempt from the ceiling). */
async function ceilingHit(policy: EmailPolicy, day: string, ceiling: number, kind: string, alias: string): Promise<void> {
  try {
    if (!(await firstToday(`alert:ceiling:${day}`))) return;
    await recordAlert('email_daily_ceiling_hit', 'critical', { scope: day, ceiling, kind, alias });
    await recordAudit('email_daily_ceiling_hit', { id: 'system', role: 'system' }, { type: 'email', id: day }, { ceiling, kind, alias });
    await sendCeilingAlert(policy, day, ceiling);
  } catch (error) {
    logger.error('email.ceiling_alert_failed', { error: serializeError(error) });
  }
}

async function sendCeilingAlert(policy: EmailPolicy, day: string, ceiling: number): Promise<void> {
  // The email that hit the ceiling is held right after this; count it.
  const held = (await heldToday(day)).total + 1;
  const ops = policy.opsEmails;
  const to = policy.staging ? policy.redirect : ops.length ? ops : undefined;
  if (!to) {
    logger.warn('email.ceiling_alert_no_recipient', { day });
    return;
  }
  const subject = `${policy.staging ? policy.prefix : ''}Email safety ceiling hit: ${held} held`;
  let html =
    `<html><body><div style="font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:22px;color:#111111;padding:16px;">` +
    `<p>The email safety ceiling (${ceiling} emails per Cairo day, all send paths) was reached on ${escapeHtml(day)}.</p>` +
    `<p>Held so far: ${held}. Every further email today is held (recorded in lms_email_log, not sent) until the next Cairo day. This alert is sent once a day.</p>` +
    `<p>Look for a loop or a burst: the alerts (email_daily_ceiling_hit) and the maintenance view GET /api/maintenance/lms-emails.</p></div></body></html>`;
  if (policy.staging && ops.length) html = testCopy(html, ops);
  const redirected = policy.staging;
  if (policy.capture) {
    await logRow(CEILING_ALERT_ALIAS, 'captured', day, { count: 1, redirected });
    return;
  }
  const result = await resendSend('alert', CEILING_ALERT_ALIAS, to, subject, html);
  if (!result.ok) logger.error('email.ceiling_alert_send_failed', { code: result.code });
  await logRow(CEILING_ALERT_ALIAS, result.ok ? 'sent' : 'failed', day, { count: 1, redirected, code: result.ok ? undefined : result.code, resendId: result.ok ? result.id : undefined });
}

/**
 * Takes one slot under the day's safety ceiling. true: go on. false: the
 * email must be held (the first hit of the day raised the alert). Every send
 * path calls this once per email it would send (sendLmsEmail included).
 * Throws when the counter cannot be reached (callers fail closed).
 */
export async function ceilingAllows(kind: string, alias: string, policy = emailPolicy()): Promise<boolean> {
  const ceiling = policy.ceiling;
  if (!ceiling) return true;
  const day = cairoDay();
  if (await takeCeilingSlot(day, ceiling)) return true;
  logger.warn('email.daily_ceiling_held', { kind, alias, code: 'daily_ceiling' });
  await ceilingHit(policy, day, ceiling, kind, alias);
  return false;
}

// ------------------------------------------------------------ guard

export type GuardDecision =
  | { send: true; /** true on staging: to/subject/html are the test inbox copy. */ redirected: boolean; to: string | string[]; subject: string; html: string; record(result: SendTemplateResult): Promise<void> }
  | { send: false; result: SendTemplateResult };

export interface OutgoingEmail {
  /** Which path (log events only): template, parent, lms, legacy. */
  kind: string;
  /** The template alias (what lms_email_log keeps). */
  alias: string;
  to: string[];
  subject: string;
  html: string;
}

/**
 * The guard every send path (but sendLmsEmail, which applies the same rules
 * itself) calls right before the provider. null: not staging and no ceiling,
 * send exactly as before. Otherwise either the email to send (on staging:
 * redirected, prefixed, with the Test copy line; call record() with the
 * outcome) or the final result (refused, held by the ceiling, or captured).
 * Fails closed: if the ceiling cannot be checked, nothing is sent.
 */
export async function guardOutgoing(email: OutgoingEmail): Promise<GuardDecision | null> {
  const policy = emailPolicy();
  if (!policy.staging && !policy.ceiling) return null;
  const { kind, alias } = email;
  if (policy.staging && !policy.redirect) {
    logger.warn('email.staging_refused', { kind, alias, code: 'staging_no_test_inbox' });
    return { send: false, result: { ok: false, code: 'staging_no_test_inbox', message: 'Staging sends email only to the test inbox (REMINDER_TEST_RECIPIENT), which is not set; nothing was sent' } };
  }
  const day = cairoDay();
  const forWhom = email.to.map((a) => a.trim()).filter(Boolean);
  const redirected = policy.staging;
  try {
    if (!(await ceilingAllows(kind, alias, policy))) {
      await logRow(alias, 'held', day, { count: forWhom.length, redirected, code: 'daily_ceiling' });
      return { send: false, result: { ok: false, code: 'daily_ceiling', message: 'The daily email safety ceiling is reached; the email was held (recorded, not sent)' } };
    }
  } catch (error) {
    logger.error('email.ceiling_check_failed', { kind, alias, error: serializeError(error) });
    return { send: false, result: { ok: false, code: 'email_guard_error', message: 'The daily email ceiling could not be checked; nothing was sent' } };
  }
  if (!policy.staging) {
    // Not staging, EMAIL_DAILY_CEILING set: counted, then the real recipients, unchanged.
    return { send: true, redirected: false, to: email.to, subject: email.subject, html: email.html, record: async () => undefined };
  }
  if (policy.capture) {
    await logRow(alias, 'captured', day, { count: forWhom.length, redirected });
    return { send: false, result: { ok: true, id: 'captured' } };
  }
  return {
    send: true,
    redirected: true,
    to: policy.redirect!,
    subject: `${policy.prefix}${email.subject}`.slice(0, 300),
    html: testCopy(email.html, forWhom),
    record: async (result) => {
      const held = !result.ok && result.code === 'provider_quota';
      await logRow(alias, result.ok ? 'sent' : held ? 'held' : 'failed', day, { count: forWhom.length, redirected, code: result.ok ? undefined : result.code, resendId: result.ok ? result.id : undefined });
    },
  };
}
