# ENARA core: multi-class enrollment — plan

Status: **APPROVED 2026-11-16, steps 1–6 only.** Steps 7–8 need separate approval. Decisions are in §9, which overrides the recommendations in §6 wherever they differ.
Branch for the work, once approved: `claude/multi-class-enrollment`, from `claude/lms-integration`. LMS Phase 1a starts only after this task is merged.

---

## 0. First: is test.enara.app what real learners use?

| Fact | Finding |
|---|---|
| Vercel project behind test.enara.app | `enara-staging-alpha` (domains: `test.enara.app`, `enara-staging-alpha.vercel.app`) |
| Mode | **Staging mode** (`ENARA_STAGING` is set; the function entry refuses to start without it) |
| enara.app | A **separate** project (`enara-landing`), the landing page |
| Other ENARA app deployments in the team | **None.** test.enara.app is the only running ENARA app |

**Answer: yes, if anyone uses ENARA today, they use test.enara.app.** I can't see the database, so I can't tell whether real learners are in it. You would know. It already has real staff accounts (the admin account, the 4 welcome emails).

**What turning on `LMS_LTI_ENABLED=true` there would change.** Everything else stays exactly the same.

| Phase | Becomes reachable | Unchanged |
|---|---|---|
| Now (Phase 0) | `GET /lti/jwks` and `GET /.well-known/jwks.json` (public keys only). The first request creates ENARA's signing key. A rate limiter starts counting on `/lti` and `/.well-known` only. | Every other route, every header, every page, all learner data |
| After 1a | Adds `/lti/login`, `/lti/launch`, `/lti/start`, and `/api/lms/*` (admins only). The frame-ancestors header applies to those LTI routes only. | Same as above. Existing logins, classes and grading untouched. |

**Proof before any switch:** I'll run the full test suite twice, flag off and flag on, and add a test that the headers and responses of normal routes are byte-identical either way.

**Correction to the Phase 0 notes.** Staging mode **does not run migrations on start**, so the 14 LMS collections were **not** created automatically. Before any flag is turned on, someone has to run `npm run migrate` once against that database. I'll fix the notes when this task's branch starts.

**My recommendation.** If real learners use test.enara.app, test LMS on a **separate deployment**: a second Vercel project on `lms-test.enara.app` with its own empty test database. Then a mistake can never reach learners. A Vercel preview URL won't work, because previews need a Vercel login and MoodleCloud can't get past it. → **Question Q0 below.**

---

## 1. How "class" works in ENARA today (the key finding)

ENARA already has **two levels**, and the second one already allows many classes per student:

| Level | Model | Student link today | Many per student? |
|---|---|---|---|
| **Group** (cohort, e.g. "Grade 7B") | `Batch` | `Student.batchId` | **No, one** |
| **Class** (a course taught to a group) | `CourseInstance` (has `batchId`, `instructorIds`, `studentIds`) | `CourseInstance.studentIds` (explicit) **plus** every student whose `batchId` = the class's `batchId` | **Yes**, already |

The rule "students in class C = C.studentIds ∪ students of C's group" is repeated in **4 places**:
- `learningAccess.classStudentIds`
- `studentCourseService.readEnrolledInstances`
- `analyticsService` (line 165)
- `learningPedagogy.controller`

Two places break the rule today. These are **existing inconsistencies, not caused by this task**:
- **Attendance** (`teacherAttendance.controller`) uses **only** `CourseInstance.studentIds`. Students who are in a class only through their group are **missing from attendance rosters**. → Q7
- **AI credits** (`credits.controller`, `AICredits.tsx`) groups usage by `Student.batchId`. → Q9

So "multi-class" really means: **(1)** a student can belong to **several groups**, and **(2)** both kinds of membership move into **one enrollment collection** with role, status, source and dates. That replaces the `Student.batchId` field and the `CourseInstance.studentIds` array.

---

## 2. (a) Every place that reads or writes `Student.batchId` (and class membership)

R = reads, W = writes. "Class membership" means `CourseInstance.studentIds` or the group-plus-explicit rule. All paths are under `backend/src/` unless they start with `frontend/`.

### Student app
| File | What | R/W |
|---|---|---|
| `services/studentCourseService.ts` (`readEnrolledInstances`, `buildCourseTree`) | the classes a student sees; group + explicit | R |
| `controllers/me.controller.ts` | returns `tree.batchId` to the app | R |
| `controllers/meDashboard.controller.ts` | assessments for the student's group | R |
| `controllers/meAssessment.controller.ts` | assessments for the student's group | R |
| `services/studentAssessmentService.ts` | assessments for the student's group | R |
| `controllers/meAssignments.controller.ts`, `services/studyPlans.ts`, `services/tutorHandoff.ts`, `services/pathways.ts` | via `getEnrolledInstances` | R |
| `controllers/tutor.controller.ts`, `avatar.controller.ts`, `learningEvents.controller.ts`, `learningMastery.controller.ts`, `learningDiagnostics.controller.ts`, `learningInterventions.controller.ts`, `meStudyPlan.controller.ts` | via `getEnrolledInstances` / `buildCourseTree` | R |
| `services/languageTeachingContext.ts` | the student's group age band, for the tutor | R |
| `services/directTutorModel.ts`, `services/learnerSnapshot.ts` | via course tree / enrolled classes | R |

### Teacher dashboard
| File | What | R/W |
|---|---|---|
| `services/learningAccess.ts` (`resolveStudentForRead`, `classStudentIds`) | teacher may read a student if they teach any of the student's classes; class roster | R |
| `controllers/teaching.controller.ts`, `assignments.controller.ts`, `speakingExam.controller.ts`, `teachingEffectiveness.controller.ts`, `learningInsights.controller.ts`, `outcomes.controller.ts` | via `classStudentIds` | R |
| `controllers/learningPedagogy.controller.ts` | own rule: `studentIds` + `Student.find({batchId})` | R |
| `controllers/teacherAttendance.controller.ts` | roster = `CourseInstance.studentIds` only | R |
| `controllers/courseInstance.controller.ts` | add or remove a student in a class; list candidates; list roster | **W** + R |
| `services/educatorAnalytics.ts` (`withMembers`) | class members | R |
| `services/teachingNotifications.ts` | notify a class's students | R |
| `frontend/pages/CourseTeacherAnalytics.tsx`, `frontend/pages/CurriculumCenter.tsx` (roster chips, "add student") | `studentIds`, `batchId` | R/W via API |

### Admin (school)
| File | What | R/W |
|---|---|---|
| `controllers/student.controller.ts` | list by group; **create, update and delete a student set `batchId`** and keep `Batch.studentCount` in step | **W** + R |
| `controllers/batch.controller.ts` | `studentCount` can be set by hand | W (count only) |
| `controllers/curriculum.controller.ts` | assign or unassign a group to a curriculum (creates classes); counts | R |
| `controllers/learnerAgeBand.controller.ts` | each student's age band comes from their group | R |
| `services/studentDirectory.ts` | "class name" = the student's group name | R |
| `frontend/pages/StudentManagement.tsx` | which classes a student is in (`studentIds`); group shown | R/W via API |
| `frontend/types.ts`, `frontend/services/apiService.ts`, `frontend/constants.tsx` (demo data) | `batchId`, `studentIds` types | — |

### Reports and analytics
| File | What | R/W |
|---|---|---|
| `services/analyticsService.ts` | course members; assessment assigned to group; per-group stats; overview | R |
| `services/classSummaryService.ts` (**weekly class summary email**) | via `buildOverview` | R |
| `services/teachingImpact.ts` | stores the student's group on impact rows | R |
| `routes/analytics.routes.ts` | overview by group | R |
| `frontend/pages/ResearchInsights.tsx` | group comparison, by `student.batchId` | R |
| `frontend/pages/AssessmentCenter.tsx` | students of the selected group | R |

### Grading and CEFR
| File | What | R/W |
|---|---|---|
| `controllers/assessment.controller.ts` | assessment assigned to a group → `Student.find({batchId})`; teacher limits | R |
| `models/Assessment.ts` (`batchId`), `models/Assignment.ts` (`classId`, `studentIds` = a subset of the class, **not** membership) | — | — |
| Mastery, CEFR level, `LearnerLanguageProfile`, `StudentObjectiveMastery` | **per student, no class field.** Not affected. | — |

### Billing, seats and credits
| File | What | R/W |
|---|---|---|
| `controllers/credits.controller.ts` | usage per student, labelled with `batchId` | R |
| `frontend/pages/AICredits.tsx` | usage grouped by `batchId` | R |
| `routes/usage.routes.ts` | seat count = **number of students** (per person; no class involved) | — |

### Parents portal
- `backend/src/parents/*`: **no use of `batchId` or classes.** Everything is per student. Not affected (only affected by product question Q3).

### Emails
- Weekly class summary: `classSummaryService` → `analyticsService` (above).
- Reminders: `reminderService` → `learnerSnapshot` → `getEnrolledInstances`.
- Teaching notifications: `teachingNotifications` → `classStudentIds`.
- Password reset, invitations, welcome: **not affected.**

### APIs, docs, seed data and models
- `swagger/openapi.ts`: 11 mentions of `batchId`.
- Models: `Student.ts` (`batchId`), `CourseInstance.ts` (`batchId`, `studentIds`), `Batch.ts` (`studentCount`), plus class-level `batchId` on `AttendanceSession`, `TeachingEpisode`, `Assessment`. The class-level ones stay; they describe a class, not a student.
- Demo and seed **writers**: `services/demoTemplate.ts`, `scripts/seed.ts`, `scripts/seed4Level1.ts`, `scripts/p12LiveJourney.ts`, `scripts/benchmarkIntentRouter.ts`.
- **Tests:** 55 test files mention `batchId` and 52 mention `studentIds`. They are the safety net (§5).

---

## 3. (b) New data model

New collection **`class_enrollments`**: one row = one student's membership of one group or one class.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `enr_…` |
| `institutionId` | string, **required** | school; every read is school-scoped |
| `studentId` | string, required | |
| `scope` | `'group' \| 'class'` | `group` = a `Batch`, the old `Student.batchId`; `class` = a `CourseInstance`, the old `studentIds` |
| `targetId` | string, required | Batch id or CourseInstance id |
| `role` | `'learner'` (now) | enum kept open for `'observer'` later (e.g. an LMS mentor). Teachers stay on `CourseInstance.instructorIds` in this task. |
| `status` | `'active' \| 'inactive' \| 'removed'` | `inactive` = paused (e.g. dropped in the LMS, history kept); `removed` = taken out by an admin |
| `source` | `'manual' \| 'lms' \| 'google'` | as you asked |
| `migratedFrom` | `'student.batchId' \| 'courseInstance.studentIds'`, optional | marks backfilled rows, so the backfill can be undone exactly |
| `lmsContextId` | string, optional | link to `lms_contexts.id` when `source = 'lms'` |
| `startedAt`, `endedAt` | dates | when the membership began and ended |
| `createdBy`, `endedBy` | user id, optional | |
| `createdAt`, `updatedAt` | dates | |

**Indexes:**
- **unique** `(studentId, scope, targetId)`: a re-join reactivates the same row, and the history is in the dates and the audit log;
- `(institutionId, scope, targetId, status)`: rosters;
- `(studentId, status)`: a student's classes.

**One membership rule, in one place.** A new `services/enrollment.ts` becomes the **only** code that answers "which classes is this student in" and "who is in this class". The rule stays exactly today's rule:

> Student S is in class C if S has an active `class` enrollment in C **or** an active `group` enrollment in C's group.

**How LMS contexts map to it:**
- Each `lms_contexts` row → one ENARA **class** (`CourseInstance`) and its own **group** (`Batch`), created on the first launch.
- Each LMS learner → an `active` enrollment, `scope: 'class'`, `source: 'lms'`, `lmsContextId` set.
- A roster sync that drops a learner → `inactive`, never deleted.
- Google Classroom works the same way with `source: 'google'`.
- **Grade passback never uses enrollments or classes.** It is keyed by LMS resource link and line item plus the LMS user (`lms_grade_sync_jobs.lineItemRef` + `lmsUserId`), as you required.

---

## 4. (c) Migration in reversible steps

Each step is a separate commit and deploy. **Existing learners see no change at any step.** Each step has its own switch (`ENROLLMENT_*` settings) or an exact undo script.

| Step | What happens | Learner-visible? | How to undo |
|---|---|---|---|
| **1. Add** | `class_enrollments` model, indexes (migration), `services/enrollment.ts` with the rule. Nothing calls it yet. | No | `npm run enrollment:drop -- --confirm` |
| **2. Write both** | Every write path also writes an enrollment row: `student.controller` create, update and delete; `courseInstance.controller` add and remove; `demoTemplate`; seed scripts. `batchId` and `studentIds` **stay the source of truth.** | No | `ENROLLMENT_DUAL_WRITE=false` |
| **3. Backfill** | Idempotent migration: one `group` row per `Student.batchId`, one `class` row per entry in `CourseInstance.studentIds`, `migratedFrom` set. Plus `npm run enrollment:check`: compares old and new for every school and prints **counts of mismatches only** (no names). | No | Delete rows where `migratedFrom` is set |
| **4. Shadow reads** | `enrollment.ts` computes old **and** new answers on live requests, **returns the old one**, and logs any mismatch (IDs only). Runs until the check shows 0 mismatches for 7 days. | No | `ENROLLMENT_SHADOW=false` |
| **5. Switch reads, feature by feature** | `ENROLLMENT_READ_FROM` lists the features that read from enrollments, in this order: 1) student app, 2) teacher rosters (`classStudentIds`, `resolveStudentForRead`), 3) assessments, 4) analytics, reports and the weekly email, 5) age band, directory, tutor context, 6) credits page, 7) attendance (after Q7). Each feature has its own tests. | No (same answers for single-class students; proven by §5) | Remove the feature from `ENROLLMENT_READ_FROM` |
| **6. Turn on multi-class** | Admin UI: add a student to a second group or class; class switcher in the student app; the product answers (Q1–Q9) applied. **This is the first learner-visible change.** | Yes, only for students actually put in 2+ groups | `ENROLLMENT_MULTI_CLASS=false` hides the UI; existing second memberships go `inactive` |
| **7. Stop writing the old fields** | **Separate approval.** `batchId` and `studentIds` are no longer written. | No | Turn dual-write back on, and backfill the old fields from enrollments (script) |
| **8. Remove the old fields** | **Separate approval, later.** Remove `Student.batchId` and `CourseInstance.studentIds` from the models and the API; update OpenAPI and frontend types. | No | A database backup is taken before; restore the fields from enrollments (script) |

**Steps 1–6 are this task. Steps 7 and 8 wait for your separate approval.** LMS Phase 1a can start after step 6, because it only needs to write enrollments and read through `enrollment.ts`.

---

## 5. (d) Tests proving nothing changes for single-class students

1. **Same-answer tests, old vs new, for every feature in step 5.** A fixture school with single-class students (group-only, explicit-only, both, none) and two schools for isolation. For each feature I call the real endpoint with the old read and then the new read and require **identical JSON**:
   - student app course list and course tree;
   - dashboard;
   - assessments;
   - teacher roster;
   - insights;
   - analytics overview;
   - weekly summary data;
   - age bands;
   - directory;
   - credits;
   - attendance.
2. **Randomised check:** 200 generated single-class schools; `classStudentIds` and `getEnrolledInstances` give the same sets both ways.
3. **Write-both tests:** every write path in step 2 leaves old fields and enrollments in agreement, including moving a student between groups and deleting a student.
4. **Backfill:** run twice → same rows. `enrollment:check` reports 0 mismatches. The undo removes exactly the backfilled rows.
5. **Switch-back tests:** each feature, flag on then off, returns the old answer.
6. **Tenant isolation:** an enrollment can never point across schools. The existing `p14_9` and `p19` sweeps are re-run with all reads on the new path.
7. **The whole existing suite** (2,159 passing tests, 55 files that use `batchId`) run with **every** feature on the new read path. Required result: no new failures beyond the known 16.
8. **Multi-class tests (step 6):** a student in 2 groups and 3 classes, checked against the answers you choose for Q1–Q9.

---

## 6. (e) Product questions, with my recommendation

| # | Question | Recommendation | Why |
|---|---|---|---|
| **Q0** | Where to test LMS (and this migration) | **A separate deployment, `lms-test.enara.app`, with its own test database**, if real learners are on test.enara.app | A mistake can't reach learners; previews need a Vercel login |
| **Q1** | A student in two classes: one seat or two? | **One seat per student** (per person, per school) | Matches today's seat count (number of students); the LMS seat counter counts distinct students |
| **Q2** | Student opens ENARA directly: which class, and how to switch? | Open the **last class they used**; if none, the most recent enrollment. A **class switcher** at the top appears only when they have 2+ classes. Home shows "All my classes" as one tap. | Single-class students see no change; nothing to choose for them |
| **Q3** | Parents portal for a multi-class child | **One view of the whole child** (as today), with each activity **labelled by class**, plus a class filter that appears only with 2+ classes | The portal is per child today; parents care about the child, not the class structure |
| **Q4** | Teachers: only their class's data for that student, or everything? | **Class work only for their class** (assignments, grades, attendance, class tutor sessions), **plus the shared learner profile** (level, CEFR for language learners, skills, mastery). No other class's work, and no other teacher's comments. | Least access. ⚠ Today a teacher who teaches a student anywhere sees **all** of that student's work, so this is a deliberate tightening, applied in step 6 and only for multi-class students. |
| **Q5** | Progress, CEFR level and reports across classes | **Per student, shared**: level, CEFR (language courses only), mastery, skills. **Per class, separate**: grades, assignments, attendance, class reports. School totals count each student once. | Mastery and CEFR are already stored per student and per objective, so different subjects never mix. Class reports stay about the class. |
| **Q6** | An assessment set for a group: does a student in two groups get both groups' assessments? | **Yes**, both | Same rule as today, applied to each group |
| **Q7** | Attendance rosters today miss students who are in a class only through their group | **Fix it** in step 5 (feature 7) as a **visible fix**: teachers will see those students appear on attendance | It's a bug today. Kept separate so you can say no. |
| **Q8** | Age band for a student in groups with different bands | Use the **youngest (most protective)** band | Safety settings should never get looser by adding a class |
| **Q9** | AI credits page for a multi-class student | Credit each use to the **class it happened in** when known; otherwise "No class" | Matches how usage is recorded per session |

---

## 7. Size and order

- Steps 1–5: **L**. Step 6: **M** (UI: admin "add to class", student switcher, parents label).
- Each step: tests pass → commit → push → short report. Deploy to the test deployment (Q0) **only with your OK**.
- Then LMS Phase 1a, using `enrollment.ts`. Grade passback is keyed by resource link and line item.

## 8. How to approve

> **Multi-class plan approved**, Q0–Q9: … (or "recommended")

Nothing changes in the code until then.

---

## 9. Approved decisions (Mohamed, 2026-11-16)

- **Fact:** test.enara.app and its database are treated as **real production data**, whatever they contain. All testing happens elsewhere.
- **Q0, A:** a separate deployment, `lms-test.enara.app`, with its own test database, seeded with **fake data that mirrors the real shapes**: students in groups, classes, parents, assessments. **Before any migration runs on the real database:**
  1. Mohamed approves it;
  2. a full backup is taken and the restore steps are written down;
  3. the backfill runs in **dry-run mode first**, with a report of counts, records that don't fit, and conflicts.
- **Q1, A:** one seat per student.
- **Q2, A:** open the last class used, with a switcher only for students in 2+ classes.
- **Q3, A:** parents see one view of the child, with activity labelled by class.
- **Q4, A:** teachers see only their own class's work plus the shared learner profile. **School admins and ENARA admins keep full visibility.**
- **Q5, A:** level, CEFR (language courses) and skills are per student; grades and reports are per class.
- **Q6, A, plus:** if the **same** assessment is assigned to two of the student's groups, the student sees it **once**, and the one result counts for both classes. **No duplicate attempts.**
- **Q7, A:** fix attendance rosters **behind their own switch**, with a short note for teachers (`docs/multi-class/TEACHER_NOTE_ATTENDANCE.md`).
- **Q8, A as fallback only:** use the student's **own** age band first (their own band, or one worked out from their birth date when known). Use the youngest group band only when the student's age is unknown. ENARA stores `Student.birthDate` (optional) and `Student.learnerAgeBand` (optional). Deriving the band from the birth date changes the result for students who have a birth date but no band, so it gets its own switch.
- **Q9, A:** credit AI usage to the class it happened in, else "No class".
- **Rules:** report after each step. Deploy nothing, run no migration and turn on no switch without Mohamed's OK. LMS Phase 1a starts after step 6 is merged.

## 10. Deleted groups and archiving (Mohamed, 2026-11-17)

**Found by the lms-test churn burst.** Deleting a group today leaves `Student.batchId` pointing at it, and the dual-written group row stays active. Decision, built **with step 6**, behind its own switch (`ENROLLMENT_GROUP_ARCHIVE`, off by default), on **lms-test only**:

- **Block deleting a group or class that still has active students.** The admin sees a clear message: "Move or remove the students first."
- **"Archive group"** (and archive class) instead:
  - the group is closed;
  - its enrollments are ended (status `inactive`, end date set);
  - all history, grades and reports are kept;
  - archived groups are hidden from normal lists, but visible in history and reports.
- **Students who already point at a deleted group** count as **"no active group"**:
  - they appear in a new admin list, **"Students without an active group"**, so an admin can place them;
  - **nothing is deleted**.
- **Burst script and tests:**
  - deleting a group with students must be refused;
  - archiving must end the enrollments and keep the history;
  - the "without an active group" list must be right.
- **When the real site is reopened** (it is frozen until Mohamed says so), the dry-run report must count the real students who point at deleted groups. It already does, under `doesNotFit.groupMissing`, plus `alreadyMatchingDeletedGroup`.

## 11. Decisions on step 6, LMS Phase 1a and permanent delete (Mohamed, 2026-11-17)

**Step 6 core:**
- **S1:** multi-class needs dual write to be on.
- **S2:** the definition of a multi-class student is approved.
- **S3:** the consistency check counts extra memberships **separately** and still **validates** them:
  - the class exists;
  - it's in the same school;
  - it isn't archived;
  - the student is active.
- **S4:** while multi-class is on, a group counts every active member.
- **S5:** the roster chips show extra classes.
- **S6:** accepted and documented. Turning multi-class off **always** goes through the undo-script runbook.
- **S7:** **not deferred.** Each tutor session stores its class ID, and credits are given by it. Old sessions without one keep today's behaviour.

**LMS Phase 1a:**
- **L1:** an existing ENARA student who launches as Instructor is refused, with a clear message. A teacher or admin who launches as Learner (including Moodle's "Switch role to student") gets a **preview**:
  - no student record;
  - no seat;
  - no grades;
  - nothing saved.
- **L2:** seats are every live student.
- **L3:** deploy to lms-test, run the migration there, and turn `LMS_LTI_ENABLED` on, on lms-test only.

**Permanent delete (Egypt PDPL):**
- **P1:** anonymise and keep **only** scores and structured results (score, item ID, correct/incorrect, timestamps). **Delete** all of the following:
  - free text the student wrote;
  - audio;
  - transcripts;
  - tutor conversation content.

  In reports, rows of deleted students are never shown per student in classes of fewer than 5; only aggregates are shown there.
- **P2:** safety alerts are kept, admins only, with a retention period (`SAFETY_ALERT_RETENTION_DAYS`, 730 as a placeholder until legal confirms).
- **P3:** the usage ledger keeps bare IDs.
- **P4:** the audit log keeps the student ID, with no personal data.
- **P5:** backup and log retention is 30 days as a placeholder until legal confirms (`DATA_LOG_RETENTION_DAYS`).
- **All of this stays on lms-test.** test.enara.app is frozen.
