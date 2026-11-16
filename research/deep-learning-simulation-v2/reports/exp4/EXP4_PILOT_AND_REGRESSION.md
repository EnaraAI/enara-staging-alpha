# Experiment 4: fixes, regression check and pilot (stage 0)

*14 Nov 2026. AI-simulation only. The pilot is used to size the main stage; its results are descriptive and are not pooled into the main analysis.*

## 1. The fixes (condition B, "improved ENARA")

Three prompt-level behaviours, from the P0 items of the roadmap, implemented in `backend/src/services/languageTeachingContext.ts` behind a **default-off, non-production** switch (`ENARA_RESEARCH_IMPROVE`, ignored when `NODE_ENV=production`, like the earlier ablation switch). Nothing ships to production.

| Behaviour | What it adds to the tutor instructions |
|---|---|
| `closing` (P0-1) | From the learner's 5th message (or when every success criterion has been shown): answer any open learner question briefly, recap the rule in two short lines, and ask "Tell me the rule in your own words". No new exercise that turn; never write a completed answer to an open exercise. |
| `strategy` (P0-2) | When the learner is stuck (two hint turns on an item, two wrong turns in a row, or a recurring error): stop asking the same kind of hint question, state the general scope rule once with a contrast example, then ask the learner to apply it. Never write the corrected form of the open task. |
| `coverage` (P0-3) | List the lesson success criteria the learner has not shown yet and ask the tutor to state the whole rule family once, so no criterion is left untaught. |

No guard was changed: the pre-attempt answer guards, try-first rules, English-only rule and avatar/chat shared pipeline are untouched. The closing turn (5) coincides with the experiment's 6-turn cap; this is a disclosed design parameter, and the hold-out set is the protection against tuning to the harness.

**Tests:** `backend/test/researchImproved.test.ts` (6 tests: off by default, ignored in production, closing only from the closing turn, strategy only when stuck, coverage lists unshown criteria, answer-hiding wording remains) plus the existing language, avatar-link and ablation suites: **108 backend tests pass**; **71 research tests pass** (matched design, hold-out draw, reproducibility).

## 2. Preregistration and hold-out (locked before the pilot)

`config/preregistration_exp4.json` (primary: gain B−A and B−C, target +0.08, Holm over two contrasts; N rule from the pilot) is locked (`preregistration_exp4.lock`). **Amendment before any run:** a hand-transcription error in the recorded hold-out hash was corrected and the file re-locked; the amendment log is inside the file. Hold-out set (16 outcomes, seeded, stratified, excluding the 8 outcomes whose transcripts were read): FN-04, FN-06, FN-08, GR-02, GR-04, GR-06, LS-02, LS-05, LS-08, RD-06, RD-07, RD-08, VO-02, VO-04, WR-02, WR-06. Disclosure (also in the preregistration): the author saw per-outcome aggregate A-vs-C scores for all 48 outcomes, so the hold-out protects against transcript-level tuning, not aggregate knowledge.

## 3. Regression check (scripted learners, real ENARA route, $1.15)

The first reading **failed** the protocol rule: a regex "leak" count was **B 16 vs A 8**. Inspection showed that count caught lesson vocabulary and taught forms (for example "Kind regards", "station"), not answer disclosure, and the same inspection showed that the first concession regex missed a concession by **both** tutors. Both metrics were redefined after seeing the result (disclosed here and in `runs/exp4-regression/regression_revised.md`; the original FAIL is kept in `regression.md`).

| Measure (25 replies per condition) | A | B |
|---|---|---|
| Strict answer disclosure (full accepted answer sentence, 3+ words) | 0 | 0 |
| Original broad "leak" count (not disclosure) | 8 | 16 |
| Arabic in reply | 0 | 0 |
| Off-topic compliance | 0 | 0 |
| Concession to a repeated wrong belief (revised regex; 5 replies each) | 3 | 2 |
| Recap / "own words" asked near the end (of 5 scenarios) | 0 | 5 |

Reading: B is not worse on disclosure, Arabic, off-topic or concession; it restates taught forms more often by design (recap/coverage), which Experiment 4 measures. **New finding about current ENARA:** under five turns of persistent pressure it also concedes ("You have a fair point"; "Honest answer: yes, 'Thanks' is fine in many real emails, even to a teacher"), so the "holds the line" strength seen in some transcripts is not unconditional. Five scenarios are a smoke test, not statistics.

## 4. Pilot (60 matched triplets, development outcomes only, $23.39)

180 blocks (10 students × 6 areas × A, B, C), 58 complete triplets. Two blocks failed, both condition C on LS-01, aborted by the leakage guard because the plain tutor produced "what time does the film start", a phrase identical to an assessment prompt; both units are excluded and reported. Leakage events: 2 (the same two). 11,657 provider attempts, 13 failed; total recorded cost $23.39 (A $9.44, B $9.87, C $4.07 over 58 units).

**Descriptive results (n = 58 triplets, not for inference):** gain B−A +0.065 [−0.106, 0.239], B−C +0.060 [−0.104, 0.225], A−C −0.004 [−0.138, 0.121]; delayed retention B−C +0.082 [−0.012, 0.196] (raw p 0.04, uncorrected, pilot only); mastered A 11, B 11, C 7. **Process metrics** (frozen heuristics `exp4-pm-v1`): recap in the last tutor turn A 12%, B 90%, C 34%; rule-in-own-words asked A 7%, B 100%, C 3%; three or more consecutive same-shape hint turns A 7%, B 5%, C 12%. So the closing behaviour does what it was designed to do; whether it improves learning is the main stage's question.

**Variance and sample size.** The variance of the per-triplet gain difference is **0.168 (B−A)** and **0.154 (B−C)** in the matched design, against **0.284** for the unmatched A-vs-C pairs of Experiment 3 (a 41% reduction). The preregistered rule gives

N = max(150, ceil(1.2 × 9.505 × 0.168 / 0.08²)) = **300 matched triplets**,

which the main stage uses (50 students × 6 areas × 1 replication, hold-out outcomes only; estimated cost about $0.39 per triplet, about $117; cap $150).

## 5. Status

The main stage was launched on 14 Nov 2026 (config `config/exp4_main.json`, seed `enara-dls-v2-exp4-main`). Its analysis uses `reports/exp4/exp4_analysis.py` with the frozen heuristics and the preregistered decision rules; the report follows when the run is complete.
