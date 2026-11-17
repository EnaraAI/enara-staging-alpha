// toLmsScore (plan §6, Phase 3): turns an ENARA attempt into the number and
// comment an LMS gradebook gets. Pure: no database, no network, so it can be
// unit-tested heavily. Subject-neutral (plan §2.1 rule 9): the comment gets a
// CEFR level and a language-skill breakdown ONLY for a language course; any
// other subject gets its rubric-criterion breakdown (or just the score). The
// comment never contains a student's name or answers: only the score, the
// activity's level and the names of skills or criteria the teacher wrote.
//
// What is sent:
// - a RELEASED final result -> FullyGraded with scoreGiven / scoreMaximum;
// - a result a person still has to grade or release -> PendingManual with no
//   score at all (nothing unreleased ever reaches the LMS);
// - automatic grading still running, an open or abandoned attempt, or a
//   number that is not a valid score -> nothing (null).

export type ScoringPolicy = 'best' | 'latest';
export type GradableKind = 'assessment' | 'practice';
export type ResultState = 'final' | 'pending_manual' | 'grading' | 'none';

export const COMMENT_MAX = 1000;
export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const LANGUAGE_SKILLS = ['reading', 'writing', 'listening', 'speaking', 'grammar', 'vocabulary', 'pronunciation', 'spelling'] as const;

export interface ScoreAnswer {
  questionId: string;
  points?: number | null;
  maxPoints?: number;
  criterionScores?: { criterionId: string; points: number }[];
}

export interface ScoreAttempt {
  id: string;
  status: string;
  assignmentId?: string;
  gradingStatus?: string;
  score?: number;
  totalPoints?: number;
  maxPoints?: number;
  answers?: ScoreAnswer[];
  submittedAt?: Date | null;
  anonymised?: boolean;
}

export interface ScoreQuestion {
  id: string;
  type?: string;
  topic?: string;
  rubric?: { criteria?: { id: string; title?: string; maxPoints?: number }[] };
}

export interface ScoreCourse {
  /** True only for a language course (Curriculum.languageSpec / a language curriculum, or a speaking exam). */
  language: boolean;
  /** The activity's CEFR level, when the course is a language course and one is set. */
  level?: string;
  /** Assignment format; 'english_conversation' is a spoken exam (skill: speaking). */
  format?: string;
}

export interface LmsScore {
  scoreGiven?: number;
  scoreMaximum: number;
  comment: string;
  activityProgress: 'Submitted' | 'Completed';
  gradingProgress: 'FullyGraded' | 'PendingManual';
  levelScheme?: string;
  levelLabel?: string;
}

/** Default scoring policy (plan §6): best for practice, latest for assessments. */
export function defaultPolicy(kind: GradableKind | 'lesson' | undefined): ScoringPolicy {
  return kind === 'practice' ? 'best' : 'latest';
}

export function effectivePolicy(link: { scoringPolicy?: ScoringPolicy; activityKind?: GradableKind | 'lesson' }): ScoringPolicy {
  return link.scoringPolicy ?? defaultPolicy(link.activityKind);
}

const PENDING_MANUAL = new Set(['needs_review', 'graded_draft', 'grading_exception', 'grading_pending', 'finalized']);

/**
 * Where an attempt's result is. Assignment attempts are final only when
 * RELEASED (gradingStatus 'released'; autoGrading.ts and grading.ts set it with
 * releasedAt). A standalone assessment attempt (no assignment, no grading
 * status) is scored by the answer key when it is submitted, so it is final then.
 */
export function resultState(a: Pick<ScoreAttempt, 'status' | 'assignmentId' | 'gradingStatus' | 'anonymised'>): ResultState {
  if (a.status !== 'submitted' || a.anonymised) return 'none';
  if (!a.assignmentId && !a.gradingStatus) return 'final';
  if (a.gradingStatus === 'released') return 'final';
  if (a.gradingStatus && PENDING_MANUAL.has(a.gradingStatus)) return 'pending_manual';
  return 'grading';
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => String(round2(n));

/** The gradebook numbers: points when they are valid, else the percentage out of 100. Null when neither is usable. */
export function scoreNumbers(a: Pick<ScoreAttempt, 'score' | 'totalPoints' | 'maxPoints'>): { given: number; max: number } | null {
  if (finite(a.totalPoints) && finite(a.maxPoints) && a.maxPoints > 0 && a.totalPoints >= 0) {
    return { given: round2(Math.min(a.totalPoints, a.maxPoints)), max: round2(a.maxPoints) };
  }
  if (finite(a.score) && a.score >= 0) return { given: round2(Math.min(a.score, 100)), max: 100 };
  return null;
}

function maximumOnly(a: Pick<ScoreAttempt, 'maxPoints'>): number {
  return finite(a.maxPoints) && a.maxPoints > 0 ? round2(a.maxPoints) : 100;
}

/** Teacher-written labels only; no control characters, short. */
function label(v: string | undefined): string | undefined {
  // eslint-disable-next-line no-control-regex
  const s = (v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, 60) : undefined;
}

function skillOf(q: ScoreQuestion | undefined, course: ScoreCourse): string | undefined {
  if (course.format === 'english_conversation') return 'Speaking';
  const topic = (q?.topic ?? '').toLowerCase();
  const hit = LANGUAGE_SKILLS.find((s) => new RegExp(`(^|[^a-z])${s}([^a-z]|$)`).test(topic));
  return hit ? hit[0].toUpperCase() + hit.slice(1) : undefined;
}

type Tally = Map<string, { got: number; max: number }>;
const add = (t: Tally, key: string, got: number, max: number) => {
  const row = t.get(key) ?? { got: 0, max: 0 };
  row.got += got;
  row.max += max;
  t.set(key, row);
};
const list = (t: Tally) => [...t.entries()].map(([k, v]) => `${k} ${fmt(v.got)}/${fmt(v.max)}`).join(', ');

/** Language courses: points per language skill (from each question's topic; a speaking exam is all Speaking). */
export function skillBreakdown(answers: ScoreAnswer[], questions: ScoreQuestion[], course: ScoreCourse): string {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const t: Tally = new Map();
  for (const a of answers) {
    if (!finite(a.points) || !finite(a.maxPoints) || a.maxPoints <= 0 || a.points < 0) continue;
    const skill = skillOf(byId.get(a.questionId), course);
    if (skill) add(t, skill, Math.min(a.points, a.maxPoints), a.maxPoints);
  }
  return list(t);
}

/** Other subjects: points per rubric criterion (open answers), by the criterion's title. */
export function criterionBreakdown(answers: ScoreAnswer[], questions: ScoreQuestion[]): string {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const t: Tally = new Map();
  for (const a of answers) {
    const criteria = byId.get(a.questionId)?.rubric?.criteria ?? [];
    for (const cs of a.criterionScores ?? []) {
      const c = criteria.find((x) => x.id === cs.criterionId);
      const title = label(c?.title);
      if (!c || !title || !finite(cs.points) || !finite(c.maxPoints) || c.maxPoints <= 0 || cs.points < 0) continue;
      add(t, title, Math.min(cs.points, c.maxPoints), c.maxPoints);
    }
  }
  return list(t);
}

export function clampComment(text: string, max = COMMENT_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function cefrOf(course: ScoreCourse): string | undefined {
  const lvl = course.level?.trim().toUpperCase();
  return course.language && lvl && (CEFR as readonly string[]).includes(lvl) ? lvl : undefined;
}

/**
 * One attempt -> what the LMS gradebook gets, or null when nothing should be
 * sent for it (see the header). The gradebook value is always numeric.
 */
export function toLmsScore(attempt: ScoreAttempt, opts: { questions?: ScoreQuestion[]; course: ScoreCourse }): LmsScore | null {
  const state = resultState(attempt);
  if (state === 'none' || state === 'grading') return null;
  const level = cefrOf(opts.course);
  const levelFields = level ? { levelScheme: 'cefr', levelLabel: level } : {};
  if (state === 'pending_manual') {
    return {
      scoreMaximum: maximumOnly(attempt),
      comment: 'Submitted. Waiting for the teacher to grade or release the result in ENARA.',
      activityProgress: 'Submitted',
      gradingProgress: 'PendingManual',
      ...levelFields,
    };
  }
  const n = scoreNumbers(attempt);
  if (!n) return null;
  const pct = n.max > 0 ? Math.round((n.given / n.max) * 100) : 0;
  const parts = [`Score: ${fmt(n.given)}/${fmt(n.max)} (${pct}%).`];
  const answers = attempt.answers ?? [];
  const questions = opts.questions ?? [];
  if (opts.course.language) {
    if (level) parts.push(`Level: ${level}.`);
    const skills = skillBreakdown(answers, questions, opts.course);
    if (skills) parts.push(`Skills: ${skills}.`);
  } else {
    const criteria = criterionBreakdown(answers, questions);
    if (criteria) parts.push(`Criteria: ${criteria}.`);
  }
  parts.push('Details in ENARA.');
  return {
    scoreGiven: n.given,
    scoreMaximum: n.max,
    comment: clampComment(parts.join(' ')),
    activityProgress: 'Completed',
    gradingProgress: 'FullyGraded',
    ...levelFields,
  };
}

export interface Candidate<T extends ScoreAttempt = ScoreAttempt> {
  attempt: T;
  score: LmsScore | null;
}

const when = (a: ScoreAttempt) => (a.submittedAt ? new Date(a.submittedAt).getTime() : 0);

/**
 * The one result an LMS user's gradebook cell should show for a resource
 * link, by scoring policy:
 * - latest: the most recent submitted attempt. While its automatic grading
 *   runs, nothing is sent (the cell keeps what it had); a pending human grade
 *   is sent as PendingManual.
 * - best: the highest released result (ties: the most recent). Only when no
 *   result is released yet is a pending one sent (PendingManual), so a newer
 *   pending attempt never hides a released best.
 */
export function pickForPolicy<T extends ScoreAttempt>(candidates: Candidate<T>[], policy: ScoringPolicy): Candidate<T> | null {
  const live = candidates.filter((c) => resultState(c.attempt) !== 'none').sort((x, y) => when(y.attempt) - when(x.attempt) || (x.attempt.id < y.attempt.id ? 1 : -1));
  if (!live.length) return null;
  if (policy === 'latest') return live[0].score ? live[0] : null;
  const finals = live.filter((c) => c.score?.gradingProgress === 'FullyGraded' && finite(c.score.scoreGiven) && c.score.scoreMaximum > 0);
  if (finals.length) {
    let best = finals[0];
    for (const c of finals) if (c.score!.scoreGiven! / c.score!.scoreMaximum > best.score!.scoreGiven! / best.score!.scoreMaximum) best = c;
    return best;
  }
  return live.find((c) => c.score?.gradingProgress === 'PendingManual') ?? null;
}
