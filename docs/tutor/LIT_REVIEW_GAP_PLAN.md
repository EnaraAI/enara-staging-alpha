# Literature review vs the current tutor: gaps and plan (plan only)

20 Nov 2026. Tutor track. **Plan only:** no code was changed, nothing was run and nothing was deployed. All facts below were checked against the current lms-test code (`lms-test-live` at the PR #41 merge, `d8ee5691`). That code runs `ENARA_ENGINE_V2 = …,levelExplicit,esl5,planner2,workOn,sessionMemory,learnerProfile,whatWorks,moodleQuiz`, with planner2-v8 and rule bank rb-v3. The review's "ENARA today" column (written from the 7 Nov report) is ignored.

## 1. Gap table: the review's top 10 behaviours

Evidence column = the review's own strength rating.

| # | Behaviour (evidence) | What the code does now | Gap |
|---|---|---|---|
| 1 | Diagnose the current understanding and the error (High general, medium for L2 chat) | Per turn: `deriveLearningState`, `detectLiveError` (ESL5 Arabic patterns plus 5 planner2 patterns) and the model's hidden `[[assess …]]` line (`languageLearningState.ts`). Across sessions: the learner record (`learnerLanguageProfile.ts`). `planner2` picks a method from misconceptions (`lessonPlanner.ts` `plannerRules`). `workOn` brings assessment errors in (`errorsToWorkOn.ts`). | Error detection is pattern lists, mostly grammar. Lexical Arabic-transfer errors are not detected (see 2.6). Assessment errors from Moodle quizzes carry only "wrong", not the error type. |
| 2 | Specific feedback, then a repair attempt (High; prompts best at low levels) | A hint ladder (`supportStage`), the answer after two genuine tries (`releaseAfterTwo`, `RELEASE_TEXT`), the cue tied to the learner's own error (`liveError`), and the no-praise-on-error rule plus guard (planner2g, `removeMixedPraise`). | Good. One gap: after a release, a new item on the same point is asked for, but no later unassisted check on it is scheduled. |
| 3 | Spaced retrieval and delayed independent checks (High, L2-specific) | `reviewOpen`: the first reply of a later session recalls up to 2 live error types (`reviewOpening`, `REVIEW_OPEN_LINE`). `workOn` opens the next session with errors. An error resolves after 2 independent rights counted once per session (`applyOutcome`), and **the two can come in one day**. `learnerProfile`: back after 7+ days → short review line. | **No schedule.** Reviews happen only if the learner comes back, never at set intervals. Resolving does not require a delay. Nothing re-checks a resolved error later. This is the biggest gap. |
| 4 | Change the strategy after repeated failure (High general) | `releaseAfterTwo` stops the hint loop. `planner2` re-plans each turn. `fadeKnown` fades support only after 2 rights in this session (`sessionRightStreak`). | The planner does not switch method when the **same** error repeats. It re-picks from the same signals, so the same move repeats. |
| 5 | Teach explicitly when needed (High) | `levelExplicit`: rule before the first try for explicit-first learners (`ruleBeforeFirstTryLine`), the rule-bank rule, pair and models (`ruleBank.ts`), worked examples. | ESL6: ENARA stated rules far less often than P+ (45 against 196 by round 2) and fell behind. The rule is stated once; it is not re-stated after a wrong answer on a new item. |
| 6 | Learner self-explanation (High general, medium L2) | `RULE_SUMMARY` / `RULE_CHECK` (after a right answer that followed a mistake, the learner says the rule in their own words); `ownSentence`. | Mostly covered. At A1 it can overload; no check that the explanation was understood. |
| 7 | Comprehensible, level-right input (Medium) | `lengthTarget` (`LENGTH` table by age and CEFR), `LOAD_BUDGET`, `REGISTER`, the age register (`registerLine`). | Children's limits are high (see 2.3). There is no measure of new-word density. |
| 8 | Selective Arabic contrast (Medium) | `ENGLISH_ONLY_RULE` bans Arabic in replies. `P1_L1_CONTRAST` asks for "contrast the English form with how Arabic says it, in one short line" (in English). `profileLines` blocks Arabic comparisons for non-Arabic first languages. | No Arabic text, even when that is the blocker. Owner decision 4.1. |
| 9 | Motivation: autonomy and informative encouragement (Low–medium) | The age register (effort praise), `removeMixedPraise`, interests from `learnerProfile` used in examples. | The learner gets no choice (of topic, example or practice mode). |
| 10 | Summary and preview of the next retrieval (Limited) | `closing` / `shortRecap` / the `reviewOpen` closing item; `sessionMemory` writes a code-built summary and the next session opens with "Start here: …" (`lastSessionLine`). | The summary does not name the next review date (there is no schedule; see 3). |

## 2. Known issues from the review pack

1. **ESL6 status conflict: the final result is the true one.**
   - ESL6 finished on 19 Nov on branch `claude/tutor-esl6` (commit `4bc3d3a5`): **NOT CONFIRMED**, ENARA 0.773 vs P+ 0.786, p = 0.28.
   - Report: `research/deep-learning-simulation-v2/reports/exp4/AGENT_SIM_ESL6.md`. Data: `reports/exp4/agent_sim_esl6/` (`POST.json`, `ANALYSIS.json`).
   - The "paused in round 2" text is an older copy on `claude/tutor-kids-pack`, which the review pack used by mistake. It is fixed in PR #42 (section 1 now has the per-outcome table from the finished run).
   - **Note:** the ESL6 report recommends keeping the ESL5 setting off for learners until a change beats P+. lms-test runs it (your earlier decision). See decision 4.4.
2. **The grader behind `workOn`.**
   - On lms-test `graderV2` is off. The live deterministic grader scored 60.4% on controlled items (round 2).
   - `syncErrors` → `answerWrong` trusts the attempt's points, so false rejects become false "errors to work on".
   - Mitigations now: errors wait for release, and teachers can dismiss.
   - Fix in 3.4.
3. **Children's length.**
   - `LENGTH.child` allows 45–70 words at A1 and 60–90 at A2 (the "about 60, never more than 90" in the prompt).
   - `KIDS_PACK_CHILD_LENGTH` (30–50 / 40–65) is used only with `kidsPack`, which is off.
   - PLN2i: under-9 median 32 words, 9–12 median 37, max 61.
   - The target was 12 words or fewer. Decision 4.2.
4. **Spelling errors have no correct pair.**
   - The pair rule (`PAIR_RULE`) and guard (`removeFalseWrongs`, `misspelling_shown`) forbid a misspelled example.
   - So for "biger" the tutor shows the rule bank's form pair "hotter / more hot", which teaches a different error.
   - Fix in 3.6.
5. **Two tasks in one reply.** The PLN2i adult turn 5 was the engine's closing line added next to "Send the sentence again". That is fixed in planner2g (PR #40: "send / rewrite" count as tasks).
   - The method text still conflicts: `strategyRegistry.ts` formative assessment says "Follow a correct answer with a deeper question", while levelExplicit/planner2 say one task per reply.
   - Fix in 3.5.
6. **"My woman" for "my wife" is not recognised.** The rule bank's family entry lists it as the usual Arabic-transfer error (W2 `lexical_l1_transfer`). Yet in PLN2f, g, h and i the tutor said "'woman' is not a family word" and never gave "wife".
   - `detectLiveError` has grammar patterns only.
   - Fix in 3.7.

## 3. Proposed changes, ranked by likely effect on 7-day delayed learning

Every change gets its own `ENARA_ENGINE_V2` switch, named only (never turned on by `all`) and off by default. Each one is tested twice:
- **Simulation** checks the behaviour on the ESL6 design (30 outcomes, delayed test, against P+).
- **Real learners** check the learning (pilot 4.3).

| # | Change (switch) | What and where | Risk | Test |
|---|---|---|---|---|
| 1 | **Spaced reviews** (`spacedReview`) | A review schedule per learner error and objective: due after 1, 3, 7 and 21 days. Fields on `ErrorToWorkOn` (`nextReviewAt`, `step`), or a `ReviewSchedule` model. Due items open the next session through `reviewOpening` and the learner brief. A review is a new item with no hint and no model before it. **An error closes only after an unassisted right answer at least 2 days after the last wrong** (a gate in `applyOutcome`). Closed errors get one more check at 21 days; a wrong reopens. Optional: a learner/parent "review due" nudge (separate decision). | More sessions start with review instead of new content. Learners who do not come back get no benefit. | Simulation: ESL6b, a 2-session design (session 2 after 7 days) against P+ and against the current engine. Real: delayed tests at 1–2 and 4–6 weeks. |
| 2 | **Rule again after a wrong answer** (`ruleOnWrong`) | When a learner's first answer on a new item is wrong, the reply re-states the rule in one line plus one contrast, then the retry (`languageTeachingContext.ts`, `supportStage` / hint level 1). This is the ESL6 finding (rules 45 vs 196). | Longer replies; less self-discovery for stronger learners (keep `fadeKnown` for them). | Simulation on ESL6 design; check the frequency-adverbs / did-questions / some-any outcomes first (the biggest ESL6 losses). |
| 3 | **Change the move when an error repeats** (`switchMove`) | If the same error code appears twice on one point, the planner takes another method next turn (contrast pair → smaller step → worked example), in `lessonPlanner.ts` `plannerRules`, using the error code from `detectLiveError` or the marker. | Method churn if detection is wrong. | Simulation: stuck runs and the learning curve over rounds. |
| 4 | **Only trusted grades make errors** (`workOnTrusted`) | `syncErrors` creates errors only from (a) choice and exact gap items, (b) answers a teacher graded or reviewed, or (c) a `graderV2` path that passed validation. Other answers are shown to teachers as "check" but never sent to the tutor. | Fewer errors reach the tutor. | Unit and E2E tests with false-reject cases from rounds 8 and 11. |
| 5 | **One task per reply in every method** (`oneTaskMethod`) | With `levelExplicit` or `planner2` on, change "Follow a correct answer with a deeper question" to "then one new item that goes one step further" (`strategyRegistry.ts`, formative assessment). Audit the other methods for two-task wording. | Low. | Prompt test plus a simulation count of two-task replies. |
| 6 | **Spelling pairs that show the pattern** (`spellingPattern`) | For spelling errors, show the correct word split to show the rule ("big → bi**gg**er"; "thin → thi**nn**er") with another word, never the misspelling. Rule bank: add a `spellingModels` field per vocabulary/comparative entry. The pair check allows a hyphenated or bold split. | Formatting noise for children. | Simulation: the PLN2h/i spelling learners (2006, 2045, 2040). |
| 7 | **Lexical Arabic transfer** (`l1Lexical`) | A small lexicon of known Arabic-transfer word swaps per outcome (woman→wife, man→husband, open/close the light, …), taken from the rule bank's `usualError` and LEARNING_RULES W2. `detectLiveError` returns `lexical_l1_transfer` with a cue that names the right English word and why ("in English we say *wife* for a married woman in your family"). | Missed or false matches; keep it to listed pairs. | Simulation: the family-outcome learners; unit tests per pair. |
| 8 | **Short replies for children** (`childShort`) | Per decision 4.2: a new child length row, plus a code trim that keeps the feedback line and the one task when a child reply runs over the limit (`languageTurnPipeline.ts`). | Too little explanation for 9–12. | Simulation: word counts and the teacher score; real pilot (children). |

Not proposed: more Socratic questioning, songs or play for learning claims (the review rates these low).

## 4. Owner decisions

1. **Brief Arabic contrastive support** (today `ENGLISH_ONLY_RULE` bans Arabic).
   - A. Keep English only.
   - B. One short Arabic line allowed only after two failed tries on a diagnosed Arabic-transfer error, for a learner whose first language is Arabic (school profile); then back to English production. Own switch.
   - C. Free Arabic glosses.
   - **Recommendation: B**, behind a switch, measured in the pilot (does the learner then get the next English item right without help?).
2. **Children's word limit.**
   - A. Keep 45–70 / 60–90.
   - B. The kids-pack table (A1 30–50, A2 40–65).
   - C. Under 9: at most 3 sentences of at most 12 words each (about 25–35 words) plus one task, with a code trim; 9–12: table B.
   - D. 12 words per reply for every child.
   - **Recommendation: C.** D leaves no room for feedback plus a task.
3. **Real-learner pilot design.**
   - A. One class, pre/post only.
   - B. Randomise learners within classes: the current engine against the current engine + `spacedReview` (+ `ruleOnWrong`), stratified by age band and A1/A2. 4–6 weeks; unassisted delayed tests at 1–2 and 4–6 weeks, new items, scored blind by trained teachers; consent and assent, a teacher present, data on lms-test only.
   - C. Randomise whole classes (needs many more classes).
   - **Recommendation: B**, analysed separately for under-9, 9–17 and adults. AI judge scores are not used as the outcome.
4. **The ESL5 setting on lms-test.**
   - ESL6 found no advantage over P+ on the delayed test.
   - Options: A. keep it (today); B. turn `esl5` off until a change beats P+ on the ESL6 design.
   - **Recommendation: A for now.** lms-test has test learners only, and planner2 and the fixes since depend on it. Decide before any real-learner pilot.
