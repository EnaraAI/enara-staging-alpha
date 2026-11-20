// planner2: the lesson planner as a rule table (approved 19 Nov 2026, docs/tutor/PLANNER_METHODS_TABLE.md on claude/tutor-esl-methods).
//
// Code decides; the model only writes the reply. Two levels, each with one owner:
//   1. SHAPE_RULES pick the lesson shape once per lesson from learner signals (first matching row wins).
//   2. The ped-v2 main-method rule table (pedagogyPolicy METHOD_RULES) picks the method, but a method with no stage in that
//      shape, or outside its approved age/level, is skipped and the next row applies. Per-turn language moves stay with the
//      language engine and run inside the stage.
// Pure: no AI call, no database. Every decision carries the shape row, the method row, the skipped choices and a plain sentence.
// Behind ENARA_ENGINE_V2=planner2; off = ped-v2 unchanged.

import { engineV2 } from './engineV2';
import { planWithTrace, type MethodPick, type MethodRule, type PlanInput, type TeachingPlan } from './pedagogyPolicy';
import { STRATEGY_BY_ID, validateComposition } from './strategyRegistry';

export const PLANNER_VERSION = 'planner2-v8';

export type LessonShape = 'PPP' | 'TTT' | 'TASK' | 'LAD';
export type Stage =
  | 'present' | 'practise' | 'produce' | 'check' // PPP
  | 'test' | 'teach' | 'retest' // TTT
  | 'pretask' | 'task' | 'focus' | 'repeat' // TASK
  | 'listen' | 'do' | 'chant' // LAD (+ check)
  | 'done'; // planner2b: goal reached on evidence (any shape)
export type Goal = 'work' | 'exam' | 'daily' | 'school';
export type PlannerAgeBand = 'child' | 'teen' | 'adult' | 'unknown';

export const SHAPE_STAGES: Record<LessonShape, Stage[]> = {
  PPP: ['present', 'practise', 'produce', 'check', 'done'],
  TTT: ['test', 'teach', 'retest', 'done'],
  TASK: ['pretask', 'task', 'focus', 'repeat', 'done'],
  LAD: ['listen', 'do', 'chant', 'check', 'done'],
};
export const SHAPE_NAMES: Record<LessonShape, string> = {
  PPP: 'present, practise, produce',
  TTT: 'test, teach, test',
  TASK: 'task-based',
  LAD: 'listen and do',
};
export const STAGE_WORDS: Record<Stage, string> = {
  present: 'Present: show the form with a clear example',
  practise: 'Practise: controlled items, one at a time',
  produce: 'Produce: the learner makes their own sentence',
  check: 'Check: a short independent check',
  test: 'Test: three quick items before any teaching',
  teach: 'Teach the gaps: only what the test showed is missing',
  retest: 'Test again: new items on the same form',
  // fix B (owner "yes", 20 Nov): the pre-task gives one model sentence of the target form in the task's setting (task-based "useful language").
  pretask: 'Pre-task: set the scene and the goal, give ONE short model sentence that uses the target form in this setting, then set the task',
  task: 'Task: a short role-play with a real goal',
  focus: 'Language focus: fix one or two errors from the task',
  repeat: 'Repeat the task, using the fix',
  listen: 'Listen: a short story or chant with the words',
  do: 'Do: tap, point or say after a spoken instruction',
  chant: 'Chant again together',
  done: 'Goal reached: one-line recap, then one new, slightly harder situation to use the same point (no new rule)',
};

/** Learner signals for the planner. All come from code (records, settings); none from the model. Missing = unknown. */
export interface PlannerSignals {
  ageBand: PlannerAgeBand;
  /** Whole years, only from a staff-entered birth date. */
  ageYears?: number;
  /** Course CEFR level label, e.g. "Pre-A1", "A2 Elementary", "B1". */
  level?: string;
  goal?: Goal;
  quickCheck?: { right: number; of: number };
  /** The lesson's 3-item quick check is still running (teen/adult; set by quickCheckSignals). */
  quickCheckPending?: boolean;
  sessionNumber?: number;
  earlierErrors?: boolean;
  reviewDue?: boolean;
  /** planner2b: listen-and-do content (kids pack lesson) exists for this objective; LAD runs only then. */
  ladContent?: boolean;
  /** switchMove (LIT_REVIEW_GAP_PLAN 3.3): how often this session's most repeated error code was seen (2+ = the same error repeats). */
  repeatedError?: { code: string; count: number };
}

// ---------------------------------------------------------------------------
// Levels

const LEVEL_RANK: Record<string, number> = { 'pre-a1': 0, a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6 };
/** CEFR rank from a label (0 = Pre-A1 ... 6 = C2); undefined when there is no recognisable label. */
export function levelRank(level?: string): number | undefined {
  const m = /\b(pre-?a1|a1|a2|b1|b2|c1|c2)\b/i.exec(level ?? '');
  return m ? LEVEL_RANK[m[1].toLowerCase().replace('prea1', 'pre-a1')] : undefined;
}
const RANK: Record<string, number> = { not_assessed: 0, emerging: 1, developing: 2, proficient: 3, mastered: 4 };

// ---------------------------------------------------------------------------
// 1. Shape rules (S1-S6). S1 is not exclusive: it adds the review opener, then S2-S6 pick the shape.

export interface ShapeRow {
  id: string;
  shape: LessonShape;
  childSupports?: boolean;
  when: string; // plain words, for the explanation and the docs
  test: (s: PlannerSignals, mastery: string) => boolean;
}

const teenOrAdult = (s: PlannerSignals) => s.ageBand === 'teen' || s.ageBand === 'adult';
export const SHAPE_RULES: ShapeRow[] = [
  { id: 'S2a', shape: 'LAD', when: 'level Pre-A1, with listen-and-do content', test: (s) => levelRank(s.level) === 0 && Boolean(s.ladContent) },
  { id: 'S2b', shape: 'LAD', childSupports: true, when: 'a child under 9, with listen-and-do content', test: (s) => s.ageBand === 'child' && s.ageYears !== undefined && s.ageYears < 9 && Boolean(s.ladContent) },
  { id: 'S2c', shape: 'PPP', childSupports: true, when: 'a child (9-12, unknown exact age, or under 9 without listen-and-do content)', test: (s) => s.ageBand === 'child' },
  {
    id: 'S3', shape: 'TASK', when: 'B1 or above, partly secure or better, with a real-life goal',
    test: (s, m) => teenOrAdult(s) && (levelRank(s.level) ?? -1) >= 3 && RANK[m] >= 2 && (s.goal === 'work' || s.goal === 'exam' || s.goal === 'daily'),
  },
  { id: 'S4q', shape: 'TTT', when: 'a 3-item quick check opens the lesson', test: (s) => teenOrAdult(s) && Boolean(s.quickCheckPending) },
  { id: 'S4', shape: 'TTT', when: 'the quick check showed at least 2 of 3 known', test: (s) => teenOrAdult(s) && !!s.quickCheck && s.quickCheck.of > 0 && s.quickCheck.right * 3 >= s.quickCheck.of * 2 },
  { id: 'S5', shape: 'PPP', when: 'new to the form, or no quick check yet', test: (s) => teenOrAdult(s) },
  { id: 'S6', shape: 'PPP', when: 'age not known', test: () => true },
];

/** S1: a review opener before the lesson (a later session with earlier errors, or a review due). */
export const reviewOpener = (s: PlannerSignals, input?: Pick<PlanInput, 'reviewOpening' | 'retention'>): boolean =>
  Boolean(((s.sessionNumber ?? 1) >= 2 && s.earlierErrors) || s.reviewDue || input?.reviewOpening || input?.retention?.due);

export function chooseShape(s: PlannerSignals, mastery: string): ShapeRow {
  return SHAPE_RULES.find((r) => r.test(s, mastery))!;
}

// ---------------------------------------------------------------------------
// 2. The method table: where each of the 23 methods (and the 5 techniques) may be the MAIN method, and the approved
// age and level gates. Supporting and reinforcement methods go with the main method's stage; they are filtered by the
// age and level gates only. A gate marked ★ in the approved table is new; the rest describe today's rules.

export interface MethodRow {
  /** Stages where it may be the main method, per shape. Absent shape = not a main method there. */
  main: Partial<Record<LessonShape, Stage[]>>;
  /** ★ lowest CEFR rank where it may be used at all (main or support). */
  minLevel?: number;
  /** ★ only when a teacher assigns it. */
  teacherOnly?: boolean;
  /** Lowest age in years (only applied when the age is known). */
  minAge?: number;
}
const ALL_PPP: Stage[] = ['present', 'practise', 'produce', 'check'];
export const METHOD_TABLE: Record<string, MethodRow> = {
  direct_instruction: { main: { PPP: ['present'], TTT: ['teach'] } },
  socratic_questioning: { main: { TASK: ['focus'] } },
  scaffolding: { main: { PPP: ['practise'], LAD: ['do'] } },
  mastery_learning: { main: { PPP: ['check'], TTT: ['retest'] } },
  inquiry_based: { main: {} }, // support only (TASK pre-task)
  problem_based: { main: { TASK: ['task'] } },
  case_based: { main: { TASK: ['task'] }, minLevel: 4 }, // ★ B2+
  project_based: { main: { TASK: ['task'] }, teacherOnly: true }, // ★ teacher-assigned only
  retrieval_practice: { main: { PPP: ['check'], TTT: ['test'], LAD: ['check'] } }, // also the review opener in every shape
  spaced_repetition: { main: {} }, // scheduler / reinforcement
  interleaving: { main: {}, minAge: 9 },
  worked_example: { main: { PPP: ['present'], TTT: ['teach'] } },
  elaborative_interrogation: { main: {}, minLevel: 3 }, // ★ B1+
  analogy: { main: { PPP: ['present'] } },
  metacognitive: { main: { PPP: ['check'] }, minLevel: 2 }, // ★ A2+
  think_aloud: { main: {} },
  concept_mapping: { main: {}, minLevel: 3 }, // ★ B1+
  differentiated_instruction: { main: {} },
  adaptive_pathways: { main: {} },
  formative_feedback: { main: { PPP: ALL_PPP, TTT: ['test', 'retest'], TASK: ['focus'], LAD: ['check'] } },
  gamification: { main: {} },
  narrative_contextual: { main: {} },
  blooms_guided: { main: { TASK: ['focus'], PPP: ['produce'] } },
  // techniques
  prerequisite_remediation: { main: { PPP: ['present'], TTT: ['teach'], TASK: ['pretask'], LAD: ['listen'] } },
  guided_practice: { main: { PPP: ['practise'] } },
  independent_practice: { main: { PPP: ['produce'], TTT: ['retest'] } },
  error_analysis: { main: { PPP: ['practise'] } },
  visual_explanation: { main: { PPP: ['present'], LAD: ['listen'] } },
};

/** Age and level gates (★), for any role. Unknown level or age = no gate (today's behaviour). */
export function methodGateOk(id: string, s: PlannerSignals, teacherId?: string): boolean {
  const row = METHOD_TABLE[id];
  if (!row) return true;
  if (row.teacherOnly && teacherId !== id) return false;
  const lr = levelRank(s.level);
  if (row.minLevel !== undefined && lr !== undefined && lr < row.minLevel) return false;
  if (row.minAge !== undefined && s.ageYears !== undefined && s.ageYears < row.minAge) return false;
  return true;
}

/** May this method be the main method in this shape for this learner? (A teacher's choice always may.) */
export function allowedMain(id: string, shape: LessonShape, s: PlannerSignals, teacherId?: string): boolean {
  if (teacherId && id === teacherId) return true;
  const row = METHOD_TABLE[id];
  if (!row) return false;
  return (row.main[shape]?.length ?? 0) > 0 && methodGateOk(id, s, teacherId);
}

/** The stage a main method starts in, for this shape. */
export function stageFor(id: string, shape: LessonShape): Stage {
  return METHOD_TABLE[id]?.main[shape]?.[0] ?? SHAPE_STAGES[shape][0];
}

// ---------------------------------------------------------------------------
// planner2-only rows, each placed before a ped-v2 row: the Arabic-transfer rule before the other error rules, the TASK rules
// before the by-mastery default (so a teacher's choice, a prerequisite, a review and the evidence-based switch still come first).

const isMastered = (input: PlanInput) => input.masteryStatus === 'mastered' && !input.retention?.due;
export function plannerRules(s: PlannerSignals, shape: LessonShape): Record<string, MethodRule[]> {
  const [l1, ...task]: MethodRule[] = [
    {
      // ★ For ESL: an error carried over from Arabic -> an English-Arabic contrast (analogical reasoning).
      id: 'P1_L1_CONTRAST',
      pick: ({ input }) => (input.misconceptions.some((m) => m.category === 'l1_transfer')
        ? { primary: 'analogy', supporting: ['worked_example'], reasons: ['L1_TRANSFER_CONTRAST'], gap: 'An error carried over from Arabic: contrast the two languages.' } : undefined),
    },
    {
      // ★ TASK shape, mastered, exam or work at B2+ -> case-based.
      id: 'P2_TASK_CASE',
      pick: ({ input }) => (shape === 'TASK' && isMastered(input) && (s.goal === 'exam' || s.goal === 'work') && (levelRank(s.level) ?? 0) >= 4 && (input.gradeLevel ?? 99) >= 9
        ? { primary: 'case_based', supporting: ['socratic_questioning'], reasons: ['TASK_GOAL_CASE'], gap: 'Mastered; extend to a realistic case for the learner\'s goal.' } : undefined),
    },
    {
      // ★ TASK shape, mastered, work or daily life -> problem-based (today: applied subjects only).
      id: 'P3_TASK_PROBLEM',
      pick: ({ input }) => (shape === 'TASK' && isMastered(input) && (s.goal === 'work' || s.goal === 'daily') && (input.gradeLevel ?? 99) >= 7
        ? { primary: 'problem_based', supporting: [], reasons: ['TASK_GOAL_PROBLEM'], gap: 'Mastered; extend to a real-life problem for the learner\'s goal.' } : undefined),
    },
  ];
  return { M7a_CONCEPTUAL: [l1], M10_BY_MASTERY: task };
}

/** The shape's own default main method, used when every row's choice has no stage in the shape. */
const SHAPE_DEFAULT: Record<LessonShape, MethodPick> = {
  PPP: { primary: 'direct_instruction', supporting: ['worked_example'], reasons: ['SHAPE_DEFAULT'], gap: 'Explicit instruction with an example.' },
  TTT: { primary: 'formative_feedback', supporting: [], reasons: ['SHAPE_DEFAULT'], gap: 'Test first, then teach only what is missing.' },
  TASK: { primary: 'formative_feedback', supporting: [], reasons: ['SHAPE_DEFAULT'], gap: 'Do the task, then feedback on one or two language errors.' },
  LAD: { primary: 'scaffolding', supporting: [], reasons: ['SHAPE_DEFAULT'], gap: 'Listen and do, with step-by-step support.' },
};

// ---------------------------------------------------------------------------

export interface LessonPlan {
  plannerVersion: string;
  shape: LessonShape;
  shapeRule: string;
  stages: Stage[];
  opener: boolean;
  startStage: Stage;
  methodStage: Stage;
  /** A quick check opened this lesson (teen/adult eligible); only then do the test answers not count as practice. */
  quickCheckUsed: boolean;
  childSupports: boolean;
  methodRule: string;
  skipped: string[];
  plan: TeachingPlan;
  /** One plain sentence for teachers and parents. */
  explanation: string;
}

/** switchMove: the methods tried in turn when one error keeps coming back. */
export const SWITCH_ORDER = ['analogy', 'scaffolding', 'worked_example'];
export function planLesson(input: PlanInput, s: PlannerSignals): LessonPlan {
  const mastery = input.masteryStatus ?? 'not_assessed';
  const row = chooseShape(s, mastery);
  const shape = row.shape;
  const opener = reviewOpener(s, input);
  const teacher = input.teacherStrategyId;
  const traced = planWithTrace(
    input,
    {
      insertBefore: plannerRules(s, shape),
      allowPrimary: (id) => (opener && id === 'retrieval_practice') || allowedMain(id, shape, s, teacher),
      fallback: SHAPE_DEFAULT[shape],
    },
  );
  const plan = { ...traced.plan, supporting: [...traced.plan.supporting], modifiers: [...traced.plan.modifiers], reasonCodes: [...traced.plan.reasonCodes] };

  // switchMove (LIT_REVIEW_GAP_PLAN 3.3, owner "go" 20 Nov 2026): the same error code seen twice or more in this session changes the main
  // method each further time (contrast -> smaller steps -> worked example), instead of repeating the move that did not work.
  if (engineV2('switchMove') && s.repeatedError && s.repeatedError.count >= 2) {
    const order = SWITCH_ORDER.filter((id) => allowedMain(id, shape, s, teacher));
    const pick = order.length ? order[(s.repeatedError.count - 2) % order.length] : undefined;
    if (pick && pick !== plan.primary) {
      plan.supporting = plan.supporting.filter((id) => id !== pick);
      plan.primary = pick;
      plan.reasonCodes.push(`SWITCH_MOVE:${s.repeatedError.code}:${s.repeatedError.count}`);
    }
  }
  // ★ age and level gates on supporting and reinforcement methods
  const dropped: string[] = [];
  plan.supporting = plan.supporting.filter((id) => methodGateOk(id, s, teacher) || (dropped.push(id), false));
  if (plan.reinforcement && !methodGateOk(plan.reinforcement, s, teacher)) {
    dropped.push(plan.reinforcement);
    plan.reinforcement = undefined;
  }
  if (dropped.length) plan.reasonCodes.push(`GATED:${dropped.join('+')}`);

  // ★ child supports (S2b, S2c, and a child at Pre-A1): scaffolding always on, plus a story or game frame (at most two supporting methods;
  // the frame follows today's M7 choice: a game for practice-type main methods, otherwise a story). Short replies come
  // from the child prompt line and the language engine's child length band.
  const childSupports = Boolean(row.childSupports) || s.ageBand === 'child';
  if (childSupports) {
    const practiceType = ['retrieval_practice', 'guided_practice', 'mastery_learning', 'independent_practice', 'spaced_repetition'].includes(plan.primary);
    const frame = shape === 'LAD' || !practiceType ? 'narrative_contextual' : 'gamification';
    const want = ['scaffolding', frame].filter((id) => id !== plan.primary);
    const rest = plan.supporting.filter((id) => !want.includes(id) && id !== 'gamification' && id !== 'narrative_contextual');
    plan.supporting = [...want, ...rest].slice(0, 2);
    plan.reasonCodes.push('CHILD_SUPPORTS');
  }
  // Keep the composition valid (registry rules): drop the last supporting method, then the reinforcement.
  for (let guard = 0; guard < 4 && validateComposition(plan).length; guard++) {
    if (plan.supporting.length > (childSupports ? 1 : 0)) plan.supporting.pop();
    else if (plan.reinforcement) plan.reinforcement = undefined;
    else plan.supporting.pop();
  }
  plan.reasonCodes.push(`SHAPE:${shape}:${row.id}`, `RULE:${traced.ruleId}`);
  if (opener) plan.reasonCodes.push('OPENER:S1');

  // Every lesson starts at the shape's first stage; code moves it on (stageMachine). methodStage = where the main method acts.
  const startStage = SHAPE_STAGES[shape][0];
  const methodStage = stageFor(plan.primary, shape);
  const method = STRATEGY_BY_ID.get(plan.primary)?.name ?? plan.primary;
  const explanation = `${opener ? 'Starts with a short review, then ' : ''}${SHAPE_NAMES[shape]} because ${row.when}; main method ${method} because: ${plan.gap.replace(/\.$/, '')}.`;
  return {
    plannerVersion: PLANNER_VERSION,
    shape,
    shapeRule: row.id,
    stages: SHAPE_STAGES[shape],
    opener,
    startStage,
    methodStage,
    quickCheckUsed: Boolean(s.quickCheck || s.quickCheckPending),
    childSupports,
    methodRule: traced.ruleId,
    skipped: traced.skipped,
    plan,
    explanation: explanation.charAt(0).toUpperCase() + explanation.slice(1),
  };
}

/** One learner message, as graded by code: right, wrong (wrong verdict or a diagnosed error), or not gradable. */
export type Ev = 'ok' | 'bad' | 'none';
export interface StageProgress { events?: Ev[]; quickCheck?: { right: number; of: number }; tries: number; right: number; ownSentenceDone?: boolean; taskDone?: boolean; triesAfterTest?: number; rightAfterTest?: number; rightAfterTask?: number; learnerTurns?: number; opened?: boolean }
/** pln2 amendment C: the quick check is ONE item, decided on the learner's answer in the very next turn (graded by code then). */
export const QUICK_CHECK_ITEMS = 1;
/** It closes once the learner has answered it, even if that answer could not be graded (then: PPP). */
export const QUICK_CHECK_MAX_TURNS = 1;
/** TASK: the learner's opening message plus 2 role-play answers, then the language focus. */
export const TASK_TURNS = 3;
/** TASK: this many wrong learner messages in a row inside the task end it early and go to the language focus (planner2c). */
export const TASK_BAD_RUN = 2;
/** LAD (planner2k): the do step gives this many one-action commands, then the chant (a child's tap or point cannot be graded by code); the check stays evidence-based. */
export const LAD_DO_TURNS = 3;
type HistoryLike = { role: string; content?: string; languageTurn?: unknown };
const sameText = (a?: string, b?: string) => { const n = (x?: string) => (x ?? '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); return Boolean(n(a)) && n(a) === n(b); };
/** Progress in this lesson from the stored language-turn evidence (code-graded verdicts; never the model's own claim). */
export function progressFromHistory(history: HistoryLike[], current?: { verdict?: string | null; message?: string }): StageProgress {
  let tries = 0;
  let right = 0;
  let rightAfterTest = 0;
  let triesAfterTest = 0;
  let ownSentenceDone = false;
  let firstThreeRight = 0;
  let learnerTurns = 0;
  let rightAfterTask = 0;
  const events: Ev[] = [];
  for (const t of history) {
    if (t.role === 'user') { learnerTurns++; events.push('none'); continue; }
    if (t.role !== 'assistant' || !t.languageTurn || typeof t.languageTurn !== 'object') continue;
    const lt = t.languageTurn as { assessment?: { verdict?: string }; ownSentence?: string; diagnosis?: string };
    {
      const v0 = lt.assessment?.verdict;
      const e: Ev = v0 === 'CORRECT' || v0 === 'CORRECT_WITH_EQUIVALENT_FORMULATION' ? 'ok' : v0 === 'INCORRECT' || v0 === 'PARTIALLY_CORRECT' || lt.diagnosis ? 'bad' : 'none';
      if (events.length) events[events.length - 1] = e; // the reply grades the learner message before it
    }
    const v = lt.assessment?.verdict;
    const ok = v === 'CORRECT' || v === 'CORRECT_WITH_EQUIVALENT_FORMULATION';
    const bad = v === 'INCORRECT' || v === 'PARTIALLY_CORRECT';
    if (ok || bad) {
      if (tries < QUICK_CHECK_ITEMS && ok) firstThreeRight++;
      if (tries >= QUICK_CHECK_ITEMS) { triesAfterTest++; if (ok) rightAfterTest++; }
      tries++;
      if (ok) right++;
      if (ok && learnerTurns > TASK_TURNS) rightAfterTask++;
    }
    if (lt.ownSentence === 'feedback') ownSentenceDone = true;
  }
  // The quick check ends at 3 graded answers, or at QUICK_CHECK_MAX_TURNS learner answers with whatever was graded (an answer the
  // engine cannot grade must not keep the learner in the no-teaching check). 0 graded -> PPP (S5).
  // The answer just given, graded by code in this turn (keyVerdict): counted now, not one reply later (pln2 amendment C).
  const cv = current?.verdict;
  // planner2c: a free answer (no course key, e.g. a task sentence) is graded only after the reply. If the learner sends again the very
  // message that was already graded wrong, that is evidence now: count it as wrong in this turn (PLN2c: the repeat came one reply late).
  const lastUser = [...history].reverse().find((t) => t.role === 'user');
  const repeatWrong = !cv && events.length > 0 && events[events.length - 1] === 'bad' && sameText(current?.message, lastUser?.content);
  events.push(cv === 'CORRECT' || cv === 'CORRECT_WITH_EQUIVALENT_FORMULATION' ? 'ok' : cv === 'INCORRECT' || cv === 'PARTIALLY_CORRECT' || repeatWrong ? 'bad' : 'none');
  if (cv === 'CORRECT' || cv === 'CORRECT_WITH_EQUIVALENT_FORMULATION' || cv === 'INCORRECT' || cv === 'PARTIALLY_CORRECT') {
    const ok = cv === 'CORRECT' || cv === 'CORRECT_WITH_EQUIVALENT_FORMULATION';
    if (tries < QUICK_CHECK_ITEMS && ok) firstThreeRight++;
    if (tries >= QUICK_CHECK_ITEMS) { triesAfterTest++; if (ok) rightAfterTest++; }
    tries++;
    if (ok) right++;
  }
  const qcDone2 = tries >= QUICK_CHECK_ITEMS || learnerTurns >= QUICK_CHECK_MAX_TURNS;
  return {
    ...(qcDone2 ? { quickCheck: { right: firstThreeRight, of: Math.min(tries, QUICK_CHECK_ITEMS) } } : {}),
    events, tries, right, ownSentenceDone, triesAfterTest, rightAfterTest, learnerTurns,
    taskDone: learnerTurns > TASK_TURNS, rightAfterTask,
    opened: history.some((t) => t.role === 'assistant'),
  };
}

/** Quick-check signals (planner2): a teen or adult lesson (not Pre-A1, no review opener) opens with ONE check item (amendment C).
 *  Until the learner answers it the check is pending; then its result decides TTT (right) or PPP (wrong or ungraded). Without turn history there is no check. */
export function quickCheckSignals(s: PlannerSignals, progress: StageProgress | undefined, opener: boolean): Pick<PlannerSignals, 'quickCheck' | 'quickCheckPending'> {
  if (!progress || opener || !(s.ageBand === 'teen' || s.ageBand === 'adult') || levelRank(s.level) === 0) return {};
  return progress.quickCheck ? { quickCheck: progress.quickCheck } : { quickCheckPending: true };
}

/**
 * planner2b: the stage for this reply, from the graded learner messages (ev[0] = the learner's opening message). The core rule:
 * a lesson moves on only on evidence, and an error sends it back to teaching that gap. Never on turn count.
 *  PPP: present (opening) -> practise until 2 right in a row -> produce (one own sentence) -> check (ONE item):
 *       right -> done; wrong -> practise that gap until 1 right -> check again.
 *  LAD: listen -> do until 2 right in a row -> chant (one reply) -> check, as PPP (wrong -> do).
 *  TTT: test (the quick check) -> teach until 1 right -> retest: right -> done; wrong -> teach.
 *  TASK: pretask -> task (the opening plus 2 role-play answers) -> errors in the task ? focus : done;
 *        focus until the fix is right -> repeat (at most once) -> an error -> focus -> done; no error -> done.
 */
export function stageMachine(shape: LessonShape, ev: Ev[]): Stage {
  if (shape === 'TTT') {
    let st: Stage = 'test';
    for (let k = 1; k < ev.length; k++) {
      const e = ev[k];
      if (st === 'test') { st = 'teach'; continue; } // the check answer decided the shape; teaching starts now
      if (st === 'teach' && e === 'ok') st = 'retest';
      else if (st === 'retest') st = e === 'ok' ? 'done' : e === 'bad' ? 'teach' : 'retest';
    }
    return st;
  }
  if (shape === 'TASK') {
    let st: Stage = 'pretask'; let taskTurns = 0; let errs = false; let repeated = false; let badRun = 0;
    for (let k = 1; k < ev.length; k++) {
      const e = ev[k];
      if (st === 'pretask') st = 'task';
      if (st === 'task') {
        taskTurns++; if (e === 'bad') errs = true;
        badRun = e === 'bad' ? badRun + 1 : 0;
        // planner2c: the same learner wrong twice in a row inside the task -> stop the task and teach now (PLN2b stuck learner s2001).
        if (badRun >= TASK_BAD_RUN || taskTurns >= TASK_TURNS) st = errs ? 'focus' : 'done';
        continue;
      }
      if (st === 'focus') { if (e === 'ok') st = repeated ? 'done' : 'repeat'; continue; }
      if (st === 'repeat') { repeated = true; st = e === 'bad' ? 'focus' : 'done'; continue; }
    }
    return st;
  }
  const L = shape === 'LAD';
  let st: Stage = L ? 'listen' : 'present'; let streak = 0; let need = 2; let doTurns = 0;
  for (let k = 1; k < ev.length; k++) {
    const e = ev[k];
    if (st === 'done') continue;
    if (st === 'present' || st === 'listen') { st = L ? 'do' : 'practise'; doTurns = 0; }
    else if (st === 'produce' || st === 'chant') { st = 'check'; continue; }
    else if (st === 'check') {
      if (e === 'ok') st = 'done';
      else if (e === 'bad') { st = L ? 'do' : 'practise'; need = 1; streak = 0; doTurns = 0; }
      continue;
    }
    if (e === 'ok') streak++; else if (e === 'bad') streak = 0;
    if (L && st === 'do') doTurns++;
    if (streak >= need || (L && st === 'do' && doTurns >= (need === 1 ? 2 : LAD_DO_TURNS))) { st = need === 1 ? 'check' : L ? 'chant' : 'produce'; streak = 0; doTurns = 0; }
  }
  return st;
}

/** The stage for this turn: the quick check while pending; after it, TTT continues from the check answer and PPP starts its own
 *  opening on the reply to the check answer (the check's item is not practice). */
export function stageNow(lp: LessonPlan, progress: StageProgress): Stage {
  if (lp.shapeRule === 'S4q') return 'test';
  const ev = progress.events ?? ['none'];
  if (lp.shape === 'PPP' && lp.quickCheckUsed && progress.quickCheck) return stageMachine('PPP', ev.slice(1));
  return stageMachine(lp.shape, ev);
}

/** During the quick check the teaching method is not used: this line replaces the method's instructions. */
export const QUICK_CHECK_PLAN_LINE = '- Teaching method: none in this opening reply (a one-item quick check); the method for this lesson starts in the next reply.';
export const quickCheckActive = (lp: LessonPlan | undefined): boolean => lp?.shapeRule === 'S4q';

/** Prompt lines for the chosen shape and stage (the model writes the reply inside them). Without a stage (no turn history,
 *  e.g. a voice call), the lesson starts at the first stage and the model is told the order only. */
export function shapeLines(lp: LessonPlan, stage?: Stage): string[] {
  return [
    `- Lesson shape: ${SHAPE_NAMES[lp.shape]} (${lp.stages.map((x) => STAGE_WORDS[x].split(':')[0]).join(' → ')}).${lp.opener ? ' First a short review from memory of earlier points.' : ''}`,
    lp.shapeRule === 'S4q'
      ? '- This turn\'s stage: Quick check (one short exercise before any teaching; the system grades the answer and then picks the lesson shape).'
      : stage
      ? `- This turn's stage: ${STAGE_WORDS[stage]}. Stay in this stage; the system moves the stage on.`
      : `- Start with: ${STAGE_WORDS[lp.startStage]}; go on to the next stage only after the learner succeeds.`,
    '- Never ask the learner their age or birth date.',
    ...(lp.childSupports ? ['- Child learner: very short sentences, one instruction at a time, praise effort, a small game or story frame. Accept any correct word or sentence that fits, even one that is not in the lesson list (for example "wife" for a family word): say it is right and move on. Do not add the lesson word after a right answer.'] : []),
    ...(lp.plan.supporting.includes('elaborative_interrogation') ? ['- If you ask "why", the learner may answer in Arabic.'] : []),
    ...(lp.methodRule === 'P1_L1_CONTRAST' ? ['- Contrast the English form with how Arabic says it, in one short line.'] : []),
  ];
}
