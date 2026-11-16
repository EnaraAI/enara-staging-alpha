# SIMULATION ONLY

# ESL5 judge validation (rules: config/agent_sim_esl5/LEARNING_RULES.md)

Agreement = both judges' events give the same knowledge state (ESL4 agreescore method), scored by `src/offline/esl5_valscore.py`.

## Round 1 — not counted
98.3% overall (410/417). Judge agents shared helper-script files in one scratch folder, so independence was compromised. See `round1/ROUND1_NOTE.md`.

## Round 2 — counted (private scratch folder per judge, cases judged by reading)
| Group | Cases | Same | Agreement |
|---|---|---|---|
| ESL4 rechecks (165) | 165 | 157 | 95.2% |
| New cases (60: 30 P+-style, 30 ENARA-esl5-style) | 60 | 58 | 96.7% |
| **Required set: rechecks + new** | **225** | **215** | **95.6%** |
| Session 2 (rechecks r7 + new s2) | 118 | 111 | **94.1%** |
| Scripted order cases | 192 | 192 | 100% |
| All cases | 417 | 407 | 97.6% |

Order check (expected post-test accuracy): a 0.198, b 0.198, c 0.643, d 0.916 for both judges: d > c > b ≈ a. **Pass.**

Targets (≥85% overall and ≥85% in session 2; order check) all pass. ESL5 may start.

Note: one judge-A event in v5A_j12 (case v3e1f1c769e) was written as a list `[rule, belief, quote]` instead of an object; it was converted mechanically to the object form with the same content before scoring.
