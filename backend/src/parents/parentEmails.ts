import mongoose from 'mongoose';
import { PARENT_TEMPLATES_BUNDLE } from '../email/parents/parentTemplatesBundle';
import { getAppUrl } from '../email/links';
import { isReservedRecipient } from '../email/reservedRecipients';
import { deliverRendered, renderCodeTemplate, variablesMismatch, type CodeTemplate } from '../email/sendBundledTemplate';
import { parentEmailsEnabled } from '../email/sendParentTemplate';
import { cairoDay } from '../email/testInbox';
import type { SendTemplateResult } from '../email/sendTemplate';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import { CourseInstance } from '../models/CourseInstance';
import { Institution } from '../models/Institution';
import { ParentEmailSend } from '../models/ParentEmailSend';
import { ParentLearnerLink, type ParentLinkEndReason } from '../models/ParentLearnerLink';
import { ParentProfile } from '../models/ParentProfile';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { logger, serializeError } from '../utils/logging';
import { isCodeOnlyEmail } from './codeSignup';
import { parentAllSubjectsEnabled } from './flags';
import { childSection, codeTable, escapeHtml, namesList, weekLabel, type ChildWeek, type Lang } from './emailBlocks';
import { attemptVisible, resultsPolicyFor } from './resultVisibility';
import { schoolsWithAccessOff } from './schoolAccess';

// Parents P4 (PARENT_EMAILS_ENABLED; on for lms-test): the approved parent
// emails, wired to their events. Every one goes through deliverRendered, so on
// lms-test through the email safety path (email/testInbox.ts): ONE copy to the
// test inbox, "[lms-test]" in front of the subject, the "Test copy: this email
// was for ..." line, the daily ceiling (300); captured, never sent, in the E2E
// stack. Never twice (parent_email_sends.key, at most 3 tries for a failure).
//
//   parent-link-confirmed  a code is redeemed and the link is active
//   parent-link-ended      the school unlinked the parent, or the student was
//                          archived or left (owner decision 2). NOT when the
//                          parent unlinks themself, NOT after PDPL deletion.
//   parent-new-results     a result becomes visible to the parent (P3 rule:
//                          released, or with "immediately" finalized); at most
//                          one per child per day
//   parent-weekly-summary  ONE email per parent, a section per child (the week
//                          that ended), from the daily job once Sunday 18:00
//                          Cairo has passed; also "Share this week -> Email"
//   parent-invite          "Send code by email" (and P5's CSV invites)
// Recipients: the parent's own account address (code-only accounts have none:
// no email). Children's details: their own child's first name only. The
// school's switches (D11 defaults) and the parent's own on/off apply.
// Values are HTML-escaped; the subject is plain text.

export type ParentEmailKind = 'linkConfirmed' | 'weeklySummary' | 'newResults' | 'linkEnded';
export const SCHOOL_EMAIL_DEFAULTS: Record<ParentEmailKind, boolean> = { linkConfirmed: true, weeklySummary: true, newResults: false, linkEnded: true };
/** Ends that send parent-link-ended (owner decision 2). */
export const ENDS_THAT_EMAIL: readonly ParentLinkEndReason[] = ['unlinked_by_school', 'archived', 'left_school', 'lms_left_all_classes'];
const MAX_ATTEMPTS = 3;
const firstName = (name?: string | null) => String(name ?? '').trim().split(/\s+/)[0] || '';
const PLACEHOLDER_NAMES = new Set(['Parent', 'ولي الأمر']);
const appLink = (path: string) => `${getAppUrl()}${path}`;

export interface RawHtml { __html: string }
type Vars = Record<string, string | number | RawHtml>;
const asHtml = (v: string | number | RawHtml) => (typeof v === 'object' ? v.__html : escapeHtml(String(v)));
const asText = (v: string | number | RawHtml) => (typeof v === 'object' ? v.__html.replace(/<[^>]*>/g, '') : String(v));

/** The school's switches (D11 defaults for unset values). */
export async function schoolEmailSwitches(institutionId: string | undefined): Promise<Record<ParentEmailKind, boolean>> {
  const s = institutionId ? await Institution.findOne({ id: institutionId }).select('parentPortal').lean() : null;
  const e = (s?.parentPortal as { emails?: Partial<Record<ParentEmailKind, boolean>> } | undefined)?.emails ?? {};
  return Object.fromEntries(Object.entries(SCHOOL_EMAIL_DEFAULTS).map(([k, d]) => [k, typeof e[k as ParentEmailKind] === 'boolean' ? e[k as ParentEmailKind]! : d])) as Record<ParentEmailKind, boolean>;
}

/** The parent's address, name and language; null without a usable address (code-only, disabled, reserved). */
export async function parentRecipient(parentUserId: string): Promise<{ email: string; name: string; lang: Lang; prefs: { weeklySummary: boolean; newResults: boolean } } | null> {
  if (!mongoose.isValidObjectId(parentUserId)) return null;
  const u = await User.findById(parentUserId).select('email name role status').lean();
  if (!u || u.role !== 'parent' || u.status !== 'active' || !u.email || isCodeOnlyEmail(u.email) || isReservedRecipient(u.email)) return null;
  const p = await ParentProfile.findOne({ userId: parentUserId }).select('language emailPrefs').lean();
  return {
    email: u.email,
    name: PLACEHOLDER_NAMES.has(u.name) ? '' : firstName(u.name),
    lang: p?.language === 'ar' ? 'ar' : 'en',
    prefs: { weeklySummary: p?.emailPrefs?.weeklySummary !== false, newResults: p?.emailPrefs?.newResults !== false },
  };
}

/** Renders (values escaped in the body, plain in the subject) and delivers through the safety path. */
export async function renderAndDeliver(template: string, lang: Lang, to: string, vars: Vars, linkCode?: string): Promise<SendTemplateResult> {
  const alias = `${template}-${lang}`;
  const t = (PARENT_TEMPLATES_BUNDLE as Record<string, CodeTemplate>)[alias];
  if (!t) return { ok: false, code: 'unknown_template', message: 'Unknown parent template' };
  const mismatch = variablesMismatch(t, vars);
  if (mismatch) {
    logger.error('parents.email_invalid_variables', { template: alias, message: mismatch });
    return { ok: false, code: 'invalid_variables', message: mismatch };
  }
  const html = renderCodeTemplate(t, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, asHtml(v)]))).html;
  const subject = renderCodeTemplate(t, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, asText(v)]))).subject;
  return deliverRendered({ kind: 'parent', alias, to, subject, html, linkCode });
}

/**
 * Sends once per key: claims the key (a failed earlier try may be tried again,
 * at most 3 times), renders and delivers, and records the outcome (IDs only).
 */
export async function sendParentEmailOnce(input: { key: string; template: string; to: string; lang: Lang; vars: Vars; parentUserId?: string; studentId?: string; institutionId?: string; linkCode?: string }): Promise<{ status: string; code?: string }> {
  if (!parentEmailsEnabled()) return { status: 'off' };
  const key = input.key.slice(0, 300);
  const base = { template: `${input.template}-${input.lang}`, parentUserId: input.parentUserId, studentId: input.studentId, institutionId: input.institutionId };
  try {
    await ParentEmailSend.create({ key, ...base, status: 'pending', attempts: 1, at: new Date() });
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    const r = await ParentEmailSend.updateOne({ key, status: 'failed', attempts: { $lt: MAX_ATTEMPTS } }, { $set: { status: 'pending', at: new Date() }, $inc: { attempts: 1 }, $unset: { code: 1 } });
    if (!r.modifiedCount) return { status: 'duplicate' };
  }
  let result: SendTemplateResult;
  try {
    result = await renderAndDeliver(input.template, input.lang, input.to, input.vars, input.linkCode);
  } catch (error) {
    logger.error('parents.email_send_failed', { template: base.template, error: serializeError(error) });
    result = { ok: false, code: 'exception', message: 'Send failed' };
  }
  const status = result.ok ? (result.id === 'captured' ? 'captured' : 'sent') : result.code === 'daily_ceiling' || result.code === 'provider_quota' ? 'held' : 'failed';
  await ParentEmailSend.updateOne({ key }, { $set: { status, ...(result.ok ? {} : { code: result.code.slice(0, 80) }) } });
  return { status, ...(result.ok ? {} : { code: result.code }) };
}

/** Never lets an email problem fail the event that triggered it. */
async function safely(what: string, fn: () => Promise<unknown>): Promise<void> {
  if (!parentEmailsEnabled() || mongoose.connection.readyState !== 1) return;
  try {
    await fn();
  } catch (error) {
    logger.error('parents.email_hook_failed', { what, error: serializeError(error) });
  }
}

async function childAndSchool(studentId: string, institutionId?: string) {
  const s = await Student.findOne({ id: studentId }).select('name institutionId').lean();
  const school = await Institution.findOne({ id: institutionId ?? s?.institutionId }).select('name').lean();
  return { firstName: firstName(s?.name) || 'your child', school: school?.name ?? '' };
}

// ------------------------------------------------------------ link confirmed / ended

export function notifyLinkConfirmed(link: { id: string; parentUserId: string; studentId: string; institutionId?: string; codeId?: string }) {
  return safely('link_confirmed', async () => {
    if (!(await schoolEmailSwitches(link.institutionId)).linkConfirmed) return;
    const to = await parentRecipient(link.parentUserId);
    if (!to) return;
    const c = await childAndSchool(link.studentId, link.institutionId);
    await sendParentEmailOnce({
      key: `confirmed:${link.id}:${link.codeId ?? ''}`, template: 'parent-link-confirmed', to: to.email, lang: to.lang,
      vars: { NAME: to.name, CHILD_NAME: c.firstName, SCHOOL_NAME: c.school, ACTION_URL: appLink('/parents') },
      parentUserId: link.parentUserId, studentId: link.studentId, institutionId: link.institutionId,
    });
  });
}

export function notifyLinkEnded(link: { id: string; parentUserId: string; studentId: string; institutionId?: string }, reason: ParentLinkEndReason, endedAt: Date) {
  return safely('link_ended', async () => {
    if (!ENDS_THAT_EMAIL.includes(reason)) return;
    if (!(await schoolEmailSwitches(link.institutionId)).linkEnded) return;
    const to = await parentRecipient(link.parentUserId);
    if (!to) return;
    const c = await childAndSchool(link.studentId, link.institutionId);
    await sendParentEmailOnce({
      key: `ended:${link.id}:${endedAt.toISOString()}`, template: 'parent-link-ended', to: to.email, lang: to.lang,
      vars: { NAME: to.name, CHILD_NAME: c.firstName, SCHOOL_NAME: c.school },
      parentUserId: link.parentUserId, studentId: link.studentId, institutionId: link.institutionId,
    });
  });
}

// ------------------------------------------------------------ new results

/**
 * A result changed status (released, or finalized for an "immediately" school).
 * Each active parent of the child whose school sends new-results emails and who
 * did not opt out gets ONE email per child per Cairo day (later results that day
 * are in the portal).
 */
export function notifyResultVisible(attemptId: string) {
  return safely('new_results', async () => {
    const a = await AssessmentAttempt.findOne({ id: attemptId }).select('id studentId institutionId assessmentTitle score totalPoints maxPoints gradingStatus assignmentId status').lean();
    if (!a || a.status !== 'submitted' || typeof a.score !== 'number') return;
    const policy = await resultsPolicyFor(a.institutionId);
    const visible = policy === 'legacy' ? a.gradingStatus === 'released' : attemptVisible(policy, a) && (a.gradingStatus === 'released' || a.gradingStatus === 'finalized');
    if (!visible) return;
    if (!(await schoolEmailSwitches(a.institutionId)).newResults) return;
    if ((await schoolsWithAccessOff([a.institutionId])).size) return;
    const links = await ParentLearnerLink.find({ studentId: a.studentId, status: 'active', institutionId: a.institutionId }).select('id parentUserId').lean();
    if (!links.length) return;
    const c = await childAndSchool(a.studentId, a.institutionId);
    const asg = a.assignmentId ? await Assignment.findOne({ id: a.assignmentId }).select('classId').lean() : null;
    const cls = asg?.classId ? await CourseInstance.findOne({ id: asg.classId }).select('courseName').lean() : null;
    const score = typeof a.totalPoints === 'number' && typeof a.maxPoints === 'number' && a.maxPoints > 0 ? `${a.totalPoints} / ${a.maxPoints}` : `${Math.round(a.score)}%`;
    const day = cairoDay();
    for (const l of links) {
      const to = await parentRecipient(l.parentUserId);
      if (!to || !to.prefs.newResults) continue;
      await sendParentEmailOnce({
        key: `results:${l.parentUserId}:${a.studentId}:${day}`, template: 'parent-new-results', to: to.email, lang: to.lang,
        vars: { NAME: to.name, CHILD_NAME: c.firstName, TEST_NAME: a.assessmentTitle || '', CLASS_NAME: cls?.courseName || c.school, SCORE: score, LEVEL: await levelFor(l.parentUserId, a.studentId), ACTION_URL: appLink('/parents/progress') },
        parentUserId: l.parentUserId, studentId: a.studentId, institutionId: a.institutionId,
      });
    }
  });
}

async function levelFor(parentUserId: string, studentId: string): Promise<string> {
  try {
    const svc = await import('./service');
    const ctx = await svc.requireLearner(parentUserId, studentId);
    return (await svc.levelCard(ctx)).cefr;
  } catch {
    return '—';
  }
}

// ------------------------------------------------------------ weekly summary

/** One child's numbers for the week that ended before `weekEnd` (the parent's own view, P3 rule included). */
async function childWeek(parentUserId: string, studentId: string, lang: Lang, at: Date): Promise<ChildWeek | null> {
  const svc = await import('./service');
  let ctx;
  try {
    ctx = await svc.requireLearner(parentUserId, studentId);
  } catch {
    return null; // ended, school access Off, ...: nothing about this child
  }
  const r = (await svc.weeklyReport(ctx, at)).report;
  const school = await Institution.findOne({ id: ctx.link.institutionId }).select('name').lean();
  const base = {
    firstName: ctx.firstName, school: school?.name ?? '', status: r.status, minutesDone: r.minutesDone, goalMinutes: r.goalMinutes,
    lessonsDone: r.lessonsDone, skillsMastered: r.outcomesMastered, level: r.level.cefr, tip: r.tryAtHome.text[lang] || r.tryAtHome.text.en,
  };
  // All subjects: one line per subject with its top suggestion; only real data (no placeholder tip, the level only when real).
  if (!parentAllSubjectsEnabled()) return base;
  const o = await (await import('./subjectViews')).subjectsOverview(ctx, at);
  return {
    ...base, level: r.level.mock ? '' : r.level.cefr, tip: '',
    subjects: o.subjects.map((c) => ({ name: c.name[lang] || c.name.en, minutes: c.minutesThisWeek, lessons: c.lessonsThisWeek, result: c.latestResult?.score ?? null, tip: c.top ? `${c.top.do[lang] || c.top.do.en} ${c.top.why[lang] || c.top.why.en}` : null })),
  };
}

/** The weekly summary of one parent: one email with a section per child. `only` limits it to one child ("Share this week"). */
export async function sendWeeklySummary(parentUserId: string, opts: { key: string; at: Date; weekStart: string; weekEnd: string; only?: string; ignorePrefs?: boolean }): Promise<{ status: string; code?: string }> {
  const to = await parentRecipient(parentUserId);
  if (!to) return { status: 'no_recipient' };
  if (!opts.ignorePrefs && !to.prefs.weeklySummary) return { status: 'opted_out' };
  const links = await ParentLearnerLink.find({ parentUserId, status: 'active', ...(opts.only ? { studentId: opts.only } : {}) }).select('studentId institutionId').lean();
  const sections: ChildWeek[] = [];
  for (const l of links) {
    if (!opts.only && !(await schoolEmailSwitches(l.institutionId)).weeklySummary) continue;
    const w = await childWeek(parentUserId, l.studentId, to.lang, opts.at);
    if (w) sections.push(w);
  }
  if (!sections.length) return { status: 'no_children' };
  return sendParentEmailOnce({
    key: opts.key, template: 'parent-weekly-summary', to: to.email, lang: to.lang,
    vars: {
      NAME: to.name, CHILDREN_NAMES: namesList(to.lang, sections.map((s) => s.firstName)), WEEK_LABEL: weekLabel(to.lang, opts.weekStart, opts.weekEnd),
      CHILD_SECTIONS: { __html: sections.map((s) => childSection(to.lang, s)).join('') }, ACTION_URL: appLink('/parents'),
    },
    parentUserId,
  });
}

/**
 * The weekly step of the daily job: once Sunday 18:00 Cairo has passed, every
 * parent gets the summary of the week that ended (Saturday to Friday), once.
 * `force` (maintenance, E2E) runs it on any day. A time budget keeps the daily
 * run short; parents not reached are done on the next run (the key holds).
 */
export async function runWeeklySummaries(opts: { now?: Date; force?: boolean; budgetMs?: number; limit?: number } = {}) {
  if (!parentEmailsEnabled()) return { skipped: 'parent_emails_off' };
  const now = opts.now ?? new Date();
  const { weekStartDay, addDays, cairoDayStart } = await import('./time');
  const thisWeek = weekStartDay(now); // Saturday
  const sundayEvening = new Date(cairoDayStart(addDays(thisWeek, 1)).getTime() + 18 * 3_600_000);
  if (!opts.force && now < sundayEvening) return { skipped: 'not_yet', weekStart: addDays(thisWeek, -7) };
  const weekStart = addDays(thisWeek, -7);
  const weekEnd = addDays(thisWeek, -1);
  const at = new Date(cairoDayStart(thisWeek).getTime() - 60_000); // Friday 23:59 Cairo: the week that ended
  const started = Date.now();
  const parents = await ParentLearnerLink.distinct('parentUserId', { status: 'active' });
  const out: Record<string, number> = {};
  let n = 0;
  for (const parentUserId of parents) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) { out.deferred = parents.length - n; break; }
    if (opts.limit && n >= opts.limit) break;
    n++;
    const r = await sendWeeklySummary(String(parentUserId), { key: `weekly:${parentUserId}:${weekStart}`, at, weekStart, weekEnd });
    out[r.status] = (out[r.status] ?? 0) + 1;
  }
  return { weekStart, parents: n, ...out };
}

// ------------------------------------------------------------ invite ("Send code by email")

export async function sendInviteEmail(input: { to: string; codeId: string; code: string; studentId: string; institutionId: string; ttlDays: number; lang?: Lang }): Promise<{ status: string; code?: string }> {
  // The school's email language (D1: Arabic for Egyptian schools unless set otherwise).
  const school = await Institution.findOne({ id: input.institutionId }).select('emailLanguage country').lean();
  const lang: Lang = input.lang ?? (school?.emailLanguage === 'ar' || (!school?.emailLanguage && school?.country === 'EG') ? 'ar' : 'en');
  const c = await childAndSchool(input.studentId, input.institutionId);
  const days = lang === 'ar' ? `${input.ttlDays} ${input.ttlDays === 1 ? 'يوم' : input.ttlDays === 2 ? 'يومان' : input.ttlDays <= 10 ? 'أيام' : 'يومًا'}` : `${input.ttlDays} day${input.ttlDays === 1 ? '' : 's'}`;
  return sendParentEmailOnce({
    key: `invite:${input.codeId}`, template: 'parent-invite', to: input.to, lang,
    vars: {
      NAME: '', SCHOOL_NAME: c.school, CHILDREN_NAMES: c.firstName,
      CHILD_CODES: { __html: codeTable(lang, [{ firstName: c.firstName, school: c.school, code: input.code }]) }, EXPIRES_IN: days, ACTION_URL: appLink('/parents/link'),
    },
    studentId: input.studentId, institutionId: input.institutionId, linkCode: input.code,
  });
}
