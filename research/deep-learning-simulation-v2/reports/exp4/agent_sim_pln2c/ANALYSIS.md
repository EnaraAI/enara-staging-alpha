SIMULATION ONLY. PLN2 analysis (descriptive; n = 12 per group, one replication).

Data complete: True
Verdict (pre-registered pass rules): **NOT PASSED**

### Delayed test, primary items (no-harm measure)

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| TASK | 12 | 0.792 | 0.771 | -0.021 | [-0.146, 0.104] | 1 / 9 / 2 |
| ALL | 12 | 0.792 | 0.771 | -0.021 | [-0.146, 0.104] | 1 / 9 / 2 |

Guards (amendment D): stuck runs OFF 0 / P2 0 -> ok; independent correct answers (fix A: first try, new item, answer not shown) OFF 39 / P2 41 of 50 / 49 first tries -> ok (old measure OFF 2 / P2 0); early answer leaks OFF 1 / P2 0 -> ok

### Immediate test, primary items

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| TASK | 12 | 0.917 | 0.896 | -0.021 | [-0.062, 0.000] | 0 / 11 / 1 |
| ALL | 12 | 0.917 | 0.896 | -0.021 | [-0.062, 0.000] | 0 / 11 / 1 |

### Use (amendment C): own-sentence items 7-9 on the delayed test, share of 6 points

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| TASK | 12 | 0.778 | 0.833 | 0.056 | [-0.056, 0.194] | 2 / 9 / 1 |
| ALL | 12 | 0.778 | 0.833 | 0.056 | [-0.056, 0.194] | 2 / 9 / 1 |

Use check (reported, not part of the verdict): P2 - OFF >= -0.05 for TASK and LAD: {'TASK': {'diff': 0.0556, 'ok': True}}

### Delayed test, whole form

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| TASK | 12 | 0.785 | 0.799 | 0.014 | [-0.090, 0.125] | 2 / 8 / 2 |
| ALL | 12 | 0.785 | 0.799 | 0.014 | [-0.090, 0.125] | 2 / 8 / 2 |

### Pre-test, primary items (balance check)

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| TASK | 12 | 0.271 | 0.271 | 0.000 | [0.000, 0.000] | 0 / 12 / 0 |
| ALL | 12 | 0.271 | 0.271 | 0.000 | [0.000, 0.000] | 0 / 12 / 0 |

No-harm rule: overall CI lower bound -0.146 > -0.05 and no group mean below -0.05 -> FAIL

### Turn tags

| Group | Arm | turns | two asks | early-leak turns | answers after 2 fails | stuck runs | mean words |
|---|---|---|---|---|---|---|---|
| TASK | OFF | 84 | 0 | 1 | 0 | 0 | 60.833 |
| TASK | P2 | 84 | 0 | 0 | 0 | 0 | 64.238 |
| ALL | OFF | 84 | 0 | 1 | 0 | 0 | 60.833 |
| ALL | P2 | 84 | 0 | 0 | 0 | 0 | 64.238 |

### Fit scores (mean 0-2) by rubric item

| Group | Item | OFF | P2 | P2 - OFF |
|---|---|---|---|---|
| TASK | task_goal | 0.417 | 1.000 | 0.583 |
| TASK | feedback_after_task | 0.417 | 0.417 | 0.000 |
| TASK | task_repeat | 0.333 | 0.333 | 0.000 |
| TASK | age_fit | 2.000 | 2.000 | 0.000 |
| TASK | teacher_accept | 1.583 | 1.667 | 0.083 |
| TASK | **own rubric mean** | 0.389 | 0.583 | 0.194 [0.028, 0.389] |

Quick-check compliance (P2 TTT): 0 of 0 sessions = - (violations: []); quick-check turns 0, with an answer 0, with teaching words (descriptive) 0; OFF TTT test_first_clean mean -.
Fit rule: P2 own-rubric mean >= OFF on every group and compliance >= 0.95 -> pass

### Planner in P2: shape/stage per turn (expected: TASK->TASK, TTT->TTT or PPP after the check, LAD->LAD, KIDPPP->PPP)

| Group | shape match | shape/stage counts | method rule:primary |
|---|---|---|---|
| TASK | 84/84 | TASK/done 31, TASK/focus 24, TASK/pretask 12, TASK/task 17 | FALLBACK:formative_feedback 84 |

| Group | turn | shape:rule:stage counts |
|---|---|---|
| TASK | 1 | TASK:S3:pretask 12 |
| TASK | 2 | TASK:S3:task 12 |
| TASK | 3 | TASK:S3:focus 7, TASK:S3:task 5 |
| TASK | 4 | TASK:S3:focus 12 |
| TASK | 5 | TASK:S3:done 9, TASK:S3:focus 3 |
| TASK | 6 | TASK:S3:done 11, TASK:S3:focus 1 |
| TASK | 7 | TASK:S3:done 11, TASK:S3:focus 1 |

OFF primary method per group (turns): {'TASK': {'worked_example': 84}}
TTT quick-check split (P2): 0 sessions; resolved 0 (0 with >= 2 of 3 -> TTT, 0 with < 2 -> PPP); still pending at turn 5: 0; predicted from the start state: 0 of 12 with >= 2.
Arabic transfer: P2 turns with the in-session l1_transfer misconception 0, with the P1 contrast rule 0; diagnoses {}.

### Judges

Event-judge agreement: 0.929 (missing 0); fit-judge agreement (exact item scores): 0.853 (within 1: 1) -> pass
Grader recheck (reported): {'primaryAgreement': 1, 'exactAgreement': 1, 'freeExactAgreement': 0.9231, 'sampled': 67, 'pass': True}

