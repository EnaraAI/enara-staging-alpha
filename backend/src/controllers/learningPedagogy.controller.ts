import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { isGlobalAdmin, requireInstitutionId } from '../auth/authorization';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import { TimeToUnderstand } from '../models/TimeToUnderstand';
import { STRATEGIES } from '../services/strategyRegistry';
import { PEDAGOGY_DECISION_VERSION } from '../services/pedagogyPolicy';
import { TTU_VERSION } from '../services/timeToUnderstand';
import { parseOriginView, studentClauseForView, studentsInView } from '../services/originScope';

// GET /api/learning/strategies — the strategy registry (staff).
export const listStrategies = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ decisionVersion: PEDAGOGY_DECISION_VERSION, strategies: STRATEGIES });
});

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const minutes = (s: number | null) => (s === null ? null : Math.round((s / 60) * 10) / 10);

// GET /api/learning/analytics/ttu?objectiveId=&courseId= — distributions of
// time to understand. Teachers: students in their classes; admins: their school.
export const getTtuAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (isGlobalAdmin(req)) {
    if (typeof req.query.institutionId === 'string') filter.institutionId = req.query.institutionId;
  } else {
    filter.institutionId = requireInstitutionId(req);
  }
  const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
  const view = parseOriginView(req.query.origin);
  let studentIds: string[] | undefined;
  if (req.user!.role === 'teacher' || courseId) {
    const classes = await CourseInstance.find({
      ...(filter.institutionId ? { institutionId: filter.institutionId } : {}),
      ...(courseId ? { id: courseId } : {}),
      ...(req.user!.role === 'teacher' ? { instructorIds: req.user!.id } : {}),
    }).lean();
    if (courseId && !classes.length) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
    const batchIds = classes.map((c) => c.batchId).filter(Boolean);
    const inBatches = batchIds.length ? await Student.find({ batchId: { $in: batchIds }, ...(filter.institutionId ? { institutionId: filter.institutionId } : {}) }).select('id').lean() : [];
    studentIds = [...new Set([...classes.flatMap((c) => c.studentIds || []), ...inBatches.map((s) => s.id)])];
    filter.studentId = { $in: await studentsInView(studentIds, view) };
  } else {
    // School-wide: TTU episodes follow their students' origin.
    Object.assign(filter, await studentClauseForView(filter.institutionId as string | undefined, view));
  }
  if (typeof req.query.objectiveId === 'string') filter.objectiveId = req.query.objectiveId;

  const episodes = await TimeToUnderstand.find(filter).lean();
  const verified = episodes.filter((e) => e.status === 'verified');
  const active = verified.map((e) => e.activeInstructionSeconds).sort((a, b) => a - b);
  const elapsed = verified.map((e) => e.elapsedSeconds ?? 0).sort((a, b) => a - b);
  const byStrategy = new Map<string, number[]>();
  for (const e of verified) for (const s of e.strategiesUsed.length ? e.strategiesUsed : ['none_recorded']) {
    byStrategy.set(s, [...(byStrategy.get(s) ?? []), e.activeInstructionSeconds]);
  }
  res.json({
    origin: view,
    measurementVersion: TTU_VERSION,
    counts: {
      verified: verified.length,
      inProgress: episodes.filter((e) => e.status === 'in_progress').length,
      abandoned: episodes.filter((e) => e.status === 'abandoned').length,
    },
    verified: {
      activeInstructionMinutes: { p25: minutes(quantile(active, 0.25)), median: minutes(quantile(active, 0.5)), p75: minutes(quantile(active, 0.75)) },
      elapsedDays: { median: quantile(elapsed, 0.5) === null ? null : Math.round((quantile(elapsed, 0.5)! / 86400) * 10) / 10 },
    },
    byStrategy: [...byStrategy.entries()].map(([strategyId, values]) => ({
      strategyId,
      verified: values.length,
      medianActiveMinutes: minutes(quantile(values.sort((a, b) => a - b), 0.5)),
    })),
    caveats: [
      'Only verified episodes have a time to understand; in-progress and abandoned ones are counted separately, not as zero or infinite.',
      'Objectives differ in size and difficulty: compare times within an objective, not across objectives.',
      'Strategy rows describe what was used, not what caused understanding.',
    ],
  });
});
