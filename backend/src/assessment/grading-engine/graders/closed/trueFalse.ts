// true_false: the learner's answer as a boolean, from true/false, yes/no, صح/خطأ (and their usual variants).
import type { ClosedItem, GradeResult } from '../../../schema';
import { normalizeAnswer } from '../../../text/ar';
import { isBlank, single } from './result';

type TrueFalse = Extract<ClosedItem, { type: 'true_false' }>;
const TRUE = new Set(['true', 't', 'yes', 'y', '1', 'صح', 'صحيح', 'نعم']);
const FALSE = new Set(['false', 'f', 'no', 'n', '0', 'خطا', 'خاطي', 'لا']);

export function toBoolean(answer: unknown): boolean | null {
  if (typeof answer === 'boolean') return answer;
  const s = normalizeAnswer(answer, { hamzaSeats: true, taMarbuta: true });
  if (TRUE.has(s)) return true;
  if (FALSE.has(s)) return false;
  return null;
}

export function gradeTrueFalse(item: TrueFalse, answer: unknown, max: number): GradeResult {
  if (isBlank(answer)) return single(max, 'answer', 0, 'empty');
  const b = toBoolean(answer);
  if (b === null) return single(max, 'answer', 0, 'wrong');
  return b === item.answer_key.value ? single(max, 'answer', 1, 'correct') : single(max, 'answer', 0, 'wrong', item.error_codes);
}
