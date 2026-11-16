# ENARA Phase 1: Deep Diagnostic Analysis (read-only)

| | |
|---|---|
| Run analysed | `20261109T1211-ltb-v1.0-ageband` (r3 + Trusted Age Band) |
| Independent review | `20261109T1310-ltb-v1.0-ai-review` |
| Results | Official 90/120 MEETS; independent 75/120 |
| Execution | Repository inspection, existing transcripts and review records, and local replay of the engine's own pure functions (`confirmsCorrect` over the recorded replies) |
| Provider calls | **No AI-provider calls** |

## 0. Phase A: integrity of the sources

| Check | Result |
|---|---|
| Review manifest self-hash (`ai_review_manifest.sha256`) | OK |
| 5 deliverable hashes, 29/29 work-file hashes, 15/15 recorded input hashes | OK |
| Blind-seal hash of `independent_case_reviews.jsonl` | OK (`64f7aa6b…754e`) |
| Case-set SHA-256 | `725edb2b…a2bb`, matches the run under review |
| Records | 120 review records, 120 cases, 120 raw results, 120 score rows; identical ID sets |
| Turns | 219 |
| Evidence quotes | 544; 543 found verbatim in the cited turn. **1 discrepancy:** LTB-CA1-T06 t3 quotes two separate lines joined with " / " ("This is my grand**father**. **He** is old. 👴 / This is my grand**mother**…"). Both lines exist in the transcript; the joined string does not. This is a formatting artefact, not fabricated evidence. The historical record was not altered. |

## 1. Three separate questions

**A. Is the tutor technically behaving as implemented?** Mostly yes.
- The engine classifies turns and selects moves as coded, the trusted age band reaches every turn, and the tutor follows its move instructions.
- **One implementation defect was verified:** success detection from tutor prose (`confirmsCorrect`) misses explicit confirmations. Replayed locally, it missed **5 of 9** T08 confirmations, so the move-on instruction did not fire.
- Some faulty outputs are the tutor **faithfully following a flawed instruction**:
  - the strategy-shift text produces a false "only one word changes" claim in **3 of 3** strategy-shift turns;
  - the hint texts set no must-not-reveal limit.

**B. Is the tutor pedagogically sound?** Partly. The tutor is good at recognising correct English, register, and avoiding mastery claims. It is weak at:
1. **Calibrating hints.** There are 16 confirmed leak or near-reveal instances in 16 cases. The tested form is often named on the first hint.
2. **Progressing after demonstrated success.** The same item was presented three times in CA2-T08 and TA2-T08.
3. **Precise statements about grammar and about the learner.** There are 7 misleading or wrong statements in 219 turns (none critical), 1 attributed answer and 1 misquote.

**C. Is the benchmark rubric reliably measuring that quality?** Not reliably. There are three verified measurement problems:
1. **Fixture mismatch:**
   - **54 of 120 cases** script learner answers to an exercise the tutor never receives (`languageSpec` has no exercise field). **In 0 of 54** did the tutor present that exercise.
   - Independent MEETS is 25/54 for these cases and 50/66 for the rest; 29 of the 45 independent PARTIAL outcomes are in this group.
2. **Evaluator information asymmetry:** the judge and the reviewer were shown that exercise and penalised its absence.
3. **Rubric ambiguity:** 98 ambiguity notes on 95 cases, concentrated on formative checks, hint strength and answer sufficiency. 62 of the 90 official MEETS sit exactly at the 3.00 mean.

## 2. Confirmed problems (code and transcript verified)

| # | Problem | Layer | Severity | Key evidence |
|---|---|---|---|---|
| 1 | Hints reveal the tested form or reduce the item to copying; no hint state; no must-not-reveal rule | TUTOR_PROMPT + CONVERSATION_STATE | P0 | TA2-T13, AB1-T13, TA1-T13, CA2-T05, TA2-T05, TA2-T07, AB1-T06, CB1-T04 (+8 near-reveal) |
| 2 | Prose-regex success detection misses explicit confirmations, so the move-on rule doesn't fire | CONVERSATION_STATE | P0 | CA2-T08, CB1-T08, TA1-T08, TA2-T08, AA1-T08 (local replay) |
| 3 | No policy for a correct answer to a different item; demonstrated components are re-tested | TUTOR_PROMPT | P0 | CA2-T08, TA2-T08 |
| 4 | Strategy-shift instruction produces a false "only one word changes" claim and answer-adjacent pairs | TUTOR_PROMPT | P1 | AA1-T06, TA1-T06, CB1-T06 (3/3); TA2-T06 |
| 5 | Rule-example contradiction; negative cited under the affirmative rule | Generated (TUTOR_PROMPT lacks a control) | P1/P2 | CA2-T07 t4; AA2-T11 t1 |
| 6 | Attribution and quotation errors | TUTOR_PROMPT | P1/P2 | CB1-T08 t3; CA2-T03 t2 |
| 7 | Scripted answers target an unseen exercise; evaluators see what the tutor did not | FIXTURE_OR_BENCHMARK | P2 (measurement) | 54 cases; AB1-T04, CB1-T05, TA1-T04, TB1-T05 |

## 3. Not confirmed / rejected

- **"The tutor rejects correct answers":** **rejected.** In all five cited cases the tutor explicitly recognised the correct sentence. The failures are progression (#3), state (#2) and fixture (#7).
- **"Teen register is a problem":** **rejected.**
  - Teen age-fit is 3.08, no teen non-MEETS case has age-fit ≤ 2, and 39/40 cases are rated register-appropriate.
  - Outside exercise-first cases, teen = child (17/22).
  - Teen pedagogy dips trace to the fixture and to shared hint and progression defects.
- **"Ignored learner replies are common":** **mostly rejected.** 9 of the 11 official flags are not supported; the 2 supported ones are defect #3.
- **Instruction stacking** (base prompt + ped-v2 strategy + language moves, with no precedence) causing inconsistent hints: **hypothesis only.** No transcript isolates it.
- **The teen "up to two steps at a time" register line encouraging two-step hints:** **hypothesis only.** Weak signal, small n.
- **Formative-check weakness caused by prompt wording:** **partly supported** (the prompt does not require an unaided check); also a rubric ambiguity. MEDIUM confidence.

## 4. Where the 35 evaluator disagreements come from (case matrix)

| Source | Cases |
|---|---:|
| Judge variance / rubric ambiguity, no verified product defect | 23 |
| Verified product defect that the official judge passed as MEETS | 8 (AA1-T08, AB1-T06, AB1-T13, CB1-T08, TA1-T06, TA1-T12, TA1-T13, TA2-T03) |
| Verified leak that the independent reviewer passed as MEETS | 1 (TA2-T07) |
| Fixture mismatch or evaluator asymmetry | 3 |

**Neither the official 90 nor the independent 75 is a clean measure of product quality.** The official count passes cases with confirmed defects. The independent count is depressed by the fixture design, which affects both evaluators.

## 5. Technical vs pedagogical risks

- **Technical:**
  - brittle prose-regex state (#2);
  - no hint state (#1);
  - marker-stripping risk if R1 is implemented on the streaming path;
  - a benchmark harness that cannot present lesson items to the tutor (#7).
- **Pedagogical:**
  - learners not doing the tested step (#1);
  - learners re-tested on what they have already shown (#3);
  - occasional misleading rule statements (#4, #5);
  - statements about the learner that are not true (#6).
- **Evaluation:**
  - a headline driven by boundary cases;
  - evaluators with information the tutor lacked;
  - rubric ambiguity on the three most consequential judgements.

## 6. Deliverables in this directory

| File | Content |
|---|---|
| `diagnostic_summary.md` | This summary |
| `case_level_evidence_matrix.csv` | 120 rows, evidence-based classification. Severity: P0 12, P1 8, P2 35, NONE 65. For severity NONE the layer is `N/A`, since no root cause applies. |
| `correct_answer_recognition_analysis.md` | B1 |
| `hint_scaffolding_analysis.md` | B2 |
| `grammar_accuracy_audit.md` | B3 |
| `context_grounding_analysis.md` | B4 |
| `teen_cohort_analysis.md` | B5 |
| `rubric_v2_specification.md` | B6 |
| `remediation_architecture.md` | Phase D |
| `regression_test_specification.md` | Phase E |
| `diagnostic_manifest.json` | Hashes and read-only confirmation |

**Caveats:**
- The independent review used one Claude model from the same provider as the tutor and the judge.
- All classifications here are an AI agent's reading of the transcripts and code.
- **Human educator review is still required before rubric v2 or any remediation is adopted.**
