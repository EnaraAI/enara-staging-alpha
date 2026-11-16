# SIMULATION ONLY

## Validation round 1: not counted (judge independence compromised)

- Scores: 98.3% overall (410/417); order check passed for both judges with values identical to the reference rulings.
- Problem: judge agents wrote helper scripts into the same shared scratch folder; judge B reported that another judge's process was writing to the same helper file (w.py) while it worked. Judges A (batches 9-12) and B (batches 9-12) ran at the same time.
- Because the two judges may have shared code, their agreement is not evidence of independent agreement. Round 1 is kept as a record but does not count toward the validation targets.
- Fix for round 2: each judge agent gets its own private scratch folder, may not read any other scratch folder or the other judge's outputs, and must judge every case from the text and the rules (no shared scripts).
