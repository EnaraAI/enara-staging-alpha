import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { recordUsage } from '../services/creditsService';

export const tutorVisualize = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const { prompt, courseId, lessonTitle } = req.body as {
    prompt?: string;
    courseId?: string;
    lessonTitle?: string;
  };
  if (!prompt?.trim()) throw new AppError('prompt is required');

  try {
    await recordUsage({
      userId: req.user!.id,
      studentId,
      feature: 'visualize',
      sessionId: courseId,
    });
  } catch (err) {
    throw new AppError((err as Error).message, 402);
  }

  const topic = lessonTitle || 'the current lesson';
  res.json({
    prompt: prompt.trim(),
    imageUrl: null,
    imagePrompt: `Educational diagram for ${topic}: ${prompt.trim()}`,
    description: `Visualization request captured for "${prompt.trim()}" about ${topic}. Connect a vision model or CDN later for rendered image URLs.`,
    status: 'queued',
  });
});

export const tutorTts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const { text } = req.body as { text?: string };
  if (!text?.trim()) throw new AppError('text is required');

  try {
    await recordUsage({
      userId: req.user!.id,
      studentId,
      feature: 'tts',
    });
  } catch (err) {
    throw new AppError((err as Error).message, 402);
  }

  // Placeholder TTS payload — frontend can fall back to browser speechSynthesis
  res.json({
    text: text.trim(),
    mimeType: 'audio/pcm',
    audioBase64: null,
    provider: 'browser-fallback',
    message:
      'Server TTS not configured. Use browser speechSynthesis or set a TTS provider key.',
  });
});
