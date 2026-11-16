# B3: Grammar accuracy audit

**Method:**
- Every grammar statement flagged by the official judge (5 `factual_error`) or the independent reviewer (13 `factual_error`) was located verbatim in `raw_results.jsonl` and read in context.
- A pattern search over all 219 tutor turns found recurrences: "only one word/thing/verb changes", "-ch … go", "doesn't work", "gone", "word order", "always =", "same mother and father".
- **Origin check:**
  - No grammar example in this audit appears in any fixed prompt text (`languageTeachingContext.ts`, `directTutorModel.ts`, `tutor.controller.ts`; grep for `goes`, `watches`, `-es` returns no prompt examples).
  - The lesson-spec examples come from the case fixtures and are correct.
  - **All statements below are model-generated content.** Where a prompt instruction shaped them, that is stated.

## 1. Findings

| # | Case, turn | Exact tutor statement | Classification | Correct rule / correction | Origin | Likely to recur? |
|---|---|---|---|---|---|---|
| 1 | CA2-T07 t4 | "Hint: verbs ending in **-ch** add **-es**, like **go → goes**." | **Confirmed factual error** (example contradicts the rule) | The -ch rule is right (watch → watches); *go* takes -es because it ends in **-o**. Correct: "verbs ending in -ch add -es, like *catch → catches*". The tutor stated the -o rule correctly in t2 ("a verb ending in -o adds -es. Example: I do → he does"), so t4 also contradicts its own earlier turn. | Generated | Yes: a rule-example mismatch, carried over from the previous turn's example |
| 2 | AA1-T06 t3, TA1-T06 t3, CB1-T06 t3 | "Only one word changes:" / "Only one thing changes:" above *This is my brother. He…* / *This is my grandmother. She…*; *father/He* vs *aunt/She*; *has eaten fish* vs *ate fish two days ago* | **Misleading explanation** (the claim about the pair is false) | Two elements change in each pair (noun + pronoun; verb form + time phrase). Correct: "The family word and the pronoun change together" / "When we add a finished time, the verb changes to past simple". | Generated **in response to prompt text**: the `repeated_misconception_strategy_shift` move asks for "a contrasting pair on a different example **that differs only in the point they keep missing**". The model asserts the property it was asked to achieve but could not achieve. **3 of 3** strategy-shift turns in the run contain the false claim. | **Yes, systematic** (HIGH confidence) |
| 3 | TA2-T06 t3 | "Look at this pair: I **eat** … / She **eats** … Only the verb changes." | **Misleading explanation** | Subject and verb both change; the point is that the verb changes **because** the subject is *she*. | Generated (`flagged_error_not_repeated` path; same pattern as #2) | Yes |
| 4 | AA2-T11 t1 | "Notice the present simple here: **it** + verb with **-s** (it **works** / it **doesn't work**)." | **Misleading explanation** | In negatives the -s moves to the auxiliary: *it doesn't work* = does + base verb. Correct: "it works; in the negative, it doesn't work (the -s is on *does*)". | Generated, inside an off-topic redirect frame | Plausible whenever a negative is cited as an example of the affirmative -s rule |
| 5 | CA2-T03 t2 | "The words **"she"** and **"go to bed late"** are a good start." (learner wrote "Yesterday she go school and every day she went to bed late.") | **Misleading explanation** (misquotation) | The learner never wrote "go to bed late"; the praise credits the erroneous *she go*. Correct: quote exactly ("*to bed late* is fine; look at *went* with *every day*"). | Generated | Plausible in multi-error learner sentences |
| 6 | TA2-T03 t2 | "\"went to bed late\" is a real habit to describe." | **Context-dependent statement / misleading** | It praises the content (a habit) while the form (*went*) is wrong for a habit. The same turn later rejects *went*, which limits harm but sends a mixed signal. | Generated | Possible |
| 7 | TA2-T07 t4 | "*watch* ends in **-ch**, so it follows the same rule as *go* → *goes*" | **Acceptable simplification** | Both take -es with he/she/it, so "same rule" is true at the level of the ending. The trigger differs (-ch vs -o), but nothing false is taught. | Generated | — |
| 8 | AA2-T06 t2 | "With he, she or it, the verb needs one extra letter at the end." (item: *get*) | **Context-dependent statement**; reviewer false positive | True for *get → gets*. It would be wrong only for -es verbs, which are not in this item. | Generated | — |
| 9 | CB1-T04 t2 | "Without \"last year\", we use **have/has + past participle**." | **Acceptable simplification** in this lesson context | For an unspecified-time life experience (the lesson's point) this is the rule. Past simple without a time word is possible when a time is implied. Not misleading for the task set. | Generated | — |
| 10 | AB1-T03 t2 | "('I never have seen her…'), which has a word-order problem." | **Acceptable / reviewer false positive** | *I have never seen* is the standard order; *I never have seen* is marked and rare. Calling it a word-order issue at B1 is reasonable. | Generated | — |
| 11 | AB1-T08 t2 | "With places, English often uses **\"been to\"** instead of *visited*." | **Acceptable simplification**; reviewer false positive | A usage tip with "often"; *have visited* remains correct. | Generated | — |
| 12 | AB1-T13 t2 | "Its past participle is *gone* (for experiences, we often use *been*)." | **Factually correct** (the problem here is answer leakage, see B2, not accuracy) | — | Generated | — |
| 13 | TA1-T02 t1, AA1-T02 t1 | "**sister** = a girl … with the **same mother and father** as you" | **Acceptable simplification** at A1 | Half-sisters are also sisters; for an A1 definition this is a standard simplification. | Generated | — |
| 14 | CA2-T01 t1 | "**always** = every day, no exceptions" | **Acceptable simplification** in context | "always" = at all times or on every occasion. In a daily-routine sentence the gloss is accurate enough. | Generated | — |

**Totals:**
- **1 confirmed factual error** (#1).
- **6 misleading statements** in 6 turns of 6 cases (#2–#5; #2 has three instances).
- **1 context-dependent mixed signal** (#6).
- **The rest are acceptable simplifications, context-dependent but correct, or reviewer false positives.**
- **No statement teaches an error that would make the learner's target sentence wrong.** None is critical.

## 2. Root-cause analysis

1. **Prompt-induced false claim** (`TUTOR_PROMPT`, verified):
   - The strategy-shift text demands a minimal pair "that differs only in the point they keep missing". For he/she, a minimal pair cannot differ in only the pronoun (the noun must change too).
   - The model satisfies the form of the instruction by **saying** "only one word changes". This is the one finding where a fixed prompt sentence directly produces a factual misstatement.
2. **Rule-example inconsistency** (generated): #1, #3, #4. The example given for a rule does not instantiate that rule.
3. **Quotation drift** (generated): #5. The tutor paraphrases the learner's words inside quotation marks.

## 3. Practical accuracy controls (no new AI calls)

| Control | Where | Cost | Addresses |
|---|---|---|---|
| Reword the strategy-shift instruction: "a contrasting pair on a different example. Say exactly what changes between the two lines; don't claim only one thing changes unless that is literally true." | `moveText`, `languageTeachingContext.ts` (`repeated_misconception_strategy_shift` branch) | None | #2, #3 |
| Add one line to the always-on block: "Every example you give for a rule must follow that rule. Don't use a negative or a question as an example of an affirmative rule. Quote the learner's words exactly or not at all." | `renderLanguageContextPrompt` "Always:" line | Prompt tokens only | #1, #4, #5 |
| Explicit uncertainty: "If you are not sure a usage note is always true, say 'usually' or keep to the lesson's own examples." | Same line | None | #9–#11 class |
| Deterministic post-check (telemetry first, not blocking): (a) when a reply contains "only one (word\|thing) changes" followed by two list lines, diff the lines and flag if more than one token differs; (b) when a quoted span is attributed to the learner (*"you wrote …"*, a bold-quoted phrase in feedback), check it is a substring of the learner's last message. | New pure function next to `flaggedErrorSpans` in `languageTeachingContext.ts`, called in `tutor.controller.ts` after the reply, logged in `meta.languageTurn` | Local regex/diff, no AI | #2, #3, #5 measured in production |
| Do **not** add a grammar knowledge base or a second model call per turn | — | — | Out of proportion: about 7 misleading statements in 219 turns |
