# ESL stage-2 study: protocol (rule-based learner simulator). Written and committed before any session. 15 Nov 2026.

**SIMULATION ONLY. The learners are a rule-based model of learning (`LEARNING_RULES.md`), not real learners. Every result depends on those rules.** No API is called; agents act as tutors and as blind learning judges, at most 3 at a time.

## Why
In stage 1 the student agents decided for themselves when to stop making their error, so the post-test did not depend on the teaching. Here a learner's knowledge changes **only** through fixed rules taken from the research framework, applied to what the tutor actually wrote.

## Part 1: simulator (`src/offline/learnerSim.ts`, `LEARNING_RULES.md`, `JUDGE_INSTRUCTIONS.md`)
- Hidden knowledge state per learner: two wrong beliefs and two correct beliefs (strength 0 to 3), seeded Arabic-L1 primary error, count of independent correct productions.
- After every tutor turn, a **judge agent** reads only that turn (with the learner's last message, the task set before it, and a FACT line on whether the learner's last production was correct), plus the current state. It names the rules triggered (R1 to R7, with a quote) and the task the turn sets. Text that could reveal the tutoring system (hidden markers, the system's name) is removed first; cases from all arms are mixed and shuffled in each judge batch, with opaque ids.
- A script applies the rule numbers (events inconsistent with the production fact are rejected and logged), then draws the learner's next message from the state with a fixed seed (probability of an error 0.8 / 0.4 / 0.05 for wrong-belief strength ≥2 / 1 / 0). No agent writes the learner's answers.
- The post-test is drawn by script from the final state with a fixed seed: the stage-1 frozen items (4 controlled, 2 free production with two sentences each), each tagged with the wrong beliefs it can reveal. Also reported: expected accuracy (no dice) and the number of wrong beliefs at strength 0.

## Part 2: validation (must pass before Part 3)
- **Learners:** 12 learners (6 A1, 6 A2; 4 per form; primary error W1 or W2 alternating).
- **Tutors:** four fixed scripted tutors, 4 turns each, on all 12 learners:
  - (a) chat, nothing useful;
  - (b) gives the answers only;
  - (c) states the rule clearly once;
  - (d) states the rule, gives a contrast pair on the learner's own (primary) error, asks for 2 independent productions (plus a third), with feedback.
- **Pass rule (fixed now):** expected post-test accuracy must satisfy d > c > max(a, b) and |a − b| ≤ 0.05. If it fails: **stop and report; no Part 3.**
- **Judge agreement:** a second judge re-judges a seeded 20% sample of judged turns on identical input. Agreement = the same resulting knowledge state. Required: ≥ 85%. Below that the rules or instructions are revised and validation is rerun.
- **Noise level:** tutors (c) and (d) are run twice on the same learners (second run: different production and post-test seeds, separate judge runs). The post-test difference is reported.

## Part 3: comparison (only after validation passes)
- **Learners:** 36 learners: 12 A1, 12 A2, 12 B2 proficient; articles, copula be and third-person -s spread evenly.
- **Sessions:** 2 sessions per learner, 10 tutor turns each. The knowledge state carries over between sessions, and so does the engine's memory when `memory` is on.
- **Replication:** 2 replications with different seeds.
- **Arms:**
  - P: plain tutor;
  - A0: `wrongAnswer,closing,selfCheck,clarity,hints,strandLog`;
  - A0+LE: A0 + `levelExplicit`;
  - A0+LE+M: A0+LE + `memory`.
  Tutor agents never mix arms. Judges are blind and mixed across arms.
- **Fixes in place before `levelExplicit` runs** (commit `39c1801`, with tests): the rule line also fires on the first explanation turn; level-2 hints use a new contrast pair; the two-asks detector does not count "Tell me the rule in your own words" as a task.
- **Primary outcomes:** post-test accuracy after session 2 (controlled and free items, and combined); number of wrong beliefs at strength 0.
- **Secondary outcomes:** five blind ratings; guards (answer protection rating, leaked answers, two asks).
- **Contrasts** (Holm over the four): (A0+LE) − P; (A0+LE+M) − P; (A0+LE) − A0; (A0+LE+M) − (A0+LE). Each is reported for all learners and for explicit-first learners (A1 + A2), with paired bootstrap intervals over learners (replications pooled within a learner) and exact sign-flip tests.
- A result whose interval includes zero is not called a win.
- If resource limits make the full Part 3 impossible, any reduction is written as an addendum here **before** Part 3 starts.

## Addendum 1 (15 Nov 2026, after validation passed, before Part 3 started)
**Validation results** (`reports/exp4/agent_sim_esl2_validation/`):
- **Order check: passed.** Expected post-test accuracy: d 0.897 > c 0.579 > a 0.198 = b 0.198. The sampled scores have the same order.
- **Judge agreement: 0.88** on 50 re-judged turns (threshold 0.85). The disagreements were about R3/R4 credited to both correct beliefs, and about a contrast phrase inside the rule.
- **Noise:** repeated tutor (c) differed by −0.03 (expected) / −0.02 (sampled); repeated tutor (d) by −0.02 / −0.06.

**Part 3 reduced by owner decision** (asked before Part 3; the full design needs about 560 agent runs). The reduced design:
- 36 learners, all 4 arms;
- **1 replication** (not 2);
- 2 sessions × **5** tutor turns (not 10), the second session one simulated day later.

The contrasts, outcomes and analysis are unchanged; the "pool the replications" step is moot with one replication.

**Design details fixed now:**
1. **Plan in every ENARA arm.** A0, A0+LE and A0+LE+M all receive the 23-method teaching plan from the fixed record (as when adaptive pedagogy is on). So (A0+LE) − A0 isolates `levelExplicit` (with the `arbitration` it forces on). P receives the plain prompt.
2. **Memory carried as production records it.** The cross-session profile is carried in every ENARA arm the way production records it: the error-code profile always; mistaken ideas, what-worked and the opening review only with `memory`. The pure functions `applyTurn`, `summarizeProfile`, `applyTurnV2` and `summarizeProfileV2` are used. The error code comes from the engine's diagnosis; independent success is a key-correct first answer with no hint.
   - **Known before running:** the engine has no error codes for articles or copula, and mistaken ideas are only recorded from the hidden assessment marker (`belief`), which tutors do not write here and which the specified arms do not switch on. So `memory` can carry little in this study.
3. **Session 2.** It starts a new chat (engine history resets), and the learner opens it.
4. **Agents.** Tutor agents handle 18 sessions of one arm per call. Judge agents handle 36 cases mixed across arms, with opaque ids.
5. **Ratings.** **One** blind rater pass (not two), 6 cases per agent, four tutors per case.
