# Grader fixes (graderV2)

**SIMULATION ONLY · DRAFT.** Nothing here was checked against the production model or teachers. No API calls were made.

The five fixes from `research/assessment-validation/a1a2/REPORT.md` §3, behind one switch. Call sites and flows: `docs/GRADER_USAGE_MAP.md`.

## Switch

`graderV2`, **default OFF**. It is a named-only language-engine switch, read in one place: `engineV2('graderV2')` in `backend/src/services/engineV2.ts`, wrapped as `graderV2On()` in `backend/src/services/graderV2.ts`. Turn it on with `ENARA_ENGINE_V2=graderV2` (it can be combined, e.g. `keyMatch,graderV2`). `ENARA_ENGINE_V2=all` does **not** turn it on. School-level flags (`featureFlags.ts`) were not used because the answer key is synchronous and also runs where no school is loaded (placement, the lesson key).

With OFF every caller runs its previous code, unchanged.

## What changed

New: `backend/src/services/graderV2.ts`. These are pure functions with no I/O and no model calls:

| Fix | Function | Behaviour with graderV2 ON |
|---|---|---|
| 1. Normalised matching | `normaliseV2`, `sensitivityOf` | Ignores case, inner and final punctuation, extra spaces, and curly vs straight apostrophes and quotes. Contractions are expanded on both sides (can't / cannot / can not, don't / do not, I'm / I am, it's / it is, there's, 're, 've, 'll, I'd like, and cant / dont without the apostrophe). **Exceptions come from `matchingNote`.** "Case- and punctuation-sensitive" (capitals-full-stops) means only spaces and quote style are normalised. "Case-sensitive for the day/month word" (days-months) keeps the case of day and month names only. |
| 2. Several accepted answers | `acceptedKeys` | Accepts `correctAnswer`, `answerKey` and `acceptedAnswers[]`. Note lines inside `acceptedAnswers` (such as "Case-insensitive; …") are skipped, per rubric rule 6. |
| 3. Choice letter = text | `matchKeyV2`, `choiceOptions` | Accepts `a`, `A`, `a)`, `(a)`, `A.`, or `(b) <text>`, and also the option text, or the prompt's sentence with the gap filled (`an umbrella`). Options come from `options[]`, or from `(a) … (b) …` or `(x / y / z)` in the prompt. A bare `a` that is itself an option's text (as in a / an) counts as text, not as a letter. A letter is always case-insensitive. Option text keeps the item's sensitivity. |
| 4. Target-form scorer 0/1/2 | `scoreTargetForm`, `targetFormPoints` | Uses one deterministic rule per grammar `targetForm` (there is/are, am/is/are, can, -ed, irregular past, did-questions, -ing, going to, 3rd-person -s, comparatives, polite requests, at/on/in, a/an, some/any, much/many, frequency adverbs, possessives, the, conjunctions, make/do, capitals and full stops). Vocabulary items use field lexicons, the literal words in `targetForm`, and the item's keyword `acceptedAnswers`: a field word scores 2, a near-miss spelling 1, nothing 0, and a lower-case day or month name 1. It scores only the target form, so slips in other words are ignored. Blank, "I don't know" and a copy of the prompt score 0, and so does avoiding the form. If no rule fits it returns `null`, and the caller keeps its current path. |
| 5. Meaning-check guard | `targetFormMissing` | When the model says "correct" but the required target form is missing, the result becomes 0 points with the flag `target_form_missing`. The short-answer prompt was not changed, because that change needs an API-validated run. |

How the fixes are wired in (each change is a branch on `graderV2On()`):

- `assessmentSecurity.ts` `gradeAnswer`: uses `matchKeyV2`. This covers assignments (`grading.ts`, and `autoGrading.validateGrading`), assessments (`meAssessment.controller.ts`) and diagnostics (`learningDiagnostics.controller.ts`).
- `grading.ts` `gradeAnswers`: a question with `scoring: 'target_form_0_1_2'` is scored by the target-form scorer. It counts as a rule result: points are (score / 2) × max.
- `autoGrading.ts`: `needsAiEvaluation` skips the model for answers the scorer decided, and `validateGrading` re-checks those points.
- `gradingProposals.ts` `evaluateShortAnswer`: applies the fix 5 guard.
- `languageLearningState.ts` `evaluateAgainstKey` (in-lesson exercises): uses `matchKeyV2`, including the self-correction split. It still only ever returns success.
- `languageTeachingContext.ts`: the selfCheck hold-back (no credit for the tutor's own CORRECT when no target form is present) also runs when graderV2 is ON. This is fix 5 on the lesson side.
- `assessment/placementEngine.ts` `scoreControlled`: uses `matchKeyV2`.
- `models/Assessment.ts`: new optional question fields `acceptedAnswers`, `matchingNote`, `targetForm`, `targetForms` and `scoring`. All default to unset, and they are read only with the switch ON. `LessonItem` gains an optional `matchingNote`.

## Flows affected when ON

| Flow | Fixes |
|---|---|
| In-lesson exercises (tutor key, diagnosis, release-after-two, next item) | 1, 3, 5 (2 already existed). **Lesson learners are affected, not only tests.** |
| Assignments (submit, automatic grading, validation, meaning check) | 1, 2, 3, 4, 5 |
| Assessments and diagnostics | 1, 2, 3 |
| Placement (draft engine, not wired to a route) | 1, 3 (2 already existed) |

## Parity evidence (OFF)

`backend/test/graderV2Parity.test.ts` compares the switched code with verbatim copies of the pre-change functions, with `ENARA_ENGINE_V2` unset:

- `gradeAnswer`: every outcome-bank item (891) × 16 answer variants, plus fixture questions from the existing tests (more than 10,000 comparisons).
- `gradeAnswers` and `needsAiEvaluation`: the fixture questions, including a bank free-sentence question that carries `targetForm`, `scoring` and `acceptedAnswers`. OFF ignores all three.
- `evaluateAgainstKey`: every bank item × variants, with `keyMatch` off and on.
- `scoreControlled`: the placement bank × variants.
- `evaluateShortAnswer`: the model's credit is unchanged (no guard, no flag).

All are equal.

## Tests

`backend/test/graderV2.test.ts` has 22 tests, all passing. They cover:

- The switch: default off, `all` does not enable it.
- Fix 1, including:
  - capitals-full-stops still fails on lower case, upper case and a missing full stop;
  - an answer that differs only in case is still wrong when case is the target;
  - `tuesday` is wrong for `Tuesday`;
  - the lesson key and placement.
- Fix 2: the assignment grader, and note lines in `acceptedAnswers`.
- Fix 3: letters, `(b) text`, the filled gap, a / an with a bare `a`, and the capitals choice item.
- Fix 4:
  - the five free-sentence and five transfer examples in `docs/SCORING_RUBRIC.md` §3;
  - off-target slips (`bussy`, `fridy`, `cusin`);
  - over-regularised forms, avoidance, blanks;
  - capitals and day names, vocabulary;
  - the assignment path skipping the model.
- Fix 5: the model's credit is removed for `My village has a small mosque.`, and is kept when the form is present.

`backend/test/graderV2Parity.test.ts` has 5 tests, all passing.

## Test results and base failures

Related suites: the 40 test files that import the grading, autoGrading, gradingProposals, languageLearningState, assessmentSecurity or placementEngine modules, or the meAssessment / meAssignments / learningDiagnostics controllers.

- Before the change: 524 tests, 5 failed.
- After the change, plus the two new files: 551 tests, the same 5 failed, 546 passed.

The base failures were present before the change and are unchanged after it:

- `phase3.autograding.test.ts`: 11 (duplicate triggers), 14 (teacher correction / appeals), 15 (Phase 2 evidence)
- `phase3.e2e.test.ts`: the end-to-end automatic grade and release
- `p19Resilience.test.ts`: the C1b per-IP limiter reproduction

There is also an extra check over the 38 further files that import `languageTeachingContext`, `engineV2` or the Assessment model: 505 tests, 2 failed. Both are in `phase0.test.ts > upload links` (a signed-URL check returns 403). They concern upload signing, not grading. That file was not in the base run, so I have not confirmed whether these two failures were there before the change.

`tsc --noEmit` is clean.

## Limits

- The target-form rules are heuristics. They are not validated against teacher labels (GRADING_FOR_OUTCOMES §6.2 requires that), and they cannot judge meaning: "My grandfather is cheap." scores 2. Owner and agreement checks for possessives are also missing.
- Slash patterns inside `acceptedAnswers` (`I'm single/married.`) are not expanded. That is the bank fix (REPORT #8).
- The fix 5 guard covers the short-answer meaning check. Rubric (open-response) items with `scoring: 'target_form_0_1_2'` are scored without the model when a rule fits; other rubric items keep eval-v2 unchanged.
- Re-run the round-3 validation with graderV2 ON, and the real model path, before anyone relies on it.

## Base-failure check (added after the run)
The 2 `phase0.test.ts > upload links` failures were checked on the unmodified code (changes stashed, suite run, changes restored): both fail there too (2 failed, 10 passed). They are pre-existing and unrelated to graderV2. All 7 failures are therefore known base failures.
