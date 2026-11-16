# Learning rules for the rule-based learner simulator (ESL stage 2)

**SIMULATION ONLY. These rules are a model of learning, not real learning. Every result produced with them depends on them.** Written and committed before any session ran (15 Nov 2026). Principles and sources: `docs/ENARA_ESL_FRAMEWORK.md` (every citation there is marked VERIFY). The rules describe what a *tutor turn* does to a learner's knowledge; they do not name any tutoring system, switch or method.

## 1. Knowledge state (one per learner, hidden from the tutor)
For the learner's target form the state lists:
- **two wrong beliefs** (W1, W2), each with a strength from 0 to 3, and the Arabic-L1 error each one produces (framework §9);
- **two correct beliefs** (C1, C2), each with a strength from 0 to 3; Ck is the correct counterpart of Wk;
- for each correct belief, the number of **independent correct productions in a new context** so far;
- the learner's seeded L1 profile (which wrong belief is primary).

| Form | W1 (error it produces) | W2 (error it produces) | C1 | C2 |
|---|---|---|---|---|
| articles | no a/an is needed before a singular noun (omits the article: "She is teacher") | a and an are the same; "a" (or "the") goes everywhere ("a apple") | a singular countable noun needs a/an (or the) | an before a vowel sound, a before a consonant sound |
| copula be | no am/is/are is needed in a present sentence ("She teacher") | "is" works with every subject ("They is") | a present sentence like "She is a teacher" needs am/is/are | am with I, is with he/she/it, are with you/we/they |
| third-person -s | the verb does not change after he/she/it ("She like tea") | -s goes on every verb and -es/-ies are not needed ("I plays", "She watchs") | add -s/-es after he/she/it | -es after sh/ch/s/x/o, -ies after consonant + y, no -s after I/you/we/they |

Starting strengths (fixed by band, before any tutoring): A1: primary wrong belief 3, other wrong belief 1, both correct beliefs 0. A2: primary 2, other 1, C1 1, C2 0. B2 proficient: both wrong 0, both correct 3. The primary wrong belief is the learner's seeded L1 variant.

## 2. Producing the form (how the learner answers)
Whenever the learner has to produce the form (an exercise blank, an own sentence, a post-test item), each wrong belief that the item can reveal fires independently with probability:

| Strength of the wrong belief | Probability it produces its error |
|---|---|
| 2 or 3 | 0.8 |
| 1 | 0.4 |
| 0 | 0.05 |

The answer is wrong if any relevant wrong belief fires (the first that fires decides which error). All draws use a fixed seed per learner, per turn and per item (`sha256(learner seed | purpose | turn | item)`), so a run can be repeated exactly. The learner never "decides to learn": its answers come only from this table.

## 3. Update rules (applied after every tutor turn)
A separate judge reads only that tutor turn (with the learner's last message and the task the tutor had set before it, all with anything that could reveal the tutoring system removed) and the current state, and names which of these rules the turn triggers. A script then applies the numbers.

| Rule | When it applies (all conditions must hold) | Change | Principle (framework section) |
|---|---|---|---|
| **R1 Rule statement** | The tutor states a clear, correct rule that directly contradicts wrong belief Wk (not just a hint where to look, not a question) | Wk −1 | Explicit instruction helps, especially novices (§2; Norris & Ortega 2000; expertise reversal) |
| **R2 Contrast on own error** | The tutor gives a right-versus-wrong pair whose wrong member shows the error that Wk produces (the learner's own error type) | Wk −1 | Corrective feedback with contrast; L1-based errors (§3, §9) |
| **R3 Confirmed correct production** | The learner's last message produced the form correctly (fact supplied to the judge) and the tutor clearly confirms it is correct | Ck +1 | Feedback on production; proceduralization (§3, §4) |
| **R4 Independent production in a new context** | The learner's last message was a correct production of the form for a new item or an own sentence, and the tutor's previous turn had not given that answer, a model of that same sentence, or a hint that settles it | Ck +1 and Ck's independent count +1; when the count reaches 2, Wk is set to 0 | Skill acquisition: practice that matches use; retrieval (§4, §7) |
| **R5 Answer given** | The tutor gives the answer (or a completed example of the item) without the learner producing it | no change | Pushed output: understanding is not production (§6) |
| **R6 Unclear or wrong explanation** | The explanation is unclear, contradictory, or states an incorrect rule | no change | Only clear, correct input helps (§2, §3) |
| **R7 False confirmation** | The learner's last message contained the error that Wk produces (fact supplied) and the tutor calls it correct | Wk +1 | Uncorrected errors are reinforced (§3) |

Limits on one turn: a wrong belief can fall by at most 2 in one tutor turn (R1 + R2); strengths stay between 0 and 3. R3 and R4 can both apply to the same production. Nothing else changes the state: hints, praise, questions, chat, recaps and encouragement have no effect by themselves (they act only through the productions they lead to, via R3/R4).

## 4. The learner's next message
The judge also reports what the tutor's turn asks the learner to do next: fill a blank (with the correct answer and the error each wrong belief would produce), write an own sentence (with one correct sentence and the erroneous version for each wrong belief), say the rule in own words, or nothing. A script then writes the learner's message: for a blank or a sentence it applies section 2; for "say the rule" it states C1's rule if C1 ≥ 2 and W1's wrong idea otherwise; when nothing is asked it asks for an exercise. The judge never writes what the learner "chooses"; the dice do.

## 5. Post-test
Generated by a script from the final state with the probabilities in section 2 and a fixed seed: 4 controlled items and 2 free-production items (two sentences each, both must be free of the relevant errors for the item to score 1; one correct scores 0.5). The same frozen item set as the stage-1 study (`config/agent_sim_esl1/POSTTEST_ITEMS.json`, v1 controlled and free items), with each item tagged with the wrong beliefs it can reveal. Also reported: the expected accuracy (the mean probability, no dice) and the number of wrong beliefs at strength 0.
