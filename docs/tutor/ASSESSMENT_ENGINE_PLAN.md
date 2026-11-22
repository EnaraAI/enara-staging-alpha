# ENARA Assessment Engine: final plan

Status: **go given (22 Nov 2026). P1a in progress.** Branch `claude/tutor-assessment-engine` (tutor track). lms-test only; test.enara.app frozen until Mohamed reopens it.

## Progress
| Phase | Status | PR |
|---|---|---|
| P1a schema, seeds, ar.ts, uiLanguage, closed graders | done (seeds deferred: CURRICULUM_BOOKS_NEEDED.md) | #88 |
| P1b learner UI for closed types + E2E ar/en | done | #89 |
| P2 grading engine core, language + math graders, flags, override, migration of open grading, bench | not started | – |
| P3 science, humanities, code graders, listening/speaking, bench | not started | – |
| P4 generation, checks, judge, teacher review, generation bench | not started | – |
| P5 CI regression gate, admin card, cost/latency report | not started | – |

## 0. Reuse what exists
Build INTO the existing system. Engine lives in `backend/src/assessment/` (no `packages/` folder).

| Part | What exists today | Plan |
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

- **Switches** (existing `ENARA_ENGINE_V2` names): `assessTypesV1`, `assessGrading`, `assessGen`. Off by default, on for lms-test via `deploy/lms-test.flags.json`.
- **Libraries:** `zod` (strict JSON from models) and `mathjs` (numbers, units, simple algebra). sympy only if the math bench shows mathjs missing real equivalences.
- **Models:**
  - generator and graders run on the configured provider (DeepSeek on lms-test now);
  - judge and bench gold run on Anthropic (Opus-class). The Anthropic key is Mohamed's task. Until it is in GitHub secrets and on lms-test, the bench uses the configured provider as judge, and every report says **"gold: judge (provisional)"**. Keys are never asked for in chat.
  - Every model call goes through `aiGateway` with a cost ceiling.
- **`Student.uiLanguage`** (ar\|en) is added in P1a, set from the app's language switch and sent with each attempt.
- **Item stats** are computed on demand (admin card refresh) and on assessment release. No nightly job.

## 1. What we build
A subject-agnostic, bilingual (Arabic MSA + English) assessment system with three parts:
- **(A) a standalone Grading Engine** that grades every question type in both languages;
- **(B) a versioned item bank;**
- **(C) a generation pipeline:** generator → code checks → judge → teacher review.

Quality is proven by a benchmark in CI that blocks regressions. Nothing grades outside the engine: the existing `gradeAnswers`, graderV2 and eval-v2 paths are migrated into it, keeping their audit trail and consistency runs.

## 2. Languages: Arabic + English, end to end
- **Arabic = Modern Standard Arabic everywhere:** items, rubrics, grading, `feedback_text`, kids' instructions, UI. No dialect anywhere.
- **Three language fields, never merged:** `item.language` (question text), rubric descriptors (both ar and en), `Student.uiLanguage` (feedback + UI).
- **`backend/src/assessment/text/ar.ts`** (one helper, shared with the tutor's `foldArabic`):
  - أ/إ/آ→ا and ى→ي always; ة→ه by item flag;
  - strip tashkeel for comparison, keep it for display;
  - Arabic-Indic and Western digits, and the Arabic decimal mark, are accepted.
- **Arabic error taxonomy** next to the English one: `gender_agreement`, `number_agreement`, `case_ending`, `hamza_spelling`, `verb_conjugation`, `connectors`, `definiteness`, `word_order`.
- **Judge `language_quality` for Arabic** = correct MSA, no dialect, age-appropriate register.
- **UI:** all new screens in ar and en via the existing i18n. E2E checks RTL and no sideways scroll at phone width.
- **Bench:** every dataset exists in both languages. Thresholds apply per language, and a PR fails if either drops.

## 3. Grading Engine (`backend/src/assessment/grading-engine/`): standalone, one entry point
`gradeAnswer({item, rubric?, answer, uiLanguage})` → `{total, max, criteria:[{code, points, reason_code}], error_codes[], confidence, flagged, feedback_text, grader: code|model:<id>|teacher}`

It handles **every** type, in both languages, from its first release:
- **Closed** (code, `graders/closed/*.ts`, vitest coverage ≥95% on that folder):
  - mcq (single/multi, set equality);
  - true_false;
  - fill_blank (`{{blank_n}}`, accepted lists, normalisation, Levenshtein ≤1 if `flags.lenient_spelling`);
  - matching (partial credit = correct pairs / total);
  - numeric (value, `tolerance_abs` or `tolerance_rel`, unit, expression equality via mathjs `simplify(a-b)==0`);
  - ordering (Kendall partial credit);
  - dropdown.
- **Open** (domain grader + rubric, `graders/domains/*.ts`): short_answer, essay, math_steps (final answer by code, method by rubric), sentence_correction, paraphrase, reading_comprehension (passage + mixed items).
- **Media:**
  - listening: transcript compare or rubric;
  - speaking: existing ASR → transcript → language grader + pronunciation flag.
- **Code:** a sandboxed test runner.

**Domain graders, all in the first release:** language (ar + en), math, science, humanities, code.
- They share a base: rubric handling, strict JSON (zod) with one retry, confidence, flags, and `feedback_text` in `uiLanguage`.
- The model receives **only** `{item stem/type/answer_key.solution?, rubric, answer, uiLanguage}`: never the learner's id, name, history or class, or other learners' answers.

**Domain criteria:**
- **language:** task_completion, grammar_accuracy, vocabulary_range, organisation, mechanics. CEFR descriptors when `curriculum=cefr`, generic otherwise. The `cefrRubric.ts` text moves into `rubrics/language/*.json` (one source).
- **math:** final answer by code; method_choice, execution, representation. Error codes: conceptual, procedural, arithmetic, units. Method points are given even when the final answer is wrong.
- **science:** content_points checklist (generated with the item), reasoning, terminology, units.
- **humanities:** required_points checklist, accuracy_vs_source only (never the model's memory), structure.
- **code:** tests passed, plus a rubric for readability if the item asks.

**Flags** (teacher queue; the learner sees "under review"):
- confidence < 0.7;
- total within 1 point of the pass mark;
- the two consistency runs disagree by more than 1 point on any criterion.
- A flagged answer is released only after teacher review (existing gate).

**Override:** a new total + `reason_code` {too_strict, too_lenient, wrong_criterion, rubric_unclear}, written as a ledger correction and fed to the bench.

**Error codes** go to workOn only after release (LEARNER_MEMORY_PLAN rules). `feedback_text` is the only stored model free text, and it is deleted with `studentErasure`.

Switch: `assessGrading`.

## 4. Item bank (`backend/src/assessment/schema.ts`, migrations)
**BankItem** fields:
- `id`, `version` (immutable; an edit makes a new version);
- `subject` {language, math, science, humanities, code, other}, `language`, `curriculum`, `level`, `objective_code` → LearningObjective;
- `type`, `difficulty` 1–5, `stem`, `media` {kind, url, alt_ar, alt_en}, `options`;
- `answer_key` (with `solution`, never sent to a learner), `rubric_id`;
- `skill_codes[]`, `error_codes[]`, `flags` {lenient_spelling, ta_marbuta_fold, kids, exam_style};
- `source` {generated, teacher, imported}, `review_status` {draft, judged, approved, rejected}, `judge_report`;
- `stats` {attempts, correct, p_value, discrimination, avg_time_ms, flagged};
- `created_by`, `created_at`, `school_id` (null = shared).

A bank item copied into an assessment keeps `itemId` + `itemVersion` on the question.

**Rubric:** `id`, `version`, `domain`, `type`, criteria {code, title_ar, title_en, max_points, descriptors_ar, descriptors_en}, `total_points`. It is copied into `question.rubric` in today's shape when the item enters an assessment.

**ReviewDecision:** item, version, teacher, decision, `reason_code`, at. No learner data.

**LearningObjective** extended with: curriculum key, level, subject, `title_ar`, `title_en`, `track` (for Thanaweya Amma: علمي علوم / علمي رياضة / أدبي). No second objectives table.

**Attempt answers** extended with: per-criterion {code, points, reason_code}, confidence, flagged, grader, `error_codes[]`, `feedback_text`, `teacher_override` {total, reason_code, at}.

## 5. Curriculum seeds
Versioned JSON per curriculum, grade and subject, with Arabic MSA and English titles.
- **CEFR** (existing outcome bank `data/outcomes/outcomes.json`).
- **Egyptian national, Primary G4–G6:** Arabic, Maths, Science, Social Studies.
- **Egyptian national, Thanaweya Amma (G12):** Arabic, Maths, Physics, Chemistry, Biology, History, Geography, Philosophy/Logic, Psychology/Sociology. Each objective is tagged with its track.
- **Objective codes** follow the Ministry unit/lesson structure.
- **Sources:** objectives must come from official syllabus documents, not model memory. Every seed file carries the source document's name and year. If a document is not in the repo, the file is created with status **"unverified"** and no objectives, and is listed below for Mohamed to provide.
- IGCSE later.

### Seed files waiting for official documents
All 21 Egyptian national files exist in `data/curricula/eg-national/` with status **unverified** and no objectives. They load nothing until the official document is added. For each, please provide the Ministry of Education and Technical Education's official syllabus (scope and sequence, or learning outcomes) with its year:

| Grade | Subjects (file) |
|---|---|
| Primary G4 | Arabic, Mathematics, Science, Social Studies (`g4/arabic.json`, `g4/math.json`, `g4/science.json`, `g4/social_studies.json`) |
| Primary G5 | the same four (`g5/*.json`) |
| Primary G6 | the same four (`g6/*.json`) |
| Thanaweya Amma G12 | Arabic, Mathematics, Physics, Chemistry, Biology, History, Geography, Philosophy and Logic, Psychology and Sociology (`g12/*.json`, each with its tracks) |

**Deferred (Mohamed, 22 Nov 2026): seeds come later.** To fill them I need one of these:
- **Network access:** add `edu2-egypt.com`, `moe.gov.eg` and `ellibrary.moe.gov.eg` to the environment's allowed domains. I then take units and lessons from the official textbooks, with the book, year and link recorded.
- **Or the documents:** for each grade and subject, the Ministry textbook PDF or just its contents pages, both terms, the school year printed on it, and the Arabic edition (plus the English edition for Maths and Science if the school uses it).

For G12: one book per track where they differ (Maths: pure and applied; Physics and Chemistry: science and maths tracks).

- **CEFR** is loaded from the existing outcome bank (`data/outcomes/outcomes.json`, 95 outcomes, A1–A2). That bank is itself marked DRAFT, so its objectives load as drafts.
- **CEFR Arabic titles are missing:** the bank has English statements only, so CEFR objectives have no Arabic title yet.

## 6. Generation pipeline (`backend/src/assessment/generate/`)
**Input:** subject, language, curriculum, level, `objective_codes[]`, `types[]`, count, `difficulty_range`, `source_text?` (≤6k chars, via educatorAi retrieval: only passages from the school's chosen documents), `school_id?`.

1. **`generator.ts`:**
   - one prompt per (subject, type) in `prompts/gen/<subject>/<type>.md`, with language as a parameter;
   - strict JSON (zod), retried once with the validation errors; cheaper model, batches of ≤10;
   - produces `answer_key` (+ `solution` for math) and rubric criteria in the same call;
   - humanities and Thanaweya Amma facts only from `source_text`.
2. **`checks.ts`** (code). It refuses an item when:
   - the schema is wrong;
   - there isn't exactly one correct option (unless multi);
   - options are duplicate or near-duplicate;
   - the stem is over 400 characters (200 for kids);
   - there aren't 3–5 options;
   - the objective or difficulty is missing;
   - it contains PII or anything on the minors' banned-content list;
   - the stem or options leak the answer;
   - it nearly duplicates an item the class saw in the last 90 days (guard pool);
   - `item.language` doesn't match the text's script.
3. **`judge.ts`** (Anthropic, `prompts/judge.md`):
   - criteria scored 1–5: clarity, single_correct_answer, level_fit, objective_fit, key_correctness, language_quality, safety, and exam_style when flagged;
   - pass = all ≥4 and safety = 5;
   - one regeneration with the judge's feedback, else reject; the `judge_report` is stored.
4. **Teacher review** in a "Question bank" tab inside AssessmentBuilder:
   - generate form and results;
   - approve; edit (makes a new version, re-runs checks + judge); or reject with a `reason_code` {wrong_key, too_hard, too_easy, unclear, off_curriculum, inappropriate, wrong_language, other};
   - "Add to assessment" copies the item into the draft, so the existing publish checks apply.

Switch: `assessGen`.

## 7. Benchmark (`backend/src/assessment/bench/`)
- **Datasets** per domain × language, in `bench/data/<domain>/<lang>/`:
  - `items.json`: 200 items across types and 3 difficulty bands, generated once with the strong model and frozen in the repo;
  - `answers.json`: 3 simulated learner answers per open item (weak/mid/strong, with instructed error patterns);
  - `gold.json`: the judge's grades; `gold_teacher.json` when Mohamed provides teacher-graded answers. Reports say which.
- **Metrics** → `bench/results/<date>.json` + a one-line summary: gen_schema_pass_rate, gen_judge_pass_rate, gen_teacher_accept_rate, closed_grading_accuracy, open_exact_agreement, open_within1_agreement (per criterion and total), flag_rate, override_rate, p50/p95 latency, cost per item.
- **Thresholds per language:** closed = 1.0; open within-1 ≥ 0.85; gen_judge_pass ≥ 0.80; flag_rate ≤ 0.20.
- **CI job `assessment-bench`:**
  - runs on PRs touching `backend/src/assessment/{prompts,rubrics,grading-engine,generate}/**`, and on manual dispatch;
  - fails below a threshold, or more than 0.03 below the last lms-test-live result;
  - a PR touching one domain runs that domain only;
  - small batches, resumes after usage-limit stops.
- **Cost guard:**
  - every call goes through `aiGateway` with a ceiling;
  - hard cap $20 per full run and $5 per PR run, with a hard stop at the cap;
  - CI never regenerates datasets; it only re-grades and re-judges.

## 8. UI (existing apps, ar + en, RTL, phone first)
- **Teacher:** a "Question bank" tab in AssessmentBuilder; GradingReview extended with per-criterion model scores, reasons and override.
- **Learner:** AssessmentInterface extended for all closed types first (fill_blank inline inputs, matching tap pairs, numeric + unit, ordering, dropdown, multi-answer mcq), then open and media types.
- **Admin:** an "Item bank" card (items by subject, language and status; judge pass rate; flag rate; last bench result).
- **Parents:** no change.

## 9. Integration
- Items are usable in assignments, and in tutor practice: `focus=E1..E3` picks a bank item with the same `error_code` and objective (a later switch, after P2).
- Moodle gradebook through the existing path; no new LTI work.
- Later: export of approved items as Moodle XML / QTI 2.1.

## 10. Phases → PRs
Each phase has its own switch and E2E on its PR, and the plan status is updated each time.
- **P1a:** schema, migrations, LearningObjective extension, curriculum seeds (§5), `ar.ts`, `Student.uiLanguage`, all closed graders (7 types) + unit tests ≥95%.
  - **Done:** tests pass; seeds load; unverified seed files listed in the plan.
- **P1b:** learner UI for all closed types.
  - **Done:** E2E in ar + en: a teacher creates an assignment with each closed type, a learner answers it, the grades are right, and the Moodle gradebook receives them.
- **P2:** grading engine core + language and math domain graders + flags, teacher queue, override, error codes → workOn; existing open grading migrated into the engine; bench for language and math (ar + en).
  - **Done:** open within-1 ≥ 0.85 per language; E2E flagged → override → the learner sees the final grade after release.
- **P3:** science, humanities and code graders + media types (listening, speaking) + a bench for each.
- **P4:** generation pipeline + checks + judge + teacher review + ReviewDecision; bench generation metrics (ar + en).
  - **Done:** E2E generate → review → approve → assign in both languages; gen_judge_pass ≥ 0.80 per domain and language.
- **P5:** CI regression gate, admin card, cost and latency report.

## 11. Non-goals
- No new LTI/LMS work.
- No QTI export yet.
- No manual runbooks or click tests.
- No changes to test.enara.app or its DB (frozen until Mohamed reopens it).
- No stored model free text except `feedback_text`.
- No dialect Arabic anywhere.

## 12. Decisions already taken
1. Egyptian national seeds as in §5; IGCSE later.
2. MSA everywhere.
3. Judge gold is provisional until `gold_teacher.json`.
4. mathjs in v1.
5. Switches and judge:
   - a) existing switch names;
   - b) Anthropic judge once the key is in place, provisional until then;
   - c) $20 / $5 caps.
