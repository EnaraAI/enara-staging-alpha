import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { isGlobalAdmin, scopedFilter } from '../auth/authorization';
import { LEARNING_EVENT_SOURCES, LEARNING_EVENT_TYPES, LearningEvent } from '../models/LearningEvent';
import { recordLearningEvent, toEventResponse } from '../services/learningEvents';
import { buildCourseTree } from '../services/studentCourseService';
import { ensurePlainObject, getOptionalId, getOptionalNumber, getRequiredId, rejectMongoOperators } from '../utils/validation';

const MAX_PAGE = 200;

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new AppError(`${field} is invalid`, 400, 'VALIDATION_ERROR');
  }
  return value as T[number];
}

function dateParam(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new AppError(`${field} must be a date`, 400, 'VALIDATION_ERROR');
  return date;
}

// Filters shared by the student and admin lists. `before` pages backwards in time.
function listFilter(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  const type = oneOf(query.type, LEARNING_EVENT_TYPES, 'type');
  const source = oneOf(query.source, LEARNING_EVENT_SOURCES, 'source');
  if (type) filter.type = type;
  if (source) filter.source = source;
  if (query.verified === 'true' || query.verified === 'false') filter.verified = query.verified === 'true';
  const from = dateParam(query.from, 'from');
  const to = dateParam(query.to, 'to');
  const before = dateParam(query.before, 'before');
  const at: Record<string, Date> = {};
  if (from) at.$gte = from;
  if (to) at.$lte = to;
  if (before) at.$lt = before;
  if (Object.keys(at).length) filter.at = at;
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), MAX_PAGE);
  return { filter, limit };
}

async function page(filter: Record<string, unknown>, limit: number) {
  const events = await LearningEvent.find(filter).sort({ at: -1, _id: -1 }).limit(limit).lean();
  return {
    events: events.map(toEventResponse),
    nextBefore: events.length === limit ? events[events.length - 1].at : null,
  };
}

// GET /api/me/events — the student's own learning record.
export const listMyEvents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { filter, limit } = listFilter(req.query as Record<string, unknown>);
  res.json(await page({ ...filter, studentId: req.user!.studentId }, limit));
});

// POST /api/me/events { type: 'lesson_viewed', courseId, lessonId, durationMs }
// Signals only the browser can see (time on a lesson). Stored as unverified.
export const recordMyEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  if (body.type !== 'lesson_viewed') throw new AppError('Only lesson_viewed can be reported', 400, 'VALIDATION_ERROR');
  const courseId = getRequiredId(body, 'courseId');
  const lessonId = getRequiredId(body, 'lessonId');
  const durationMs = getOptionalNumber(body, 'durationMs', { min: 0, max: 4 * 60 * 60 * 1000 });
  const studentId = req.user!.studentId!;
  // Only lessons in the student's own courses.
  const course = await buildCourseTree(studentId, courseId);
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);
  await recordLearningEvent({
    studentId,
    institutionId: req.user!.institutionId,
    type: 'lesson_viewed',
    source: 'client',
    verified: false,
    subject: course.subject,
    topic: lesson.title,
    refs: { courseId: course.id, lessonId },
    durationMs: durationMs === undefined ? undefined : Math.round(durationMs),
  });
  res.status(201).json({ recorded: true });
});

// GET /api/analytics/events — the event explorer for school admins (Enara
// admins: all schools, or one with ?institutionId=). Filter by student, type,
// source, verified and time; includes counts by type for the same filter.
export const listSchoolEvents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = req.query as Record<string, unknown>;
  const { filter, limit } = listFilter(query);
  const scoped: Record<string, unknown> = scopedFilter(req, filter);
  const institutionId = getOptionalId(query, 'institutionId');
  if (isGlobalAdmin(req) && institutionId) scoped.institutionId = institutionId;
  const studentId = getOptionalId(query, 'studentId');
  if (studentId) scoped.studentId = studentId;

  const countFilter = { ...scoped };
  if (countFilter.at && typeof countFilter.at === 'object') {
    const { $lt, ...rest } = countFilter.at as Record<string, Date>;
    countFilter.at = Object.keys(rest).length ? rest : undefined;
    if (!countFilter.at) delete countFilter.at;
  }
  const [result, counts] = await Promise.all([
    page(scoped, limit),
    LearningEvent.aggregate<{ _id: { type: string; verified: boolean }; n: number }>([
      { $match: countFilter },
      { $group: { _id: { type: '$type', verified: '$verified' }, n: { $sum: 1 } } },
    ]),
  ]);
  const byType: Record<string, { total: number; verified: number }> = {};
  for (const c of counts) {
    const t = (byType[c._id.type] ??= { total: 0, verified: 0 });
    t.total += c.n;
    if (c._id.verified) t.verified += c.n;
  }
  res.json({ ...result, counts: byType });
});
