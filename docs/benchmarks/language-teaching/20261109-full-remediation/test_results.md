# Test results

**Environment:** local container, in-memory MongoDB.

**Provider:**
- all tutor-route tests mock the Anthropic SDK;
- fixture tests and the fixture dry run make **no** provider call;
- **no paid AI call was made in this task.**

## 1. Summary

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | **Pass** (exit 0) |
| Production build (`tsc`, output to a scratch dir, repo untouched) | **Pass** (exit 0) |
| Targeted language/tutor suites (9 files) | **273 / 273 pass** |
| Full backend suite (110 files) | **1539 pass, 16 fail.** All 16 are pre-existing (§3). |
| Fixture v2 static parity | **120 / 120** (v1.0 as run: 9 / 120) |
| Fixture v2 dry run on the real route | 219 / 219 turns OK. Tutor saw the answered item in 72 / 72 lesson-item turns. 0 leaks. $0. |
| Historical artifacts | 304 / 304 byte-identical to preflight |

## 2. Targeted suites

| File | Tests | Result | Notes |
|---|---:|---|---|
| `languageTeachingR4.test.ts` (new) | 34 | pass | A1/A1b structured state, A3 streaming, B hint ladder and formative step, C strategy shift / grammar / quote telemetry, D lesson items and answer-key exposure, G 9-combination age × CEFR, route JSON + SSE + failure + retry + isolation |
| `benchmarkFixtureV2.test.ts` (new) | 16 | pass | Builder integrity, sanitiser round-trip, no answers in views, 11 negative validator cases, v1.0 111/120 fails vs v2 0/120 |
| `languageTeachingContext.test.ts` | — | pass | Unchanged |
| `languageTeachingR2.test.ts` | — | pass | Unchanged |
| `languageTeachingR3.test.ts` | — | pass | **One assertion changed:** policy revision literal `ltc-v1-r3-ab1` → `ltc-v1-r4`, because the revision really changed |
| `languageTeachingRemediation.test.ts` | — | pass | Unchanged (protected phrases kept verbatim in the new text) |
| `learnerAgeBand.test.ts` | — | pass | Unchanged |
| `p20TutorStream.test.ts` | — | pass | Existing streaming contract unchanged |
| `p1ReviewFixes.test.ts` | — | pass | Unchanged |
| **Total** | **273** | **273 pass** | |

**Baseline before changes:** the five language suites passed 206/206. After the changes the same five pass 206/206, with the single revision literal updated.

**No assertion was weakened to make a test pass.** One test **written during this task** was corrected because it over-asserted. It required the `languageSpec` key to be absent from the student curriculum endpoint, but that key, holding objectives and success criteria, was already exposed before this work and is not secret. The corrected test asserts what matters: no answers, and items reduced to id + prompt.

## 3. Full backend suite: failures

16 failures in 11 files:

| File | Failing tests |
|---|---:|
| `elie.e2e` | 1 |
| `elie.sprint4` | 1 |
| `p14_2GradingTestSpend` | 2 |
| `p14_8BlockerFixes` | 1 |
| `p19Resilience` | 1 |
| `p20QueryBudget` | 1 |
| `p2Documents` | 2 |
| `p3EducatorChat` | 1 |
| `phase0` | 2 |
| `phase3.autograding` | 3 |
| `phase3.e2e` | 1 |

**Proof they are pre-existing:**
1. A copy of `backend/` was made in the scratchpad with the **pre-remediation** versions of every changed source file restored, and the new module and tests removed.
2. The same 11 files were run there.
3. **The identical 16 tests fail.**
4. An earlier session had also recorded 16 pre-existing failures (spend-cap, upload-signing, grading and e2e areas).

None of these files exercises the language engine. They were not modified.

## 4. Coverage of the regression specification (diagnostic `regression_test_specification.md`)

| Area | Covered by | Level |
|---|---|---|
| Exact / equivalent / different-item / partial / unrelated / ambiguous / incorrect answers | R4: answer key, state scoping, finalize tests; T08 route flow | Unit + route |
| Structured success replaces the regex; recorded T08 replays | R4 replay test | Replay (read-only) |
| Marker never streamed; split boundaries; look-alike text preserved; unterminated marker | R4 A3 tests + SSE route test | Unit + route |
| Failed stream and retried attempt do not corrupt or duplicate progression | R4 route test | Route |
| Session and learner isolation of state | R4 route test + pure test | Route + unit |
| Hint level 1 start, +1 per support turn, reset on new item, caps, level 6 only for answer-with-reasoning | R4 B tests + SSE escalation | Unit + route |
| Must-not-reveal rules; binary/single-ending rule | R4 B test | Unit |
| Leak telemetry on recorded leaks (TA2-T13, AB1-T13, CB1-T04) | R4 B test | Replay |
| Formative: assisted → independent check; unaided → next item | R4 B test | Unit |
| Strategy-shift wording; false "only one … changes" on 4 recorded turns; true pair not flagged | R4 C tests | Unit + replay |
| Misquote (CA2-T03) flagged; faithful quote / correction not flagged | R4 C test | Replay |
| Grounding rules present in every language prompt | R4 C test | Unit |
| Lesson-item sanitising, delivery, exhaustion; answers never in prompt or student API | R4 D tests + route test | Unit + route |
| Child/teen/adult × A1/A2/B1 independence | R4 G test + existing matrix tests | Unit |
| Fixture mapping, parity, hashes, negative parity cases | `benchmarkFixtureV2.test.ts` + validator CLI + dry run | Fixture |

**Not covered (needs a live model, i.e. paid calls):**
- whether the real tutor follows the answer-class policy and hint ladder;
- whether it writes the marker reliably;
- whether it presents lesson items verbatim;
- whether it avoids the grammar slips.

The scenario tier of the regression specification (`RT-*` with live tutor output) is therefore **not executed**.

## 5. Commands (from `backend/`)

```
npx tsc --noEmit -p .
npx tsc -p . --outDir <scratch>/build_check2
npx vitest run test/languageTeachingR4.test.ts test/benchmarkFixtureV2.test.ts test/languageTeachingContext.test.ts test/languageTeachingR2.test.ts test/languageTeachingR3.test.ts test/languageTeachingRemediation.test.ts test/learnerAgeBand.test.ts test/p20TutorStream.test.ts test/p1ReviewFixes.test.ts
npx vitest run
node benchmarks/ltc-v2/validate_parity.mjs v2 ../docs/benchmarks/language-teaching/20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl
npx tsx benchmarks/ltc-v2/run_fixture_v2.ts --mode dry --cases <fixture> --out <dir>
```
