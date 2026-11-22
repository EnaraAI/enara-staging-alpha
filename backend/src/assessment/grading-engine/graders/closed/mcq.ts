// mcq: single or multi answer, graded by set equality (all or nothing). A chosen wrong option that names a misconception
// (option.error_code) adds that error code.
import type { ClosedItem, GradeResult } from '../../../schema';
import { isBlank, single } from './result';

type Mcq = Extract<ClosedItem, { type: 'mcq' }>;

export function gradeMcq(item: Mcq, answer: unknown, max: number): GradeResult {
  if (isBlank(answer)) return single(max, 'answer', 0, 'empty');
  const chosen = new Set((Array.isArray(answer) ? answer : [answer]).map((a) => String(a)));
  const right = new Set(item.answer_key.correct);
  const ok = chosen.size === right.size && [...chosen].every((c) => right.has(c));
  const errors = item.options.filter((o) => chosen.has(o.id) && !right.has(o.id) && o.error_code).map((o) => o.error_code!);
  return single(max, 'answer', ok ? 1 : 0, ok ? 'correct' : 'wrong', ok ? [] : errors);
}
