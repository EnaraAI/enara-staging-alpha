# Simulator validation (independent of tutor quality)

Simulation only. These checks test the simulator's internal sanity, not its realism against real learners.

| Check | Result | Detail |
|---|---|---|
| no unrealistic learning jumps without teaching (F post-pre >= +50 pts) | PASS | 1/24 control blocks jumped (4%); mean F change -8.3 pts |
| sensitivity to difficulty (pre-test accuracy falls as difficulty rises; all blocks) | **FAIL** | r = 0.03 over 48 blocks |
| sensitivity to prior knowledge (knows-already blocks score higher at pre-test) | PASS | already-know pre 38.9% (n=9) vs not 26.9% (n=39) |
| no identical/copied behaviour across students (identical answer+confidence vector over all items on the same outcome) | PASS | 0/8 student pairs identical (threshold 5%) |
| attention-lapse flag lowers accuracy | PASS | lapse items 18.2% (n=22) vs attentive 31.2% |
| forgetting: day-1 retention >= day-30 retention in taught blocks | PASS | d1 54.2% vs d30 35.4% |
| no assessment leakage into tutor/notes/materials | PASS | 0 leakage events |
| adversarial (misconception-heavy) profiles learn less than typical students | PASS | adversarial gain -8.3 pts (n=6) vs typical 19.4 pts (n=18) |
