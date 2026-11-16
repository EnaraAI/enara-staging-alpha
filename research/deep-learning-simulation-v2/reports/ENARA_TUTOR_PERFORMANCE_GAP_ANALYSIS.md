# ENARA Tutor Performance Gap Analysis — Experiment 3 (A = ENARA, C = plain AI tutor)

*Written 14 Nov 2026. **AI-simulation findings only: nothing here is evidence about real learners.** Read-only analysis of `runs/full-experiment-3/`. No production code, configuration, database or preregistration was changed; raw data and all existing reports are untouched.*

**Final decision: `MIXED_RESULTS_REQUIRES_TARGETED_IMPROVEMENT`** (reasoning in section 12).

Companion files in this folder: `ENARA_A_VS_C_METRICS.csv`, `ENARA_OUTCOME_GAP_ANALYSIS.csv`, `ENARA_STUDENT_GAP_ANALYSIS.csv`, `ENARA_TRANSCRIPT_CASEBOOK.md`, `ENARA_TUTOR_IMPROVEMENT_ROADMAP.md`, `ENARA_EXPERIMENT_4_PROTOCOL.md`; the analysis code is `analysis/gap_analysis.py` (re-runnable, read-only on `runs/`).

## 0. Summary in plain words

- On average, ENARA and the plain AI tutor **teach the simulated students about equally well**. ENARA's learning gain is 4.0 points *lower* (95% CI −12.0 to +4.3), which is not distinguishable from zero. Mastery, delayed retention and misconception correction are numerically a little higher for ENARA, also not distinguishable from zero.
- We **cannot say they are equivalent either**: the interval reaches 12 points against ENARA and 4 points for it, wider than any sensible "same" margin.
- ENARA costs **2.35× more per block** ($0.167 vs $0.071 per block, $25.00 vs $10.65 in total for 150 blocks each; actual recorded usage × catalogue price), mostly because its tutor-side prompts use 3.8× the input tokens.
- Transcripts show a real pattern: ENARA **holds the correct position against a confident wrong belief** and makes the learner **explain their own reasoning** (its strengths), but it **repeats the same hint shape, can leave a lesson criterion untaught, follows side questions, and often ends a session without a recap** (its gaps).
- No subgroup, domain or outcome difference survives correction for multiple comparisons; the strongest signal (reading transfer, plain tutor +21 points) is a hypothesis.

## 1. Data integrity and scope (verified before analysis)

| Check | Result |
|---|---|
| Manifest | experimentId `full-experiment-3`, kind `full_experiment`, seed `enara-dls-v2-main-2`, 50 students × 3 replications, planned 900 blocks. The manifest is rewritten when a run resumes (it was resumed after process stops); earlier versions are in git history (commits `0398378`, `e852307`, `fa97d51`). Final manifest: code commit `070458d`, tree not dirty. |
| Preregistration | `config/preregistration.json` SHA-256 equals the lock file and the hash recorded in the manifest; `preregLocked: true`. Unchanged. |
| Blocks | 900 recorded, 900 unique block ids, 0 failed, 150 student-replication groups each with 6 blocks, 6 distinct conditions and 6 distinct areas. 50 students, 48 outcomes, 3 replications. |
| A and C | 150 completed blocks each (`status: ok`); block ids all follow `r{rep}-{student}-{outcome}`. A covers 43 outcomes and C covers 41; **12 outcomes have no A-vs-C comparison** (one arm has no block). |
| Ledger | 56,247 attempts; ledger total $62.32 equals `finished.json`; sequence numbers unique; SHA-256 of `blocks.jsonl` and `provider_attempts.jsonl` equal the hashes in `finished.json`. |
| Audit log | 898 of 900 blocks have an audit row. The two without (r2-S015-WR-08 and r2-S016-RD-06, both ENARA) were recorded when a process was stopped between writes; their result records are complete and are used, but audit-based fields (held misconception, "already knows") are missing for them and treated as missing, not inferred. |
| Duplicates / exclusions | None found. No block silently excluded. |
| Condition E | Completed (900 of 900) after Experiment 3 was first analysed as incomplete, but **excluded from every comparison here**, as instructed: no E block enters any number below, and the outcome baselines used for adjustment come from A, B, C, D and F blocks only. |
| Cross-experiment | Experiments 2 and 3 are **not combined**. One sentence labelled cross-experiment appears in section 12. |

## 2. Quantitative A vs C comparison

**Method (and why).** Each student has exactly one A block and one C block in each replication, but in a *different area* and outcome (the design is a balanced Latin square). So differences are computed **per student** (mean over the 3 replications of A minus C, n = 50 pairs), with:
- a **student-cluster bootstrap** 95% CI (5,000 resamples) and a **sign-flip permutation test** (20,000 flips) on the 50 student-level differences (the preregistered test family);
- a second CI that **resamples outcomes** (per-outcome A-minus-C differences over outcomes with both arms) to show generalisation across outcomes;
- an **outcome-adjusted** version (each block minus the mean of that outcome over A, B, C, D, F blocks) because A and C blocks are on different outcomes;
- effect size = paired d_z with a small-sample (Hedges) correction.
The three answer samples per item are **not** treated as observations: they are collapsed to one majority vote per item upstream, and four items form one block score. Mixed-effects models are not available here (no statistics library); the student-cluster bootstrap and outcome-cluster bootstrap are the substitute, and they do not model student × outcome variance jointly (so intervals are approximate).

| Metric | A | C | A − C | relative | d_z | 95% CI (students) | 95% CI (outcomes) | p (sign-flip) | Practical reading |
|---|---|---|---|---|---|---|---|---|---|
| Pre-test | 0.310 | 0.313 | −0.003 | −1% | −0.01 | −0.088, 0.080 | −0.067, 0.067 | 0.97 | Balanced start (good) |
| Post-test | 0.432 | 0.475 | −0.043 | −9% | −0.18 | −0.108, 0.023 | −0.127, 0.030 | 0.21 | Small, not distinguishable from 0 |
| **Learning gain** | 0.122 | 0.162 | **−0.040** | −25% | −0.13 | −0.120, 0.043 | −0.134, 0.034 | 0.38 | Not distinguishable; ENARA gains 4 points less on average |
| Transfer | 0.430 | 0.462 | −0.032 | −7% | −0.12 | −0.105, 0.043 | −0.134, 0.058 | 0.43 | Not distinguishable |
| Delayed retention | 0.410 | 0.390 | +0.020 | +5% | +0.07 | −0.053, 0.092 | −0.055, 0.119 | 0.63 | Not distinguishable |
| Mastery rate | 0.160 | 0.147 | +0.013 | +9% | +0.05 | −0.053, 0.080 | −0.078, 0.116 | 0.86 | Not distinguishable (24 vs 22 mastered blocks) |
| Independent performance (post + transfer, no tutor) | 0.431 | 0.468 | −0.038 | −8% | −0.16 | −0.098, 0.025 | −0.121, 0.035 | 0.26 | Same picture as post/transfer |
| Misconception correction (blocks whose pre-test showed the misconception) | 0.150 (A, 133 blocks) | 0.121 (C, 132 blocks) | +0.029 | +24% | n/a | −0.056, 0.113 | n/a | 0.59 (label-permutation, ignores clustering) | Low for both tutors; not distinguishable |

Outcome-adjusted gain: A − C = −0.026 [−0.100, 0.050]. The **preregistered** two-way (student × outcome) bootstrap of the same contrast gave −0.04 [−0.18, 0.11], Holm-adjusted p = 1.0 (`runs/full-experiment-3/reports/1_overall_effectiveness.md`); the wider interval is expected because it also resamples outcomes.

**By replication (gain, A − C, n = 50 each):** rep 1: −0.125 [−0.255, 0.010]; rep 2: +0.010 [−0.130, 0.150]; rep 3: −0.005 [−0.165, 0.165]. The apparent plain-tutor advantage sits in replication 1; reps 2 and 3 are equal. This heterogeneity is consistent with chance at these sample sizes and is not corrected, but it warns against reading the pooled −0.04 as a stable effect.

**By domain (block-level, outcome-adjusted; ~16–26 blocks per arm; student-cluster CI).** Gain A − C: grammar −0.03 [−0.24, 0.18]; vocabulary −0.12 [−0.26, 0.02]; reading −0.11 [−0.29, 0.07]; writing +0.01 [−0.18, 0.22]; functional +0.03 [−0.19, 0.25]; listening/dialogue +0.06 [−0.17, 0.29]. **Reading transfer** A − C = −0.21 [−0.35, −0.07] (A 0.27 vs C 0.55), raw p = 0.008, **Benjamini–Hochberg q = 0.68** across all exploratory rows, so treat as a hypothesis. Vocabulary delayed retention favours ENARA by +0.15 [−0.00, 0.32] (q = 1.0). Full rows in `ENARA_A_VS_C_METRICS.csv`.

**By simulator profile tag** (simulator parameters, *not* validated classifications): the only subgroup interval that excludes zero is "underconfident" (A − C gain −0.22 [−0.38, −0.03], 12 students), exploratory and not significant after correction (smallest q across all subgroup rows is 0.68). The five "adversarial" students: A gain 0.017, C 0.050.

## 3. Learning-outcome analysis (48 outcomes)

Each outcome has only **2–7 blocks per arm** (14 outcomes have exactly 4, 19 have 2 for ENARA), against a block-level standard deviation of about 0.5, so **no per-outcome difference is statistically reliable**. Classification is therefore descriptive; the evidence column in `ENARA_OUTCOME_GAP_ANALYSIS.csv` is "insufficient" for every comparable outcome (fewer than 6 blocks per arm for 36 of 36).

| Class (rule stated in the CSV) | Outcomes |
|---|---|
| ENARA higher, directional (11) | FN-03, FN-07, FN-08, GR-01, GR-03, GR-06, LS-02, LS-04, RD-08, VO-07, WR-04 |
| Plain tutor higher, directional (16) | FN-01, FN-02, GR-02, GR-04, GR-05, GR-07, LS-07, RD-02, RD-04, RD-05, VO-01, VO-03, VO-04, VO-06, VO-08, WR-02 |
| Similar (gain within 5 points) (4) | FN-06, LS-03, WR-03, WR-05 |
| Both tutors fail (post < 35%, no mastery) (5) | RD-03, RD-06, VO-05, WR-01, WR-07 |
| Both tutors reach mastery (≥ 50% of blocks) | none |
| No comparison possible (12) | FN-04, FN-05, GR-08, LS-01, LS-05, LS-06, LS-08, RD-01, RD-07, VO-02, WR-06, WR-08 |

A sign test on the 27 outcomes with a directional winner (16 favour the plain tutor) gives p ≈ 0.44 (two-sided): this split is what chance would produce if the tutors were equal.

**By domain (mean post-test over comparable outcomes, A / C):** functional 0.43 / 0.43; grammar 0.52 / 0.49; listening/dialogue 0.65 / 0.58; vocabulary 0.49 / 0.55; writing 0.37 / 0.48; **reading 0.27 / 0.47**. Reading is the weakest domain for ENARA and its largest directional gap.

**Recurring weaknesses.** (1) Reading outcomes (RD-03 and RD-06, plus VO-05 phrasal verbs, fail for both tutors; reading is also where ENARA's gap is largest: RD-04 post-test 0.13 vs 0.69). (2) Both tutors fail on **surface-convention tasks** (WR-01 capital letters/full stops; WR-07 describing a person), where the simulated learner's persistent habits dominate. (3) ENARA's largest plain-tutor gaps are on outcomes where the learner has a ready counter-argument (FN-01, GR-07, VO-03/-06). **Prerequisite dependencies:** the benchmark records one prerequisite probe per block, but this analysis found no evidence about prerequisite chains between outcomes (each block tests one outcome); that question is **not answerable from these data**.

## 4. Student-level analysis (50 students; flags are descriptive, 3 blocks per arm each)

`ENARA_STUDENT_GAP_ANALYSIS.csv` has one row per student (pre, gain, transfer, delayed, mastery, misconception recovery for both tutors, plus rule-based flags). Counts (rules in the CSV):
- Learned better with ENARA (gain +15 points or more): **11** students. Learned better with the plain tutor (−15 or more): **21**. With 3 blocks per arm and sd ≈ 0.5 per block, a ±15-point student difference is expected by chance for many students; this is **not** evidence of individual differences.
- Neither tutor worked (gain ≤ 5 points, no mastery under either): **4** students.
- Persistent misconceptions (never recovered under either tutor, ≥ 2 blocks with the misconception): **26** students (about half of the sample, in line with misconception recovery of 12–15% for both tutors).
- Possible hint dependence (ENARA sessions with a high text-pattern hint share *and* a post-test above transfer by 10+ points): **4** students (a weak, proxy-based flag).
- Good post-test but forgot later (post − delayed ≥ 20 points): **4** under ENARA, **10** under the plain tutor.
- **Profiles.** ENARA's gain is not systematically lower for adversarial or misconception-heavy profiles in these data (adversarial n = 5: A 0.017 vs C 0.050; "persistent misconceptions" n = 19: A −0.018 vs C 0.044, CI includes 0). The profile categories are experimental simulator parameters; they are not validated psychological types.

## 5. Conversation-level diagnostics

Nine paired transcripts are analysed in `ENARA_TRANSCRIPT_CASEBOOK.md` (cases chosen from 88 matched pairs; each case lists what the student needed, what each tutor did, which was more effective, the pedagogical reason and a proposed ENARA change). In short:

| Pattern | Where seen | Confirmed? |
|---|---|---|
| ENARA keeps the correct position against a confident wrong belief; plain tutor concedes | WR-04 (win), FN-01 (ENARA also concedes once) | Observed in transcripts; frequency not measured |
| ENARA makes the learner explain their choice ("why did you put -ed?") | GR-01 (win), RD-04 | Observed; its rate was not measured |
| ENARA repeats one hint shape for several turns while the learner repeats the same belief | GR-07, RD-02 | Observed in 2 cases; frequency unknown |
| A lesson criterion is left unexplained (the third preposition) | GR-07 | Observed in 1 case |
| ENARA follows side questions without consolidating | WR-05 | Observed in 1 case |
| ENARA often ends without a recap | WR-05, GR-01, WR-05 (S014) | **Measured**: last tutor message contains a recap in 6.7% of ENARA blocks vs 31.3% of plain-tutor blocks (text-pattern measure) |
| Letter-only answers confirmed without a reason | RD-04 | Observed in 1 case |

## 6. Tutor behaviour evaluation (consistent rubric)

Rating scale: **A+** ENARA better, **C+** plain tutor better, **=** similar, **NM** not measurable from these data. "Metric" = text-pattern computed over all 150 + 150 transcripts (rule-based, not a human or model rating, so rough). "Case" = casebook evidence.

| Dimension | Rating | Evidence |
|---|---|---|
| Diagnostic accuracy | A+ (tentative) | Case 5: elicits the learner's reason; engine has a diagnosis step. Aggregate misconception correction 0.15 vs 0.12 (n.s.) |
| Identifying prerequisite gaps | NM | The benchmark records learner prerequisite results, not whether the tutor tested prerequisites |
| Explanation clarity | C+ (tentative) | Cases 1 and 2: plain tutor gives a decision rule or a 3-box layout; ENARA gives a correct but narrower fix |
| Scaffolding quality | = | ENARA scaffolds by questions; plain tutor by worked contrast; both worked in different cases |
| Hint timing | C+ (tentative) | ENARA withholds the rule longer (cases 2, 6); hint-language share of turns 42% vs 52% |
| Try-first behaviour | = / C+ | ENARA's first reply contains a question in 49% of blocks vs 69% for the plain tutor; short learner attempt turns per block 0.67 vs 1.04 (proxy). So in practice the plain tutor drew **more** learner attempts |
| Question quality | NM | Question rate 63% (A) vs 78% (C) of turns; quality not rated |
| Misconception detection | A+ (tentative) | Case 4 and 5 |
| Misconception correction | = | Recovery 0.15 vs 0.12; both low |
| Adaptive difficulty | NM | Not separable from content in 6-turn sessions |
| Student engagement | NM | Praise-word rate 44% vs 66% of turns (style, not engagement) |
| Transfer preparation | A+ (case-level) / = (aggregate) | Cases 4, 5; aggregate transfer −3.2 pts n.s. |
| Retention support | C+ (metric) | Recap in last turn 6.7% vs 31.3%; delayed retention is equal (0.41 vs 0.39) so the benefit is not shown |
| Independent problem-solving | = | Independent performance 0.43 vs 0.47 n.s. |
| Confidence calibration | = (learner-side) | Mean (stated confidence − correctness) 0.29 vs 0.28; this measures the simulated learner, not the tutor |
| Avoiding answer leakage | A+ (metric) | A tutor text contained a ≥ 2-word accepted practice answer in 43% of blocks vs 55% for C (includes after attempts, so an upper bound on pre-attempt leakage); 0 assessment leakage events in the whole run |
| Avoiding unnecessary explanation | A+ (length) / mixed | 90 vs 106 words per turn; but case 3 shows side-topic digressions |
| Knowing when to change strategy | C+ | Cases 2 and 6 |

## 7. Cost and efficiency (actual recorded usage × catalogue price; not provider invoices)

| | ENARA (A) | Plain tutor (C) |
|---|---|---|
| Tutor-side model | claude-opus-5-5 | claude-opus-5-5 |
| Tutor calls | 948 | 948 |
| Tutor input tokens | 3,619,832 | 959,444 (**ENARA 3.8×**) |
| Tutor output tokens | 466,980 | 280,671 (ENARA 1.7×) |
| Tutor-side cost | $23.82 | $9.45 (ENARA 2.5×) |
| Student answers + teaching turns + judge (same models) | $1.18 | $1.19 |
| **Total (150 blocks)** | **$25.00** | **$10.65** |
| Per student (50) | $0.500 | $0.213 |
| Per block | $0.167 | $0.071 |
| Mastered blocks (cost per mastered outcome) | 24 ($1.04) | 22 ($0.48) |
| Mean gain / cost per gain point per block | 0.122 / $0.014 | 0.162 / $0.004 |

Failed provider attempts (A 226 incl. 219 student-answer retries; C 84) carry no usage and are recorded as unknown cost, not zero. **Value judgement:** ENARA's extra cost buys **no measurable learning gain** in these data (gain −4.0 points, CI −12 to +4), so on this evidence the plain tutor is the more cost-efficient. The cost gap is not intrinsic to adaptive tutoring: it comes from ENARA's system prompt (about 3.8× the input tokens for the same number of calls), which can be reduced without changing behaviour (roadmap P1-4).

## 8. Root-cause analysis

Classification of each ENARA weakness. **Confirmed** = shown directly in transcripts, metrics or code. **Hypothesis** = plausible, not tested.

| Weakness | Likely source | Status | Basis |
|---|---|---|---|
| Missing recap / rule-in-own-words at the end (recap 6.7% vs 31.3%) | Memory and progression; tutor orchestration | **Confirmed** (metric); mechanism likely | In `supportStage` (`languageTeachingContext.ts`), the summarise step fires only after a correct answer that followed a failed try on an item; the rule check fires only if the previous tutor message asked for it. No session-closing step was found in the code read. |
| Same hint shape repeated for several turns | Hint policy; teaching strategy selection | **Confirmed in 2 cases**; frequency unknown | GR-07, RD-02 transcripts; `teach_rule` triggers per *item* after the second miss, not per repeated belief |
| A lesson criterion not covered before the session ends | Adaptation logic; strategy selection | Confirmed in 1 case (GR-07); **hypothesis** that it generalises | Transcript; the engine does list not-yet-shown criteria |
| Concession to a wrong belief ("usually okay") | Explanation generation | Confirmed in 1 case (FN-01) | Transcript |
| Reading transfer gap (−0.21) | Hint policy for reading (hints avoid the answer sentence by design); explanation generation | **Hypothesis** (exploratory, q = 0.68) | Case 6; the Fix-4 skill-aware hints are documented to withhold pointing at the answer sentence |
| Letter-only answers confirmed without reasoning; task type mismatch | Assessment-format adaptation | Confirmed in 1 case (RD-04); effect on score **not established** | Transcript |
| Higher cost (3.8× input tokens) | Tutor orchestration (prompt size) | **Confirmed** | Ledger |
| Persistent misconceptions survive both tutors | Student simulation behaviour (note-only memory, persona beliefs) | Likely; **hypothesis** | Both tutors recover 12–15% |
| No per-outcome / per-subgroup conclusions | Insufficient evidence | **Confirmed** | 2–7 blocks per arm per outcome |

## 9. Improvement roadmap

See `ENARA_TUTOR_IMPROVEMENT_ROADMAP.md`. Headline P0 items: (1) a closing recap and rule-in-own-words check; (2) strategy change when the learner repeats the same wrong belief twice; (3) explicit coverage of every lesson success criterion before the session ends. Each is limited to what the transcripts and metrics support and is paired with a regression test that protects ENARA's try-first, no-answer-giving and hold-the-line behaviour.

## 10. Experiment 4 proposal

See `ENARA_EXPERIMENT_4_PROTOCOL.md` (A current ENARA, B improved ENARA, C plain tutor; matched-block design; sample sizes derived from the observed variance, with a pilot to fix the final size; hold-out outcomes to avoid overfitting to this analysis). Experiment 4 has not been started.

## 11. Limitations

Simulated learners only (a language model with numeric parameters and note-only memory; not validated against real learners). Six tutor turns per block; ENARA is not designed for a hard turn cap. A and C students differ within a pair (design is not matched at block level). Per-outcome and per-student numbers are small. Process metrics are text-pattern heuristics, not human ratings. The casebook is a hand-picked set of nine matched pairs. No mixed-effects model. Costs are recorded usage times catalogue price. Only the immutable Experiment 3 data were used.

## 12. Final decision and reasoning

**`MIXED_RESULTS_REQUIRES_TARGETED_IMPROVEMENT`.**

- *Not* `ENARA_OUTPERFORMS_PLAIN_TUTOR`: ENARA's gain is 4 points lower, and no pre-registered or exploratory contrast favours ENARA after correction.
- *Not* `ENARA_UNDERPERFORMS_PLAIN_TUTOR`: the 4-point deficit is within noise (CI −12 to +4); delayed retention, mastery and misconception correction are numerically slightly higher for ENARA.
- *Not* `ENARA_MATCHES_PLAIN_TUTOR`: equivalence is not demonstrated (interval wider than any reasonable margin), and a cost of 2.35× with no gain is not a "match".
- *Not* `INSUFFICIENT_EVIDENCE` alone: the process evidence is substantial, with clear and specific tutor behaviours in each direction, and a measured closure gap (6.7% vs 31.3%).
- The honest reading is mixed: ENARA shows distinctive strengths (holding the correct line, eliciting reasoning, transfer tasks), identifiable gaps (closure, repeated hints, coverage) and a large cost premium. Targeted fixes plus a matched-design Experiment 4 are the logical next step.

*Cross-experiment note (explicitly not pooled):* the earlier Experiment 2 (2 items per stage) also showed the plain tutor numerically ahead on gain, and its transcript analysis (`docs/WHY_GENERIC_TUTOR_MATCHES.md`) hypothesised that explicit rule statements matter in short sessions. In Experiment 3 the turn-1 rule rate is similar (37% vs 39%), so that hypothesis is **weakened**: the stronger difference now is closure and strategy change, not up-front explanation.
