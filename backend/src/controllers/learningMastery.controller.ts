import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningObjective } from '../models/LearningObjective';
import { MasteryHistory, StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { invalidateEvidence, recomputeMastery } from '../services/evidenceProcessor';
import { resolveStudentForRead } from '../services/learningAccess';
import { MASTERY_MODEL_VERSION } from '../services/masteryModel';
import { readyToLearn, weakPrerequisites } from '../services/objectiveGraph';
import { getVisibleCurriculumIdsForStudent } from '../services/studentCourseService';
import { ensurePlainObject, getRequiredString } from '../utils/validation';

const MET = new Set(['proficient', 'mastered']);
const GAP = new Set(['emerging', 'developing']);

function masteryView(objectiveId: string, m?: Record<string, any> | null) {
  return {
    objectiveId,
    masteryEstimate: m?.masteryEstimate ?? null,
    estimateIsHeuristic: true,
    evidenceStrength: m?.evidenceStrength ?? 'none',
    masteryStatus: m?.masteryStatus ?? 'not_assessed',
    evidenceCount: m?.evidenceCount ?? 0,
    independentEvidenceCount: m?.independentEvidenceCount ?? 0,
    needsVerification: m?.needsVerification ?? false,
    lastEvidenceAt: m?.lastEvidenceAt ?? null,
    modelVersion: m?.modelVersion ?? MASTERY_MODEL_VERSION,
  };
}

// Approved objectives in the curricula of the student's courses.
async function studentObjectives(student: { id: string; institutionId?: string }) {
  const curriculumIds = await getVisibleCurriculumIdsForStudent(student.id);
  return LearningObjective.find({ institutionId: student.institutionId, curriculumId: { $in: curriculumIds }, status: 'approved' })
    .sort({ curriculumId: 1, code: 1 })
    .lean();
}

// GET /api/learning/students/:studentId/mastery ('me' for the signed-in student)
export const getStudentMastery = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const objectives = await studentObjectives(student);
  const states = await StudentObjectiveMastery.find({ studentId: student.id, objectiveId: { $in: objectives.map((o) => o.id) } }).lean();
  const byObjective = new Map(states.map((s) => [s.objectiveId, s]));
  res.json({
    studentId: student.id,
    modelVersion: MASTERY_MODEL_VERSION,
    note: 'Mastery estimates are heuristic scores from assessment evidence, not grades or probabilities.',
    objectives: objectives.map((o) => ({
      objective: { id: o.id, code: o.code, title: o.title, translations: o.translations, curriculumId: o.curriculumId },
      ...masteryView(o.id, byObjective.get(o.id)),
    })),
  });
});

// GET /api/learning/students/:studentId/mastery/:objectiveId — with the evidence and history behind it.
export const getStudentObjectiveMastery = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const objectiveId = String(req.params.objectiveId);
  const objective = await LearningObjective.findOne({ id: objectiveId, institutionId: student.institutionId }).lean();
  if (!objective) throw new AppError('Objective not found', 404, 'OBJECTIVE_NOT_FOUND');
  const [state, evidence, history] = await Promise.all([
    StudentObjectiveMastery.findOne({ studentId: student.id, objectiveId }).lean(),
    LearningEvidence.find({ studentId: student.id, objectiveId }).sort({ occurredAt: -1 }).limit(100).lean(),
    MasteryHistory.find({ studentId: student.id, objectiveId }).sort({ at: -1 }).limit(50).lean(),
  ]);
  res.json({
    objective: { id: objective.id, code: objective.code, title: objective.title, description: objective.description, translations: objective.translations },
    ...masteryView(objectiveId, state),
    evidence: evidence.map(({ _id, history: _h, ...e }) => e),
    history: history.map(({ _id, ...h }) => h),
  });
});

// GET /api/learning/students/:studentId/knowledge-map — objectives with status,
// prerequisites, what is ready to learn, gaps and weak prerequisites.
export const getKnowledgeMap = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const objectives = await studentObjectives(student);
  const states = await StudentObjectiveMastery.find({ studentId: student.id, objectiveId: { $in: objectives.map((o) => o.id) } }).lean();
  const byObjective = new Map(states.map((s) => [s.objectiveId, s]));
  const status = (id: string) => byObjective.get(id)?.masteryStatus ?? 'not_assessed';
  const isMet = (id: string) => MET.has(status(id));
  const nodes = objectives.map((o) => ({ id: o.id, status: o.status, prerequisiteObjectiveIds: o.prerequisiteObjectiveIds }));
  const ready = new Set(readyToLearn(nodes, isMet));
  const codeOf = new Map(objectives.map((o) => [o.id, o.code]));
  // The class (course instance) each curriculum is taught in, for "take a check".
  const { getEnrolledInstances } = await import('../services/studentCourseService');
  const courseByCurriculum = new Map<string, string>();
  for (const c of await getEnrolledInstances(student.id)) if (c.curriculumId && !courseByCurriculum.has(c.curriculumId)) courseByCurriculum.set(c.curriculumId, c.id);
  res.json({
    studentId: student.id,
    modelVersion: MASTERY_MODEL_VERSION,
    objectives: objectives.map((o) => {
      const m = masteryView(o.id, byObjective.get(o.id));
      const gap = GAP.has(m.masteryStatus) && m.evidenceStrength !== 'none';
      return {
        id: o.id,
        code: o.code,
        title: o.title,
        translations: o.translations,
        curriculumId: o.curriculumId,
        courseId: courseByCurriculum.get(o.curriculumId) ?? null,
        lessonIds: o.lessonIds,
        prerequisiteObjectiveIds: o.prerequisiteObjectiveIds.filter((p) => codeOf.has(p)),
        ...m,
        readyToLearn: ready.has(o.id),
        isGap: gap,
        weakPrerequisites: gap ? weakPrerequisites(nodes, o.id, isMet).map((p) => ({ id: p.id, code: codeOf.get(p.id), depth: p.depth })) : [],
      };
    }),
  });
});

// POST /api/learning/students/:studentId/mastery/recompute — staff; rebuilds from evidence.
export const recomputeStudentMastery = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'student') throw new AppError('Staff access required', 403, 'FORBIDDEN');
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const objectiveIds = await LearningEvidence.distinct('objectiveId', { studentId: student.id });
  for (const objectiveId of objectiveIds) await recomputeMastery(student.id, objectiveId, `recompute:${req.user!.id}`, student.institutionId);
  res.json({ studentId: student.id, recomputed: objectiveIds.length, modelVersion: MASTERY_MODEL_VERSION });
});

// POST /api/learning/evidence/:id/invalidate { reason } — teachers of the student or school admins.
export const invalidateEvidenceRecord = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'student') throw new AppError('Staff access required', 403, 'FORBIDDEN');
  const body = ensurePlainObject(req.body);
  const reason = getRequiredString(body, 'reason', { max: 500 });
  const evidence = await LearningEvidence.findOne({ id: String(req.params.id) }).lean();
  if (!evidence) throw new AppError('Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
  await resolveStudentForRead(req, evidence.studentId);
  const updated = await invalidateEvidence(evidence.id, req.user!.id, reason);
  if (!updated) throw new AppError('Evidence is already invalidated', 409, 'EVIDENCE_INVALIDATED');
  res.json({ id: updated.id, invalidatedAt: updated.invalidatedAt, invalidationReason: updated.invalidationReason });
});
