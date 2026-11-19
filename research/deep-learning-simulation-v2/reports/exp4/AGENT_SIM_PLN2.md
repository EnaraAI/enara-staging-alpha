# SIMULATION ONLY

# PLN2: planner2 (lesson shapes) vs today's planner, 4 learner groups — result

19 Nov 2026. Branch `claude/tutor-planner2`. Protocol `config/agent_sim_pln2/PROTOCOL.md` with amendments B (7 rounds, 1 recheck scorer) and C (one-step quick check, children's stage fix, use measure; restart). Run notes: `reports/exp4/agent_sim_pln2/RUN_NOTES.md`. Full tables: `reports/exp4/agent_sim_pln2/ANALYSIS.md`.

No real learners. 48 rule-based learners in 4 groups of 12, each with planner2 OFF (today's ESL5 setting) and ON (P2). Tutors were Sonnet agents; all judges were Opus agents.

## Verdict: **NOT PASSED** — keep planner2 off for real learners

| Pre-registered rule | Result | |
|---|---|---|
| No harm on the 7-day delayed test (overall CI low > −0.05, no group mean < −0.05) | −0.031 [−0.094, +0.021]; listen-and-do group −0.104 | **Fail** |
| Fit: P2 ≥ OFF on each group's rubric, and quick-check compliance ≥ 95% | P2 ≥ OFF on all 4 groups; compliance item invalid (see below) | **Fail (as scored)** |
| Judge agreement ≥ 85% | Event judges 90.5% (57 of 63); fit judges 77.9% exact, 97.1% within 1 point | **Fail (fit judges)** |
| Grader recheck (reported) | 100% on gap-fill and choice items | Pass |

## By group (delayed test, primary items; P2 − OFF)

| Group | OFF | ON | Diff | Use (own sentences) diff |
|---|---|---|---|---|
| B1+ adults with a goal (task-based) | 0.688 | 0.688 | 0.000 | +0.056 |
| Teens (test-teach-test) | 0.938 | 0.938 | 0.000 | 0.000 |
| Children under 9 (listen-and-do) | 0.896 | 0.792 | **−0.104** | **−0.083** |
| Children 9–12 (present-practise-produce + child supports) | 0.938 | 0.917 | −0.021 | −0.028 |

Pre-test equal in both arms. On the immediate test P2 was slightly ahead overall (+0.016); task-based adults +0.104.

## What this means

1. **The harm comes from listen-and-do (children under 9).** Its fit scores are near zero in both arms: story/chant 0.08 (P2) vs 0.00 (OFF), listen-and-do steps 0.17 vs 0.08. The planner gave the lesson shape and stage, but this branch has no lesson content: the stories, chants and commands are in the kids pack (`claude/tutor-kids-pack`), which was not part of this test. So the tutor was told "listen and do" with nothing to tell or do, and taught less grammar than OFF.
2. **Task-based (adults) and present-practise-produce for children 9–12 did no harm** and fit better: task goal 1.25 vs 0.83; praise for effort 1.08 vs 0.58.
3. **Teens:** the one-step quick check worked (0 of 12 check replies had teaching words; teaching from reply 2; same delayed score). The fit item for the check still asked whether "the first three exercises" had no teaching. It was written for the old 3-item check and not updated with amendment C (my error), so the 0% compliance figure is not valid.
4. **Fit-judge agreement (77.9%) is below 85%,** so the fit table is indicative only.

## Next (no agent runs until your "go")

1. Re-test only listen-and-do with the kids pack content switched on (`kidsPack`), against OFF. 12 + 12 sessions, about 25 agent runs.
2. Fix the teens' fit item for the one-step check and re-score only those 12 P2 + 12 OFF transcripts (1–2 agent runs; the transcripts already exist).
3. Tighten the fit rubric wording where judges split (task goal, teach-the-gaps), then re-run fit agreement (1 run).

## Run notes

- 672 tutor replies, 0 rejected judge events; no reply with two questions; early answer leaks 7 per arm.
- Stopped first run (amendment C) kept in git history. One tutor omitted 1 session in round 1 (rerun); one tutor edited its own reply file once (logged).
- Agent runs: about 75 in the restart, about 30 in the stopped run, plus the harness build.
