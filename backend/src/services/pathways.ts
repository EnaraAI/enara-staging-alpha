import { Curriculum } from '../models/Curriculum';
import { Institution } from '../models/Institution';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningIntervention } from '../models/LearningIntervention';
import { LearningObjective } from '../models/LearningObjective';
import { ObjectiveRetentionState } from '../models/ObjectiveRetentionState';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { getEnrolledInstances } from './studentCourseService';
import { retentionStatus } from './retention';

// Personalised pathway and recommendations (path-v1). Built only from approved
// objectives, prerequisites, mastery and evidence records, interventions and
// the school's pathway mode. Every recommendation explains itself with numbers
// from actual records and lists the evidence it used.
//
// Sequence: an objective's position is the earliest lesson it is linked to in
// the curriculum (then its code).
// Modes:
// - strict_sequence: "learn next" is only the first objective in sequence not yet secure.
// - teacher_controlled (default): as strict; teacher-assigned work comes first.
// - adaptive: "learn next" can be any objective whose prerequisites are secure
//   (up to 3, in sequence order), so students can move ahead within approved objectives.
// Gaps, checks and due reviews are recommended in every mode; secure objectives
// are not repeated unless a review is due.

export const PATHWAY_VERSION = 'path-v1';
type Mode = 'strict_sequence' | 'teacher_controlled' | 'adaptive';
const SECURE = new Set(['proficient', 'mastered']);
const GAP = new Set(['emerging', 'developing']);

export interface Recommendation {
  type: 'continue_intervention' | 'review_prerequisite' | 'practise' | 'reassess' | 'review_due' | 'learn_next';
  objectiveId: string;
  objectiveCode: string;
  courseId?: string;
  interventionId?: string;
  priority: number;
  explanation: string;
  supportingEvidenceIds: string[];
  assignedByTeacher?: boolean;
}

export async function buildPathway(student: { id: string; institutionId?: string }, now = new Date()) {
  const school = student.institutionId ? await Institution.findOne({ id: student.institutionId }).select('learningSettings').lean() : null;
  const mode: Mode = school?.learningSettings?.pathwayMode ?? 'teacher_controlled';
  const classes = await getEnrolledInstances(student.id);
  const curriculumIds = [...new Set(classes.map((c) => c.curriculumId).filter(Boolean))] as string[];
  const [objectives, curricula] = await Promise.all([
    LearningObjective.find({ institutionId: student.institutionId, curriculumId: { $in: curriculumIds }, status: 'approved' }).lean(),
    Curriculum.find({ id: { $in: curriculumIds } }).select('id chapters.id').lean(),
  ]);
  const ids = objectives.map((o) => o.id);
  const [states, retention, interventions, evidence] = await Promise.all([
    StudentObjectiveMastery.find({ studentId: student.id, objectiveId: { $in: ids } }).lean(),
    ObjectiveRetentionState.find({ studentId: student.id, objectiveId: { $in: ids } }).lean(),
    LearningIntervention.find({ studentId: student.id, objectiveId: { $in: ids }, status: { $in: ['assigned', 'in_progress', 'completed'] } }).lean(),
    LearningEvidence.find({ studentId: student.id, objectiveId: { $in: ids }, invalidatedAt: { $exists: false }, assistanceLevel: 'none' })
      .sort({ occurredAt: -1 })
      .select('id objectiveId result occurredAt')
      .lean(),
  ]);
  const stateOf = new Map(states.map((s) => [s.objectiveId, s]));
  const retentionOf = new Map(retention.map((r) => [r.objectiveId, r]));
  const lessonOrder = new Map(curricula.map((c) => [c.id, new Map(c.chapters.map((ch, i) => [ch.id, i]))]));
  const recent = new Map<string, typeof evidence>();
  for (const e of evidence) {
    const list = recent.get(e.objectiveId) ?? [];
    if (list.length < 5) list.push(e);
    recent.set(e.objectiveId, list);
  }
  const statusOf = (id: string) => stateOf.get(id)?.masteryStatus ?? 'not_assessed';
  const isSecure = (id: string) => SECURE.has(statusOf(id));
  const codeOf = new Map(objectives.map((o) => [o.id, o.code]));
  const courseOf = (curriculumId: string) => classes.find((c) => c.curriculumId === curriculumId)?.id;
  const position = (o: (typeof objectives)[number]) => {
    const order = lessonOrder.get(o.curriculumId);
    const positions = o.lessonIds.map((l) => order?.get(l)).filter((x): x is number => x !== undefined);
    return positions.length ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
  };
  const sequence = [...objectives].sort((a, b) => a.curriculumId.localeCompare(b.curriculumId) || position(a) - position(b) || a.code.localeCompare(b.code));
  const summary = (id: string) => {
    const r = recent.get(id) ?? [];
    return { text: `${r.filter((e) => e.result === 'correct').length} of ${r.length} recent independent answers correct`, ids: r.map((e) => e.id) };
  };

  const recs: Recommendation[] = [];
  const activeByObjective = new Map(
    interventions.filter((i) => i.objectiveId && (i.status !== 'completed' || !i.outcome)).map((i) => [i.objectiveId!, i]),
  );
  for (const [objectiveId, i] of activeByObjective) {
    recs.push({
      type: 'continue_intervention',
      objectiveId,
      objectiveCode: codeOf.get(objectiveId) ?? objectiveId,
      courseId: i.courseId,
      interventionId: i.id,
      priority: i.assignedBy === 'teacher' ? 0 : 1,
      assignedByTeacher: i.assignedBy === 'teacher',
      explanation:
        i.status === 'completed'
          ? `Practice on ${codeOf.get(objectiveId)} is done; take the check to confirm it.`
          : `${i.assignedBy === 'teacher' ? 'Your teacher assigned' : 'You started'} work on ${codeOf.get(objectiveId)}${i.note ? `: ${i.note}` : ''}.`,
      supportingEvidenceIds: i.sourceEvidenceIds,
    });
  }
  for (const o of sequence) {
    const s = stateOf.get(o.id);
    if (activeByObjective.has(o.id)) continue;
    if (s && GAP.has(s.masteryStatus) && s.independentEvidenceCount > 0) {
      const weak = o.prerequisiteObjectiveIds.filter((p) => codeOf.has(p) && !isSecure(p) && (stateOf.get(p)?.evidenceCount ?? 0) > 0);
      if (weak.length) {
        const p = summary(weak[0]);
        recs.push({
          type: 'review_prerequisite',
          objectiveId: weak[0],
          objectiveCode: codeOf.get(weak[0])!,
          courseId: courseOf(o.curriculumId),
          priority: 2,
          explanation: `Review ${codeOf.get(weak[0])} before ${o.code}: ${o.code} builds on it, and on ${codeOf.get(weak[0])} ${p.text}.`,
          supportingEvidenceIds: [...p.ids, ...summary(o.id).ids],
        });
      } else {
        const m = summary(o.id);
        recs.push({
          type: 'practise',
          objectiveId: o.id,
          objectiveCode: o.code,
          courseId: courseOf(o.curriculumId),
          priority: 3,
          explanation: `Practise ${o.code}: ${m.text}.`,
          supportingEvidenceIds: m.ids,
        });
      }
    } else if (s?.needsVerification) {
      const m = summary(o.id);
      recs.push({
        type: 'reassess',
        objectiveId: o.id,
        objectiveCode: o.code,
        courseId: courseOf(o.curriculumId),
        priority: 4,
        explanation: `Take a quick check on ${o.code}: the estimate is high but rests on ${s.independentEvidenceCount} answer${s.independentEvidenceCount === 1 ? '' : 's'}.`,
        supportingEvidenceIds: m.ids,
      });
    }
    const r = retentionOf.get(o.id);
    const rs = r ? retentionStatus(r, now) : 'not_scheduled';
    if (rs === 'due' || rs === 'overdue') {
      recs.push({
        type: 'review_due',
        objectiveId: o.id,
        objectiveCode: o.code,
        courseId: courseOf(o.curriculumId),
        priority: 5,
        explanation: `Review ${o.code}: last secure answer on ${r!.lastSuccessfulRetrievalAt?.toISOString().slice(0, 10)}, review ${rs === 'overdue' ? 'overdue' : 'due'} since ${r!.nextReviewAt?.toISOString().slice(0, 10)}.`,
        supportingEvidenceIds: summary(o.id).ids,
      });
    }
  }
  // What to learn next.
  const notStarted = sequence.filter((o) => statusOf(o.id) === 'not_assessed' && !activeByObjective.has(o.id));
  const ready = notStarted.filter((o) => o.prerequisiteObjectiveIds.every((p) => !codeOf.has(p) || isSecure(p)));
  let nextUp: typeof sequence = [];
  if (mode === 'adaptive') {
    nextUp = ready.slice(0, 3);
  } else {
    const firstOpen = sequence.find((o) => !isSecure(o.id));
    if (firstOpen && notStarted.includes(firstOpen) && ready.includes(firstOpen)) nextUp = [firstOpen];
  }
  for (const o of nextUp) {
    recs.push({
      type: 'learn_next',
      objectiveId: o.id,
      objectiveCode: o.code,
      courseId: courseOf(o.curriculumId),
      priority: 6,
      explanation: o.prerequisiteObjectiveIds.some((p) => codeOf.has(p))
        ? `Next: ${o.code}. Its prerequisites (${o.prerequisiteObjectiveIds.filter((p) => codeOf.has(p)).map((p) => codeOf.get(p)).join(', ')}) are secure.`
        : `Next in your course: ${o.code}.`,
      supportingEvidenceIds: o.prerequisiteObjectiveIds.flatMap((p) => summary(p).ids),
    });
  }
  recs.sort((a, b) => a.priority - b.priority);

  const view = (o: (typeof sequence)[number]) => {
    const s = stateOf.get(o.id);
    const r = retentionOf.get(o.id);
    return {
      id: o.id,
      code: o.code,
      title: o.title,
      courseId: courseOf(o.curriculumId) ?? null,
      masteryStatus: statusOf(o.id),
      masteryEstimate: s?.masteryEstimate ?? null,
      evidenceStrength: s?.evidenceStrength ?? 'none',
      needsVerification: s?.needsVerification ?? false,
      retention: { status: r ? retentionStatus(r, now) : 'not_scheduled', nextReviewAt: r?.nextReviewAt ?? null },
      activeInterventionId: activeByObjective.get(o.id)?.id ?? null,
    };
  };
  const firstGap = recs.find((r) => ['continue_intervention', 'review_prerequisite', 'practise'].includes(r.type));
  return {
    version: PATHWAY_VERSION,
    mode,
    current: firstGap ? { objectiveId: firstGap.objectiveId, code: firstGap.objectiveCode, reason: firstGap.type } : nextUp[0] ? { objectiveId: nextUp[0].id, code: nextUp[0].code, reason: 'learn_next' } : null,
    next: nextUp.map((o) => o.code),
    completed: sequence.filter((o) => isSecure(o.id) && !stateOf.get(o.id)?.needsVerification).map(view),
    awaitingVerification: sequence.filter((o) => stateOf.get(o.id)?.needsVerification).map(view),
    gaps: sequence.filter((o) => GAP.has(statusOf(o.id)) && (stateOf.get(o.id)?.independentEvidenceCount ?? 0) > 0).map(view),
    activeInterventions: [...activeByObjective].map(([objectiveId, i]) => ({ id: i.id, objectiveId, code: codeOf.get(objectiveId), status: i.status, assignedBy: i.assignedBy })),
    sequence: sequence.map(view),
    recommendations: recs,
  };
}
