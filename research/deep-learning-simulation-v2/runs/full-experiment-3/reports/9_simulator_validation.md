# Simulator validation (independent of tutor quality)

Simulation only. These checks test the simulator's internal sanity, not its realism against real learners.

| Check | Result | Detail |
|---|---|---|
| no unrealistic learning jumps without teaching (F post-pre >= +50 pts) | PASS | 3/150 control blocks jumped (2%); mean F change -3.8 pts |
| sensitivity to difficulty (control accuracy falls as difficulty rises) | PASS | r = -0.20 over 150 control blocks |
| sensitivity to prior knowledge (knows-already blocks score higher at pre-test) | PASS | already-know pre 60.3% (n=214) vs not 18.3% (n=608) |
| no identical/copied behaviour across students (identical pre-test answer vectors on the same outcome) | PASS | 830/6701 student pairs identical on pre-test (short key answers can coincide legitimately; flagged only above 50%) |
| attention-lapse flag lowers accuracy | PASS | lapse items 25.5% (n=740) vs attentive 39.7% |
| forgetting: day-1 retention >= day-30 retention in taught blocks | PASS | d1 43.5% vs d30 32.9% |
| no assessment leakage into tutor/notes/materials | PASS | 0 leakage events |
| adversarial (misconception-heavy) profiles learn less than typical students | PASS | adversarial gain 0.7 pts (n=70) vs typical 12.1 pts (n=604) |
