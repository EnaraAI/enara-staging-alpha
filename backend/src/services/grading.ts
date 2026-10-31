import { AppError } from '../middleware/errorHandler';
import { AssessmentAttempt, type IAttemptAnswer } from '../models/AssessmentAttempt';
import type { IQuestion } from '../models/Assessment';
import { gradeAnswer } from './assessmentSecurity';
import { AUTO_GRADED, questionPoints } from './assessmentVersions';
import { recordLearningEvents } from './learningEvents';
import { processStudentEvidenceSafely } from './evidenceProcessor';
import { logger } from '../utils/logging';
import { getFeatureFlags } from './featureFlags';

// Grading for assignment attempts (grading-v2). Objective questions are scored
// here by the answer key. Everything else is graded automatically by
// autoGrading.ts (queued → in progress → finalized + released, or an
// exception), with no teacher approval in the way. The functions below are
// shared with the teacher paths: grading an exception by hand, older
// attempts, and schools that grade open answers by hand. A released result
// changes only through a correction with a reason.
export const GRADING_VERSION = 'grading-v2';

export function gradeAnswers(questions: IQuestion[], answers: Record<string, string | number>): IAttemptAnswer[] {
  return questions.map((q) => {
    const studentAnswer = answers[q.id] ?? '';
    const maxPoints = questionPoints(q);
    if (AUTO_GRADED.has(q.type)) {
      const isCorrect = gradeAnswer(q, answers[q.id]);
      return {
        questionId: q.id,
        questionText: q.text,
        topic: q.topic,
        studentAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
        points: isCorrect ? maxPoints : 0,
        maxPoints,
        method: 'rule' as const,
      };
    }
    // Open response: kept exactly as written; scored by a person.
    return {
      questionId: q.id,
      questionText: q.text,
      topic: q.topic,
      studentAnswer,
      isCorrect: false,
      explanation: q.explanation,
      points: null,
      maxPoints,
      needsReview: String(studentAnswer).trim().length > 0,
      ...(String(studentAnswer).trim().length === 0 ? { points: 0, method: 'rule' as const, feedback: 'No answer was given.' } : {}),
    };
  });
}

export function totals(answers: Pick<IAttemptAnswer, 'points' | 'maxPoints'>[]) {
  const max = answers.reduce((n, a) => n + (a.maxPoints || 0), 0);
  const scored = answers.every((a) => typeof a.points === 'number');
  const total = answers.reduce((n, a) => n + (a.points || 0), 0);
  return { totalPoints: total, maxPoints: max, complete: scored, percent: max ? Math.round((total / max) * 100) : 0 };
}

export function gradingStatusAfterScoring(answers: IAttemptAnswer[]): 'needs_review' | 'graded_draft' {
  return answers.some((a) => a.needsReview || typeof a.points !== 'number') ? 'needs_review' : 'graded_draft';
}

type AttemptDoc = InstanceType<typeof AssessmentAttempt>;

// Confirms the grades (teacher path: exceptions, older or hand-graded
// attempts). Learning evidence follows from the final points.
export async function finalizeAttempt(attempt: AttemptDoc, by: string, questions: IQuestion[], subject?: string) {
  if (attempt.gradingStatus === 'finalized' || attempt.gradingStatus === 'released') return attempt;
  const pending = attempt.answers.filter((a) => typeof a.points !== 'number');
  if (pending.length) throw new AppError(`${pending.length} answer(s) still need points`, 409, 'GRADING_INCOMPLETE');
  const t = totals(attempt.answers);
  const now = new Date();
  const updated = await AssessmentAttempt.findOneAndUpdate(
    { id: attempt.id, gradingStatus: { $in: ['graded_draft', 'needs_review', 'grading_exception'] } },
    {
      $set: {
        gradingStatus: 'finalized',
        finalizedAt: now,
        finalizedBy: by,
        totalPoints: t.totalPoints,
        maxPoints: t.maxPoints,
        score: t.percent,
        'answers.$[].needsReview': false,
        intelligenceStatus: 'pending',
      },
      $unset: { gradingLeaseUntil: 1, nextGradingAt: 1 },
      $push: { history: { at: now, by, action: 'finalized', to: { totalPoints: t.totalPoints, maxPoints: t.maxPoints } } },
    },
    { new: true },
  );
  if (!updated) {
    const current = await AssessmentAttempt.findOne({ id: attempt.id });
    if (current && (current.gradingStatus === 'finalized' || current.gradingStatus === 'released')) return current;
    throw new AppError('This attempt cannot be finalized now', 409, 'INVALID_GRADING_STATE');
  }
  await updateLearningIntelligence(updated.id, questions, subject);
  return updated;
}

export async function releaseAttempt(attempt: AttemptDoc, by: string) {
  if (attempt.gradingStatus === 'released') return attempt;
  const now = new Date();
  const updated = await AssessmentAttempt.findOneAndUpdate(
    { id: attempt.id, gradingStatus: 'finalized' },
    { $set: { gradingStatus: 'released', releasedAt: now }, $push: { history: { at: now, by, action: 'released' } } },
    { new: true },
  );
  if (!updated) {
    const current = await AssessmentAttempt.findOne({ id: attempt.id });
    if (current?.gradingStatus === 'released') return current;
    throw new AppError('Only finalized results can be released', 409, 'INVALID_GRADING_STATE');
  }
  return updated;
}

// Phase 2 evidence from final grades. Answer-key results as before; points
// set by a teacher count as teacher-graded; points set by the automatic
// grader (after validation) as AI-graded. Questions without objective links
// give no objective evidence. Idempotent (event keys); throws on failure so
// the caller can retry it on its own.
export async function recordAttemptEvidence(attempt: AttemptDoc, questions: IQuestion[], subject?: string) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const at = attempt.submittedAt || new Date();
  // Rubric criteria scored separately (open responses graded by the automatic
  // grader or a teacher) give evidence for their own objectives at their own
  // score (P21); before, every objective on the question got the whole question's
  // score. Objectives also tagged on the question itself stay question-level.
  const criterionEvents = attempt.answers.flatMap((a) => {
    const q = byId.get(a.questionId);
    if (!q?.rubric?.criteria?.length || !a.criterionScores?.length || a.method === 'rule') return [];
    const questionLevel = new Set(q.objectiveIds || []);
    return q.rubric.criteria.flatMap((c) => {
      const objectiveIds = (c.objectiveIds || []).filter((o) => !questionLevel.has(o));
      const scored = a.criterionScores!.find((cs) => cs.criterionId === c.id);
      const max = Math.max(0, ...(c.levels || []).map((l) => l.points || 0));
      if (!objectiveIds.length || !scored || !max) return [];
      const fraction = Math.min(1, Math.max(0, (scored.points || 0) / max));
      return [{
        objectiveIds,
        idempotencyKey: `attempt:${attempt.id}:q:${a.questionId}:c:${c.id}`,
        studentId: attempt.studentId,
        institutionId: attempt.institutionId,
        type: 'question_answered' as const,
        source: 'assessment' as const,
        verified: true,
        gradedBy: a.method === 'ai' ? ('ai' as const) : ('teacher' as const),
        subject: subject || attempt.subject,
        topic: a.topic || undefined,
        refs: { assessmentId: attempt.assessmentId, attemptId: attempt.id, questionId: a.questionId, assignmentId: attempt.assignmentId, criterionId: c.id },
        outcome: { correct: fraction >= 1, score: Math.round(fraction * 1000) / 1000 },
        at,
      }];
    });
  });
  const criterionScored = (q: IQuestion | undefined, a: (typeof attempt.answers)[number]) =>
    Boolean(q?.rubric?.criteria?.length && a.criterionScores?.length && a.method !== 'rule');
  await recordLearningEvents([
    ...criterionEvents,
    ...attempt.answers.map((a) => {
      const q = byId.get(a.questionId);
      const objectiveIds = criterionScored(q, a)
        ? [...new Set(q?.objectiveIds || [])]
        : [...new Set([...(q?.objectiveIds || []), ...(q?.rubric?.criteria || []).flatMap((c) => c.objectiveIds || [])])];
      const byRule = a.method === 'rule';
      const byAi = a.method === 'ai';
      const fraction = a.maxPoints ? (a.points || 0) / a.maxPoints : 0;
      return {
        objectiveIds,
        idempotencyKey: `attempt:${attempt.id}:q:${a.questionId}`,
        studentId: attempt.studentId,
        institutionId: attempt.institutionId,
        type: 'question_answered' as const,
        source: 'assessment' as const,
        verified: true,
        gradedBy: byRule ? ('rule' as const) : byAi ? ('ai' as const) : ('teacher' as const),
        subject: subject || attempt.subject,
        topic: a.topic || undefined,
        refs: { assessmentId: attempt.assessmentId, attemptId: attempt.id, questionId: a.questionId, assignmentId: attempt.assignmentId },
        outcome: byRule
          ? { correct: a.isCorrect, answer: String(a.studentAnswer ?? '').slice(0, 200) }
          : { correct: fraction >= 1, score: Math.round(fraction * 1000) / 1000 },
        at,
      };
    }),
    {
      studentId: attempt.studentId,
      institutionId: attempt.institutionId,
      type: 'assessment_submitted' as const,
      source: 'assessment' as const,
      verified: true,
      gradedBy: (attempt.answers.some((a) => a.method === 'teacher' || a.method === 'ai_proposal') ? 'teacher' : attempt.answers.some((a) => a.method === 'ai') ? 'ai' : 'rule') as 'teacher' | 'ai' | 'rule',
      subject: subject || attempt.subject,
      refs: { assessmentId: attempt.assessmentId, attemptId: attempt.id, assignmentId: attempt.assignmentId },
      outcome: { score: attempt.score },
      objectiveIds: [],
      idempotencyKey: `attempt:${attempt.id}:submitted`,
      at,
    },
  ], { throwOnError: true });
  await processStudentEvidenceSafely(attempt.studentId);
}

const MAX_INTELLIGENCE_ATTEMPTS = 5;

// After a grade is final: Phase 2 evidence (mastery, misconceptions, review
// scheduling follow from it) and the student's study plan. A failure here
// never touches the grade; the attempt is marked and the sweep retries it.
export async function updateLearningIntelligence(attemptId: string, questions?: IQuestion[], subject?: string) {
  const attempt = await AssessmentAttempt.findOne({ id: attemptId });
  if (!attempt || (attempt.gradingStatus !== 'finalized' && attempt.gradingStatus !== 'released')) return false;
  try {
    let qs = questions;
    if (!qs) {
      const { getVersion } = await import('./assessmentVersions');
      const v = await getVersion(attempt.assessmentId, attempt.assessmentVersion!);
      qs = v.questions as IQuestion[];
      subject ??= v.subject;
    }
    await recordAttemptEvidence(attempt, qs, subject);
    const flags = attempt.institutionId ? await getFeatureFlags(attempt.institutionId) : null;
    if (flags?.study_plans_enabled) {
      const { replan } = await import('./studyPlans');
      await replan({ id: attempt.studentId, institutionId: attempt.institutionId }, `graded:${attempt.id}`);
    }
    await AssessmentAttempt.updateOne({ id: attempt.id }, { $set: { intelligenceStatus: 'done', intelligenceUpdatedAt: new Date() }, $push: { history: { at: new Date(), by: 'system:intelligence', action: 'learning_intelligence_updated' } } });
    return true;
  } catch (error) {
    const tries = (attempt.intelligenceAttempts ?? 0) + 1;
    logger.warn('learning_intelligence_failed', { attemptId: attempt.id, tries, error: String((error as Error).message) });
    await AssessmentAttempt.updateOne({ id: attempt.id }, { $set: { intelligenceStatus: 'failed', intelligenceUpdatedAt: new Date(), intelligenceAttempts: tries } });
    return false;
  }
}

// Retries Phase 2 updates that failed (or never ran), without regrading.
export async function sweepLearningIntelligence(limit = 50) {
  const due = await AssessmentAttempt.find({
    gradingStatus: { $in: ['finalized', 'released'] },
    intelligenceStatus: { $in: ['pending', 'failed'] },
    $or: [{ intelligenceAttempts: { $exists: false } }, { intelligenceAttempts: { $lt: MAX_INTELLIGENCE_ATTEMPTS } }],
    intelligenceUpdatedAt: { $not: { $gt: new Date(Date.now() - 60_000) } },
  }).select('id').limit(limit).lean();
  let ok = 0;
  for (const t of due) if (await updateLearningIntelligence(t.id)) ok += 1;
  return { tried: due.length, updated: ok };
}
