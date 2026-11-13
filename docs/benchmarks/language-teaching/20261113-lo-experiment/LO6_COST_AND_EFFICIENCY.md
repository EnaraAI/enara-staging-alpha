# LO6 — Cost and Efficiency

Actual provider costs, from the harness meter (tutor calls match the app's own call log), the simulated-learner calls and the assessment calls.

| Item | Cost |
|---|---|
| ENARA tutor calls (3 campaigns, 2,880 replies) | $71.47 |
| Simulated learner messages | $0.32 |
| Assessment stage (notes and quiz answers) | $2.26 |
| **Three campaigns** | **$74.04** |
| Simulator validity check (no tutor) | $0.52 |
| **Counted in these results** | **$74.56** |

Not counted in the results (aborted or invalid earlier attempts, kept in `invalid_v1/` or discarded): about $11, including a first simulator check that failed its validity test and campaigns stopped on purpose.

## Efficiency
- **Per simulated learner (A, tutor + learner + assessment):** about $0.21.
- **Per independently mastered outcome (ENARA tutor cost / mastered outcomes):** about $0.59 (121 mastered).
- **Average time to demonstrated mastery:** the lesson is a fixed 8 learner turns (about 2.2 of them hint turns); mastery is measured after the lesson, not turn by turn.
- Budget: all spending stayed inside the approved budget and caps; no metering was bypassed.
