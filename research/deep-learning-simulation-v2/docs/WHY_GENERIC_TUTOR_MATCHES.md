# Why the generic AI tutor matched ENARA in full-experiment-2 (transcript analysis)

Simulation only. Computed from the recorded raw blocks of `runs/full-experiment-2` (150 blocks each for A and E, 148 for C). Descriptive, not a controlled test.

| | ENARA (A) | Generic AI tutor (C) | ENARA ablation (E) |
|---|---|---|---|
| Tutor words per turn | 94 | 112 | 89 |
| Turns containing a question | 67% | 81% | 62% |
| Turns that state or recall a rule | 47% | 65% | 51% |
| Learner's note contains a rule | 60% | 73% | 62% |

**Reading.** The simulated learner keeps only a self-written note, so what it learns depends on what the tutor stated in the transcript. The generic tutor states the rule outright more often, in longer replies. ENARA's design deliberately makes the learner try first and uses a hint ladder (it withholds answers and example forms until after an attempt), which in a short 6-turn session leaves less explicit rule text in the transcript. That is a plausible reason the generic tutor is at least as good on this short-session, note-only measure. It is a hypothesis, not a proven cause. It also says nothing about whether the "try first" style helps real learners over longer periods, which this simulation cannot measure.

**Open question for the product team.** Whether ENARA should state the rule earlier (after one failed attempt it already does, via the teach-the-rule step) or whether the evaluation should include a longer practice phase where withholding pays off.
