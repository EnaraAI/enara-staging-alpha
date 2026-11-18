import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../../../middleware/auth.middleware';
import { AppError, asyncHandler } from '../../../middleware/errorHandler';
import { PROBLEM_WINDOWS, problemsView, type ProblemWindow } from '../core/problems';

// Phase 1b: GET /api/lms/problems?days=1|7&institutionId=
// The Problems section of LMS connections: failed or warned launches, sign-ins,
// registrations, grade sends and roster syncs, grouped by reference code, with
// a plain-language explanation and fix in English and Arabic. IDs only.
// ENARA admins: every school, or one with ?institutionId=. School admins: their
// own school only (?institutionId= is ignored). Anyone else: 403.
export const problemsRouter = Router();

problemsRouter.get(
  '/problems',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const enara = user.role === 'enara-admin';
    if (!enara && user.role !== 'admin') throw new AppError('Admin access required', 403, 'ADMIN_REQUIRED');
    const rawDays = req.query.days === undefined ? '1' : req.query.days;
    const days = Number(rawDays);
    if (typeof rawDays !== 'string' || !(PROBLEM_WINDOWS as readonly number[]).includes(days)) throw new AppError('days must be 1 or 7', 400, 'VALIDATION_ERROR');
    let institutionId: string | undefined;
    if (enara) {
      const requested = req.query.institutionId;
      if (requested !== undefined && (typeof requested !== 'string' || requested.length > 200)) throw new AppError('institutionId is invalid', 400, 'VALIDATION_ERROR');
      institutionId = requested || undefined;
    } else {
      if (!user.institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
      institutionId = user.institutionId;
    }
    res.json(await problemsView({ institutionId, days: days as ProblemWindow }));
  }),
);
