import { AppError } from '../middleware/errorHandler';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import type { IQuestion } from '../models/Assessment';
import { LearningObjective } from '../models/LearningObjective';
import { StudyPlan } from '../models/StudyPlan';
import { getVersion } from './assessmentVersions';
import { lastSubmissionFor } from './assignments';
import { getEnrolledInstances } from './studentCourseService';

// Tutor handoff (handoff-v1) and the assignment tutor policy. The tutor gets
// the least it needs: objective codes and titles, the student's own released
// work and feedback, and the rules for the situation. Never answer keys that
// aren't released, model answers, rubric internals, AI grading proposals,
// teacher-only notes or other students' data.
export const HANDOFF_VERSION = 'handoff-v1';

const HINTS_ONLY =
  'Assignment rule: the student is doing an assignment that allows hints only. Do not solve or give answers to its ' +
  'questions or anything close to them; ask guiding questions, point to the idea or method, and use different examples.';

// The strictest policy of the assignments the student has open right now.
export async function assignmentTutorPolicy(studentId: string): Promise<{ policy: 'blocked' | 'hints_only' | null; title?: string }> {
  const open = await AssessmentAttempt.find({ studentId, status: 'in-progress', assignmentId: { $exists: true } }).select('assignmentId').lean();
  if (!open.length) return { policy: null };
  const assignments = await Assignment.find({ id: { $in: open.map((o) => o.assignmentId) } }).select('title tutorPolicy').lean();
  const blocked = assignments.find((a) => a.tutorPolicy === 'blocked');
  if (blocked) return { policy: 'blocked', title: blocked.title };
  const hints = assignments.find((a) => a.tutorPolicy === 'hints_only');
  return hints ? { policy: 'hints_only', title: hints.title } : { policy: null };
}

export function policyRule(policy: 'blocked' | 'hints_only' | null) {
  return policy === 'hints_only' ? HINTS_ONLY : undefined;
}

async function objectiveLines(ids: string[], institutionId?: string) {
  if (!ids.length) return [];
  const objs = await LearningObjective.find({ id: { $in: ids }, institutionId, status: 'approved' }).select('code title').lean();
  return objs.map((o) => `${o.code} "${o.title}"`);
}

export async function buildHandoff(student: { id: string; institutionId?: string }, kind: 'assignment' | 'result' | 'plan_item', refId: string) {
  const header = "Context for this conversation (from the student's own records; use it, don't recite it):";
  if (kind === 'assignment') {
    const classes = await getEnrolledInstances(student.id);
    const a = await Assignment.findOne({ id: refId, classId: { $in: classes.map((c) => c.id) }, state: { $in: ['published', 'closed'] } }).lean();
    if (!a || (a.studentIds?.length && !a.studentIds.includes(student.id))) throw new AppError('Assignment not found', 404);
    const stillOpen = a.state === 'published' && new Date() <= lastSubmissionFor(a, student.id);
    if (stillOpen && a.tutorPolicy === 'blocked') throw new AppError('Your teacher has turned off the AI tutor for this assignment until it closes', 403, 'TUTOR_BLOCKED');
    const v = await getVersion(a.assessmentId, a.assessmentVersion);
    const objectiveIds = [...new Set((v.questions as IQuestion[]).flatMap((q) => q.objectiveIds || []))];
    const objectives = await objectiveLines(objectiveIds, student.institutionId);
    return {
      title: `Help with ${a.title}`,
      objectiveId: objectiveIds.length === 1 ? objectiveIds[0] : undefined,
      prompt: [
        header,
        `- The student is working on the assignment "${a.title}".`,
        objectives.length ? `- It covers: ${objectives.join('; ')}.` : '- Its topics are not tagged with objectives.',
        stillOpen
          ? `- ${a.tutorPolicy === 'hints_only' ? HINTS_ONLY : 'Help them understand the ideas; do not do the assignment questions for them.'}`
          : '- The assignment is closed; you may go through the ideas fully.',
      ].join('\n'),
    };
  }
  if (kind === 'result') {
    const t = await AssessmentAttempt.findOne({ id: refId, studentId: student.id, status: 'submitted' }).lean();
    // Only released results; before release there is nothing to discuss.
    if (!t || (t.assignmentId && t.gradingStatus !== 'released')) throw new AppError('Result not found', 404);
    let revealKey = !t.assignmentId;
    if (t.assignmentId) {
      const a = await Assignment.findOne({ id: t.assignmentId }).lean();
      const used = await AssessmentAttempt.countDocuments({ studentId: student.id, assignmentId: t.assignmentId, status: 'submitted' });
      const closed = !!a && (a.state === 'closed' || new Date() > lastSubmissionFor(a, student.id));
      revealKey = !!a && a.answerReveal !== 'never' && (closed || (a.answerReveal === 'after-submit' && used >= a.maxAttempts));
    }
    const lines = t.answers.slice(0, 20).map((ans, i) => {
      const parts = [`${i + 1}. Q: ${ans.questionText.slice(0, 300)}`, `Their answer: ${String(ans.studentAnswer ?? '').slice(0, 600)}`];
      if (typeof ans.points === 'number') parts.push(`Points: ${ans.points}/${ans.maxPoints}`);
      if (ans.feedback) parts.push(`Teacher feedback: ${ans.feedback.slice(0, 600)}`);
      if (revealKey && ans.correctAnswer !== undefined) parts.push(`Correct answer: ${String(ans.correctAnswer).slice(0, 200)}`);
      return parts.join(' | ');
    });
    return {
      title: `Go over ${t.assessmentTitle}`,
      prompt: [
        header,
        `- The student wants to go over their released result on "${t.assessmentTitle}" (${t.score ?? '?'}%).`,
        ...lines.map((l) => `- ${l}`),
        revealKey ? '- Help them understand their mistakes.' : '- Correct answers are not released yet: explain the ideas and methods without giving them.',
      ].join('\n'),
    };
  }
  const plan = await StudyPlan.findOne({ studentId: student.id }).lean();
  const item = plan?.items.find((i) => i.key === refId);
  if (!item) throw new AppError('Plan item not found', 404);
  const objectives = await objectiveLines(item.objectiveId ? [item.objectiveId] : [], student.institutionId);
  return {
    title: item.title.slice(0, 60),
    objectiveId: item.objectiveId,
    prompt: [header, `- Study-plan item: ${item.title}.`, `- Why it is in their plan: ${item.rationale}`, ...(objectives.length ? [`- Objective: ${objectives[0]}.`] : [])].join('\n'),
  };
}
