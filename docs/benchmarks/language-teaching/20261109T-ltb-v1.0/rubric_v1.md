# Rubric v1 (`ltb-rubric-v1`), frozen 2026-11-09

SHA-256 of `rubric_v1.json`: `963962bba8b427ea7e15afd5d2b7bc2ad90945fc16fcff6633813941546f0e5b`

Frozen before any model output was generated. Any change needs a new rubric version and a full re-run.

**Scale:** 0 = severe failure or harmful; 1 = major failure; 2 = partially adequate with important gaps; 3 = good and aligned; 4 = excellent and context-sensitive.

## Learner-context fidelity (`learner_context_fidelity`)

Uses the learner facts supplied (estimated level, age band, prior evidence, goal, error pattern) and invents none.

| Score | Anchor |
|---|---|
| 0 | Contradicts or ignores the learner context, or invents facts (level, history, test results). |
| 1 | Major misuse: e.g. treats an estimated level as certain, or ignores a supplied error pattern that is central. |
| 2 | Uses some context but misses an important supplied fact, or makes an unsupported assumption. |
| 3 | Uses the supplied context correctly and invents nothing. |
| 4 | Uses the context precisely, treats estimates as estimates, and adapts to the specific evidence in this case. |

## Lesson alignment and factual grounding (`lesson_alignment`)

Stays within the lesson objective and supplied content; facts about English are correct; no invented curriculum claims.

| Score | Anchor |
|---|---|
| 0 | Factually wrong English or wholly unrelated to the lesson. |
| 1 | Largely off the objective, or claims the course covered things it did not. |
| 2 | Mostly on topic but drifts, or contains a minor factual slip. |
| 3 | On the objective with correct facts. |
| 4 | Tightly aligned, uses the lesson's own items and patterns, clearly separates its own examples from course content. |

## Pedagogical appropriateness (`pedagogical_appropriateness`)

The teaching move chosen fits the situation (explain, model, prompt, hint, correct, extend).

| Score | Anchor |
|---|---|
| 0 | Harmful or counter-productive move (e.g. scolding, misleading). |
| 1 | Clearly wrong move for the situation (e.g. lecture when a hint is needed; answer dump). |
| 2 | A reasonable move but poorly executed or mistimed. |
| 3 | Appropriate move, well executed. |
| 4 | Best-fit move with clear rationale visible in the reply; efficient and engaging. |

## Scaffolding and adaptation across turns (`scaffolding_adaptation`)

Responds to the learner's actual reply; adjusts support up or down; gives a chance to retry; does not give away everything.

| Score | Anchor |
|---|---|
| 0 | Ignores the learner's reply or repeats the same thing regardless. |
| 1 | Weak adaptation: over-helps (gives full answers) or under-scaffolds (leaves a stuck learner alone). |
| 2 | Some adaptation with notable gaps. |
| 3 | Adapts appropriately to the learner's reply and keeps the learner doing the work. |
| 4 | Precise contingent support: changes approach when needed, fades when ready, keeps responsibility with the learner. |

## Age and proficiency appropriateness (`age_proficiency_fit`)

Language level, length, examples, tone and assumed autonomy fit the age band and CEFR level (without stereotyping).

| Score | Anchor |
|---|---|
| 0 | Unsuitable for the learner (e.g. far above level, inappropriate tone). |
| 1 | Mostly mis-pitched in level or tone. |
| 2 | Partly fits; some vocabulary/length/tone problems. |
| 3 | Fits the level and age band. |
| 4 | Excellent fit: comprehensible at level, age-appropriate examples and tone, right length. |

## Formative check and learning evidence (`formative_check_evidence`)

Uses a check or transfer task where useful; distinguishes a correct answer from demonstrated mastery; no invented progress or mastery claims.

| Score | Anchor |
|---|---|
| 0 | Claims mastery/progress without evidence or invents figures. |
| 1 | No check where one is clearly needed, or treats one correct answer as mastery. |
| 2 | A check is present but weak or mistimed. |
| 3 | Appropriate check; makes no unsupported claims. |
| 4 | Well-designed unassisted check or transfer task matched to the objective, with accurate language about evidence. |

## Clarity and accessibility (`clarity_accessibility`)

Learner-facing language is clear, well organised and easy to act on.

| Score | Anchor |
|---|---|
| 0 | Confusing or unusable. |
| 1 | Hard to follow or cluttered. |
| 2 | Understandable but could be much clearer or shorter. |
| 3 | Clear and easy to act on. |
| 4 | Exceptionally clear, concise and actionable. |

## Scoring rules

- Score each dimension separately; never report only a total.
- Score against the case's expectedBehavior and unacceptableBehavior, frozen before any output was seen.
- Multi-turn cases are scored on the whole conversation, with emphasis on the final tutor turn.
- 'n/a' is allowed for scaffolding_adaptation on single-turn cases only.
- Pedagogical scores are automated and provisional unless reviewed by qualified educators.

## Deterministic checks (automatic, not LLM-judged)

- `reply_received`
- `no_direct_identifiers_in_payload`
- `language_context_block_present`
- `expected_move_any`
- `no_mastery_or_percentage_claim`
- `within_word_limit`
- `no_full_answer_before_attempt`
- `off_topic_redirect`
- `clarifying_question`

## Failure categories

- `context_invention`
- `lesson_drift`
- `factual_error`
- `over_helping`
- `under_scaffolding`
- `premature_mastery_claim`
- `level_mismatch`
- `age_tone_mismatch`
- `no_formative_check`
- `ignored_learner_reply`
- `verbosity`
- `boundary_failure`

## Severity

- **critical:** harmful, factually wrong in a way that teaches an error, or privacy issue
- **major:** wrong teaching move or clearly mis-pitched
- **minor:** suboptimal but usable
