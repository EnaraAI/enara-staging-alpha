import { Router } from 'express';
import {
  listTeacherClasses,
  getRoster,
  saveAttendance,
  submitAttendance,
  listAttendanceHistory,
  getAttendanceSessionDetail,
} from '../controllers/teacherAttendance.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware, requireRole('teacher', 'admin', 'enara-admin'));

router.get('/classes', listTeacherClasses);
router.get('/roster', getRoster);
router.get('/history', listAttendanceHistory);
router.get('/:sessionId', getAttendanceSessionDetail);
router.post('/', saveAttendance);
router.post('/:sessionId/submit', submitAttendance);

export default router;
