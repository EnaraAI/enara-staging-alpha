import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Assessment } from '../models/Assessment';
import { DiagnosticSession, type IDiagnosticSession } from '../models/DiagnosticSession';
import { Institution } from '../models/Institution';
import { LearningEvent } from '../models/LearningEvent';
import { LearningObjective } from '../models/LearningObjective';
import { StudentMisconception } from '../models/StudentMisconception';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { gradeAnswer } from '../services/assessmentSecurity';
import {
  DIAGNOSTIC_ALGORITHM_VERSION,
  objectiveSessionState,
  selectNextItem,
  type PoolItem,
  type TargetObjective,
} from '../services/diagnosticEngine';
import { processStudentEvidenceSafely } from '../services/evidenceProcessor';
import { resolveStudentForRead } from '../services/learningAccess';
import { recordLearningEvent } from '../services/learningEvents';
import { getEnrolledInstances } from '../services/studentCourseService';
import { ensurePlainObject, getOptionalNumber, getOptionalStringArray, getRequiredId, getRequiredString, rejectMongoOperators } from '../utils/validation';

const DEFAULT_MAX_QUESTIONS = 12;
const DEFAULT_MAX_MINUTES = 30;
const GRADABLE = new Set(['multiple-choice', 'true-false']);

async function schoolLimits(institutionId?: string) {
  const school = institutionId ? await Institution.findOne({ id: institutionId }).select('learningSettings').lean() : null;
  return {
    maxQuestions: school?.learningSettings?.diagnosticMaxQuestions ?? DEFAULT_MAX_QUESTIONS,
    maxMinutes: school?.learningSettings?.diagnosticMaxMinutes ?? DEFAULT_MAX_MINUTES,
  };
}

// Questions usable for these objectives: answer-key gradable, tagged with at
// least one target objective, in the school's assessments for the curriculum.
async function loadPool(institutionId: string | undefined, curriculumId: string | undefined, objectiveIds: string[], studentId: string) {
  const assessments = await Assessment.find({
    institutionId,
    $or: [{ curriculumId }, { curriculumId: { $in: [null, ''] } }],
    'questions.objectiveIds': { $in: objectiveIds },
    // Drafts (possibly unreviewed AI questions) never reach students.
    lifecycle: { $ne: 'draft' },
  })
    .select('id questions')
    .lean();
  const seen = new Set(
    (await LearningEvent.find({ studentId, type: 'question_answered' }).select('refs.assessmentId refs.questionId').lean()).map(
      (e) => `${e.refs?.assessmentId}::${e.refs?.questionId}`,
    ),
  );
  const pool: PoolItem[] = [];
  const questions = new Map<string, (typeof assessments)[number]['questions'][number]>();
  for (const a of assessments) {
    for (const q of a.questions) {
      const tags = (q.objectiveIds || []).filter((o) => objectiveIds.includes(o));
      if (!tags.length || !GRADABLE.has(q.type)) continue;
      pool.push({ assessmentId: a.id, questionId: q.id, objectiveIds: tags, difficulty: q.difficulty, seenBefore: seen.has(`${a.id}::${q.id}`) });
      questions.set(`${a.id}::${q.id}`, q);
    }
  }
  return { pool, questions };
}

async function targets(session: Pick<IDiagnosticSession, 'objectiveIds' | 'studentId'>): Promise<TargetObjective[]> {
  const objectives = await LearningObjective.find({ id: { $in: session.objectiveIds } }).select('id code prerequisiteObjectiveIds').lean();
  const states = await StudentObjectiveMastery.find({ studentId: session.studentId, objectiveId: { $in: session.objectiveIds } }).lean();
  const count = new Map(states.map((s) => [s.objectiveId, s.evidenceCount]));
  return objectives.map((o) => ({ id: o.id, code: o.code, prerequisiteObjectiveIds: o.prerequisiteObjectiveIds, priorEvidenceCount: count.get(o.id) ?? 0 }));
}

async function view(session: IDiagnosticSession | Record<string, any>) {
  let currentQuestion = null;
  if (session.currentItem) {
    const a = await Assessment.findOne({ id: session.currentItem.assessmentId }).select('questions').lean();
    const q = a?.questions.find((x) => x.id === session.currentItem.questionId);
    // Only what the student needs to answer: no key, explanation or tags.
    if (q) currentQuestion = { assessmentId: session.currentItem.assessmentId, questionId: q.id, type: q.type, text: q.text, options: q.options || [] };
  }
  return {
    id: session.id,
    status: session.status,
    courseId: session.courseId,
    objectiveIds: session.objectiveIds,
    questionsAnswered: session.questionsAnswered,
    maxQuestions: session.maxQuestions,
    maxMinutes: session.maxMinutes,
    startedAt: session.startedAt,
    endsAt: new Date(new Date(session.startedAt).getTime() + session.maxMinutes * 60_000),
    completedAt: session.completedAt ?? null,
    stopReason: session.stopReason ?? null,
    currentQuestion,
    algorithmVersion: session.algorithmVersion,
  };
}

async function finish(sessionId: string, stopReason: NonNullable<IDiagnosticSession['stopReason']>) {
  const done = await DiagnosticSession.findOneAndUpdate(
    { id: sessionId, status: 'in_progress' },
    { $set: { status: stopReason === 'cancelled' ? 'cancelled' : 'completed', stopReason, completedAt: new Date(), currentItem: null } },
    { new: true },
  );
  if (done) {
    // An intervention waiting on this reassessment records its outcome.
    const { recordReassessmentOutcome } = await import('../services/interventions');
    await recordReassessmentOutcome(done.id).catch(() => undefined);
    await recordLearningEvent({
      studentId: done.studentId,
      institutionId: done.institutionId,
      type: 'diagnostic_completed',
      source: 'diagnostic',
      verified: true,
      objectiveIds: done.objectiveIds,
      refs: { diagnosticId: done.id, courseId: done.courseId },
      idempotencyKey: `diag:${done.id}:completed`,
    });
  }
  return done ?? (await DiagnosticSession.findOne({ id: sessionId }));
}

// Picks the next question or ends the session. Guarded so two parallel calls
// can't both set a question.
async function advance(session: IDiagnosticSession) {
  const { pool } = await loadPool(session.institutionId, session.curriculumId, session.objectiveIds, session.studentId);
  const next = selectNextItem({ objectives: await targets(session), pool, responses: session.responses, maxQuestions: session.maxQuestions });
  if ('stop' in next) return finish(session.id, next.stop);
  const now = new Date();
  const updated = await DiagnosticSession.findOneAndUpdate(
    { id: session.id, status: 'in_progress', currentItem: null },
    {
      $set: { currentItem: { assessmentId: next.item.assessmentId, questionId: next.item.questionId, objectiveId: next.objectiveId, servedAt: now } },
      $push: { decisions: { at: now, objectiveId: next.objectiveId, questionId: `${next.item.assessmentId}/${next.item.questionId}`, reason: next.reason } },
    },
    { new: true },
  );
  return updated ?? (await DiagnosticSession.findOne({ id: session.id }));
}

async function expireIfOverdue(session: IDiagnosticSession) {
  if (session.status === 'in_progress' && Date.now() > new Date(session.startedAt).getTime() + session.maxMinutes * 60_000) {
    return (await finish(session.id, 'max_duration'))!;
  }
  return session;
}

async function loadOwnSession(req: AuthRequest) {
  const session = await DiagnosticSession.findOne({ id: String(req.params.id), studentId: req.user!.studentId });
  if (!session) throw new AppError('Diagnostic not found', 404, 'DIAGNOSTIC_NOT_FOUND');
  return expireIfOverdue(session);
}

// Opens (or resumes) a diagnostic for a student's course. Used by the start
// route and by intervention reassessment.
export async function openDiagnostic(params: { studentId: string; courseId: string; objectiveIds?: string[]; maxQuestions?: number }) {
  const { studentId, courseId } = params;
  const instance = (await getEnrolledInstances(studentId)).find((c) => c.id === courseId);
  if (!instance) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  const open = await DiagnosticSession.findOne({ studentId, courseId, status: 'in_progress' });
  if (open) {
    const current = await expireIfOverdue(open);
    if (current.status === 'in_progress') return { session: current, resumed: true };
  }

  const objectives = await LearningObjective.find({
    institutionId: instance.institutionId,
    curriculumId: instance.curriculumId,
    status: 'approved',
    ...(params.objectiveIds?.length ? { id: { $in: params.objectiveIds } } : {}),
  }).select('id').lean();
  if (!objectives.length) throw new AppError('No approved learning objectives for this course yet', 409, 'NO_OBJECTIVES');
  const limits = await schoolLimits(instance.institutionId);
  const maxQuestions = Math.min(limits.maxQuestions, params.maxQuestions ?? limits.maxQuestions);

  let session: IDiagnosticSession;
  try {
    session = await DiagnosticSession.create({
      id: `diag-${randomUUID()}`,
      institutionId: instance.institutionId,
      studentId,
      courseId,
      curriculumId: instance.curriculumId,
      objectiveIds: objectives.map((o) => o.id),
      status: 'in_progress',
      maxQuestions,
      maxMinutes: limits.maxMinutes,
      startedAt: new Date(),
      algorithmVersion: DIAGNOSTIC_ALGORITHM_VERSION,
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const existing = await DiagnosticSession.findOne({ studentId, courseId, status: 'in_progress' });
    return { session: existing!, resumed: true };
  }
  await recordLearningEvent({
    studentId,
    institutionId: instance.institutionId,
    type: 'diagnostic_started',
    source: 'diagnostic',
    verified: true,
    objectiveIds: session.objectiveIds,
    refs: { diagnosticId: session.id, courseId },
    idempotencyKey: `diag:${session.id}:started`,
  });
  return { session: (await advance(session))!, resumed: false };
}

// POST /api/learning/diagnostics { courseId, objectiveIds?, maxQuestions? } — student.
// Resumes the student's open diagnostic for the course if there is one.
export const startDiagnostic = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { session, resumed } = await openDiagnostic({
    studentId: req.user!.studentId!,
    courseId: getRequiredId(body, 'courseId'),
    objectiveIds: getOptionalStringArray(body, 'objectiveIds', { maxItems: 50, maxLength: 128 }),
    maxQuestions: getOptionalNumber(body, 'maxQuestions', { min: 3, max: 30 }),
  });
  res.status(resumed ? 200 : 201).json({ resumed, ...(await view(session)) });
});

// GET /api/learning/diagnostics/:id — the student, or staff with access to them.
export const getDiagnostic = asyncHandler(async (req: AuthRequest, res: Response) => {
  let session: IDiagnosticSession | null = await DiagnosticSession.findOne({ id: String(req.params.id) });
  if (!session) throw new AppError('Diagnostic not found', 404, 'DIAGNOSTIC_NOT_FOUND');
  await resolveStudentForRead(req, session.studentId);
  session = await expireIfOverdue(session);
  const v = await view(session);
  // Staff see the state but not the live question.
  res.json(req.user!.role === 'student' ? v : { ...v, currentQuestion: null });
});

// POST /api/learning/diagnostics/:id/answer { assessmentId, questionId, answer }
// Only the current question can be answered; repeating a submitted answer
// returns the same state instead of advancing twice.
export const answerDiagnostic = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const assessmentId = getRequiredString(body, 'assessmentId', { max: 128 });
  const questionId = getRequiredString(body, 'questionId', { max: 128 });
  if (typeof body.answer !== 'string' && typeof body.answer !== 'number') throw new AppError('answer is required', 400, 'VALIDATION_ERROR');
  const answer = String(body.answer).slice(0, 1000);

  const session = await loadOwnSession(req);
  const alreadyAnswered = session.responses.some((r) => r.assessmentId === assessmentId && r.questionId === questionId);
  if (alreadyAnswered) {
    res.json({ duplicate: true, ...(await view(session)) });
    return;
  }
  if (session.status !== 'in_progress') throw new AppError('This diagnostic has finished', 409, 'DIAGNOSTIC_FINISHED');
  if (session.currentItem?.assessmentId !== assessmentId || session.currentItem?.questionId !== questionId) {
    throw new AppError('That is not the current question', 409, 'STALE_QUESTION');
  }

  const assessment = await Assessment.findOne({ id: assessmentId, institutionId: session.institutionId }).select('questions').lean();
  const question = assessment?.questions.find((q) => q.id === questionId);
  if (!question) throw new AppError('Question not found', 404, 'QUESTION_NOT_FOUND');
  const correct = gradeAnswer(question, answer);
  const objectiveIds = (question.objectiveIds || []).filter(Boolean);
  const now = new Date();

  const claimed = await DiagnosticSession.findOneAndUpdate(
    { id: session.id, status: 'in_progress', 'currentItem.assessmentId': assessmentId, 'currentItem.questionId': questionId },
    {
      $push: {
        responses: {
          assessmentId,
          questionId,
          objectiveIds: objectiveIds.filter((o) => session.objectiveIds.includes(o)),
          difficulty: question.difficulty,
          answer,
          correct,
          servedAt: session.currentItem!.servedAt,
          answeredAt: now,
        },
      },
      $inc: { questionsAnswered: 1 },
      $set: { currentItem: null },
    },
    { new: true },
  );
  if (!claimed) {
    // A parallel request answered it first.
    const latest = await DiagnosticSession.findOne({ id: session.id });
    res.json({ duplicate: true, ...(await view(latest!)) });
    return;
  }

  await recordLearningEvent({
    studentId: session.studentId,
    institutionId: session.institutionId,
    type: 'question_answered',
    source: 'diagnostic',
    verified: true,
    gradedBy: 'rule',
    objectiveIds,
    refs: { assessmentId, questionId, diagnosticId: session.id, courseId: session.courseId },
    outcome: { correct, answer: answer.slice(0, 200) },
    durationMs: now.getTime() - new Date(session.currentItem!.servedAt).getTime(),
    idempotencyKey: `diag:${session.id}:${assessmentId}:${questionId}`,
    at: now,
  });
  await processStudentEvidenceSafely(session.studentId);
  const next = await advance(claimed);
  res.json(await view(next!));
});

// POST /api/learning/diagnostics/:id/complete — the student ends it early.
export const completeDiagnostic = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await loadOwnSession(req);
  const done = session.status === 'in_progress' ? await finish(session.id, 'student_ended') : session;
  res.json(await view(done!));
});

const MET = new Set(['proficient', 'mastered']);

// GET /api/learning/diagnostics/:id/report — results per objective. Numbers come
// from the graded answers and the mastery model, not from AI.
export const getDiagnosticReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  let session: IDiagnosticSession | null = await DiagnosticSession.findOne({ id: String(req.params.id) });
  if (!session) throw new AppError('Diagnostic not found', 404, 'DIAGNOSTIC_NOT_FOUND');
  await resolveStudentForRead(req, session.studentId);
  session = await expireIfOverdue(session);

  const objectives = await LearningObjective.find({ id: { $in: session.objectiveIds } }).lean();
  const prereqIds = [...new Set(objectives.flatMap((o) => o.prerequisiteObjectiveIds))];
  const allIds = [...new Set([...session.objectiveIds, ...prereqIds])];
  const [states, misconceptions, prereqObjectives] = await Promise.all([
    StudentObjectiveMastery.find({ studentId: session.studentId, objectiveId: { $in: allIds } }).lean(),
    StudentMisconception.find({ studentId: session.studentId, objectiveId: { $in: session.objectiveIds }, status: { $in: ['suspected', 'confirmed'] } }).lean(),
    LearningObjective.find({ id: { $in: prereqIds } }).select('id code title').lean(),
  ]);
  const stateOf = new Map(states.map((s) => [s.objectiveId, s]));
  const codeOf = new Map([...objectives, ...prereqObjectives].map((o) => [o.id, o.code]));
  const sessionStates = new Map(objectives.map((o) => [o.id, objectiveSessionState(o.id, session!.responses)]));

  const rows = objectives
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((o) => {
      const s = sessionStates.get(o.id)!;
      const blockedBy = o.prerequisiteObjectiveIds.find((p) => sessionStates.get(p)?.settled && sessionStates.get(p)?.result === 'gap');
      const m = stateOf.get(o.id);
      const weakPrerequisites = o.prerequisiteObjectiveIds
        .filter((p) => !MET.has(stateOf.get(p)?.masteryStatus ?? 'not_assessed'))
        .map((p) => ({ id: p, code: codeOf.get(p), status: stateOf.get(p)?.masteryStatus ?? 'not_assessed' }));
      let recommendation: { type: string; text: string; objectiveId: string };
      if (blockedBy) {
        recommendation = { type: 'review_prerequisite', objectiveId: blockedBy, text: `Start with ${codeOf.get(blockedBy)}: this objective builds on it, and it isn't secure yet.` };
      } else if (s.answered === 0) {
        recommendation = { type: 'needs_assessment', objectiveId: o.id, text: 'Not assessed in this check (no linked questions available). Ask your teacher.' };
      } else if (s.result === 'gap') {
        recommendation = { type: 'practise', objectiveId: o.id, text: 'Practise this with the AI tutor, then take another check.' };
      } else if (s.result === 'secure') {
        recommendation = { type: 'move_on', objectiveId: o.id, text: 'Secure in this check. Move on, and review it later to keep it.' };
      } else {
        recommendation = { type: 'reassess', objectiveId: o.id, text: 'Not clear yet: answer a few more questions on this to be sure.' };
      }
      return {
        objective: { id: o.id, code: o.code, title: o.title, translations: o.translations },
        diagnostic: { answered: s.answered, correct: s.correct, result: s.result, blockedByPrerequisite: blockedBy ? codeOf.get(blockedBy) : null },
        mastery: {
          masteryEstimate: m?.masteryEstimate ?? null,
          estimateIsHeuristic: true,
          evidenceStrength: m?.evidenceStrength ?? 'none',
          masteryStatus: m?.masteryStatus ?? 'not_assessed',
          needsVerification: m?.needsVerification ?? false,
        },
        weakPrerequisites,
        possibleMisconceptions: misconceptions
          .filter((x) => x.objectiveId === o.id)
          .map((x) => ({ id: x.id, category: x.category, description: x.description, status: x.status, confidence: x.confidence, confidenceIsHeuristic: true })),
        recommendation,
      };
    });

  res.json({
    id: session.id,
    status: session.status,
    stopReason: session.stopReason ?? null,
    questionsAnswered: session.questionsAnswered,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    algorithmVersion: session.algorithmVersion,
    inconclusive: rows.every((r) => r.diagnostic.result === 'inconclusive'),
    objectives: rows,
    gaps: rows.filter((r) => r.diagnostic.result === 'gap').map((r) => r.objective.code),
    needsMoreAssessment: rows.filter((r) => ['mixed', 'inconclusive'].includes(r.diagnostic.result)).map((r) => r.objective.code),
  });
});

// GET /api/learning/students/:studentId/diagnostics — recent diagnostics.
export const listStudentDiagnostics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const sessions = await DiagnosticSession.find({ studentId: student.id }).sort({ startedAt: -1 }).limit(50).lean();
  res.json({
    diagnostics: sessions.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      status: s.status,
      stopReason: s.stopReason ?? null,
      questionsAnswered: s.questionsAnswered,
      startedAt: s.startedAt,
      completedAt: s.completedAt ?? null,
    })),
  });
});
