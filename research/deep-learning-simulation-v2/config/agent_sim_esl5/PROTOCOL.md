# SIMULATION ONLY

# ESL stage 5: confirmatory protocol (pre-registration)

This file was committed before any ESL5 tutor reply was written. Nothing below may change after the first tutor reply is applied; any departure goes in `DEVIATIONS.md`. No real learners take part, and no API is called. Tutors, judges, raters and fidelity checkers are agents, with at most 3 running at a time.

## 1. The one claim

On new learners, ENARA with `levelExplicit` **plus the ESL5 bundle** (arm **LE**) beats the same strong plain baseline used in ESL4 (**P+**, arm **PP**) on controlled post-test accuracy after round 10 for explicit-first (A1/A2) learners.

## 2. Arms (exact configuration)

### PP = P+ (unchanged from ESL4)
- **Prompt:** exactly `config/agent_sim_esl4/PPLUS_PROMPT.txt`, SHA-256 `e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472`. `esl5Study.ts init` refuses to run if the hash differs.
- **Appended data:** `Learner level: <A1|A2|B2> (CEFR)`, the lesson data (title, objective, objectives, success criteria, vocabulary, grammar, examples, practice exercises) and the conversation so far, exactly as in ESL4.
- **Excluded:** no engine, moves, switches, record or reply guards. `ENARA_ENGINE_V2=""`. Replies stored as written.

### LE = A0+LE+esl5
- **Env:** `ENARA_ENGINE_V2="wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5"`. This is the ESL4 LE string with `esl5` appended. `esl5` turns on `liveError`, `releaseAfterTwo`, `reviewOpen`, `fadeKnown`, `ownSentence` (engineV2.ts).
- **Closing switch:** reviewOpen's closing item runs only when `closing` or `shortRecap` is on. **`closing` is already in the ESL4 LE string**, so no switch is added; `shortRecap` is **not** used. With reviewOpen on, the `closing` turn becomes one new item in a new context instead of the "tell me the rule in your own words" recap (languageTurnPipeline.applyReplyGuards).
- **Teaching plan:** the 23-method plan from the fixed record, with arbitration, as in ESL4.
- **Prompt:** built by the backend's own code (`detectTurnSignals`, `selectLanguageMoves`, `esl5Adjust`, `ruleFirstDecision`, `researchSignals`, `renderLanguageContextPrompt`), as ESL4's `tprompts` did, now with the switches on.
- **Reply guards:** `applyReplyGuards` on every LE reply, as in ESL4. Turn evidence comes from `completeLanguageTurn` (run without institution/student ids, so it does not touch a database).

### What the engine sees (LE)
Only what a real tutor sees: the learner's messages, the lesson data, the course level and objective record status, and **ENARA's own stored learner record**. It never sees the simulator's knowledge state, belief labels, strengths, primary belief or seeds. A dry check (`esl5Study.ts promptcheck`) scans the engine part of every pending LE prompt (and the pre-conversation part of every PP prompt) for belief labels W1/W2/C1/C2, "strength", "KNOWLEDGE STATE", seeds and the simulator's belief texts. Learner messages can themselves contain belief wording (the simulator's "I think ..." rule answers); that is learner text and is allowed. The round-1 check passed (480 prompts, 0 findings: `reports/exp4/agent_sim_esl5/PROMPTCHECK_t1.json`). It is re-run before each round's tutor cells; any LE finding stops the run.

### ENARA's stored learner record (LE)
Per session file, `rec = { entries, liveErrors, knownPoints }`, the `LearnerLanguageProfile` fields the engine reads. After each LE reply it is updated exactly as `completeLanguageTurn` → `recordProfileTurn` would: `applyTurn` (error code, independent success), `applyLiveErrors` (liveError seen / liveCorrect), `applyKnownPoints` (knownInc / knownReset). Before each LE turn it is read as `loadEsl5Record` does (`liveErrorTypes` + `knownPoints`) and the error-code lines as `summarizeProfile`. It carries over from session 1 to session 2 (a copy is kept as `recAfterS1`). Two stand-ins, both inherited from the ESL4 glue: (a) no `[[assess]]` marker is written, so a failed answer to an open lesson item is recorded as INCORRECT (the answer key itself only confirms success) — the same stand-in ESL4's history uses; (b) the lesson id is the constant `lsn`. Consequence: live error types are cleared only by key-verified correct answers on lesson items; correct answers to the tutor's own items do not clear them. This is a known limitation, fixed now.

## 3. Frozen components (SHA-256, at commit `df20773` plus the new ESL5 files below)

| File | SHA-256 |
|---|---|
| `backend/src/services/engineV2.ts` | `2a742bd3b0aa79084d6d5c7364bf2529a4129373bb3c7fb927f2862e65dd4a5f` |
| `backend/src/services/languageTeachingContext.ts` (engine) | `fb96913c3bb7b61dda27d4669ac301b365df1d5278b5954eeb120264e8b3af0c` |
| `backend/src/services/languageTurnPipeline.ts` (reply guards, turn evidence) | `50fe4e13fb1b3ff31f9e211def49ed91c0cba3a363a8b366a8ceac7c54ecd6be` |
| `backend/src/services/languageLearningState.ts` | `a870468e85adb78aef6b29f1b8d2df55bd4a767529a6364cf7d241c34dd7c62d` |
| `backend/src/services/learnerLanguageProfile.ts` (record code) | `9a8d71d9301cd66d9877046bfb98afc07d755195ed505f66db616f525f6cdbe0` |
| `backend/src/services/strandLog.ts` | `0e45c79426e1b6321f8f40f282d4d502f86accb0e338882bd8f21fff88a05553` |
| `backend/src/services/pedagogyPolicy.ts` | `fd0cad88cd51aa5ff5f80432d93ae1187221a4f106011a20803de0744ba7efbf` |
| `backend/src/services/learningContext.ts` | `556c1ad4fa083732b41dc633d4c0363e971c29f19c15a51220235e9e1e87ca6c` |
| `backend/src/models/LearnerLanguageProfile.ts` | `7cddadf2fa14d7c748ddbee3c337a489a855250912bfa77fb3c3a47e791cbda3` |
| `src/offline/learnerSim.ts` (simulator, post-test generator; unchanged since ESL4) | `711c8334b6323dc9e72a5617072edf3b9fc808499080ca52f1d62aa78f71ebd4` |
| `src/offline/eslFixtures.ts` (lessons, items; unchanged since ESL4) | `7b616767502fc64d5f14ec2d2b8dbfc7e2019ac3e2612926425cb29500a3ebb6` |
| `src/offline/esl5Study.ts` (runner) | `b8b4a7bbb272f1488a0df3b4f90d0b4384b9f11dbabf0850d8a95c49abcff79c` |
| `src/offline/esl5_analyze.py` (analysis, decision rule) | `09b76f9d678e8afafb68a94a937ec56dffef4411f7043d1fc3f9b5d35dc4fb54` |
| `src/offline/esl4_fidelity.py` (reused unchanged) | `a55d4a00a5d1bfbda7e0502d3b729025b721978b4b8485c88c698bf4d8c51a4c` |
| `config/agent_sim_esl5/LEARNING_RULES.md` | `74a6a20e2562a2ecf97e02709ce831a0fcc2cdf5a557d534d6586276eba91873` |
| `config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md` | `cebaa834dd5522bb142f3d69e53254e298a6365bc1e41076c1c598b623a93a59` |
| `config/agent_sim_esl4/PPLUS_PROMPT.txt` | `e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472` |
| `config/agent_sim_esl4/RATER_INSTRUCTIONS.md` (reused unchanged) | `77b8c0e6040b4bf5d8b3fb60ed23ea4e1d1ffc4f127f1cb52bf4346e9b1c69a8` |
| `config/agent_sim_esl4/FIDELITY_INSTRUCTIONS.md` (reused unchanged) | `f4c0b7aa1e98e96ceb1ab16d00c381b50ae1e06215e457b6f3b6784b7fdd53e3` |
| `config/agent_sim_esl5/tasks/TUTOR_TASK.md` | `70ff6192b1bb433dcfddfc100bdf20531e1426c5682f5a2853b17356b943a770` |
| `config/agent_sim_esl5/tasks/JUDGE_TASK.md` | `f886204205cf040dac7be930736437c49caa8d824c790cc64f83dc1992d00694` |
| `config/agent_sim_esl5/tasks/RATE_TASK.md` | `b5d70f8f1cd679676731c49fe3cca7ddcdda855db00a066982619ebd70efaccf` |
| `config/agent_sim_esl5/tasks/FID_TASK.md` | `ba61277e502b135280f9edb04d2fba504f55f9e6a3cfe620a085346368184f37` |
| `reports/exp4/agent_sim_esl5/validation/round2/JUDGE_TASK_ESL5.md` (validated judge task; the study task is its adaptation) | `aeb69dc5d672f7386c6a19f847cf69c9d40f201c31b22330e31fab2f5a36d435` |

The scratch copies of the four task files (`/tmp/claude-0/.../scratchpad/esl5/*.md`) are identical to `config/agent_sim_esl5/tasks/`.

**Judge validation:** ESL5 LEARNING_RULES passed blind validation round 2 (`reports/exp4/agent_sim_esl5/validation/VALIDATION.md`): 95.6% on the required set, 94.1% in session 2, order check d > c > b ≈ a.

## 4. Sample size

From `config/agent_sim_esl5/POWER.json` (ESL4 per-learner LE − P+ controlled differences, n = 96): SD = **0.2127**, target effect **+0.06**, two-sided sign-flip, α = 0.05.

| n | Normal approx. power | Simulated power |
|---|---|---|
| 96 (minimum) | 0.789 | 0.790 |
| **108 (chosen)** | **0.834** | **0.833** |
| 120 | 0.871 | 0.885 |
| 144 (maximum) | 0.923 | 0.933 |

Normal approximation needs 99 for 80%. **n = 108 explicit-first learners** gives about 83% power at +0.06; the pre-set range was 96 to 144. The SD is taken from ESL4 with the ESL4 LE arm; the ESL5 arm may have a different spread.

## 5. Learners and post-test items

**120 NEW learners**, ids **500–619**:
- 54 A1 (500–553) and 54 A2 (554–607): the 108 explicit-first learners. Forms rotate (articles / copula / thirdS, 36 per form overall). Objective status: not_assessed for the first 6 of every 12, emerging for the rest. Primary wrong belief alternates in blocks of three.
- 12 B2 (608–619): the no-harm check.

**Seeds:** `esl5|L<id>|rep<1|2>`. Case, agreement, rater and fidelity hashes are salted with `esl5`.

**Post-test:** scored by the frozen `postTest(state, seed)` (4 controlled + 2 free probes per form, same belief sets as ESL2–4), with outcomes drawn from the new seeds. Each probe slot is given a **new ESL5 sentence** that tests the same beliefs (LEARNING_RULES 4a), listed in `esl5Study.ts` (`POST_ITEMS_ESL5`) and `reports/exp4/agent_sim_esl5/POST_ITEMS.json`. The sentences document the probes; scoring does not read text.

**Overlap check** (`esl5Study.ts overlap`, also run and enforced by `init`; result `reports/exp4/agent_sim_esl5/OVERLAP_CHECK.json`): scans 2,395 files under `reports/exp4` (all ESL1–4 data and the ESL5 validation, including `cases_new.json`), plus the fixtures, simulator and validation scripts, and the ESL1 post-test item bank. Result: **pass** — 0 learner-id clashes (216 prior ids), 0 seed clashes (420 prior seeds), no prior `esl5|` seed, 0 post-test sentence clashes (gapped and completed forms checked; one draft sentence, "The bananas ___ yellow", was found in prior material and replaced before init), and the sentence slots match the frozen probes.

## 6. Design

- 2 sessions × 5 turns = **10 rounds**. Session 2 is a new chat one simulated day later; knowledge state and ENARA's record carry over.
- 2 replications; every learner gets both arms in both replications: 120 × 2 × 2 = **480 sessions per round**, 4,800 tutor turns.
- **24 cells per round**: `PP10–PP15`, `PP20–PP25`, `LE10–LE15`, `LE20–LE25` (arm, replication, learner id mod 6). Each cell = **20 sessions**, written by one tutor agent who writes every reply itself. Scripted, templated or grouped replies are kept as `PARTIAL_*` and redone.
- Judges: blind, `config/agent_sim_esl5/tasks/JUDGE_TASK.md` with ESL2 `JUDGE_INSTRUCTIONS.md` and **ESL5 `LEARNING_RULES.md`**; the judge input contains only the knowledge state, the previous tutor turn, the learner's message, the production fact and the tutor turn (no arm). Batches of 36 (14 per round). Each judge works from its own batch only, by reading, without scripts or shared helper files.
- Failed or cut work is kept as `PARTIAL_*` and rerun. No session is dropped. The analysis refuses to decide unless the data are complete.

## 7. Judge agreement (in-study recheck)

- Rounds **3 (session 1) and 7 (session 2)**. A stable 20% of that round's cases, `rand('esl5-agree', caseId) < 0.2`, re-judged blind by a second judge on the identical input (`agreeprep`), scored by `agreescore`.
- Agreement = both judgements give the same knowledge state. Reported overall, per round and **per session**.
- **Target: ≥ 85% overall AND ≥ 85% in session 2**, with no missing agreement cases. If not met, this is a **validity failure** and the claim cannot be CONFIRMED (it is a guard, section 10).

## 8. Primary hypothesis (the only confirmatory test)

**LE − PP on controlled post-test accuracy after round 10, explicit-first learners (n = 108), each learner's two replications averaged.**
- **Test:** EXACT two-sided paired sign-flip over all 2^n sign patterns (convolution on the 1/240 grid; controlled scores are multiples of 1/8, so the exact test is feasible). If the differences were not on that grid, a Monte Carlo sign-flip with 100,000 draws (seed 5) would be used instead. α = 0.05.
- **Interval:** 95% percentile bootstrap, 10,000 resamples, seed 7.

## 9. Secondary outcomes (descriptive only, no claims)

- free-production accuracy; wrong beliefs that reached 0; expected controlled and free accuracy; each replication separately;
- per-round W1+W2 trajectory (explicit-first);
- **stuck runs**: ≥ 3 consecutive learner answers in one session on the same task without a correct answer (task = the lesson item shown in the previous tutor turn, else the judge's next task kind + correct answer); count, sessions with a run, mean length (`STUCK.json`);
- **one blind rating pass**: replication 1, two tutors per learner as V/W in random order, 12 batches of 10 learners, ESL4 `RATER_INSTRUCTIONS.md` unchanged;
- **B2 no-harm**: every B2 learner ends with W1 = W2 = 0 in both arms and both replications;
- **session-2 turn-type breakdown** (automatic, per arm, explicit-first): R1/R2 on a live belief vs on a belief already at 0; answer given (R5); confirmed correct (R3); independent correct (R4); next-task kind; next task tests a live belief vs only beliefs at 0; LE engine tags (answerReleased, reviewOpen, liveError, fadeCheck, ownSentence asked/feedback). Mirrors `EXPLORATORY_ESL4_DIAGNOSIS.md` steps 1–2 without hand classification;
- counts per arm: answer releases, answers given after ≥ 2 failed attempts, ESL4-style leaks;
- P+ fidelity: stable 10% of P+ turns (`rand('esl5-fid', id) < 0.1`), `FIDELITY_INSTRUCTIONS.md`, summarised by `esl4_fidelity.py`.

## 10. Guards (all must pass)

1. **Two asks:** final LE replies with two asks (`hasTwoAsks`, folded closings excepted) ≤ 2% of LE turns. Raw count before the guard also reported.
2. **Early leaks:** LE ≤ PP in tutor turns with an **early leak** — the completed answer of a lesson item that the learner has not solved and on which they have made **fewer than 2 genuine failed attempts** in this session. A genuine attempt is an answer production (blank or sentence) that is wrong; the simulator's "(I leave it empty, no word)" is a genuine omission answer; "don't know"-type replies are not. **Answer releases** (LE `answerReleased` evidence, after 2 genuine attempts) are **counted separately and are not leaks**; for both arms, answers given after ≥ 2 failed attempts are also counted separately. Detection covers lesson items only (as in ESL4).
3. **Answer protection:** mean blind `answer_protection` LE ≥ PP.
4. **Judge agreement:** ≥ 85% overall AND ≥ 85% in session 2 (section 7). Failure = validity failure.

## 11. Decision rule (fixed now)

**CONFIRMED** only if all hold: p < 0.05; 95% interval lower bound > 0; all four guards pass; data complete (108 + 12 learners, both arms, both replications, 10 judged rounds each). Otherwise **NOT CONFIRMED**. No other outcome, subgroup, replication or analysis will be presented as confirming the claim. B2 no-harm is reported next to the decision.

## 12. Run order and commands

All commands from `backend/`, with `S=../research/deep-learning-simulation-v2/src/offline/esl5Study.ts` and `D=../research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl5`.

1. `npx tsx $S init $D` (done: hash check, overlap check, 480 sessions).
2. For each round r = 1..10:
   1. `npx tsx $S promptcheck $D` (must pass);
   2. the 24 tutor cells: each agent follows `tasks/TUTOR_TASK.md` with CELL and ROUND (`tprompts $D <cell>` → writes `<scratch>/esl5/ans/<cell>_r<r>.json` → `tapply $D <cell> <that file>` → "applied 20 of 20");
   3. `npx tsx $S status $D` (all 480 at r replies);
   4. `npx tsx $S jprep $D r` → batches `judge/r<r>_j01..j14.md`; judges follow `tasks/JUDGE_TASK.md` with JDIR=`$D/judge` and write `judge/r<r>_jNN.json`; then `npx tsx $S japply $D r`;
   5. rounds 3 and 7 only: `npx tsx $S agreeprep $D r` → `agree/ag<r>_jNN.md`; second judges (different agents) with JDIR=`$D/agree` write `agree/ag<r>_jNN.json`.
3. `agreescore $D`; `post $D`; `tags $D $D/TAGS.json` (also writes `STUCK.json`).
4. `rateprep $D $D/rate` → raters (`tasks/RATE_TASK.md`) write `rate/rtNN.json`.
5. `fidprep $D` → checkers (`tasks/FID_TASK.md`) write `fidelity/fdNN.json`; `python3 src/offline/esl4_fidelity.py reports/exp4/agent_sim_esl5`.
6. `python3 src/offline/esl5_analyze.py reports/exp4/agent_sim_esl5` → `ANALYSIS.json`.
7. Report at `reports/exp4/AGENT_SIM_ESL5.md`.
