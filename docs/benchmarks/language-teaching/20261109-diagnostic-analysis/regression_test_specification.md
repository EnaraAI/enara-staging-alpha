# Regression test specification (for the future implementation phase)

Two tiers:
- **Unit (deterministic, no AI):** engine functions in `languageTeachingContext.ts`, run under the existing `backend/test` setup. They assert signals, moves, reason codes and the rendered prompt text.
- **Scenario (benchmark-style, paid; run only with explicit authorisation):** scripted multi-turn conversations through the real tutor route, as in `run_trusted_age.ts`. Each scenario **presents its own item in a seeded tutor turn** (R8), so the scripted learner answers match the item.
  - **Deterministic assertions** where the expected form is known (e.g. the hint must not contain "has").
  - **Rubric v2 scoring** for the rest.

**Coverage rule:** every scenario family has variants for **child, teen and adult** × **A1, A2 and B1** (9 variants), using lesson specs equivalent to the v1.0 lessons (family / he-she, daily routine / -s -es + adverbs, experiences / present perfect vs past simple). The official 120-case dataset is not modified.

## 1. Correct-answer handling (RT-CA)

| ID | Seeded item | Learner answer | Answer class | Expected tutor behaviour | Assertions |
|---|---|---|---|---|---|
| RT-CA-01 | "Complete: This is my brother. ___ is twelve." | "He is twelve." | Correct, exact | Confirm specifically; no retry; next item or transfer | Unit: next turn `confirmedSuccessStreak = 1`, `after_confirmed_success`. Scenario: no re-presentation of the item. |
| RT-CA-02 | same | "he is twelve" | Correct with a surface slip | Confirm; mention the capital in ≤ 8 words; move on | No "try again"; the reply contains a confirmation |
| RT-CA-03 | "Sara / have breakfast / always / at 7:30" | "She goes to bed at ten." | Correct, different item, demonstrates -s | Credit -s; ask **only** about the undemonstrated have → has, once | "has" not revealed (R3); the "always" placement may be asked |
| RT-CA-04 | same, after RT-CA-03's reply | "My dad watches TV after dinner. I always do my homework before that." | Correct, demonstrates -es and adverb placement | Credit both; no third presentation of the same item; either one targeted have → has check on a **new** item or move to transfer | The item text does not appear a third time |
| RT-CA-05 | "Complete: This is my mother. ___ is a nurse." | "I like football." | Correct but irrelevant | Brief acknowledgement; restate the item once | No credit for the he/she criterion; no confirmation marker |
| RT-CA-06 | "Write one sentence with This is my … and He/She is …" | "This is my father. He driver." | Partially correct | Quote the correct part; one gap (missing "is"); hint L1/L2 | Correct form "He is a driver" not given |
| RT-CA-07 | same | "my father" | Ambiguous | One short clarifying question, or treat as an attempt and say so | No confirmation; no mastery claim |
| RT-CA-08 | same | "This is my father. She is a driver." | Incorrect (target) | Name the error; L1/L2 hint; retry | "He" not given on the first error |
| RT-ST-01 (unit) | — | Tutor reply "Good sentence! 'She goes' is correct. But this is a different sentence." | — | With R1: verdict marker `correct_other_item` recorded | `confirmedStreak` counts it |
| RT-ST-02 (unit) | — | A reply with no marker | — | Regex fallback unchanged | Existing r3 tests still pass |
| RT-ST-03 (unit) | — | A reply streamed in chunks with the marker split | — | The marker is never emitted to the client | The SSE output contains no `[[verdict` |

## 2. Hint behaviour (RT-HB)

| ID | Situation | Expected | Assertions |
|---|---|---|---|
| RT-HB-01 | Item "Sara always ___ breakfast" + "just tell me the answer" (no attempt) | L1/L2 cue; a promise to show the answer after a try | "has" absent; one invitation to try |
| RT-HB-02 | Binary item "This is my mother. ___ is a nurse." + "just tell me" | L1 attention cue only | No "a mother is a woman", no "She" anywhere in the reply |
| RT-HB-03 | First error "She go to bed at ten." | L1/L2 | "goes" absent; "-es" not named for "go" |
| RT-HB-04 | First error "I have gone to Alexandria last summer." | L1/L2 | "went" absent; no model containing "went" |
| RT-HB-05 | Same error repeated after an L2 hint | Escalate exactly one level | Unit: `hintLevel` increments by 1; the prompt carries the level text |
| RT-HB-06 | Third failure, or "just tell me" after two attempts | L6: answer + reason, then a **fresh** item | The fresh item differs from the original |
| RT-HB-07 | A1 child, first error | L2 phrasing comprehensible at A1 (≤ target words, glossed) | Rubric v2 cefr_fit ≥ 3 |
| RT-HB-08 | B1 adult, first error | L1 + invitation to self-correct | No rule statement in the first hint |
| RT-HB-09 | Learner solves after an L1 hint | Confirm; fade support (no hint on the next item) | Next turn `after_confirmed_success`; no hint text |

## 3. Grammar correctness (RT-GR)

| ID | Situation | Expected | Assertions |
|---|---|---|---|
| RT-GR-01 | Strategy shift on a repeated he/she error | A contrast pair with an accurate statement of what changes | Deterministic check: no "only one word/thing changes" unless the two lines differ by exactly one token |
| RT-GR-02 | Learner "My dad watch TV" | Rule and example agree (-ch → watches, catches) | The reply does not pair the -ch rule with "go" |
| RT-GR-03 | Learner asks "why 'it doesn't work' has no -s?" | The -s moves to "does"; base verb | Contains "does"; no claim that negatives take -s on the main verb |
| RT-GR-04 | Learner writes a multi-error sentence | Quotes the learner exactly | Deterministic: quoted learner spans are substrings of the learner message |

## 4. Context grounding (RT-CG)

| ID | Situation | Expected | Assertions |
|---|---|---|---|
| RT-CG-01 | No lesson selected, "help me with english" | One goal question (existing r2 behaviour) | `clarify_goal`; no lesson named |
| RT-CG-02 | Mid-lesson, the learner switches to an unrelated maths request | Redirect (existing r1); return to the active objective | `redirect_to_lesson`; no maths answer |
| RT-CG-03 | Learner answers an item with a sentence on another topic | No claim that it answers the item | The reply does not say "this answers" or "you answered" for the open item |
| RT-CG-04 | First turn with `priorEvidence: null` | No "you probably already know" | Deterministic phrase check |
| RT-CG-05 | Active lesson objective present | Tasks use the objective's pattern | Rubric v2 lesson_alignment ≥ 3 |

## 5. Formative assessment (RT-FA)

| ID | Situation | Expected | Assertions |
|---|---|---|---|
| RT-FA-01 | After an explanation | An unaided check on the tested component (new item) | The check item ≠ the model sentence; the answer is not in the same reply |
| RT-FA-02 | A superficial check ("Does that make sense?") | Must not be the only check | Rubric v2 formative ≤ 2 if it is |
| RT-FA-03 | Learner answers the check correctly | Confirm; transfer or harder item; no mastery claim | `no_mastery_or_percentage_claim` passes |
| RT-FA-04 | Learner answer exposes a misconception | Name it; L1/L2 hint; the next check targets the same component on a new item | Misconception named; no full answer |

## 6. Unit-level engine tests to add (deterministic)

- `confirmsCorrect` / verdict reader over the five recorded T08 openings (CA2, CB1, TA1, TA2, AA1). With R1 each must register success; today they return false. Keep them as **characterisation tests** of the current behaviour until R1 lands.
- `hintLevel` derivation over recorded chains. Example TA2-T06: a help request, then two answers on one task chain (`attemptsOnTask` 0 → 1), so the expected hint levels are 1 → 2.
- The strategy-shift prompt text no longer contains "differs only in the point".
- The `renderLanguageContextPrompt` "Always:" line contains the attribution and rule-example rules (R5).
