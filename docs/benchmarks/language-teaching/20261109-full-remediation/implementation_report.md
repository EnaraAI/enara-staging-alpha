# ENARA Phase 1: full remediation and measurement repair

**Date:** 2026-11-09 (local environment only).

**Scope:** the findings of `docs/benchmarks/language-teaching/20261109-diagnostic-analysis/`, each verified against the repository before any change.

**Product and measurement are kept separate** in code, tests and this report:
- product: `backend/src/**`;
- measurement: `backend/benchmarks/ltc-v2/**` and this directory.

## Headline

**Product (tutor runtime):**
- Success and progression now come from **structured, item-scoped state** rebuilt from the session's own stored turns, not from regex over tutor prose. Verdicts come from a lesson answer key when one exists, or from a hidden assessment line the tutor writes, stripped server-side and safe under streaming.
- Hints follow a **six-level, item-scoped ladder** with explicit must-not-reveal rules.
- Helped answers are kept apart from independent ones, and demonstrated components are not re-tested.
- Grounding rules cover quotes, attribution, rule-example agreement and absolute claims. The false "only one word changes" instruction is corrected.
- The tutor now **receives real lesson items**. Their answer keys stay server-side.
- **A real exposure path found during this work was closed:** the student curriculum endpoint would have returned answer keys.

**Measurement:**
- `ltb-fixture-v2` gives every case tutor/learner/evaluator **information parity**: 120/120 by the new validator, against 111/120 failures for v1.0 as it was actually run.
- A **zero-cost dry run** through the real route shows that the tutor's actual prompt contained the answered item in 72/72 lesson-item turns.
- `ltb-rubric-v2` is drafted with observable anchors, plus an educator review pack. **It remains a draft until qualified educators approve it.**

**What this does not show:**
- **Live teaching quality:** no paid AI call was made, no benchmark was rerun, and no new score exists.
- **A validated success rate:** the historical 90/120 (official) and 75/120 (independent) remain on record, unchanged, and are **not** validated pedagogical success rates.

## Preflight (Phase 0)

| | |
|---|---|
| Branch / HEAD | `claude/codebase-review-kbxqan` / `fc6a487d`. Uncommitted earlier work preserved untouched. |
| Hashes recorded | All 304 benchmark/report files and the 10 relevant source/test files |
| Language suites at baseline | 206/206 passing (5 files) |
| Runtime path traced | Request flow: `tutor.controller.ts` `prepareTutorTurn` → `buildLanguageTeachingContext` (engine) → `directTutorModel` (`queryDirectTutorModel` / `streamDirectTutorModel` through `aiGateway.meteredStream`) → `finishTutorTurn` → `TutorMessage.meta.languageTurn`. |
| Facts verified before design | The gateway retries a stream only if nothing was emitted, so retries cannot duplicate text. The voice/avatar path never receives the language block. `languageSpec` is an optional, uncommitted Phase 1 field (no migration needed). Students' course tree does not expose `languageSpec`, but the curriculum-context endpoint does (fixed, see R-D2). |
| Diagnostic findings re-verified | All P0/P1 findings reproduced from code and transcripts (see `acceptance_criteria_matrix.csv`). |

## Workstreams

### A. Runtime state and answer recognition (P0)

- **Verdict model:** `NOT_EVALUATED | INCORRECT | PARTIALLY_CORRECT | CORRECT | CORRECT_WITH_EQUIVALENT_FORMULATION | AMBIGUOUS`. Relevance is tracked separately (`ACTIVE_ITEM | OTHER_ITEM | UNRELATED | NO_ACTIVE_ITEM`), as is the next task (`NEW_ITEM | SAME_ITEM | NONE`).
- **Concepts kept separate:** correctness ≠ relevance ≠ item completion ≠ mastery.
  - Only an `ACTIVE_ITEM` success from a structured source completes a lesson item.
  - An `OTHER_ITEM` success credits success criteria but does not complete the item.
  - `UNRELATED` gives no credit; partial and ambiguous answers do not progress.
  - Mastery is never inferred (`masteryClaim: false` is unchanged).
- **Sources, in order:**
  1. answer key (deterministic, success-only: a non-match is left to the tutor, never auto-marked wrong);
  2. hidden tutor assessment;
  3. the r3 prose reading, only as a fallback for older messages.

  A disagreement between key and tutor is flagged.
- **State is derived from stored messages each turn.** It is therefore session- and learner-isolated by construction, idempotent across retries (an unsaved reply leaves no state), and needs no new collection or migration.
- **Streaming:**
  - `AssessmentMarkerFilter` holds back only a possible marker prefix, so a marker split anywhere in the stream is never emitted. Look-alike text (`[1]`, `[[note]]`, `[[assessment …]]`) passes unchanged. An unterminated marker is dropped and flagged.
  - Tested over every split position and chunk size, plus SSE through the real route, a mid-stream failure (no state saved) and a retried first attempt (exactly one assessment stored).
  - The existing API response contract is unchanged; the marker never reaches stored text or events.
- **Verified defect fixed:** replaying the five recorded T08 confirmations that `confirmsCorrect` missed (CA2, CB1, TA1, TA2, AA1). With structured verdicts, every one registers success and triggers the move-on instruction.

### B. Hint controller and scaffolding (P0)

- **Ladder L1–L6** (attention → conceptual → partial structure → targeted support → worked example on a different word → direct explanation). Each level states what may and must not be revealed and what the learner does next.
- **Level selection is engine state**, scoped to the active item:
  - +1 per support turn on the same item;
  - reset on a new item;
  - capped at 2 for an answer request before any attempt and for a first "don't know";
  - level 6 only with an explicit answer-with-reasoning move.
- **Rule for binary and single-ending items:** don't say which option fits before level 4.
- **A narrow precedence line** puts the support level ahead of other tutoring guidance. It is justified by a verified textual conflict: the direct-instruction strategy says "model one complete example".
- **Assisted vs independent (B4):**
  - A success after help on the item is recorded as assisted. The next step is an unaided item on the same point; a helped answer is never independent evidence.
  - An unaided success moves to the next lesson item, or to a freer task once all items are done.
- **Leak telemetry** flags a lesson item's target form appearing in a support reply before level 6. It flags the recorded TA2-T13, AB1-T13 and CB1-T04 leaks.

### C. Grammar accuracy and attribution (P1)

- **Strategy-shift text:** no longer asks for a pair that "differs only in the point". It now requires an accurate description of what changes and forbids a pair whose second line answers the learner's item. The corresponding telemetry flags all 4 recorded false "only one … changes" claims and does not flag a genuine one-token pair.
- **Grounding rules** (every language prompt):
  - keep course content, learner text and the tutor's examples apart;
  - quote the learner exactly or not at all;
  - never attribute answers, actions or knowledge the learner did not show;
  - examples must follow their rule, with no negatives or questions under an affirmative rule;
  - "always/only/never" only when literally true.
- **Learner-quote telemetry** flags the recorded CA2-T03 misquote.
- **No grammar regex knowledge base and no extra AI call**, as instructed.
- **Prompt-stacking hypothesis (H-3):** only the verified textual conflict above was acted on; the broader hypothesis is not treated as confirmed.

### D. Context grounding and lesson items (P1/P2)

- **Lesson items:** `languageSpec.items` (id, prompt; accepted answers and target forms server-side) is sanitised with caps and valid ids.
- **Delivery:** the tutor sees the item list, and on an exercise request it is told to present the next unsatisfied item **exactly as written**. Whether it did is recorded (`presentedLessonItemId`, `lesson_item_not_presented`).
- **Missing context:** unchanged r2 behaviour. One clarifying question, or labelled general practice; missing lesson content is never invented.
- **Security:** students never receive answer keys (curriculum-context endpoint fixed and tested).

### E. Benchmark fixture v2 (measurement)

See `fixture_v2_parity_report.md`. In summary:
- 120 cases mapped one-to-one with v1.0 hashes;
- items delivered to the tutor;
- every learner turn's target declared;
- evaluator views equal to tutor views plus guidance;
- 9 T03 learner turns revised and logged;
- parity 120/120 (v1.0 as run: 111 failures);
- dry run: 72/72 answered items visible to the tutor, 0 leaks, $0.

### F. Rubric v2 (measurement)

`rubric_v2_draft.md` / `.json`:
- 11 dimensions with observable 0–4 anchors drawn from real transcripts;
- severity rules;
- an explicit outcome rule (INVALID / DOES_NOT_MEET / MEETS / PARTIAL / UNCERTAIN), where critical defects cannot be offset and core dimensions need ≥ 3;
- reporting requirements, including the count of cases at mean 3.00.

`educator_review_pack.md` contains positive, negative and borderline examples, hint and formative-check calibration items, 10 judgement questions and an adjudication template. **Status: DRAFT**, not validated.

### G. Age and CEFR

**No teen redesign:** the diagnostic rejected teen register as a defect, and the teen "two steps" line stays unchanged (hypothesis H-2).

A new test covers all 9 combinations (child, teen, adult × A1, A2, B1) and checks that:
- the r4 state, hint and grounding lines are identical;
- the register line follows age only;
- the level line and length follow the age and CEFR tables;
- age is never inferred from CEFR, nor CEFR from age.

## Verification

See `test_results.md`. In summary:
- **Typecheck:** clean.
- **Production build:** compiled into a scratch directory.
- **Targeted suites:** 273/273, including 34 new r4 tests and 16 new fixture tests.
- **Full backend suite:** only the 16 pre-existing failures in 11 unrelated files. They reproduce identically on a copy of the backend with all pre-remediation source restored.
- **Historical artifacts:** all byte-identical.

## Status by finding

See `acceptance_criteria_matrix.csv`:

| Status | Count |
|---|---:|
| `IMPLEMENTED_AND_VERIFIED` | 6 |
| `IMPLEMENTED_WITH_LIMITATIONS` | 11 (mostly: live model compliance unmeasured without a paid run) |
| `NOT_A_DEFECT` | 3 |
| `NOT_IMPLEMENTED` | 2 (unconfirmed teen-wording hypothesis; repeated-run methodology needs paid runs) |

**Nothing is marked complete just because code changed.**

## Final acceptance criteria (§15 of the brief)

| # | Criterion | Met? | Evidence |
|---|---|---|---|
| 1 | Structured state tied to the correct item | Yes (runtime). Live model marker compliance unmeasured. | R-A1, R-A1b |
| 2 | Progression records demonstrated knowledge without blind acceptance | Yes | R-A1b, R-A2 |
| 3 | Demonstrated components not repeated | Policy and state yes; live compliance unmeasured | R-A2 |
| 4 | Graduated, stateful, leak-resistant hints | Yes (state and rules); live compliance unmeasured | R-B1 |
| 5 | Formative checks distinguish assisted from independent | Yes (state and instruction) | R-B4 |
| 6 | Streaming does not leak or corrupt state | Yes | R-A3 |
| 7 | Confirmed grammar accuracy defects addressed | Instruction-level and telemetry; not re-measured live | R-C2, R-C1a |
| 8 | Faithful attribution and quotes | Instruction-level plus quote telemetry | R-C1b, R-C1c |
| 9 | Tutor receives grounded lesson items | Yes | R-D1, dry run 72/72 |
| 10 | Fixture v2 parity | Yes | R-E1, R-E2 |
| 11 | Rubric v2 with observable anchors, pending educator validation | Yes (draft) | R-F1 |
| 12 | Child/teen/adult × A1/A2/B1 regression-tested | Yes (engine and prompt level) | R-G1 |
| 13 | Tests pass or failures documented | Yes | `test_results.md` |
| 14 | Historical v1 artifacts untouched | Yes (304 files hash-verified) | `implementation_manifest.json` |
| 15 | Diff contains only authorised changes | Yes | `changed_files.md` |

**Workstream status:**
- **Done:** product remediation is implemented and verified at the code, state, route and stream level, and measurement repair is complete.
- **Not done:** live pedagogical effect is unmeasured, and rubric v2 is unvalidated. Both need steps this task did not authorise: a paid run and educator review.
