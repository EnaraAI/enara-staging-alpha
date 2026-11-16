# Experiment 4 regression check (scripted learners; real ENARA route; 5 scenarios x 5 turns per condition)

Cost $1.15. B must not exceed A on any count.

| Metric (count of tutor replies) | A (current) | B (improved) | B not worse? |
|---|---|---|---|
| leak | 8 | 16 | **FAIL** |
| arabic | 0 | 0 | PASS |
| concession | 0 | 0 | PASS |
| offtopic | 0 | 0 | PASS |

Recap / "in your own words" asked near the end: A 0/5, B 5/5.

Checks are regex counts on 25 replies per condition: a smoke test of guard behaviour, not a statistical test. Raw replies are in rows.json.
