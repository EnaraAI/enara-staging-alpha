import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireInstitutionId } from '../auth/authorization';
import { AssessmentAttempt, type IAttemptAnswer } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import type { IQuestion } from '../models/Assessment';
import { CourseInstance } from '../models/CourseInstance';
import { GradingProposal } from '../models/GradingProposal';
import { LearningEvent } from '../models/LearningEvent';
import { LearningEvidence } from '../models/LearningEvidence';
import { Student } from '../models/Student';
import { loadAssignmentForStaff } from './assignments.controller';
import { getVersion } from '../services/assessmentVersions';
import { finalizeAttempt, gradingStatusAfterScoring, releaseAttempt, totals } from '../services/grading';
import { kickGrading } from '../services/autoGrading';
import { invalidateEvidence, processStudentEvidenceSafely } from '../services/evidenceProcessor';
import { isFeatureEnabled } from '../services/featureFlags';
import { GRADING_STATUSES, type GradingStatus } from '../models/AssessmentAttempt';
import { recordLearningEvents } from '../services/learningEvents';
import { notifyResultsReleased } from '../services/teachingNotifications';
import { ensurePlainObject, getOptionalNumber, getOptionalString, getRequiredString, rejectMongoOperators } from '../utils/validation';
import { logger } from '../utils/logging';

async function loadAttemptForStaff(req: AuthRequest, attemptId: string) {
  const attempt = await AssessmentAttempt.findOne({ id: attemptId, status: 'submitted', assignmentId: { $exists: true } });
  if (!attempt) throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
  // Same school and, for teachers, a class they instruct (404 otherwise).
  const assignment = await loadAssignmentForStaff(req, attempt.assignmentId!).catch(() => {
    throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
  });
  const version = await getVersion(attempt.assessmentId, attempt.assessmentVersion ?? assignment.assessmentVersion);
  return { attempt, assignment, version, questions: version.questions as IQuestion[] };
}

// Oversight list, most urgent first: exceptions, then hand-graded work,
// grading in progress, and released results (with open appeals on top).
const QUEUE_ORDER: GradingStatus[] = ['grading_exception', 'needs_review', 'graded_draft', 'finalized', 'grading_failed', 'grading_in_progress', 'grading_queued', 'released'];

// GET /api/grading/queue?assignmentId=&classId=&status=&appeals=open
export const getReviewQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const filter: Record<string, unknown> = user.role === 'enara-admin' ? {} : { institutionId: requireInstitutionId(req) };
  if (user.role === 'teacher') {
    const classes = await CourseInstance.find({ institutionId: user.institutionId, instructorIds: user.id }).select('id').lean();
    filter.classId = { $in: classes.map((c) => c.id) };
  }
  if (typeof req.query.classId === 'string') filter.classId = user.role === 'teacher' && !(filter.classId as { $in: string[] }).$in.includes(req.query.classId) ? '__none__' : req.query.classId;
  if (typeof req.query.assignmentId === 'string') filter.id = req.query.assignmentId;
  const assignments = await Assignment.find({ ...filter, state: { $ne: 'archived' } }).select('id title classId dueAt releasePolicy').lean();
  const statuses = typeof req.query.status === 'string' && (GRADING_STATUSES as string[]).includes(req.query.status) ? [req.query.status as GradingStatus] : QUEUE_ORDER;
  const attempts = await AssessmentAttempt.find({
    assignmentId: { $in: assignments.map((a) => a.id) },
    status: 'submitted',
    gradingStatus: { $in: statuses },
    ...(req.query.appeals === 'open' ? { 'appeals.status': 'open' } : {}),
  })
    .select('id assignmentId studentId submittedAt isLate gradingStatus answers.needsReview answers.proposalId answers.method totalPoints maxPoints score exceptionReason gradingError nextGradingAt appeals.status releasedAt')
    .sort({ submittedAt: -1 })
    .limit(500)
    .lean();
  const openAppeals = (t: (typeof attempts)[number]) => (t.appeals ?? []).filter((p) => p.status === 'open').length;
  attempts.sort((x, y) => QUEUE_ORDER.indexOf(x.gradingStatus!) - QUEUE_ORDER.indexOf(y.gradingStatus!) || openAppeals(y) - openAppeals(x));
  // Viewing the list also nudges any grading run that is due.
  kickGrading(attempts.filter((t) => ['grading_queued', 'grading_failed', 'grading_in_progress'].includes(t.gradingStatus!)).map((t) => t.id));
  const names = new Map((await Student.find({ id: { $in: attempts.map((t) => t.studentId) } }).select('id name').lean()).map((s) => [s.id, s.name]));
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const now = Date.now();
  res.json({
    items: attempts.map((t) => ({
      attemptId: t.id,
      assignmentId: t.assignmentId,
      assignmentTitle: byId.get(t.assignmentId!)?.title,
      studentId: t.studentId,
      studentName: names.get(t.studentId),
      submittedAt: t.submittedAt,
      waitingHours: t.submittedAt ? Math.round((now - new Date(t.submittedAt).getTime()) / 3_600_000) : null,
      late: !!t.isLate,
      gradingStatus: t.gradingStatus,
      score: t.gradingStatus === 'released' || t.gradingStatus === 'finalized' ? t.score ?? null : null,
      totalPoints: t.totalPoints ?? null,
      maxPoints: t.maxPoints ?? null,
      gradedByAi: t.answers.filter((a) => a.method === 'ai').length,
      answersToReview: t.answers.filter((a) => a.needsReview).length,
      exceptionReason: t.exceptionReason ?? null,
      error: t.gradingStatus === 'grading_exception' || t.gradingStatus === 'grading_failed' ? t.gradingError ?? null : null,
      nextRetryAt: t.gradingStatus === 'grading_failed' ? t.nextGradingAt ?? null : null,
      openAppeals: openAppeals(t),
      releasedAt: t.releasedAt ?? null,
    })),
    counts: Object.fromEntries(statuses.map((s) => [s, attempts.filter((t) => t.gradingStatus === s).length])),
    openAppeals: attempts.reduce((n, t) => n + openAppeals(t), 0),
  });
});

// GET /api/grading/attempts/:id — everything a reviewer needs.
export const getSubmissionForReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { attempt, assignment, version, questions } = await loadAttemptForStaff(req, String(req.params.id));
  const proposals = await GradingProposal.find({ attemptId: attempt.id }).sort({ createdAt: -1 }).lean();
  const student = await Student.findOne({ id: attempt.studentId }).select('id name').lean();
  res.json({
    assignment: { id: assignment.id, title: assignment.title, releasePolicy: assignment.releasePolicy, dueAt: assignment.dueAt },
    student,
    attempt: {
      id: attempt.id,
      submittedAt: attempt.submittedAt,
      late: !!attempt.isLate,
      gradingStatus: attempt.gradingStatus,
      totalPoints: attempt.totalPoints,
      maxPoints: attempt.maxPoints,
      overallFeedback: attempt.overallFeedback ?? null,
      score: attempt.score ?? null,
      exceptionReason: attempt.exceptionReason ?? null,
      gradingError: attempt.gradingError ?? null,
      gradingRuns: attempt.gradingRuns ?? 0,
      intelligenceStatus: attempt.intelligenceStatus ?? null,
      appeals: attempt.appeals ?? [],
      history: attempt.history,
      // Conversation exams: the full exchange with the AI examiner.
      conversation: attempt.conversation ?? null,
    },
    format: assignment.format ?? 'written',
    version: { version: version.version, totalPoints: version.totalPoints },
    items: questions.map((q) => {
      const answer = attempt.answers.find((a) => a.questionId === q.id);
      return {
        question: q,
        answer,
        // The evaluation the grade came from, and every evaluation made (audit).
        aiProposal: (answer?.proposalId ? proposals.find((p) => p.id === answer.proposalId) : null) ?? proposals.find((p) => p.questionId === q.id) ?? null,
        evaluations: proposals.filter((p) => p.questionId === q.id),
      };
    }),
    aiGradingEnabled: await isFeatureEnabled(attempt.institutionId, 'ai_grading_enabled'),
  });
});

function scoreFromCriteria(q: IQuestion, raw: unknown) {
  const criteria = q.rubric?.criteria || [];
  if (!Array.isArray(raw)) throw new AppError('criterionScores must be a list', 400, 'VALIDATION_ERROR');
  const scores = criteria.map((c) => {
    const item = (raw as Record<string, unknown>[]).find((x) => x?.criterionId === c.id);
    const level = c.levels.find((l) => l.id === item?.levelId);
    if (!level) throw new AppError(`Choose a level for "${c.title}"`, 400, 'VALIDATION_ERROR');
    return { criterionId: c.id, levelId: level.id, points: level.points };
  });
  return { criterionScores: scores, points: scores.reduce((n, s) => n + s.points, 0) };
}

// Points (and rubric levels) for one answer from a request body.
async function resolveScore(q: IQuestion, answer: IAttemptAnswer, body: Record<string, unknown>) {
  if (body.acceptProposal === true) {
    const proposal = answer.proposalId ? await GradingProposal.findOne({ id: answer.proposalId, status: 'proposed' }).lean() : null;
    if (!proposal) throw new AppError('There is no usable AI proposal for this answer', 409, 'NO_PROPOSAL');
    return {
      points: proposal.points!,
      criterionScores: proposal.criteria.map((c) => ({ criterionId: c.criterionId, levelId: c.levelId, points: c.points })),
      feedback: proposal.feedback,
      method: 'ai_proposal' as const,
      proposalPoints: proposal.points,
    };
  }
  const proposal = answer.proposalId ? await GradingProposal.findOne({ id: answer.proposalId, status: 'proposed' }).select('points').lean() : null;
  if (body.criterionScores !== undefined) {
    if (q.type !== 'open-response') throw new AppError('Only open responses have rubric levels', 400, 'VALIDATION_ERROR');
    return { ...scoreFromCriteria(q, body.criterionScores), method: 'teacher' as const, proposalPoints: proposal?.points };
  }
  const points = getOptionalNumber(body, 'points', { min: 0, max: answer.maxPoints ?? 100 });
  if (points === undefined) throw new AppError('Give points, rubric levels, or accept the proposal', 400, 'VALIDATION_ERROR');
  return { points, criterionScores: undefined, method: 'teacher' as const, proposalPoints: proposal?.points };
}

// PUT /api/grading/attempts/:id/answers/:questionId — score one answer.
// Changing an answer-key score, or not following the AI proposal, needs a reason.
export const scoreAnswer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { attempt, questions } = await loadAttemptForStaff(req, String(req.params.id));
  if (attempt.gradingStatus === 'finalized' || attempt.gradingStatus === 'released') {
    throw new AppError('This result is final; use a correction', 409, 'GRADE_FINAL');
  }
  // Teachers score by hand only where the grader stopped (an exception) or
  // the school grades open answers by hand.
  if (!['needs_review', 'graded_draft', 'grading_exception'].includes(attempt.gradingStatus!)) {
    throw new AppError('This submission is being graded automatically', 409, 'GRADING_IN_PROGRESS');
  }
  const questionId = String(req.params.questionId);
  const q = questions.find((x) => x.id === questionId);
  const answer = attempt.answers.find((a) => a.questionId === questionId);
  if (!q || !answer) throw new AppError('Question not found', 404);
  const score = await resolveScore(q, answer, body);
  const reason = getOptionalString(body, 'reason', { max: 500 });
  const overridesRule = answer.method === 'rule' && typeof answer.points === 'number' && score.points !== answer.points;
  const overridesProposal = score.method === 'teacher' && typeof score.proposalPoints === 'number' && score.points !== score.proposalPoints;
  if ((overridesRule || overridesProposal) && !reason) {
    throw new AppError('Give a reason when changing an answer-key score or not following the AI proposal', 400, 'REASON_REQUIRED');
  }
  const feedback = body.feedback !== undefined ? getOptionalString(body, 'feedback', { max: 2000 }) : score.method === 'ai_proposal' ? score.feedback : answer.feedback;
  const now = new Date();
  const action = score.method === 'ai_proposal' ? 'proposal_accepted' : overridesRule || overridesProposal ? 'override' : 'scored';
  const updated = await AssessmentAttempt.findOneAndUpdate(
    { id: attempt.id, gradingStatus: { $in: ['needs_review', 'graded_draft', 'grading_exception'] } },
    {
      $set: {
        'answers.$[a].points': score.points,
        'answers.$[a].method': score.method,
        'answers.$[a].criterionScores': score.criterionScores,
        'answers.$[a].feedback': feedback,
        'answers.$[a].needsReview': false,
      },
      $push: { history: { at: now, by: req.user!.id, action, questionId, from: answer.points ?? null, to: score.points, reason } },
    },
    { arrayFilters: [{ 'a.questionId': questionId }], new: true },
  );
  if (!updated) throw new AppError('This result changed; reload and try again', 409, 'INVALID_GRADING_STATE');
  const t = totals(updated.answers);
  // An exception stays an exception until the teacher finalizes it.
  if (updated.gradingStatus !== 'grading_exception') updated.gradingStatus = gradingStatusAfterScoring(updated.answers);
  updated.totalPoints = t.totalPoints;
  updated.maxPoints = t.maxPoints;
  await AssessmentAttempt.updateOne({ id: updated.id, gradingStatus: { $in: ['needs_review', 'graded_draft', 'grading_exception'] } }, { $set: { gradingStatus: updated.gradingStatus, totalPoints: t.totalPoints, maxPoints: t.maxPoints } });
  logger.info('grading_answer_scored', { attemptId: attempt.id, questionId, action, by: req.user!.id });
  res.json({ gradingStatus: updated.gradingStatus, totalPoints: t.totalPoints, maxPoints: t.maxPoints, answer: updated.answers.find((a) => a.questionId === questionId) });
});

// PUT /api/grading/attempts/:id/feedback { overallFeedback }
export const setOverallFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  const { attempt } = await loadAttemptForStaff(req, String(req.params.id));
  if (attempt.gradingStatus === 'released') throw new AppError('This result is released; use a correction', 409, 'GRADE_FINAL');
  const overallFeedback = getOptionalString(body, 'overallFeedback', { max: 3000 }) ?? '';
  await AssessmentAttempt.updateOne({ id: attempt.id }, { $set: { overallFeedback }, $push: { history: { at: new Date(), by: req.user!.id, action: 'feedback' } } });
  res.json({ overallFeedback });
});

// POST /api/grading/attempts/:id/finalize — for work a teacher graded by
// hand (an exception, or a school that grades open answers by hand).
// Results are released straight away, like automatic grades.
export const finalizeSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { attempt, assignment, questions, version } = await loadAttemptForStaff(req, String(req.params.id));
  let done = await finalizeAttempt(attempt, req.user!.id, questions, version.subject);
  if (done.gradingStatus === 'finalized') {
    done = await releaseAttempt(done, req.user!.id);
    await notifyResultsReleased(assignment, done.studentId, done.id).catch(() => undefined);
  }
  res.json({ gradingStatus: done.gradingStatus, totalPoints: done.totalPoints, maxPoints: done.maxPoints, score: done.score });
});

// POST /api/grading/attempts/:id/release
export const releaseSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { attempt, assignment } = await loadAttemptForStaff(req, String(req.params.id));
  const done = await releaseAttempt(attempt, req.user!.id);
  await notifyResultsReleased(assignment, done.studentId, done.id).catch(() => undefined);
  res.json({ gradingStatus: done.gradingStatus, releasedAt: done.releasedAt });
});

// POST /api/grading/assignments/:assignmentId/release — every finalized result.
export const releaseAssignmentResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assignment = await loadAssignmentForStaff(req, String(req.params.assignmentId));
  const finalized = await AssessmentAttempt.find({ assignmentId: assignment.id, gradingStatus: 'finalized' });
  for (const t of finalized) {
    await releaseAttempt(t, req.user!.id);
    await notifyResultsReleased(assignment, t.studentId, t.id).catch(() => undefined);
  }
  const waiting = await AssessmentAttempt.countDocuments({ assignmentId: assignment.id, gradingStatus: { $in: ['needs_review', 'graded_draft', 'grading_pending'] } });
  res.json({ released: finalized.length, stillToFinalize: waiting });
});

// POST /api/grading/attempts/:id/regrade { reason? } — run the automatic
// grader again on a submission it couldn't grade (exception or failed).
// Released results change only through a correction.
export const regradeSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  const { attempt } = await loadAttemptForStaff(req, String(req.params.id));
  if (attempt.gradingStatus !== 'grading_exception' && attempt.gradingStatus !== 'grading_failed') {
    throw new AppError('Only submissions the grader could not finish can be regraded', 409, 'NOT_REGRADABLE');
  }
  const reason = getOptionalString(body, 'reason', { max: 500 });
  const updated = await AssessmentAttempt.findOneAndUpdate(
    { id: attempt.id, gradingStatus: attempt.gradingStatus },
    {
      $set: { gradingStatus: 'grading_queued', gradingRuns: 0 },
      $unset: { nextGradingAt: 1, exceptionReason: 1, gradingError: 1, gradingLeaseUntil: 1 },
      $push: { history: { at: new Date(), by: req.user!.id, action: 'regrade_requested', reason } },
    },
    { new: true },
  );
  if (!updated) throw new AppError('This submission changed; reload and try again', 409, 'INVALID_GRADING_STATE');
  const { processAttempt } = await import('../services/autoGrading');
  const outcome = await processAttempt(updated.id);
  const now = await AssessmentAttempt.findOne({ id: updated.id }).select('gradingStatus score exceptionReason').lean();
  res.json({ outcome, gradingStatus: now?.gradingStatus, score: now?.score ?? null, exceptionReason: now?.exceptionReason ?? null });
});

// PUT /api/grading/attempts/:id/appeals/:appealId { decision: upheld|rejected, response }
// Upholding records the decision; the grade itself changes only through a
// correction (which can carry appealId).
export const resolveAppeal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { attempt } = await loadAttemptForStaff(req, String(req.params.id));
  const appealId = String(req.params.appealId);
  const appeal = (attempt.appeals ?? []).find((p) => p.id === appealId);
  if (!appeal) throw new AppError('Request not found', 404);
  if (appeal.status !== 'open') throw new AppError('This request was already answered', 409, 'APPEAL_CLOSED');
  const decision = getRequiredString(body, 'decision', { max: 20 });
  if (decision !== 'upheld' && decision !== 'rejected') throw new AppError('decision must be upheld or rejected', 400, 'VALIDATION_ERROR');
  const response = getRequiredString(body, 'response', { max: 1000 });
  const now = new Date();
  await AssessmentAttempt.updateOne(
    { id: attempt.id, appeals: { $elemMatch: { id: appealId, status: 'open' } } },
    {
      $set: { 'appeals.$.status': decision, 'appeals.$.response': response, 'appeals.$.resolvedBy': req.user!.id, 'appeals.$.resolvedAt': now },
      $push: { history: { at: now, by: req.user!.id, action: `appeal_${decision}`, questionId: appeal.questionId, reason: response.slice(0, 500) } },
    },
  );
  res.json({ id: appealId, status: decision, response });
});

// POST /api/grading/attempts/:id/correct { questionId, points | criterionScores, feedback?, reason }
// The only way to change a finalized or released grade. Old evidence is
// invalidated (kept) and new evidence recorded.
export const correctGrade = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { attempt, questions, version } = await loadAttemptForStaff(req, String(req.params.id));
  if (attempt.gradingStatus !== 'finalized' && attempt.gradingStatus !== 'released') {
    throw new AppError('Only final results need a correction; score it instead', 409, 'NOT_FINAL');
  }
  const reason = getRequiredString(body, 'reason', { max: 500 });
  const questionId = getRequiredString(body, 'questionId', { max: 80 });
  const q = questions.find((x) => x.id === questionId);
  const answer = attempt.answers.find((a) => a.questionId === questionId);
  if (!q || !answer) throw new AppError('Question not found', 404);
  const score = await resolveScore(q, answer, { ...body, acceptProposal: false });
  const appealId = getOptionalString(body, 'appealId', { max: 80 });
  if (appealId && !(attempt.appeals ?? []).some((p) => p.id === appealId)) throw new AppError('Request not found', 404);
  const corrections = attempt.history.filter((h) => h.action === 'corrected').length + 1;
  const now = new Date();
  await AssessmentAttempt.updateOne(
    { id: attempt.id },
    {
      $set: {
        // The first final score is kept; history has every step.
        ...(typeof answer.originalPoints !== 'number' && typeof answer.points === 'number' ? { 'answers.$[a].originalPoints': answer.points } : {}),
        'answers.$[a].points': score.points,
        'answers.$[a].method': 'teacher',
        'answers.$[a].criterionScores': score.criterionScores,
        ...(body.feedback !== undefined ? { 'answers.$[a].feedback': getOptionalString(body, 'feedback', { max: 2000 }) } : {}),
      },
      $push: { history: { at: now, by: req.user!.id, action: 'corrected', questionId, from: answer.points, to: score.points, reason: appealId ? `${reason} (request ${appealId})` : reason } },
    },
    { arrayFilters: [{ 'a.questionId': questionId }] },
  );
  const updated = (await AssessmentAttempt.findOne({ id: attempt.id }))!;
  const t = totals(updated.answers);
  await AssessmentAttempt.updateOne({ id: attempt.id }, { $set: { totalPoints: t.totalPoints, maxPoints: t.maxPoints, score: t.percent } });

  // Evidence: invalidate what the old score produced, record the new one.
  const keys = [`attempt:${attempt.id}:q:${questionId}`, ...Array.from({ length: corrections - 1 }, (_, i) => `attempt:${attempt.id}:q:${questionId}:c${i + 1}`)];
  const oldEvents = await LearningEvent.find({ idempotencyKey: { $in: keys } }).select('id').lean();
  const oldEvidence = await LearningEvidence.find({ sourceEventId: { $in: oldEvents.map((e) => e.id) }, invalidatedAt: { $exists: false } }).select('id').lean();
  for (const e of oldEvidence) await invalidateEvidence(e.id, req.user!.id, `grade corrected: ${reason}`);
  const fraction = answer.maxPoints ? score.points / answer.maxPoints : 0;
  const objectiveIds = [...new Set([...(q.objectiveIds || []), ...(q.rubric?.criteria || []).flatMap((c) => c.objectiveIds || [])])];
  await recordLearningEvents([
    {
      studentId: attempt.studentId,
      institutionId: attempt.institutionId,
      type: 'question_answered',
      source: 'assessment',
      verified: true,
      gradedBy: 'teacher',
      subject: version.subject,
      refs: { assessmentId: attempt.assessmentId, attemptId: attempt.id, questionId, assignmentId: attempt.assignmentId },
      outcome: { correct: fraction >= 1, score: Math.round(fraction * 1000) / 1000 },
      objectiveIds,
      idempotencyKey: `attempt:${attempt.id}:q:${questionId}:c${corrections}`,
      at: attempt.submittedAt || now,
    },
  ]);
  await processStudentEvidenceSafely(attempt.studentId);
  logger.info('grade_corrected', { attemptId: attempt.id, questionId, by: req.user!.id });
  res.json({ totalPoints: t.totalPoints, maxPoints: t.maxPoints, score: t.percent, corrections });
});
