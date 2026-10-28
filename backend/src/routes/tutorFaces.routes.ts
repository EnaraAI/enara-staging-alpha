import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';
import { getTutorFaces, setStudentFaceOptions, setTutorFace } from '../controllers/tutorFaces.controller';

const router = Router();
router.use(authMiddleware, requireAdmin);
router.get('/', getTutorFaces);
router.put('/', setTutorFace);
router.put('/student-options', setStudentFaceOptions);

export default router;
