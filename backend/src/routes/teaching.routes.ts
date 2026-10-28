import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { requireFeature } from '../services/featureFlags';
import {
  createEducatorIntervention,
  getLearnerProfile,
  getOverview,
  getRoster,
  getOpsMetrics,
  getClassObjectives,
  listEducatorInterventions,
  updateEducatorIntervention,
} from '../controllers/teaching.controller';
import { getStudentStudyPlanForStaff } from '../controllers/meStudyPlan.controller';

// Instructor workspace (Phase 3): overview, rosters, learner profiles and
// educator interventions, within the caller's classes or school.
const router = Router();
router.use(authMiddleware, requireRole('teacher', 'admin', 'enara-admin'), requireFeature('teaching_workflow_enabled'));

router.get('/overview', getOverview);
router.get('/ops', getOpsMetrics);
router.get('/classes/:classId/roster', getRoster);
router.get('/classes/:classId/objectives', getClassObjectives);
router.get('/students/:studentId/profile', getLearnerProfile);
router.get('/students/:studentId/study-plan', requireFeature('study_plans_enabled'), getStudentStudyPlanForStaff);
router.get('/interventions', listEducatorInterventions);
router.post('/interventions', createEducatorIntervention);
router.patch('/interventions/:id', updateEducatorIntervention);

export default router;
