import { Router } from 'express';
import {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
} from '../controllers/student.controller';
import {
  approvePendingPhoto,
  listPendingPhotos,
  rejectPendingPhoto,
  setStudentPhoto,
} from '../controllers/studentPhoto.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';
import { photoUpload } from '../utils/uploadSecurity';
import {
  anyArchiveOn,
  archiveStudentHandler,
  deleteStudentPermanently,
  getArchiveSettings,
  guardStudentGroupWrite,
  listStudentsWithoutActiveGroup,
  onlyWhen,
  restoreStudentHandler,
} from '../controllers/archive.controller';
import { groupArchiveOn, studentArchiveOn } from '../services/archive';
import { createParentCode, listParentCodes, removeParentLink, revokeParentCode } from '../parents/admin.controller';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listStudents);
// Multi-class step 6 archiving: each route is skipped while its switch is off.
router.get('/archive-settings', onlyWhen(anyArchiveOn), getArchiveSettings);
router.get('/without-active-group', onlyWhen(groupArchiveOn), listStudentsWithoutActiveGroup);
router.post('/:id/archive', onlyWhen(studentArchiveOn), archiveStudentHandler);
router.post('/:id/restore', onlyWhen(studentArchiveOn), restoreStudentHandler);
router.get('/photos/pending', listPendingPhotos);
router.put('/:id/photo', photoUpload.single('photo'), setStudentPhoto);
router.post('/:id/photo/approve', approvePendingPhoto);
router.post('/:id/photo/reject', rejectPendingPhoto);
// Parents Portal: link codes a school admin issues for a learner.
router.post('/:id/parent-codes', createParentCode);
router.get('/:id/parent-codes', listParentCodes);
router.delete('/:id/parent-codes/:codeId', revokeParentCode);
router.delete('/:id/parent-links/:linkId', removeParentLink);
router.get('/:id', getStudent);
router.post('/', guardStudentGroupWrite, createStudent);
router.patch('/:id', guardStudentGroupWrite, updateStudent);
// ENROLLMENT_STUDENT_ARCHIVE on: delete means "delete permanently" (confirmed).
router.delete('/:id', onlyWhen(studentArchiveOn), deleteStudentPermanently);
router.delete('/:id', deleteStudent);

export default router;
