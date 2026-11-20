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
| `backend/src/services/engineV2.ts` | `ac1124a7bd7eacfbc63b6c3e88f45b8cce05354932f9e262063ee4d039656950` |
| `backend/src/services/lessonPlanner.ts` | `4f180cab2911ebed9cf93c02b6b3b193f74d4aad4ac3c996047b6d27542ee86b` |
| `backend/src/services/pedagogyPolicy.ts` | `f80072642fc070293e30c9b7b3a6d1f9ce7a291aa6f764146cae852fcf3f4ac4` |
| `backend/src/services/learningContext.ts` | `a012b90eb88d26c3891921694848219f5a37922b1552e9638f46c10fd0113d6d` |
| `backend/src/services/strategyRegistry.ts` | `e78af1986f6f0e1c4f70f6ebbae2473e48801edcbeb013ea654c8a3b4fc4cb21` |
| `backend/src/services/languageTeachingContext.ts` | `a501efeed194a8e9477cffd5c272d249533b3342256c5a46ce0a755dbbdb6796` |
| `backend/src/services/languageTurnPipeline.ts` | `36544d0651b59f4b2b157b627435ba1ca309862d513735b66cbae363b78c700c` |
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
| `src/offline/pln2Study.ts` (this runner) | `184527bab0412970994c650c985ac99050af9bf88f462ba90262a3215fa4d81f` |
| `src/offline/pln2_analyze.py` (this analysis) | `5e4501439d1f9a68de91cc13d71cb61d12d6c8131ac5db4d9b50997ef45b555c` |

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

- **One session of 7 turns (7 rounds; amendment B, was 5)**, as ESL6 amendment A1 but longer, then F1 v2 for **7 days** before the delayed test. One replication: 48 learners × 2 arms = **96 sessions**, 672 tutor turns.
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

## Amendment B (19 Nov 2026, before round 1, owner decision "go with B")
- **7 rounds instead of 5** (one session of 7 tutor turns). Reason: the teen quick check uses the first 3–4 turns, so with 5 rounds a TTT lesson had only 1–2 teaching turns against 5 in OFF; that would test the short simulated lesson, not the planner. All other groups also get 7 rounds, in both arms.
- **1 grader-recheck scorer instead of 3.** Reason: the same grader agreed 100% with 3 scorers in ESL6 (1,293 answers). The pass rule is unchanged (≥ 95% on gap-fill and choice items) and now compares the grader with this one scorer.
- Agent runs: ≤ 73 (42 Sonnet tutors, 14 event judges, 1 event-agreement, 8 fit judges, 1 fit-agreement, ≤ 7 recheck), instead of ≤ 71.
- Pass rules (§ above) unchanged.

## Changes before the first real run (19 Nov 2026, no agent run yet)
The harness build found 4 planner bugs; fixed in `lessonPlanner.ts` (tests in `planner2.test.ts`) and re-verified with the full dry run:
1. PPP/LAD lessons without a quick check (children, unknown age, review openers) were reset to the first stage at the 4th graded answer. Now only a lesson that really opened with the check discounts the test answers (`quickCheckUsed`).
2. TASK lessons never left the "task" stage. Now: pre-task, task (the opening message plus 2 role-play answers), language focus, then repeat after a right fix.
3. During the quick check the main method's instructions were still in the prompt next to the no-teaching line. Now they are replaced (`QUICK_CHECK_PLAN_LINE`), and the quick-check line says it overrides any instruction to confirm, correct, explain or model.
4. The quick check had no cap. It now closes after 4 learner answers with whatever was graded (0 graded: PPP); a TTT lesson then goes to "teach", not back to "test".
Hashes in §3 refreshed after these changes.

## Amendment C (19 Nov 2026, owner decision; the run restarts from round 1)
The first run was stopped before round 4 was judged (data kept in git history, last commit 024ead39) because two planner stage bugs made it unfit:
1. **Teens stayed in the quick check for rounds 1–3 and were never taught.** Cause: the check asked 3 items one per reply, and each answer was graded only in the reply after it, so the check needed about 5 replies. Fix: the quick check is **one item in the opening reply**; the learner's answer is graded by code **in the same turn** as the next reply (`currentKeyVerdict` → `progressFromHistory(history, current)`), so reply 2 already teaches: right → TTT at "teach" (S4), wrong or ungraded → PPP at "present" (S5). This replaces the approved "2 of 3" threshold with "the one check item right" (owner: "the quick check should be one step, then teach the gaps").
2. **Children's lessons stayed at "present"/"listen".** These stages set no exercise, so nothing was graded and the stage never moved. Fix: present/listen last for the opening reply only (was deviation 1 of the stopped run).
3. **New measure: use.** Wrong-belief strength does not measure what TASK and LAD aim at. Added: the share of the 6 points on the delayed test's own-sentence items (positions 7–9, 0–2 each for using the target form in the learner's own sentence), per group, P2 − OFF with a bootstrap CI; reported check P2 − OFF ≥ −0.05 for TASK and LAD (not part of the verdict; n = 12 per group). **Fluency is not measured:** the simulated learners' answers come from rules, with no speed or automaticity, so fluency needs real learners (pilot: response time and words per turn).
All other design and pass rules unchanged (7 rounds, 1 recheck scorer). Hashes in §3 refreshed.

## Amendment D (19 Nov 2026, owner decision "approved"): PLN2b re-check of planner2b
Run folder `reports/exp4/agent_sim_pln2b` (PLN2 results stay unchanged). Same 48 learners, seeds, arms, 7 rounds, tests, measures and pass rules as PLN2 (amendments B and C), with these changes, all made before round 1:
1. **planner2b stages** (`lessonPlanner.ts` `stageMachine`): a lesson moves on only on graded evidence; an error sends it back to teaching. TASK: errors in the task → language focus → at most one repeat. PPP/LAD: one check item; wrong → targeted practice → one new check; right → done. TTT: teach until right → retest; wrong → teach.
2. **Listen-and-do only with content** (`ladContent` signal): without kids-pack content (this branch) children under 9 get PPP with child supports (S2c).
3. **Rule statements** (planner2 on only): restated after any error; support fades only after the form is right twice in a row in this session.
4. **Guards added to the verdict:** stuck runs P2 ≤ OFF; independent correct answers (code-graded right answers after a tutor reply with no hint, correction or answer) P2 ≥ OFF; early answer leaks P2 ≤ OFF.
5. **Fit items fixed:** `test_first_clean` judges only the first reply (the one-step check); `task_goal` and `teach_targets_gaps` worded more precisely (PLN2 fit agreement was 77.9%).
6. **Overlap check:** PLN2's run folder is exempt for PLN2b only (same learners by design).
Task files for this run: `tasks_b/`. Hashes in §3 refreshed.

## Amendment E (19 Nov 2026, after the PLN2b run, owner decision "go for the two fixes")
Recorded before any new agent run. The PLN2b results, transcripts and main fit table stay as they are. The §3 hashes describe the PLN2b run; the two files below changed after it.
1. **planner2c task rule** (`lessonPlanner.ts`, PLANNER_VERSION planner2-v3): two wrong learner messages in a row inside the task end the task early → language focus (TASK_BAD_RUN = 2). Cause: PLN2b stuck learner s2001 (the same wrong sentence three times while the task ran for 3 messages). Test in `planner2.test.ts`. Not re-simulated in this amendment.
2. **9–12 fit items with 0/1/2 anchors** (`KIDPPP_E` in `pln2Study.ts`): counts for long sentences (> 12 words), messages with two or more instructions, effort praise; game/story across turns; the present → practise → produce steps. Other groups' items unchanged.
3. **Fit-agreement re-run only:** the same 12 sessions as `fitagree/`, judged blind twice with the anchored items by two new Opus agents (`fitE/`, batches `fitE_a_j01`, `fitE_b_j01`; new case ids per side). Agreement = identical item scores between the two (`FIT_AGREEMENT_E.json`); the rule stays ≥ 85%. Two agent runs.
4. Hashes after this amendment: `lessonPlanner.ts` `599a541e742030475b1b04b9c446b378b997cd9b610ad457bd2e12a2654cf7da`; `pln2Study.ts` `aa59f5d29b8ddc893023c64862461b62e8784fdd0716bf1208f37de42174b65d`.

## Amendment F (19 Nov 2026, owner decision "proceed"): PLN2c, adults-only re-check of planner2c
Recorded before any PLN2c agent run. Why adults only: the planner2c change (amendment E.1) touches only the TASK stage machine. The other three groups' plans and stages are unchanged (`planner2.test.ts` goldens unchanged), so their PLN2b results stand.
1. **Run folder** `reports/exp4/agent_sim_pln2c` with `GROUPS.json` = TASK only. Same 12 adult learners (ids, seeds, outcomes) and both arms, 7 rounds, the same tests, the same measures and the same pass rules as PLN2b (amendments B, C, D). One tutor cell of 12 sessions per arm. Task files: `tasks_c/`.
2. **Fit-judge agreement:** taken from amendment E (85.3%, `agent_sim_pln2b/FIT_AGREEMENT_E.json`; the TASK rubric is unchanged), because 10% of 24 cases (about 3) cannot measure it. PLN2c's own fitagree is reported, not used.
3. **Overlap check:** the PLN2, PLN2b and PLN2c folders are exempt from each other (same learners by design).
4. **Verdict for planner2c:** the PLN2c result for adults, plus the PLN2b results for teens, under-9s and 9–12s.
5. **§3 hashes refreshed** for `lessonPlanner.ts` (planner2c), `pln2Study.ts` (group filter, fitE) and `pln2_analyze.py` (group-aware). The PLN2b-run hashes are in git history at commit 6eb7d833. A full scripted dry run passed before this amendment.
6. **Estimate:** 14 Sonnet tutor runs + about 13 Opus runs (7 round judges, 1 event agreement, 2 fit, 1 fitagree, 2 recheck).
7. **Deviation 1 (after round 2, before round 3).** The planner2c rule could not fire in time. A task sentence has no course key, so it is graded only after the tutor's reply (the tutor's assessment). At planning time the latest wrong answer was therefore unknown: the same one-reply lag as the PLN2 quick check. Found because 6 of 12 adults had sent the same wrong sentence twice and the planner still chose "task". Fix (`progressFromHistory`, code only): if the learner sends again the very message that was already graded wrong, it counts as wrong in this turn. Test added (`planner2.test.ts`, 120 tests pass). Rounds 1–2 are unaffected: no earlier graded learner answer existed at turns 1–2, so those prompts are unchanged. The run continues from round 3. Hashes refreshed in §3.
8. **Deviation 2 and restart (owner decision "go with B", after round 3 of the first PLN2c run).** With deviation 1 in place, 6 adults reached language focus one reply earlier, but 3 sent the same wrong sentence a third time: stuck 3 vs 0. Cause: ENARA's "answer after two failed tries" rule counted only tries on course items (with a key). A free task sentence has no key, so the count stayed at 0 and the tutor kept hinting. Fix (`languageTeachingContext.ts`, planner2 only): `repeatedWrongAnswers` counts the same message sent again after it was graded wrong as a failed try. From the second time, the reply gives the answer with its reason (the existing release text). Tests in `planner2RepeatWrong.test.ts` (132 tests pass with planner2 and ESL5 tests; planner2 off unchanged). The first PLN2c run (rounds 1–3 judged, round 4 replies) is kept in git history at commit d72dd5d9. Its folder was removed, and PLN2c restarts from round 1 with the same learners. Hashes refreshed in §3.

## Amendment H (19 Nov 2026, owner "go" on plan §4 fix A): the independent-correct guard, measured properly
The old measure counted a right answer only when the reply before it had no feedback or help move. A feedback move comes on almost every reply, so only the first answer of a lesson could count. PLN2c adults: OFF 2 vs ON 0, both after the opening.
New measure (`pln2Study.ts tags` → `INDEP.json`): a right answer on the **first try at a new item or task**, when the reply before it did not show that item's answer. That means no leak of a lesson item's accepted answer, and not the task's target sentence. Guard: the ON rate (independent correct ÷ first tries) ≥ the OFF rate. The old count is still reported.
Re-scored on existing transcripts, by code only:
- PLN2b: OFF 177/231 (0.766), ON 166/225 (0.738): fail.
- PLN2c adults: OFF 39/50 (0.780), ON 41/49 (0.837): ok.
- planner2c combined (amendment F): OFF 171/223 (0.767), ON 173/223 (0.776): ok.
This measure is pre-registered for the kids-pack test and the final 48-learner run. Hashes refreshed in §3.

## Amendment G (20 Nov 2026, owner "go" and choice "write 9 matching lessons"): PLN2k, kids-pack listen-and-do test
Recorded before any PLN2k tutor run. Branch `claude/tutor-kids-pack`, with planner2c merged in.
1. **Content:** 9 new listen-and-do lessons for the A1 objectives of the 12 under-9 learners.
   - Written by 1 Opus agent from `lessons/WRITER_BRIEF_A1.md`.
   - Rules in `A1_LINK.json`: the objective's focus, and a few allowed A1 words such as days and o'clock.
   - Each lesson must pass the lesson checker, then 1 Opus review against `review/REVIEW_BRIEF.md`; fixes are applied before round 1.
   - The 3 existing lessons (family, home, classroom) are linked to their A1 objectives.
2. **Signal:** `ladContent` = a kids-pack lesson exists for the objective, with the `kidsPack` switch on (`ladContentFor`). Listen-and-do prompt lines come from that lesson (`ladLines`), as in `learningContext`.
3. **Run:** folder `reports/exp4/agent_sim_pln2k`, with `GROUPS.json` = {"groups": ["LAD"], "p2Extra": "kidsPack"}.
   - The same 12 under-9 learners (ids, seeds, outcomes).
   - OFF = today; ON = planner2c + kidsPack.
   - 7 rounds and the 7-day delayed test.
   - The same measures, pass rules and guards, with the independent-correct guard of amendment H.
   - Fit uses the listen-and-do rubric. Fit-judge agreement is taken from amendment E (85.3%); PLN2k's own 10% sample is reported only.
4. **Overlap check:** the PLN2-family folders (pln2, pln2b, pln2c, pln2k) are exempt from each other.
5. **Estimate:** 2 content runs (writer, reviewer) + 14 Sonnet tutors + about 11 Opus (7 judges, 1 agreement, 2 fit, 1 fit agreement; the recheck is folded in).
6. **Before round 1:** the review marked 5 of 9 lessons "fix", and all 16 suggestions were applied. The dry run's prompt check also caught one story line that was the exact answer to a test item (lad-21: "My birthday is in February."). It was reworded to "I have a birthday in February." The checker shows 29 lessons OK. Tests: 133 pass, including the A1-lesson mapping test (linkOnly lessons match by outcome id only). A full scripted dry run passed. §3 hashes refreshed for this branch (kids pack changes to engineV2, learningContext, languageTeachingContext and the runner). Task files: `tasks_k/`.

## Amendment I (20 Nov 2026, owner "do the fixes"): fixes from the PLN2k result
Code only. No agent run.
1. **The listen-and-do step replaces the exercise.** When the shape is listen-and-do, a kids lesson exists and the stage is listen, do or chant:
   - the language context drops the exercise moves (`LAD_STEP_DROPPED`: present item, independent and general practice, comprehension check, distinct example, restate task);
   - it adds `LAD_STEP_LINE`, an override like the quick check;
   - `tutor.controller` passes `ladStep` from `lessonStage.ladContent`.
   - The check stage keeps one exercise. The do step now moves on after `LAD_DO_TURNS` = 3 commands, because a tap or point can't be graded by code, or earlier after 2 right in a row. The check stays evidence-based: wrong → do (2 commands) → check.
2. **The do-step hint follows the answer rule:** "give a hint (show the picture, or say only the first sound); say the whole word only after two tries."
3. **Leak detector:**
   - (a) a reply that repeats the learner's own sentence is not a leak;
   - (b) for a rewrite item whose answer differs from its prompt only by capitals and full stops, showing the prompt is not a leak; only the exact capitalised answer counts.
   - Re-scored by code (`releak`), with the old values kept as `*V1`:
     - PLN2k: 10 → 4 leak replies (OFF 1, ON 3; still a fail);
     - PLN2b: 14 → 8 (OFF 5, ON 3; ok);
     - PLN2c: 1 → 1.
4. **Tests:** 143 pass (planner2, kidsPack, repeat-wrong, ESL5 release and off-parity). The dry run shows the override in all 12 ON prompts and in none of the OFF prompts. §3 hashes refreshed.
5. **Re-run (owner choice "re-run kids test first"): PLN2k2.** Folder `reports/exp4/agent_sim_pln2k2`, task files `tasks_k2/`. Everything is as in amendment G (same 12 children, arms, rounds, tests, rules and guards; fit agreement from amendment E), with fixes 1–3 above. The overlap check exempts pln2k2 too. Estimate: 14 Sonnet + about 13 Opus.

## Amendment J (20 Nov 2026, owner decisions 2–4): PLN2f, the final 48-learner check
Recorded before any PLN2f run.
1. **Planner:** planner2c (amendments E.1 and F, deviations 1–2) plus **fix B**: the task-based pre-task gives one short model sentence of the target form in the task's setting (`STAGE_WORDS.pretask`, PLANNER_VERSION planner2-v4, with a test). The planner2k fixes of amendment I are in the code but only act with `kidsPack`.
2. **Kids pack off.** The ON arm is ESL5 + `planner2`, without `kidsPack`. Under-9s get present-practise-produce with child supports (S2c).
3. **The kids content rule** (owner, recorded for the pack, not used in this run): lesson lines never reuse a test-item sentence. The checker uses `ITEM_SENTENCES_TESTS.json` and `ITEM_SENTENCES_COURSE.json`. 6 lines were reworded and 29 lessons are OK. Tested.
4. **Run:** folder `reports/exp4/agent_sim_pln2f`, task files `tasks_f/`. The same 48 learners, arms, 7 rounds, tests, measures and pass rules as PLN2b (amendments B–D), with these measures:
   - the independent-correct guard of amendment H (rate);
   - the leak detector of amendment I.3;
   - the fit items of amendment E for 9–12s (`KIDPPP_E` used in the main fit);
   - fit agreement measured in this run (10% sample, rule ≥ 85%).
5. **Small batches:** 6 tutor cells of 16 and 2 judge batches per round, committed after each step. A usage-limit stop resumes from the last commit (`RESUME.md` in the run folder).
6. **Estimate:** 42 Sonnet + about 31 Opus.

## Amendment K (20 Nov 2026, owner "open fixes 1-4, then one small re-check"): planner2e and PLN2g
Recorded before any PLN2g run.
1. **Code (planner2-v6, all behind `planner2`, or the ESL5 / rule-bank switches for the pair check):**
   - pair check: a "wrong" example that is acceptable English is removed from the reply (`pairCheck.ts`);
   - `PAIR_RULE` in the prompt;
   - rule bank rb-v2 (13 pairs rewritten, Opus-confirmed);
   - fixes A, C, D and E from `docs/tutor/PLANNER2D_FIXES.md`;
   - an answered item is never named again;
   - a child's empty answer counts as a failed try (planner2d).
2. **Harness:** `GROUPS.json` may list `learners` and `arms`. Cells hold at most 14 sessions. `langCtx` passes the child flag and the task-step override, as `tutor.controller` does. The run-folder regex includes `pln2g`.
3. **PLN2g re-check:**
   - learners: the 27 affected learners only (2035; the item-repeat sessions; the sessions with a lower teacher score; the planner-on sessions with a false "wrong" pair);
   - arm: planner ON only. Same seeds, 7 rounds, immediate and 7-day delayed tests.
   - Compared descriptively with the same learners' ON sessions in PLN2f. Not a pass/fail verdict.
   - Measures:
     - 2035 stuck or not;
     - false "wrong" pairs in final replies (code check, plus one Opus check);
     - two tasks in one reply;
     - answered items named again;
     - the "teacher would accept" fit item;
     - the delayed test.
4. **Estimate:** 14 Sonnet tutors, 7 Opus judges, 3 Opus fit judges and 1 Opus pair check: about 25 agent runs.
5. §3 hashes refreshed.

## Amendment L (20 Nov 2026, owner "do all"): PLN2h, the planner2f spelling re-check
Recorded before any PLN2h run.
1. **Code:** planner2f (`planner2-v7`).
   - Children accept a correct word and move on.
   - Models must be correct English (a bare noun at the start is repaired; a model missing a/an/the is removed).
   - No misspelling is shown as an example (rule bank rb-v3).
   - Clock times for time lessons.
2. **Learners:** the 5 whose PLN2f planner-ON lessons showed misspelled examples: 2006, 2045 (comparatives), 2043 (third-person -es), 2027 (family words), 2040 (classroom words). Planner ON only, same seeds, 7 rounds, immediate and 7-day delayed tests.
3. **Measures (descriptive, compared with the same learners in PLN2f and PLN2g):**
   - misspelled examples shown (code check, then one Opus pair check);
   - delayed test;
   - wrong-belief strength after round 7;
   - the fit item "teacher would accept".
4. **Estimate:** 7 Sonnet tutors, 7 Opus judges, 1 Opus fit judge and 1 Opus pair check: about 16 agent runs.
5. §3 hashes refreshed.
