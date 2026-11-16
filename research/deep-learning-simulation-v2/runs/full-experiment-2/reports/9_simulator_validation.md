# Simulator validation (independent of tutor quality)

Simulation only. These checks test the simulator's internal sanity, not its realism against real learners.

| Check | Result | Detail |
|---|---|---|
| no unrealistic learning jumps without teaching (F post-pre >= +50 pts) | **FAIL** | 24/150 control blocks jumped (16%); mean F change 0.7 pts |
| sensitivity to difficulty (control accuracy falls as difficulty rises) | PASS | r = -0.01 over 150 control blocks |
| sensitivity to prior knowledge (knows-already blocks score higher at pre-test) | PASS | already-know pre 58.3% (n=212) vs not 18.7% (n=686) |
| no identical/copied behaviour across students (identical pre-test answer vectors on the same outcome) | PASS | 1658/7971 student pairs identical on pre-test (short key answers can coincide legitimately; flagged only above 50%) |
| attention-lapse flag lowers accuracy | PASS | lapse items 23.4% (n=427) vs attentive 36.5% |
| forgetting: day-1 retention >= day-30 retention in taught blocks | PASS | d1 37.8% vs d30 32.9% |
| no assessment leakage into tutor/notes/materials | **FAIL** | 2 leakage events |
| adversarial (misconception-heavy) profiles learn less than typical students | PASS | adversarial gain 2.0 pts (n=75) vs typical 10.6 pts (n=673) |
