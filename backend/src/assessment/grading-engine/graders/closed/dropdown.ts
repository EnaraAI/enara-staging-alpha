// dropdown: each {{drop_n}} scored on its own (partial credit = right choices / drops). A choice must be exactly one of that drop's
// options (folded for spaces and case only: the options are fixed text, so no spelling tolerance).
import type { ClosedItem, GradeResult } from '../../../schema';
import { normalizeAnswer } from '../../../text/ar';
import { codeResult } from './result';
import { answerFor } from './fillBlank';

type Dropdown = Extract<ClosedItem, { type: 'dropdown' }>;

export function gradeDropdown(item: Dropdown, answer: unknown, max: number): GradeResult {
  const keys = Object.keys(item.answer_key.choices).sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  const parts = keys.map((k, i) => {
    const raw = answerFor(answer, k, i);
    const given = normalizeAnswer(raw);
    if (!given) return { code: k, fraction: 0, reason: 'empty' as const };
    const right = normalizeAnswer(item.answer_key.choices[k]);
    return given === right ? { code: k, fraction: 1, reason: 'correct' as const } : { code: k, fraction: 0, reason: 'wrong' as const };
  });
  return codeResult(max, parts, parts.some((p) => p.reason === 'wrong') ? item.error_codes : []);
}
