# Agent-run clarity study: protocol (written before any new session ran; 14 Nov 2026)

**Goal.** Test whether the 23-method teaching plan, `ruleFirst`, `shortRecap` and the removal of the "no rule before the first try" instructions change explanation clarity, reasoning, answer protection and post-test accuracy, against the fixed ENARA version (A0) and the plain tutor (P). Simulation only.

## Arms (18 matched students, same cards and outcomes as `AGENT_SIM_18.md`)
| Arm | Setting | Sessions |
|---|---|---|
| **A0** | fixed version, language-engine instructions only: `all,closing,selfCheck,clarity,hints` | **reused** from `AGENT_SIM_FIXES.md` (session files `s*_D`) |
| **A** | A0 + the full 23-method teaching plan (selected by `selectTeachingPlan` from a fixed record mapping, below) + `arbitration` | new (`s*_E`) |
| **B** | A + `ruleFirst,shortRecap` | new (`s*_F`) |
| **C** | B + `socraticOff` (research only) | new (`s*_G`) |
| **P** | plain tutor | **reused** from `AGENT_SIM_18.md` (session files `s*_C`) |

*Deviation from "all arms run fresh":* A0 and P sessions already existed with the same student cards. Re-running them would cost 36 more sessions. They are reused; their post-tests and ratings are produced fresh in this study, blind, in the same pools as the new arms. Their sessions predate this protocol; the post-test items (benchmark post-stage items, written and validated long before) and the rating rubric (unchanged since earlier studies) did not change.
*A0 uses `all` (wrongAnswer, belief, memory, cache) as in `AGENT_SIM_FIXES.md`; A, B, C add to that same base.*

## Evidence record for the plan (fixed mapping; the production route reads these from real records)
Status `proficient` if the student's hidden state says they already know the point, else `emerging`; a held misconception is recorded as confirmed with a category by skill area (grammar → procedural_error, vocabulary → conceptual_misunderstanding, reading / functional / listening → misinterpretation, writing → incomplete_reasoning); grade by CEFR cohort (A1 → 4, A2 → 9, else 18); subject from the area. The misconception text is **not** shown to the tutor. The record is fixed for the session (no assessments happen inside a 6-message session), so the plan is chosen once per session; the method (primary, supporting, reinforcement, reason codes) is logged on every tutor turn in the session file. **Consequence:** A − A0 measures the plan *and* the status/readiness it encodes; it cannot separate the two.

## Independence rules
- The student role and the tutor role are played by the same agent inside one session context (as in all earlier agent studies). Post-test answering and rating are run by **separate agents** that did not play any session.
- Raters see transcripts only, with tutor names hidden and the five tutors in a per-case random order (`RATER_INSTRUCTIONS.md`).
- Post-test: after the session, a separate agent answers the 4 post-stage items of that outcome as that student, using only the learner card and that session's conversation as memory, with seeded per-item behaviour directives (lapse, guess, slip; identical across arms for a student). Three sessions per post-test agent, always from different outcomes. Items: `POSTTEST_ITEMS.json` (benchmark post items; never in any tutor prompt; frozen with a SHA-256 before the new sessions). Scored deterministically with `benchmark/scoring.ts`.

## Outcomes and analysis (fixed in advance)
- Transcript rating (two independent passes, five tutors per case): overall, clarity, reasoning, answer protection, hint progression, recap.
- Post-test accuracy (share of 4 items correct). No pre-test, so this is a level, not a gain.
- Paired differences over the 18 students, bootstrap 95% CI over students: **A − A0, B − P, B − A, C − B**. Holm correction over these four contrasts, separately for clarity and for post-test accuracy.
- Breakdown by teaching method (primary method of the session) for clarity and post-test accuracy; weakest methods on clarity listed. Only methods with at least 2 sessions are shown.
- Reported honestly: a result whose interval includes zero is not called a win.
