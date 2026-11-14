# B5: Teen cohort diagnostic

**Inputs:**
- the sealed independent review scores and tags;
- the official outcomes;
- engine metadata;
- the 40-case teen register audit (`targeted_issue_audit.md` §B: 39/40 APPROPRIATE).

Cohorts are 40 cases each: 14 A1, 13 A2 and 13 B1, with the same situation types.

## 1. Outcomes

| Cohort | Independent MEETS | Official MEETS | Exercise-first cases: independent MEETS | All other cases: independent MEETS |
|---|---:|---:|---:|---:|
| Child | 25/40 | 27/40 | 8/18 | **17/22** |
| **Teen** | **24/40** | 32/40 | **7/18** | **17/22** |
| Adult | 26/40 | 31/40 | 10/18 | 16/22 |

| Cohort | A1 | A2 | B1 |
|---|---:|---:|---:|
| Child | 9/14 | 7/13 | 9/13 |
| Teen | 8/14 | 8/13 | 8/13 |
| Adult | 10/14 | 8/13 | 8/13 |

**What the outcomes show:**
- **Outside the exercise-first fixture, teen and child results are identical** (17/22). Adults are one case lower (16/22).
- **The overall teen gap** (24 vs 25 child vs 26 adult) is **1–2 cases**, all inside exercise-first cases (7/18 vs 8/18 vs 10/18). With n = 18 per cell this is **not distinguishable from noise**.
- **CEFR is flat for teens** (8/8/8). No CEFR subgroup is singled out.
- **The official 32 → independent 24 drop** is the largest of the three cohorts (−8, against child −2 and adult −5). It reflects evaluator disagreement, not teen-specific output: 14 of the 40 teen cases are disputed.

## 2. What keeps teen cases below MEETS (independent, 16 non-MEETS cases)

| Dimension scored ≤ 2 | Teen | Child | Adult |
|---|---:|---:|---:|
| Formative check | 9 | 9 | 4 |
| Pedagogical appropriateness | 7 | 4 | 1 |
| Scaffolding | 6 | 6 | 2 |
| Lesson alignment | 5 | 4 | 5 |
| Learner-context fidelity | 5 | 4 | 4 |
| Clarity | 2 | 1 | 0 |
| **Age & proficiency fit** | **0** | 0 | 1 |

| Tag among non-MEETS | Teen | Child | Adult |
|---|---:|---:|---:|
| over_helping | 6 | 7 | 4 |
| ignored_learner_reply | 4 | 4 | 0 |
| factual_error | 3 | 3 | 6 |
| no_formative_check | 2 | 0 | 1 |
| lesson_drift | 2 | 1 | 1 |
| age_tone_mismatch | 1 | 0 | 0 |

**Teen dimension means (independent):**

| Dimension | Teen | Child | Adult |
|---|---:|---:|---:|
| Context | 2.88 | 2.90 | 2.90 |
| Lesson | 2.90 | 2.95 | 2.88 |
| **Pedagogy** | **2.85** | 2.98 | 3.02 |
| Scaffolding | 2.67 | 2.67 | 2.90 |
| **Age/CEFR** | **3.08** | 3.12 | 3.02 |
| Formative | 2.77 | 2.77 | 2.90 |
| Clarity | 3.12 | 3.17 | 3.10 |

## 3. Diagnosis

1. **Age adaptation is not the problem** (HIGH confidence):
   - No teen non-MEETS case has age/proficiency fit ≤ 2.
   - Teen age-fit averages 3.08.
   - The register audit rates 39/40 teen cases appropriate. The one exception (TA1-T07) is a single "childish" phrasing.
   - The median reply length of 78 words sits inside the teen A2 target band (80, max 120) and below the B1 band.
2. **Teens and children share the same scaffolding and formative-check defects** (HIGH):
   - scaffolding ≤ 2 in 6 non-MEETS cases each;
   - formative check ≤ 2 in 9 each;
   - over-helping in 6 vs 7.
   These are the B1/B2 product defects (hint leakage, re-issued items), not age effects.
3. **The one teen-leaning signal is pedagogical appropriateness** (7 teen vs 4 child vs 1 adult ≤ 2):
   - The verified case list is TA1-T03, TA1-T04, TA2-T03, TA2-T08, TA2-T13, TB1-T01, TB1-T08.
   - **5 of the 7 are exercise-first fixture cases** (TA1-T03, TA1-T04, TA2-T03, TA2-T08, TB1-T08).
   - **2 are confirmed hint leaks** (TA2-T13, TA2-T08).
   - **TA2-T03 carries the mixed-signal praise** from the grammar audit.
   - **TB1-T01 was not traced to a verified cause.**
   - **So this signal is mainly the fixture and the shared hint and progression defects, not a separate teen defect.**
   - **Unconfirmed hypothesis:** the teen register line "up to two steps at a time" (`AGE_REGISTER.teen`) may encourage two-step hints (rule plus application). Teen cases hold 7 of the 16 confirmed leak and near-reveal instances (child 6, adult 3), and the two-step pattern appears in TA2-T05, TA2-T07 and TA2-T13. But child A2 shows the same leaks (CA2-T05), and n is too small to attribute it.
4. **ignored_learner_reply (4 teen):** TA1-T04 and TA2-T08 are B1 fixture-mismatch cases. TA1-T04 is not supported on inspection. TA2-T08 is the progression defect.

**Teen-specific defects confirmed: none.**
- **Recommendation:** do not redesign the teen age adaptation.
- Fix the shared defects (B1 progression, B2 hint ladder, formative-check definition).
- Re-measure teen outcomes with repeated runs before attributing any residual gap to age.
- Keep the teen "two steps" register line under observation: if the hint ladder is implemented and teen pedagogy scores still lag, test that line in isolation.
