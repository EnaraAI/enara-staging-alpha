import type { ITeachingEpisode } from '../models/TeachingEpisode';
import { OBSERVATIONAL_NOTE } from './teachingImpact';

// Method effectiveness (P21 C5): descriptive summaries of teaching episodes by
// method, never a ranking and never a causal estimate.
//
// - Only episodes labelled associated_with_intervention (comparable before/after
//   evidence) enter the change estimate; others are counted by label.
// - Students, not episodes, are the unit: each student's episodes in a group are
//   averaged first, so one student seen many times is not many samples. The
//   interval is a student-level (cluster) bootstrap, 90%, with a fixed seed.
// - A group shows a change only with at least MIN_EPISODES comparable episodes
//   from at least MIN_STUDENTS students: a reporting threshold, not statistical
//   significance. Below it the result is "insufficient_evidence".
// - Change is post minus baseline on the 0-1 scale; groups can be split by
//   baseline band (low < 0.4, mid < 0.7, high), objective, subject, grade band or
//   misconception category, because methods are chosen for different learners
//   and a raw average across them would mislead.

export const EFFECTIVENESS_VERSION = 'effect-v1';
export const MIN_EPISODES = 10;
export const MIN_STUDENTS = 5;
export type Dimension = 'none' | 'objective' | 'subject' | 'gradeBand' | 'baselineBand' | 'misconception';
export const DIMENSIONS: Dimension[] = ['none', 'objective', 'subject', 'gradeBand', 'baselineBand', 'misconception'];

type Ep = Pick<ITeachingEpisode, 'studentId' | 'primary' | 'supporting' | 'objectiveId' | 'subject' | 'gradeBand' | 'misconceptionCategories' | 'label' | 'observedChange' | 'retentionChange' | 'baseline' | 'comparability' | 'evidenceQuality'>;

export const baselineBand = (score: number | null | undefined) => (score == null ? 'unknown' : score < 0.4 ? 'low' : score < 0.7 ? 'mid' : 'high');

function keysFor(e: Ep, dim: Dimension): string[] {
  switch (dim) {
    case 'objective': return [e.objectiveId];
    case 'subject': return [e.subject ?? 'unknown'];
    case 'gradeBand': return [e.gradeBand ?? 'unknown'];
    case 'baselineBand': return [baselineBand(e.baseline?.score)];
    case 'misconception': return e.misconceptionCategories?.length ? e.misconceptionCategories : ['none_recorded'];
    default: return ['all'];
  }
}

// Deterministic PRNG (mulberry32) so the same data always gives the same interval.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function clusterBootstrap(perStudent: number[], reps = 2000, seed = 7): { low: number; high: number } {
  const rand = rng(seed);
  const means: number[] = [];
  for (let i = 0; i < reps; i++) {
    let s = 0;
    for (let j = 0; j < perStudent.length; j++) s += perStudent[Math.floor(rand() * perStudent.length)];
    means.push(s / perStudent.length);
  }
  means.sort((a, b) => a - b);
  return { low: r3(means[Math.floor(0.05 * reps)]), high: r3(means[Math.ceil(0.95 * reps) - 1]) };
}

export interface EffectGroup {
  method: string;
  supporting?: string[];
  dimension: Dimension;
  key: string;
  episodes: number;
  students: number;
  byLabel: Record<string, number>;
  comparable: { episodes: number; students: number };
  status: 'reported' | 'insufficient_evidence';
  meanChange: number | null; // student-weighted
  interval90: { low: number; high: number } | null;
  retention: { students: number; meanChange: number | null };
  flagShare: Record<string, number>; // share of episodes with each comparability flag
}

export function summarize(episodes: Ep[], opts: { dimension?: Dimension; byComposition?: boolean } = {}): { groups: EffectGroup[]; caveats: string[]; version: string; thresholds: { minEpisodes: number; minStudents: number }; ranked: false } {
  const dim = opts.dimension ?? 'none';
  const buckets = new Map<string, { method: string; supporting?: string[]; key: string; eps: Ep[] }>();
  for (const e of episodes) {
    const method = opts.byComposition ? [e.primary, ...(e.supporting ?? [])].join('+') : e.primary;
    for (const key of keysFor(e, dim)) {
      const id = `${method}|${key}`;
      const b = buckets.get(id) ?? { method: e.primary, supporting: opts.byComposition ? e.supporting ?? [] : undefined, key, eps: [] };
      b.eps.push(e);
      buckets.set(id, b);
    }
  }
  const groups: EffectGroup[] = [];
  for (const b of buckets.values()) {
    const byLabel: Record<string, number> = {};
    const flags: Record<string, number> = {};
    for (const e of b.eps) {
      byLabel[e.label] = (byLabel[e.label] ?? 0) + 1;
      for (const f of e.comparability ?? []) flags[f] = (flags[f] ?? 0) + 1;
    }
    const comparable = b.eps.filter((e) => e.label === 'associated_with_intervention' && typeof e.observedChange === 'number');
    const perStudent = new Map<string, number[]>();
    for (const e of comparable) perStudent.set(e.studentId, [...(perStudent.get(e.studentId) ?? []), e.observedChange as number]);
    const studentMeans = [...perStudent.values()].map(mean);
    const reported = comparable.length >= MIN_EPISODES && perStudent.size >= MIN_STUDENTS;
    const ret = new Map<string, number[]>();
    for (const e of comparable) if (typeof e.retentionChange === 'number') ret.set(e.studentId, [...(ret.get(e.studentId) ?? []), e.retentionChange]);
    const retMeans = [...ret.values()].map(mean);
    groups.push({
      method: b.method,
      ...(b.supporting ? { supporting: b.supporting } : {}),
      dimension: dim,
      key: b.key,
      episodes: b.eps.length,
      students: new Set(b.eps.map((e) => e.studentId)).size,
      byLabel,
      comparable: { episodes: comparable.length, students: perStudent.size },
      status: reported ? 'reported' : 'insufficient_evidence',
      meanChange: reported ? r3(mean(studentMeans)) : null,
      interval90: reported ? clusterBootstrap(studentMeans) : null,
      retention: { students: ret.size, meanChange: reported && ret.size >= MIN_STUDENTS ? r3(mean(retMeans)) : null },
      flagShare: Object.fromEntries(Object.entries(flags).map(([f, n]) => [f, r3(n / b.eps.length)])),
    });
  }
  // Alphabetical, never by effect: a ranking would invite a causal reading.
  groups.sort((a, b) => a.method.localeCompare(b.method) || a.key.localeCompare(b.key));
  return {
    groups,
    version: EFFECTIVENESS_VERSION,
    thresholds: { minEpisodes: MIN_EPISODES, minStudents: MIN_STUDENTS },
    ranked: false,
    caveats: [
      OBSERVATIONAL_NOTE,
      `A change is shown only with at least ${MIN_EPISODES} comparable episodes from at least ${MIN_STUDENTS} students. This is a reporting threshold, not statistical significance.`,
      'Each student counts once per group (their episodes are averaged first); the 90% interval resamples students.',
      'Methods are chosen for different learners and situations, so groups are not comparable with each other: compare within a baseline band or objective, and never read the list as a ranking.',
      'One unsuccessful episode, or a group below the threshold, says nothing about whether a method works.',
    ],
  };
}
