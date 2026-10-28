import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { hasPermission } from '../auth/permissions';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import { CourseInstance } from '../models/CourseInstance';
import { LearningIntervention } from '../models/LearningIntervention';
import { LearningObjective } from '../models/LearningObjective';
import { Student } from '../models/Student';
import { TimeToUnderstand } from '../models/TimeToUnderstand';
import { classStudentIds, resolveStudentForRead } from '../services/learningAccess';
import { isFeatureEnabled } from '../services/featureFlags';
import { originFilter, parseOriginView, studentsInView } from '../services/originScope';

// Outcomes (P4.3): observed results for the students in the caller's scope.
// A gap counts as closed only when the existing time-to-understand rules
// verified it (an independent, unassisted reassessment). Everything else is
// "not yet verified". Counts only, no student names; seeded demo data is out
// of the default (live) view. Measured, not causal.
//   teacher: classes they instruct; admin: their school; academic manager:
//   their school, aggregates only.

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 366;

async function studentScope(req: AuthRequest, classId?: string) {
  const user = req.user!;
  const institutionId = user.institutionId;
  if (!institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
  if (classId) {
    const cls = await CourseInstance.findOne({ id: classId, institutionId }).lean();
    if (!cls || (user.role === 'teacher' && !(cls.instructorIds || []).includes(user.id))) throw new AppError('Class not found', 404, 'CLASS_NOT_FOUND');
    return { institutionId, studentIds: await classStudentIds(cls), classIds: [cls.id] };
  }
  if (user.role === 'teacher') {
    const classes = await CourseInstance.find({ institutionId, instructorIds: user.id }).limit(200).lean();
    const ids = new Set<string>();
    for (const c of classes) for (const s of await classStudentIds(c)) ids.add(s);
    return { institutionId, studentIds: [...ids], classIds: classes.map((c) => c.id) };
  }
  const students = await Student.find({ institutionId }).select('id').limit(20000).lean();
  return { institutionId, studentIds: students.map((s) => s.id), classIds: undefined as string[] | undefined };
}

function range(q: Record<string, unknown>) {
  const to = q.to ? new Date(String(q.to)) : new Date();
  const from = q.from ? new Date(String(q.from)) : new Date(to.getTime() - 90 * DAY);
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || from > to) throw new AppError('from/to must be dates, from before to', 400, 'VALIDATION_ERROR');
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY) throw new AppError(`The range can be at most ${MAX_RANGE_DAYS} days`, 400, 'VALIDATION_ERROR');
  return { from, to };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// GET /api/learning/analytics/outcomes?classId=&from=&to=&origin=&page=&pageSize=
export const getOutcomes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  if (!['teacher', 'admin', 'academic_manager'].includes(user.role) || !(hasPermission(req, 'class:teach') || hasPermission(req, 'insights:read_school'))) {
    throw new AppError('Not allowed', 403, 'FORBIDDEN');
  }
  if (!(await isFeatureEnabled(user.institutionId, 'connected_workflow_enabled'))) throw new AppError('Not found', 404, 'FEATURE_DISABLED');
  const q = req.query as Record<string, unknown>;
  const view = parseOriginView(q.origin);
  const { from, to } = range(q);
  const page = Math.max(1, Math.min(1000, Math.floor(Number(q.page) || 1)));
  const pageSize = Math.max(1, Math.min(50, Math.floor(Number(q.pageSize) || 20)));
  const scope = await studentScope(req, typeof q.classId === 'string' ? q.classId.slice(0, 128) : undefined);
  const studentIds = await studentsInView(scope.studentIds, view);
  const inst = scope.institutionId;

  const assignmentFilter: Record<string, unknown> = { institutionId: inst, ...originFilter(view) };
  if (scope.classIds) assignmentFilter.classId = { $in: scope.classIds };
  const assignments = await Assignment.find(assignmentFilter).select('id format').limit(5000).lean();
  const speakingIds = new Set(assignments.filter((a) => a.format === 'english_conversation').map((a) => a.id));
  const attempts = await AssessmentAttempt.find({
    institutionId: inst,
    studentId: { $in: studentIds },
    assignmentId: { $in: assignments.map((a) => a.id) },
    status: 'submitted',
    submittedAt: { $gte: from, $lte: to },
  })
    .select('assignmentId gradingStatus exceptionReason speaking.assessedAs speaking.evidence')
    .lean();
  const grading = { released: 0, inProgress: 0, exception: 0, insufficientEvidence: 0, other: 0 };
  const speaking = { attempts: 0, spokenGraded: 0, accommodationGraded: 0, insufficientEvidence: 0, notYetGraded: 0 };
  for (const t of attempts) {
    const g = t.gradingStatus;
    if (g === 'released') grading.released++;
    else if (g === 'grading_queued' || g === 'grading_in_progress' || g === 'grading_failed') grading.inProgress++;
    else if (g === 'grading_exception' && t.exceptionReason === 'insufficient_evidence') grading.insufficientEvidence++;
    else if (g === 'grading_exception') grading.exception++;
    else grading.other++;
    if (speakingIds.has(t.assignmentId!)) {
      speaking.attempts++;
      if (t.exceptionReason === 'insufficient_evidence') speaking.insufficientEvidence++;
      else if (g !== 'released') speaking.notYetGraded++;
      else if (t.speaking?.assessedAs === 'written_accommodation') speaking.accommodationGraded++;
      else speaking.spokenGraded++;
    }
  }

  const episodes = await TimeToUnderstand.find({ institutionId: inst, studentId: { $in: studentIds }, gapDetectedAt: { $gte: from, $lte: to } })
    .select('objectiveId studentId status activeInstructionSeconds')
    .lean();
  const byObjective = new Map<string, { students: Set<string>; closed: Set<string>; open: Set<string>; ended: Set<string>; seconds: number[] }>();
  for (const e of episodes) {
    const o = byObjective.get(e.objectiveId) ?? { students: new Set(), closed: new Set(), open: new Set(), ended: new Set(), seconds: [] };
    o.students.add(e.studentId);
    if (e.status === 'verified') {
      o.closed.add(e.studentId);
      o.seconds.push(e.activeInstructionSeconds);
    } else if (e.status === 'in_progress') o.open.add(e.studentId);
    else o.ended.add(e.studentId);
    byObjective.set(e.objectiveId, o);
  }
  const ids = [...byObjective.keys()].sort();
  const pageIds = ids.slice((page - 1) * pageSize, page * pageSize);
  const names = new Map((await LearningObjective.find({ id: { $in: pageIds }, institutionId: inst }).select('id code title').lean()).map((o) => [o.id, o]));
  const interventions = await LearningIntervention.find({ institutionId: inst, studentId: { $in: studentIds }, createdAt: { $gte: from, $lte: to } })
    .select('objectiveId status reassessedAt outcome.improved')
    .lean();

  res.json({
    scope: { level: scope.classIds && q.classId ? 'class' : user.role === 'teacher' ? 'own_classes' : 'school', origin: view, from, to, students: studentIds.length },
    note: 'Observed measurements. "Gap closed" means an independent, unassisted reassessment verified understanding; it does not show what caused it.',
    grading,
    speaking,
    interventions: {
      total: interventions.length,
      byStatus: interventions.reduce<Record<string, number>>((m, i) => ((m[i.status] = (m[i.status] ?? 0) + 1), m), {}),
      reassessed: interventions.filter((i) => i.reassessedAt).length,
      observedImprovement: interventions.filter((i) => i.outcome?.improved).length,
    },
    objectives: {
      total: ids.length,
      page,
      pageSize,
      items: pageIds.map((id) => {
        const o = byObjective.get(id)!;
        return {
          objectiveId: id,
          code: names.get(id)?.code ?? null,
          title: names.get(id)?.title ?? null,
          studentsWithGap: o.students.size,
          gapClosed: o.closed.size,
          notYetVerified: o.open.size,
          endedUnverified: o.ended.size,
          ttuAvailable: o.seconds.length > 0,
          medianActiveSecondsToUnderstand: median(o.seconds),
        };
      }),
    },
  });
});

// GET /api/learning/students/:studentId/timeline — attempt, grading release,
// intervention and reassessment events for one student, from existing
// records. Teachers (own class students) and admins; no answers or transcripts.
export const getStudentTimeline = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  if (!['teacher', 'admin', 'enara-admin'].includes(user.role)) throw new AppError('Not allowed', 403, 'FORBIDDEN');
  if (user.role !== 'enara-admin' && !(await isFeatureEnabled(user.institutionId, 'connected_workflow_enabled'))) throw new AppError('Not found', 404, 'FEATURE_DISABLED');
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const events: { at: Date; type: string; ref: string; detail?: Record<string, unknown> }[] = [];
  const attempts = await AssessmentAttempt.find({ studentId: student.id, institutionId: student.institutionId, assignmentId: { $exists: true } })
    .select('id assignmentId assessmentTitle status gradingStatus exceptionReason startedAt submittedAt finalizedAt history speaking.mode speaking.assessedAs')
    .sort({ startedAt: -1 })
    .limit(100)
    .lean();
  for (const t of attempts) {
    events.push({ at: t.startedAt, type: 'attempt_started', ref: t.id, detail: { title: t.assessmentTitle, ...(t.speaking?.mode ? { mode: t.speaking.mode } : {}) } });
    if (t.submittedAt) events.push({ at: t.submittedAt, type: 'attempt_submitted', ref: t.id });
    if (t.gradingStatus === 'released') events.push({ at: t.finalizedAt ?? t.submittedAt ?? t.startedAt, type: 'grading_released', ref: t.id, detail: t.speaking?.assessedAs ? { assessedAs: t.speaking.assessedAs } : undefined });
    if (t.gradingStatus === 'grading_exception') events.push({ at: t.submittedAt ?? t.startedAt, type: t.exceptionReason === 'insufficient_evidence' ? 'insufficient_evidence' : 'grading_exception', ref: t.id });
  }
  const interventions = await LearningIntervention.find({ studentId: student.id, institutionId: student.institutionId }).sort({ createdAt: -1 }).limit(100).lean();
  for (const i of interventions) {
    events.push({ at: (i as unknown as { createdAt: Date }).createdAt, type: 'intervention_created', ref: i.id, detail: { objectiveId: i.objectiveId ?? null, type: i.interventionType, by: i.assignedBy } });
    if (i.completedAt) events.push({ at: i.completedAt, type: 'intervention_completed', ref: i.id });
    if (i.reassessedAt) events.push({ at: i.reassessedAt, type: 'reassessed', ref: i.id, detail: { observedImprovement: Boolean(i.outcome?.improved) } });
  }
  const episodes = await TimeToUnderstand.find({ studentId: student.id, institutionId: student.institutionId }).limit(100).lean();
  for (const e of episodes) {
    events.push({ at: e.gapDetectedAt, type: 'gap_detected', ref: e.id, detail: { objectiveId: e.objectiveId } });
    if (e.status === 'verified' && e.understandingVerifiedAt) events.push({ at: e.understandingVerifiedAt, type: 'gap_closed_verified', ref: e.id, detail: { objectiveId: e.objectiveId } });
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  res.json({ studentId: student.id, events: events.slice(0, 300) });
});
