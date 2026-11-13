// ENARA Deep Learning Simulation v2: 48-outcome English-learning benchmark schema.
// Dependency-free on purpose (plain TypeScript, Node built-ins only).

export const AREAS = ['grammar', 'vocabulary', 'reading', 'writing', 'functional', 'listening'] as const;
export type Area = (typeof AREAS)[number];
export type Stage = 'pre' | 'post' | 'transfer' | 'delayed';
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2';

// Deterministic answer-key scoring: correct when the normalised answer contains an accepted phrase
// as a whole phrase (mode 'contains', default) or equals one (mode 'exact'); a hedged answer
// (contains "or" or two question marks) is wrong; any `forbidden` regex match makes it wrong.
export interface ScoringKey { type: 'key'; accepted: string[]; mode?: 'contains' | 'exact'; forbidden?: string[] }

// Deterministic rubric scoring for open responses (writing): each check is a regex / length test.
export interface RubricCheck {
  id: string;
  description: string;
  required: boolean;
  check: { kind: 'regex'; pattern: string; flags?: string } | { kind: 'notRegex'; pattern: string; flags?: string } | { kind: 'minWords'; n: number } | { kind: 'maxWords'; n: number };
}
export interface ScoringRubric { type: 'rubric'; checks: RubricCheck[]; passFraction?: number }

export interface AssessmentItem {
  id: string;
  stage: Stage;
  prompt: string;
  // A passage, text or dialogue shown together with the prompt (reading and listening outcomes).
  material?: string;
  scoring: ScoringKey | ScoringRubric;
  // Example answers used by the scoring tests: every `right` must score correct, every `wrong` incorrect.
  right: string[];
  wrong: string[];
  // The misconception this item can reveal, when a wrong answer is diagnostic of it.
  misconceptionId?: string;
}

export interface Misconception { id: string; description: string; exampleWrong: string }

// The lesson ENARA teaches (the tutor sees this and nothing from the assessment).
export interface PracticeItem { id: string; prompt: string; material?: string; acceptedAnswers: string[]; targetForms?: string[]; criteria: number[] }
export interface LessonSpec {
  title: string;
  objective: string;
  spec: { objectives: string[]; successCriteria: string[]; vocabulary: string[]; grammar: string[]; functions: string[]; skills: string[]; examples: string[]; items: PracticeItem[] };
}

export interface Outcome {
  id: string;                      // GR-01 .. LS-08
  area: Area;
  title: string;
  objective: string;
  prerequisites: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;   // classification set by the author before any run
  cefr: Cefr;
  // Listening outcomes are TEXT-BASED dialogue comprehension, never genuine audio listening.
  modality: 'text' | 'text_dialogue';
  audioListening: false;
  misconceptions: Misconception[]; // 2 or more, with a wrong example each
  teachingSuccessCriteria: string[];
  // Outcome-specific mastery, defined before testing: share of post items and transfer items that must be correct.
  mastery: { postMinCorrect: number; transferMinCorrect: number };
  lesson: LessonSpec;
  studyNotes: string;              // condition B reading material (at most 200 words)
  scriptedTutor: { explanation: string; hints: string[]; correctFeedback: string; incorrectFeedback: string; closing: string };
  prereqProbe: AssessmentItem;     // one pre-stage item that measures the prerequisite
  items: { pre: AssessmentItem[]; post: AssessmentItem[]; transfer: AssessmentItem[]; delayed: AssessmentItem[] };
}

export const ITEM_COUNTS: Record<Stage, number> = { pre: 2, post: 2, transfer: 2, delayed: 4 };
export const AREA_PREFIX: Record<Area, string> = { grammar: 'GR', vocabulary: 'VO', reading: 'RD', writing: 'WR', functional: 'FN', listening: 'LS' };
