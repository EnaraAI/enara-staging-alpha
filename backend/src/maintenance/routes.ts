import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { getConfig } from '../config/env';
import { MIGRATIONS } from '../migrations';
import { pendingMigrations, runMigrations } from '../migrations/runner';
import { logger } from '../utils/logging';
import { applyBackfill, planBackfill, undoBackfill } from '../services/enrollmentBackfill';
import { shadowReport } from '../services/enrollmentShadowReport';
import { cleanDanglingClassMembers, planDanglingClassMembers } from '../services/danglingClassMembers';
import { maintenanceAllowed, maintenanceAuthorised } from './guards';
import { seedLmsTest } from './lmsTestSeed';
import { fullSeedStatus, removeFullSeed, runFullSeed, SeedRefused } from './fullSeed/run';
import { mockLmsRouter } from './mockLms';
import { runHealthCheck, setupHealthCheck } from './healthCheck';
import { avatarUsageReport, parseAvatarIds } from './avatarUsageReport';
import { llmCheck, llmCompare, llmPing, tutorEval } from './llmCheck';

// Maintenance for the LMS TEST deployment only (lms-test.enara.app): 404 unless
// switched on AND MONGODB_URI is the test cluster AND a maintenance token is
// configured; then 401 without Bearer MAINTENANCE_TOKEN or MAINTENANCE_CI_TOKEN.
// The rules are in guards.ts (re-exported here for callers and tests).
export { TEST_CLUSTER_HOST_PREFIX, MIN_TOKEN_LENGTH, mongoHost, maintenanceTokens, maintenanceAllowed, maintenanceAuthorised } from './guards';

const router = Router();

router.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!maintenanceAllowed(process.env, getConfig().mongoUri)) return next('router');
  next();
});

// The mock LMS for the deploy health check: its protocol endpoints have their own
// checks instead of the maintenance token; its sign-in needs the token (mockLms.ts).
router.use('/mock-lms', mockLmsRouter);

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!maintenanceAuthorised(req.headers.authorization)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

// Deploy health check (healthCheck.ts): registers the mock LMS for the fake
// school, then runs login -> launch -> exchange -> submit -> grade over HTTP.
router.post('/health-check/setup', async (_req, res, next) => {
  try {
    const out = await setupHealthCheck();
    logger.info('maintenance_health_setup', { ok: out.ok, code: out.code });
    res.status(out.ok ? 200 : 409).json(out);
  } catch (e) {
    next(e);
  }
});

router.post('/health-check/run', async (req, res, next) => {
  try {
    const out = await runHealthCheck({ authorization: String(req.headers.authorization) });
    logger.info('maintenance_health_run', { ok: out.ok, failed: out.steps.filter((s) => !s.ok).map((s) => s.name).join(',') });
    res.json(out); // 200 either way: the body's ok and steps say what failed
  } catch (e) {
    next(e);
  }
});

router.get('/status', async (_req, res, next) => {
  try {
    const pending = await pendingMigrations(MIGRATIONS);
    const collections = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name).sort();
    res.json({
      database: mongoose.connection.db!.databaseName, pendingMigrations: pending.map((m) => m.id), collections: collections.length,
      // Which Vercel deployment answered (the pipeline checks it after a deploy or a rollback).
      deployment: { url: process.env.VERCEL_URL ?? null, id: process.env.VERCEL_DEPLOYMENT_ID ?? null },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/migrate', async (_req, res, next) => {
  try {
    const applied = await runMigrations(MIGRATIONS);
    logger.info('maintenance_migrate', { applied: applied.length });
    res.json({ applied, pending: (await pendingMigrations(MIGRATIONS)).map((m) => m.id) });
  } catch (e) {
    next(e);
  }
});

router.post('/seed-lms-test', async (req, res, next) => {
  try {
    const password = (req.body as { password?: unknown })?.password;
    if (typeof password !== 'string' || password.length < 12) {
      res.status(400).json({ error: 'password (at least 12 characters) is required' });
      return;
    }
    const result = await seedLmsTest(password);
    logger.info('maintenance_seed', result as unknown as Record<string, unknown>);
    res.json({ seeded: result });
  } catch (e) {
    next(e);
  }
});

// Full data set for lms-test (docs/lms/FULL_SEED_PLAN.md): action run | remove | status. The password comes only from the server's
// SEED_USER_PASSWORD (never the body, never logged); run refuses and writes nothing without it. remove deletes exactly what
// seed_registry lists. The response lists users without passwords.
router.post('/full-seed', async (req, res, next) => {
  try {
    const action = (req.body as { action?: unknown })?.action;
    if (action === 'status') { res.json(await fullSeedStatus()); return; }
    if (action === 'remove') {
      const out = await removeFullSeed();
      logger.info('maintenance_full_seed_remove', { registryRowsDeleted: out.registryRowsDeleted });
      res.json(out);
      return;
    }
    if (action !== 'run') { res.status(400).json({ error: "action must be 'run', 'remove' or 'status'" }); return; }
    try {
      const out = await runFullSeed();
      logger.info('maintenance_full_seed_run', { total: out.total });
      res.json(out);
    } catch (e) {
      if (e instanceof SeedRefused) { res.status(409).json({ error: e.message }); return; }
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

// Multi-class step 3 backfill on the test database (fake data only).
// mode: dry-run (default, writes nothing) | apply | undo. apply and undo need
// "confirm": true, like the npm script.
router.post('/enrollment-backfill', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { mode?: unknown; confirm?: unknown; institutionId?: unknown };
    const mode = body.mode ?? 'dry-run';
    const opts = typeof body.institutionId === 'string' ? { institutionId: body.institutionId } : {};
    if (mode === 'dry-run') {
      res.json({ mode, report: await planBackfill(opts) });
      return;
    }
    if ((mode === 'apply' || mode === 'undo') && body.confirm !== true) {
      res.status(400).json({ error: `${mode} needs "confirm": true` });
      return;
    }
    if (mode === 'apply') {
      const r = await applyBackfill(opts);
      logger.info('maintenance_enrollment_backfill', { mode, created: r.created, reactivated: r.reactivated });
      res.json({ mode, created: r.created, reactivated: r.reactivated, report: r.report });
      return;
    }
    if (mode === 'undo') {
      const r = await undoBackfill(opts);
      logger.info('maintenance_enrollment_backfill', { mode, deleted: r.deleted });
      res.json({ mode, ...r });
      return;
    }
    res.status(400).json({ error: 'mode must be dry-run, apply or undo' });
  } catch (e) {
    next(e);
  }
});

// Decision A cleanup: dangling student IDs in class lists (test database only).
router.post('/dangling-class-members', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { mode?: unknown; confirm?: unknown; institutionId?: unknown };
    const opts = typeof body.institutionId === 'string' ? { institutionId: body.institutionId } : {};
    if ((body.mode ?? 'dry-run') === 'dry-run') { res.json({ mode: 'dry-run', ...(await planDanglingClassMembers(opts)) }); return; }
    if (body.mode !== 'apply' || body.confirm !== true) { res.status(400).json({ error: 'mode apply needs "confirm": true' }); return; }
    const r = await cleanDanglingClassMembers(opts);
    logger.info('maintenance_dangling_class_members', { removed: r.removed });
    res.json({ mode: 'apply', ...r });
  } catch (e) {
    next(e);
  }
});

// LMS evidence for the owner's MoodleCloud checks (test database only):
// grade jobs and the LMS audit log, IDs and codes only (no names or emails
// are stored in these collections; this route returns them as stored).
router.get('/lms-evidence', async (req, res, next) => {
  try {
    const { LmsAuditLog, LmsGradeSyncJob, LmsResourceLink } = await import('../integrations/lms/models');
    const n = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const jobs = await LmsGradeSyncJob.find({}).sort({ createdAt: -1 }).limit(n).lean();
    const audit = await LmsAuditLog.find({}).sort({ createdAt: -1 }).limit(n).lean();
    // Phase 2 check: each LMS activity, its binding and whether the LMS gave it a grade column (line item).
    const links = await LmsResourceLink.find({}).sort({ createdAt: -1 }).limit(n).select('id contextId title enaraActivityId lineItemUrl customParams presentation createdAt').lean();
    res.json({
      links: links.map((l) => ({
        id: l.id, contextId: l.contextId, title: l.title ?? null, enaraActivityId: l.enaraActivityId ?? null, presentation: l.presentation,
        lineItem: l.lineItemUrl ? new URL(l.lineItemUrl).pathname : null, custom: l.customParams ?? {}, createdAt: (l as { createdAt?: Date }).createdAt,
      })),
      jobs: jobs.map((j) => { const { _id, ...rest } = j as Record<string, unknown>; void _id; return rest; }),
      audit: audit.map((a) => { const { _id, ...rest } = a as Record<string, unknown>; void _id; return rest; }),
    });
  } catch (e) {
    next(e);
  }
});

// LMS emails on the test database (and the E2E stack's captured emails,
// LMS_EMAIL_CAPTURE): lms_email_log rows, newest first. IDs, codes, the
// template, the language and the subject only (the log keeps no address, name
// or body). ?template= filters one base alias.
router.get('/lms-emails', async (req, res, next) => {
  try {
    const { LmsEmailLog } = await import('../integrations/lms/models');
    const { cairoDay, ceilingCount, heldToday, emailPolicy } = await import('../email/testInbox');
    const n = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const template = typeof req.query.template === 'string' ? req.query.template.slice(0, 80) : undefined;
    const rows = await LmsEmailLog.find(template ? { template } : {}).sort({ createdAt: -1 }).limit(n).lean();
    const day = cairoDay();
    res.json({
      today: { cairoDay: day, ceiling: emailPolicy().ceiling ?? null, ceilingUsed: await ceilingCount(day), held: await heldToday(day) },
      emails: rows.map((r) => ({
        key: r.key, template: r.template, lang: r.lang, status: r.status, code: r.code ?? null, subject: r.subject ?? null, institutionId: r.institutionId ?? null,
        platformId: r.platformId ?? null, recipientCount: r.recipientCount, redirected: r.redirected, cairoDay: r.cairoDay, createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// Parents P2, the Docker E2E stack only: the last 6-digit parent email code
// captured for a (fake) address. Emails there are captured, never sent
// (LMS_EMAIL_CAPTURE), so the suite reads the code here. 404 unless capture is
// on (never on lms-test); behind the maintenance token and the test cluster
// check like every route here. The address is in the POST body (request logs
// keep the path and query only), never logged.
router.post('/parent-email-code', async (req, res, next) => {
  try {
    const { capturedCodeFor } = await import('../parents/emailSignin');
    const body = (req.body ?? {}) as { email?: unknown; purpose?: unknown };
    const purpose = body.purpose === 'signin' ? 'signin' : 'verify';
    const code = typeof body.email === 'string' ? await capturedCodeFor(body.email.slice(0, 254), purpose) : null;
    if (!code) {
      res.status(404).json({ error: 'No captured code' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ code });
  } catch (e) {
    next(e);
  }
});

// Parents P4 on the test database: run the weekly summary step now (force: any
// day of the week; it is still once per parent per week), and list the parent
// email sends (IDs, template, outcome; no address or subject).
router.post('/parent-weekly', async (req, res, next) => {
  try {
    const { runWeeklySummaries } = await import('../parents/parentEmails');
    res.json(await runWeeklySummaries({ force: (req.body as { force?: unknown } | undefined)?.force === true }));
  } catch (e) {
    next(e);
  }
});
router.get('/parent-emails', async (req, res, next) => {
  try {
    const { ParentEmailSend } = await import('../models/ParentEmailSend');
    const n = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const rows = await ParentEmailSend.find({}).sort({ at: -1 }).limit(n).lean();
    res.json({ emails: rows.map((r) => ({ key: r.key, template: r.template, parentUserId: r.parentUserId ?? null, studentId: r.studentId ?? null, institutionId: r.institutionId ?? null, status: r.status, code: r.code ?? null, attempts: r.attempts, at: r.at })) });
  } catch (e) {
    next(e);
  }
});

// Grade ledger backfill on the test database (dry run by default; apply needs confirm).
router.post('/grade-ledger-backfill', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { apply?: unknown; confirm?: unknown; institutionId?: unknown };
    if (body.apply === true && body.confirm !== true) { res.status(400).json({ error: 'apply needs "confirm": true' }); return; }
    const { backfillGradeLedger } = await import('../services/gradeLedgerBackfill');
    const r = await backfillGradeLedger({ apply: body.apply === true, institutionId: typeof body.institutionId === 'string' ? body.institutionId : undefined } as never);
    logger.info('maintenance_grade_ledger_backfill', { apply: body.apply === true });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

// TEST-ONLY Moodle Web Services tool (maintenance/moodleTestWs.ts): fixed
// actions on the fake MoodleCloud course. 404 unless MOODLE_TEST_WS_ENABLED,
// the token and the URL are set (on top of this router's own guards).
router.post('/moodle-ws', async (req, res, next) => {
  try {
    const { moodleWsConfigured, runMoodleWsAction, MoodleWsError } = await import('./moodleTestWs');
    if (!moodleWsConfigured(process.env)) { res.status(404).json({ error: 'Not found' }); return; }
    try {
      res.json(await runMoodleWsAction(process.env, (req.body ?? {}) as Record<string, unknown>));
    } catch (e) {
      if (e instanceof MoodleWsError) { res.status(e.status).json({ error: e.code, message: e.message === e.code ? undefined : e.message }); return; }
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

// Multi-class step 4 shadow report (counts only).
router.get('/enrollment-shadow-report', async (req, res, next) => {
  try {
    const n = (v: unknown) => (typeof v === 'string' && Number(v) > 0 ? Number(v) : undefined);
    res.json(await shadowReport({ days: n(req.query.days), requiredCleanDays: n(req.query.required) }));
  } catch (e) {
    next(e);
  }
});

// Avatar cost and latency test (avatarUsageReport.ts): numbers for up to 30 listed avatar calls. Read only; IDs and numbers only.
// The last on-screen visual of each test avatar call (owner, 22 Nov 2026: "let me see them"). Test database only; fake learners;
// returns the stored visual page (HTML the tutor drew), nothing else.
// Visual samples (owner, 22 Nov 2026: "give me more drawings"): one avatar visual for a fake lesson moment, drawn with the new drawing rules
// and check (check: true) or the old way (check: false), for side-by-side images. Fake content; metered to the fake school LT-SCHOOL-A.
router.post('/visual-sample', async (req, res, next) => {
  try {
    const b = (req.body ?? {}) as { question?: unknown; answer?: unknown; context?: unknown; check?: unknown };
    if (typeof b.question !== 'string' || !b.question.trim()) { res.status(400).json({ error: 'question required' }); return; }
    const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
    const { runWithCallContext } = await import('../utils/callContext');
    const { generateVisualAid } = await import('../services/avatarVisuals');
    const t = Date.now();
    const html = await runWithCallContext({ institutionId: 'LT-SCHOOL-A', role: 'maintenance' }, () =>
      generateVisualAid({ question: b.question as string, answer: s(b.answer, 2000), context: s(b.context, 2000), requested: true, check: b.check !== false }));
    res.json({ html, ms: Date.now() - t });
  } catch (e) {
    next(e);
  }
});
router.get('/avatar-visuals', async (req, res, next) => {
  try {
    const ids = parseAvatarIds(req.query.ids);
    if (!ids) { res.status(400).json({ error: 'ids: 1 to 30 avatar call ids (av-<uuid>), comma separated' }); return; }
    const { AvatarSession } = await import('../models/AvatarSession');
    const rows = await AvatarSession.find({ id: { $in: ids } }, { id: 1, artifactHtml: 1 }).lean();
    res.json({ visuals: ids.map((id) => ({ id, html: (rows.find((r) => r.id === id) as { artifactHtml?: string } | undefined)?.artifactHtml ?? null })) });
  } catch (e) {
    next(e);
  }
});
router.get('/avatar-usage', async (req, res, next) => {
  try {
    const ids = parseAvatarIds(req.query.ids);
    if (!ids) { res.status(400).json({ error: 'ids: 1 to 30 avatar call ids (av-<uuid>), comma separated' }); return; }
    res.json({ calls: await avatarUsageReport(ids) });
  } catch (e) {
    next(e);
  }
});

// Parents suggestions: one model rewording of a fixed sample, with timing, the outcome and each refusal reason (no learner data).
router.get('/parent-recs-check', async (req, res, next) => {
  try { const { rewordCheck } = await import('../parents/recommendations'); res.json(await rewordCheck(typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined)); } catch (e) { next(e); }
});
// Tutor provider checks (llmCheck.ts): the endpoint's models and timings, and one request through the adapter for the quality check.
router.get('/llm-check', async (_req, res, next) => {
  try { res.json(await llmCheck()); } catch (e) { next(e); }
});
router.post('/llm-compare', async (req, res, next) => {
  try { res.json(await llmCompare(req.body ?? {})); } catch (e) { next(e); }
});
// DeepSeek match quality check: one fake tutor turn through the real prompt builder and the adapter, match parts on or off.
router.post('/tutor-eval', async (req, res, next) => {
  try { res.json(await tutorEval(req.body ?? {})); } catch (e) { next(e); }
});
// Idle-timeout probe: one 1-token request and its time.
router.post('/llm-ping', async (_req, res, next) => {
  try { res.json(await llmPing()); } catch (e) { next(e); }
});

// Assessment bench (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §7): grade the next bench answers of a run with the real engine, or the run's
// numbers. Bench answers are fake (written for the bench). Spending cap per run; never retried on the fallback provider.
router.post('/assessment-bench', async (req, res, next) => {
  try {
    const b = (req.body ?? {}) as { action?: string; runId?: string; domain?: string; lang?: string; limit?: number; capUsd?: number };
    const runId = String(b.runId ?? '');
    if (!/^[a-zA-Z0-9_-]{3,60}$/.test(runId)) { res.status(400).json({ error: 'runId: 3-60 letters, digits, _ or -' }); return; }
    const bench = await import('../assessment/bench/run');
    if (b.action === 'start') { res.json(await bench.startRun({ runId, capUsd: b.capUsd })); return; }
    if (b.action === 'summary') { res.json(await bench.summary(runId)); return; }
    if (b.action === 'misses') { res.json(await bench.misses(runId)); return; }
    if (b.action !== 'grade' || !['language', 'math', 'science', 'humanities', 'listening'].includes(String(b.domain)) || !['en', 'ar'].includes(String(b.lang))) { res.status(400).json({ error: 'action start|grade|summary|misses; grade needs domain language|math|science|humanities|listening and lang en|ar' }); return; }
    const { engineModelReadyForBench } = await import('../assessment/bench/ready');
    res.json(await bench.gradeBatch({ runId, domain: b.domain as 'language' | 'math' | 'science' | 'humanities' | 'listening', lang: b.lang as 'en' | 'ar', limit: Number(b.limit) || 6, modelReady: engineModelReadyForBench() }));
  } catch (e) { next(e); }
});

export default router;
