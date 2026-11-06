import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';
import { getTutorFaceImage, getTutorFaces, setStudentFaceOptions, setTutorFace } from '../controllers/tutorFaces.controller';

const router = Router();
// Face pictures load in <img> tags for students too (no token): before the admin check.
router.get('/image/:id', getTutorFaceImage);
router.use(authMiddleware, requireAdmin);
router.get('/', getTutorFaces);
router.put('/', setTutorFace);
router.put('/student-options', setStudentFaceOptions);

export default router;
