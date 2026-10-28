import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { isGlobalAdmin, scopedFilter } from '../auth/authorization';
import { getRequiredId } from '../utils/validation';
import { buildCourseAnalytics, buildOverview, buildStudentAnalytics, type OriginView } from '../services/analyticsService';
import { hasPermission } from '../auth/permissions';
import { buildWeeklySummary } from '../services/classSummaryService';
import { planReminders } from '../services/reminderService';
import { getConfig } from '../config/env';
import { AiCall } from '../models/AiCall';
import { answerDataQuestion } from '../services/dataAssistant';

/** Institution admins see their institution; Enara admins see everything or one ?institutionId=. */
function analyticsScope(req: AuthRequest): Record<string, unknown> {
  const filter: Record<string, unknown> = scopedFilter(req, {});
  const requested = req.query.institutionId;
  if (isGlobalAdmin(req) && typeof requested === 'string' && requested) {
    filter.institutionId = requested;
  }
  return filter;
}

// GET /api/analytics/overview
// ?origin=live (default) | demo_seed | all: seeded demo data stays out of live metrics.
function originView(req: AuthRequest): OriginView {
  const v = req.query.origin;
  return v === 'demo_seed' || v === 'all' ? v : 'live';
}

export const getOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const origin = originView(req);
  res.json({ ...(await buildOverview(analyticsScope(req), new Date(), origin)), origin });
});

// GET /api/analytics/courses/:id  (course instance id or courseId)
export const getCourseAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = getRequiredId(req.params, 'id');
  const report = await buildCourseAnalytics(analyticsScope(req), id, new Date(), originView(req));
  if (!report) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  res.json(report);
});

// GET /api/analytics/students/:id
export const getStudentAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = getRequiredId(req.params, 'id');
  const report = await buildStudentAnalytics(analyticsScope(req), id);
  if (!report) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  res.json(report);
});

// GET /api/analytics/weekly-summary — "This week in your school".
export const getWeeklySummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await buildWeeklySummary(analyticsScope(req)));
});

// GET /api/analytics/reminders/preview — who would get a reminder email now and
// what it says. Sends nothing.
export const previewReminders = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email } = getConfig();
  res.json({
    sending: email.enabled && Boolean(email.resendApiKey && email.from),
    testRecipient: email.testRecipient || null,
    reminders: await planReminders(analyticsScope(req)),
  });
});

// GET /api/analytics/ai-usage?days=30 — AI calls, tokens and estimated cost by
// feature and model for the school (Enara admins: all schools or ?institutionId=).
export const getAiUsage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 180);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const match = { ...analyticsScope(req), createdAt: { $gte: since } };
  const groups = await AiCall.aggregate([
    { $match: match },
    {
      $group: {
        _id: { feature: '$feature', model: '$modelName' },
        calls: { $sum: 1 },
        errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        refusals: { $sum: { $cond: [{ $eq: ['$status', 'refusal'] }, 1, 0] } },
        inputTokens: { $sum: '$inputTokens' },
        outputTokens: { $sum: '$outputTokens' },
        cacheReadTokens: { $sum: '$cacheReadTokens' },
        characters: { $sum: { $ifNull: ['$characters', 0] } },
        costUsd: { $sum: '$costUsd' },
        unpricedCalls: { $sum: { $cond: [{ $eq: ['$costStatus', 'unpriced'] }, 1, 0] } },
        avgLatencyMs: { $avg: '$latencyMs' },
      },
    },
    { $sort: { costUsd: -1 } },
  ]);
  const byFeature = groups.map((g) => ({
    feature: g._id.feature,
    model: g._id.model,
    calls: g.calls,
    errors: g.errors,
    refusals: g.refusals,
    inputTokens: g.inputTokens,
    outputTokens: g.outputTokens,
    cacheReadTokens: g.cacheReadTokens,
    characters: g.characters,
    costUsd: Math.round(g.costUsd * 10000) / 10000,
    // Calls with no catalogue price: their cost is unknown, not zero.
    unpricedCalls: g.unpricedCalls,
    avgLatencyMs: Math.round(g.avgLatencyMs || 0),
  }));
  const totals = byFeature.reduce(
    (t, g) => ({ calls: t.calls + g.calls, errors: t.errors + g.errors, costUsd: t.costUsd + g.costUsd, unpricedCalls: t.unpricedCalls + g.unpricedCalls }),
    { calls: 0, errors: 0, costUsd: 0, unpricedCalls: 0 },
  );
  totals.costUsd = Math.round(totals.costUsd * 10000) / 10000;
  // Internal provider cost is for ENARA (cost:internal) only; schools see usage.
  if (!hasPermission(req, 'cost:internal')) {
    const strip = <T extends { costUsd?: number; unpricedCalls?: number }>(o: T) => {
      const { costUsd: _c, unpricedCalls: _u, ...rest } = o;
      return rest;
    };
    res.json({ days, since: since.toISOString(), totals: strip(totals), byFeature: byFeature.map(strip) });
    return;
  }
  res.json({ days, since: since.toISOString(), totals, byFeature, costIsEstimate: true, costIsComplete: totals.unpricedCalls === 0 });
});

// POST /api/analytics/assistant { message, history? } — staff data assistant.
export const askAssistant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  if (!message) throw new AppError('message is required', 400, 'VALIDATION_ERROR');
  const rawHistory: unknown[] = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
  const history = rawHistory
    .filter(
      (h): h is { role: 'user' | 'assistant'; content: string } =>
        !!h && typeof h === 'object' && ['user', 'assistant'].includes((h as any).role) && typeof (h as any).content === 'string',
    )
    .map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }));
  // The API needs the conversation to start with the user.
  while (history.length && history[0].role !== 'user') history.shift();
  res.json(await answerDataQuestion(analyticsScope(req), message, history));
});
