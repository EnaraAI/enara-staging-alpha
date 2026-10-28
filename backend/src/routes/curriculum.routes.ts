import { Router } from 'express';
import multer from 'multer';
import {
  listCurriculums,
  getCurriculum,
  createCurriculum,
  updateCurriculum,
  deployCurriculum,
  deleteCurriculum,
  assignBatchToCurriculum,
  unassignBatchFromCurriculum,
  uploadChapterFile,
  requestChapterVideoUpload,
  completeChapterVideoUpload,
  removeChapterUpload,
  getBatchesForAssignment,
  publishCurriculumToClass,
} from '../controllers/curriculum.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../auth/permissions';
import { MAX_UPLOAD_BYTES } from '../utils/uploadSecurity';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const router = Router();

// P1: authors (teachers and admins) work on their own content; school-wide
// actions (deploy, delete, batch assignment) need content:manage_school,
// which teachers do not hold by default. Controllers scope every lookup.
const manageSchool = requirePermission('content:manage_school');
router.use(authMiddleware, requirePermission('content:author'));

router.get('/', listCurriculums);
router.get('/:id', getCurriculum);
router.post('/', createCurriculum);
router.patch('/:id', updateCurriculum);
router.patch('/:id/deploy', manageSchool, deployCurriculum);
router.delete('/:id', manageSchool, deleteCurriculum);
router.post('/:id/publish-to-class', requirePermission('content:publish', 'class:teach'), publishCurriculumToClass);

router.get('/:id/batches', manageSchool, getBatchesForAssignment);
router.post('/:id/assign-batch', manageSchool, assignBatchToCurriculum);
router.delete('/:id/batches/:batchId', manageSchool, unassignBatchFromCurriculum);

router.post(
  '/:id/chapters/:chapterId/uploads',
  upload.single('file'),
  uploadChapterFile
);
router.delete('/:id/chapters/:chapterId/uploads', removeChapterUpload);
router.post('/:id/chapters/:chapterId/video-uploads', requestChapterVideoUpload);
router.post('/:id/chapters/:chapterId/video-uploads/complete', completeChapterVideoUpload);

export default router;
