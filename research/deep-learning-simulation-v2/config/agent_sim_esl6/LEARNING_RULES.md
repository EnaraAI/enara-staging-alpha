# SIMULATION ONLY

# Learning rules for the rule-based learner simulator (ESL stage 6)

**These rules are a model of learning, not real learning. Every result produced with them depends on them.**

They describe only what the simulated learner believes, how it answers, and how its beliefs change. They say nothing about how any tutor is built.

What is new in stage 6:
- section 1b: belief states for 33 A1–A2 form outcomes (the 3 forms of the earlier stages are kept unchanged);
- section 6: forgetting rule F1 (between sessions and before the delayed test), with all parameters fixed here and in `F1_PARAMS.json`;
- section 7: timing of the sessions and the two post-tests.

Sections 1, 2 and 3 (rules R1–R7) are **unchanged from ESL5** (`config/agent_sim_esl5/LEARNING_RULES.md`, which copied them from ESL2). Section 2 has one added line about non-whole strengths (2a), needed only because F1 can make strengths non-whole; the table itself is unchanged.

## 1. Knowledge state (unchanged from ESL5)
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

## 1b. Belief states for all A1–A2 form outcomes (new in ESL6)

**Selection.** Every outcome in `data/outcomes/outcomes.json` with `level` = form, `cefr` A1 or A2, at least one `lessonIds` entry, and status `passed_review_draft` in the A1–A2 outcome review status file (`OUTCOME_STATUS.json`). Count: **33** (all 33 passed outcomes; the 2 `no_forms_gap` entries are excluded).

**How the table is used.**
- W1 is the belief for the first listed error type, W2 for the second (if any). Ck is the correct counterpart of Wk; when an outcome has one wrong belief, C2 is not used (no W2, no C2).
- Starting strengths use the same bands as section 1. With only W1, W1 is the primary wrong belief.
- The three forms of section 1 (a/an, copula be, third-person -s) keep the section-1 rows exactly; the rows below for them only add the error-type names.
- Three outcomes have no `l1ErrorTypes` (possessive adjectives, common adjectives, make/do). No wrong belief is seeded for them; they are marked **GAP** and cannot be used as target forms until an error type is added.
- Error-type names and definitions: `docs/LEARNING_OUTCOMES.md` PART 2 and framework §9. They are hypotheses about Arabic-L1 learners, not facts about any one learner.

| # | Outcome | Correct belief (C) | Wrong belief(s): error type — belief — Arabic-L1 learner example |
|---|---|---|---|
| 1 | EN-F-A1-GR-article-a-an | a singular countable noun needs a/an; an before a vowel sound, a before a consonant sound (section 1 C1, C2) | W1 `article_indef_omission` — no a/an is needed before a singular noun — "She is teacher." (W2 kept from section 1: a and an are the same — "a apple") |
| 2 | EN-F-A1-GR-article-the | use "the" for a thing already mentioned or known to both people | W1 `article_def_misuse` — "the" goes with general nouns and is left out for known things, as with Arabic al- — "The life is hard." / "I saw a film. Film was good." |
| 3 | EN-F-A1-GR-copula-be | a present statement needs am/is/are after the subject (section 1 C1, C2) | W1 `copula_omission` — no am/is/are is needed in a present sentence — "She teacher." (W2 kept from section 1: "is" works with every subject — "They is") |
| 4 | EN-F-A2-GR-third-person-s | add -s/-es to the verb after he/she/it (section 1 C1, C2) | W1 `agreement_3s` — the verb does not change after he/she/it — "She like tea." (W2 kept from section 1: -s on every verb — "I plays") |
| 5 | EN-F-A2-GR-present-continuous | an action now needs am/is/are + verb-ing | W1 `copula_omission` — the -ing verb alone is enough — "He watching TV now." ; W2 `tense_aspect` — the plain present means "now" — "Look! It rains." |
| 6 | EN-F-A2-GR-past-simple-regular | a finished past event takes verb + -ed | W1 `tense_aspect` — a time word shows the past, so the verb need not change — "Yesterday I play football." |
| 7 | EN-F-A2-GR-past-simple-irregular | common verbs have their own past forms (went, had, saw, bought) | W1 `tense_aspect` — every past verb is made with -ed (or not changed) — "I goed to the market." / "Yesterday I buy a shirt." |
| 8 | EN-F-A2-GR-past-questions-did | a past question is did + subject + base verb | W1 `tense_aspect` — the main verb keeps the past form after did — "Did you went to school?" ; W2 `verb_subject_order` — a question is a statement with rising voice, or verb before subject without did — "You went to school?" / "Went you to school?" |
| 9 | EN-F-A1-GR-prepositions-time | at + clock time, on + day/date, in + month/year | W1 `prep_place_transfer` — one preposition (in, like Arabic fi) works for every time — "The lesson is in 9 o'clock." / "in Monday" |
| 10 | EN-F-A1-GR-there-is-are | there is + singular noun, there are + plural noun | W1 `plural_s` — after a number the noun stays singular — "There are three book." ; W2 `copula_omission` — "there" alone is enough, no is/are — "There a cat in the garden." |
| 11 | EN-F-A1-GR-can-ability | can + base verb, the same form for every subject | W1 `agreement_3s` — after he/she/it the verb after can takes -s — "She can swims." |
| 12 | EN-F-A1-GR-possessive-adjectives | choose my/your/his/her/our/their by the owner | **GAP**: no l1ErrorTypes listed; no wrong belief seeded |
| 13 | EN-F-A1-GR-word-order-svo | a statement is subject + verb + object, place/time at the end | W1 `verb_subject_order` — the verb can come first, as in Arabic — "Plays Ahmed football." ; W2 `adj_noun_order` — the adjective comes after the noun — "I have a car red." |
| 14 | EN-F-A2-GR-frequency-adverbs | always/usually/sometimes/never go before the main verb (after be) | W1 `verb_subject_order` — the adverb goes after the verb or at the start/end freely — "I go always to school by bus." |
| 15 | EN-F-A2-GR-comparatives | short adjective + -er (spelling rules), long adjective with more, then than | W1 `spelling_vowel` — the comparative is written by sound, vowels dropped or changed — "biger", "hapier", "nicer" written "nicr" |
| 16 | EN-F-A2-GR-going-to | a plan is am/is/are + going to + base verb | W1 `copula_omission` — "going to" alone is enough — "I going to visit my aunt." |
| 17 | EN-F-A2-GR-much-many | many + countable plural, much + uncountable | W1 `quantifier_countability` — one word (like Arabic kathir) works for both — "How much books?" / "many water" |
| 18 | EN-F-A2-GR-some-any | some in statements, any in negatives and questions | W1 `quantifier_countability` — some (or any) fits every sentence — "I don't have some money." |
| 19 | EN-F-A2-GR-conjunctions | join two clauses with one of and/but/because chosen by meaning, inside one sentence | W1 `run_on_and` — clauses are chained with "and" whatever the meaning, with no full stop — "I was tired and I went to school and I was happy." |
| 20 | EN-F-A1-GR-capitals-full-stops | a sentence starts with a capital, "I" is always capital, it ends with a full stop | W1 `run_on_and` — a text is one long line joined with "and", no full stops or capitals — "my name is ali and i live in cairo and i like football" |
| 21 | EN-F-A1-VO-family | each family member has its own English word, spelled with its vowels | W1 `spelling_vowel` — vowels can be left out or swapped — "brthr", "mather" ; W2 `lexical_l1_transfer` — one Arabic word gives one English word for both meanings — "His woman is a teacher." (wife) |
| 22 | EN-F-A1-VO-food-drink | eat for food and soup, drink for liquids you drink | W1 `lexical_eat_drink` — soup and spoon food are "drunk", as with Arabic shariba — "I drink my soup." |
| 23 | EN-F-A1-VO-classroom-objects | classroom words with their English consonants (p, v) | W1 `spelling_consonant` — p and b (f and v) are the same letter — "bencil", "bage" ; W2 `lexical_l1_transfer` — an Arabic phrase is translated word for word — "the black board pen" for marker / "rubber of the pencil" |
| 24 | EN-F-A1-VO-home-rooms | rooms have single English names (bedroom, kitchen) | W1 `spelling_vowel` — vowels can be left out — "kitchn", "bathrom" ; W2 `lexical_l1_transfer` — the Arabic phrase is translated — "the sleeping room" (bedroom) |
| 25 | EN-F-A1-VO-numbers-time | numbers, prices and times have fixed spellings and English time phrases | W1 `spelling_consonant` — f and v are the same — "fivteen" ; W2 `lexical_l1_transfer` — Arabic saʿa means both hour and clock — "one clock long" (one hour). (Third listed type `spelling_vowel` — "fourty"/"nineten" — is not seeded; at most 2 wrong beliefs.) |
| 26 | EN-F-A1-VO-days-months | days and months have fixed spellings and names | W1 `spelling_vowel` — vowels can be left out or changed — "Wensday", "Fbruary" ; W2 `lexical_l1_transfer` — a month is named by its number — "in month five" (in May) |
| 27 | EN-F-A1-VO-common-adjectives | each common adjective has a fixed opposite (big–small, hot–cold, old–young/new) | **GAP**: no l1ErrorTypes listed; no wrong belief seeded |
| 28 | EN-F-A2-VO-jobs-workplaces | each job word goes with its workplace and is spelled with its vowels | W1 `spelling_vowel` — vowels can be left out — "doctr", "techer", "hospitl" |
| 29 | EN-F-A2-VO-weather | weather is described with an adjective after "It is" (sunny, rainy) | W1 `noun_for_adjective` — the noun works as the description — "It is rain today." / "It is sun." ; W2 `spelling_vowel` — vowels can be left out — "sny", "windi" |
| 30 | EN-F-A2-VO-clothes-shopping | colour and size adjectives go before the noun | W1 `adj_noun_order` — the adjective goes after the noun — "I want a shirt blue, size big." |
| 31 | EN-F-A2-VO-appearance | appearance adjectives go before the noun (long black hair) | W1 `adj_noun_order` — adjectives follow the noun — "She has hair long black." |
| 32 | EN-F-A2-VO-make-do | make or do is fixed by the noun (make a cake, do homework) | **GAP**: no l1ErrorTypes listed; no wrong belief seeded |
| 33 | EN-F-A2-FN-polite-requests | a request uses Can I have ... / I would like ..., please | W1 `request_directness` — a bare imperative or "I want" is a normal request, as in Arabic aʿtini / ana ʿayiz — "Give me the key." / "I want a cup of tea." |

## 2. Producing the form (unchanged from ESL5)
Each wrong belief the item can reveal fires independently:

| Strength of the wrong belief | Probability it produces its error |
|---|---|
| 2 or 3 | 0.8 |
| 1 | 0.4 |
| 0 | 0.05 |

The answer is wrong if any relevant wrong belief fires (the first that fires decides the error). Seeds: `sha256(learner seed | purpose | turn | item)`.

### 2a. Non-whole strengths and correct-belief strength (new in ESL6, used only after F1 has run)
F1 (section 6) can leave strengths that are not whole numbers. Then:
- **Wrong belief:** use the row of the table for the strength rounded half up: W ≥ 1.5 -> 0.8; 0.5 ≤ W < 1.5 -> 0.4; W < 0.5 -> 0.05. "Wk at 0" in section 4c means rounded 0.
- **Correct belief (retrieval threshold):** if an item tests Ck (section 4a) and Ck < 1.0, Wk's error probability on that item is at least 0.4 (the learner no longer reliably recalls the rule, so the wrong idea can win even if Wk is low). If Ck ≥ 1.0, the table alone applies.
- These two lines apply to every answer given after at least one F1 interval: all of session 2, the immediate post-test and the delayed post-test. Session 1 is unaffected (all strengths whole, no F1 yet).
- R1–R7 still add or subtract whole steps, then clamp to 0–3. R4's reset still sets Wk to exactly 0.

## 3. Update rules (unchanged from ESL5)

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

### 3a. The learner's next message (unchanged from ESL5 / ESL2 §4)
The judge also reports what the tutor's turn asks the learner to do next: fill a blank (with the correct answer and the error each wrong belief would produce), write an own sentence (with one correct sentence and the erroneous version for each wrong belief), say the rule in own words, or nothing. A script then writes the learner's message: for a blank or a sentence it applies section 2; for "say the rule" it states C1's rule if C1 ≥ 2 and W1's wrong idea otherwise; when nothing is asked it asks for an exercise. The judge never writes what the learner "chooses"; the dice do.

## 4. Clarifications for the judge (kept from ESL5 §4, still valid; no change except where marked)

Apply each procedure in order. Stop at the first check that decides.

**Scope change (ESL6):** 4a–4d were written for the three section-1 forms. For a section-1b form, the same logic applies with that row's beliefs: an item tests Ck only if Wk could change the answer (e.g. a "much or many" choice tests C1 of much/many; an item about something outside the row tests nothing).

### 4a. Which correct belief gets credit (R3, R4)

A correct belief is **tested** by an item only if its wrong counterpart could change the answer.

1. Is the item about "the" versus "a" (first or second mention), or about anything outside the table in section 1? -> No belief is tested. No R3, no R4. *(ESL6: for the article-the outcome in 1b, "the" versus "a" does test its C1.)*
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

**Example (step 5, case #13, articles).** Previous task: "Write a or an: My uncle is ___ doctor." Learner: "a". Tutor: "Yes, 'a' is correct." Ruling: R3 **C2 only**. Why: the options were a/an, so W1 (leaving it out) could not change the answer.

### 4b. R4: when is it a new item

1. Was the learner's correct answer to an item they already answered (right or wrong) earlier in this session, including a "Try again" of the same sentence? -> Not new. No R4 (R3 may still apply).
2. Did the previous tutor turn give the answer, a completed model of the same sentence, or a hint that settles the word for this item (e.g. "she is one person, like he and it" right before "She ___")? -> No R4.
3. A rephrase counts as the same item if it keeps the same subject and noun/verb (e.g. "She ___ at home" -> "She ___ at home today"). A different sentence with a different noun or verb is new.
4. A general rule stated with a *different* example sentence does not block R4.
5. Does the item test the belief (4a)? If not, no R4 for that belief.
6. Judge R4 from the previous tutor turn and the learner's message only, never from the praise in the current turn.
7. Otherwise -> R4 for each tested belief.

**Example (ag3 case ae19b55005a).** Previous turn: "... Hint: 'she' is one person, like he and it. Which word fits? Try again: She ___ at home today." Learner: "is". Ruling: **no R4**. Why: check 1 and check 2. R3 only.

**Example (step 5, case #6).** Previous turn: "Right: We are tall. Wrong: We is tall. ... Then try again: I ___ a student." Learner: "am". Ruling: R3 C2, **no R4**. Why: a retry of an item already missed.

**Counter-example (ag7, 3rd -s).** Previous turn: "Correct! 'Drink' just takes -s: drinks. Next one: My brother ___ (go) to the gym on Fridays." If the learner writes "goes": **R4** C1 and C2. Why: new sentence, new verb, and the rule line was about "drink", not "go".

### 4c. R1 when the targeted wrong belief is already at 0

1. Does the turn state a **general** rule (it names a class: "he/she/it", "verbs ending in -ch", "a vowel sound", "every present sentence")? If not -> no R1. A plain restatement of the item ("'washes' is correct") is not R1.
2. Is the rule correct? If not -> R6, no R1.
3. Would believing the rule rule out Wk's error? Check each Wk separately.
4. A one-item justification counts only if it contains such a general clause ("He is one person, so the verb takes -s" -> yes).
5. If checks 1–4 pass, report R1 on Wk **even if Wk is already 0**. The script clamps at 0.
6. **Effect at 0: none.** Wk stays 0. The −1 is not moved to the other wrong belief, not turned into C credit, and not stored for later. *(ESL6: "at 0" means rounded 0, section 2a. When Wk is between 0 and 0.5 after F1, R1 lowers it to 0.)*

**Example (step 5, case #8, 3rd -s, W1 = 0).** Learner: "He drinks". Tutor: "Yes! 'He' is one person, so the verb takes -s." Ruling: R3 C1 and **R1 W1** (no change). 

**Example (ag7, 3rd -s).** Tutor: "Excellent! 'Watch' ends in -ch, so we add -es: watches." Ruling: **R1 W2**, no R1 W1.

**Example (ag3 case ae19b55005a, copula, W2 = 2).** Tutor: "'She' is one person, so we use is." Ruling: **no R1 W2** (check 3: the line fits "is everywhere"). Compare ag7: "is is for he, she and it. They is more than one person ... Which word goes with they?" -> R1 W2 and R2 W2.

### 4d. Vague hint lines vs a rule statement

1. Does the line name the form in words (a/an, am/is/are, -s/-es/-ies; for 1b forms, the form in that row)? If not -> hint, no R1. A "Rule:" label alone is not enough.
2. Does it say **when** the form is used? If not -> hint, no R1.
3. Is it a question or an instruction to look ("look at the first word", "one person or two?")? -> hint, no R1.
4. "We cannot say X" with no right form and no rule -> not R1. If a right form is also given, judge it as R2 (pair).
5. Otherwise -> judge under 4c.

**Example (step 5, case #4, copula).** Tutor: "The rule: the gap always needs one word. Try again: I ___ a student." Ruling: **no event** (check 1).

**Example (ag3 case a8d847f32ea, articles, W1 = 3, W2 = 0, gap left empty).** Tutor: "Rule: look at the first sound of the next word. A vowel sound takes 'an'; other sounds take 'a'." Ruling: **R1 W2** (no change); **no R1 W1** (it is about a/an choice, not about needing an article).

Counter-example (step 3): "We say 'He is a doctor', not 'He is doctor'." -> R2 W1. Adding "one job/one thing needs a or an" makes it R1 W1 too.

## 5. Turn types mapped to existing rules (kept from ESL5 §5; one ESL6 addition marked)

### 5a. Answer given after two failed attempts, with reason, pair and new item
1. **Answer given** -> R5 (no change).
2. **Reason** -> R1 on Wk only if it passes 4c/4d.
3. **Right/wrong pair** -> R2 on the Wk whose error the wrong member shows (by the error, not the learner's last error).
4. Cap: Wk falls by at most 2 in this turn.
5. No R3 or R4: the learner did not produce the form correctly.
6. **The new item:** judged under 4b; new unless the same turn modelled that sentence. The released item itself, if asked again later, is not new.

### 5b. Recall item from an earlier session / own-sentence task
1. **Recall item** (e.g. "Remember last time? Fill in: She ___ a teacher"): asking it has no effect. The learner's answer is judged in the next turn:
   - correct and confirmed -> R3 on tested beliefs (4a);
   - R4: a sentence the learner already answered in an earlier session is **not new**. A fresh sentence on the same rule is new;
   - a "Remember: <rule>" line before the item is judged under 4c/4d; if it settles the answer, no R4 (4b check 2).
   - **ESL6 addition:** the learner's answer also counts as a **retrieval attempt** for F1 (section 6c) on each tested Ck, right or wrong, unless the previous turn settled the answer (4b check 2) — then it was not answered from memory. The judge reports `retrieval: [Ck,...]` for that turn.
2. **Own-sentence task:** a correct own sentence is always a new context, so R4 applies to each belief the sentence tests, unless the previous turn gave a model of that same sentence (one word changed counts as a model). Errors in an own sentence are judged by R2/R7 as usual. An own sentence is **not** a retrieval attempt for F1 unless the task names a rule taught in an earlier session.

## 6. Forgetting rule F1 (new in ESL6; all parameters fixed now, see `F1_PARAMS.json`)

F1 runs once for each simulated day that passes **outside** a session: 2 days between session 1 and session 2, and 7 days between session 2 and the delayed post-test (section 7). It never runs inside a session. Order on each day: 6a, then 6b. Retrieval counts (6c) are updated at the end of each session.

**Principles (framework §7, "Spaced retrieval"; sources VERIFY as in the framework):**
- Forgetting/decay: memory not used weakens over time (forgetting curve; Ebbinghaus 1885 — not cited in §7, VERIFY). Modelled as a fixed linear loss per day, a simplification of the curve.
- Retrieval practice / testing effect: trying to recall makes memory last longer (Roediger & Karpicke 2006, cited in §7). Modelled as a slower decay after retrieval attempts.
- Spacing effect: recall spread over time beats massed recall (Cepeda et al. 2006, cited in §7). Modelled by counting at most one retrieval per session, so two retrievals need two sessions.
- Recovery of old responses / proactive interference: an older response that was weakened but not unlearned comes back with time and competes with the new one (spontaneous recovery; proactive interference, Underwood 1957 — not cited in §7, VERIFY; framework §9 on L1 transfer as the source of the old response). Modelled as a partial return of lowered wrong beliefs.

### 6a. Decay of correct beliefs
- Each day, each correct belief Ck loses **d = 0.15 × m^r** (r from 6c, m = 0.5).
- **Floor:** Ck never falls below its band starting strength (section 1: A1 0 for C1 and C2; A2 1 for C1, 0 for C2; B2 3). What was never learned cannot be forgotten; B2 learners therefore do not decay.
- **Mapping to answering:** section 2a. If Ck < 1.0 on an item that tests it, Wk's error probability is at least 0.4. The "say the rule" reply (3a) uses C1 ≥ 2 as before.

### 6b. Partial return of lowered wrong beliefs
- A wrong belief is **lowered** if, at the end of the last session, it is below its band starting strength and it was **not removed**. **Removed** = set to 0 by R4's reset (independent count reached 2). A removed belief does not return.
- Each day a lowered Wk rises by **f × drop**, with **f = 0.10** and drop = (starting strength − strength at the end of the last session).
- **Cap:** the total return over one gap is at most **0.5 × drop** (it never comes back more than halfway), and Wk never exceeds its starting strength.
- After a session, a new drop is computed from the new end-of-session strength; returns from earlier gaps are part of that strength.
- Beliefs at or above their starting strength (never lowered, or raised by R7) do not change.

### 6c. Retrieval attempts slow decay
- A retrieval attempt = a recall item answered from memory in a session (section 5b), for each Ck it tests, right or wrong.
- **Counting:** at most **1** per Ck per session (spacing; extra attempts in the same session add nothing); **r** = number of sessions so far in which Ck had a retrieval attempt, **capped at 2**.
- **Multiplier:** each counted retrieval multiplies the decay rate by **m = 0.5**: r = 0 -> 0.15/day, r = 1 -> 0.075/day, r = 2 -> 0.0375/day (the minimum).
- Session 1 has no earlier session, so its recall items (if any) are not retrieval attempts; in this two-session design r is 0 or 1 at the delayed test. The cap of 2 is fixed for longer designs.

### 6d. Worked example
A1 learner, copula. Starting strengths: W1 3, W2 1, C1 0, C2 0. At the end of session 2: **C1 = s = 2.0**, W1 = 1 (lowered by R1/R2, not removed; drop = 2), C1 independent count 1.

| Day after session 2 | C1, not retrieved (r = 0, −0.15/day) | C1, retrieved once in session 2 (r = 1, −0.075/day) | W1 (+0.10 × 2 = +0.2/day, cap +1.0) |
|---|---|---|---|
| 0 (immediate post-test) | 2.00 | 2.00 | 1.0 |
| 1 | 1.85 | 1.925 | 1.2 |
| 3 | 1.55 | 1.775 | 1.6 |
| 5 | 1.25 | 1.625 | 2.0 (cap reached) |
| **7 (delayed post-test)** | **0.95** | **1.475** | **2.0** |

At day 7, on an open copula gap (tests C1):
- W1 = 2.0 rounds to 2 -> 0.8 in both columns; W1's error dominates.
- If instead W1 had been **removed** (R4 reset): W1 = 0 -> 0.05. Then not retrieved: C1 = 0.95 < 1.0 -> W1's error probability rises to 0.4; retrieved: C1 = 1.475 ≥ 1.0 -> stays 0.05.

So in this model retrieval in session 2 protects a removed wrong belief from coming back through a weak rule, and removing a wrong belief (two independent productions) protects it from returning at all.

## 7. Sessions and post-tests (new in ESL6)
- **Session 2 is 2 days after session 1.** F1 runs for 2 days between them (6a, 6b; r from session 1 is 0).
- **Immediate post-test:** answered from the knowledge state **at the end of session 2** (no F1), with section 2 and 2a.
- **Delayed post-test:** 7 days after the last session, answered from the state after **7 simulated days of F1**, with section 2 and 2a.
- Both post-tests use the post-test format of ESL5 (ESL2 §5): 4 controlled items and 2 free-production items, fixed seed; also reported: expected accuracy (mean probability, no dice) and number of wrong beliefs at rounded strength 0. Post-test items do not update the state and are not retrieval attempts.

## 8. What changed vs ESL5
- Unchanged: sections 1, 2 (table), 3 (R1–R7, limits), 3a, and the 4a–4d and 5a–5b procedures.
- Added: 1b (33 form outcomes, 3 marked GAP), 2a (non-whole strengths, Ck < 1.0 threshold after F1), 5b retrieval reporting, 6 (F1), 7 (timing).
- Changed wording only: 4 scope line, 4a check 1 note for article-the, 4c "at 0" means rounded 0, 4d check 1 for 1b forms. Arm labels removed from examples.

Self-check (forbidden terms searched, case-sensitive whole word unless noted): ENARA, LE, A0, P+, PP, esl5 (lowercase; the study label "ESL5" is required by the task and allowed), levelExplicit, assess (any case, substring), selfCheck, graderV2, ENGINE_V2, wrongAnswer, strandLog, liveError, releaseAfterTwo, reviewOpen, fadeKnown, ownSentence, shortRecap, clarity, closing, engineV2 — **0 hits** (excluding this line). ("Hints" appears once inside the copied R1–R7 limits sentence as plain English, not as a switch name.)
