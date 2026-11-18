import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { requireFeature } from '../services/featureFlags';
import {
  archiveAssignment,
  closeAssignment,
  createAssignment,
  getAssignment,
  grantExtension,
  listAssignments,
  listTeachingClasses,
  publishAssignment,
  reopenAssignment,
  updateAssignment,
} from '../controllers/assignments.controller';
import { listSpeakingAttempts, removeSpeakingTranscript } from '../controllers/speakingExam.controller';
import { decideLmsValue, getGradeHistory, requireGradeLedger } from '../controllers/gradeLedger.controller';

// Teaching workflow (Phase 3): assignments for classes. Teachers for classes
// they instruct, admins for their school.
const router = Router();
router.use(authMiddleware, requireRole('teacher', 'admin', 'enara-admin'), requireFeature('teaching_workflow_enabled'));

router.get('/', listAssignments);
router.get('/classes', listTeachingClasses);
router.post('/', createAssignment);
router.get('/:id', getAssignment);
router.patch('/:id', updateAssignment);
router.post('/:id/publish', publishAssignment);
router.post('/:id/close', closeAssignment);
router.post('/:id/reopen', reopenAssignment);
router.post('/:id/archive', archiveAssignment);
router.post('/:id/extensions', grantExtension);
router.get('/:id/speaking-attempts', listSpeakingAttempts);
router.post('/:id/attempts/:attemptId/speaking/remove-transcript', removeSpeakingTranscript);
// Grade ledger (GRADE_LEDGER_ENABLED; otherwise the normal 404). Read-only history + the LMS decision.
router.get('/:id/students/:studentId/grade-history', requireGradeLedger, getGradeHistory);
router.post('/:id/students/:studentId/lms-decision', requireGradeLedger, decideLmsValue);

export default router;
