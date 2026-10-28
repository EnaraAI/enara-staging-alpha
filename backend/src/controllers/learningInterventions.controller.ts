import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningIntervention, type ILearningIntervention } from '../models/LearningIntervention';
import { LearningObjective } from '../models/LearningObjective';
import { PedagogicalDecision } from '../models/PedagogicalDecision';
import { TimeToUnderstand } from '../models/TimeToUnderstand';
import { TutorSession } from '../models/TutorSession';
import { masterySnapshot } from '../services/interventions';
import { buildObjectiveContext } from '../services/learningContext';
import { resolveStudentForRead } from '../services/learningAccess';
import { STRATEGY_BY_ID } from '../services/strategyRegistry';
import { getEnrolledInstances } from '../services/studentCourseService';
import { appendTutorMessages } from '../services/tutorMessages';
import { generateMessageId } from '../utils/idGenerator';
import { ensurePlainObject, getOptionalString, getRequiredId, rejectMongoOperators } from '../utils/validation';
import { openDiagnostic } from './learningDiagnostics.controller';

const TYPES = ['ai_tutoring', 'guided_practice', 'review', 'teacher_assigned'] as const;

function toResponse(i: ILearningIntervention | Record<string, any>) {
  const plain = typeof (i as any).toObject === 'function' ? (i as any).toObject() : i;
  const { _id, ...rest } = plain;
  return { ...rest, completionIsNotMastery: true };
}

async function loadForStudentOrStaff(req: AuthRequest, id: string) {
  const intervention = await LearningIntervention.findOne({ id });
  if (!intervention) throw new AppError('Intervention not found', 404, 'INTERVENTION_NOT_FOUND');
  await resolveStudentForRead(req, intervention.studentId);
  return intervention;
}

function transition(i: ILearningIntervention, to: ILearningIntervention['status'], by: string, note?: string) {
  i.history.push({ at: new Date(), by, from: i.status, to, note });
  i.status = to;
}

// POST /api/learning/interventions
// Student: { objectiveId } starts a self-chosen AI tutoring intervention.
// Staff: { studentId, objectiveId, interventionType, strategyId?, note? } assigns one.
// Practice, tutoring and reassessment need an objective (check-ins don't have one).
function objectiveOf(i: { objectiveId?: string }) {
  if (!i.objectiveId) throw new AppError('This intervention has no learning objective', 409, 'NO_OBJECTIVE');
  return i.objectiveId;
}

export const createIntervention = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const isStudent = req.user!.role === 'student';
  const student = await resolveStudentForRead(req, isStudent ? 'me' : getRequiredId(body, 'studentId'));
  const objectiveId = getRequiredId(body, 'objectiveId');
  const objective = await LearningObjective.findOne({ id: objectiveId, institutionId: student.institutionId, status: 'approved' }).lean();
  if (!objective) throw new AppError('Objective not found', 404, 'OBJECTIVE_NOT_FOUND');
  const course = (await getEnrolledInstances(student.id)).find((c) => c.curriculumId === objective.curriculumId);
  if (!course) throw new AppError('The student is not in a course using this objective', 400, 'VALIDATION_ERROR');

  const interventionType = isStudent ? 'ai_tutoring' : (body.interventionType ?? 'teacher_assigned');
  if (!(TYPES as readonly unknown[]).includes(interventionType)) throw new AppError('interventionType is invalid', 400, 'VALIDATION_ERROR');
  const strategyId = isStudent ? undefined : getOptionalString(body, 'strategyId', { max: 60 });
  if (strategyId && !STRATEGY_BY_ID.has(strategyId)) throw new AppError('Unknown strategyId', 400, 'VALIDATION_ERROR');

  const evidence = await LearningEvidence.find({ studentId: student.id, objectiveId, result: 'incorrect', invalidatedAt: { $exists: false } })
    .sort({ occurredAt: -1 })
    .limit(10)
    .select('id')
    .lean();
  try {
    const intervention = await LearningIntervention.create({
      id: `int-${randomUUID()}`,
      institutionId: student.institutionId,
      studentId: student.id,
      objectiveId,
      courseId: course.id,
      interventionType,
      strategyId,
      status: 'assigned',
      assignedBy: isStudent ? 'student' : 'teacher',
      assignedByUserId: req.user!.id,
      note: isStudent ? undefined : getOptionalString(body, 'note', { max: 1000 }),
      sourceEvidenceIds: evidence.map((e) => e.id),
      history: [{ at: new Date(), by: req.user!.id, to: 'assigned' }],
    });
    res.status(201).json(toResponse(intervention));
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const existing = await LearningIntervention.findOne({ studentId: student.id, objectiveId, status: { $in: ['recommended', 'assigned', 'in_progress'] } }).lean();
    throw new AppError(`There is already an active intervention for this objective (${existing?.id})`, 409, 'INTERVENTION_ACTIVE');
  }
});

// POST /api/learning/interventions/:id/start — the student starts it. Tutoring
// types open a tutor chat focused on the objective with the chosen strategy.
export const startIntervention = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'student') throw new AppError('Only the student can start an intervention', 403, 'FORBIDDEN');
  const i = await loadForStudentOrStaff(req, String(req.params.id));
  if (!['recommended', 'assigned', 'in_progress'].includes(i.status)) throw new AppError('This intervention has finished', 409, 'INTERVENTION_FINISHED');

  const objectiveId = objectiveOf(i);
  let tutorSessionId = i.tutorSessionIds[i.tutorSessionIds.length - 1];
  if (i.status !== 'in_progress') {
    i.baseline = await masterySnapshot(i.studentId, objectiveId);
    i.startedAt = new Date();
    transition(i, 'in_progress', req.user!.id);
  }
  if (!tutorSessionId && i.interventionType !== 'review') {
    const objective = await LearningObjective.findOne({ id: i.objectiveId }).select('code title').lean();
    const session = await TutorSession.create({
      id: `tutor-${randomUUID()}`,
      studentId: i.studentId,
      institutionId: i.institutionId,
      title: `Practice: ${objective?.code} ${objective?.title ?? ''}`.trim().slice(0, 80),
      courseId: i.courseId,
      objectiveId: i.objectiveId,
      interventionId: i.id,
      teachingMethod: 'socratic',
      messageCount: 1,
      lastMessageAt: new Date(),
    });
    await appendTutorMessages(session, [
      {
        id: generateMessageId(),
        role: 'ai',
        text: `Let's work on "${objective?.title}". Tell me what you already know about it, or ask me anything.`,
        timestamp: new Date(),
      },
    ]);
    tutorSessionId = session.id;
    i.tutorSessionIds.push(session.id);
  }
  await i.save();
  const focus = await buildObjectiveContext({
    institutionId: i.institutionId,
    studentId: i.studentId,
    objectiveId,
    interventionId: i.id,
    tutorSessionId,
    record: true,
  });
  res.json({
    intervention: toResponse(i),
    tutorSessionId: tutorSessionId ?? null,
    strategy: focus ? { id: focus.decision.strategyId, reasonCodes: focus.decision.reasonCodes, targetObjectiveId: focus.decision.targetObjectiveId } : null,
  });
});

// POST /api/learning/interventions/:id/complete — finishing the activity. Does
// not change mastery: an independent reassessment is still needed.
export const completeIntervention = asyncHandler(async (req: AuthRequest, res: Response) => {
  const i = await loadForStudentOrStaff(req, String(req.params.id));
  if (i.status === 'completed') {
    res.json({ intervention: toResponse(i), reassessmentRecommended: !i.reassessmentDiagnosticId });
    return;
  }
  if (i.status === 'cancelled') throw new AppError('This intervention was cancelled', 409, 'INTERVENTION_FINISHED');
  i.completedAt = new Date();
  transition(i, 'completed', req.user!.id, getOptionalString(ensurePlainObject(req.body ?? {}), 'note', { max: 500 }));
  await i.save();
  res.json({ intervention: toResponse(i), reassessmentRecommended: true });
});

// POST /api/learning/interventions/:id/cancel
export const cancelIntervention = asyncHandler(async (req: AuthRequest, res: Response) => {
  const i = await loadForStudentOrStaff(req, String(req.params.id));
  if (req.user!.role === 'student' && i.assignedBy === 'teacher') throw new AppError('Your teacher assigned this; ask them to cancel it', 403, 'FORBIDDEN');
  if (['completed', 'cancelled'].includes(i.status)) throw new AppError('This intervention has finished', 409, 'INTERVENTION_FINISHED');
  transition(i, 'cancelled', req.user!.id, getOptionalString(ensurePlainObject(req.body ?? {}), 'note', { max: 500 }));
  await i.save();
  res.json(toResponse(i));
});

// POST /api/learning/interventions/:id/reassess — the student takes an
// independent quick check on the objective; its result is the outcome.
export const reassessIntervention = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'student') throw new AppError('Only the student can take the reassessment', 403, 'FORBIDDEN');
  const i = await loadForStudentOrStaff(req, String(req.params.id));
  if (!['in_progress', 'completed'].includes(i.status)) throw new AppError('Start the intervention first', 409, 'INTERVENTION_NOT_STARTED');
  const objectiveId = objectiveOf(i);
  const { session, resumed } = await openDiagnostic({ studentId: i.studentId, courseId: i.courseId!, objectiveIds: [objectiveId], maxQuestions: 4 });
  if (i.reassessmentDiagnosticId !== session.id) {
    i.reassessmentDiagnosticId = session.id;
    if (!i.baseline) i.baseline = await masterySnapshot(i.studentId, objectiveId);
    i.history.push({ at: new Date(), by: req.user!.id, to: i.status, note: `reassessment ${session.id}` });
    await i.save();
  }
  res.status(resumed ? 200 : 201).json({ interventionId: i.id, diagnosticId: session.id, resumed });
});

// GET /api/learning/students/:studentId/interventions
export const listStudentInterventions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const items = await LearningIntervention.find({ studentId: student.id }).sort({ updatedAt: -1 }).limit(100).lean();
  const objectives = new Map(
    (await LearningObjective.find({ id: { $in: items.map((i) => i.objectiveId).filter(Boolean) } }).select('id code title').lean()).map((o) => [o.id, o]),
  );
  res.json({
    interventions: items.map((i) => {
      const o = i.objectiveId ? objectives.get(i.objectiveId) : undefined;
      return { ...toResponse(i), objective: o ? { id: o.id, code: o.code, title: o.title } : i.objectiveId ? { id: i.objectiveId } : null };
    }),
  });
});

// GET /api/learning/interventions/:id/outcomes — baseline, reassessment outcome,
// strategy decisions and the time-to-understand episode for this objective.
export const getInterventionOutcomes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const i = await loadForStudentOrStaff(req, String(req.params.id));
  const [decisions, ttu] = await Promise.all([
    PedagogicalDecision.find({ interventionId: i.id }).sort({ at: 1 }).lean(),
    TimeToUnderstand.findOne({ studentId: i.studentId, objectiveId: i.objectiveId }).sort({ gapDetectedAt: -1 }).lean(),
  ]);
  res.json({
    intervention: toResponse(i),
    baseline: i.baseline ?? null,
    outcome: i.outcome ?? null,
    note: 'Before/after comparison of one student; it does not show the intervention caused the change.',
    decisions: decisions.map(({ _id, ...d }) => d),
    timeToUnderstand: ttu
      ? { status: ttu.status, activeInstructionMinutes: Math.round(ttu.activeInstructionSeconds / 6) / 10, gapDetectedAt: ttu.gapDetectedAt, understandingVerifiedAt: ttu.understandingVerifiedAt ?? null }
      : null,
  });
});
