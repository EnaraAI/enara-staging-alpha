# Hybrid V1 integration contract (shadow)

The candidate is `ENARA-HYBRID-experimental@v1`. eval-v2 stays the only official grader. V1 runs in shadow mode only: it
writes to its own collections and never to an attempt, gradebook or student view.

## Entry points
| Entry point | Behaviour |
|---|---|
| `shadowGradeAttempt(attemptId, { client, budget, config? })` | In `backend/src/services/hybridV1/shadow.ts`. Grades one released attempt in shadow. |
| `src/scripts/hybridShadow.ts --attempts <file> [--execute]` | Command line. Dry run by default: eligibility counts only, no calls, no writes. |
| Existing clients and APIs | Unchanged. No route was added. The official path (`autoGrading.processAttempt` → eval-v2) is untouched. |

## Inputs (read only)
| Input | Source |
|---|---|
| Released attempt | `AssessmentAttempt`, with `gradingStatus` finalized or released |
| Question | Its assessment version |
| Official eval-v2 result | The chosen `GradingProposal` (`answer.proposalId`). eval-v2 is never re-run. |
| Anchors | Teacher-scored answers (`method: 'teacher'`) to the same question, in the same school and assessment version |

## Eligibility (validated envelope)
The Hybrid is applied only where **all** of these hold. Otherwise the record is `not_eligible` with a reason code, and
eval-v2 alone applies.

| Condition | Reason code if it fails |
|---|---|
| Open-response question | `NOT_OPEN_RESPONSE` |
| Exactly one rubric criterion | `NOT_SINGLE_CRITERION` |
| That criterion is worth 5, with whole-point levels 0–5 | `NOT_0_5_WHOLE_POINT_SCALE` |
| A reference answer (`modelAnswer`) | `NO_REFERENCE_ANSWER` |
| A non-empty Arabic answer | `EMPTY_ANSWER` / `NOT_ARABIC` |
| The eval-v2 proposal came from `claude-opus-5-5` | `EVALV2_MODEL_NOT_FROZEN` |

## Score and precision
- **eval-v2:** whole points 0–5.
- **V6:** a 0.25 grid in [0, 5].
- **Hybrid:** `round(((eval_v2 + v6)/2)/0.125)*0.125`, giving 0.125 steps in [0, 5]. No clipping is needed and none is
  applied.
- **Storage:** Mongo `Number` in `HybridShadowResult`, which preserves 0.125 steps exactly (binary-exact multiples).
- **The official contract cannot hold Hybrid values (BLOCKER for canary and GA).** In `autoGrading.validateGrading`:
  - open-response totals must equal the sum of declared rubric-level points (`autoGrading.ts` 183–187);
  - short answers must be 0 or full marks (line 190);
  - criterion scores must reference a declared level.

  A Hybrid 3.375 has no level and no criterion breakdown. Whole-point rounding removed the gain in the diagnosis, so V1
  does **not** round. A contract or migration change (fractional levels, or a holistic score field) needs separate
  approval.

## Fallback and exceptions (frozen)
| Situation | Result |
|---|---|
| V6 output missing for any reason | Hybrid = eval-v2 score, label `HYBRID_FALLBACK_EVALV2` |
| eval-v2 result missing | Non-score `HYBRID_NO_EVALV2`; V6 is not called |
| Outside the envelope | `not_eligible` with its reason; no call |
| Budget cap reached | Record `error`, `BUDGET_EXCEEDED`; the run stops |

V6 reasons for a missing output:
- **Grounding and validity:** `GROUNDING_FAILURE`, `INVALID_MODEL_OUTPUT` (including truncation and unparseable replies),
  `INVALID_REQUEST` (prompt over 20,000 code points), `ValueError` (NaN/Infinity score).
- **Provider:** `MODEL_TIMEOUT`, `MODEL_RATE_LIMITED`, `MODEL_UNAVAILABLE`.
- **Budget:** `BUDGET_EXCEEDED`.
- **Anchors:** `INSUFFICIENT_ANCHORS`, `ANCHORS_CHANGED`, `ANSWER_IS_ANCHOR`.

V6 calls: 1 call plus at most 1 repair, and only for an invalid or ungrounded output. There are no SDK retries.

## Stored result (`HybridShadowResult`; unique `key = attemptId|questionId|graderVersion`)
`graderVersion`, `status`, `eligibility`, `evalv2{score, proposalId, modelName, status}`,
`v6{score, status, reasonCode, repairs, calls, model, anchorSetId, groundingDiagnostics}`, `hybrid{score, status, label}`,
`disagreement`, `cost{reservedUsd, estimatedUsd, confirmedRequests}`, `latencyMs`, `correlationId`, `answerSha256`.

## Privacy and audit
- **Never stored:** answer text, prompts, model reasoning or human reference scores.
- **Logs:** `hybrid_v1_shadow` records IDs, labels and statuses only.
- **Anchors:** only from the same `institutionId` (tenant isolation). A snapshot (`HybridAnchorSet`) is frozen per
  question and verified by answer hash. The graded answer is never its own anchor.
- **Provider calls:** recorded through `trackAiCall` (feature `hybrid_v1_shadow`; AiCall cost and latency).
- **Idempotency:** a unique claim per key, with a 10-minute lease for crashed runs.
