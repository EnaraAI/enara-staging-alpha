# Step 0: lesson readiness check (14 Nov 2026, before any session)

**SIMULATION ONLY. AI-simulated learners; nothing here is evidence about real learners.**

`levelExplicit` only works on lessons that have `successCriteria` and items tagged with `criteria`. The three study lessons are **research-only fixtures** (`src/offline/eslFixtures.ts`). No production lesson was read or edited.

| Lesson (target form) | Success criteria | Practice items, all tagged | Every criterion has an item |
|---|---|---|---|
| Articles: a, an and the | 2 | 6 | yes |
| Be in the present: am, is and are (copula) | 2 | 6 | yes |
| Present simple: he, she and it (third-person -s) | 2 | 6 | yes |

Command: `npx tsx ../research/deep-learning-simulation-v2/src/offline/eslStudy.ts ready` (run from `backend/`) → `READY: every lesson has successCriteria and tagged items; no post-test item is a lesson exercise`. It also checks that none of the 144 post-test items (18 students x 2 forms) equals a lesson exercise.

## Dry check: one A2 learner, `levelExplicit` on (arm LE), real engine functions
Command: `... eslStudy.ts dry`. Context built for an A2 learner whose record is "not assessed", for each form, with two openers:

| Opener | Moves chosen | Exercise presented? | Rule line before the first try? |
|---|---|---|---|
| "Hello! I want to practise this lesson. **Can you give me an exercise?**" (all 3 forms) | `present_lesson_item`, `comprehensible_model` | yes | **yes**: "First time this lesson's rule comes up ... This learner needs the rule before the first try", `arbitration` forced on, learner marked explicit-first, the item's answer word is not in the prompt |
| "Hello, I want to practise this topic." (greeting only, all 3 forms) | `activate_prior_knowledge`, `short_explanation`, `comprehensible_model`, `comprehension_check` | no | no |

**Finding (reported, not a failure of the check):** the `levelExplicit` rule-before-the-first-try line is attached to the reply that *presents an exercise*. A learner who only greets and names a topic gets the engine's normal novice path (a short explanation, then a check), in every arm, with no exercise yet. So the rule line only shows up when the learner asks for an exercise, or on the reply to the first attempt. **Study consequence:** the student agents are told to ask for an exercise in their first message, which is how a real learner opens an exercise session; this is written into the protocol. Without that instruction the study would not exercise the switch.
