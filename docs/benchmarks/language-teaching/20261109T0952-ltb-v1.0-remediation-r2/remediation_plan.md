# Remediation plan: `ltc-v1-r2`

Each change maps to the trace-based diagnosis in `r2_diagnosis.md`. All changes are in `backend/src/services/languageTeachingContext.ts`, except the observability fields in `TutorMessage.ts`. There is no change to the route, controller, model, effort, `max_tokens`, gateway, budgets, judge, rubric, scorer or dataset.

| ID | Diagnosis | Change | Tests |
|---|---|---|---|
| A | T06: the r1 "show the correct form on attempt 2" rule; no repeated-error concept | **Removed** the attempt-2 reveal. Added error recurrence, derived from the session's stored text only:<ul><li>`flaggedErrorSpans()` takes words or short phrases the tutor emphasised in sentences with an error cue (not followed by praise) that occur in the learner's previous answer;</li><li>`errorRecurrenceFor()` returns `repeated`, `changed` or `unknown`. A same-sentence partial retry gives `unknown`, and feedback that opens with praise flags nothing;</li><li>`priorStrategyShifts` counts earlier repeats in the chain.</li></ul>Move rules:<ul><li>repeated with 0 prior shifts → `reteach_simpler` (`repeated_misconception_strategy_shift`): contrast pair on a different example, or a smaller step, or one pinpointing question; no corrected sentence; retry;</li><li>repeated with ≥ 1 prior shift → `answer_with_reasoning` (`repeated_after_strategy_shift_model_then_transfer`): the model plus a fresh item, which is the bounded exit;</li><li>`changed` → normal feedback;</li><li>`unknown` → feedback plus the conditional policy</li></ul> | `languageTeachingR2.test.ts` › A (10 tests) |
| B | T10: teaching moves stacked on the clarification; no named missing field; the placeholder chapter presented as the lesson; no clarification state | `missingContext()` (ordered: `target_language` only when there's no lesson, then `lesson_or_goal`; level is never asked). Clarify only when an essential field is missing, on the first or a vague message, and only once (`goalAsked`). A clarify turn carries **only** `clarify_goal` (plus L1 support if needed), with a targeted text and a tighter length (≤ 40/60 words). New no-lesson prompt line: no lesson is selected, and outline chapters are not theirs. `learnerGoal` comes from the first message or the clarification and is quoted as "their words, not a course lesson". An ambiguous answer gets `general_practice` (labelled general practice). A known lesson (structured, or a vague first message with an unstructured lesson) starts without asking | › B (9 tests) and route test |
| C | Age: the only trusted source is the school-level `adultLearners` setting. **There is no learner-level age field; child/teen is BLOCKED** | No new age source. Observability added: `meta.languageTurn.ageBand` and `ageBandSource` (category only). Tests prove the trusted band's provenance, that client-supplied age is ignored, that grade never yields child/teen, that age × CEFR behaviour holds for the bands that exist, and that the r1 word targets are unchanged | › C (4 tests) and 3 route tests |
| P1 | Over-helping in first-attempt feedback: `comprehensible_model` "show a model sentence" alongside feedback, so the tutor shows the corrected answer | In feedback turns, `comprehensible_model` carries `during_feedback`: "any model sentence must use a different example, never the corrected version of their own answer" | › P1 |
| P2 | Verbosity: several errors listed at once (T03 child) | Feedback text: "if there are several errors, deal only with the most important one now" | › P2 |
| — | lesson_drift (hidden case exercise), T08 escalation, child register | **No change.** These need curriculum practice items, correctness evidence, or the blocked age band respectively | — |

**Version:** `LANGUAGE_POLICY_REVISION = 'ltc-v1-r2'`. The block tag stays `<language_teaching_context version="ltc-v1">`.

**Benchmark-informed heuristics (disclosed):**
- The recurrence heuristics were developed and checked against the r1 T06/T07/T08 traces:
  - the error and praise cue lists;
  - the multi-word "head" rule;
  - the same-sentence overlap threshold of 0.6;
  - the praise-opening rule.
- They contain no case IDs, expected answers or benchmark strings.
- New phrasings in the unit tests exercise them independently.
- `expected_move_any` remains partly tuned, as disclosed in r1.
