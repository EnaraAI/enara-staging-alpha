# SIMULATION ONLY

# PLN2f: final 48-learner check of planner2c: result

20 Nov 2026. Branch `claude/tutor-kids-pack`. Protocol amendments H, I and J.

Setup:
- planner2c with fix B (one model sentence in the task pre-task), `kidsPack` off.
- 48 rule-based learners, OFF (today's tutor) vs ON.
- 7 rounds, then an immediate test and a 7-day delayed test.
- Tutors were Sonnet; judges and scorers were Opus. No real learners.

Full tables: `agent_sim_pln2f/ANALYSIS.md`.

## Verdict: **PASSED**, in one clean run (replaces the combined verdict)

| Rule | Result | |
|---|---|---|
| No harm, 7-day delayed test | ON 0.880 vs OFF 0.870, **+0.010 [−0.016, +0.042]**; lowest group −0.021 | Pass |
| Fit: ON ≥ OFF in every group | Adults 0.94 vs 0.69; teens 1.67 vs 0.89; under-9 0.31 vs 0.31; 9–12 1.12 vs 1.10; quick check 12/12 | Pass |
| Guard: stuck learners (ON ≤ OFF) | ON 1 vs OFF 2 | Pass |
| Guard: independent correct, as a rate (amendment H) | ON 176/231 (0.76) vs OFF 175/232 (0.75) | Pass |
| Guard: early answer leaks (amendment I.3) | 2 vs 2 | Pass |
| Judge agreement ≥ 85% | Events 96.8%; fit 85.3% | Pass |
| Grader recheck | Gap-fill and choice 100%; free answers 94% | Reported |

## By group (7-day delayed test)

| Group | OFF | ON | Diff [95% CI] |
|---|---|---|---|
| Adults B1+, task-based | 0.792 | 0.854 | **+0.062** [0.000, +0.167] |
| Teens, test-teach-test | 0.938 | 0.938 | 0.000 |
| Under 9 (present-practise-produce + child supports) | 0.812 | 0.812 | 0.000 [−0.062, +0.062] |
| 9–12 (present-practise-produce + child supports) | 0.938 | 0.917 | −0.021 [−0.062, 0.000] |

- **Use (own sentences, delayed):** +0.017 overall. Adults +0.028, under-9 +0.083.
- **Immediate test:** −0.010 overall. 9–12 −0.083 (2 learners), back to −0.021 by the delayed test.

## What it shows

1. **Fix B helped adults.** In PLN2c, adults scored −0.021 and had 0 vs 2 independent correct answers. Now they score +0.062, and no adult was stuck. In 4 of 12 lessons, the language focus starts in round 3.
2. **Teens get the clean quick check.** All 12 got one item with no teaching in it. 8 went on to test-teach-test, 4 to present-practise-produce.
3. **Children: no gain and no harm.** Under-9s are equal. 9–12s are −0.021 (1 learner).

## Watch points (not pass rules)

- **The "teacher would accept" score is lower ON** for adults (1.00 vs 1.58) and under-9s (0.83 vs 1.17). 9–12s have shorter sentences OFF (1.75 vs 1.25). Worth a look in the first lms-test transcripts.
- **One stuck ON learner** (under-9, learner 2035): the child leaves the gap empty. Empty answers don't count as tries, so the answer is never released. Possible fix: count an empty answer as a failed try for children. No run needed to decide.
- **Item repeats, in both arms:** in 5 sessions, the tutor's instruction named an item the learner had already answered. This is in the engine's item choice, not the planner.
- The under-9 fit rubric is the listen-and-do one. With the kids pack off, both arms score low on it (0.31).

## Run notes

- 672 tutor replies; 0 rejected judge events; 0 replies with two questions; 0 test answers the grader couldn't score.
- One harness fix before fit prep: a code comment hid two lines. I fixed it before that step ran, so no data was affected.
- Agent runs: 73 (42 Sonnet tutors; 31 Opus: 14 judges, 1 agreement, 8 fit, 1 fit agreement, 7 recheck).
