# ENARA tutor improvement roadmap (from the Experiment 3 gap analysis)

*14 Nov 2026. AI-simulation evidence only. This is a proposal: nothing here has been implemented or tested, and no production code was changed.*

## Principles

1. **Preserve ENARA's identity**: adaptive, student-centred tutoring that makes the learner think and does not hand over answers. No item below weakens the try-first rule, the pre-attempt answer guards, or the English-only rule (the guards stay as tested in `r43ProductQuality`, `fix*` and `avatarLanguageLink` tests).
2. **Nothing recommended from aggregate scores alone.** The aggregate A-vs-C difference is not distinguishable from zero. Every item below rests on transcript evidence plus a measured metric, and says how strong that evidence is.
3. **No change to make ENARA longer or add a feature without an expected learning mechanism and a test.** Where the item is "do less" (cost), it is explicitly non-inferiority tested.
4. **Do not tune to the evaluation harness.** The 6-turn cap in these experiments is a harness property. Items that mention "session end" are specified for real sessions (learner ends, objective covered, or a turn threshold) and must also be tested on held-out outcomes (Experiment 4 protocol).

## Priority summary

| ID | Change | Priority | Evidence strength |
|---|---|---|---|
| P0-1 | Closing recap + "say the rule in your own words" check | P0 | Metric (6.7% vs 31.3% recap) + 3 cases |
| P0-2 | Change strategy when the same wrong belief is repeated | P0 | 2 cases + code reading |
| P0-3 | Make sure every lesson success criterion is explained before moving on or ending | P0 | 1 case + code reading |
| P1-1 | Reading classification tasks: give the contrastive test sentence once | P1 | 1 case + exploratory metric (q = 0.68) |
| P1-2 | Require a one-line reason before confirming letter-only answers | P1 | 1 case |
| P1-3 | Replace concessions with scope rules ("hold the line, then say where it is true") | P1 | 1 case against 1 contrasting win |
| P1-4 | Cut tutor-side prompt size (cost) without changing behaviour | P1 | Ledger (3.8× input tokens) |
| P2-1 | Answer side questions briefly and return to the target criterion | P2 | 1 case |
| P2-2 | Instrument improvements (not product): item count and matched design | P2 | Variance analysis |

---

## P0-1 Closing recap and rule-in-own-words check

- **Observed problem.** Sessions often end on a new task or an unanswered learner question; the learner's note keeps a half-formed rule.
- **Supporting evidence.** Last tutor message contains a recap in **6.7% of ENARA blocks vs 31.3% of plain-tutor blocks** (text-pattern metric). Casebook cases 3 (WR-05), 5 (GR-01) and 9 (WR-05, learner asked a direct question in the last turn and the answer was deferred). In ENARA transcripts only 14 of 150 blocks (9.3%) ask for the rule in the learner's words.
- **Root cause (partly confirmed).** In `supportStage`, the "summarise" step fires only after a correct answer that followed a failed attempt on an item; the rule check only fires if the previous tutor message asked for it. No closing step was found in the code read.
- **Proposed behaviour change.** When (a) the learner signals they are finishing, or (b) every success criterion has been shown independently once, or (c) a turn threshold for the session is reached: answer any open learner question in one or two sentences, then give a two-line recap of the rule *in the learner's own earlier words where possible*, and ask them to restate it. The restated rule is checked like any other answer. No new answer is revealed before the learner's last attempt.
- **Expected educational benefit.** Learner notes (the memory in the simulation) contain the correct rule; delayed retention improves where the session ended mid-confusion.
- **Regression risk.** Longer last turn; a recap could leak the answer to the next unseen item. Mitigation: recap states the rule, never a completed item; existing pre-attempt guards still apply.
- **How to test.** Unit test on `supportStage`-level behaviour (recap fires on the three triggers, never before a first attempt); matched replay in Experiment 4 on all outcomes; leakage scan on every recap.
- **Success metric.** Recap in last turn ≥ 60% of sessions that end by learner or threshold; rule-in-own-words rate ≥ 50%; delayed retention non-inferior or better (margin −0.03); zero new assessment-leakage events.

## P0-2 Change strategy when the same wrong belief is repeated

- **Observed problem.** The learner repeats the same belief ("at for days", "false because it does not say") while ENARA repeats the same hint shape, for three or more turns.
- **Evidence.** Casebook case 2 (GR-07: "Look at the word…" in turns 2, 3 and 4, then the rule in turn 5) and case 6 (RD-02: three "try again" turns). The plain tutor changed approach after the first failure (3-box layout, number trick) in case 2. Frequency across all blocks is **not measured**; a counter should be added before Experiment 4.
- **Root cause (partly confirmed).** `teach_rule` is triggered per lesson item after a failed attempt. When the learner's belief persists across a change of item, the counter restarts.
- **Proposed change.** Track the learner's *belief* (the diagnosis code already exists) across items. When the same diagnosis recurs twice, switch from question-hints to a one-sentence scope rule plus one contrast example, then ask the learner to apply it to a new item. Never reveal the current item's answer.
- **Expected benefit.** Fewer wasted turns on stubborn misconceptions (misconception recovery is 12–15% for both tutors).
- **Regression risk.** Giving the rule too early weakens productive struggle; mitigated by requiring two recurrences, so first attempts stay hint-first.
- **How to test.** Replay GR-07, RD-02, FN-01, WR-04 (development set) and hold-out outcomes; unit tests for the trigger. Check the "holds the line" cases (WR-04) do not regress.
- **Success metric.** Share of sessions with ≥ 3 consecutive same-shape hints falls below 10% (counter to be added); misconception recovery at least 10 points higher than current ENARA on blocks with a pre-test misconception, in the matched Experiment 4 comparison.

## P0-3 Cover every lesson success criterion

- **Observed problem.** A criterion can be left unexplained when the learner is stuck on another (GR-07: "in + month" is not explained until the last turn).
- **Evidence.** One case (GR-07); post-test 0 vs plain tutor 0.75 on that pair. The engine already lists criteria not shown yet, so the mechanism exists but does not force coverage.
- **Root cause (hypothesis).** Criterion tracking guides the *next item*, not an explanation plan.
- **Proposed change.** After each tutor turn, compute remaining success criteria; if the learner's last attempt resolved criterion k, introduce the next uncovered criterion with a short explanation + contrast before the next item.
- **Expected benefit.** Fewer post-test items on untaught content.
- **Regression risk.** More explanation before attempts. Mitigation: explanation comes after an attempt on the previous criterion, never before the learner's first try on a new item.
- **How to test.** Matched replay on outcomes with 3-way structure (in/on/at, a/an/the, much/many); check per-criterion post-test accuracy.
- **Success metric.** Criterion coverage ≥ 90% of sessions (counter); post-test accuracy on previously uncovered criteria up.

## P1-1 Reading classification: give the contrastive test sentence once

- **Observed.** Reading is ENARA's weakest domain: transfer A 0.27 vs C 0.55 (A − C = −0.21 [−0.35, −0.07], raw p 0.008, **q = 0.68, so a hypothesis**); case 6 (RD-02).
- **Root cause (hypothesis).** Skill-aware reading hints deliberately avoid pointing to the answer sentence and do not name the classification criterion.
- **Change.** For true/false/not-given-type tasks, state the criterion once as a test sentence ("if the text says nothing, it is not given") before the first try; keep try-first for the application.
- **Risk.** Moving toward explanation-first. Limit to reading classification tasks.
- **Test.** Matched replay on RD-02, RD-03, RD-05, RD-06 plus hold-out reading outcomes.
- **Success.** Reading transfer at least equal to plain tutor (non-inferiority margin 0.05).

## P1-2 Reason before confirmation of letter-only answers

- **Observed.** RD-04: "B" and "C" confirmed as right without asking why; the follow-up task asked for production in a multiple-choice outcome.
- **Evidence.** Case 8 (one case; the effect on the score is **not established**).
- **Change.** For single-letter or one-word answers, confirm only after a one-line reason; keep follow-ups in the assessed format.
- **Risk.** Friction for beginners (existing level-load limits must hold).
- **Test.** Unit test for the signal; replay RD-04/RD-07.
- **Success.** Reading post-test not lower; zero increase in turns-to-criterion.

## P1-3 Scope rules instead of concessions

- **Observed.** ENARA conceded once ("With friends, 'Give me' is usually okay") while the plain tutor conceded at length in WR-04 and ENARA held firm.
- **Evidence.** Cases 1 and 4. Protect the WR-04 behaviour (a regression test must fail if ENARA starts to agree with the wrong belief).
- **Change.** When a learner defends a form by context, say once where the form *is* appropriate and where it is not, then give a default form ("when unsure, use…").
- **Risk.** Sounding rigid. Mitigation: one sentence acknowledging the context.
- **Test.** FN-01, WR-04, GR-07 replays; adversarial belief prompts as a regression set.
- **Success.** On learners who defend the error, post-test at least equal to plain tutor; concession phrases (counter) below 5% of turns.

## P1-4 Reduce tutor-side prompt cost without changing teaching

- **Observed.** ENARA uses 3.8× the plain tutor's input tokens (3.62M vs 0.96M for 948 calls each), 2.5× tutor-side cost, 2.35× total cost per block.
- **Root cause (confirmed).** Prompt size (ledger).
- **Change.** Measure which prompt sections change the model's behaviour (ablation on cost, not on pedagogy), keep the sections that do, trim or cache the rest. Anthropic prompt caching is already used for materials; check hit rates.
- **Expected benefit.** Lower cost per mastered outcome ($1.04 now vs $0.48 for the plain tutor).
- **Risk.** Silent behaviour drift. Mitigation: all guard and parity tests must pass; behaviour comparison on a fixed replay set.
- **Test.** Non-inferiority in matched replay (margin −0.03 on gain); token count per turn.
- **Success.** Input tokens per tutor call down at least 40% with gain non-inferior.

## P2-1 Brief side-question handling

- **Observed.** WR-05: turns spent on the optional comma-before-"and" style and on verb parallelism while the core rule was not consolidated.
- **Evidence.** One case.
- **Change.** Answer side questions in one or two sentences unless they concern an uncovered success criterion, then return to the target.
- **Risk.** Seeming to dismiss learner curiosity.
- **Test / success.** Replay WR-05, WR-07; share of turns off-criterion down without lower learner engagement (not measurable in this simulation).

## P2-2 Instrument improvements (for the study, not the product)

- **Observed.** Per-block standard deviation about 0.5 (4 items per stage); A and C blocks differ in outcome, so block-level noise dominates (student variance component ≈ 0).
- **Change.** Use the matched-block design in `ENARA_EXPERIMENT_4_PROTOCOL.md` (same simulated learner state and outcome under every tutor). Re-estimate variance in a pilot.
- **Success.** Standard deviation of a matched A-vs-B difference well below 0.5; fix the sample size from it.

---

## What not to do (evidence-based)

- Do not make ENARA more verbose: ENARA already writes fewer words per turn (90 vs 106) and that is not where the gap is.
- Do not add features: the ENARA-with-six-features-removed condition (E) is **not** analysed here; no evidence in this analysis says more features help.
- Do not remove try-first: ENARA's wins (GR-01, WR-04) come from eliciting reasoning and holding the line.
