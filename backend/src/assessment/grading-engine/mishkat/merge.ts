// The Mishkat + v3b merge (docs/tutor/MISHKAT_SPLIT_PLAN.md "Flow when the switch is on"). Pure: v3b's combined grade and Mishkat's
// reply in, the final grade and a log record out.
//   - For each criterion Mishkat may score (manifest.ts) and is not decided by code rules: rounded = clamp(round(raw), 0, max).
//     Raw within 0.15 of a level boundary (x.5): v3b's score stays ('mishkat_boundary', logged). Otherwise Mishkat's score replaces
//     v3b's: scoredBy 'mishkat', rule 'mishkat@<version>', and v3b's own score is kept for the teacher (modelPoints).
//   - Mishkat and v3b 2 or more levels apart on a criterion: flag 'graders_disagree' (the teacher's queue, as other flags).
//   - Mishkat unavailable, or nothing to do: v3b's grade is returned unchanged (the same object).
// Totals are recomputed. Confidence, error codes, feedback, strengths/improvements and the other flags stay v3b's.
// The Mishkat engine (docs/tutor/MISHKAT_ENGINE_PLAN.md, Step A): v3b and the trained scorer together are one engine, "Mishkat". When
// the scorer scored at least one criterion of the answer (used, or kept v3b's at a boundary), the grade records one engine id,
// `<scorer version>+v3b` (engineId). Otherwise the grade is plain v3b and has no engine id.
import type { OpenGrade, FlagReason } from '../open';
import type { OpenItem, CriterionScore } from '../graders/domains';
import type { MishkatResult } from './client';
import { mishkatCriteria, mishkatTarget } from './manifest';

export const BOUNDARY_BAND = 0.15;
export const DISAGREE_LEVELS = 2;
export const MISHKAT_REASON = 'scored by Mishkat (trained scorer)';
export const BOUNDARY_REASON = 'mishkat_boundary';
export const RUBRIC_VERSION = 'v3b';
/** One id for the whole engine: the trained scorer's bundle version and the rubric v3b runs with. */
export const engineId = (scorerVersion: string): string => `${scorerVersion}+${RUBRIC_VERSION}`;

export interface MishkatLog {
  status: 'used' | 'unchanged' | 'unavailable' | 'not_eligible';
  reason?: string;
  version?: string;
  used: string[];
  boundary: string[];
  disagree: string[];
}

const reasonFor = (points: number, max: number) => (points >= max ? 'met' : points > 0 ? 'partly_met' : 'not_met');
/** True when a raw score sits within BOUNDARY_BAND of the midpoint between two levels. */
export const nearBoundary = (raw: number): boolean => Math.abs(raw - (Math.floor(raw) + 0.5)) < BOUNDARY_BAND;
export const roundScore = (raw: number, max: number): number => Math.min(max, Math.max(0, Math.round(raw)));

export function mergeMishkat(grade: OpenGrade, m: MishkatResult, ctx: { item: Pick<OpenItem, 'domain' | 'type' | 'language' | 'spoken'>; maxByCriterion: Record<string, number> }): { grade: OpenGrade; log: MishkatLog } {
  const log: MishkatLog = { status: 'unchanged', used: [], boundary: [], disagree: [] };
  const target = mishkatTarget(ctx.item);
  // Only a grade v3b actually made (not a flagged blank, not a code-only grade) is merged.
  if (!target || !grade.grader.startsWith('model:') || !grade.criterionScores.length) return { grade, log: { ...log, status: 'not_eligible' } };
  if (m.status !== 'ok') return { grade, log: { ...log, status: 'unavailable', reason: m.reason } };
  log.version = m.version;
  const engine = engineId(m.version);
  const byId = new Map(grade.criterionScores.map((s) => [s.criterionId, s]));
  const replaced = new Map<string, { score: CriterionScore; v3b: number }>();
  const boundary = new Set<string>();
  for (const c of mishkatCriteria(target.type, m.criteria, Object.keys(ctx.maxByCriterion))) {
    const v3b = byId.get(c);
    const raw = m.scores[c];
    if (!v3b || v3b.scoredBy === 'code' || typeof raw !== 'number' || !Number.isFinite(raw)) continue; // code-decided criteria win
    const rounded = roundScore(raw, ctx.maxByCriterion[c]);
    if (Math.abs(rounded - v3b.points) >= DISAGREE_LEVELS) log.disagree.push(c);
    if (nearBoundary(raw)) { boundary.add(c); log.boundary.push(c); continue; }
    replaced.set(c, { v3b: v3b.points, score: { criterionId: c, levelId: `p${rounded}`, points: rounded, scoredBy: 'mishkat', rule: `mishkat@${m.version}`, reason: MISHKAT_REASON } });
    log.used.push(c);
  }
  if (!replaced.size && !boundary.size && !log.disagree.length) return { grade, log }; // the scorer had nothing to say: plain v3b
  log.status = replaced.size ? 'used' : 'unchanged';
  const criterionScores: CriterionScore[] = grade.criterionScores.map((s) =>
    replaced.get(s.criterionId)?.score ?? (s.scoredBy ? s : { ...s, scoredBy: 'model' as const, ...(boundary.has(s.criterionId) ? { reason: BOUNDARY_REASON } : {}) }));
  const criteria: OpenGrade['criteria'] = criterionScores.map((s) => {
    const max = ctx.maxByCriterion[s.criterionId] ?? s.points;
    const r = replaced.get(s.criterionId);
    return { code: s.criterionId, points: s.points, max, reasonCode: reasonFor(s.points, max), ...(s.scoredBy ? { scoredBy: s.scoredBy } : {}), ...(s.rule ? { rule: s.rule } : {}), ...(s.reason ? { reason: s.reason } : {}), ...(r ? { modelPoints: r.v3b } : {}) };
  });
  const flagReasons: FlagReason[] = log.disagree.length && !grade.flagReasons.includes('graders_disagree') ? [...grade.flagReasons, 'graders_disagree'] : grade.flagReasons;
  return {
    grade: { ...grade, engine, criterionScores, criteria, points: criterionScores.reduce((n, s) => n + s.points, 0), flagReasons, flagged: flagReasons.length > 0 },
    log,
  };
}
