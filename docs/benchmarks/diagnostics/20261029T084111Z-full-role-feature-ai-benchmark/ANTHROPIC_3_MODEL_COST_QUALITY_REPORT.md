# Anthropic 3-Model Cost / Quality Benchmark: ENARA workflows

**Status: LIVE-PROVIDER-VERIFIED** (real paid Anthropic API calls, 2026-10-29 08:40–08:47 UTC), run in an **isolated harness**, not inside the staging deployment. Staging has no provider key and stays AI-paused.

## 1. Models and rates (verified)

| Model ID (exact) | Availability | Input $/MTok | Output $/MTok | Cache read $/MTok | Source |
|---|---|---|---|---|---|
| `claude-haiku-5-5` | listed by Models API (`GET /v1/models`), 2026-10-29 | 0.10 (prompts ≤ 100K) | 0.50 | 0.01 | pricing page |
| `claude-sonnet-5-5` | listed | 2.00 | 10.00 | 0.10 | pricing page |
| `claude-opus-5-5` | listed | 4.00 | 20.00 | 0.20 | pricing page |

- Price source: <https://platform.claude.com/docs/en/about-claude/pricing> (read 2026-10-29).
- ENARA's `services/priceCatalog.ts` matches on input and output. It is wrong on Sonnet cache reads ($0.20, should be $0.10; QA finding F-4). No caching was used, so results are unaffected.
- Costs below are **computed from published rates**. They are **not** an invoice: no Admin/Usage API key was available to read the provider's billed amount.

## 2. Design

- **Workflows:** ENARA's real production code, called in-process:
  - `generateLessonPlan` and `generateAssessmentDraft` (`educatorAi.ts`, through `askForJson` and its validators);
  - `askEducatorChat` (`educatorChat.ts`, grounded with citations);
  - `queryDirectTutorModel` (`directTutorModel.ts`, Socratic chat mode);
  - **rubric grading** through ENARA's `rubricPrompt`, the production user-message shape and `validateProposal`, under a benchmark feature name. This is **not** the production grading workflow, which has an uncapped emergency path.
- **Data:**
  - fixed synthetic dataset: an English photosynthesis note and an Arabic (MSA) water-cycle note, registered and extracted by ENARA's real document pipeline;
  - 12 cases (2–3 per workflow, EN and AR);
  - a synthetic 6-point rubric with three synthetic answers (strong, weak, medium Arabic);
  - dataset SHA-256 `3b8281da03378febcdd2482b645dafd175b86d3036bd0243459e1ccfbe3b8c81`.
- **Fairness:**
  - identical prompts, data, `max_tokens` and `effort: low` (ENARA's production setting) for every model;
  - concurrency 1, on one account and region;
  - deterministic randomized model order per case;
  - no caching; the same validators for every model.
  - The SDK makes no retries of its own. ENARA's `askForJson` allows **one** validation retry, metered and reserved per attempt.
- **Scoring:** deterministic and automatic. No LLM judge, so no model graded itself. Per-workflow checks:
  - **lesson plan:** at least 5 section kinds, a check for understanding, differentiation, minutes within ±20% of the duration, cites the given sources, key terms, language;
  - **assessment:** count and type match the request, every question linked to a source and an objective, language;
  - **chat:** answered, cites the right document, expected facts present; for the unanswerable case, declines and invents no year; language;
  - **tutor:** corrects the misconception (keywords), ends with a check question, at most 220 words, language;
  - **grading:** total score in the expected band (strong ≥ 75%, weak ≤ 34%, medium 20–75%), feedback present.
  - **Quality** = % of checks passed. **Success** = ENARA schema valid **and** quality ≥ 70.
- **Metering:** every call went through ENARA's real `aiGateway` into the real `usage_ledger`, in a throwaway in-memory database. The school's P0d budget (15 / 6 / 6 / 3) was enforced there, with a separate **USD 3 hard-cap ledger** (`BudgetLedger`) reserving each attempt's worst case before it started.

## 3. Results

### Overall (12 valid cases per model)

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 12 | 11/12 | 91.7 | 3.1 s | 13.2 s | 10,916 | 15,231 | $0.0087 | $0.0008 | $0.73 | $7.26 |
| Sonnet 5.5 | 12 | 11/12 | 91.7 | 4.3 s | 14.4 s | 10,069 | 9,422 | $0.1144 | $0.0104 | $9.53 | $95.30 |
| Opus 5.5 | 12 | 11/12 | 89.6 | 5.0 s | 23.1 s | 10,069 | 11,068 | $0.2616 | $0.0238 | $21.80 | $218.03 |


*p95 is shown for completeness only; with n ≤ 12 per model (n = 2–3 per workflow) it equals the slowest call and has no statistical meaning. Per-1K/10K costs = mean cost per case × volume, assuming a similar prompt and answer size.*

### Lesson plan generation

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 2 | 2/2 | 100 | 18.1 s | 25.2 s | 2,498 | 7,468 | $0.0040 | $0.0020 | $1.99 | $19.92 |
| Sonnet 5.5 | 2 | 2/2 | 100 | 15.0 s | 16.4 s | 1,651 | 3,943 | $0.0427 | $0.0214 | $21.37 | $213.66 |
| Opus 5.5 | 2 | 2/2 | 100 | 25.1 s | 27.1 s | 1,651 | 5,244 | $0.1115 | $0.0557 | $55.74 | $557.42 |

### Quiz / assessment draft

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 2 | 1/2 | 50 | 9.7 s | 13.2 s | 2,691 | 4,972 | $0.0028 | $0.0028 | $1.38 | $13.78 |
| Sonnet 5.5 | 2 | 1/2 | 50 | 10.4 s | 14.4 s | 2,691 | 3,195 | $0.0373 | $0.0373 | $18.67 | $186.66 |
| Opus 5.5 | 2 | 1/2 | 50 | 14.2 s | 20.9 s | 2,691 | 3,555 | $0.0819 | $0.0819 | $40.93 | $409.32 |

### Grounded AI Chat with citations

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 3 | 3/3 | 100 | 0.8 s | 1.5 s | 1,641 | 154 | $0.0002 | $0.0001 | $0.08 | $0.81 |
| Sonnet 5.5 | 3 | 3/3 | 100 | 1.6 s | 1.6 s | 1,641 | 165 | $0.0049 | $0.0016 | $1.64 | $16.44 |
| Opus 5.5 | 3 | 3/3 | 100 | 1.3 s | 1.4 s | 1,641 | 162 | $0.0098 | $0.0033 | $3.27 | $32.68 |

### Education tutor response

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 2 | 2/2 | 100 | 2.0 s | 2.2 s | 1,131 | 499 | $0.0004 | $0.0002 | $0.18 | $1.81 |
| Sonnet 5.5 | 2 | 2/2 | 100 | 3.1 s | 3.8 s | 1,131 | 516 | $0.0074 | $0.0037 | $3.71 | $37.11 |
| Opus 5.5 | 2 | 2/2 | 87.5 | 3.4 s | 4.1 s | 1,131 | 397 | $0.0125 | $0.0062 | $6.23 | $62.32 |

### Rubric grading (synthetic, capped)

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 3 | 3/3 | 100 | 3.1 s | 4.7 s | 2,955 | 2,138 | $0.0014 | $0.0005 | $0.45 | $4.55 |
| Sonnet 5.5 | 3 | 3/3 | 100 | 4.6 s | 4.7 s | 2,955 | 1,603 | $0.0219 | $0.0073 | $7.31 | $73.13 |
| Opus 5.5 | 3 | 3/3 | 100 | 5.2 s | 6.8 s | 2,955 | 1,710 | $0.0460 | $0.0153 | $15.34 | $153.40 |


## 4. Per-case evidence

| Case | Workflow | Lang | Model | Status | Quality | Checks | Latency | Tokens in/out | Cost | Error |
|---|---|---|---|---|---|---|---|---|---|---|
| `as-ar` | assessment_draft | ar | Haiku 5.5 | FAIL | 0 |  | 13.2 s | 1818/3561 | $0.0020 | AI_BAD_OUTPUT: The AI reply could not be used (question 4: true/false answer must be True  |
| `as-ar` | assessment_draft | ar | Opus 5.5 | FAIL | 0 |  | 20.9 s | 1818/2644 | $0.0602 | AI_BAD_OUTPUT: The AI reply could not be used (question 4: true/false answer must be True  |
| `as-ar` | assessment_draft | ar | Sonnet 5.5 | FAIL | 0 |  | 14.4 s | 1818/2196 | $0.0256 | AI_BAD_OUTPUT: The AI reply could not be used (question 4: true/false answer must be True  |
| `as-en` | assessment_draft | en | Haiku 5.5 | PASS | 100 | count_matches=1;types_match=1;all_source_linked=1;all_objective_linked=1;language=1 | 6.1 s | 873/1411 | $0.0008 |  |
| `as-en` | assessment_draft | en | Opus 5.5 | PASS | 100 | count_matches=1;types_match=1;all_source_linked=1;all_objective_linked=1;language=1 | 7.6 s | 873/911 | $0.0217 |  |
| `as-en` | assessment_draft | en | Sonnet 5.5 | PASS | 100 | count_matches=1;types_match=1;all_source_linked=1;all_objective_linked=1;language=1 | 6.5 s | 873/999 | $0.0117 |  |
| `ch-ar-answerable` | grounded_chat | ar | Haiku 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 0.8 s | 581/87 | $0.0001 |  |
| `ch-ar-answerable` | grounded_chat | ar | Opus 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.4 s | 581/88 | $0.0041 |  |
| `ch-ar-answerable` | grounded_chat | ar | Sonnet 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.6 s | 581/91 | $0.0021 |  |
| `ch-en-answerable` | grounded_chat | en | Haiku 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.5 s | 524/53 | $0.0001 |  |
| `ch-en-answerable` | grounded_chat | en | Opus 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.3 s | 524/60 | $0.0033 |  |
| `ch-en-answerable` | grounded_chat | en | Sonnet 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.6 s | 524/60 | $0.0016 |  |
| `ch-en-unanswerable` | grounded_chat | en | Haiku 5.5 | PASS | 100 | declines_unsupported=1;no_invented_year=1;language=1 | 0.8 s | 536/14 | $0.0001 |  |
| `ch-en-unanswerable` | grounded_chat | en | Opus 5.5 | PASS | 100 | declines_unsupported=1;no_invented_year=1;language=1 | 1.0 s | 536/14 | $0.0024 |  |
| `ch-en-unanswerable` | grounded_chat | en | Sonnet 5.5 | PASS | 100 | declines_unsupported=1;no_invented_year=1;language=1 | 1.4 s | 536/14 | $0.0012 |  |
| `lp-ar` | lesson_plan | ar | Haiku 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 25.2 s | 1694/5211 | $0.0028 |  |
| `lp-ar` | lesson_plan | ar | Opus 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 27.1 s | 847/2881 | $0.0610 |  |
| `lp-ar` | lesson_plan | ar | Sonnet 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 16.4 s | 847/2216 | $0.0239 |  |
| `lp-en` | lesson_plan | en | Haiku 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 11.1 s | 804/2257 | $0.0012 |  |
| `lp-en` | lesson_plan | en | Opus 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 23.1 s | 804/2363 | $0.0505 |  |
| `lp-en` | lesson_plan | en | Sonnet 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 13.6 s | 804/1727 | $0.0189 |  |
| `gr-ar-medium` | rubric_grading | ar | Haiku 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.7 s | 972/992 | $0.0006 |  |
| `gr-ar-medium` | rubric_grading | ar | Opus 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 6.8 s | 972/726 | $0.0184 |  |
| `gr-ar-medium` | rubric_grading | ar | Sonnet 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.6 s | 972/649 | $0.0084 |  |
| `gr-en-strong` | rubric_grading | en | Haiku 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 3.0 s | 1023/583 | $0.0004 |  |
| `gr-en-strong` | rubric_grading | en | Opus 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 5.2 s | 1023/539 | $0.0149 |  |
| `gr-en-strong` | rubric_grading | en | Sonnet 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.0 s | 1023/486 | $0.0069 |  |
| `gr-en-weak` | rubric_grading | en | Haiku 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 3.1 s | 960/563 | $0.0004 |  |
| `gr-en-weak` | rubric_grading | en | Opus 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.7 s | 960/445 | $0.0127 |  |
| `gr-en-weak` | rubric_grading | en | Sonnet 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.7 s | 960/468 | $0.0066 |  |
| `tu-ar-question` | tutor | ar | Haiku 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 1.7 s | 593/214 | $0.0002 |  |
| `tu-ar-question` | tutor | ar | Opus 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 4.1 s | 593/250 | $0.0074 |  |
| `tu-ar-question` | tutor | ar | Sonnet 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 3.8 s | 593/325 | $0.0044 |  |
| `tu-en-misconception` | tutor | en | Haiku 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 2.2 s | 538/285 | $0.0002 |  |
| `tu-en-misconception` | tutor | en | Opus 5.5 | PASS | 75 | addresses_correct_idea=0;ends_with_check_question=1;paced_under_220_words=1;language=1 | 2.7 s | 538/147 | $0.0051 |  |
| `tu-en-misconception` | tutor | en | Sonnet 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 2.3 s | 538/191 | $0.0030 |  |

Raw rows, with redaction-safe output excerpts of the synthetic data only: `MODEL_BENCHMARK_RESULTS.csv` and `.json`.

## 5. Findings from the benchmark

1. **Arabic assessment drafts fail on every model (P1, product bug, QA F-8).** ENARA's validator accepts true/false answers only as the literal `True`/`False`, the prompt doesn't say so, and the models answer in Arabic. All 3 models, 2 attempts each, `AI_BAD_OUTPUT`. This makes the assessment results 1/2 for every model; **it is not a model difference.**
2. **Grounded chat:** all models answered from the source, cited the right document, and **declined** the unanswerable question without inventing a date. Haiku was the fastest (median 0.8 s).
3. **Rubric grading:** all three models gave **identical** scores on all three answers (6/6, 0/6, 3/6), matching the synthetic key.
4. **Tutor:** Opus missed one keyword check on the misconception case. It corrected the idea in different words ("air", "sugar"), which shows the limit of keyword checks, not necessarily lower quality.
5. **Harness defect, found and corrected:** the first grading run left out the student answer, so every model correctly said none was given. Those 9 calls ($0.0610) are **superseded**, kept in the JSON, and counted in spend.

## 6. Recommended routing (least-cost model meeting each workflow's threshold)

| Workflow | Threshold met by | Recommended | Why / caveat |
|---|---|---|---|
| Grounded AI Chat | all 3 (3/3) | **Haiku 5.5** | Same correctness, about 40× cheaper than Opus, fastest |
| Tutor (chat) | Haiku 2/2, Sonnet 2/2, Opus 2/2 | **Haiku 5.5**, Sonnet as fallback | n = 2; confirm pedagogy on a larger set |
| Lesson plan | all 3 (2/2) | **Haiku 5.5** for drafts | Haiku wrote the longest plans; teachers edit anyway |
| Assessment draft | EN: all 3; AR: none (validator bug) | **Fix F-8 first**, then re-test; Haiku is likely sufficient | Not decidable until fixed |
| Rubric grading | all 3 agreed exactly (3/3) | **Sonnet 5.5** pending a larger calibrated set | High stakes: n = 3 is far too small to drop to Haiku for grading |

- **Production today:** `ANTHROPIC_TUTOR_MODEL` defaults to **Opus 5.5** for all of these. On this sample Opus cost **about 30×** Haiku and **about 2.3×** Sonnet per case, with no measured quality gain.
- **Do not switch on this evidence alone:** n = 2–3 per workflow, deterministic keyword checks, synthetic data.

## 7. Uncertainty and next experiments

- **Sample size:** with n = 2–3 per workflow, no difference here is statistically significant. Medians are indicative only.
- **Scoring limits:** keyword and structure checks can't judge pedagogical quality. Next, add a cross-model judge (e.g. Sonnet judging Haiku and Opus, and the reverse), plus a fixed reference set.
- **Next experiments:**
  - 20–30 cases per workflow;
  - Arabic assessments after the F-8 fix;
  - longer documents (realistic chunk counts);
  - streaming time-to-first-token (not observable here, because the tutor path is non-streaming);
  - invoice reconciliation through the Admin Usage API.
- **Not benchmarked (not Anthropic capabilities):** speech STT/TTS, the English Speaking Exam voice path, and the Avatar (ElevenLabs, Anam). BLOCKED, with no paid non-Anthropic calls.
