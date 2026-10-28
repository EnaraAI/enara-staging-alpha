import { randomUUID } from 'crypto';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import { EDUCATOR_ACTIONS, LearningIntervention } from '../models/LearningIntervention';
import { LearningObjective } from '../models/LearningObjective';
import { StudyPlan, type IStudyItem } from '../models/StudyPlan';
import { dueFor, studentStatus, submissionWindow } from './assignments';
import { getFeatureFlags, isShadowMode } from './featureFlags';
import { getEnrolledInstances } from './studentCourseService';

// Study plans (plan-v1). Built only from records: open assignments, actions a
// teacher assigned, released results that went badly, and (when the school
// has them on) Phase 2 recommendations with their evidence. Nothing is added
// without one of those, so a student with no evidence gets no invented work.
// Items have stable keys; replanning updates them in place, adds new ones and
// drops ones whose reason has gone, and records what changed.
export const STUDY_PLAN_VERSION = 'plan-v1';
const DAY = 86_400_000;
const LOW_SCORE = 70;

const ACTION_TITLES: Record<string, string> = {
  revisit_lesson: 'Revisit the lesson', prerequisite_practice: 'Practise the prerequisite', targeted_exercise: 'Targeted exercise',
  check_in: 'Check in with your teacher', tutor_support: 'Work on it with the AI tutor', spaced_review: 'Spaced review',
  reassessment: 'Take the check again', teacher_assigned: 'Practice from your teacher',
};

type Candidate = Omit<IStudyItem, 'status' | 'addedAt' | 'updatedAt'>;

export async function planCandidates(student: { id: string; institutionId?: string }, now = new Date()): Promise<Candidate[]> {
  const classes = await getEnrolledInstances(student.id);
  const [assignments, interventions, released] = await Promise.all([
    Assignment.find({ classId: { $in: classes.map((c) => c.id) }, state: 'published' }).lean(),
    LearningIntervention.find({ studentId: student.id, assignedBy: 'teacher', status: { $in: ['assigned', 'in_progress'] }, interventionType: { $in: [...EDUCATOR_ACTIONS, 'teacher_assigned'] } }).lean(),
    AssessmentAttempt.find({ studentId: student.id, gradingStatus: 'released', releasedAt: { $gte: new Date(now.getTime() - 30 * DAY) } }).select('id assignmentId assessmentTitle score releasedAt').lean(),
  ]);
  const mine = assignments.filter((a) => !a.studentIds?.length || a.studentIds.includes(student.id));
  const attempts = await AssessmentAttempt.find({ studentId: student.id, assignmentId: { $in: mine.map((a) => a.id) } }).select('assignmentId status gradingStatus submittedAt').lean();
  const codes = new Map(
    (await LearningObjective.find({ id: { $in: interventions.map((i) => i.objectiveId).filter(Boolean) } }).select('id code').lean()).map((o) => [o.id, o.code]),
  );
  const out: Candidate[] = [];

  for (const a of mine) {
    const st = studentStatus(a, student.id, attempts.filter((t) => t.assignmentId === a.id) as never, now);
    const w = submissionWindow(a, student.id, now);
    if (!w.open || !['not_started', 'in_progress'].includes(st.status)) continue;
    const due = dueFor(a, student.id);
    const soon = due.getTime() - now.getTime() < 3 * DAY;
    out.push({
      key: `assignment:${a.id}`,
      kind: 'assignment',
      title: a.title,
      rationale: `${st.status === 'in_progress' ? 'You started this; ' : ''}due ${due.toISOString().slice(0, 10)}${w.late ? ' (now accepted only as late)' : ''}.`,
      evidenceIds: [],
      assignmentId: a.id,
      courseId: a.classId,
      priority: soon ? 0 : 2,
      dueAt: due,
      effortMinutes: a.timeLimitMinutes ?? undefined,
      source: 'assignment',
    });
  }
  for (const i of interventions) {
    out.push({
      key: `int:${i.id}`,
      kind: i.interventionType === 'teacher_assigned' ? 'continue_intervention' : 'teacher_action',
      title: `${ACTION_TITLES[i.interventionType] ?? 'Work from your teacher'}${i.objectiveId && codes.get(i.objectiveId) ? `: ${codes.get(i.objectiveId)}` : ''}`,
      rationale: i.rationale ?? i.note ?? 'Your teacher asked you to do this.',
      evidenceIds: i.sourceEvidenceIds ?? [],
      objectiveId: i.objectiveId,
      interventionId: i.id,
      lessonId: i.lessonId,
      assignmentId: i.assignmentId,
      courseId: i.courseId,
      priority: 1,
      dueAt: i.dueAt,
      source: 'teacher',
    });
  }
  for (const r of released) {
    if (typeof r.score !== 'number' || r.score >= LOW_SCORE) continue;
    out.push({
      key: `result:${r.id}`,
      kind: 'review_feedback',
      title: `Go over your feedback on ${r.assessmentTitle}`,
      rationale: `You scored ${r.score}%. Your teacher's feedback says what to work on.`,
      evidenceIds: [],
      attemptId: r.id,
      assignmentId: r.assignmentId,
      priority: 2,
      source: 'result',
    });
  }

  const flags = student.institutionId ? await getFeatureFlags(student.institutionId) : null;
  // Shadow mode: Phase 2 results stay with staff.
  if (flags?.learning_pathways_enabled && !(await isShadowMode(student.institutionId))) {
    const { buildPathway } = await import('./pathways');
    const recs = (await buildPathway(student, now)).recommendations;
    const linked = new Set(interventions.map((i) => i.id));
    for (const r of recs) {
      if (r.interventionId && linked.has(r.interventionId)) continue;
      out.push({
        key: `rec:${r.type}:${r.objectiveId}`,
        kind: r.type,
        title: `${r.type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}: ${r.objectiveCode}`,
        rationale: r.explanation,
        evidenceIds: r.supportingEvidenceIds,
        objectiveId: r.objectiveId,
        interventionId: r.interventionId,
        courseId: r.courseId,
        priority: 3 + r.priority,
        source: 'recommendation',
      });
    }
  }
  return out.sort((x, y) => x.priority - y.priority || (x.dueAt ? new Date(x.dueAt).getTime() : Infinity) - (y.dueAt ? new Date(y.dueAt).getTime() : Infinity));
}

const same = (a: Candidate, b: IStudyItem) =>
  a.title === b.title && a.rationale === b.rationale && String(a.dueAt ?? '') === String(b.dueAt ?? '') && a.priority === b.priority;

// Brings the plan up to date. Safe to call repeatedly or concurrently: a
// version check makes a concurrent replan retry instead of overwriting.
export async function replan(student: { id: string; institutionId?: string }, trigger: string, now = new Date()) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const plan = (await StudyPlan.findOne({ studentId: student.id }).lean()) ?? null;
    const candidates = await planCandidates(student, now);
    const byKey = new Map((plan?.items ?? []).map((i) => [i.key, i]));
    const wanted = new Set(candidates.map((c) => c.key));
    const added: string[] = [];
    const removed: string[] = [];
    let changed = false;
    const items: IStudyItem[] = candidates.map((c) => {
      const old = byKey.get(c.key);
      if (!old) {
        added.push(c.key);
        changed = true;
        return { ...c, status: 'todo', addedAt: now, updatedAt: now };
      }
      if (!same(c, old)) changed = true;
      return { ...old, ...c, status: old.status, addedAt: old.addedAt, updatedAt: same(c, old) ? old.updatedAt : now };
    });
    // Items whose reason is gone leave the plan; finished ones are kept as a record.
    for (const old of plan?.items ?? []) {
      if (wanted.has(old.key)) continue;
      if (old.status === 'todo') {
        removed.push(old.key);
        changed = true;
      } else if (now.getTime() - new Date(old.updatedAt).getTime() < 30 * DAY) {
        items.push(old);
      } else changed = true;
    }
    if (plan && !changed) return plan;
    const version = (plan?.version ?? 0) + 1;
    const update = {
      $set: { items, plannedAt: now, version, algorithmVersion: STUDY_PLAN_VERSION, institutionId: student.institutionId },
      $push: { history: { $each: [{ version, at: now, trigger, added, removed }], $slice: -50 } },
    };
    if (!plan) {
      try {
        return (await StudyPlan.create({ id: `sp-${randomUUID()}`, studentId: student.id, institutionId: student.institutionId, items, plannedAt: now, version, algorithmVersion: STUDY_PLAN_VERSION, history: [{ version, at: now, trigger, added, removed }] })).toObject();
      } catch (error) {
        if ((error as { code?: number }).code === 11000) continue;
        throw error;
      }
    }
    const saved = await StudyPlan.findOneAndUpdate({ studentId: student.id, version: plan.version }, update, { new: true }).lean();
    if (saved) return saved;
  }
  return StudyPlan.findOne({ studentId: student.id }).lean();
}

// Student marks an item done, dismissed, or back to do. This is a record of
// what they said, not evidence of learning.
export async function setItemStatus(studentId: string, key: string, status: 'todo' | 'done' | 'dismissed') {
  return StudyPlan.findOneAndUpdate(
    { studentId, 'items.key': key },
    { $set: { 'items.$.status': status, 'items.$.updatedAt': new Date() } },
    { new: true },
  ).lean();
}
