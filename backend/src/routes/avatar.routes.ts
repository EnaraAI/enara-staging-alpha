import { warmOnOpen } from '../services/llmWarmup';
import { Router } from 'express';
import { checkVoiceNow } from '../services/elevenlabsVoice';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
  avatarFallback,
  avatarHeartbeat,
  createAvatarSttToken,
  speakAvatarText,
  endAvatarSession,
  getAvatarArtifact,
  listAvatarVoices,
  startAvatarSession,
  streamAvatarAnswer,
  switchAvatarLanguage,
  submitAvatarPronunciation,
} from '../controllers/avatar.controller';

const router = Router();

router.use(authMiddleware);

// Voice test: does the ElevenLabs key speak and transcribe right now? Returns pass or fail only.
router.get('/voice-check', async (_req, res, next) => {
  try { res.json(await checkVoiceNow()); } catch (e) { next(e); }
});
router.post('/session', warmOnOpen, startAvatarSession); // warm-up ping in the background (llmWarmup.ts)
router.post('/query-stream', streamAvatarAnswer);
router.post('/session/:id/language', switchAvatarLanguage);
router.post('/session/:id/fallback', avatarFallback);
router.post('/session/:id/heartbeat', avatarHeartbeat);
router.post('/session/:id/stt-token', createAvatarSttToken);
router.post('/session/:id/pronunciation', submitAvatarPronunciation);
router.post('/speak', speakAvatarText);
router.delete('/session/:id', endAvatarSession);
router.get('/artifact/:id', getAvatarArtifact);
// Enara admins: the video tutor's voices, to choose the Arabic and English ones.
router.get('/admin/voices', requireRole('enara-admin'), listAvatarVoices);

export default router;
