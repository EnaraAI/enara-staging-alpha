import { Assessment } from '../models/Assessment';
import { LearningObjective } from '../models/LearningObjective';

// Which approved learning objectives a lesson or review question belongs to.
// Only links a person made (objective lessonIds, question objectiveIds) count;
// nothing is inferred.

export async function lessonObjectiveIds(institutionId: string | undefined, curriculumId: string | undefined, lessonId: string) {
  if (!institutionId || !curriculumId) return [];
  const objectives = await LearningObjective.find({ institutionId, curriculumId, lessonIds: lessonId, status: 'approved' })
    .select('id')
    .lean();
  return objectives.map((o) => o.id);
}

// Review items are keyed `assessmentId:questionId`.
export async function reviewItemObjectiveIds(sourceKey: string, institutionId: string | undefined) {
  const [assessmentId, questionId] = sourceKey.split(':');
  if (!assessmentId || !questionId) return [];
  const assessment = await Assessment.findOne({ id: assessmentId, ...(institutionId ? { institutionId } : {}) })
    .select('questions.id questions.objectiveIds')
    .lean();
  return assessment?.questions.find((q) => q.id === questionId)?.objectiveIds || [];
}

// Applies a question-objective link change to answers already recorded for those
// questions: linked answers get the objective and are queued for evidence;
// unlinked ones lose it and their evidence for that objective is invalidated
// (kept, with the reason). Returns counts.
export async function relinkQuestionEvents(
  objectiveId: string,
  added: [string, string][],
  removed: [string, string][],
  by: string,
  institutionId: string,
) {
  const { LearningEvent } = await import('../models/LearningEvent');
  const { LearningEvidence } = await import('../models/LearningEvidence');
  const { invalidateEvidence, processPendingEvidence } = await import('./evidenceProcessor');
  const match = (pairs: [string, string][]) => ({
    type: 'question_answered',
    $or: pairs.map(([assessmentId, questionId]) => ({ 'refs.assessmentId': assessmentId, 'refs.questionId': questionId })),
  });
  let eventsLinked = 0;
  let evidenceInvalidated = 0;
  if (added.length) {
    const r = await LearningEvent.updateMany(
      { ...match(added), objectiveIds: { $ne: objectiveId }, supersededBy: { $exists: false } },
      { $addToSet: { objectiveIds: objectiveId } },
    );
    eventsLinked = r.modifiedCount;
    // Verified graded answers that were processed before get processed again for the new objective.
    await LearningEvent.updateMany(
      { ...match(added), verified: true, gradedBy: 'rule', 'processing.evidence': 'done', supersededBy: { $exists: false } },
      { $set: { 'processing.evidence': 'pending', 'processing.attempts': 0 } },
    );
    await processPendingEvidence({ institutionId, limit: 2000 });
  }
  if (removed.length) {
    const events = await LearningEvent.find(match(removed)).select('id').lean();
    await LearningEvent.updateMany(match(removed), { $pull: { objectiveIds: objectiveId } });
    const evidence = await LearningEvidence.find({
      sourceEventId: { $in: events.map((e) => e.id) },
      objectiveId,
      invalidatedAt: { $exists: false },
    }).select('id').lean();
    for (const e of evidence) if (await invalidateEvidence(e.id, by, 'question unlinked from objective')) evidenceInvalidated += 1;
  }
  return { pastAnswersLinked: eventsLinked, evidenceInvalidated };
}
