# planner2e: open fixes after PLN2f, plan (20 Nov 2026)

Owner order: 1 → 4, then one small re-check on the affected learners only. Branch `claude/tutor-kids-pack`.

1. **Right/wrong pairs (high priority).**
   - Collect every pair:
     - static: rule bank (33 entries plus the vocab confusion pairs), the Arabic-error lines, and examples inside prompt text;
     - generated: all 141 pairs the tutors wrote in PLN2f.
   - Automatic check `pairProblem(right, wrong)`, in code:
     - same sentence;
     - only content words changed (a meaning swap, so the "wrong" sentence is likely good English);
     - a joining-word swap (and/but/so/because).
   - Runtime guard: a flagged pair loses its "Wrong:" sentence. It runs only where the engine asks for pairs (`releaseAfterTwo`, `clarity`, `levelExplicit`, `ruleFirst`, `ruleBank`, `liveError`).
   - Every pair instruction gets one line: "the wrong sentence must be incorrect English because of the form, never a correct sentence with another meaning; for a word-meaning or joining-word point, give no pair."
   - Static pairs that fail are rewritten. A test runs the check over the whole rule bank.
   - Independent Opus check (2 agent runs) on all static pairs and the 141 generated pairs, without seeing the code's verdicts. Report the agreement.
2. **Empty answer (children).** Already fixed. It is confirmed by re-running learner 2035 in the re-check.
3. **Teacher score.** Apply A (no second task), C (own-sentence ask names the point), D (children: accept correct answers outside the lesson list) and E (the task-based lesson repeats the task after language focus). B is part of fix 1. Each gets a test.
4. **Item repeats.** Check every place that names a lesson item. Add a test that an answered item is never named as the next or presented item, except as a retry of the open item before its answer is given.
5. **Re-check.**
   - Only the affected learners, planner ON, 7 rounds: 2035, the item-repeat sessions, the low teacher-score sessions and the sessions with bad pairs. Compared with the same learners in PLN2f.
   - Estimate: about 18 agent runs (2 pair checks, 7 Sonnet tutors, 7 Opus judges, 2 fit judges).
6. **Report:** a short `AGENT_SIM_PLN2G.md`.
