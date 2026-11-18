import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { ensurePlainObject, normalizeEmail } from '../utils/validation';
import { createCode, listCodes, revokeCode, unlink } from './codes';
import { PARENT_EMAIL_BLOCKED_CODE, parentEmailBlockedBody } from './emailBlock';

// School admin: parent link codes on a student (mounted in student.routes,
// behind requireAdmin). Another school's student -> 403 (codes.adminStudent).
const actor = (req: AuthRequest) => ({ id: req.user!.id, role: req.user!.role, institutionId: req.user!.institutionId });

export const createParentCode = asyncHandler(async (req, res: Response) => {
  const body = ensurePlainObject((req as AuthRequest).body ?? {});
  const sendToEmail = body.sendToEmail ? normalizeEmail(body.sendToEmail) : undefined;
  try {
    res.status(201).json(await createCode(actor(req as AuthRequest), String(req.params.id), { sendToEmail }));
  } catch (e) {
    // lms-test: "Send code by email" is blocked (409 after the access check, nothing created; EN/AR note).
    if ((e as AppError)?.code !== PARENT_EMAIL_BLOCKED_CODE) throw e;
    res.status(409).json(parentEmailBlockedBody((req as AuthRequest & { requestId?: string }).requestId));
  }
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
