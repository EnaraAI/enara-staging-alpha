# SIMULATION ONLY

# PLN2 runbook (exact commands for a real run)

Protocol: `PROTOCOL.md` (this folder). All commands from `backend/` of the worktree on branch `claude/tutor-planner2`. Agents: tutors **Sonnet**, every judge and scorer **Opus**; at most 3 agents at a time. The task files in `tasks/` use absolute paths under `/home/user/planner2`; if the run happens in another checkout, replace that prefix in the four task files before `init` (and re-hash them in PROTOCOL §3).

```sh
cd /home/user/planner2/backend
S=../research/deep-learning-simulation-v2/src/offline/pln2Study.ts
D=../research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2
T="npx tsx $S"
```

## Agent task files per step

| Step | Task file | Model | Per round | Total |
|---|---|---|---|---|
| Tutor turns (6 cells × 16 sessions) | `tasks/TUTOR_TASK.md` | Sonnet | 6 | **30** |
| Event judges (72 + 24 cases) | `tasks/JUDGE_TASK.md` (JDIR `judge`) | Opus | 2 | **10** |
| Event-judge agreement (44 cases, after round 5) | `tasks/JUDGE_TASK.md` (JDIR `agree`, batch `ag_j01`) | Opus | – | **1** |
| Fit judges (96 cases, 12 per batch) | `tasks/FIT_TASK.md` (FOLDER `fit`, `fit_j01`–`fit_j08`) | Opus | – | **8** |
| Fit-judge agreement (12 cases) | `tasks/FIT_TASK.md` (FOLDER `fitagree`, `fag_j01`) | Opus | – | **1** |
| Grader recheck (3 scorers × ≤ 7 batches of 40 pairs) | `tasks/RECHECK_TASK.md` | Opus | – | **≤ 21** (21 in the dry run; 266 sampled answers, the number of distinct pairs depends on the answers) |
| **All** | | | | **≤ 71** (30 Sonnet + ≤ 41 Opus) |

The counts of the first five rows are fixed by the design (case ids are hashes of the session keys); only the recheck count depends on the answers.

## 0. Before anything
```sh
git status                          # clean; on claude/tutor-planner2
$T hashcheck                        # every PROTOCOL §3 hash matches
cd .. && python3 -m py_compile research/deep-learning-simulation-v2/src/offline/pln2_analyze.py && cd backend
```

## 1. Init and pre-test
```sh
$T init $D                          # hash + overlap checks, 96 sessions, cells.json, LEARNERS.json (predicted TTT split)
$T plans $D                         # expected: OFF worked_example x48; P2 TASK/S3, TTT/S4q/QC, LAD/S2a|S2b, PPP/S2c
$T assess $D pre                    # "answers 864, sessions 96, grader null 0"
```
Commit (`reports/exp4/agent_sim_pln2`).

## 2. Rounds 1–5 (r = 1 … 5)
```sh
$T promptcheck $D                   # must print "pass":true (no simulator text in any engine prompt)
```
Tutor agents, one per cell, CELL in `OFF_1 OFF_2 OFF_3 P2_1 P2_2 P2_3`, ROUND r (`tasks/TUTOR_TASK.md`, Sonnet). Each replies "applied 16 of 16"; a cell that does not is kept as `answers/PARTIAL_<cell>_r<r>.json` and rerun.
```sh
$T status $D                        # {"r replies / r-1 judged":96}
$T jprep $D r                       # "judge cases 96 r<r>_j01 r<r>_j02"
```
Judge agents for `r<r>_j01` and `r<r>_j02` (`tasks/JUDGE_TASK.md`, JDIR `.../agent_sim_pln2/judge`, Opus). Check that each output has every case id of its batch (72 and 24).
```sh
$T japply $D r                      # "applied 96 rejected events N"
```
Commit after each round. Round 5's `japply` stores the end-of-session state (no new learner turn).

## 3. Event-judge agreement
```sh
$T agreeprep $D                     # "agreement cases 44 ag_j01"
```
One judge agent for `ag_j01` (`tasks/JUDGE_TASK.md`, JDIR `.../agent_sim_pln2/agree`, Opus; a different agent from every main judge).
```sh
$T agreescore $D                    # JUDGE_AGREEMENT.json
```

## 4. Fit judging
```sh
$T fitprep $D                       # "fit cases 96 fit_j01 … fit_j08" and "fitagree cases 12 fag_j01"
```
Nine fit judge agents (`tasks/FIT_TASK.md`, Opus): FOLDER `fit` with BATCH `fit_j01` … `fit_j08`; FOLDER `fitagree` with BATCH `fag_j01` (a different agent from the main fit judges).
```sh
$T fitapply $D                      # FIT.json, FIT_AGREEMENT.json; refuses on a missing case or item
```

## 5. Tests
```sh
$T assess $D imm
$T f1 $D 7
$T assess $D del
```

## 6. Grader recheck
```sh
$T recheckprep $D                   # "batches per scorer K"
```
3 × K scorer agents (`tasks/RECHECK_TASK.md`, Opus): SCORER `s1`, `s2`, `s3` × BATCH `rc01` … `rcK`.
```sh
$T recheckscore $D                  # GRADER_RECHECK.json
```

## 7. Tags, post and analysis
```sh
$T tags $D                          # TAGS.json, STUCK.json
$T post $D                          # POST.json
cd .. && python3 research/deep-learning-simulation-v2/src/offline/pln2_analyze.py research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2
```
`ANALYSIS.md` / `ANALYSIS.json`: verdict by the PROTOCOL §9 pass rules, every table. Commit and write the report (`reports/exp4/AGENT_SIM_PLN2.md`, marked SIMULATION ONLY).

## Usage limit
Stop at the end of the current cell or batch; write `reports/exp4/agent_sim_pln2/RESUME.md` (rounds complete, partial files, exact next step, deviations) and commit. Resume from RESUME.md.

## Dry run (no agents)
Scripted tutor replies (a hidden marker that grades the learner's last answer, then a lesson item), scripted judges (the shown item's accepted answer as the next task), scripted fit judges and scorers. Run it in the git-ignored folder below and delete it afterwards.
```sh
DD=../research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2_dry
rm -rf $DD && mkdir -p $DD && touch $DD/DRY_RUN
$T init $DD && $T assess $DD pre
for r in 1 2 3 4 5; do $T promptcheck $DD && $T dryreply $DD $r && $T jprep $DD $r && $T dryjudge $DD $r && $T japply $DD $r; done
$T agreeprep $DD && $T dryagree $DD && $T agreescore $DD
$T fitprep $DD && $T dryfit $DD && $T fitapply $DD
$T assess $DD imm && $T f1 $DD 7 && $T assess $DD del
$T recheckprep $DD && $T dryscore $DD && $T recheckscore $DD
$T tags $DD && $T post $DD
cd .. && python3 research/deep-learning-simulation-v2/src/offline/pln2_analyze.py research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2_dry && cd backend
rm -rf $DD
```
