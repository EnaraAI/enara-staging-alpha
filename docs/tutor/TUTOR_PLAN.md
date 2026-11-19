# Tutor track plan (waiting for Mohamed's "go")

19 Nov 2026. Branches: `claude/tutor-*` only. All simulation work is labelled SIMULATION ONLY. The real-learner pilot (`ESL5_PILOT_PLAN.md`) is on hold.

## Usage rules for every step
- **Simulated learners:**
  - ESL6 and ESL7 learners are deterministic code (`learnerSim.ts`), so they cost no model usage.
  - Where an agent writes learner answers (the grader rounds), use **Haiku**.
- **Tutors: Sonnet.** They stand in for the engine, so a weaker model would make the comparison less fair.
- **Judges, scorers, raters, fidelity checks: Opus.**
- **Batches:**
  - At most 2 agents at a time.
  - Commit after every batch.
  - On a usage-limit stop, resume from the last commit with no data loss.
- **Reports:** one short line per finished step.

## 0. Record the rule change (needs "go")
- CLAUDE.md says "never with agents". You now allow agents.
- I'll change that line in `CLAUDE.md` and in the handoff, in a small PR.
- CLAUDE.md is shared with the LMS track, so this needs your OK.

## 1. Finish the grader fix (PR #30)
- Round 13: 150 fresh answers (Haiku writers) and 3 new Opus scorers.
- Target: controlled items ≥95%, false accepts ≤ the old grader's, free-item QWK ≥0.80.
- If it passes:
  - freeze the sha;
  - mark PR #30 ready;
  - run the E2E suite;
  - merge and deploy to lms-test with `graderV2` **off** (code only).
- If it fails: fix the failing rule, then run one more round on fresh answers.
- **Check needed:** `lms-test-live` and the study branches share no git history. I'll confirm the PR's base and merge path before merging.
- **Cost:** about 5 agent runs.

## 2. Resume ESL6 (restart from Round 1)
- Undo Round 2 (`6f1f084b`).
- Amend the protocol, recorded in DEVIATIONS:
  - new grader sha;
  - re-run `answercheck`;
  - re-score the pre-test;
  - LE stays the frozen ESL5 string + `graderV2`.
- Then run Rounds 1–10 as pre-registered: n = 270, delayed 7-day test, judge agreement ≥85%.
- **Cost and power by number of rounds:** see `ESL6_ROUNDS.md`. Corrected: 10 rounds is about 890 agent runs (the grader recheck was missing before), and power at n = 270 is 0.82, not 0.65 (0.65 was for n = 180).

## 3. ESL7: Track 2 switches, one at a time, against ESL5
- **First:** fix the Track 2 misses:
  - narrow the example guard;
  - write the child-length rule bank;
  - allow one instruction per message.
  - Then re-check on fresh seeds.
- **Design:** the ESL5 design (3 outcomes, controlled post-test). Arm A = ESL5. Arm B = ESL5 + one switch.
- **Order:** `exampleGuard`, `feedbackLadder`, `ruleBank`, `methodSelect`.
- **Each switch goes through two stages:**
  - a screen on 36 learners;
  - only if it looks better, a full confirmatory run on 108 learners.
- **Keep a switch only if** it beats ESL5 (p < 0.05, interval above 0) with all guards passing. A kept switch joins the new baseline for the next one.
- **`kidsBand`** is judged on the Kids measures (≥95% of replies within band limits, ≥90% "fits"), plus no loss on the post-test.

## 4. In parallel (small, code only)
- **Avatar latency:**
  - Check that the Anam and ElevenLabs keys are set on lms-test. The check reports only "present / missing" and never prints them.
  - Run a scripted Playwright timing run: 50 turns.
  - Fix the biggest delays first: streaming, connection warm-up, shorter first sentence.
  - Target: p50 ≤1.5 s, p90 ≤2.5 s.
- **Enara Kids:**
  - Fix the Moodle tutor and avatar launches so they land on Kids Home (`frontend/services/roleRouting.ts` only).
  - Then the child-length replies from step 3.
- **Shipping:** each is its own PR. It's done when the E2E suite passes, followed by auto-deploy and health check.

## Needed from you
- "go".
- Step 0 OK.
- ESL6 sample size (n = 270 or smaller).
- A real iPhone check of the Kids launch at the end, only if automation can't cover it.
