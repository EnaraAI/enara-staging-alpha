import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// CEFR level and sub-level for parents (decision 16 Nov 2026):
//   sub-level % = share of the level's FORM outcomes (data/outcomes/outcomes.json)
//   the learner has mastered (StudentObjectiveMastery, status 'mastered', not
//   awaiting verification; the outcome rule is "criterion met on the 7-day
//   delayed check"). Halves: X.1 = 0-49 %, X.2 = 50-100 %.
//   Level-up: >= 80 % mastered AND a passed checkpoint at that level.
//   Pre-A1 has its own 3 sub-steps. Only A1-A2 have outcomes today; other
//   levels show without a sub-level.

export const CEFR_ORDER = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Cefr = (typeof CEFR_ORDER)[number];
export const LEVEL_UP_SHARE = 0.8;

export const PARENT_LEVEL_LABELS: Record<Cefr, { en: string; ar: string }> = {
  'Pre-A1': { en: 'Starter', ar: 'مبتدئ صغير' },
  A1: { en: 'Beginner', ar: 'مبتدئ' },
  A2: { en: 'Elementary', ar: 'أساسي' },
  B1: { en: 'Intermediate', ar: 'متوسط' },
  B2: { en: 'Upper intermediate', ar: 'فوق المتوسط' },
  C1: { en: 'Advanced', ar: 'متقدم' },
  C2: { en: 'Proficient', ar: 'متمكّن' },
};

export interface OutcomeRecord { id: string; level: string; cefr: string; skill: string; statement: string; measurable?: string }

let cache: OutcomeRecord[] | null = null;
export function loadOutcomes(): OutcomeRecord[] {
  if (cache) return cache;
  const candidates = [join(__dirname, '../../../data/outcomes/outcomes.json'), join(process.cwd(), '../data/outcomes/outcomes.json'), join(process.cwd(), 'data/outcomes/outcomes.json')];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      cache = (JSON.parse(readFileSync(p, 'utf8')).outcomes ?? []) as OutcomeRecord[];
      return cache;
    } catch { /* try the next */ }
  }
  cache = [];
  return cache;
}
export function setOutcomesForTests(o: OutcomeRecord[] | null): void { cache = o; }

export function formOutcomes(cefr: string): OutcomeRecord[] {
  return loadOutcomes().filter((o) => o.level === 'form' && o.cefr === cefr);
}
export function courseOutcomes(cefr: string): OutcomeRecord[] {
  return loadOutcomes().filter((o) => o.level === 'course' && o.cefr === cefr);
}

export function subLevelName(cefr: Cefr, pct: number | null): string | null {
  if (pct === null) return null;
  if (cefr === 'Pre-A1') return `Pre-A1 step ${pct < 34 ? 1 : pct < 67 ? 2 : 3} of 3`;
  return `${cefr}.${pct < 50 ? 1 : 2}`;
}

export interface LevelResult {
  cefr: Cefr;
  subLevelPct: number | null;
  subLevel: string | null;
  next: Cefr | null;
  masteredCount: number;
  outcomeCount: number;
  basis: 'outcomes_mastery' | 'no_outcomes_for_level';
}

/**
 * Walk A1 -> A2 -> B1: a learner stays on the first level not yet completed
 * (>= 80 % of its form outcomes mastered plus a passed checkpoint).
 * Returns null when there is no mastery evidence at all (caller falls back).
 */
export function computeLevel(masteredOutcomeIds: Set<string>, passedCheckpoints: Set<string>, anyEvidence: boolean): LevelResult | null {
  if (!anyEvidence) return null;
  for (const cefr of ['A1', 'A2'] as const) {
    const outs = formOutcomes(cefr);
    if (!outs.length) return null;
    const mastered = outs.filter((o) => masteredOutcomeIds.has(o.id)).length;
    const share = mastered / outs.length;
    if (share >= LEVEL_UP_SHARE && passedCheckpoints.has(cefr)) continue;
    const pct = Math.round(share * 100);
    return { cefr, subLevelPct: pct, subLevel: subLevelName(cefr, pct), next: CEFR_ORDER[CEFR_ORDER.indexOf(cefr) + 1], masteredCount: mastered, outcomeCount: outs.length, basis: 'outcomes_mastery' };
  }
  return { cefr: 'B1', subLevelPct: null, subLevel: null, next: 'B2', masteredCount: 0, outcomeCount: 0, basis: 'no_outcomes_for_level' };
}

/** A checkpoint attempt counts as passed for a level when its title names the level and checkpoint, scored >= 60 %. */
export function checkpointLevel(title: string | undefined, score: number | undefined): Cefr | null {
  if (!title || typeof score !== 'number' || score < 60 || !/checkpoint/i.test(title)) return null;
  const m = title.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  return (m?.[1] as Cefr) ?? null;
}
