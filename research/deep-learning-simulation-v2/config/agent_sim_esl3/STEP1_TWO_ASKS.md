# SIMULATION ONLY

# ESL stage 3, step 1: two-asks cause groups

Source: every ESL2 turn flagged by the old two-asks detector (117 turns; 48 in A0+LE, 0 in P). Each turn was grouped by what made the old detector fire, then checked with the new one-task reader (`learnerAsks`).

| Cause | A0 | A0+LE | A0+LE+M | Total |
|---|---|---|---|---|
| F1 detector: feedback label "Correct:" read as a task | 7 | 17 | 7 | 31 |
| F2 detector: rule line / recap in the imperative read as a task | 12 | 12 | 11 | 35 |
| F3 detector: the closing ask + its own format note (one task in two sentences) | 9 | 16 | 15 | 40 |
| R1 real: closing ask + a new exercise item | 0 | 0 | 4 | 4 |
| R2 real: closing ask + a separate question | 0 | 1 | 3 | 4 |
| R3 real: closing ask + a hint instruction | 0 | 2 | 1 | 3 |
| **Total** | 28 | 48 | 41 | 117 |

Only 3 of the 48 A0+LE turns set two real tasks. The other 45 were detector errors: a "Correct:" feedback label, a rule line written as an imperative, or the closing ask followed by its own format note.

The causes the brief suggested were checked. "Rule line plus exercise plus question" and "hint level 2 new pair plus retry" do not appear as two-task replies in ESL2. Where the rule line was involved, it was the rule line itself being misread as a task (F2).

After the fix, every one of the 117 replayed turns sets at most one task (test `backend/test/oneTaskRule.test.ts`).
