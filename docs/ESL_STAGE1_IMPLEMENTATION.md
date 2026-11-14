# ESL stage 1: what was built (roadmap changes B, H and A)

*14 Nov 2026. Branch `claude/codebase-review-kbxqan`. Plan: `docs/ENARA_ESL_ROADMAP.md` (sections 0, 2.A, 2.B, 2.H). **No study was run and the API was not called. Nothing here is evidence that any change helps learners.** All three changes are behind switches that are off by default.*

## 1. What was built

Commits, one per step: `28a35cd` (B), `c84ef86` (H), `a725716` (A), then the engine doc.

### Change B: the closing-ask defect (no new switch; fixes `closing` and `shortRecap`)
| Item | Where |
|---|---|
| The ask is never added to a reply that already sets a task. `closing` now has the same `!taskInvitation(text)` check that `shortRecap` already had. | `applyReplyGuards`, `backend/src/services/languageTurnPipeline.ts` |
| A skipped ask is deferred: it is added to the next reply that sets no task (the closing turn stays "open" because `closingDone` is only set once an ask is made). | `applyReplyGuards`, `researchSignals` / `isClosingTurn`, `languageTeachingContext.ts` |
| After `CLOSING_FOLD_AFTER` = 3 deferred replies, the recap is folded into the next task reply as one message: `Rule in one line: <rule>` + `Then your task:` + the reply. | `applyReplyGuards`, `ruleLineFor`, `languageTurnPipeline.ts` |
| Turn evidence records `closingAsk`: `added`, `deferred` or `folded` (tag only). `added` and `folded` end the closing; the count of `deferred` tags drives the fold deadline. | `completeLanguageTurn` (stores it), `researchSignals` (reads it), `ClosingAskStatus`; schema in `models/TutorMessage.ts` |
| Both controllers pass the status on. | `controllers/tutor.controller.ts`, `controllers/avatar.controller.ts` |

### Change H: `strandLog`
| Item | Where |
|---|---|
| Fixed map from every `MoveId` to exactly one of `input`, `output`, `language_focused`, `fluency` (`Record<MoveId, Strand>`, so the compiler refuses an unlisted move). | `STRAND_BY_MOVE`, new `backend/src/services/strandLog.ts` |
| Turn tag = the strand of the turn's first selected move. `stage` exists in the evidence type and schema and is never set (it waits for change D). | `strandOfMoves`, `strandTags`; used in `turnEvidence`, `languageTeachingContext.ts` |
| Counts per learner and per course, counts and shares only; reads only the strand tag. | `strandSplit`, `loadStrandSplit({ institutionId, studentId?, courseId? })` |
| Switch added to the engine, off by default, not in `all`. | `engineV2.ts` |

### Change A: `levelExplicit`
| Item | Where |
|---|---|
| Explicit-first = course band A1 to A2 (`beginner`), or the objective's record is `not_assessed` or `emerging`. Everyone else is questioning-first. | `explicitFirst()`, `ruleFirstDecision()` in `languageTeachingContext.ts` (called by `buildLanguageTeachingContext`) |
| Rule before the first try: on the reply that presents the exercise, state the rule (≤ 20 words, in the style of the selected method), one right and one wrong example from words in no exercise, then present the item. Replaces the "no rule, no reminder and no example before their first try" text for that reply. | `ruleBeforeFirstTryLine`, `moveText(m, { ruleBeforeFirstTry })`, `ruleBeforeFirstTryOn`, `stateLines` |
| Once per rule per session, decided per form: reuses `rulesToIntroduce` / `rulesIntroduced`; a new `beforeFirstTry` option also fires on the presenting reply and skips criteria the learner has already shown this session. After the first try the existing `ruleFirst` line is used if the rule is still due. | `rulesToIntroduce`, `languageTeachingContext.ts` |
| Hint ladder: for explicit-first learners level 1 states the rule in general terms (today's level 2) and level 2 gives the right/wrong pair. Levels 3 to 6 unchanged. | `EXPLICIT_HINT_LADDER`, `hintInstruction({ explicit })`, `languageLearningState.ts` |
| Method gating below B1: `socratic_questioning`, `inquiry_based`, `problem_based`, `case_based`, `project_based`, `blooms_guided` are not chosen as the primary method. `PlanInput.belowB1` comes from the curriculum level. | `usable()` and the application-gap branch in `selectTeachingPlan`, `belowB1()`, `LEVEL_GATED_METHODS`, `pedagogyPolicy.ts`; `buildObjectiveContext`, `learningContext.ts` |
| Always with `arbitration`: `engineV2('arbitration')` returns true whenever `levelExplicit` is on; the evidence records `arbitrationForced: true` when `arbitration` was not also named. Tags `explicitFirst` and `arbitrationForced` are stored. | `engineV2.ts`, `arbitrationForced()`, `turnEvidence` |

### Two existing defects found and fixed on the way
1. **Chat route dropped the closing ask.** `tutor.controller.ts` used the guarded text only `if (g.removed)`, so an appended closing ask reached the learner only if something had also been removed. It now uses the text whenever it changed. (The avatar route already used the text.) This is a behaviour change for `closing` and `shortRecap` in chat.
2. **`rulesIntroduced` was not in the stored-message schema** (`models/TutorMessage.ts`), so Mongoose dropped it on save and `ruleFirst`'s "once per rule per session" memory would not have worked in production. It is in the schema now, with the new tags (`closingAsk`, `strand`, `stage`, `explicitFirst`, `arbitrationForced`). A test reads the schema.

## 2. Test results

New and extended tests (all pass):
| File | Tests | What it covers |
|---|---|---|
| `engineV2Closing.test.ts` | 17 (7 added) | `closing`: no appended ask on a task reply; deferred ask added on the next task-free reply; folded after 3 task replies and not before; once only; no appended ask next to a task across every history and reply shape; evidence tag stored by `completeLanguageTurn`; schema keeps the tags |
| `engineV2Clarity.test.ts` | 18 (5 added) | the same five behaviours for `shortRecap` |
| `strandLog.test.ts` | 12 | every `MoveId` maps to exactly one valid strand and the map has no extras; a move missing from the map is caught; tags stored without learner text; off → nothing stored; counts-only split; per-learner and per-course query reads only the tag |
| `levelExplicit.test.ts` | 25 | rule line before the first try for A2 and for B2 "emerging"/"not assessed"; none for B2 "proficient"; the answer form never reaches the prompt and the reply guard still strips a leaked answer; once per rule per session and per form; questioning-first output identical byte for byte (B2 proficient, B1 developing, C1 mastered, B2 with no record); hint level 1 and 2 differ by group, never contain the answer form, levels 3 to 6 and two-option items equal; method gating by level; `arbitration` forced on and recorded |
| `levelExplicitOffParity.test.ts` | 1 | with the new switches off, 10,944 outputs (prompt, turn evidence, guarded replies, hint texts over levels, statuses, histories, messages, plan methods, switch sets) hash identically to the engine before change A (taken at commit `c84ef86`, checked on both trees) |

Neighbouring suites still pass: `engineV2` (20), `avatarLanguageLink` (6), `researchImproved` (6), `researchAblation` (3). `tsc --noEmit` is clean.

**Full backend suite (honest account).** A full run in this sandbox is not stable: two full runs on my branch and one on the commit before my changes (`b0362b2`) each failed 14 to 15 test files, and the failing sets differ between runs (port conflicts such as `EADDRINUSE`, timeouts, and date-dependent tests). So "only the same 5 failures" could not be confirmed from a full run. What I did instead: ran each failing file **alone, on both trees**, and compared counts. For all 19 files that failed in any full run (listed below), the pass and fail counts are identical on my branch and on the base, except three files that fail on the base and pass on mine (`educatorAnalytics`, `learnerAgeBand`, `p10NamedStudents`; they look date- or load-dependent and I did not investigate). None of my changes touches them.
- The five known base failures behave as before: `p14_2GradingTestSpend` (2), `p14_8BlockerFixes` (1), `p19Resilience` (1), `p20QueryBudget` (1); `p20TutorStream` did not load in the overlapping run.
- Other files that fail identically on the base, alone: `elie.e2e` (1), `elie.sprint4` (1), `p2Documents` (2), `p3EducatorChat` (1), `phase0` (2), `phase3.autograding` (3), `phase3.e2e` (1). These were outside the earlier "related suite", so they were not on the known list; they fail the same way without my changes.
- Pass on both when run alone: `elie.sprint7`, `p19TenantIsolation`, `p20RateLimit`, `p9AnalyticsRouter`, `p14_9TenantIsolation`.

## 3. Where the roadmap design was not followed, and why

1. **The folded recap uses the lesson's own wording.** The roadmap says "Rule in one line". The engine cannot write a rule sentence itself without another model call, so the fold takes the lesson's success-criterion text (the focus item's, else the first two; else the objectives). Criteria are teacher phrases such as "Uses in with months", not always plain rule sentences, so the folded line may read as a label. If a lesson has no criteria or objectives, the ask stays deferred (it is never added next to a task), which is the one case where the recap can be skipped for good.
2. **"Within 3 turns" is read as: after 3 deferred task replies, the next task reply is folded** (the closing turn counts as the first deferral). The roadmap wording is ambiguous.
3. **A model-written ask still counts.** The once-only rule also reads the reply text (existing behaviour), so a recap the model wrote itself ends the closing without a tag.
4. **One strand per move cannot split one move that serves two.** `corrective_feedback_retry` is `language_focused` even when it handles a learner's own free sentence (which is closer to output); the roadmap asked for one strand per `MoveId`, so the reason codes are not used. Setup and management moves (`clarify_goal`, `redirect_to_lesson`, `l1_support`, `restate_task`, `general_practice`, `activate_prior_knowledge`, `fade_support`) are also counted as `language_focused`. `comprehensible_model` counts as `input`. These are judgement calls, written in the file. `fluency` has no move, so it reads 0 until change G.
5. **A turn's strand is its first move.** The roadmap did not say how to choose when several moves apply. First move was chosen because later moves (such as `comprehensible_model`, added to nearly every beginner turn) are style rules, not the main activity.
6. **Two-option items (he/she) keep today's early hints.** The roadmap's hint-ladder change would put the rule at level 1, but on a two-option item any pointer settles the choice, so those items keep their existing early-hint rules. The rule still reaches the learner through the rule line at first exposure.
7. **Method gating is wider than "introducing a new form".** `usable()` cannot tell why a method is being picked, so below B1 the six methods are barred as a primary method in general. `blooms_guided` is also barred in the application-gap branch. The older v1 function `selectStrategy` (unused outside its file) was not changed.
8. **Explicit-first is decided at objective level plus band, with a per-form check.** The mastery record is per objective, not per form. "Per form" is done by skipping rules the learner has already shown (criteria in the session) and by once-per-rule memory. Learners with an unknown course level are not explicit-first unless their objective record says so (the roadmap names A1 to A2 only); when adaptive pedagogy is off there is no objective record, so only the band decides.
9. **The rule line needs tagged lessons.** It relies on `successCriteria` and items tagged with `criteria`. Lessons without them get today's behaviour, so the switch does nothing for them.
10. **`arbitration` is forced inside `engineV2()` itself**, so the plan text and the language context agree everywhere, not only where `levelExplicit` is read.
11. **The parity test is deliberately strict.** If anyone changes a prompt on purpose, `levelExplicitOffParity.test.ts` fails until its hash is updated in the same commit with a reason. That is the price of "byte for byte".

## 4. What needs a decision from the owner

1. **Whether to turn any of this on.** Not before stage 1 of the study (roadmap section 4). Until then all three are off and change nothing.
2. **The `closing` and `shortRecap` fixes are active as soon as those switches are on**, including the chat-route fix (the closing ask now reaches the learner in chat). If the pilot or any staging site already runs `closing`, that behaviour changes. Say if that is wanted.
3. **Wording of the folded recap.** Because it shows the lesson's criterion text, a teacher should check that criteria read well as a one-line rule, or allow a short rule field per criterion.
4. **Teacher-tagged lessons.** `levelExplicit` only works on lessons that carry `successCriteria` and item `criteria`. Decide whether to require them for English courses.
5. **Learners with no course level.** Should they count as explicit-first? Today they do not unless their record says "not assessed" or "emerging".
6. **Strand conventions** (section 3, item 4) are my judgement; a language-teaching expert should confirm them before the strand split is shown to teachers.
7. **Production deploy.** Nothing here has been deployed. Test.enara.app runs whatever was last deployed from this branch, so the next deploy ships the code (switches off) and the two defect fixes (chat closing text; schema fields).
