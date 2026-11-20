SIMULATION ONLY. PLN2 analysis (descriptive; n = 12 per group, one replication).

Data complete: True
Verdict (pre-registered pass rules): **NOT PASSED**

### Delayed test, primary items (no-harm measure)

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.812 | 0.688 | -0.125 | [-0.271, 0.000] | 0 / 9 / 3 |
| ALL | 12 | 0.812 | 0.688 | -0.125 | [-0.271, 0.000] | 0 / 9 / 3 |

Guards (amendment D): stuck runs OFF 0 / P2 0 -> ok; independent correct answers (fix A: first try, new item, answer not shown) OFF 36 / P2 12 of 55 / 29 first tries -> FAIL (old measure OFF 0 / P2 0); early answer leaks OFF 0 / P2 2 -> FAIL

### Immediate test, primary items

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.875 | 0.750 | -0.125 | [-0.312, 0.000] | 0 / 10 / 2 |
| ALL | 12 | 0.875 | 0.750 | -0.125 | [-0.312, 0.000] | 0 / 10 / 2 |

### Use (amendment C): own-sentence items 7-9 on the delayed test, share of 6 points

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.625 | 0.556 | -0.069 | [-0.167, 0.000] | 0 / 10 / 2 |
| ALL | 12 | 0.625 | 0.556 | -0.069 | [-0.167, 0.000] | 0 / 10 / 2 |

Use check (reported, not part of the verdict): P2 - OFF >= -0.05 for TASK and LAD: {'LAD': {'diff': -0.0694, 'ok': False}}

### Delayed test, whole form

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.674 | 0.576 | -0.097 | [-0.222, 0.000] | 0 / 9 / 3 |
| ALL | 12 | 0.674 | 0.576 | -0.097 | [-0.222, 0.000] | 0 / 9 / 3 |

### Pre-test, primary items (balance check)

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.604 | 0.604 | 0.000 | [0.000, 0.000] | 0 / 12 / 0 |
| ALL | 12 | 0.604 | 0.604 | 0.000 | [0.000, 0.000] | 0 / 12 / 0 |

No-harm rule: overall CI lower bound -0.271 > -0.05 and no group mean below -0.05 -> FAIL

### Turn tags

| Group | Arm | turns | two asks | early-leak turns | answers after 2 fails | stuck runs | mean words |
|---|---|---|---|---|---|---|---|
| LAD | OFF | 84 | 0 | 0 | 0 | 0 | 30.905 |
| LAD | P2 | 84 | 0 | 2 | 0 | 0 | 21.250 |
| ALL | OFF | 84 | 0 | 0 | 0 | 0 | 30.905 |
| ALL | P2 | 84 | 0 | 2 | 0 | 0 | 21.250 |

### Fit scores (mean 0-2) by rubric item

| Group | Item | OFF | P2 | P2 - OFF |
|---|---|---|---|---|
| LAD | story_chant | 0.000 | 1.917 | 1.917 |
| LAD | listen_do_steps | 0.000 | 2.000 | 2.000 |
| LAD | child_tone | 0.667 | 1.667 | 1.000 |
| LAD | age_fit | 1.167 | 1.833 | 0.667 |
| LAD | teacher_accept | 1.083 | 1.083 | 0.000 |
| LAD | **own rubric mean** | 0.222 | 1.861 | 1.639 [1.556, 1.722] |

Quick-check compliance (P2 TTT): 0 of 0 sessions = - (violations: []); quick-check turns 0, with an answer 0, with teaching words (descriptive) 0; OFF TTT test_first_clean mean -.
Fit rule: P2 own-rubric mean >= OFF on every group and compliance >= 0.95 -> pass

### Planner in P2: shape/stage per turn (expected: TASK->TASK, TTT->TTT or PPP after the check, LAD->LAD, KIDPPP->PPP)

| Group | shape match | shape/stage counts | method rule:primary |
|---|---|---|---|
| LAD | 84/84 | LAD/chant 12, LAD/check 23, LAD/do 28, LAD/done 9, LAD/listen 12 | FALLBACK:scaffolding 42, M10_BY_MASTERY:formative_feedback 42 |

| Group | turn | shape:rule:stage counts |
|---|---|---|
| LAD | 1 | LAD:S2a:listen 4, LAD:S2b:listen 8 |
| LAD | 2 | LAD:S2a:do 4, LAD:S2b:do 8 |
| LAD | 3 | LAD:S2a:do 4, LAD:S2b:do 8 |
| LAD | 4 | LAD:S2a:chant 4, LAD:S2b:chant 8 |
| LAD | 5 | LAD:S2a:check 4, LAD:S2b:check 8 |
| LAD | 6 | LAD:S2a:check 2, LAD:S2a:done 2, LAD:S2b:check 8 |
| LAD | 7 | LAD:S2a:check 1, LAD:S2a:done 3, LAD:S2b:do 4, LAD:S2b:done 4 |

OFF primary method per group (turns): {'LAD': {'worked_example': 84}}
TTT quick-check split (P2): 0 sessions; resolved 0 (0 with >= 2 of 3 -> TTT, 0 with < 2 -> PPP); still pending at turn 5: 0; predicted from the start state: 0 of 12 with >= 2.
Arabic transfer: P2 turns with the in-session l1_transfer misconception 0, with the P1 contrast rule 0; diagnoses {}.

### Judges

Event-judge agreement: 0.947 (missing 0); fit-judge agreement (exact item scores): 0.853 (within 1: 1) -> pass
Grader recheck (reported): {'primaryAgreement': 1, 'exactAgreement': 1, 'freeExactAgreement': 0.9, 'sampled': 68, 'pass': True}

