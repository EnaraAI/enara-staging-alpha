# Phase 1 AI-review decision

## Final status

**`AI_REVIEW_FINDS_MATERIAL_SCORING_DISAGREEMENT`**

The independent review does not reproduce the official 90/120:
- **Independent result:** 75/120 (62.5%) under the frozen rule.
- **After adjudication:** 70–77/120.
- **No critical quality issues were found**, so `AI_REVIEW_FINDS_CRITICAL_QUALITY_ISSUES` does not apply.
- **The review is complete:** 120/120 cases and all audits, so `INCOMPLETE_REVIEW` does not apply.

## Answers to the 12 questions

1. **Does the independent AI review broadly support the official 90/120?**
   **Partly.** It agrees on the quality profile: dimension means within ±0.18 and no critical failures. It does not support the count: 75 vs 90, with 25 official MEETS scored PARTIAL. 62 of the 90 official MEETS sit exactly on the 3.00 threshold.
2. **Independent MEETS percentage:** **62.5%** (75/120). Holistic verdicts give 65.8%; after adjudication, 58.3%–64.2%.
3. **Is the 70% target (84/120) met under independent scoring?** **No.** It is missed by 9 cases, and by 7–14 cases after adjudication.
4. **Is Option B provenance correctly implemented in this run?** **Yes.** Runtime metadata on all 219 turns shows the expected band, source and known status: child/class_age_band 73, teen/class_age_band 73, adult/school_setting_adult_learners 73.
5. **Are the child, teen and adult results acceptable?**
   Independent MEETS: child 25/40, teen 24/40, adult 26/40. **None reaches 70% independently.** Age fit is good in all three (3.02–3.12). The teen gap is scaffolding (over-helping), not register.
6. **Are factual issues material?** **No, not in aggregate.** About 6 genuinely wrong or misleading rule statements across 219 turns, none critical. They should be fixed because they sit on the exact grammar point being taught, e.g. "go" given as a -ch verb, or the negative grouped under "+ -s".
7. **Are ignored learner replies a significant problem?**
   **Not as a general problem:** 9 of the 11 official flags are not supported.
   **Yes as a narrow one:** in 2 T08 cases (major) and in several cases the blind reviewer flagged as major, the tutor fails to accept a correct answer that matches a lesson item rather than its own prompt, then repeats the task.
8. **Is verbosity harming the interaction?** **No.** 18/22 flags are mild excess and 4 acceptable length; none reduces participation. This is low priority.
9. **Is lesson alignment reliable?** **Mostly.** Independent mean 2.91 against the official 3.08. The deductions come from small drifts and imprecise rule statements, not off-topic teaching. Only 4 lesson_drift tags were raised independently.
10. **Are formative checks meaningful?** **Weakly.** Independent mean 2.82. Checks exist in almost every reply, but often as copy-with-one-blank prompts or checks that do not test the full objective. The rubric does not define a minimum, which the reviewer flagged as an ambiguity.
11. **Can Phase 1 be considered technically complete?**
    **Technically, yes:**
    - Option B is implemented and verified.
    - Deterministic checks pass, apart from the 3 known mastery-regex false positives.
    - No privacy leaks, no critical failures.
    **On quality, no:** the 70% pedagogical-quality target is not independently confirmed. Phase 1 should not be declared complete on quality until the scoring disagreement is resolved by qualified human review of the 35 disputed cases, or a remediation re-run clears the target under both evaluators.
12. **What must be fixed before the next evaluation?**
    1. **Success handling:** accept a correct learner answer that matches a lesson item even when it differs from the tutor's own prompt, then advance (T04/T08 pattern; CA1-T04, TA1-T04, CA2-T08, TA2-T08, CB1-T08).
    2. **Hint strength:** hints must not contain the target form or a frame that already holds the answer (TA2-T13, AB1-T13, CA1-T04, teen TA2 cases).
    3. **Rule precision:** state grammar rules exactly. The examples must match the rule, and negatives and auxiliaries must be correct. Never misquote the learner.
    4. **No invented context:** do not present unsupplied learner details (AA2-T11, CB1-T08, TB1-T13).
    5. **Evaluation reliability:**
       - Human educator adjudication of the 35 disputed cases.
       - Rubric v2 anchors for hint strength and minimum formative checks.
       - Report the count of cases at mean exactly 3.00 alongside the headline.
       - Use two evaluators with a disagreement queue as standard practice.
    6. *(Low priority)* Trim repeated rule restatements in adult replies.

## Critical risks

- **Headline fragility.** The official 75% depends on 62 boundary cases; a stricter but reasonable evaluator gets 62.5%.
- **Over-helping** is the most frequent independent finding (33 tags) and undermines learner autonomy.
- **AI-only evaluation.** All evaluators are from one provider; no human educator has validated any score.

## Decision principles observed

- The 70% threshold is an engineering benchmark target, not evidence of educational efficacy.
- No claim is made that students learn more.
- No claim is made about release readiness.
- Regressions are reported per case, not hidden behind the aggregate.
