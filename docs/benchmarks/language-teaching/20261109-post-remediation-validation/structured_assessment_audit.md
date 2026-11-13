# Structured assessment audit (A1/A2 remediation claims vs. evidence)

Each claim from the remediation is checked at five evidence levels:

| Level | Meaning |
|---|---|
| **L1** | Implemented in source |
| **L2** | Deterministic unit test |
| **L3** | Route-level test (real controller, mocked SDK) |
| **L4** | Actual model output |
| **L5** | Qualified educator validation |

**No claim reaches L4 or L5.** No paid calls were made, and no educator has reviewed anything.

| Remediation claim | L1 | L2 | L3 | L4 | L5 | Audit verdict | Evidence |
|---|---|---|---|---|---|---|---|
| Success no longer depends on prose regex when structured state exists | ✔ `languageTeachingContext.ts:742`, `languageLearningState.ts:241-270` | ✔ R4 replay; audit HL/AI/FB | ✔ R4 T08 flow | ✘ | ✘ | **PARTIALLY_VERIFIED.** It works when a marker or key exists. The marker is model-written and can be overridden by a later echoed marker (POST-02). | MK-15, PI-R1 |
| Verdict states NOT_EVALUATED / INCORRECT / PARTIALLY_CORRECT / CORRECT / CORRECT_WITH_EQUIVALENT_FORMULATION / AMBIGUOUS | ✔ `languageLearningState.ts:18-19` | ✔ MK-01..12 | ✔ | ✘ | ✘ | VERIFIED (deterministic) | MK-* |
| Correctness tied to the active item; another item's correct answer does not complete it | ✔ `languageLearningState.ts:255-266` | ✔ R4, AI-* | — | ✘ | ✘ | **PARTIALLY_VERIFIED.** True within one lesson. Across lessons or courses in one session, item ids collide (POST-03). | ISO-05, ISO-06 |
| Partial or ambiguous answers never progress | ✔ | ✔ R4; AI-04 | — | ✘ | ✘ | VERIFIED (deterministic) | AI-04 |
| Unrelated correct answers give no credit | ✔ | ✔ R4 | — | ✘ | ✘ | VERIFIED (deterministic) | R4 "partial correctness…" |
| Assisted vs independent distinguished | ✔ `languageLearningState.ts:255` | ✔ AI-01, 02, 07 | — | ✘ | ✘ | **PARTIALLY_VERIFIED.** A correct OTHER_ITEM answer right after rule-level help counts as **independent** (POST-06). | AI-03 |
| Request turns never carry a verdict | ✔ `languageTeachingContext.ts:1209-1211` | ✔ PI-08 | — | ✘ | ✘ | VERIFIED | PI-08 |
| The answer key outranks the tutor; disagreement flagged | ✔ `:1204-1207` | ✔ R4 | ✔ R4 T08 | ✘ | ✘ | VERIFIED (deterministic) | R4 |
| The answer key never auto-marks INCORRECT | ✔ `languageLearningState.ts` `evaluateAgainstKey` | ✔ AK-07..10, 13, 14 | — | — | — | VERIFIED | AK-* |
| A missing marker cannot complete an item | ✔ structured() guard | ✔ FB-03 | ✔ R4 | ✘ | ✘ | VERIFIED | FB-03 |
| Active item preserved when the marker lacks `next=` | ✘ (`next` defaults to NONE) | ✘ FB-01 | — | — | — | **VERIFIED_OPEN (POST-04)** | FB-01 |
| Item presentation recognised correctly | Partly (substring fallback) | ✘ FB-02 | ✔ dry run (stand-in tutor names `item=`) | ✘ | — | **PARTIALLY_VERIFIED (POST-05)** | FB-02 |
| Mastery never inferred | ✔ `masteryClaim:false`; prompt rule | ✔ AI-06 | — | ✘ | ✘ | VERIFIED (deterministic). Live compliance untested. | AI-06 |
| Criteria indices bounded to the lesson | ✘ | ✘ PI-09 | — | — | — | **VERIFIED_OPEN (POST-08, P3)** | PI-09 |

## Evidence-level summary

| | |
|---|---|
| Deterministic and route evidence | Strong for the state machine itself: verdict enum, key precedence, request-turn guard, prose-fallback guard, isolation across learners and schools, failure, retry and disconnect |
| Weak or open | Marker trust order (POST-02); lesson namespacing (POST-03); `next=` default (POST-04); presentation fallback (POST-05); assisted classification for OTHER_ITEM (POST-06) |
| No evidence | Whether the real model emits markers reliably, classifies answers per the policy, or keeps to the leading-marker format. This needs the controlled live benchmark (`live_benchmark_plan` in `release_gate_decision.md`). |
