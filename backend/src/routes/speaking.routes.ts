import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../auth/permissions';
import { tutorUserLimiter } from '../middleware/aiRateLimits';
import { previewSpeaking } from '../controllers/speakingExam.controller';
import { MAX_AUDIO_BYTES } from '../services/speakingExam';

// P4 speaking exams, staff side: a teacher previews their own exam. Nothing
// is saved. Attempts and transcripts are under /api/assignments.
const router = Router();
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 6 } });
router.post('/preview', authMiddleware, requirePermission('content:author'), tutorUserLimiter(), audioUpload.single('audio'), previewSpeaking);

export default router;
