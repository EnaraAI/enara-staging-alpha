import { Rng, sha256 } from '../util/rng';
import { AREAS, type Area } from '../benchmark/schema';

export const CONDITIONS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_NAMES: Record<Condition, string> = { A: 'actual ENARA tutor', B: 'study notes', C: 'generic AI tutor', D: 'scripted human-like tutor', E: 'ENARA adaptive-teaching ablation', F: 'no-teaching control' };

export interface Block { studentId: string; replication: number; blockIndex: number; order: number; area: Area; outcomeId: string; condition: Condition; blockId: string; }

/** Balanced crossed design. Each student studies 6 outcomes (one per area), each in a different condition.
 *  Conditions rotate through a seeded 6x6 Latin square so every condition meets every area equally often across students.
 *  Outcome within an area cycles through a seeded shuffle so outcomes are used equally often.  Block order is shuffled per student. */
export function assign(opts: { seed: string; replication: number; students: string[]; outcomesByArea: Record<Area, string[]> }): Block[] {
  const { seed, replication, students, outcomesByArea } = opts;
  const rng = Rng.of(seed, 'assign', replication);
  const rowPerm = rng.shuffle([0, 1, 2, 3, 4, 5]); const colPerm = rng.shuffle([0, 1, 2, 3, 4, 5]);
  const cycles = new Map<Area, string[]>(); const pos = new Map<Area, number>();
  for (const a of AREAS) { cycles.set(a, rng.shuffle(outcomesByArea[a])); pos.set(a, 0); }
  const blocks: Block[] = [];
  students.forEach((studentId, si) => {
    const row = rowPerm[si % 6]; const order = Rng.of(seed, 'order', replication, studentId).shuffle([0, 1, 2, 3, 4, 5]);
    AREAS.forEach((area, ai) => {
      const condition = CONDITIONS[(row + colPerm[ai]) % 6];
      const list = cycles.get(area)!; const p = pos.get(area)!; pos.set(area, p + 1);
      const outcomeId = list[p % list.length];
      blocks.push({ studentId, replication, blockIndex: ai, order: order[ai], area, outcomeId, condition, blockId: `r${replication}-${studentId}-${outcomeId}` });
    });
  });
  return blocks;
}
export const assignmentHash = (b: Block[]): string => sha256(JSON.stringify(b.map((x) => [x.blockId, x.condition, x.order])));

export interface BalanceReport { perConditionPerArea: Record<string, number>; maxImbalance: number; studentsWithAllConditions: number; students: number; }
export function balance(blocks: Block[]): BalanceReport {
  const c: Record<string, number> = {}; for (const b of blocks) c[`${b.area}|${b.condition}`] = (c[`${b.area}|${b.condition}`] ?? 0) + 1;
  const v = Object.values(c); const byStudent = new Map<string, Set<string>>(); for (const b of blocks) (byStudent.get(b.studentId) ?? byStudent.set(b.studentId, new Set()).get(b.studentId)!).add(b.condition);
  return { perConditionPerArea: c, maxImbalance: Math.max(...v) - Math.min(...v), studentsWithAllConditions: [...byStudent.values()].filter((s) => s.size === 6).length, students: byStudent.size };
}

/** Experiment 4 matched design: each unit (student, outcome, replication) is run under EVERY listed condition with identical hidden state.
 *  One outcome per area per student-replication, outcomes drawn from the allowed pool in a seeded, balanced cycle. */
export interface MatchedBlock extends Block { unit: string; seedKey: string; }
export function assignMatched(opts: { seed: string; replication: number; students: string[]; outcomesByArea: Record<Area, string[]>; conditions: Condition[] }): MatchedBlock[] {
  const { seed, replication, students, outcomesByArea, conditions } = opts;
  const rng = Rng.of(seed, 'assign-matched', replication);
  const cycles = new Map<Area, string[]>(); const pos = new Map<Area, number>();
  for (const a of AREAS) { cycles.set(a, rng.shuffle(outcomesByArea[a])); pos.set(a, 0); }
  const out: MatchedBlock[] = [];
  for (const studentId of students) {
    const units: { area: Area; outcomeId: string }[] = [];
    for (const area of AREAS) { const list = cycles.get(area)!; const p = pos.get(area)!; pos.set(area, p + 1); units.push({ area, outcomeId: list[p % list.length] }); }
    const blocks: MatchedBlock[] = [];
    units.forEach((u, ai) => { const seedKey = `r${replication}-${studentId}-${u.outcomeId}`; for (const condition of conditions) blocks.push({ studentId, replication, blockIndex: ai, order: 0, area: u.area, outcomeId: u.outcomeId, condition, blockId: `${seedKey}-${condition}`, unit: seedKey, seedKey }); });
    const order = Rng.of(seed, 'order-matched', replication, studentId).shuffle(blocks.map((_, i) => i)); blocks.forEach((b, i) => { b.order = order[i]; });
    out.push(...blocks);
  }
  return out;
}
