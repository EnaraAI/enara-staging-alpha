# ENARA Adaptive Teaching Intelligence: implementation report (Phases C1–C6)

| | |
|---|---|
| Date | 2026-10-31 |
| Baseline | `ENARA_ADAPTIVE_TEACHING_AUDIT_AND_PLAN_2026-10-31.md` (approved C1–C6 with conditions A–G) |
| Scope of change | Local code in `enara-staging-alpha` only. **Not deployed, not committed, not pushed.** No production data touched, no paid AI calls, no migrations run |
| Tests | 77 new tests (5 files), all passing. Full non-mocked backend suite: **373 tests in 38 files pass**. Frontend type check and build pass |

---

## 1. Implementation summary by phase

### C1: method registry v2 (`services/strategyRegistry.ts`, `reg-v2`)

**What changed:**
- **All 23 guide methods** have stable IDs, each with every required field:
  - pedagogical objective, learner conditions, subjects, required signals;
  - phases, roles (`primary | supporting | reinforcement | modifier | system`);
  - exit condition, evidence-based switch rules, conflicts;
  - assessment requirements, success indicators;
  - minimum grade, whether it withholds answers, version.
- **Prompts** are written from each method's principles (≤ 100 words, about 130 tokens), not copied from the guide. The guide's real-company and real-person examples are not used.
- **Backward compatibility:**
  - The 11 IDs from registry v1 are unchanged. Five are kept as ENARA techniques linked to a guide method: guided and independent practice, visual explanation, error analysis, prerequisite remediation.
  - The legacy tutor enum `socratic | gap_filler | error_analysis` resolves through aliases, so historical sessions and decisions still resolve.
- **Composition validator:** one primary, at most two supporting methods, one reinforcement, and modifiers.
  - It rejects unknown IDs, wrong roles and duplicates.
  - It rejects declared conflicts, e.g. discovery methods with Worked Examples or Direct Instruction.
  - It rejects an answer-withholding primary combined with a method whose core mechanism reveals solutions (plan C3).
  - "DI" ambiguity resolved: `direct_instruction` vs `differentiated_instruction`.
- **Teacher-assigned interventions** must now use a method that can lead a session (not `spaced_repetition` or `adaptive_pathways`).

### C2: Adaptive Teaching Orchestrator `ped-v2` and Tutor wiring

**Picker (`selectTeachingPlan`, `services/pedagogyPolicy.ts`):** deterministic, with **no AI call**.
- **Inputs:**
  - mastery status and estimate, evidence strength;
  - weak prerequisites, misconceptions (category and confirmed or suspected);
  - recent independent results, retention due or lapsed;
  - recall-vs-application gap (from C3);
  - previous plan and whether evidence moved since it;
  - methods already tried without improvement;
  - teacher assignment, grade level, disengagement (inactivity), available time;
  - related secure objectives.
- **Output:**
  - primary, supporting, reinforcement and modifiers;
  - target objective, gap, reason codes, evidence IDs;
  - expected outcome, switch conditions, confidence;
  - limitations and versions.
- **Switching** happens only on new learner evidence, never on a turn count:
  - no improvement after new evidence;
  - repeated errors;
  - mastery reached;
  - retention failed.
- **Safety rules:**
  - Methods that already failed are not chosen again by a switch.
  - Novices never get answer-withholding discovery methods.
  - The grade eligibility rule applies.
- `ped-v1` (`selectStrategy`) is unchanged for existing callers.

**Tutor wiring (`services/learningContext.ts`):**
- `buildTeachingContext` resolves the objective safely:
  - the session's objective;
  - else the lesson's single approved objective;
  - several objectives on the lesson: the weakest-evidence one, recorded as `lesson_multiple`;
  - none: no plan, and tutoring is unchanged.
- It records the decision (when the plan changes) with all new fields, including `channel` and `masteryAtDecision`.
- It renders the plan: the primary method's instructions, the supporting and reinforcement methods, readiness for differentiation, the feedback rule, and "the primary method wins if methods disagree".

**Paths covered:**
- **Chat and stream** (`tutor.controller.ts`): the plan goes into the model prompt. The legacy "teach Socratically" line is replaced while a plan is active. Each AI reply stores `meta.teaching` (decision ID, objective, methods, method version, reason codes, registry and decision versions).
- **Voice / avatar** (`avatar.controller.ts`): the same orchestrator, in a compact prompt. It is built inside the call's existing parallel setup step, and decisions are recorded with `channel: 'voice'`. **No architectural blocker.**
- **External orchestrator path:** a turn with a plan goes to the direct model, like handoffs already do, because the external orchestrator cannot take a plan. Without a plan, routing is unchanged.

### C3: examinations as first-class evidence

**Optional, backward-compatible fields:**
- `Assessment.assessmentKind`, with values diagnostic, formative, quiz, unit_test, midterm, final, teacher_exam, standardized, retention_check and practice.
- `Assignment.assessmentKind`, which overrides the assessment's kind for that assignment.
- `question.cognitiveLevel`, revised Bloom level 1–6.

These are validated on create and update. Absent means "unspecified"; nothing is guessed.

**Per-criterion evidence:** rubric criteria now evidence **their own objectives at their own score**. Before, every objective on the question got the whole question's score.
- Question-level objectives keep the question score.
- Answer-key-graded answers are unchanged.
- The evidence weight policy is unchanged (AI-graded 0.8).

**Exam context (`services/assessmentEvidenceContext.ts`):** for any evidence row, the assessment kind (assignment override first), the question's cognitive level and difficulty from **the version the student took**, the criterion, who graded it, and the subject. It is read at analysis time; nothing is copied onto evidence.

**Recall-vs-application signal:** comes only from questions with a cognitive level, and is "unknown" otherwise.

**Grading:** the Rubric Engine, autonomous grading, auto-release, exceptions and leak guard are **not modified**. The grading tests in the regression suite still pass.

### C4: Teaching Effectiveness Engine (`services/teachingImpact.ts`, model `TeachingEpisode`, `impact-v1`)

**Episode:** the link Student → Objective → Plan (decisions with the same composition merged) → evidence → outcome. Each episode records tenant, class (batch), origin, method composition, method, registry and decision versions, and channel.

**Measurements**, from independent assessment evidence only. Tutor chat and assisted practice never count.

| Measure | Window | Notes |
|---|---|---|
| Baseline | 90 days before the plan | Historical exams count even without any teaching attribution |
| Post | Until the next different plan, or 14 days | Retention reviews excluded |
| Retention | At least 7 days after post, up to 120 days | |
| Transfer | Post questions not seen before | |
| Exams | Post window | Overall exam score kept **separate** from the objective-level score |
| Mastery | Before and after | |
| Observed and retention change | | 0–1 scale |

**Comparability flags:**
- missing baseline, no post evidence, fewer than 2 items;
- repeated questions;
- difficulty shift above 1 level, or difficulty unknown;
- different or unspecified assessment kind;
- grading method changed;
- gap above 60 days;
- outside instruction unknown, which is always set.

**Labels:**
- `insufficient_evidence`;
- `observed_change` (comparability problems);
- `associated_with_intervention` (comparable evidence, at least 2 items on each side).

There is **no causal label**. Every episode carries the observational limitation text.

**Updating:** episodes are derived and recomputable. They are updated after evidence processing; nothing is deleted.

**Unattributed trend:** `objectiveEvidenceTrend` compares the earliest half of a student's history with the latest half, with no attribution. It is only ever `observed_change` or insufficient.

### C5: method effectiveness (`services/methodEffectiveness.ts`, `effect-v1`) and API

**Aggregation rules:**
- Only comparable episodes enter the change estimate; all episodes are counted by label.
- **Student-clustered:** each student's episodes are averaged first, so repeated observations of one student are one sample. The 90% interval is a student-level bootstrap with a fixed seed.
- **Reporting threshold:** at least 10 comparable episodes from at least 5 students. It is stated as a descriptive threshold, not significance; below it the result is `insufficient_evidence`.
- **Dimensions:** none, objective, subject, grade band, baseline band (low/mid/high) and misconception category.
- **Presentation:** rows are alphabetical with `ranked: false`, the caveats are always returned, and so is the share of each comparability flag.

**API:**

| Endpoint | Who can call it | Scope |
|---|---|---|
| `GET /api/learning/analytics/teaching-effectiveness` | Teachers | Their own classes only |
| | Admins and academic managers | Their school, read-only |
| | Enara admins | Must name a school |
| | Students | 403 |
| `GET /api/learning/students/:id/teaching-impact` | Students | Themselves |
| | Teachers | Their classes |
| | Admins | Their school |

Both endpoints:
- are gated by the flags `learning_intelligence_enabled` and `adaptive_pedagogy_enabled`;
- show live data by default, demo only on request;
- never include costs.

### C6: dashboards (existing pages extended; no new portal)

- **Student "My progress" (`KnowledgeMap`):** new *Your progress on assessed work* block.
  - It shows the trend per objective from assessed answers and what happened after the tutor changed its approach.
  - It is in plain language, with a note that class learning and practice also count.
  - The existing gaps and next-step recommendations remain.
- **Teacher Class insights (`ClassInsights`) and Outcomes:**
  - New *Teaching methods and later assessment results* panel for the selected class.
  - It shows comparable episodes, students, average change, 90% range, retention change and the most common limits.
  - It can be grouped by starting level, objective, subject, grade band or misconception.
  - It shows "Not enough evidence" below the threshold.
- **Academic manager:** the same panel in the read-only Outcomes view, school-wide, using the existing `insights:read_school` permission.
- **Demo data:** all views respect the existing Live / Demo / All selector.
- **Assessment form:** new optional *Assessment type* field, for create and edit.

---

## 2. 23-method coverage matrix

**Key:**
- **Auto**: `ped-v2` selects it from evidence.
- **Teacher**: selectable as a teacher-assigned primary.
- **Modifier**: always applied alongside the primary method.

| # | Method | Registry v2 | Role | How it reaches the tutor | Status |
|---|---|---|---|---|---|
| 1 | Direct Instruction | ✓ | primary | **Auto**: emerging (with Worked Examples); Teacher | Operational |
| 2 | Socratic Method | ✓ | primary / supporting | **Auto**: proficient in a discussion subject, grade ≥ 5 (with Elaborative); supporting in Case-Based; Teacher | Operational (follow-up 4) |
| 3 | Scaffolded Instruction | ✓ | primary / supporting | **Auto**: developing; switch target from Socratic | Operational |
| 4 | Mastery Learning | ✓ | primary / modifier | **Auto**: proficient (to criterion), plus the existing `mastery-v1` gate | Operational |
| 5 | Inquiry-Based | ✓ | primary / supporting | **Auto** supporting: recall right, application wrong (grade ≥ 4, not novices); Teacher | Operational once questions carry a thinking level (UI added); existing questions have none |
| 6 | Problem-Based | ✓ | primary | **Auto**: mastered in an applied subject, grade ≥ 7 (extension); Teacher | Operational (follow-up 4) |
| 7 | Case-Based | ✓ | primary / supporting | **Auto**: mastered in a discussion subject, grade ≥ 9 (with Socratic); Teacher; invented cases only | Operational (follow-up 4) |
| 8 | Project-Based | ✓ | primary | **Teacher**; coaching only | Partial by design (no sustained group work or public product) |
| 9 | Retrieval Practice | ✓ | primary / supporting / reinforcement | **Auto**: mastered, retention lapsed, no-evidence pre-retrieval | Operational |
| 10 | Spaced Repetition | ✓ | reinforcement / system | **Auto** reinforcement (mastered, retention), plus the existing `ReviewItem` / `ret-v1` scheduler | Operational |
| 11 | Interleaving | ✓ | reinforcement / supporting | **Auto**: proficient with related secure objectives | Operational |
| 12 | Worked Examples | ✓ | primary / supporting | **Auto**: emerging, procedural errors, switch from Direct Instruction | Operational |
| 13 | Elaborative Interrogation | ✓ | supporting | **Auto**: proficient; conceptual misconception (non-novice) | Operational |
| 14 | Analogical Reasoning | ✓ | primary / supporting | **Auto**: conceptual misconception | Operational |
| 15 | Metacognitive Strategy | ✓ | supporting / primary | **Auto**: developing (supporting); persistent misconception (primary) | Operational |
| 16 | Think-Aloud | ✓ | supporting | **Auto**: procedural errors, misinterpretation, persistent misconception | Operational |
| 17 | Concept Mapping | ✓ | supporting / reinforcement | **Auto** reinforcement: unit consolidation (≥ 3 related secure objectives when mastered; ≥ 2 in discussion/applied subjects when proficient), grade ≥ 5 | Operational (follow-up 4) |
| 18 | Differentiated Instruction | ✓ | modifier | **Modifier**: always (readiness from mastery) | Operational |
| 19 | Adaptive Learning Pathways | ✓ | system | **Modifier**: always; `ped-v2` plus prerequisite remediation implement it | Operational |
| 20 | Formative Assessment & Feedback | ✓ | primary / modifier | **Modifier**: always; primary when there is no evidence | Operational |
| 21 | Gamification | ✓ | supporting | **Auto** on disengagement (≥ 7 days inactive; grade ≤ 8; practice-type primary) | Operational; the only engagement signal is inactivity |
| 22 | Narrative / Contextual | ✓ | supporting | **Auto** on disengagement (other cases) | Operational; same signal caveat |
| 23 | Bloom's Taxonomy-Guided | ✓ | primary / modifier | **Auto**: primary on application gap; modifier once proficient | Operational once questions carry a thinking level (authoring UI added, follow-up 3); existing questions have none |

**Totals (after follow-ups 3 and 4):**
- **21 operational with automatic selection.**
- **2 conditional:** 5 and 23 depend on questions carrying a thinking level. The authoring UI now exists; existing questions have none.
- **Project-Based (8)** is coaching-only by design and teacher-assigned.

Subject type is inferred from the subject or curriculum name (English and Arabic keywords) and is stated as a limitation on each plan. An unknown subject changes nothing.

## 3. Tutor and voice integration status

| Path | Plan applied | Decision recorded | Reply metadata | Verified by |
|---|---|---|---|---|
| Chat `/messages` | ✓ | ✓ (`channel: chat`) | `meta.teaching` on AI replies | Tests: prompt contains the plan; legacy line replaced; decisions recorded |
| Stream `/messages/stream` | ✓ | ✓ (`stream`) | ✓ | Same tests, plus the earlier streaming tests |
| Voice / avatar turns | ✓ (compact) | ✓ (`voice`) | Not stored on avatar messages (decision log only) | Tests: same plan as chat, compact, recorded as voice. **Not verified with a live provider** |
| Interventions / handoffs | ✓ (session objective) | ✓ | ✓ | Existing behaviour plus tests |
| External orchestrator | Bypassed when a plan exists | — | — | By design (it cannot take a plan) |

Plan adherence by the live model has **not** been verified: that needs paid calls, which were not approved.

## 4. Examination-based effectiveness status

| Requirement | Status |
|---|---|
| Exam results as evidence | ✓ (existing pipeline, plus per-criterion objectives) |
| Overall vs objective-level performance | ✓ Separate fields per episode |
| Attribution only where the question-to-objective mapping exists | ✓ Untagged questions give no objective evidence; nothing is inferred |
| Baseline / post / comparable improvement / objective level / retention / mastery / evidence quality | ✓ |
| Transfer | ✓ (new questions only) |
| Historical baseline without attribution | ✓ (90-day window; unattributed trend endpoint) |
| No causal claims | ✓ No causal label exists; observational limitation on every episode and summary |
| Assessment kinds | Optional field and UI (assessment); assignment override via API. **Existing assessments are "unspecified"** until teachers set it |

## 5. Data-model changes (all optional and additive; no migration, no deletion)

| Collection / model | Change |
|---|---|
| `pedagogical_decisions` | + `supportingStrategyIds`, `reinforcementStrategyId`, `modifierIds`, `registryVersion`, `gap`, `expectedOutcome`, `switchWhen`, `confidence`, `limitations`, `objectiveResolution`, `channel`, `masteryAtDecision`, `masteryStatusAtDecision` |
| `tutor_messages` | + `meta.teaching` (decision ID, objective, methods, method version, reason codes, versions) |
| `assessments` | + `assessmentKind`; question + `cognitiveLevel` (also in `assessment_versions` snapshots) |
| `assignments` | + `assessmentKind` (override) |
| `learning_events` | + `refs.criterionId` |
| **new** `teaching_episodes` | Derived and recomputable (section C4) |

## 6. Test results

| Suite | Result |
|---|---|
| `p21Registry.test.ts`: 23 definitions, fields, aliases, conflicts, compositions | **12/12** |
| `p21Orchestrator.test.ts`: synthetic scenarios, switching, safety grid (640 combinations), DB wiring (objective resolution, multiple/none, tenant, recording, voice, legacy decisions), prompt | **26/26** |
| `p21ExamEvidence.test.ts`: optional fields, backward compatibility, assignment override, per-criterion evidence, exam context, recall-vs-application | **8/8** |
| `p21TeachingImpact.test.ts`: comparable improvement, missing baseline, historical baseline, misleading improvement (easier, repeated, grading change, kind change, few items), decline, retention failure, exam vs objective, tutor practice excluded, episodes, idempotence, demo origin, no causal label | **15/15** |
| `p21Effectiveness.test.ts`: threshold, clustering, labels, dimensions, no ranking; API scope by role, tenant isolation, demo separation, feature flag, no costs; student and teacher access | **16/16** |
| Full non-mocked backend regression (incl. grading, leak guard, tenant isolation, role matrix, P20 query budget) | **373 tests / 38 files pass** (`--maxWorkers=3`). Under heavier parallelism some files occasionally fail at in-memory MongoDB startup; each passes when re-run |
| Frontend | `tsc` clean; `vite build` passes. No frontend test runner exists for these pages |
| Not run | Test files that mock the AI provider (per the standing no-mock instruction) |

**All learner scenarios are synthetic** and test the decision and measurement logic only. They are not evidence of real-world effectiveness.

## 7. Cost and performance (measured locally, no paid calls)

| Item | Measure |
|---|---|
| Extra AI calls | **0**: orchestration, episodes and effectiveness are deterministic and database-only |
| Extra input tokens per chat/stream turn | ≈ 330 (character-based estimate). At the catalogue price for `claude-opus-5-5` ($4 / M input tokens), about **$0.0013 per turn** |
| Extra input tokens per voice turn | ≈ 250 (compact). On `claude-haiku-5-5` ($0.1 / M), about **$0.00003 per turn** |
| Per assessment | $0 extra (grading unchanged; per-criterion evidence is database-only) |
| Per measurable intervention (episode) | $0 extra |
| Orchestration latency | About 15–35 ms per turn locally (in-memory MongoDB); about 10–12 extra database reads per tutor turn. **Not load-tested**: P20 showed database round trips are the bottleneck under a simultaneous class start, so a rerun is advised before relying on it at that scale |

## 8. Known limitations

1. Live-model adherence to each method is unverified (no paid calls).
2. Socratic, Case-Based and Problem-Based Learning and Concept Mapping are now selected automatically. The subject type they depend on is inferred from names: a heuristic, stated on each plan.
3. Recall-vs-application and Bloom targeting need per-question thinking levels. The authoring UI was added in follow-up 3, but existing questions have none.
4. Assessment kind is "unspecified" on all existing assessments; comparisons flag this rather than guess.
5. The engagement signal is inactivity only (≥ 7 days).
6. The improvement margin (0.05 mastery estimate) and the windows (90 / 14 / 7–120 days) are fixed heuristics, versioned as `impact-v1`.
7. Small schools will mostly see "insufficient evidence". That is intended, not a fault.
8. Episodes update after evidence processing. A plan with no later evidence has no episode outcome until evidence arrives; there is no scheduled recompute job.
9. Decisions written by `ped-v1` lack the mastery-at-decision value, so their effect is "unknown".
10. Avatar replies don't carry teaching metadata themselves; voice decisions live in the decision log.
11. Per-turn tutor database work grew by about 10 reads. It is not yet measured under 100-student load.

## 9. Future causal evaluation (documented, not implemented)

Causal estimates need a comparison design. A proposal for owner, ethics and product approval:
- **Design:**
  - Within a stratum (objective × baseline band × grade band), randomise eligible students between two compositions that the orchestrator already considers equally appropriate. Never assign one known to be worse.
  - Randomise at the student level, with the assignment recorded on the decision.
- **Outcome:** pre-registered, namely the next comparable assessment on the objective (same kind, new items, same grading method) within 14 days, plus retention at 7–120 days.
- **Analysis:** a mixed-effects model with the student as a random effect and baseline as a covariate, plus intention-to-treat. Sample size is set in advance from the observed variance in `teaching_episodes`.
- **Safeguards:**
  - informed consent and school opt-in;
  - a teacher override at any time;
  - stopping rules if one arm shows harm;
  - no change to grading.

## 10. Remaining work (recommended)

1. **Load-check before wider use.** Run P20 again with adaptive pedagogy on (needs approval for paid calls) to confirm the extra tutor-turn reads at 100 simultaneous students.
2. **Live verification.** A small, budget-capped run (needs approval) to check that replies follow the selected method.
3. **Question authoring.** A per-question cognitive-level selector in the question builder, plus an assessment-kind selector on assignments.
4. **Signals for the remaining methods.** Subject or activity signals for automatic Socratic, Problem-Based and Case-Based selection, and a unit-review trigger for Concept Mapping.
5. **Scheduled recompute.** A periodic recompute of teaching episodes.
6. **Commit and deploy** after your review (separate approval).

---

## 11. Follow-up (owner: "go ahead with 1-5 except for 2")

- **(3) Authoring UI.**
  - The teacher assessment builder has *Assessment type* plus a per-question *Thinking level* (Bloom 1–6) and *Difficulty* (1–5).
  - The assignment form has *Counts as*, which overrides the assessment's type.
  - The quick-create assessment form already had *Assessment type*.
- **(4) Signals.** `ped-v2` now uses the subject type (`subjectProfile`) and unit consolidation to choose:
  - Socratic (proficient, discussion subject, grade ≥ 5);
  - Case-Based with Socratic (mastered, discussion, grade ≥ 9);
  - Problem-Based (mastered, applied, grade ≥ 7);
  - Concept Mapping (unit consolidation).

  Grade-gated methods are only chosen when the grade is known. Tests: orchestrator 33/33, including a safety grid of 5,120 combinations and the switching regression test below. Full regression: 380 tests in 38 files.
- **(5) Commit and deploy.** Three local commits on `claude/codebase-review-kbxqan` (`37e8fe8`, `15583ae`, `3bf73e2`), not pushed. Deployed to staging with the Vercel CLI, smoke-tested (`/health`, `/ready`, student dashboard and courses, strategy list `ped-v2` / `reg-v2` / Socratic v3, the app page: all 200) and promoted as `dpl_AcKtqm8NUQvRcyFPmQJqXPvMoBWN`.
- **(1) Live check of method adherence.** Real tutor (no mocks), synthetic tenant `P21C_` with 7 students in Mathematics, History and Biology at different mastery levels; 2 turns each; cap 20 calls.

  | Student | Expected main method | Chosen | Followed the method |
  |---|---|---|---|
  | Beginning, maths | Formative Feedback | Formative Feedback | 2/2 |
  | Emerging, maths | Direct Instruction | Direct Instruction | 2/2 |
  | Developing, maths | Scaffolding | Scaffolding | 2/2 |
  | Proficient, maths | Mastery Learning | Mastery Learning | 2/2 |
  | Proficient, history, grade 8 | Socratic Questioning | Socratic Questioning | 1/2 (turn 2 restated the answer) |
  | Mastered, history, grade 10 | Case-Based | Case-Based | 2/2 |
  | Mastered, biology, grade 9 | Problem-Based | Problem-Based | 2/2 |

  All 14 replies carried a decision ID with `ped-v2` / `reg-v2`. Two problems were found and fixed:
  1. **Socratic gave in when asked for the answer.** Socratic v3 now acknowledges the wish and asks a simpler question instead of restating the content.
  2. **A wrong switch between turns.** The evidence-based switching rule judged the previous plan "not improved" when no new assessment evidence had arrived since it began, so turn 2 of the re-check moved to Mastery Learning. A plan is now judged only when assessed evidence arrived after it (`3bf73e2`, with a regression test that fails on the old code).

  **Final re-check** (after both fixes, same student, new session): both turns used Socratic Questioning v3 with Elaborative Interrogation. Turn 2 ("Just tell me the answer") acknowledged the request and asked a smaller question without listing the causes.

  **Cost:** 18 tutor calls in total. The first run cost about $0.20 (12 calls logged at $0.17); the final re-check logged 2 calls at $0.017.
