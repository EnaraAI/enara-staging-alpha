# `ltb-rubric-v2`: DRAFT for educator validation

| | |
|---|---|
| **Status** | Draft. **Not validated.** It may not be described as academically validated until qualified language educators review and approve it (see `educator_review_pack.md`). |
| **Relationship to v1** | `ltb-rubric-v1` and `ltb-scoring-v1` are frozen and unchanged. v2 is not applied retroactively to any historical result. Machine-readable form: `rubric_v2_draft.json`. |
| **Inputs** | `rubric_v2_specification.md` (diagnostic), the 98 ambiguity notes, the 35 evaluator disagreements, and the diagnostic findings B1–B6. |
| **Design rule** | Every anchor names **observable** behaviour in the transcript. Thresholds were fixed from the diagnostic before any v2 scoring and are **not** tuned to a MEETS rate. Several rules are stricter than v1: core-dimension floors, no major tags, and leakage. |

## 0. Global rules

1. **Evidence parity.** Evaluators see only what the tutor received (fixture v2 `evaluatorView`) plus the case's evaluation guidance. A case that fails the parity validator is **INVALID**, reported separately and never scored as a tutor failure.
2. **Quote or don't score low.** Every score below 3 and every failure tag cites a verbatim tutor or learner quote with its turn number.
3. **Insufficient evidence.** If the transcript cannot show a dimension, mark it `insufficient_evidence` and give no score. If nothing negative is observable it may be scored 3 with the flag set; it is never scored 4.
4. **Single-turn cases.** Dimensions that need a learner reply (scaffolding, progression, independent performance) are `n/a`.
5. **Severity.**
   - **critical:** teaches a form or rule that makes the learner's target sentence wrong; privacy or safety breach; content unsuitable for the age band.
   - **major:** defeats the turn's purpose. Examples: the answer is revealed before any attempt; a correct answer is rejected or re-tested; something is attributed to the learner that they did not write; a false statement about the lesson target.
   - **minor:** a flaw that does not defeat the purpose.
6. **Designed behaviour.** Where the tutor follows an explicit product policy (e.g. English sentence frames when redirecting an off-topic request), score the execution, not the policy.
7. **Score what is visible.** Do not infer intention, learning gains or mastery.

## 1. Dimensions and anchors (0–4)

Each anchor gives the observable behaviour; "e.g." lines are drawn from the v1.0 transcripts.

### D1 Context grounding (`context_grounding`)
Uses only supplied facts (lesson, trusted age band, CEFR estimate, prior evidence) and what the learner wrote. Keeps course content, learner text and the tutor's own examples apart.

| Score | Anchor |
|---|---|
| 0 | Invents learner history, results or level, or contradicts supplied facts. |
| 1 | Attributes an answer or knowledge the learner did not show **and** builds the next step on it. |
| 2 | One unsupported assumption or misquote that does not drive the next step. e.g. "The words "go to bed late" are a good start", when the learner wrote "she went to bed late" (CA2-T03); "you probably already know…" with no evidence (TB1-T13). |
| 3 | Uses supplied context correctly; quotes the learner exactly; invents nothing. |
| 4 | As 3, and visibly adapts to this learner's exact evidence (their error, their topic) while labelling its own examples as examples. |

### D2 Task alignment (`task_alignment`)
Works on the lesson objective and the active item. Uses lesson items when they exist.

| Score | Anchor |
|---|---|
| 0 | Unrelated to the lesson, or does the off-topic task. |
| 1 | Mostly off-objective, or replaces a delivered lesson item with unrelated content. |
| 2 | On objective but drifts (e.g. introduces a second grammar point as if it were the target). |
| 3 | On objective. A correct common word outside the list (e.g. "often") is not drift. |
| 4 | Tightly aligned: uses the lesson's own items and patterns, and moves through them in order. |

### D3 Age appropriateness (`age_fit`)
Tone, topics and assumed autonomy for the **trusted age band only**. Length is not scored here.

| Score | Anchor |
|---|---|
| 0 | Content unsuitable for the band (critical). |
| 1 | Register mostly wrong (e.g. baby talk to adults). |
| 2 | One clear register slip (e.g. a childish phrasing for a teen, TA1-T07). |
| 3 | Fits the band. |
| 4 | Examples and tone chosen for the band with evident care. |

### D4 Proficiency appropriateness (`cefr_fit`)
Vocabulary, structures, explanation depth and length for the CEFR estimate. Judged against the case word limit and its **effect on comprehension**. Never inferred from age.

| Score | Anchor |
|---|---|
| 0 | Far above level; unusable. |
| 1 | Mostly above or below level. |
| 2 | Several unglossed above-level terms, or length that clearly overloads (two tasks, repeated rule). |
| 3 | Comprehensible at the level. |
| 4 | Precisely pitched: one step, new items glossed. |

### D5 Answer sufficiency judgement (`answer_judgement`)
Did the tutor classify the learner's answer correctly? The classes are: correct; equivalent wording; correct but for a different item; correct but unrelated; partially correct; incorrect; ambiguous.

| Score | Anchor |
|---|---|
| 0 | Confirms a wrong answer as correct on the lesson target (critical). |
| 1 | Rejects or re-tests a correct answer, or treats an unrelated correct sentence as evidence for the objective. |
| 2 | Recognises correctness but mis-handles the class (e.g. re-issues the same item for a component already shown, CA2-T08 t2–t3). |
| 3 | Classifies correctly; credits what is shown; asks only about the undemonstrated part. |
| 4 | As 3, with the reason made visible to the learner in one line. |

### D6 Scaffolding quality (`scaffolding`)
Support level matches the evidence. Escalates one step after a repeated error and fades after success.

| Score | Anchor |
|---|---|
| 0 | Ignores the learner's reply. |
| 1 | Leaves a stuck learner without a next step, or jumps straight to a full explanation on a first error. |
| 2 | Uses the reply, but support is mis-levelled (the same intensity regardless of evidence). |
| 3 | Adapts to the reply; the learner keeps doing the tested step. |
| 4 | Visible contingent escalation or fading, justified by the reply (e.g. AA1-T07 t4 after a repeated error). |

### D7 Hint leakage (`hint_leakage`, higher = better)
After the hint, does the learner still have to perform the tested step? Hint ladder levels L1–L6 are defined in the diagnostic (`hint_scaffolding_analysis.md` §3).

| Score | Anchor |
|---|---|
| 0 | Gives the full answer with no attempt and no request (major). |
| 1 | Names the tested form before any attempt. e.g. "*have* → **has**" (TA2-T13 t2); "Its past simple is *went*, and its past participle is *gone*" (AB1-T13 t2). (major) |
| 2 | Near-reveal too early: on a binary or single-ending item, the first hint resolves the choice (e.g. "A brother is a boy, so use He", TA1-T13 t2), or a model of the same answer sits next to the item (CA1-T06 t3). |
| 3 | Hint at a level that fits the attempts so far; the tested step stays with the learner. |
| 4 | As 3, and the first hint is an attention or conceptual cue that the learner can act on. |
| — | A full explanation after repeated failure, or when the learner asks having tried, is **not** leakage (L6): score 3–4. |

### D8 Independent learner performance (`independence`)
Separates assisted from unassisted evidence.

| Score | Anchor |
|---|---|
| 0 | Claims mastery or progress without evidence (critical if it uses invented figures). |
| 1 | Treats a hinted success as independent, or one correct answer as mastery. |
| 2 | Moves on after a helped success without any unaided check. |
| 3 | After a helped success, gives an unaided item on the same point; after an unaided success, moves forward. |
| 4 | As 3, and states accurately what the learner has shown so far, without claiming mastery. |

### D9 Formative checking (`formative_check`)
A check that the learner must answer **unaided** and that tests the objective's component.

| Score | Anchor |
|---|---|
| 0 | Invented progress or mastery claims. |
| 1 | No check where one was clearly needed. |
| 2 | A check exists but can be answered by copying (e.g. "This is my mother. ___" directly under "This is my grandmother. She is…", CA1-T06 t3), or tests a different component. "Does that make sense?" alone also scores 2. |
| 3 | An unaided check on the tested component. |
| 4 | A transfer or why-check matched to the success criteria (e.g. "write two sentences about yourself: something you have never done…", CB1-T08 t3). |
| n/a | A check is not due (clarification turn, redirect), recorded as `check_not_due`. |

### D10 Grammar accuracy (`grammar_accuracy`)
Rules, examples and claims about English are true and agree with each other.

| Score | Anchor |
|---|---|
| 0 | Teaches a rule or form that makes the learner's target sentence wrong (critical). |
| 1 | A false statement about the lesson target that could mislead (major). e.g. "verbs ending in -ch add -es, like go → goes" (CA2-T07 t4). |
| 2 | A misleading statement about an example or a side point. e.g. "Only one word changes" for a pair where two words change (AA1-T06 t3); a negative listed under the affirmative "+ -s" rule (AA2-T11 t1). |
| 3 | Correct; simplifications are appropriate to the level ("always = every time" at A2). |
| 4 | As 3, with an example that exactly instantiates the rule and a cautious "usually" where needed. |

### D11 Learning progression (`progression`)
Moves through the objective using evidence. Never repeats a demonstrated component; never skips an undemonstrated one.

| Score | Anchor |
|---|---|
| 0 | Blocks progress (keeps the learner on a finished task) **and** misjudges the evidence. |
| 1 | Presents the same item three or more times after the component was shown (CA2-T08, TA2-T08). |
| 2 | Progresses, but re-teaches basics already shown, or skips an undemonstrated criterion. |
| 3 | Progresses on evidence: next item or transfer after success; retry on the same gap after failure. |
| 4 | As 3, and the next task targets the criterion not yet shown. |

## 2. Outcome rule (to be frozen before any v2 run)

**Core dimensions:** D1 context grounding, D5 answer judgement, D7 hint leakage, D10 grammar accuracy.

| Outcome | Rule |
|---|---|
| **INVALID** (excluded, reported) | The case fails the information-parity validator, or the runtime-parity record shows the tutor did not receive the item the learner answered. |
| **DOES_NOT_MEET** | Any critical defect, **or** any dimension scored 0. A critical defect cannot be offset by other scores. |
| **MEETS** | All applicable deterministic checks pass; no critical **and no major** tag; every scored dimension ≥ 2; every **core** dimension ≥ 3; mean of scored dimensions ≥ 3.0. |
| **PARTIAL** | Otherwise. |
| **UNCERTAIN** (human adjudication) | A core dimension is `insufficient_evidence`, or two evaluators disagree on the outcome for a case whose mean lies within 3.00 ± 0.15. |

**Missing context:** if the lesson context was genuinely missing (a no-lesson case) and the tutor asked one clarifying question or labelled general practice, D1, D2 and D11 are scored on that handling. Never penalise the tutor for content it did not receive.

**Ambiguous learner responses:** the tutor is scored on handling them, by D5 (a clarifying question or an explicit assumption is correct) and D11 (no progression on ambiguity).

**Evaluator uncertainty:** per-dimension `confidence: low` from either evaluator moves the case to human adjudication when it would change the outcome.

**Reporting:** always report alongside the headline:
- the INVALID and UNCERTAIN counts;
- the number of cases at mean exactly 3.00;
- per-cohort and per-CEFR counts;
- evaluator agreement (κ).

## 3. Mapping from v1

| v1 dimension | v2 |
|---|---|
| learner_context_fidelity | D1 |
| lesson_alignment | D2 + D10 |
| pedagogical_appropriateness | D5 + D7 |
| scaffolding_adaptation | D6 + D11 |
| age_proficiency_fit | D3 + D4 |
| formative_check_evidence | D8 + D9 |
| clarity_accessibility | Folded into D4 (length and overload) and D6; clarity problems that block action score D4 ≤ 2 |

**v2 scores are not comparable to v1 headlines.** Any comparison must re-score both runs with v2.
