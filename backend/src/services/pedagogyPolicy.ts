// Chooses a teaching strategy for one student and objective (ped-v1).
// Explainable rules, treated as hypotheses to validate, not pedagogical laws.
//
// In order:
// 1. A teacher-assigned strategy on the active intervention wins (TEACHER_ASSIGNED).
// 2. A weak prerequisite -> prerequisite_remediation on that prerequisite (PREREQUISITE_GAP).
// 3. A suspected/confirmed misconception:
//    conceptual_misunderstanding -> analogy, or visual_explanation if analogy was used last;
//    procedural_error / calculation_error -> worked_example, then guided_practice;
//    misinterpretation / incomplete_reasoning -> error_analysis.
// 4. By mastery status: not_assessed -> socratic_questioning (NO_EVIDENCE);
//    emerging -> direct_instruction, then worked_example;
//    developing -> guided_practice, then scaffolding;
//    proficient -> independent_practice (VERIFY_INDEPENDENTLY);
//    mastered -> retrieval_practice (MAINTAIN).
// "then" means: if the previous decision for this objective used the first
// strategy and new evidence has arrived since (it was tried and the need
// remains), try the second (STRATEGY_CHANGED).
// requiresReassessment is true unless the objective is mastered.

export const PEDAGOGY_DECISION_VERSION = 'ped-v1';

export interface PedagogyInput {
  objectiveId: string;
  masteryStatus: string;
  evidenceStrength: string;
  weakPrerequisiteIds: string[];
  misconceptions: { id: string; category: string }[];
  supportingEvidenceIds: string[];
  previousStrategyId?: string;
  teacherStrategyId?: string;
}

export interface PedagogicalDecisionResult {
  strategyId: string;
  targetObjectiveId: string;
  reasonCodes: string[];
  supportingEvidenceIds: string[];
  decisionVersion: string;
  requiresReassessment: boolean;
}

export function selectStrategy(input: PedagogyInput): PedagogicalDecisionResult {
  const base = { decisionVersion: PEDAGOGY_DECISION_VERSION, supportingEvidenceIds: input.supportingEvidenceIds };
  const pick = (first: string, second: string | undefined, reason: string) => {
    if (second && input.previousStrategyId === first) return { strategyId: second, reasonCodes: [reason, 'STRATEGY_CHANGED'] };
    return { strategyId: first, reasonCodes: [reason] };
  };
  const requiresReassessment = input.masteryStatus !== 'mastered';

  if (input.teacherStrategyId) {
    return { ...base, strategyId: input.teacherStrategyId, targetObjectiveId: input.objectiveId, reasonCodes: ['TEACHER_ASSIGNED'], requiresReassessment };
  }
  if (input.weakPrerequisiteIds.length) {
    return {
      ...base,
      strategyId: 'prerequisite_remediation',
      targetObjectiveId: input.weakPrerequisiteIds[0],
      reasonCodes: ['PREREQUISITE_GAP'],
      requiresReassessment: true,
    };
  }
  const categories = new Set(input.misconceptions.map((m) => m.category));
  let choice: { strategyId: string; reasonCodes: string[] } | undefined;
  if (categories.has('conceptual_misunderstanding')) choice = pick('analogy', 'visual_explanation', 'CONCEPTUAL_MISCONCEPTION');
  else if (categories.has('procedural_error') || categories.has('calculation_error')) choice = pick('worked_example', 'guided_practice', 'PROCEDURAL_ERROR');
  else if (categories.has('misinterpretation') || categories.has('incomplete_reasoning')) choice = pick('error_analysis', undefined, 'MISINTERPRETATION');
  if (!choice) {
    switch (input.masteryStatus) {
      case 'emerging':
        choice = pick('direct_instruction', 'worked_example', 'EMERGING');
        break;
      case 'developing':
        choice = pick('guided_practice', 'scaffolding', 'DEVELOPING');
        break;
      case 'proficient':
        choice = { strategyId: 'independent_practice', reasonCodes: ['VERIFY_INDEPENDENTLY'] };
        break;
      case 'mastered':
        choice = { strategyId: 'retrieval_practice', reasonCodes: ['MAINTAIN'] };
        break;
      default:
        choice = { strategyId: 'socratic_questioning', reasonCodes: ['NO_EVIDENCE'] };
    }
  }
  return { ...base, ...choice, targetObjectiveId: input.objectiveId, requiresReassessment };
}
