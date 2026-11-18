import { createHash } from 'crypto';
import { getConfig } from '../../../config/env';
import { LMS_TEMPLATES_BUNDLE } from '../../../email/lms/lmsTemplatesBundle';
import { isReservedRecipient } from '../../../email/reservedRecipients';
import { deliverRendered, renderCodeTemplate, variablesMismatch, type CodeTemplate } from '../../../email/sendBundledTemplate';
import { Institution } from '../../../models/Institution';
import { User } from '../../../models/User';
import { logger, serializeError } from '../../../utils/logging';
import { LmsEmailClaim, LmsEmailLog, LmsEmailOptIn, LmsEnrollment, LmsUser } from '../models';
import { formatSchoolDateTime } from './dueDate';
import type { Lang } from './lmsEmailText';

// The ONE way LMS emails are sent (owner conditions, 18 Nov 2026). Every LMS
// email (lms-*-en / -ar from email/lms) goes through sendLmsEmail, which:
//   - sends nothing unless LMS_EMAILS_ENABLED, REMINDERS_ENABLED, APP_URL and
//     RESEND_API_KEY are set (or LMS_EMAIL_CAPTURE in the E2E stack: rendered
//     and recorded, never sent);
//   - never emails a *.test address (LMS-made accounts) and, unless a test
//     inbox redirect is on, no reserved address (.example, .invalid, ...);
//     recipients are only school admins, opted-in teachers (D2) and
//     LMS_OPS_EMAILS (D4), never students or parents;
//   - is idempotent: lms_email_log.key is unique per (event key, recipient),
//     so an email is never sent twice (a failed one is retried at most 3 times);
//   - with REMINDER_TEST_RECIPIENT (lms-test) sends ONE copy per event to that
//     inbox, with a "Test copy: this email was for ..." line, and at most
//     LMS_TEST_DAILY_CAP (default 20) per Cairo day: above it the email is held
//     (recorded, not sent), except the ops daily digest (alwaysSend);
//   - puts EMAIL_SUBJECT_PREFIX (lms-test: "[lms-test]") in front of every subject;
//   - HTML-escapes every value (school, course and LMS names are typed by people);
//     code-owned sentences come from lmsEmailText.ts through owned().
// Logs and lms_email_log hold IDs, codes, the template and the subject only.

export interface RawHtml {
  __html: string;
}
export type VarValue = string | number | RawHtml;

export interface LmsRecipient {
  /** user:<id>, contact:<institutionId> or ops:<hash>: what lms_email_log keeps instead of the address. */
  ref: string;
  email: string;
  name?: string;
}

export interface LmsEmailInput {
  /** Base alias (lms-connection-active); the language picks -en / -ar. */
  template: string;
  /** The event's idempotency key (e.g. active:<platformId>:<approvedAt>); the recipient is appended. */
  key: string;
  lang: Lang;
  institutionId?: string;
  platformId?: string;
  recipients: LmsRecipient[];
  /** The template's variables for one recipient (all of them, no extras). */
  vars: (r: LmsRecipient) => Record<string, VarValue>;
  /** The ops daily digest: goes even when the test inbox's daily cap is reached. */
  alwaysSend?: boolean;
}

export interface LmsEmailResult {
  sent: number;
  captured: number;
  held: number;
  failed: number;
  duplicate: number;
  skipped: number;
  codes: string[];
}

const empty = (): LmsEmailResult => ({ sent: 0, captured: 0, held: 0, failed: 0, duplicate: 0, skipped: 0, codes: [] });
const MAX_ATTEMPTS = 3;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
export const OPS_TIME_ZONE = 'Africa/Cairo';

export function appUrl(): string {
  return ((getConfig() as { appUrl?: string }).appUrl || '').trim().replace(/\/+$/, '');
}

/** LMS emails go out (or, in the E2E stack, are captured) only with every switch set. */
export function lmsEmailsActive(): boolean {
  const c = getConfig();
  return c.lms.emailsEnabled === true && c.email.enabled && (!!c.email.resendApiKey || c.lms.emailCapture === true) && !!appUrl();
}

/** YYYY-MM-DD in Cairo: the daily cap's day and the digests' day. */
export function cairoDay(at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: OPS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

// ------------------------------------------------------------ formatting

/** "18 November 2026" / "18 نوفمبر 2026" (Western digits, D12). */
export function formatDay(at: Date, lang: Lang, tz = OPS_TIME_ZONE): string {
  const locale = lang === 'ar' ? 'ar-EG-u-ca-gregory-nu-latn' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(at);
}

/** "18 Nov 2026, 9:40 AM (Cairo time)" in the school's time zone. */
export function formatAt(at: Date, lang: Lang, tz = OPS_TIME_ZONE): string {
  return formatSchoolDateTime(at, tz, lang);
}

/** 1,204 (Western digits in both languages, D12). */
export function num(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function firstName(name?: string | null): string {
  const n = (name ?? '').trim().split(/\s+/)[0] ?? '';
  // An LMS-made account may carry its reserved address as a name: never show that.
  return n.includes('@') ? '' : n.slice(0, 60);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const LTR = (inner: string) => `<span dir="ltr" style="unicode-bidi:embed;">${inner}</span>`;

/** A code-owned sentence (lmsEmailText.ts): escaped, and ‹…› Latin tokens kept left-to-right in Arabic. */
export function owned(text: string, lang: Lang): RawHtml {
  const safe = escapeHtml(text);
  return { __html: safe.replace(/‹([^›]*)›/g, (_m, inner: string) => (lang === 'ar' ? LTR(inner) : inner)) };
}

function asHtml(v: VarValue): string {
  return typeof v === 'object' ? v.__html : escapeHtml(String(v));
}
function asText(v: VarValue): string {
  if (typeof v !== 'object') return String(v);
  return v.__html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

// ------------------------------------------------------------ recipients

const refHash = (email: string) => createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);

/** The school's email language (D1): its emailLanguage, else Arabic for Egypt, else English. */
export async function schoolLang(institutionId: string): Promise<Lang> {
  const s = await Institution.findOne({ id: institutionId }).select('emailLanguage country').lean();
  if (s?.emailLanguage === 'ar' || s?.emailLanguage === 'en') return s.emailLanguage;
  return s?.country === 'EG' ? 'ar' : 'en';
}

export async function schoolOf(institutionId: string): Promise<{ id: string; name: string; timeZone: string; contactEmail?: string; contactName?: string } | null> {
  const s = await Institution.findOne({ id: institutionId }).select('id name timeZone contactEmail contactName').lean();
  if (!s) return null;
  return { id: s.id, name: s.name, timeZone: s.timeZone || OPS_TIME_ZONE, contactEmail: s.contactEmail, contactName: s.contactName };
}

/**
 * The school's admins (role admin, active). Before anyone accepted the school
 * admin invitation, the school's contact address (the invited admin) instead.
 */
export async function schoolAdminRecipients(institutionId: string): Promise<LmsRecipient[]> {
  const admins = await User.find({ institutionId, role: 'admin', status: 'active' }).select('email name').limit(20).lean();
  if (admins.length) return admins.map((a) => ({ ref: `user:${a._id}`, email: a.email, name: a.name }));
  const school = await schoolOf(institutionId);
  return school?.contactEmail ? [{ ref: `contact:${institutionId}`, email: school.contactEmail, name: school.contactName }] : [];
}

/** LMS_OPS_EMAILS (D4); ops emails are English only. */
export function opsRecipients(): LmsRecipient[] {
  return getConfig().lms.opsEmails.map((email) => ({ ref: `ops:${refHash(email)}`, email }));
}

export interface TeacherRecipient extends LmsRecipient {
  enaraUserId: string;
  institutionId: string;
  /** The given LMS courses this teacher teaches. */
  contextIds: string[];
}

/**
 * Teachers of the given LMS courses who said yes to Enara emails (D2): active
 * teacher enrolments -> their ENARA account (a teacher or admin, active) ->
 * their opt-in address. No opt-in, no email.
 */
export async function teacherRecipients(contextIds: string[]): Promise<TeacherRecipient[]> {
  if (!contextIds.length) return [];
  const rows = await LmsEnrollment.find({ contextId: { $in: contextIds }, enaraRole: { $in: ['teacher', 'admin'] }, status: 'active' }).select('contextId lmsUserId').lean();
  if (!rows.length) return [];
  const lmsUsers = await LmsUser.find({ id: { $in: [...new Set(rows.map((r) => r.lmsUserId))] }, enaraUserId: { $exists: true } }).select('id enaraUserId').lean();
  const enaraOf = new Map(lmsUsers.map((u) => [u.id, String(u.enaraUserId)]));
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    const uid = enaraOf.get(r.lmsUserId);
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, new Set());
    byUser.get(uid)!.add(r.contextId);
  }
  if (!byUser.size) return [];
  const optIns = await LmsEmailOptIn.find({ enaraUserId: { $in: [...byUser.keys()] }, state: 'in', email: { $exists: true } }).lean();
  if (!optIns.length) return [];
  const ids = optIns.map((o) => o.enaraUserId).filter((id) => /^[a-f0-9]{24}$/i.test(id));
  const users = await User.find({ _id: { $in: ids }, role: { $in: ['teacher', 'admin'] }, status: 'active' }).select('name institutionId').lean();
  const userOf = new Map(users.map((u) => [String(u._id), u]));
  const out: TeacherRecipient[] = [];
  for (const o of optIns) {
    const u = userOf.get(o.enaraUserId);
    if (!u || !o.email || u.institutionId !== o.institutionId) continue;
    out.push({ ref: `user:${o.enaraUserId}`, email: o.email, name: u.name, enaraUserId: o.enaraUserId, institutionId: o.institutionId, contextIds: [...byUser.get(o.enaraUserId)!] });
  }
  return out;
}

// ------------------------------------------------------------ claims

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;

/** Atomically claims `key` if it was not claimed in the last windowMs (Infinity: once ever). */
export async function claimWindow(key: string, windowMs: number, now = new Date()): Promise<boolean> {
  const before = Number.isFinite(windowMs) ? new Date(now.getTime() - windowMs) : new Date(0);
  try {
    const r = await LmsEmailClaim.findOneAndUpdate({ _id: key, at: { $lte: before }, ...(Number.isFinite(windowMs) ? {} : { count: 0 }) }, { $set: { at: now }, $inc: { count: 1 } }, { upsert: true, new: true }).lean();
    return !!r;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}

/** One slot of the test inbox's daily cap (atomic; false when the day's cap is used up). */
async function takeCapSlot(day: string, cap: number): Promise<boolean> {
  const _id = `cap:${day}`;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await LmsEmailClaim.findOneAndUpdate({ _id, count: { $lt: cap } }, { $inc: { count: 1 }, $set: { at: new Date() } }, { upsert: i === 0, new: true }).lean();
      return !!r;
    } catch (e) {
      if (!isDup(e)) throw e; // a parallel first insert, or the cap is reached: look again without upserting
    }
  }
  return false;
}

/** How many emails went to the test inbox on that Cairo day. */
export async function capCount(day: string): Promise<number> {
  return (await LmsEmailClaim.findById(`cap:${day}`).lean())?.count ?? 0;
}

async function claimRow(doc: Record<string, unknown> & { key: string }): Promise<boolean> {
  try {
    await LmsEmailLog.create({ ...doc, status: 'pending', attempts: 1 });
    return true;
  } catch (e) {
    if (!isDup(e)) throw e;
    // Already there: only a failed one is tried again (at most 3 times in all).
    const r = await LmsEmailLog.updateOne({ key: doc.key, status: 'failed', attempts: { $lt: MAX_ATTEMPTS } }, { $set: { status: 'pending' }, $inc: { attempts: 1 }, $unset: { code: 1 } });
    return r.modifiedCount === 1;
  }
}

// ------------------------------------------------------------ send

function testCopy(html: string, forWhom: string[]): string {
  const line = `<div dir="ltr" style="font-family:Arial, Helvetica, sans-serif;font-size:13px;line-height:18px;color:#64748b;text-align:left;padding:8px 16px;border-bottom:1px solid #e2e8f0;background:#ffffff;">Test copy: this email was for ${escapeHtml(forWhom.join(', '))}.</div>`;
  const m = /<body[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + line + html.slice(m.index + m[0].length) : line + html;
}

export function lmsTemplate(template: string, lang: Lang): { alias: string; t: CodeTemplate } | null {
  const alias = `${template}-${lang}`;
  const t = (LMS_TEMPLATES_BUNDLE as Record<string, CodeTemplate>)[alias];
  return t ? { alias, t } : null;
}

export async function sendLmsEmail(input: LmsEmailInput): Promise<LmsEmailResult> {
  const out = empty();
  if (!lmsEmailsActive()) {
    out.skipped = input.recipients.length;
    out.codes.push('lms_emails_off');
    return out;
  }
  const found = lmsTemplate(input.template, input.lang);
  if (!found) {
    out.codes.push('unknown_template');
    logger.error('lms_email_unknown_template', { template: input.template, lang: input.lang });
    return out;
  }
  const cfg = getConfig();
  const redirect = cfg.email.testRecipient;
  const seen = new Set<string>();
  const list: LmsRecipient[] = [];
  for (const r of input.recipients) {
    const email = (r.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email) || seen.has(email)) continue;
    // LMS-made accounts (<id>@lms.enara.test) and demo accounts: never.
    if (/\.test$/i.test(email)) continue;
    // Other reserved domains only as a redirected test copy (the email goes to the test inbox).
    if (!redirect && isReservedRecipient(email)) continue;
    seen.add(email);
    list.push({ ...r, email });
  }
  out.skipped = input.recipients.length - list.length;
  if (!list.length) {
    out.codes.push('no_recipient');
    return out;
  }
  const day = cairoDay();
  const deliveries = redirect
    ? [{ ref: 'redirect', to: redirect, forWhom: list, varsOf: list[0] }]
    : list.map((r) => ({ ref: r.ref, to: r.email, forWhom: [r], varsOf: r }));

  for (const d of deliveries) {
    const key = `${input.key}|${d.ref}`.slice(0, 300);
    const base = { key, template: input.template, lang: input.lang, institutionId: input.institutionId, platformId: input.platformId, recipientRef: d.ref, recipientCount: d.forWhom.length, redirected: !!redirect, cairoDay: day };
    if (!(await claimRow(base))) {
      out.duplicate++;
      continue;
    }
    try {
      const cap = cfg.lms.testDailyCap;
      if (redirect && cap > 0) {
        if (input.alwaysSend) await LmsEmailClaim.updateOne({ _id: `cap:${day}` }, { $inc: { count: 1 }, $set: { at: new Date() } }, { upsert: true });
        else if (!(await takeCapSlot(day, cap))) {
          await LmsEmailLog.updateOne({ key }, { $set: { status: 'held', code: 'daily_cap' } });
          out.held++;
          continue;
        }
      }
      const values = input.vars(d.varsOf);
      const mismatch = variablesMismatch(found.t, values);
      if (mismatch) {
        await LmsEmailLog.updateOne({ key }, { $set: { status: 'failed', code: 'invalid_variables', attempts: MAX_ATTEMPTS } });
        logger.error('lms_email_invalid_variables', { template: found.alias, message: mismatch });
        out.failed++;
        out.codes.push('invalid_variables');
        continue;
      }
      const htmlValues = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, asHtml(v)]));
      const textValues = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, asText(v)]));
      let { html } = renderCodeTemplate(found.t, htmlValues);
      const subject = `${cfg.email.subjectPrefix ?? ''}${renderCodeTemplate(found.t, textValues).subject}`.slice(0, 300);
      if (redirect) html = testCopy(html, d.forWhom.map((r) => r.email));
      const capture = cfg.lms.emailCapture === true;
      const result = await deliverRendered({ kind: 'lms', alias: found.alias, to: d.to, subject, html, capture });
      if (result.ok) {
        await LmsEmailLog.updateOne({ key }, { $set: { status: capture ? 'captured' : 'sent', subject, sentAt: new Date(), ...(capture ? {} : { resendId: result.id }) } });
        if (capture) out.captured++;
        else out.sent++;
      } else {
        await LmsEmailLog.updateOne({ key }, { $set: { status: 'failed', code: result.code.slice(0, 80), subject } });
        out.failed++;
        out.codes.push(result.code);
      }
    } catch (error) {
      await LmsEmailLog.updateOne({ key }, { $set: { status: 'failed', code: 'exception' } }).catch(() => undefined);
      logger.error('lms_email_send_failed', { template: input.template, error: serializeError(error) });
      out.failed++;
      out.codes.push('exception');
    }
  }
  return out;
}

/** Emails held back by the test inbox's daily cap on that Cairo day, per template. */
export async function heldToday(day = cairoDay()): Promise<{ total: number; byTemplate: { template: string; n: number }[] }> {
  const rows = await LmsEmailLog.aggregate<{ _id: string; n: number }>([{ $match: { cairoDay: day, status: 'held' } }, { $group: { _id: '$template', n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }]);
  return { total: rows.reduce((a, r) => a + r.n, 0), byTemplate: rows.map((r) => ({ template: r._id, n: r.n })) };
}
