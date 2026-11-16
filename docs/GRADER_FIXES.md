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

## Round-3 fixes

*DRAFT. After round 3 (deterministic exact 96.0%; free/transfer QWK 0.754, below 0.8). General rules, not answer patches; round-3 answers are not hard-coded and the new tests use other examples. All changes are in `backend/src/services/graderV2.ts` and run only with graderV2 ON; the OFF path is unchanged (`graderV2Parity.test.ts` passes).*

1. **Partial credit (tf1).** An attempted, recognisable form with one slip scores 1: a wrong form after a correct `can` (`can to …`, `can …s`, `can …ing`, per the §6 clarification); regular past spelling slips (`…d` without e, doubled consonant after two vowels, missing doubling for stop/plan/shop…, `-yed`); `be` + base verb for the continuous; a misspelt target word or conjunction, with a swapped pair of letters counted as one edit (`quite`/`quiet`).
2. **Every occurrence is checked.** Third person: each he/she/it clause (`… and he correct it` = 1) and `-es` spelling (`visites` = 1). Copula: each be form against its subject, plural and `X and Y` subjects need `are`. Past regular: each `-ed` word. Clock time: the number word before `o'clock` / after `past`/`to` (misspelt = 1). Frequency adverbs: `not never` = 1. Capitals: a title before a name (`mr`, `mrs`, `dr`) needs a capital. Conjunctions: the part after the conjunction needs a verb (`but not the money` = 1).
3. **Not a sentence.** Where the prompt asks for a sentence, an answer of up to 4 words with no verb scores 0.
4. **make / do.** Each make/do verb is paired with its head noun and checked against a collocation list plus the item's accepted examples; wrong verb = 0 (1 if another pair in the answer is right). Auxiliary `do` is skipped.
5. **Word order.** New rule for `Subject + verb + object + place/time at the end; adjective before noun` (no fallback): fronted place/time or no verb after the subject = 0; one fault (place/time between verb and object, adjective after noun, required place/time missing) = 1.
6. **Guard extension.** `spellingIsTarget()`: an exact item whose matchingNote is case- or day/month-sensitive, or a vocabulary item keyed by single words (or keyed by its own single-word target form). For these, `targetFormMissing()` is true unless the key matches, so the meaning check cannot credit `carot`, `fourty`, `grand father`, lowercase month/day names.

Tests: `backend/test/graderV2.test.ts` "round-3 fixes" block (one test per rule, new examples). One earlier expectation changed: `I can to swim.` is now 1 (was 0), following the rubric clarification. Limits: the rules are still heuristics (word lists for verbs, collocations and number words); a run with graderV2 ON on fresh answers is needed before relying on the numbers.

## Round-4 fixes

*DRAFT. After round 4 (deterministic exact 93.3%, free/transfer QWK 0.819). These are general rules, not answer patches. The new tests use new examples. Code changes are in `backend/src/services/graderV2.ts` and run only with graderV2 ON. The OFF path is unchanged (`graderV2Parity.test.ts` passes).*

1. **Apostrophe-less contractions.** `theres`, `thats`, `whats`, `hes`, `shes`, `youre` and `theyre` now normalise like `cant`, `dont`, `isnt` and `Im` already did. `he's` and `she's` are expanded too. `its` counts as `it is` only when every key reads "it is" at that point and no key has possessive `its`. Case- and punctuation-sensitive items are not normalised. The guard (`targetFormMissing`) now returns false whenever the key matches, so the model path no longer blocks these answers.
2. **Error correction, target only (rubric §2.2).** The target is the part of the key that differs from the prompt's wrong sentence; for a deletion, it is the key words on each side. Nearby key words named in a descriptive `targetForm` are added (e.g. `than`). An answer gets credit when:
   - every target word is right;
   - none of the removed wrong words is still there;
   - the rest differs from the key by at most 2 slips (a misspelt or mis-inflected word, or a small word dropped or added).

   `longer then` stays 0, because `than` is part of the comparative target in the rubric.
3. **A gap answer that repeats the subject.** An answer that repeats up to 3 words shown before the gap, followed by the key (`She's cooking` for `She ___ (cook)`), is accepted.
4. **Comparatives.** `more` + a short adjective (one syllable, or two ending in -y) = 0. `more` + an -er form = 0 (double comparative).
5. **Frequency adverbs.** An adverb right after a main verb (`We eat usually fish`) = 0. After `be`, an auxiliary or `not` is still right.
6. **some/any.** A yes/no question is now detected from the raw `?` (normalisation had removed it) or from an opening do/does/did/have/has/is/are/was/were. `some` in such a question = 0. Offers and requests (would/could/can/may/shall …) keep `some`.
7. **Past simple: every verb.** A base verb in a joined clause (`… and play`, `… and I eat`) next to a right past form = 1.
8. **Over-regularisation.** Rubric rule 4 and tf0 say that `goed` and `buyed` are wrong (0). That stays. Next to a right irregular past, though, it is "right in one place and wrong in another" (tf1) = 1. The task said "→ 1"; the rubric text says 0 when the form stands alone, so 1 applies only in the mixed case.
9. **Possessives.** his/her is checked against the nearest gendered noun or known first name before it (short lists of common Arabic and English names). A mismatch = 0, or 1 if another his/her is right. A his/her whose owner is a name of unknown gender returns `null`: the rule does not decide, so the caller keeps its path. No owner at all (`Her bag is red.`) = 2.
10. **Short target words.** A 3-letter target word misspelt by a doubled letter or a swap (`hott`) = 1.

**Data fixes (bank, minimal).**
- **targetForm faults.** The prompt, `answerKey` and `acceptedAnswers` were already consistent; only `targetForm` was wrong:
  - `EN-F-A1-VO-food-drink-C-5`: `targetForm` is now `pepper`;
  - `EN-F-A2-VO-jobs-workplaces-B-5`: now `driver`;
  - `EN-F-A2-VO-appearance-B-1`: now `thin`.
- **Transfer scoring.** All 54 transfer items whose `scoring` was `exact` now have `target_form_0_1_2` (rubric §2.4) and a `rubric` string: the grammar 0/1/2 text plus the transfer condition, or the vocabulary variant. This covers forms A, B and C (items 9) of:
  - article-a-an, article-the, possessive-adjectives;
  - classroom-objects, common-adjectives, days-months, family, food-drink, home-rooms, numbers-time;
  - conjunctions, past-questions-did, past-simple-regular, third-person-s;
  - appearance, clothes-shopping, jobs-workplaces, weather.

  All other item types already matched the rubric: error_correction, gap_fill, multiple_choice, controlled_* and rewrite are exact; free_production is 0/1/2.

**Tests.**
- `graderV2.test.ts`: new "round-4 fixes" block (11 tests, one per rule plus a bank-data check). One earlier expectation changed: days-months A-9 is now a 0/1/2 item, so `THURSDAY` scores 1 and is no longer "missing".
- Results: graderV2 + parity + assessment* tests 164/164 pass. The whole backend suite has 2054 tests: 16 failed, the known base failures, listed in the round-4 report. `tsc --noEmit` is clean.

**Limits.**
- The rules are still word lists and heuristics.
- The name-gender list is small.
- Error-correction alignment is token-based.
- Fresh answers and the real model are needed before relying on any figure.

### Production safety: no meaning check for word-target items
- With graderV2 ON, exact short answers whose target is the word itself (outcome/objective id with `-VO-`, case-/spelling-sensitive `matchingNote` such as capitals-full-stops or days-months, or a single-word `targetForm` equal to the key) are scored by the answer key only. One helper decides: `spellingIsTarget` (`backend/src/services/graderV2.ts`), which also reads objective ids on questions with no bank item.
- Call sites: `needsAiEvaluation` (`autoGrading.ts`, assignments) returns false for them; `evaluateShortAnswer` (`gradingProposals.ts`) returns a key-only proposal without a model call. Assessments, diagnostics and lesson exercises have no meaning-check call (key only), so nothing changes there.
- Open responses (rubric) and grammar short answers keep the model path. graderV2 OFF is unchanged (parity tests pass).
- Model path (eval-v2 meaning check and rubric): NOT VALIDATED until run with the API.
