import { createHash } from 'crypto';
import type { IQuestion } from '../../models/Assessment';
import { isArabic } from '../gradingProposals';
import { V6 } from './v6';

// ENARA-HYBRID-experimental@v1 (frozen; scripts/benchmarks/diagnostics/rubric_engine/v3/hybrid_v1.py).
//   score = round(((eval_v2 + v6) / 2) / 0.125) * 0.125
//   v6 missing     -> eval-v2 score, labelled HYBRID_FALLBACK_EVALV2
//   eval-v2 missing -> non-score HYBRID_NO_EVALV2 (structured exception; no new policy)
export const HYBRID_VERSION = V6.hybrid_version;
const GRID = V6.hybrid_grid;

// Python round(): half to even.
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export type HybridLabel = 'HYBRID' | 'HYBRID_FALLBACK_EVALV2' | 'HYBRID_NO_EVALV2';
export function combine(evalv2: number | null, v6: number | null): { score: number | null; status: 'SCORED' | 'NON_SCORED'; label: HybridLabel } {
  if (evalv2 === null || evalv2 === undefined) return { score: null, status: 'NON_SCORED', label: 'HYBRID_NO_EVALV2' };
  if (v6 === null || v6 === undefined) return { score: evalv2, status: 'SCORED', label: 'HYBRID_FALLBACK_EVALV2' };
  return { score: pyRound((evalv2 + v6) / 2 / GRID) * GRID, status: 'SCORED', label: 'HYBRID' };
}

// anchored_holistic.pick_anchors: K human-scored answers spread across the score
// range (quantiles), ordered by (score, sha256(seed:id)). Fewer than K -> all of them.
export interface AnchorCandidate { id: string; answer: string; score: number }
export function pickAnchors(pool: AnchorCandidate[], seed: string, k = V6.k_anchors): AnchorCandidate[] {
  const sorted = pool
    .filter((c) => c.answer.trim() && c.score !== null && c.score !== undefined)
    .map((c) => ({ c, h: createHash('sha256').update(`${seed}:${c.id}`, 'utf8').digest('hex') }))
    .sort((a, b) => a.c.score - b.c.score || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))
    .map((x) => x.c);
  if (sorted.length < k) return sorted;
  return Array.from({ length: k }, (_, i) => sorted[pyRound((i * (sorted.length - 1)) / (k - 1))]);
}
// Production anchor seed (frozen with V1; the confirmatory run used its experiment id).
export const ANCHOR_SEED = 'enara-hybrid-v1-anchors';

// Validated envelope: the confirmatory evidence covers Arabic short answers on a
// 0-5 scale graded by eval-v2 against one holistic criterion with whole-point
// levels 0..5, with a reference answer and 4 human-scored anchors per question.
// Anything outside it is NOT_ELIGIBLE (eval-v2 only; Hybrid not applied).
export type Eligibility = { eligible: true } | { eligible: false; reason: string };
export function eligibility(q: IQuestion | undefined, answer: string): Eligibility {
  if (!q) return { eligible: false, reason: 'QUESTION_MISSING' };
  if (q.type !== 'open-response') return { eligible: false, reason: 'NOT_OPEN_RESPONSE' };
  const criteria = q.rubric?.criteria ?? [];
  if (criteria.length !== 1) return { eligible: false, reason: 'NOT_SINGLE_CRITERION' };
  const pts = criteria[0].levels.map((l) => l.points).sort((a, b) => a - b);
  if (criteria[0].maxPoints !== 5 || pts.join(',') !== '0,1,2,3,4,5') return { eligible: false, reason: 'NOT_0_5_WHOLE_POINT_SCALE' };
  if (!String(q.modelAnswer ?? '').trim()) return { eligible: false, reason: 'NO_REFERENCE_ANSWER' };
  if (!String(answer ?? '').trim()) return { eligible: false, reason: 'EMPTY_ANSWER' };
  if (!isArabic(answer)) return { eligible: false, reason: 'NOT_ARABIC' };
  return { eligible: true };
}
