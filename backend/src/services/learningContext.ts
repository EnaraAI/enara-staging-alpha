import { randomUUID } from 'crypto';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningObjective } from '../models/LearningObjective';
import { PedagogicalDecision } from '../models/PedagogicalDecision';
import { StudentMisconception } from '../models/StudentMisconception';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { logger, serializeError } from '../utils/logging';
import { isFeatureEnabled, isShadowMode } from './featureFlags';
import { selectStrategy, type PedagogicalDecisionResult } from './pedagogyPolicy';
import { STRATEGY_BY_ID } from './strategyRegistry';

const MET = new Set(['proficient', 'mastered']);
const STATUS_WORDS: Record<string, string> = {
  not_assessed: 'not assessed yet',
  emerging: 'emerging (little understanding shown so far)',
  developing: 'developing (partly understood)',
  proficient: 'proficient (mostly secure)',
  mastered: 'mastered',
};

export interface ObjectiveContext {
  decision: PedagogicalDecisionResult & { id?: string };
  prompt: string;
}

// Builds the tutor context for one student and objective: the target, a short
// evidence summary, possible misconceptions (labelled as possibilities), weak
// prerequisites and the chosen strategy. Only what the turn needs; no history
// dump. Returns null when adaptive pedagogy is off for the school or anything
// fails, so ordinary tutoring carries on without it.
export async function buildObjectiveContext(params: {
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  interventionId?: string;
  tutorSessionId?: string;
  teacherStrategyId?: string;
  // Record the decision (when it differs from the last one for this session).
  record?: boolean;
}): Promise<ObjectiveContext | null> {
  try {
    if (!(await isFeatureEnabled(params.institutionId, 'adaptive_pedagogy_enabled'))) return null;
    // Shadow mode: the student's tutoring stays unchanged.
    if (await isShadowMode(params.institutionId)) return null;
    // A teacher-assigned intervention's strategy takes priority.
    let teacherStrategyId = params.teacherStrategyId;
    if (!teacherStrategyId && params.interventionId) {
      const { LearningIntervention } = await import('../models/LearningIntervention');
      const intervention = await LearningIntervention.findOne({ id: params.interventionId, studentId: params.studentId }).lean();
      if (intervention?.assignedBy === 'teacher' && intervention.strategyId) teacherStrategyId = intervention.strategyId;
    }
    const objective = await LearningObjective.findOne({ id: params.objectiveId, institutionId: params.institutionId, status: 'approved' }).lean();
    if (!objective) return null;
    const ids = [objective.id, ...objective.prerequisiteObjectiveIds];
    const [states, prereqs, misconceptions, recentEvidence, previous] = await Promise.all([
      StudentObjectiveMastery.find({ studentId: params.studentId, objectiveId: { $in: ids } }).lean(),
      LearningObjective.find({ id: { $in: objective.prerequisiteObjectiveIds }, status: 'approved' }).select('id code title').lean(),
      StudentMisconception.find({ studentId: params.studentId, objectiveId: objective.id, status: { $in: ['suspected', 'confirmed'] } }).lean(),
      LearningEvidence.find({ studentId: params.studentId, objectiveId: objective.id, invalidatedAt: { $exists: false } })
        .sort({ occurredAt: -1 })
        .limit(5)
        .select('id result evidenceType')
        .lean(),
      PedagogicalDecision.findOne({ studentId: params.studentId, objectiveId: objective.id }).sort({ at: -1 }).lean(),
    ]);
    const stateOf = new Map(states.map((s) => [s.objectiveId, s]));
    const mine = stateOf.get(objective.id);
    const weak = prereqs.filter((p) => !MET.has(stateOf.get(p.id)?.masteryStatus ?? 'not_assessed') && (stateOf.get(p.id)?.evidenceCount ?? 0) > 0);

    // A previous strategy counts as tried only once new evidence has come in
    // since it was chosen; otherwise keep it rather than switching every turn.
    const tried =
      previous && (await LearningEvidence.exists({ studentId: params.studentId, objectiveId: objective.id, occurredAt: { $gt: previous.at } }));
    const decision = selectStrategy({
      objectiveId: objective.id,
      masteryStatus: mine?.masteryStatus ?? 'not_assessed',
      evidenceStrength: mine?.evidenceStrength ?? 'none',
      weakPrerequisiteIds: weak.map((w) => w.id),
      misconceptions: misconceptions.map((m) => ({ id: m.id, category: m.category })),
      supportingEvidenceIds: recentEvidence.map((e) => e.id),
      previousStrategyId: tried ? previous!.strategyId : undefined,
      teacherStrategyId,
    });
    const strategy = STRATEGY_BY_ID.get(decision.strategyId) ?? STRATEGY_BY_ID.get('socratic_questioning')!;
    const target = decision.targetObjectiveId === objective.id ? objective : weak.find((w) => w.id === decision.targetObjectiveId);

    let id: string | undefined;
    if (params.record) {
      const lastForSession = params.tutorSessionId
        ? await PedagogicalDecision.findOne({ tutorSessionId: params.tutorSessionId }).sort({ at: -1 }).lean()
        : null;
      if (!lastForSession || lastForSession.strategyId !== decision.strategyId) {
        id = `pd-${randomUUID()}`;
        await PedagogicalDecision.create({
          id,
          institutionId: params.institutionId,
          studentId: params.studentId,
          objectiveId: objective.id,
          targetObjectiveId: decision.targetObjectiveId,
          strategyId: strategy.id,
          strategyVersion: strategy.version,
          previousStrategyId: previous?.strategyId,
          reasonCodes: decision.reasonCodes,
          supportingEvidenceIds: decision.supportingEvidenceIds,
          misconceptionIds: misconceptions.map((m) => m.id),
          requiresReassessment: decision.requiresReassessment,
          decisionVersion: decision.decisionVersion,
          interventionId: params.interventionId,
          tutorSessionId: params.tutorSessionId,
          at: new Date(),
        });
      } else {
        id = lastForSession.id;
      }
    }

    const lines = [
      'Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):',
      `- Target objective: ${objective.code} "${objective.title}". Status: ${STATUS_WORDS[mine?.masteryStatus ?? 'not_assessed']}.`,
      recentEvidence.length
        ? `- Recent assessed answers on it: ${recentEvidence.filter((e) => e.result === 'correct').length} of ${recentEvidence.length} correct.`
        : '- No assessed answers on it yet.',
      ...weak.map((w) => `- Prerequisite not secure yet: ${w.code} "${w.title}".`),
      ...misconceptions.map((m) => `- Possible misconception (${m.status === 'confirmed' ? 'confirmed by a teacher' : 'not confirmed'}): ${m.description}`),
      `- Teaching strategy: ${strategy.id.replace(/_/g, ' ')}${target && target.id !== objective.id ? ` on ${target.code} "${target.title}" first` : ''}. ${strategy.promptInstructions}`,
      '- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.',
      decision.requiresReassessment
        ? '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).'
        : '- They have mastered this; keep practice short and suggest moving on.',
    ];
    return { decision: { ...decision, id }, prompt: lines.join('\n') };
  } catch (error) {
    logger.warn('learning_context_failed', { error: serializeError(error) });
    return null;
  }
}
