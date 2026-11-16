# ENARA language tutor: learning-outcome pilot protocol (draft for the owner)

**Status:**
- **This is a draft protocol and has not been run.**
- It needs schools, qualified teachers, learners, consent and time. None of these can be produced by engineering.

**Owner decisions required:** marked **[DECIDE]**.

## 1. Question

Do learners who use the ENARA tutor alongside normal lessons improve more, on the taught grammar targets, than comparable learners who receive the same lessons without it?

**Primary outcome.** Gain on a target-form test from pre to post.
The targets are:
- he/she and family words (A1);
- present simple third-person -s/-es with adverbs of frequency (A2);
- past simple vs present perfect (B1).

**Secondary outcomes:**
- **Delayed retention:** 3–4 weeks after the post-test.
- **Transfer:** use of the target in free writing, scored blind by teachers.
- **Learner attitude:** a short survey.
- **Teacher workload:** minutes per week.

**Not claimed.** General proficiency, CEFR level change, or effects on other subjects.

## 2. Design

| Element | Plan |
|---|---|
| Design | Randomised by **class** (cluster). Classes in the same school and grade are paired, and within each pair one class is allocated to tutor + lessons and the other to lessons only (business as usual). |
| Size **[DECIDE]** | Minimum 8 classes (4 + 4), about 120–200 learners, for a first signal. A confirmatory study needs a power analysis once the pilot gives the variance and intra-class correlation (ICC). |
| Duration | Pre-test → 4 weeks of use (2–3 sessions of 15 minutes per week, set by the teacher) → post-test → retention test 3–4 weeks later |
| Fidelity | Same lessons, same teacher time. Tutor use is logged per learner: sessions, turns, items attempted. The control classes receive the tutor after the study (wait-list), so no one is permanently disadvantaged. |
| Bands | Child, teen and adult cohorts are analysed separately; adults may be a separate pilot |

## 3. Instruments

| Instrument | Construction | Quality control |
|---|---|---|
| Target-form test (pre / post / retention) | 20 items per target, with 3 parallel forms, written by teachers who did **not** write the tutor exercises. **No item may appear in the tutor's lesson items.** | Pilot on a non-study class; check difficulty and reliability (Cronbach's α ≥ 0.7) |
| Free-writing task | Short prompt per target; scored by 2 blind teachers on an analytic scale | Inter-rater weighted κ reported; disagreements adjudicated |
| Survey | 6–8 items (confidence, usefulness, enjoyment), plus one open question, in the learner's language | — |

## 4. Ethics, consent and data **[DECIDE]**

- **Approvals:**
  - school leadership approval;
  - **written parental consent** for minors and learner assent;
  - an ethics review if a university partner is involved.
- **Opting out** has no effect on grades.
- **Data:**
  - pseudonymous study IDs; the test scores and tutor logs are linked only by the study coordinator;
  - no audio is collected unless separately consented (see the pronunciation work, #4);
  - the retention period is fixed in advance.
- **Bias:** tutor logs are never used to grade learners during the study.

## 5. Analysis plan (fixed before data collection)

1. **Primary model:**
   - **Model:** post-test score ~ condition + pre-test score + (1 | class), a mixed model that accounts for clustering.
   - **Report:** effect size (Hedges' g) with a 95% confidence interval, the ICC, and the number of learners and classes per arm.
2. **Retention:** the same model on the delayed test.
3. **Dose–response (exploratory, not causal):** gain vs the number of tutor items attempted, within the tutor arm.
4. **Missing data:** report attrition per arm; primary analysis on all randomised learners with available post-tests; sensitivity analysis with multiple imputation.
5. **Pre-registration:** register the hypotheses, the primary outcome and the model before the pre-test (e.g. OSF).

## 6. Decision rules

- **Pilot "promising":** a positive effect with a CI excluding 0 on the primary outcome, **or** a positive point estimate plus acceptable fidelity, which justifies a powered study.
- **No claim of efficacy** from the pilot alone. Publish null or negative results internally with the same care as positive ones.

## 7. Prerequisites before starting

- [ ] Educator review of the tutor completed (`artifacts/human_review/r42/final/`) and the rubric decisions recorded
- [ ] The open product items fixed for real learners: POST-14, POST-07 and POST-15 are done in r4.3; confirm on staging
- [ ] Test items written and piloted
- [ ] Consent forms and data agreement approved
- [ ] Partner schools and classes confirmed **[DECIDE]**
- [ ] Budget for teacher scoring time and tutor usage **[DECIDE]**

## 8. What engineering will provide

- Per-learner usage logs (exist today: tutor sessions, turns, items, verdicts) and an export with pseudonymous IDs.
- A teacher view of each learner's attempts (exists in part).
- The pre/post tests can be delivered through ENARA's assessment module; the items are written and owned by teachers.
