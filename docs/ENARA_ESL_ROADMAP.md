# ENARA: research-based improvement plan for Arabic-speaking (Egyptian) learners

*14 Nov 2026. Documents only; no production code was changed. Principles and sources: `ENARA_ESL_FRAMEWORK.md` (every citation there is marked VERIFY). Current state: `ENARA_ESL_GAP_AUDIT.md`. Everything proposed here is a **proposal to test**, not a result. All ENARA results so far come from AI-simulated learners and are not evidence about real learners.*

## 0. Ground rules for every change

1. **Behind a switch, default off**, in the same style as `backend/src/services/engineV2.ts`. A change is switched on per environment only after it has earned it.
2. **Keep the strengths** shown in every earlier study: students are made to reason, answers are not given away, positions are held under pressure. Any change that adds explanation must keep the answer-hiding guards (`stripPreAttemptModels`, `possibleAnswerLeak`, `applyReplyGuards`).
3. **Measure with three instruments** (see §3): a post-test on new items, a **7-day delayed retention test**, and **CEFR-linked items**. An effect on a rating of "clarity" alone is not enough.
4. **Honesty about evidence.** Where the research is moderate or contested, the change is a bet and is labelled so.
5. **Arabic-specific content needs review by Egyptian English teachers** before it reaches any learner. The error lists in the framework are drawn from general descriptive sources, not from Egyptian classrooms.

## 1. Ranking

Scales: impact (H / M / L: expected effect on real learners); evidence (S strong / M moderate / C contested, from the framework); cost (L = days, M = 1 to 3 weeks, H = a month or more, including tests and content). "Rank" combines the three with impact and evidence weighed above cost.

| Rank | Change | Impact | Evidence | Cost | Why this rank |
|---|---|---|---|---|---|
| 1 | **A. Level-based explicitness** | H | M to S | L to M | Targets the biggest known weakness (clarity), reuses code already written and tested (`ruleFirst`, `clarity`, `hints`). |
| 2 | **B. Fix the closing-ask defect** | L to M | n/a (engineering defect) | L | A few lines plus tests; removes a visible flaw that raters penalise. Do it with A. |
| 3 | **C. Arabic-L1 error library** | H | M (existence of transfer) with C (how well it predicts) | M | The main audience; nothing exists today. Needs teacher review. |
| 4 | **D. Rule → guided → free practice sequence** | H | M | M | The missing path from knowing to using; the research expects it. |
| 5 | **E. Spaced review in the core lesson flow** | H | S for spacing, M for L2 specifics | M | Scheduling code exists (`retention.ts`); the lesson flow does not use it by default. Measuring it needs multi-session studies. |
| 6 | **F. CEFR mapping and can-do reporting** | M for learning, H for measurement and trust | S as a standard, C as a model | M | Needed to measure everything else and to report to parents and teachers. |
| 7 | **G. Input and fluency activities** | M to H | M | H | Fills the empty strands, but needs content and a different activity type. |
| 8 | **H. Strand and stage logging** | L directly, enabling | n/a | L | Cheap; makes the strand split reportable and every study analysable. Do early. |
| 9 | **I. Correction level tied to evidence on the form** | M | M (level differences are thin) | L to M | Refinement of A; test, don't assume. |
| 10 | **J. Judicious Arabic in explanations at A1** | unknown | mixed | L | A test arm, not a default; the evidence is mixed. |

---

## 2. The changes

### A. Level-based explicitness (`levelExplicit`)

- **Problem.** The "no rule, no reminder, no example before their first try" instruction (`MOVE_TEXT.present_lesson_item`) and hint level 1 ("must not reveal the rule", `HINT_LADDER`) apply to every learner. A novice who lacks the form can only guess on the first try. ENARA is also behind the plain tutor on clarity in every simulated study.
- **Principle.** Explicit instruction beats implicit for L2 grammar on most measures (moderate to strong); expertise reversal says to fade guidance as knowledge grows (moderate). Framework §2.
- **Design (new switch, composes existing pieces; no new model behaviour is invented).**
  - Decide "explicit-first" per learner *and* per form from evidence, not from the course level label alone: explicit-first when the course band is beginner (A1 to A2) **or** the learner's record for this objective is "not assessed" or "emerging" (the plan already reads these in `learningContext.ts`); otherwise questioning-first.
  - Explicit-first: on first exposure to a rule, state it in one plain sentence (≤ 20 words), give one right and one wrong example using words from no exercise, then ask for the first try. This is what `ruleFirst` already does (`rulesToIntroduce`, `ruleFirstLine`), but it is not level-aware today; add the level and evidence condition and make it replace the "no rule before the first try" text for these learners only. Keep the answer-hiding guards on the item's own answer.
  - Hint ladder for explicit-first learners: level 1 states the rule in general terms (today's level 2) and level 2 gives the contrast pair; the answer itself stays hidden until later levels, as now.
  - Questioning-first (B2 and above, or "proficient" on this objective): keep the current behaviour and allow Socratic and elaborative-interrogation methods (framework §2, gap audit §2.8).
  - Limit methods by level: no `socratic_questioning`, `inquiry_based`, `problem_based`, `case_based`, `project_based` or `blooms_guided` as the *primary* method for introducing a new form below B1 to B2. (`usable()` in `pedagogyPolicy.ts` already blocks the five answer-withholding methods for novices; `blooms_guided` and the B1 boundary are not covered.)
  - Always pair with the `arbitration` order of authority, so the 23-method plan and the language engine do not give conflicting orders.
- **Measure.** Post-test accuracy on new items for the taught form; delayed test at 7 days on the same form with new items; CEFR-linked items (an A2-tagged and a B1-tagged item per form, see F) to see whether gains hold at the next level. Secondary: clarity and overall ratings from blind raters; answer-protection must **not** fall (guard: a drop of more than 0.3 on the 1-to-5 scale, or any rise in leaked answers, fails the change).
- **Tests needed** (new file `backend/test/levelExplicit.test.ts`): (1) beginner or "emerging" learner with an unseen rule gets the rule line before the first try; (2) the same learner's item answer never appears in the reply (leak guard); (3) a "proficient" or B2 learner gets the current behaviour byte for byte; (4) switch off → output identical to today's; (5) the rule is introduced once per rule per session; (6) `usable()`-style gating for the listed methods by level; (7) hint level 1 text differs by group and never contains the item's answer form.

### B. Fix the closing-ask defect

- **Problem.** The engine appends a closing ask ("Tell me the rule in your own words." for `closing`, "Now write one new example of your own." for `shortRecap`) in `applyReplyGuards` (`languageTurnPipeline.ts:33`). If the reply already sets a task, the learner gets two asks at once.
- **Current state (checked in code, not changed here).** The `shortRecap` branch already skips the ask when `taskInvitation(text)` is true (the fix made during the clarity study). The `closing` branch still appends "Tell me the rule in your own words." without that check. The skipped `shortRecap` ask is retried on the next reply, because the "once only" flag (`isClosingTurn`, `closingDone`) is set only when the ask is actually made; so a skipped ask is deferred, not lost, but nothing guarantees a task-free reply ever comes (a lesson that always sets a task never gets its recap).
- **Principle.** Not a language-teaching principle: it is an engineering defect (two asks in one reply is confusing, and ENARA's raters penalised it). A mild cognitive-load argument applies (Framework §2, expertise reversal and load).
- **Design.** (1) Apply the same `!taskInvitation(text)` check to the `closing` branch. (2) Add a deadline: if no task-free reply has come within N turns of the closing turn (suggest 3), *fold* the recap into the task reply as a single message: "Rule in one line, then your task: ..." instead of skipping forever. (3) Record in turn evidence whether the ask was added, deferred or folded.
- **Measure.** Not a learning change; measure the **rate of replies containing two asks** (target 0) on stored sessions, and confirm no change in post-test, using the next study as a regression check.
- **Tests needed** (extend `backend/test/engineV2Closing.test.ts` and `engineV2Clarity.test.ts`): `closing` with a task reply adds nothing; deferred ask is added on the next task-free reply; folded form after N task replies; once-only holds; evidence field written.

### C. Arabic-L1 error library (`l1Errors`)

- **Problem.** ENARA does not anticipate the errors Arabic speakers typically make (gap audit §2.7). `diagnoseError` knows nine generic English-form causes and no Arabic-specific one.
- **Principle.** L1 transfer is real, though how well contrast alone predicts errors is contested (Framework §9, §10). Treat the library as hypotheses to check against the learner's actual writing.
- **Design (new module `backend/src/services/arabicL1Errors.ts`, plus data file reviewed by teachers).** Each entry: `id`, CEFR range where it appears, the *sign* (a detection rule on the learner's text, conservative so false alarms are rare), a one-sentence explanation of *why*, a right-versus-wrong contrast, and a practice set. First candidate entries: article omission (`a/an`), wrong or missing `the`; copula omission ("She teacher", "The weather very hot"); resumptive pronoun in a relative clause ("the man that I saw him"); run-on sentences with "and"; adjective-noun order; plural and third-person -s omission (overlaps `diagnoseError`); inserted-vowel clusters and /p/-/b/ and vowel confusions (**audio only**, out of reach of a text chat; list them for the speaking features, do not detect them in text); spelling patterns from missing short vowels (e.g. dropped or swapped vowels) which *can* be seen in typed text. Plug into `diagnoseError`'s output shape (`Diagnosis { code, cue, evidence }`) so existing hint targeting works, and log which entries fire, never the learner's text, as the existing profile does.
- **Measure.** Post-test items built on the library's errors (e.g. article and copula items) for the taught form; 7-day delayed test on the same errors; CEFR-linked items; *and* a check that detections are right: teachers label 100 or more real learner sentences, and report precision and recall per entry (an entry with low precision is dropped). Do **not** claim a learning effect from detection alone.
- **Tests needed** (`backend/test/arabicL1Errors.test.ts`): each entry has positive and negative examples (the negatives include correct English that looks similar); no false positive on a corpus of correct sentences; hint cue never contains the answer; entry data validates against a schema; switch off → current `diagnoseError` behaviour; no learner text is logged.

### D. Rule → guided practice → free use practice sequence (`practiceSequence`)

- **Problem.** Nothing sequences the path from knowing the rule to using it freely and quickly (gap audit §2.4). Practice is whatever the lesson's item list gives.
- **Principle.** Skill acquisition theory (declarative → proceduralised → automatised, with practice matched to the skill) and focus on form within tasks (Framework §4, §5). Moderate.
- **Design.** For each target form, keep a **stage** per learner (new field in the learner profile that `learnerLanguageProfile.ts` already stores; error types and stage only, no text):
  1. *Rule*: explicit first exposure (A).
  2. *Guided*: items with hints available, support fading by the existing ladder.
  3. *Unguided*: items with no hint offered, in new contexts (the "one more unaided check" step already exists).
  4. *Free use*: a short task where the form must appear (write two sentences; reply to a message; describe your day), evaluated with `unpromptedSentence` handling.
  5. *Return*: the form comes back in a later session (E).
  Move up only on independent successes (the existing independent-evidence rule); move down on repeated independent errors. The tutor says which stage it is in, in plain words.
- **Measure.** Post-test split into **controlled items** and **free-production items** (a written sentence scored for the form); 7-day delayed test on both; CEFR-linked items. Primary outcome: the free-production score, because this is what the research says controlled-only practice under-trains.
- **Tests needed** (`backend/test/practiceSequence.test.ts`): stage transitions (up on independent success, down on repeated miss, never up on assisted success); free-use task is offered only at stage 4; stage survives a session boundary; switch off → current behaviour; no stage change from one lucky answer.

### E. Spaced review in the core lesson flow (`reviewFirst`)

- **Problem.** The scheduling code is solid (`retention.ts`, ret-v1, intervals 3, 7, 14, 30, 60 days, no credit for early answers; `reviewService.ts` for quiz mistakes) but the tutor only uses language-specific review when `memory` is on, and `memory` stores error types, not vocabulary (gap audit §2.5).
- **Principle.** Spacing and the testing effect (strong in cognitive psychology; moderate in L2 vocabulary). Framework §7.
- **Design.** (1) Make the opening of a session a short **retrieval round** from the due list (words, forms, error types) before new material, with each item attempted from memory, not re-read. (2) Extend the due list to **vocabulary** items from `LanguageSpec.vocabulary`. (3) Treat `memory` as part of the default flow once it has been tested (it is already in the `all` group). (4) Keep the "no cramming credit" and "independent evidence only" rules. (5) Cap the round (for example five items) so it does not eat the lesson.
- **Measure.** This one *needs several sessions over days*; measure delayed retention at 7 days and again at the protocol's 3 to 4 weeks, comparing items that were reviewed on schedule with matched items that were not (within-learner). CEFR-linked items for the reviewed content.
- **Tests needed** (`backend/test/reviewFirst.test.ts`): due items shown first and answered by retrieval; early review does not advance the schedule; a miss resets to one day; the round is capped; vocabulary items enter the list; no learner text stored.

### F. CEFR mapping and can-do reporting (`cefrMap`)

- **Problem.** CEFR calibrates reply length and load only (gap audit §2.6). Lessons, items and evidence are not tagged; there are no can-do statements; the learner's level is one course-level string.
- **Principle.** CEFR is the common reporting scale (strong as a standard, contested as a model of progression). Framework §8.
- **Design.** Add optional `cefr` (A1 to C2) and `skill` (listening, speaking, reading, writing) tags to lesson objectives and exercise items (`LanguageSpec`, `LessonItem`); carry them into learning evidence; show learners, teachers and parents a short can-do summary per skill ("can write simple sentences about daily routine: working towards A2"). Report levels **per skill and per objective**, never as one fixed label, and never claim a level change from tutor use (the pilot protocol already says so). Build a small CEFR-tagged item bank (teachers write and tag it) that doubles as the CEFR-linked test items in §3.
- **Measure.** Agreement between tagged level and teacher judgment on a sample of items (report κ); then the CEFR-linked items in every study of A to E.
- **Tests needed** (`backend/test/cefrMap.test.ts`): tags validate and survive the evidence pipeline; untagged items behave as today; the summary never names a level without enough independent evidence; nothing in the learner's prompt tells the tutor to reveal the level (the current rule: "never tell them their level").

### G. Input and fluency activities (`inputFluency`)

- **Problem.** The input and fluency strands are almost empty (gap audit §2.1).
- **Principle.** Four strands; comprehensible input; fluency development through easy, repeated, time-pressured practice (Framework §1, §6). Moderate; the 25% split per strand is a guideline.
- **Design.** Two new activity types, both text-based first: (1) **Graded reading**: a short text at the learner's CEFR step, 90 to 95 percent known words (a word list per level is needed), with a few comprehension questions and one "new word" check; add the missing lesson field for a reading text first. (2) **Fluency sprint**: the same easy material repeated three times with a shrinking time limit (a 4-3-2 style retelling or a timed sentence-completion set), scored for speed and ease, not for new errors. Later, audio and speaking need the voice features and are out of scope for the text chat; pronunciation scoring stays off until the supplier and consent decisions in the roadmap are made.
- **Measure.** Reading-comprehension items on unseen texts at the CEFR level; speed and accuracy on a timed set of known items; the 7-day delayed version of both. Strand log (H) shows the new time split.
- **Tests needed** (`backend/test/inputFluency.test.ts`): readability check (share of known words) of generated or supplied texts; the sprint never introduces a new form; timing is recorded, not shown as a grade; no text leaves the lesson scope.

### H. Strand and stage logging (`strandLog`)

- **Problem.** No record of which strand a turn serves, so the time split cannot be reported and no study can check that a change did what it was meant to.
- **Principle.** Four strands (Framework §1); basic experiment hygiene.
- **Design.** Tag each language turn with a strand (`input`, `output`, `language_focused`, `fluency`) from the selected move ids (a fixed map), and with the practice stage (D) once it exists. Store the tags in turn evidence; add a per-learner and per-course summary for teachers.
- **Measure.** Not a learning change; report the strand split before and after each change.
- **Tests needed** (`backend/test/strandLog.test.ts`): every `MoveId` maps to exactly one strand; unknown move fails the test; tags stored without learner text.

### I. Correction level tied to evidence on the form (`feedbackByEvidence`)

- **Problem.** The correction style follows the broad level band (`level_novice_prompt_first`, strong learners get a recast), not the learner's history on this form. A novice who lacks the form gets prompts first; a strong learner's recast may be skipped.
- **Principle.** Prompts at least as good as recasts, but need prior knowledge; explicit correction suits missing knowledge; level differences are thin (Framework §3). Moderate to contested.
- **Design.** If the answer contains none of the target forms or the same error repeats (the existing `errorRecurrence` and `answerHasTargetForm` signals), use explicit correction with a one-line reason; otherwise prompt. For strong learners' recasts, ask the learner to repeat the corrected form. Keep the ladder as the escalation path.
- **Measure.** Post-test and 7-day delayed accuracy on forms that were corrected under each style (within-learner, forms matched); time to a correct production.
- **Tests needed:** each signal selects the expected style; the correction never contains the answer *before* a genuine try for items where the answer is hidden (the current guards still apply); switch off → identical output.

### J. Judicious Arabic in explanations at A1 (`l1Explain`) — a test arm, not a default

- **Problem.** `l1_support` and `ENGLISH_ONLY_RULE` forbid any Arabic. The literature on own-language use is mixed and, on balance, modestly favours judicious use for explaining rules at low levels (Framework §9).
- **Design.** Allow one short Arabic gloss for a *rule or the reason for an error* (never for the answer, never for task instructions), A1 only, switch off by default, and test it as an arm.
- **Measure.** As A, plus a delayed test; check English-use time did not fall.
- **Tests needed:** Arabic appears only in the gloss; the answer is never given in Arabic; off → today's behaviour.

---

## 3. Measurement standard for every study

| Instrument | What it is | Notes |
|---|---|---|
| **Post-test** | New items on the taught form (never seen in the tutor lesson), controlled and free-production, frozen and hashed before any session (as in `config/agent_sim_clarity/POSTTEST_ITEMS.json` and `.sha256`) | Answered by a separate agent (stage 1) or by the learner without help (stage 2) |
| **Delayed retention test at 7 days** | Parallel form of the post-test, different items | **Real delay only in the pilot.** In the agent study, a "delayed" test is a second post-test after unrelated filler; it checks consistency, **not** memory over days, and must be labelled that way |
| **CEFR-linked items** | Items tagged A1 to B2 and by skill (F); at least two levels per form | Reports whether gains reach the next level; the protocol's rule against claiming a CEFR change stays |
| **Blind ratings** | Clarity, reasoning, answer protection, hint progression, recap (1 to 5), as in `RATER_INSTRUCTIONS.md` | A *secondary* outcome, since ratings and learning did not line up in earlier studies |
| **Guards** | Answer leaks (must not rise); two-asks-in-one-reply (target 0); strand split (H) | Pass/fail checks |

## 4. Study design for the top three changes (A, C, D)

Chosen because they have the highest impact × evidence per unit cost, they can be tested without waiting weeks, and A and D reuse code that already exists. E (spaced review) ranks higher in impact but needs a multi-session design (an open item in the project overview), so it goes straight to the pilot's delayed tests.

### Stage 1: agent-run study with a post-test (no API; synthetic learners only)

- **Reuse:** `src/offline/agentSession.ts`, `clarityStudy.ts`, `reports/analysis/clarity_analysis.py` (paired bootstrap over students, exact sign-flip test, Holm correction). Protocol and post-test written, hashed and committed **before** any session runs, with the decision rule below.
- **Learners:** at least 18 synthetic students per arm (the last study had 8 and could not clear Holm). Personas get a seeded Arabic-L1 error profile (article omission, copula omission, and so on) and a CEFR band (A1 and A2 for each form); the profile is *seeded by instruction*, so this stage can show whether the tutor **detects and addresses** those errors, **not** that real Arabic speakers benefit.
- **Arms** (same students in every arm, paired): P plain tutor; A0 current best (`all, closing, selfCheck, clarity, hints`); A0 + A; A0 + A + C; A0 + A + D. Contrasts fixed in advance, Holm over them: (A0+A) − A0; (A0+A+C) − (A0+A); (A0+A+D) − (A0+A); and each versus P.
- **Outcomes:** primary = post-test accuracy, split controlled and free-production; secondary = the five ratings, the CEFR-linked items, the second post-test (labelled as above), and the guards. Report intervals over students; call a result a win only if the interval excludes zero **and** the answer-protection guard holds; weak or mixed results are reported as such.
- **Practicalities:** at most three agents per arm at a time (standing instruction); separate agents answer the post-test and rate blind; raw sessions committed; no learner-like text leaves the sandbox; no real learner data.
- **What it cannot show:** real learning, real L1 transfer, real delayed memory, real motivation. Same-family AI raters and students. It is a filter, to avoid taking a bad change to real children.
- **Go / no-go for stage 2:** at least one of A, C, D beats A0 on the primary outcome with the interval above zero and no guard failing; otherwise revise the change, do not escalate.

### Stage 2: real-learner pilot (based on `docs/benchmarks/language-teaching/20261112-r44-advanced/PILOT_PROTOCOL_learning_outcomes.md`)

- **Start from the protocol as written:** class-level randomisation, pairs of classes in the same school and grade, tutor plus lessons vs lessons only, four weeks of use, pre/post, delayed retention, teacher-written parallel test forms that share no item with the tutor's exercises, blind teacher scoring of free writing, written parental consent, ethics review, wait-list for the control classes.
- **Changes for this plan:**
  1. Add a **7-day retention test** to the protocol's 3 to 4 week one (the protocol has only the longer delay); both are needed to see the spacing effect.
  2. Add **CEFR-linked items** (A1 to B1, from F) and **Arabic-L1 target forms** (articles, copula omission) to the target list, beside the protocol's three grammar targets (he/she, present simple -s, past vs present perfect). Keep the protocol's statement that no CEFR change is claimed.
  3. Add **free-production items** as a primary outcome for D.
  4. Compare **improved ENARA vs plain AI tutor** as well as vs lessons only, because that is the owner's ship bar. Software-vs-software comparisons can be randomised at the **learner** level within a class (contamination is smaller than for teaching methods); this needs the ethics and consent text to say so, and a power analysis from the first pilot's ICC and variance (as the protocol already requires for a confirmatory study).
- **Order:** run the protocol's first pilot with the best stage-1 version of ENARA vs lessons only; run the learner-level improved-ENARA vs plain comparison in the following term once variance is known.
- **Owner decisions needed** (marked [DECIDE] in the protocol): partner schools, teachers, budget, consent and ethics route; Egyptian teachers to review the L1 library and the test forms.

## 5. Suggested order of work

1. **Now (days):** B (closing-ask defect), H (strand and stage logging). Both are small and help everything after.
2. **Next (1 to 3 weeks):** A (level-based explicitness) with its tests; start F's item bank and the Egyptian-teacher review of C's entries in parallel (content takes longest).
3. **Then:** C and D behind switches; run **stage 1** on A, C, D.
4. **If stage 1 passes:** E (spaced review in the lesson flow), start the real pilot.
5. **Later:** G (input and fluency), I, J as test arms.

## 6. What this plan does not claim

- It does not claim any of these changes will beat the plain AI tutor. ENARA has not beaten the plain tutor in any study so far; the clarity gap is the main reason, and A is the best-supported attempt to close it.
- It does not rest on AI-learner results. They filter, they do not prove.
- The Arabic-specific error list and the Egyptian phonology details need local teachers and, for sounds, audio. Pronunciation scoring stays off.
- Every citation needs a human check (VERIFY) before anyone quotes this plan outside the team.

---

# Part 4: One-page summary for the owner (plain language)

## What the research says
- **Tell beginners the rule first.** Studies of grammar teaching mostly find that explaining a rule helps more than leaving learners to work it out, especially for beginners. As learners get stronger, asking questions works better.
- **Always correct mistakes, and make the learner do something with the correction.** Pushing the learner to fix it themselves usually works at least as well as just repeating the right version. But if they do not know the form, they need it explained.
- **A good course has four parts:** understanding (reading and listening), using (speaking and writing), studying the language, and getting fast with what you know. Studying alone is not enough.
- **Practice must move from "I know the rule" to "I can use it quickly".** That needs many practice rounds that are spread over days, not crammed in one sitting.
- **Reviewing a little each day, by trying to remember, beats re-reading.**
- **Arabic speakers make predictable mistakes** with *a/the*, a missing "is/am/are", word order, and some sounds and spellings. A tutor that expects them can help faster. (How well the list predicts is debated, so it must be checked against what learners really write.)

## Where ENARA stands today
- **Good:** it makes students think, it does not give answers away, it gives hints in steps, it saves a schedule for reviews, and it adapts length to the level.
- **Gaps:**
  - It holds back the rule from beginners until after their first guess, which the research does not support. This is the most likely reason it loses to the plain tutor on "clear explanations" in every test.
  - It almost only does grammar exercises: no reading, no listening, no speed practice.
  - It knows nothing about typical Arabic-speaker mistakes.
  - It has no steps from "learn the rule" to "use it freely".
  - Review is scheduled in the data, but lessons do not start with a review by default.
  - Lessons and tests do not carry CEFR levels, so progress cannot be reported in the standard way.
- **Honest limit:** all our tests used AI students, not real ones. ENARA has **not** beaten the plain AI tutor in any test so far. We cannot say it will until real learners are tested.

## The five changes to make first
1. **Explain the rule first for beginners, ask questions for advanced learners** (A). Best-supported, and it targets the main weakness.
2. **Build the Arabic-speaker error library, reviewed by Egyptian teachers** (C). It is the biggest advantage ENARA could have over a generic tutor.
3. **Add the path from rule to guided practice to free use** (D).
4. **Start every session with a short "can you remember it?" review, including vocabulary** (E).
5. **Tag lessons and tests with CEFR levels and log what kind of activity each turn is** (F and H). Without this we cannot show or measure progress.

Also do now, because it is tiny: fix the bug where the tutor sometimes asks two things at once (B).

## What happens next
Test changes 1 to 3 with AI students first (about 18 per group, no paid calls). Only if they help, run the real classroom pilot from the existing protocol, with a 7-day and a 3-to-4-week memory test. **Every source quoted in the research document must be checked by a person before we rely on it.**
