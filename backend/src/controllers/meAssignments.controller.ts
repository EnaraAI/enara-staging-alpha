import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { randomUUID } from 'crypto';
import { AssessmentAttempt, type IAppeal, type IAttemptAnswer } from '../models/AssessmentAttempt';
import { Assignment, type IAssignment } from '../models/Assignment';
import type { IQuestion } from '../models/Assessment';
import { getEnrolledInstances } from '../services/studentCourseService';
import { getVersion, questionPoints } from '../services/assessmentVersions';
import { dueFor, lastSubmissionFor, studentStatus, submissionWindow } from '../services/assignments';
import { gradeAnswers, totals } from '../services/grading';
import { kickGrading, needsAiEvaluation, startGrading } from '../services/autoGrading';
import { isFeatureEnabled } from '../services/featureFlags';
import { recordLearningEvent } from '../services/learningEvents';
import { generateAttemptId } from '../utils/idGenerator';
import { CONVERSATION_QUESTION_TYPES, MAX_REPLY_CHARS, answerFor, decideFollowUp, nextTurns } from '../services/conversationExam';
import { ensurePlainObject, getOptionalString, getRequiredString, rejectMongoOperators } from '../utils/validation';
import { evidenceFor, publicSettings } from '../services/speakingExam';

// Network and clock tolerance around deadlines and time limits.
export const GRACE_MS = 2 * 60 * 1000;

async function visibleAssignments(studentId: string) {
  const classes = await getEnrolledInstances(studentId);
  const items = await Assignment.find({ classId: { $in: classes.map((c) => c.id) }, state: { $in: ['published', 'closed'] } })
    .sort({ dueAt: 1 })
    .limit(200);
  return items.filter((a) => !a.studentIds?.length || a.studentIds.includes(studentId));
}

export async function loadMine(studentId: string, id: string) {
  const a = (await visibleAssignments(studentId)).find((x) => x.id === id);
  if (!a) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  return a;
}

function normalizeAnswers(raw: unknown): Record<string, string | number> {
  const answers = ensurePlainObject(raw || {}, 'answers');
  rejectMongoOperators(answers, 'answers');
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (k.length > 80 || (typeof v !== 'string' && typeof v !== 'number') || String(v).length > 20000) {
      throw new AppError(`answers.${k} is invalid`, 400, 'VALIDATION_ERROR');
    }
    out[k] = v;
  }
  return out;
}

// Questions as students see them: no keys, explanations or private material.
function questionsForStudent(questions: IQuestion[]) {
  return questions.map((q) => {
    const plain = (typeof (q as any).toObject === 'function' ? (q as any).toObject() : { ...q }) as IQuestion & Record<string, unknown>;
    const { correctAnswer, explanation, modelAnswer, distractors, source, ...rest } = plain;
    return { ...rest, points: questionPoints(q) };
  });
}

// When the student may see correct answers on their released result.
function mayRevealKey(a: IAssignment, studentId: string, submittedCount: number, now = new Date()) {
  if (a.answerReveal === 'never') return false;
  const closed = a.state === 'closed' || now > lastSubmissionFor(a, studentId);
  if (a.answerReveal === 'after-close') return closed;
  return closed || submittedCount >= a.maxAttempts;
}

type AttemptLike = { id: string; status: string; gradingStatus?: string; submittedAt?: Date | null; isLate?: boolean; answers: IAttemptAnswer[]; totalPoints?: number; maxPoints?: number; score?: number; overallFeedback?: string; releasedAt?: Date; appeals?: IAppeal[] };

// Where a submission is, in words a student can act on. Exceptions read as
// "delayed": never a score that didn't pass validation.
export function processingState(gradingStatus?: string) {
  if (gradingStatus === 'grading_exception') return 'delayed';
  if (gradingStatus === 'needs_review' || gradingStatus === 'graded_draft' || gradingStatus === 'grading_pending' || gradingStatus === 'finalized') return 'with_teacher';
  return 'grading';
}

// A result as the student may see it: nothing before release; evaluation
// records, model answers, rubric descriptions and the history never.
function resultView(t: AttemptLike, revealKey: boolean) {
  if (t.gradingStatus !== 'released') {
    return { attemptId: t.id, submittedAt: t.submittedAt, late: !!t.isLate, released: false, processing: processingState(t.gradingStatus) };
  }
  return {
    attemptId: t.id,
    submittedAt: t.submittedAt,
    late: !!t.isLate,
    released: true,
    releasedAt: t.releasedAt,
    totalPoints: t.totalPoints,
    maxPoints: t.maxPoints,
    score: t.score,
    overallFeedback: t.overallFeedback ?? null,
    answers: t.answers.map((a) => ({
      questionId: a.questionId,
      questionText: a.questionText,
      studentAnswer: a.studentAnswer,
      points: a.points,
      maxPoints: a.maxPoints,
      feedback: a.feedback ?? null,
      scoreExplanation: a.scoreExplanation ?? null,
      strengths: a.strengths ?? [],
      improvements: a.improvements ?? [],
      criterionScores: a.criterionScores ?? undefined,
      ...(revealKey ? { correctAnswer: a.correctAnswer, explanation: a.explanation, isCorrect: a.isCorrect } : {}),
    })),
    answerKeyShown: revealKey,
    appeals: (t.appeals ?? []).map((p) => ({ id: p.id, questionId: p.questionId, message: p.message, status: p.status, response: p.response ?? null, createdAt: p.createdAt })),
  };
}

// GET /api/me/assignments
export const listMyAssignments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const items = await visibleAssignments(studentId);
  const attempts = await AssessmentAttempt.find({ studentId, assignmentId: { $in: items.map((a) => a.id) } })
    .select('assignmentId status gradingStatus submittedAt')
    .lean();
  res.json({
    assignments: items.map((a) => {
      const mine = attempts.filter((t) => t.assignmentId === a.id);
      const w = submissionWindow(a, studentId);
      return {
        id: a.id,
        title: a.title,
        classId: a.classId,
        opensAt: a.opensAt,
        dueAt: dueFor(a, studentId),
        originalDueAt: a.dueAt,
        timeZone: a.timeZone,
        latePolicy: a.latePolicy,
        timeLimitMinutes: a.timeLimitMinutes ?? null,
        maxAttempts: a.maxAttempts,
        attemptsUsed: mine.filter((t) => t.status === 'submitted').length,
        ...studentStatus(a, studentId, mine as never),
        canSubmit: w.open,
        lateIfSubmittedNow: w.open && w.late,
      };
    }),
  });
});

// GET /api/me/assignments/:id
export const getMyAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const a = await loadMine(studentId, String(req.params.id));
  const version = await getVersion(a.assessmentId, a.assessmentVersion);
  const attempts = await AssessmentAttempt.find({ studentId, assignmentId: a.id }).sort({ createdAt: 1 }).lean();
  const submitted = attempts.filter((t) => t.status === 'submitted');
  kickGrading(submitted.filter((t) => t.gradingStatus !== 'released').map((t) => t.id));
  const reveal = mayRevealKey(a, studentId, submitted.length);
  const w = submissionWindow(a, studentId);
  res.json({
    assignment: {
      id: a.id,
      title: a.title,
      instructions: a.instructions ?? version.instructions ?? null,
      opensAt: a.opensAt,
      dueAt: dueFor(a, studentId),
      originalDueAt: a.dueAt,
      timeZone: a.timeZone,
      latePolicy: a.latePolicy,
      closesAt: a.latePolicy === 'accept_late' ? a.closesAt ?? null : null,
      timeLimitMinutes: a.timeLimitMinutes ?? null,
      maxAttempts: a.maxAttempts,
      tutorPolicy: a.tutorPolicy,
      format: a.format ?? 'written',
      questionCount: version.questions.length,
      totalPoints: version.totalPoints,
    },
    ...studentStatus(a, studentId, attempts as never),
    canStart: w.open && submitted.length < a.maxAttempts,
    window: w,
    openAttemptId: attempts.find((t) => t.status === 'in-progress')?.id ?? null,
    attempts: submitted.map((t) => resultView(t as never, reveal)),
  });
});

type AttemptDoc = InstanceType<typeof AssessmentAttempt>;

// Submits an attempt with the given answers and starts automatic grading
// (autoGrading.ts): answer-key questions are scored now, anything else is
// evaluated by the grader, and the result is released as soon as it passes
// validation. Schools that turned AI grading off grade open answers by hand
// (needs_review). Idempotent: a repeated submit returns the first submission.
async function submitAttempt(a: IAssignment, attempt: AttemptDoc, answers: Record<string, string | number>, by: string, note?: string) {
  const version = await getVersion(a.assessmentId, attempt.assessmentVersion ?? a.assessmentVersion);
  const questions = version.questions as IQuestion[];
  // A speaking exam is graded only on what the student said to the examiner
  // (never typed or saved text), and only with enough spoken evidence.
  const speaking = a.format === 'english_conversation';
  const evidence = speaking ? (attempt.speaking ? evidenceFor(questions, attempt.conversation ?? []) : 'insufficient') : undefined;
  if (speaking) {
    answers = {};
    for (const q of questions) {
      const said = answerFor((attempt.conversation ?? []).filter((t) => t.source === 'speech' || t.source === 'typed_accommodation'), q.id);
      if (said) answers[q.id] = said;
    }
  }
  const graded = gradeAnswers(questions, answers);
  const t = totals(graded);
  const now = new Date();
  const late = now > dueFor(a, attempt.studentId);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const needsAi = graded.some((x) => needsAiEvaluation(byId.get(x.questionId), x));
  const handGraded = needsAi && !(await isFeatureEnabled(attempt.institutionId, 'ai_grading_enabled'));
  // By hand: open answers wait for a teacher; short answers keep the key's verdict.
  // Not enough of the student's own speech: no score is invented; the attempt
  // is marked for the teacher as insufficient evidence.
  const status = evidence === 'insufficient' ? 'grading_exception' : handGraded ? 'needs_review' : 'grading_queued';
  let claimed = await AssessmentAttempt.findOneAndUpdate(
    { id: attempt.id, status: 'in-progress' },
    {
      $set: {
        status: 'submitted',
        submittedAt: now,
        answers: graded,
        isLate: late,
        gradingStatus: status,
        totalPoints: t.totalPoints,
        maxPoints: t.maxPoints,
        score: t.complete ? t.percent : undefined,
        timeSpentSec: Math.round((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000),
        // Never started speaking (no consent or mode): recorded as no evidence.
        ...(speaking ? (attempt.speaking ? { 'speaking.evidence': evidence } : { speaking: { evidence, started: false } }) : {}),
        ...(evidence === 'insufficient' ? { exceptionReason: 'insufficient_evidence' } : {}),
      },
      $unset: { draftAnswers: 1 },
      $push: { history: { at: now, by, action: 'submitted', reason: note } },
    },
    { new: true },
  );
  if (!claimed) {
    // Already submitted (a retry): return what was submitted.
    const current = await AssessmentAttempt.findOne({ id: attempt.id });
    if (current?.status === 'submitted') return current;
    throw new AppError('Attempt can no longer be submitted', 409, 'ATTEMPT_CLOSED');
  }
  await recordLearningEvent({
    studentId: claimed.studentId,
    institutionId: claimed.institutionId,
    type: 'assessment_started',
    source: 'assessment',
    verified: true,
    refs: { assessmentId: claimed.assessmentId, attemptId: claimed.id, assignmentId: a.id },
    idempotencyKey: `attempt:${claimed.id}:started`,
    at: claimed.startedAt,
  });
  if (status === 'grading_queued') claimed = await startGrading(claimed);
  return claimed;
}

// An open attempt past its time limit is submitted with what was saved.
async function closeExpired(a: IAssignment, attempt: AttemptDoc) {
  if (attempt.status !== 'in-progress' || !attempt.expiresAt) return attempt;
  if (Date.now() <= new Date(attempt.expiresAt).getTime() + GRACE_MS) return attempt;
  return submitAttempt(a, attempt, (attempt.draftAnswers as Record<string, string | number>) || {}, 'system:time-limit', 'time limit reached; saved answers submitted');
}

// POST /api/me/assignments/:id/attempts — starts, or returns the open attempt.
export const startAssignmentAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const a = await loadMine(studentId, String(req.params.id));
  let open = await AssessmentAttempt.findOne({ studentId, assignmentId: a.id, status: 'in-progress' });
  if (open) open = await closeExpired(a, open);
  const version = await getVersion(a.assessmentId, a.assessmentVersion);
  if (!open || open.status !== 'in-progress') {
    const w = submissionWindow(a, studentId);
    if (!w.open) {
      const messages = { not_open_yet: 'This assignment is not open yet', past_due: 'The due date has passed', closed: 'This assignment is closed', draft: 'Not available', archived: 'Not available' };
      throw new AppError(messages[w.reason], 403, `ASSIGNMENT_${w.reason.toUpperCase()}`);
    }
    const used = await AssessmentAttempt.countDocuments({ studentId, assignmentId: a.id, status: 'submitted' });
    if (used >= a.maxAttempts) throw new AppError('You have used all your attempts', 403, 'ATTEMPT_LIMIT_REACHED');
    const now = new Date();
    const limitEnd = a.timeLimitMinutes ? new Date(now.getTime() + a.timeLimitMinutes * 60_000) : undefined;
    const lastSubmission = lastSubmissionFor(a, studentId);
    open = await AssessmentAttempt.create({
      id: generateAttemptId(),
      assessmentId: a.assessmentId,
      assessmentTitle: a.title,
      subject: version.subject,
      studentId,
      institutionId: a.institutionId,
      status: 'in-progress',
      answers: [],
      assignmentId: a.id,
      assessmentVersion: a.assessmentVersion,
      startedAt: now,
      expiresAt: limitEnd && limitEnd < lastSubmission ? limitEnd : limitEnd ? lastSubmission : undefined,
      history: [{ at: now, by: req.user!.id, action: 'started' }],
    }).catch(async (error) => {
      if ((error as { code?: number }).code !== 11000) throw error;
      // A parallel start on this assignment: use it. Otherwise the student has
      // another open attempt on the same assessment.
      const same = await AssessmentAttempt.findOne({ studentId, assignmentId: a.id, status: 'in-progress' });
      if (same) return same;
      throw new AppError('Finish your open attempt on this assessment first', 409, 'OTHER_ATTEMPT_OPEN');
    });
  }
  res.status(201).json({
    attempt: {
      id: open.id,
      startedAt: open.startedAt,
      expiresAt: open.expiresAt ?? null,
      draftAnswers: open.draftAnswers ?? {},
      draftSavedAt: open.draftSavedAt ?? null,
      conversation: open.conversation ?? [],
      conversationState: open.conversationState ?? null,
    },
    format: a.format ?? 'written',
    ...(a.format === 'english_conversation' && a.speaking ? { speaking: publicSettings(a.speaking, studentId), speakingAttempt: open.speaking ? { mode: open.speaking.mode, fallback: open.speaking.fallback ?? null, studentTurns: open.speaking.studentTurns } : null } : {}),
    questions: questionsForStudent(version.questions as IQuestion[]),
    dueAt: dueFor(a, studentId),
  });
});

// PUT /api/me/assignments/:id/attempts/:attemptId/draft { answers } — save progress.
export const saveAssignmentDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const a = await loadMine(studentId, String(req.params.id));
  if (a.format === 'english_conversation') throw new AppError('Speaking exams save what you say to the examiner', 409, 'SPEAKING_EXAM');
  const answers = normalizeAnswers(ensurePlainObject(req.body).answers);
  const now = new Date();
  const saved = await AssessmentAttempt.findOneAndUpdate(
    {
      id: String(req.params.attemptId),
      studentId,
      assignmentId: a.id,
      status: 'in-progress',
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: new Date(now.getTime() - GRACE_MS) } }],
    },
    { $set: { draftAnswers: answers, draftSavedAt: now } },
    { new: true },
  );
  if (!saved) throw new AppError('This attempt is no longer open', 409, 'ATTEMPT_CLOSED');
  res.json({ savedAt: now });
});

// POST /api/me/assignments/:id/attempts/:attemptId/submit { answers }
export const submitAssignmentAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const a = await loadMine(studentId, String(req.params.id));
  const attempt = await AssessmentAttempt.findOne({ id: String(req.params.attemptId), studentId, assignmentId: a.id });
  if (!attempt) throw new AppError('Attempt not found', 404);
  let result = attempt;
  if (attempt.status === 'in-progress') {
    const body = ensurePlainObject(req.body);
    const now = Date.now();
    const pastLimit = attempt.expiresAt && now > new Date(attempt.expiresAt).getTime() + GRACE_MS;
    const pastDeadline = now > lastSubmissionFor(a, studentId).getTime() + GRACE_MS || a.state === 'closed' || a.state === 'archived';
    if (pastLimit) {
      // Over the time limit: only what was saved in time counts.
      result = await submitAttempt(a, attempt, (attempt.draftAnswers as Record<string, string | number>) || {}, 'system:time-limit', 'time limit reached; saved answers submitted');
    } else if (pastDeadline) {
      throw new AppError('The deadline has passed', 403, 'ASSIGNMENT_PAST_DUE');
    } else {
      // A conversation exam submits exactly what was said to the examiner.
      const typed = a.format === 'conversation' || a.format === 'english_conversation' ? {} : normalizeAnswers(body.answers);
      const answers = { ...((attempt.draftAnswers as Record<string, string | number>) || {}), ...typed };
      result = await submitAttempt(a, attempt, answers, req.user!.id);
    }
  }
  const submitted = await AssessmentAttempt.countDocuments({ studentId, assignmentId: a.id, status: 'submitted' });
  res.json({ receipt: { attemptId: result.id, submittedAt: result.submittedAt, late: !!result.isLate }, result: resultView(result as never, mayRevealKey(a, studentId, submitted)) });
});

// GET /api/me/assignments/:id/attempts/:attemptId/result — only once released.
export const getMyAssignmentResult = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const a = await loadMine(studentId, String(req.params.id));
  const attempt = await AssessmentAttempt.findOne({ id: String(req.params.attemptId), studentId, assignmentId: a.id, status: 'submitted' }).lean();
  if (!attempt) throw new AppError('Result not found', 404);
  // Reading a result also nudges a grading run that is due (retry or stale lease).
  if (attempt.gradingStatus !== 'released') kickGrading([attempt.id]);
  const submitted = await AssessmentAttempt.countDocuments({ studentId, assignmentId: a.id, status: 'submitted' });
  res.json(resultView(attempt as never, mayRevealKey(a, studentId, submitted)));
});

const MAX_OPEN_APPEALS = 3;

// POST /api/me/assignments/:id/attempts/:attemptId/appeals { questionId?, message }
// Asks the teacher to look again at a released result. It changes nothing
// by itself: only a teacher's correction changes a grade.
export const appealMyResult = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const a = await loadMine(studentId, String(req.params.id));
  const attempt = await AssessmentAttempt.findOne({ id: String(req.params.attemptId), studentId, assignmentId: a.id, status: 'submitted' }).lean();
  if (!attempt) throw new AppError('Result not found', 404);
  if (attempt.gradingStatus !== 'released') throw new AppError('You can ask for a review once your result is released', 409, 'NOT_RELEASED');
  const message = getRequiredString(body, 'message', { max: 1000 });
  const questionId = getOptionalString(body, 'questionId', { max: 80 });
  if (questionId && !attempt.answers.some((x) => x.questionId === questionId)) throw new AppError('Question not found', 404);
  const open = (attempt.appeals ?? []).filter((p) => p.status === 'open');
  if (open.some((p) => (p.questionId ?? null) === (questionId ?? null))) throw new AppError('You already asked about this; your teacher will reply', 409, 'APPEAL_OPEN');
  if (open.length >= MAX_OPEN_APPEALS) throw new AppError('Wait for your teacher to answer your other requests', 409, 'TOO_MANY_APPEALS');
  const appeal: IAppeal = { id: `ap-${randomUUID()}`, questionId, message, createdAt: new Date(), status: 'open' };
  await AssessmentAttempt.updateOne(
    { id: attempt.id },
    { $push: { appeals: appeal, history: { at: appeal.createdAt, by: req.user!.id, action: 'appeal_opened', questionId, reason: message.slice(0, 500) } } },
  );
  res.status(201).json({ id: appeal.id, status: appeal.status, questionId: appeal.questionId ?? null, createdAt: appeal.createdAt });
});

// POST /api/me/assignments/:id/attempts/:attemptId/conversation { message? }
// Conversation exams: without a message (first call) the examiner opens and asks
// question 1; each reply is recorded as (part of) that question's answer and the
// examiner either asks one neutral follow-up or moves on. Returns the new turns.
export const converseAssignmentAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const a = await loadMine(studentId, String(req.params.id));
  if (a.format !== 'conversation') throw new AppError(a.format === 'english_conversation' ? 'Speaking exams are answered by speaking' : 'This assignment is not a conversation exam', 409, a.format === 'english_conversation' ? 'SPEAKING_EXAM' : 'NOT_CONVERSATION_EXAM');
  const now = new Date();
  const attempt = await AssessmentAttempt.findOne({
    id: String(req.params.attemptId),
    studentId,
    assignmentId: a.id,
    status: 'in-progress',
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: new Date(now.getTime() - GRACE_MS) } }],
  });
  if (!attempt) throw new AppError('This attempt is no longer open', 409, 'ATTEMPT_CLOSED');
  const version = await getVersion(a.assessmentId, a.assessmentVersion);
  const questions = (version.questions as IQuestion[]).filter((q) => CONVERSATION_QUESTION_TYPES.includes(q.type));
  if (!questions.length) throw new AppError('This exam has no questions to discuss', 409, 'NO_QUESTIONS');
  const state = attempt.conversationState ?? null;
  const history = attempt.conversation ?? [];
  if (state?.done) throw new AppError('The exam conversation is finished; submit your answers', 409, 'CONVERSATION_DONE');
  let reply: string | undefined;
  let followUp: string | null = null;
  if (state) {
    reply = getRequiredString(ensurePlainObject(req.body), 'message', { max: MAX_REPLY_CHARS }).trim();
    if (!reply) throw new AppError('Say something to answer the question', 400, 'VALIDATION_ERROR');
    const q = questions[state.index];
    if (!state.probed) {
      const answerSoFar = [answerFor(history, q.id), reply].filter(Boolean).join('\n');
      followUp = await decideFollowUp({ question: q, answer: answerSoFar, institutionId: a.institutionId });
    }
  } else if (history.length) {
    throw new AppError('The conversation could not be resumed', 409, 'CONVERSATION_CONFLICT');
  }
  const step = nextTurns({ questions, state, reply, followUp, now });
  const all = [...history, ...step.turns];
  const draftAnswers = { ...((attempt.draftAnswers as Record<string, string | number>) || {}) };
  for (const q of questions) {
    const text = answerFor(all, q.id);
    if (text) draftAnswers[q.id] = text;
  }
  // Only if nobody else changed the conversation meanwhile (double send, two tabs).
  const saved = await AssessmentAttempt.findOneAndUpdate(
    { id: attempt.id, status: 'in-progress', $expr: { $eq: [{ $size: { $ifNull: ['$conversation', []] } }, history.length] } },
    { $push: { conversation: { $each: step.turns } }, $set: { conversationState: step.state, draftAnswers, draftSavedAt: now } },
    { new: true },
  );
  if (!saved) throw new AppError('The conversation changed; reload to continue', 409, 'CONVERSATION_CONFLICT');
  res.json({ turns: step.turns, state: step.state, questionCount: questions.length });
});
