# ENARA Phase 1: Independent AI Review of the r3 + Trusted Age Band run

Benchmark `ltb-v1.0`, run `20261109T1211-ltb-v1.0-ageband` (official result **90/120 MEETS, 75.0%**). Review date: 2026-11-09. Rubric `ltb-rubric-v1` and scorer `ltb-scoring-v1`, both used unchanged.

> **What this is not.** This is an AI-only review. It is not human educator validation. It is not evidence of learning gains or real-world educational effectiveness. All conversations are synthetic.

## 1. Executive summary

- **Reviewer:** `claude-haiku-5-5` at high effort. This is a different Claude model from the tutor (`claude-opus-5-5`) and the official judge (`claude-sonnet-5-5`), from the **same provider**. The review is **partially independent, not cross-provider**: no other provider is configured in this repository.
- **Coverage:** 120/120 cases were reviewed and 0 were unreviewable. Each case was a blind, isolated call. Reviews were sealed (SHA-256 `64f7aa6b4c9686baec548b3465fe937f84b0e3f101df13dc73971bdf27f3754e`) before any judge output was read.
- **Independent outcome (frozen `ltb-scoring-v1` rule applied to the independent scores):** **75/120 MEETS (62.5%)**, 45 PARTIAL, 0 DOES_NOT_MEET. The reviewer's own holistic verdicts give 79/120.
- **Against the official result:** 90/120 (75.0%) officially, 75/120 (62.5%) independently. Outcome agreement is 70.8% (Cohen's κ = 0.333). All 35 disagreements are MEETS↔PARTIAL: 25 official MEETS were scored PARTIAL independently, and 10 official PARTIAL were scored MEETS.
- **After adjudicating the 35 disagreements:** 70–77/120 MEETS (58.3%–64.2%). The spread comes from 7 unresolved cases.
- **70% internal target (84/120):** **not met under independent scoring**, in any of the scenarios above.
- **Why the counts differ:** the two evaluators agree closely on each dimension. Mean differences are at most 0.18, and 99–100% of scores fall within 1 point. But 62 of the 90 official MEETS have a judge mean of **exactly 3.00**, the threshold. A one-point difference on one dimension flips such a case. The official 75% therefore rests on a large boundary population.
- **No critical issues.** No critical failure tag, no dimension scored 0, no DOES_NOT_MEET, and no privacy issue.
- **Recommended status:** `AI_REVIEW_FINDS_MATERIAL_SCORING_DISAGREEMENT` (see `phase1_ai_review_decision.md`).

## 2. Methodology

1. **Phase 0 integrity checks**, all passed:
   - 120 unique cases and 219 turns;
   - case-set SHA-256 `725edb2b…a2bb` matches;
   - all 50 artifacts in the run manifest re-verified;
   - runtime `languageTurn` metadata on all 219 turns: child/class_age_band/known 73, teen/class_age_band/known 73, adult/school_setting_adult_learners/known 73;
   - 0 empty replies.
2. **Phase 1–2 blind review:** one isolated call per case.
   - **The reviewer saw:** the frozen rubric (anchors, scoring rules, failure categories, severity); the evaluation checks A–G and restrictions 1–9 from the brief; the case ID, trusted age band, CEFR estimate, situation type, lesson and objective, expected and unacceptable behaviour, word limit; and the full transcript.
   - **The reviewer did not see:** judge scores, tags, outcomes, regression status, engine moves, deterministic-check results, or the learner's grade (restriction 5).
   - **Output checks:** JSON is validated, with one re-ask if invalid. Every evidence quote is checked against the transcript: 543/544 quotes were found verbatim.
   - **Privacy:** every payload is scanned for the synthetic name, email, student/school/batch IDs and school name before sending. 0 hits; nothing was blocked.
3. **Outcome derivation:** the frozen `ltb-scoring-v1` rule from `score.mjs`, with the independent scores and tags in place of the judge's and the official deterministic-check results (unchanged). The reviewer's holistic outcome is kept as a secondary field. It agrees with the derived outcome in 116/120 cases; the 4 differences are 3 mastery-regex check failures and 1 holistic MEETS at a 2.83 mean.
4. **Phase 3 targeted audits**, run after the seal, could use the official flags as hypotheses:
   - 5 factual-error flags;
   - 40 teen cases;
   - 11 ignored-reply flags;
   - 22 verbosity flags;
   - 9 regressions, compared pairwise r3 vs latest with an anonymised, randomised order, plus a blind review of the r3 transcripts with the identical prompt.
5. **Phase 4 comparison and adjudication:** each of the 35 disagreements went to a separate adjudication call. The two evaluations were presented anonymised as A/B in randomised order, with the transcript. Scores were never averaged.
6. **Spend:** $0.4891 of the $5.00 cap (263 calls), metered from provider-reported usage with the repository price catalogue. No budget, provider setting or `AI_TEST_SPEND_ID` was touched.

## 3. Reviewer identity and independence

| Role | Model | Effort |
|---|---|---|
| Tutor (under review) | claude-opus-5-5 | low |
| Official judge | claude-sonnet-5-5 | medium |
| **Independent reviewer, auditor and adjudicator** | **claude-haiku-5-5** | high |

Option 1 in the brief (a different provider) was not available: the backend price catalogue and configuration contain Anthropic models only, and no credentials were created. Option 2 was used. Opus was not chosen because it generated the transcripts, which risks self-preference. The review is labelled **DIFFERENT CLAUDE MODEL, SAME PROVIDER — PARTIALLY INDEPENDENT, NOT CROSS-PROVIDER**. A smaller model can also be stricter or noisier than a larger judge; see Limitations.

## 4. Overall outcomes

| | MEETS | PARTIAL | DOES_NOT_MEET |
|---|---:|---:|---:|
| Official judge | 90 | 30 | 0 |
| Independent (frozen rule) | 75 | 45 | 0 |
| Independent (holistic) | 79 | 41 | 0 |
| After adjudication | 70–77 | 43–50 | 0 |

## 5. Seven-dimension analysis (independent reviewer)

| Dimension | Independent mean | Official mean | Δ | Exact agreement | Within 1 |
|---|---:|---:|---:|---:|---:|
| Learner-context fidelity | 2.89 | 3.02 | -0.13 | 81.7% | 100.0% |
| Lesson alignment | 2.91 | 3.08 | -0.18 | 76.7% | 99.2% |
| Pedagogical appropriateness | 2.95 | 3.05 | -0.10 | 76.7% | 100.0% |
| Scaffolding | 2.75 | 2.86 | -0.11 | 66.7% | 100.0% |
| Age & proficiency fit | 3.08 | 2.98 | +0.10 | 85.0% | 100.0% |
| Formative check | 2.82 | 2.87 | -0.05 | 83.3% | 100.0% |
| Clarity | 3.13 | 3.10 | +0.03 | 75.0% | 100.0% |

The independent reviewer is slightly stricter on lesson alignment, context fidelity, scaffolding and pedagogy, and slightly more lenient on age fit and clarity. Weakest dimensions overall: **scaffolding** (2.75) and **formative check** (2.82).

Independent failure tags (count):

| Tag | Independent | Official |
|---|---:|---:|
| minor:over_helping | 30 | 21 |
| minor:factual_error | 11 | 5 |
| minor:context_invention | 6 | 0 |
| minor:ignored_learner_reply | 6 | 9 |
| major:ignored_learner_reply | 5 | 2 |
| minor:lesson_drift | 4 | 26 |
| major:over_helping | 3 | 0 |
| minor:no_formative_check | 3 | 17 |
| minor:under_scaffolding | 3 | 19 |
| major:factual_error | 2 | 0 |
| major:context_invention | 1 | 0 |
| minor:age_tone_mismatch | 1 | 2 |
| minor:level_mismatch | 1 | 13 |
| minor:verbosity | 1 | 22 |
| minor:premature_mastery_claim | 0 | 1 |

The independent reviewer's dominant concern is **over-helping**: 33 tags, including 3 major ones where hints reveal the target answer. The official judge's dominant tags are lesson drift and verbosity. The independent reviewer also raised 13 factual_error tags (2 major); see the factual audit, where several are judged pedantic.

## 6. Cohort breakdown

| Group | n | Official MEETS | Independent MEETS | Outcome agreement | Age-fit (official → independent) |
|---|---:|---:|---:|---:|---|
| adult | 40 | 31 | 26 | 27/40 | 2.95 → 3.02 |
| child | 40 | 27 | 25 | 32/40 | 2.92 → 3.12 |
| teen | 40 | 32 | 24 | 26/40 | 3.05 → 3.08 |

## 7. CEFR breakdown

| Group | n | Official MEETS | Independent MEETS | Outcome agreement | Age-fit (official → independent) |
|---|---:|---:|---:|---:|---|
| A1 | 42 | 31 | 27 | 28/42 | 3.00 → 3.05 |
| A2 | 39 | 27 | 23 | 33/39 | 3.03 → 3.13 |
| B1 | 39 | 32 | 25 | 24/39 | 2.90 → 3.05 |

## 8. Situation-type breakdown

| Group | n | Official MEETS | Independent MEETS | Outcome agreement | Age-fit (official → independent) |
|---|---:|---:|---:|---:|---|
| T01 | 12 | 8 | 8 | 6/12 | 2.67 → 3.00 |
| T02 | 9 | 5 | 4 | 8/9 | 2.89 → 3.00 |
| T03 | 9 | 7 | 4 | 6/9 | 2.78 → 3.00 |
| T04 | 9 | 4 | 2 | 5/9 | 2.89 → 3.00 |
| T05 | 9 | 9 | 7 | 7/9 | 3.00 → 3.11 |
| T06 | 9 | 8 | 5 | 6/9 | 3.11 → 3.00 |
| T07 | 9 | 3 | 5 | 5/9 | 2.89 → 3.00 |
| T08 | 9 | 7 | 3 | 5/9 | 2.89 → 3.00 |
| T09 | 9 | 8 | 9 | 8/9 | 3.00 → 3.11 |
| T10 | 9 | 9 | 9 | 9/9 | 3.56 → 3.56 |
| T11 | 9 | 8 | 8 | 9/9 | 3.00 → 3.11 |
| T12 | 9 | 7 | 7 | 5/9 | 3.11 → 3.11 |
| T13 | 9 | 7 | 4 | 6/9 | 3.00 → 3.00 |

Teen cases have the lowest independent MEETS count (24/40). The teen audit shows the cause is **over-helping in the T05–T13 multi-turn situations**, not register.

## 9. Rubric ambiguities flagged by the reviewer

The reviewer raised `RUBRIC_AMBIGUITY` notes on 95 cases. It was asked to flag rather than invent thresholds (restriction 9). Recurring themes:
- **No threshold for how strong a hint may be** before it counts as over-helping. This affects scaffolding and pedagogy scores in T05, T06 and T13.
- **No definition of what counts as a meaningful formative check:** whether a copy-with-one-blank prompt or a single "Your turn" qualifies.
- **How to score a learner answer that matches the lesson item but not the tutor's own prompt.**
- **How to weigh partial lesson alignment and minor simplifications.**

These gaps are the main reason two careful evaluators land on opposite sides of 3.00 for the same transcript. **Recommendation:** add hint-strength and formative-check anchors in a future rubric version (v2). Do not change v1 retroactively.

## 10. Limitations

- **No human educator involved.** The review is AI-only and the reviewer is from the same provider as the tutor and judge. Shared training biases cannot be excluded.
- **One model reviewed, audited and adjudicated.** Haiku 5.5 did all three. The adjudication accepted the independent reading 21 times and the original 7 times; self-agreement bias is possible. The decision does not depend on the adjudication: independent scoring alone is 62.5%, and even the most favourable adjudicated scenario is 64.2%.
- **One pass per case.** No self-consistency repeat of the reviewer was run. The official judge's 12-case repeat agreed on 94% of dimension scores with 0 outcome flips.
- **Orchestrator was not blind.** The orchestrating agent (Claude Code) had seen the official results in earlier work. It did not score cases; all scores come from isolated reviewer calls. The audit commentary in `targeted_issue_audit.md` is the orchestrator's interpretation and is labelled as such.
- **Synthetic transcripts only.** Nothing here measures learning.
