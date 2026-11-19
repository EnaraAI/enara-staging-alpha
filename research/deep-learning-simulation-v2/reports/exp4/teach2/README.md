SIMULATION ONLY. NO API.

# TRACK 2 teaching check (offline harness)
Plan: TUTOR_TRACK2_TEACHING_PLAN.md ("How it's tested"). Runner: `src/offline/teach2Study.ts`; lessons: `src/offline/teach2Fixtures.ts` (ESL6 lessons + the four approved data fixes).
Agents stand in as tutors and judges (task files in `config/agent_sim_teach2/tasks/`); no model API is called. ESL6 files are not read or written by this check.

- `main/`: 30 outcomes x 6 new learners (ids 1100-1279) x 2 arms (PP = frozen P+ prompt, LE = ESL6 LE + teach2 bundle), turns 1-3, judged with the ESL6 judge task.
- `kids/`: 30 outcomes x 3 age bands (child / teen / adult, ids 1300-1389), LE arm, turns 1-3, deterministic ageFit checks + 3 age-fit judges.
- `rulebank_review/`: 3 reviewer agents, majority vote, disagreements fixed.
