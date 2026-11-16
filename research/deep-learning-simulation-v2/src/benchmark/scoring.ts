import type { AssessmentItem, RubricCheck, ScoringKey, ScoringRubric } from './schema';

export const norm = (t: string): string =>
  ` ${t.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;

export interface ScoreResult { correct: boolean; score: number; detail: string }

export function isHedged(answer: string): boolean {
  return /\bor\b/i.test(answer) || (answer.match(/\?/g) ?? []).length >= 2;
}

export function scoreKey(answer: string, s: ScoringKey): ScoreResult {
  if (isHedged(answer)) return { correct: false, score: 0, detail: 'hedged' };
  for (const f of s.forbidden ?? []) {
    if (new RegExp(f, 'i').test(answer)) return { correct: false, score: 0, detail: `forbidden:${f}` };
  }
  const a = norm(answer);
  const exact = (s.mode ?? 'contains') === 'exact';
  for (const k of s.accepted) {
    const n = norm(k).trim();
    if (!n) continue;
    if (exact ? a.trim() === n : a.includes(` ${n} `)) return { correct: true, score: 1, detail: `matched:${k}` };
  }
  return { correct: false, score: 0, detail: 'no_match' };
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
function runCheck(answer: string, c: RubricCheck): boolean {
  switch (c.check.kind) {
    case 'regex': return new RegExp(c.check.pattern, c.check.flags ?? 'i').test(answer);
    case 'notRegex': return !new RegExp(c.check.pattern, c.check.flags ?? 'i').test(answer);
    case 'minWords': return words(answer) >= c.check.n;
    case 'maxWords': return words(answer) <= c.check.n;
  }
}

export function scoreRubric(answer: string, s: ScoringRubric): ScoreResult {
  const results = s.checks.map((c) => ({ id: c.id, required: c.required, ok: runCheck(answer, c) }));
  const requiredFailed = results.filter((r) => r.required && !r.ok).map((r) => r.id);
  const frac = results.filter((r) => r.ok).length / Math.max(1, results.length);
  const pass = requiredFailed.length === 0 && frac >= (s.passFraction ?? 0);
  return { correct: pass, score: frac, detail: requiredFailed.length ? `failed_required:${requiredFailed.join(',')}` : `passed:${results.filter((r) => r.ok).length}/${results.length}` };
}

export function scoreItem(answer: string, item: Pick<AssessmentItem, 'scoring'>): ScoreResult {
  return item.scoring.type === 'key' ? scoreKey(answer, item.scoring) : scoreRubric(answer, item.scoring);
}
