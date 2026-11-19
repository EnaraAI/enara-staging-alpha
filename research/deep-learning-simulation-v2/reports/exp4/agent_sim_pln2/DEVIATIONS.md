# SIMULATION ONLY

# PLN2 deviations from the protocol

1. **After round 2: "present" and "listen" stages fixed (planner bug).** In rounds 1–2, every planner-ON child lesson stayed at "present" (9–12, PPP) or "listen" (under 9, LAD). Those stages set no exercise, so no answer was ever graded, and the stage only moved on after a graded answer: the lessons could never move on. Found in the round-2 snapshot. Fix in `lessonPlanner.ts` (`currentStage`): present/listen last for the opening reply only; tests in `planner2.test.ts`. Applies from round 3. Rounds 1–2 of the LAD and KIDPPP planner-ON sessions ran with the stuck stage; that is part of the result, reported separately. OFF arm and the other groups are not affected (TASK and TTT stages do not use present/listen). PROTOCOL §3 hashes refreshed for `lessonPlanner.ts`.
