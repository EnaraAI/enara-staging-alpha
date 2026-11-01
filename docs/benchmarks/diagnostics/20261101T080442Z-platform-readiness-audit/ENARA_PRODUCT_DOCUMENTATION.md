# ENARA — Product Documentation (audited)

| | |
|---|---|
| Audit date | 2026-11-01 (UTC) |
| Repository | `enara-staging-alpha` (remote name `EnaraAI/enara-staging-alpha`), local branch `claude/codebase-review-kbxqan` |
| Commit audited | `f5dd116` ("Adult education schools: teach every student as an adult", 2026-11-01 06:49 UTC) |
| Working tree | clean (0 modified, 0 untracked) at audit start and end |
| Method | Read-only code inspection plus provider-free local tests run during this audit (see `EVIDENCE_INDEX.md`). No remote service was contacted. |
| Companion files | `ENARA_TECHNICAL_ARCHITECTURE.md`, `ENARA_RELEASE_READINESS_REPORT.md`, `EVIDENCE_INDEX.md`, `INCONSISTENCY_REGISTER.md` |

This document describes what the code at `f5dd116` does. It does not say what the deployed site does today. Whether the deployed staging site matches this commit is **UNKNOWN** to this audit (see `INCONSISTENCY_REGISTER.md` I-01 to I-03).

## Evidence labels

| Label | Meaning |
|---|---|
| **CODE-VERIFIED** | Present in the source at `f5dd116`, with a file and symbol cited. |
| **TEST-VERIFIED** | A named test file passed when run during this audit (2026-11-01). |
| **STAGING-VERIFIED** | Exercised on a deployed staging build, according to a dated report. The build and commit are named. This audit did not re-check the live site. |
| **LIVE-AI-VERIFIED** | Exercised with paid provider calls, according to a dated report with a cost record. |
| **MOCK-ONLY** | Tested only with a mocked or stubbed provider. |
| **DOCUMENTED-ONLY** | Described in docs; no implementation found. |
| **PARTIAL** | Only part of the stated scope is implemented or tested. |
| **BLOCKED** | Could not be done because of a named blocker. |
| **UNKNOWN** | Repository evidence is not enough. |

Two scoping notes:

- 48 of the 93 backend test files mock or fake the AI provider. Under the owner's standing rule they were **not run** in this audit. Results quoted from earlier reports for those files are labelled with the report and date. They are not current results.
- "Staging" below means synthetic data only. No real student data has been processed, according to any report found.

---

## 1. What ENARA is

ENARA is a multi-school learning platform. It has five parts:

1. **Student portal:** courses and lessons, with an AI tutor beside every lesson (typed, voice and live video avatar), assignments, results, progress and study plans.
2. **Teaching workspace:** curriculum, learning objectives, an assessment builder with optional AI drafting, class assignments, AI-assisted grading with teacher review, lesson planning, documents, Educator Chat and class insights.
3. **School oversight:** Workspace Admin and Academic Manager views of school-wide analytics, usage and credits.
4. **ENARA platform administration:** institutions, feature switches, AI budgets, integrations and partner API keys.
5. **A learning-intelligence layer:** it turns graded work into evidence, objective mastery, misconceptions, retention and a teaching plan for the tutor.

### Audiences

| Audience | Backend role | Portal |
|---|---|---|
| Student | `student` | Student portal |
| Teacher | `teacher` | Staff portal (teaching pages) |
| Academic Manager | `academic_manager` | Academic Manager portal (read-only insights) |
| Workspace Admin (school admin) | `admin` | Staff portal (all school pages) |
| ENARA Admin | `enara-admin` | ENARA admin portal (can also open the staff portal) |
| Partner / LMS system | API key (no user role) | None. Two endpoints only: course upload and ingestion status. |

Evidence: `backend/src/auth/roles.ts` `USER_ROLES`; `frontend/services/roleRouting.ts` `ALLOWED`. **CODE-VERIFIED.**

### Terminology

These terms are kept distinct. The code treats them as different entities.

| Term | Entity | Meaning |
|---|---|---|
| Institution / school | `Institution` | Tenant. Every school-owned record carries `institutionId`. |
| Batch | `Batch` | A cohort of students, for example a year group. A class can draw its roster from a batch. |
| Class (course instance) | `CourseInstance` | One taught run of a curriculum. Has `instructorIds` (teachers), `studentIds` and an optional `batchId`. A teacher's authority comes from being an instructor here. |
| Curriculum / course | `Curriculum` | Course content: chapters, modules, lessons and uploaded materials. |
| Assessment | `Assessment` plus immutable `AssessmentVersion` snapshots | A question set. Published versions cannot change. |
| Assignment | `Assignment` | One assessment version given to a class, with dates, attempts, late policy and tutor policy. |
| Attempt / submission | `AssessmentAttempt` | One student's work on an assignment. |

---

## 2. Roles, portals and permissions (current rules)

Permission source: `backend/src/auth/permissions.ts` (`ROLE_PERMISSIONS`, `GRANTABLE_PERMISSIONS`, `requirePermission`), together with legacy role guards in `backend/src/middleware/auth.middleware.ts`. **CODE-VERIFIED.**

| Role | Permissions held |
|---|---|
| student | none. `permissionsFor` returns an empty set even if grants are stored. |
| teacher | `content:author`, `content:publish`, `class:teach` |
| academic_manager | `insights:read_school` only |
| admin (Workspace Admin) | `content:author`, `content:publish`, `content:manage_school`, `class:teach`, `insights:read_school`, `workspace:users`, `workspace:billing` |
| enara-admin | all, including `cost:internal` (internal provider cost) |

A Workspace Admin may grant `content:*`, `class:teach` and `insights:read_school` to individual users. `cost:internal` is stripped from anyone who is not an ENARA Admin.

### Explicit denials and boundaries

| Rule | Evidence | Label |
|---|---|---|
| Students cannot reach staff endpoints (documents, grading, educator chat, usage, flags, students list). | `p7RoleMatrix.test.ts` student invariant. The test ran during this audit and failed on other invariants, not this one (see §16). | CODE-VERIFIED; PARTIAL test |
| Academic Manager cannot use **Educator Chat**: `educatorChat.routes.ts` requires `content:author`. | `routes/educatorChat.routes.ts` | CODE-VERIFIED |
| Academic Manager **can** use the **school analytics assistant** (`POST /api/analytics/assistant`), an AI chat over school data. | `routes/analytics.routes.ts` (gated only by `insights:read_school`); `services/dataAssistant.ts` | CODE-VERIFIED |
| Academic Manager would gain document chat if a Workspace Admin granted `content:author`. Class analytics would still refuse them, by role. | `GRANTABLE_PERMISSIONS`; `educatorAnalytics.runAnalytics` (`ANALYTICS_NOT_PERMITTED`) | CODE-VERIFIED |
| Only ENARA Admin may change feature switches, AI controls and budgets, integrations and API keys. | `learning.routes.ts` `PUT /flags` (`requireRole('enara-admin')`); `aiControls.routes.ts`; `integrations.routes.ts` | CODE-VERIFIED |
| Only ENARA Admin may create privileged accounts directly or invite a Workspace Admin. | `auth.controller.createUser`; `workspace.routes.ts` | CODE-VERIFIED |
| Teachers see only classes they instruct. Another class or school returns 404. | `services/learningAccess.ts` (`loadClassForStaff`, `resolveStudentForRead`, `teacherCurriculumIds`) | CODE-VERIFIED |

### Unresolved access decisions (owner)

- **Academic Manager chat.** Excluded from Educator Chat since the analytics-chat report (2026-10-29), recorded as "owner decision" in the P9 and P10 reports. No decision is recorded anywhere. Meanwhile the analytics assistant is open to Academic Managers and sends named student rows to the model (see §10).
- **Integrations page.** The staff portal can render it (`frontend/App.tsx`, `page==='integrations'`), but the backend allows only ENARA Admin. The UI and API disagree; the server enforces the stricter rule.

### Portals (frontend)

| Portal | Pages (from `frontend/App.tsx`, `components/Layout.tsx`) |
|---|---|
| Student | Home, My learning (courses), My progress (knowledge map), Results, Assignments, Study plan, Assessments (shown only when the school uses assessments without assignments) |
| Academic Manager | One page: School insights (`InstitutionAnalytics` + `Outcomes`), read-only (`ACADEMIC_MANAGER_PAGES`) |
| Teacher | Teaching dashboard, curriculum, learning objectives, assessment builder, class assignments, grading, class insights, lesson planner, documents, assistant. School-admin pages are hidden (`SCHOOL_ADMIN_PAGES`). |
| Workspace Admin | All teacher pages plus school overview, students, live avatars, course intelligence, school insights, AI credits, usage, savings |
| ENARA Admin | Executive overview, revenue, institutions, contracts, health, ROI, financials, audit, learning events and objectives, class and school insights, credits, credit management, integrations, live avatars, settings |

Placeholder or sample content (labelled "Sample data" in the UI, `components/SampleBadge.tsx`):

- **ENARA Admin pages:** revenue, institution CRM, contracts, platform health, ROI, financials, audit and compliance, and the executive dashboard KPIs (`pages/EnaraAdminDashboard.tsx`). Avatar control centre settings are "saved in this browser only".
- **Staff pages that are text-only placeholders:** partners, programmes, operations, governance, compliance, settings.

**These pages are not product functionality and must not be presented as such.** CODE-VERIFIED.

### Missing account pages (gap)

The backend emails invitation and password-reset links (`services/accountTokens.ts`). There is **no frontend page** that accepts an invitation or resets a password, and no workspace user-management UI. Onboarding today depends on accounts being created by an operator. CODE-VERIFIED (absence found by search).

---

## 3. Student experience

| Capability | Behaviour | Gate | Evidence label |
|---|---|---|---|
| Courses and lessons | Enrolled classes come from `studentIds` or the class `batchId` (`studentCourseService.getEnrolledInstances`). | none | CODE-VERIFIED; STAGING-VERIFIED (P16–P18 reports, deployments `dpl_8tccc…`, `dpl_4Bj8…`, 2026-10-29/30) |
| Typed AI tutor | Lesson-grounded, adapts with the teaching plan (ped-v2). Streams via SSE. Hints-only or blocked while an assignment says so (`tutorPolicy`, `TUTOR_BLOCKED`). | AI budget; `tutorPolicy` | CODE-VERIFIED; LIVE-AI-VERIFIED on staging (P16 to P21 reports) |
| Voice tutor | Speech-to-text and text-to-speech via ElevenLabs. The voice reply model is the Haiku-class voice model. | provider keys, budget | CODE-VERIFIED; LIVE-AI-VERIFIED (session record 2026-10-31, "voice check", not a repository report) |
| Live video avatar | Anam session plus ElevenLabs voice; per-day session limits (30 student, 5 staff); 20,000 spoken characters per session. | Anam configuration only; **no school feature switch** | CODE-VERIFIED; live call recorded 2026-10-31 (session record) |
| Assignments | Start, save draft, submit, conversation-style attempts; late rules; maximum attempts. | `teaching_workflow_enabled` | CODE-VERIFIED; STAGING-VERIFIED (P16) |
| Results and feedback | Shown after release. Appeals allowed after release, up to 3 open. | — | CODE-VERIFIED |
| Progress (knowledge map) | Objective mastery from evidence. | `mastery_tracking_enabled` | CODE-VERIFIED; TEST-VERIFIED (`elie.sprint2`, `elie.sprint5`) |
| Study plan | Built from assignments, teacher actions and released results (`studyPlans.ts`, plan-v1). | `study_plans_enabled` | CODE-VERIFIED |
| Product tour | Runs once for accounts created on or after 2026-10-31 23:30 UTC; can be replayed. | — | CODE-VERIFIED; TEST-VERIFIED (`productTour.test.ts`) |
| Adult schools | `learningSettings.adultLearners` treats every learner as grade 18, so grade-gated teaching methods open. | Workspace Admin setting | CODE-VERIFIED; TEST-VERIFIED (`adultLearners.test.ts`) |

Two cautions apply to this section:

- **Staging-disabled versus provider-blocked.** No code switch disables the avatar or ElevenLabs on staging. Earlier staging reports excluded them by operator decision only. Whether the staging keys are present today is **UNKNOWN**.
- **What the live tutor runs prove.** Live tutor runs on staging prove that the tutor responds. They do not prove learning outcomes.

---

## 4. Teacher experience

| Capability | Behaviour | Gate | Label |
|---|---|---|---|
| Curriculum | Courses, modules and lessons; upload materials. | `content:author` | CODE-VERIFIED |
| Learning objectives | Create, approve; AI extraction from curriculum. | learning flags | CODE-VERIFIED; TEST-VERIFIED (`elie.sprint6`) |
| Assessment builder | Hand-written questions; AI draft (never published automatically); question regeneration; publish creates an immutable version. | `ai_assessment_authoring_enabled` for AI | CODE-VERIFIED; LIVE-AI-VERIFIED in a **local harness** (P12, English benchmark, 2026-10-29) |
| Class assignments | Dates, attempts, late work, tutor policy, `releasePolicy`. | `teaching_workflow_enabled` | CODE-VERIFIED |
| Grading | AI grading with validation and teacher review queue; override with reason; correction keeps the original score; appeals. | `ai_grading_enabled` | CODE-VERIFIED; LIVE-AI-VERIFIED on staging (P16 to P20) |
| Lesson planner | AI lesson plans and section regeneration, with versions. | `ai_lesson_planning_enabled` | CODE-VERIFIED; live use not found in reports (UNKNOWN) |
| Documents | Upload with rights attestation; extraction; deferred (unscanned) policy. | `documents_workspace_enabled` | CODE-VERIFIED; MOCK-ONLY for the AI parts |
| Educator Chat | Document Q&A plus class analytics (see §10). | three chat flags | CODE-VERIFIED; harness LIVE-AI-VERIFIED (F-3b); deployed **not verified** |
| Class insights / outcomes | Mastery gaps, misconceptions, interventions; outcomes timeline. | learning flags; `connected_workflow_enabled` | CODE-VERIFIED |
| Student profile | Learning profile and the tutor's teaching approach. | `adaptive_pedagogy_enabled` | CODE-VERIFIED |

**Important behaviour: results release.** An assignment can be set to `releasePolicy: 'manual'`, but no grading code reads that setting. AI-graded results are released as soon as they pass validation (`services/autoGrading.ts` `processAttempt`; `grading.controller.finalizeSubmission`). This applies to midterms and finals too. Teachers cannot hold results today. **CODE-VERIFIED defect.**

---

## 5. Workspace Admin and Academic Manager

**Workspace Admin** has every teacher capability across the school, plus the following. CODE-VERIFIED.

- Student directory, classes and batches.
- Tutor faces (per school and per course).
- Usage, credits and savings (`workspace:billing`).
- School learning settings, including `adultLearners`.
- Inviting users (`workspace:users`). There is no frontend for this (§2).
- Cannot change feature switches or AI budgets. Those belong to ENARA Admin.

**Academic Manager** is read-only (`insights:read_school`). CODE-VERIFIED.

- Sees school insights, outcomes aggregates (no per-student lists) and teaching-effectiveness views.
- Has no writes, with one exception: it can mark its own product tour as finished. The P7 role-matrix test flags this as an academic-manager write (see §16).
- Can use the school analytics assistant, which is an AI chat (§2, §10).

---

## 6. ENARA Admin

Real functions (CODE-VERIFIED):

- Institutions, plus onboarding through integrations (`createInstitution`).
- Partner API keys: create, list, validate, revoke. Only hashes are stored.
- Feature switches per school.
- AI controls: global pause, school budgets, per-call ceilings.
- Learning settings, including shadow mode.
- Cross-school analytics (`?institutionId=`).
- Live avatar control.
- Internal provider cost (`cost:internal`).

Sample or placeholder: the executive metrics, revenue, contracts, financials, ROI, platform health and audit pages. They are labelled "Sample data". **No persisted audit log exists.** "Audit" today is structured log lines only (see the architecture document, §13).

---

## 7. Assessment lifecycle (actual behaviour)

1. **Author.** The teacher writes questions or asks for an AI draft (`assessment.controller.generateAssessmentDraftHandler`). A draft is created with `lifecycle: 'draft'` and is never published automatically.
2. **Publish.** `assessmentVersions.publishAssessment` runs `publishProblems` checks and writes an immutable `AssessmentVersion`.
3. **Assign.** `assignments.controller.createAssignment` and `publishAssignment` set the class, window, attempts, late policy and tutor policy.
4. **Attempt and submit.** `meAssignments.controller.startAssignmentAttempt`, `saveAssignmentDraft` and `submitAssignmentAttempt` handle the student side. Rule-graded questions are scored at once (`grading.gradeAnswers`). Then the attempt goes to one of three states:
   - `grading_queued`, when AI grading is on;
   - `needs_review`, when AI grading is off;
   - `grading_exception`, when there is not enough speaking evidence.
5. **AI grading.** `autoGrading.processAttempt`:
   - The attempt is claimed under a 5-minute lease.
   - Open answers are evaluated twice, with a third run on disagreement. Short answers are evaluated once.
   - `validateGrading` checks version match, point ranges, answer-key agreement, criterion sums, exact-quote evidence and the **feedback leak guard**.
   - Failures retry with back-off and become `grading_exception` after 3 runs. Integrity flags, missing rubrics and unsupported questions go straight to exception. **A score is never invented.**
6. **Release.** Release happens immediately (see §4). `releasePolicy: 'manual'` is ignored.
7. **Teacher review.**
   - `scoreAnswer`, for review and exception states. Overriding the answer key or AI proposal needs a reason.
   - `correctGrade`, the only way to change a released grade. It needs a reason, keeps `originalPoints`, invalidates the old evidence and writes teacher-graded evidence.
   - `regradeSubmission`, for failed or exception attempts.
8. **Appeal.** The student opens an appeal after release (at most 3 open). The teacher upholds or rejects it. Upholding records the decision only; the grade changes only through a correction.
9. **Evidence.** `grading.updateLearningIntelligence` → `LearningEvent`s → `LearningEvidence` (AI-graded weight 0.8) → mastery recompute. Needs `mastery_tracking_enabled`.

A legacy answer-key-only submit path also exists (`meAssessment.controller.submitAssessmentAttempt`). It charges legacy credits.

Labels:

- **CODE-VERIFIED:** the whole lifecycle.
- **TEST-VERIFIED** (this audit): `phase3.sprint1` and `phase3.sprint3` (versioning, assignments), `gradingPolicy`, `p19_1LeakGuard`, `p21ExamEvidence`.
- **MOCK-ONLY** (not run now, by rule): `phase3.autograding`.
- **LIVE-AI-VERIFIED on staging:** grading (P16–P20; P19.2 leak-guard re-test PASS on `dpl_BgztikQS…`, 2026-10-30).

---

## 8. Learning-intelligence lifecycle

This is the per-student loop, with the switch each step needs:

| Step | What happens | Switch |
|---|---|---|
| 1 | Learning event becomes evidence (`evidenceProcessor`) | `mastery_tracking_enabled` |
| 2 | Mastery estimate: `masteryModel.estimateMastery`, mastery-v1, 60-day half-life, thresholds 0.85 / 0.70 / 0.50 | — |
| 3 | Retention schedule: `retention.ts` ret-v1, reviews at 3/7/14/30/60 days | `retention_intelligence_enabled` |
| 4 | Misconception rules: misc-rules-v1 | `misconception_detection_enabled` |
| 5 | Diagnostics: diag-v1 | `diagnostics_enabled` |
| 6 | Pathways: path-v1 | — |
| 7 | Teaching plan: ped-v2, 23 methods + 5 techniques, grade minimums (adult schools as grade 18) | `adaptive_pedagogy_enabled` |
| 8 | Recorded as a `PedagogicalDecision`, then a `TeachingEpisode`, then teaching impact (impact-v1, observational labels only) and method effectiveness (effect-v1, needs ≥10 episodes and ≥5 students) | — |

What closes the loop: student work produces evidence, which updates mastery, retention and misconceptions. The next tutor turn uses a new teaching plan. New evidence then labels the teaching episode.

What is **not** connected or not proven:

- Measured method effectiveness does **not** feed back into plan choice. `pedagogyPolicy` does not read `methodEffectiveness`. CODE-VERIFIED.
- No causal comparison design exists. The labels are observational.
- The full chain has **never run end-to-end on deployed staging**: gap identified, targeted tutoring, unassisted reassessment, measured progress. P12 ran it once in a local harness with real Anthropic calls, and one stage failed or was held (`feedback_leak`). Mastery stayed "not yet verified". See the readiness report, §3.

Tests run in this audit (TEST-VERIFIED): `elie.sprint2`/`3`/`5`/`6`/`7`, `p21Orchestrator` (33), `p21Registry` (12), `p21TeachingImpact` (15), `p21Effectiveness` (16), `adultLearners` (2).

---

## 9. AI Studio tools

| Tool | Grounding | Human control | Languages | Label |
|---|---|---|---|---|
| Documents | Extraction (PDF, DOCX, text), BM25 passages, per school and curriculum | Rights attestation required; deferred policy (§11) | Arabic text normalised for search | CODE-VERIFIED |
| Assessment drafts | Selected documents; F-10 small-scope fallback (send whole small selections) | Draft only; teacher publishes | English. **Arabic declared out of scope in docs, but the UI offers it and the API accepts `language: 'ar'`.** The true/false validator bug (F-8) is still present (`services/educatorAi.ts`). | CODE-VERIFIED; PARTIAL |
| Question regeneration | Sources; **no** small-scope fallback | Teacher accepts | as drafts | CODE-VERIFIED |
| Lesson plans | Sources; no small-scope fallback | Teacher edits; versions kept | English and Arabic | CODE-VERIFIED |
| Grounded Educator Chat | Retrieved passages only; server-validated citations | Answers are advisory | English and Arabic (Arabic-Indic citation digits accepted, F-9) | CODE-VERIFIED |
| Analytics chat | Deterministic server calculations | Read-only | English and Arabic intents | CODE-VERIFIED; TEST-VERIFIED in part (`p8SmallScopeRetrieval`); `educatorAnalytics` and `p10NamedStudents` tests mock the SDK and were not run |

The Arabic exclusion covers **AI assessment generation only**. Arabic is supported in the tutor, the live avatar, lesson plans, objective extraction, chat and analytics, and in grading feedback (which follows the language of the answer). Speaking exams are English only (`speakingExam.ts`, `languageCode: 'en'`). CODE-VERIFIED.

---

## 10. Educator Chat modes

Route: `/api/educator-chat`. Requirements: `content:author` plus `educator_chat_enabled`. Rate limit: 20 requests per minute per user.

| Mode | When | Model sees | Label |
|---|---|---|---|
| A. Document Q&A | Teacher selects documents (`uploadIds`) | Retrieved passages only, marked untrusted. Student-data questions are refused before any model call. | CODE-VERIFIED; harness LIVE-AI (F-3b, 102 calls, $0.4028, 2026-10-29); passed only after an owner reclassification of 2 probes |
| B. Deterministic analytics | No documents selected; `educator_analytics_enabled` | **No model call** | CODE-VERIFIED |
| C. Model intent router (P9) | Patterns failed and no student was named; `educator_analytics_ai_router_enabled` | Only a **redacted** request: names become `[student]`/`[person]` and IDs and numbers become tags. It fails closed (`redaction_failed`). | CODE-VERIFIED; harness live benchmark 81.3% against an 85% target, so the router is to stay **off** (P10, 2026-10-29) |
| D. Named-student analytics (P10) | A student is named | Names are resolved locally and never sent to a model | CODE-VERIFIED |

Supported intents (`ANALYTICS_INTENTS`): class performance summary, assessment trend, student progress comparison, missing submissions, score distribution, learning gap summary, student ranking, student report.

- Unsupported: attendance, mastery trend, term comparison, diagrams.
- Name matching: full names win. Partial names need 3+ letters and allow Arabic prefixes. Several matches produce a choice of up to 10 candidates. Typos are offered as suggestions only and never chosen automatically.
- Limits: 20 classes, 500 students, 50 assignments, 50 rows; default window 90 days, maximum 365.
- Roles: teacher (own classes) and admin (whole school) only. ENARA Admin and Academic Manager are refused.

**Default state of the flags:** all three chat flags default **off**. Their state on the deployed staging site has never been read back in any report: **UNKNOWN**.

**Separate model path, important for privacy.** The **school analytics assistant** (`POST /api/analytics/assistant`, `services/dataAssistant.ts`) is a different feature from Educator Chat. It sends up to **300 named students** to the model, with status, average score, lesson completion, overdue count, last-active date and risk flags. There is no redaction. It is available to Academic Managers and Workspace Admins. CODE-VERIFIED.

---

## 11. Charts

| Aspect | Detail |
|---|---|
| Types and units | bar, line, stacked bar, donut. Units: percent, count, score percent, share percent (`services/chartPayload.ts`, chart-v1). |
| Validation | Exact schema; safe text only; 24 categories; 4 series; 20 KB payload. Line charts need ascending dates. Validated on the server and again in the browser (`frontend/services/chartPayload.ts`). |
| Table fallback | Every report includes a table (up to 50 rows). A rejected chart keeps the table and adds a note. |
| Provenance | Each report carries definitions (numerator and denominator), counts and caveats. |
| Arabic / RTL | Report direction rtl; chart drawn with a reversed x-axis and right-hand y-axis; cells `dir="auto"`. |
| Accessibility | `figure`/`figcaption`, `role="img"` with a label, table caption, `th scope`. **Gaps:** series are told apart by colour only; no keyboard alternative beyond the table. |
| Mobile | No measured evidence. UNKNOWN. |

Overall label: CODE-VERIFIED. No accessibility audit (axe, screen reader) was run: **UNKNOWN**.

---

## 12. Speaking exams, voice and avatar

| | Code | Switch | Live evidence |
|---|---|---|---|
| Speaking exam (voice only) | `speakingExam.ts`: examiner text-to-speech, student speech-to-text, rubric grading, follow-ups filtered for leaks | `speaking_exams_enabled` | MOCK-ONLY (`p4SpeakingExam` not run; mocks ElevenLabs) |
| Speaking exam with avatar | Refused in code (`speakingExam.ts`) even when its switch is on | `speaking_exam_avatar_enabled` | Not available |
| Voice tutor | `elevenlabsVoice.ts` | provider key | Session record (2026-10-31) |
| Live avatar | `avatar.controller.ts`, Anam session token | Anam configuration only | Session record (2026-10-31 recorded call) |

**Known defect:** speaking-exam speech-to-text is priced at $0. `priceUsage` prices ElevenLabs only by characters, and the exam passes audio seconds. Its reservation is therefore fully refunded, and the cost escapes both the school budget and the staging test-spend cap. CODE-VERIFIED.

---

## 13. Usage, credits, savings and budgets

- **Usage page** (Workspace Admin, `workspace:billing`): measured usage per tool against the plan. Provider cost is never shown to schools. `costInternal` is never selected for school users; budgets are shown only as coarse bands. CODE-VERIFIED.
- **Savings estimate** (`usageReport.savingsEstimate`): the school's own entered spend on replaced tools, minus the ENARA price. It shows "Not enough data" when inputs are missing and is labelled "not validated against actual invoices". **It is only as good as the figures the school enters**, so it must not be presented as proven savings. CODE-VERIFIED.
- **Two credit systems coexist:**
  - legacy `StudentCredit`/`UsageEvent`, with fixed feature costs (`creditsService.FEATURE_COST`);
  - P5 `CommercialPlan.creditRates`.
  - Customer-facing numbers may differ between the "AI credits" page and the "Usage" page. CODE-VERIFIED.
- **Budgets** are set by ENARA Admin only. Details are in the architecture document, §6.

---

## 14. Feature switches

All switches are off unless set on the school (`Institution.features`). Source: `services/featureFlags.ts`. Changed only by ENARA Admin (`PUT /api/learning/flags`). Cached for 30 seconds per server instance. ENARA Admin passes every switch.

| Group | Switches | Master |
|---|---|---|
| Learning | learning_intelligence, diagnostics, mastery_tracking, misconception_detection, adaptive_pedagogy, learning_pathways, teacher_learning_insights, retention_intelligence | `learning_intelligence_enabled` |
| Teaching | teaching_workflow, ai_assessment_authoring, ai_grading, ai_lesson_planning, study_plans | `teaching_workflow_enabled` |
| Documents | documents_workspace | itself |
| Educator chat | educator_chat, educator_analytics, educator_analytics_ai_router | each its own master. The chat dependency comes only from route order. |
| Connected workflow (P4) | connected_workflow, speaking_exams, speaking_exam_avatar | each its own master. The avatar exam does not require speaking exams in the switch code. |

The total is 20 switches. Switch changes are recorded only as a log line (`feature_flags_changed`); there is no stored history. CODE-VERIFIED.

---

## 15. Known limitations and out of scope

- **AI assessment generation in Arabic.** Declared out of scope, but **not enforced in code**.
- **Results release.** Manual release is not implemented (the setting is ignored).
- **Account pages.** No invitation-accept, password-reset or user-management pages.
- **Account status.** No API disables a user. A suspended school still lets its users sign in; suspension only blocks API keys.
- **Malware scanning.** No scanner exists. Uploaded documents are "deferred" and can be downloaded. Through generic link signing they can also be downloaded **without** the warning, including pending or failed files (architecture document, §8).
- **Audit and alerts.** No persisted audit log; no alert delivery (Slack, email or paging).
- **Placeholder pages.** The executive, financial, contract, ROI, health and audit pages are sample content.
- **Learning measurement.** Method effectiveness is measured but not used to choose methods. No causal measurement.
- **Untested surfaces.** Mobile layout, screen reader and keyboard audits have not been run.

---

## 16. Test result recorded during this audit that affects product claims

`backend/test/p7RoleMatrix.test.ts` **failed** at `f5dd116` (1 of 417 tests run). The role sweep reported 6 unexpected findings:

- Twice: `academic-manager-write POST /api/auth/tour/complete`. Introduced by commit `b9a49c0`, the product tour.
- Four times: `unauthenticated-access GET /api/docs.json` and `/api/docs/ui`, for anonymous and disabled-teacher identities. Introduced by commit `f40002f`, the API docs.

On the docs findings: the docs are open when `API_DOCS_PASSWORD` is unset and `NODE_ENV` is not `production`. The test environment meets both conditions. On staging the docs are reported to be behind a password, but this audit did not verify that.

Neither finding exposes student data. Both are regressions against the repository's own security invariant test, which was not run when those commits were made.
