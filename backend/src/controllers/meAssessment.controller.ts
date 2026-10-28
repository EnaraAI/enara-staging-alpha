import { gradeAnswer } from '../services/assessmentSecurity';
import { processStudentEvidenceSafely } from '../services/evidenceProcessor';
import { recordLearningEvent, recordLearningEvents } from '../services/learningEvents';
import { Response } from 'express';
import { queueQuizMistakes } from '../services/reviewService';
import { forgetLearnerSnapshot } from '../services/learnerSnapshot';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toPlainObject } from '../utils/serialize';
import { Assessment, AssessmentVersion, type IQuestion } from '../models/Assessment';
import { studentFacingContent } from '../services/assessmentVersions';
import { AssessmentAttempt, type IAttemptAnswer } from '../models/AssessmentAttempt';
import { getStudentOrThrow } from '../services/studentCourseService';
import { generateAttemptId } from '../utils/idGenerator';
import { recordUsage } from '../services/creditsService';
import {
  canRevealAnswers,
  hideAnswerKey,
  stripAnswersForStudent,
} from '../services/assessmentSecurity';
import { ensurePlainObject, getOptionalNumber, rejectMongoOperators } from '../utils/validation';

async function getAssignedAssessments(studentId: string) {
  const student = await getStudentOrThrow(studentId);
  const filter: Record<string, unknown>[] = [{ studentId }];
  if (student.batchId) filter.push({ batchId: student.batchId });
  const institutionFilter = student.institutionId ? { institutionId: student.institutionId } : {};
  // Drafts and archived assessments are never shown to students.
  return Assessment.find({ ...institutionFilter, $or: filter, lifecycle: { $nin: ['draft', 'archived'] } }).sort({ createdAt: -1 }).limit(100);
}

type AssessmentDoc = InstanceType<typeof Assessment>;

// The assessment as students may see it: published questions only, no key.
function studentView(assessment: AssessmentDoc, content: { title: string; questions: IQuestion[] }) {
  const base = stripAnswersForStudent(assessment);
  const questions = content.questions.map((q) => {
    const { correctAnswer, explanation, modelAnswer, distractors, source, ...rest } = (typeof (q as any).toObject === 'function' ? (q as any).toObject() : q) as IQuestion & Record<string, unknown>;
    return rest;
  });
  return { ...base, title: content.title, questions };
}

// Published content for many assessments at once (list view).
async function publishedContentMap(assessments: AssessmentDoc[]) {
  const versioned = assessments.filter((a) => a.publishedVersion > 0);
  const versions = versioned.length
    ? await AssessmentVersion.find({ $or: versioned.map((a) => ({ assessmentId: a.id, version: a.publishedVersion })) }).lean()
    : [];
  const byId = new Map(versions.map((v) => [v.assessmentId, { title: v.title, questions: v.questions as IQuestion[] }]));
  return new Map(assessments.map((a) => [a.id, byId.get(a.id) ?? { title: a.title, questions: a.questions as IQuestion[] }]));
}

// Open responses need a teacher or AI-assisted grading: only through assignments.
function assertAutoGradable(questions: IQuestion[]) {
  if (questions.some((q) => q.type === 'open-response')) {
    throw new AppError('This assessment has open-response questions; it must be given as an assignment', 409, 'NEEDS_ASSIGNMENT');
  }
}

function assertAssessmentCanBeStarted(assessment: InstanceType<typeof Assessment>) {
  if (!['active', 'in-progress'].includes(assessment.status)) {
    throw new AppError('Assessment is not open', 403, 'ASSESSMENT_NOT_OPEN');
  }
}

async function submittedCount(studentId: string, assessmentId: string) {
  return AssessmentAttempt.countDocuments({ studentId, assessmentId, status: 'submitted' });
}

// Answers as the student may see them: the key only once it can't help a retake.
function answersForStudent(answers: IAttemptAnswer[], reveal: boolean) {
  const plain = answers.map((a) => (typeof (a as any).toObject === 'function' ? (a as any).toObject() : { ...a }));
  return reveal ? plain : hideAnswerKey(plain);
}

// For a list of attempts: which assessments may show their answer key.
async function revealMap(studentId: string, assessmentIds: string[]) {
  const ids = [...new Set(assessmentIds)];
  const [assessments, counts] = await Promise.all([
    Assessment.find({ id: { $in: ids } }).select('id status dueDate maxAttempts answerReveal'),
    AssessmentAttempt.aggregate<{ _id: string; n: number }>([
      { $match: { studentId, assessmentId: { $in: ids }, status: 'submitted' } },
      { $group: { _id: '$assessmentId', n: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(assessments.map((a) => [a.id, a]));
  const countById = new Map(counts.map((c) => [c._id, c.n]));
  return new Map(ids.map((id) => [id, canRevealAnswers(byId.get(id), countById.get(id) || 0)]));
}

function normalizeSubmittedAnswers(raw: unknown): Record<string, string | number> {
  const answers = ensurePlainObject(raw || {}, 'answers');
  const normalized: Record<string, string | number> = {};
  for (const [questionId, answer] of Object.entries(answers)) {
    if (typeof answer !== 'string' && typeof answer !== 'number') {
      throw new AppError(`answers.${questionId} is invalid`, 400, 'VALIDATION_ERROR');
    }
    normalized[questionId] = answer;
  }
  return normalized;
}

export const listMyAssessments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const { status } = req.query;
  let assessments = await getAssignedAssessments(studentId);

  if (status && status !== 'all') {
    assessments = assessments.filter((a) => a.status === status);
  }

  // Oldest first, so the map keeps each assessment's latest attempt.
  const attempts = await AssessmentAttempt.find({ studentId }).sort({ createdAt: 1 });
  const byAssessment = new Map(attempts.map((a) => [a.assessmentId, a]));
  const used = new Map<string, number>();
  for (const a of attempts) if (a.status === 'submitted') used.set(a.assessmentId, (used.get(a.assessmentId) || 0) + 1);

  const content = await publishedContentMap(assessments);
  res.json(
    assessments.map((a) => {
      const attempt = byAssessment.get(a.id);
      const view = studentView(a, content.get(a.id)!);
      return {
        ...view,
        questionCount: content.get(a.id)!.questions.length,
        attemptStatus: attempt?.status,
        attemptScore: attempt?.score,
        attemptId: attempt?.id,
        attemptsUsed: used.get(a.id) || 0,
        maxAttempts: a.maxAttempts || 1,
      };
    })
  );
});

export const getMyAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const assessments = await getAssignedAssessments(studentId);
  const assessment = assessments.find((a) => a.id === String(req.params.id));
  if (!assessment) throw new AppError('Assessment not found', 404);

  const attempt = await AssessmentAttempt.findOne({
    studentId,
    assessmentId: assessment.id,
  }).sort({ createdAt: -1 });

  const reveal = canRevealAnswers(assessment, await submittedCount(studentId, assessment.id));
  res.json({
    assessment: studentView(assessment, await studentFacingContent(assessment)),
    attempt: attempt ? { ...toPlainObject(attempt), answers: answersForStudent(attempt.answers, reveal) } : null,
  });
});

export const startAssessmentAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const assessmentId = String(req.params.id);
  const assessments = await getAssignedAssessments(studentId);
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (!assessment) throw new AppError('Assessment not found', 404);
  assertAssessmentCanBeStarted(assessment);
  const content = await studentFacingContent(assessment);
  assertAutoGradable(content.questions);

  let attempt = await AssessmentAttempt.findOne({
    studentId,
    assessmentId,
    status: 'in-progress',
  });

  if (!attempt) {
    const used = await submittedCount(studentId, assessmentId);
    if (used >= (assessment.maxAttempts || 1)) {
      throw new AppError('You have used all your attempts for this assessment', 403, 'ATTEMPT_LIMIT_REACHED');
    }
    attempt = await AssessmentAttempt.create({
      id: generateAttemptId(),
      assessmentId: assessment.id,
      assessmentTitle: assessment.title,
      subject: assessment.subject,
      studentId,
      institutionId: assessment.institutionId,
      status: 'in-progress',
      answers: [],
      assessmentVersion: content.version,
      startedAt: new Date(),
    }).catch(async (error) => {
      // Two starts at once: the unique open-attempt index keeps one; use it.
      if ((error as { code?: number }).code !== 11000) throw error;
      return AssessmentAttempt.findOne({ studentId, assessmentId, status: 'in-progress' });
    });
    if (!attempt) throw new AppError('Could not start the attempt', 409, 'ATTEMPT_CONFLICT');
    await recordLearningEvent({
      studentId,
      institutionId: assessment.institutionId,
      type: 'assessment_started',
      source: 'assessment',
      verified: true,
      subject: assessment.subject,
      refs: { assessmentId: assessment.id, attemptId: attempt.id },
      idempotencyKey: `attempt:${attempt.id}:started`,
    });
  }

  res.status(201).json({
    attempt: toPlainObject(attempt),
    assessment: studentView(assessment, content),
  });
});

export const submitAssessmentAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const assessmentId = String(req.params.id);
  const attemptId = String(req.params.attemptId);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const answers = normalizeSubmittedAnswers(body.answers);
  const timeSpentSec = getOptionalNumber(body, 'timeSpentSec', { min: 0, max: 24 * 60 * 60 });

  const assessments = await getAssignedAssessments(studentId);
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (!assessment) throw new AppError('Assessment not found', 404);
  assertAssessmentCanBeStarted(assessment);
  // Grade against the version the attempt was started on.
  const open = await AssessmentAttempt.findOne({ id: attemptId, studentId, assessmentId }).select('assessmentVersion').lean();
  const questions: IQuestion[] = open?.assessmentVersion
    ? ((await AssessmentVersion.findOne({ assessmentId, version: open.assessmentVersion }).lean())?.questions as IQuestion[] | undefined) ?? (await studentFacingContent(assessment)).questions
    : (await studentFacingContent(assessment)).questions;
  assertAutoGradable(questions);

  const graded = questions.map((q) => {
    const studentAnswer = answers[q.id];
    const isCorrect = gradeAnswer(q, studentAnswer);
    return {
      questionId: q.id,
      questionText: q.text,
      topic: q.topic,
      studentAnswer: studentAnswer ?? '',
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation,
    };
  });

  const correctCount = graded.filter((g) => g.isCorrect).length;
  const score =
    questions.length === 0
      ? 0
      : Math.round((correctCount / questions.length) * 100);

  const submittedAt = new Date();
  // Claim the open attempt atomically: a second, parallel submit finds nothing to claim.
  const attempt = await AssessmentAttempt.findOneAndUpdate(
    { id: attemptId, studentId, assessmentId, status: 'in-progress' },
    { $set: { answers: graded, score, status: 'submitted', submittedAt, timeSpentSec } },
    { new: true },
  );
  if (!attempt) {
    const exists = await AssessmentAttempt.exists({ id: attemptId, studentId, assessmentId });
    if (!exists) throw new AppError('Attempt not found', 404);
    throw new AppError('Attempt already submitted', 409, 'ATTEMPT_ALREADY_SUBMITTED');
  }
  const reopen = () =>
    AssessmentAttempt.updateOne(
      { id: attempt.id, status: 'submitted' },
      { $set: { status: 'in-progress', answers: [] }, $unset: { score: 1, submittedAt: 1, timeSpentSec: 1 } },
    );

  const used = await submittedCount(studentId, assessmentId);
  if (used > (assessment.maxAttempts || 1)) {
    await reopen();
    throw new AppError('You have used all your attempts for this assessment', 403, 'ATTEMPT_LIMIT_REACHED');
  }

  try {
    await recordUsage({
      userId: req.user!.id,
      studentId,
      feature: 'assessment',
      sessionId: attempt.id,
    });
  } catch (err) {
    // Not graded if it couldn't be paid for: the student can submit again later.
    await reopen();
    throw new AppError((err as Error).message, 402, 'CREDIT_LIMIT_EXCEEDED');
  }
  const reveal = canRevealAnswers(assessment, used);

  // Evidence: each answer was checked against the key by the server.
  const at = attempt.submittedAt || new Date();
  const objectivesByQuestion = new Map(questions.map((q) => [q.id, q.objectiveIds || []]));
  await recordLearningEvents([
    ...graded.map((g) => ({
      objectiveIds: objectivesByQuestion.get(g.questionId) || [],
      idempotencyKey: `attempt:${attempt.id}:q:${g.questionId}`,
      studentId,
      institutionId: assessment.institutionId,
      type: 'question_answered' as const,
      source: 'assessment' as const,
      verified: true,
      gradedBy: 'rule' as const,
      subject: assessment.subject,
      topic: g.topic || assessment.subject || undefined,
      refs: { assessmentId: assessment.id, attemptId: attempt.id, questionId: g.questionId },
      outcome: { correct: g.isCorrect, answer: String(g.studentAnswer ?? '').slice(0, 200) },
      at,
    })),
    {
      studentId,
      institutionId: assessment.institutionId,
      type: 'assessment_submitted' as const,
      source: 'assessment' as const,
      verified: true,
      gradedBy: 'rule' as const,
      subject: assessment.subject,
      refs: { assessmentId: assessment.id, attemptId: attempt.id },
      outcome: { score },
      objectiveIds: [...new Set([...objectivesByQuestion.values()].flat())],
      idempotencyKey: `attempt:${attempt.id}:submitted`,
      durationMs: typeof timeSpentSec === 'number' ? timeSpentSec * 1000 : undefined,
      at,
    },
  ]);

  await processStudentEvidenceSafely(studentId);

  // Missed questions come back as spaced review (which shows the right answer,
  // so only once the key may be shown); weak topics feed the review offer.
  if (reveal) await queueQuizMistakes({
    studentId,
    institutionId: attempt.institutionId,
    assessmentId: assessment.id,
    subject: assessment.subject,
    answers: graded,
    options: Object.fromEntries(questions.map((q) => [q.id, q.options])),
  });
  forgetLearnerSnapshot(studentId);
  const topicStats = new Map<string, { topic: string; correct: number; total: number }>();
  for (const g of graded) {
    const topic = g.topic || assessment.subject || assessment.title;
    const t = topicStats.get(topic) || { topic, correct: 0, total: 0 };
    t.total += 1;
    if (g.isCorrect) t.correct += 1;
    topicStats.set(topic, t);
  }
  const weakTopics = [...topicStats.values()].filter((t) => t.correct / t.total < 0.7);

  res.json({
    id: attempt.id,
    assessmentId: assessment.id,
    assessmentTitle: assessment.title,
    weakTopics,
    score,
    correctCount,
    total: questions.length,
    timeSpentSec,
    answers: answersForStudent(graded, reveal),
    answersRevealed: reveal,
    attemptsUsed: used,
    maxAttempts: assessment.maxAttempts || 1,
    date: attempt.submittedAt?.toISOString(),
  });
});

export const listMyResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const results = await AssessmentAttempt.find({
    studentId,
    status: 'submitted',
  }).sort({ submittedAt: -1 });
  const reveal = await revealMap(studentId, results.map((r) => r.assessmentId));

  res.json(
    results.map((r) => ({
      id: r.id,
      assessmentId: r.assessmentId,
      assessmentTitle: r.assessmentTitle,
      subject: r.subject,
      score: r.score,
      date: r.submittedAt,
      timeSpentSec: r.timeSpentSec,
      answers: answersForStudent(r.answers, reveal.get(r.assessmentId) ?? false),
      answersRevealed: reveal.get(r.assessmentId) ?? false,
    }))
  );
});

export const getMyResult = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const result = await AssessmentAttempt.findOne({
    id: String(req.params.id),
    studentId,
    status: 'submitted',
  });
  if (!result) throw new AppError('Result not found', 404);
  const reveal = (await revealMap(studentId, [result.assessmentId])).get(result.assessmentId) ?? false;

  res.json({
    id: result.id,
    assessmentId: result.assessmentId,
    assessmentTitle: result.assessmentTitle,
    subject: result.subject,
    score: result.score,
    date: result.submittedAt,
    timeSpentSec: result.timeSpentSec,
    answers: answersForStudent(result.answers, reveal),
    answersRevealed: reveal,
  });
});

export const getResultsAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const results = await AssessmentAttempt.find({
    studentId,
    status: 'submitted',
  }).sort({ submittedAt: 1 });

  const bySubject: Record<string, number[]> = {};
  const topicStats: Record<string, { correct: number; total: number }> = {};

  for (const result of results) {
    const subject = result.subject || 'General';
    if (!bySubject[subject]) bySubject[subject] = [];
    if (typeof result.score === 'number') bySubject[subject].push(result.score);

    for (const answer of result.answers) {
      const topic = answer.topic || result.subject || 'General';
      if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 };
      topicStats[topic].total += 1;
      if (answer.isCorrect) topicStats[topic].correct += 1;
    }
  }

  const historicalData = results.map((r) => ({
    assessmentId: r.assessmentId,
    title: r.assessmentTitle,
    subject: r.subject,
    score: r.score,
    date: r.submittedAt,
  }));

  const topicBreakdown = Object.entries(topicStats).map(([topic, stats]) => ({
    topic,
    accuracy: stats.total === 0 ? 0 : Math.round((stats.correct / stats.total) * 100),
    correct: stats.correct,
    total: stats.total,
  }));

  const subjectAverages = Object.entries(bySubject).map(([subject, scores]) => ({
    subject,
    avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    attempts: scores.length,
  }));

  res.json({
    historicalData,
    topicBreakdown,
    subjectAverages,
    averageScore:
      results.length === 0
        ? 0
        : Math.round(
            results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length
          ),
  });
});
