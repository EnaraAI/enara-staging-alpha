import { randomUUID } from 'crypto';
import { LearningEvent } from '../models/LearningEvent';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningObjective } from '../models/LearningObjective';
import { ObjectiveRetentionState } from '../models/ObjectiveRetentionState';
import { Curriculum } from '../models/Curriculum';
import { PedagogicalDecision } from '../models/PedagogicalDecision';
import { Student } from '../models/Student';
import { StudentMisconception } from '../models/StudentMisconception';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import type { TeachingMeta } from '../models/TutorMessage';
import { logger, serializeError } from '../utils/logging';
import { applicationGapFrom, examContextFor } from './assessmentEvidenceContext';
import { isAdultSchool, isFeatureEnabled, isShadowMode } from './featureFlags';
import { PEDAGOGY_PLAN_VERSION, selectTeachingPlan, type PlanInput, type TeachingPlan } from './pedagogyPolicy';
import { REGISTRY_VERSION, STRATEGY_BY_ID } from './strategyRegistry';

// The level used for adult learners: above every method's minimum grade, and
// past the age where game-style motivation is chosen.
export const ADULT_GRADE_LEVEL = 18;

const MET = new Set(['proficient', 'mastered']);
const INDEPENDENT = new Set(['independent_assessment', 'diagnostic', 'retention_review', 'teacher_verified']);
const STATUS_WORDS: Record<string, string> = {
  not_assessed: 'not assessed yet',
  emerging: 'emerging (little understanding shown so far)',
  developing: 'developing (partly understood)',
  proficient: 'proficient (mostly secure)',
  mastered: 'mastered',
};
const READINESS: Record<string, string> = {
  not_assessed: 'unknown: find the starting point with a few short questions',
  emerging: 'lower: simpler words, concrete examples, small steps, frequent checks',
  developing: 'at level: standard pace, hints only when errors appear',
  proficient: 'higher: fewer scaffolds, harder variants, extension questions',
  mastered: 'higher: extension and transfer; ask them to explain it as if teaching',
};
// The mastery estimate must rise by more than this after a plan for the plan to
// count as having moved the evidence (mastery-v1 estimates are 0-1).
const IMPROVEMENT_MARGIN = 0.05;
const DISENGAGED_DAYS = 7;

export interface ObjectiveContext {
  decision: TeachingPlan & { id?: string };
  // The objective's mastery status from the evidence model (read-only).
  masteryStatus?: string;
  prompt: string;
  teaching: TeachingMeta;
}

export type Channel = 'chat' | 'stream' | 'voice' | 'intervention';

// Builds the tutor context for one student and objective: the target, a short
// evidence summary, possible misconceptions (labelled as possibilities), weak
// prerequisites and the teaching plan (ped-v2: a primary method with supporting
// methods from the 23-method registry). Only what the turn needs; no history
// dump. Returns null when adaptive pedagogy is off for the school or anything
// fails, so ordinary tutoring carries on without it.
export async function buildObjectiveContext(params: {
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  interventionId?: string;
  tutorSessionId?: string;
  teacherStrategyId?: string;
  // Record the decision (when the plan differs from the last one for this session).
  record?: boolean;
  channel?: Channel;
  objectiveResolution?: string;
  // Voice: spoken replies need a shorter plan.
  compact?: boolean;
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
    const related = objective.courseId
      ? LearningObjective.find({ institutionId: params.institutionId, courseId: objective.courseId, status: 'approved', id: { $ne: objective.id } }).select('id').limit(200).lean()
      : Promise.resolve([] as { id: string }[]);
    const [states, prereqs, misconceptions, recentEvidence, decisions, retention, student, lastActivity, relatedObjectives] = await Promise.all([
      StudentObjectiveMastery.find({ studentId: params.studentId, objectiveId: { $in: ids } }).lean(),
      LearningObjective.find({ id: { $in: objective.prerequisiteObjectiveIds }, status: 'approved' }).select('id code title').lean(),
      StudentMisconception.find({ studentId: params.studentId, objectiveId: objective.id, status: { $in: ['suspected', 'confirmed'] } }).lean(),
      LearningEvidence.find({ studentId: params.studentId, objectiveId: objective.id, invalidatedAt: { $exists: false } })
        .sort({ occurredAt: -1 })
        .limit(10)
        .select('id result evidenceType occurredAt normalizedScore sourceEventId')
        .lean(),
      PedagogicalDecision.find({ studentId: params.studentId, objectiveId: objective.id }).sort({ at: -1 }).limit(10).lean(),
      ObjectiveRetentionState.findOne({ studentId: params.studentId, objectiveId: objective.id }).lean(),
      Student.findOne({ id: params.studentId }).select('grade').lean(),
      LearningEvent.findOne({ studentId: params.studentId, at: { $lt: new Date(Date.now() - 60_000) } }).sort({ at: -1 }).select('at').lean(),
      related,
    ]);
    const stateOf = new Map(states.map((s) => [s.objectiveId, s]));
    const mine = stateOf.get(objective.id);
    const weak = prereqs.filter((p) => !MET.has(stateOf.get(p.id)?.masteryStatus ?? 'not_assessed') && (stateOf.get(p.id)?.evidenceCount ?? 0) > 0);
    const estimate = mine?.masteryEstimate ?? null;

    // Did the evidence move after each earlier plan? Only decisions that stored
    // the estimate at the time can be judged; older ones stay "unknown".
    const previous = decisions[0];
    const newEvidenceSince = Boolean(previous && recentEvidence.some((e) => e.occurredAt > previous.at));
    const improvedSince = (d: (typeof decisions)[number], now: number | null) =>
      typeof d.masteryAtDecision === 'number' && typeof now === 'number' ? now > d.masteryAtDecision + IMPROVEMENT_MARGIN : undefined;
    // A plan counts as "tried without improvement" only if assessed evidence
    // arrived after it (before the next plan, or until now) and the estimate did
    // not rise. With no evidence in between, its effect is unknown, not "none":
    // consecutive plans in different sessions must not trigger a switch (live
    // check P21, Socratic -> Mastery without new evidence).
    const evidenceBetween = (from: Date, to: Date | undefined) => recentEvidence.some((e) => e.occurredAt > from && (!to || e.occurredAt <= to));
    const tried = new Set<string>();
    for (let i = 0; i < decisions.length; i++) {
      const nextAt = i === 0 ? undefined : decisions[i - 1].at;
      if (!evidenceBetween(decisions[i].at, nextAt)) continue;
      const later = i === 0 ? estimate : decisions[i - 1].masteryAtDecision ?? null;
      if (improvedSince(decisions[i], later) === false) tried.add(decisions[i].strategyId);
    }
    const retentionLapsed = Boolean(
      retention?.lastFailedRetrievalAt && (!retention.lastSuccessfulRetrievalAt || retention.lastFailedRetrievalAt > retention.lastSuccessfulRetrievalAt),
    );
    // Recall vs application, only from questions whose author set a cognitive level.
    const exam = await examContextFor(recentEvidence.filter((e) => INDEPENDENT.has(e.evidenceType)));
    const applicationGap = applicationGapFrom(
      recentEvidence.map((e) => ({ score: e.normalizedScore, level: exam.get(e.id)?.cognitiveLevel, at: e.occurredAt })),
    );
    // Subject: from the assessed questions, else the curriculum's name.
    const subject =
      recentEvidence.map((e) => exam.get(e.id)?.subject).find(Boolean) ??
      (objective.curriculumId ? (await Curriculum.findOne({ id: objective.curriculumId }).select('name').lean())?.name : undefined);
    const gradeMatch = /(\d{1,2})/.exec(student?.grade ?? '');
    // Adult education schools: every student is taught as an adult.
    const adult = await isAdultSchool(params.institutionId);
    const input: PlanInput = {
      objectiveId: objective.id,
      masteryStatus: mine?.masteryStatus ?? 'not_assessed',
      masteryEstimate: estimate,
      evidenceStrength: mine?.evidenceStrength ?? 'none',
      weakPrerequisiteIds: weak.map((w) => w.id),
      misconceptions: misconceptions.map((m) => ({ id: m.id, category: m.category, status: m.status })),
      supportingEvidenceIds: recentEvidence.map((e) => e.id),
      recentResults: recentEvidence.filter((e) => INDEPENDENT.has(e.evidenceType)).map((e) => e.result),
      retention: retention ? { due: Boolean(retention.nextReviewAt && retention.nextReviewAt <= new Date()), lapsed: retentionLapsed } : undefined,
      applicationGap,
      previous: previous ? { primary: previous.strategyId, newEvidenceSince, improved: newEvidenceSince ? improvedSince(previous, estimate) : undefined } : undefined,
      triedWithoutImprovement: [...tried],
      teacherStrategyId,
      gradeLevel: adult ? ADULT_GRADE_LEVEL : gradeMatch ? Number(gradeMatch[1]) : undefined,
      disengaged: lastActivity ? Date.now() - new Date(lastActivity.at).getTime() > DISENGAGED_DAYS * 86_400_000 : false,
      subject,
      relatedSecureObjectives: relatedObjectives.length
        ? await StudentObjectiveMastery.countDocuments({ studentId: params.studentId, objectiveId: { $in: relatedObjectives.map((o) => o.id) }, masteryStatus: { $in: [...MET] } })
        : 0,
    };
    const plan = selectTeachingPlan(input);
    const primary = STRATEGY_BY_ID.get(plan.primary)!;
    const target = plan.targetObjectiveId === objective.id ? objective : weak.find((w) => w.id === plan.targetObjectiveId);

    let id: string | undefined;
    if (params.record) {
      const lastForSession = params.tutorSessionId
        ? await PedagogicalDecision.findOne({ tutorSessionId: params.tutorSessionId }).sort({ at: -1 }).lean()
        : null;
      const same =
        lastForSession &&
        lastForSession.strategyId === plan.primary &&
        (lastForSession.supportingStrategyIds ?? []).join() === plan.supporting.join() &&
        (lastForSession.reinforcementStrategyId ?? '') === (plan.reinforcement ?? '') &&
        lastForSession.objectiveId === objective.id;
      if (!same) {
        id = `pd-${randomUUID()}`;
        await PedagogicalDecision.create({
          id,
          institutionId: params.institutionId,
          studentId: params.studentId,
          objectiveId: objective.id,
          targetObjectiveId: plan.targetObjectiveId,
          strategyId: plan.primary,
          strategyVersion: primary.version,
          previousStrategyId: previous?.strategyId,
          reasonCodes: plan.reasonCodes,
          supportingEvidenceIds: plan.supportingEvidenceIds,
          misconceptionIds: misconceptions.map((m) => m.id),
          requiresReassessment: plan.requiresReassessment,
          decisionVersion: plan.decisionVersion,
          interventionId: params.interventionId,
          tutorSessionId: params.tutorSessionId,
          at: new Date(),
          supportingStrategyIds: plan.supporting,
          reinforcementStrategyId: plan.reinforcement,
          modifierIds: plan.modifiers,
          registryVersion: plan.registryVersion,
          gap: plan.gap,
          expectedOutcome: plan.expectedOutcome,
          switchWhen: plan.switchWhen,
          confidence: plan.confidence,
          limitations: plan.limitations,
          objectiveResolution: params.objectiveResolution ?? 'session',
          channel: params.channel,
          masteryAtDecision: estimate,
          masteryStatusAtDecision: mine?.masteryStatus ?? 'not_assessed',
        });
      } else {
        id = lastForSession.id;
      }
    }

    const status = mine?.masteryStatus ?? 'not_assessed';
    const lines = [
      'Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):',
      `- Target objective: ${objective.code} "${objective.title}". Status: ${STATUS_WORDS[status]}.`,
      recentEvidence.length
        ? `- Recent assessed answers on it: ${recentEvidence.filter((e) => e.result === 'correct').length} of ${recentEvidence.length} correct.`
        : '- No assessed answers on it yet.',
      ...weak.map((w) => `- Prerequisite not secure yet: ${w.code} "${w.title}".`),
      ...misconceptions.map((m) => `- Possible misconception (${m.status === 'confirmed' ? 'confirmed by a teacher' : 'not confirmed'}): ${m.description}`),
      ...planLines(plan, target && target.id !== objective.id ? `${target.code} "${target.title}"` : undefined, status, params.compact),
      '- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.',
      plan.requiresReassessment
        ? '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).'
        : '- They have mastered this; keep practice short and suggest moving on.',
    ];
    const teaching: TeachingMeta = {
      decisionId: id,
      objectiveId: objective.id,
      objectiveResolution: params.objectiveResolution ?? 'session',
      primary: plan.primary,
      supporting: plan.supporting,
      reinforcement: plan.reinforcement,
      modifiers: plan.modifiers,
      reasonCodes: plan.reasonCodes,
      primaryVersion: primary.version,
      decisionVersion: plan.decisionVersion,
      registryVersion: plan.registryVersion,
    };
    return { decision: { ...plan, id }, masteryStatus: status, prompt: lines.join('\n'), teaching };
  } catch (error) {
    logger.warn('learning_context_failed', { error: serializeError(error) });
    return null;
  }
}

// The plan as tutor instructions: the primary method's full instructions; one
// line per supporting / reinforcement method; readiness for differentiation; the
// rule that resolves conflicts between methods (the primary's rules win).
function planLines(plan: TeachingPlan, prerequisite: string | undefined, status: string, compact?: boolean): string[] {
  const p = STRATEGY_BY_ID.get(plan.primary)!;
  const brief = (id: string) => {
    const m = STRATEGY_BY_ID.get(id)!;
    return compact ? `${m.name}` : `${m.name}: ${m.description}`;
  };
  return [
    `- Teaching method: ${p.name}${prerequisite ? ` on ${prerequisite} first` : ''}. ${compact ? p.description : p.promptInstructions}`,
    ...(plan.supporting.length ? [`- Also use: ${plan.supporting.map(brief).join(' ')}`] : []),
    ...(plan.reinforcement ? [`- To reinforce: ${brief(plan.reinforcement)}`] : []),
    `- Readiness (adjust silently, never tell the student): ${READINESS[status] ?? READINESS.not_assessed}.`,
    '- Feedback: say what is right or wrong in the work and the next step; never praise or criticise the person.',
    ...(plan.supporting.length || plan.reinforcement ? ['- If methods disagree (for example on giving answers or how many questions to ask), follow the teaching method above.'] : []),
  ];
}

// The objective a tutor turn is about. A session may be linked to one objective
// (handoffs, interventions); otherwise the lesson's approved objectives are used.
// Several on one lesson: the one with the weakest evidence is chosen (and the
// choice is recorded as lesson_multiple). None: no objective-level plan.
export async function resolveTeachingObjective(params: {
  institutionId?: string;
  studentId: string;
  sessionObjectiveId?: string;
  lessonId?: string;
}): Promise<{ objectiveId?: string; resolution: 'session' | 'lesson' | 'lesson_multiple' | 'none'; candidates: string[] }> {
  if (params.sessionObjectiveId) return { objectiveId: params.sessionObjectiveId, resolution: 'session', candidates: [params.sessionObjectiveId] };
  if (!params.lessonId || !params.institutionId) return { resolution: 'none', candidates: [] };
  const objectives = await LearningObjective.find({ institutionId: params.institutionId, lessonIds: params.lessonId, status: 'approved' })
    .select('id code')
    .sort({ code: 1 })
    .limit(20)
    .lean();
  if (!objectives.length) return { resolution: 'none', candidates: [] };
  if (objectives.length === 1) return { objectiveId: objectives[0].id, resolution: 'lesson', candidates: [objectives[0].id] };
  const states = await StudentObjectiveMastery.find({ studentId: params.studentId, objectiveId: { $in: objectives.map((o) => o.id) } })
    .select('objectiveId masteryEstimate masteryStatus')
    .lean();
  const est = new Map(states.map((s) => [s.objectiveId, s.masteryStatus === 'mastered' ? 2 : s.masteryEstimate ?? 0.5]));
  // Weakest evidence first; unassessed objectives count as 0.5 (neutral prior); ties by code.
  const ranked = [...objectives].sort((a, b) => (est.get(a.id) ?? 0.5) - (est.get(b.id) ?? 0.5) || a.code.localeCompare(b.code));
  return { objectiveId: ranked[0].id, resolution: 'lesson_multiple', candidates: ranked.map((o) => o.id) };
}

// Entry point for every tutor path (chat, stream, voice). Returns the context
// and the metadata to store on the reply; null when adaptive pedagogy is off,
// in shadow mode, or no objective applies (ordinary tutoring then).
export async function buildTeachingContext(params: {
  institutionId?: string;
  studentId: string;
  sessionObjectiveId?: string;
  lessonId?: string;
  interventionId?: string;
  tutorSessionId?: string;
  channel: Channel;
  compact?: boolean;
  // false: use the plan without logging a new decision (e.g. a voice nudge,
  // which continues the turn it follows). Defaults to true.
  record?: boolean;
}): Promise<ObjectiveContext | null> {
  try {
    if (!(await isFeatureEnabled(params.institutionId, 'adaptive_pedagogy_enabled'))) return null;
    if (await isShadowMode(params.institutionId)) return null;
    const resolved = await resolveTeachingObjective(params);
    if (!resolved.objectiveId) return null;
    return await buildObjectiveContext({
      institutionId: params.institutionId,
      studentId: params.studentId,
      objectiveId: resolved.objectiveId,
      interventionId: params.interventionId,
      tutorSessionId: params.tutorSessionId,
      record: params.record ?? true,
      channel: params.channel,
      objectiveResolution: resolved.resolution,
      compact: params.compact,
    });
  } catch (error) {
    logger.warn('teaching_context_failed', { error: serializeError(error) });
    return null;
  }
}

export { PEDAGOGY_PLAN_VERSION, REGISTRY_VERSION };
