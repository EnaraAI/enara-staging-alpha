import { createHash, randomBytes, randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { ParentLinkCode } from '../models/ParentLinkCode';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { ParentProfile } from '../models/ParentProfile';
import { Student } from '../models/Student';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { recordAudit } from '../services/auditTrail';
import { sendTemplate } from '../email/sendTemplate';
import { logger } from '../utils/logging';
import { tierOf } from './policy';
import { endParentLink, endReasonFor } from './linkLifecycle';
import { requireLearner } from './service';
import { parentAccessOf, schoolAccessOffError } from './schoolAccess';

// Parent link codes (decision 16 Nov 2026): the school admin issues a code for
// a learner (any age); a parent redeems it once; the link is ACTIVE on confirm.
// Learner-issued codes and a 13+ accept step are deferred.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export const CODE_LENGTH = 8; // shown as ENR-XXXX-XXXX (31^8 ≈ 8.5e11)
export const CODE_TTL_MS = 7 * 86_400_000;
export const MAX_FAILED_REDEEMS = 5;
export const REDEEM_LOCK_MS = 15 * 60_000;
export const INVALID_CODE_MESSAGE = 'Code not valid or expired';

export const hashCode = (normalized: string) => createHash('sha256').update(`parent-link:${normalized}`).digest('hex');

export function generateCode(): { display: string; normalized: string } {
  const bytes = randomBytes(CODE_LENGTH * 2);
  let raw = '';
  // Rejection sampling: no modulo bias.
  for (let i = 0; raw.length < CODE_LENGTH; i++) {
    const b = i < bytes.length ? bytes[i] : randomBytes(1)[0];
    if (b < 248) raw += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return { display: `ENR-${raw.slice(0, 4)}-${raw.slice(4)}`, normalized: raw };
}

/**
 * "enr-abcd-efgh", "ABCDEFGH", "ENR ABCD EFGH" -> "ABCDEFGH"; null if it can't be a code.
 * Codes in the old 6-character format (ENR-XXXX-XX) are no longer valid.
 */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 40) return null;
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('ENR') && s.length === CODE_LENGTH + 3) s = s.slice(3);
  if (s.length !== CODE_LENGTH || [...s].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return s;
}

type Actor = { id: string; role: string; institutionId?: string };

/** The student an admin may manage: own school for admin, any for enara-admin; another school's -> 403. */
export async function adminStudent(actor: Actor, studentId: string) {
  const student = await Student.findOne({ id: studentId }).select('+learnerAgeBand +birthDate id name email institutionId archivedAt').lean();
  if (!student) throw new AppError('Student not found', 404, 'NOT_FOUND');
  if (actor.role === 'enara-admin') return student;
  if (actor.role !== 'admin' || !actor.institutionId || student.institutionId !== actor.institutionId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }
  return student;
}

export async function createCode(actor: Actor, studentId: string, opts: { sendToEmail?: string } = {}) {
  const student = await adminStudent(actor, studentId);
  if (!student.institutionId) throw new AppError('The learner has no school', 400, 'VALIDATION_ERROR');
  // P0 item 2: no new parent access to an archived student (restore first; D9).
  if (student.archivedAt) throw new AppError('This student is archived', 409, 'STUDENT_ARCHIVED');
  let code = generateCode();
  for (let i = 0; i < 5 && (await ParentLinkCode.exists({ codeHash: hashCode(code.normalized) })); i++) code = generateCode();
  const row = await ParentLinkCode.create({
    id: `plc_${randomUUID()}`,
    codeHash: hashCode(code.normalized),
    hint: code.normalized.slice(-2),
    studentId: student.id,
    institutionId: student.institutionId,
    createdBy: actor.id,
    status: 'active',
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  await recordAudit('parent_code_created', actor, { institutionId: student.institutionId, type: 'student', id: student.id }, { codeId: row.id });

  let emailed: { ok: boolean; reason?: string } | undefined;
  if (opts.sendToEmail) {
    // P0 item 4 (owner decision D15): the code is in the email BODY only
    // (LINK_CODE), never in a URL. The button opens the plain code page
    // (/parents/link, built in code by sendTemplate); the parent types the code.
    const r = await sendTemplate('enara-parent-consent', opts.sendToEmail, {
      NAME: 'there',
      CHILD_NAME: String(student.name || '').split(/\s+/)[0] || 'your child',
      LINK_CODE: code.display,
      EXPIRES_IN: '7 days',
    });
    emailed = r.ok ? { ok: true } : { ok: false, reason: r.code };
  }
  return { id: row.id, code: code.display, expiresAt: row.expiresAt, studentId: student.id, ...(emailed ? { emailed } : {}) };
}

export async function listCodes(actor: Actor, studentId: string) {
  const student = await adminStudent(actor, studentId);
  const now = new Date();
  const codes = await ParentLinkCode.find({ studentId: student.id, status: 'active', expiresAt: { $gt: now } }).sort({ createdAt: -1 }).lean();
  const links = await ParentLearnerLink.find({ studentId: student.id }).lean();
  const parents = await User.find({ _id: { $in: links.map((l) => l.parentUserId) } }).select('name email').lean();
  return {
    codes: codes.map((c) => ({ id: c.id, display: `ENR-••••-••${c.hint.slice(-2)}`, hint: c.hint, expiresAt: c.expiresAt, createdAt: c.createdAt })),
    links: links.map((l) => {
      const p = parents.find((u) => String(u._id) === l.parentUserId);
      return { linkId: l.id, parentName: p?.name ?? 'Parent', parentEmail: p?.email ?? null, role: l.role, status: l.status, consent: l.consent ?? 'not_required', createdAt: l.createdAt, ...(l.status === 'ended' ? { endedAt: l.endedAt ?? null, endReason: l.endReason ?? null } : {}) };
    }),
  };
}

export async function revokeCode(actor: Actor, studentId: string, codeId: string) {
  const student = await adminStudent(actor, studentId);
  const r = await ParentLinkCode.updateOne({ id: codeId, studentId: student.id, status: 'active' }, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: actor.id } });
  if (!r.modifiedCount) throw new AppError('Code not found', 404, 'NOT_FOUND');
  await recordAudit('parent_code_revoked', actor, { institutionId: student.institutionId, type: 'student', id: student.id }, { codeId });
}

// ---------------------------------------------------------------------------
// Redeem (parent)

async function guard(parentUserId: string) {
  const p = await ParentProfile.findOne({ userId: parentUserId }).lean();
  if (p?.redeemLockedUntil && p.redeemLockedUntil > new Date()) {
    throw new AppError('Too many wrong codes. Try again in 15 minutes.', 429, 'REDEEM_LOCKED');
  }
}

async function failed(parentUserId: string): Promise<never> {
  const p = await ParentProfile.findOneAndUpdate({ userId: parentUserId }, { $inc: { failedRedeems: 1 }, $setOnInsert: { userId: parentUserId } }, { upsert: true, new: true });
  if ((p.failedRedeems ?? 0) >= MAX_FAILED_REDEEMS) {
    await ParentProfile.updateOne({ userId: parentUserId }, { $set: { redeemLockedUntil: new Date(Date.now() + REDEEM_LOCK_MS), failedRedeems: 0 } });
  }
  throw new AppError(INVALID_CODE_MESSAGE, 400, 'INVALID_CODE');
}

async function findUsable(parentUserId: string, input: unknown) {
  await guard(parentUserId);
  const normalized = normalizeCode(input);
  if (!normalized) return failed(parentUserId);
  const code = await ParentLinkCode.findOne({ codeHash: hashCode(normalized) }).lean();
  if (!code || code.status !== 'active' || code.expiresAt <= new Date()) return failed(parentUserId);
  // Parents P1: a school with parent access Off accepts no new link (not a wrong code: no lockout).
  if ((await parentAccessOf(code.institutionId)) === 'off') throw schoolAccessOffError();
  return code;
}

/** Minimal preview: learner first name + last initial, and school name. Nothing else. */
export async function previewCode(parentUserId: string, input: unknown) {
  return previewFor(await findUsable(parentUserId, input));
}

export async function previewFor(code: { studentId: string; institutionId: string }) {
  const student = await Student.findOne({ id: code.studentId }).select('name').lean();
  const school = await Institution.findOne({ id: code.institutionId }).select('name').lean();
  const parts = String(student?.name || '').trim().split(/\s+/).filter(Boolean);
  const learner = parts.length ? `${parts[0]}${parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : ''}` : 'Learner';
  return { learner, school: school?.name ?? null };
}

export async function confirmCode(parent: Actor & { email?: string }, input: unknown) {
  const code = await findUsable(parent.id, input);
  // P0 item 2: a code issued before the student was archived, deleted or left
  // the school makes no link (the hooks also revoke such codes).
  const current = await Student.findOne({ id: code.studentId }).select('id institutionId archivedAt').lean();
  if (endReasonFor({ institutionId: code.institutionId }, current)) throw new AppError(INVALID_CODE_MESSAGE, 400, 'INVALID_CODE');
  // Single use: only one confirm can flip it.
  const claimed = await ParentLinkCode.findOneAndUpdate(
    { id: code.id, status: 'active', expiresAt: { $gt: new Date() } },
    { $set: { status: 'redeemed', redeemedAt: new Date(), redeemedBy: parent.id } },
    { new: true },
  );
  if (!claimed) return failed(parent.id);
  await ParentProfile.updateOne({ userId: parent.id }, { $set: { failedRedeems: 0 }, $unset: { redeemLockedUntil: 1 } }, { upsert: true });

  const student = await Student.findOne({ id: code.studentId }).select('+learnerAgeBand +birthDate id name email institutionId').lean();
  if (!student) throw new AppError(INVALID_CODE_MESSAGE, 400, 'INVALID_CODE');
  const tier = tierOf(student).tier;
  const existing = await ParentLearnerLink.findOne({ parentUserId: parent.id, studentId: student.id });
  const hasOwner = await ParentLearnerLink.exists({ studentId: student.id, role: 'owner', status: 'active' });
  const now = new Date();
  const link = existing ?? new ParentLearnerLink({ id: `pll_${randomUUID()}`, parentUserId: parent.id, studentId: student.id });
  // A new code reactivates an ended link (same row, D8); its old role is not
  // kept when another guardian became owner meanwhile.
  const previousStatus = existing?.status;
  const keepRole = existing && existing.status !== 'ended' ? existing.role : undefined;
  link.set({
    institutionId: student.institutionId,
    status: 'active',
    role: keepRole ?? (hasOwner ? 'full' : 'owner'),
    endedAt: undefined,
    endReason: undefined,
    endedBy: undefined,
    codeId: code.id,
    // Kids: the consent step (enara-parent-consent) is a stub; recorded as pending.
    consent: tier === 'kid' ? 'pending' : 'not_required',
    ...(tier === '13plus' ? { learnerNotifiedAt: now, learnerNoticeReadAt: undefined } : {}),
  });
  await link.save();
  await recordAudit('parent_code_redeemed', parent, { institutionId: student.institutionId, type: 'student', id: student.id }, { codeId: code.id, linkId: link.id, role: link.role, ...(previousStatus ? { previousStatus } : {}) });

  if (tier === '13plus') await notifyLearnerEmailStub(student.email, link.id);
  return { linkId: link.id, studentId: student.id, role: link.role, status: link.status, consent: link.consent };
}

// 13+: email the learner that a parent is linked. Stub: logs only (no address or content logged).
export const learnerNoticeSender = {
  async send(_to: string | undefined, linkId: string): Promise<{ ok: true; stub: true }> {
    logger.info('parents.learner_notice_stub', { linkId });
    return { ok: true, stub: true };
  },
};
async function notifyLearnerEmailStub(to: string | undefined, linkId: string) {
  await learnerNoticeSender.send(to, linkId);
}

// ---------------------------------------------------------------------------
// Unlink: the parent themself, or a school admin of the learner's school.
// The link is ENDED, not deleted (D8): unlinked_by_parent / unlinked_by_school.
// Unlinking an ended link again changes nothing.

export async function unlink(actor: Actor, linkId: string, studentId?: string) {
  const link = await ParentLearnerLink.findOne({ id: linkId });
  if (!link || (studentId && link.studentId !== studentId)) throw new AppError('Link not found', 404, 'NOT_FOUND');
  if (actor.role === 'parent') {
    if (link.parentUserId !== actor.id) throw new AppError('Link not found', 404, 'NOT_FOUND');
  } else {
    await adminStudent(actor, link.studentId);
  }
  await endParentLink(link, actor.role === 'parent' ? 'unlinked_by_parent' : 'unlinked_by_school', actor);
}

/** Owner changes another guardian's role (full <-> view). */
export async function setGuardianRole(owner: Actor, studentId: string, linkId: string, role: unknown) {
  if (role !== 'full' && role !== 'view') throw new AppError('role must be full or view', 400, 'VALIDATION_ERROR');
  // The same gate as every learner endpoint (incl. the read-time student check).
  await requireLearner(owner.id, studentId, 'manage_guardians');
  const other = await ParentLearnerLink.findOne({ id: linkId, studentId, status: { $ne: 'ended' } });
  if (!other || other.role === 'owner') throw new AppError('Link not found', 404, 'NOT_FOUND');
  other.role = role;
  await other.save();
  await recordAudit('parent_link_role_changed', owner, { institutionId: other.institutionId, type: 'student', id: studentId }, { linkId, role });
}
