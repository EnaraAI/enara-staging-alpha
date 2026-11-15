# SIMULATION ONLY

# Learning rules for the rule-based learner simulator (ESL stage 5)

**These rules are a model of learning, not real learning. Every result produced with them depends on them.**

This file copies rules R1–R7 from `config/agent_sim_esl2/LEARNING_RULES.md` (frozen, used in ESL2–ESL4). **The effects are unchanged:** same triggers in intent, same strength changes, same caps, same production table, same post-test. ESL5 adds only:
- clarifications (decision procedures) for the four kinds of case where the two ESL4 judges disagreed;
- a note on how two new tutor moves map onto the existing rules.

Sources for the clarifications: `config/agent_sim_esl5/JUDGE_RULES_DRAFT.md`, `step5_result.md` (71 disputed cases out of 165 rechecked), and the recheck batches in `reports/exp4/agent_sim_esl4/agree/`.

## 1. Knowledge state (unchanged)
For the learner's target form the state lists:
- two wrong beliefs (W1, W2), each with a strength from 0 to 3, and the Arabic-L1 error each produces;
- two correct beliefs (C1, C2), each with a strength from 0 to 3. Ck is the correct counterpart of Wk;
- for each correct belief, the number of independent correct productions in a new context so far;
- the learner's seeded L1 profile (which wrong belief is primary).

| Form | W1 (error it produces) | W2 (error it produces) | C1 | C2 |
|---|---|---|---|---|
| articles | no a/an is needed before a singular noun ("She is teacher") | a and an are the same; "a" (or "the") goes everywhere ("a apple") | a singular countable noun needs a/an (or the) | an before a vowel sound, a before a consonant sound |
| copula be | no am/is/are is needed in a present sentence ("She teacher") | "is" works with every subject ("They is") | a present sentence needs am/is/are | am with I, is with he/she/it, are with you/we/they |
| third-person -s | the verb does not change after he/she/it ("She like tea") | -s goes on every verb; -es/-ies not needed ("I plays", "She watchs") | add -s/-es after he/she/it | -es after sh/ch/s/x/o, -ies after consonant + y, no -s after I/you/we/they |

Starting strengths by band: A1: primary wrong 3, other wrong 1, both correct 0. A2: primary 2, other 1, C1 1, C2 0. B2: both wrong 0, both correct 3.

## 2. Producing the form (unchanged)
Each wrong belief the item can reveal fires independently:

| Strength of the wrong belief | Probability it produces its error |
|---|---|
| 2 or 3 | 0.8 |
| 1 | 0.4 |
| 0 | 0.05 |

The answer is wrong if any relevant wrong belief fires (the first that fires decides the error). Seeds: `sha256(learner seed | purpose | turn | item)`.

## 3. Update rules (unchanged effects)

| Rule | When it applies (all conditions must hold) | Change |
|---|---|---|
| **R1 Rule statement** | The tutor states a clear, correct rule that directly contradicts Wk (not just a hint where to look, not a question) | Wk −1 |
| **R2 Contrast on own error** | The tutor gives a right-versus-wrong pair whose wrong member shows the error Wk produces | Wk −1 |
| **R3 Confirmed correct production** | The learner's last message produced the form correctly (fact supplied) and the tutor clearly confirms it | Ck +1 |
| **R4 Independent production in a new context** | The learner's last message was a correct production for a new item or an own sentence, and the tutor's previous turn had not given that answer, a model of that sentence, or a hint that settles it | Ck +1 and Ck's independent count +1; when the count reaches 2, Wk is set to 0 |
| **R5 Answer given** | The tutor gives the answer (or a completed example of the item) without the learner producing it | no change |
| **R6 Unclear or wrong explanation** | The explanation is unclear, contradictory, or states an incorrect rule | no change |
| **R7 False confirmation** | The learner's last message contained Wk's error (fact supplied) and the tutor calls it correct | Wk +1 |

Limits (unchanged): a wrong belief falls by at most 2 in one turn (R1 + R2); strengths stay between 0 and 3; R3 and R4 can both apply to the same production. Hints, praise, questions, chat, recaps and encouragement have no effect by themselves.

Sections 4 (the learner's next message) and 5 (post-test) of the ESL2 file apply unchanged.

## 4. Clarifications for the judge

Apply each procedure in order. Stop at the first check that decides.

### 4a. Which correct belief gets credit (R3, R4)

A correct belief is **tested** by an item only if its wrong counterpart could change the answer.

1. Is the item about "the" versus "a" (first or second mention), or about anything outside the table in section 1? -> No belief is tested. No R3, no R4.
2. Articles:
   - blank offered as "a or an" (the word must be one of the two) -> C2 only;
   - blank or sentence where leaving the article out is possible -> C1 and C2.
3. Copula:
   - blank offered as "am, is or are" -> C2 only (omission is not an option);
   - open gap with no options, or an own sentence -> C1 and C2.
4. Third-person -s:
   - he/she/it subject, plain stem (eat, drink, play) -> C1 only;
   - I/you/we/they subject, or a stem ending in sh/ch/s/x/o or consonant + y, with a non-he/she/it subject -> C2 only;
   - he/she/it subject with an -es/-ies stem (watch, cry) -> C1 and C2.
5. Credit R3/R4 to every tested belief and no other. The next_task "probes" list uses the same mapping.

**Example (ag3 case ae19b55005a, copula).** Previous task: "Try again: She ___ at home today." Learner: "is". Tutor: "Correct! 'She' is one person, so we use is." Ruling: R3 **C1 and C2**. Why: the gap was open (no "am, is or are" options in the task line), so leaving it empty was possible and W1 could change the answer. (See 4b for R4.)

**Example (step 5, case #13, articles).** Previous task: "Write a or an: My uncle is ___ doctor." Learner: "a". Tutor: "Yes, 'a' is correct." Ruling: R3 **C2 only**. Why: the options were a/an, so W1 (leaving it out) could not change the answer. One judge credited C1; that was wrong.

### 4b. R4: when is it a new item

1. Was the learner's correct answer to an item they already answered (right or wrong) earlier in this session, including a "Try again" of the same sentence? -> Not new. No R4 (R3 may still apply).
2. Did the previous tutor turn give the answer, a completed model of the same sentence, or a hint that settles the word for this item (e.g. "she is one person, like he and it" right before "She ___")? -> No R4.
3. A rephrase counts as the same item if it keeps the same subject and noun/verb (e.g. "She ___ at home" -> "She ___ at home today"). A different sentence with a different noun or verb is new.
4. A general rule stated with a *different* example sentence does not block R4.
5. Does the item test the belief (4a)? If not, no R4 for that belief.
6. Judge R4 from the previous tutor turn and the learner's message only, never from the praise in the current turn.
7. Otherwise -> R4 for each tested belief.

**Example (ag3 case ae19b55005a).** Previous turn: "... Hint: 'she' is one person, like he and it. Which word fits? Try again: She ___ at home today." Learner: "is". Ruling: **no R4**. Why: check 1 (retry of the same item) and check 2 (the hint settles it). R3 only.

**Example (step 5, case #6).** Previous turn: "Right: We are tall. Wrong: We is tall. ... Then try again: I ___ a student." Learner: "am". Ruling: R3 C2, **no R4**. Why: a retry of an item already missed.

**Counter-example (ag7, 3rd -s).** Previous turn: "Correct! 'Drink' just takes -s: drinks. Next one: My brother ___ (go) to the gym on Fridays." If the learner writes "goes": **R4** C1 and C2. Why: new sentence, new verb, and the rule line was about "drink", not "go", so it does not settle the answer.

### 4c. R1 when the targeted wrong belief is already at 0

1. Does the turn state a **general** rule (it names a class: "he/she/it", "verbs ending in -ch", "a vowel sound", "every present sentence")? If not -> no R1. A plain restatement of the item ("'washes' is correct") is not R1.
2. Is the rule correct? If not -> R6, no R1.
3. Would believing the rule rule out Wk's error? Check each Wk separately. A rule about a/an choice does not contradict article omission; "she takes is" does not contradict "is works with every subject".
4. A one-item justification counts only if it contains such a general clause ("He is one person, so the verb takes -s" -> yes, a he/she/it rule).
5. If checks 1–4 pass, report R1 on Wk **even if Wk is already 0**. The script clamps at 0.
6. **Effect at 0: none.** Wk stays 0. The −1 is not moved to the other wrong belief, not turned into C credit, and not stored for later. Nothing else changes.

**Example (step 5, case #8, 3rd -s, W1 = 0).** Learner: "He drinks". Tutor: "Yes! 'He' is one person, so the verb takes -s." Ruling: R3 C1 and **R1 W1** (no change: W1 stays 0; W2 is not lowered). Why: general he/she/it clause that contradicts W1.

**Example (ag7, 3rd -s).** Tutor: "Excellent! 'Watch' ends in -ch, so we add -es: watches." Ruling: **R1 W2**. Why: "ends in -ch, so we add -es" names a class of stems. It does not contradict W1, so no R1 W1.

**Example (ag3 case ae19b55005a, copula, W2 = 2).** Tutor: "'She' is one person, so we use is." Ruling: **no R1 W2**. Why: check 3. The line fits W2 ("is" everywhere) perfectly, so it does not contradict it. Compare ag7: "is is for he, she and it. They is more than one person ... Which word goes with they?" -> R1 W2 and (because it names "They is" as wrong) R2 W2.

### 4d. Vague hint lines vs a rule statement

1. Does the line name the form in words (a/an, am/is/are, -s/-es/-ies)? If not -> hint, no R1. A "Rule:" label alone is not enough.
2. Does it say **when** the form is used (which subjects, which sounds, which nouns)? If not -> hint, no R1.
3. Is it a question or an instruction to look ("look at the first word", "think about the ending", "one person or two?")? -> hint, no R1.
4. "We cannot say X" with no right form and no rule -> not R1. If a right form is also given, judge it as R2 (pair).
5. Otherwise -> judge under 4c.

**Example (step 5, case #4, copula, W1 error).** Tutor: "The rule: the gap always needs one word. Try again: I ___ a student." Ruling: **no event**. Why: check 1, no am/is/are named.

**Example (ag7, copula).** Tutor: "This sentence cannot stay empty: it needs one word between 'Omar' and 'my cousin'. Step 1: ... one person or two?" Ruling: **no event**. Why: checks 1 and 3.

**Example (ag7, copula).** Tutor: "We cannot say 'My father a pilot'; we need a word. Hint: my father is one man, so we can say he. Which word goes with he: am, is or are?" Ruling: **no R1, no R2**. Why: no right form is given (so not a pair), and "we need a word" does not name am/is/are as a rule. The am/is/are mention is a question.

**Example (ag3 case a8d847f32ea, articles, W1 = 3, W2 = 0, learner left the gap empty).** Tutor: "Rule: look at the first sound of the next word. A vowel sound takes 'an'; other sounds take 'a'." Ruling: **R1 W2** (no change, W2 = 0); **no R1 W1**. Why: it is a real rule (names a/an and when), but it is about a/an choice. It does not say a noun needs an article, so it does not contradict W1, even though the learner's error was W1's.

Counter-example (step 3, P+): "We say 'He is a doctor', not 'He is doctor'." -> R2 W1 (pair on omission). Adding "one job/one thing needs a or an" makes it R1 W1 too.

## 5. New ESL5 tutor moves (mapped to existing rules, no new effects)

### 5a. Answer release after two genuine failed attempts
Shape: the answer + a reason + a right/wrong pair + a new item.

Judge each part with the existing rules:
1. **Answer given** -> R5 (no change).
2. **Reason** -> R1 on Wk only if it passes 4c/4d (general, correct, contradicts Wk). "The answer is 'an' because 'orange' starts with a vowel sound" -> R1 W2 (a class: vowel sound). "The answer is 'is'" alone -> nothing.
3. **Right/wrong pair** -> R2 on the Wk whose error the wrong member shows. Pick by the error, not by the learner's last error: "Right: She has an orange. Wrong: She has a orange." is R2 W2; "Wrong: She has orange." is R2 W1.
4. Cap: Wk falls by at most 2 in this turn.
5. No R3 or R4: the learner did not produce the form correctly.
6. **The new item:** the learner's next answer to it is judged under 4b. It is a new item (R4 possible), unless the release turn modelled the same sentence. The released item itself, if asked again later, is not new.

### 5b. Recall item at session start / own-sentence task
1. **Recall item at session start** (e.g. "Remember last time? Fill in: She ___ a teacher"): asking it has no effect. The learner's answer is judged in the next turn:
   - correct and confirmed -> R3 on tested beliefs (4a);
   - R4: a sentence the learner already answered in an earlier session is **not new**. A fresh sentence on the same rule is new.
   - A "Remember: <rule>" line before the item is judged under 4c/4d. If it settles the answer for that item, the item gets no R4 (4b check 2).
2. **Own-sentence task** ("Write one sentence about your sister"): a correct own sentence is always a new context (ESL2 R4 wording), so R4 applies to each belief the sentence tests (4a: an own sentence tests C1 and C2 for articles and copula; for 3rd -s, use the subject and verb the learner wrote), unless the previous turn gave a model of that same sentence.
   - An own sentence that copies a model sentence from the previous turn with one word changed counts as a model of that sentence -> no R4.
   - Errors in an own sentence: the tutor's response is judged by R2/R7 as usual.

## 6. What changed vs the ESL2 rules
Only clarifications. Nothing new acts on the state.
- 4a: which correct belief an item tests (C1, C2, both, or none, e.g. "the" vs "a").
- 4b: ordered test for a "new item" (retry, rephrase, settling hint, model) for R4.
- 4c: R1 needs a general, correct clause that contradicts the specific Wk; report it even at 0; at 0 it has no effect and does not transfer.
- 4d: a vague hint, a "Rule:" label without the form named, or "we cannot say X" alone is not R1.
- 5a/5b: answer release and recall/own-sentence tasks are judged with existing R1, R2, R3, R4, R5.

**Effects are unchanged:** the same R1–R7 strength changes (−1, −1, +1, +1 with count, 0, 0, +1), the same cap (at most −2 per wrong belief per turn, range 0–3), the same R4 reset at count 2, the same production probabilities and the same post-test.
