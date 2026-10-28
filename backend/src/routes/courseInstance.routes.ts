import { Router } from 'express';
import {
  listCourseInstances,
  getCourseInstance,
  createCourseInstance,
  updateCourseInstance,
  deleteCourseInstance,
  getAvailableStudents,
  getAssignedStudents,
  assignStudent,
  removeStudent,
} from '../controllers/courseInstance.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listCourseInstances);
router.get('/:id', getCourseInstance);
router.post('/', createCourseInstance);
router.patch('/:id', updateCourseInstance);
router.delete('/:id', deleteCourseInstance);

router.get('/:id/available-students', getAvailableStudents);
router.get('/:id/students', getAssignedStudents);
router.post('/:id/students', assignStudent);
router.delete('/:id/students/:studentId', removeStudent);

export default router;
