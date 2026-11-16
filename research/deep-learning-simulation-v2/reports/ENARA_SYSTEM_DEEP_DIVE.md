# ENARA tutor system: deep-dive gap report

*14 Nov 2026. Read-only review of `backend/src` (no production code changed). Three independent code reviews, plus two checks I ran myself, cross-checked against the Experiment 2–4 evidence. Labels: **confirmed** (read in code or measured), **likely**, **hypothesis**. Simulation evidence is about AI learners only.*

## The headline

The experiments said ENARA does not beat a plain AI tutor. The code review explains *why it should not be expected to* yet: several of the mechanisms ENARA is supposed to add either **cannot fire** or **do not exist in production**, while the system pays about 3.8× the input tokens for a prompt that is **never cached**.

## Gaps, ranked by likely impact on learning

### G1. "Teach the rule after repeated misses" cannot fire on wrong answers (confirmed; I verified it)
`supportStage` (`languageTeachingContext.ts:1099-1105`) has a branch `answeringCheck && keyVerdict && !ok && tries >= 1 → teach_rule`. But `keyVerdict` comes only from `evaluateAgainstKey` (`languageLearningState.ts:264`, comment: "Only ever returns a success verdict"), which returns `'CORRECT'` or `null`. So that branch is unreachable. The only live path to `TEACH_RULE` is `!answeringCheck && (whyAfterAttempt || hintRequest) && attemptsOnItem >= 2`, i.e. the learner must **ask "why" or ask for a hint** after two evaluated attempts. A learner who just keeps answering wrongly keeps climbing the hint ladder and never gets the rule.
- **Why the unit test did not catch it:** `fix5ExplainThenCheck.test.ts` builds its input with `keyVerdict: 'INCORRECT'`, a value the real engine never produces.
- **Matches the transcripts:** in GR-07 the rule was first stated only after the learner wrote "Can you explain again why it is 'on' for days?" (the `whyAfterAttempt` path), after four turns of hint questions.
- **Correction to my earlier documents:** the gap analysis and capabilities doc said the rule is taught "after the second miss"; that is true only when the learner asks. Those statements should be read with this correction.

### G2. Production has no closing, no coverage plan, no strategy switch (confirmed)
Recap (`CLOSING_RECAP`), criterion coverage and `STRATEGY_SHIFT` exist only behind the research flag. In production there is no notion of session progress, and teaching is planned per **item**, not per **success criterion** (`nextLessonItem` is the first unsatisfied item, `:800`); criteria are only annotated ("shown/not shown", `:1156`). So a criterion can stay untaught (the "in + month" case) and 93% of sessions end without a recap. *Caveat from Experiment 4:* the prompt-level versions of these did not measurably raise learning, so adding them back is not by itself a fix.

### G3. Learner state trusts the model's hidden self-assessment, and failures are silent (confirmed mechanism; likely effect)
State comes from a `[[assess …]]` header the model writes each turn. If it is missing, only success can be recorded (`confirmsCorrect` prose fallback), so `attemptsOnItem` stays 0, the hint level sits at 1, and `teach_rule` is unreachable. If the model wrongly writes CORRECT (for example after conceding "you have a fair point"), the item is marked satisfied, criteria are credited as independent, and the cross-session profile clears the recurring error. The key can never say INCORRECT.

### G4. No tracking of the learner's *belief*; recovery depends on 10 hard-coded English grammar codes (confirmed)
The marker has no belief field. `errorRecurrence` and `diagnoseError` recognise a handful of English grammar patterns; for prepositions, register ("Thanks to a teacher"), vocabulary, reading or functional language the diagnosis is `unknown`, which triggers no cause cue and no strategy change. The same belief on a different item resets item state, so "you keep using X" is impossible. This is the likely mechanism behind belief recovery of 13–15% (plain tutor 19%).

### G5. Nothing tells the tutor to hold a correct position; some text invites hedging (confirmed absence; likely effect)
No instruction covers a learner who repeats a wrong claim. "If you are not sure whether their answer is right, say so and ask them to explain" (`:1209`) and "keep it short and encouraging" can read as "You have a fair point". Our scripted regression check showed current ENARA conceding under five turns of pressure ("Honest answer: yes, 'Thanks' is fine… even to a teacher").

### G6. The prompt is never cached and is large (confirmed by measurement)
I ran three real tutor turns on one lesson: input tokens **2,741, 3,776, 4,079**, with **`cache_read = 0` and `cache_write = 0` on every call**. The only cache breakpoint sits after the first ~500–700 tokens (likely below the model's minimum cacheable prefix, hypothesis), and the large language-context block (~1,300–1,900 tokens, rebuilt every turn) sits after it; its static rule text is re-billed each turn. This is the main source of the 3.8× input-token gap and the 2.2× cost per block. Fixing it needs no teaching change.

### G7. Answer-key matching is exact-string only (confirmed)
Equivalent answers (contractions, a correct answer inside a longer sentence, partial or open answers, functional-language variants) are not matched, so success on those items cannot trigger the rule-in-own-words summary (`summarise` needs `keyVerdict === 'CORRECT'`). Reading, open and functional items therefore rarely reach the summary step, which fits ENARA's weakest domain (reading).

### G8. Tutor-invented follow-up tasks lose all item logic (confirmed)
After an assisted success the tutor writes a "fresh item". Its active item has no lesson id, so there is no key, no diagnosis, no hint-kind limits, no leak guard, no `supportStage` for the rest of that thread.

### G9. Skill coverage is thin; the reading guard is effectively off (confirmed)
`itemKind` knows only reading (prompt starts with "Read"), word, open and form; writing, listening and functional language have no specific logic. For reading, forms that appear in the item prompt (the passage) are exempt from the pre-attempt guard, so quoting the answer sentence is allowed even though a prompt rule says not to.

### G10. Two hint systems and contradictory instructions (confirmed)
The base prompt ("answered wrong twice… slow down", "end with one short question") and the engine ("stop hinting", a 6-level ladder) overlap; strategy text such as direct instruction ("model one complete example") conflicts with the ladder and is patched by a precedence line (`SUPPORT_PRECEDENCE`). The ped-v2 teaching plan and the language engine run in parallel with **no shared state or arbitration**. Level hints are always shown on answer turns "as a ceiling", which may explain repeated hint shapes (hypothesis).

### G11. Learner memory is thin and passive (confirmed)
The cross-session profile stores only counts of ten English error codes. It does not store beliefs, which explanation style worked, per-criterion mastery, vocabulary/topics, or non-English targets. Spaced-review intervals only change optional prose ("include one quick unaided check"); nothing opens a session with a due review. Likely issues: lost updates when chat and voice turns overlap (the array is overwritten without a version check), items outside three code families can never clear an error, no confirmed deletion on student erasure, and the profile is updated before messages are saved.

### G12. Guard and policy weaknesses (confirmed unless noted)
- Over-removal: any bullet containing the target form is dropped even when it is a rule, leaving "Have a go at it first…".
- Leaks missed: plain-prose forms, paraphrases, multi-turn leaks, open writing tasks (no `___` gap), non-Latin script sentence splitting.
- In chat streaming the learner first sees the unguarded text, then a `replace` event (the voice path buffers and is safe).
- Hints-only is a prompt paragraph only; level-6 "give the correct answer" conflicts with it and the voice path caches the policy for 30 s.

## What this means for the evidence

| Observed in experiments | Mechanism found |
|---|---|
| Same hint shape for 3+ turns (21% of sessions) | G1, G4, G10 |
| Rule given late (GR-07), "in" untaught | G1, G2, G8 |
| Recap in only 7% of sessions | G2 |
| Weak reading | G7, G9 |
| Concession to a wrong belief | G3, G5 |
| Belief recovery 13–15% | G1, G4 |
| 3.8× tokens, 2.2× cost per block | G6 |

## Suggested order of work (each needs a test that goes through the real engine, not a hand-built input)

1. **G1** — drive `supportStage` from the stored previous assessment verdict (INCORRECT/PARTIAL) instead of the key; add an integration test where a mocked model returns INCORRECT markers and the second-miss prompt must contain `TEACH_RULE`. Highest value, small change, but the effect on learning is **untested** and Experiment 4's null warns against expecting large gains from prompt-level changes alone.
2. **G6** — restructure the system prompt (static rules first, a breakpoint that clears the minimum prefix, trim per-turn blocks) and verify with a cache-hit probe; pure cost win, no behaviour change to measure.
3. **G4/G3** — add a belief field to the marker and track it across items; require agreement between the marker and an independent check before crediting independent success.
4. **G7/G9** — equivalent-answer matching and reading/writing/functional kinds with their own guards and summaries.
5. **G11** — store beliefs and what worked per learner and schedule reviews; this is the one family a plain tutor cannot match, but a single-session simulation cannot measure it, so it needs the multi-session design.
6. Resolve **G10** (single arbitration between ped-v2 and the language engine) and the guard/policy issues in **G12**.

## What I did not verify

I did not read `confirmsCorrect`, `diagnosisLine` callers, the ped-v2 strategy-selection internals, or run an end-to-end behaviour test for G3, G5, G8 and G12 (they are code-reading findings). The cache result (G6) is measured on three turns of one lesson with the default configuration; minimum-prefix size for the model is a hypothesis.
