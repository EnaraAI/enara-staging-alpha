import { Router, type Response } from 'express';
import { designPlatformStatusOn, getConfig } from '../config/env';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { LmsEmailLog } from '../integrations/lms/models/email';
import { cairoDay } from '../email/provider';
import { engineV2 } from '../services/engineV2';
import { deepseekReady, tutorModel, tutorProvider } from '../services/llmProvider';
import { fallbackModel, modelFallbackOn } from '../services/modelFallback';
import { logger } from '../utils/logging';

// GET /api/platform/status: the design app's "Models & Mishkat" screen (docs/lms/DESIGN_APP.md). ENARA admins only, read-only.
// 404 unless LMS_DESIGN_PLATFORM_STATUS=true (lms-test only). Configuration presence, names and counts only: never a key, a token
// or an address. No network call to any service (Mishkat is a paid GPU service on Modal; a ping would wake it): only the loaded
// configuration and three small database reads on existing indexes, each with a short timeout; a read that fails or is slow is
// reported as "unavailable" and the rest still answers.
const router = Router();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  return designPlatformStatusOn(process.env) ? next() : next(new AppError('Route not found', 404, 'NOT_FOUND'));
});
router.use(authMiddleware, requireRole('enara-admin'));

export const PART_TIMEOUT_MS = 2_000;
const DAY_MS = 24 * 60 * 60 * 1000;
// The most recent Mishkat-scored grade is looked for this far back (keeps the read bounded).
const LAST_SCORED_LOOKBACK_DAYS = 30;
type Unavailable = 'unavailable';

/** The value, or "unavailable" when it fails or takes longer than the timeout. Never throws. */
async function part<T>(name: string, run: () => Promise<T>, ms = PART_TIMEOUT_MS): Promise<T | Unavailable> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<Unavailable>((resolve) => { timer = setTimeout(() => resolve('unavailable'), ms); });
  try {
    const r = await Promise.race([run().catch((): Unavailable => 'unavailable'), timeout]);
    if (r === 'unavailable') logger.warn('platform_status.part_unavailable', { part: name });
    return r;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// A Mishkat-scored grade: an answer carries the Mishkat engine id (`<scorer version>+v3b`; services/autoGrading.ts). Graded
// attempts are school attempts, so the { institutionId, status, submittedAt } index serves the read (institutionId: any string).
const mishkatScored = (since: Date) => ({
  institutionId: { $type: 'string' as const },
  status: 'submitted' as const,
  submittedAt: { $gte: since },
  'answers.engine': { $type: 'string' as const },
});

router.get('/status', asyncHandler(async (_req: AuthRequest, res: Response) => {
  const c = getConfig();
  const now = new Date();
  const day = cairoDay(now);
  const ms = PART_TIMEOUT_MS;

  const [lastScored, scoredLast24h, emailToday] = await Promise.all([
    part('mishkat_last', async () => {
      const a = await AssessmentAttempt.findOne(mishkatScored(new Date(now.getTime() - LAST_SCORED_LOOKBACK_DAYS * DAY_MS)), { finalizedAt: 1, submittedAt: 1 })
        .sort({ submittedAt: -1 }).maxTimeMS(ms).lean<{ finalizedAt?: Date; submittedAt?: Date }>();
      const at = a?.finalizedAt ?? a?.submittedAt;
      return at ? new Date(at).toISOString() : null;
    }),
    part('mishkat_24h', () => AssessmentAttempt.countDocuments(mishkatScored(new Date(now.getTime() - DAY_MS))).maxTimeMS(ms).exec()),
    part('email_today', async () => {
      const rows = await LmsEmailLog.aggregate<{ _id: string; n: number }>([
        { $match: { cairoDay: day, status: { $in: ['sent', 'held', 'failed'] } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]).option({ maxTimeMS: ms });
      const n = (s: string) => rows.find((r) => r._id === s)?.n ?? 0;
      return { sent: n('sent'), held: n('held'), failed: n('failed') };
    }),
  ]);

  // One Mishkat service serves both languages (MISHKAT_ENDPOINT + MISHKAT_TOKEN); the split is the named switch mishkatSplit.
  const mishkatConfigured = Boolean(process.env.MISHKAT_ENDPOINT?.trim() && process.env.MISHKAT_TOKEN?.trim());
  const splitOn = engineV2('mishkatSplit');
  const resendKey = Boolean(c.email.resendApiKey);

  res.json({
    mishkat: {
      ar: { configured: mishkatConfigured, splitOn },
      en: { configured: mishkatConfigured, splitOn },
      lastScoredAt: lastScored,
      scoredLast24h,
    },
    email: {
      configured: resendKey && c.email.enabled,
      resendKeyPresent: resendKey,
      emailsEnabled: c.email.enabled,
      lmsEmailsEnabled: c.lms.emailsEnabled,
      dailyCeiling: c.email.dailyCeiling ?? null,
      cairoDay: day,
      today: emailToday,
    },
    models: {
      tutorProvider: deepseekReady() ? 'deepseek' : 'anthropic',
      tutor: deepseekReady() ? tutorModel()! : c.anthropicTutorModel,
      anthropicTutor: c.anthropicTutorModel,
      ...(tutorProvider() === 'deepseek' && tutorModel() ? { deepseekTutor: tutorModel()! } : {}),
      fallback: fallbackModel() ?? null,
      fallbackOn: modelFallbackOn(),
    },
    checkedAt: now.toISOString(),
  });
}));

export default router;
