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
import { createParentCode, listParentCodes, removeParentLink, revokeParentCode } from '../parents/admin.controller';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listStudents);
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
router.post('/', createStudent);
router.patch('/:id', updateStudent);
router.delete('/:id', deleteStudent);

export default router;
