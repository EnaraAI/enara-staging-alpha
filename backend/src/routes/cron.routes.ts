import { sweepDemoSessions } from '../services/demoSandbox';
import { Router, Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/env';
import { sendReminders } from '../services/reminderService';
import { sendWeeklySummaries } from '../services/classSummaryService';
import { timingSafeEqual } from 'crypto';
import { logger, serializeError } from '../utils/logging';
import { recordAlert } from '../services/auditTrail';
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

// Meant to be called once a day by a scheduler that sends
// "Authorization: Bearer <CRON_SECRET>". Staging deliberately has no Vercel
// cron (p6VercelStaging); the schedule is an operator decision documented in
// ENARA_PILOT_OPERATIONS_RUNBOOK.md (P22). Every job is idempotent and
// runs on its own: one failing job is recorded (alert) and the others still
// run (P22). Reminders and summaries send nothing unless email is configured
// (REMINDERS_ENABLED); the teachers' weekly summary runs on Mondays.
const router = Router();

function authorised(header: unknown, secret: string): boolean {
  const given = Buffer.from(typeof header === 'string' ? header : '');
  const expected = Buffer.from(`Bearer ${secret}`);
  // Constant-time comparison of equal-length values (P22).
  return given.length === expected.length && timingSafeEqual(given, expected);
}

router.get('/daily', async (req: Request, res: Response, next: NextFunction) => {
  const secret = getConfig().cronSecret;
  if (!secret || !authorised(req.headers.authorization, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const results: Record<string, unknown> = {};
    const failed: string[] = [];
    const run = async (name: string, job: () => Promise<unknown>) => {
      try {
        results[name] = await job();
      } catch (error) {
        failed.push(name);
        results[name] = { failed: true };
        logger.error('cron_job_failed', { job: name, error: serializeError(error) });
        await recordAlert('cron_job_failed', 'critical', { scope: name, job: name });
      }
    };
    await run('evidence', () => processPendingEvidence({ limit: 2000 }));
    await run('ttu', () => maintainTimeToUnderstand());
    await run('curriculumFiles', () => processCurriculumFiles({ limit: 10 }));
    // Safety net: grading retries and Phase 2 updates that are still due.
    await run('grading', () => sweepGrading({ limit: 50 }));
    await run('learningIntelligence', () => sweepLearningIntelligence(100));
    // Meter avatar calls that ended or were abandoned (and retry failed appends).
    await run('avatarUsage', () => sweepAvatarUsage({ limit: 2000 }));
    // Budget reservations left open by a crash are kept as unknown exposure.
    await run('budgetReservations', () => sweepStaleReservations({ limit: 2000 }));
    // Documents (P2): retry scans (a scanner may now be configured), apply retention.
    await run('documentScans', () => sweepDocumentScans(100));
    await run('documentRetention', () => sweepDocumentRetention());
    // Speaking exams (P4): remove transcripts past the teacher's retention period.
    await run('speakingTranscripts', () => sweepSpeakingTranscripts());
    // Demo sessions left open (browser closed without saying so).
    await run('demoSessions', () => sweepDemoSessions({ limit: 200 }));
    await run('reminders', () => sendReminders({}));
    if (new Date().getUTCDay() === 1) await run('weekly', () => sendWeeklySummaries());
    logger.info('cron_daily', { ...results, failed });
    res.status(failed.length ? 207 : 200).json({ ...results, failed });
  } catch (error) {
    next(error);
  }
});

export default router;
