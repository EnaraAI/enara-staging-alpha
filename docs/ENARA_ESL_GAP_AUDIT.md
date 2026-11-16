# ENARA against the ESL research: gap audit

*14 Nov 2026. Documents only; no production code changed. Read with `ENARA_ESL_FRAMEWORK.md` (principles, sources, evidence strength; every citation there is marked VERIFY). Code references are to branch `claude/codebase-review-kbxqan`.*

## How this audit was done, and its limits

- I read the engine code and the docs listed in the brief. I did **not** run new sessions for this audit. Anything I say about "how time is split" is read off the code and the lesson format, not measured from real use. The recommendation to log it is in the roadmap.
- ENARA's own results (all with AI-simulated learners) are quoted only for what they say about ENARA's behaviour, never as proof that something helps real learners.
- Severity: **high** = likely to limit real learning for the main audience, evidence for the principle is at least moderate, and ENARA contradicts it or leaves it out; **medium** = partly addressed or the evidence is mixed; **low** = small, or mainly a design polish.

## 1. Summary table: principle → what ENARA does → gap → severity

| # | Principle (evidence) | What ENARA does now (file / function) | Missing or contradicting the research | Severity |
|---|---|---|---|---|
| 1 | **Four strands** (moderate) | Lessons are built from a spec of objectives, vocabulary, grammar, functions, skills and **exercise items** (`LanguageSpec`, `languageTeachingContext.ts:127`). Of the 17 language moves in `MOVE_TEXT` (`:982`), nearly all serve language-focused learning (explain, hint, correct, present an item, check). Meaning-focused output appears only as `independent_practice` (strong learners only, `selectLanguageMoves`, `:881`) and in handling a learner's own sentence (`unpromptedSentence`). Input: `comprehensible_model` sets *how* the tutor talks, not a reading or listening activity. | **No fluency strand at all** (no timed, repeated, easy-material activity). No graded reading or listening content: lessons have no field for a reading text (`ENARA_TUTOR_CAPABILITIES.md` §7), and reading is the weakest measured skill. No record of which strand a turn serves, so the split cannot be reported. Estimated split from the code: language-focused well over half, output a small part, input and fluency close to zero. | **High** |
| 2 | **Explicit vs implicit; expertise reversal** (moderate to strong; moderate) | Level logic exists but is partial. Novices get `short_explanation` and `comprehensible_model` when no task is open (`selectLanguageMoves`), and strong learners get `fade_support` and `independent_practice` (`:881` onward). **But** the two "no rule before the first try" instructions apply at every level: `MOVE_TEXT.present_lesson_item` ("No rule, no reminder and no example before their first try", `:982`) and `HINT_LADDER` level 1 (`languageLearningState.ts:405`; level 1 "must not reveal the rule"). The rule is taught outright only after repeated misses (`TEACH_RULE_V2`, `wrongAnswer` switch) or under the research-tested `clarity`, `hints`, `ruleFirst` switches, all **off** by default. The 23-method plan adds methods that never state the rule (see §3 below). | Novices (A1 to A2, or "emerging" on a form) meet an item with no rule first, so the first try is a guess. This runs against the explicit-for-novices side of the evidence. The level logic does not reach the item-presentation and first-hint rules, which are the strongest "ask, don't tell" habits. `ruleFirst`, `clarity` and `hints` exist but are not switched on and are not level-aware (they fire on signals, not on level). | **High** |
| 3 | **Corrective feedback** (moderate; level differences contested) | Feedback is mostly *prompts*: `corrective_feedback_retry` (`:989`) says keep what is right, give "one hint aimed only at the gap ... and ask them to try again before you show the correct form"; novices get `level_novice_prompt_first`, strong learners get "a brief correct reformulation" (a recast). A six-level hint ladder runs from attention cue to direct explanation (`HINT_LADDER`, `selectHintLevel` `languageLearningState.ts:415`). `diagnoseError` (`:693`) targets 9 specific error causes (all English forms, e.g. missing third-person -s). Answer leaks are stripped (`stripPreAttemptModels`, `possibleAnswerLeak`). | The design is reasonable: it always corrects, and it escalates from prompt to explanation, which matches "prompts first, explicit if they fail". Gaps: (a) the first hint level reveals *neither the rule nor the form*, so a novice who lacks the form gets 2 to 4 prompt turns before any explicit information, which is slow when the knowledge is missing; (b) recasts for strong learners are not made visible or followed by a learner repeat; (c) the correction level follows a broad level band, not the learner's evidence on that specific form; (d) `diagnoseError` covers only a handful of forms and none is Arabic-specific. | **Medium** |
| 4 | **Skill acquisition** (moderate) | A learner can move through the hint ladder; `independent_practice` offers "two sentences using the target form" for strong learners; a correct answer triggers "one more unaided check in a new context" (r4.4 #3, `ENARA_TUTOR_CAPABILITIES.md` §3); objective-level retention (`retention.ts`, ret-v1) schedules reviews after two independent correct answers. | No explicit **sequence per form**: rule, guided practice, less-supported practice, free use. Practice is whatever the lesson items give; there is no step that raises speed or reduces support on purpose, and nothing keeps practice *production-matched* (type, speak, write) to the skill. "Never call one correct answer mastery" is a good guard but not a plan. | **Medium to high** |
| 5 | **Task-based / focus on form** (moderate; full TBLT contested) | The tutor evaluates a learner's *own* sentence (`unpromptedSentence` → `corrective_feedback_retry` with `unprompted_learner_sentence`) and can offer a free task to strong learners. `general_practice` starts a generic task when no lesson is chosen. | Lessons are item lists, not tasks. No task bank (describe, ask, decide, write a message) with a *planned* form focus. Focus on form happens reactively, not by design. Because beginners are the main audience, a full task-based course is **not** what the evidence supports; a rule-practice-task sequence is. | **Medium** |
| 6 | **Input, interaction, pushed output** (strong for input; moderate for the rest) | Interaction: the tutor can restate (`restate_task`), simplify (`reteach_simpler`) and ask for clarity on unclear answers (`corrective_feedback_retry` "unclear: ask one short question"). Input quality rule: `comprehensible_model`. Output: items often ask for a full sentence or a word. Reply length is set by age band and CEFR step (`LENGTH`, `lengthTarget`, `:1068`). | No reading or listening content to supply input (see strand 1). Pushed output is incidental: nothing asks the learner to rewrite a vague answer into a precise one. The `l1_support` move forbids all Arabic in replies (see §5). | **Medium** |
| 7 | **Vocabulary** (strong spacing and testing effect; moderate for L2 specifics) | `LanguageSpec.vocabulary` is taught from the teacher's list; hints are skill-aware (word items never reveal letters, `itemKind` `:1161`). Spaced review exists in two forms: **objective-level** (`retention.ts`, ret-v1: intervals 3, 7, 14, 30, 60 days; reset to 1 day on an independent miss; `replayRetention`) and **per-question** (`reviewService.ts`, `queueQuizMistakes`, `listDueReviews`, `answerReview`). | Word choice is not frequency-graded: no frequency list or CEFR word list drives selection. The two review systems serve quizzes and objectives; the `memory` switch (`engineV2.ts`, `learnerLanguageProfile.ts`, `listDueReviews` in `tutor.controller.ts:534`) stores *beliefs and error types* and returns due reviews only when switched on. Whether the tutor itself starts a lesson by retrieving yesterday's words is also gated by `memory`. Depth of processing is not designed: items are mostly fill-in or short answers. | **Medium to high** |
| 8 | **CEFR** (strong as standard; contested as model) | CEFR is used as a **calibration input** only: `levelBand` (`:352`) maps A1 to A2 to "beginner", B1 to B2 to "intermediate"; `cefrStep` (`:1059`) sets length targets and load (`LENGTH`, `LOAD_BUDGET`); `Assignment` has `cefrLevel` and speaking exams use it (`models/Assignment.ts:6`, `speakingExam.ts`). Learner proficiency is a *course level*, not measured: the prompt says "an estimate, not a test result" (`:1359`). | Lesson objectives, exercise items and assessments are **not** tagged with CEFR level and skill. No can-do statements in lessons or in reports to learners, teachers or parents. The learner's level is a single course-level label, not per skill and per form. Progress cannot be reported against the framework. | **High** (for reporting and for the pilot's measurement) |
| 9 | **Arabic L1 transfer** (moderate; predictiveness contested) | The only Arabic-aware parts are: Arabic-script detection (`mostlyArabicScript`, `usesArabicScript`, `:383`), a few Arabic phrase patterns for help/answer/confusion requests, the rule that replies are English-only (`ENGLISH_ONLY_RULE`, `:1097`), and `l1_support` (`MOVE_TEXT`, `:982`: reply in simple English, "no Arabic words at all"). `diagnoseError` handles generic English forms. | **No Arabic error library**: nothing anticipates article errors, copula omission, resumptive pronouns, p/b, vowel and spelling errors. Hints are not written in terms of the Arabic difference. Phonology is outside a text chat. The "no Arabic at all" rule goes further than the evidence on own-language use supports for beginners (mixed evidence; a judicious use of L1 for explanation is not shown to hurt and may help). | **High** (main audience) |
| 10 | **Developmental sequences / teachability** (moderate; strong claim contested) | The teaching plan picks methods by mastery status (not assessed, emerging, developing, proficient, mastered) and weak prerequisites trigger `prerequisite_remediation` (`pedagogyPolicy.ts`, `selectTeachingPlan`). Third-person -s, pronoun forms and perfect vs past are among the taught targets (pilot protocol targets). | No explicit sequence of structures per CEFR level (which forms before which). Prerequisites come from teacher-built records, not a developmental map. The tutor does not expect or plan for the late, uneven acquisition of third-person -s and articles (it can still say "mastered" from short evidence). | **Low to medium** |

## 2. Answers to the audit questions

### 2.1 How does ENARA's time split across the four strands?

**Not measured; from the code it is overwhelmingly language-focused learning (strand 3).** Evidence from the code:

- The 17 moves in `MOVE_TEXT` (`languageTeachingContext.ts:982`): *explain / hint / correct / present an item / check / restate / reteach* are strand 3; `clarify_goal`, `general_practice`, `activate_prior_knowledge` are setup; `comprehensible_model` is an input-*quality* rule, not input; `independent_practice` (strong learners only) and the learner-sentence path are the only strand-2 routes; **no move produces strand 1 content or strand 4 practice.**
- The lesson format is an item list (`LanguageSpec.items`), which is form-focused by construction.
- The pilot protocol's targets are three grammar forms (`PILOT_PROTOCOL_learning_outcomes.md`), so the planned evidence also measures only strand 3.

A fair reading: ENARA's design is *reasonable for a form-focused tutor* and says so; it is not a balanced course. The research does not say a tutor must cover all four strands alone (the learner's school lessons cover some), but it does say a course that claims to teach English should know where the other strands come from. **Recommendation:** tag every turn with a strand and report the split per learner (roadmap item 7).

### 2.2 Do "no rule before the first try" and the 11 methods that never state the rule conflict with the evidence on explicit instruction for novices?

**Yes for novices, no for strong learners, and the evidence on this is moderate, not decisive.**

- The two engine rules: `MOVE_TEXT.present_lesson_item` and `HINT_LADDER` level 1 withhold the rule from everyone. For a learner with no knowledge of the form, a first try cannot show "what they already know" (the stated reason in the move text); it produces a guess, and ENARA then runs a hint ladder whose first two levels still reveal neither the form nor the rule applied. The explicit-instruction evidence (Norris & Ortega; Spada & Tomita; expertise reversal; see the framework, sections 2) favours telling novices first.
- The methods: of the 28 registry entries (`strategyRegistry.ts`), `docs/ENARA_METHODS_AND_CLARITY.md` §3 counts eleven that never state the idea or state it only after failure. Five carry `withholdsAnswer: true` (Socratic, inquiry, problem, case, project) and are blocked for novices by `usable()` in `pedagogyPolicy.ts`; the others (retrieval, interleaving, concept mapping, metacognitive, gamification, independent practice) are mostly supporting or reinforcing roles that do not remove an explicit method.
- What ENARA does right: it already treats novices differently elsewhere (short explanation, comprehensible model, one task per reply, fade for strong learners), and the answer-hiding guards are well tested. A tutor that does not give away answers is a reasonable response to a real risk (learners asking for answers); the conflict is about *when the rule is stated*, not about hiding the answer.
- What ENARA's own simulated studies add (weak, AI-learner evidence, 8 students per arm, see `AGENT_SIM_CLARITY.md`): removing the two rules (`socraticOff`, arm C) moved clarity ratings up by 0.81 [+0.12, +1.44] and overall by +0.69 [+0.06, +1.25], but the corrected p-values (Holm .38 for clarity) did not clear the bar, and the arm is research-only. It is consistent with the research and with the plain tutor beating ENARA on clarity in every earlier study. It is not proof.

### 2.3 Does ENARA's corrective feedback match the research?

**Largely yes in shape; two mismatches by level.**

Matches: it always responds to an error; it prefers prompts to recasts (prompts at least as good in the meta-analyses); it escalates to explanation and a worked example (hint levels 5 and 6); it names the likely cause for known forms (`diagnoseError`); it avoids praising a wrong answer and says so in the guards (`OPENS_WITH_PRAISE`, `contrastPairClaimMismatch`).

Mismatches and open questions:
1. **Novices get prompts first when they lack the knowledge** (`level_novice_prompt_first`). Prompts depend on the learner being able to self-repair. For A1 learners, a first correction with a short reason would likely be better; the evidence on level is thin, so treat this as a testable change.
2. **Strong learners get a recast** ("a brief correct reformulation is enough"). In text, a recast can be skipped. Ask for a repeat.
3. **No visible link between the error and the Arabic source** of it (see 2.7).
4. **Feedback is graded by item, not by learner history on the form**, apart from the `errorRecurrence` signal, which is crude (string-based flagged spans).

### 2.4 Does ENARA move learners from guided practice to free, fluent use?

**Only by chance.** Strong learners get `independent_practice` ("two sentences using the target form"), and a correct answer triggers one more unaided check. Nothing sequences guided → less-guided → free → fast. Fluency (speed, ease) is not targeted at all. Effect on the research: skill acquisition theory expects exactly this missing path.

### 2.5 Is spaced review built into the core, or an add-on?

**Mixed: the scheduling engine is a core service; the tutor's use of it is an add-on.**

- Core and solid: `retention.ts` (ret-v1) computes objective-level review dates deterministically from evidence (intervals 3, 7, 14, 30, 60 days; starts after two independent correct answers; early answers do not count) and feeds `selectTeachingPlan` (a lapsed retention check selects `retrieval_practice` and `spaced_repetition`). `reviewService.ts` queues quiz mistakes as per-question reviews. These are good designs, aligned with the spacing and testing evidence (the retention interval set and "no cramming credit" rule are sound; the interval values are conventional, not individually tuned, as the file says).
- Add-on: whatever carries **language-specific** review (beliefs, error types, what worked, "an opening review check", `GET /tutor/reviews/due`) is behind `ENARA_ENGINE_V2=memory`, which is off by default (`engineV2.ts`; `listDueReviews` returns an empty list unless it is on, `tutor.controller.ts:534`). It stores error *types*, not words, so **vocabulary retrieval is not scheduled by it**.
- Net: spaced review is strong in the data layer and thin in the lesson flow. Session starts do not routinely begin with retrieval of earlier material unless `memory` is on.

### 2.6 Are lessons and assessments linked to CEFR?

**Not in a way that supports reporting.** CEFR is used to set reply length, load and the novice/strong band (`cefrStep`, `levelBand`), and as an assignment field for speaking exams. Lesson objectives, exercise items, success criteria and the evidence records have no CEFR level or skill tag; the learner's level is one course-level string, described to the model as "an estimate, not a test result". No can-do statements appear to learners, teachers or parents. The pilot protocol's secondary outcomes do not include a CEFR-linked measure, and it explicitly does **not** claim any CEFR change.

### 2.7 Does ENARA anticipate the errors Arabic speakers typically make?

**No.** The code has no Arabic-specific error knowledge: `diagnoseError` knows nine English-form causes (missing third-person -s, wrong ending, past form for routine, pronoun swap or omission, perfect with finished time, past for life experience, wrong participle, unchanged from prompt) and an `unknown` fallback that asks the learner to explain. These are common to many learners. No article error codes, no copula omission, no resumptive pronouns, no word-order patterns, no spelling or vowel patterns, no Arabic-based explanations. This is the largest gap for the stated audience, and it is also the one where a simple, inexpensive library (data plus a few detection rules) could be built and tested.

### 2.8 Which of the 23 methods suit language learning, and at which levels?

Source of the method facts: `strategyRegistry.ts` (flags `withholdsAnswer`, `givesAnswerLastResort`, `noviceSafe`), selection in `pedagogyPolicy.ts` (`selectTeachingPlan`, `usable()`), and the per-method reading in `docs/ENARA_METHODS_AND_CLARITY.md` §3. The fit ratings below are **my judgment from the framework**, not tested; where it differs from ENARA's own flags it says so.

| Method | Fit for language lessons | Suited level | Recommendation |
|---|---|---|---|
| 1 direct_instruction | **Strong**: explicit rule, model, then practice | A1 to B1; novices | Keep; make it the default first exposure for novices |
| 12 worked_example | **Strong**: model one, then fade | A1 to B1 | Keep; pair with a rule statement |
| 3 scaffolding | **Strong**: matches graded support | all, fading with level | Keep |
| 14 analogy | Good for rules with a clear L1 contrast | A1 to B1 | Keep; use Arabic contrast as the analogy source |
| 22 narrative_contextual | Good for input and meaning-focused work | A1 to B2 | Keep; extend into actual input texts |
| 9 retrieval_practice, 10 spaced_repetition | **Strong** for vocabulary and forms | all | Keep; make routine, not only after a lapse |
| 20 formative_feedback | Good, but "this needs X, not Y" can reveal the form | all | Keep; check against the answer guards |
| 4 mastery_learning | Reasonable, if "mastery" needs several independent successes | all | Keep, with the multi-success rule |
| 13 elaborative_interrogation | Good once a rule is known (ask why) | B1+ | Limit to learners who already have the rule |
| 2 socratic_questioning | Weak for grammar rules a learner cannot discover; fine for meaning, usage and discussion | **B2+ only** | **Limit**: already blocked for novices (`usable()`); also exclude below B1 and for rule-based items |
| 5 inquiry_based, 6 problem_based, 7 case_based, 8 project_based | Task-like, content-heavy; useful for tasks and output, not for teaching a form | B1+ for tasks | **Limit** to task and output activities for B1+; not as the teaching method for a new rule |
| 23 blooms_guided | Poor fit: "explain in your own words" after failure replaces re-teaching, and learners cannot explain a rule they have not met in English | B2+ | **Limit** to B2+; never for a failed application at A1 to B1 |
| 15 metacognitive, 16 think_aloud | Good as supporting; think-aloud models writing and reading strategies | B1+; think-aloud also for A2 | Keep as supporting |
| 11 interleaving, 17 concept_mapping | Useful for review of contrasts (e.g. past vs perfect) and vocabulary networks | A2+ | Keep as supporting, for review, not first teaching |
| 18 differentiated_instruction, 19 adaptive_pathways | Modifiers; fine | all | Keep |
| 21 gamification | Motivation only; no learning mechanism by itself | all | Keep as a modifier, not as a method |
| Techniques: visual_explanation, prerequisite_remediation | Good, especially for novices | A1 to B1 | Keep |
| error_analysis | Good for contrasting wrong and right forms | A2+ | Keep; use Arabic-L1 errors as the "wrong" examples |
| guided_practice, independent_practice | Needed for the practice sequence | by level | Keep, and make them stages of one sequence |

Not removed outright: nothing here needs deletion. The rule that matters is **level gating**: Socratic, inquiry, problem, case, project and blooms_guided should not be the *primary* method for introducing a new form below B1 to B2. `usable()` already blocks the five `withholdsAnswer` methods for novices; `blooms_guided` is not gated this way, and the B1 boundary is not coded.

## 3. Where ENARA's current design is reasonable (not to be "fixed")

- Hiding the answer until a genuine try: a sensible guard against learners who want answers; it should stay for the *answer*, while the *rule* is stated earlier for novices.
- A graded hint ladder with leak detection: matches "escalate from prompts to explicit information", and is well tested for leaks.
- `retention.ts` spaced review design: sound and based on the spacing and testing evidence; the gap is lesson flow.
- "Never call one correct answer mastery" and the independent-evidence rule: aligned with skill acquisition and with the retention evidence.
- Level-aware reply length and load (`LENGTH`, `LOAD_BUDGET`): aligned with comprehensible-input and cognitive-load ideas.
- English-only replies: a defensible design choice (maximises English exposure). It is a *choice*, not a finding; the evidence on L1 use is mixed and does not require removing it, only asks that the choice be tested at A1.

## 4. Cross-check against ENARA's own (weak) simulation findings

These are consistent with the research-based gaps above, but are **AI-simulated** and **not** proof:

- ENARA is clearly behind the plain tutor on **explanation clarity** in every study, and the largest single lever tested was removing the "no rule before the first try" habit (`socraticOff`), supporting gap 2.
- Adding the 23-method plan on its own added nothing measurable (A − A0 clarity −0.25 [−0.88, +0.38]); the methods table above explains a plausible reason (several never state the rule, and the plan and the engine disagree without `arbitration`).
- ENARA is ahead on **making learners reason** and **not giving answers away**: real strengths, kept in the plan.
- No simulation here measured delayed retention, CEFR links, Arabic-specific errors or fluency; those gaps are open.

## 5. Severity ranking (feeds the roadmap)

1. **High:** no fluency or input strand (1); explicitness not level-based and the "no rule before first try" rules apply to novices (2); no CEFR tagging (8); no Arabic L1 error library (9).
2. **Medium to high:** no rule → guided → free practice sequence (4); vocabulary not frequency-graded and review not part of the lesson flow (7).
3. **Medium:** feedback level not tied to the learner's evidence on the form (3); no planned tasks (5); no strand tags or pushed output (6).
4. **Low to medium:** developmental map of structures (10).
5. **Defect, not a gap:** `shortRecap` can append its closing ask to a reply that already sets a task. The arm-B and arm-C code of the clarity study fixes it for `shortRecap` only; `closing` still appends the ask to a task reply. Details are in the roadmap.
