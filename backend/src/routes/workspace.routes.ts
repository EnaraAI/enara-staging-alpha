import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { requirePermission, GRANTABLE_PERMISSIONS, isPermission, permissionsFor } from '../auth/permissions';
import { isGlobalAdmin, requireInstitutionId } from '../auth/authorization';
import { Institution } from '../models/Institution';
import { Invitation } from '../models/AccountToken';
import { User } from '../models/User';
import { acceptInvitation, createInvitation, INVITABLE_ROLES } from '../services/accountTokens';
import { ensurePlainObject, getOptionalString, normalizeEmail, rejectMongoOperators, validatePassword } from '../utils/validation';
import { getConfig } from '../config/env';

// Workspace administration within one school (4Level1 plan, P1): users,
// their permission grants, and invitations. workspace:users is held by school
// admins (Workspace Admin) and ENARA admins; never by teachers or academic
// managers. Every lookup is scoped to the caller's institution.
const router = Router();

// Public: accepting an invitation creates the account (the token is the proof).
router.post('/invitations/accept', asyncHandler(async (req, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const token = typeof body.token === 'string' ? body.token : '';
  if (!token || token.length > 200) throw new AppError('This invitation is invalid, used or expired', 400, 'INVITATION_INVALID');
  const password = validatePassword(body.password);
  const user = await acceptInvitation({ token, password, name: getOptionalString(body, 'name', { max: 120 }) });
  res.status(201).json({ user: { email: user.email, role: user.role, name: user.name, institutionId: user.institutionId } });
}));

router.use(authMiddleware, requirePermission('workspace:users'));

// The school a request acts on: the caller's own, or ?institutionId for ENARA admins.
async function workspaceOf(req: AuthRequest): Promise<string> {
  if (isGlobalAdmin(req)) {
    const id = typeof req.query.institutionId === 'string' ? req.query.institutionId : typeof req.body?.institutionId === 'string' ? req.body.institutionId : '';
    if (!id || !(await Institution.exists({ id }))) throw new AppError('institutionId is required', 400, 'VALIDATION_ERROR');
    return id;
  }
  return requireInstitutionId(req);
}

// Document retention (P2), customer workspace setting (workspace:billing):
// documents are deleted retentionDays after pilotEndsAt (default 180 days).
router.get('/document-retention', requirePermission('workspace:billing'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = await workspaceOf(req);
  const school = await Institution.findOne({ id: institutionId }).select('documentRetention').lean();
  res.json({ institutionId, pilotEndsAt: school?.documentRetention?.pilotEndsAt ?? null, retentionDays: school?.documentRetention?.retentionDays ?? 180 });
}));

router.put('/document-retention', requirePermission('workspace:billing'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = await workspaceOf(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const ends = body.pilotEndsAt === null ? null : typeof body.pilotEndsAt === 'string' ? new Date(body.pilotEndsAt) : undefined;
  if (ends === undefined || (ends && Number.isNaN(ends.getTime()))) throw new AppError('pilotEndsAt must be an ISO date or null', 400, 'VALIDATION_ERROR');
  const days = body.retentionDays === undefined ? 180 : body.retentionDays;
  if (!(typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 3650)) throw new AppError('retentionDays must be 1-3650', 400, 'VALIDATION_ERROR');
  await Institution.updateOne({ id: institutionId }, { $set: { documentRetention: { pilotEndsAt: ends ?? undefined, retentionDays: days } } });
  res.json({ institutionId, pilotEndsAt: ends, retentionDays: days });
}));

router.get('/users', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = await workspaceOf(req);
  const users = await User.find({ institutionId, role: { $ne: 'enara-admin' } }).select('email name role status permissions origin createdAt').sort({ createdAt: 1 }).limit(1000).lean();
  res.json({
    users: users.map((u) => ({ id: u._id.toString(), email: u.email, name: u.name, role: u.role, status: u.status, origin: u.origin ?? 'live', permissions: [...permissionsFor({ role: u.role, permissions: u.permissions })], grants: u.permissions ?? [] })),
  });
}));

// Replaces a user's explicit grants (on top of their role's defaults).
router.put('/users/:id/permissions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = await workspaceOf(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const grants = body.permissions;
  if (!Array.isArray(grants) || !grants.every((p) => isPermission(p) && GRANTABLE_PERMISSIONS.includes(p))) {
    throw new AppError(`permissions must be a list of: ${GRANTABLE_PERMISSIONS.join(', ')}`, 400, 'PERMISSION_NOT_GRANTABLE');
  }
  const target = await User.findOne({ _id: /^[a-f0-9]{24}$/.test(String(req.params.id)) ? req.params.id : null, institutionId });
  if (!target) throw new AppError('User not found', 404, 'NOT_FOUND');
  if (target.role === 'student' || target.role === 'enara-admin') throw new AppError('This user cannot hold staff permissions', 400, 'PERMISSION_NOT_GRANTABLE');
  target.permissions = [...new Set(grants as string[])];
  await target.save();
  res.json({ id: target._id.toString(), grants: target.permissions, permissions: [...permissionsFor(target)] });
}));

router.get('/invitations', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = await workspaceOf(req);
  const invitations = await Invitation.find({ institutionId }).select('id email role permissions status expiresAt createdAt acceptedAt').sort({ createdAt: -1 }).limit(500).lean();
  res.json({ invitations: invitations.map(({ _id, ...i }) => ({ ...i, expired: i.status === 'pending' && i.expiresAt < new Date() })) });
}));

router.post('/invitations', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = await workspaceOf(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const email = normalizeEmail(body.email);
  const role = body.role;
  if (!(INVITABLE_ROLES as readonly unknown[]).includes(role)) throw new AppError(`role must be one of: ${INVITABLE_ROLES.join(', ')}`, 400, 'INVALID_ROLE');
  // A school admin invites teachers, academic managers and students; another
  // school admin only by ENARA.
  if (role === 'admin' && !isGlobalAdmin(req)) throw new AppError('Only ENARA can invite a school administrator', 403, 'FORBIDDEN');
  const permissions = Array.isArray(body.permissions) ? (body.permissions as unknown[]).map(String) : [];
  const { invitation, token } = await createInvitation({ institutionId, email, role: role as never, permissions, invitedBy: req.user!.id });
  const base = ((getConfig() as { appUrl?: string }).appUrl || '').replace(/\/$/, '');
  // The link is shown once, to the inviter; only its hash is stored.
  res.status(201).json({ invitation: { id: invitation.id, email, role, permissions: invitation.permissions, expiresAt: invitation.expiresAt }, inviteLink: `${base}/accept-invitation?token=${encodeURIComponent(token)}` });
}));

router.delete('/invitations/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = await workspaceOf(req);
  const r = await Invitation.updateOne({ id: String(req.params.id), institutionId, status: 'pending' }, { $set: { status: 'revoked' } });
  if (!r.matchedCount) throw new AppError('Invitation not found', 404, 'NOT_FOUND');
  res.status(204).end();
}));

export default router;
