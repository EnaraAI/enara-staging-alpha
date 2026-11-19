# SIMULATION ONLY

# PLN2b: planner2b (evidence-based stages) vs today's planner — result

19 Nov 2026. Branch `claude/tutor-planner2`. This was the same check as PLN2: the same 48 learners, 7 rounds and a 7-day delayed test. It was run on planner2b (plan: `docs/tutor/PLANNER2B_PLAN.md`). Full tables are in `reports/exp4/agent_sim_pln2b/ANALYSIS.md`.

No real learners took part. There were 48 rule-based learners in 4 groups of 12, each run with the planner OFF (today's ESL5 setting) and ON. Sonnet agents played the tutors, and Opus agents did all the judging.

## Verdict: **NOT PASSED** — keep planner2 off for real learners

Two of the six rules failed: a guard and fit-judge agreement. Learning itself passed.

| Rule | PLN2 (before) | PLN2b (now) | |
|---|---|---|---|
| No harm on 7-day delayed test | −0.031 [−0.094, +0.021]; LAD −0.104 | **+0.016 [−0.031, +0.068]**; no group below 0 | **Pass** |
| Fit: ON ≥ OFF in every group + quick-check compliance ≥ 95% | compliance item invalid | ON ≥ OFF in all 4 groups; compliance 12 of 12 | **Pass** |
| Guard: stuck learners (ON ≤ OFF) | – | OFF 0, ON **1** | **Fail** |
| Guard: independent correct answers (ON ≥ OFF) | – | OFF 8, ON 15 | Pass |
| Guard: early answer leaks (ON ≤ OFF) | – | OFF 8, ON 6 | Pass |
| Event-judge agreement ≥ 85% | 90.5% | 93.6% (59 of 63) | Pass |
| Fit-judge agreement ≥ 85% | 77.9% | **83.8%** (57 of 68; all within 1 point) | **Fail** |
| Grader recheck (reported) | 100% | 100% on gap-fill and choice items | Pass |

## By group (delayed test; ON − OFF)

| Group | Primary items | Use (own sentences) | Fit (own rubric) |
|---|---|---|---|
| B1+ adults, task-based | 0.000 | +0.056 | +0.72 |
| Teens, test-teach-test | +0.021 | 0.000 | +0.64 |
| Children under 9 (PPP + child supports; no kids-pack content yet) | **+0.042** (was −0.104) | −0.028 | +0.17 |
| Children 9–12, PPP + child supports | 0.000 | +0.042 | +0.17 |

## What changed, in plain words

1. **The under-9 harm is gone.** Without kids-pack content they now get PPP with child supports instead of an empty listen-and-do. The delayed test went from −0.104 to +0.042.
2. **Stages now move on evidence.** 9 of 12 adults went to language focus after the task. Repeats fell from 11 to 3. Children are no longer parked in "check": wrong answers send them back to practice.
3. **The one stuck learner is a real bug.** Adult s2001 wrote the same wrong sentence three times (turns 2–4). The task stage always lasts 3 messages, so the planner held the learner there instead of moving to focus. Fix: during the task, after the second error on the same form, go to focus. This needs one small rule and a test.
4. **Fit-judge agreement is up but still below the bar.** Most splits were on the 9–12 child items: game/story and praise for effort.

## Next (no runs until your "go")

1. Fix the task-stage rule (item 3), with a test. No agent runs needed.
2. Tighten the two 9–12 fit items and re-run fit agreement only: about 2 Opus runs on the existing transcripts.
3. If both pass, the planner2b verdict can be re-read without a new full run. A kids-pack listen-and-do test is still separate (about 25 runs).

## Run notes

- 672 tutor replies, 0 rejected judge events, and no reply with two questions.
- 2 tutor flags in round 5 are logged in `agent_sim_pln2b/RUN_NOTES.md`. One was checked and found not to be a bug.
- Agent runs: 42 Sonnet tutors and 31 Opus runs (14 round judges, 1 event-agreement judge, 9 fit judges and 7 recheck batches).
