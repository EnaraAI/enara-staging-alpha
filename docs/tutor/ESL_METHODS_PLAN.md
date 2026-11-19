# Plan: lesson shapes and kids pack

19 Nov 2026. Tutor track, `claude/tutor-*` branches only, lms-test only. Waiting for "go". Background: `ESL_METHODS_COMPARISON.md`.

## Goal

Move the tutor from grammar study only to the four strands and the four lesson shapes that ESL certificates use, and give kids a real young-learner lesson.

## Steps

1. **Lesson shapes** (engine switch `lessonShape`, off by default)
   - Present, practise, produce: beginners and kids (today's default).
   - Test, teach, test: adults; a 3-item check first, teach only the gaps.
   - Task-based: B1+ or adults with a goal; avatar role-play, then fix 1–2 errors.
   - Listen-and-do: kids; story or chant, then tap tasks.
   - The planner picks a shape from age band, level and goal.
2. **Missing strands** (switches `fluency`, `input`)
   - Fluency: a short timed repeat of known language at the end of a lesson.
   - Input: a graded 60–100 word text or avatar audio per lesson.
   - Lexical chunks added to vocabulary lessons.
3. **Kids pack** (switch `kidsPack`, Enara Kids only)
   - Pre-A1 outcome set (about 20 can-dos).
   - Tap and drag "listen and do" tasks with picture cards.
   - Avatar chants and 4–6 line stories using the lesson's words.
   - Scaffolding on; fix the child length conflict (A1 45–70 words vs 8-word limit).
   - Uses the existing stars, stickers and streak.

## How we test (simulator can't score these)

| Check | Who | Pass mark |
|---|---|---|
| Grammar no-harm | ESL6 design, ESL7 style, vs P+ | Not worse than P+ |
| Age fit | Opus judge, 60 kids lessons | ≥ 90% fit for age |
| Task done | Opus judge, 60 role-plays | ≥ 85% task completed, errors fixed |
| Teacher review | 1–2 CELTA/TKT teachers, 20 lessons | Meets the criteria, no big issues |
| Real pilot | Small group on lms-test, after the above | Separate plan, separate "go" |

## Order and cost

1. Kids pack first (biggest gap), then test, teach, test, then task-based, then fluency and input.
2. Each step: code + unit tests, then the checks above in small batches. Sonnet for tutors, Opus for judges only. Roughly 150–250 agent runs per step.
3. One short report per step. Keep a switch only if it passes.

## Not in this plan

ESL7 grammar switches, avatar latency, ESL6b, the real-learner pilot. Those stay as already planned.

---

# Plan: planner as a code rule table

Waiting for "go". Comes before the lesson shapes above, so the shapes are built as rows of the table.

## Today

- **Code:** `selectTeachingPlan` (`pedagogyPolicy.ts`, ped-v2) picks the method from the 23 with no AI call; `selectLanguageMoves` + `esl5Adjust` pick per-turn moves.
- **Model:** only receives the chosen method's instructions as text and writes the reply. Nothing checks live that it followed them.
- **Gaps:** no lesson-shape layer; rules are an if/else chain, not a table; tested only inside broader tests; two layers (plan, moves) can disagree.

## Steps

1. **Signals** (one typed object, all from code): age band, CEFR level, mastery, last error type, quick-check result, goal (exam / work / daily life / school), session number, engagement.
2. **Rule table as data** (`lessonPlanner.ts`): each row = conditions → lesson shape + primary method + supporting methods + reason code. First matching row wins; a final default row. Pure function `planLesson(signals)`, no AI, no database.
3. **Two levels:** lesson shape chosen once per lesson; per-turn method and moves (existing ped-v2 + language moves) must stay inside what the shape allows. One owner per decision, no overlap.
4. **Model contract:** the prompt gets only the current shape step + method instructions. The model writes the reply. Existing code checks (two-asks guard, answer protection) stay.
5. **Explainable:** every decision logs rule id, signals and reason. A plain sentence for teachers and parents: "Test, teach, test, because the quick check showed 3 of 5 known."
6. **Switch** `planner2`, off by default; off = today's behaviour exactly.

## Tests

- Table-driven unit test: one case per row.
- Coverage test: every signal combination hits exactly one intended row; no unreachable rows.
- Off-parity test: switch off gives identical plans to today.
- Golden traces: 20 fixed learner journeys, plans snapshotted.
- Simulation no-harm: ESL6 design, planner2 vs current, small batches, Opus judges.

## Later: learning from real learners

- Log every decision with its outcome (next check, delayed test).
- Offline first: estimate which row works for which learner from logged data only.
- Then a bandit that may only choose among methods the table allows for that learner (rules stay as safety rails), with a small exploration share.
- Only with real learners and enough data; separate plan and "go".
