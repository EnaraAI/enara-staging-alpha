import { AppError } from '../middleware/errorHandler';
import { Assessment, AssessmentVersion, type IQuestion } from '../models/Assessment';

type AssessmentDoc = InstanceType<typeof Assessment>;

export const AUTO_GRADED = new Set(['multiple-choice', 'true-false', 'short-answer']);

export function questionPoints(q: Pick<IQuestion, 'type' | 'points' | 'rubric'>) {
  if (q.type === 'open-response') return (q.rubric?.criteria || []).reduce((n, c) => n + (c.maxPoints || 0), 0);
  return q.points ?? 1;
}

// Everything that would stop an assessment being published, in plain words.
export function publishProblems(a: Pick<AssessmentDoc, 'title' | 'questions'>): string[] {
  const problems: string[] = [];
  if (!a.title?.trim()) problems.push('The assessment needs a title.');
  if (!a.questions.length) problems.push('Add at least one question.');
  const ids = new Set<string>();
  a.questions.forEach((q, i) => {
    const label = `Question ${i + 1}`;
    if (ids.has(q.id)) problems.push(`${label} has a duplicate id.`);
    ids.add(q.id);
    if (!q.text?.trim()) problems.push(`${label} has no text.`);
    if (AUTO_GRADED.has(q.type)) {
      if (q.correctAnswer === undefined || q.correctAnswer === null || String(q.correctAnswer).trim() === '') problems.push(`${label} has no correct answer.`);
      if (q.type === 'multiple-choice') {
        if (!q.options || q.options.length < 2) problems.push(`${label} needs at least two options.`);
        else if (!q.options.map(String).includes(String(q.correctAnswer)) && !(Number.isInteger(Number(q.correctAnswer)) && q.options[Number(q.correctAnswer)] !== undefined)) {
          problems.push(`${label}: the correct answer isn't one of the options.`);
        }
      }
    } else if (q.type === 'open-response') {
      const criteria = q.rubric?.criteria || [];
      if (!criteria.length) problems.push(`${label} (open response) needs a rubric with at least one criterion.`);
      for (const c of criteria) {
        if (!c.levels?.length) problems.push(`${label}: rubric criterion "${c.title}" has no levels.`);
        const top = Math.max(0, ...(c.levels || []).map((l) => l.points));
        if (top !== c.maxPoints) problems.push(`${label}: rubric criterion "${c.title}" has max ${c.maxPoints} points but its best level gives ${top}.`);
      }
    }
    if (questionPoints(q) <= 0) problems.push(`${label} is worth no points.`);
  });
  return problems;
}

// Publishes the working copy as the next version. Idempotent: publishing with
// no changes since the last version returns that version.
export async function publishAssessment(assessment: AssessmentDoc, by: string) {
  if (assessment.lifecycle === 'archived') throw new AppError('Restore the assessment before publishing it', 409, 'ASSESSMENT_ARCHIVED');
  const problems = publishProblems(assessment);
  if (problems.length) throw new AppError(problems.join(' '), 400, 'ASSESSMENT_INVALID');
  if (assessment.lifecycle === 'published' && assessment.publishedVersion > 0 && !assessment.hasUnpublishedChanges) {
    return AssessmentVersion.findOne({ assessmentId: assessment.id, version: assessment.publishedVersion }).lean();
  }
  const version = (assessment.publishedVersion || 0) + 1;
  const questions = assessment.questions.map((q) => (typeof (q as any).toObject === 'function' ? (q as any).toObject() : q));
  const snapshot = await AssessmentVersion.create({
    assessmentId: assessment.id,
    institutionId: assessment.institutionId,
    version,
    title: assessment.title,
    subject: assessment.subject,
    instructions: assessment.instructions,
    duration: assessment.duration,
    questions,
    totalPoints: questions.reduce((n: number, q: IQuestion) => n + questionPoints(q), 0),
    publishedBy: by,
    publishedAt: new Date(),
  });
  assessment.publishedVersion = version;
  assessment.lifecycle = 'published';
  assessment.hasUnpublishedChanges = false;
  assessment.updatedBy = by;
  await assessment.save();
  return snapshot.toObject();
}

export async function getVersion(assessmentId: string, version: number) {
  const v = await AssessmentVersion.findOne({ assessmentId, version }).lean();
  if (!v) throw new AppError('Assessment version not found', 404, 'VERSION_NOT_FOUND');
  return v;
}

// The question set students get: the latest published version, or (for
// assessments created before versioning) the document itself.
export async function studentFacingContent(assessment: AssessmentDoc) {
  if (assessment.publishedVersion > 0) {
    const v = await getVersion(assessment.id, assessment.publishedVersion);
    return { version: v.version, title: v.title, questions: v.questions as IQuestion[] };
  }
  return { version: undefined, title: assessment.title, questions: assessment.questions as IQuestion[] };
}
