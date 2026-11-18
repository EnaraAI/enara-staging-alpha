import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { ParentCapturedCode, ParentEmailCode, type EmailCodePurpose } from '../models/ParentEmailCode';
import { ParentDeviceSession } from '../models/ParentDeviceSession';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { ParentLinkCode } from '../models/ParentLinkCode';
import { ParentProfile } from '../models/ParentProfile';
import { ParentUsageEvent } from '../models/ParentUsage';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { PARENT_TEMPLATES_BUNDLE } from '../email/parents/parentTemplatesBundle';
import { isReservedRecipient } from '../email/reservedRecipients';
import { sendCodeTemplate } from '../email/sendBundledTemplate';
import { emailPolicy } from '../email/testInbox';
import { recordAudit } from '../services/auditTrail';
import { logger } from '../utils/logging';
import { normalizeEmail } from '../utils/validation';
import { isCodeOnlyEmail } from './codeSignup';
import { escapeHtml } from './emailBlocks';

// Parents P2 (PARENT_EMAIL_SIGNIN_ENABLED), owner decisions b) and "Parents with
// more than one child" 2), 18 Nov 2026:
//   - "Add your email": a signed-in parent types their own email and gets a
//     6-digit code (parent-email-verify). 10 minutes, at most 5 tries, a new
//     request replaces the old code, at most one request a minute and 5 an
//     hour per address. A verified email is used for parent emails (P4) and
//     for passwordless sign-in. No passwords.
//   - Passwordless sign-in: the parent types their email and gets a new
//     6-digit code (parent-sign-in-code). The answer never says whether an
//     account exists. Signing in remembers the device.
//   - Merge: verifying an email that already belongs to ANOTHER parent account
//     offers a merge ("This email already has an account with another child.
//     Merge them?"). The 6-digit code proves ownership; the merge needs that
//     proof (a 10-minute ticket), keeps every link, consent and history, moves
//     them to the account that has the email, disables the other account, and
//     is audited. Never a merge without that verification.
// Codes are only in the email body (the two emails have no link at all). Only
// hashes are stored; audits and logs hold IDs, never an address or a code.
// The emails go through the lms-test safety path (email/testInbox.ts: the test
// inbox redirect, the "[lms-test]" prefix, the daily ceiling; captured in the
// E2E stack, where the code is also kept for the suite: ParentCapturedCode).

export const EMAIL_CODE_TTL_MS = 10 * 60_000;
export const EMAIL_CODE_MAX_TRIES = 5;
export const EMAIL_CODE_MIN_GAP_MS = 60_000;
export const EMAIL_CODE_PER_HOUR = 5;
export const MERGE_TICKET_TTL_MS = 10 * 60_000;
const EXPIRES_IN = { en: '10 minutes', ar: '10 دقائق' } as const;

export const hashEmail = (email: string) => createHash('sha256').update(`parent-email:${email.trim().toLowerCase()}`).digest('hex');
const hashCode = (rowId: string, code: string) => createHash('sha256').update(`parent-email-code:${rowId}:${code}`).digest('hex');
const digits = (input: unknown) => (typeof input === 'string' ? input.replace(/\D/g, '') : '');
const fmt = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
const PLACEHOLDER_NAMES = new Set(['Parent', 'ولي الأمر']);
const invalidCode = () => new AppError('Code not valid or expired', 400, 'INVALID_EMAIL_CODE');

function parentAddress(input: unknown): string {
  const email = normalizeEmail(input);
  // A reserved or code-only placeholder address can never receive a code.
  if (isReservedRecipient(email) || isCodeOnlyEmail(email)) throw new AppError('Use an email address you can receive mail at', 400, 'EMAIL_NOT_USABLE');
  return email;
}

/** Per address and purpose: at most one request a minute and EMAIL_CODE_PER_HOUR an hour. */
async function rateCheck(purpose: EmailCodePurpose, emailHash: string, now: Date) {
  const recent = await ParentEmailCode.find({ purpose, emailHash, createdAt: { $gt: new Date(now.getTime() - 3_600_000) } }).select('createdAt').sort({ createdAt: -1 }).lean();
  if (recent[0] && now.getTime() - new Date(recent[0].createdAt).getTime() < EMAIL_CODE_MIN_GAP_MS) throw new AppError('Wait a minute before asking for a new code', 429, 'EMAIL_CODE_TOO_SOON');
  if (recent.length >= EMAIL_CODE_PER_HOUR) throw new AppError('Too many codes asked for this email. Try again in an hour.', 429, 'EMAIL_CODE_RATE_LIMITED');
}

async function newCode(purpose: EmailCodePurpose, emailHash: string, userId: string | undefined, now: Date): Promise<{ id: string; code: string }> {
  // A new request replaces the old code.
  await ParentEmailCode.updateMany({ purpose, emailHash, usedAt: { $exists: false } }, { $set: { usedAt: now } });
  const id = `pec_${randomUUID()}`;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await ParentEmailCode.create({ id, purpose, emailHash, ...(userId ? { userId } : {}), codeHash: hashCode(id, code), attempts: 0, createdAt: now, expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS) });
  return { id, code };
}

/** Checks a 6-digit code (5 tries), marks it used. Returns the row. */
async function useCode(purpose: EmailCodePurpose, emailHash: string, input: unknown, filter: Record<string, unknown> = {}, now = new Date()) {
  const code = digits(input);
  const row = await ParentEmailCode.findOne({ purpose, emailHash, usedAt: { $exists: false }, expiresAt: { $gt: now }, ...filter }).select('+codeHash').sort({ createdAt: -1 });
  if (!row) throw invalidCode();
  if (row.attempts >= EMAIL_CODE_MAX_TRIES) throw new AppError('Too many tries. Ask for a new code.', 429, 'EMAIL_CODE_LOCKED');
  if (code.length !== 6 || hashCode(row.id, code) !== row.codeHash) {
    const r = await ParentEmailCode.findOneAndUpdate({ id: row.id }, { $inc: { attempts: 1 } }, { new: true });
    if ((r?.attempts ?? EMAIL_CODE_MAX_TRIES) >= EMAIL_CODE_MAX_TRIES) await ParentEmailCode.updateOne({ id: row.id }, { $set: { usedAt: now } });
    throw invalidCode();
  }
  const claimed = await ParentEmailCode.updateOne({ id: row.id, usedAt: { $exists: false } }, { $set: { usedAt: now } });
  if (!claimed.modifiedCount) throw invalidCode();
  return row;
}

async function languageOf(userId: string | undefined, fallback: unknown): Promise<'en' | 'ar'> {
  const p = userId ? await ParentProfile.findOne({ userId }).select('language').lean() : null;
  return p?.language === 'ar' || (!p && fallback === 'ar') ? 'ar' : 'en';
}

/** Sends a code email through the safety path; in the E2E stack (capture) also keeps the code for the suite. */
async function sendCode(template: 'parent-email-verify' | 'parent-sign-in-code', purpose: EmailCodePurpose, to: string, code: string, lang: 'en' | 'ar', name?: string) {
  const policy = emailPolicy();
  if (policy.staging && policy.capture && mongoose.connection.readyState === 1) {
    await ParentCapturedCode.updateOne({ emailHash: hashEmail(to), purpose }, { $set: { code: fmt(code), at: new Date() } }, { upsert: true });
  }
  const alias = `${template}-${lang}` as const;
  const result = await sendCodeTemplate('parent', PARENT_TEMPLATES_BUNDLE, alias, to, { NAME: name && !PLACEHOLDER_NAMES.has(name) ? escapeHtml(name.split(/\s+/)[0]) : '', CODE: fmt(code), EXPIRES_IN: EXPIRES_IN[lang] });
  if (!result.ok) {
    logger.warn('parents.email_code_not_sent', { template, code: result.code });
    throw new AppError('The code email could not be sent. Try again later.', 503, 'EMAIL_CODE_NOT_SENT');
  }
}

async function firstNames(userId: string): Promise<string[]> {
  const links = await ParentLearnerLink.find({ parentUserId: userId, status: 'active' }).select('studentId').lean();
  const students = await Student.find({ id: { $in: links.map((l) => l.studentId) } }).select('name').lean();
  return students.map((s) => String(s.name || '').trim().split(/\s+/)[0]).filter(Boolean);
}

// ------------------------------------------------------------ add your email

/** "Add your email": sends a 6-digit code to the address the signed-in parent typed. */
export async function startEmailVerification(parent: { id: string }, input: unknown, now = new Date()) {
  const email = parentAddress(input);
  const owner = await User.findOne({ email }).select('role').lean();
  if (owner && owner.role !== 'parent') throw new AppError('This email belongs to an ENARA school account. Use a different email.', 409, 'EMAIL_NOT_FOR_PARENT');
  const me = await User.findById(parent.id).select('email name').lean();
  if (me?.email === email && (await ParentProfile.exists({ userId: parent.id, emailVerifiedAt: { $exists: true } }))) return { alreadyVerified: true };
  const emailHash = hashEmail(email);
  await rateCheck('verify', emailHash, now);
  const { code } = await newCode('verify', emailHash, parent.id, now);
  await sendCode('parent-email-verify', 'verify', email, code, await languageOf(parent.id, undefined), me?.name);
  await recordAudit('parent_email_code_sent', { id: parent.id, role: 'parent' }, { type: 'user', id: parent.id }, { purpose: 'verify' });
  return { sent: true, expiresInSec: EMAIL_CODE_TTL_MS / 1000 };
}

/**
 * Checks the code. The email becomes this account's verified address, or, when
 * another parent account already has it, a merge is offered (a ticket that
 * allows exactly that merge for 10 minutes).
 */
export async function verifyEmail(parent: { id: string }, input: unknown, codeInput: unknown, now = new Date()) {
  const email = parentAddress(input);
  const emailHash = hashEmail(email);
  await useCode('verify', emailHash, codeInput, { userId: parent.id }, now);
  const owner = await User.findOne({ email }).select('role status').lean();
  if (owner && owner.role !== 'parent') throw new AppError('This email belongs to an ENARA school account. Use a different email.', 409, 'EMAIL_NOT_FOR_PARENT');
  if (owner && String(owner._id) !== parent.id) {
    if (owner.status !== 'active') throw new AppError('This email cannot be used. Ask your school.', 409, 'EMAIL_NOT_USABLE');
    const ticket = randomBytes(24).toString('base64url');
    const id = `pec_${randomUUID()}`;
    await ParentEmailCode.create({ id, purpose: 'merge', emailHash, userId: parent.id, targetUserId: String(owner._id), codeHash: hashCode(id, ticket), attempts: 0, createdAt: now, expiresAt: new Date(now.getTime() + MERGE_TICKET_TTL_MS) });
    await recordAudit('parent_email_verified', { id: parent.id, role: 'parent' }, { type: 'user', id: parent.id }, { outcome: 'merge_offered', otherUserId: String(owner._id) });
    return { verified: true, merge: { ticket: `${id}.${ticket}`, otherChildren: await firstNames(String(owner._id)), yourChildren: await firstNames(parent.id) } };
  }
  try {
    await User.updateOne({ _id: parent.id }, { $set: { email } });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new AppError('This email was just taken by another account. Try again.', 409, 'EMAIL_TAKEN');
    throw e;
  }
  await ParentProfile.updateOne({ userId: parent.id }, { $set: { emailVerifiedAt: now } }, { upsert: true });
  await recordAudit('parent_email_verified', { id: parent.id, role: 'parent' }, { type: 'user', id: parent.id }, { outcome: 'verified' });
  return { verified: true, email };
}

// ------------------------------------------------------------ merge

/** The merge the verified ticket allows: this account into the one that has the email. Returns the account to sign in as. */
export async function mergeWithTicket(parent: { id: string }, ticketInput: unknown, now = new Date()) {
  const [id, secret] = typeof ticketInput === 'string' ? ticketInput.split('.') : [];
  const row = id && secret ? await ParentEmailCode.findOne({ id, purpose: 'merge', userId: parent.id, usedAt: { $exists: false }, expiresAt: { $gt: now } }).select('+codeHash') : null;
  if (!row || hashCode(row.id, secret) !== row.codeHash || !row.targetUserId) throw new AppError('This merge is no longer valid. Verify your email again.', 400, 'MERGE_TICKET_INVALID');
  const claimed = await ParentEmailCode.updateOne({ id: row.id, usedAt: { $exists: false } }, { $set: { usedAt: now } });
  if (!claimed.modifiedCount) throw new AppError('This merge is no longer valid. Verify your email again.', 400, 'MERGE_TICKET_INVALID');
  const result = await mergeParentAccounts(parent.id, row.targetUserId, now);
  const into = await User.findById(row.targetUserId);
  if (!into || into.status !== 'active' || into.role !== 'parent') throw new AppError('This merge is no longer valid.', 400, 'MERGE_TICKET_INVALID');
  return { user: into, ...result };
}

/**
 * Moves everything of `fromId` to `intoId` and disables `fromId`. Links (with
 * their consent, role, controls and end history) move; when both accounts are
 * linked to the same child, the active link wins (the other row is removed, its
 * ID kept in the audit). Redeemed codes and usage events follow. The merged
 * account's sessions and remembered devices stop working.
 */
export async function mergeParentAccounts(fromId: string, intoId: string, now = new Date()) {
  if (fromId === intoId) throw new AppError('Nothing to merge', 400, 'VALIDATION_ERROR');
  const from = await ParentLearnerLink.find({ parentUserId: fromId });
  const moved: string[] = [];
  const dropped: string[] = [];
  for (const link of from) {
    const other = await ParentLearnerLink.findOne({ parentUserId: intoId, studentId: link.studentId });
    if (other) {
      if (other.status !== 'active' && link.status === 'active') {
        dropped.push(other.id);
        await ParentLearnerLink.deleteOne({ id: other.id });
      } else {
        dropped.push(link.id);
        await ParentLearnerLink.deleteOne({ id: link.id });
        continue;
      }
    }
    await ParentLearnerLink.updateOne({ id: link.id }, { $set: { parentUserId: intoId } });
    moved.push(link.id);
  }
  await ParentLinkCode.updateMany({ redeemedBy: fromId }, { $set: { redeemedBy: intoId } });
  await ParentUsageEvent.updateMany({ parentUserId: fromId }, { $set: { parentUserId: intoId } });
  await ParentDeviceSession.updateMany({ userId: fromId, revokedAt: { $exists: false } }, { $set: { revokedAt: now } });
  await ParentProfile.updateOne({ userId: fromId }, { $set: { mergedInto: intoId } }, { upsert: true });
  await ParentProfile.updateOne({ userId: intoId }, { $set: { emailVerifiedAt: now } }, { upsert: true });
  await User.updateOne({ _id: fromId }, { $set: { status: 'disabled' }, $inc: { tokenVersion: 1 } });
  await recordAudit('parent_accounts_merged', { id: fromId, role: 'parent' }, { type: 'user', id: intoId }, { fromUserId: fromId, intoUserId: intoId, linksMoved: moved, linksDropped: dropped });
  return { linksMoved: moved.length, linksDropped: dropped.length };
}

// ------------------------------------------------------------ passwordless sign-in

/** Public. Always the same answer (no account enumeration); a code is sent only to an existing parent account. */
export async function startSignIn(input: unknown, opts: { language?: unknown } = {}, now = new Date()) {
  const email = parentAddress(input);
  const emailHash = hashEmail(email);
  await rateCheck('signin', emailHash, now);
  const user = await User.findOne({ email, role: 'parent', status: 'active' }).select('name').lean();
  const { code } = await newCode('signin', emailHash, user ? String(user._id) : undefined, now);
  if (user) {
    await sendCode('parent-sign-in-code', 'signin', email, code, await languageOf(String(user._id), opts.language), user.name);
    await recordAudit('parent_email_code_sent', { id: String(user._id), role: 'parent' }, { type: 'user', id: String(user._id) }, { purpose: 'signin' });
  }
  return { sent: true, expiresInSec: EMAIL_CODE_TTL_MS / 1000 };
}

/** Public. The code for that email -> the parent account (the caller signs a session and remembers the device). */
export async function verifySignIn(input: unknown, codeInput: unknown, now = new Date()) {
  const email = parentAddress(input);
  const row = await useCode('signin', hashEmail(email), codeInput, { userId: { $exists: true } }, now);
  const user = await User.findById(row.userId);
  if (!user || user.role !== 'parent' || user.status !== 'active' || user.email !== email) throw invalidCode();
  await ParentProfile.updateOne({ userId: String(user._id) }, { $set: { emailVerifiedAt: now } }, { upsert: true });
  await recordAudit('parent_signed_in', { id: String(user._id), role: 'parent' }, { type: 'user', id: String(user._id) }, { method: 'email_code' });
  return user;
}

/** The E2E stack only (capture): the last code captured for an address (maintenance route). */
export async function capturedCodeFor(email: string, purpose: EmailCodePurpose): Promise<string | null> {
  if (!emailPolicy().capture) return null;
  return (await ParentCapturedCode.findOne({ emailHash: hashEmail(email), purpose }).lean())?.code ?? null;
}
