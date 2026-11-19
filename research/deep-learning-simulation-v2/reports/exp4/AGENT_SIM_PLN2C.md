# SIMULATION ONLY

# PLN2c: planner2c, adults-only re-check — result

19 Nov 2026. Branch `claude/tutor-planner2`. Protocol amendment F, including deviations 1 and 2. Run folder: `reports/exp4/agent_sim_pln2c`. No real learners took part. The run used 12 rule-based adults, each with the planner OFF (today) and ON. Tutors were Sonnet and judges were Opus.

## Verdict for planner2c: **PASSED** (simulation only)

Amendment F set the rule in advance: adults from PLN2c, plus teens, under-9s and 9–12s from PLN2b, whose planner code is unchanged.

| Rule | Result | |
|---|---|---|
| No harm, 7-day delayed test (all 48) | +0.010 [−0.037, +0.063]; no group below −0.05 | Pass |
| Fit: ON ≥ OFF in every group | Adults 0.58 vs 0.39; other groups as in PLN2b; quick check 12/12 | Pass |
| Guard: stuck learners (ON ≤ OFF) | 0 vs 0 (PLN2b: 1 vs 0) | Pass |
| Guard: independent correct answers (ON ≥ OFF) | 7 vs 2 overall; **adults alone 0 vs 2** | Pass (overall) |
| Guard: early answer leaks (ON ≤ OFF) | 6 vs 9 | Pass |
| Judge agreement ≥ 85% | Events 92.9%; fit 85.3% (amendment E) | Pass |

## By group (delayed test, ON vs OFF)

| Group | OFF | ON | Diff [95% CI] |
|---|---|---|---|
| Adults (PLN2c) | 0.792 | 0.771 | −0.021 [−0.146, +0.104] |
| Teens (PLN2b) | 0.917 | 0.938 | +0.021 [0.000, +0.062] |
| Under 9 (PLN2b) | 0.792 | 0.833 | +0.042 [−0.104, +0.208] |
| 9–12 (PLN2b) | 0.917 | 0.917 | 0.000 [0.000, 0.000] |

## What changed and what it did

1. **Repeated wrong answers.** If the learner sends the same wrong sentence again, it now counts as wrong in that same turn. Two wrong answers in a row in the task go straight to language focus.
2. **Answer after two failed tries now covers task sentences.** On a repeated wrong sentence, the tutor gives the corrected form with its reason instead of another hint.
3. **Effect on adults.** In round 3, 7 of 12 adults went to language focus. Their wrong-belief strength fell from 1.75 to 0.67 in that round, and nobody got stuck. The first PLN2c run, before fix 2, had 3 stuck adults.

## Limits (read before switching on)

- **The adults-only check is small** (n = 12). Its own no-harm interval is wide (−0.146), so it would not pass alone. The combined 48 learners pass.
- **Adults alone: independent correct answers were 0 with the planner ON vs 2 OFF.** Correction (checked after this report was written): this is not "answer given sooner". Both OFF cases are the first answer of the lesson, after a worked-example opening. The ON opening is a pre-task with no model. Answer-with-reason moves were 11 ON vs 13 OFF. See `docs/tutor/PLANNER2C_NEXT_PLAN.md` §4. At the end of the lessons the OFF adults were slightly lower (0.17 vs 0.33). The delayed test difference is small (−0.021).
- **This run's own fit-agreement sample was 3 cases, at 60%.** The rule uses the amendment E figure (85.3%, 12 cases). That one passed by a single item score.
- **There is no listen-and-do content yet.** Under-9s got present-practise-produce. The kids pack is a separate test.

## Next (no runs until your "go")

- **Switch planner2 on for real learners** on lms-test.enara.app only, behind its switch. That is your decision; I haven't changed anything.
- **Optional:** a full 48-learner run of planner2c, to replace the combined verdict. About 73 agent runs.
- **Kids-pack listen-and-do test:** about 25 agent runs.

Run notes: 336 tutor replies; 0 rejected judge events; 0 replies with two questions; grader recheck 100% on gap-fill and choice. Two deviations are recorded in PROTOCOL.md. The first, stopped run is in git history. One round-2 tutor run produced no replies because of my unclear note, so it was rerun. Agent runs: 15 Sonnet and 13 Opus in this run; the stopped run used 8 Sonnet and 3 Opus.
