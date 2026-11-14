# ESL stage-1 agent study: protocol (change A, `levelExplicit`). Written and committed before any session ran. 14 Nov 2026.

**SIMULATION ONLY. AI-simulated learners, AI tutors, AI scorers and AI raters. Nothing here is evidence about real learners.** No API is called; all roles are played by sub-agents.

## Question
Does level-based explicitness (`levelExplicit`) improve learning on a post-test, compared with the current best version (A0) and with the plain tutor (P), without losing answer protection?

## Step 0: lesson readiness (done first; `READINESS_CHECK.md`)
Three research-only lesson fixtures (`src/offline/eslFixtures.ts`): articles (a/an/the), copula be (am/is/are), present simple third-person -s. Each has 2 success criteria and 6 practice items tagged with `criteria`. No production lesson was touched. Dry check (A2 learner, `levelExplicit` on): the rule line appears before the first try when the learner asks for an exercise; it does not appear when the learner only greets (the tutor explains first, no exercise is presented). **Consequence: student agents are told to ask for an exercise in their first message** (how a real learner opens an exercise session). This is the same for every arm.

## Learners (18 synthetic students, `eslFixtures.ts` `STUDENTS`, fixed in advance)
| Band | n | Record for the target objective | Role in the analysis |
|---|---|---|---|
| A1 | 6 | 3 "not assessed", 3 "emerging" | explicit-first (expected gain) |
| A2 | 6 | 3 "not assessed", 3 "emerging" | explicit-first (expected gain) |
| B2 | 6 | "proficient" | "no harm" check: they should get today's behaviour |
Each student works on **one** target form; each band has 2 students per form. Each has a seeded Arabic-L1 error profile (two variants per form, e.g. article omission vs. "the" for everything; copula omission vs. "is" with everything; base verb after he/she/it vs. -s after every subject), given to the student agent **by instruction only** (not real transfer). B2 students "slip" rarely. Numeric traits (learning rate, confidence, lapse, guess) come from `makeStudent(idx, 'enara-agent-sim-esl1')` and the persona text of the earlier studies. The same 18 students are used in every arm (paired).

## Arms (same students in every arm)
| Arm | Setting | Code |
|---|---|---|
| **P** | plain tutor (same plain prompt text as earlier studies, with the lesson text and the practice list, no answers) | no engine |
| **A0** | current best language-engine version: `wrongAnswer,closing,selfCheck,clarity,hints` (+ `strandLog` for logging only, in every ENARA arm). No 23-method plan. | env `wrongAnswer,closing,selfCheck,clarity,hints,strandLog` |
| **A0+arb** (`ARB`) | A0 + the 23-method teaching plan (chosen by `selectTeachingPlan` from the fixed record below) + `arbitration` | A0 env + `arbitration` |
| **A0+LE** (`LE`) | A0 + the same plan machinery + `levelExplicit` (`arbitration` forced on automatically; plan gating below B1 active) | A0 env + `levelExplicit` |
`A0+arb` isolates the effect of `levelExplicit` itself from the effect of `arbitration` (and of the plan text, which `arbitration` needs to act on). **Deviations from earlier studies, stated up front:** (1) A0 here is exactly `wrongAnswer,closing,selfCheck,clarity,hints`, not `all,...` (so no `belief`, `memory`, `cache`; the last two have no effect offline, `belief` needs the hidden marker the agents do not write); (2) the school's record (`not_assessed` / `emerging` / `proficient`) is passed to the engine as the objective status in **every ENARA arm** (as the production route does when adaptive pedagogy is on), so the engine's own level logic (`fade_support`, `independent_practice` for proficient learners) acts in A0 too; (3) the fixed record mapping for the plan: status as in the table, a confirmed procedural-error misconception for A1/A2 students (none for B2), grade 4 / 9 / 18 for A1 / A2 / B2, subject "Grammar", `belowB1` for A1/A2 (used only when `levelExplicit` is on).

## Sessions
6 tutor turns each (the same as earlier studies); 72 sessions (18 students x 4 arms). The student writes first. **Roles run in separate agent contexts**: a student turn and a tutor turn are never written by the same agent call. Each turn phase is run by a fresh agent that sees only the prompt printed by the harness (`eslStudy.ts prompts`) and writes JSON answers (`eslStudy.ts apply`); the real engine renders the tutor instructions and the real reply guards run on every ENARA reply. Agents work in cells of 9 sessions that share an arm and have 9 different students; **at most 3 agents run at a time**. Per turn the harness logs, as tags: the moves used, the strand (`strandLog`), whether the learner was explicit-first (`explicitFirst(band, status)`, also in arms where `levelExplicit` is off) and whether `levelExplicit` was active, whether the rule line was due, the `closingAsk` status, guard removals, answer-before-try detection on the raw and the final reply, and a two-asks flag. Session files keep the synthetic dialogue text (research data, synthetic only). If a session fails or is cut off, its file is kept as `PARTIAL_*` and the session is rerun from scratch; nothing is dropped silently.

## Post-test (frozen: `POSTTEST_ITEMS.json` + `POSTTEST_ITEMS.sha256`, committed with this protocol)
Per student and target form, 8 items: **4 controlled** (missing word, exact match), **2 free-production** ("write two sentences about ...", scored for correct use of the form), **2 next-level** items (one CEFR level above the band: A1→A2, A2→B1, B2→C1; controlled format). No item is a lesson exercise (`ready`). The post-test is taken by a **separate agent** playing the same student profile, with only the learner card and that session's transcript as its memory of the lesson and no tutor help; seeded per-item behaviour directives (lapse, guess, slip) are identical across arms for a student. Each post-test agent handles 3 cases from 3 different students. **Second post-test ("consistency check")**: a parallel form with different items, given in the same agent context after an unrelated filler task. It does **not** measure memory over days. Controlled and next-level items are scored deterministically (`benchmark/scoring.ts`, exact match); free-production items are scored by **blind scorer agents** (opaque ids, rubric in `POSTTEST_ITEMS.json`, `SCORER_INSTRUCTIONS.md`), two independent passes; a sentence scores 1 or 0, an item scores (sentences correct)/2, passes are averaged and their agreement is reported.

## Raters (`RATER_INSTRUCTIONS.md`)
18 cases (one per student), 4 tutors per case labelled V/W/X/Y in a random order that differs per case and per pass; 2 independent passes (2 raters per transcript); batches of 3 cases per rater agent; raters are blind to the arm. Ratings: overall, clarity, reasoning, answer protection, hint progression, recap (1 to 5).

## Analysis (fixed in advance; `reports/analysis/esl1_analysis.py`)
- **Primary outcome**: post-test accuracy, reported separately for **controlled items** (the 4 controlled items) and **free-production items** (the 2 free items). **For the go/no-go decision the primary outcome is the combined post-test score: the mean over the 6 primary items (4 controlled, 2 free scored 0 / 0.5 / 1).** The next-level items are secondary.
- **Fixed contrasts** (paired over students): (1) A0+LE − A0; (2) A0+LE − A0+arb; (3) A0+LE − P; (4) A0 − P. Bootstrap 95% interval over students (10,000 resamples), exact sign-flip test over students (2^n), Holm correction over the four contrasts, separately for the combined, the controlled and the free outcome.
- **Subgroups**: all 18; explicit-first students (A1 + A2, n = 12; where a gain is expected); B2 proficient (n = 6; A0+LE should equal A0+arb: any change is a warning).
- **Secondary**: the five ratings and overall; next-level items; consistency check; strand split per arm; proportion of turns with the rule line; moves used.
- **Guards (pass/fail, on the A0+LE arm against A0)**: (i) mean answer protection must not fall by more than 0.3 on the 1-to-5 scale; (ii) replies with the item's answer reaching the student before a genuine try (`leakFinal`) must not be more frequent than in A0; (iii) replies with two asks must be 0 in every ENARA arm.
- A result whose interval includes zero is not called a win.

## Decision rule (fixed in advance)
**GO for stage 2 (the real-learner pilot)** only if both hold: (a) A0+LE − A0 on the combined primary outcome has a 95% bootstrap interval entirely above zero for the explicit-first students; (b) no guard fails. Otherwise **NO-GO**, with what to revise in `levelExplicit` drawn from the transcripts. The report also states plainly whether A0+LE beat P, whether anything changed for the B2 students, and the limits.

## Limits stated in advance
One model family plays student, tutor, post-test taker, scorer and rater; seeded L1 errors are instructions, not real transfer; no real delay (the consistency check is not memory); 6 turns; 18 students; one replication per student; engine history is reconstructed from the dialogue; a tutor agent handles 9 sessions per call (different students, same arm); AI raters and scorers (moderate agreement expected).
