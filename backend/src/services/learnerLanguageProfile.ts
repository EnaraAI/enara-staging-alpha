import { LearnerLanguageProfile, type ILanguageErrorEntry, type IBeliefEntry, type IWorkedEntry } from '../models/LearnerLanguageProfile';
import { ERROR_CODES, sameBelief, type LessonItem } from './languageLearningState';
import { engineV2 } from './engineV2';
import { logger, serializeError } from '../utils/logging';

// r4.4 #2: cross-session learner model. Pure helpers plus two scoped, failure-tolerant DB calls.
const DAY = 86_400_000;
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14];
const PARTICIPLES = ['seen', 'been', 'done', 'gone', 'eaten', 'written', 'taken'];

// Which error codes an item can resolve (its grammar family). Items outside a known family resolve none.
export function codesForItem(item: LessonItem | undefined): string[] {
  const f = (item?.targetForms ?? []).map((x) => x.toLowerCase());
  if (!f.length) return [];
  if (f.every((x) => x === 'he' || x === 'she')) return ['pronoun_gender_swap', 'pronoun_omitted'];
  if (f.some((x) => /(s|es)$/.test(x)) && /correct the verb/i.test(item?.prompt ?? '')) return ['missing_third_person_s', 'wrong_third_person_ending', 'past_form_for_routine'];
  if (f.some((x) => PARTICIPLES.includes(x)) || (/\b(have|has|ever|never)\b/i.test(item?.prompt ?? '') && f.some((x) => /ed$/.test(x)))) return ['perfect_with_finished_time', 'past_for_life_experience', 'wrong_participle'];
  return [];
}

export interface TurnOutcome { errorCode?: string; independentSuccessOn?: LessonItem; now?: Date; belief?: string; lessonId?: string; lessonTitle?: string; style?: string }
export interface ProfileV2 { beliefs: IBeliefEntry[]; worked: IWorkedEntry[] }

/** v2 (memory): pure update of beliefs and what-worked counters. Beliefs are resolved only by an independent success in the same lesson, and are then reviewed at spaced intervals. */
export function applyTurnV2(p: ProfileV2, o: TurnOutcome): ProfileV2 {
  const now = o.now ?? new Date();
  const beliefs = p.beliefs.map((b) => ({ ...b }));
  const worked = p.worked.map((w) => ({ ...w }));
  if (o.belief) {
    const hit = beliefs.find((b) => sameBelief(b.tag, o.belief!));
    if (hit) { hit.occurrences += 1; hit.lastSeenAt = now; hit.resolvedAt = undefined; hit.nextReviewAt = new Date(now.getTime() + REVIEW_INTERVAL_DAYS[0] * DAY); }
    else beliefs.push({ tag: o.belief, occurrences: 1, firstSeenAt: now, lastSeenAt: now, lessonId: o.lessonId, lessonTitle: o.lessonTitle?.slice(0, 120), resolvedCount: 0, nextReviewAt: new Date(now.getTime() + REVIEW_INTERVAL_DAYS[0] * DAY) });
  }
  if (o.independentSuccessOn) {
    for (const b of beliefs) {
      if (!o.lessonId || b.lessonId !== o.lessonId) continue;
      if (!b.resolvedAt) { b.resolvedAt = now; b.resolvedCount = 1; b.nextReviewAt = new Date(now.getTime() + REVIEW_INTERVAL_DAYS[1] * DAY); }
      else if (b.nextReviewAt && b.nextReviewAt.getTime() <= now.getTime()) { b.resolvedCount = (b.resolvedCount ?? 1) + 1; b.nextReviewAt = new Date(now.getTime() + REVIEW_INTERVAL_DAYS[Math.min(b.resolvedCount, REVIEW_INTERVAL_DAYS.length - 1)] * DAY); }
    }
    if (o.style) { const w = worked.find((x) => x.style === o.style); if (w) w.count += 1; else worked.push({ style: o.style, count: 1 }); }
  }
  // keep the record small: at most 20 beliefs (drop the oldest resolved first)
  while (beliefs.length > 20) { const i = beliefs.findIndex((b) => b.resolvedAt) ; beliefs.splice(i >= 0 ? i : 0, 1); }
  return { beliefs, worked };
}

const STYLE_LABEL: Record<string, string> = { rule_explained: 'a clear rule with a worked example', contrast_example: 'a contrast example', hint_ladder: 'step-by-step hint questions', direct_feedback: 'direct feedback' };
export const OPENING_REVIEW = 'This is the start of a session and they have earlier items due (above). Before new content, begin with one short unaided check on the first such item, then continue with today\'s lesson.';

/** Prompt lines for the v2 memory (empty when nothing is worth saying). */
export function summarizeProfileV2(p: ProfileV2, opts: { now?: Date; opening?: boolean } = {}): string[] {
  const now = opts.now ?? new Date();
  const open = p.beliefs.filter((b) => !b.resolvedAt).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime()).slice(0, 2);
  const due = p.beliefs.filter((b) => b.resolvedAt && b.nextReviewAt && b.nextReviewAt.getTime() <= now.getTime()).slice(0, 2);
  const best = [...p.worked].sort((a, b) => b.count - a.count)[0];
  const out: string[] = [];
  for (const b of open) out.push(`- Earlier mistaken idea, not yet shown resolved: "${b.tag}"${b.lessonTitle ? ` (lesson "${b.lessonTitle}")` : ''}, seen ${b.occurrences} time(s). If it fits, check it with one unaided task and never agree it is acceptable.`);
  for (const b of due) out.push(`- Due for a spaced review: the idea "${b.tag}" was resolved before. Include one quick unaided check on it.`);
  if (best && best.count >= 2 && STYLE_LABEL[best.style]) out.push(`- What has worked for this learner before: ${STYLE_LABEL[best.style]}. Prefer it when you explain.`);
  if (opts.opening && (open.length || due.length)) out.push(OPENING_REVIEW);
  return out;
}

/** Due items for the learner (no learner text): used by the reviews endpoint. */
export function dueItems(entries: ILanguageErrorEntry[], p: ProfileV2, now = new Date()): { kind: 'belief' | 'error'; label: string; dueSince?: Date }[] {
  const err = entries.filter((e) => e.nextReviewAt && e.nextReviewAt.getTime() <= now.getTime()).map((e) => ({ kind: 'error' as const, label: LABEL[e.code] ?? e.code, dueSince: e.nextReviewAt }));
  const bel = p.beliefs.filter((b) => (b.resolvedAt ? b.nextReviewAt && b.nextReviewAt.getTime() <= now.getTime() : true)).map((b) => ({ kind: 'belief' as const, label: b.tag, dueSince: b.nextReviewAt }));
  return [...bel, ...err];
}

export function applyTurn(entries: ILanguageErrorEntry[], o: TurnOutcome): ILanguageErrorEntry[] {
  const now = o.now ?? new Date();
  const out = entries.map((e) => ({ ...e }));
  if (o.errorCode && o.errorCode !== 'unknown' && o.errorCode !== 'unchanged_from_prompt' && (ERROR_CODES as readonly string[]).includes(o.errorCode)) {
    let e = out.find((x) => x.code === o.errorCode);
    if (!e) { e = { code: o.errorCode, occurrences: 0, lastSeenAt: now, independentStreak: 0 }; out.push(e); }
    e.occurrences += 1; e.lastSeenAt = now; e.independentStreak = 0; e.nextReviewAt = new Date(now.getTime() + REVIEW_INTERVAL_DAYS[0] * DAY);
  }
  if (o.independentSuccessOn) {
    for (const code of codesForItem(o.independentSuccessOn)) {
      const e = out.find((x) => x.code === code);
      if (!e) continue; // only codes this learner has actually shown are tracked
      e.independentStreak += 1; e.lastIndependentSuccessAt = now;
      e.nextReviewAt = new Date(now.getTime() + REVIEW_INTERVAL_DAYS[Math.min(e.independentStreak, REVIEW_INTERVAL_DAYS.length - 1)] * DAY);
    }
  }
  return out;
}

const LABEL: Record<string, string> = {
  missing_third_person_s: 'leaving out -s/-es after he/she/it', wrong_third_person_ending: 'choosing the wrong -s/-es ending', past_form_for_routine: 'using a past form for routines',
  pronoun_gender_swap: 'mixing up he and she', pronoun_omitted: 'leaving out the pronoun', perfect_with_finished_time: 'using the present perfect with a finished time',
  past_for_life_experience: 'using the past simple for life experiences', wrong_participle: 'the verb form after have/has',
};

export function summarizeProfile(entries: ILanguageErrorEntry[], now = new Date()): string[] {
  const recurring = entries.filter((e) => e.occurrences >= 2 && e.independentStreak < 2).sort((a, b) => b.occurrences - a.occurrences).slice(0, 2);
  const due = entries.filter((e) => e.nextReviewAt && e.nextReviewAt.getTime() <= now.getTime() && !recurring.includes(e)).slice(0, 2);
  if (!recurring.length && !due.length) return [];
  const days = (d: Date) => Math.max(0, Math.round((now.getTime() - d.getTime()) / DAY));
  return [
    'Learner history across sessions (school records of earlier tutor turns; error types only): use it to choose examples and checks, and never tell them about this record.',
    ...recurring.map((e) => `- Recurring difficulty: ${LABEL[e.code] ?? e.code} (seen ${e.occurrences} times, last ${days(e.lastSeenAt)} day(s) ago). If it appears again, address it directly with a smaller step.`),
    ...due.map((e) => `- Due for a short review: ${LABEL[e.code] ?? e.code}. If it fits the lesson, include one quick unaided check on it.`),
  ];
}

export async function loadProfileLines(institutionId: string | undefined, studentId: string | undefined, opts: { opening?: boolean } = {}): Promise<string[]> {
  if (!institutionId || !studentId) return [];
  try {
    const p = await LearnerLanguageProfile.findOne({ institutionId, studentId }).lean();
    if (!p) return [];
    const lines = summarizeProfile(p.entries as ILanguageErrorEntry[]);
    const v2 = engineV2('memory') ? summarizeProfileV2({ beliefs: (p.beliefs ?? []) as IBeliefEntry[], worked: (p.worked ?? []) as IWorkedEntry[] }, { opening: opts.opening }) : [];
    return [...lines, ...v2];
  } catch (error) {
    logger.warn('learner_profile_load_failed', { error: serializeError(error) });
    return [];
  }
}

export async function loadDueReviews(institutionId: string, studentId: string) {
  const p = await LearnerLanguageProfile.findOne({ institutionId, studentId }).lean();
  if (!p) return [];
  return dueItems(p.entries as ILanguageErrorEntry[], { beliefs: (p.beliefs ?? []) as IBeliefEntry[], worked: [] });
}

/** Writes are optimistic: chat and voice turns can overlap, so a stale write is retried on fresh data instead of overwriting the other turn. */
export async function recordProfileTurn(institutionId: string | undefined, studentId: string | undefined, o: TurnOutcome): Promise<void> {
  const v2 = engineV2('memory') && Boolean(o.belief || o.independentSuccessOn);
  if (!institutionId || !studentId || (!o.errorCode && !o.independentSuccessOn && !v2)) return;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const p = await LearnerLanguageProfile.findOne({ institutionId, studentId }).lean();
      const entries = applyTurn((p?.entries ?? []) as ILanguageErrorEntry[], o);
      const next = engineV2('memory') ? applyTurnV2({ beliefs: (p?.beliefs ?? []) as IBeliefEntry[], worked: (p?.worked ?? []) as IWorkedEntry[] }, o) : null;
      const set = { entries, ...(next ? { beliefs: next.beliefs, worked: next.worked } : {}) };
      if (!p) {
        try { await LearnerLanguageProfile.create({ institutionId, studentId, ...set, version: 1 }); return; } catch { continue; } // lost the race to create: retry on the new document
      }
      const r = await LearnerLanguageProfile.updateOne({ institutionId, studentId, ...(p.version === undefined ? { version: { $exists: false } } : { version: p.version }) }, { $set: set, $inc: { version: 1 } });
      if (r.modifiedCount > 0) return;
    }
    logger.warn('learner_profile_record_conflict', { institutionId });
  } catch (error) {
    logger.warn('learner_profile_record_failed', { error: serializeError(error) });
  }
}
