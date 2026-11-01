import { Assessment, AssessmentVersion, type AssessmentKind, type IQuestion } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import { LearningEvent } from '../models/LearningEvent';

// Where a piece of learning evidence came from in an examination (P21): the
// assessment and its kind, the question's cognitive level and difficulty, the
// rubric criterion, and who graded it. Read at analysis time from the records
// the evidence already points to (evidence -> event -> attempt -> the exact
// assessment version taken); nothing is copied onto evidence. Missing metadata
// stays missing ('unspecified' kind, unknown level), never guessed.

export interface ExamContext {
  evidenceId: string;
  assessmentId?: string;
  assignmentId?: string;
  attemptId?: string;
  questionId?: string;
  criterionId?: string;
  assessmentKind: AssessmentKind | 'unspecified';
  cognitiveLevel?: number;
  difficulty?: number;
  gradedBy?: 'rule' | 'ai' | 'teacher';
  source?: string;
  subject?: string;
}

export async function examContextFor(evidence: { id: string; sourceEventId: string }[]): Promise<Map<string, ExamContext>> {
  const out = new Map<string, ExamContext>();
  if (!evidence.length) return out;
  const events = await LearningEvent.find({ id: { $in: [...new Set(evidence.map((e) => e.sourceEventId))] } })
    .select('id refs gradedBy source subject')
    .lean();
  const eventById = new Map(events.map((e) => [e.id, e]));
  const attemptIds = [...new Set(events.map((e) => e.refs?.attemptId).filter(Boolean))] as string[];
  const assessmentIds = [...new Set(events.map((e) => e.refs?.assessmentId).filter(Boolean))] as string[];
  const assignmentIds = [...new Set(events.map((e) => e.refs?.assignmentId).filter(Boolean))] as string[];
  const [attempts, assessments, assignments] = await Promise.all([
    attemptIds.length ? AssessmentAttempt.find({ id: { $in: attemptIds } }).select('id assessmentId assessmentVersion').lean() : [],
    assessmentIds.length ? Assessment.find({ id: { $in: assessmentIds } }).select('id assessmentKind questions.id questions.cognitiveLevel questions.difficulty').lean() : [],
    assignmentIds.length ? Assignment.find({ id: { $in: assignmentIds } }).select('id assessmentKind').lean() : [],
  ]);
  const versionKeys = attempts.filter((a) => a.assessmentVersion).map((a) => ({ assessmentId: a.assessmentId, version: a.assessmentVersion! }));
  const versions = versionKeys.length
    ? await AssessmentVersion.find({ $or: versionKeys }).select('assessmentId version questions.id questions.cognitiveLevel questions.difficulty').lean()
    : [];
  const attemptById = new Map(attempts.map((a) => [a.id, a]));
  const assessmentById = new Map(assessments.map((a) => [a.id, a]));
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const versionOf = new Map(versions.map((v) => [`${v.assessmentId}:${v.version}`, v]));
  const question = (questions: Pick<IQuestion, 'id' | 'cognitiveLevel' | 'difficulty'>[] | undefined, id?: string) => questions?.find((q) => q.id === id);

  for (const ev of evidence) {
    const event = eventById.get(ev.sourceEventId);
    const refs = event?.refs ?? {};
    const attempt = refs.attemptId ? attemptById.get(refs.attemptId) : undefined;
    const assessment = refs.assessmentId ? assessmentById.get(refs.assessmentId) : undefined;
    // The questions as taken (the attempt's version); the live assessment only if no version is recorded.
    const taken = attempt?.assessmentVersion ? versionOf.get(`${attempt.assessmentId}:${attempt.assessmentVersion}`)?.questions : assessment?.questions;
    const q = question(taken, refs.questionId);
    const kind = (refs.assignmentId && assignmentById.get(refs.assignmentId)?.assessmentKind) || assessment?.assessmentKind;
    out.set(ev.id, {
      evidenceId: ev.id,
      assessmentId: refs.assessmentId,
      assignmentId: refs.assignmentId,
      attemptId: refs.attemptId,
      questionId: refs.questionId,
      criterionId: refs.criterionId,
      assessmentKind: kind || 'unspecified',
      cognitiveLevel: q?.cognitiveLevel,
      difficulty: q?.difficulty,
      gradedBy: event?.gradedBy,
      source: event?.source,
      subject: event?.subject,
    });
  }
  return out;
}

// Recall right but application wrong, from evidence whose questions carry a
// cognitive level: some level 1-2 answer at least 0.7 and the latest level 3+
// answer below 0.5. undefined when no levelled evidence exists (unknown, not "no").
export function applicationGapFrom(rows: { score: number | null | undefined; level?: number; at: Date }[]): boolean | undefined {
  const levelled = rows.filter((r) => typeof r.level === 'number' && typeof r.score === 'number');
  if (!levelled.length) return undefined;
  const recallOk = levelled.some((r) => r.level! <= 2 && r.score! >= 0.7);
  const latestApply = levelled.filter((r) => r.level! >= 3).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (!latestApply) return undefined;
  return recallOk && latestApply.score! < 0.5;
}
