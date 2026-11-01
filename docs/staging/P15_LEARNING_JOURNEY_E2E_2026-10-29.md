# P15: full learning journey, end-to-end audit, test and fix (2026-10-29)

| | |
|---|---|
| **Window (UTC)** | 2026-10-29, 21:15–21:46Z |
| **Repository / branch / base** | `EnaraAI/enara-staging-alpha` / `staging-alpha` / `574010aee32bd2fd0493c768ae431baed1cf78c9` (= origin) |
| **Live staging at the time** | `dpl_8tccc1rcKRNQKURe5wKYbBSX82cP` (`574010a`, **keyed**: provider calls are possible; app cap $4.50). This phase's fixes are **not deployed** |
| **Scope** | Local only: in-memory MongoDB, mocked provider, local browser harness. Read-only, non-AI staging smoke. **No real provider calls**, no remote writes, no environment change, no deploy, commit or push |

## 1. Executive summary: **PARTIAL**

**Works end to end.** The whole learning journey runs as one connected system:
- teacher content preparation, then class publishing, then student lesson delivery;
- the AI tutor (mocked), then a teacher-authored MCQ + rubric assessment, then assignment;
- student submission, then **autonomous grading and release with no teacher step**, then the student result;
- the educator roster, profile, grading queue and outcome analytics;
- usage ledger and test-spend accounting.

**How it was proven:**
- **API level** (`p15LearningJourney`, 12 tests): one in-memory database, real password logins, two schools, two classes.
- **Browser level** (`p15UiJourney`, 24 Playwright checks) on a local harness that serves the built SPA and the real backend.

**Fixed (2 UI defects found by the browser journey):**
- **D1:** a teacher who signed in landed on the school-admin dashboard, whose every data call is refused (403 "Access denied"). Nine admin-only pages were also offered in the teacher's menu.
- **D2:** the student dashboard's **"Due soon" never listed class assignments.** It read only the legacy assessment flow.

**Why PARTIAL, not PASS:**
- **Not verified live:** the AI tutor and grading with a **real provider** (not authorized here); the student and cross-tenant paths on staging (no student credentials or second tenant there).
- **Not deployed:** D1 and D2 are fixed and tested locally only.
- **Still open:** one cosmetic UI issue (U1, below).

## 2. Actual learning journey and architecture map

Derived from the routes, controllers, models and UI pages.

| Stage | UI page (frontend) | API | Service / model | Permission and scope |
|---|---|---|---|---|
| Sign-in | `pages/Login.tsx` (Student / Administrator / Enara Administrator cards) | `POST /api/auth/login`; `POST /api/auth/logout` (S-1) | `auth.controller`, `auth/jwt.ts` (HS256, 1 h, `tv`), `User` | Role and school re-read on every request (`auth.middleware`); the portal is chosen by `roleRouting.uiRoleFor` (teachers share the staff portal) |
| Content preparation | `CurriculumCenter` (staff) | `POST/PATCH /api/curriculums`, `POST /api/curriculums/:id/publish-to-class` | `curriculum.controller`, `Curriculum` (chapters → lessons) | `content:author`; edits limited to own content (`curriculumScope`); publish = link to a class the teacher **instructs** (`content:publish` + `class:teach`) |
| Delivery | Student Home, "My learning", `CoursePage` | `GET /api/me/courses`, `/courses/:courseId`, `/courses/:courseId/lessons/:lessonId` | `studentCourseService.getEnrolledInstances`, `buildCourseTree` | Student enrolled in a class (**by `studentIds` or by batch**) that is `visibility: student` and not demo |
| AI tutor | `CoursePage` tutor panel | `POST /api/me/tutor/sessions`, `/sessions/:id/messages[/stream]` | `tutor.controller`, `directTutorModel` → `aiGateway.meteredMessage/Stream` → `aiBudget` (test cap, P0d) → Anthropic | Own session only; student credits reserved; per-assignment tutor policy |
| Assessment authoring | `teaching/AssessmentBuilder` | `POST /api/assessments` (+ `/generate`, AI), `POST /:id/publish` | `assessment.controller`, `Assessment` / `AssessmentVersion` | teacher/admin; rubric criteria and levels carry ids (the builder assigns them) |
| Assignment | `teaching/ClassAssignments` | `POST /api/assignments` | `assignments.controller`, `Assignment` | The teacher's own class; due date required |
| Submission | `StudentAssignments` | `POST /api/me/assignments/:id/attempts`, `…/submit` (confirm dialog in the UI) | `meAssignments.controller`, `AssessmentAttempt` | Own attempt only; a repeat submit returns the same receipt, without changes |
| Autonomous grading | (none; background) | kicked on submit; `sweepGrading` (cron/result read) | `autoGrading` (lease, 3 runs, backoff 1 min/10 min, `grading_exception`), `gradingProposals` (rubric eval ×2, MCQ deterministic) → `askForJson` → gateway | `ai_grading`: exempt from school caps, **never** from the test cap |
| Feedback release | Student result view | `GET /api/me/assignments/:id/attempts/:attemptId/result` | release policy on the assignment; `finalizedBy: system:grader` | Only once released; answer keys per `answerReveal` |
| Educator oversight and analytics | `TeachingDashboard`, `teaching/GradingReview`, `Outcomes` | `/api/teaching/classes/:id/roster`, `/students/:id/profile`, `/api/grading/queue`, `/api/grading/attempts/:id/regrade`, `/api/learning/analytics/outcomes` | `teaching.controller`, `learningAccess`, `originScope` | Teacher: own classes (`instructorIds`); admin: school; academic manager: `insights:read_school` only; `?origin=` never widens scope |
| Cost | (admin usage pages) | `/api/usage/me/requests/:id` | `usage_ledger` (one row per provider attempt), `budget_counters` (`test_spend:<id>`) | Server-side only |

## 3. Test coverage matrix

| Stage | Test files (new in **bold**) | Result |
|---|---|---|
| A. Teacher access, sessions | **`p15LearningJourney` A**, `security`, `p14_8BlockerFixes` (S-1), **UI journey** | PASS |
| B. Content: create, validate, edit, persist, edit scope | **`p15LearningJourney` B**, `p1Access` | PASS |
| C. Class publishing and delivery, enrollment rule | **`p15LearningJourney` C, C-policy**, `p14_9TenantIsolation`, **UI journey** | PASS |
| D. Student learning and tutor (mocked) | **`p15LearningJourney` D**, `tutorFallback`, `directTutorModel`, `p0bGateway`, **UI journey** (graceful no-provider path) | PASS (mocked). **Real provider: NOT RUN** |
| E. Assessment creation, publish, assign, key hiding | **`p15LearningJourney` E**, `phase3.e2e`, `phase3.sprint1`, `security` ("hides correct answers") | PASS |
| F. Student submission, duplicates, impersonation, races | **`p15LearningJourney` F+G, J-race**, `phase3.autograding`, **UI journey** | PASS |
| G. Autonomous grading, failure, retry, regrade, idempotency | **`p15LearningJourney` F+G, G-negative**, `phase3.autograding`, `gradingPolicy`, `gradingEvalAdapter`, `phase3.e2e` | PASS (mocked) |
| H. Educator views and analytics | **`p15LearningJourney` H**, `p4Workflow`, `educatorAnalytics`, `p1ReviewFixes`, `p1FinalGaps`, **UI journey** (grading view) | PASS |
| I. Cost and usage observability | **`p15LearningJourney` I**, `p0bGateway`, `p0cMetering`, `p0dBudget`, `p14_2*`, `p14_3*`, `usageLedger` | PASS |
| J. Security and reliability (cross-tenant, roles, races, no network) | **`p15LearningJourney` J, J-race**, `p14_9TenantIsolation` (real-id sweep), `p7RoleMatrix`, `p1Access`, `security`, `p14_8` | PASS |
| UI routing (staff portal) | **`p15StaffRouting`**, `p1ReviewFixes` | PASS |

## 4. Commands and totals

| Command | Result |
|---|---|
| `cd backend && npx vitest run test/p15LearningJourney.test.ts` | **12/12** (run 3 times: stable) |
| `cd backend && npx vitest run test/p15StaffRouting.test.ts test/p1ReviewFixes.test.ts test/p1FinalGaps.test.ts` | 25/25 |
| `cd backend && npx tsx test/ui/journeyServer.ts <dist> 4173` + `node test/ui/p15UiJourney.cjs http://127.0.0.1:4173 <dir>` (fixed build) | **24/24 UI checks** |
| The same UI journey against the **pre-fix** build | **FAILS** at "Due soon lists the class assignment" (regression proof for D2). D1 was shown on the pre-fix build by the menu sweep: 3 refused calls on the teacher landing; 9 admin pages fully refused |
| `cd backend && npx tsc --noEmit -p .` | clean |
| `cd frontend && npx tsc --noEmit` (= `npm run lint`) | **0 errors** |
| `cd frontend && VITE_API_URL=/api npx vite build --outDir <scratch>` | built (`frontend/dist` untouched) |
| `cd backend && npx vitest run` (full, provider keys removed from env) | **76 files, 1029/1029** |
| Staging read-only smoke (`p146/run_p148.py`, 21:44Z, `dpl_8tccc…`) | 78 PASS; the 3 flagged lines are the known, explained cases (edge `alg=none` 403; ENARA admin needs an explicit school) |

## 5. End-to-end scenario results (`p15LearningJourney`)

| Step | Assertions (all passed) |
|---|---|
| A | Wrong password 401; no token 401; **expired token 401**; teacher refused `/workspace/users`, `/usage/report`, `/analytics/ai-usage`, `/ai-controls/budgets`, `/students` |
| B | Missing name 400. Draft created and edited; **a new login reads the saved edit**. Another teacher, the academic manager and another school cannot edit or read it; the stored record is unchanged |
| C | Lesson not visible before publishing. Publishing to another teacher's class → 404. After publishing, Amira and Bilal (same batch) read the lesson content; Carla (other class) and Dana (other school) → 404 for the course and the lesson **by id** |
| D | Tutor session on the lesson. The mocked reply is returned and **persisted**. The model request carries the question, no other student's name. Other students → 404 on the session. One ledger row per provider attempt |
| E | MCQ + rubric created and published. The student cannot publish. Assigning to another class or school → 404; no due date → 400. Visible to the class only; **`correctAnswer`, `modelAnswer` and explanations absent** from the student payload |
| F+G | Bilal cannot submit Amira's attempt (404). Submit → **released by `system:grader` with no teacher step**, score 100, feedback shown. A repeat submit → the same receipt, stored answers unchanged, 1 submission. Other students → 404 on the result |
| G-negative | Malformed model output → `grading_failed`, backoff, then after 3 runs `grading_exception`. **Never released, no score, no feedback.** The student cannot regrade (403); the teacher's regrade plus a valid output → released once (score 0). A further sweep changes nothing; a second regrade → 409 |
| H | Roster shows Amira and Bilal, not Carla or Dana. Another teacher or school → 403/404. The profile shows the assignment; an out-of-class student → 404. The grading queue holds both attempts. `outcomes.grading.released` = 2 = stored count. The academic manager reads analytics; the roster → 403. `?origin=all` does not widen |
| I | Ledger rows equal provider attempts; `ai_grading` and `tutor_chat` present. Every row has an explicit `costStatus`. `test_spend` `settledMicros` equals the sum of the ledger costs. **Exhausting the cap → the next tutor message gets 429 `AI_TEST_SPEND_CAP`, with no provider call and no ledger row** |
| J-race | 3 simultaneous attempt starts → **1** open attempt. 2 simultaneous submits with different answers → **1** submission with one answer set (not mixed), graded once |
| C-policy | Batch-based enrollment confirmed (a second class on the same batch lists the batch's students) |
| J | **0 outbound network calls** |

**UI journey (browser, 24 checks):**
- **Student:** login; dashboard; lesson; tutor without a provider shows a graceful message and keeps the question; "Due soon" shows the assignment and opens it; no answer keys on the attempt; confirm dialog; **graded 1/2 (50%) instantly** with per-question marks; no page errors; no refused calls.
- **Teacher:** lands on the Teaching dashboard with no refused calls; admin pages hidden; sees the class; the grading view shows Amira's released grade.
- **Admin:** keeps the full menu.

## 6. Defects

| # | Severity | Defect | Root cause | Fix | Regression test |
|---|---|---|---|---|---|
| **D1** | Medium (UI; usability) | A teacher signing in through the staff card landed on the school-admin dashboard: "Analytics could not be loaded: Access denied" (403 on `/analytics/overview`, `/analytics/weekly-summary`, `/students`). Nine more admin-only pages were in the teacher's menu, each fully refused | Teachers share the staff portal (`uiRoleFor`) and the default page was always `dashboard`. The menu hid only Usage and Savings; the shell loaded the school-wide student list for every staff user | `roleRouting.ts`: `SCHOOL_ADMIN_PAGES`, `staffPageAllowed`, `staffLandingPage`. `App.tsx`: teacher landing → `teaching` (login and reload); navigation guard; student list loaded only where allowed. `Layout.tsx`: menu filter. **Server authorization unchanged** | `p15StaffRouting` (3); UI journey teacher checks; menu sweep (teacher: 0 refused calls on landing; admin: 0 anywhere) |
| **D2** | Medium (UI; learning flow) | Student "Due soon" said "Nothing due right now" while a class assignment was due | `StudentDashboard` merged only legacy `Assessment` items (`dashboard.upcomingAssessments`, `/api/me/assessments`); class **assignments** (`/api/me/assignments`) were never loaded | Also load `/api/me/assignments` (a failure → empty); add assignments the student can still submit (`not_started` / `in_progress`); the button opens the student Assignments page | UI journey "Due soon lists the class assignment" + "Due soon opens the Assignments page" (fails on the pre-fix build) |

**Investigated, not defects** (behaviour confirmed by design and test):
- the rubric API requires criterion and level ids (the UI builder supplies them);
- a repeat submit returns the same receipt (idempotent);
- the test cap refused grading when the mock returned an unpriced model (correct fail-safe);
- outcomes analytics are gated by `connected_workflow_enabled`.

**Open (not fixed; documented):**
- **U1 (low, cosmetic):** on the shared Curriculum and Assessment Center pages, a teacher gets red "Admin access required" toasts for admin-only side data (batches, students, course instances), and the header reads "School admin". The pages remain usable; the server is correct.
  - **Proposed fix:** skip those loads when `staffPageAllowed(role, 'students')` is false, and label the header by role.

## 7. Build and type-check

- **Backend:** `tsc` clean.
- **Frontend:** `tsc` 0 errors (no pre-existing failures on this tree); `vite build` succeeds (bundle-size warning only).

## 8. AI provider calls and spend

- **No real provider call** was made in this phase. Every AI interaction used the deterministic SDK mock, and outbound network was blocked and counted (0) in the new tests.
- **The UI harness has no provider key.**
- **The staging smoke used no AI route.**
- **Earlier today (P14.11, separately approved):** about $0.0024 in the app plus about $0.000004 direct.

## 9. Staging: performed versus unverified

**Performed** (read-only, non-AI, `dpl_8tccc…` at 21:44Z): identity, health, safe-switch probes, staff login, roles, token tampering, CORS, tenant-parameter tampering, logout/revocation, F-1 503.

**Unverified on staging:**
- the tutor and grading with the real provider (needs explicit approval of the first AI window, per P14.10 §3: staff-only; grading excluded there);
- student login and the student journey (no student credentials);
- cross-tenant and class boundaries (single tenant);
- D1 and D2 (not deployed).

## 10. Known risks

- **Batch-based enrollment** (`getEnrolledInstances`: `studentIds` **or** `batchId`): every student of a batch is in every class on that batch, so a teacher of any such class sees all of that batch's students.
  - It is intentional in the code, and consistent across delivery, rosters and profiles.
  - It is safe only if each batch's classes share the same teaching team. Schools that put several unrelated classes on one batch would over-share between teachers.
  - **Not changed.** It needs an owner decision and documentation for schools.
- **Stop A** (key-disable rehearsal): **waived by the owner, not passed**. Rollback (Stop B) is rehearsed; the app cap is enforced.
- **The Anthropic key** was pasted in chat; rotate it after the window. Its `sk-ant-usr-` format means the ≤ $5 provider cap is operator-attested only.

## 11. Remaining blockers and next actions

1. **Review the local fixes (D1, D2) and their tests; approve a commit, push and keyless deploy.** Note the Hobby rollback ordering: a new keyless deploy becomes the rollback target, so the current keyed deployment would have to be re-made after it.
2. **Approve the first live AI window** (P14.10 §3 scope). Real-provider validation of the tutor (staff features) stays unverified until then. Live grading needs a student submission, so it needs a student fixture or credentials (P14.6 fixture plan) plus a named Atlas cleanup owner.
3. Owner decision on batch-based enrollment (keep and document, or restrict).
4. Optional: fix U1.

## 12. Changed files and actions not performed

**Modified (uncommitted):**
- `frontend/services/roleRouting.ts`: school-admin page list, staff landing, page guard (D1).
- `frontend/App.tsx`: teacher landing on login and reload; navigation guard; student-list load guard (D1).
- `frontend/components/Layout.tsx`: menu filter (D1).
- `frontend/pages/StudentDashboard.tsx`: class assignments in "Due soon" (D2).

**Added (uncommitted):**
- `backend/test/p15LearningJourney.test.ts`: 12-step journey + negatives + races.
- `backend/test/p15StaffRouting.test.ts`: D1 unit tests.
- `backend/test/ui/journeyServer.ts`: local harness: in-memory database, SPA and API, data seeded through the API.
- `backend/test/ui/p15UiJourney.cjs`: Playwright journey, 24 checks.
- this report.

**Deliberately not performed:** real provider calls; staging writes; environment or key changes; deploy, rollback, commit, push or merge; changing the enrollment model; fixing U1.
