// A fixed, seeded sample of teaching-plan inputs (ped-v2 PlanInput), used by the planner parity and coverage tests.
// Deterministic: the same seed always gives the same cases in the same order. Do not change it, or the parity hash changes.
import { createHash } from 'crypto';
import type { PlanInput } from '../../src/services/pedagogyPolicy';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUS = ['not_assessed', 'emerging', 'developing', 'proficient', 'mastered'];
const MISC: PlanInput['misconceptions'][] = [
  [],
  [{ id: 'm1', category: 'conceptual_misunderstanding', status: 'suspected' }],
  [{ id: 'm1', category: 'procedural_error', status: 'suspected' }],
  [{ id: 'm1', category: 'procedural_error', status: 'confirmed' }],
  [{ id: 'm1', category: 'misinterpretation', status: 'suspected' }],
  [{ id: 'm1', category: 'calculation_error', status: 'confirmed' }],
];
const PREV_PRIMARY = ['direct_instruction', 'worked_example', 'scaffolding', 'socratic_questioning', 'analogy', 'retrieval_practice', 'mastery_learning', 'guided_practice', 'formative_feedback'];
const TRIED = [[], ['analogy'], ['worked_example', 'direct_instruction'], ['scaffolding']];
const GRADE = [undefined, 3, 6, 8, 11, 18];
const SUBJECT = [undefined, 'Grammar', 'History', 'Biology', 'English'];
const AGE: PlanInput['ageBand'][] = [undefined, 'child', 'teen', 'adult', 'unknown'];
const EVIDENCE = ['none', 'limited', 'moderate', 'substantial'];

export function planGrid(n = 6000, seed = 20261119): PlanInput[] {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const coin = (p = 0.5) => r() < p;
  const out: PlanInput[] = [];
  for (let i = 0; i < n; i++) {
    const prevKind = Math.floor(r() * 4);
    const input: PlanInput = {
      objectiveId: 'o1',
      masteryStatus: pick(STATUS),
      evidenceStrength: pick(EVIDENCE),
      weakPrerequisiteIds: coin(0.12) ? ['p1'] : [],
      misconceptions: pick(MISC),
      supportingEvidenceIds: coin(0.8) ? ['e1'] : [],
      recentResults: coin(0.3) ? ['incorrect', 'incorrect'] : coin(0.5) ? ['correct'] : [],
      retention: coin(0.6) ? undefined : { due: coin(), lapsed: coin(0.3) },
      applicationGap: coin(0.5) ? undefined : coin(0.4),
      previous: prevKind === 0 ? undefined : { primary: pick(PREV_PRIMARY), newEvidenceSince: prevKind !== 1, improved: prevKind === 3 ? undefined : coin() },
      triedWithoutImprovement: [...pick(TRIED)],
      teacherStrategyId: coin(0.06) ? pick(['case_based', 'project_based', 'worked_example', 'spaced_repetition']) : undefined,
      gradeLevel: pick(GRADE),
      disengaged: coin(0.15),
      availableMinutes: coin(0.1) ? 5 : undefined,
      relatedSecureObjectives: pick([0, 1, 2, 3]),
      subject: pick(SUBJECT),
      belowB1: coin(0.6) ? true : undefined,
      ageBand: pick(AGE),
      reviewOpening: coin(0.15),
      formRightTwice: coin(0.2),
      vocabulary: coin(0.2),
    };
    out.push(input);
  }
  return out;
}

export const PLAN_ENVS = ['', 'levelExplicit', 'methodSelect', 'teach2', 'levelExplicit,methodSelect', 'esl5,levelExplicit,teach2', 'all'];

/** sha256 of a canonical JSON of the outputs. */
export const hashOf = (xs: unknown[]): string => createHash('sha256').update(JSON.stringify(xs)).digest('hex');
