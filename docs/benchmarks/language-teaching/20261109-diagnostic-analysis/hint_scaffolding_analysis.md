# B2: Hint leakage and over-helping

**Inputs:**
- the 33 `over_helping` tags in the sealed independent review (30 minor, 3 major);
- for each, the tagged tutor turn, the preceding learner turn and the engine's recorded moves and reason codes (`raw_results.jsonl`);
- the prompt texts that produced those turns (`languageTeachingContext.ts`: `MOVE_TEXT`, `HINT_VARIANT`, `moveText`; `strategyRegistry.ts`: `scaffolding.promptInstructions`; `directTutorModel.ts`: `PROACTIVE_TEACHING`).

Each instance below was classified by reading the transcript. The tag alone was not taken as evidence.

## 1. Classification of all 33 tagged instances

| Class | Count | Instances (case, turn) |
|---|---:|---|
| **LEAK**: the hint states the target form, or the item becomes copying | 8 | AB1-T06 t2, AB1-T13 t2, CA2-T05 t2, CB1-T04 t2, TA1-T13 t2, TA2-T05 t2, TA2-T07 t2, TA2-T13 t2 |
| **NEAR-REVEAL**: a strong cue used too early on a binary or single-morpheme item | 8 | AA1-T13 t2, CA1-T06 t3, CA1-T12 t1, CA1-T13 t2, CA2-T08 t3, TA1-T06 t3, TA1-T12 t1, TA2-T08 t3 |
| **LEGITIMATE ESCALATION**: stronger support after a repeated or persisting error | 5 | AA1-T07 t4, CB1-T07 t4, TB1-T07 t4, TA2-T06 t3, TA2-T12 t1 |
| **DESIGNED**: first-turn instruction, or sentence frames on an off-topic redirect as the move text instructs | 6 | AA1-T01 t1, AA1-T13 t1, AA1-T11 t1, AA2-T11 t1, AB1-T11 t1, TA2-T01 t1 |
| **NOT OVER-HELPING**: progression after a correct answer, the learner's own words reused, or a non-target slip | 6 | AA2-T03 t2, AA2-T08 t2, AB1-T07 t3, CA1-T04 t2, CA2-T08 t2, TB1-T04 t2 |

**Confirmed leakage or premature near-reveal: 16 instances in 16 cases.** The other 17 tags are legitimate scaffolding, designed behaviour, or not over-helping. Of the three "major" tags:
- **TA2-T13 and AB1-T13 are confirmed leaks.**
- **CA1-T04 is not:** the retry frame "This is my ___. He is twelve." contains only the learner's own words.

### Exact evidence (leak and near-reveal)

| Case | Turn type (engine reason) | Tutor text that leaks | What the learner had to do afterwards |
|---|---|---|---|
| TA2-T13 | `answer_requested_before_attempt` | "*have* → **has** (this one is irregular!) … **go** needs **-es**" | Write "has" in the gap |
| AB1-T13 | `answer_requested_before_attempt` | "Its past simple is *went*, and its past participle is *gone* (for experiences, we often use *been*)" | Copy the four given forms |
| TA1-T13 | `answer_requested_before_attempt` | "A brother is a boy, so use **He**." | Nothing for the he/she criterion |
| CA1-T13 | `answer_requested_before_attempt` | "**Father** is a man. … he = boy or man" | A binary choice that was already resolved |
| AA1-T13 | `answer_requested_before_attempt` | "Is a mother a man or a woman? Write He or She." | Binary choice (mild) |
| CA2-T05 | `answer_to_instruction` | "look at *go*. With **she**, it needs **-es**." | Write "goes" |
| TA2-T05 | `answer_to_question` | "*go* … takes **-es**." | Write "goes" |
| TA2-T07 | `answer_to_instruction` | "Careful: *go* takes **-es**" | Write "goes" |
| AB1-T06 | `answer_to_question` | Hint model "*I **went** to Paris last year*", directly after "have gone … last summer" | Substitute "went" |
| CB1-T04 | `answer_to_question` | "the past participle of *be* is **been**, so think about **been to**" | Write "I have been to Aswan" |
| CA1-T12 / TA1-T12 | `unprompted_learner_sentence` | "Is your sister a boy or a girl? Which word do we use for a girl, he or she?" | Binary choice |
| CA1-T06 / TA1-T06 | `repeated_misconception_strategy_shift` / `recurrence_unknown` | Contrast pair ending "grand**mother**. **She** is old." / "aunt. **She**" placed directly above the item "This is my mother. ___" | Copy "She" |
| CA2-T08 / TA2-T08 | `recurrence_unknown` (after two correct answers) | "It changes to a short word with 3 letters" / "Think: *I have* → *she ___*?" | Write "has", the third presentation of the same item |

## 2. Root causes (verified against prompt text and engine state)

1. **No stated limit on what a hint may contain** (`TUTOR_PROMPT`, HIGH).
   - `HINT_VARIANT.answer_requested_before_attempt`: "give one hint matched to the task (a cue, a sentence starter or a contrast)". `MOVE_TEXT.corrective_feedback_retry`: "give one hint aimed only at the gap".
   - Neither says what must stay hidden. When the gap is one morpheme (-es) or a binary choice (he/she), a hint "aimed only at the gap" **is** the answer.
   - 9 of the 16 instances are corrective-feedback hints of this kind, and 5 are answer-request hints.
2. **No hint state** (`CONVERSATION_STATE`, HIGH).
   - The engine counts `attemptsOnTask` (`languageTeachingContext.ts:477`) and error recurrence, but records no hint level.
   - Each turn's prompt says "one hint", with no indication of the hint already given. The first hint can therefore be as strong as the last.
   - The ped-v2 `scaffolding` strategy already describes a ladder in prose (`strategyRegistry.ts:107`: "a prompt to recall … a strategy hint, a conceptual clue, the first procedural step, a partial answer"), but nothing tracks the rung. It reaches the tutor in only 45 of 219 turns (the turns whose plan primary was `scaffolding`).
3. **The strategy-shift instruction invites adjacent answer models** (`TUTOR_PROMPT`, HIGH).
   - `moveText` for `repeated_misconception_strategy_shift`: "a contrasting pair on a different example that differs only in the point they keep missing".
   - For he/she this produces a pair whose second line contains the answer pronoun, next to the item (CA1-T06, TA1-T06, AA1-T06). The same instruction also produces the false "only one word changes" claim; see `grammar_accuracy_audit.md`.
4. **Item design** (`CURRICULUM_CONTEXT`, MEDIUM).
   - At A1/A2 the targets are binary (he/she) or single-morpheme (-s/-es, has). The distance between a conceptual cue and the answer is very small, so the ladder must start lower (an attention cue) for such items.
   - **By CEFR:** 13 of the 16 confirmed instances are A1/A2 and only 2 are B1 (AB1-T06, AB1-T13).
5. **Instruction stacking** (`TUTOR_PROMPT`, LOW, **unconfirmed hypothesis**).
   - Three layers address hints with no stated precedence:
     - the base prompt (`PROACTIVE_TEACHING`: "name the specific mistake and give a smaller next step");
     - the ped-v2 strategy text;
     - the language move text.
   - **No transcript evidence isolates its effect.**

## 3. Proposed hint ladder (for a future implementation)

**Principle:** the learner does the step the item is testing. Each rung reveals strictly more than the previous one. The rung is chosen by **engine state**, not by the model's mood:
- number of hint or feedback turns already spent on the current item;
- whether the error recurred;
- whether the learner asked for the answer after trying.

The number of attempts is **not fixed**. Escalation follows evidence: a repeated identical error, an explicit "don't know" or answer request after an attempt, or a correct sub-step that unlocks the next one.

| Level | Purpose | May reveal | Must not reveal | Learner action expected | Move to next level when | Stop hinting, explain directly when |
|---|---|---|---|---|---|---|
| L1 Attention cue | Point to where the problem is | The location ("look at the verb after *She*") | The rule, the form, the answer | Re-examine and retry | The retry shows the same error, or "don't know" | — |
| L2 Conceptual cue | Recall the rule | The rule in general terms ("with he/she/it the verb changes in the present simple") | The specific form for this item, a solved example of the same word | Apply the rule | The same error recurs after the rule was recalled | — |
| L3 Partial structural cue | Organise the answer | A frame with the tested slot blank ("My dad ___ TV"); the subject→pronoun mapping if that is **not** the tested component | The tested slot; a model sentence of the same word | Fill the tested slot | The slot is still wrong | — |
| L4 Targeted support | Expose one missing component | One component that is not the whole answer (e.g. "*watch* ends in -ch") | The completed form ("watches") | Produce the form | The component is still not produced | — |
| L5 Worked example | Show the pattern on a **different** word or item | A full parallel example (e.g. *catch → catches*) | The item's own answer | Transfer to the item | Transfer fails | After L5 fails, go to L6 |
| L6 Explicit explanation | Teach directly | The answer with its reason in one or two sentences | Mastery claims | Do a **fresh** similar item unaided | — | Always followed by a new item, never the same one |

**Entry rules:**
- **Answer requested before any attempt** (T13): start at L1 or L2, never higher. On a binary item, L1 only ("look at the family word") and **no** pairing of noun class with pronoun. Promise the answer after one try (already in `HINT_VARIANT`).
- **First error on the tested component:** L1, or L2 at A1 where L1 may be too implicit. A **surface slip** outside the target is mentioned in a few words and gets no ladder.
- **Repeated identical error:** move up one level. The existing r2 strategy shift (`reteach_simpler`) maps to L3/L5 on a different example, **never** a pair ending in the item's answer form.
- **"Don't know" or confusion:** at most L2, then L3 on the next turn.
- **CEFR:**
  - A1: L1 may be skipped in favour of L2 with a very short rule.
  - B1: prefer L1 or L2 plus "self-correct".
  - The ladder is the same for all age bands. Only the wording register differs.
- **When the learner has shown success on the component elsewhere** (the B1 answer-class table): no hint for that component.

## 4. Teen cases

- **By cohort:** 7 of the 16 instances are teen (TA1-T06, TA1-T12, TA1-T13, TA2-T05, TA2-T07, TA2-T08, TA2-T13), 6 child, 3 adult.
- **Teen A2 (TA2) has 4 instances; adult A2 (AA2) has none.**
- **Possible link to register text:** the teen text says "up to two steps at a time" (`AGE_REGISTER.teen`), and two-step hints (rule plus application) occur in TA2-T05, TA2-T07 and TA2-T13.
- **This is a hypothesis, not a confirmed cause.** n is small (9 TA2 cases), child A2 shows the same pattern (CA2-T05, CA2-T08), and register was rated appropriate in 39/40 teen cases.
- **No evidence supports a teen-specific hint system.** The same ladder applies to every band.
