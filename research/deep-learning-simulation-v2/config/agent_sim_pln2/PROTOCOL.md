# SIMULATION ONLY

# PLN2: planner2 against the ESL6 LE setting (pre-registration)

Written 2026-11-19 on branch `claude/tutor-planner2`, before any PLN2 session. Nothing below may change after the first tutor reply is applied; any departure goes in `config/agent_sim_pln2/DEVIATIONS.md`. No real learners take part and no API is called: tutors, judges and scorers are agents (at most 3 running at a time). The exact commands are in `RUNBOOK.md`. Runner: `src/offline/pln2Study.ts` (built from `esl6Study.ts`); analysis: `src/offline/pln2_analyze.py`.

This study is **descriptive**. With 12 learners per group and one replication it cannot show that planner2 helps; it checks that planner2 does no harm and that its lessons fit the learner as designed. Approved design of planner2: `docs/tutor/PLANNER2_REPORT.md`.

## 1. Questions

1. **No harm:** with the lesson planner on (P2), is the 7-day delayed score on the primary items no worse than with it off (OFF), overall and in each learner group?
2. **Fit:** do P2 lessons fit each group's intended lesson shape as well as or better than OFF lessons (blind fit judging), and does the P2 quick check stay free of teaching?
3. **Planner behaviour:** do the shapes and stages the planner picks in the simulation match the approved table (TASK → task-based, TTT → test-teach-test or PPP after the check, LAD → listen-and-do, KIDPPP → PPP with child supports)?

## 2. Arms (exact configuration)

### OFF = the ESL6 LE arm
- **Env:** `ENARA_ENGINE_V2="wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5,graderV2"` (ESL6 `ENV_OF.LE`, unchanged).
- **Prompt:** exactly as ESL6 LE builds it (`esl6Study.ts` `planOf` + `langCtx`, same engine glue): the learning-focus block (`selectTeachingPlan`, `planLines`, the integrity and quick-check lines, `arbitratePedagogy`), then the language context (`detectTurnSignals`, `selectLanguageMoves`, `esl5Adjust`, `researchSignals`, `ruleFirstDecision`, `renderLanguageContextPrompt`), then the conversation. Reply handling as ESL6 (`stripAssessmentMarkers` → `applyReplyGuards` → `completeLanguageTurn`, ENARA's stored record).
- **One addition (both arms):** the trusted age band is known and reaches the language engine (`deriveLearnerContext({ trustedAgeBand: { band, status: 'known', source: 'student_age_band' } })`), so the child/teen/adult register and length rules apply in both arms. The PlanInput also carries `ageBand` in both arms (ped-v2 reads it only under `methodSelect`, which neither arm has, so the OFF plan is unchanged). The course level label is the learner's own (B1 / A2 / A1 / Pre-A1); the PlanInput grade level follows the ESL6 mapping (A1 and Pre-A1 → 4, A2 → 9, B1 → 18) and `masteryEstimate` adds 0.5 for "developing" (ESL6 had no developing learner).

### P2 = OFF + `planner2`
- **Env:** `ENARA_ENGINE_V2="wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5,graderV2,planner2"`.
- **Prompt:** the live `learningContext.buildObjectiveContext` planner2 path, replicated without a database:
  - PlanInput as OFF (plus `ageBand`); planner signals from code only: `ageBand`, `ageYears` (children only, as from a staff-entered birth date), course `level`, `goal` (TASK: work / exam / daily; TTT: school).
  - Session history = the session's earlier turns with each tutor turn's stored language-turn evidence (`assessment.verdict`, `diagnosis`, `ownSentence`, …). If 2 or more stored diagnoses are Arabic-transfer codes (`L1_TRANSFER_CODES`), the in-session `l1_transfer` misconception (status suspected) is added to the PlanInput, as `learningContext` does.
  - `progress = progressFromHistory(history)`, `opener = reviewOpener(signals, input)`, `lesson = planLesson(input, { ...signals, ...quickCheckSignals(signals, progress, opener) })`, `stage = stageNow(lesson, progress)`.
  - The learning-focus block = header and target lines, `planLines(lesson.plan)`, then `shapeLines(lesson, stage)`, then the integrity and quick-check lines (same order as `learningContext`). `planPrimary` for the language engine = `lesson.plan.primary`.
  - **Quick check** (`lesson.shapeRule === 'S4q'`): the language context drops the `QUICK_CHECK_DROPPED` moves, skips `ruleFirstDecision` (no rule-first line, no explicit-first flag) and appends `QUICK_CHECK_LINE` to the prompt, exactly as `buildLanguageTeachingContext` does when `quickCheck` is set.
  - `planner2` also turns on the Arabic-transfer patterns in `diagnoseError` (`detectL1Transfer`): that is part of the arm.
- **Recorded per turn** (`turns[k].planner`): shape, shape rule, method rule, stage, quick-check flag, primary and supporting methods, child supports, Arabic-transfer count, the l1 misconception flag, the stage progress and the planner's explanation. OFF turns record the primary and supporting methods. Both arms store the item diagnosis code with the turn evidence (as `TutorMessage.languageTurn.diagnosis`); nothing in the language engine reads it, so OFF prompts stay as in ESL6.

### Same in both arms
The learner, its first message, the lesson data, the seeds, the judges, the tests and the grader. The first message is per group: TASK learners state their goal, so an OFF tutor can also build a goal task ("Hello! I need English for my job. Can we practise …?"); children: "Hi! Can we learn … today?"; teens: the ESL6 opener ("Hello! Can you give me an exercise on …?").

## 3. Frozen components (SHA-256 at the time of writing; re-hashed and confirmed by `init`)

| File | SHA-256 |
|---|---|
| `backend/src/services/engineV2.ts` | `2f2a68665796c1322ccbc56f9893c936505830037422a50172785b91a018e9a7` |
| `backend/src/services/lessonPlanner.ts` | `70398801a067399709636eb3b8110f8baa50013f10297719fe5966bcd453af90` |
| `backend/src/services/pedagogyPolicy.ts` | `f80072642fc070293e30c9b7b3a6d1f9ce7a291aa6f764146cae852fcf3f4ac4` |
| `backend/src/services/learningContext.ts` | `e04770f8982c8e77a54e7f66fa3cc92090df6554460acd6cbc9053767a55ec83` |
| `backend/src/services/strategyRegistry.ts` | `e78af1986f6f0e1c4f70f6ebbae2473e48801edcbeb013ea654c8a3b4fc4cb21` |
| `backend/src/services/languageTeachingContext.ts` | `a137619242368092113f07ec1c17137dc2c5beaa6e7e892de05d48a13ed2fe5e` |
| `backend/src/services/languageTurnPipeline.ts` | `2673ec40c37eec5a66ee364b5d0d65054d809bd2f38ff13f48b6843f93dfd9b1` |
| `backend/src/services/languageLearningState.ts` | `d6ad94373485734fe2cd8b52a849a4af1c7b0055c3566d4bb72425b4837a2927` |
| `backend/src/services/learnerLanguageProfile.ts` | `78e783f1d129339aa84e45fc6d49a3a2090ff09fe4f103793fb21ad936f56ec4` |
| `backend/src/services/strandLog.ts` | `0e45c79426e1b6321f8f40f282d4d502f86accb0e338882bd8f21fff88a05553` |
| `backend/src/services/graderV2.ts` (round-12) | `f4df7ca84ce482e237ab37a4c7057d8b0cd9c5a1c234bcbb609f8a5afc7150ef` |
| `backend/src/services/grading.ts` | `dc0080001018d3cf7fae39b0a3919fa4e1ddd4a115136543ca1f586d234e601c` |
| `data/assessments/outcomes/*.json` (all files, concatenated in name order) | `bf78f551a5292cd88632794618922bebf4f02efe372ece6d945a78a3be4383e4` |
| `docs/SCORING_RUBRIC.md` | `ae4c65673269a2fb31bdd974e9c51ef33a57d83776dc4d8c96fbb00c63ba4bb3` |
| `src/offline/esl6Fixtures.ts` | `bda973481e314b0532557296e78dbd0679a0688f42ff8aa7b70a6f7189fa1cb7` |
| `src/offline/eslFixtures.ts` | `7b616767502fc64d5f14ec2d2b8dbfc7e2019ac3e2612926425cb29500a3ebb6` |
| `src/offline/esl6_forget.py` | `8cf37577da5cdb5d574a63cb2e8db6e0504a4814b039134292335072a2a960c1` |
| `src/offline/esl6_outcomes.py` | `3a39d975457fc30c83f4b7e57c8816b06a0868648f9c72faade83da6fc92d34d` |
| `config/agent_sim_esl6/LEARNING_RULES.md` | `c705d576da041c9ba012c105b4f6237f682a549a8c36089a6f33bdf31ddf8c4c` |
| `config/agent_sim_esl6/F1_PARAMS.json` | `f75f568059c95cb5b5fb6aa63bb318ce594533852eaa8831c212411d4ee1d584` |
| `config/agent_sim_esl6/ITEM_BELIEF_MAP.json` | `0777abaf88d5e952b0d1a184b254a6c698fa839f578337a49fff95aabaa751d7` |
| `config/agent_sim_esl6/WRONG_ANSWERS.json` | `79a5d9bd40ab9e193c9a86ae6fb69e44e3e8db4c88837e9674f1fb31f283a81e` |
| `config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md` | `cebaa834dd5522bb142f3d69e53254e298a6365bc1e41076c1c598b623a93a59` |
| `config/agent_sim_pln2/FIT_INSTRUCTIONS.md` | `9c40558e204c3be7df6934f82377bf3a12e4fa5722cd30055d2995de0cba0915` |
| `config/agent_sim_pln2/tasks/TUTOR_TASK.md` | `b432fd70b554af3b6b6242375cb5bc1490271dba51576ea2ccb1489811e5941b` |
| `config/agent_sim_pln2/tasks/JUDGE_TASK.md` | `f498b85b6e073f19c2c983cf92d8a5517333bbd8f7fce8f82d061b1340182ab6` |
| `config/agent_sim_pln2/tasks/FIT_TASK.md` | `492c96d1851d9ae5fe69c5eaf147da4181e7c7a5d0c2a4b8272f4d226d86ee26` |
| `config/agent_sim_pln2/tasks/RECHECK_TASK.md` | `148099d04d88192cf0e02b8a968baa86afa40ffedb0357d340f208d57524e9ef` |
| `src/offline/pln2Study.ts` (this runner) | `2893297ae34e7d3d8e5d37b355e590be273a170905772f3c562e81e5f6d5b38c` |
| `src/offline/pln2_analyze.py` (this analysis) | `a12f50f7e993b1af899c115a464efe8c59778268112f6f3b5c569abd4d8b739b` |

`graderV2.ts` is the round-12 grader (ESL6 amendment A3). The engine files are hashed as they stand in the working tree of this branch at the time of writing.

## 4. Learners (48 new learners, ids 2000–2047, seeds `pln2|L<id>|rep1`)

| Group | Ids | Age (signals) | Course level | Goal | Status | Simulator start state (LEARNING_RULES §1, §1b) | Outcomes |
|---|---|---|---|---|---|---|---|
| TASK | 2000–2011 | adult | B1 | work / exam / daily, rotating | developing | A2 band start: the primary wrong belief at 2 (a fossilised A2 error), the other at 1, C1 = 1 | the 12 A2 form outcomes (11 GR + polite requests), one each |
| TTT | 2012–2023 | teen | A2 | school | 8 developing, 4 emerging | 8 "mostly known" (every W = 0, every used C = 1: about 0.95 right per probed item, but not secure: 0.2 error after F1 unless C reaches 2) and 4 with the A2 band start (positions 2, 5, 8, 11) | the 4 A2 VO outcomes + 8 seeded A2 form outcomes |
| LAD | 2024–2035 | child, aged 6, 7, 8 (rotating) | A1, every third Pre-A1 | none | not assessed / emerging, alternating | A1 band start (primary W = 3, other W = 1, C = 0) | the 6 A1 VO outcomes + 6 seeded A1 GR outcomes |
| KIDPPP | 2036–2047 | child, aged 9, 10, 11, 12 (rotating) | A1 on A1 outcomes, A2 on A2 outcomes (alternating) | none | not assessed / emerging | A1 or A2 band start | 6 A1 + 6 A2 outcomes: the bank outcomes no other group uses, filled up by seeded choice |

- Outcome assignment, primary belief (W2 on odd positions of two-belief outcomes) and Latin-square form sequence (position mod 3: A/B/C, B/C/A, C/A/B) are deterministic (`outcomePlan()` in the runner; listed in `LEARNERS.json` at `init`). All 30 bank outcomes are used at least once. The bank has A1 and A2 outcomes only, so the B1 TASK learners are tested on A2 forms (their fossilised error).
- **Quick-check split (TTT):** the 8 / 4 mix is chosen so that about 2/3 of the TTT learners get ≥ 2 of the 3 quick-check items right and both planner branches (TTT and PPP after the check) occur. Predicted from the start state with the session dice (every belief probed, no state change during the check): **8 of 12**. The realised split is reported (`tttSplit` in the analysis).
- **Expected planner picks** (checked on the start state with `pln2Study.ts plans`): TASK → TASK (S3), main method formative feedback (shape default); TTT → quick check (S4q) then TTT (S4, ≥ 2 right) or PPP (S5); LAD → LAD (S2b under 9, S2a Pre-A1); KIDPPP → PPP with child supports (S2c). OFF: worked examples (M7b) for all 48.
- **Overlap check** (`init`): no learner id clash with any earlier study (reports/exp4, config/agent_sim_esl1–6, code-defined ranges up to teach2 1100–1799) and no earlier seed in the `pln2|` namespace. Folders with a `DRY_RUN` marker are skipped.

## 5. Design

- **One session of 5 turns (5 rounds)**, as ESL6 amendment A1, then F1 v2 for **7 days** before the delayed test. One replication: 48 learners × 2 arms = **96 sessions**, 480 tutor turns.
- **Tutor cells:** arm × (learner id mod 3) → **6 cells of 16 sessions per round** (4 learners of each group per cell), one Sonnet tutor agent per cell (`tasks/TUTOR_TASK.md`). A cell holds one arm only, so no tutor agent sees both settings.
- **Event judging:** the ESL6 judge task (ESL2 `JUDGE_INSTRUCTIONS.md`, ESL6 `LEARNING_RULES.md`, rules R1–R7 applied to the rule-based learner state through `esl6_forget.apply_events`), blind to the arm (the hidden marker and the word ENARA are removed). **72 cases per batch** (2 batches per round: 72 + 24). Opus. The learner's next message comes from the judge's `next_task` and the seeded dice (LEARNING_RULES §2, §2a, §3a).
- **Event-judge agreement:** a stable 10% of all 480 event cases (`rand('pln2-agree', caseId) < 0.1`, 44 cases; the case ids are fixed by the session keys) judged a second time, blind, in one batch after round 5 (`agreeprep`); compared as in ESL6 (state after each judge's events, `esl6_forget.comparable`).
- **Fit judging:** section 7.
- **Grader recheck:** as ESL6 §10.5 with amendment A2 (10% of all scored answers, distinct item+answer pairs once per scorer, 3 Opus scorers, 40 per batch). Reported, not a pass rule.
- **No session is dropped;** failed work is kept as `PARTIAL_*` and rerun.

## 6. Measurement (unchanged from ESL6 §7)

Outcome assessment bank `data/assessments/outcomes` (forms A, B, C; 9 items, 12 points), answered deterministically from `config/agent_sim_esl6/ITEM_BELIEF_MAP.json` + `WRONG_ANSWERS.json` with the seeded dice, scored by the deterministic production grader (graderV2 on, model path off). Pre-test (start state), immediate test (end of the session), delayed test (after 7 days of F1). **Primary score:** share of the points on the primary items (gap-fill and choice; ESL6 DECISIONS 11).

## 7. Fit judging (new)

- **Cases:** one per finished session (96): learner line (age, course level, goal for TASK), lesson title and objective, the group's rubric, and the whole transcript (tutor text after the reply guards; hidden marker removed; "ENARA" replaced by "the tutor"). The arm is hidden; case ids are hashes of the session key; `fit/KEY.json` maps ids to session, arm and group.
- **Instructions:** `FIT_INSTRUCTIONS.md`; task `tasks/FIT_TASK.md`; Opus; **12 cases per batch** (8 batches, cases of both arms and all groups mixed in a seeded order). Each item is scored 0 / 1 / 2 with a one-line reason; JSON output.
- **Rubrics** (each item 0/1/2):
  - **TASK:** `task_goal` a real-life task tied to the learner's goal happens; `feedback_after_task` language feedback comes after the task, on 1–2 errors; `task_repeat` the task is repeated or extended using the fix.
  - **TTT:** `test_first_clean` the first three items are given with no teaching, hints, corrections or answers; `teach_targets_gaps` afterwards teaching targets only what was wrong; `retest_end` the lesson ends with a re-test item.
  - **LAD:** `story_chant` a short story or chant using the target words; `listen_do_steps` listen-and-do instructions (point, tap, say, draw) one at a time; `child_tone` child-appropriate length and tone (praise effort, no "wrong").
  - **KIDPPP:** `short_sentences`, `one_instruction` (one instruction per message), `praise_effort`, `game_story` (a small game or story frame), `ppp_order` (a clear present → practise → produce order).
  - **All groups:** `age_fit` (0/1/2) and `teacher_accept` ("would a qualified ESL teacher accept this lesson", 0/1/2).
- **Fit-judge agreement:** a stable 10% of the fit cases (`rand('pln2-fitagree', caseId) < 0.1`, 12 cases) judged again blind in `fitagree/` (1 batch); agreement = share of identical item scores (within-1 also reported).
- The transcript ends after turn 5, so items about the end of a lesson (`retest_end`, `task_repeat`, the produce step of `ppp_order`) are judged on 5 turns; both arms have the same length.

## 8. Analysis (`pln2_analyze.py`, descriptive)

Per group and overall: delayed primary score P2 − OFF with a paired 95% percentile bootstrap CI (10,000 resamples of learners, seed 7); immediate primary score; whole-form delayed score; pre-test (balance); stuck runs (ESL5 definition); two asks; early answer leaks (ESL5 definition) and answers after two failed attempts; mean reply words; fit scores per rubric item by arm and each group's own-rubric mean (paired CI); quick-check compliance; the P2 shape/stage distribution per group and per turn with the shape match rate, the method rules, the TTT quick-check split and the Arabic-transfer counts; event- and fit-judge agreement; the grader recheck. Output `ANALYSIS.json` and `ANALYSIS.md`. The analysis states `complete = false` and lists what is missing if any part is absent.

**Quick-check compliance:** a P2 TTT session with at least one quick-check turn is compliant when the fit judge scores `test_first_clean` 2 and no quick-check turn contains the answer of a lesson item (`leakFinal` or `earlyLeakFinal` > 0). Any teaching move, hint or answer during the first 3 items is a violation; teaching words in quick-check turns are counted separately (descriptive).

## 9. Pass rules (fixed now)

1. **No harm:** the overall delayed primary difference P2 − OFF has a 95% CI lower bound **> −0.05**, and **no group's mean difference is below −0.05**.
2. **Fit:** on **each** group's own rubric, the P2 mean fit score is **≥** the OFF mean, and P2 **quick-check compliance ≥ 95%** (with 12 TTT sessions this means no violation at all).
3. **Judges:** event-judge agreement **≥ 85%** and fit-judge agreement (identical item scores) **≥ 85%**, with no missing cases.

**PASS** only if all three hold and the data are complete (48 learners × 2 arms, 5 judged rounds, 3 tests, 96 fit cases, both agreement samples). Otherwise **NOT PASSED**, with the failing rule named. Nothing else (subgroups, single items, the planner-match tables) is presented as a pass.

## 10. Limits and known issues (stated before any session)

1. Simulation only: hand-written learning rules, agent tutors (Sonnet), agent judges and scorers (Opus). Nothing here is evidence about real learners.
2. Small: 12 learners per group, one replication; every CI is wide and the study has no power to show a benefit. The no-harm rule is a screen, not a test.
3. The bank has only A1 and A2 outcomes: the TASK learners (B1 label) are tested on A2 forms; LAD children are tested with written forms although LAD lessons are oral in style.
4. Five turns per lesson: TTT learners spend turns 1–4 in the quick check (the third answer is graded on turn 4), so a TTT or PPP-after-check lesson gets at most one teaching turn. Fit items about the end of a lesson are judged on 5 turns.
5. Lesson fixtures have at most 2 practice items for some outcomes and none for 3 (ESL6 §5a); the quick check needs 3 items, so tutors write some of their own.
6. **Planner behaviour found while building the harness (replicated as live; backend code not changed):**
   a. `stageNow` subtracts the first 3 graded answers for every PPP and LAD lesson once 3 answers are graded, because `progressFromHistory` sets `quickCheck` whenever `tries >= 3`, whether or not a quick check ran. Children (S2b, S2c, Pre-A1), learners of unknown age (S6) and teens/adults with a review opener therefore drop back to "present" / "listen" at the 4th graded answer (seen in the dry run: KIDPPP and LAD turn 5).
   b. The TASK stages never pass "task": `progressFromHistory` never sets `taskDone`, so "language focus" and "repeat the task" are never reached.
   c. During the quick check the learning-focus block keeps the main method's full teaching instructions (for example Worked Examples: "solve one completely…") and the language context keeps the confirm moves ("confirm it as correct"), next to `QUICK_CHECK_LINE` ("Do not teach, explain, hint, correct … say only a short neutral thanks").
   d. The quick check stays pending until 3 answers get a graded verdict; answers the engine cannot grade (NOT_EVALUATED) keep the learner in the no-teaching check with no cap.
7. The P2 arm also changes the item diagnosis (Arabic-transfer patterns), which is part of planner2 and not separable here.

## 11. Run plan

`RUNBOOK.md` (exact commands and the number of agent task files per step). **Dry run** (scripted replies, judges, fit judges and scorers; no agents) of the whole pipeline, 2026-11-19: 96 sessions, 6 cells × 5 rounds, 2 judge batches per round, 0 rejected events, grader null 0, agreement sample 44 cases, fit 96 cases in 8 batches + 12 agreement cases, recheck 242 distinct pairs (7 batches per scorer), analysis complete with every table. Dry output is never committed (`reports/exp4/agent_sim_pln2_dry/` is git-ignored).

## Changes before the first real run (19 Nov 2026, no agent run yet)
The harness build found 4 planner bugs; fixed in `lessonPlanner.ts` (tests in `planner2.test.ts`) and re-verified with the full dry run:
1. PPP/LAD lessons without a quick check (children, unknown age, review openers) were reset to the first stage at the 4th graded answer. Now only a lesson that really opened with the check discounts the test answers (`quickCheckUsed`).
2. TASK lessons never left the "task" stage. Now: pre-task, task (the opening message plus 2 role-play answers), language focus, then repeat after a right fix.
3. During the quick check the main method's instructions were still in the prompt next to the no-teaching line. Now they are replaced (`QUICK_CHECK_PLAN_LINE`), and the quick-check line says it overrides any instruction to confirm, correct, explain or model.
4. The quick check had no cap. It now closes after 4 learner answers with whatever was graded (0 graded: PPP); a TTT lesson then goes to "teach", not back to "test".
Hashes in §3 refreshed after these changes.
