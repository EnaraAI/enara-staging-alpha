# ESL stage-1 agent study: level-based explicitness (`levelExplicit`)

**SIMULATION ONLY. AI-simulated learners, AI tutors, AI post-test takers, AI scorers and AI raters. Nothing here is evidence about real learners.** No API was called; every role was played by a sub-agent. 15 Nov 2026.

Protocol (committed before any session): `config/agent_sim_esl1/PROTOCOL.md`, with two addenda. Lesson readiness: `config/agent_sim_esl1/READINESS_CHECK.md`. Data: `agent_sim_esl1/` (sessions, turn tags, post-test answers and scores, ratings, `results/ESL1_SUMMARY.json`). Analysis: `reports/analysis/esl1_analysis.py`.

## Bottom line
- **NO-GO for stage 2.**
- **Learning:** for the 12 explicit-first learners, `levelExplicit` did not raise post-test scores over A0. The difference was 0.000, 95% interval [−0.069, +0.069].
- **Ratings:** raters scored its explanations much clearer (+1.71 [+1.00, +2.42] for the same learners). Clearer explanations did not turn into better answers.
- **Guards:** answer protection held (5.0 vs 5.0) and no answer leaked. The "two asks" guard failed as pre-registered in every ENARA arm. After inspection, the A0+LE arm itself had 0 real two-ask replies.
- **Plain tutor:** A0+LE did **not** clearly beat it on learning (+0.037 [−0.009, +0.079], all 18 students). It did beat it clearly on every rating, including answer protection.

## What was run
| Arm | Setting |
|---|---|
| P | plain tutor |
| A0 | `wrongAnswer,closing,selfCheck,clarity,hints` (+ `strandLog` for logging) |
| A0+arb (ARB) | A0 + the 23-method teaching plan + `arbitration` |
| A0+LE (LE) | A0 + the plan + `levelExplicit` (`arbitration` forced on) |

- **Learners:** 18 synthetic students: 6 at A1, 6 at A2, 6 at B2. Each worked on one form: articles, copula be, or third-person -s. Each had a seeded Arabic-L1 error profile.
- **Records:** A1 and A2 students were "not assessed" or "emerging". B2 students were "proficient".
- **Pairing:** the same students were used in every arm, giving 72 sessions.
- **Lessons:** research-only fixtures, each with success criteria and tagged items.

**Deviations, all disclosed in the protocol addenda:**
1. **Session length.** Sessions were cut from 6 to **4 tutor turns** on owner instruction. The closing recap starts at the 5th learner message, so it never ran, and the recap rating says nothing.
2. **Batching.** Agents were batched more heavily to save usage: from round 3, one tutor or student agent per arm (18 sessions); 6 cases per post-test agent; 48 responses per scorer agent; 6 cases per rater agent. Arms were never mixed within a tutor or student agent, and at most 3 agents ran at a time.
3. **Models.** Sessions were played by `sonnet` agents. The weekly limit for `sonnet` then ran out, so **all** post-tests, scoring and ratings were done by the session's default model. The three post-test batches first taken with `sonnet` were redone so every case uses one model; the superseded answers are kept in `post/superseded_sonnet/` and are not used.
4. **Student opener.** Student agents were told to ask for an exercise in their first message. Without this, `levelExplicit` never shows its rule line (Step 0 finding).

## Did the switch do what it is built to do?
- **Rule line.** In arm LE it fired on turn 1 for **all 12** explicit-first learners, plus 4 later turns. It fired for 0 of the B2 learners and never in A0 or ARB. For example, the tutor's first reply to an A1 learner opened with "Look: cat starts with a 'k' sound, so we say a cat ... Use a before a consonant sound and an before a vowel sound", then gave the exercise.
- **Moves.** The engine chose the same moves in A0, ARB and LE (present item, model, corrective feedback, fade support for B2).
- **Strand split.** 100% language-focused in every ENARA arm (72 of 72 turns). As expected, there is no input or fluency activity.
- **Reply length.** Tutor replies averaged 30.7 words in P, 32.1 in A0, 33.6 in ARB and 35.4 in LE.

## Primary outcome: post-test accuracy (4 controlled + 2 free-production items)
**Scoring.** Free items were scored blind by two passes of scorer agents, which agreed exactly on 98.6% of the 288 responses. Controlled items were scored by exact match.

**Means (0 to 1):**
| Group | P | A0 | A0+arb | A0+LE |
|---|---|---|---|---|
| All 18, combined | 0.634 | 0.650 | 0.620 | 0.671 |
| All 18, controlled | 0.667 | 0.681 | 0.639 | 0.681 |
| All 18, free production | 0.569 | 0.590 | 0.583 | 0.653 |
| Explicit-first (n = 12), combined | 0.528 | 0.556 | 0.500 | 0.556 |
| B2 proficient (n = 6), combined | 0.847 | 0.840 | 0.861 | 0.903 |

**Contrasts.** Each cell gives the paired difference over students, the bootstrap 95% interval, and the raw and Holm-corrected p-values from an exact sign-flip test. Holm is over the 4 contrasts.

| Contrast | All 18, combined | Explicit-first, combined | Explicit-first, controlled | Explicit-first, free |
|---|---|---|---|---|
| LE − A0 | +0.021 [−0.032, +0.076]; p .57; Holm 1 | **0.000 [−0.069, +0.069]; p 1.0** | −0.021 [−0.083, +0.042] | +0.042 [−0.062, +0.125] |
| LE − ARB | +0.051 [+0.002, +0.111]; p .094; Holm .38 | +0.056 [−0.014, +0.139] | +0.062 [0.000, +0.167] | +0.042 [−0.062, +0.146] |
| LE − P | +0.037 [−0.009, +0.079]; p .20; Holm .60 | +0.028 [−0.028, +0.076] | 0.000 [0, 0] | +0.083 [−0.104, +0.229] |
| A0 − P | +0.016 [−0.037, +0.072] | +0.028 [−0.049, +0.104] | +0.021 [−0.042, +0.083] | +0.042 [−0.125, +0.188] |

**No learning contrast clears zero after Holm.** The only uncorrected interval above zero is LE − ARB on all 18 (+0.051 [+0.002, +0.111]), and it does not survive correction (Holm p .38). It is not a win.

## Secondary outcomes
- **Next-level CEFR items:** no difference. Every interval includes zero. All 18: P 0.444, A0 0.472, ARB 0.472, LE 0.444.
- **Consistency check** (parallel form after a filler task; not memory over days): all three ENARA arms score *below* the plain tutor (all 18: P 0.685, A0 0.611, ARB 0.611, LE 0.613).
  - A0 − P: −0.074 [−0.153, −0.009], p .055.
  - LE − P: −0.072 [−0.153, −0.007].
  - For explicit-first learners, A0 − P is −0.118 [−0.222, −0.035], p .031, Holm .12.
  - The uncorrected intervals exclude zero; the Holm-corrected results do not. **Unexplained, worth checking** (see limits).
- **Ratings** (2 blind passes, 4 tutors per case; overall-score correlation between passes 0.95; same top pick in 72% of cases):

| Rating, all 18 | P | A0 | A0+arb | A0+LE |
|---|---|---|---|---|
| Overall | 1.83 | 3.11 | 3.67 | 3.53 |
| Clarity | 3.19 | 2.69 | 3.47 | 3.78 |
| Reasoning | 1.78 | 3.83 | 3.92 | 3.92 |
| Answer protection | 2.78 | 5.00 | 4.97 | 5.00 |
| Hint progression | 1.25 | 3.03 | 3.50 | 3.17 |
| Recap (the closing never ran) | 1.00 | 1.78 | 2.83 | 2.03 |

- **Clarity contrasts:**
  - Explicit-first learners: LE − A0 clarity **+1.71 [+1.00, +2.42]**, LE − ARB +1.04 [+0.54, +1.50], LE − P +1.13 [+0.46, +1.83].
  - All 18: LE − A0 +1.08 [+0.42, +1.75].
  - A0 is still behind the plain tutor on clarity: −0.50 [−1.17, +0.19].
- **Top pick:** ARB was ranked first 21 times, LE 8, A0 7 and P 0.

## Guards (A0+LE against A0)
| Guard | Result |
|---|---|
| (i) Answer protection must not fall by more than 0.3 | **Pass.** 5.00 vs 5.00 (no change). |
| (ii) Answer leaks reaching the learner must not rise | **Pass.** LE 0 turns, A0 1, ARB 0, P 2 (of 72 turns each). |
| (iii) Replies with two asks must be 0 in every ENARA arm | **Fail as pre-registered:** flagged A0 6, ARB 7, LE 5. |

**Detail on guard (iii).** All flagged replies end with the tutor's own "Tell me the rule in your own words." The engine's closing never ran here, so these asks were written by the model. The pre-registered detector counts that ask both as a closing ask *and* as a task, which is a detector defect. With the own-words sentence removed, real two-ask replies were A0 1, ARB 5 and **LE 0**. The guard is reported as failed because that is what the fixed rule says. The detector defect should be fixed before the next study.

## Did anything change for the B2 learners?
- **Expected:** for B2 proficient learners, the engine prompts in A0+arb and A0+LE are identical. No rule line fired, the learners were not explicit-first, plan gating did not apply, and `arbitration` was on in both arms. The parity tests confirm this case byte for byte.
- **Observed:** LE − ARB on B2 combined is +0.042 [+0.007, +0.083], an uncorrected interval above zero. B2 clarity ratings moved the other way, from 3.83 to 2.67.
- **Interpretation:** the inputs were the same, so this is not an effect of `levelExplicit`. It is run-to-run noise from different agent runs, and it gives the noise level of this setup: about ±0.05 on the post-test and about ±1 on a rating at n = 6. The protocol calls any B2 change a warning, so it is flagged here, with that interpretation.

## Decision (fixed in advance)
**NO-GO for stage 2.**
- **Condition (a) fails:** A0+LE − A0 for the explicit-first learners, on the combined primary outcome, is 0.000 [−0.069, +0.069].
- **Condition (b) fails as pre-registered:** guard (iii), though not because of the LE arm (its corrected count is 0).

**What to revise in `levelExplicit`, from the transcripts:**
1. **Stating the rule once is not enough to change answers.** Learners heard a clear rule on turn 1 and still made their typical error on the first try. For example, an A1 articles learner in LE answered "a" for "___ orange" right after the rule. Raters saw a much clearer explanation, but the post-test did not move. The next version should tie the rule to the learner's *own* error type: a right/wrong pair built from the Arabic-L1 error the learner just made (roadmap change C). It should also require one more production attempt in a new context before moving on (change D).
2. **The rule appears only when an exercise is presented.** A learner who opens with a greeting gets no rule line (Step 0). Firing it on the first explanation turn as well would close that gap.
3. **Hints for explicit-first learners did not rate better.** LE hint progression was 3.17, below ARB's 3.50. Level 2's right/wrong pair often repeated the turn-1 example. It should use a new pair each time.
4. **Fix the two-asks detector** (it counts the own-words ask as a task). Separately, look at why the plan arm (ARB) produced 5 real two-ask replies.

**Stated plainly:**
- **Against the plain tutor:** A0+LE did **not** clearly beat it on learning (+0.037 [−0.009, +0.079]; explicit-first +0.028 [−0.028, +0.076]). On the consistency check all ENARA arms were below it before correction. A0+LE did beat it clearly on every rating (overall +1.69 [+1.33, +2.08]; clarity for explicit-first learners +1.13 [+0.46, +1.83]; answer protection +2.22 [+1.33, +3.11]). Ratings and learning disagree again, as in every earlier study.
- **For the B2 learners:** nothing changed in the engine's behaviour. The differences seen are run-to-run noise (see above).

## Limits
- **Simulated learners:** the same model family plays student, tutor, post-test taker, scorer and rater. Sessions used one model setting; post-tests, scoring and ratings another.
- **L1 errors:** seeded L1 errors are instructions, not real transfer. Students were told to keep their error "until a lesson really changes how you write", which may make the post-test insensitive to short teaching.
- **Delay:** there is no real delay; the consistency check is not memory.
- **Session length:** 4 turns, not 6, so the closing recap never ran.
- **Sample:** 18 students (12 explicit-first, 6 B2) and one replication. Exact sign-flip p-values cannot go below about 0.0005 at n = 12 (2 of 4,096 sign patterns); the intervals are wide.
- **Engine state:** engine history is reconstructed from the dialogue.
- **Batching:** a tutor agent handled up to 18 sessions per call (same arm, different students).
- **Noise:** the B2 "identical input" comparison shows that agent noise alone moves the post-test by about 0.05.
- **Unexplained result:** why ENARA arms scored lower than the plain tutor on the parallel form was not investigated.
