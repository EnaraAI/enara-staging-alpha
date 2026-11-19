# ESL5 real-learner pilot: plan (waiting for Mohamed's "go")

Branch `claude/tutor-esl5-pilot-plan`. Status: draft, 19 Nov 2026. Nothing runs before "go".

## Goal
Find out whether the frozen ESL5 engine is safe and usable with real A1–A2 learners, and get first pre/post numbers.
This is a feasibility pilot. It is too small to prove ESL5 works better.

## Fixed
- **Engine:** ESL5 exactly as it is, `ENARA_ENGINE_V2="wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5"`. No changes during the pilot.
- **Where:** lms-test.enara.app only. test.enara.app is frozen until Mohamed reopens it.
- **Content:** the three ESL5 outcomes only: articles, copula (be), third-person -s.

## Design
- **Size:** 16–24 A1–A2 learners from one school or class.
- **Arms:** half get ESL5, half get the plain engine (flag empty), assigned at random per learner. Same lessons, same time.
- **Schedule:** a pre-test, then 2 tutor sessions (as in the simulation), then a post-test the next day and a delayed test 7 days later.
- **Consent:** written consent from parent or guardian and the school, plus the learner's own agreement. No recordings beyond normal chat logs. Data is pseudonymised for analysis.

## Measures
1. **Main:** change from pre-test to post-test on controlled items, per arm, with new items not used in any study.
2. Delayed test score, and free-sentence accuracy.
3. **Safety (checked automatically on every reply):** answer given away early, two questions in one message, learners stuck 3+ turns, replies flagged by the content filter. Stop rule: any harmful reply, or early answers in ESL5 above the plain arm, pauses the pilot.
4. Completion rate, minutes per session, and a 3-question learner and teacher survey.

## Before learners start (all automated)
1. **Per-learner switch.** Today `ENARA_ENGINE_V2` is one setting for the whole server. Add a per-learner (or per-class) arm so both arms can run side by side. The ESL5 code itself is untouched. It ships through a PR, with the E2E suite and the pipeline's deploy, health check and rollback.
2. **Grader.** Merge the fixed grader (PR #30, sha `f4df7ca8…`) after re-checking it with Anthropic API judges: controlled items ≥95%, false accepts not higher. (ESL5 never used this grader, but real learners' answers will.)
3. **Judging.** Set up API-judge agreement (target ≥85%) for the safety checks, using the real engine's transcripts.
4. **Comparison arm.** Check that the plain arm matches the frozen production prompt (open question 1).
5. **Dry run.** Run 10 simulated learners through lms-test end to end on the Anthropic API and the real engine, then send the result.
6. **Cost estimate** for API judging and the dry run, sent before any spend.

## Needed from Mohamed
- "go" on this plan.
- The school or class, and the signed consent forms. Automation can't recruit learners.

## Reporting
One line per deploy. A short result after post-test and after the delayed test.
