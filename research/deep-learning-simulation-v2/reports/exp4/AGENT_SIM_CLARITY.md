# Agent-run clarity study: the 23-method plan, ruleFirst, shortRecap, socraticOff (8 students, no API)

*14 Nov 2026. **AI agents play student and tutor; separate AI agents answer the post-test and rate transcripts. Nothing here is evidence about real learners. With 8 students per arm, every result below is weak: where an interval or a corrected p-value does not clear zero it is said so.** Protocol, written before any new session ran: `config/agent_sim_clarity/PROTOCOL.md`, `RATER_INSTRUCTIONS.md`, frozen post-test items `POSTTEST_ITEMS.json` (+ `.sha256`). Data: `agent_sim_clarity/` (sessions, post-test batches and answers, rating batches and key). Analysis: `reports/analysis/clarity_analysis.py` → `agent_sim_clarity_results/CLARITY_SUMMARY.json`.*

## What was run
| Arm | Setting | Students | Sessions |
|---|---|---|---|
| **A0** | fixed version, language-engine instructions only (`all,closing,selfCheck,clarity,hints`) | 0 to 7 | reused (`s*_D`, from `AGENT_SIM_FIXES.md`) |
| **A** | A0 + the 23-method teaching plan + `arbitration` | 0 to 7 | new (`s*_E`) |
| **B** | A + `ruleFirst` + `shortRecap` | 0 to 7 | new (`s*_F`) |
| **C** | B + `socraticOff` (research only) | 0 to 7 | new (`s*_G`) |
| **P** | plain tutor | 0 to 7 | reused (`s*_C`, from `AGENT_SIM_18.md`) |

**Deviations from the brief** (all from instructions during the run or disclosed in the protocol): 8 students instead of 18 and at most 3 agents per arm at a time; A0 and P sessions reused (their post-test and ratings are fresh and blind); arms B and C ran on code with one fix made after arm A ran (the `shortRecap` closing ask is no longer added to a reply that already sets a task; `closing` in arm A is unchanged); one pre-fix arm-B session is kept as `PREFIX_s0_F.json` and not used; A − A0 mixes the plan with the learner status/readiness it encodes. Separate agents (not the session agents) answered the post-test (15 batches, 3 sessions from different outcomes each, seeded lapse/guess/slip directives identical across arms) and rated transcripts (6 batches, 2 independent passes, five tutors per case in a random order). **Methods chosen by the plan** (logged every turn): error_analysis 5 students, mastery_learning 2, socratic_questioning 1.

## Results (8 students; paired differences; bootstrap 95% CI over students; exact sign-flip p over students; Holm over the 4 contrasts, separately for clarity and post-test)
Means (1 to 5 for ratings; post-test = share of 4 items correct):
| | A0 | A | B | C | P |
|---|---|---|---|---|---|
| Overall | 3.25 | 2.81 | 2.81 | 3.50 | 3.19 |
| **Clarity** | 3.44 | 3.19 | 3.00 | 3.81 | 4.00 |
| Reasoning | 3.25 | 3.75 | 3.56 | 3.62 | 2.62 |
| Answer protection | 3.88 | 3.81 | 3.88 | 3.75 | 2.19 |
| Hint progression | 2.81 | 2.81 | 2.81 | 3.44 | 3.06 |
| Recap | 3.25 | 2.38 | 2.12 | 2.56 | 2.75 |
| **Post-test accuracy** | 0.750 | 0.719 | 0.688 | 0.812 | 0.906 |

Contrasts (difference; 95% CI; raw p; Holm p for clarity and post-test):
| Contrast | Clarity | Post-test | Overall | Reasoning | Answer protection |
|---|---|---|---|---|---|
| **A − A0** (what the 23 methods add) | −0.25 [−0.88, +0.38]; p .59; Holm 1.0 | −0.03 [−0.19, +0.09]; p 1.0; Holm 1.0 | −0.44 [−1.38, +0.44] | +0.50 [−0.44, +1.31] | −0.06 |
| **B − P** | **−1.00 [−2.00, 0.00]**; p .16; Holm .47 | **−0.22 [−0.34, −0.09]**; p .063; Holm .25 | −0.38 [−1.62, +0.81] | **+0.94 [+0.06, +1.75]**; p .11 | **+1.69 [+0.56, +2.69]**; p .063 |
| **B − A** (ruleFirst + shortRecap) | −0.19 [−1.06, +0.62]; p .79; Holm 1.0 | −0.03 [−0.16, +0.16]; p 1.0; Holm 1.0 | 0.00 | −0.19 | +0.06 |
| **C − B** (socraticOff) | **+0.81 [+0.12, +1.44]**; p .094; Holm .38 | +0.12 [0.00, +0.22]; p .22; Holm .66 | **+0.69 [+0.06, +1.25]**; p .13 | +0.06 | −0.12 |

Ranked first (32 ratings): C 5, A0 4, P 4, B 3 (A 0). Ranked last: B 9, P 4, A 3. Rater agreement: same top pick 63%, overall-score correlation between passes 0.80.
By method (arms A, B, C pooled; difference from the same student under the plain tutor): mastery_learning (2 students, 6 sessions) clarity −1.00, post-test −0.21; error_analysis (5 students, 15 sessions) clarity −0.30, post-test −0.18; socratic_questioning (1 student, 3 sessions) clarity −1.83, post-test 0.00. Absolute clarity: error_analysis 3.5, socratic 3.17, mastery_learning 3.0.

## Part 3: decision paragraph
**What the 23 methods add on their own (A − A0):** nothing measurable. All intervals include zero, and the point estimates for overall (−0.44), clarity (−0.25) and recap (−0.88) are negative; only reasoning leans positive (+0.50). Adding the plan and `arbitration` did not make the tutor clearer or the students score higher. **Did B beat P on clarity without losing reasoning or answer protection?** No on clarity: B is behind P by a full point (−1.00, interval touching zero, not significant after Holm), which is a bigger gap than in the earlier studies; B keeps its advantage on reasoning (+0.94) and answer protection (+1.69, the clearest result here). **Did the post-test differ?** The plain tutor's students scored highest (0.91 vs 0.69 to 0.81 for the ENARA arms); B − P is −0.22 [−0.34, −0.09] but is not significant after Holm correction (p .25) and the scores are at ceiling for several students. A caveat that favours P: its tutor wrote out accepted practice answers far more often, so its students saw the answer forms. **What does C − B say about the Socratic habit?** It is the most informative contrast: removing the two "no rule before the first try" instructions raised clarity by +0.81 [+0.12, +1.44] and overall by +0.69 while keeping reasoning (3.62) and answer protection (3.75) far above P (2.62, 2.19); C reached 3.81 clarity against P's 4.00 and a post-test of 0.81 against P's 0.91. This is consistent with the Socratic habit being a main cause of the clarity gap, but with 8 students and Holm p .38 it is suggestive, not shown. **Which methods to fix first:** with only three methods observed, Socratic questioning (clarity −1.83 vs plain, one student) and mastery learning (−1.00, two students) look weakest, because their instructions never state the idea first; error analysis (−0.30) is closest to the plain tutor. **Which switches for a paid preregistered run ($60 to $120):** keep the already-supported set (A0: `wrongAnswer,closing,selfCheck,clarity,hints`) as the baseline. Drop `ruleFirst`, `shortRecap` and the plan + `arbitration` as built: B − A is zero on every measure and B had the lowest recap (2.12) and the most last-place ranks. Do not carry `socraticOff` itself (research only); instead build a production switch that allows the rule to be stated earlier (after the first try, and in general terms at hint level 1) and test that against A0 and P first in a larger agent study (at least 18 students) before spending on a paid run.

## Limits
Same as `AGENT_SIM_FIXES.md`: the student and tutor roles are played by one model inside one agent context; the tutor sees the language-engine instructions plus (arms A to C) the plan block, not the production base prompt; engine history is reconstructed from the dialogue; 6 messages per session; AI raters of the same family (moderate agreement). Specific to this study: 8 students per arm, so intervals are wide and exact permutation p-values cannot go below 0.004 and cluster near 0.06 to 0.2 here; the plan was fed a fixed record mapping (status, category, grade), not real school records; the post-test is a level (no pre-test), answered by a model that read the lesson and may know the rule regardless; only three of the 23 methods were exercised; arm A ran before the `shortRecap` fix.
