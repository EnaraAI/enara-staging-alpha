# Gate D: evaluator and rubric readiness

**Result: PARTIAL.**
- **Rubric v2 is structurally close to ready**, with three structural defects.
- **The educator pack lacks blinding and an independence declaration.**
- **No evaluator is wired to the v2 evidence views.**
- **Educator approval: none exists.** No educator agreement was calculated, because no educator data exists.

## 1. Structural audit of `rubric_v2_draft.md` / `.json`

| Check | Result |
|---|---|
| 11 dimensions present | ✔ D1–D11 in markdown; 11 in JSON |
| Each dimension has 0–4 anchors | ✔ All 11 have rows 0, 1, 2, 3 and 4 (parsed) |
| Anchors are observable | Mostly ✔ (each cites behaviour, many with transcript quotes). D7-3 "a level that fits the attempts" and D4-4 "precisely pitched" are judgement-heavy. |
| A critical defect cannot be offset | ✔ "A critical defect cannot be offset by other scores" (§2 outcome rule) |
| Core dimensions need a minimum | ✔ D1, D5, D7, D10 ≥ 3 for MEETS; same 4 flagged `core:true` in JSON |
| INVALID / DOES_NOT_MEET / MEETS / PARTIAL / UNCERTAIN used consistently | ✔ In §2 and the JSON `outcomeRule` |
| Mean-3.00 boundary reported | ✔ Reporting rule; UNCERTAIN for 3.00 ± 0.15 disagreements |
| Missing evidence does not silently become a zero or a pass | **✘ Contradiction (POST-16).** Global rule 3 says "mark `insufficient_evidence` and give no score" **and** "it may be scored 3 with the flag set". A non-core dimension with no evidence can count as 3 toward MEETS. |
| Correctness vs pedagogy separated | ✔ D5 / D10 (correctness) vs D6 / D7 / D9 (pedagogy) |
| No learning gains inferred | ✔ Global rule 7 |
| Machine-readable rubric usable by a judge | **✘ The JSON lacks the anchor text** (`"anchorsIn": "rubric_v2_draft.md"`). A v2 judge cannot load the rubric from JSON alone (POST-17). |

## 2. Boundary and contradiction analysis

| Issue | Where | Severity |
|---|---|---|
| Re-testing a demonstrated component is penalised twice | D5-2 and D11-1 | P3 (double counting; POST-18) |
| Independent performance and formative check overlap | D8-3 ("unaided item after help") and D9-3 ("unaided check") | P3 (POST-18) |
| Rewarding verbosity | Not found. D4-2 penalises overload; no anchor rewards length. | — |
| Rewarding answer reveals | Not found. D7 penalises it; L6 is explicitly allowed only after repeated failure or a request after an attempt. | — |
| Penalising appropriate scaffolding | D6-4 rewards visible escalation, but D7-2 penalises a strong first cue on binary items. These are consistent, and the boundary needs educator calibration (Q5 in the pack). | Informational |
| Formative check confused with mastery | Not found. D8-0/1 forbid mastery claims. | — |
| Not applicable to some age/CEFR combinations | D9-4 "transfer task" may be inappropriate for child A1. The pack asks Q1 about frame support but **no rule adapts D9-4 by CEFR**. | P3 (inside POST-18) |

**Synthetic logic test (illustrative, not educator data).** A case scoring D1=3, D2=3, D3=4, D4=4, D5=3, D6=4, D7=3, D8=4, D9=4, D10=3, D11=4 with one **major** tag:
- v2 gives **PARTIAL** (no major tags allowed for MEETS);
- v1 would give MEETS.

This is the intended stricter behaviour. A case whose D9 is `insufficient_evidence` but scored 3 under rule 3 could reach MEETS on missing evidence (POST-16).

## 3. Educator review pack readiness (`educator_review_pack.md`)

| Element | Present? |
|---|---|
| Positive, negative and borderline examples | ✔ (P1–P3, N1–N3, B1–B3) |
| Hint and formative-check calibration | ✔ (H1, H2, F1, F2) |
| Independent judgement questions | ✔ (Q1–Q10) |
| Adjudication template | ✔ |
| Reviewer instructions | ✔ ("score before reading the draft position") |
| **Blinding instructions** | **✘** The draft rubric's own score ("Draft rubric says…") is printed directly below each example, so reviewers are anchored. There is no instruction to hide official or AI scores. |
| **Conflict-of-interest / independence statement** | **✘** |
| No access to official model scores | ✘ Not stated |

These gaps are POST-19 (P2).

### Proposed qualified educator review protocol (not executed)

1. **Reviewers:** two qualified EFL educators, independent of ENARA product development. Each signs an independence and conflict-of-interest declaration.
2. **Sample:**
   - stratified, at least 36 conversations (child / teen / adult × A1 / A2 / B1 × 4);
   - **every** borderline example;
   - **all 35** v1.0 evaluator-disagreement cases.
3. **Blind materials:** a version of the pack **without** "Draft rubric says…" lines, official judge scores, AI-review scores or regression labels. Case order is randomised per reviewer.
4. **Independent scoring:** each reviewer scores D1–D11 plus the outcome independently, with no discussion, before unblinding.
5. **Agreement analysis:** per-dimension weighted κ, outcome κ, and the boundary-case rate. **Thresholds are set before seeing the data.**
6. **Adjudication:** disagreements resolved in writing; anchor edits recorded with their rationale.
7. **Freezing:** freeze `ltb-rubric-v2` with a SHA-256. Only then may it be used for a v2 benchmark.

## 4. Historical score interpretation (preserved)

| Measurement | Value | Status |
|---|---|---|
| Official historical result (v1.0, rubric v1, Sonnet judge) | 90/120 MEETS | **Historical and provisional.** Fixture defect: 54 cases. Evaluators saw information the tutor lacked. |
| Independent AI review (Haiku, blind) | 75/120 | Historical and provisional |
| Adjudication range | 70–77 | Preliminary (same-model adjudicator) |
| Agreement / Cohen's κ | 70.8% / 0.33 | — |
| Official MEETS at a mean of exactly 3.00 | 62/90 | Boundary fragility |

**None of these is a validated pedagogical success rate.**

## 5. Gate D decision

**PARTIAL.**
- **Structure:** mostly ready.
- **Open defects:** POST-16 (insufficient-evidence contradiction, P2), POST-17 (JSON not judge-ready, P2), POST-18 (overlaps, P3), POST-19 (pack blinding and independence, P2).
- **Evaluator wiring is missing** (POST-13).
- **Educator approval:** pending; none claimed.
