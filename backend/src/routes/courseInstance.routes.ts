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
import { archiveClassHandler, guardClassAssign, guardClassDelete, onlyWhen, restoreClassHandler } from '../controllers/archive.controller';
import { groupArchiveOn } from '../services/archive';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listCourseInstances);
router.get('/:id', getCourseInstance);
router.post('/', createCourseInstance);
router.patch('/:id', updateCourseInstance);
router.delete('/:id', guardClassDelete, deleteCourseInstance);
// Multi-class step 6 archiving (ENROLLMENT_GROUP_ARCHIVE; skipped while off).
router.post('/:id/archive', onlyWhen(groupArchiveOn), archiveClassHandler);
router.post('/:id/restore', onlyWhen(groupArchiveOn), restoreClassHandler);

router.get('/:id/available-students', getAvailableStudents);
router.get('/:id/students', getAssignedStudents);
router.post('/:id/students', guardClassAssign, assignStudent);
router.delete('/:id/students/:studentId', removeStudent);

export default router;
