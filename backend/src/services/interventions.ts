import { LearningIntervention } from '../models/LearningIntervention';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';

const RANK: Record<string, number> = { not_assessed: 0, emerging: 1, developing: 2, proficient: 3, mastered: 4 };

export async function masterySnapshot(studentId: string, objectiveId: string) {
  const m = await StudentObjectiveMastery.findOne({ studentId, objectiveId }).lean();
  return {
    masteryStatus: m?.masteryStatus ?? 'not_assessed',
    masteryEstimate: m?.masteryEstimate ?? null,
    evidenceStrength: m?.evidenceStrength ?? 'none',
    at: new Date(),
  };
}

// When a reassessment diagnostic finishes, the intervention records mastery
// after it. "improved" compares status ranks before and after; it describes
// what happened, not why (no causal claim).
export async function recordReassessmentOutcome(diagnosticId: string) {
  const intervention = await LearningIntervention.findOne({ reassessmentDiagnosticId: diagnosticId, outcome: { $exists: false } });
  if (!intervention?.objectiveId) return;
  const after = await masterySnapshot(intervention.studentId, intervention.objectiveId);
  const before = intervention.baseline?.masteryStatus ?? 'not_assessed';
  intervention.outcome = { ...after, improved: (RANK[after.masteryStatus] ?? 0) > (RANK[before] ?? 0) };
  intervention.reassessedAt = new Date();
  intervention.history.push({ at: new Date(), to: intervention.status, note: `reassessed: ${before} → ${after.masteryStatus}` });
  await intervention.save();
}
