import { Rng } from '../util/rng';
import { AREAS, type Area } from '../benchmark/schema';

// Experimental parameters of synthetic AI students. These are NOT validated personality types.
export interface StudentState {
  id: string; seed: number; cefr: 'A1' | 'A2' | 'B1' | 'B2';
  priorKnowledge: Record<Area, number>;      // 0..1 chance the target skill is already mastered before teaching
  misconceptionStrength: number;             // 0..1 how firmly an explicit misconception is held
  prerequisiteLevel: number;                 // 0..1 strength of prerequisite knowledge
  learningRate: number;                      // 0..1 how readily good teaching changes beliefs ("persuadability")
  attentionLapse: number;                    // 0..1 per-answer probability of an inattentive wrong/blank answer
  guessRate: number;                         // 0..1 per-answer probability of a guess / superficial memorisation answer
  confidenceBias: number;                    // -1..1 (under .. over-confident)
  halfLifeDays: number;                      // forgetting half-life of a freshly learned item
  strategyResponse: Record<string, number>;  // responsiveness 0..1 to explanation|hints|examples|practice
  inconsistency: number;                     // 0..1 random performance noise
  tags: string[];                            // overlapping behaviour dimensions (derived, for subgroup analysis)
}

export function makeStudent(index: number, masterSeed: string, opts: { adversarial?: boolean } = {}): StudentState {
  const id = `S${String(index + 1).padStart(3, '0')}`; const r = Rng.of(masterSeed, 'student', id);
  const learningRate = r.clamp01Normal(0.5, 0.22); const prerequisiteLevel = r.clamp01Normal(0.6, 0.22); const misconceptionStrength = r.clamp01Normal(0.55, 0.25);
  const attentionLapse = r.clamp01Normal(0.1, 0.08); const guessRate = r.clamp01Normal(0.15, 0.1); const confidenceBias = Math.max(-1, Math.min(1, r.normal(0, 0.5)));
  const halfLifeDays = Math.max(2, Math.exp(r.normal(Math.log(14), 0.6))); const inconsistency = r.clamp01Normal(0.2, 0.12);
  const prior = {} as Record<Area, number>; const base = r.clamp01Normal(0.2, 0.12);
  for (const a of AREAS) prior[a] = Math.max(0, Math.min(1, base + r.normal(0, 0.1) + (prerequisiteLevel - 0.6) * 0.15));
  const s: StudentState = {
    id, seed: r.int(2 ** 31), cefr: r.pick(['A1', 'A2', 'A2', 'B1', 'B1', 'B2'] as const), priorKnowledge: prior, misconceptionStrength, prerequisiteLevel, learningRate, attentionLapse, guessRate, confidenceBias, halfLifeDays, inconsistency,
    strategyResponse: { explanation: r.clamp01Normal(0.6, 0.2), hints: r.clamp01Normal(0.6, 0.2), examples: r.clamp01Normal(0.6, 0.2), practice: r.clamp01Normal(0.6, 0.2) }, tags: [],
  };
  if (opts.adversarial) { s.misconceptionStrength = Math.max(s.misconceptionStrength, 0.9); s.learningRate = Math.min(s.learningRate, 0.25); s.guessRate = Math.max(s.guessRate, 0.35); }
  const t = s.tags; if (opts.adversarial) t.push('adversarial');
  t.push(s.learningRate >= 0.6 ? 'fast_learner' : s.learningRate <= 0.4 ? 'slow_learner' : 'mid_learner');
  if (s.confidenceBias > 0.3) t.push('overconfident'); else if (s.confidenceBias < -0.3) t.push('underconfident');
  if (s.misconceptionStrength >= 0.7) t.push('persistent_misconceptions');
  if (s.prerequisiteLevel <= 0.4) t.push('weak_prerequisites');
  if (s.attentionLapse >= 0.18) t.push('low_attention');
  if (s.guessRate >= 0.25) t.push('guesser');
  if (s.halfLifeDays <= 7) t.push('fast_forgetter');
  if (s.inconsistency >= 0.3) t.push('inconsistent');
  return s;
}
export const makePopulation = (n: number, masterSeed: string): StudentState[] => Array.from({ length: n }, (_, i) => makeStudent(i, masterSeed));

/** Per-block hidden starting state for one outcome: does the student already know it, and which misconception do they hold. */
export interface BlockStart { knowsAlready: boolean; heldMisconceptionIdx: number; }
export function blockStart(s: StudentState, area: Area, outcomeId: string, misconceptionCount: number): BlockStart {
  const r = Rng.of(s.seed, 'blockstart', outcomeId);
  return { knowsAlready: r.bool(s.priorKnowledge[area]), heldMisconceptionIdx: r.int(Math.max(1, misconceptionCount)) };
}
/** Seeded per-item behaviour flags, recorded in the audit log (so student behaviour is auditable and reproducible). */
export interface ItemBehaviour { lapse: boolean; guess: boolean; noiseRoll: number; }
export function itemBehaviour(s: StudentState, blockId: string, itemId: string, stage: string): ItemBehaviour {
  const r = Rng.of(s.seed, 'item', blockId, itemId, stage);
  return { lapse: r.bool(s.attentionLapse), guess: r.bool(s.guessRate), noiseRoll: r.next() };
}
/** Probability a learned item is still retained after `days` (exponential forgetting with student's half-life). */
export const retention = (halfLifeDays: number, days: number): number => Math.exp((-Math.LN2 * days) / halfLifeDays);
export function retainedAfter(s: StudentState, blockId: string, itemId: string, days: number): boolean { return Rng.of(s.seed, 'retain', blockId, itemId, days).bool(retention(s.halfLifeDays, days)); }

/** Build the simulated-student system prompt from numeric state only. It never contains assessment content. */
export function studentPersona(s: StudentState, ctx: { cefr: string; area: Area; heldMisconception: { description: string; exampleWrong: string } | null; knowsAlready: boolean }): string {
  const lvl = (v: number, lo: string, mid: string, hi: string) => (v < 0.34 ? lo : v < 0.67 ? mid : hi);
  return [
    `You are role-playing an English learner in Egypt (first language Arabic), course level ${s.cefr}. Write ONLY what the learner types; never mention being an AI or role-playing; keep each message under 25 words.`,
    `You learn ${lvl(s.learningRate, 'slowly and need repetition', 'at a normal pace', 'quickly')}. Your confidence in your own answers is ${s.confidenceBias > 0.3 ? 'higher than it should be' : s.confidenceBias < -0.3 ? 'lower than it should be' : 'about right'}.`,
    ctx.heldMisconception ? `You currently believe something wrong about this point: ${ctx.heldMisconception.description} (for example you might write: "${ctx.heldMisconception.exampleWrong}"). You hold this belief ${lvl(s.misconceptionStrength, 'only weakly', 'fairly firmly', 'very firmly')}. You change it only if what you are taught - by a tutor or by study material, whichever - really convinces you; how easily you are convinced depends on how well it is explained and on your learning speed.` : 'You have no particular mistaken belief about this point.',
    ctx.knowsAlready ? 'You already know this point reasonably well.' : 'You do not yet know this point well.',
    `Your basic prerequisite knowledge is ${lvl(s.prerequisiteLevel, 'weak', 'moderate', 'strong')}. Sometimes you are distracted (${Math.round(s.attentionLapse * 100)}% of the time) and sometimes you guess (${Math.round(s.guessRate * 100)}% of the time).`,
    'Do not pretend to understand if the explanation did not help you; you may ask for clarification, make mistakes, guess, or fail to learn.',
  ].join(' ');
}
