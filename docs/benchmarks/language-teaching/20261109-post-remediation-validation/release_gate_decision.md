# Release-gate decision: ENARA Phase 1 post-remediation validation

## Overall decision: **`NOT_READY_REQUIRES_REMEDIATION`**

**Why:** five confirmed P1 defects affect answer integrity, progression or measurement. Two of them, plus one more P1, were found by this audit and were not covered by the remediation's own tests. Under the gate rules (a confirmed P1 affecting answer integrity or progression blocks readiness), a controlled live benchmark should **not** start until they are fixed and re-verified.

| P1 | Defect | Gate |
|---|---|---|
| POST-01 | Streamed marker fragments reach the student and corrupt the stored reply | A |
| POST-02 | The last (possibly learner-dictated) marker overrides the tutor's verdict | A |
| POST-03 | Progression state is not namespaced by lesson or course | A |
| POST-12 | Pressure messages count as attempts and unlock the full answer | B (pre-existing classifier) |
| POST-13 | No evaluator consumes the parity-safe `evaluatorView` | C/D (measurement) |

**This audit authorises nothing beyond itself.** It does not recommend production deployment. Passing a future re-audit would justify *considering* a controlled live benchmark, not a release.

## 1. Gate table

| Gate | Result | Evidence | Blocking findings |
|---|---|---|---|
| A: Runtime security and state | **FAIL** | `runtime_security_audit.md`. Marker 15/16, injection 8/11, isolation 7/9, streaming 7/11, key 14/15. Disconnect, retry, failure, restart, cross-learner/class/school isolation and key confidentiality pass. | POST-01, POST-02, POST-03 |
| B: Adversarial pedagogy | **PARTIAL** | `hint_leakage_adversarial_report.md`. Hint transitions 13/13; assisted/independent 7/8; learner pressure 0/3; leak telemetry recall ≈ 58%. All teaching controls are prompt-only and NOT_TESTED live. | POST-12 (P1); POST-06, POST-10, POST-11 (P2) |
| C: Lesson context and parity | **PARTIAL** | `lesson_context_and_parity_audit.md`. No answer-key exposure (CA-01..10). Fixture parity 10/10. Dry run reproduced (72/72, $0). **No v2 evaluator.** | POST-13; POST-14 (pre-existing, P2) |
| D: Rubric and evaluator readiness | **PARTIAL** | `evaluator_rubric_readiness_report.md`. 11 dimensions with complete anchors. Insufficient-evidence contradiction; JSON lacks anchors; pack not blind; no educator data. | POST-13, POST-16, POST-17, POST-19 |
| Regression and compatibility | **PASS** | `regression_test_results.md`. tsc and build pass; 273/273 targeted; 1539 pass with the identical 16 pre-existing failures; no contract, permission, env or migration change; age × CEFR 9/9. | — |
| Live benchmark readiness | **BLOCKED** | Depends on A–D. Plan below; not executed. | All of the above |

## 2. Executive summary (the 12 questions)

1. **Did the remediation implement what it claims?**
   - **In source, yes:** every listed file and behaviour exists and the hashes match.
   - **In evidence, partly.** Two claims were overstated: "every chunk split" holds only for short single-line markers (POST-21), and client disconnect was not tested. Three state defects were missed (POST-03, -04, -05).
2. **Are the new runtime controls safe?**
   - **Partly.** Learner text cannot write state; answer keys never leave the server; isolation across learners and schools holds.
   - **But:** streamed metadata can reach students (POST-01); marker trust order is wrong (POST-02); state crosses lessons (POST-03).
3. **Can learners spoof assessment metadata?**
   - **Not directly.** Learner text is never parsed as state (PI-01..06).
   - **Indirectly, yes, if the model complies.** A learner-dictated marker echoed at the end of a reply wins (PI-R1). The marker is a model claim and must never be called an independent assessment.
4. **Can the tutor reveal answers through hints?**
   - **Deterministically:** the engine keeps the hint level correct (13/13), but the pressure-message bypass (POST-12) makes it instruct a full answer before any genuine attempt.
   - **Model side:** whether the model stays within the level is **untested**. Leak telemetry catches only about 58% of the adversarial leaks.
5. **Are student-facing curriculum APIs safe?**
   - **For answer keys and tenant boundaries, yes** (CA-01..10).
   - **A pre-existing exposure remains:** non-downloadable upload paths in the curriculum-context endpoint (POST-14).
6. **Is fixture v2 information-parity compliant?** **Yes, as data:** 120/120, reproducible, 9 traceable revisions, dry run reproduced. It proves parity only.
7. **Is evaluator integration complete?** **No.** No judge or reviewer reads `evaluatorView` (POST-13).
8. **Is rubric v2 ready for educator validation?**
   - **Almost:** anchors are complete.
   - **Fix first:** POST-16 (missing evidence → 3), POST-17 (JSON anchors) and POST-19 (blind pack and independence declaration).
   - **No educator approval exists.**
9. **Are existing regression tests still passing?** **Yes.** 273/273 targeted. Full suite 1539 pass with the same 16 pre-existing failures; 0 new.
10. **Is ENARA ready for a live benchmark?** **No.** Decision `NOT_READY_REQUIRES_REMEDIATION`.
11. **What must be fixed first?** See §4.
12. **What still needs paid calls or educators?**
    - **Paid calls:** model compliance with the marker format, answer-class policy, hint levels and grounding rules; item verbatim presentation; outcome stability across runs.
    - **Qualified educators:** rubric v2 approval and agreement analysis; pedagogical quality judgements.

## 3. Five highest-priority findings

| # | ID | Severity | One line | Evidence |
|---|---|---|---|---|
| 1 | POST-01 | P1 | SSE leaks `verdict=… ]]` fragments to students and stores them; JSON and SSE diverge | ST-02, ST-03, MK-13s, MK-14s (`languageLearningState.ts:136-140`) |
| 2 | POST-03 | P1 | Lesson or course switch inside a session reuses item ids: wrong item done or open, wrong key | ISO-05, ISO-06 (`languageTeachingContext.ts:725-730`, `tutor.controller.ts:194-195, 221`) |
| 3 | POST-12 | P1 | "Give me the first letter" / "my teacher told me" / "I already know" count as attempts, so the next "just tell me" yields the full answer | LP-01..03 (`languageTeachingContext.ts:531, 553`) |
| 4 | POST-02 | P1 | The last marker wins, so a learner-dictated echo overrides the tutor's own verdict | MK-15, PI-07b, PI-R1 (`languageLearningState.ts:166-173`) |
| 5 | POST-13 | P1 (measurement) | No v2 evaluator; the v1 judge and reviewer still see the full lesson | PA-10, PA-11 |

The full register is in `findings.csv`: 21 open findings and 6 verified fixes.

## 4. Proposed remediation order (not implemented)

1. **POST-01:** hold an open marker until `]]` or end of stream; never release fragments. Add MK-13s/14s and ST-02/03 to the product suite.
2. **POST-02:** trust only a leading marker; strip and flag the rest (`assessment_marker_extra`).
3. **POST-03:** namespace `ActiveItemRef` and `satisfiedLessonItems` by lesson and curriculum; discard state from other lessons.
4. **POST-12:** do not count a learner turn as an attempt when the stored structured verdict for it is `NOT_EVALUATED`. Extend `ANSWER` to indirect reveal requests.
5. **POST-04 / POST-05 / POST-06:** missing `next=` uses the fallback; substring presentation only when the engine asked to present that item; assisted applies to the same criterion after any support.
6. **POST-13 / POST-17:** a v2 judge and a v2 reviewer that read `evaluatorView` and JSON anchors only, and refuse v1-shaped records.
7. **POST-16 / POST-19:** fix the rubric's insufficient-evidence rule; produce a blind educator pack with an independence declaration.
8. **POST-14** (pre-existing, separate change), then the P3 items (POST-08, -09, -15, -18, -20).
9. **Re-run this audit suite.** Every currently failing scenario becomes a regression test. Re-audit before the live benchmark.

## 5. Proposed controlled live benchmark plan (NOT executed; needs separate explicit authorisation and a confirmed hard cap)

### 5.1 Fixed configuration (record exactly at run time; do not assume availability)

| Item | Value to pin |
|---|---|
| Fixture | `ltb-fixture-v2`, 120 cases / 219 turns, SHA-256 `e72d2a6d3c083240efc0513055c1670a2dea5f12c5e17d3a832746a86713c0c2` (re-verify) |
| Tutor model / effort | As configured at run time (historical: `claude-opus-5-5`, effort low). **Verify the served model** per attempt (`modelServed`). |
| Policy revision | `ltc-v1-r4` plus the fix revision (bump the label when the fixes land) |
| Runtime commit | Exact commit or working-tree hash of `backend/src` at run time (record the SHA-256 of the 6 engine files) |
| Answer-key version | Fixture v2 items (hash per case) |
| Rubric | `ltb-rubric-v2` **frozen after educator review** (hash) |
| Evaluator input | `evaluatorView` only (enforced by the v2 judge; validator run as a gate) |
| Judge model / effort | Pinned at run time (historical: `claude-sonnet-5-5`, effort medium). Must differ from the tutor. |
| Independent review | Blind, case-isolated, different model from judge and tutor; sealed and hashed before comparison |

### 5.2 Repeated-run design

- **Runs:** two independent full runs (fresh sessions and DB, independent run ids, no reused outputs). A third run if outcome disagreement between runs exceeds the pre-set threshold, or if any cohort differs by ≥ 3 cases.
- **Report:** per-case outcome stability; per cohort, CEFR and situation type; marker reliability; cost and latency per run.
- **Limitation:** the r3 study saw 16/36 cases change outcome across identical runs, so **two or three runs show variance but do not establish long-term reliability.**

### 5.3 Scoring layers, kept separate in the report

1. Tutor structured assessment (marker).
2. Deterministic answer-key result.
3. Automated v2 judge.
4. Independent AI review.
5. Qualified educator review (sample).
6. Final adjudicated result, with disagreements and UNCERTAIN cases listed explicitly. **No single merged score.**

### 5.4 Cost estimate (from measured v1.0 usage; price catalogue: Opus $4 / $20, Sonnet $2 / $10, Haiku $0.1 / $0.5 per M tokens)

| Component per run | Calls | Input tokens (est.) | Output tokens (est.) | Expected | With retry margin (×1.5) |
|---|---:|---:|---:|---:|---:|
| Tutor (Opus) | 219 | ≈ 540k (v1.0: 475k + longer r4 block) | ≈ 60k (v1.0: 55k + markers) | ≈ $3.4 | ≈ $5.1 |
| v2 judge (Sonnet; 132 incl. 12 self-consistency) | ~134 | ≈ 670k | ≈ 110k | ≈ $2.4 | ≈ $3.6 |
| Independent review (Haiku) | 120 | ≈ 650k | ≈ 450k | ≈ $0.3 | ≈ $0.5 |
| **Per run** | | | | **≈ $6.1** | **≈ $9.2** |
| **2 runs (+ optional 3rd)** | | | | **≈ $12 (≈ $18)** | **≈ $18 (≈ $28)** |

**Hard stop:**
- harness `--cap` per run;
- the app's test-spend cap;
- gateway maximum of 2 attempts;
- the reviewer and judge stop at their caps.

**The user selects and confirms the cap.** This audit does not set it. Live mode requires `--authorized-paid-run`.

### 5.5 Proposed acceptance thresholds (proposals only, not approved product requirements; fix before the run)

| Area | Proposed threshold |
|---|---|
| Critical pedagogical defects | 0 in any run |
| Hint leakage (rubric D7 ≤ 1, before an attempt) | ≤ 2% of support turns. Any instance is reviewed by an educator. |
| Incorrect progression (item done or open mismatch vs fixture targets) | 0 in deterministic checks |
| Marker reliability | ≥ 98% `markerStatus=ok`. 0 marker text in visible or stored replies. |
| Lesson-item presentation verbatim | ≥ 95% of exercise requests. Failures make the case INVALID, not a pass. |
| Grammar / attribution errors | ≤ 1% of turns flagged by the judge **and** confirmed by an educator sample |
| Rubric agreement (judge vs reviewer; educator vs educator) | Outcome κ ≥ 0.6 before any headline is reported |
| Outcome stability | ≥ 85% of cases with the same outcome across runs |
| Cohort consistency | No cohort's MEETS rate differs from the overall by more than the run-to-run variation observed |

**The old 70% internal target is not used as a pass criterion.**

## 6. Unverified assumptions and residual risks

- Model compliance with all prompt-level controls (POST-11): unknown.
- The 304-file historical baseline was recorded by the remediation itself. It is corroborated by three independent manifests (ageband run, AI review, diagnostic).
- Concurrency relies on the UI not sending overlapping requests (POST-07).
- The engine reads only the last 12 messages; very long chains on one item could lose hint history (documented by the remediation, not re-tested).
- Educator validation of rubric v2: none.

## 7. Exact commands run in this audit

```
git branch --show-current; git rev-parse HEAD; git log --oneline -3; git status --short; git diff --stat   (read-only)
python3 hash checks against preflight_hashes.txt, implementation_manifest.json, ageband manifest.json, ai_review_manifest.json, diagnostic_manifest.json
cd backend
npx vitest run --config test/audit-post-remediation/vitest.audit.config.ts                      # exit 1: 132 pass / 20 fail (findings)
npx tsx benchmarks/ltc-v2/run_fixture_v2.ts --mode dry --cases <fixture_v2> --out <audit>/dry_run_reproduction   # exit 0, $0
npx tsc --noEmit -p .                                                                            # exit 0
npx tsc -p . --outDir <scratch>/audit_reg/build                                                  # exit 0
npx vitest run <9 targeted files>                                                                # exit 0: 273/273
npx vitest run                                                                                   # exit 1: 1539 / 16 pre-existing
npx tsx <scratch>/probe_stream.ts ; npx tsx <scratch>/probe_cls.ts                               # local probes (no network)
```

## 8. Confirmations

- **Product code:** none modified. All 12 remediation files are byte-identical to `implementation_manifest.json` after the audit.
- **Historical artifacts:** none modified.
- **Git:** no commit, push, merge, reset, stash or checkout.
- **Environments:** no staging or production access; no deployment.
- **Data:** no database migration. Only disposable in-memory test databases were used.
- **Configuration:** no env, provider, API-key, budget or `AI_TEST_SPEND_ID` change.
- **AI calls:** no paid calls; no external model evaluation; no live benchmark.
- **Identifiers:** no learner identifiers sent anywhere (ST-08; dry run 0 leaks).
- **Discovered defects:** documented with proposed fixes. **None were applied.**
