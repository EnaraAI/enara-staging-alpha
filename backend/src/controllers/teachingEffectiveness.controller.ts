import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { hasPermission } from '../auth/permissions';
import { isGlobalAdmin } from '../auth/authorization';
import { CourseInstance } from '../models/CourseInstance';
import { LearningObjective } from '../models/LearningObjective';
import { TeachingEpisode } from '../models/TeachingEpisode';
import { isFeatureEnabled } from '../services/featureFlags';
import { classStudentIds, resolveStudentForRead } from '../services/learningAccess';
import { DIMENSIONS, summarize, type Dimension } from '../services/methodEffectiveness';
import { parseOriginView } from '../services/originScope';
import { STRATEGY_BY_ID } from '../services/strategyRegistry';
import { objectiveEvidenceTrend } from '../services/teachingImpact';

// Teaching effectiveness (P21 C5). Read-only and aggregated for staff; a
// student's own episodes for the student and the staff allowed to see them.
// Never returns costs. Scope: institution first, then the teacher's classes,
// then the live/demo view, exactly as the other learning analytics.

async function enabled(institutionId: string | undefined) {
  return (await isFeatureEnabled(institutionId, 'learning_intelligence_enabled')) && (await isFeatureEnabled(institutionId, 'adaptive_pedagogy_enabled'));
}

const methodName = (id: string) => STRATEGY_BY_ID.get(id)?.name ?? id;

// GET /api/learning/analytics/teaching-effectiveness?classId=&dimension=&composition=1&origin=
// Teachers: their classes. Admins and academic managers: their school (read-only).
// Enara admins: ?institutionId=.
export const getTeachingEffectiveness = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const global = isGlobalAdmin(req);
  const schoolWide = global || hasPermission(req, 'insights:read_school');
  if (!global && !['teacher', 'admin', 'academic_manager'].includes(user.role)) throw new AppError('Not allowed', 403, 'FORBIDDEN');
  if (!global && !schoolWide && !hasPermission(req, 'class:teach')) throw new AppError('Not allowed', 403, 'FORBIDDEN');
  const institutionId = global ? (typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined) : user.institutionId;
  if (!institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
  if (!global && !(await enabled(institutionId))) throw new AppError('Not found', 404, 'FEATURE_DISABLED');

  const dimension = (DIMENSIONS as string[]).includes(String(req.query.dimension)) ? (req.query.dimension as Dimension) : 'none';
  const view = parseOriginView(req.query.origin);
  const filter: Record<string, unknown> = { institutionId };
  const classId = typeof req.query.classId === 'string' ? req.query.classId.slice(0, 128) : undefined;
  if (classId || !schoolWide) {
    const classes = await CourseInstance.find({
      institutionId,
      ...(classId ? { id: classId } : {}),
      ...(!schoolWide ? { instructorIds: user.id } : {}),
    }).limit(200).lean();
    if (classId && !classes.length) throw new AppError('Class not found', 404, 'CLASS_NOT_FOUND');
    const ids = new Set<string>();
    for (const c of classes) for (const s of await classStudentIds(c)) ids.add(s);
    filter.studentId = { $in: [...ids] };
  }
  if (view !== 'all') filter.origin = view === 'demo_seed' ? 'demo_seed' : { $ne: 'demo_seed' };

  const episodes = await TeachingEpisode.find(filter)
    .select('studentId primary supporting objectiveId subject gradeBand misconceptionCategories label observedChange retentionChange baseline.score comparability evidenceQuality')
    .limit(50_000)
    .lean();
  const summary = summarize(episodes, { dimension, byComposition: req.query.composition === '1' });
  const labels: Record<string, number> = {};
  for (const e of episodes) labels[e.label] = (labels[e.label] ?? 0) + 1;
  res.json({
    origin: view,
    scope: classId ? 'class' : schoolWide ? 'school' : 'my_classes',
    dimension,
    coverage: { episodes: episodes.length, students: new Set(episodes.map((e) => e.studentId)).size, byLabel: labels },
    ...summary,
    groups: summary.groups.map((g) => ({ ...g, methodName: methodName(g.method), supportingNames: g.supporting?.map(methodName) })),
  });
});

// GET /api/learning/students/:studentId/teaching-impact (studentId may be 'me')
// The student's own teaching episodes and objective trends. Students see their
// own; teachers their classes' students; admins their school (resolveStudentForRead).
export const getStudentTeachingImpact = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  if (!(await enabled(student.institutionId ?? undefined))) throw new AppError('Not found', 404, 'FEATURE_DISABLED');
  const episodes = await TeachingEpisode.find({ studentId: student.id }).sort({ startAt: -1 }).limit(100).lean();
  const objectiveIds = [...new Set(episodes.map((e) => e.objectiveId))].slice(0, 20);
  const objectives = await LearningObjective.find({ id: { $in: objectiveIds }, institutionId: student.institutionId }).select('id code title').lean();
  const titleOf = new Map(objectives.map((o) => [o.id, `${o.code} ${o.title}`]));
  const trends = await Promise.all(objectiveIds.map(async (id) => ({ objectiveId: id, objective: titleOf.get(id) ?? id, ...(await objectiveEvidenceTrend(student.id, id)) })));
  res.json({
    studentId: student.id,
    episodes: episodes.map((e) => ({
      id: e.id,
      objectiveId: e.objectiveId,
      objective: titleOf.get(e.objectiveId) ?? e.objectiveId,
      method: e.primary,
      methodName: methodName(e.primary),
      supporting: e.supporting,
      startAt: e.startAt,
      endAt: e.endAt,
      baseline: { n: e.baseline?.n ?? 0, score: e.baseline?.score ?? null },
      post: { n: e.post?.n ?? 0, score: e.post?.score ?? null },
      retention: { n: e.retention?.n ?? 0, score: e.retention?.score ?? null, delayDays: e.retention?.delayDays ?? null },
      transfer: { n: e.transfer?.n ?? 0, score: e.transfer?.score ?? null },
      exams: e.exams,
      mastery: e.mastery,
      observedChange: e.observedChange,
      retentionChange: e.retentionChange,
      label: e.label,
      evidenceQuality: e.evidenceQuality,
      limitations: e.limitations,
    })),
    objectiveTrends: trends,
  });
});
