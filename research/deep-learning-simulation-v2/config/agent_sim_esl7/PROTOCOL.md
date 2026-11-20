# SIMULATION ONLY

# ESL7-journey: pre-registration

Written 20 Nov 2026, before any tutor reply. Branch `claude/tutor-esl7`. Owner's design: "ESL7-journey", in the message that gave the go for `docs/tutor/LIT_REVIEW_GAP_PLAN.md`.

**What this is:**
- No real learners. Every learner is a rule-based knowledge state per outcome, using the ESL6 learning rules (`config/agent_sim_esl6/LEARNING_RULES.md`, R1–R7, F1 forgetting), with six new rows for the new skill outcomes (`NEW_LEARNING_RULES.md`).
- Tutors are agents (Sonnet). Judges, scorers and fit judges are agents (Opus).
- These are simulated results, not evidence about real learners.

## 1. Question
Over a 4-week learning journey, does the new engine (all the LIT_REVIEW_GAP_PLAN switches on) give better 4-week delayed, unassisted test scores than (a) today's engine before these changes and (b) P+, the strong plain-prompt tutor? Per outcome, skill and age band, A1–A2.

## 2. Arms
| Arm | What the tutor gets |
|---|---|
| **BASE** (today's engine, before these changes) | `ENARA_ENGINE_V2 = wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5,planner2,workOn,sessionMemory,learnerProfile,whatWorks` (lms-test on 20 Nov, before PR #44). The engine prompt and reply guards, plus a learner brief built by the deployed memory functions (see §5). |
| **NEW** | BASE + `workOnTrusted,oneTaskMethod,spacedReview,ruleOnWrong,switchMove,spellingPattern,l1Lexical,childShort`. |
| **PP** (P+) | The ESL6 P+ prompt (`config/agent_sim_esl6/PROTOCOL.md` §2), unchanged: lesson data plus this session's conversation. A new chat each session: no memory across sessions. |

Tests are scored the same way for all arms (§6).

## 3. Outcomes and skills
- **39 outcomes:**
  - the 33 form outcomes with item banks (grammar 20, vocabulary 12, functions 1), `data/assessments/outcomes/EN-F-*`;
  - 6 course-level outcomes from ENARA's own definitions (`data/outcomes/outcomes.json`): `EN-C-A1-RD-very-short-texts`, `EN-C-A2-RD-short-everyday-texts`, `EN-C-A1-WR-simple-sentences`, `EN-C-A2-WR-linked-short-text`, `EN-C-A1-FN-basic-interaction`, `EN-C-A2-FN-routine-exchanges`.
  - The 6 new ones have new item forms A–C and lessons, built for this study (`NEW_ITEMS_README.md`). Their scoring is validated before use (§6).
- **Skills reported:** grammar, vocabulary, functions, reading, writing.
- **Not measured** (no text measure): listening and speaking (`EN-C-*-LS-*`, `EN-C-*-SP-*`). Also not measured: the lesson-level outcomes that have no item forms.
- **CEFR can-do:** each outcome's `reference` field (CEFR Companion Volume / EVP) is reported next to its results.

## 4. Learners and journeys
- **78 learners.** Each learner works on **2 outcomes** of their own CEFR level, so each outcome is taught to exactly 4 learners per arm.
  - 19 A1 outcomes → 38 A1 learners; 20 A2 outcomes → 40 A2 learners.
  - Pairing: outcomes shuffled with seed `esl7`, then paired, never two of the same outcome.
- **Age bands, assigned in rotation:** under 9 (ages 6, 7, 8), 9–12, teens, adults, so about 20 per band. Children get a staff birth date so `childShort` can apply.
- **Start state:** per outcome, as the ESL6 explicit-first learners (same initial-state generator, seed `esl7`). Each learner is the same in all three arms.
- **Journey (days):**
  - S1 day 0, outcome 1;
  - S2 day 2, outcome 2;
  - S3 day 7, outcome 1;
  - S4 day 14, outcome 2.
  - Each session has 5 tutor turns.
  - F1 forgetting is applied between days, for both outcomes, from the last contact.

## 5. Memory between sessions (BASE and NEW)
The harness has no database, so it runs the deployed pure functions on records it keeps itself:
- **Errors to work on:**
  - The pre-test counts as a released assessment: every wrong item becomes an error on its outcome, with the item's wrong-belief code. Under `workOnTrusted`, only choice and gap items count (error correction does not).
  - Later unassisted outcomes (a right answer with no hint, or a wrong answer) are applied with `applyOutcome`.
  - Each session's brief comes from `briefLines`, and the due rows from `reviewDue` (NEW) or all open rows (BASE). So the brief can bring back the **other** outcome too.
- **Last session line:** `lastSessionLine` with the session's right/wrong counts and next step.
- **PP has none of this.**
- **One limit:** the harness models one outcome per session, so learner answers and judge events cover that session's outcome only. The brief therefore lists only the current outcome's errors (in live use it would also list the other outcome's). The two outcomes still share the journey's calendar, forgetting and memory files.
- **Implementation:**
  - Each journey is stored as two tracks: `s{learner}_{arm}_o1` and `_o2`, each with 2 sessions.
  - o1 sessions fall on days 0 and 7; o2 sessions on days 2 and 14.
  - Rounds 1–5 = o1 session 1, 6–10 = o2 session 1, 11–15 = o1 session 2, 16–20 = o2 session 2.
  - Memory: `memory/m{learner}_{arm}.json`.

## 6. Tests and scoring (unassisted; the learner answers from their knowledge state, as ESL6 `answerItem`)
- **Forms and times:**
  - pre = form A (day 0, both outcomes);
  - immediate = form B (right after the outcome's first session);
  - 1-week = form C (7 days after the outcome's first session, before any later session that day);
  - 4-week = form A again (day 28).
  - Reusing A is harmless here: simulated learners do not remember items.
- **Scoring:** ENARA's own grading system.
  - Exact and choice items: `matchKeyV2` (graderV2 on, the validated path).
  - `target_form_0_1_2` and writing (`rubric_0_3`): an Opus stand-in for the model path, with the same rubric text.
- **Validation before use:**
  - an agent blind to keys writes 60 answers for the new outcomes (20 reading, 20 function, 20 writing);
  - 3 independent Opus scorers score them;
  - the graders must reach ≥ 95% exact agreement on exact items and QWK ≥ 0.80 on function and writing items.
  - If a grader fails, the item or rubric is fixed and re-validated on fresh answers before any tutor reply.
- **Outcome score:** share of points on the form.
- **Mastery per outcome:**
  - the outcome's own criterion, met on the 4-week test: form outcomes ≥ 80% of points; reading 4 of 5; writing level 2+ on both criteria; functions 4 of 5 at full points;
  - **and** unassisted, which every test is.

## 7. Other measures (per outcome, skill, age band, arm)
- **Stuck runs:** 3+ turns on one item, never right.
- **Early answer leaks:** an item answer given before 2 genuine tries (the ESL6 definition).
- **Two-task replies:** the ESL6 `twoAsks` check on final replies.
- **"Teacher would accept"** (0–2): an Opus fit judge reads each journey's 4 sessions, blind to arm.
- **CEFR level estimate:** ENARA's placement engine (`backend/src/services/assessment/placementEngine.ts`, `simulate`), run at pre and at 4 weeks.
  - Items of the learner's 2 outcomes are answered from their knowledge state.
  - All other items get a fixed answer per learner (seeded, the same at both times and in all arms).
  - Movement = the 4-week level minus the pre level.

## 8. Analysis (descriptive per outcome; one pre-registered comparison)
- **Primary:** the 4-week delayed score per learner (the mean of their 2 outcomes), **NEW − BASE**.
  - Exact paired sign-flip test (or 100,000 random flips), two-sided, and a 95% bootstrap interval.
  - **NEW is better if p < 0.05 and the interval is above 0.**
- **Secondary (descriptive):** NEW − PP and BASE − PP on the same measure, and every measure in §6–7 by outcome, skill and age band.
- **Per outcome:** n = 4 learners per arm. Means only, with no tests.

## 9. Guards
1. Judge agreement ≥ 85% on a 10% re-judged sample.
2. Grader validation (§6) passed before round 1.
3. `promptcheck` before every round: no test item text in any tutor prompt.
4. No real learner data.

## 10. Runs
- **Batching:**
  - tutor cells of ≤ 24 sessions, Sonnet;
  - judge batches of ≤ 72 cases, Opus;
  - fit batches of ≤ 12, Opus;
  - at most 3 agents at a time.
- **Resume:** after a usage-limit stop, `status` shows what is missing; nothing is redone.
- **Estimate:**
  - 20 rounds × (about 10 tutor cells + 4 judge batches);
  - about 20 fit batches, about 15 scoring batches and 6 validation runs;
  - **about 330 agent runs.**
- **Engine:** the code on this branch, which contains PRs #44–#47.

## Amendment A (20 Nov 2026, before any tutor reply)
1. **72 learners, not 78.** The 3 bank outcomes with no wrong belief (`possessive-adjectives`, `common-adjectives`, `make-do`) cannot be simulated, as in ESL6. So there are 30 + 6 = 36 outcomes, each taught to 4 learners per arm: 34 A1 and 38 A2 learners.
2. **`workOnTrusted` in the NEW arm** treats gap items as trusted, as if `graderV2` were on, because the tests are scored with graderV2. Otherwise only choice items would count.
3. **The memory code** also adds the deployed "back after 7+ days" review line (`learnerProfile`) where the gap is 7+ days. This applies to BASE and NEW alike.
4. **Session-2 judge cases** state the real gap (7 or 12 days).
5. **No frozen-file hash table:** the engine is the code on this branch at the commit that starts round 1.
6. **Writing mastery** = task ≥ 2 and language ≥ 2 (the two criteria in the new items).
7. **Grader validation** passed before round 1: `validation/VALIDATION.md`.
8. **Estimate:**
   - 20 rounds × (9 tutor cells + 3 judge batches);
   - plus about 18 fit batches, scoring batches and 1 agreement batch;
   - **about 270 agent runs.**

## Amendment B (20 Nov 2026, after round 2, before round 3)
**Engine bug fix during the run.**
- `spellingPattern` flagged the real word "lives" as a spelling slip of the lesson word "liked" (NEW, s7066, round 2). The tutor did not act on it.
- The fix: a real word in any form is never a slip. It is the same commit as on PR #48 (`2cfe24f4`) and applies from round 3.
- Rounds 1–2 ran with the bug, in NEW only.

**Other notes from rounds 1–2:**
- One BASE tutor agent (BASE_1, round 2) said it skimmed the repeated instruction lines and did not open with the errors-to-work-on brief. The replies were kept, and later tutor tasks were told to read every line.
- One BASE prompt said "partly right" for a correct polite request (s7040, s7046). The tutor marked it CORRECT.
- **Second fix, from round 3 (same commit as PR #48, `73458935`):** `ruleOnWrong` stands down when the first-time rule block is in the same reply. In round 2, six NEW sessions got both (one says "same item again", the other "a new item"); the tutors followed the first-time block.

## Run notes (round 5)
- NEW_2 and NEW_3, round 5: the first tutor agent filtered out repeated instruction lines, including the "Support level" line, and guessed the level. Those 48 replies were discarded before judging (kept as `answers/PARTIAL_NEW_2_r5.json` and `PARTIAL_NEW_3_r5.json`). The session and memory files were restored, and the two cells were redone by a fresh agent that read every line.
- BASE_2, round 5, s7022: the tutor quoted the learner's misspelled word, which the engine instruction forbids. It was kept as a tutor slip.

## Amendment C (20 Nov 2026, after round 6, before round 7)
- **Engine bug fix during the run.** `spellingPattern` flagged "object" in a learner's opening request ("word order (subject + verb + object)") as a slip of the lesson word "subject" (NEW, s7013, round 6). The small dictionary lacks "object".
- The fix: words the lesson itself uses (title, objectives, success criteria, grammar, functions, skills, examples) are never slips. It is the same commit as on the fix PR (`501dcf8b` on `claude/tutor-lms-slipfix`) and applies from round 7.
- A check over all NEW learner messages up to round 6 found this as the only false flag; the other 12 flags were real slips.
- Round 6: two NEW_1 replies (s7018, s7024) labelled a correct sentence with a different meaning "Wrong answer". They were kept as tutor slips.
