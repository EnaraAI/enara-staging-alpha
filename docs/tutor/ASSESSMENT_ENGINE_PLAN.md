# ENARA Assessment Engine: plan

Status: **plan, waiting for Mohamed's "go"**. No code before that. lms-test only; test.enara.app frozen until Mohamed reopens it.
Branch `claude/tutor-assessment-engine` (tutor track). Checked against `lms-test-live` at `84cbf448` (after PR #87).

## 0. What already exists, and how this plan reuses it

The brief asks for no parallel assessment system. ENARA already has most of the plumbing, so the engine is built **into** it.

| Brief | What exists today | Plan |
|---|---|---|
| Item | Questions live inside `Assessment.questions` (`IQuestion`): `multiple-choice`, `true-false`, `short-answer`, `open-response`. Each has `objectiveIds`, `difficulty` 1–5, `cognitiveLevel`, `distractors` (misconceptions), `acceptedAnswers`, `source: manual\|ai`, `sources[]`. Published assessments are frozen in `AssessmentVersion`. | **New `BankItem` collection** (versioned, the bank). An approved item is **copied into** an assessment's `questions` when a teacher adds it, with `itemId` and `itemVersion`. Delivery, attempts, versions, grading, release and the ledger stay as they are. |
| CurriculumObjective | `LearningObjective`: `code`, `curriculumId`, `title`, `language` (en\|ar), `status`, `version`, prerequisites. `Curriculum` has `type` and `level`. | **Extend `LearningObjective`** with `curriculum` key, `level`, `subject`, `title_ar` and `title_en`. No second objectives table. |
| Rubric | `IQuestion.rubric.criteria[]`: `{id, title, maxPoints, levels[{id, label, points}]}`, embedded per question. `frontend/pages/teaching/cefrRubric.ts` holds CEFR text. | **New versioned `Rubric` collection** (bilingual descriptors). It is copied into `question.rubric` in today's shape, plus the `_ar`/`_en` text, when the item goes into an assessment. |
| Attempt | `AssessmentAttempt` + `IAttemptAnswer` (`isCorrect`, points, feedback, `needsReview`), grading statuses, `releasePolicy` (P22), `GradeLedger`. | **Extend**: per-criterion `{code, points, reason_code}`, `confidence`, `flagged`, `grader`, `error_codes`, `feedback_text`, `teacher_override`. |
| Closed grading | `grading.ts` `gradeAnswers` (answer key), `graderV2` target-form scorer, `acceptedAnswers`, error-correction check. | Add the new closed types next to them, in `backend/src/assessment/graders/closed/`. |
| Open grading | `autoGrading.ts` (autograde-v1: queue, lease, retries, 2 consistency runs, `grading_exception`) + `gradingProposals.ts` (eval-v2: schema, rubric level ids, **exact quotes as evidence**, every call stored). | **Domain graders plug into `gradingProposals`**. They keep its checks and audit trail, and add confidence and reason codes. Flagged answers reuse `grading_exception` and `needsReview`. |
| Teacher review | `GradingReview.tsx` (queue, open, grade by hand), corrections with a reason after release. | Extend it: model scores per criterion, reasons, override with `reason_code`. |
| Generation | `educatorAi.ts` author-v1: drafts for a teacher, sources are data, `source: 'ai'` must be reviewed. | **Generation reuses its source retrieval and "drafts are reviewed" rule.** New: structured prompts per subject and type, code checks, judge, `ReviewDecision`. |
| Benchmark | `scripts/benchmarkEnglishAssessment.ts`, `benchmark3Model.ts`: real engine, in-memory DB, capped `BudgetLedger`, mock and live modes. | **The bench follows the same pattern** (real engine, hard cost cap, resume). It becomes a CI job. |
| Errors to work on | `errorsToWorkOn.ts`: release gate (`eligibleErrors`), `focus=E1..E3` practice, `studentErasure`. | Error codes from the new graders feed it unchanged, **after release** (LEARNER_MEMORY_PLAN rules). |
| LMS grades | Assignment results go to the Moodle gradebook (AGS), tested in E2E scenario 4. | Unchanged; the new types produce ordinary attempt totals. |

### Where the brief and the repo differ (my proposals)
1. **No `packages/` folder.** The backend is one app, `backend/src`. The engine goes in **`backend/src/assessment/`**: `schema.ts`, `text/ar.ts`, `graders/closed/*`, `graders/domains/*`, `generate/*`, `prompts/`, `rubrics/`, `bench/`.
2. **Switches.** lms-test switches are set from `deploy/lms-test.flags.json`, which only allows certain names. Tutor-engine features already use named `ENARA_ENGINE_V2` switches. I'd use **`assessGen`** and **`assessModelGrading`** there, plus **`assessTypesV1`** for the new closed types. All are off by default and on for lms-test.
3. **No `zod` or `mathjs` today.** Validation is hand-written (`gradingProposals`). Adding both is fine and small: `zod` for strict JSON from models, `mathjs` for numbers and expressions. The alternative is the sympy service in decision 4.
4. **The models.** CLAUDE.md requires judging through the **Anthropic API** with the real engine. lms-test runs learner features on **DeepSeek** until the new Anthropic key arrives.
   - **Generator and graders:** the configured provider (DeepSeek on lms-test now).
   - **Judge and bench gold:** Anthropic (Opus-class). This needs the Anthropic key in GitHub secrets for the bench job.
   - Every call goes through `aiGateway` with a **cost ceiling** (the spend cap refuses calls without one; found in PR #87).
5. **Learner UI language.** The server has no learner UI-language field today; the app keeps it in the browser. P1 adds **`Student.uiLanguage`** (`ar`\|`en`). It is set from the app's language switch and sent with each attempt, so `feedback_text` is written in it.
6. **Existing open grading keeps working.** `open-response` questions without a domain rubric keep eval-v2. Domain graders run only for bank items with a bank rubric, behind `assessModelGrading`.

## 1. What we are building
Same as the brief:
- A subject-agnostic, bilingual (ar + en) engine.
- A versioned item bank with a fixed schema.
- Generation: generator → code checks → judge → teacher review.
- Grading: closed types by code; open types by a domain grader with a fixed rubric, confidence and teacher override.
- A benchmark in CI that blocks regressions.
- The schema and pipelines never assume English or CEFR; language-specific rules live in the `language` domain only.

## 2. Arabic and English, end to end
As in the brief, with these placements:
- **Three language fields, never merged:**
  - `item.language` (question text);
  - rubric descriptors in both languages;
  - `Student.uiLanguage`, which sets the language of feedback and UI.
- **`backend/src/assessment/text/ar.ts`** (+ tests):
  - normalisation: أ/إ/آ→ا and ى→ي always; ة→ه only by item flag;
  - strip tashkeel for comparison, keep it for display;
  - accept Arabic-Indic and Western digits.
  - The tutor already has `foldArabic` (deepseekTutor.ts); both use one helper, so there aren't two versions of the rules.
- **Arabic error taxonomy** next to the English one (same `workOn` code style): `gender_agreement`, `number_agreement`, `case_ending`, `hamza_spelling`, `verb_conjugation`, `connectors`, `definiteness`, `word_order`.
- **Numbers:** digits, units and decimal separators follow `item.language`. Arabic-Indic digits and the Arabic decimal mark (٫) are accepted on input.
- **UI:** all new screens use the existing i18n in ar and en. E2E checks RTL (`dir="rtl"`, no sideways scroll at phone width).
- **Bench:** every dataset is built in both languages, and thresholds apply per language.

## 3. Item schema (`backend/src/assessment/schema.ts`, migrations)
**BankItem**: as the brief, with two adjustments.
- `id`, `version` (immutable; an edit makes a new version), `subject`, `language`, `curriculum`, `level`.
- `objective_code` points to `LearningObjective`.
- `type`, `difficulty` 1–5, `stem`, `media`, `options`, `answer_key` (with `solution`, never sent to a learner), `rubric_id`.
- `skill_codes[]`, `error_codes[]`, `source`, `review_status`, `judge_report`, `stats`, `created_by`, `created_at`, `school_id` (null = shared bank).
- Also `flags` (`lenient_spelling`, `ta_marbuta_fold`, `kids`).
- **Adjustment 1:** `stats` (p-value, discrimination, average time) is computed nightly from attempts, not written per attempt.
- **Adjustment 2:** an item copied into an assessment keeps `itemId` and `itemVersion` on the question, so stats and overrides trace back to the bank.

**Rubric**: `id`, `version`, `domain`, `type`, criteria `{code, title_ar, title_en, max_points, descriptors_ar, descriptors_en}`, `total_points`.

**ReviewDecision**: item, version, teacher, decision, `reason_code`, at.

**Attempt answers** (extended): per criterion `{code, points, reason_code}`, `confidence`, `flagged`, `grader` (`code` \| `model:<id>` \| `teacher`), `error_codes[]`, `feedback_text`, `teacher_override {total, reason_code, at}`.

**Privacy:**
- `feedback_text` is the only stored model free text, and it is deleted with the learner (`studentErasure`).
- `ReviewDecision` holds no learner data.

## 4. Types and code grading
- **v1:** mcq, true_false, fill_blank, matching, numeric, short_answer, essay, math_steps.
- **v2:** ordering, dropdown, sentence_correction, paraphrase, reading_comprehension, listening, speaking, code.

The answer-key shapes and rules are as in the brief. Mapping to today:
- `mcq` and `true_false` already exist (`multiple-choice`, `true-false`). Multi-answer mcq is new.
- `short_answer` and `essay` map to `short-answer` and `open-response` with a bank rubric.
- `fill_blank`, `matching`, `numeric` and `math_steps` are new types in `IQuestion`. Old clients see them only when `assessTypesV1` is on.
- Closed graders live in `assessment/graders/closed/*.ts`, with ≥95% line coverage (a vitest coverage gate on that folder only).

## 5. Generation pipeline (`backend/src/assessment/generate/`)
As in the brief:
1. generator;
2. code checks;
3. judge (criteria 1–5: clarity, single_correct_answer, level_fit, objective_fit, key_correctness, language_quality, safety; pass = all ≥4 and safety 5; one regeneration with the judge's feedback);
4. teacher review.

Additions:
- Source text uses `educatorAi`'s retrieval (only passages from the school's chosen documents; humanities facts only from them).
- **Code checks also:**
  - refuse an item whose stem or options leak the answer;
  - refuse items near-identical to an item the learner's class saw in the last 90 days (reuses the assessment-item guard pool);
  - check that `item.language` matches the text's script.
- **Teacher review** goes in a new "Question bank" tab inside `AssessmentBuilder`:
  - generate form, results, approve, edit, reject with a `reason_code`;
  - "Add to assessment", which copies the item into the draft, so the existing publish checks apply.
- Switch `assessGen`.

## 6. Grading pipeline (`backend/src/assessment/grade/`)
As in the brief:
- closed → code;
- open → `domainGrader(item, rubric, answer, uiLanguage)`, which returns criteria, total, confidence, feedback_text and error_codes as strict JSON, retried once.

The model gets only those fields: never the learner's id, name, history or class, or other learners' answers.

Placement:
- The domain grader is called by `gradingProposals` (it keeps eval-v2's checks: rubric level ids, exact quotes as evidence).
- `autoGrading` keeps its lease, retries and consistency run.

**Flags** (send the attempt to the teacher queue, learner sees "under review"):
- confidence < 0.7;
- total within 1 point of the pass mark;
- the two consistency runs disagree by more than 1 point on any criterion. Today they run on every answer, so this replaces the brief's 10% sample.

**Release:** a flagged answer is released only when the teacher has reviewed it (existing gate).

**Override:** a new total plus a `reason_code` (`too_strict`, `too_lenient`, `wrong_criterion`, `rubric_unclear`). It is written as a ledger correction with that reason and fed to the bench.

**Error codes** reach `workOn` only after release, per LEARNER_MEMORY_PLAN.

Switch `assessModelGrading`.

## 7. Domain graders v1
As in the brief:
- **language:** task_completion, grammar_accuracy, vocabulary_range, organisation, mechanics; ar + en; CEFR descriptors when `curriculum=cefr`, generic otherwise.
- **math:** the final answer is checked by code; method criteria are method_choice, execution and representation; method points are given even when the final answer is wrong.

The CEFR text already in `cefrRubric.ts` moves into `rubrics/language/*.json`, so there's one source.

v2: science, humanities, code.

## 8. Benchmark (`backend/src/assessment/bench/`)
- **Datasets, metrics and thresholds** are as in the brief, per domain and per language:
  - closed = 1.0;
  - open within-1 ≥ 0.85;
  - generation judge pass ≥ 0.80;
  - flag rate ≤ 0.20.
- **CI job `assessment-bench`:**
  - runs on PRs that touch `backend/src/assessment/{prompts,rubrics,graders}/**`, and on manual dispatch;
  - fails below a threshold, or 0.03 below the last `lms-test-live` result;
  - small batches, resumes after a usage-limit stop.
- **Cost guard:** every call goes through `aiGateway` with a ceiling, and a run has a hard dollar cap (the existing `BudgetLedger` pattern). Estimate below.
- **Frozen data:** items and answers are generated once, frozen in the repo and never regenerated by CI. CI only re-grades and re-judges.

**Cost estimate per full run, both languages, two v1 domains:** about 1,600 grading calls and 800 judge calls. That's roughly $8–15 with the judge on Opus, and under $1 for the grading on DeepSeek. A PR touching one domain runs that domain only.

## 9. UI (inside existing apps, ar + en, RTL, phone first)
- **Teacher:**
  - "Question bank" in AssessmentBuilder (generate, review, add);
  - GradingReview extended with model criteria, reasons and override.
- **Learner:** `AssessmentInterface.tsx` extended for fill_blank (inline inputs), matching (tap pairs), numeric (number + unit) and multi-answer mcq.
- **Admin:** an "Item bank" card (items by subject, language and status; judge pass rate; flag rate; last bench result).
- **Parents:** no change. Error codes already reach parents through errors to work on, after release.

## 10. Integration
- Items are usable in assignments, and in tutor practice. `focus=E1..E3` can pick a bank item with the same `error_code` and objective, instead of the tutor writing one. That's a later switch, after P3.
- Moodle gradebook: through the existing path, with no new LTI work.
- v2: export of approved items as Moodle XML / QTI 2.1.

## 11. Phases → PRs
Each phase has its own switch and E2E on its PR, and the plan status is updated each time.
- **P1:**
  - schema, migrations, `LearningObjective` extension, CEFR + one more curriculum seed;
  - `ar.ts`, closed graders, `Student.uiLanguage`;
  - learner UI for v1 closed types (ar + en).
  - **Done:** coverage ≥95% on closed graders. E2E in ar and en: a teacher creates an assignment with each closed type, a learner answers it, the grades are right, and the Moodle gradebook receives them.
- **P2:** generation, checks, judge, teacher review, `ReviewDecision`; bench v0 (generation metrics, ar + en).
  - **Done:** E2E generate → review → approve → assign in both languages; judge pass ≥0.80 for language and math, ar and en.
- **P3:** language grader (short_answer, essay; ar + en), flags, teacher queue, override, error codes → workOn; full language bench.
  - **Done:** open within-1 ≥0.85 per language; E2E flagged → override → the learner sees the final grade after release.
- **P4:** math grader (numeric, math_steps); full math bench, ar + en.
- **P5:** CI regression gate, admin card, cost and latency report.
- **P6 (v2):** ordering, dropdown, reading comprehension, listening/speaking, science and humanities graders, Moodle XML/QTI export, code runner.

Estimated size: P1 is the largest (schema + 4 new types + learner UI). P2 and P3 are medium; P4 and P5 are small.

## 12. Non-goals
As in the brief:
- no new LTI/LMS work;
- no speaking, listening, code runner or QTI in v1;
- no manual runbooks or click tests;
- no changes to test.enara.app (frozen until Mohamed reopens it);
- no stored model free text except `feedback_text`.

## 13. Decisions for Mohamed (before "go")
1. **First non-CEFR curriculum to seed.**
   - My suggestion: **Egyptian national, primary Grades 4–6 maths and Arabic**. It matches the schools on lms-test, has a fixed objective list, and covers both languages.
   - IGCSE can come next.
2. **Arabic variety for language items.**
   - My suggestion: **MSA for all items and grading**. Egyptian Arabic only in kids' feedback text and instructions, never in what's graded.
3. **~100 teacher-graded real answers per domain per language for `gold_teacher.json`?**
   - Until they exist, the bench uses the Anthropic judge's grades as gold, and reports say so.
4. **Expression equality.**
   - My suggestion: **mathjs in-process for v1** (numbers, units, simple algebra).
   - A sympy service only if the math bench shows mathjs missing real equivalences.
5. **New, from reading the code:**
   - **a) Switches:** use named `ENARA_ENGINE_V2` switches (`assessTypesV1`, `assessGen`, `assessModelGrading`) instead of new env names?
   - **b) Judge model:** confirm Anthropic for the judge and the bench gold (needs the Anthropic key in GitHub secrets and on lms-test), with DeepSeek for the generator and graders while it stands in.
   - **c) Bench budget:** cap per full run, my suggestion **$20**, and per PR run **$5**.

Waiting for your answers and "go".
