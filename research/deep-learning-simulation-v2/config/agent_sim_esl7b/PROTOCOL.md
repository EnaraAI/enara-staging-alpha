# SIMULATION ONLY

# ESL7b: reviewFirst check (pre-registration)

Written 21 Nov 2026, before any ESL7b tutor reply. Owner "go" for `docs/tutor/REVIEW_FIRST_PLAN.md`. Branch `claude/tutor-esl7`.

## Question
Does `reviewFirst` raise the 4-week delayed, unassisted score over NEW (all the LIT_REVIEW_GAP_PLAN switches, ESL7)?

## Design
- **Start state:** the saved ESL7 state after round 10 (commit `41b96349`). The NEW arm's 144 track files and 72 memory files are copied to `reports/exp4/agent_sim_esl7b`.
  - Session 1 of both outcomes, the immediate and 1-week tests, memory and forgetting are all as in ESL7.
- **One arm, NRF:** `ENV_OF.NEW` plus `reviewFirst` (`ESL7B=1`). The engine is the code of PR #51, cherry-picked into this branch.
  - The harness mirrors `buildLanguageTeachingContext`: `reviewFirstAdjust` and `REVIEW_FIRST_LINE` in `langCtx`, and the "Start here" removal in `planOf`.
- **Rounds 11–20 (session 2 of both outcomes):**
  - the same learners, seeds, calendar, judges and tests as ESL7;
  - Sonnet tutors (3 cells of 24 sessions) and Opus judges (72 cases per round);
  - the same task texts, with the ESL7b paths.
- **4-week test:** form A on day 28, scored as in ESL7.

## Analysis
- **Primary:** the 4-week score per learner (the mean of their 2 outcomes), **NRF − NEW**, against ESL7's NEW results.
  - Exact paired sign-flip test (100,000 flips) and a 95% bootstrap interval.
  - **reviewFirst helps if p < 0.05 and the interval is above 0.**
- **Secondary (descriptive):**
  - NRF − BASE and NRF − P+, against the ESL7 values;
  - mastery counts;
  - the share of session-2 opening replies that are a review item;
  - early answer leaks;
  - results by skill and by age band.
- **Flagged outcomes:** the same 3 ⚑ outcomes as ESL7 (amendment D). They are reported with and without those outcomes.

## Limits
- One arm against stored results. The tutor agents are new runs, so some difference can come from tutor-agent variation.
- n = 72.
- Simulated learners only.

## Estimate
About 10 rounds × (1 tutor agent + 1 judge agent), plus 1 scorer: about 21 agent runs.
