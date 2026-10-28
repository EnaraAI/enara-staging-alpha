import { Router } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { requireFeature } from '../services/featureFlags';
import {
  listAssessments,
  getAssessment,
  getAssessmentAttempts,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  publishAssessmentHandler,
  validateAssessment,
  previewAssessment,
  archiveAssessment,
  restoreAssessment,
  duplicateAssessment,
  listAssessmentVersions,
  getAssessmentVersion,
  generateAssessmentDraftHandler,
  regenerateQuestionHandler,
} from '../controllers/assessment.controller';

const router = Router();

// Admins as before; teachers when their school has the teaching workflow on.
const teacherFlag = requireFeature('teaching_workflow_enabled');
router.use(authMiddleware, requireRole('teacher', 'admin', 'enara-admin'), (req, res, next) =>
  (req as AuthRequest).user?.role === 'teacher' ? teacherFlag(req as AuthRequest, res, next) : next(),
);

router.get('/', listAssessments);
router.get('/:id', getAssessment);
router.get('/:id/attempts', getAssessmentAttempts);
router.get('/:id/preview', previewAssessment);
router.get('/:id/versions', listAssessmentVersions);
router.get('/:id/versions/:version', getAssessmentVersion);
router.post('/', createAssessment);
router.post('/generate', generateAssessmentDraftHandler);
router.post('/:id/questions/:questionId/regenerate', regenerateQuestionHandler);
router.post('/:id/validate', validateAssessment);
router.post('/:id/publish', publishAssessmentHandler);
router.post('/:id/archive', archiveAssessment);
router.post('/:id/restore', restoreAssessment);
router.post('/:id/duplicate', duplicateAssessment);
router.patch('/:id', updateAssessment);
router.delete('/:id', deleteAssessment);

export default router;
