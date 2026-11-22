// fill_blank: each {{blank_n}} scored on its own (partial credit = right blanks / blanks). Answers are folded for comparison
// (text/ar.ts: spaces, case, digits, Arabic forms; ة only with flags.ta_marbuta_fold). With flags.lenient_spelling, one letter off
// counts as right (reason spelling_close) for words of 4+ letters.
import type { ClosedItem, GradeResult } from '../../../schema';
import { editDistance, normalizeAnswer } from '../../../text/ar';
import { codeResult } from './result';

type FillBlank = Extract<ClosedItem, { type: 'fill_blank' }>;

export function answerFor(answer: unknown, key: string, index: number): unknown {
  if (Array.isArray(answer)) return answer[index];
  if (answer && typeof answer === 'object') return (answer as Record<string, unknown>)[key];
  return index === 0 ? answer : undefined;
}

export function gradeFillBlank(item: FillBlank, answer: unknown, max: number): GradeResult {
  const fold = { taMarbuta: !!item.flags?.ta_marbuta_fold, lang: item.language };
  const keys = Object.keys(item.answer_key.blanks).sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  const parts = keys.map((k, i) => {
    const given = normalizeAnswer(answerFor(answer, k, i), fold);
    if (!given) return { code: k, fraction: 0, reason: 'empty' as const };
    const accepted = item.answer_key.blanks[k].map((a) => normalizeAnswer(a, fold));
    if (accepted.includes(given)) return { code: k, fraction: 1, reason: 'correct' as const };
    if (item.flags?.lenient_spelling && given.length >= 4 && accepted.some((a) => a.length >= 4 && editDistance(given, a, 1) <= 1)) return { code: k, fraction: 1, reason: 'spelling_close' as const };
    return { code: k, fraction: 0, reason: 'wrong' as const };
  });
  return codeResult(max, parts, parts.some((p) => p.reason === 'wrong') ? item.error_codes : []);
}
