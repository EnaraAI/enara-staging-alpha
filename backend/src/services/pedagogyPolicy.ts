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

import { REGISTRY_VERSION, STRATEGY_BY_ID, validateComposition, type MethodComposition, type SwitchSignal } from './strategyRegistry';

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

// ---------------------------------------------------------------------------
// ped-v2 (P21): a teaching plan = primary method + compatible supporting methods
// + optional reinforcement + modifiers, from the registry v2 (23 guide methods).
// Deterministic; no AI call. Seeded from the guide's method-selection matrix and
// ENARA's evidence. Methods switch only on new learner evidence (never on a turn
// count): a previous plan is changed when evidence arrived since it was chosen
// and the objective did not improve, or when mastery was reached or retention
// failed. ped-v1 (selectStrategy above) is unchanged for existing callers.


export const PEDAGOGY_PLAN_VERSION = 'ped-v2';
const RANK: Record<string, number> = { not_assessed: 0, emerging: 1, developing: 2, proficient: 3, mastered: 4 };

export interface PlanInput {
  objectiveId: string;
  masteryStatus: string;
  masteryEstimate?: number | null;
  evidenceStrength: string;
  weakPrerequisiteIds: string[];
  misconceptions: { id: string; category: string; status?: string }[];
  supportingEvidenceIds: string[];
  // Independent assessed results on the objective, newest first.
  recentResults: string[];
  retention?: { due: boolean; lapsed: boolean };
  // Recall right but application/analysis wrong (needs cognitiveLevel on questions).
  applicationGap?: boolean;
  previous?: { primary: string; newEvidenceSince: boolean; improved?: boolean };
  // Primary methods already used on this objective without improvement.
  triedWithoutImprovement: string[];
  teacherStrategyId?: string;
  gradeLevel?: number;
  disengaged?: boolean;
  availableMinutes?: number;
  relatedSecureObjectives?: number;
  // Subject name (from the assessed questions or the curriculum), classified by
  // subjectProfile into procedural / discussion / applied (P21 follow-up).
  subject?: string;
}

// Kind of subject, from its name (English and Arabic keywords). A heuristic:
// it only decides which of the guide's methods fit (Socratic and case work for
// discussion subjects, problem-based work for applied sciences, interleaving for
// procedural skills), and an unknown subject changes nothing.
export type SubjectProfile = 'procedural' | 'discussion' | 'applied' | 'unknown';
export function subjectProfile(subject?: string): SubjectProfile {
  const s = (subject ?? '').toLowerCase();
  if (!s.trim()) return 'unknown';
  if (/math|algebra|geometr|arithmetic|calculus|statistic|physic|chemi|cod(e|ing)|computer|programming|grammar|accounting|رياضيات|جبر|هندسة|فيزياء|كيمياء|برمجة|قواعد|نحو/.test(s)) return 'procedural';
  if (/histor|literat|ethic|philosoph|social|civic|religio|islamic|econom|geograph|politic|law|citizenship|reading|تاريخ|أدب|ادب|فلسفة|أخلاق|اجتماع|دراسات|تربية دينية|دين|اقتصاد|جغرافيا|قانون|مواطنة|قراءة/.test(s)) return 'discussion';
  if (/biolog|science|health|medic|environment|engineer|business|technolog|agricultur|علوم|أحياء|احياء|صحة|بيئة|هندسية|أعمال|تكنولوجيا|زراعة/.test(s)) return 'applied';
  return 'unknown';
}

export interface TeachingPlan extends MethodComposition {
  strategyId: string; // = primary (ped-v1 compatible field)
  targetObjectiveId: string;
  gap: string;
  reasonCodes: string[];
  supportingEvidenceIds: string[];
  expectedOutcome: string;
  switchWhen: string;
  confidence: 'low' | 'medium' | 'high';
  limitations: string[];
  requiresReassessment: boolean;
  decisionVersion: string;
  registryVersion: string;
}

const BASE_MODIFIERS = ['adaptive_pathways', 'differentiated_instruction', 'formative_feedback'];

export function selectTeachingPlan(input: PlanInput): TeachingPlan {
  const status = input.masteryStatus ?? 'not_assessed';
  const novice = RANK[status] <= 1;
  const profile = subjectProfile(input.subject);
  const reasons: string[] = [];
  const limitations: string[] = [];
  let target = input.objectiveId;
  let gap = '';
  let c: MethodComposition = { primary: 'formative_feedback', supporting: [], modifiers: [] };
  const set = (primary: string, supporting: string[] = [], reinforcement?: string) => {
    c = { primary, supporting, reinforcement, modifiers: [] };
  };
  const usable = (id: string) =>
    !input.triedWithoutImprovement.includes(id) &&
    (input.gradeLevel === undefined || (STRATEGY_BY_ID.get(id)?.minGrade ?? 0) <= input.gradeLevel) &&
    !(novice && STRATEGY_BY_ID.get(id)?.withholdsAnswer);
  const switchFrom = (from: string, signal: SwitchSignal) => STRATEGY_BY_ID.get(from)?.switchWhen?.find((w) => w.signal === signal && usable(w.to))?.to;
  const last2Wrong = input.recentResults.slice(0, 2).length === 2 && input.recentResults.slice(0, 2).every((r) => r === 'incorrect');

  if (input.teacherStrategyId && STRATEGY_BY_ID.get(input.teacherStrategyId)?.roles?.includes('primary')) {
    set(input.teacherStrategyId);
    reasons.push('TEACHER_ASSIGNED');
    gap = 'Teacher-assigned approach.';
  } else if (input.weakPrerequisiteIds.length) {
    target = input.weakPrerequisiteIds[0];
    set('prerequisite_remediation', novice ? ['worked_example'] : []);
    reasons.push('PREREQUISITE_GAP');
    gap = 'A prerequisite objective is not secure yet.';
  } else if (input.retention?.lapsed && RANK[status] >= 2) {
    set('retrieval_practice', [], 'spaced_repetition');
    reasons.push('RETENTION_DECAY');
    gap = 'Previously secure, but a later retrieval failed.';
  } else {
    // Evidence-based switching from the previous plan for this objective.
    const prev = input.previous;
    let switched: string | undefined;
    if (prev?.newEvidenceSince) {
      if (RANK[status] >= 4 && prev.primary !== 'retrieval_practice') switched = switchFrom(prev.primary, 'mastery_reached');
      else if (prev.improved === false) switched = switchFrom(prev.primary, last2Wrong ? 'repeated_errors' : 'no_improvement_after_new_evidence') ?? switchFrom(prev.primary, 'no_improvement_after_new_evidence');
    }
    const categories = new Set(input.misconceptions.map((m) => m.category));
    const persistent = input.misconceptions.some((m) => m.status === 'confirmed') && input.triedWithoutImprovement.length >= 1;
    if (switched) {
      set(switched);
      reasons.push('STRATEGY_CHANGED', RANK[status] >= 4 ? 'MASTERY_REACHED' : last2Wrong ? 'REPEATED_ERRORS' : 'NO_IMPROVEMENT');
      gap = `Previous approach (${prev!.primary}) did not move the evidence.`;
    } else if (persistent) {
      set('metacognitive', ['think_aloud']);
      reasons.push('PERSISTENT_MISCONCEPTION');
      gap = 'A confirmed misconception persists after a change of approach.';
    } else if (categories.has('conceptual_misunderstanding')) {
      set(usable('analogy') ? 'analogy' : 'visual_explanation', [novice ? 'worked_example' : 'elaborative_interrogation']);
      reasons.push('CONCEPTUAL_MISCONCEPTION');
      gap = 'Possible conceptual misunderstanding.';
    } else if (categories.has('procedural_error') || categories.has('calculation_error')) {
      set(usable('worked_example') ? 'worked_example' : 'guided_practice', ['think_aloud'], novice ? undefined : 'guided_practice');
      reasons.push('PROCEDURAL_ERROR');
      gap = 'Procedural or calculation errors.';
    } else if (categories.has('misinterpretation') || categories.has('incomplete_reasoning')) {
      set('error_analysis', ['think_aloud']);
      reasons.push('MISINTERPRETATION');
      gap = 'Misreads the task or reasoning is incomplete.';
    } else if (input.applicationGap && RANK[status] >= 2) {
      set('blooms_guided', usable('inquiry_based') ? ['inquiry_based'] : []);
      reasons.push('APPLICATION_GAP');
      gap = 'Recall is right but application is not.';
    } else {
      switch (status) {
        case 'emerging':
          set('direct_instruction', ['worked_example']);
          reasons.push('EMERGING');
          gap = 'Little understanding shown so far.';
          break;
        case 'developing':
          set('scaffolding', ['metacognitive'], 'guided_practice');
          reasons.push('DEVELOPING');
          gap = 'Partly understood.';
          break;
        case 'proficient': {
          const related = input.relatedSecureObjectives ?? 0;
          if (profile === 'discussion' && input.gradeLevel !== undefined && usable('socratic_questioning')) {
            // Guide matrix: understands, needs deeper thinking -> Socratic + Elaborative.
            set('socratic_questioning', ['elaborative_interrogation'], related >= 2 ? 'concept_mapping' : undefined);
            reasons.push('DEEPEN_REASONING');
            gap = 'Mostly secure; reasoning needs to go deeper.';
          } else {
            // Procedural skills interleave; other subjects consolidate as a concept map.
            const reinforce = related >= 1 ? (profile === 'procedural' || profile === 'unknown' ? 'interleaving' : related >= 2 ? 'concept_mapping' : 'retrieval_practice') : 'retrieval_practice';
            set('mastery_learning', ['elaborative_interrogation'], reinforce);
            reasons.push('VERIFY_TO_MASTERY');
            gap = 'Mostly secure; needs consistent independent success.';
          }
          break;
        }
        case 'mastered': {
          const related = input.relatedSecureObjectives ?? 0;
          if (input.retention?.due) {
            set('retrieval_practice', [], 'spaced_repetition');
            reasons.push('REVIEW_DUE');
            gap = 'Mastered; a review is due.';
          } else if (profile === 'discussion' && input.gradeLevel !== undefined && usable('case_based')) {
            // Guide matrix: judgment and professional reasoning -> Case-Based + Socratic.
            set('case_based', ['socratic_questioning']);
            reasons.push('EXTEND_JUDGMENT');
            gap = 'Mastered; extend to judgment in realistic cases.';
          } else if (profile === 'applied' && input.gradeLevel !== undefined && usable('problem_based')) {
            // Guide matrix: complex, multi-session challenge -> Problem-Based (+ differentiation).
            set('problem_based', []);
            reasons.push('EXTEND_APPLICATION');
            gap = 'Mastered; extend to an open, realistic problem.';
          } else {
            set('retrieval_practice', [], related >= 3 ? 'concept_mapping' : 'spaced_repetition');
            reasons.push(related >= 3 ? 'CONSOLIDATE_UNIT' : 'MAINTAIN');
            gap = 'Mastered; maintain and connect.';
          }
          break;
        }
        default:
          set('formative_feedback', ['retrieval_practice']);
          reasons.push('NO_EVIDENCE');
          gap = 'No assessed evidence yet: find the starting point first.';
      }
    }
  }

  // Engagement: only on a recorded signal (inactivity), never by default.
  if (input.disengaged) {
    const extra = (input.gradeLevel ?? 99) <= 8 && ['retrieval_practice', 'guided_practice', 'mastery_learning', 'independent_practice'].includes(c.primary) ? 'gamification' : 'narrative_contextual';
    if (c.supporting.length < 2) c.supporting.push(extra);
    reasons.push('DISENGAGED');
  }
  // Modifiers: always adaptive pathways (this plan), differentiation and the
  // formative feedback policy; Bloom's guidance once the objective is secure.
  c.modifiers = BASE_MODIFIERS.filter((m) => m !== c.primary);
  if (RANK[status] >= 3 && c.primary !== 'blooms_guided') c.modifiers.push('blooms_guided');
  // Short sessions: keep the plan small.
  if (input.availableMinutes !== undefined && input.availableMinutes < 10) {
    c.supporting = c.supporting.slice(0, 1);
    c.reinforcement = undefined;
    reasons.push('SHORT_SESSION');
  }
  // Drop ineligible or contradictory supporting/reinforcement methods (never the primary).
  c.supporting = c.supporting.filter((id) => id !== c.primary && (input.gradeLevel === undefined || (STRATEGY_BY_ID.get(id)?.minGrade ?? 0) <= input.gradeLevel));
  if (c.reinforcement && input.gradeLevel !== undefined && (STRATEGY_BY_ID.get(c.reinforcement)?.minGrade ?? 0) > input.gradeLevel) c.reinforcement = undefined;
  for (let guard = 0; guard < 4 && validateComposition(c).length; guard++) {
    if (c.reinforcement && validateComposition({ ...c, supporting: [] }).length === 0 && validateComposition({ ...c, reinforcement: undefined }).length) c.reinforcement = undefined;
    else if (c.supporting.length) c.supporting.pop();
    else c.reinforcement = undefined;
  }

  if (input.evidenceStrength === 'none' || !input.supportingEvidenceIds.length) limitations.push('No assessed evidence on this objective yet.');
  if (input.misconceptions.some((m) => m.status !== 'confirmed')) limitations.push('Misconceptions are suspected, not confirmed.');
  if (input.gradeLevel === undefined) limitations.push('Grade level unknown: no grade-based eligibility applied.');
  if (input.applicationGap === undefined) limitations.push('Cognitive level of assessed questions unknown.');
  if (profile === 'unknown') limitations.push('Subject type unknown: subject-specific methods not considered.');
  else limitations.push(`Subject type (${profile}) inferred from the subject name.`);
  if (input.previous && input.previous.improved === undefined) limitations.push('Effect of the previous approach could not be measured.');
  const confidence: TeachingPlan['confidence'] =
    input.evidenceStrength === 'substantial' ? 'high' : input.evidenceStrength === 'moderate' ? 'medium' : 'low';
  const primary = STRATEGY_BY_ID.get(c.primary)!;
  return {
    ...c,
    strategyId: c.primary,
    targetObjectiveId: target,
    gap,
    reasonCodes: reasons,
    supportingEvidenceIds: input.supportingEvidenceIds,
    expectedOutcome: primary.successCriteria,
    switchWhen: (primary.switchWhen ?? []).map((w) => `${w.signal} -> ${w.to}`).join('; ') || 'teacher or evidence change',
    confidence,
    limitations,
    requiresReassessment: status !== 'mastered',
    decisionVersion: PEDAGOGY_PLAN_VERSION,
    registryVersion: REGISTRY_VERSION,
  };
}
