import { Router, type Response } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { Institution } from '../models/Institution';
import { ensurePlainObject } from '../utils/validation';
import { parentSettingsEnabled } from './flags';
import { accessFromDoc, setParentAccess } from './schoolAccess';
import { schoolUsage } from './usage';

// /api/parents-admin: Parents P1 (PARENT_SETTINGS_ENABLED; every route 404 when off).
//   ENARA admin: every school's parent access (Off / Free, change audited) and usage.
//   School admin: own school's access (read-only) and usage ("Parents" card).
// Usage is counts of IDs only: no parent names or addresses leave here.
const router = Router();
const h = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => asyncHandler(fn as never);

router.use((_req, _res, next) => (parentSettingsEnabled() ? next() : next(new AppError('Route not found', 404, 'NOT_FOUND'))));
router.use(authMiddleware, requireRole('admin', 'enara-admin'));

router.get('/status', h(async (req, res) => {
  res.json({ enabled: true, canChangeAccess: req.user!.role === 'enara-admin' });
}));

router.get('/schools', h(async (req, res) => {
  const enara = req.user!.role === 'enara-admin';
  if (!enara && !req.user!.institutionId) throw new AppError('Access denied', 403, 'FORBIDDEN');
  const schools = await Institution.find(enara ? {} : { id: req.user!.institutionId }).select('id name status parentPortal').sort({ name: 1 }).limit(500).lean();
  const usage = await schoolUsage(schools.map((s) => s.id));
  res.json({
    generatedAt: new Date().toISOString(),
    canChangeAccess: enara,
    schools: schools.map((s) => ({ id: s.id, name: s.name, status: s.status, access: accessFromDoc(s), accessUpdatedAt: s.parentPortal?.updatedAt ?? null, usage: usage.get(s.id) })),
  });
}));

router.put('/schools/:id/access', requireRole('enara-admin'), h(async (req, res) => {
  res.json(await setParentAccess({ id: req.user!.id, role: req.user!.role }, String(req.params.id), ensurePlainObject(req.body).access));
}));

export default router;
