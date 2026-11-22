// matching: partial credit = right pairs / pairs in the key. The answer is a list of [left, right] pairs or a {left: right} map;
// a left option given twice counts once (its first pairing).
import type { ClosedItem, GradeResult } from '../../../schema';
import { codeResult } from './result';

type Matching = Extract<ClosedItem, { type: 'matching' }>;

export function pairsOf(answer: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const add = (l: unknown, r: unknown) => { if (typeof l === 'string' && typeof r === 'string' && !out.has(l)) out.set(l, r); };
  if (Array.isArray(answer)) for (const p of answer) { if (Array.isArray(p)) add(p[0], p[1]); }
  else if (answer && typeof answer === 'object') for (const [l, r] of Object.entries(answer as Record<string, unknown>)) add(l, r);
  return out;
}

export function gradeMatching(item: Matching, answer: unknown, max: number): GradeResult {
  const given = pairsOf(answer);
  const parts = item.answer_key.pairs.map(([l, r]) => {
    const g = given.get(l);
    return { code: l, fraction: g === r ? 1 : 0, reason: (g === undefined ? 'empty' : g === r ? 'correct' : 'wrong') as 'empty' | 'correct' | 'wrong' };
  });
  return codeResult(max, parts, parts.some((p) => p.reason === 'wrong') ? item.error_codes : []);
}
