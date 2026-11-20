# planner2d: three follow-ups from PLN2f (20 Nov 2026)

All three are behind the `planner2` switch (off by default), PLANNER_VERSION `planner2-v5`. No simulation run was made.

## 1. A child's empty answer counts as a failed try (done)

- **Problem (PLN2f):** one under-9 learner (2035) left the gap empty three times. An empty answer was not a "genuine" try, so the answer was never given.
- **Change:** `languageTeachingContext.ts`:
  - `emptyAnswer()` recognises an empty answer: nothing, only gap marks or punctuation, "(empty)" / "I leave it empty", or the item copied back with the gap still open.
  - When the trusted age band is `child`, `genuineFailedAttempts` counts an empty answer as a failed try. After two, the tutor gives the answer with its reason and a new item.
  - "I don't know" is unchanged (it has its own move). Teens and adults are unchanged.
- **Test:** `backend/test/planner2EmptyAnswer.test.ts` (4 tests).

## 2. Lower "teacher would accept" score, adults and under-9s (findings and proposals, no run)

The fit judges scored "teacher would accept" lower with the planner on: adults 1.00 vs 1.58, under-9s 0.83 vs 1.17. These are 11 sessions where the on score was below the off score. Five examples:

| Learner | Group | Judge's reason (short) | What happened |
|---|---|---|---|
| 2029 | under-9 | Labels "I drink milk" as Wrong; rejects "I like to drink soup"; clashing instructions | Turn 5: the tutor set "write one sentence about a food you like", **and** the system appended "Now write one new sentence about a place you visited…" (two tasks). Turn 7: answer-release pair "Right: I like milk. **Wrong: I drink milk.**" The "wrong" sentence is good English. |
| 2027 | under-9 | Tells the child "wife" is not a family word | The tutor treated the lesson word list as closed and rejected "my brother's wife" (tutor behaviour; no engine line asks for this). |
| 2008 | adult | Marks "small and clean" as Wrong; garbled instructions; repeats an item | Turn 4 release pair "Wrong: The hotel is small and it is clean." (good English). Turn 5: two tasks (system fallback appended). Turn 6: "Write one sentence … using **Uses and to add an idea**" (a success criterion pasted into the own-sentence ask). Turn 7: repeats the first task item (fixed in 3 below). |
| 2000 / 2004 | adult | "The work task is dropped and the lesson becomes isolated drills"; "the three-sentence task is not followed up" | After language focus, the "done" stage goes back to single gap-fill items. The real-world task is never repeated (task_repeat 0.92 in both arms). |
| 2026 | under-9 | Turn 4 gives two conflicting tasks | Same system fallback as 2029. |

**Why the on score is lower:** most of these patterns occur in both arms (for example the forced right/wrong pair: 72 on vs 70 off). Three are specific to the planner, or more frequent with it:
- the closed word list (under-9, on only);
- the two-task fallback in under-9 replies (2 on, 0 off);
- task-based lessons that end in drills, which a judge marks down more in a lesson set up as a task.

**Proposed fixes (no run until your "go"):**
- **A. No second task.** `applyReplyGuards` appends the closing fallback only when `learnerAsks()` finds no task. The detector misses tasks like "Now you: write one sentence…" and "Join the two sentences…". Proposal: also treat `taskInvitation(text)` and own-sentence / "Join / Complete / Write" imperatives as a task, so nothing is appended. Code and test.
- **B. Right/wrong pair only when the wrong sentence is really wrong.** `RELEASE_TEXT` always asks for a pair. Proposal: for word-meaning and joining-word points (and any point where the contrast is meaning, not form), ask for the answer with its reason and a new item, and no pair. Otherwise add: "the wrong sentence must be incorrect English, not just a different meaning." Code and test.
- **C. Own-sentence ask uses the point's name.** `OWN_SENTENCE_ASK` pastes a success criterion ("Uses and to add an idea"). Proposal: use the lesson title or the rule-bank point name, and strip a leading "Uses". Code and test.
- **D. Accept right answers outside the list (children).** Add to the child supports line: "Accept any correct word or sentence that fits, even if it is not in the lesson list; then show the lesson word." Prompt only.
- **E. Task-based "done" stage repeats the task.** After language focus, the done stage asks for the same real-world task again with new content, instead of going back to gap-fill items. Planner code and test.

A–C also improve the tutor with the planner off, because those lines are shared.

## 3. Item repeats in the engine's item choice (done)

- **Problem (PLN2f, both arms, 5 sessions):** the tutor was told to present a lesson item the learner had already answered.
- **Cause (session 2012):** the course key for "A chef works in a ___" lists only "restaurant". "kitchen" was graded unclear, and the held-back credit kept the chef item open. The pilot item the tutor showed next was never recorded as open, so "airport" was never credited, and the engine later offered pilot as "next".
- **Change:** `shownLessonItems()` collects every lesson item already shown in the session, whether named by a stored reply or found by its text in a tutor reply. The next item is one not yet shown. If all were shown, no lesson item is offered and the tutor writes a new one on the same point.
- **Test:** `backend/test/planner2ItemRepeat.test.ts` (4 tests). A replay of sessions 2012 and 2045 now gives no item and an unseen item (g2) respectively; before the change it gave v2 and g1.
- **Still open (proposals, no run):**
  - when credit is held back but the reply clearly shows a new lesson item, move the open item to the new one, so later answers are graded against the right item;
  - add "kitchen" to that item's key (content).

## Tests

- New: 8 tests, all pass.
- planner2, kids pack and ESL5 suites pass.
- Two failures exist before this change too: a `graderV2` error-correction case, and the route tests that need the Mongo test database, which this sandbox can't download.
