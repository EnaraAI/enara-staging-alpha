import { AssessmentAttempt, type IAttemptAnswer } from '../models/AssessmentAttempt';
import type { IQuestion } from '../models/Assessment';
import { Assignment, type IAssignment } from '../models/Assignment';
import type { IGradingProposal } from '../models/GradingProposal';
import { LearningObjective } from '../models/LearningObjective';
import { gradeAnswer } from './assessmentSecurity';
import { AUTO_GRADED, getVersion, questionPoints } from './assessmentVersions';
import { isAiConfigured } from './aiJson';
import { isFeatureEnabled } from './featureFlags';
import { totals, updateLearningIntelligence } from './grading';
import { evaluateRubricAnswer, evaluateShortAnswer, questionObjectiveIds, type EvalPolicy } from './gradingProposals';
import { notifyResultsReleased } from './teachingNotifications';
import { logger } from '../utils/logging';

// Automatic grading (autograde-v1). Every submitted assignment attempt is
// graded, validated, finalized and released without a teacher in the way:
//
//   grading_queued → grading_in_progress → [AI evaluation → validation]
//                  → finalized + released (one conditional write)
//                  → Phase 2 update (intelligenceStatus, retried on its own)
//
// A run claims the attempt with a lease, so two workers never grade it at
// once and a crashed run is picked up again. If evaluation or validation
// fails the attempt goes to grading_failed and is retried with backoff; after
// MAX_GRADING_RUNS, or for a problem a retry can't fix, it goes to
// grading_exception for a person to look at. No score is ever invented and
// an attempt is never released with a grade that failed validation.
export const AUTO_GRADING_VERSION = 'autograde-v1';
export const MAX_GRADING_RUNS = 3;
const LEASE_MS = 5 * 60_000;
const BACKOFF_MS = [60_000, 10 * 60_000];
// Independent evaluations per open answer; they must agree (see agree()).
export const CONSISTENCY_RUNS = 2;
const GRADER = 'system:grader';

export class GradingError extends Error {
  constructor(public reason: string, message: string, public retryable: boolean) {
    super(message);
  }
}

type AttemptDoc = InstanceType<typeof AssessmentAttempt>;
type Evaluation = IGradingProposal;

const hasText = (v: unknown) => String(v ?? '').trim().length > 0;

// Answers the answer key can't settle on its own.
export function needsAiEvaluation(q: IQuestion | undefined, a: IAttemptAnswer) {
  if (!q || !hasText(a.studentAnswer)) return false;
  if (q.type === 'open-response') return true;
  return q.type === 'short-answer' && !a.isCorrect;
}

// Two rubric evaluations agree when no criterion differs by more than one
// level and the totals differ by at most a quarter of the points (min 1).
export function agree(x: Evaluation, y: Evaluation, q: IQuestion) {
  const max = questionPoints(q);
  if (Math.abs((x.points ?? 0) - (y.points ?? 0)) > Math.max(1, Math.floor(max / 4))) return false;
  for (const c of q.rubric?.criteria || []) {
    const ix = c.levels.findIndex((l) => l.id === x.criteria.find((s) => s.criterionId === c.id)?.levelId);
    const iy = c.levels.findIndex((l) => l.id === y.criteria.find((s) => s.criterionId === c.id)?.levelId);
    if (ix < 0 || iy < 0 || Math.abs(ix - iy) > 1) return false;
  }
  return true;
}

const usable = (e: Evaluation) => e.status === 'proposed';
function failureOf(evals: Evaluation[]) {
  const bad = evals.find((e) => !usable(e));
  if (!bad) return null;
  return bad.status === 'invalid'
    ? new GradingError('ai_invalid_output', `The AI reply for question ${bad.questionId} failed validation: ${bad.error ?? ''}`.trim(), true)
    : new GradingError('ai_provider_error', `The AI provider failed for question ${bad.questionId}: ${bad.error ?? ''}`.trim(), true);
}

export async function evaluateOpen(attempt: AttemptDoc, q: IQuestion, answer: string, objectives: { id: string; title: string }[], policy?: EvalPolicy) {
  if (!(q.rubric?.criteria || []).length) throw new GradingError('missing_rubric', `Question ${q.id} has no rubric`, false);
  const runs = await Promise.all(Array.from({ length: CONSISTENCY_RUNS }, (_, i) => evaluateRubricAnswer({ attempt, question: q, answer, run: i + 1, objectives, policy })));
  const failed = failureOf(runs);
  if (failed) throw failed;
  if (runs.some((e) => e.flags.includes('possible_integrity_issue'))) {
    throw new GradingError('integrity_flag', `The answer to question ${q.id} may contain instructions to the grader`, false);
  }
  if (runs.length < 2 || agree(runs[0], runs[1], q)) return { chosen: runs[0], all: runs };
  // Disagreement: one more independent evaluation decides, if it agrees with either.
  const third = await evaluateRubricAnswer({ attempt, question: q, answer, run: runs.length + 1, objectives, policy });
  const all = [...runs, third];
  const f = failureOf([third]);
  if (f) throw f;
  const partner = runs.find((r) => agree(r, third, q));
  if (!partner) throw new GradingError('conflicting_results', `Independent evaluations of question ${q.id} disagree`, true);
  return { chosen: partner, all };
}

export async function evaluateShort(attempt: AttemptDoc, q: IQuestion, answer: string) {
  const e = await evaluateShortAnswer({ attempt, question: q, answer, run: 1 });
  const failed = failureOf([e]);
  if (failed) throw failed;
  if (e.flags.includes('possible_integrity_issue')) throw new GradingError('integrity_flag', `The answer to question ${q.id} may contain instructions to the grader`, false);
  return e;
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

// leak-v2 (opt-in, offline benchmark so far). Never flags more than v1:
// - a model answer of 8-15 words leaks only if it appears whole (v1: any 8
//   consecutive words), longer ones by any 8-word run as in v1, shorter ones
//   never (as in v1);
// - runs the student already wrote don't count: repeating the student's own
//   words reveals nothing.
export function leaksModelAnswerV2(text: string, modelAnswer: string, studentAnswer: string) {
  const model = words(modelAnswer);
  if (!model.length) return false;
  if (model.length < 8) return false;
  const w = model.length < 16 ? model.length : 8;
  const t = ` ${words(text).join(' ')} `;
  const student = ` ${words(studentAnswer).join(' ')} `;
  for (let i = 0; i + w <= model.length; i++) {
    const run = ` ${model.slice(i, i + w).join(' ')} `;
    if (t.includes(run) && !student.includes(run)) return true;
  }
  return false;
}

// Words of the hidden material that must not show up in released text.
function leaks(text: string, q: IQuestion, mode: 'v1' | 'v2' = 'v1', studentAnswer = '') {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  if (mode === 'v2') {
    if (leaksModelAnswerV2(text, String(q.modelAnswer ?? ''), studentAnswer)) return 'model answer';
    return keyLeak(t, q);
  }
  const model = String(q.modelAnswer ?? '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  for (let i = 0; i + 8 <= model.length; i++) {
    if (t.includes(` ${model.slice(i, i + 8).join(' ')} `)) return 'model answer';
  }
  return keyLeak(t, q);
}

function keyLeak(t: string, q: IQuestion) {
  if (q.type === 'short-answer') {
    const key = String(q.correctAnswer ?? '').trim().toLowerCase();
    if (key.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(t)) return 'answer key';
  }
  return null;
}

// Deterministic checks before anything is finalized. Throws GradingError.
export function validateGrading(params: { attempt: AttemptDoc; assignment: Pick<IAssignment, 'id'>; version: { assessmentId: string; version: number }; questions: IQuestion[]; answers: IAttemptAnswer[]; evaluations: Map<string, Evaluation>; leakCheck?: 'v1' | 'v2' }) {
  const { attempt, assignment, version, questions, answers, evaluations } = params;
  const leakMode = params.leakCheck ?? 'v1'; // production: v1
  const fail = (reason: string, msg: string, retryable = false) => {
    throw new GradingError(reason, msg, retryable);
  };
  if (attempt.assignmentId !== assignment.id) fail('wrong_assignment', 'The attempt does not belong to this assignment');
  if (attempt.assessmentId !== version.assessmentId || attempt.assessmentVersion !== version.version) fail('wrong_version', 'The attempt was graded against a different assessment version');
  const ids = answers.map((a) => a.questionId);
  if (new Set(ids).size !== ids.length) fail('duplicate_answers', 'An answer appears twice');
  for (const q of questions) if (!ids.includes(q.id)) fail('incomplete', `No grading result for question ${q.id}`);
  if (ids.length !== questions.length) fail('unknown_answers', 'There are answers to questions not in this version');
  for (const a of answers) {
    const q = questions.find((x) => x.id === a.questionId)!;
    const max = questionPoints(q);
    if (a.maxPoints !== max) fail('bad_max_points', `Question ${q.id} has the wrong maximum`);
    if (typeof a.points !== 'number' || !Number.isFinite(a.points) || a.points < 0 || a.points > max) fail('bad_points', `Question ${q.id} has points out of range`);
    if (a.method === 'rule') {
      if (AUTO_GRADED.has(q.type) && hasText(a.studentAnswer)) {
        const correct = gradeAnswer(q, a.studentAnswer as string);
        if (correct !== a.isCorrect || a.points !== (correct ? max : 0)) fail('rule_mismatch', `Question ${q.id} does not match its answer key`);
      } else if (!hasText(a.studentAnswer) && a.points !== 0) fail('bad_points', `Unanswered question ${q.id} has points`);
      continue;
    }
    if (a.method !== 'ai') fail('bad_method', `Question ${q.id} was not graded by the grader`);
    const e = evaluations.get(q.id);
    if (!e || e.attemptId !== attempt.id || e.questionId !== q.id || !usable(e)) fail('missing_evaluation', `Question ${q.id} has no valid evaluation`);
    if (!hasText(a.feedback) || !hasText(a.scoreExplanation)) fail('missing_feedback', `Question ${q.id} has no feedback`, true);
    if (q.type === 'open-response') {
      const criteria = q.rubric?.criteria || [];
      const scores = a.criterionScores || [];
      if (scores.length !== criteria.length) fail('bad_criteria', `Question ${q.id} is missing criterion scores`);
      let sum = 0;
      for (const c of criteria) {
        const s = scores.filter((x) => x.criterionId === c.id);
        const level = c.levels.find((l) => l.id === s[0]?.levelId);
        if (s.length !== 1 || !level || level.points !== s[0].points || s[0].points > c.maxPoints) fail('bad_criteria', `Criterion ${c.id} on question ${q.id} is out of range`);
        sum += s[0].points;
      }
      if (sum !== a.points) fail('bad_total', `Question ${q.id} points don't add up`);
      const allowed = questionObjectiveIds(q);
      if ((e!.objectiveIds || []).some((id) => !allowed.includes(id))) fail('bad_objectives', `Question ${q.id} refers to objectives it doesn't cover`, true);
    } else if (a.points !== 0 && a.points !== max) fail('bad_points', `Short answer ${q.id} must be right or wrong`);
    const released = [a.feedback, a.scoreExplanation, ...(a.strengths || []), ...(a.improvements || [])].join(' \n ');
    const leaked = leaks(released, q, leakMode, String(a.studentAnswer ?? ''));
    if (leaked) fail('feedback_leak', `Feedback for question ${q.id} reveals the ${leaked}`, true);
  }
  const t = totals(answers);
  if (!t.complete) fail('incomplete', 'Some answers have no points');
  return t;
}

async function claim(attemptId: string, now: Date) {
  return AssessmentAttempt.findOneAndUpdate(
    {
      id: attemptId,
      status: 'submitted',
      $or: [
        { gradingStatus: { $in: ['grading_queued', 'grading_failed'] }, $or: [{ nextGradingAt: { $exists: false } }, { nextGradingAt: null }, { nextGradingAt: { $lte: now } }] },
        { gradingStatus: 'grading_in_progress', gradingLeaseUntil: { $lt: now } },
      ],
    },
    {
      $set: { gradingStatus: 'grading_in_progress', gradingLeaseUntil: new Date(now.getTime() + LEASE_MS) },
      $inc: { gradingRuns: 1 },
      $push: { history: { at: now, by: GRADER, action: 'grading_started' } },
    },
    { new: true },
  );
}

async function recordFailure(attempt: AttemptDoc, error: unknown, now: Date) {
  const e = error instanceof GradingError ? error : new GradingError('unexpected_error', String((error as Error)?.message ?? error).slice(0, 300), true);
  const runs = attempt.gradingRuns ?? 1;
  const final = !e.retryable || runs >= MAX_GRADING_RUNS;
  const update = final
    ? { $set: { gradingStatus: 'grading_exception', exceptionReason: e.reason, gradingError: e.message.slice(0, 500) }, $unset: { gradingLeaseUntil: 1, nextGradingAt: 1 } }
    : { $set: { gradingStatus: 'grading_failed', gradingError: e.message.slice(0, 500), nextGradingAt: new Date(now.getTime() + BACKOFF_MS[Math.min(runs - 1, BACKOFF_MS.length - 1)]) }, $unset: { gradingLeaseUntil: 1 } };
  await AssessmentAttempt.updateOne(
    { id: attempt.id, gradingStatus: 'grading_in_progress', gradingRuns: runs },
    { ...update, $push: { history: { at: now, by: GRADER, action: final ? 'grading_exception' : 'grading_failed', reason: `${e.reason}: ${e.message}`.slice(0, 500) } } },
  );
  logger.warn(final ? 'grading_exception' : 'grading_failed', { attemptId: attempt.id, reason: e.reason, runs });
  return final ? 'exception' : 'failed';
}

// One grading run. Safe to call any number of times, from anywhere.
export async function processAttempt(attemptId: string, now = new Date()): Promise<'released' | 'failed' | 'exception' | 'skipped'> {
  const attempt = await claim(attemptId, now);
  if (!attempt) return 'skipped';
  try {
    const assignment = await Assignment.findOne({ id: attempt.assignmentId }).lean();
    if (!assignment) throw new GradingError('assignment_missing', 'The assignment no longer exists', false);
    if (!attempt.assessmentVersion) throw new GradingError('version_missing', 'The attempt has no assessment version', false);
    const version = await getVersion(attempt.assessmentId, attempt.assessmentVersion).catch(() => {
      throw new GradingError('version_missing', 'The assessment version is missing', false);
    });
    const questions = version.questions as IQuestion[];
    const byId = new Map(questions.map((q) => [q.id, q]));
    const unsupported = questions.find((q) => !AUTO_GRADED.has(q.type) && q.type !== 'open-response');
    if (unsupported) throw new GradingError('unsupported_question', `Question type ${unsupported.type} can't be graded automatically`, false);

    const todo = attempt.answers.filter((a) => needsAiEvaluation(byId.get(a.questionId), a));
    if (todo.length) {
      if (!(await isFeatureEnabled(attempt.institutionId, 'ai_grading_enabled'))) throw new GradingError('ai_grading_off', 'AI grading is turned off for this school', false);
      if (!isAiConfigured()) throw new GradingError('ai_unavailable', 'AI is not configured', true);
    }
    const objectives = todo.length
      ? (await LearningObjective.find({ id: { $in: [...new Set(questions.flatMap(questionObjectiveIds))] } }).select('id title').lean()).map((o) => ({ id: o.id, title: o.title }))
      : [];

    // AI evaluation.
    const evaluations = new Map<string, Evaluation>();
    const history: { at: Date; by: string; action: string; questionId?: string; to?: unknown; reason?: string }[] = [];
    const answers: IAttemptAnswer[] = [];
    for (const a of attempt.answers.map((x) => ({ ...(typeof (x as any).toObject === 'function' ? (x as any).toObject() : x) }) as IAttemptAnswer)) {
      const q = byId.get(a.questionId);
      if (!q || !needsAiEvaluation(q, a)) {
        // Answer key, or nothing written: 0 points by rule.
        answers.push(hasText(a.studentAnswer) ? a : { ...a, points: 0, method: 'rule', needsReview: false, feedback: a.feedback ?? 'No answer was given.' });
        continue;
      }
      const text = String(a.studentAnswer);
      if (q.type === 'open-response') {
        const { chosen, all } = await evaluateOpen(attempt, q, text, objectives);
        evaluations.set(q.id, chosen);
        answers.push({
          ...a,
          points: chosen.points!,
          method: 'ai',
          needsReview: false,
          proposalId: chosen.id,
          criterionScores: chosen.criteria.map((c) => ({ criterionId: c.criterionId, levelId: c.levelId, points: c.points })),
          feedback: chosen.feedback,
          scoreExplanation: chosen.scoreExplanation,
          strengths: chosen.strengths ?? [],
          improvements: chosen.improvements ?? [],
        });
        history.push({ at: now, by: GRADER, action: 'ai_evaluated', questionId: q.id, to: chosen.points, reason: `${all.length} evaluation(s): ${all.map((e) => e.points).join(', ')}` });
      } else {
        const e = await evaluateShort(attempt, q, text);
        evaluations.set(q.id, e);
        const correct = (e.points ?? 0) > 0;
        answers.push({ ...a, points: e.points!, isCorrect: correct, method: 'ai', needsReview: false, proposalId: e.id, feedback: e.feedback, scoreExplanation: e.scoreExplanation });
        history.push({ at: now, by: GRADER, action: 'ai_evaluated', questionId: q.id, to: e.points });
      }
    }

    // Result validation.
    const t = validateGrading({ attempt, assignment, version, questions, answers, evaluations });
    history.push({ at: now, by: GRADER, action: 'validated' }, { at: now, by: GRADER, action: 'finalized', to: { totalPoints: t.totalPoints, maxPoints: t.maxPoints } }, { at: now, by: GRADER, action: 'released' });

    // Finalize and release together; only if this run still owns the attempt.
    const done = await AssessmentAttempt.findOneAndUpdate(
      { id: attempt.id, gradingStatus: 'grading_in_progress', gradingRuns: attempt.gradingRuns },
      {
        $set: {
          answers,
          totalPoints: t.totalPoints,
          maxPoints: t.maxPoints,
          score: t.percent,
          gradingStatus: 'released',
          finalizedAt: now,
          finalizedBy: GRADER,
          releasedAt: now,
          intelligenceStatus: 'pending',
        },
        $unset: { gradingLeaseUntil: 1, nextGradingAt: 1, gradingError: 1, exceptionReason: 1 },
        $push: { history: { $each: history } },
      },
      { new: true },
    );
    if (!done) return 'skipped';
    logger.info('grading_released', { attemptId: done.id, score: done.score, aiAnswers: todo.length, version: AUTO_GRADING_VERSION });
    // Downstream steps: each can fail without affecting the released grade.
    await notifyResultsReleased(assignment, done.studentId, done.id).catch((error) => logger.warn('results_notification_failed', { attemptId: done.id, error: String(error) }));
    await updateLearningIntelligence(done.id, questions, version.subject);
    return 'released';
  } catch (error) {
    return recordFailure(attempt, error, now);
  }
}

// Called on submit. Objective-only attempts are graded before the response
// returns; AI grading runs in the background (the student sees "grading").
export async function startGrading(attempt: AttemptDoc) {
  const run = processAttempt(attempt.id).catch((error) => {
    logger.warn('grading_run_crashed', { attemptId: attempt.id, error: String(error) });
    return 'failed' as const;
  });
  const version = await getVersion(attempt.assessmentId, attempt.assessmentVersion!).catch(() => null);
  const byId = new Map(((version?.questions as IQuestion[]) || []).map((q) => [q.id, q]));
  if (!attempt.answers.some((a) => needsAiEvaluation(byId.get(a.questionId), a))) await run;
  else import('@vercel/functions').then(({ waitUntil }) => waitUntil(run)).catch(() => undefined);
  return (await AssessmentAttempt.findOne({ id: attempt.id })) ?? attempt;
}

// Reconciliation: attempts due for a (re)try and runs whose lease ran out.
// Called by the cron, and with attemptIds whenever results are read.
export async function sweepGrading(opts: { limit?: number; attemptIds?: string[] } = {}) {
  const now = new Date();
  const due = await AssessmentAttempt.find({
    ...(opts.attemptIds ? { id: { $in: opts.attemptIds } } : {}),
    status: 'submitted',
    $or: [
      { gradingStatus: { $in: ['grading_queued', 'grading_failed'] }, $or: [{ nextGradingAt: { $exists: false } }, { nextGradingAt: null }, { nextGradingAt: { $lte: now } }] },
      { gradingStatus: 'grading_in_progress', gradingLeaseUntil: { $lt: now } },
    ],
  })
    .select('id')
    .sort({ submittedAt: 1 })
    .limit(opts.limit ?? 20)
    .lean();
  const results: Record<string, number> = {};
  for (const t of due) {
    const r = await processAttempt(t.id, now);
    results[r] = (results[r] ?? 0) + 1;
  }
  return { due: due.length, ...results };
}

// Fire-and-forget reconciliation for the attempts a page is showing.
export function kickGrading(attemptIds: string[]) {
  if (!attemptIds.length) return;
  const task = sweepGrading({ attemptIds, limit: 5 }).catch((error) => logger.warn('grading_kick_failed', { error: String(error) }));
  import('@vercel/functions').then(({ waitUntil }) => waitUntil(task)).catch(() => undefined);
}
