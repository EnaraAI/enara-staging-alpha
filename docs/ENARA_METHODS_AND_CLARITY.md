# The 23-method teaching plan, and what it means for explanation clarity

*Part 0 of the clarity work (14 Nov 2026). Read-only analysis of `backend/src/services/{strategyRegistry,pedagogyPolicy,learningContext,languageTurnPipeline,languageTeachingContext}.ts` and `backend/src/controllers/tutor.controller.ts`. No code was changed for this document.*

## 1. Where the plan lives and how it reaches the tutor

1. **Registry** (`strategyRegistry.ts`, registry v2): the 23 methods of the Enara Teaching Methods Reference Guide (ids `direct_instruction` … `blooms_guided`, guide numbers 1 to 23) plus five ENARA techniques (`visual_explanation`, `error_analysis`, `guided_practice`, `independent_practice`, `prerequisite_remediation`). Each entry has `promptInstructions`, `roles` (primary / supporting / reinforcement / modifier / system), `switchWhen` signals, `conflictsWith`, and three flags that matter here: `withholdsAnswer`, `givesAnswerLastResort`, `noviceSafe`.
2. **Selection** (`selectTeachingPlan`, `pedagogyPolicy.ts`, decision version `ped-v2`): chosen per turn from the learner's *records*, in this priority order:
   1. teacher-assigned method;
   2. a weak prerequisite → `prerequisite_remediation`;
   3. a lapsed retention check → `retrieval_practice` (+ `spaced_repetition`);
   4. otherwise: evidence-based switching from the previous plan (`mastery_reached`, `no_improvement`, `repeated_errors`); a persistent confirmed misconception → `metacognitive` (+ `think_aloud`); a misconception category → `analogy`/`visual_explanation` (conceptual), `worked_example`/`guided_practice` (procedural or calculation), `error_analysis` (misinterpretation or incomplete reasoning); an application gap → `blooms_guided`;
   5. else by mastery status: not assessed → `formative_feedback`; emerging → `direct_instruction` + `worked_example`; developing → `scaffolding` (+ `metacognitive`, `guided_practice`); proficient → `mastery_learning` (+ `elaborative_interrogation`) or, for discussion subjects with a known grade, `socratic_questioning`; mastered → `retrieval_practice`, `case_based` or `problem_based`.
   Then modifiers are always added (`adaptive_pathways`, `differentiated_instruction`, `formative_feedback`, `blooms_guided` once secure). Methods flagged `withholdsAnswer` (Socratic, inquiry, problem, case, project) are **not usable for novices** (`usable()`), and a method that was tried without improvement is skipped.
3. **Rendering** (`planLines`, `learningContext.ts`): the primary method's *full* `promptInstructions` as one bullet; one line per supporting/reinforcement method (name + description); a readiness line; a feedback line; and, if there are supporting methods, **"If methods disagree… follow the teaching method above."**
4. **Delivery** (`tutor.controller.ts`): the plan text goes into the system prompt as `pedagogy`; the language engine's context (`prepareLanguageContext`) is a separate block and receives `planPrimary`. The two layers share no state.
5. **Arbitration** (`engineV2('arbitration')`, off by default): `arbitratePedagogy` replaces the "follow the teaching method" line with "the language lesson rules (answer-hiding, support level, one step per reply) win; the method decides how you explain". The language context additionally gets `ARBITRATION_LINE` and, for `direct_instruction` and `worked_example` when an exercise is being presented, `EXPLICIT_FIRST_LINE` (allows a two-sentence rule and one modelled example with words from no exercise **before** the first try).

**Without `arbitration` the two layers contradict each other:** the plan says the method wins, the language engine says the answer-hiding rules win. This is gap G10 in the deep dive.

## 2. The language engine's own "do not state the rule" habit

Two places in the language engine withhold rules, independently of any method:
- `MOVE_TEXT.present_lesson_item`: *"No rule, no reminder and no example before their first try (not even with a different word)"*.
- `HINT_LADDER` level 1 (attention cue): *must not reveal the rule, the correct form, or which option fits*; levels 2 to 4 only allow the rule "in general terms", a leading question, or a frame with the slot blank. A worked example comes at level 5, the rule is taught outright only after repeated misses (`TEACH_RULE_V2`, `wrongAnswer`) or on the `clarity`/`hints` switches.

These are the "Socratic habit" the clarity gap is suspected to come from. They also give ENARA its answer-protection strength.

## 3. Method by method

"States the rule?" = does the method's own instruction have the tutor say the rule/idea outright, and when. "Conflicts with never-give-answer?" = could following the method literally put the answer to the open item in the reply (a conflict is resolved by the language guards, and by `arbitration` when on).

| # | Method | States the rule explicitly? When? | Conflict with "never give the answer"? |
|---|---|---|---|
| 1 | direct_instruction | **Yes, first**: explain in steps, model one complete example, then guide | Yes if it models the open item; needs a different example (`EXPLICIT_FIRST_LINE`). `givesAnswerLastResort`. Novice-safe. |
| 2 | socratic_questioning | **No, never**: "do not state the answer or call a reply wrong" | No (`withholdsAnswer`). Biggest clarity risk: no rule is ever stated by the method. Not usable for novices. |
| 3 | scaffolding | Late: only after prompt, strategy hint, conceptual clue, first step; full step last resort | Partial answer / full step at the end of the ladder. `givesAnswerLastResort`. |
| 4 | mastery_learning | When re-teaching a failed sub-skill "in a different way" | Re-teach may reveal; `givesAnswerLastResort`. |
| 5 | inquiry_based | No: learner draws the conclusion from evidence | No (`withholdsAnswer`). |
| 6 | problem_based | No: "do not solve it for them" | No (`withholdsAnswer`). |
| 7 | case_based | After a decision: reveals outcome, asks which principle it shows | No (`withholdsAnswer`). |
| 8 | project_based | No | No (`withholdsAnswer`). |
| 9 | retrieval_practice | After a failed recall: "give it briefly and ask them to say it back" | Gives the item after cued try; `givesAnswerLastResort`. |
| 10 | spaced_repetition | No new statement; revisits due items | No. |
| 11 | interleaving | No; asks which problem type this is | No. |
| 12 | worked_example | **Yes, first**: solve one completely, every step, then fade | Yes if it solves the open item; needs a different example. `givesAnswerLastResort`. Novice-safe. |
| 13 | elaborative_interrogation | After a correct answer: asks why; explains fully only as last resort | Overridable fallback only. |
| 14 | analogy | **Yes, via the mapping** ("this part is like that part") | No. Novice-safe. |
| 15 | metacognitive | No: asks about task and strategy | No. |
| 16 | think_aloud | Yes when demonstrating (first person narration) | Only if it demonstrates the open item. |
| 17 | concept_mapping | No: built from learner answers | No. |
| 18 | differentiated_instruction | Modifier (simpler words, concrete examples at low readiness) | No. |
| 19 | adaptive_pathways | System: follow the learning focus | No. |
| 20 | formative_feedback | Names the error and the next action ("this needs X, not Y") | Mild: "needs X" can reveal the form. |
| 21 | gamification | No | No. |
| 22 | narrative_contextual | Teaches the idea inside a scenario, after the need is clear | No. Novice-safe. |
| 23 | blooms_guided | No: moves up levels; if application fails, "explain in your own words" instead of re-teaching | No. |
| – | visual_explanation (technique) | Yes: explains with a visual, then a question | No. Novice-safe. |
| – | error_analysis (technique) | After the learner finds the mistake: "explain the correct approach" | Shows a *different* wrong answer first. |
| – | guided_practice | No; hint only on request or after a wrong attempt | No. `givesAnswerLastResort`. |
| – | independent_practice | No; no hints | No. |
| – | prerequisite_remediation | Yes: teaches the prerequisite briefly | No. Novice-safe. |

**Reading for clarity.** Of the 28 entries, only direct instruction, worked example, analogy, visual explanation and prerequisite remediation (and think-aloud when demonstrating) state the idea first. Eleven methods (Socratic, inquiry, problem, case, project, retrieval, interleaving, concept mapping, metacognitive, gamification, independent practice) never state it or state it only after the learner fails. In a language lesson, where the lesson item is a form to produce, those methods reinforce the engine's own try-first habit; the plan and the engine both push toward "ask, don't tell".

## 4. What was and was not tested before

- Experiments 2 to 5 and every agent study so far gave the tutor **only the language-engine instructions** (`prepareLanguageContext`), or in the real-route experiments the plan with research-seeded evidence that selects one of only a few methods (emerging → direct_instruction + worked_example; proficient → mastery_learning + elaborative_interrogation; no evidence → formative_feedback). The full plan across methods was never compared with plain.
- `arbitration` was unit-tested and tried in Experiment 5c (39 triplets, uninformative) but never in an agent study.

## 5. Consequences for the new switches (Part 1)

- `ruleFirst` must run **inside** whichever method is selected and must not change the selection: it adds a first-exposure step (rule ≤ 20 words, one right and one wrong example, then apply to the item), styled by the method's mechanism, tracked once per rule per session.
- `shortRecap` replaces the closing "tell me the rule in your own words" ask with "rule in one line + one new example from the student", once per session.
- `socraticOff` is a research-only ablation of the two "no rule before the first try" instructions in section 2; answer-hiding stays.
- None of these touch `selectTeachingPlan`; all stay behind switches that are off by default.
