# Simulator validation (independent of tutor quality)

Simulation only. These checks test the simulator's internal sanity, not its realism against real learners.

| Check | Result | Detail |
|---|---|---|
| no unrealistic learning jumps without teaching (F post-pre >= +50 pts) | **FAIL** | 5/48 control blocks jumped (10%); mean F change -7.3 pts |
| sensitivity to difficulty (control accuracy falls as difficulty rises) | PASS | r = -0.08 over 48 control blocks |
| sensitivity to prior knowledge (knows-already blocks score higher at pre-test) | PASS | already-know pre 55.3% (n=75) vs not 17.1% (n=211) |
| no identical/copied behaviour across students (identical pre-test answer vectors on the same outcome) | PASS | 156/711 student pairs identical on pre-test (short key answers can coincide legitimately; flagged only above 50%) |
| attention-lapse flag lowers accuracy | PASS | lapse items 23.5% (n=153) vs attentive 36.1% |
| forgetting: day-1 retention >= day-30 retention in taught blocks | PASS | d1 38.7% vs d30 34.0% |
| no assessment leakage into tutor/notes/materials | **FAIL** | 2 leakage events |
| adversarial (misconception-heavy) profiles learn less than typical students | PASS | adversarial gain 10.2 pts (n=59) vs typical 12.0 pts (n=179) |
