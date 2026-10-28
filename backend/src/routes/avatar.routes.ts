import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  avatarFallback,
  avatarHeartbeat,
  createAvatarSttToken,
  speakAvatarText,
  endAvatarSession,
  getAvatarArtifact,
  startAvatarSession,
  streamAvatarAnswer,
  switchAvatarLanguage,
} from '../controllers/avatar.controller';

const router = Router();

router.use(authMiddleware);

router.post('/session', startAvatarSession);
router.post('/query-stream', streamAvatarAnswer);
router.post('/session/:id/language', switchAvatarLanguage);
router.post('/session/:id/fallback', avatarFallback);
router.post('/session/:id/heartbeat', avatarHeartbeat);
router.post('/session/:id/stt-token', createAvatarSttToken);
router.post('/speak', speakAvatarText);
router.delete('/session/:id', endAvatarSession);
router.get('/artifact/:id', getAvatarArtifact);

export default router;
