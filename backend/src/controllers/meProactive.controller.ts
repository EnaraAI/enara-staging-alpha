import { processStudentEvidenceSafely } from '../services/evidenceProcessor';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { buildLearnerSnapshot, forgetLearnerSnapshot } from '../services/learnerSnapshot';
import { buildNextSteps, nextStepsNote } from '../services/nextStepsService';
import { answerReview, listDueReviews } from '../services/reviewService';

// GET /api/me/next-steps — the home page's "Your next steps".
export const getNextSteps = asyncHandler(async (req: AuthRequest, res: Response) => {
  const snapshot = await buildLearnerSnapshot(req.user!.studentId!);
  const steps = buildNextSteps(snapshot);
  res.json({ note: await nextStepsNote(snapshot, steps), steps });
});

// GET /api/me/reviews — review questions due now.
export const listReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ items: await listDueReviews(req.user!.studentId!) });
});

// POST /api/me/reviews/:id/answer { answer }
export const answerReviewItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const given = (req.body as { answer?: unknown })?.answer;
  if (typeof given !== 'string' && typeof given !== 'number') {
    throw new AppError('An answer is required', 400, 'VALIDATION_ERROR');
  }
  const result = await answerReview(req.user!.studentId!, String(req.params.id), given);
  if (!result) throw new AppError('Review question not found', 404);
  forgetLearnerSnapshot(req.user!.studentId!);
  await processStudentEvidenceSafely(req.user!.studentId!);
  res.json(result);
});
