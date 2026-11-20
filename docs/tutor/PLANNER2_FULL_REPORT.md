# Planner2 and the kids pack: full record (19–20 Nov 2026)

All results below are **SIMULATION ONLY**. They come from rule-based simulated learners with agent tutors and judges, not real learners. Planner2 is **off for every real learner**, and nothing has been deployed to lms-test.

Branches:
- `claude/tutor-planner2`: planner2 to planner2c, the PLN2, PLN2b and PLN2c runs.
- `claude/tutor-kids-pack`: kids pack, planner2c merged in, the PLN2k and PLN2k2 runs.

Protocol: `research/deep-learning-simulation-v2/config/agent_sim_pln2/PROTOCOL.md`, amendments B–I.

---

## 1. What we set out to do

- Replace "the model decides the lesson shape inside the prompt" with a **code planner**. The planner is a rule table from learner signals to a lesson shape and a method. It is testable and explainable, and the model only writes the reply.
- Add live signals: a quick check, the learner's goal, age from birth date (asked of the school or parent, never the child) and Arabic-transfer errors.
- Build a **kids pack** for children under 9: official Cambridge Pre A1 Starters words and can-dos, plus listen-and-do lessons.
- Prove "no harm, better fit" in simulation before any real learner sees it.

## 2. What was built (code)

| Part | Where | What it does |
|---|---|---|
| Rule-table planner | `backend/src/services/lessonPlanner.ts`, `pedagogyPolicy.ts` | Learner signals → one of 4 lesson shapes (present-practise-produce, test-teach-test, task-based, listen-and-do) + a review opener + a main method. Rules S1–S6 and M1–M10, each with a written reason. |
| Stage machine | `lessonPlanner.ts` `stageMachine` | A lesson moves to the next stage **only on graded evidence**; an error sends it back to teaching (planner2b). |
| Task-stage fix (planner2c) | `lessonPlanner.ts`, `progressFromHistory` | Two wrong task answers in a row → language focus. Sending the same wrong sentence again counts as wrong at once. |
| Answer after two tries, for free sentences (planner2c) | `languageTeachingContext.ts` `repeatedWrongAnswers` | A repeated wrong free answer counts as a failed try, so the tutor gives the corrected form instead of more hints. |
| One-step quick check | `languageTeachingContext.ts`, `tutor.controller.ts` | Teens and adults get one check item, graded in the same turn, with no teaching inside it. |
| Live signals | `Student.ts`, `learnerSignals.ts`, routes `/api/learner-signals`, parents routes | Learner goal (set once, editable), birth date → age band (from the school or parent), and the school's list of missing signals. |
| Arabic-transfer errors | `languageLearningState.ts`, misconception rules | 7 `l1_transfer` codes (article left out, copula left out, and others). |
| Kids pack | `kidsPack.ts`, `data/kids/prea1/` | 495 Starters words, 10 can-dos, numbers and names. 29 listen-and-do lessons: 20 Starters lessons + 9 written for A1 course objectives, all passing the checker and an Opus review. |
| Listen-and-do in the tutor (amendment I) | `languageTeachingContext.ts` `LAD_STEP_LINE`, `tutor.controller.ts` | When a kids lesson exists, the story / one action / chant replaces the exercise. The check keeps one graded exercise. |
| Switches | `engineV2.ts` | `planner2` and `kidsPack`. Both are named-only and **off by default**. |

Tests:
- 143 pass: planner2, kids pack, repeat-wrong, ESL5 release and off-parity.
- Plans with the planner **off** are byte-identical to before. A hash test checks this.
- The suites that need the Mongo test database could not run in this sandbox, because it can't download Mongo.

## 3. The runs and their results

Each run compares **OFF** (today's tutor) with **ON** (the planner) on the same simulated learners. It runs 7 rounds, then an immediate test and a 7-day delayed test.

### Results table

| Run | Learners | What was tested | Delayed test ON − OFF [95% CI] | Verdict |
|---|---|---|---|---|
| PLN2 (restart) | 48, all groups | planner2 | −0.031 [−0.094, +0.021]; under-9 −0.104 | NOT PASSED |
| PLN2b | 48 | planner2b (evidence-based stages) | **+0.016 [−0.031, +0.068]**; under-9 +0.042 | NOT PASSED (1 stuck adult; fit agreement 83.8%) |
| Fit agreement re-run (amendment E) | 12 sessions, judged twice | clearer 9–12 fit items | — | Pass, 85.3% (by one item) |
| PLN2c (with fix B) | 12 adults | planner2c task fixes | −0.021 [−0.146, +0.104] | Adults alone too small; **planner2c combined verdict PASSED** |
| Combined planner2c (PLN2c adults + PLN2b others) | 48 | planner2c | **+0.010 [−0.037, +0.063]** | **PASSED** |
| PLN2k | 12 under-9 | kids pack, first try | +0.042 [0.000, +0.125] | NOT PASSED: listen-and-do was not delivered (7/84 replies) |
| PLN2k2 | 12 under-9 | kids pack with fixes | **−0.125 [−0.271, 0.000]** | NOT PASSED: delivered (51/84), but the simulated child doesn't learn from it |
| **PLN2f (final)** | 48 | planner2c + fix B, kidsPack off | **+0.010 [−0.016, +0.042]**; adults +0.062 | **PASSED** in one clean run (see `AGENT_SIM_PLN2F.md`) |

### By group, for the passing planner (planner2c combined, delayed test)

| Group | OFF | ON | Diff |
|---|---|---|---|
| B1+ adults, task-based | 0.792 | 0.771 | −0.021 |
| Teens, test-teach-test | 0.917 | 0.938 | +0.021 |
| Under 9 (present-practise-produce + child supports, no kids pack) | 0.792 | 0.833 | +0.042 |
| 9–12, present-practise-produce + child supports | 0.917 | 0.917 | 0.000 |

### Guards for planner2c combined

| Guard | Result |
|---|---|
| Stuck learners | 0 vs 0 |
| Independent correct answers (rate) | 0.776 vs 0.767 |
| Early answer leaks | ON ≤ OFF |
| Fit | ON ≥ OFF in every group (adults 0.58 vs 0.39) |
| Judge agreement | Events 92.9–93.6%; fit 85.3% |

## 4. Problems found and fixed along the way

1. **The quick check graded one reply late.** Teens sat in the check for three rounds. Fix: one item, graded in the same turn (amendment C, restart).
2. **Under-9 harm in PLN2.** Listen-and-do ran with no content. Fix: listen-and-do runs only when a kids lesson exists; otherwise children get present-practise-produce with child supports (amendment D).
3. **Stages moved on turn count.** Adults repeated tasks without focus, and children sat in "check". Fix: the evidence-only stage machine (planner2b).
4. **A stuck adult** (the same wrong sentence three times). Fix: two errors in a row → language focus. Then a repeated wrong answer counts as wrong in the same turn (deviation 1). Then it also counts as a failed try, so the answer comes after two tries (deviation 2, restart).
5. **The independent-correct measure only counted the first answer of a lesson.** Fix: right on the first try at a new item whose answer was not shown (amendment H). Re-scored on existing data.
6. **The kids lessons didn't match the A1 objectives.** Fix: 9 new linked lessons, written, reviewed and fixed. A lesson line that was a test answer was reworded.
7. **Listen-and-do lines were ignored** (the exercise instruction won). Fix: the listen-and-do step overrides the exercise. The do hint follows the answer rule (amendment I).
8. **The leak detector counted echoes and capitals items.** Fix: the detector ignores echoes of the learner's own sentence and case-only rewrites. Re-scored on existing data.
9. **My own errors, all corrected in the reports:**
   - I gave the wrong reason for the 9–12 fit splits.
   - I gave the wrong reason for the adults' 0 vs 2 independent correct answers.
   - A tutor note confused one agent run, which was re-run.

## 5. What we know now

- **Planner2c is safe and fits better in simulation** for adults, teens and 9–12s, and for under-9s on present-practise-produce with child supports.
  - No harm: +0.010 overall, and no group below −0.05.
  - Fewer answers given away, and no stuck learners.
- **The kids pack listen-and-do cannot be judged by this simulation.** Its simulated child learns only from teaching and graded practice. The tutor now delivers the stories, actions and chants (fit 1.86 vs 0.22), but the simulated test sees no gain, and the lost teaching time shows as harm (−0.125). Only real children can tell us whether it helps.
- **One content rule for the kids pack:** lesson lines must not reuse test-item sentences (for example "She can swim").

## 6. Open decisions (yours)

1. **Switch-on for lms-test.** lms-test runs `lms-test-live` on Vercel, which has none of the tutor work after graderV2. It needs:
   - a tutor PR into `lms-test-live` (a large merge into the LMS deploy branch; your yes or no is still open);
   - E2E run by hand;
   - `planner2` added to `ENARA_ENGINE_V2` in Vercel, which only you can do.
2. **Fix B (optional):** one model sentence in the task-based pre-task.
3. **Kids pack:**
   - (a) keep `kidsPack` off: under-9s get present-practise-produce, which passed; or
   - (b) a small supervised real-child pilot on lms-test, with a school, parent consent and a teacher check.
4. **The final 48-learner run before any real learners** (about 73 agent runs). Recommended setup: planner2c with `kidsPack` off, any fix you approve, and the amendment H and I measures.

## 7. Agent runs used

| Run | Agent runs |
|---|---|
| PLN2 | about 105 (incl. the stopped first run) |
| PLN2b | 73 |
| Fit agreement re-run | 2 |
| PLN2c (stopped + final) | 11 + 28 |
| PLN2k | 29 |
| PLN2k2 | 27 |
| PLN2f | 73 |
| **Total** | **about 348** |

Tutors were Sonnet; judges, reviewers and scorers were Opus.

## 8. Where things are

| What | File |
|---|---|
| Per-run reports | `research/deep-learning-simulation-v2/reports/exp4/AGENT_SIM_PLN2.md`, `AGENT_SIM_PLN2B.md`, `AGENT_SIM_PLN2C.md`, `AGENT_SIM_PLN2K.md`, `AGENT_SIM_PLN2K2.md` |
| Full tables per run | `reports/exp4/agent_sim_pln2*/ANALYSIS.md` |
| Plans | `docs/tutor/PLANNER2B_PLAN.md`, `PLANNER2C_NEXT_PLAN.md`, `PLANNER_METHODS_TABLE.md`, `KIDS_PACK_PLAN.md` |
| Protocol | `config/agent_sim_pln2/PROTOCOL.md` (amendments B–I) |
| Runner and analysis | `src/offline/pln2Study.ts`, `src/offline/pln2_analyze.py` |
