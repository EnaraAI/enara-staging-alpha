import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, forgetInstitutionStatus, requireRole } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { Institution } from '../models/Institution';
import { recordAudit } from '../services/auditTrail';
import {
  createInstitution,
  createInstitutionApiKey,
  listApiKeys,
  listInstitutions,
  revokeApiKey,
  validateApiKey,
} from '../controllers/integrations.controller';

const router = Router();

router.use(authMiddleware, requireRole('enara-admin'));

router.get('/institutions', listInstitutions);
router.post('/institutions', createInstitution);
// Suspends or reactivates a school (P22): its users are stopped on their
// next request (sessions included) and its API keys are refused.
router.put('/institutions/:id/status', asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = (req.body as { status?: unknown })?.status;
  if (status !== 'active' && status !== 'suspended') throw new AppError('status must be active or suspended', 400, 'VALIDATION_ERROR');
  const school = await Institution.findOne({ id: String(req.params.id) });
  if (!school) throw new AppError('Institution not found', 404, 'NOT_FOUND');
  const before = school.status;
  if (before !== status) {
    school.status = status;
    await school.save();
    forgetInstitutionStatus(school.id);
    await recordAudit('institution_status_changed', req.user, { institutionId: school.id, type: 'institution', id: school.id }, { from: before, to: status });
  }
  res.json({ id: school.id, status });
}));
router.post('/institutions/:id/api-keys', createInstitutionApiKey);
router.get('/api-keys', listApiKeys);
router.post('/api-keys/validate', validateApiKey);
router.post('/api-keys/:id/revoke', revokeApiKey);

export default router;
