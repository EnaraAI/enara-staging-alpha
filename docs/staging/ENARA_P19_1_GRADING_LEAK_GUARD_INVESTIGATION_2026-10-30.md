# ENARA P19.1: grading leak-guard investigation (2026-10-30)

| | |
|---|---|
| **Status** | **PASS_WITH_FINDINGS**. Both withheld grades were **correct leak-guard decisions** (true positives). No data-association, concurrency or provider fault. Two guard weaknesses are confirmed and documented for an owner decision; no production logic was changed |
| Scope | Local diagnosis on the **exact evaluations the real AI produced in P19**, read from staging read-only through the teacher grading view |
| Mocks | None. Your standing instruction ("don't ever use a mock provider") was kept: the guard is a pure function and was tested directly on the real outputs, with no provider involved |
| No… | Deploy, commit, push, paid calls, data changes or configuration changes |

## 1. The two workflows and their evidence

| | W054 | W094 |
|---|---|---|
| Run id | `p19-w100-20261030-W054` | `p19-w100-20261030-W094` |
| Student / class | `STU97640115`, Class 2 (evaporation) | `STU02271025`, Class 2 |
| Answer quality (by design) | Misconception | Misconception |
| Submission | `att-1793380280832-u3w7`, submitted 17:11:39 UTC (7:11 PM Cairo); q1 "Condensation" (0/1 by key), q2 "The wind pushes the water out of the clothes and it drips onto the ground. (W054)" | `att-1793380339023-23f2`, submitted 17:12:46 UTC (7:12 PM Cairo); same answers, tagged W094 |
| Assignment / assessment | `asg-291e92e4-…` / `ASM127096` | Same |
| Grading runs (attempt history) | 17:11:39 failed; 17:12:42 failed (+63 s backoff); 17:22:43 **exception** (+10 min backoff). Reason every time: `feedback_leak: Feedback for question q2 reveals the model answer` | 17:12:46 failed; 17:13:49 failed; 17:23:53 **exception**. Same reason |
| Evaluations (grading proposals) | 6 = 3 runs × 2, all `status: proposed` (none accepted) | 6, all `proposed` |
| Final state | `grading_exception`, `exceptionReason: feedback_leak`, **score null**; student sees "delayed"; in teacher 2's grading queue | Same |

**Retained evidence:**
- `backend/test/fixtures_p19_1_leak_cases.json`: the 12 evaluations and 3 released controls (synthetic staging data);
- the P19 results JSON (request ids, timings);
- the P19 run logs.

## 2. How the guard decides (code reading, confirmed by test)

1. Each grading run makes **two** independent AI evaluations of the open answer (`evaluateOpen`). If they agree on the score, **the first one (`runs[0]`, "run 1") is the one released**; the second only confirms the score. On disagreement a third evaluation decides.
2. `validateGrading` (production mode `v1`) rejects the run if the released text (feedback, score explanation, strengths, improvements) contains **any 8 consecutive words of the hidden model answer**. Tokenisation: lower case, split on whitespace.
3. A rejected run is retryable: backoff of 60 s, then 10 min. After 3 runs the attempt becomes `grading_exception` and goes to the teacher. No score is ever stored.

## 3. Classification

| Possible cause | Verdict | Evidence |
|---|---|---|
| **Legitimate leak-guard detection** | **CONFIRMED (both cases)** | All 6 released ("chosen") evaluations contain an 8-word run of the model answer. The common run is **"water particles more energy so more of them"** (W094 run 1 also has "particles more energy so more of them escape" and "more energy so more of them escape as"). Typical sentence: *"Describe how warmth gives water particles more energy so more of them escape into the air."* The model answer is *"Warmth gives the water particles more energy so more of them escape as vapour, and the wind carries the vapour away so evaporation continues faster."* |
| False-positive guard decision | **Rejected** | The flagged text restates the hidden answer's mechanism nearly word for word, in violation of the grading prompt ("Never reveal or quote the model answer … in feedback, strengths or improvements"). v2 also blocks all 6 |
| Invalid or ambiguous assessment configuration | Not a defect; **contributing factor** (hypothesis, supported) | The model answer is written in the same plain words a corrective improvement naturally uses. Collisions concentrate on wrong answers in Classes 2 and 4, where feedback must teach the mechanism |
| Rubric or prompt-construction defect | **Contributing factor** (confirmed behaviour, not a code defect) | The prompt forbids quoting the model answer, yet the model paraphrased it closely in 14 of 112 runs. The prompt is unchanged here; changing it is an evaluated product decision |
| Data-association or context-isolation issue | **Rejected** | Every evaluation carries its own attempt, assignment, question (`q2`) and school. 6 distinct evaluations per attempt, 2 per run; no other student's text (test: association) |
| Concurrency or orchestration race | **Rejected** | Runs are sequential with the designed backoffs (63 s, 10 min); one lease per run; no duplicates; nothing released |
| Provider or infrastructure failure | **Rejected** | All 226 grading provider calls returned `ok` (P19 ledger); the rejections are application validation |

**Scope check (all 14 rejected runs in P19):**
- W054 ×3, W094 ×3, W016 ×2, and W036, W052, W056, W068, W074, W076 ×1 each.
- In **every** rejected run the chosen evaluation contains an 8-word model-answer run.
- In every run that released, it does not.
- All 14 are true positives.

## 4. Confirmed findings beyond the two cases

| Id | Finding | Evidence | Impact |
|---|---|---|---|
| **F-1** | **The released evaluation is always `runs[0]`, even when the agreeing second evaluation would pass the guard.** W054 had a same-score partner (`gp-d0e7bc8a…`) that passes **both v1 and v2**; W094 had one (`gp-4f889ed3…`) that passes v1 only | Test "chosen … partner" rows | Valid, guard-passing feedback was discarded and the whole run retried. Under a "release an agreeing evaluation that passes the guard" rule, W054 would have completed without weakening the guard |
| **F-2** | **v1 is punctuation-sensitive (a false negative).** W034's released improvement reads *"…gives water particles more energy**,** so more of them can escape…"*: the same 8 words, split by a comma. v1 let it through; v2 (punctuation-normalised) flags it | Test "released controls": W034 v1 = passed, v2 = `feedback_leak` | Leak protection is weaker than intended, and outcomes for near-identical feedback depend on punctuation |
| F-3 | The v2 code comment claimed "never flags more than v1". W034 is a counterexample | Same test | **Comment corrected** (the only source change in P19.1) |

## 5. Local reproduction and regression results

**New test `backend/test/p19_1LeakGuard.test.ts`:** 4 tests, all pass. Pure function; no provider, mocked or real.

| Test | Result |
|---|---|
| **Negative (original leak):** every chosen evaluation of W054 and W094 (3 + 3) is rejected `feedback_leak` by v1 (production) and by v2 | PASS |
| Association: each evaluation belongs to its own attempt, assignment, question and school; 6 distinct; 2 per grading run; none accepted | PASS |
| Released controls on the same assessment and misconception answer: W014 and W074 pass v1 and v2; W034 passes v1 and fails v2 (F-2 pinned) | PASS |
| Verbatim model answer always blocked (v1, v2); **positive:** feedback in the grader's own words passes (v1, v2) | PASS |

**Existing provider-free guard suite:** `gradingPolicy.test.ts` (leak-check v2 cases) passes. Combined: **12/12**. Backend typecheck clean.

**Not re-run:** `phase3.autograding.test.ts`, which covers validation of leaks before finalising. It uses a mocked provider, so I didn't run it, per your instruction. It passed in the P19 full-suite run (1069/1069), and the only P19.1 source change is a comment.

**Behaviour already proven live** (P19 staging, the two attempts):
- the blocked submission received **no fabricated grade** (score null, not released, student sees "delayed");
- **exception routing** is correctly associated (teacher 2's queue: right student, assignment and reason);
- repeated processing created **no duplicate grade or feedback** (6 proposals, none accepted; 3 runs; no release).

## 6. Code changes

| File | Change | Why |
|---|---|---|
| `backend/src/services/autoGrading.ts` | Comment on `leaksModelAnswerV2` corrected (F-3). **No logic change** | Evidence showed the comment was false |
| `backend/test/p19_1LeakGuard.test.ts` + `fixtures_p19_1_leak_cases.json` | New regression test on the real P19 evaluations | Pins the true-positive decisions, F-1 (partner passes) and F-2 (punctuation) |

**Not changed, deliberately:**
- the guard itself (the decisions were correct);
- the threshold;
- the chosen-evaluation rule (F-1 raises completion and is a grading-orchestration decision);
- punctuation handling (F-2 makes the guard stricter, overlapping the pending v1/v2 decision).

## 7. Is the guard still blocking unsafe cases?

**Yes.**
- All 14 real echoes from P19 are blocked by the production check.
- A verbatim model answer is blocked.
- Code and threshold are unchanged.

The only known gap is F-2: punctuation-split echoes pass v1. That makes v1 **less** strict than intended, never more lenient than before.

## 8. Decisions for the owner

1. **Guard tokenisation (F-2):** switch production to the existing `v2` (`leakCheck: 'v2'`), or normalise punctuation in v1. Either is stricter: W034-type feedback would be withheld too, unless F-1 is also adopted.
2. **Release a guard-passing agreeing evaluation (F-1):** when both evaluations agree on the score, release the first one whose text passes the guard. This doesn't weaken the guard; it reduces needless retries and exceptions. W054 is the evidence case.
3. **Grader prompt:** add an explicit instruction not to reuse more than a few consecutive words of the model answer in improvements. This changes evaluated grading behaviour and needs an evaluation run.
4. **The two exceptions:** they stay in teacher 2's queue for review under the existing policy. I did not regrade or release them.

## 9. Is a staging re-test necessary?

- **No, for the diagnosis.** The decisions are reproduced deterministically from the stored real outputs.
- **Yes, if decision 1, 2 or 3 is adopted.** Prerequisites for that re-test:
  - a code change with tests (local);
  - deployment approval;
  - a paid live sample of about 20 submissions of the Class 2 and Class 4 misconception and partial answers (≈ $0.6–0.9, within the remaining ~$5.6 of the $10 test cap);
  - stop rules as in P19.

## 10. Remaining risk

- F-2 under-blocking in production until decision 1.
- About 12% of runs rejected on wrong or partial answers in subjects whose model answers use everyday wording. That means extra cost and occasional exceptions.
- A third evaluation runs on disagreement: 2 occurred in P19, which is why the ledger shows 226 grading calls for 112 runs.
- Test-spend counter and provider console still UNVERIFIED (from P19).
