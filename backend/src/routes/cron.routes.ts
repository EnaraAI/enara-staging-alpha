import { Router, Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/env';
import { sendReminders } from '../services/reminderService';
import { sendWeeklySummaries } from '../services/classSummaryService';
import { logger } from '../utils/logging';
import { processPendingEvidence } from '../services/evidenceProcessor';
import { maintainTimeToUnderstand } from '../services/timeToUnderstand';
import { processCurriculumFiles } from '../services/curriculumExtraction';
import { sweepGrading } from '../services/autoGrading';
import { sweepLearningIntelligence } from '../services/grading';
import { sweepAvatarUsage } from '../services/avatarUsage';
import { sweepStaleReservations } from '../services/aiBudget';
import { sweepDocumentScans } from '../services/documentSafety';
import { sweepDocumentRetention } from '../services/documentRetention';
import { sweepSpeakingTranscripts } from '../services/speakingExam';

// Called once a day by Vercel Cron (see vercel.json), which sends
// "Authorization: Bearer <CRON_SECRET>". Reminders go out every day; the
// teachers' weekly summary on Mondays.
const router = Router();

router.get('/daily', async (req: Request, res: Response, next: NextFunction) => {
  const secret = getConfig().cronSecret;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const evidence = await processPendingEvidence({ limit: 2000 });
    const ttu = await maintainTimeToUnderstand();
    const curriculumFiles = await processCurriculumFiles({ limit: 10 });
    // Safety net: grading retries and Phase 2 updates that are still due.
    const grading = await sweepGrading({ limit: 50 });
    const learningIntelligence = await sweepLearningIntelligence(100);
    // Meter avatar calls that ended or were abandoned (and retry failed appends).
    const avatarUsage = await sweepAvatarUsage({ limit: 2000 });
    // Budget reservations left open by a crash are kept as unknown exposure.
    const budgetReservations = await sweepStaleReservations({ limit: 2000 });
    // Documents (P2): retry scans (a scanner may now be configured), apply retention.
    const documentScans = await sweepDocumentScans(100);
    const documentRetention = await sweepDocumentRetention();
    // Speaking exams (P4): remove transcripts past the teacher's retention period.
    const speakingTranscripts = await sweepSpeakingTranscripts();
    const reminders = await sendReminders({});
    const weekly = new Date().getUTCDay() === 1 ? await sendWeeklySummaries() : null;
    logger.info('cron_daily', { reminders, weekly, evidence, ttu, curriculumFiles, grading, learningIntelligence, avatarUsage, budgetReservations, documentScans, documentRetention, speakingTranscripts });
    res.json({ reminders, weekly, evidence, ttu, curriculumFiles, grading, learningIntelligence, avatarUsage, budgetReservations, documentScans, documentRetention, speakingTranscripts });
  } catch (error) {
    next(error);
  }
});

export default router;
