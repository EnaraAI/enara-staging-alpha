# planner2: report (step 2)

19 Nov 2026. Branch `claude/tutor-planner2` (from `claude/tutor-teaching`). Switch `ENARA_ENGINE_V2=planner2`, off by default. Agent runs used: 0.

## What was built

- **`lessonPlanner.ts`**: the approved table in code. Shape rules S1–S6 (with S2a/b/c: listen-and-do only for Pre-A1 or children under 9). The method table for the 23 methods + 5 techniques. The ★ gates. Pure function `planLesson`, no AI, no database.
- **`pedagogyPolicy.ts`**: today's method rules rewritten as rows (`METHOD_RULES`). Each decision names the row that chose it.
- **Order:** shape first, then the first method row whose choice has a stage in that shape and passes the gates. Skipped choices are logged.
- **Stage set by code:** `currentStage` reads the session's graded answers. Voice has no turn history, so it gets "start with the first stage" instead.
- **Logged on every decision:** shape, shape row, method row, planner version and one plain sentence, e.g. "Listen and do because a child under 9; main method Scaffolded Instruction because: …".

## Tests (183 pass in the planner and parity suites; full backend 1,177 pass)

| Test | Result |
|---|---|
| Off-parity: today's plans byte-identical after the rewrite (6,000 seeded cases × 7 switch sets) | Pass |
| One case per row: 17 shape cases, 22 method cases, ★ gates | Pass |
| Coverage: 7,000 signal combinations → exactly one shape row; every row reached; listen-and-do only for Pre-A1 or under 9; children never task-based or test-teach-test | Pass |
| Invariants over 1,500 cases × 9 learner profiles: main method fits the shape, gates hold, valid composition, children get scaffolding | Pass |
| Unchanged except ★: when today's method fits the shape, planner2 picks the same one (3,000 cases) | Pass |
| Stages and progress from graded answers | Pass |
| 20 golden learner journeys (snapshot) | Pass |

The only failing backend tests need a MongoDB download, which this container can't reach. No assertion fails.

## No-harm check (ESL6 learners, ESL5 setting)

| ESL6 learners | Shape | Today → planner2 |
|---|---|---|
| A1 not assessed | PPP | worked example + think-aloud → same |
| A2 not assessed / emerging | PPP | worked example + think-aloud → same |
| B2 proficient | PPP | mastery learning + elaborative, retrieval → same |

- **0 of 282 learners have a changed plan,** so per the agreed rule there is nothing to simulate (0 agent runs).
- **The one difference** is 2 new prompt lines: the shape and the current stage.

## Gaps to know

- **Missing live signals:**
  - There is no learner goal or quick-check record yet, so task-based and test-teach-test can't fire live; teens and adults get PPP.
  - Age under 9 needs a staff-entered birth date. A child with an unknown exact age gets PPP with child supports.
  - Arabic-transfer errors need a new error category (`l1_transfer`); the rule is ready.
- **Two small readings of the table, both shown in the tests:**
  - Retrieval may also be the main method in PPP "Check", for mastered learners.
  - Supporting methods follow the main method's stage, filtered by the ★ gates only.
