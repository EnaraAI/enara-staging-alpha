import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
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
router.post('/institutions/:id/api-keys', createInstitutionApiKey);
router.get('/api-keys', listApiKeys);
router.post('/api-keys/validate', validateApiKey);
router.post('/api-keys/:id/revoke', revokeApiKey);

export default router;
