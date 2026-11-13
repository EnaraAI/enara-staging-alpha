# B4: Context fabrication and lesson drift

**Inputs:**
- the 8 independent `context_invention` tags (7 cases) and 4 independent `lesson_drift` tags;
- the 26 official `lesson_drift` tags;
- the transcripts;
- the runtime context the tutor actually received: `renderLanguageContextPrompt` and `describeCurriculum` in `directTutorModel.ts`, plus the fixture in `run_trusted_age.ts:217`, where the chapter carries `title`, `description = objective` and `languageSpec` only.

## 1. What the tutor knows (verified)

| Context item | Reaches the tutor? | Source |
|---|---|---|
| Lesson title and objective | Yes | chapter `title` / `description` |
| Objectives, success criteria, vocabulary, grammar, functions, skills, course examples | Yes | `sanitizeLanguageSpec` |
| **Case exercise and next item** | **No** | Not a `languageSpec` field |
| Learner's prior evidence (objective status) | Only when a mastery record exists (`objectiveStatus`) | `deriveLearnerContext` |
| Trusted age band, CEFR estimate | Yes, labelled known / inferred | Language block |
| Conversation history | Yes, full | `tutor.controller.ts:229` |

The prompt already separates course content from the tutor's own examples. It says "Your own examples are yours; don't present them as course content", and the curriculum block says "Don't invent content and claim it comes from the course". **There is no rule about attributing words or answers to the learner.**

## 2. Findings

| Case | Tag (evaluator) | What happened | Verdict | Origin |
|---|---|---|---|---|
| CB1-T08 t3 | context_invention, major (independent) | "You switched forms in exactly the right place. **This also answers our dolphin exercise: seen, then saw.**" The learner wrote camel sentences and never filled the dolphin gaps. | **Confirmed**: the tutor presents its own inference as learner evidence | Model-generated; no prompt rule against it; triggered by the fixture mismatch |
| AA2-T11 t1 | context_invention, minor | Sentence frames "The heater in my **flat** … the flat is **very cold**" for the learner's own email. The learner gave neither detail. | **Minor, real**: illustrative details not marked as examples. Low harm (they are frames for the learner to adapt). | Generated inside the `redirect_to_lesson` move, which asks for "a sentence frame they could use" |
| TB1-T13 t1, TB1-T04 t1 | context_invention, minor | "You probably know…" about present perfect with `priorEvidence: null` | **Minor, real**: an assumption about prior knowledge, hedged with "probably" | Generated |
| AB1-T04 t1, CB1-T05 t1, TA1-T04 t1, TB1-T05 t1 | context_invention / lesson_drift | The tutor wrote its own exercise "instead of the supplied lesson exercise" | **Not a product defect.** The tutor was never given that exercise. The evaluators were (`judge.ts` and `blind_review.ts` both include `lesson.exercise` in their case view). | **FIXTURE_OR_BENCHMARK**: evaluator/tutor information asymmetry |
| AA2-T04 t2 | context_invention (independent) | "You fixed the key point yourself." The learner wrote "She go … — sorry, She goes". | **Reviewer false positive**: the self-correction is in the learner's own message | — |
| AA1-T04 t2 | context_invention (independent) | Treats "he is twelve" as about a family member | **Reviewer false positive**: follows from the lesson frame and the learner's text | — |
| CA2-T03 t2 | (factual_error) | Misquotes the learner ("go to bed late") | **Confirmed**: the learner's words are altered inside quotation marks | Generated |
| AA2-T07 t4 | lesson_drift (independent) | Offers "often", which is not in the lesson's adverb list | **Acceptable extension** (a correct, common adverb); rubric v1 gives no threshold | Rubric ambiguity |
| Official T11 lesson_drift (7) | lesson_drift | English frames for the off-topic task (heater email), then a return to the lesson | **Designed behaviour**: `redirect_to_lesson` instructs "Offer one English-language option (e.g. the English words or a sentence frame …)". Whether this counts as drift is a rubric question. | RUBRIC |
| Official T04 lesson_drift (6) | lesson_drift | Mostly the tutor's own exercise instead of the case exercise | Same asymmetry as above | FIXTURE_OR_BENCHMARK |

**Obsolete-question persistence:**
- **Confirmed** in CA2-T08 and TA2-T08: the same item was re-issued three times after the learner had shown the target rules. Covered in B1, `CONVERSATION_STATE` plus `TUTOR_PROMPT`.
- **Not observed elsewhere:** no case shows the tutor continuing a question after the learner moved to a new topic.

**Partial answer mistaken for mastery:**
- **Not observed.** 0 mastery claims were found by the deterministic check, apart from the 3 known regex false positives on the word "mastery" in instructions.

## 3. Origin summary

| Origin | Cases | Confidence |
|---|---|---|
| Benchmark fixture and evaluator asymmetry | AB1-T04, CB1-T05, TA1-T04, TB1-T05, most official T04 drift | HIGH |
| Model-generated attribution or illustrative detail, with no prompt rule against it | CB1-T08, CA2-T03, AA2-T11, TB1-T04, TB1-T13 | HIGH for CB1-T08 and CA2-T03, MEDIUM for the others |
| Designed behaviour judged as drift | official T11 | HIGH |
| Missing lesson context in the product | Not observed: structured lessons reach the tutor intact; the T10 no-lesson cases were handled by the r2 clarify-goal path | MEDIUM |
| Conversation history handling | Not implicated: the full history is passed | HIGH |

## 4. Proposed context-grounding rules (for the language block "Always:" line, `renderLanguageContextPrompt`)

1. **Three kinds of content, never mixed:**
   - **course content** (the lesson block);
   - **what the learner wrote** (this conversation only);
   - **your own examples.**
   Present your examples as examples ("For example: …", "You could write: …").
2. **Never say or imply the learner did, wrote, answered or knows something** that is not in their own messages. Don't say "this answers the exercise" unless they answered it.
3. **Quote the learner's words exactly or not at all.**
4. **Don't assume prior knowledge** without an objective-status record. Use "Let's check…" rather than "You probably know…".
5. **In sentence frames for the learner's own task,** use neutral placeholders ("The heater in my ___ is broken") rather than invented details.

These are prompt-text changes only, with no new state and no AI calls. Rule 2 can be partly measured by the deterministic quote check proposed in `grammar_accuracy_audit.md` §3.
