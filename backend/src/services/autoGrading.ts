import { gradeEngineQuestion, isOpenEngine, isCodeEngine, rubricExtrasOf } from '../assessment/questionBridge';
import { gradeCode } from '../assessment/grading-engine/graders/code';
import { gradeOpenAnswer, nearPassMark, rulesFor } from '../assessment/grading-engine/open';
import type { OpenItem } from '../assessment/grading-engine/graders/domains';
import { engineV2 } from './engineV2';
import { recordAlert } from './auditTrail';
import { AssessmentAttempt, type IAttemptAnswer } from '../models/AssessmentAttempt';
import type { IQuestion } from '../models/Assessment';
import { Assignment, type IAssignment } from '../models/Assignment';
import type { IGradingProposal } from '../models/GradingProposal';
import { LearningObjective } from '../models/LearningObjective';
import { gradeAnswer } from './assessmentSecurity';
import { graderV2On, spellingIsTarget, targetFormPoints, useErrorCorrectionCheck } from './graderV2';
import { AUTO_GRADED, getVersion, questionPoints } from './assessmentVersions';
import { isAiConfigured } from './aiJson';
import { isFeatureEnabled } from './featureFlags';
import { totals, updateLearningIntelligence } from './grading';
import { questionObjectiveIds, type EvalPolicy } from './gradingProposals';
// Every grade comes through the assessment engine's entry; the older open graders are reached through it, unchanged.
import { legacyRubricAnswer as evaluateRubricAnswer, legacyShortAnswer as evaluateShortAnswer } from '../assessment/grading-engine';
import { notifyResultsReleased } from './teachingNotifications';
import { logger } from '../utils/logging';
import { lmsResultChanged } from '../integrations/lms/core/gradeEvents';
import { recordGradeChange } from './gradeLedger';

// Automatic grading (autograde-v1). Every submitted assignment attempt is
// graded, validated, finalized and released without a teacher in the way:
//
//   grading_queued → grading_in_progress → [AI evaluation → validation]
//                  → finalized + released (one conditional write); when the
//                    assignment's releasePolicy is 'manual', finalized only:
//                    the teacher releases the results (P22)
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
  if (q.type === 'engine') return isOpenEngine(q); // closed engine items: by code; open ones: the engine's domain graders
  // Option B2 (ENARA_EC_CHECK=on): error-correction answers that are not an exact key match go to the
  // error-correction check, even when the rules gave credit or the word is the target.
  if (q.type === 'short-answer' && useErrorCorrectionCheck({ ...q, prompt: q.text } as never, String(a.studentAnswer))) return true;
  // graderV2 ON: a target-form item the deterministic scorer decides needs no model.
  if (graderV2On() && targetFormPoints(q, String(a.studentAnswer), questionPoints(q)) !== null) return false;
  if (q.type === 'open-response') return true;
  // graderV2 ON (production safety): word-target short answers (vocabulary, spelling, case) keep the
  // deterministic key score; no meaning check. Model path: NOT VALIDATED until run with the API.
  if (graderV2On() && q.type === 'short-answer' && spellingIsTarget(q)) return false;
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

// leak-v2 (opt-in, offline benchmark so far). Compared with v1:
// - both ignore punctuation (v1 since P19.2 F-2); v2 also skips runs the
//   student wrote and needs a short model answer to appear whole;
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
  // Compare words with case and punctuation ignored, so a comma or full stop
  // inside a copied run cannot hide it (P19.2 F-2: "more energy, so more of them").
  // A run the student wrote themselves reveals nothing hidden (P19.2 C4-07).
  const model = words(String(q.modelAnswer ?? ''));
  const released = ` ${words(text).join(' ')} `;
  const own = ` ${words(studentAnswer).join(' ')} `;
  for (let i = 0; i + 8 <= model.length; i++) {
    const run = ` ${model.slice(i, i + 8).join(' ')} `;
    if (released.includes(run) && !own.includes(run)) return 'model answer';
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
    // Code answers: graded by the sandbox tests (method rule); one 0-1 criterion per test, summing to the points.
    if (isCodeEngine(q)) {
      if (!hasText(a.studentAnswer)) { if (a.points !== 0) fail('bad_points', `Unanswered question ${q.id} has points`); continue; }
      const crit = q.rubric?.criteria || [];
      const scores = a.criterionScores || [];
      if (a.method !== 'rule' || a.grader !== 'code') fail('bad_method', `Code question ${q.id} was not graded by its tests`);
      if (scores.length !== crit.length || scores.some((x) => x.points !== 0 && x.points !== 1) || scores.reduce((n, x) => n + x.points, 0) !== a.points) fail('bad_criteria', `Code question ${q.id} test results don't add up`);
      continue;
    }
    // Rules-first: an open engine answer decided wholly by code rules (no model call) must be exactly what the rules give.
    if (isOpenEngine(q) && a.grader === 'code') {
      const crit = q.rubric?.criteria || [];
      const r = rulesFor(openItemOf(q), a.studentAnswer, Object.fromEntries(crit.map((c) => [c.id, c.maxPoints])));
      const scores = a.criterionScores || [];
      const sum = crit.reduce((n, c) => n + (r.decided[c.id]?.points ?? NaN), 0);
      if (a.method !== 'rule' || !r.allDecided || a.points !== sum || scores.length !== crit.length || scores.some((x) => r.decided[x.criterionId]?.points !== x.points)) fail('rule_mismatch', `Question ${q.id} does not match its code rules`);
      continue;
    }
    if (a.method === 'rule') {
      const tf = graderV2On() && hasText(a.studentAnswer) ? targetFormPoints(q, String(a.studentAnswer), max) : null;
      if (tf !== null) {
        if (a.points !== tf) fail('rule_mismatch', `Question ${q.id} does not match its target-form score`);
      } else if (q.type === 'engine' && hasText(a.studentAnswer)) {
        const g = gradeEngineQuestion(q as never, a.studentAnswer);
        if (!('result' in g) || a.points !== g.result.total) fail('rule_mismatch', `Question ${q.id} does not match its answer key`);
      } else if (AUTO_GRADED.has(q.type) && hasText(a.studentAnswer)) {
        const correct = gradeAnswer(q, a.studentAnswer as string);
        if (correct !== a.isCorrect || a.points !== (correct ? max : 0)) fail('rule_mismatch', `Question ${q.id} does not match its answer key`);
      } else if (!hasText(a.studentAnswer) && a.points !== 0) fail('bad_points', `Unanswered question ${q.id} has points`);
      continue;
    }
    // A flagged engine answer with no model grade (model unavailable): 0 points until the teacher scores it.
    if (isOpenEngine(q) && a.flagged && a.grader === 'none') { if (a.points !== 0) fail('bad_points', `Question ${q.id} has points without a grade`); continue; }

    if (a.method !== 'ai') fail('bad_method', `Question ${q.id} was not graded by the grader`);
    const e = evaluations.get(q.id);
    if (!e || e.attemptId !== attempt.id || e.questionId !== q.id || !usable(e)) fail('missing_evaluation', `Question ${q.id} has no valid evaluation`);
    if (!hasText(a.feedback) || !hasText(a.scoreExplanation)) fail('missing_feedback', `Question ${q.id} has no feedback`, true);
    if (q.type === 'open-response' || isOpenEngine(q)) {
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
  if (final) void recordAlert('grading_exception', 'warning', { scope: e.reason, attemptId: attempt.id, reason: e.reason }, attempt.institutionId);
  // LMS grade passback (inert unless switched on): now waiting for a person.
  if (final) await recordGradeChange(attempt.id, 'grading_exception', GRADER);
  if (final) await lmsResultChanged(attempt.id, 'grading_exception');
  return final ? 'exception' : 'failed';
}

// One grading run. Safe to call any number of times, from anywhere.
// Assessment engine (P2a): the engine item of an open engine question, for its domain grader.
function openItemOf(q: IQuestion): OpenItem {
  const e = q.engine as { type: OpenItem['type']; domain: OpenItem['domain']; language: string; source?: string; audio?: { transcript?: string }; flags?: Record<string, boolean>; answer_key?: { final?: OpenItem['final']; solution?: string } };
  const extras = rubricExtrasOf(e);
  return {
    questionId: q.id, stem: q.text, type: e.type, domain: e.domain, language: e.language,
    ...(e.answer_key?.final ? { final: e.answer_key.final } : {}), ...(e.answer_key?.solution ? { solution: e.answer_key.solution } : {}),
    ...(extras.points ? { points: extras.points, units: extras.units } : {}), ...(e.source ? { source: e.source } : {}),
    ...(extras.spoken ? { spoken: true } : {}),
    // Listening: the recording's transcript is the source the answer is judged against.
    ...(e.audio?.transcript ? { source: e.audio.transcript } : {}),
  };
}

export async function processAttempt(attemptId: string, now = new Date()): Promise<'released' | 'finalized' | 'review' | 'failed' | 'exception' | 'skipped'> {
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
    const unsupported = questions.find((q) => !AUTO_GRADED.has(q.type) && q.type !== 'open-response' && q.type !== 'engine');
    if (unsupported) throw new GradingError('unsupported_question', `Question type ${unsupported.type} can't be graded automatically`, false);

    const todo = attempt.answers.filter((a) => needsAiEvaluation(byId.get(a.questionId), a));
    // Engine open answers never stop the attempt when the model is not available: they go to the teacher's queue (flagged).
    const engineTodo = todo.filter((a) => isOpenEngine(byId.get(a.questionId) ?? {}));
    const legacyTodo = todo.filter((a) => !isOpenEngine(byId.get(a.questionId) ?? {}));
    const engineModelReady = engineTodo.length > 0 && engineV2('assessGrading') && isAiConfigured() && (await isFeatureEnabled(attempt.institutionId, 'ai_grading_enabled'));
    const uiLanguage: 'ar' | 'en' = engineTodo.length
      ? await (await import('../models/Student')).Student.findOne({ id: attempt.studentId }).select('uiLanguage').lean().then((st) => (st?.uiLanguage === 'ar' ? 'ar' : st?.uiLanguage === 'en' ? 'en' : (/^ar/.test(String((byId.get(engineTodo[0].questionId)?.engine as { language?: string } | undefined)?.language)) ? 'ar' : 'en')))
      : 'en';
    if (legacyTodo.length) {
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
      if (isCodeEngine(q)) {
        // Code: the teacher's tests in the sandbox; no model, so it runs whether or not a model is ready.
        const e = q.engine as { answer_key: { tests: { name: string; call: string; expected: unknown }[] } };
        const g = await gradeCode({ code: text, tests: e.answer_key.tests, uiLanguage });
        answers.push({
          ...a, points: g.points, method: 'rule', needsReview: g.flagged, isCorrect: g.points === g.maxPoints,
          criterionScores: g.criterionScores, feedback: g.feedback, scoreExplanation: g.scoreExplanation,
          criteria: g.criteria, errorCodes: g.errorCodes, confidence: 1, flagged: g.flagged, flagReasons: g.flagReasons as never, grader: 'code', feedbackText: g.feedback,
        } as IAttemptAnswer);
        history.push({ at: now, by: GRADER, action: g.flagged ? 'engine_flagged' : 'engine_evaluated', questionId: q.id, to: g.points, reason: `tests ${g.points}/${g.maxPoints}` });
        continue;
      }
      if (isOpenEngine(q)) {
        const maxByCriterion = Object.fromEntries((q.rubric?.criteria || []).map((c) => [c.id, c.maxPoints]));
        const g = await gradeOpenAnswer({ attempt, item: openItemOf(q), answer: a.studentAnswer, uiLanguage, maxByCriterion, modelReady: engineModelReady });
        if (g.proposalId) evaluations.set(q.id, { id: g.proposalId, attemptId: attempt.id, questionId: q.id, status: 'proposed', objectiveIds: [] } as unknown as Evaluation);
        const blank = g.grader === 'none';
        answers.push({
          ...a, points: g.points, method: g.grader === 'code' ? 'rule' : 'ai', needsReview: g.flagged, proposalId: g.proposalId,
          criterionScores: g.criterionScores,
          feedback: blank ? 'Your teacher will check this answer.' : g.feedback,
          scoreExplanation: blank ? 'Waiting for your teacher.' : g.scoreExplanation,
          strengths: g.strengths, improvements: g.improvements,
          criteria: g.criteria, errorCodes: g.errorCodes, confidence: g.confidence, flagged: g.flagged, flagReasons: g.flagReasons, grader: g.grader,
          ...(g.engine ? { engine: g.engine } : {}),
          ...(blank ? {} : { feedbackText: g.feedback }),
        } as IAttemptAnswer);
        history.push({ at: now, by: GRADER, action: g.flagged ? 'engine_flagged' : 'engine_evaluated', questionId: q.id, to: g.points, reason: g.flagged ? g.flagReasons.join(', ') : g.grader === 'code' ? `code: ${g.criteria[0]?.rule ?? ''}` : `runs: ${g.runs.map((r) => r.points).join(', ')}` });
        continue;
      }
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
    // Assessment engine: a model-graded attempt within 1 point of the pass mark (the assignment's own, else the app's 60 %) goes to the teacher.
    const modelGraded = answers.filter((a) => isOpenEngine(byId.get(a.questionId) ?? {}) && String(a.grader ?? '').startsWith('model:'));
    if (modelGraded.length && nearPassMark(t.totalPoints, t.maxPoints, assignment.speaking?.passThreshold ?? 60)) {
      for (const a of modelGraded) { a.flagged = true; a.needsReview = true; a.flagReasons = [...new Set([...(a.flagReasons ?? []), 'near_pass_mark'])]; }
    }
    // Flagged engine answers: the attempt waits in the teacher's queue (needs_review); nothing is finalized or released.
    if (answers.some((a) => a.flagged)) {
      history.push({ at: now, by: GRADER, action: 'flagged_for_teacher' });
      const held = await AssessmentAttempt.findOneAndUpdate(
        { id: attempt.id, gradingStatus: 'grading_in_progress', gradingRuns: attempt.gradingRuns },
        { $set: { answers, totalPoints: t.totalPoints, maxPoints: t.maxPoints, gradingStatus: 'needs_review' }, $unset: { gradingLeaseUntil: 1, nextGradingAt: 1, gradingError: 1, exceptionReason: 1 }, $push: { history: { $each: history } } },
        { new: true },
      );
      if (!held) return 'skipped';
      logger.info('grading_flagged_for_teacher', { attemptId: held.id, flagged: answers.filter((a) => a.flagged).length, version: AUTO_GRADING_VERSION });
      await recordGradeChange(held.id, 'auto_graded', GRADER).catch(() => undefined);
      return 'review';
    }
    // Manual release (assignment setting): finalize only; a teacher releases.
    const hold = assignment.releasePolicy === 'manual';
    history.push({ at: now, by: GRADER, action: 'validated' }, { at: now, by: GRADER, action: 'finalized', to: { totalPoints: t.totalPoints, maxPoints: t.maxPoints } });
    if (!hold) history.push({ at: now, by: GRADER, action: 'released' });

    // Finalize (and release) together; only if this run still owns the attempt.
    const done = await AssessmentAttempt.findOneAndUpdate(
      { id: attempt.id, gradingStatus: 'grading_in_progress', gradingRuns: attempt.gradingRuns },
      {
        $set: {
          answers,
          totalPoints: t.totalPoints,
          maxPoints: t.maxPoints,
          score: t.percent,
          gradingStatus: hold ? 'finalized' : 'released',
          // The run's start time is \`now\`; finalization and release happen here (P18-4).
          finalizedAt: new Date(),
          finalizedBy: GRADER,
          ...(hold ? {} : { releasedAt: new Date() }),
          intelligenceStatus: 'pending',
        },
        $unset: { gradingLeaseUntil: 1, nextGradingAt: 1, gradingError: 1, exceptionReason: 1 },
        $push: { history: { $each: history } },
      },
      { new: true },
    );
    if (!done) return 'skipped';
    logger.info(hold ? 'grading_finalized_held' : 'grading_released', { attemptId: done.id, score: done.score, aiAnswers: todo.length, version: AUTO_GRADING_VERSION });
    // Downstream steps: each can fail without affecting the grade.
    if (!hold) await notifyResultsReleased(assignment, done.studentId, done.id).catch((error) => logger.warn('results_notification_failed', { attemptId: done.id, error: String(error) }));
    // LMS grade passback (inert unless switched on): released -> the score; held -> pending.
    // Grade ledger (inert unless switched on): auto_graded, or regrade_after_grader_fix after a teacher's regrade.
    await recordGradeChange(done.id, 'auto_graded', GRADER);
    await lmsResultChanged(done.id, hold ? 'finalized' : 'released');
    // Parents P4: parent-new-results (released, or finalized for an "immediately" school; inert unless PARENT_EMAILS_ENABLED).
    await (await import('../parents/parentEmails')).notifyResultVisible(done.id);
    await updateLearningIntelligence(done.id, questions, version.subject);
    return hold ? 'finalized' : 'released';
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
