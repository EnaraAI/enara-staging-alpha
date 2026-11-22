// ordering: full marks for the exact order; otherwise Kendall partial credit = pairs in the right relative order / all pairs.
// Options missing from the answer are placed at the end in key order (no credit is invented for them: they only keep the pair
// count fixed). Unknown or repeated ids are ignored.
import type { ClosedItem, GradeResult } from '../../../schema';
import { isBlank, single } from './result';

type Ordering = Extract<ClosedItem, { type: 'ordering' }>;

export function kendallShare(key: string[], given: string[]): number {
  const pos = new Map(given.map((g, i) => [g, i]));
  let agree = 0; let all = 0;
  for (let i = 0; i < key.length; i++) for (let j = i + 1; j < key.length; j++) {
    all++;
    const a = pos.get(key[i]); const b = pos.get(key[j]);
    if (a !== undefined && b !== undefined && a < b) agree++;
  }
  return all ? agree / all : 0;
}

export function gradeOrdering(item: Ordering, answer: unknown, max: number): GradeResult {
  if (isBlank(answer) || !Array.isArray(answer)) return single(max, 'order', 0, 'empty');
  const known = new Set(item.answer_key.order);
  const seen = new Set<string>();
  const given = answer.map(String).filter((g) => known.has(g) && !seen.has(g) && seen.add(g));
  const key = item.answer_key.order;
  if (given.length === key.length && given.every((g, i) => g === key[i])) return single(max, 'order', 1, 'correct');
  const share = kendallShare(key, given);
  return single(max, 'order', share, share > 0 ? 'order_partly_correct' : 'wrong', item.error_codes);
}
