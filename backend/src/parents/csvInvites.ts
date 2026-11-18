import { createHash, randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { Institution } from '../models/Institution';
import { ParentEmailSend } from '../models/ParentEmailSend';
import { ParentInvite } from '../models/ParentInvite';
import { ParentLinkCode } from '../models/ParentLinkCode';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { LmsUser } from '../integrations/lms/models';
import { isReservedRecipient } from '../email/reservedRecipients';
import { recordAudit } from '../services/auditTrail';
import { generateCode, hashCode } from './codes';
import { codeTtlMsFor } from './codeTools';
import { codeTable, namesList, type Lang } from './emailBlocks';
import { parentCsvInvitesEnabled } from './flags';
import { sendParentEmailOnce } from './parentEmails';
import { parentAccessOf, schoolAccessOffError } from './schoolAccess';

// Parents P5 (PARENT_CSV_INVITES_ENABLED + the school's "CSV invites" setting, default off).
//   1. The school admin uploads a CSV: student_ref, parent_email, parent_name?, language?
//      student_ref is the ENARA student ID or the Moodle user ID (the LMS user id the
//      launches carry), never an email (D5). The file is read in the browser and sent
//      as text; it is never stored.
//   2. Preview: every row gets a status (ok, bad_email, unknown_student, archived,
//      duplicate, missing). Nothing is created or sent.
//   3. Confirm: the same text is checked again; for each OK row a new code
//      (the school's expiry) and an invite row; rows with the same parent email are
//      grouped into ONE parent-invite email listing each child's first name and code.
//      Codes are in the email body only (never in a link, never shown to the admin).
//      Sent through P4's path (safety path on lms-test, never twice).
//   4. The list: status (sent, redeemed, expired, revoked), Resend (a new code, the
//      old one revoked) and Revoke.
// No email binding (owner decision e): the invited address is only offered as a
// suggestion when the parent who redeemed the code adds an email.
type Actor = { id: string; role: string; institutionId?: string };
export const MAX_CSV_BYTES = 512 * 1024;
export const MAX_CSV_ROWS = 2000;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const DAY = 86_400_000;
export const emailHashOf = (email: string) => createHash('sha256').update(`parent-invite:${email.trim().toLowerCase()}`).digest('hex');
const firstName = (name?: string | null) => String(name ?? '').trim().split(/\s+/)[0] || '';

export type RowStatus = 'ok' | 'bad_email' | 'unknown_student' | 'archived' | 'duplicate' | 'missing';
export interface CheckedRow { row: number; studentRef: string; status: RowStatus; studentId?: string; studentName?: string; email?: string; parentName?: string; language?: Lang }

/** A small RFC 4180 reader: commas, quotes ("" inside quotes), CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

async function schoolCsvAllowed(institutionId: string | undefined) {
  if (!parentCsvInvitesEnabled() || !institutionId) return false;
  const s = await Institution.findOne({ id: institutionId }).select('parentPortal').lean();
  return s?.parentPortal?.csvInvites === true;
}

/** School admin of a school that allows CSV invites (ENARA admins act for a school they name). */
async function schoolFor(actor: Actor, institutionId?: string): Promise<string> {
  const school = actor.role === 'enara-admin' ? institutionId : actor.role === 'admin' ? actor.institutionId : undefined;
  if (!school) throw new AppError('Access denied', 403, 'FORBIDDEN');
  if (!(await schoolCsvAllowed(school))) throw new AppError('CSV invitations are not switched on for this school', 403, 'CSV_INVITES_OFF');
  return school;
}

/** Checks every row (nothing is created). Students of another school read as unknown (nothing is revealed). */
export async function checkCsv(institutionId: string, text: unknown): Promise<{ rows: CheckedRow[]; counts: Record<RowStatus, number> }> {
  if (typeof text !== 'string' || !text.trim()) throw new AppError('The CSV is empty', 400, 'CSV_EMPTY');
  if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new AppError('The CSV is too large (512 KB at most)', 400, 'CSV_TOO_LARGE');
  const all = parseCsv(text.replace(/^﻿/, ''));
  const header = (all.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('student_ref') < 0 || col('parent_email') < 0) throw new AppError('The first line must name the columns: student_ref, parent_email (parent_name and language are optional)', 400, 'CSV_HEADER');
  if (all.length > MAX_CSV_ROWS) throw new AppError(`At most ${MAX_CSV_ROWS} rows`, 400, 'CSV_TOO_MANY_ROWS');
  const refs = [...new Set(all.map((r) => String(r[col('student_ref')] ?? '').trim()).filter(Boolean))];
  // ENARA student IDs, then Moodle user IDs (externalUserId of this school's LMS users).
  const byId = new Map((await Student.find({ id: { $in: refs }, institutionId }).select('id name archivedAt').lean()).map((s) => [s.id, s]));
  const lmsUsers = await LmsUser.find({ institutionId, externalUserId: { $in: refs.filter((r) => !byId.has(r)) }, enaraUserId: { $exists: true } }).select('externalUserId enaraUserId').lean();
  const accounts = await User.find({ _id: { $in: lmsUsers.map((u) => u.enaraUserId).filter((x) => /^[a-f0-9]{24}$/i.test(String(x))) }, role: 'student', institutionId }).select('studentId').lean();
  const studentOfAccount = new Map(accounts.map((a) => [String(a._id), a.studentId]));
  const lmsStudents = new Map((await Student.find({ id: { $in: accounts.map((a) => a.studentId).filter(Boolean) }, institutionId }).select('id name archivedAt').lean()).map((s) => [s.id, s]));
  type S = { id: string; name: string; archivedAt?: Date | null };
  const byLms = new Map<string, S>();
  for (const u of lmsUsers) {
    const s = lmsStudents.get(String(studentOfAccount.get(String(u.enaraUserId))));
    if (s) byLms.set(u.externalUserId, s as S);
  }
  const seen = new Set<string>();
  const rows: CheckedRow[] = all.map((r, i) => {
    const ref = String(r[col('student_ref')] ?? '').trim();
    const email = String(r[col('parent_email')] ?? '').trim().toLowerCase();
    const parentName = col('parent_name') >= 0 ? String(r[col('parent_name')] ?? '').trim().slice(0, 120) : '';
    const langRaw = col('language') >= 0 ? String(r[col('language')] ?? '').trim().toLowerCase() : '';
    const base = { row: i + 2, studentRef: ref.slice(0, 80) };
    if (!ref || !email) return { ...base, status: 'missing' as const };
    if (!EMAIL_RE.test(email) || email.length > 254 || isReservedRecipient(email)) return { ...base, status: 'bad_email' as const };
    const s = byId.get(ref) ?? byLms.get(ref);
    // A permanently deleted student (PDPL) no longer exists, so it reads as unknown: never invited.
    if (!s) return { ...base, status: 'unknown_student' as const };
    if (s.archivedAt) return { ...base, status: 'archived' as const, studentName: s.name };
    const key = `${s.id}|${email}`;
    if (seen.has(key)) return { ...base, status: 'duplicate' as const, studentName: s.name };
    seen.add(key);
    return { ...base, status: 'ok' as const, studentId: s.id, studentName: s.name, email, ...(parentName ? { parentName } : {}), ...(langRaw === 'ar' || langRaw === 'en' ? { language: langRaw as Lang } : {}) };
  });
  const counts = { ok: 0, bad_email: 0, unknown_student: 0, archived: 0, duplicate: 0, missing: 0 } as Record<RowStatus, number>;
  for (const r of rows) counts[r.status]++;
  return { rows, counts };
}

const masked = (email: string) => {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}•••@${domain}`;
};
/** What the preview shows: the address masked, nothing else about it. */
const view = (r: CheckedRow) => ({ row: r.row, studentRef: r.studentRef, status: r.status, ...(r.studentName ? { studentName: r.studentName } : {}), ...(r.email ? { email: masked(r.email) } : {}) });

export async function previewCsv(actor: Actor, text: unknown, institutionId?: string) {
  const school = await schoolFor(actor, institutionId);
  const { rows, counts } = await checkCsv(school, text);
  return { rows: rows.map(view), counts, emails: new Set(rows.filter((r) => r.status === 'ok').map((r) => r.email)).size };
}

async function newCode(studentId: string, institutionId: string, actorId: string, expiresAt: Date) {
  let code = generateCode();
  for (let i = 0; i < 5 && (await ParentLinkCode.exists({ codeHash: hashCode(code.normalized) })); i++) code = generateCode();
  const row = await ParentLinkCode.create({ id: `plc_${randomUUID()}`, codeHash: hashCode(code.normalized), hint: code.normalized.slice(-2), studentId, institutionId, createdBy: actorId, status: 'active', expiresAt, createdAt: new Date() });
  return { id: row.id, display: code.display };
}

async function schoolInfo(institutionId: string) {
  const s = await Institution.findOne({ id: institutionId }).select('name emailLanguage country').lean();
  return { name: s?.name ?? '', lang: (s?.emailLanguage === 'ar' || (!s?.emailLanguage && s?.country === 'EG') ? 'ar' : 'en') as Lang };
}
const expiresText = (lang: Lang, days: number) => (lang === 'ar' ? `${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : days <= 10 ? 'أيام' : 'يومًا'}` : `${days} day${days === 1 ? '' : 's'}`);

async function sendGroup(key: string, to: string, lang: Lang, parentName: string, school: string, kids: { firstName: string; code: string }[], days: number, institutionId: string) {
  const { getAppUrl } = await import('../email/links');
  return sendParentEmailOnce({
    key, template: 'parent-invite', to, lang, institutionId,
    vars: {
      NAME: parentName ? firstName(parentName) : '', SCHOOL_NAME: school, CHILDREN_NAMES: namesList(lang, kids.map((k) => k.firstName)),
      CHILD_CODES: { __html: codeTable(lang, kids.map((k) => ({ firstName: k.firstName, school, code: k.code }))) }, EXPIRES_IN: expiresText(lang, days), ACTION_URL: `${getAppUrl()}/parents/link`,
    },
  });
}

/** Confirm: codes, invite rows and ONE email per parent address. The admin never sees a code. */
export async function confirmCsv(actor: Actor, text: unknown, institutionId?: string) {
  const school = await schoolFor(actor, institutionId);
  if ((await parentAccessOf(school)) === 'off') throw schoolAccessOffError();
  const { rows, counts } = await checkCsv(school, text);
  const ok = rows.filter((r) => r.status === 'ok');
  const ttlMs = await codeTtlMsFor(school);
  const days = Math.round(ttlMs / DAY);
  const expiresAt = new Date(Date.now() + ttlMs);
  const info = await schoolInfo(school);
  const batchId = `pib_${randomUUID()}`;
  const groups = new Map<string, CheckedRow[]>();
  for (const r of ok) groups.set(r.email!, [...(groups.get(r.email!) ?? []), r]);
  const emailResults: Record<string, number> = {};
  for (const [email, group] of groups) {
    const lang = group.find((r) => r.language)?.language ?? info.lang;
    const kids: { firstName: string; code: string }[] = [];
    for (const r of group) {
      const code = await newCode(r.studentId!, school, actor.id, expiresAt);
      await ParentInvite.create({ id: `pin_${randomUUID()}`, batchId, institutionId: school, studentId: r.studentId!, emailHash: emailHashOf(email), email, ...(r.parentName ? { parentName: r.parentName } : {}), language: lang, codeId: code.id, createdBy: actor.id, createdAt: new Date() });
      kids.push({ firstName: firstName(r.studentName) || 'your child', code: code.display });
    }
    const res = await sendGroup(`csvinvite:${batchId}:${emailHashOf(email)}`, email, lang, group.find((r) => r.parentName)?.parentName ?? '', info.name, kids, days, school);
    emailResults[res.status] = (emailResults[res.status] ?? 0) + 1;
  }
  await recordAudit('parent_csv_invites_sent', actor, { institutionId: school, type: 'institution', id: school }, { batchId, invited: ok.length, emails: groups.size, skipped: rows.length - ok.length, emailResults });
  return { batchId, invited: ok.length, emails: groups.size, emailResults, counts, rows: rows.map(view) };
}

/** The school's invites, newest first: the address masked, the status from the code. */
export async function listInvites(actor: Actor, institutionId?: string) {
  const school = await schoolFor(actor, institutionId);
  const invites = await ParentInvite.find({ institutionId: school }).select('+email').sort({ createdAt: -1 }).limit(500).lean();
  const codes = new Map((await ParentLinkCode.find({ id: { $in: invites.map((i) => i.codeId) } }).select('id status expiresAt').lean()).map((c) => [c.id, c]));
  const names = new Map((await Student.find({ id: { $in: invites.map((i) => i.studentId) } }).select('id name').lean()).map((s) => [s.id, s.name]));
  const now = new Date();
  return {
    invites: invites.map((i) => {
      const c = codes.get(i.codeId);
      const status = i.revokedAt || c?.status === 'revoked' ? 'revoked' : c?.status === 'redeemed' || i.redeemedAt ? 'redeemed' : !c || c.expiresAt <= now ? 'expired' : 'sent';
      return { id: i.id, studentId: i.studentId, studentName: names.get(i.studentId) ?? null, email: masked(i.email), status, createdAt: i.createdAt, resentAt: i.resentAt ?? null, expiresAt: c?.expiresAt ?? null };
    }),
  };
}

async function inviteFor(actor: Actor, inviteId: string, institutionId?: string) {
  const school = await schoolFor(actor, institutionId);
  const invite = await ParentInvite.findOne({ id: inviteId, institutionId: school }).select('+email');
  if (!invite) throw new AppError('Invite not found', 404, 'NOT_FOUND');
  return { school, invite };
}

/** Resend: the old code stops working, a new one goes out (that child only). */
export async function resendInvite(actor: Actor, inviteId: string, institutionId?: string) {
  const { school, invite } = await inviteFor(actor, inviteId, institutionId);
  const code = await ParentLinkCode.findOne({ id: invite.codeId }).select('status').lean();
  if (invite.revokedAt || code?.status === 'redeemed') throw new AppError('This invite can no longer be resent', 409, 'INVITE_CLOSED');
  const student = await Student.findOne({ id: invite.studentId, institutionId: school }).select('name archivedAt').lean();
  if (!student || student.archivedAt) throw new AppError('This student can no longer be invited', 409, 'INVITE_CLOSED');
  await ParentLinkCode.updateOne({ id: invite.codeId, status: 'active' }, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: actor.id } });
  const ttlMs = await codeTtlMsFor(school);
  const fresh = await newCode(invite.studentId, school, actor.id, new Date(Date.now() + ttlMs));
  invite.codeId = fresh.id;
  invite.resentAt = new Date();
  await invite.save();
  const info = await schoolInfo(school);
  const r = await sendGroup(`csvresend:${invite.id}:${fresh.id}`, invite.email, invite.language, invite.parentName ?? '', info.name, [{ firstName: firstName(student.name) || 'your child', code: fresh.display }], Math.round(ttlMs / DAY), school);
  await recordAudit('parent_csv_invite_resent', actor, { institutionId: school, type: 'student', id: invite.studentId }, { inviteId: invite.id, codeId: fresh.id, email: r.status });
  return { ok: true, emailStatus: r.status };
}

export async function revokeInvite(actor: Actor, inviteId: string, institutionId?: string) {
  const { school, invite } = await inviteFor(actor, inviteId, institutionId);
  await ParentLinkCode.updateOne({ id: invite.codeId, status: 'active' }, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: actor.id } });
  if (!invite.revokedAt) {
    invite.revokedAt = new Date();
    await invite.save();
  }
  await recordAudit('parent_csv_invite_revoked', actor, { institutionId: school, type: 'student', id: invite.studentId }, { inviteId: invite.id });
  return { ok: true };
}

/** A redeemed invite code: remember which parent account redeemed it (for the email suggestion). */
export async function markInviteRedeemed(codeId: string, parentUserId: string) {
  await ParentInvite.updateMany({ codeId, redeemedBy: { $exists: false } }, { $set: { redeemedBy: parentUserId, redeemedAt: new Date() } });
}

/** The address a school invited this parent at (most recent redeemed invite), offered when they add an email. Never a binding. */
export async function suggestedEmailFor(parentUserId: string): Promise<string | null> {
  if (!parentCsvInvitesEnabled()) return null;
  const i = await ParentInvite.findOne({ redeemedBy: parentUserId }).select('+email').sort({ redeemedAt: -1 }).lean();
  return i?.email ?? null;
}

/** For tests and the maintenance view: how many invite emails a batch sent (IDs only). */
export async function batchEmailRows(batchId: string) {
  return ParentEmailSend.find({ key: new RegExp(`^csvinvite:${batchId}:`) }).lean();
}
