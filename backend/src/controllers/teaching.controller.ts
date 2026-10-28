import { randomUUID } from 'crypto';
import { hasPermission } from '../auth/permissions';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireInstitutionId } from '../auth/authorization';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import { CourseInstance } from '../models/CourseInstance';
import { EDUCATOR_ACTIONS, LearningIntervention } from '../models/LearningIntervention';
import { LearningEvent } from '../models/LearningEvent';
import { LearningObjective } from '../models/LearningObjective';
import { Student } from '../models/Student';
import { StudentMisconception } from '../models/StudentMisconception';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { classStudentIds, loadClassForStaff, resolveStudentForRead } from '../services/learningAccess';
import { originFilter, parseOriginView, studentsInView, type OriginView } from '../services/originScope';
import { assignmentStatus, studentStatus } from '../services/assignments';
import { getFeatureFlags } from '../services/featureFlags';
import { getEnrolledInstances } from '../services/studentCourseService';
import { ensurePlainObject, getOptionalId, getOptionalString, getRequiredId, getRequiredString, rejectMongoOperators } from '../utils/validation';

const DAY = 86_400_000;

// Classes the caller works with: teachers their own, admins the school's;
// then narrowed to the demo/live view (?origin, default live).
async function myClasses(req: AuthRequest, view: OriginView = 'live') {
  const user = req.user!;
  const filter: Record<string, unknown> =
    user.role === 'enara-admin'
      ? typeof req.query.institutionId === 'string' ? { institutionId: req.query.institutionId } : {}
      : { institutionId: requireInstitutionId(req), ...(user.role === 'teacher' ? { instructorIds: user.id } : {}) };
  return CourseInstance.find({ ...filter, ...originFilter(view) }).sort({ courseName: 1 }).limit(200).lean();
}

type Rules = Parameters<typeof studentStatus>[0];

// Real per-student statuses for a set of assignments.
async function statusesFor(assignments: (Rules & { id: string; classId: string; studentIds?: string[] })[], membersByClass: Map<string, string[]>, view: OriginView = 'live') {
  const attempts = await AssessmentAttempt.find({ assignmentId: { $in: assignments.map((a) => a.id) }, ...originFilter(view) })
    .select('assignmentId studentId status gradingStatus submittedAt')
    .lean();
  const by = new Map<string, typeof attempts>();
  for (const t of attempts) by.set(`${t.assignmentId}|${t.studentId}`, [...(by.get(`${t.assignmentId}|${t.studentId}`) ?? []), t]);
  const rows: { assignmentId: string; studentId: string; status: string; late: boolean }[] = [];
  for (const a of assignments) {
    const inClass = new Set(membersByClass.get(a.classId) ?? []);
    // Students outside the view are not counted (membersByClass is already in view).
    const members = a.studentIds?.length ? a.studentIds.filter((s) => inClass.has(s)) : membersByClass.get(a.classId) ?? [];
    for (const s of members) rows.push({ assignmentId: a.id, studentId: s, ...studentStatus(a, s, (by.get(`${a.id}|${s}`) ?? []) as never) });
  }
  return rows;
}

// GET /api/teaching/overview
export const getOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const view = parseOriginView(req.query.origin);
  const of = originFilter(view);
  const classes = await myClasses(req, view);
  const members = new Map(await Promise.all(classes.map(async (c) => [c.id, await studentsInView(await classStudentIds(c), view)] as [string, string[]])));
  const now = new Date();
  const assignments = await Assignment.find({ classId: { $in: classes.map((c) => c.id) }, state: { $in: ['published', 'closed'] }, dueAt: { $gte: new Date(now.getTime() - 30 * DAY) }, ...of })
    .sort({ dueAt: 1 })
    .limit(300)
    .lean();
  const rows = await statusesFor(assignments as never, members, view);
  const queue = await AssessmentAttempt.find({ assignmentId: { $in: assignments.map((a) => a.id) }, ...of, status: 'submitted', gradingStatus: { $in: ['needs_review', 'graded_draft', 'finalized', 'grading_exception', 'grading_queued', 'grading_in_progress', 'grading_failed'] } })
    .select('gradingStatus submittedAt')
    .lean();
  const openAppeals = await AssessmentAttempt.countDocuments({ assignmentId: { $in: assignments.map((a) => a.id) }, ...of, 'appeals.status': 'open' });
  const oldest = queue.filter((q) => ['needs_review', 'graded_draft', 'grading_exception'].includes(q.gradingStatus!)).reduce<number | null>((m, q) => (q.submittedAt && (m === null || new Date(q.submittedAt).getTime() < m) ? new Date(q.submittedAt).getTime() : m), null);
  const allFollowUps = await LearningIntervention.find({ ownerId: req.user!.id, status: { $in: ['assigned', 'in_progress'] } }).sort({ dueAt: 1 }).limit(50).lean();
  const inView = new Set(await studentsInView([...new Set(allFollowUps.map((f) => f.studentId))], view));
  const followUps = allFollowUps.filter((f) => inView.has(f.studentId));
  const names = new Map((await Student.find({ id: { $in: followUps.map((f) => f.studentId) } }).select('id name').lean()).map((s) => [s.id, s.name]));
  res.json({
    origin: view,
    generatedAt: now,
    note: 'Counts are from submitted work and recorded actions. They describe what happened, not why.',
    classes: classes.map((c) => {
      const mine = assignments.filter((a) => a.classId === c.id);
      const r = rows.filter((x) => mine.some((a) => a.id === x.assignmentId));
      const next = mine.find((a) => new Date(a.dueAt) >= now && a.state === 'published');
      return {
        id: c.id,
        courseName: c.courseName,
        students: members.get(c.id)?.length ?? 0,
        activeAssignments: mine.filter((a) => assignmentStatus(a as never, now) === 'active').length,
        awaitingReview: r.filter((x) => x.status === 'awaiting_review' || x.status === 'grading_delayed').length,
        grading: r.filter((x) => x.status === 'grading').length,
        missing: r.filter((x) => x.status === 'missing').length,
        nextDue: next ? { assignmentId: next.id, title: next.title, dueAt: next.dueAt } : null,
      };
    }),
    // Grading runs on its own; these are the things that need a person.
    review: {
      exceptions: queue.filter((q) => q.gradingStatus === 'grading_exception').length,
      grading: queue.filter((q) => ['grading_queued', 'grading_in_progress', 'grading_failed'].includes(q.gradingStatus!)).length,
      openAppeals,
      needsReview: queue.filter((q) => q.gradingStatus === 'needs_review').length,
      scoredNotFinal: queue.filter((q) => q.gradingStatus === 'graded_draft').length,
      finalNotReleased: queue.filter((q) => q.gradingStatus === 'finalized').length,
      oldestWaitingHours: oldest === null ? null : Math.round((now.getTime() - oldest) / 3_600_000),
    },
    upcoming: assignments
      .filter((a) => a.state === 'published' && new Date(a.dueAt) >= now && new Date(a.dueAt).getTime() <= now.getTime() + 7 * DAY)
      .map((a) => ({ id: a.id, title: a.title, classId: a.classId, dueAt: a.dueAt })),
    followUps: followUps.map((f) => ({
      id: f.id,
      studentId: f.studentId,
      studentName: names.get(f.studentId),
      action: f.interventionType,
      status: f.status,
      dueAt: f.dueAt ?? null,
      overdue: !!f.dueAt && new Date(f.dueAt) < now,
      rationale: f.rationale ?? f.note ?? null,
    })),
  });
});

// GET /api/teaching/classes/:classId/roster
export const getRoster = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Class scope first (loadClassForStaff), then the demo/live view.
  const cls = await loadClassForStaff(req, String(req.params.classId));
  const view = parseOriginView(req.query.origin);
  const of = originFilter(view);
  const ids = await studentsInView(await classStudentIds(cls), view);
  const [students, assignments, lastEvents, interventions] = await Promise.all([
    Student.find({ id: { $in: ids } }).select('id name grade').sort({ name: 1 }).lean(),
    Assignment.find({ classId: cls.id, state: { $in: ['published', 'closed'] }, ...of }).lean(),
    LearningEvent.aggregate([{ $match: { studentId: { $in: ids }, ...of } }, { $group: { _id: '$studentId', at: { $max: '$at' } } }]),
    LearningIntervention.find({ studentId: { $in: ids }, status: { $in: ['assigned', 'in_progress'] } }).select('studentId').lean(),
  ]);
  const rows = await statusesFor(assignments as never, new Map([[cls.id, ids]]), view);
  const last = new Map(lastEvents.map((e: { _id: string; at: Date }) => [e._id, e.at]));
  res.json({
    origin: view,
    class: { id: cls.id, courseName: cls.courseName },
    assignments: assignments.length,
    students: students.map((s) => {
      const r = rows.filter((x) => x.studentId === s.id);
      return {
        id: s.id,
        name: s.name,
        grade: s.grade,
        submitted: r.filter((x) => ['submitted', 'grading', 'grading_delayed', 'awaiting_review', 'graded', 'released'].includes(x.status)).length,
        late: r.filter((x) => x.late).length,
        missing: r.filter((x) => x.status === 'missing').length,
        notStarted: r.filter((x) => x.status === 'not_started').length,
        lastActiveAt: last.get(s.id) ?? null,
        openInterventions: interventions.filter((i) => i.studentId === s.id).length,
      };
    }),
  });
});

// GET /api/teaching/students/:studentId/profile — one learner, within the
// caller's scope, in four kinds of information kept apart: what was observed,
// assessment results, model estimates (Phase 2) and recommendations.
export const getLearnerProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  if (req.user!.role === 'student') throw new AppError('Staff access required', 403, 'FORBIDDEN');
  // A student outside the demo/live view is not shown in it.
  const view = parseOriginView(req.query.origin);
  const of = originFilter(view);
  if (!(await studentsInView([student.id], view)).length) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  const flags = student.institutionId ? await getFeatureFlags(student.institutionId) : null;
  const classes = await getEnrolledInstances(student.id);
  const now = new Date();
  const [assignments, attempts, events, interventions] = await Promise.all([
    Assignment.find({ classId: { $in: classes.map((c) => c.id) }, state: { $in: ['published', 'closed'] }, ...of }).sort({ dueAt: -1 }).limit(100).lean(),
    AssessmentAttempt.find({ studentId: student.id, status: 'submitted', ...of }).sort({ submittedAt: -1 }).limit(100).lean(),
    LearningEvent.aggregate([{ $match: { studentId: student.id, at: { $gte: new Date(now.getTime() - 30 * DAY) }, ...of } }, { $group: { _id: '$type', n: { $sum: 1 }, last: { $max: '$at' } } }]),
    LearningIntervention.find({ studentId: student.id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  const mine = assignments.filter((a) => !a.studentIds?.length || a.studentIds.includes(student.id));
  const rows = await statusesFor(mine as never, new Map(classes.map((c) => [c.id, [student.id]])), view);
  const objectiveIds = new Set<string>(interventions.map((i) => i.objectiveId).filter(Boolean) as string[]);

  let estimates: unknown = null;
  let misconceptions: unknown = null;
  if (flags?.mastery_tracking_enabled) {
    const states = await StudentObjectiveMastery.find({ studentId: student.id }).lean();
    states.forEach((s) => objectiveIds.add(s.objectiveId));
    estimates = states.map((s) => ({ objectiveId: s.objectiveId, status: s.masteryStatus, estimate: s.masteryEstimate, evidenceStrength: s.evidenceStrength, evidenceCount: s.evidenceCount, needsVerification: s.needsVerification }));
  }
  if (flags?.misconception_detection_enabled) {
    const list = await StudentMisconception.find({ studentId: student.id, status: { $in: ['suspected', 'confirmed'] } }).lean();
    list.forEach((m) => objectiveIds.add(m.objectiveId));
    misconceptions = list.map((m) => ({ id: m.id, objectiveId: m.objectiveId, description: m.description, status: m.status, confidence: m.confidence, supportingEvidenceIds: m.supportingEvidenceIds }));
  }
  let recommendations: unknown = null;
  if (flags?.learning_pathways_enabled) {
    const { buildPathway } = await import('../services/pathways');
    recommendations = (await buildPathway(student)).recommendations;
  }
  const codes = new Map((await LearningObjective.find({ id: { $in: [...objectiveIds] } }).select('id code title').lean()).map((o) => [o.id, o]));
  const label = (id?: string) => (id ? { objectiveId: id, code: codes.get(id)?.code, title: codes.get(id)?.title } : null);

  res.json({
    origin: view,
    student: { id: student.id, name: student.name },
    note: 'Estimates come from a scoring rule over recorded answers; they are not grades or predictions, and a low score is not a judgement of ability.',
    observed: {
      classes: classes.map((c) => ({ id: c.id, courseName: c.courseName })),
      submissions: rows.map((r) => ({ ...r, title: mine.find((a) => a.id === r.assignmentId)?.title })),
      activityLast30Days: events.map((e: { _id: string; n: number; last: Date }) => ({ type: e._id, count: e.n, last: e.last })),
    },
    results: attempts.map((t) => ({
      attemptId: t.id,
      assignmentId: t.assignmentId ?? null,
      title: t.assessmentTitle,
      submittedAt: t.submittedAt,
      late: !!t.isLate,
      gradingStatus: t.gradingStatus ?? 'graded',
      // Draft scores (not yet final) are marked as such.
      score: t.score ?? null,
      final: !t.assignmentId || t.gradingStatus === 'finalized' || t.gradingStatus === 'released',
      released: !t.assignmentId || t.gradingStatus === 'released',
    })),
    estimates: estimates === null ? { enabled: false } : { enabled: true, items: (estimates as { objectiveId: string }[]).map((e) => ({ ...e, ...label(e.objectiveId) })) },
    misconceptions: misconceptions === null ? { enabled: false } : { enabled: true, items: (misconceptions as { objectiveId: string }[]).map((m) => ({ ...m, ...label(m.objectiveId) })) },
    recommendations: recommendations === null ? { enabled: false } : { enabled: true, items: recommendations },
    interventions: interventions.map((i) => ({
      id: i.id,
      action: i.interventionType,
      objective: label(i.objectiveId),
      status: i.status,
      rationale: i.rationale ?? i.note ?? null,
      ownerId: i.ownerId ?? i.assignedByUserId ?? null,
      dueAt: i.dueAt ?? null,
      createdAt: (i as { createdAt?: Date }).createdAt,
      outcome: i.outcome ?? null,
      outcomeNote: i.outcomeNote ?? null,
      supportingEvidenceIds: i.sourceEvidenceIds,
    })),
  });
});

// POST /api/teaching/interventions — an educator action for one learner.
export const createEducatorIntervention = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const student = await resolveStudentForRead(req, getRequiredId(body, 'studentId'));
  const action = String(body.action ?? '');
  if (!(EDUCATOR_ACTIONS as readonly string[]).includes(action)) throw new AppError(`action must be one of ${EDUCATOR_ACTIONS.join(', ')}`, 400, 'VALIDATION_ERROR');
  const objectiveId = getOptionalId(body, 'objectiveId');
  if (action !== 'check_in' && !objectiveId) throw new AppError('Choose the objective this is about', 400, 'VALIDATION_ERROR');
  const objective = objectiveId ? await LearningObjective.findOne({ id: objectiveId, institutionId: student.institutionId, status: 'approved' }).select('curriculumId').lean() : null;
  if (objectiveId && !objective) throw new AppError('Objective not found', 404, 'OBJECTIVE_NOT_FOUND');
  const rationale = getRequiredString(body, 'rationale', { max: 1000 });
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : undefined;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new AppError('dueAt must be a date', 400, 'VALIDATION_ERROR');
  const evidenceIds = Array.isArray(body.supportingEvidenceIds) ? body.supportingEvidenceIds.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  // The learner's class that uses the objective's curriculum.
  const course = objective ? (await getEnrolledInstances(student.id)).find((c) => c.curriculumId === objective.curriculumId) : undefined;
  if (objective && !course) throw new AppError('The learner is not in a class using this objective', 400, 'VALIDATION_ERROR');
  try {
    const created = await LearningIntervention.create({
      id: `int-${randomUUID()}`,
      institutionId: student.institutionId,
      studentId: student.id,
      objectiveId,
      courseId: course?.id,
      interventionType: action,
      status: 'assigned',
      assignedBy: 'teacher',
      assignedByUserId: req.user!.id,
      ownerId: req.user!.id,
      rationale,
      dueAt,
      lessonId: getOptionalString(body, 'lessonId', { max: 128 }),
      assignmentId: getOptionalString(body, 'assignmentId', { max: 128 }),
      sourceEvidenceIds: evidenceIds,
      history: [{ at: new Date(), by: req.user!.id, to: 'assigned', note: rationale }],
    });
    res.status(201).json(created.toObject());
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    throw new AppError('This learner already has an open action for this objective', 409, 'INTERVENTION_ACTIVE');
  }
});

// GET /api/teaching/interventions?status=&mine=true
export const listEducatorInterventions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const view = parseOriginView(req.query.origin);
  const classes = await myClasses(req, view);
  const ids = await studentsInView([...new Set((await Promise.all(classes.map((c) => classStudentIds(c)))).flat())], view);
  const filter: Record<string, unknown> = { studentId: { $in: ids }, interventionType: { $in: [...EDUCATOR_ACTIONS, 'teacher_assigned'] } };
  if (typeof req.query.status === 'string') filter.status = req.query.status;
  if (req.query.mine === 'true') filter.ownerId = req.user!.id;
  const items = await LearningIntervention.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
  const names = new Map((await Student.find({ id: { $in: items.map((i) => i.studentId) } }).select('id name').lean()).map((s) => [s.id, s.name]));
  res.json({ origin: view, interventions: items.map((i) => ({ ...i, _id: undefined, studentName: names.get(i.studentId) })) });
});

// PATCH /api/teaching/interventions/:id { status, outcomeNote }
export const updateEducatorIntervention = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const i = await LearningIntervention.findOne({ id: String(req.params.id) });
  if (!i) throw new AppError('Not found', 404);
  await resolveStudentForRead(req, i.studentId).catch(() => {
    throw new AppError('Not found', 404);
  });
  const status = body.status as string | undefined;
  const allowed: Record<string, string[]> = { assigned: ['in_progress', 'completed', 'cancelled'], in_progress: ['completed', 'cancelled'] };
  if (status && status !== i.status) {
    if (!allowed[i.status]?.includes(status)) throw new AppError(`Can't go from ${i.status} to ${status}`, 409, 'INVALID_TRANSITION');
    i.history.push({ at: new Date(), by: req.user!.id, from: i.status, to: status, note: getOptionalString(body, 'outcomeNote', { max: 1000 }) });
    i.status = status as never;
    if (status === 'completed') i.completedAt = new Date();
  }
  if (body.outcomeNote !== undefined) i.outcomeNote = getOptionalString(body, 'outcomeNote', { max: 1000 });
  await i.save();
  res.json(i.toObject());
});

// GET /api/teaching/classes/:classId/objectives — approved objectives of the
// class's curriculum (for choosing what an intervention is about).
export const getClassObjectives = asyncHandler(async (req: AuthRequest, res: Response) => {
  const cls = await loadClassForStaff(req, String(req.params.classId));
  const objectives = cls.curriculumId
    ? await LearningObjective.find({ institutionId: cls.institutionId, curriculumId: cls.curriculumId, status: 'approved' }).select('id code title lessonIds').sort({ code: 1 }).lean()
    : [];
  res.json({ objectives: objectives.map((o) => ({ id: o.id, code: o.code, title: o.title, lessonIds: o.lessonIds })) });
});

const PHASE3_AI_FEATURES = ['ai_grading', 'ai_grading_proposal', 'ai_assessment_draft', 'ai_question_regenerate', 'ai_lesson_plan', 'ai_lesson_plan_section'];

// GET /api/teaching/ops — operational metrics for the teaching workflow
// (admins). Counts from stored records over the last 30 days; they show how
// the system runs, not whether students learn more.
export const getOpsMetrics = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'teacher') throw new AppError('Admin access required', 403, 'FORBIDDEN');
  const institutionId = req.user!.role === 'enara-admin' ? (typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined) : requireInstitutionId(req);
  const scope = institutionId ? { institutionId } : {};
  // Every section says which data it covers (originCoverage). Attempt-based
  // counts follow the demo/live view. Grading proposals have no origin of
  // their own; they take it from their attempt. AI calls have neither an
  // origin nor a parent record: they are an all-origin aggregate, never part
  // of a live or demo total. Notification logs carry no school, so they are
  // only shown to ENARA admins looking at the whole platform.
  const view = parseOriginView(req.query.origin);
  const of = originFilter(view);
  const since = new Date(Date.now() - 30 * DAY);
  const platformWide = req.user!.role === 'enara-admin' && !institutionId;
  const { GradingProposal } = await import('../models/GradingProposal');
  const { AiCall } = await import('../models/AiCall');
  const { ReminderLog } = await import('../models/ReminderLog');
  const [queue, proposals, ai, graded, notifications, submissions, exceptions, intelligence] = await Promise.all([
    AssessmentAttempt.aggregate([
      { $match: { ...scope, ...of, status: 'submitted', gradingStatus: { $in: ['grading_queued', 'grading_in_progress', 'grading_failed', 'grading_exception', 'grading_pending', 'needs_review', 'graded_draft', 'finalized'] } } },
      { $group: { _id: '$gradingStatus', n: { $sum: 1 }, oldest: { $min: '$submittedAt' } } },
    ]),
    GradingProposal.aggregate([
      { $match: { ...scope, createdAt: { $gte: since } } },
      ...(view === 'all'
        ? []
        : [
            { $lookup: { from: AssessmentAttempt.collection.name, localField: 'attemptId', foreignField: 'id', as: 'attempt' } },
            // A proposal whose attempt is gone has no known origin: only in the all view.
            { $match: { 'attempt.0': { $exists: true }, ...(view === 'demo_seed' ? { 'attempt.origin': 'demo_seed' } : { 'attempt.origin': { $ne: 'demo_seed' } }) } },
          ]),
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    AiCall.aggregate([
      { $match: { ...scope, feature: { $in: PHASE3_AI_FEATURES }, createdAt: { $gte: since } } },
      { $group: { _id: { feature: '$feature', status: '$status' }, n: { $sum: 1 }, avgLatencyMs: { $avg: '$latencyMs' }, costUsd: { $sum: '$costUsd' }, unpriced: { $sum: { $cond: [{ $eq: ['$costStatus', 'unpriced'] }, 1, 0] } } } },
    ]),
    AssessmentAttempt.find({ ...scope, ...of, assignmentId: { $exists: true }, finalizedAt: { $gte: since } }).select('history').lean(),
    platformWide
      ? ReminderLog.aggregate([{ $match: { kind: { $in: ['assignment_published', 'results_released'] }, createdAt: { $gte: since } } }, { $group: { _id: { kind: '$kind', sent: '$sent' }, n: { $sum: 1 } } }])
      : Promise.resolve(null),
    AssessmentAttempt.aggregate([{ $match: { ...scope, ...of, assignmentId: { $exists: true }, submittedAt: { $gte: since } } }, { $group: { _id: '$isLate', n: { $sum: 1 } } }]),
    AssessmentAttempt.aggregate([{ $match: { ...scope, ...of, gradingStatus: 'grading_exception' } }, { $group: { _id: '$exceptionReason', n: { $sum: 1 } } }]),
    AssessmentAttempt.aggregate([{ $match: { ...scope, ...of, intelligenceStatus: { $in: ['pending', 'failed'] } } }, { $group: { _id: '$intelligenceStatus', n: { $sum: 1 } } }]),
  ]);
  const actions = graded.flatMap((t) => t.history.map((h) => h.action));
  const autoReleased = graded.filter((t) => t.history.some((h) => h.action === 'released' && h.by === 'system:grader'));
  const minutes = autoReleased
    .map((t) => {
      const sub = t.history.find((h) => h.action === 'submitted');
      const rel = t.history.find((h) => h.action === 'released' && h.by === 'system:grader');
      return sub && rel ? (new Date(rel.at).getTime() - new Date(sub.at).getTime()) / 60_000 : null;
    })
    .filter((m): m is number => m !== null)
    .sort((x, y) => x - y);
  const scored = actions.filter((a) => ['scored', 'override', 'proposal_accepted'].includes(a)).length;
  const now = Date.now();
  res.json({
    origin: view,
    originCoverage: {
      gradingQueue: view,
      proposals: view,
      autoGrading: view,
      reviewActions: view,
      submissions: view,
      aiCalls: 'all_origin_aggregate',
      notifications: platformWide ? 'all_origin_aggregate' : 'not_available_for_one_school',
    },
    institutionId: institutionId ?? null,
    windowDays: 30,
    note: 'Operational counts only; they do not measure learning outcomes.',
    gradingQueue: queue.map((q: { _id: string; n: number; oldest: Date }) => ({ status: q._id, count: q.n, oldestHours: q.oldest ? Math.round((now - new Date(q.oldest).getTime()) / 3_600_000) : null })),
    proposals: Object.fromEntries(proposals.map((p: { _id: string; n: number }) => [p._id, p.n])),
    autoGrading: {
      released: autoReleased.length,
      medianMinutesToRelease: minutes.length ? Math.round(minutes[Math.floor(minutes.length / 2)] * 10) / 10 : null,
      retries: actions.filter((a) => a === 'grading_failed').length,
      exceptionsByReason: Object.fromEntries(exceptions.map((x: { _id: string; n: number }) => [x._id ?? 'unknown', x.n])),
      correctedAfterRelease: autoReleased.filter((t) => t.history.some((h) => h.action === 'corrected')).length,
      learningIntelligencePending: Object.fromEntries(intelligence.map((x: { _id: string; n: number }) => [x._id, x.n])),
    },
    reviewActions: {
      scoredAnswers: scored,
      proposalsAccepted: actions.filter((a) => a === 'proposal_accepted').length,
      overrides: actions.filter((a) => a === 'override').length,
      corrections: actions.filter((a) => a === 'corrected').length,
      overrideRate: scored ? Math.round((actions.filter((a) => a === 'override').length / scored) * 100) / 100 : null,
    },
    aiCalls: ai.map((a: { _id: { feature: string; status: string }; n: number; avgLatencyMs: number; costUsd: number; unpriced: number }) => ({ feature: a._id.feature, status: a._id.status, count: a.n, avgLatencyMs: Math.round(a.avgLatencyMs), ...(hasPermission(req, 'cost:internal') ? { costUsd: Math.round(a.costUsd * 10000) / 10000, unpricedCalls: a.unpriced } : {}) })),
    notifications: notifications ? notifications.map((x: { _id: { kind: string; sent: boolean }; n: number }) => ({ kind: x._id.kind, sent: x._id.sent, count: x.n })) : null,
    submissions: { onTime: submissions.find((s: { _id: boolean }) => !s._id)?.n ?? 0, late: submissions.find((s: { _id: boolean }) => s._id === true)?.n ?? 0 },
  });
});
