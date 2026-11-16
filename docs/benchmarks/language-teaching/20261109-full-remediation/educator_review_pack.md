# Educator review pack: `ltb-rubric-v2` draft

| | |
|---|---|
| **For** | Qualified teachers of English as a foreign language (ideally including child, teen and adult teaching experience, A1–B1). |
| **Purpose** | Decide whether the draft rubric (`rubric_v2_draft.md`) measures teaching quality in a way you would recognise and agree with. Until this review is done and recorded, rubric v2 is a **draft** and must not be described as validated. |
| **Material** | All conversations are **synthetic**: an AI tutor talking to scripted learners, recorded in the ENARA benchmark of 9 November 2026 (v1.0 transcripts). No real students are involved. Quotes are verbatim; case ids let you find the full transcript in `docs/benchmarks/language-teaching/20261109T1211-ltb-v1.0-ageband/official/raw_results.jsonl`. |
| **Time** | About 90 minutes for sections 1–4; section 5 is a per-case form. |

## How to use this pack

For each example:
1. Read it.
2. Score the named dimension yourself (0–4), **before** reading "Draft rubric says".
3. Record your score and any disagreement in the adjudication record (§5).

Disagreeing with the draft is useful: the rubric changes in response to you, not the other way round.

## 1. Positive examples (expected to score 3–4)

**P1: Moving forward after consistent success** (LTB-CA1-T08, child A1, turn 3; dimensions D8 independence, D11 progression)
> Learner: "This is my grandmother. She is very kind. This is my father. He is tall."
> Tutor: "Correct! ✅ … **Next task:** Write about **two** people in your family. Use your own facts. This is my ______. He/She is ______."

Draft rubric says: D11 = 3 (progresses on evidence). D8 = 3–4. The frame still offers support, which an educator may see as appropriate at A1 or as insufficient fading. **Question Q1** below.

**P2: Transfer task as a formative check** (LTB-CB1-T08, child B1, turn 3; D9)
> Tutor: "Next, with no gaps this time, write two sentences about yourself: 1. Something you have **never** done. 2. A place you **have been to**, and **when** you went."

Draft rubric says: D9 = 4 (transfer task matched to both success criteria). The same turn also says "This also answers our dolphin exercise: *seen*, then *saw*", but the learner never filled those gaps. That makes D1 context grounding = 1–2 (attribution). **Question Q2**: should one attribution error cap the whole case at PARTIAL?

**P3: Escalating support after a repeated error** (LTB-AA1-T07, adult A1, turn 4; D6)
> Tutor: "A grandmother is a woman. Which word do we use for a woman, **he** or **she**? A quick tip: **mother, sister, grandmother** are women…"

Draft rubric says: D6 = 3–4 (visible escalation after the repeat). D7 = 3, because escalation after a repeated error is not leakage.

## 2. Negative examples (expected to score 0–2)

**N1: Hint that names the answer before any attempt** (LTB-TA2-T13, teen A2, turn 2; D7)
> Learner: "just tell me the answer pls"
> Tutor: "**Hint:** Look at sentence 1. **Sara** = **she**. So the verb needs a change. *have* → **has** (this one is irregular!) … *Sara always ___ breakfast at 7:30.*"

Draft rubric says: D7 = 1, major (the tested form is given before any attempt).

**N2: Rule-example contradiction** (LTB-CA2-T07, child A2, turn 4; D10)
> Tutor: "Hint: verbs ending in **-ch** add **-es**, like **go → goes**."

Draft rubric says: D10 = 1, major. *Go* takes -es because it ends in -o; the -ch example would be *catch → catches*. **Question Q3**: is this major (it concerns the lesson target) or minor (the learner still writes *watches* correctly)?

**N3: Misquoting the learner** (LTB-CA2-T03, child A2, turn 2; D1)
> Learner: "Yesterday she go school and every day she went to bed late."
> Tutor: "The words **"she"** and **"go to bed late"** are a good start."

Draft rubric says: D1 = 2 (the quote is stitched together and credits the erroneous "go").

## 3. Borderline examples (where evaluators disagreed)

**B1: Correct answer, incomplete task** (LTB-CA1-T04, child A1, turn 2; D5, D7)
> The tutor's own exercise was "This is my ______. ___ is ______."
> Learner: "he is twelve"
> Tutor: "**"he is twelve"** uses **He** and a number correctly. Start it with a capital… The first part is missing… Try again with this frame: This is my ______. He is twelve."

The official judge and the independent reviewer disagreed. The learner's answer was correct for the *case's* exercise ("This is my brother. ___ is twelve."), **which the tutor never received**; fixture v2 fixes this.

Draft rubric says: score against the task the tutor actually set. D5 = 3 (correct part credited; missing part asked for once). D7 = 3: the frame reuses only the learner's own words, so this is not leakage.

**Question Q4:** do you agree that re-using the learner's own words in a frame is not answer leakage?

**B2: Binary choice resolved by the first hint** (LTB-AA1-T13, adult A1, turn 2; D7)
> Tutor: "Is it a man? Use **He**. Is it a woman? Use **She**. … This is my **mother**. ___ is a nurse. Is a mother a man or a woman?"

Draft rubric says: D7 = 2 (near-reveal at the first rung on a binary item).

**Question Q5:** at A1, is reminding the learner of the he/she rule before an attempt an acceptable first hint, or does it remove the thinking the item tests?

**B3: Self-correction** (LTB-AA2-T04, adult A2, turn 2; D5, D1)
> Learner: "She go to bed at ten o clock — sorry, She goes to bed at ten"
> Tutor: "Your corrected sentence is right… You fixed the key point yourself."

One evaluator tagged this as context invention; on inspection the self-correction is in the learner's own message.

Draft rubric says: D1 = 3, D5 = 3–4.

## 4. Hint quality and formative-check calibration

**Hint ladder** (rubric D7 and diagnostic `hint_scaffolding_analysis.md` §3), from least to most revealing:
1. attention cue;
2. conceptual cue;
3. partial structure;
4. targeted support;
5. worked example (different word);
6. direct explanation.

**H1:** "Hint: Is your sister a boy or a girl? Which word do we use for a girl, **he** or **she**?" (LTB-CA1-T12, child A1, turn 1). Which level is this? Is it acceptable as a *first* response to "This is my sister. He is ten."?

**H2:** For a single-ending item (*She go* → *goes*), write the hint you would give at L1, L2 and L4.

**F1:** Is "This is my mother. ___ is a nurse." directly below a pair ending "…grand**mother**. **She** is old." an unaided check (LTB-CA1-T06, turn 3)?

**F2:** What is the minimum you would accept as a formative check at A1 for children? A new gap item? A sentence of their own?

## 5. Questions that need educator judgement

| # | Question | Draft position |
|---|---|---|
| Q1 | How much frame support may remain in a "transfer" task at A1? | Allowed at A1; no frame expected at B1 |
| Q2 | Should one attribution error (D1 ≤ 2) block MEETS? | Yes if major (drives the next step); no if minor |
| Q3 | Is a wrong example for a correct rule major or minor? | Major when it concerns the lesson target |
| Q4 | Is re-using the learner's own words in a frame leakage? | No |
| Q5 | Is a he/she rule reminder before an attempt an acceptable first hint at A1? | Level 2 is acceptable; mapping the specific noun to the pronoun is not |
| Q6 | Should core dimensions (D1, D5, D7, D10) need ≥ 3 for MEETS? | Yes |
| Q7 | Should cases at mean 3.00 ± 0.15 with evaluator disagreement always go to a human? | Yes |
| Q8 | Are age fit (D3) and CEFR fit (D4) separable in practice for teens at A1? | Yes; please test on teen A1 cases |
| Q9 | Should a hinted success ever count as independent evidence? | No |
| Q10 | Is anything important for language teaching missing from D1–D11 (e.g. learner affect, error tolerance)? | Open |

## 6. Adjudication record template

Copy one block per case or example reviewed.

```
Reviewer (initials / role / years teaching EFL):
Date:
Case id / example id:
Cohort / CEFR:
Dimension scores (D1-D11; n/a allowed):  D1 _  D2 _  D3 _  D4 _  D5 _  D6 _  D7 _  D8 _  D9 _  D10 _  D11 _
Failure tags (category, severity critical|major|minor, turn, verbatim quote):
Outcome (MEETS / PARTIAL / DOES_NOT_MEET / INVALID / UNCERTAIN):
Agree with the draft rubric's position?  yes / no / partly
If no: what should the anchor say instead?
Confidence: low / medium / high
Questions answered (Q#: answer):
Signature / approval of anchors reviewed (yes/no):
```

**Approval rule (proposed):**
- Rubric v2 can be marked **validated** only when at least two qualified educators have reviewed every anchor area.
- Every disagreement must be resolved in writing and the resulting version frozen with a hash.
- Until then it remains `DRAFT`.
