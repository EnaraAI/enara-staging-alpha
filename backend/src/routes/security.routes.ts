import { Router, Response } from 'express';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';
import { SignInEvent, SIGN_IN_RETENTION_DAYS } from '../models/SignInEvent';

// Sign-in history (ENARA admins only: it holds full IP addresses).
// GET /api/security/sign-ins?days=1..30&institutionId=&result=&email=&limit=1..500
const router = Router();
router.use(authMiddleware, requireRole('enara-admin'));

const RESULTS = new Set(['success', 'wrong_password', 'unknown_account', 'account_disabled', 'invalid_request']);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

router.get('/sign-ins', asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const days = Math.min(Math.max(Number(q.days) || 1, 1), SIGN_IN_RETENTION_DAYS);
  const limit = Math.min(Math.max(Math.floor(Number(q.limit) || 200), 1), 500);
  const filter: Record<string, unknown> = { at: { $gte: new Date(Date.now() - days * 86400_000) } };
  const institutionId = str(q.institutionId, 80);
  const result = str(q.result, 40);
  const email = str(q.email, 254)?.toLowerCase();
  if (institutionId) filter.institutionId = institutionId;
  if (result && RESULTS.has(result)) filter.result = result;
  if (email) filter.email = email;
  const rows = await SignInEvent.find(filter).sort({ at: -1 }).limit(limit).lean();
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.result] = (counts[r.result] ?? 0) + 1;
  res.json({
    days,
    retentionDays: SIGN_IN_RETENTION_DAYS,
    total: rows.length,
    truncated: rows.length === limit,
    counts,
    signIns: rows.map((r) => ({ at: r.at, email: r.email ?? null, userId: r.userId ?? null, role: r.role ?? null, institutionId: r.institutionId ?? null, result: r.result, ip: r.ip ?? null, userAgent: r.userAgent ?? null })),
  });
}));

export default router;
