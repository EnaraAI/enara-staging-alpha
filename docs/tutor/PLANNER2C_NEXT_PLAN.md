# Planner2c: next steps (plan, waiting for "go")

19 Nov 2026. Branch `claude/tutor-planner2`. Short plan as CLAUDE.md asks.

## 1. Switch planner2 on for lms-test: not a flag flip (needs your decision)

What I found:
- **lms-test runs the `lms-test-live` branch on Vercel.** That branch has none of the tutor work after graderV2: no ESL5/ESL6 changes, no planner2, no kids pack. `claude/tutor-planner2` is 1,096 commits ahead of it and 143 behind.
- **The switch is the `ENARA_ENGINE_V2` env var on Vercel.** I can't see or set it: no access, and it is a secret-bearing setting.
- **The deploy pipeline (E2E → merge → deploy) runs only for `claude/lms-*` and `claude/parents-*` PRs.** A tutor PR would not trigger it.

So "on for lms-test" needs:
- **(a)** A PR from a tutor branch into `lms-test-live` that brings in the tutor engine with planner2c. Everything stays off by default. That is a large merge into the LMS track's deploy branch.
- **(b)** E2E run on it by hand (workflow_dispatch) or by widening the workflow trigger. The workflow file is on the LMS track, so this is its owner's call.
- **(c)** You add `planner2` (plus the ESL5 set the simulations used: `wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5,graderV2`) to `ENARA_ENGINE_V2` in the lms-test Vercel project, then redeploy.

Decision needed: may the tutor track open that PR into `lms-test-live`? It touches the LMS deploy branch.

## 2. Kids-pack listen-and-do test (about 25 runs)

1. **Bring planner2c into `claude/tutor-kids-pack`.** That branch has the planner at b1853991, 79 commits behind, plus 8 kids commits. Merge, then run tests.
2. **Connect the content signal.** `ladContent` = a reviewed kids-pack lesson exists for the objective (`kidsPack` switch on).
3. **Protocol amendment G, recorded first:**
   - the 12 under-9 learners only (same ids and seeds);
   - OFF (today) vs ON (planner2c + kidsPack) → listen-and-do with the real stories, chants and commands;
   - 7 rounds and a 7-day delayed test;
   - same pass rules and guards;
   - the listen-and-do fit items (story/chant, steps, child tone);
   - fit agreement on the PLN2b listen-and-do sample.
4. **Runs:** 14 Sonnet tutors + about 11 Opus (7 judges, 1 agreement, 2 fit, 1 fit agreement; the recheck is folded in).

## 3. Final 48-learner run before any real learners (about 73 runs)

- All 4 groups, the final planner (2c, plus any fix from 4 that you approve, plus kidsPack if 2 passes), 7 rounds and the delayed test.
- One run, one clean verdict. It replaces the combined PLN2b + PLN2c verdict.

## 4. Why adults had 0 independent correct answers ON vs 2 OFF

**My PLN2c report gave the wrong reason** ("answer given sooner after repeats"). The data show:
- **Both cases are the first answer of the lesson.** All OFF and ON "independent correct" answers come right after the opening reply. That is the only reply with no feedback move, because a feedback move (`corrective_feedback_retry`) is chosen on almost every later turn.
- **OFF:** the opening reply is a worked example, so 2 of 12 adults copied the model right.
- **ON:** the opening is the task-based "pre-task" (set the scene, no model), so 12 of 12 first answers came from their own wrong rule.
- **Answers were not given more often ON:** 11 answer-with-reason moves vs 13 OFF.

So the gap is (i) how the measure is built and (ii) the pre-task having no model of the language. It is not the answer rule.

Proposed fixes (no runs):
- **A. Fix the measure (recommended).** "Independent correct" = a right answer to a **new** item or task when the reply before it did **not** show that item's answer. Feedback on an earlier item no longer disqualifies it.
  - Re-score PLN2b and PLN2c on the existing transcripts (code only, no agents).
  - Pre-register it for the final run.
- **B. Pre-task with one model line (optional).** In the task-based pre-task, the tutor gives one short example sentence that uses the target form in the task's setting, then sets the task. This is the standard task-based pre-task ("useful language").
  - It may lift first answers. It also makes the task less of a diagnosis.
  - If you want it: code + test, then it is covered by the final run in 3.

## Order

1. A (measure fix + re-score, no agents).
2. Kids-pack test (2).
3. B if approved.
4. Final 48-learner run (3).
5. The lms-test switch-on (1) whenever you decide; it is independent of the runs.
