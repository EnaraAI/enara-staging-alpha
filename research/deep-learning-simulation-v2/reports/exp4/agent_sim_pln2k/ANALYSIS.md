SIMULATION ONLY. PLN2 analysis (descriptive; n = 12 per group, one replication).

Data complete: True
Verdict (pre-registered pass rules): **NOT PASSED**

### Delayed test, primary items (no-harm measure)

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.812 | 0.854 | 0.042 | [0.000, 0.125] | 1 / 11 / 0 |
| ALL | 12 | 0.812 | 0.854 | 0.042 | [0.000, 0.125] | 1 / 11 / 0 |

Guards (amendment D): stuck runs OFF 0 / P2 0 -> ok; independent correct answers (fix A: first try, new item, answer not shown) OFF 33 / P2 35 of 55 / 55 first tries -> ok (old measure OFF 0 / P2 0); early answer leaks OFF 4 / P2 6 -> FAIL

### Immediate test, primary items

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.875 | 0.875 | 0.000 | [0.000, 0.000] | 0 / 12 / 0 |
| ALL | 12 | 0.875 | 0.875 | 0.000 | [0.000, 0.000] | 0 / 12 / 0 |

### Use (amendment C): own-sentence items 7-9 on the delayed test, share of 6 points

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.625 | 0.653 | 0.028 | [0.000, 0.083] | 1 / 11 / 0 |
| ALL | 12 | 0.625 | 0.653 | 0.028 | [0.000, 0.083] | 1 / 11 / 0 |

Use check (reported, not part of the verdict): P2 - OFF >= -0.05 for TASK and LAD: {'LAD': {'diff': 0.0278, 'ok': True}}

### Delayed test, whole form

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.674 | 0.708 | 0.035 | [0.000, 0.104] | 1 / 11 / 0 |
| ALL | 12 | 0.674 | 0.708 | 0.035 | [0.000, 0.104] | 1 / 11 / 0 |

### Pre-test, primary items (balance check)

| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |
|---|---|---|---|---|---|---|
| LAD | 12 | 0.604 | 0.604 | 0.000 | [0.000, 0.000] | 0 / 12 / 0 |
| ALL | 12 | 0.604 | 0.604 | 0.000 | [0.000, 0.000] | 0 / 12 / 0 |

No-harm rule: overall CI lower bound 0.000 > -0.05 and no group mean below -0.05 -> pass

### Turn tags

| Group | Arm | turns | two asks | early-leak turns | answers after 2 fails | stuck runs | mean words |
|---|---|---|---|---|---|---|---|
| LAD | OFF | 84 | 0 | 4 | 0 | 0 | 28.583 |
| LAD | P2 | 84 | 0 | 6 | 1 | 0 | 26.929 |
| ALL | OFF | 84 | 0 | 4 | 0 | 0 | 28.583 |
| ALL | P2 | 84 | 0 | 6 | 1 | 0 | 26.929 |

### Fit scores (mean 0-2) by rubric item

| Group | Item | OFF | P2 | P2 - OFF |
|---|---|---|---|---|
| LAD | story_chant | 0.000 | 0.000 | 0.000 |
| LAD | listen_do_steps | 0.333 | 0.583 | 0.250 |
| LAD | child_tone | 0.667 | 1.000 | 0.333 |
| LAD | age_fit | 1.583 | 1.583 | 0.000 |
| LAD | teacher_accept | 1.167 | 1.333 | 0.167 |
| LAD | **own rubric mean** | 0.333 | 0.528 | 0.194 [0.056, 0.333] |

Quick-check compliance (P2 TTT): 0 of 0 sessions = - (violations: []); quick-check turns 0, with an answer 0, with teaching words (descriptive) 0; OFF TTT test_first_clean mean -.
Fit rule: P2 own-rubric mean >= OFF on every group and compliance >= 0.95 -> pass

### Planner in P2: shape/stage per turn (expected: TASK->TASK, TTT->TTT or PPP after the check, LAD->LAD, KIDPPP->PPP)

| Group | shape match | shape/stage counts | method rule:primary |
|---|---|---|---|
| LAD | 84/84 | LAD/chant 7, LAD/check 15, LAD/do 34, LAD/done 16, LAD/listen 12 | FALLBACK:scaffolding 42, M10_BY_MASTERY:formative_feedback 42 |

| Group | turn | shape:rule:stage counts |
|---|---|---|
| LAD | 1 | LAD:S2a:listen 4, LAD:S2b:listen 8 |
| LAD | 2 | LAD:S2a:do 4, LAD:S2b:do 8 |
| LAD | 3 | LAD:S2a:chant 2, LAD:S2a:do 2, LAD:S2b:chant 4, LAD:S2b:do 4 |
| LAD | 4 | LAD:S2a:check 2, LAD:S2a:do 2, LAD:S2b:chant 1, LAD:S2b:check 4, LAD:S2b:do 3 |
| LAD | 5 | LAD:S2a:check 1, LAD:S2a:do 1, LAD:S2a:done 2, LAD:S2b:check 3, LAD:S2b:do 3, LAD:S2b:done 2 |
| LAD | 6 | LAD:S2a:check 1, LAD:S2a:do 1, LAD:S2a:done 2, LAD:S2b:check 2, LAD:S2b:do 3, LAD:S2b:done 3 |
| LAD | 7 | LAD:S2a:do 1, LAD:S2a:done 3, LAD:S2b:check 2, LAD:S2b:do 2, LAD:S2b:done 4 |

OFF primary method per group (turns): {'LAD': {'worked_example': 84}}
TTT quick-check split (P2): 0 sessions; resolved 0 (0 with >= 2 of 3 -> TTT, 0 with < 2 -> PPP); still pending at turn 5: 0; predicted from the start state: 0 of 12 with >= 2.
Arabic transfer: P2 turns with the in-session l1_transfer misconception 0, with the P1 contrast rule 0; diagnoses {}.

### Judges

Event-judge agreement: 0.895 (missing 0); fit-judge agreement (exact item scores): 0.853 (within 1: 1) -> pass
Grader recheck (reported): {'primaryAgreement': 1, 'exactAgreement': 1, 'freeExactAgreement': 0.95, 'sampled': 68, 'pass': True}

