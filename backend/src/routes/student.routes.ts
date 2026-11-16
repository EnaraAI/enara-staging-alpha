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

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listStudents);
router.get('/photos/pending', listPendingPhotos);
router.put('/:id/photo', photoUpload.single('photo'), setStudentPhoto);
router.post('/:id/photo/approve', approvePendingPhoto);
router.post('/:id/photo/reject', rejectPendingPhoto);
router.get('/:id', getStudent);
router.post('/', createStudent);
router.patch('/:id', updateStudent);
router.delete('/:id', deleteStudent);

export default router;
