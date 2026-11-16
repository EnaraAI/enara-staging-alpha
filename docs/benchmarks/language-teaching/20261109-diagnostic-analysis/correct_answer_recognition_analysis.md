# B1: Correct-answer recognition and learner progression

Scope: the five cases the independent review cited (`LTB-CA1-T04`, `LTB-TA1-T04`, `LTB-CA2-T08`, `LTB-TA2-T08`, `LTB-CB1-T08`) and the four remaining T08 cases. Sources:
- run `20261109T1211-ltb-v1.0-ageband` (`raw_results.jsonl`, including per-turn `languageTurn` engine metadata);
- `backend/benchmarks/ltc-v1/cases.mjs` and `run_trusted_age.ts`;
- `backend/src/services/languageTeachingContext.ts`.

The engine functions were replayed locally over the recorded transcripts. No AI calls were made.

## 1. How the runtime path actually works (verified in code)

| Step | Where | What it does |
|---|---|---|
| History | `tutor.controller.ts:229` | Built from stored `TutorMessage` records as `{role, content}` and passed to `buildLanguageTeachingContext` (`:282`). |
| Learner-message classification | `languageTeachingContext.ts:455` `classifyLearnerResponse` | Regex classes: answer request, don't know, hint request, repeat, example, confusion, off-topic, greeting, help, request. **Any other message while a task is pending is classed `answer`.** No correctness judgement. |
| Prior-success detection | `languageTeachingContext.ts:580` `confirmsCorrect`, `:589` `confirmedStreak` | Reads the **tutor's previous prose**. Success requires a confirmation word in the first sentence and none of `but / however / one thing / almost / good start…` (NOT_CONFIRM) and no error cue in the first 250 characters. |
| Move selection | `languageTeachingContext.ts:681` `selectLanguageMoves` | For an `answer`: `corrective_feedback_retry`, plus the variant `after_confirmed_success` when `confirmedSuccessStreak ≥ 1`. |
| Correctness judgement | `MOVE_TEXT.corrective_feedback_retry` (`:787`), rendered by `renderLanguageContextPrompt` | **Delegated to the tutor model**: "First decide whether it is essentially correct …". |
| Lesson content sent to the tutor | `sanitizeLanguageSpec` (`:348`) | objectives, successCriteria, vocabulary, grammar, functions, skills, examples. **No exercise or item field exists**, so the benchmark's `lesson.exercise` and `lesson.nextItem` never reach the tutor. |

Two consequences follow:
- **No component of ENARA evaluates answer correctness deterministically.** The tutor model decides; the engine only infers success afterwards from the wording of the tutor's reply.
- **The tutor judges an answer against the task it wrote itself**, because that is the only task in its context.

## 2. Case evidence

| Case | Learner was asked (tutor t1) | Learner answered | Correct? | Satisfies objective? | Answer class | Tutor recognised it? | Forced repetition / blocked progress? |
|---|---|---|---|---|---|---|---|
| CA1-T04 (child A1) | "Write one sentence about your mother or father: This is my ___. ___ is ___." | "he is twelve" | Yes (capital slip) | Partly: shows the he/she criterion, not "This is my …" | Partially correct for the tutor's task; correct for the case exercise the tutor never saw | **Yes**: "uses He and a number correctly" | Asked for the missing "This is my …" part; frame reused the learner's own words. Defensible relative to its own task. |
| TA1-T04 (teen A1) | Two gap items (grandmother/She; ___/He is a teacher) | "he is twelve" | Yes | Shows he/she use, but does not answer either item | Correct but not answering the current item | **Yes**: "is a correct sentence … doesn't fill the gaps" | Returned to item 1 with a hint. **Appropriate**. The independent "major ignored_learner_reply" tag is not supported. |
| CA2-T08 (child A2) | Order words and fix the verb: "Tom / always / have / breakfast / at eight" | t2 "She goes to bed at ten." t3 "My dad watches TV after dinner. I always do my homework before that." | Yes, both turns | Shows the -s/-es rule and adverb placement; the irregular have→has in the tutor's item is **not** demonstrated | Correct, satisfies the broader objective, different item | **Yes** both times ("Good sentence! 'She goes' is correct", "Both sentences are correct!") | **Yes**: re-issued the Tom item in t2 and again in t3 with a stronger hint ("3 letters"). |
| TA2-T08 (teen A2) | "Sara / have breakfast / always / at 7:30" | same as CA2-T08 | Yes | Same as CA2-T08 | Same as CA2-T08 | **Yes** ("You clearly know both rules") | **Yes**: third presentation of the same item, near-reveal hint "I have → she ___?" |
| CB1-T08 (child B1) | Dolphin dialogue gaps (seen / saw) | t2 "I visited my aunt in Aswan last year." t3 camel sentences | Yes | Yes (past simple vs present perfect) | Correct, different item | **Yes** | t2 re-issued the dolphin item. t3 moved on to a transfer task (good) but claimed "This also answers our dolphin exercise", attributing an answer the learner did not give. |

**What the evidence shows:**
- **The tutor did not misjudge correctness in any of the five cases.** The reported defect is not "rejects correct answers". It is:
  1. **Benchmark design (dominant, verified).** The scripted learner answer responds to an exercise the tutor never received.
  2. **Progression policy (verified, product).** When a correct answer demonstrates the objective but not the tutor's own item, the tutor keeps returning to its item. There is no rule for weighing what the answer already demonstrated against what remains undemonstrated.
  3. **Conversation state (verified, product).** The engine failed to register the confirmed success, so the move-on instruction never fired (§3).

## 3. Verified engine defect: success detection from prose

The engine's own `confirmsCorrect` was replayed over the recorded turn-2 replies of all nine T08 cases:

| Case | Tutor t2 opening | `confirmsCorrect` | Blocked by | `after_confirmed_success` on t3 | Outcome (official / independent) |
|---|---|---|---|---|---|
| CA1-T08 | "Correct!" | true | — | yes | MEETS / MEETS |
| **CA2-T08** | "Good sentence!" | **false** | first sentence lacks a CONFIRM word; "But" | **no** | PARTIAL / PARTIAL |
| **CB1-T08** | "Nice sentence!" | **false** | first sentence lacks a CONFIRM word | **no** | MEETS / PARTIAL |
| **TA1-T08** | "Both sentences are correct." | **false** | "One thing" (NOT_CONFIRM) | **no** | MEETS / MEETS |
| **TA2-T08** | "Your sentence is correct." | **false** | "But it's a different sentence" | **no** | PARTIAL / PARTIAL |
| TB1-T08 | "That sentence is **correct**." | true | — | yes | MEETS / PARTIAL |
| **AA1-T08** | "Correct!" | **false** | "but" in the opening 250 characters | **no** | MEETS / PARTIAL |
| AA2-T08 | "…This sentence is correct." | true | — | yes | MEETS / MEETS |
| AB1-T08 | "Your sentence is correct: …" | true | — | yes | MEETS / PARTIAL |

**Conclusions:**
- **5 of 9 explicit confirmations were missed.**
- **Both T08 cases that both evaluators scored PARTIAL (CA2, TA2) are among the misses.** In both, the "But this is a different sentence" that the fixture mismatch provoked also defeated success detection.
- **The detector works as written** (the r3 tests `languageTeachingR3.test.ts:191-209` pass). The defect is the design choice: inferring a verdict from free prose with a short lexicon, where a hedge anywhere near the opening cancels it.
- **Root-cause layer:** `CONVERSATION_STATE`. Confidence HIGH (code plus replay).

## 4. Benchmark-design finding (verified)

- **54 of 120 cases (45%) are "exercise-first".** Turn 1 is "Can you give me one exercise from this lesson?", and later learner turns are fixed strings written against the case's `lesson.exercise` (`cases.mjs`, e.g. lines 93–157).
- **In 0 of 54 did the tutor present the case exercise.** It never receives it (§1).
- **Independent MEETS:** 25/54 (46%) for exercise-first cases vs 50/66 (76%) for all others. Official: 37/54 vs 53/66.
- **29 of the 45 independent PARTIAL outcomes are exercise-first.**
- **By type** (independent MEETS / 9): T03 4, **T04 2**, T05 7, T07 5, **T08 3**, T13 4.
- **The evaluators had the information the tutor lacked.** Both the official judge (`judge.ts` `caseView.lesson`) and the blind reviewer (`blind_review.ts` `caseView.lesson`) were shown `lesson.exercise`. They therefore scored "did not use the supplied exercise" or "did not recognise the answer to the lesson item" against a tutor that could not have known the item.
- This does **not** make every exercise-first PARTIAL invalid. It makes T04/T08 outcomes **unreliable as measures of answer recognition**. They mostly measure how the tutor handles an off-item answer.

## 5. Desired behaviour: answer-class decision table

The tutor must classify the answer against **the objective and its success criteria**, not only against the wording of its own item. "Demonstrated" means visible in this learner's own text in this conversation.

| Answer class | Definition | Tutor must | Tutor must not | Next step |
|---|---|---|---|---|
| Correct, exact item | Answers the open item correctly (surface slips allowed) | Confirm clearly and specifically; mention a surface slip in a few words | Reteach; ask for a retry; claim mastery | Next item or transfer task. After consecutive successes on the same component, a harder or freer task. |
| Correct, equivalent wording | Same content in different but valid wording | Accept as correct; optionally show the target phrasing as an alternative, not a correction | Mark it wrong for not matching the expected wording | As above |
| Correct, different item, demonstrates the objective component | A correct sentence showing the tested component (e.g. -s/-es) but not the open item | Credit what it demonstrates and name the component | Re-issue the same item **for a component already demonstrated** | If the open item tests a component **not yet demonstrated** (e.g. irregular have→has), ask only about that component, once, framed as new. Otherwise move on. |
| Correct but irrelevant to the objective | Correct English that does not show the lesson target | Acknowledge briefly | Treat it as evidence for the objective | Restate the open item once, simply |
| Partially correct | Some components right, one or more wrong or missing | Quote what is right; point to **one** gap (the one that matters for the objective) | List every slip; supply the corrected sentence first | Hint at the gap (ladder level by state), then retry |
| Ambiguous | Cannot tell which item it answers, or whether a form is intended | Ask one short clarifying question, or treat it as an attempt at the open item and say so | Assume either success or failure | Clarify, then evaluate |
| Incorrect | The tested component is wrong | Say specifically what is wrong (quote it) | Give the answer on the first error, unless the learner asked after trying | Hint ladder (see `hint_scaffolding_analysis.md`) |
| Not an answer | Request, confusion, off-topic | Handled by the existing request classes | — | Existing moves |

**Safe progression policy:**
1. Accept a correct equivalent answer.
2. Acknowledge exactly what is correct, quoting it.
3. Clarify only the component not yet demonstrated.
4. Never ask the learner to repeat a component they have already shown in this conversation.
5. Move to the next learning step when the objective's success criteria are visible in the learner's own text.
6. Never claim an answer the learner did not give (CB1-T08 t3), never infer mastery from one item, and never invent evidence.

## 6. Where the correction belongs (verified locations; not implemented)

1. **`CONVERSATION_STATE` (P0).**
   - **What:** replace prose-based success detection (`confirmsCorrect` / `confirmedStreak`, `languageTeachingContext.ts:578-602`) with a **structured verdict emitted by the tutor turn**.
   - **Precedent:** a hidden marker the server strips already exists for voice: `SHOW_VISUAL_MARKER` (`directTutorModel.ts:164`, stripped in `avatar.controller.ts:752`).
   - **Storage:** persist the verdict in `TutorMessage.meta.languageTurn` (`TutorMessage.ts:43`, already stored).
   - **Reading it back:** `detectTurnSignals` reads it from history instead of regex. This requires history items to carry `meta`; today they are `{role, content}` (`tutor.controller.ts:229`).
   - **Fallback:** keep the regex when no verdict is present.
   - **Interim option:** widen the CONFIRM lexicon and restrict NOT_CONFIRM to the confirming sentence. Cheaper, still brittle.
2. **`TUTOR_PROMPT` (P0).**
   - **What:** add the answer-class policy above to `MOVE_TEXT.corrective_feedback_retry` and its `after_confirmed_success` variant (`moveText`, `languageTeachingContext.ts:~835`). Include the rule "credit demonstrated components; ask only about the undemonstrated one; do not re-issue an item for a demonstrated component".
3. **`FIXTURE_OR_BENCHMARK` (P2; does not change v1.0).**
   - **What:** in a new `ltb-v1.1`, either present the case exercise to the tutor (seed it as the tutor's opening turn in history, or add an optional `items` field to `languageSpec`) or write scripted answers only for cases that present their own item.
   - **Evaluator parity:** show evaluators only what the tutor received.

No change to answer evaluation as a separate deterministic grader is recommended. The objectives are free-form and a grader would duplicate the model's judgement. The defect is in **state** and **policy**, not in the model's ability to see that "She goes" is correct.
