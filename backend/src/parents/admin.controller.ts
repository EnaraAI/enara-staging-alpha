import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { ensurePlainObject, normalizeEmail } from '../utils/validation';
import { createCode, listCodes, revokeCode, unlink } from './codes';

// School admin: parent link codes on a student (mounted in student.routes,
// behind requireAdmin). Another school's student -> 403 (codes.adminStudent).
const actor = (req: AuthRequest) => ({ id: req.user!.id, role: req.user!.role, institutionId: req.user!.institutionId });

export const createParentCode = asyncHandler(async (req, res: Response) => {
  const body = ensurePlainObject((req as AuthRequest).body ?? {});
  const sendToEmail = body.sendToEmail ? normalizeEmail(body.sendToEmail) : undefined;
  res.status(201).json(await createCode(actor(req as AuthRequest), String(req.params.id), { sendToEmail }));
});

export const listParentCodes = asyncHandler(async (req, res: Response) => {
  res.json(await listCodes(actor(req as AuthRequest), String(req.params.id)));
});

export const revokeParentCode = asyncHandler(async (req, res: Response) => {
  await revokeCode(actor(req as AuthRequest), String(req.params.id), String(req.params.codeId));
  res.json({ ok: true });
});

export const removeParentLink = asyncHandler(async (req, res: Response) => {
  if (!String(req.params.linkId)) throw new AppError('linkId required', 400, 'VALIDATION_ERROR');
  await unlink(actor(req as AuthRequest), String(req.params.linkId), String(req.params.id));
  res.json({ ok: true });
});
