# Failure analysis: `ltc-v1-r1` run (remaining failures)

Pedagogical scores and failure tags are automated provisional scores (LLM judge), not reviewed by an educator. Root causes are **hypotheses**, checked against the engine code and the stored traces (`raw_results.jsonl`, where each turn includes `meta.languageTurn`). Traces are shown with synthetic case IDs only; nothing in them identifies a person.

## Overview

- 55/120 cases are still `partially_meets`; 0 are critical.
- Their mean judge score averages 2.62, and 31 of them average between 2.71 and 2.99.
- Partial cases by type: T06 9/9, T10 9/9, T07 6, T08 6, T02 5, T03 5, T04 4, T01 3; others ≤ 2.
- The dimensions most often below 3 in partial cases are pedagogy (33), scaffolding (28) and learner-context fidelity (22).

| # | Remaining failure | Cases | Hypothesised root cause | Proposed fix (not applied) |
|---|---|---|---|---|
| R-1 | **Repeated misconception: the tutor gives the corrected sentence instead of changing approach.** T06 pedagogy 2.56→2.00, scaffolding 2.56→1.89; 3 *major* T06 tags (2 over_helping, 1 under_scaffolding) | T06 9/9 partial; AA1-T06 and TA2-T07 fell from meets | **Introduced by r1.** On attempt ≥ 2, `corrective_feedback_retry` adds "if it is still wrong, show the correct form…". The engine has no "same error repeated" signal, so a repeated misconception gets "show the answer" where the case expects "change approach, smaller step". `reteach_simpler` only fires on explicit confusion, not on repeated errors | Split the rule. On the 2nd attempt with the same error, select `reteach_simpler` with a contrast or minimal-pair instruction. Show the model only after the 3rd attempt, or when the learner asks after trying. Add regression tests |
| R-2 | **Missing context: the tutor adds a task or a lesson plan after the goal question.** T10 meets 4→0; TA1, TB1, AA2 and AB1 fell from meets | T10 9/9 | (a) For a non-vague first message with no lesson (`hi, help me with english`), the engine selects `clarify_goal` **plus** `short_explanation`, `comprehensible_model` and `comprehension_check` (novice rules). Those moves ask for teaching and a check, which the tutor now fits into one short reply as a "default task". This rule exists in baseline too, but the r1 "one task per reply" line seems to favour adding one. (b) **Harness artefact:** the tutor can see the fixture's "General practice" chapter. There are 3 context-invention tags (2 major: CB1-T10, AB1-T10), against 4 in the baseline | When `clarify_goal` is chosen because no lesson exists, suppress the explanation and check moves. The artefact belongs to the frozen fixture and is not changed (see the discounted view below) |
| R-3 | **No escalation after consistent success (T08).** Pedagogy 2.44→2.22; 4 *major* tags (2 over_helping, 1 ignored_learner_reply, 1 no_formative_check) | T08 6/9 partial; TB1-T08 fell from meets | The engine selects `fade_support` and `independent_practice` only for an advanced level or proficient mastery. It doesn't track correct answers within a session, so after 2 correct answers it still picks `corrective_feedback_retry`. Example: TB1-T08, final turn `['corrective_feedback_retry']`, judge "does not escalate to a harder or freer transfer task" | Add a within-session success signal (the last k answers had no correction) that triggers `independent_practice`. That needs answer-correctness evidence, which the engine doesn't have today (only the model sees correctness), so it is a design decision |
| R-4 | **Lesson drift (minor), now the top tag (35)** | spread | Mostly two things: the tutor's own exercise replacing the lesson's, and invented lesson framing (e.g. AB1-T11 "recent situations"). The lesson spec gives no exercises, so the tutor invents them | Optional: give lesson specs a short `practiceItems` list that the tutor prefers |
| R-5 | **Off-topic check 8/9: AB1-T11 fails only on the frozen length proxy** | 1 | The redirect is correct (judge: 3 on every dimension; no boundary tag), but the reply is 129 words. The frozen check treats > 120 words as "did the email task" | None needed in code. Reported as a weak-check limitation |
| R-7 | **The tutor marks a correct answer against its own swapped exercise; 1 misquote** | CA1-T04, TA1-T04 (*major ignored_learner_reply* plus lesson_drift); TA2-T03 (*major factual_error*: praised a phrase the learner hadn't written) | The tutor's turn-1 exercise differs from the case's intended item, so the learner's answer to the case's item is "wrong" for the tutor's exercise. The misquote is a model error that no engine rule covers | Same as R-4 (curriculum-authored practice items). Monitor misquotes in educator review |
| R-6 | **Mastery/% regex: 3 failures** | T02 | The known false positive: the tutor glosses "always = 100%". No mastery claims were found by the judge (0 `premature_mastery_claim` tags; baseline 1) | Check limitation, as frozen |

## Representative traces

**R-1, LTB-TA2-T06 (teen, A2): repeated "-s" error.** Engine on each turn: `help_request` → `answer` (0 prior attempts) → `answer` (1 prior attempt, which adds the attempt-2 rule).

> **L3:** "My mother get up before me."
>
> **Tutor:** "… The verb is still missing its **-s**. Here is the correct form: *My mother get**s** up before me.* Why? **My mother = she** … Now try one more…"
>
> **Judge:** pedagogy 2, scaffolding 1, *major over_helping*: "gives the full corrected sentence after the second error instead of a smaller step."

**R-2, LTB-AB1-T10 (adult, B1, no lesson).** Moves: `clarify_goal`, `short_explanation`, `comprehensible_model`, `comprehension_check`.

> **Judge:** *major context_invention*: "states the course has one lesson called 'General practice'". This comes from the fixture artefact. Also tagged minor verbosity for a four-option list plus an extra prompt.

**Fixed behaviour, LTB-CA1-T13 (child, A1).**

> **L2:** "just tell me the answer pls"
>
> **Tutor:** "Let's try it first. I'll show you the answer after you try. 😊 **Hint:** Is a grandmother a man or a woman? …"
>
> Engine: `scaffold_hint` (`answer_requested_before_attempt`). Judge: no over-helping tag.

## T10 artefact, discounted view (as the frozen protocol directs)

Baseline discounted the two major context-invention tags caused by the "General practice" fixture. Here, 2 major and 1 minor T10 tags mention it. Discounting them changes no outcome, because no T10 case has a critical tag and the outcome rule doesn't read tags. The T10 learner-context mean is 2.33 including them. The judge's scores already include the effect and can't be partially re-scored without changing the frozen protocol, so the raw numbers stand.

## Other limitations (unchanged from baseline)

- One LLM judge; no educator review yet (`educator_review_pack.md`, `EDUCATOR-REVIEW-PREPARED`).
- CEFR labels are provisional; text chat only; one tutor run per condition.
- The engine can't tell child from teen. There is no approved age source; age is not inferred from grade.
- `expected_move_any` is partly tuned (see `remediation_plan.md`) and should be read as an engine regression check.
