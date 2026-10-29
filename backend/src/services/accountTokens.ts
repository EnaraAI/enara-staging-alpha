import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '../middleware/errorHandler';
import { Invitation, PasswordReset, type IInvitation } from '../models/AccountToken';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { generateStudentId, initialsFromName } from '../utils/idGenerator';
import { getConfig } from '../config/env';
import { logger } from '../utils/logging';
import { emailLayout, escapeHtml, sendEmail } from './emailService';
import { GRANTABLE_PERMISSIONS, isPermission } from '../auth/permissions';

// Invitations and password resets (4Level1 plan, P1). Tokens are 32 random
// bytes, stored only as SHA-256 hashes, single use and expiring.
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const INVITABLE_ROLES = ['teacher', 'academic_manager', 'admin', 'student'] as const;

const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function appLink(path: string, token: string) {
  const base = (getConfig() as { appUrl?: string }).appUrl || '';
  return `${base.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`;
}

export async function createInvitation(params: {
  institutionId: string;
  email: string;
  role: IInvitation['role'];
  permissions?: string[];
  invitedBy: string;
  origin?: 'live' | 'demo_seed';
  sendMail?: boolean;
}): Promise<{ invitation: IInvitation; token: string }> {
  const permissions = (params.permissions ?? []).filter((p) => isPermission(p) && GRANTABLE_PERMISSIONS.includes(p));
  if ((params.permissions ?? []).length !== permissions.length) throw new AppError('Some permissions cannot be granted', 400, 'PERMISSION_NOT_GRANTABLE');
  if (await User.exists({ email: params.email })) throw new AppError('A user with this email already exists', 409, 'USER_EXISTS');
  // One open invitation per person and school: a new one replaces the old.
  await Invitation.updateMany({ institutionId: params.institutionId, email: params.email, status: 'pending' }, { $set: { status: 'revoked' } });
  const token = newToken();
  const invitation = await Invitation.create({
    id: `inv-${randomUUID()}`,
    tokenHash: hashToken(token),
    institutionId: params.institutionId,
    email: params.email,
    role: params.role,
    permissions,
    invitedBy: params.invitedBy,
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    origin: params.origin ?? 'live',
  });
  if (params.sendMail !== false) {
    const link = appLink('/accept-invitation', token);
    await sendEmail({
      to: params.email,
      subject: 'You are invited to ENARA',
      html: emailLayout('Your ENARA invitation', [`You have been invited to join your school's ENARA workspace as ${escapeHtml(params.role.replace('_', ' '))}.`, 'The link works once and expires in 7 days.'], { label: 'Accept invitation', url: link }),
    }).catch(() => false);
  }
  logger.info('invitation_created', { invitationId: invitation.id, institutionId: params.institutionId, role: params.role, invitedBy: params.invitedBy });
  return { invitation, token };
}

// Accepts an invitation: one atomic claim, so a token works exactly once.
export async function acceptInvitation(params: { token: string; password: string; name?: string }) {
  const now = new Date();
  const pending = await Invitation.findOne({ tokenHash: hashToken(params.token), status: 'pending', expiresAt: { $gt: now } }).select('email').lean();
  if (pending && (await User.exists({ email: pending.email }))) throw new AppError('A user with this email already exists', 409, 'USER_EXISTS');
  const claimed = await Invitation.findOneAndUpdate(
    { tokenHash: hashToken(params.token), status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: 'accepted', acceptedAt: now } },
    { new: true },
  );
  if (!claimed) throw new AppError('This invitation is invalid, used or expired', 400, 'INVITATION_INVALID');
  if (await User.exists({ email: claimed.email })) {
    throw new AppError('A user with this email already exists', 409, 'USER_EXISTS');
  }
  let studentId: string | undefined;
  if (claimed.role === 'student') {
    const student = await Student.create({
      id: generateStudentId(), name: params.name || claimed.email.split('@')[0], email: claimed.email, grade: '', avatar: initialsFromName(params.name || claimed.email),
      institutionId: claimed.institutionId, origin: claimed.origin,
    });
    studentId = student.id;
  }
  const user = await User.create({
    email: claimed.email,
    password: await bcrypt.hash(params.password, getConfig().bcryptRounds),
    role: claimed.role,
    name: params.name || claimed.email.split('@')[0],
    institutionId: claimed.institutionId,
    studentId,
    permissions: claimed.permissions.length ? claimed.permissions : undefined,
    origin: claimed.origin,
  });
  await Invitation.updateOne({ _id: claimed._id }, { $set: { acceptedUserId: user._id.toString() } });
  logger.info('invitation_accepted', { invitationId: claimed.id, institutionId: claimed.institutionId, role: claimed.role });
  return user;
}

// Starts a reset. Always succeeds from the caller's view (no account probing).
export async function requestPasswordReset(email: string, opts: { sendMail?: boolean } = {}): Promise<string | null> {
  const user = await User.findOne({ email, status: 'active' }).select('_id email');
  if (!user) return null;
  const token = newToken();
  await PasswordReset.create({ tokenHash: hashToken(token), userId: user._id.toString(), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) });
  if (opts.sendMail !== false) {
    await sendEmail({
      to: user.email,
      subject: 'Reset your ENARA password',
      html: emailLayout('Reset your password', ['Someone asked to reset your ENARA password. If it was not you, ignore this email.', 'The link works once and expires in 30 minutes.'], { label: 'Reset password', url: appLink('/reset-password', token) }),
    }).catch(() => false);
  }
  logger.info('password_reset_requested', { userId: user._id.toString() });
  return token;
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  const now = new Date();
  const claimed = await PasswordReset.findOneAndUpdate({ tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } }, { $set: { usedAt: now } });
  if (!claimed) throw new AppError('This reset link is invalid, used or expired', 400, 'RESET_TOKEN_INVALID');
  const updated = await User.updateOne({ _id: claimed.userId, status: 'active' }, { $set: { password: await bcrypt.hash(password, getConfig().bcryptRounds) }, $inc: { tokenVersion: 1 } });
  if (!updated.matchedCount) throw new AppError('This reset link is invalid, used or expired', 400, 'RESET_TOKEN_INVALID');
  // Any other open reset links for the account stop working.
  await PasswordReset.updateMany({ userId: claimed.userId, usedAt: null }, { $set: { usedAt: now } });
  logger.info('password_reset_completed', { userId: claimed.userId });
}
