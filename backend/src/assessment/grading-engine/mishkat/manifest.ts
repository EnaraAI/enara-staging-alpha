// What Mishkat may score (docs/tutor/MISHKAT_SPLIT_PLAN.md "What it does"). The allow-list below is the ceiling; the service's own
// manifest (the `criteria` list in each reply, per language and question type) narrows it: a criterion that later fails its monthly
// check is dropped from the service's list and goes back to v3b with no code change.
// Never Mishkat: task_completion and organisation (they need the meaning of the question), feedback text, strengths/improvements,
// evidence, error codes and integrity flags (Mishkat gives numbers only), spoken answers (not trained on transcripts), any domain but
// language, and any criterion code rules already decided (rules-first).
import type { OpenItem } from '../graders/domains';
import type { MishkatLang, MishkatType } from './client';

export const MISHKAT_ALLOWED: Record<MishkatType, readonly string[]> = {
  essay: ['grammar_accuracy', 'mechanics', 'vocabulary_range'],
  short_answer: ['grammar_accuracy', 'mechanics'],
};

/** The Mishkat request's language and type for an item, or null when Mishkat must not be asked at all. */
export function mishkatTarget(item: Pick<OpenItem, 'domain' | 'type' | 'language' | 'spoken'>): { lang: MishkatLang; type: MishkatType } | null {
  if (item.domain !== 'language' || item.spoken === true) return null;
  if (item.type !== 'essay' && item.type !== 'short_answer') return null;
  const l = String(item.language ?? '').toLowerCase();
  const lang: MishkatLang | null = l.startsWith('ar') ? 'ar' : l.startsWith('en') ? 'en' : null;
  return lang ? { lang, type: item.type } : null;
}

/** The criteria Mishkat may score here: allow-list ∩ the service's list ∩ the item's rubric. */
export const mishkatCriteria = (type: MishkatType, served: readonly string[], rubric: readonly string[]): string[] =>
  MISHKAT_ALLOWED[type].filter((c) => served.includes(c) && rubric.includes(c));
