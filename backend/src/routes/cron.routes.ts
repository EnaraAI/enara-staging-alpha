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
import { scheduledDrain, triggerOn } from '../integrations/lms/core/drain';
import { rosterTriggerOn, scheduledRosterSync } from '../integrations/lms/core/roster';
import { checkLmsResults } from '../integrations/lms/core/lmsResults';
import { recheckFailedConnections } from '../integrations/lms/core/connectionCheck';
import { lmsFlags } from '../integrations/lms/core/flags';
import { moodleQuizOn, scheduledMoodleQuizImport } from '../integrations/lms/core/moodleQuiz';
import { gradeLedgerOn } from '../services/gradeLedger';
import { runLmsEmailDaily } from '../integrations/lms/core/lmsEmailDaily';
import { lmsEmailsActive } from '../integrations/lms/core/lmsEmail';
import { parentSettingsEnabled } from '../parents/flags';
import { runParentUsageRollup } from '../parents/usage';
import { parentEmailsEnabled } from '../email/sendParentTemplate';
import { runWeeklySummaries } from '../parents/parentEmails';

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
    const startedAt = Date.now();
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
    // LMS grade outbox, last safety net (plan §5 e). Skipped unless passback is on.
    // Grade ledger (inert unless GRADE_LEDGER_ENABLED): grades changed in the LMS are found and held first.
    if (triggerOn('daily') && gradeLedgerOn()) await run('lmsResultsCheck', () => checkLmsResults({ all: true }, { limit: 200, budgetMs: 15_000 }));
    if (triggerOn('daily')) await run('lmsGrades', () => scheduledDrain('daily'));
    // LMS roster sync, nightly (plan §5 e, Phase 4). Skipped unless roster sync is
    // on. It gets what is left of a 50 s window (at most 20 s), so the whole run
    // stays under the 60 s function limit; courses not reached go first next night.
    // Errors to work on from Moodle's own quizzes (switch moodleQuiz; only connections whose school saved a token and switched it on).
    if (moodleQuizOn()) {
      const budgetMs = Math.min(10_000, 45_000 - (Date.now() - startedAt));
      await run('lmsMoodleQuiz', async () => (budgetMs < 3_000 ? { skipped: 'no_time' } : scheduledMoodleQuizImport({ budgetMs })));
    }
    if (rosterTriggerOn('daily')) {
      const budgetMs = Math.min(20_000, 50_000 - (Date.now() - startedAt));
      await run('lmsRoster', async () => (budgetMs < 5_000 ? { skipped: 'no_time' } : scheduledRosterSync({ trigger: 'nightly', budgetMs })));
    }
    // LMS step 2 (S3): re-run the automatic connection check for connections
    // whose last check failed. Inert unless LMS_LTI_ENABLED is on; it gets what
    // is left of a 55 s window (at most 15 s).
    if (lmsFlags().lti) {
      const budgetMs = Math.min(15_000, 55_000 - (Date.now() - startedAt));
      await run('lmsConnectionChecks', async () => (budgetMs < 5_000 ? { skipped: 'no_time' } : recheckFailedConnections({ budgetMs })));
    }
    // LMS emails (docs/lms/LMS_EMAILS.md): the daily digests (weekly ones on Cairo
    // Mondays) and the ops daily digest. Inert unless LMS_EMAILS_ENABLED (and
    // REMINDERS_ENABLED, RESEND_API_KEY, APP_URL) are set; at most 15 s, the ops
    // digest always runs.
    if (lmsEmailsActive()) {
      const budgetMs = Math.max(3_000, Math.min(15_000, 57_000 - (Date.now() - startedAt)));
      await run('lmsEmails', () => runLmsEmailDaily({ budgetMs }));
    }
    // Parents P1: nightly rollup of parent usage events (inert unless PARENT_SETTINGS_ENABLED).
    if (parentSettingsEnabled()) await run('parentUsage', () => runParentUsageRollup());
    // Parents P4: the weekly summary (one email per parent), once Sunday 18:00 Cairo has passed; at most 10 s.
    if (parentEmailsEnabled()) await run('parentWeekly', () => runWeeklySummaries({ budgetMs: Math.max(2_000, Math.min(10_000, 58_000 - (Date.now() - startedAt))) }));
    // Learner memory phase 3 (learnerProfile switch): yesterday's study habits per learner.
    if ((await import('../services/learnerMemory')).learnerProfileOn()) await run('studyHabits', async () => (await import('../services/learnerMemory')).runHabitsRollup());
    await run('reminders', () => sendReminders({}));
    if (new Date().getUTCDay() === 1) await run('weekly', () => sendWeeklySummaries());
    logger.info('cron_daily', { ...results, failed });
    res.status(failed.length ? 207 : 200).json({ ...results, failed });
  } catch (error) {
    next(error);
  }
});

// A protected drain for a future per-minute scheduler (Vercel Pro or an
// external one): switched on by adding 'cron' to LMS_DRAIN_TRIGGERS, nothing
// else. Otherwise the app's normal 404.
router.get('/lms-drain', async (req: Request, res: Response, next: NextFunction) => {
  if (!triggerOn('cron')) return next();
  const secret = getConfig().cronSecret;
  if (!secret || !authorised(req.headers.authorization, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    res.json(await scheduledDrain('cron'));
  } catch (error) {
    next(error);
  }
});

// The roster sync for the same future per-minute (or hourly) scheduler: only
// courses not synced for 20 h are taken, so calling it often is cheap. Needs
// LMS_ROSTER_SYNC_ENABLED and 'cron' in LMS_DRAIN_TRIGGERS; otherwise the
// app's normal 404.
router.get('/lms-roster', async (req: Request, res: Response, next: NextFunction) => {
  if (!rosterTriggerOn('cron')) return next();
  const secret = getConfig().cronSecret;
  if (!secret || !authorised(req.headers.authorization, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    res.json(await scheduledRosterSync({ trigger: 'cron', budgetMs: 40_000 }));
  } catch (error) {
    next(error);
  }
});

export default router;
