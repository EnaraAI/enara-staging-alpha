// Learner memory phase 1: "errors to work on" from released assessments (docs/tutor/LEARNER_MEMORY_PLAN.md §3). Behind ENARA_ENGINE_V2 `workOn`
// (named only, off by default). Everything here is written by code from graded evidence; the model only reads a short brief.
//
// Rules (owner, 20 Nov 2026):
// - every wrong item on a graded assignment attempt records its objective and error type;
// - never used while the assessment is open or has attempts left, or before the results are released (a teacher-reviewed item is released by the
//   teacher); the gate is checked every time the list is read;
// - the next tutor session opens with them: reteach the rule, practise with NEW items, never the assessment's own items (guard below);
// - an error leaves the list after two independent rights in a row in later sessions or attempts, and comes back on a wrong answer;
// - priority: recurring, then prerequisites, then most recent; at most 3 per session (2 for children);
// - teachers see each learner's list (and can dismiss a row).
import { randomUUID } from 'crypto';
import { ErrorToWorkOn, ErrorToWorkOnSync, type IErrorToWorkOn } from '../models/ErrorToWorkOn';
import { engineV2 } from './engineV2';
import { logger, serializeError } from '../utils/logging';

export const workOnOn = (): boolean => engineV2('workOn');
export const WORK_ON_MAX = { child: 2, other: 3 } as const;
export const WORK_ON_RESOLVE_STREAK = 2;
/** Self-study kinds: an attempt on one outside an assignment is practice, not a test, so its errors are usable at once. */
export const PRACTICE_KINDS = new Set(['practice', 'formative', 'retention_check']);

// ------------------------------------------------------------------------------------------------ pure parts (unit-tested)
type Q = { id: string; type?: string; correctAnswer?: unknown; objectiveIds?: string[]; options?: string[]; distractors?: { option: string; category: string; description: string }[]; text?: string };
type A = { questionId: string; isCorrect?: boolean; points?: number | null; maxPoints?: number; studentAnswer?: unknown; method?: string };
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'unknown';

/** Was this graded answer wrong? A partly right answer (some points, not all) counts as wrong for the list. */
export function answerWrong(a: A): boolean {
  if (typeof a.points === 'number' && typeof a.maxPoints === 'number' && a.maxPoints > 0) return a.points < a.maxPoints;
  return a.isCorrect === false;
}
// workOnTrusted (LIT_REVIEW_GAP_PLAN 3.4): the live grader on lms-test (graderV2 off) agreed with the reference on 60.4% of controlled items
// (validation round 2); graderV2 on gap and choice items 95.1% (round 8); error correction by rules 83.3% (round 11). So a wrong answer
// becomes an error to work on only when its score comes from a path that is right often enough:
//  - a person set or accepted the score (method teacher / ai_proposal);
//  - a choice item (multiple-choice, true-false) scored by rule;
//  - a gap item ("___") scored by rule under graderV2, when the answer is short (at most 3 words: a whole sentence typed into the gap
//    was a false reject in round 8) and is not a contraction of the key ("'d" for "would", round 8).
// Not trusted: error correction and other free short answers scored by rule, and AI-scored open answers.
export const workOnTrustedOn = (): boolean => engineV2('workOnTrusted');
const CONTRACTIONS: Record<string, string[]> = { "'d": ['would', 'had'], "'s": ['is', 'has'], "'re": ['are'], "'m": ['am'], "'ll": ['will'], "'ve": ['have'], "n't": ['not'] };
const norm1 = (v: unknown) => String(v ?? '').toLowerCase().replace(/[’]/g, "'").replace(/[.!?,]+$/g, '').trim();
export function trustedWrong(q: Pick<Q, 'type' | 'text' | 'correctAnswer'> | undefined, a: Pick<A, 'method' | 'studentAnswer'>, opts: { graderV2: boolean }): boolean {
  if (a.method === 'teacher' || a.method === 'ai_proposal') return true;
  if (!q) return false;
  if ((q.type === 'multiple-choice' || q.type === 'true-false') && (a.method === 'rule' || a.method === undefined)) return true;
  // Assessment engine closed items are scored by code from a checked key: as trusted as a choice item.
  if (q.type === 'engine' && a.method === 'rule') return true;
  if (q.type === 'short-answer' && a.method === 'rule' && opts.graderV2 && /_{2,}/.test(q.text ?? '')) {
    const ans = norm1(a.studentAnswer);
    if (!ans || ans.split(/\s+/).length > 3) return false;
    const keys = (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]).map(norm1);
    if (Object.entries(CONTRACTIONS).some(([c, full]) => ans.endsWith(c) && keys.some((k) => full.some((f) => k === f || k.endsWith(` ${f}`))))) return false;
    return true;
  }
  return false;
}

/** The error type of a wrong answer: the chosen option's distractor category (school item authoring), else 'unknown'. Never the answer text. */
export function errorOf(q: Q, a: A): { errorCode: string; errorLabel?: string } {
  // Assessment engine: the grader's error code (fixed taxonomy), never text from the answer.
  const engineCode = (a as { errorCodes?: string[] }).errorCodes?.[0];
  if (engineCode) return { errorCode: slug(engineCode) };
  const chosen = typeof a.studentAnswer === 'number' && q.options ? q.options[a.studentAnswer] : typeof a.studentAnswer === 'string' ? a.studentAnswer : undefined;
  const d = chosen !== undefined ? q.distractors?.find((x) => x.option.trim().toLowerCase() === String(chosen).trim().toLowerCase()) : undefined;
  if (d?.category) return { errorCode: slug(d.category), ...(d.description ? { errorLabel: d.description.replace(/\s+/g, ' ').trim().slice(0, 120) } : {}) };
  return { errorCode: 'unknown' };
}

export interface GateInput {
  attempt: { gradingStatus?: string; releasedAt?: Date | null };
  assignment?: { state?: string; dueAt?: Date | string; closesAt?: Date | string | null; latePolicy?: string; maxAttempts?: number } | null;
  attemptsUsed: number;
  attemptInProgress: boolean;
  now: Date;
}
/** May the tutor work on errors from this attempt? Only when the results are released AND the assessment is over for this learner. */
export function gateOpen(g: GateInput): boolean {
  if (g.attempt.gradingStatus !== 'released' || !g.attempt.releasedAt) return false; // teacher review / manual release: wait for it
  if (g.attemptInProgress) return false;
  const a = g.assignment;
  if (!a) return false;
  if (a.state === 'closed' || a.state === 'archived') return true;
  const close = a.closesAt ? new Date(a.closesAt) : a.latePolicy === 'accept_late' ? undefined : a.dueAt ? new Date(a.dueAt) : undefined;
  if (close && g.now.getTime() > close.getTime()) return true;
  return g.attemptsUsed >= (a.maxAttempts ?? 1); // no attempts left
}

/** Priority: recurring (seen twice or more), then a prerequisite of another listed error's objective, then the most recent. */
export function prioritize<T extends Pick<IErrorToWorkOn, 'objectiveId' | 'occurrences' | 'lastSeenAt'>>(errors: T[], prereqsOf: Map<string, string[]>, limit: number): T[] {
  const objs = new Set(errors.map((e) => e.objectiveId));
  const isPrereq = (o: string) => [...objs].some((x) => x !== o && (prereqsOf.get(x) ?? []).includes(o));
  return [...errors]
    .sort((a, b) => Number(b.occurrences >= 2) - Number(a.occurrences >= 2) || Number(isPrereq(b.objectiveId)) - Number(isPrereq(a.objectiveId)) || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, limit);
}

// spacedReview (LIT_REVIEW_GAP_PLAN 3.1, owner "go" 20 Nov 2026; Kim & Webb 2022): reviews at growing intervals, and an error closes only
// after an UNASSISTED right answer at least SPACED_CLOSE_DAYS after the last wrong one; one more check SPACED_FINAL_DAYS after closing.
// Every outcome reaching applyOutcome is unassisted: released assessment answers, Moodle quiz answers, and tutor answers counted only
// with no hint on the item (independentSuccessItem; recordOutcomeForError checks hintLevel 0).
export const SPACED_DAYS = [1, 3, 7, 21] as const;
export const SPACED_CLOSE_DAYS = 2;
export const SPACED_FINAL_DAYS = 21;
const DAY = 86_400_000;
export const spacedReviewOn = (): boolean => engineV2('spacedReview');
/** The schedule after a wrong answer (also when an error is first recorded): the first review one day later. */
export function scheduleWrong(e: Pick<Mutable, 'lastWrongAt' | 'nextReviewAt' | 'reviewStep'>, at: Date): void {
  e.lastWrongAt = at; e.reviewStep = 0; e.nextReviewAt = new Date(at.getTime() + SPACED_DAYS[0] * DAY);
}
function applySpaced(e: Mutable, o: Outcome): boolean {
  if (!o.right) {
    e.rightStreak = 0;
    scheduleWrong(e, o.at);
    if (e.status === 'resolved') { e.statusHistory.push({ at: o.at, by: o.by, from: 'resolved', to: 'open', reason: 'wrong_again' }); e.status = 'open'; e.resolvedAt = undefined; e.finalCheckAt = undefined; }
    return true;
  }
  // adaptiveSpacing (NEXT_PLAN item 4): a right answer after a hint keeps the current step (the review comes back at the same gap) and never closes.
  if (adaptiveSpacingOn() && o.quality === 'assisted') {
    if (e.status === 'open') e.nextReviewAt = new Date(o.at.getTime() + SPACED_DAYS[Math.min(e.reviewStep ?? 0, SPACED_DAYS.length - 1)] * DAY);
    return true;
  }
  e.rightStreak += 1;
  const lastWrong = new Date(e.lastWrongAt ?? e.lastSeenAt).getTime();
  if (e.status === 'open') {
    if (o.at.getTime() - lastWrong >= SPACED_CLOSE_DAYS * DAY) {
      e.status = 'resolved'; e.resolvedAt = o.at; e.nextReviewAt = new Date(o.at.getTime() + SPACED_FINAL_DAYS * DAY);
      e.statusHistory.push({ at: o.at, by: o.by, from: 'open', to: 'resolved', reason: 'unassisted_right_after_delay' });
    } else {
      // Right too soon after the wrong one: the next review moves one step further out, the error stays open.
      // adaptiveSpacing: an easy right (unassisted, first try) skips one more step (1 -> 7 days, 3 -> 21 days).
      const jump = adaptiveSpacingOn() && o.quality === 'easy' ? 2 : 1;
      e.reviewStep = Math.min((e.reviewStep ?? 0) + jump, SPACED_DAYS.length - 1); e.nextReviewAt = new Date(o.at.getTime() + SPACED_DAYS[e.reviewStep] * DAY);
    }
  } else if (e.status === 'resolved' && e.nextReviewAt && o.at.getTime() >= new Date(e.nextReviewAt).getTime()) {
    e.finalCheckAt = o.at; e.nextReviewAt = undefined;
    e.statusHistory.push({ at: o.at, by: o.by, from: 'resolved', to: 'resolved', reason: 'final_check_passed' });
  }
  return true;
}
/** spacedReview: is this row due for the tutor now? Open errors when their review date has come; closed ones at their final check. */
export function reviewDue(e: Pick<IErrorToWorkOn, 'status' | 'nextReviewAt'>, now: Date): boolean {
  if (e.status === 'open') return !e.nextReviewAt || new Date(e.nextReviewAt).getTime() <= now.getTime();
  return e.status === 'resolved' && Boolean(e.nextReviewAt) && new Date(e.nextReviewAt!).getTime() <= now.getTime();
}

export type Outcome = { right: boolean; key: string; at: Date; by?: string; quality?: OutcomeQuality };
/** adaptiveSpacing: how a right answer came. easy = unassisted on the first try; assisted = right only after a hint (never closes an error). */
export type OutcomeQuality = 'easy' | 'assisted';
export const adaptiveSpacingOn = (): boolean => spacedReviewOn() && engineV2('adaptiveSpacing');
type Mutable = Pick<IErrorToWorkOn, 'status' | 'rightStreak' | 'countedKeys' | 'lastSeenAt' | 'occurrences' | 'statusHistory' | 'resolvedAt' | 'lastWrongAt' | 'nextReviewAt' | 'reviewStep' | 'finalCheckAt'>;
/** One later outcome on the error's point. Counts once per key (session or attempt), only after the error was last seen. Returns true if changed. */
export function applyOutcome(e: Mutable, o: Outcome): boolean {
  if (e.status === 'dismissed' || e.countedKeys.includes(o.key) || o.at.getTime() <= new Date(e.lastSeenAt).getTime()) return false;
  e.countedKeys.push(o.key);
  if (spacedReviewOn()) return applySpaced(e, o);
  if (o.right) {
    e.rightStreak += 1;
    if (e.status === 'open' && e.rightStreak >= WORK_ON_RESOLVE_STREAK) { e.status = 'resolved'; e.resolvedAt = o.at; e.statusHistory.push({ at: o.at, by: o.by, from: 'open', to: 'resolved', reason: 'two_independent_rights' }); }
  } else {
    e.rightStreak = 0;
    if (e.status === 'resolved') { e.statusHistory.push({ at: o.at, by: o.by, from: 'resolved', to: 'open', reason: 'wrong_again' }); e.status = 'open'; e.resolvedAt = undefined; }
  }
  return true;
}

/** Plain-words brief lines for the tutor (codes and the school's own label; never question text). */
export function briefLines(items: { code?: string; title?: string; errorCode: string; errorLabel?: string; occurrences: number; status?: string }[]): string[] {
  if (!items.length) return [];
  if (spacedReviewOn()) return [
    '- Reviews due (errors from earlier work, at spaced intervals; open with these, one at a time, before the lesson):',
    ...items.map((e, i) => `  ${i + 1}. ${e.code ? `${e.code} ` : ''}"${(e.title ?? 'this point').replace(/["<>]/g, '')}": ${(e.errorLabel ?? e.errorCode.replace(/_/g, ' ')).replace(/["<>]/g, '')}${e.status === 'resolved' ? ' (final check: it was fixed earlier)' : e.occurrences >= 2 ? ` (seen ${e.occurrences} times)` : ''}.`),
    '- For each: give ONE new practice item you write yourself on that point and let them answer it on their own first: no rule, hint or example before their try (this is a memory check). After their try: if right, confirm it in a few words; if wrong, say the rule in one plain sentence and give one more new item. Never use, quote or rebuild the questions of their assessment. In the hidden assess line of a reply that sets one of these items, add focus=E1, E2 or E3 (its number above).' + (engineV2('mixedReview') ? ' Make each review item a MIXED one: it needs that point AND one other point they know (today\'s lesson point, or a form often confused with it), so they must decide which rule fits.' : ''),
  ];
  return [
    '- Errors to work on (from the learner\'s released assessments; open with these, one at a time, before the lesson):',
    ...items.map((e, i) => `  ${i + 1}. ${e.code ? `${e.code} ` : ''}"${(e.title ?? 'this point').replace(/["<>]/g, '')}": ${(e.errorLabel ?? e.errorCode.replace(/_/g, ' ')).replace(/["<>]/g, '')}${e.occurrences >= 2 ? ` (seen ${e.occurrences} times)` : ''}.`),
    '- For each: say the rule in one plain sentence, then ONE new practice item you write yourself on the same point. Never use, quote or rebuild the questions of their assessment. In the hidden assess line of a reply that sets a practice item for one of these errors, add focus=E1, E2 or E3 (its number above).',
  ];
}

const norm = (t: string) => t.toLowerCase().replace(/_+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
/** Removes any reply sentence that contains an assessment question of the listed errors (4+ words of its text in a row). */
export function removeExamItems(reply: string, questionTexts: string[]): { text: string; removed: number } {
  const bodies = questionTexts.map((q) => norm(q.replace(/^[^:]{0,40}:\s*/, ''))).filter((b) => b.split(' ').length >= 4);
  if (!bodies.length) return { text: reply, removed: 0 };
  let removed = 0;
  const text = reply.split(/(?<=[.!?])\s+/).filter((s) => { const n = ` ${norm(s)} `; const hit = bodies.some((b) => n.includes(` ${b} `)); if (hit) removed += 1; return !hit; }).join(' ');
  return { text, removed };
}

// ------------------------------------------------------------------------------------------------ database parts
/** Turns newly released assignment attempts into errors (and later right/wrong outcomes on existing ones). Idempotent; never throws. */
export async function syncErrors(studentId: string, institutionId?: string): Promise<void> {
  if (!workOnOn()) return;
  try {
    const { AssessmentAttempt } = await import('../models/AssessmentAttempt');
    const { Assessment } = await import('../models/Assessment');
    const { LearningObjective } = await import('../models/LearningObjective');
    const sync = (await ErrorToWorkOnSync.findOne({ studentId }).lean()) ?? { attemptIds: [] as string[] };
    // Released assignment attempts, and submitted self-study attempts (practice kinds only, checked below).
    const attempts = await AssessmentAttempt.find({ studentId, id: { $nin: sync.attemptIds }, $or: [{ gradingStatus: 'released', assignmentId: { $exists: true } }, { assignmentId: { $exists: false }, status: 'submitted' }] })
      .select('id assessmentId assignmentId answers releasedAt submittedAt').sort({ submittedAt: 1 }).limit(50).lean();
    if (!attempts.length) return;
    const assessments = new Map((await Assessment.find({ id: { $in: [...new Set(attempts.map((a) => a.assessmentId))] } }).select('id curriculumId assessmentKind questions.id questions.type questions.text questions.correctAnswer questions.objectiveIds questions.options questions.distractors').lean()).map((a) => [a.id, a]));
    const objIds = [...new Set([...assessments.values()].flatMap((a) => (a.questions ?? []).flatMap((q: Q) => q.objectiveIds ?? [])))];
    const courseOf = new Map((await LearningObjective.find({ id: { $in: objIds } }).select('id courseId').lean()).map((o) => [o.id, o.courseId as string | undefined]));
    for (const at of attempts) {
      const asmt = assessments.get(at.assessmentId);
      if (!at.assignmentId && !PRACTICE_KINDS.has(String((asmt as { assessmentKind?: string } | undefined)?.assessmentKind ?? ''))) { await ErrorToWorkOnSync.updateOne({ studentId }, { $addToSet: { attemptIds: at.id }, $setOnInsert: { institutionId } }, { upsert: true }); continue; }
      const when = new Date(at.submittedAt ?? at.releasedAt ?? Date.now());
      const qs = new Map(((asmt?.questions ?? []) as Q[]).map((q) => [q.id, q]));
      for (const ans of (at.answers ?? []) as A[]) {
        const q = qs.get(ans.questionId);
        for (const objectiveId of q?.objectiveIds ?? []) {
          // workOnTrusted: a wrong grade from an unvalidated path neither creates an error nor reopens one.
          if (answerWrong(ans) && workOnTrustedOn() && !trustedWrong(q, ans, { graderV2: engineV2('graderV2') })) continue;
          const open = await ErrorToWorkOn.find({ studentId, objectiveId, status: { $ne: 'dismissed' } });
          if (answerWrong(ans)) {
            const { errorCode, errorLabel } = errorOf(q!, ans);
            const src = { kind: (at.assignmentId ? 'assignment_attempt' : 'practice_attempt') as 'assignment_attempt' | 'practice_attempt', attemptId: at.id, assessmentId: at.assessmentId, assignmentId: at.assignmentId, questionId: ans.questionId, at: when };
            const row = open.find((e) => e.errorCode === errorCode);
            for (const e of open.filter((x) => x !== row)) if (applyOutcome(e, { right: false, key: `attempt:${at.id}`, at: when, by: 'system' })) await e.save(); // wrong on the point
            if (row) {
              if (!row.sources.some((s) => s.attemptId === at.id && s.questionId === ans.questionId)) { row.sources.push(src); row.occurrences += 1; }
              applyOutcome(row, { right: false, key: `attempt:${at.id}`, at: new Date(when.getTime() + 1), by: 'system' });
              if (when > row.lastSeenAt) row.lastSeenAt = when;
              await row.save();
            } else {
              await ErrorToWorkOn.create({ id: `ewo_${randomUUID()}`, institutionId, studentId, objectiveId, courseId: courseOf.get(objectiveId), curriculumId: asmt?.curriculumId, errorCode, ...(errorLabel ? { errorLabel } : {}), sources: [src], occurrences: 1, firstSeenAt: when, lastSeenAt: when, status: 'open', rightStreak: 0, countedKeys: [], statusHistory: [{ at: when, by: 'system', to: 'open', reason: 'released_assessment' }], ...(spacedReviewOn() ? { lastWrongAt: when, reviewStep: 0, nextReviewAt: new Date(when.getTime() + SPACED_DAYS[0] * DAY) } : {}) });
            }
          } else {
            for (const e of open) if (applyOutcome(e, { right: true, key: `attempt:${at.id}`, at: when, by: 'system', quality: 'easy' })) await e.save();
          }
        }
      }
      await ErrorToWorkOnSync.updateOne({ studentId }, { $addToSet: { attemptIds: at.id }, $setOnInsert: { institutionId } }, { upsert: true });
    }
  } catch (error) {
    logger.warn('errors_to_work_on_sync_failed', { error: serializeError(error) });
  }
}

/** Moodle's own quizzes (MOODLE_QUIZ_IMPORT_PLAN v2): one finished, gated Moodle attempt as right/wrong answers per ENARA objective.
 *  Moodle gives right/wrong per question, not the error type, so a wrong answer is error code MOODLE_WRONG. Same resolve/reopen rules
 *  as ENARA attempts. Ids only (attempt key, quiz key, slot). Idempotent per (attempt, slot). Never throws; returns what it wrote. */
export const MOODLE_WRONG = 'moodle_wrong';
export async function recordMoodleAnswers(p: { studentId: string; institutionId: string; courseId?: string; curriculumId?: string; attemptKey: string; quizKey: string; at: Date; answers: { objectiveId: string; slot: number; right: boolean }[] }): Promise<{ wrong: number; right: number }> {
  const out = { wrong: 0, right: 0 };
  if (!workOnOn()) return out;
  try {
    for (const a of p.answers) {
      const open = await ErrorToWorkOn.find({ studentId: p.studentId, objectiveId: a.objectiveId, status: { $ne: 'dismissed' } });
      const key = `attempt:${p.attemptKey}`;
      if (!a.right) {
        out.wrong += 1;
        const src = { kind: 'moodle_quiz_attempt' as const, attemptId: p.attemptKey, assessmentId: p.quizKey, questionId: `slot:${a.slot}`, at: p.at };
        const row = open.find((e) => e.errorCode === MOODLE_WRONG);
        for (const e of open.filter((x) => x !== row)) if (applyOutcome(e, { right: false, key, at: p.at, by: 'system' })) await e.save();
        if (row) {
          if (!row.sources.some((s) => s.attemptId === p.attemptKey && s.questionId === src.questionId)) { row.sources.push(src); row.occurrences += 1; }
          applyOutcome(row, { right: false, key, at: new Date(p.at.getTime() + 1), by: 'system' });
          if (p.at > row.lastSeenAt) row.lastSeenAt = p.at;
          await row.save();
        } else {
          await ErrorToWorkOn.create({ id: `ewo_${randomUUID()}`, institutionId: p.institutionId, studentId: p.studentId, objectiveId: a.objectiveId, courseId: p.courseId, curriculumId: p.curriculumId, errorCode: MOODLE_WRONG, sources: [src], occurrences: 1, firstSeenAt: p.at, lastSeenAt: p.at, status: 'open', rightStreak: 0, countedKeys: [], statusHistory: [{ at: p.at, by: 'system', to: 'open', reason: 'moodle_quiz' }], ...(spacedReviewOn() ? { lastWrongAt: p.at, reviewStep: 0, nextReviewAt: new Date(p.at.getTime() + SPACED_DAYS[0] * DAY) } : {}) });
        }
      } else {
        out.right += 1;
        for (const e of open) if (applyOutcome(e, { right: true, key, at: p.at, by: 'system', quality: 'easy' })) await e.save();
      }
    }
  } catch (error) {
    logger.warn('errors_to_work_on_moodle_failed', { error: serializeError(error) });
  }
  return out;
}

/** Open errors the gate allows now (released AND over for this learner), optionally for one course. */
export async function eligibleErrors(studentId: string, opts: { institutionId?: string; courseId?: string; now?: Date; ignoreDue?: boolean } = {}) {
  const { AssessmentAttempt } = await import('../models/AssessmentAttempt');
  const { Assignment } = await import('../models/Assignment');
  const spaced = spacedReviewOn(); const nowE = opts.now ?? new Date();
  const rows = (await ErrorToWorkOn.find({ studentId, status: spaced ? { $in: ['open', 'resolved'] } : 'open', ...(opts.courseId ? { courseId: opts.courseId } : {}) }).lean())
    .filter((r) => (!spaced ? true : opts.ignoreDue ? r.status === 'open' : reviewDue(r, nowE)));
  const asgIds = [...new Set(rows.flatMap((r) => r.sources.map((s) => s.assignmentId)).filter(Boolean))] as string[];
  const [asgs, mine] = await Promise.all([
    Assignment.find({ id: { $in: asgIds } }).select('id state dueAt closesAt latePolicy maxAttempts').lean(),
    AssessmentAttempt.find({ studentId, assignmentId: { $in: asgIds } }).select('id assignmentId status gradingStatus releasedAt').lean(),
  ]);
  const asgOf = new Map(asgs.map((a) => [a.id, a]));
  const now = opts.now ?? new Date();
  const ok = (attemptId: string, assignmentId?: string) => {
    const tries = mine.filter((m) => m.assignmentId === assignmentId && m.status !== 'abandoned');
    const att = mine.find((m) => m.id === attemptId);
    return Boolean(att && assignmentId && gateOpen({ attempt: att, assignment: asgOf.get(assignmentId), attemptsUsed: tries.filter((t) => t.status === 'submitted').length, attemptInProgress: tries.some((t) => t.status === 'in-progress'), now }));
  };
  // Moodle quiz errors are imported only after their own gate (closed or no attempts left, review allowed, finished): usable at once.
  return rows.filter((r) => r.sources.some((s) => s.kind === 'practice_attempt' || s.kind === 'moodle_quiz_attempt' || ok(s.attemptId, s.assignmentId)));
}

/** The tutor's list for a session: synced, gated, prioritised, with objective titles and (server-side only) the source question texts for the guard. */
export async function errorsForTutor(p: { studentId: string; institutionId?: string; courseId?: string; child: boolean }) {
  if (!workOnOn()) return null;
  try {
    await syncErrors(p.studentId, p.institutionId);
    const rows = await eligibleErrors(p.studentId, { institutionId: p.institutionId, courseId: p.courseId });
    if (!rows.length) return null;
    const { LearningObjective } = await import('../models/LearningObjective');
    const objs = await LearningObjective.find({ id: { $in: rows.map((r) => r.objectiveId) } }).select('id code title prerequisiteObjectiveIds').lean();
    const objOf = new Map(objs.map((o) => [o.id, o]));
    const top = prioritize(rows, new Map(objs.map((o) => [o.id, o.prerequisiteObjectiveIds ?? []])), p.child ? WORK_ON_MAX.child : WORK_ON_MAX.other);
    const { Assessment } = await import('../models/Assessment');
    const qIds = top.flatMap((r) => r.sources.map((s) => s.questionId));
    const qTexts = (await Assessment.find({ id: { $in: [...new Set(top.flatMap((r) => r.sources.map((s) => s.assessmentId)))] } }).select('questions.id questions.text').lean())
      .flatMap((a) => (a.questions ?? []).filter((q: { id: string }) => qIds.includes(q.id)).map((q: { text?: string }) => q.text ?? '')).filter(Boolean);
    const items = top.map((r) => ({ id: r.id, objectiveId: r.objectiveId, code: objOf.get(r.objectiveId)?.code as string | undefined, title: objOf.get(r.objectiveId)?.title as string | undefined, errorCode: r.errorCode, errorLabel: r.errorLabel, occurrences: r.occurrences, status: r.status }));
    return { items, lines: briefLines(items), guardTexts: qTexts };
  } catch (error) {
    logger.warn('errors_to_work_on_tutor_failed', { error: serializeError(error) });
    return null;
  }
}

/** A tutor turn on an objective with open errors: an independent right, or a wrong answer, in this session (counted once per session). */
export async function recordTutorOutcome(p: { studentId: string; objectiveId?: string; sessionId: string; right: boolean; at?: Date; quality?: OutcomeQuality }): Promise<void> {
  if (!workOnOn() || !p.objectiveId) return;
  try {
    const rows = await ErrorToWorkOn.find({ studentId: p.studentId, objectiveId: p.objectiveId, status: { $ne: 'dismissed' } });
    for (const e of rows) if (applyOutcome(e, { right: p.right, key: `session:${p.sessionId}`, at: p.at ?? new Date(), by: 'tutor', ...(p.quality ? { quality: p.quality } : {}) })) await e.save();
  } catch (error) {
    logger.warn('errors_to_work_on_outcome_failed', { error: serializeError(error) });
  }
}

/** A tutor answer to a practice item set for one listed error (the reply named it with focus=EN): counted on that error, once per session. */
export async function recordOutcomeForError(p: { errorId: string; studentId: string; sessionId: string; right: boolean; at?: Date; quality?: OutcomeQuality }): Promise<void> {
  if (!workOnOn()) return;
  try {
    const e = await ErrorToWorkOn.findOne({ id: p.errorId, studentId: p.studentId });
    if (e && applyOutcome(e, { right: p.right, key: `session:${p.sessionId}`, at: p.at ?? new Date(), by: 'tutor', ...(p.quality ? { quality: p.quality } : {}) })) await e.save();
  } catch (error) {
    logger.warn('errors_to_work_on_outcome_failed', { error: serializeError(error) });
  }
}

/** Teacher / parent / learner view: every row with the gate state, newest first. */
export async function listForStudent(studentId: string, institutionId?: string) {
  await syncErrors(studentId, institutionId);
  const rows = await ErrorToWorkOn.find({ studentId }).sort({ lastSeenAt: -1 }).limit(200).lean();
  const eligible = new Set((await eligibleErrors(studentId, { institutionId, ignoreDue: true })).map((r) => r.id));
  const { LearningObjective } = await import('../models/LearningObjective');
  const objOf = new Map((await LearningObjective.find({ id: { $in: rows.map((r) => r.objectiveId) } }).select('id code title').lean()).map((o) => [o.id, o]));
  return rows.map((r) => ({
    id: r.id,
    objective: { id: r.objectiveId, code: objOf.get(r.objectiveId)?.code ?? null, title: objOf.get(r.objectiveId)?.title ?? null },
    error: r.errorLabel ?? r.errorCode.replace(/_/g, ' '),
    errorCode: r.errorCode,
    occurrences: r.occurrences,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    status: r.status,
    rightStreak: r.rightStreak,
    waitingForRelease: r.status === 'open' && !eligible.has(r.id),
    ...(spacedReviewOn() ? { nextReviewAt: r.nextReviewAt ?? null, finalCheckAt: r.finalCheckAt ?? null } : {}),
    sources: r.sources.map((s) => ({ assessmentId: s.assessmentId, assignmentId: s.assignmentId ?? null, at: s.at })),
  }));
}

export async function dismissError(id: string, by: string, institutionId?: string, note?: string) {
  const row = await ErrorToWorkOn.findOne({ id, ...(institutionId ? { institutionId } : {}) });
  if (!row) return null;
  if (row.status !== 'dismissed') { row.statusHistory.push({ at: new Date(), by, from: row.status, to: 'dismissed', reason: (note ?? 'teacher').slice(0, 120) }); row.status = 'dismissed'; await row.save(); }
  return row;
}
