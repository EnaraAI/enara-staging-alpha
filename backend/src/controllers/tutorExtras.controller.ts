import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { recordUsage } from '../services/creditsService';
import { generateVisualAid } from '../services/avatarVisuals';
import { assignmentTutorPolicy } from '../services/tutorHandoff';

// POST /api/me/tutor/visualize: a diagram for the lesson in the text tutor,
// drawn with the same generator as the live call's visual panel. Returns
// sanitised, self-contained HTML/SVG that the page shows in a sandboxed iframe.
export const tutorVisualize = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const lessonTitle = text(body.lessonTitle, 200);
  const lessonText = text(body.lessonText, 3000);
  const question = text(body.prompt, 500) || `Show me the main idea of the lesson${lessonTitle ? ` "${lessonTitle}"` : ''} as a clear diagram.`;
  if (!lessonTitle && !text(body.prompt, 500)) throw new AppError('lessonTitle or prompt is required', 400, 'VALIDATION_ERROR');

  // Same rule as the tutor: no help while an assessed attempt is open.
  const policy = await assignmentTutorPolicy(studentId);
  if (policy.policy === 'blocked') throw new AppError('The AI tutor is off while an assignment is open', 403, 'TUTOR_BLOCKED');

  try {
    await recordUsage({ userId: req.user!.id, studentId, feature: 'visualize', sessionId: text(body.courseId, 120) || undefined });
  } catch (err) {
    throw new AppError((err as Error).message, 402);
  }

  const context = [lessonTitle ? `Lesson: ${lessonTitle}` : '', lessonText ? `Lesson content: ${lessonText}` : ''].filter(Boolean).join('\n');
  const html = await generateVisualAid({ question, context, requested: true, feature: 'tutor_visual' });
  if (!html) throw new AppError('The visual could not be made right now. Please try again.', 503, 'VISUAL_UNAVAILABLE');
  res.json({ html });
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
