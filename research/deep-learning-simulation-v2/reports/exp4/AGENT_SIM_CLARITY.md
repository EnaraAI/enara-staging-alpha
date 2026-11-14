# Agent-run clarity study (23-method plan, ruleFirst, shortRecap, socraticOff): INCOMPLETE, stopped at the user's request

*14 Nov 2026. **No API calls. AI agents play student and tutor. This report is incomplete by decision: the run was stopped after arm A and one arm-B session. There are no blind transcript ratings and no post-test scores, so none of the planned clarity or post-test comparisons exists.** Nothing here is evidence about real learners. Protocol, written before any new session ran: `config/agent_sim_clarity/PROTOCOL.md`, `RATER_INSTRUCTIONS.md`, frozen post-test items `POSTTEST_ITEMS.json` (sha256 in `POSTTEST_ITEMS.sha256`). Sessions: `agent_sim_clarity/`.*

## 1. What was finished
| Part | Status |
|---|---|
| **Part 0**: 23-method plan analysis | Done: `docs/ENARA_METHODS_AND_CLARITY.md` (selection logic, rendering, delivery, arbitration, per-method table). |
| **Part 1**: `ruleFirst`, `shortRecap`, `socraticOff` (default off, not in `all`; `socraticOff` ignored in production) | Done, 12 tests in `backend/test/engineV2Clarity.test.ts`. Related suites: 478 pass, the same 5 known failures as the base commit (p14_2 ×2, p14_8, p19, p20). Documented in `docs/ENARA_ENGINE_V2.md`. |
| **Part 2**: study set-up (protocol, rater instructions, frozen post-test items, session helper with plan block, arbitration, method logging) | Done and committed before any new session ran. |
| **Part 2**: sessions | **Arm A (plan + arbitration): 8 of 8 students (0 to 7). Arm B (+ ruleFirst, shortRecap): 1 session (student 0); students 1 to 3 stopped part-way, files kept as `PARTIAL_*`. Arm C (+ socraticOff): not run.** Reused from earlier studies for students 0 to 7: A0 (fixed version, `s*_D`) and P (plain tutor, `s*_C`). |
| **Part 2**: post-test and blind rating | **Not run.** |

*Deviations from the brief, all from instructions given during the run:* run size cut from 18 students to 8 ("stop at 7", read as students 0 to 7) and concurrency capped at 3 agents; then stopped.

## 2. What can honestly be said (deterministic transcript counts, 8 students, no raters)
| Count over 6 tutor turns × 8 students | A0 fixed, engine only | A plan + arbitration | P plain |
|---|---|---|---|
| Mean words per tutor turn | 50 | 52 | 44 |
| Last turn recaps or asks for the rule/example | 6 of 8 | 3 of 8 | 2 of 8 |
| Turns that write out a full accepted answer sentence (3+ words) of a practice item | 3 | 2 | **12** |
| Turns ending in a question (mean per session) | 1.4 | 1.0 | 2.4 |
| Reply-guard removals | 0 | 1 | 0 |

Methods the plan chose for the 8 arm-A students, from the fixed record mapping (logged on every turn in the session files): error_analysis 5, mastery_learning 2, socratic_questioning 1. With only three methods and five of eight on one, **a breakdown by method is not possible**, and "which methods are weakest on clarity" cannot be answered from this run.

Observations from reading the sessions (not statistics):
- The plain tutor writes out accepted answers far more often (12 turns against 2 or 3), which is the answer-protection difference seen in every earlier study.
- Adding the plan did not make arm A recap more often than A0 (3 of 8 vs 6 of 8). The plan's method text and the `closing` switch compete for the last turn.
- In the single arm-B session (student 0) `ruleFirst` fired once, on turn 6, for the a/an rule. The earlier a/the rule was already stated by the method itself. On turn 5 the `shortRecap` ask "Now write one new example of your own" was appended to a reply that also set a new exercise, so the learner got two different tasks. **This is a defect in how the closing ask is appended** (it should not be added to a reply that already sets a task); not fixed yet.
- The A − A0 contrast mixes the plan with the status/readiness it encodes, because the record mapping gives the tutor the learner's status (disclosed in the protocol).

## 3. Decision paragraph (Part 3), answered from what exists
- **What do the 23 methods add on their own (A − A0)?** Not measured: there are no ratings or post-tests. The only visible differences are in the counts above (similar length, fewer recaps, slightly fewer written-out answers); none of them is a clarity or learning measure.
- **Did B beat P on clarity without losing reasoning or answer protection?** Not measured: one arm-B session exists and nothing was rated.
- **Did the post-test differ between tutors?** Not measured: no post-test was run.
- **What does C − B say about the Socratic habit?** Nothing: arm C was never run. `socraticOff` is implemented and tested but untested on behaviour.
- **Which methods should be fixed first?** Not answerable from data. From the code analysis alone: the methods that never state the idea (Socratic, inquiry, problem, case, project, retrieval, interleaving, concept mapping, metacognitive) are the likely clarity risks, and the one Socratic session here was a reading task for a proficient learner. The appended-closing-ask defect above should be fixed before any further run.
- **Which switches are worth a paid preregistered run?** Without outcome data I can't rank them. What the earlier agent studies support: `wrongAnswer`, `closing` (with the once-only fix), `selfCheck`, `clarity`, `hints` improved recap and hint progression without losing reasoning or answer protection. `ruleFirst`, `shortRecap`, `arbitration` and the full plan have no usable evidence yet, so they should not be in a paid run until at least a rated agent study exists; `socraticOff` is research-only and should never be.

## 4. To finish
Remaining agent work for the planned design at 8 students: arm B sessions for students 1 to 7 (7), arm C sessions (8), post-tests for 40 session transcripts (about 14 agents of 3 sessions each), and blind ratings (about 6 rater agents). Cost is the usage limit only; no API.

## 5. Limits
Same as `AGENT_SIM_FIXES.md`: the student and tutor roles are played by one model inside one agent context; the tutor sees the language-engine instructions plus (arms A to C) the plan block, not the production base prompt; engine history is reconstructed from the dialogue; 6 messages per session; A0 and P are reused sessions that predate the protocol. In addition: 8 students; one session per student and arm; the status record given to the plan-tutor is a fixed mapping, not real school records; the missing ratings and post-tests mean no conclusion about clarity or learning.
