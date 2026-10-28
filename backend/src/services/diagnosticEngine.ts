// Adaptive diagnostic selection (diag-v1). Pure functions; the controller
// loads data and persists results.
//
// - Each target objective needs 2 answers; it is "settled" when both are right
//   (secure) or both wrong (gap), or after 3 answers (secure >= 2/3 right,
//   gap <= 1/3, otherwise mixed).
// - Prerequisites in the set are asked first. If a prerequisite settles as a
//   gap, objectives that depend on it are not asked: the report points to the
//   prerequisite instead.
// - Next objective: fewest answers so far, then least prior evidence (most
//   uncertain), then code.
// - Next question for it: not used in this diagnostic, preferably never seen
//   by the student, difficulty closest to a target that starts at 3 and moves
//   up after a right answer and down after a wrong one.
// - Stops at the question limit, when every objective is settled or blocked
//   (enough evidence), or when no usable question is left (pool exhausted).

export const DIAGNOSTIC_ALGORITHM_VERSION = 'diag-v1';
const MIN_ANSWERS = 2;
const MAX_PER_OBJECTIVE = 3;

export interface PoolItem {
  assessmentId: string;
  questionId: string;
  objectiveIds: string[];
  difficulty?: number;
  seenBefore: boolean;
}

export interface TargetObjective {
  id: string;
  code: string;
  prerequisiteObjectiveIds: string[];
  priorEvidenceCount: number;
}

export interface ResponseLite {
  assessmentId: string;
  questionId: string;
  objectiveIds: string[];
  difficulty?: number;
  correct: boolean;
}

export type SessionResult = 'secure' | 'gap' | 'mixed' | 'inconclusive';

export function objectiveSessionState(objectiveId: string, responses: ResponseLite[]) {
  const mine = responses.filter((r) => r.objectiveIds.includes(objectiveId));
  const correct = mine.filter((r) => r.correct).length;
  const n = mine.length;
  let result: SessionResult = 'inconclusive';
  let settled = false;
  if (n >= MIN_ANSWERS && (correct === n || correct === 0)) {
    result = correct === n ? 'secure' : 'gap';
    settled = true;
  } else if (n >= MAX_PER_OBJECTIVE) {
    const ratio = correct / n;
    result = ratio >= 2 / 3 ? 'secure' : ratio <= 1 / 3 ? 'gap' : 'mixed';
    settled = true;
  }
  return { answered: n, correct, result, settled, last: mine[mine.length - 1] };
}

const key = (i: { assessmentId: string; questionId: string }) => `${i.assessmentId}::${i.questionId}`;

export function selectNextItem(params: {
  objectives: TargetObjective[];
  pool: PoolItem[];
  responses: ResponseLite[];
  maxQuestions: number;
}):
  | { item: PoolItem; objectiveId: string; reason: string }
  | { stop: 'max_questions' | 'enough_evidence' | 'pool_exhausted' } {
  const { objectives, pool, responses, maxQuestions } = params;
  if (responses.length >= maxQuestions) return { stop: 'max_questions' };
  const used = new Set(responses.map(key));
  const targetIds = new Set(objectives.map((o) => o.id));
  const state = new Map(objectives.map((o) => [o.id, objectiveSessionState(o.id, responses)]));
  const itemsFor = (id: string) => pool.filter((p) => p.objectiveIds.includes(id) && !used.has(key(p)));

  const blockedBy = (o: TargetObjective) =>
    o.prerequisiteObjectiveIds.find((p) => targetIds.has(p) && state.get(p)?.settled && state.get(p)?.result === 'gap');

  const open = objectives.filter((o) => !state.get(o.id)!.settled && !blockedBy(o));
  const withItems = open.filter((o) => itemsFor(o.id).length > 0);
  if (!open.length) return { stop: 'enough_evidence' };
  if (!withItems.length) return { stop: 'pool_exhausted' };

  // Prerequisites first: wait on an objective while one of its in-set
  // prerequisites is still open and askable.
  const askable = new Set(withItems.map((o) => o.id));
  const ready = withItems.filter((o) => !o.prerequisiteObjectiveIds.some((p) => askable.has(p)));
  const candidates = (ready.length ? ready : withItems).sort(
    (a, b) =>
      state.get(a.id)!.answered - state.get(b.id)!.answered ||
      a.priorEvidenceCount - b.priorEvidenceCount ||
      a.code.localeCompare(b.code),
  );
  const target = candidates[0];
  const s = state.get(target.id)!;
  const lastDifficulty = s.last?.difficulty ?? 3;
  const targetDifficulty = s.last ? Math.min(5, Math.max(1, lastDifficulty + (s.last.correct ? 1 : -1))) : 3;
  const item = itemsFor(target.id).sort(
    (a, b) =>
      Number(a.seenBefore) - Number(b.seenBefore) ||
      Math.abs((a.difficulty ?? 3) - targetDifficulty) - Math.abs((b.difficulty ?? 3) - targetDifficulty) ||
      key(a).localeCompare(key(b)),
  )[0];
  const reason =
    `${target.code}: ${s.answered} answer(s) so far` +
    (s.last ? `, last ${s.last.correct ? 'right' : 'wrong'}, aiming at difficulty ${targetDifficulty}` : ', starting at difficulty 3') +
    (item.seenBefore ? ' (no unseen question left)' : '');
  return { item, objectiveId: target.id, reason };
}
