# graderV2 — usage map and fixes (DRAFT) — user-authorised
Repo /home/user/enara-staging-alpha. No API calls, no git commands, no sub-agents, never print secrets. Do not change tutor behaviour beyond what graderV2 ON does.
Read: research/assessment-validation/a1a2/REPORT.md (the five recommended fixes), docs/GRADER_VALIDATION_A1A2.md, docs/GRADING_FOR_OUTCOMES.md, docs/SCORING_RUBRIC.md, and the grader code (backend/src/services/grading.ts, autoGrading.ts, gradingProposals.ts, languageLearningState.ts, assessmentSecurity.ts, assessment/placementEngine.ts, and anything else that calls gradeAnswer / evaluateAgainstKey / the eval-v2 model path).

PART 1 (before changing code): write docs/GRADER_USAGE_MAP.md, headed "SIMULATION ONLY · DRAFT". List every call site of gradeAnswer, evaluateAgainstKey and the eval-v2 model path (short-answer meaning check, rubric grading) with file:line, and the flow it serves: in-lesson exercises, assignments, assessments, placement, other. For each of the 5 fixes, list which flows change when graderV2 is ON. Note that lesson learners are affected, not only tests.

PART 2: one switch named `graderV2`, default OFF. Follow how existing feature switches are configured in the backend (find them); if none fits, add a single config/env flag read in one place. With OFF, output identical to today's on every path. With ON:
1. Normalised matching: case-insensitive, except where the item's matchingNote says case- or punctuation-sensitive (e.g. capitals-full-stops, days-months); final punctuation; extra spaces; curly vs straight apostrophes and quotes; contraction variants both ways (can't/cannot/can not, don't/do not, I'm/I am, it's/it is, ...).
2. Multiple accepted answers everywhere, including the assignment grader.
3. Choice items accept the option letter (a, A, a), (a), A.) as well as the option text.
4. Deterministic target-form scorer for free sentences, 0/1/2 per docs/SCORING_RUBRIC.md: scores the target form only and ignores slips in other words; uses the item's targetForm, rubric criterion and accepted examples (inspect the item format in data/assessments/outcomes/).
5. Model-path guard: the meaning check cannot credit an answer when the target form is required and missing.
Tests: one test file per area or one combined (backend/test/graderV2.test.ts) covering each fix, including: case- or punctuation-sensitive items still fail when they should; an answer differing only in case is still wrong when case is the target. Parity test (backend/test/graderV2Parity.test.ts): with OFF, outputs equal current outputs on representative inputs from existing tests and fixtures.
Before editing code, run the related backend suites (grading, autoGrading, gradingProposals, languageLearningState, assessment*, placement*, and any suite touching these functions) and record the base failures. After: run the same suites + yours. Report: only known base failures remain (name them), or what is new.
Write docs/GRADER_FIXES.md ("SIMULATION ONLY · DRAFT"): what changed, switch, flows affected, parity evidence, test results, base failures.
Reply briefly: call sites per flow, switch location, tests added/passing, parity, base failures.
