// Misconception categories (extensible). Shared by question distractor tags,
// detection rules and teacher review.
export const MISCONCEPTION_CATEGORIES = [
  'conceptual_misunderstanding',
  'procedural_error',
  'calculation_error',
  'prerequisite_gap',
  'misinterpretation',
  'incomplete_reasoning',
  // planner2: an error carried over from Arabic (copula or article left out, subject repeated, ...).
  'l1_transfer',
  'unknown',
] as const;
export type MisconceptionCategory = (typeof MISCONCEPTION_CATEGORIES)[number];
