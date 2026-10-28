// Misconception categories (extensible). Shared by question distractor tags,
// detection rules and teacher review.
export const MISCONCEPTION_CATEGORIES = [
  'conceptual_misunderstanding',
  'procedural_error',
  'calculation_error',
  'prerequisite_gap',
  'misinterpretation',
  'incomplete_reasoning',
  'unknown',
] as const;
export type MisconceptionCategory = (typeof MISCONCEPTION_CATEGORIES)[number];
