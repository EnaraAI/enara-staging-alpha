import { createHash } from 'crypto';

// Candidate V2 (hybrid-v2-rubric-native-anchor-independent, design-v1): output
// contracts. Pure functions only: no I/O, no model, no database. A result is
// VALID only if it conforms to the official grading contract as declared by the
// rubric; anything else gets an explicit status, never a score.
export const CANDIDATE_ID = 'hybrid-v2-rubric-native-anchor-independent';
export const DESIGN_VERSION = 'design-v1';
export const CANDIDATE_VERSION = `${CANDIDATE_ID}@${DESIGN_VERSION}`;

export type Status = 'VALID' | 'INVALID_OUTPUT' | 'UNGRADABLE' | 'NOT_ELIGIBLE' | 'ERROR';
export type ReasonCode =
  | 'INVALID_RUBRIC' | 'MISSING_CRITERION' | 'DUPLICATE_CRITERION' | 'INVALID_CRITERION_ID' | 'INVALID_LEVEL_ID'
  | 'CRITERION_POINTS_MISMATCH' | 'TOTAL_POINTS_MISMATCH' | 'SCORE_OUT_OF_RANGE' | 'SHORT_ANSWER_SCORE_NOT_BINARY'
  | 'RUBRIC_VERSION_MISMATCH' | 'SNAPSHOT_HASH_MISMATCH' | 'MISSING_EVIDENCE' | 'MISSING_FEEDBACK' | 'MALFORMED_OUTPUT'
  | 'EMPTY_OUTPUT' | 'UNSUPPORTED_QUESTION' | 'UNGRADABLE_ANSWER' | 'TIMEOUT' | 'GRADER_EXCEPTION' | 'STORAGE_FAILURE'
  | 'DISABLED' | 'TENANT_NOT_ALLOWED' | 'VERSION_MISMATCH' | 'MISSING_ID' | 'DUPLICATE_ANSWER_ID';

export interface Level { id: string; points: number }
export interface Criterion { id: string; maxPoints: number; levels: Level[] }
export interface Rubric { id: string; version: number; criteria: Criterion[] }

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

// Structural rubric checks (same rules authoring enforces, plus uniqueness).
export function validateRubric(r: unknown): { ok: true } | { ok: false; problems: string[] } {
  const p: string[] = [];
  const rub = r as Rubric;
  if (!rub || typeof rub !== 'object' || typeof rub.id !== 'string' || !rub.id) p.push('rubric id missing');
  if (!rub || !Number.isInteger(rub.version) || rub.version < 1) p.push('rubric version missing');
  if (!rub || !Array.isArray(rub.criteria) || !rub.criteria.length) return { ok: false, problems: [...p, 'no criteria'] };
  const ids = new Set<string>();
  for (const c of rub.criteria) {
    if (!c || typeof c.id !== 'string' || !c.id) { p.push('criterion id missing'); continue; }
    if (ids.has(c.id)) p.push(`duplicate criterion ${c.id}`);
    ids.add(c.id);
    if (!finite(c.maxPoints) || c.maxPoints <= 0) p.push(`criterion ${c.id}: invalid max`);
    if (!Array.isArray(c.levels) || !c.levels.length) { p.push(`criterion ${c.id}: no levels`); continue; }
    const lids = new Set<string>();
    for (const l of c.levels) {
      if (!l || typeof l.id !== 'string' || !l.id) p.push(`criterion ${c.id}: level id missing`);
      else if (lids.has(l.id)) p.push(`criterion ${c.id}: duplicate level ${l.id}`);
      else lids.add(l.id);
      if (!finite(l?.points) || l.points < 0 || l.points > c.maxPoints) p.push(`criterion ${c.id}: level points out of range`);
    }
    if (Math.max(...c.levels.map((l) => (finite(l?.points) ? l.points : -1))) !== c.maxPoints) p.push(`criterion ${c.id}: best level is not the max`);
  }
  return p.length ? { ok: false, problems: p } : { ok: true };
}

export const rubricMax = (r: Rubric) => r.criteria.reduce((n, c) => n + c.maxPoints, 0);

// Canonical, key-sorted JSON for hashing snapshots.
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}
export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export interface Snapshot {
  candidateVersion: string; tenantId: string; attemptId: string; questionId: string; assessmentVersion: number;
  kind: 'open-response' | 'short-answer'; rubric?: Rubric; maxPoints: number; questionText: string; answerSha256: string; hash: string;
}

export interface CriterionResult { criterionId: string; selectedLevelId: string; points: number; evidence: string[] }
export interface OpenResult { status: 'VALID'; criteria: CriterionResult[]; totalPoints: number; scoreMin: 0; scoreMax: number; feedback: string; rubricVersion: number }
export interface Failure { status: Exclude<Status, 'VALID'>; reasonCode: ReasonCode; detail?: string }

const bad = (reasonCode: ReasonCode, detail?: string, status: Failure['status'] = 'INVALID_OUTPUT'): Failure => ({ status, reasonCode, detail });

// Open response: one declared level per criterion; points must equal the level's;
// total must equal the sum; evidence quotes must occur in the answer for any level above 0.
export function validateOpenOutput(raw: unknown, snap: Snapshot, answer: string): OpenResult | Failure {
  const rub = snap.rubric;
  if (!rub || !validateRubric(rub).ok) return bad('INVALID_RUBRIC', undefined, 'NOT_ELIGIBLE');
  if (raw === null || raw === undefined || raw === '') return bad('EMPTY_OUTPUT');
  if (typeof raw !== 'object' || Array.isArray(raw)) return bad('MALFORMED_OUTPUT');
  const o = raw as Record<string, unknown>;
  if (o.ungradable === true) return bad('UNGRADABLE_ANSWER', undefined, 'UNGRADABLE');
  if (o.rubricVersion !== rub.version) return bad('RUBRIC_VERSION_MISMATCH');
  if (!Array.isArray(o.criteria)) return bad('MALFORMED_OUTPUT', 'criteria');
  const seen = new Set<string>();
  const out: CriterionResult[] = [];
  for (const item of o.criteria as unknown[]) {
    const it = item as Record<string, unknown>;
    if (!it || typeof it !== 'object' || typeof it.criterionId !== 'string' || typeof it.selectedLevelId !== 'string') return bad('MALFORMED_OUTPUT', 'criterion item');
    const c = rub.criteria.find((x) => x.id === it.criterionId);
    if (!c) return bad('INVALID_CRITERION_ID', it.criterionId);
    if (seen.has(c.id)) return bad('DUPLICATE_CRITERION', c.id);
    seen.add(c.id);
    const level = c.levels.find((l) => l.id === it.selectedLevelId);
    if (!level) return bad('INVALID_LEVEL_ID', `${c.id}/${it.selectedLevelId}`);
    if (!finite(it.points)) return bad('SCORE_OUT_OF_RANGE', `${c.id} points not finite`);
    if (it.points !== level.points) return bad('CRITERION_POINTS_MISMATCH', c.id);
    const ev = Array.isArray(it.evidence) ? it.evidence.filter((q): q is string => typeof q === 'string' && q.trim().length > 0) : null;
    if (ev === null) return bad('MALFORMED_OUTPUT', `${c.id} evidence`);
    if (level.points > 0 && (!ev.length || ev.some((q) => !answer.includes(q)))) return bad('MISSING_EVIDENCE', c.id);
    out.push({ criterionId: c.id, selectedLevelId: level.id, points: level.points, evidence: ev });
  }
  const missing = rub.criteria.filter((c) => !seen.has(c.id));
  if (missing.length) return bad('MISSING_CRITERION', missing.map((c) => c.id).join(','));
  const sum = out.reduce((n, c) => n + c.points, 0);
  if (!finite(o.totalPoints)) return bad('SCORE_OUT_OF_RANGE', 'total not finite');
  if (o.totalPoints < 0 || o.totalPoints > rubricMax(rub)) return bad('SCORE_OUT_OF_RANGE', 'total');
  if (o.totalPoints !== sum) return bad('TOTAL_POINTS_MISMATCH');
  if (typeof o.feedback !== 'string' || !o.feedback.trim()) return bad('MISSING_FEEDBACK');
  // Order follows the rubric, not the model output (deterministic).
  out.sort((a, b) => rub.criteria.findIndex((c) => c.id === a.criterionId) - rub.criteria.findIndex((c) => c.id === b.criterionId));
  return { status: 'VALID', criteria: out, totalPoints: sum, scoreMin: 0, scoreMax: rubricMax(rub), feedback: o.feedback.trim(), rubricVersion: rub.version };
}

export interface ShortResult { status: 'VALID'; isCorrect: boolean; points: number; feedback: string }

// Short answer: binary contract (0 or max), never partial credit.
export function validateShortOutput(raw: unknown, snap: Snapshot): ShortResult | Failure {
  if (raw === null || raw === undefined || raw === '') return bad('EMPTY_OUTPUT');
  if (typeof raw !== 'object' || Array.isArray(raw)) return bad('MALFORMED_OUTPUT');
  const o = raw as Record<string, unknown>;
  if (o.ungradable === true) return bad('UNGRADABLE_ANSWER', undefined, 'UNGRADABLE');
  if (typeof o.isCorrect !== 'boolean') return bad('MALFORMED_OUTPUT', 'isCorrect');
  if (o.points !== undefined) {
    if (!finite(o.points)) return bad('SCORE_OUT_OF_RANGE', 'points not finite');
    if (o.points !== 0 && o.points !== snap.maxPoints) return bad('SHORT_ANSWER_SCORE_NOT_BINARY');
    if (o.points !== (o.isCorrect ? snap.maxPoints : 0)) return bad('SHORT_ANSWER_SCORE_NOT_BINARY', 'points disagree with isCorrect');
  }
  if (typeof o.feedback !== 'string' || !o.feedback.trim()) return bad('MISSING_FEEDBACK');
  return { status: 'VALID', isCorrect: o.isCorrect, points: o.isCorrect ? snap.maxPoints : 0, feedback: o.feedback.trim() };
}
