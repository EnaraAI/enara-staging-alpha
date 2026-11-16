# Evaluator integration: POST-13

**Result: FIXED.** A rubric v2 evaluator now consumes `evaluatorView` only. A missing or malformed view fails explicitly. It was run in production-like conditions on Stage A and Stage C. The rubric itself is still an **unvalidated draft**: there is no educator approval.

## 1. Components

| File | Role |
|---|---|
| `backend/benchmarks/ltc-v2/judge_v2_core.ts` | Pure contract (unit-tested) |
| `backend/benchmarks/ltc-v2/judge_v2.ts` | CLI: `--role official\|independent`, cap, key file, prompt caching on the rubric |
| `docs/…/20261109-post-remediation-final/rubric_v2_machine.json` | Machine-readable rubric v2 with verbatim anchors (POST-17 workaround; the drafts are unchanged) |
| `backend/benchmarks/ltc-v1/judge.ts` | **Unchanged.** Frozen for historical v1 results. |

## 2. Contract

| Requirement | Implementation | Test |
|---|---|---|
| Consume `evaluatorView` | `requireEvaluatorView(case)` is the only source of case facts | Every v2 case yields a valid view containing no multi-word accepted answer |
| Missing or malformed view fails explicitly, no fallback | `EvaluatorViewError` for a missing view, a non-v2 record, a `case_id` mismatch, missing fields, or **any forbidden key anywhere** (`acceptedAnswers`, `targetForms`, `structuredExpectations`, `lessonDelivered`, `tutorView`, `answerKey`, `languageTurn`, `moves`, `keyVerdict`). The CLI validates **all selected cases before the first paid call.** | A v1-style record (lesson but no view), a missing view, a wrong id and an injected `acceptedAnswers` all throw |
| Keep the learner-visible conversation | `visibleTranscript`: only `LEARNER:` / `TUTOR:` text per turn | A prompt built from a turn carrying `runtimeParity` / `keyVerdict` contains neither |
| Keep answer keys separate | Keys are never read. Deterministic checks use runtime-parity records only, never shown to the evaluator. | As above |
| Record versions | Every result: `fixtureVersion`, `fixtureSha256`, `rubricVersion`, `rubricMachineFormat`, `rubricSha256`, `viewVersion` (`ltb-fixture-v2/evaluatorView`), `coreVersion`, evaluator model and effort | Visible in every output line |
| Evidence-backed scores | The prompt requires a verbatim quote with the turn number for every score below 3 and every tag. Output is validated: 11 dimensions, each 0–4, `n/a` or `insufficient_evidence`; severities valid. One format re-ask, then unparseable. | Invalid score or non-JSON → null |
| Outcomes | `computeOutcomeV2`: INVALID (runtime parity failure) → DOES_NOT_MEET (any critical, any 0, or a deterministic privacy breach) → UNCERTAIN (core insufficient evidence) → MEETS (deterministic pass, no major, all ≥2, core ≥3, mean ≥3.00) → PARTIAL | 11 outcome cases incl. "critical never offset", "n/a and insufficient never count as 3", INVALID, privacy |
| Official and independent stored separately | `judge_v2_official.jsonl` vs `judge_v2_independent.jsonl` (plus attempts and status files) | Files on disk |
| Disagreement handling | `reconcile`: an outcome disagreement with the official mean within 3.00 ± 0.15 gives UNCERTAIN; Cohen's κ | Unit tests |

## 3. Disclosed interpretations (the rubric drafts are not edited)

- **POST-16.** Rule 3 is contradictory. The evaluator treats `insufficient_evidence` as unscored (never counted as 3). A core dimension with insufficient evidence makes the case UNCERTAIN.
- **POST-17.** The draft JSON had no anchors. `rubric_v2_machine.json` copies them verbatim; a unit test checks every anchor string against the markdown.
- **POST-18** (overlapping dimensions) and **POST-19** (educator pack not blind) are still open. They need educator work, not code.

## 4. Runs

| Run | Role | Model | Cases | Calls | Cost | Unparseable |
|---|---|---|---:|---:|---:|---:|
| Stage A | official | Sonnet 5.5 (medium) | 10 | 10 | $0.1003 | 0 |
| Stage A | independent | Haiku 5.5 (low) | 10 | 10 | $0.0091 | 0 |
| Stage A re-check | official | Sonnet 5.5 | 5 | 5 | $0.0395 | 0 |
| Stage A re-check | independent | Haiku 5.5 | 5 | 6 (one format re-ask) | $0.0051 | 0 |
| Stage C | official | Sonnet 5.5 (medium) | 120 | 120 | $0.8098 | 0 |
| Stage C | independent | Haiku 5.5 (low) | 120 | 124 (4 format re-asks) | $0.0803 | 1 |
| Stability | official / independent | Sonnet / Haiku | 12 / 12 | 12 / 12 | $0.0945 / $0.0065 | 0 / 0 |
| Stage C | frozen **v1** judge (comparability only; unchanged script, copied inputs) | Sonnet 5.5 | 120 (+12 repeats) | 132 | $1.6495 | 0 |

## 5. Correction to the evaluator (found while analysing Stage C)

`computeOutcomeV2` version **core-1** blocked MEETS whenever a core dimension was `n/a`, e.g. D5 answer judgement in a case where the learner never answered. That contradicts the rubric (`n/a` is excluded) and this report's own §3.
- **Fixed in core-2**, with a test.
- `rescore_v2.ts` recomputed every v2 outcome from the **stored** evaluator outputs, with no provider call. It writes `judge_v2_<role>_rescored.jsonl` and checks the rubric hash.
- The original files keep `outcomeAsRun`.

| Stage C | core-1 (as run) | core-2 (rescored, correct) |
|---|---|---|
| Official MEETS | 27/120 | **54/120** |
| Independent MEETS | 50/120 | **91/120** |
| Agreement / κ | 70.6% / 0.36 | **58.8% / 0.21** |

**Lesson for the controlled benchmark.** Outcome logic must be frozen and tested with the rubric, before scoring, alongside the educator freeze.

**Limitation.** The "independent" evaluator is a separate model from the **same provider and model family**. It is not human, not blind to the provider's style, and agreement between the two is not educator validation.
