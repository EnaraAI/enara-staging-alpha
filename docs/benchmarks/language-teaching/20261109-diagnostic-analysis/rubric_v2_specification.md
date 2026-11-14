# Proposed `ltb-rubric-v2` specification

**Status:** proposal only. `ltb-rubric-v1` is frozen and unchanged. v2 must not be applied retroactively to v1.0 results.

**Purpose:** improve consistency and interpretability. It is not designed to move the MEETS rate. Several v2 rules make scoring **stricter** (hint leakage, attribution), and several make it **more lenient** (valid off-item answers, designed redirects).

**Evidence base:**
- the 98 `RUBRIC_AMBIGUITY` notes on 95 cases in the independent review. Keyword clustering is approximate and multi-label: formative check ~39, hint vs leakage ~28, scaffolding evidence ~20, answer sufficiency ~17, clarity/verbosity ~9, simplification vs error ~7, age vs CEFR ~5, out-of-list vocabulary ~2, other ~22;
- the 35 outcome disagreements;
- the diagnostic findings B1–B5.

## 0. Global rules (new in v2)

1. **Evidence parity.** Evaluators score only against information the tutor received: lesson spec, learner context, conversation. Fixture data the tutor never saw (e.g. `lesson.exercise`) is hidden from evaluators, or the tutor must receive it too.
2. **Observable only.** Every score below 3 and every failure tag cites a verbatim tutor or learner quote with its turn. No inference about intent or real learning.
3. **Insufficient evidence.** If the transcript does not show enough to apply an anchor, score the dimension **3 by default only where nothing negative is observable**, and mark `insufficient_evidence: true`. For scaffolding on a single-turn case, use `n/a` as in v1. Never score 4 without positive evidence.
4. **Minor vs major vs critical** (applies to every tag):
   - **critical**: teaches a rule or form that would make the learner's target sentence wrong, or a privacy or safety breach.
   - **major**: defeats the turn's purpose. The answer is revealed before the learner attempts, the learner's correct work is rejected, the turn attributes to the learner something they did not do, or a factual misstatement concerns the lesson target.
   - **minor**: a flaw that does not defeat the turn's purpose: a non-target slip, a slightly strong cue at an appropriate ladder level, an extra unglossed word.
5. **Boundary reporting.** Report the count of cases whose mean is exactly 3.00 alongside the headline. When two evaluators disagree on MEETS/PARTIAL for a case at 3.00 ± 0.15, send it to human adjudication rather than to either evaluator.
6. **Designed-behaviour rule.** If the tutor follows an explicit product policy (e.g. offering English sentence frames when redirecting an off-topic task), score the execution, not the policy. The policy question goes to product owners.

## 1. Dimensions

Each dimension keeps its v1 id. Anchors 0–4 are below; examples are drawn from this run.

### 1.1 Learner-context fidelity (`learner_context_fidelity`)
**Definition:** uses the supplied learner facts (trusted age band, CEFR estimate, prior evidence, goal) and **attributes to the learner only what the learner wrote**.
- **Positive indicators:** treats CEFR as an estimate; refers to the learner's own words accurately; separates "you wrote" from "for example".
- **Negative indicators:** invents prior knowledge ("you probably already know …" with no evidence); claims the learner answered an item they did not (CB1-T08 t3); misquotes the learner (CA2-T03 t2).

| Score | Anchor | Example |
|---|---|---|
| 0 | Fabricates learner history or results, or contradicts supplied facts | "Your test showed you are B2" |
| 1 | Attributes an answer or knowledge the learner did not show, **and** builds the next step on it | Treats an un-attempted item as solved and moves on |
| 2 | One unsupported assumption or misquote that does not drive the next step | CA2-T03 t2 misquote "go to bed late"; TB1-T13 "you probably already know" |
| 3 | Uses the supplied context correctly; attributes nothing unsupported | Most cases |
| 4 | As 3, plus visibly adapts to this learner's specific evidence (their exact error, their topic) | Reuses the learner's own Aswan sentence to set the next contrast (CB1-T04 t2) |

**Borderline:** "You probably already know X" in an opening turn with no prior evidence scores 2 if the turn then assumes X, and 3 if it checks X.

### 1.2 Lesson alignment and factual grounding (`lesson_alignment`)
**Definition:** works on the lesson objective; English facts are correct; rules and their examples agree.
- **Positive indicators:** uses the lesson's own patterns; examples instantiate the stated rule.
- **Negative indicators:** an example contradicting its rule (CA2-T07 t4 "-ch … like go → goes"); a false claim about an example (AA1-T06 t3 "Only one word changes"); drifting to unrelated content.

| Score | Anchor | Example |
|---|---|---|
| 0 | A factual error about the lesson target that would make the learner's sentence wrong (critical) | "With she, don't add -s" |
| 1 | Largely off-objective, or a major misstatement about the target | Teaching past simple in a present-simple lesson as if it were the target |
| 2 | On objective but with one misleading rule or example statement about the target | CA2-T07 t4; AA2-T11 t1 "it doesn't work" under "+ -s" |
| 3 | On objective, facts correct; simplifications appropriate to the level | "always = every time" at A2 |
| 4 | As 3, and tightly uses the lesson's items and patterns, with own examples clearly marked as examples | — |

**Borderline:** one correct common word outside the lesson list (e.g. "often") is not drift and stays at 3. Introducing a second grammar point is drift (2).

### 1.3 Pedagogical appropriateness (`pedagogical_appropriateness`)
**Definition:** the move fits the situation and its execution does not defeat it.
- **Negative indicators:** an answer-revealing hint (see §2); reteaching a point already shown correctly; lecturing when a hint was needed.

| Score | Anchor | Example |
|---|---|---|
| 0 | Harmful move (scolding, misleading) | — |
| 1 | Wrong move, or a move that defeats itself: a **hint that reveals the tested form before any attempt** | TA2-T13 t2 "have → has"; AB1-T13 t2 "went … gone … been" |
| 2 | Right move, weak execution: near-reveal on a binary item at the first rung; re-issuing an item whose component was already shown | TA1-T13 t2 "A brother is a boy, so use He"; CA2-T08 t3 |
| 3 | Right move, well executed | Hint-first with a cue that leaves the tested step to the learner |
| 4 | Best-fit move, efficient, and the reason is visible | — |

### 1.4 Scaffolding and adaptation (`scaffolding_adaptation`)
**Definition:** responds to the learner's actual reply and adjusts support by evidence, keeping the tested step with the learner.

**Evidence required to score positively:**
- **3** needs at least one learner reply that the tutor visibly used (quoted it, or changed support because of it).
- **4** needs a visible change in support level justified by the learner's reply (escalation after a repeat error, or fading after a success).

| Score | Anchor | Example |
|---|---|---|
| 0 | Ignores the learner's reply | — |
| 1 | Gives the full answer when a hint was due; or leaves a stuck learner with no step; or **rejects a correct answer** | — |
| 2 | Uses the reply but support is mis-levelled (same intensity regardless of evidence; same item re-issued after success) | CA2-T08 t3, TA2-T08 t3 |
| 3 | Adapts to the reply; the learner keeps doing the tested step | — |
| 4 | Contingent support with visible escalation or fading | AA1-T07 t4 escalation after a repeated error |
| n/a | Single learner turn only | — |

**Borderline:** after a correct answer to a **different** item, re-asking only the undemonstrated component once is a 3. Re-asking the whole item for an already demonstrated component is a 2.

### 1.5 Age appropriateness (`age_fit`, **split from v1 `age_proficiency_fit`**)
**Definition:** tone, topics, examples and assumed autonomy fit the **trusted age band** only.
- **Negative indicators:** childish tone for teens or adults; adult topics for children. Length is **not** scored here.

| Score | Anchor | Example |
|---|---|---|
| 0 | Inappropriate content for the band | — |
| 1 | Mostly wrong register (baby talk to adults) | — |
| 2 | One clear register slip | TA1-T07 (one "childish" phrasing for a teen) |
| 3 | Fits the band | Most cases |
| 4 | Examples and tone chosen for the band with evident care | — |

### 1.6 Proficiency appropriateness (`cefr_fit`, **split from v1**)
**Definition:** vocabulary, structures, explanation depth and length fit the CEFR estimate. Length is judged against the case's own `wordLimitPerReply` and its **effect on comprehension**, not against a universal limit.

| Score | Anchor | Example |
|---|---|---|
| 0 | Far above level and unusable | — |
| 1 | Mostly above or below level | — |
| 2 | Several unglossed above-level terms, or length that clearly overloads | — |
| 3 | Comprehensible at the level | — |
| 4 | Precisely pitched: new items glossed, one step | — |

> **Splitting age from CEFR** addresses the reviewer's ambiguity notes on treating them together. MEETS rules must be re-derived with 8 dimensions (§3).

### 1.7 Formative check (`formative_check_evidence`)
**Definition:** the reply includes, where useful, a check that the **learner must answer unaided** and that tests the **objective's component**, and makes no unsupported claims.

**What counts as meaningful** (the most frequent ambiguity, ~39 notes):
- **Meaningful:** a new item or a production task on the tested component; a "why" question about the learner's own choice; a transfer task.
- **Not meaningful by itself:**
  - "Does that make sense?";
  - a copy-with-one-blank item placed directly under a model with the same answer (CA1-T06 t3);
  - a retry of the same item after the answer was revealed.

| Score | Anchor | Example |
|---|---|---|
| 0 | Claims mastery or progress without evidence, or invents figures | — |
| 1 | No check where one was clearly needed; or one correct answer treated as mastery | — |
| 2 | A check exists but is answerable by copying, or tests a different component | CA1-T06 t3 |
| 3 | An unaided check on the objective's component | — |
| 4 | Well-designed transfer or why-check matched to the success criteria | CB1-T08 t3 transfer task |

**When no check is due** (a clarification turn, a redirect): score 3 if no unsupported claim is made and mark `check_not_due: true`.

### 1.8 Clarity (`clarity_accessibility`)
**Definition:** easy to read and act on.

**Distinguishing clarity from verbosity:** verbosity is scored only when it **harms** comprehension or participation. Observable signs: the same rule stated twice; more than one task; the instruction to act buried after the explanation. Length alone is not a defect; use the case word limit only as a flag for review.

| Score | Anchor |
|---|---|
| 0 | Unusable |
| 1 | Cluttered: several tasks or rules competing |
| 2 | Clear but with repetition that delays the instruction |
| 3 | Clear, one task, easy to act on |
| 4 | Exceptionally clear and concise |

## 2. Hint versus leakage (cross-dimension rule)

A hint **leaks** when, after reading it, the learner no longer has to perform the step the item tests. Concretely: the target form is named ("have → has"), or a model of the same word or item appears adjacent to the item.

Score by the **ladder level the situation justifies** (see `hint_scaffolding_analysis.md` §3):
- leakage **before any attempt**: major (pedagogy ≤ 1);
- leakage after one attempt with no repeat error: minor or major depending on the item (pedagogy 2);
- full explanation after repeated failure or after the learner asks having tried: **appropriate** (no tag).

## 3. Answer sufficiency (cross-dimension rule)

An answer is **sufficient for the objective** when it shows each success criterion that the item tests, in the learner's own text, allowing surface slips (capital letters, punctuation, non-target spelling).
- A correct answer to a **different item** that shows the criterion counts as evidence of that criterion. The tutor is not penalised for asking once about a criterion **not** yet shown.
- A correct but **irrelevant** sentence is not evidence.
- Evaluators classify the learner's answer using the answer-class table (`correct_answer_recognition_analysis.md` §5) before scoring.

## 4. Outcome rule (to be frozen before any v2 run)

The v1 thresholds can be kept for comparability:
- **MEETS:** all deterministic checks pass, no dimension below 2, mean ≥ 3.0, no critical and **no major** tag.
- **DOES_NOT_MEET:** any critical, or any 0.
- **Otherwise PARTIAL.**

Two additions are proposed:
- **"no major tag"**, because v1 allowed MEETS with a major tag;
- **mandatory human adjudication** of boundary disagreements (§0.5).

The thresholds must be fixed **before** v2 is used on any run, and not tuned to a target rate.

## 5. Borderline examples set (for calibrating evaluators)

| Case, turn | Why it is borderline | v2 resolution |
|---|---|---|
| CA1-T04 t2 | Correct "he is twelve", but the tutor's item needed "This is my …" too | Partially correct for the presented item. The tutor's request for the missing part is a 3 on scaffolding. The case is unreliable because of the fixture (evidence parity). |
| TA1-T04 t2 | Correct sentence that answers neither presented item | Correct but not answering the current item. Redirecting once is a 3; no ignored_learner_reply tag. |
| AA1-T13 t2 | Binary near-reveal at the first rung after an answer request | Pedagogy 2, minor tag |
| AA2-T08 t2 | After a correct answer, the tutor adds the next component with a rule reminder | Not over-helping: progression, scaffolding 3 |
| AA1-T11 t1 | Off-topic redirect with English frames, as the policy instructs | Designed behaviour; score execution only |
| TA2-T07 t4 | "watch … same rule as go → goes" | Acceptable simplification, no tag |
| AA1-T06 t3 | "Only one word changes" (false) | lesson_alignment 2, minor factual misstatement about the example (not about the target rule) |
