import { LearnerLanguageProfile, type ILanguageErrorEntry } from '../models/LearnerLanguageProfile';
import { ERROR_CODES, type LessonItem } from './languageLearningState';
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

export interface TurnOutcome { errorCode?: string; independentSuccessOn?: LessonItem; now?: Date }

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

export async function loadProfileLines(institutionId: string | undefined, studentId: string | undefined): Promise<string[]> {
  if (!institutionId || !studentId) return [];
  try {
    const p = await LearnerLanguageProfile.findOne({ institutionId, studentId }).lean();
    return p ? summarizeProfile(p.entries as ILanguageErrorEntry[]) : [];
  } catch (error) {
    logger.warn('learner_profile_load_failed', { error: serializeError(error) });
    return [];
  }
}

export async function recordProfileTurn(institutionId: string | undefined, studentId: string | undefined, o: TurnOutcome): Promise<void> {
  if (!institutionId || !studentId || (!o.errorCode && !o.independentSuccessOn)) return;
  try {
    const p = await LearnerLanguageProfile.findOne({ institutionId, studentId }).lean();
    const entries = applyTurn((p?.entries ?? []) as ILanguageErrorEntry[], o);
    await LearnerLanguageProfile.updateOne({ institutionId, studentId }, { $set: { entries } }, { upsert: true });
  } catch (error) {
    logger.warn('learner_profile_record_failed', { error: serializeError(error) });
  }
}
