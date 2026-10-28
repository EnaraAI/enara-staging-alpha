import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { requireFeature } from '../services/featureFlags';
import {
  correctGrade,
  finalizeSubmission,
  getReviewQueue,
  getSubmissionForReview,
  releaseAssignmentResults,
  releaseSubmission,
  regradeSubmission,
  resolveAppeal,
  scoreAnswer,
  setOverallFeedback,
} from '../controllers/grading.controller';

// Review, finalize and release grades for assignment submissions (Phase 3).
const router = Router();
router.use(authMiddleware, requireRole('teacher', 'admin', 'enara-admin'), requireFeature('teaching_workflow_enabled'));

router.get('/queue', getReviewQueue);
router.get('/attempts/:id', getSubmissionForReview);
router.put('/attempts/:id/answers/:questionId', scoreAnswer);
router.put('/attempts/:id/feedback', setOverallFeedback);
router.post('/attempts/:id/regrade', regradeSubmission);
router.put('/attempts/:id/appeals/:appealId', resolveAppeal);
router.post('/attempts/:id/finalize', finalizeSubmission);
router.post('/attempts/:id/release', releaseSubmission);
router.post('/attempts/:id/correct', correctGrade);
router.post('/assignments/:assignmentId/release', releaseAssignmentResults);

export default router;
