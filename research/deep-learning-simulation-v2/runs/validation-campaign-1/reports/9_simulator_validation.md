# Simulator validation (independent of tutor quality)

Simulation only. These checks test the simulator's internal sanity, not its realism against real learners.

| Check | Result | Detail |
|---|---|---|
| no unrealistic learning jumps without teaching (F post-pre >= +50 pts) | PASS | 4/48 control blocks jumped (8%); mean F change -7.3 pts |
| sensitivity to difficulty (control accuracy falls as difficulty rises) | **FAIL** | r = 0.16 over 48 control blocks |
| sensitivity to prior knowledge (knows-already blocks score higher at pre-test) | **FAIL** | already-know pre 24.2% (n=60) vs not 25.4% (n=224) |
| no identical/copied behaviour across students (identical pre-test answer vectors on the same outcome) | PASS | 210/701 student pairs identical on pre-test (short key answers can coincide legitimately; flagged only above 50%) |
| attention-lapse flag lowers accuracy | PASS | lapse items 8.6% (n=151) vs attentive 29.3% |
| forgetting: day-1 retention >= day-30 retention in taught blocks | PASS | d1 29.7% vs d30 24.2% |
| no assessment leakage into tutor/notes/materials | **FAIL** | 4 leakage events |
| adversarial (misconception-heavy) profiles learn less than typical students | PASS | adversarial gain 3.4 pts (n=59) vs typical 4.0 pts (n=177) |
