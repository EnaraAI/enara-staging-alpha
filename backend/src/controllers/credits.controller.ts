import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';
import { isGlobalAdmin, scopedFilter } from '../auth/authorization';
import { Student } from '../models/Student';
import { StudentCredit } from '../models/StudentCredit';
import { UsageEvent } from '../models/UsageEvent';

const REPORT_DAYS = 30;
const MAX_STUDENTS = 1000;
const NEAR_LIMIT_RATIO = 0.8;
// Matches the StudentCredit schema defaults, for students who have not used AI yet.
const DEFAULT_CREDIT = { limit: 50000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] as string[] };

/**
 * GET /api/credits — AI credit balances for every student the admin can see,
 * plus settled usage over the last 30 days by feature and by day.
 * Institution admins see their institution; Enara admins see everything,
 * optionally narrowed with ?institutionId=.
 */
export const getCreditsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = scopedFilter(req, {});
  const requestedInstitution = req.query.institutionId;
  if (isGlobalAdmin(req) && typeof requestedInstitution === 'string' && requestedInstitution) {
    filter.institutionId = requestedInstitution;
  }

  const since = new Date(Date.now() - REPORT_DAYS * 24 * 60 * 60 * 1000);
  const usageMatch = { ...filter, status: 'settled', timestamp: { $gte: since } };

  const [students, credits, byFeature, byDay] = await Promise.all([
    Student.find(filter).select('id name email batchId institutionId').limit(MAX_STUDENTS).lean(),
    StudentCredit.find(filter).lean(),
    UsageEvent.aggregate<{ _id: string; credits: number; events: number }>([
      { $match: usageMatch },
      { $group: { _id: '$feature', credits: { $sum: '$creditsUsed' }, events: { $sum: 1 } } },
      { $sort: { credits: -1 } },
    ]),
    UsageEvent.aggregate<{ _id: string; credits: number; events: number }>([
      { $match: usageMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          credits: { $sum: '$creditsUsed' },
          events: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // One entry per day of the period (UTC), zero where nothing was used, so charts don't skip days.
  const dayTotals = new Map(byDay.map((d) => [d._id, d]));
  const usageByDay = Array.from({ length: REPORT_DAYS }, (_, i) => {
    const date = new Date(Date.now() - (REPORT_DAYS - 1 - i) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const day = dayTotals.get(date);
    return { date, credits: day?.credits ?? 0, events: day?.events ?? 0 };
  });

  const creditByStudent = new Map(credits.map((c) => [c.studentId, c]));
  const rows = students
    .map((student) => {
      const credit = creditByStudent.get(student.id);
      const limit = credit?.limit ?? DEFAULT_CREDIT.limit;
      const usage = credit?.usage ?? DEFAULT_CREDIT.usage;
      return {
        studentId: student.id,
        name: student.name,
        email: student.email,
        batchId: student.batchId,
        institutionId: student.institutionId,
        limit,
        usage,
        remaining: Math.max(0, limit - usage),
        usagePct: limit > 0 ? Math.round((usage / limit) * 100) : 0,
        period: credit?.period ?? DEFAULT_CREDIT.period,
        status: credit?.status ?? DEFAULT_CREDIT.status,
        restrictedFeatures: credit?.restrictedFeatures ?? DEFAULT_CREDIT.restrictedFeatures,
      };
    })
    .sort((a, b) => b.usage - a.usage);

  const totalLimit = rows.reduce((sum, r) => sum + r.limit, 0);
  const totalUsage = rows.reduce((sum, r) => sum + r.usage, 0);

  res.json({
    summary: {
      studentCount: rows.length,
      totalLimit,
      totalUsage,
      totalRemaining: Math.max(0, totalLimit - totalUsage),
      blocked: rows.filter((r) => r.status === 'blocked').length,
      throttled: rows.filter((r) => r.status === 'throttled').length,
      nearLimit: rows.filter((r) => r.limit > 0 && r.usage >= r.limit * NEAR_LIMIT_RATIO).length,
      truncated: students.length >= MAX_STUDENTS,
    },
    students: rows,
    usageByFeature: byFeature.map((f) => ({ feature: f._id, credits: f.credits, events: f.events })),
    usageByDay,
    periodDays: REPORT_DAYS,
  });
});
