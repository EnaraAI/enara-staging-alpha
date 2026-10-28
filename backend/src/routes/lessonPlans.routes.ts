import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { requireFeature } from '../services/featureFlags';
import { archivePlan, generatePlan, getPlan, listPlans, regeneratePlanSection, savePlanVersion, updatePlan } from '../controllers/lessonPlans.controller';

// AI-assisted lesson plans (Phase 3): teachers' own drafts and versions.
const router = Router();
router.use(authMiddleware, requireRole('teacher', 'admin', 'enara-admin'), requireFeature('teaching_workflow_enabled'));

router.get('/', listPlans);
router.post('/generate', generatePlan);
router.get('/:id', getPlan);
router.put('/:id', updatePlan);
router.post('/:id/sections/:sectionId/regenerate', regeneratePlanSection);
router.post('/:id/save', savePlanVersion);
router.post('/:id/archive', archivePlan);

export default router;
