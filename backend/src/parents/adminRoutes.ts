import { Router, type Response } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { Institution } from '../models/Institution';
import { ensurePlainObject } from '../utils/validation';
import { parentCodeToolsEnabled, parentGradesAfterReviewEnabled, parentSettingsEnabled } from './flags';
import { canIssueCodes, classesForCodes, issueClassSheet, listClassCodes, revokeClassCodes, schoolParentSettings, setSchoolParentSettings } from './codeTools';
import { accessFromDoc, setParentAccess } from './schoolAccess';
import { schoolUsage } from './usage';

// /api/parents-admin: Parents P1 (PARENT_SETTINGS_ENABLED; every route 404 when off).
//   ENARA admin: every school's parent access (Off / Free, change audited) and usage.
//   School admin: own school's access (read-only) and usage ("Parents" card).
// Usage is counts of IDs only: no parent names or addresses leave here.
// Parents P2 (PARENT_CODE_TOOLS_ENABLED; those routes 404 when off): the school's
// code settings and the class code sheets (codeTools.ts); teachers too, for their
// own classes, when the school allows it.
const router = Router();
const h = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => asyncHandler(fn as never);
const notFound = () => new AppError('Route not found', 404, 'NOT_FOUND');
const actor = (req: AuthRequest) => ({ id: req.user!.id, role: req.user!.role, institutionId: req.user!.institutionId });
const settingsOnly = (_req: unknown, _res: unknown, next: (e?: unknown) => void) => (parentSettingsEnabled() ? next() : next(notFound()));
const toolsOnly = (_req: unknown, _res: unknown, next: (e?: unknown) => void) => (parentCodeToolsEnabled() ? next() : next(notFound()));
// The school's parent settings: code expiry and teachers (P2), when results show (P3).
const schoolSettingsOnly = (_req: unknown, _res: unknown, next: (e?: unknown) => void) => (parentCodeToolsEnabled() || parentGradesAfterReviewEnabled() ? next() : next(notFound()));
const staff = requireRole('admin', 'enara-admin');

router.use((_req, _res, next) => (parentSettingsEnabled() || parentCodeToolsEnabled() || parentGradesAfterReviewEnabled() ? next() : next(notFound())));
router.use(authMiddleware, requireRole('admin', 'enara-admin', 'teacher'));

router.get('/status', h(async (req, res) => {
  const codeTools = await canIssueCodes(actor(req));
  const usage = parentSettingsEnabled() && req.user!.role !== 'teacher';
  const schoolSettings = (parentCodeToolsEnabled() || parentGradesAfterReviewEnabled()) && req.user!.role === 'admin';
  if (!usage && !codeTools && !schoolSettings) throw notFound();
  res.json({
    enabled: true,
    usage,
    canChangeAccess: parentSettingsEnabled() && req.user!.role === 'enara-admin',
    codeTools,
    ...((parentCodeToolsEnabled() || parentGradesAfterReviewEnabled()) && req.user!.institutionId ? { settings: await schoolParentSettings(req.user!.institutionId), canChangeSettings: req.user!.role === 'admin' } : {}),
    settingsAvailable: { codes: parentCodeToolsEnabled(), results: parentGradesAfterReviewEnabled() },
  });
}));

// ---- P2: code settings and class code sheets
router.get('/schools/:id/settings', schoolSettingsOnly, staff, h(async (req, res) => {
  if (req.user!.role !== 'enara-admin' && req.user!.institutionId !== String(req.params.id)) throw new AppError('Access denied', 403, 'FORBIDDEN');
  res.json({ institutionId: String(req.params.id), ...(await schoolParentSettings(String(req.params.id))) });
}));
router.put('/schools/:id/settings', schoolSettingsOnly, staff, h(async (req, res) => {
  res.json(await setSchoolParentSettings(actor(req), String(req.params.id), ensurePlainObject(req.body)));
}));
router.get('/classes', toolsOnly, h(async (req, res) => {
  res.json(await classesForCodes(actor(req), typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined));
}));
// The sheet is the response body (shown once); the codes never go in a URL.
router.post('/classes/:classId/code-sheet', toolsOnly, h(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(201).json(await issueClassSheet(actor(req), String(req.params.classId)));
}));
router.get('/classes/:classId/codes', toolsOnly, h(async (req, res) => { res.json(await listClassCodes(actor(req), String(req.params.classId))); }));
router.post('/classes/:classId/codes/revoke', toolsOnly, h(async (req, res) => { res.json(await revokeClassCodes(actor(req), String(req.params.classId))); }));
router.delete('/classes/:classId/codes/:codeId', toolsOnly, h(async (req, res) => { res.json(await revokeClassCodes(actor(req), String(req.params.classId), String(req.params.codeId))); }));

// ---- P1: access and usage
router.get('/schools', settingsOnly, staff, h(async (req, res) => {
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

router.put('/schools/:id/access', settingsOnly, requireRole('enara-admin'), h(async (req, res) => {
  res.json(await setParentAccess({ id: req.user!.id, role: req.user!.role }, String(req.params.id), ensurePlainObject(req.body).access));
}));

export default router;
