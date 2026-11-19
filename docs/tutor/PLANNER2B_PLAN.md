# Plan: planner2b (evidence-based stages) and the PLN2b check

19 Nov 2026. Tutor track, `claude/tutor-planner2`. No runs until "go". Switch stays off for real learners.

**Core rule:** a lesson moves to the next stage only on graded evidence; an error sends it back to teaching that gap. Never on turn count.

## Changes (code + unit tests, 0 agent runs)

1. **TASK (adults).** After the task, an error from the task → "language focus" on that error. Then repeat the task **once**. If errors remain after the repeat → back to focus, then close (no second repeat). Today: "repeat" once any right answer came after the task (rounds 5–7: 11 repeat vs 1 focus).
2. **Check stage (PPP and LAD).** One check item only. Right → the lesson is done (next objective or wrap-up). Wrong → back to "practise" (PPP) or "do" (LAD) on **that** gap, then one new check. Today: the lesson stays in "check" (8 of 12 children 9–12 at the end).
3. **Listen-and-do only with content.** LAD is chosen only when the kids pack is on and a lesson for the objective exists. Otherwise under-9s get PPP with child supports (S2b → PPP). This removes the cause of the PLN2 harm (−0.104 for under-9s).
4. **Rule statements fade only on evidence.** The rule is restated after any error. It fades only after the form is right **twice in a row in this session**. Today two mechanisms fade it early:
   - `ruleFirst` states each rule once per session;
   - `fadeKnown` counts 2 independent right answers from the record, not in a row.
   ESL6 round 2 showed the cost: LE made 45 rule statements vs 196 for the baseline, and fell behind.
5. **Guards in every check (pre-registered, P2 ≤ OFF or ≥ OFF as marked):**
   - stuck runs (3+ turns on one item, never right): P2 ≤ OFF;
   - independent correct answers in the session: P2 ≥ OFF;
   - answers given away too early: P2 ≤ OFF.

Also fixed before the re-run: the teens' fit item for the one-step check (the PLN2 rubric still said "first three exercises"); tighter wording for the two items where fit judges split (task goal, teach-the-gaps).

## PLN2b check

- Same 48 learners, same seeds, same 2 arms (OFF = ESL5 setting, ON = planner2b), 7 rounds, immediate and 7-day delayed tests, the use measure.
- Same pass rules as PLN2, plus the 3 guards above.
- Children under 9 will run PPP + child supports in ON: the kids pack is not on this branch. The kids pack LAD gets its own test after this one.
- Dry run first (0 agent runs).

## Agent runs (estimate)

| Step | Model | Runs |
|---|---|---|
| Tutors (6 per round × 7) | Sonnet | 42 |
| Event judges (2 per round × 7) | Opus | 14 |
| Event-judge agreement | Opus | 1 |
| Fit judges + fit agreement | Opus | 9 |
| Grader recheck (1 scorer) | Opus | ≤ 7 |
| **Total** | | **about 73** (about 2 hours) |
