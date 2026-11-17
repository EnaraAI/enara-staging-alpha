# LMS Phase 3: grades (LTI Advantage AGS) and the outbox

Status: **built and tested locally** (2026-11-17), branch `claude/lms-phase3` (from the Phase 1a tip `0a8c9f30`). **Not deployed, migration not run, every flag still off.** With `LMS_GRADE_PASSBACK_ENABLED` unset nothing is queued or sent and the new routes are the normal 404 (tested).

> **Real schools:** `LMS_GRADE_PASSBACK_ENABLED` must stay **off** on any real school's deployment until the grader meets the **ESL6 accuracy bar** (plan §6, `docs/GRADER_VALIDATION_A1A2.md`). Until then passback runs only against test LMSs: MoodleCloud `lms-test-enara`, saltire, and the mock platform, with fake data (lms-test, school `LT-SCHOOL-A`).

## What was built

| Part | Where |
|---|---|
| `toLmsScore` and the scoring policy (pure, unit-tested) | `integrations/lms/core/scoring.ts` |
| Activity binding by LTI custom parameter | `core/binding.ts`, called from the launch (`adapters/lti13/oidc.ts`) and `core/domainService.ts` |
| AGS client: service token, line item, score | `adapters/lti13/ags.ts` (registered as `lti13Provider.pushScore`) |
| Outbox: enqueue, eligibility, idempotency, supersede, claim/lease, backoff, dead, retry, re-sync, stats | `core/outbox.ts` |
| Delivery layers (`LMS_DRAIN_TRIGGERS`) | `core/drain.ts` |
| The one hook ENARA grading calls | `core/gradeEvents.ts` (`lmsResultChanged`) |
| Hooks | `controllers/meAssignments.controller.ts` (submit), `services/autoGrading.ts` (released / held / exception), `services/grading.ts` (finalize, release), `controllers/grading.controller.ts` (correction); regrade goes through `processAttempt` |
| Admin endpoints | `integrations/lms/admin/routes.ts` |
| Cron | `routes/cron.routes.ts` (`lmsGrades` in `/api/cron/daily`, new `/api/cron/lms-drain`) |
| Piggyback middleware | `app.ts` (`app.use('/api', piggybackDrain)`) |
| Targeted flush | teacher class view `GET /api/assignments?classId=` (`assignments.controller.ts`); learner / teacher LTI launch |
| Frontend | `LmsLaunch.tsx` + `App.tsx` (open the bound activity), `StudentAssignments.tsx`, `teaching/ClassAssignments.tsx`, `LmsConnections.tsx` (grade sync panel) |
| Model fields (no migration needed for fields) | `lms_resource_links`: `enaraSourceType`, `enaraSourceId`, `boundAt`; `lms_contexts.agsScopes`; `lms_grade_sync_jobs`: `resourceLinkId`, `reason`, `lastErrorAt`, `scoreGiven` now optional; `lms_launch_tokens.targetAssignmentId` |
| Migration `2026-11-18-lms-phase3-indexes` (additive, **not run**) | `migrations/index.ts`: outbox slot index (`resourceLinkId, lmsUserId, scoreTimestamp`), `platformId, status`, and `lms_resource_links (institutionId, enaraActivityId)` |

## Which ENARA work a Moodle activity opens (until Phase 2)

Phase 2's Activity Picker (deep linking) is not built yet, so an activity names its ENARA work with **one LTI custom parameter**, set on the activity in Moodle:

```
enara_assessment=<ASSESSMENT_ID>
```

or, for an existing ENARA assignment:

```
enara_assignment=<ASSIGNMENT_ID>
```

- The id is checked against the **launch's school**: another school's id, an unknown id, an assessment that is not **published** (`lifecycle: published` and `publishedVersion ≥ 1`), a draft or archived assignment, both parameters at once, or a malformed value (for example an unreplaced `$ResourceLink.id`) refuse the launch with Reference **`invalid_activity_binding`** (audit `refIds.reason`: `not_found`, `not_published`, `not_available`, `ambiguous`, `malformed`). Nothing is bound or created then.
- The LMS course's students are only in the course's **own ENARA class** (Phase 1a), so the work is **given to that class as an assignment** on the first (non-preview) launch of the activity, teacher or student:
  - `enara_assessment`: a new assignment of the published version, opens now, due in 365 days, `maxAttempts` = the assessment's, results released automatically, answers revealed as the assessment says.
  - `enara_assignment` already in the course class: used as it is.
  - `enara_assignment` of another class (same school): copied into the course class with its settings (dates if still ahead, attempts, release policy, time limit, format, speaking settings without accommodations).
  - Created by `system:lms`, audit `activity.bound` (`source`, `sourceId`, `assignmentId`, `created`). Race-safe (two first launches keep one).
  - **One assignment per LMS activity**: two Moodle activities pointing at the same assessment are two separate pieces of work (own attempts, own gradebook column).
- The resource link stores the binding (`enaraActivityId` = the assignment, `activityKind` = `practice` when the assessment/assignment kind is `practice`, else `assessment`). Changing the parameter to another id re-binds the link; removing it keeps the last binding.
- The launch's one-time token carries the assignment: the **student** lands on it (Assignments, opened); the **teacher** lands on Class assignments with the course's class and that assignment open. "Open in new tab" keeps it.
- A **student preview** (Phase 1a L1) shows the bound assignment read-only and never binds or creates anything.

## Grades

### What is sent (`toLmsScore`, plan §6)

| ENARA result | LMS score |
|---|---|
| Assignment attempt **released** (`gradingStatus: released`, set with `releasedAt` by the automatic grader or the teacher's release) | `FullyGraded`, `activityProgress: Completed`, `scoreGiven` = points, `scoreMaximum` = maximum points (percentage out of 100 when points are unusable), comment |
| Waiting for a person: `needs_review`, `graded_draft`, `grading_exception`, `grading_pending`, or **finalized but not released** (manual release) | `PendingManual`, `activityProgress: Submitted`, **no `scoreGiven`** (nothing unreleased reaches the LMS) |
| Automatic grading still running (`grading_queued`, `grading_in_progress`, `grading_failed`) | nothing yet |
| Open, abandoned, anonymised, demo data, or no valid number at all | nothing |

- The gradebook value is always numeric; scores are clamped to `0..scoreMaximum`, rounded to 2 decimals; NaN, negative or zero maximum fall back to the percentage, and if that is unusable too nothing is sent.
- **Comment** (≤ 1000 characters, no names, no answers): `Score: 7/10 (70%).` then
  - **language course only** (a curriculum lesson has `languageSpec`, or the curriculum type says language, or a speaking exam): `Level: A2.` (the activity's CEFR level: the speaking exam's `cefrLevel`, else the curriculum level when it is a CEFR level) and `Skills: Grammar 3/4, Vocabulary 2/2.` (from each question's topic: reading, writing, listening, speaking, grammar, vocabulary, pronunciation, spelling; a speaking exam is all Speaking);
  - **any other subject**: never CEFR, even with a CEFR-looking level; `Criteria: Reasoning 5/8, Use of evidence 1/2.` from rubric criteria (open answers), or nothing;
  - then `Details in ENARA.`
  The job also stores `levelScheme: cefr` / `levelLabel` only for a language course with a level.
- **Scoring policy** per resource link: `best` for practice, `latest` for assessments (default from `activityKind`), `lms_resource_links.scoringPolicy` overrides it (data only; no UI yet).
  - `latest`: the most recent submitted attempt. While its automatic grading runs nothing new is sent; if it waits for a teacher it is sent as `PendingManual` (Moodle then shows no grade for it until it is released: the latest attempt really has none yet).
  - `best`: the highest released result (ratio; ties: most recent). A newer pending attempt never hides a released best; `PendingManual` only when nothing is released yet.

### Who gets a job (owner decisions)

Keyed by **LMS resource link + line item + LMS user**, never by ENARA class. A job is created only when **all** hold, at enqueue **and again right before sending** (else the job is `dead` with `not_eligible` and nothing is posted):

- the attempt is `submitted`, of the school, not anonymised, not demo data;
- its assignment is the resource link's bound assignment (same school);
- the ENARA account with the attempt's `studentId` is an active **student** account of the same school, linked in `lms_users` to an LMS user of the link's platform, who is an **active learner** (`lms_enrollments`, role student) of the link's course;
- the platform is active, the course has AGS (a line item URL or the line items URL), and the course's granted scopes (when known) include `score`.

A **student preview** has no student record and every write is refused (Phase 1a), so it can never submit; the student-account check above would refuse it anyway. Plain ENARA students (no LMS link) and attempts of another school get nothing (tested).

### AGS client (`adapters/lti13/ags.ts`)

- **Token**: `POST <Access token URL>` with `grant_type=client_credentials`, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `client_assertion` = RS256 JWT signed with ENARA's active tool key (its `kid` is in `/.well-known/jwks.json`), `iss` = `sub` = client ID, `aud` = the platform's token URL (or `tokenAudience` if set), 5-minute life, random `jti`; `scope` = `lineitem result.readonly score`, narrowed to what the launch's AGS claim granted. Cached in `lms_access_tokens` **encrypted with LMS_KEK** (record-bound) until 60 s before expiry; a 401 from an AGS call refreshes it once.
- **Line item**: the launch's `endpoint.lineitem` (Moodle sends it for an activity that accepts grades); else `GET endpoint.lineitems?resource_link_id=<link>` and use the matching one; else **create** it (`POST`, label = assignment title, `resourceLinkId`, `resourceId` = assignment, `tag: enara`, `scoreMaximum`) only when the course granted the `lineitem` scope (capability `lineItemCreate`), otherwise the job is dead with `line_item_create_not_allowed`. A found or created line item is remembered (`lms_resource_links.lineItemUrl`, `lms_line_items`); if the LMS later answers 404 for it, it is forgotten and found/created again on the next try.
- **Score**: `POST {lineitem}/scores` (the line item's query string, e.g. Moodle's `?type_id=`, is kept), `Content-Type: application/vnd.ims.lis.v1.score+json`, body `userId` (LMS `sub`), `scoreGiven`/`scoreMaximum` (omitted for PendingManual), `comment`, `activityProgress`, `gradingProgress`, `timestamp` (strictly increasing per resource link + LMS user).
- Every LMS call has an **8 s timeout**; only `https` URLs are called (plain `http` only to localhost outside production, for tests). Errors are kept as short codes only (`score_http_503`, `token_http_401`, `lineitems_http_403`, `timeout`, `network`, `not_eligible`, ...), never response bodies.

### The outbox (`lms_grade_sync_jobs`, plan §5)

- **Idempotency key**: SHA-256 of (resource link — which stands for its line item, LMS user, attempt, grading progress, score, maximum, comment). The same result queued twice is one job.
- **Supersede**: a newer result for the same slot (resource link + LMS user) deletes older jobs of that slot that are still `pending`; an older job is never sent after a newer one (it is dropped at claim time: `grade.superseded`), and its AGS timestamp is older anyway.
- **Claim**: atomic `pending → processing` with a **2-minute lease** (`findOneAndUpdate`); expired leases go back to `pending` at the start of every drain; two drains never send the same job (tested with three in parallel).
- **Retries**: the long schedule **1 m, 5 m, 30 m, 2 h, 12 h**, ±10 % jitter (a `Retry-After` can only lengthen it). The **5th** failed try, or a refusal a retry cannot fix (400, 403, 404 on the launch's line item, 409, 422, `not_eligible`, `line_item_create_not_allowed`), makes the job **`dead`**: visible to admins, who can retry it.
- **Bounded**: a drain takes at most 20 jobs and 25 s (daily: 200 jobs, 40 s; per-minute route: 50, 25 s); the inline push at most 5 jobs.

### Delivery layers (`LMS_DRAIN_TRIGGERS`, default `inline,piggyback,targeted,daily`)

| Trigger | What |
|---|---|
| `inline` | When a result changes the job is queued in the request and pushed **after the response** (`waitUntil`): first try at once, quick retries after 2 s, 5 s and 15 s while the whole push stays under 40 s |
| `piggyback` | Any `/api` request may start a background drain (20 jobs), at most once a minute per instance and **once a minute across all instances** (`lms_locks` `lms-grade-drain`) |
| `targeted` | A teacher opening a class (`GET /api/assignments?classId=`) flushes that class's jobs; a learner's LTI launch flushes theirs; a teacher's launch flushes the course's |
| `daily` | `GET /api/cron/daily` (CRON_SECRET) runs `lmsGrades` (200 jobs). Note: staging has no Vercel cron by design (p6VercelStaging); the daily handler runs when the operator's scheduler calls it |
| `cron` | `GET /api/cron/lms-drain` with `Authorization: Bearer <CRON_SECRET>` (constant-time check): a drain for a future per-minute scheduler. The normal 404 unless `cron` is in the list |

"Re-sync grades" and "Retry failed" also push in the background when `inline` is on.

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `GET /api/lms/grades` | school admin (own school), ENARA admin (all, or `?institutionId=`) | Per platform: `pending`, `processing`, `sent`, `dead`, `lastErrorCode`, `lastErrorAt`, `lastSentAt`, last 10 dead jobs (IDs and codes only) |
| `POST /api/lms/platforms/:id/grades/resync` `{ resourceLinkId? }` | school admin (own), ENARA admin | Re-queue the current result (by policy) of every active learner of every bound activity of the platform (or one), even if already sent; bounded to 100 activities and 1000 learners per call |
| `POST /api/lms/platforms/:id/grades/retry-dead` | school admin (own), ENARA admin | `dead → pending`, tries reset |
| `GET /api/cron/lms-drain` | scheduler with CRON_SECRET | See `cron` above |
| `POST /api/lms/launch/exchange` (changed) | public | `launch.target = { kind: 'assignment', assignmentId }` or `null` |
| `POST /api/lms/launch/handoff` (changed) | LMS accounts | also takes `assignmentId` (kept only when it is an assignment of the account's school) |

All grade routes are the app's normal **404** unless `LMS_LTI_ENABLED` **and** `LMS_GRADE_PASSBACK_ENABLED` are on with a valid LMS config. Another school's platform: 404. Teachers, academic managers, students: 403; anonymous: 401.

## Audit (`lms_audit_log`, IDs and codes only)

`activity.bound`, `grade.queued` (`reason`: submitted, released, finalized, grading_exception, corrected, resync...; `superseded` count), `grade.requeued`, `grade.sent`, `grade.failed` (`code`, HTTP `status`, `dead`), `grade.superseded`, `grade.retry_dead`, `grade.resync`. The launch failure `invalid_activity_binding` has `refIds.reason`. Tests check that no name or email lands in jobs or audit rows; the score comment has no names.

## Flags and settings

| Name | Default | Notes |
|---|---|---|
| `LMS_GRADE_PASSBACK_ENABLED` | **off** | Needs `LMS_LTI_ENABLED` on. **Real schools: off until the ESL6 accuracy bar is met.** On lms-test (fake data) it can be on |
| `LMS_DRAIN_TRIGGERS` | `inline,piggyback,targeted,daily` | Add `cron` only with a per-minute scheduler |
| `CRON_SECRET` | already set | Protects `/api/cron/daily` and `/api/cron/lms-drain` |

The platform's **Access token URL** must be filled in on LMS connections (it is optional for launches; Phase 3 needs it).

## Decisions and deviations

1. **Binding materializes an assignment** in the LMS course's class (not a direct grant on the assessment): the course's students can only reach work through their class, and assignments already have attempts, automatic grading, release, corrections and the teacher's views. One assignment per LMS activity.
2. **The idempotency key uses the resource link instead of the line item URL**: when the line item is found or created only at send time its URL is not known at enqueue, and a link has exactly one line item.
3. **Quick retries**: first try at once, then 2 s, 5 s, 15 s, stopping when the push would pass 40 s (each call can wait 8 s, and a token fetch can add a call), so the background task stays under the 60 s function limit.
4. **Automatic grading in progress is not sent** (`Pending` is not used): the released result follows within seconds; a result waiting for a person is `PendingManual`.
5. `result.readonly` is requested (as specified) but not used yet.
6. Admin-only visibility (school admin, ENARA admin). Teachers see their students' ENARA results as before; a teacher grade-sync view was not added.

## Tests

- New `backend/test/lms/scoring.test.ts` (**30 tests**, pure): result state (only released is final), numbers (points, partial credit, zero, NaN/negative/zero-maximum guards, caps), pending manual and unreleased (finalized, held) never carry a score, comments for language (CEFR + skills, no level, non-CEFR level, speaking) and non-language (criteria, never CEFR even with an A2-looking level, just the score), bad numbers in breakdowns, title cleaning, the 1000-character limit, scoring policy (defaults, override, latest, best with ratios and ties, pending vs released).
- New `backend/test/lms/phase3.test.ts` (**29 tests**) with the extended mock platform (`test/lms/mockPlatform.ts`: token endpoint, line items GET/POST, scores, recorded requests, injected statuses and delays; all on 127.0.0.1):
  - binding: assessment → one assignment, teacher and student land on it, idempotent; refused: other school's assessment, unpublished, unknown, draft assignment, malformed, both parameters; school B cannot use school A's; assignment of another class copied; assignment in the course class used as is;
  - a released result sent at once: client assertion verified against ENARA's JWKS (`iss`, `sub`, `aud` = token URL, `kid`, `jti`, ≤ 5 min), scopes, `{lineitem}/scores` with the query kept, media type, bearer, payload, CEFR comment, no PII;
  - token cached encrypted, reused, 401 → one refresh, new token near expiry;
  - non-language comment; line item created through `lineitems` and remembered; found by resource link; no `lineitem` scope → dead `line_item_create_not_allowed`; best for practice, switchable to latest;
  - manual release: `PendingManual` without a score, the teacher's release sends the score, a correction sends the corrected one;
  - only real linked students: preview gets the target but cannot submit (no job), a preview never binds, a plain ENARA student and another school's attempt get no job, unlinked before sending → dead `not_eligible`, nothing posted;
  - idempotency and supersede; three drains in parallel send each job once; expired lease reclaimed, live lease left alone; an older job dropped after a newer one;
  - backoff 1 m (±10 %) then 5 m ... 2 h, dead after 5, visible on `GET /api/lms/grades`, Retry sends it; 400 dead at once; inline quick retry recovers a 503;
  - flags off: nothing queued or sent, grade routes and `/api/cron/lms-drain` 404;
  - targeted (teacher class view, learner launch), piggyback (lock: once a minute across instances), daily drain, `/api/cron/lms-drain` (401 without/with wrong secret, 200, 404 when `cron` is not listed), Re-sync (requeued, newer timestamp, whole platform);
  - admin roles and tenant isolation; the migration twice; no PII in jobs and audit.
- Results (2026-11-17): `npx tsc --noEmit -p .` clean (backend and frontend). `test/lms` + `test/multiClass`: 30 files, 313 tests, all pass (phase3 29, scoring 30, phase1a 45, phase0 28, vercelRuntime 2). Full backend suite: 2,441 passed, 17 failed (13 files): the 16 known pre-existing failures (elie e2e/sprint4, p14_2 x2, p14_8, p19 C1b, p20 tutor message, p2Documents x2, p3EducatorChat, phase0 upload links x2, phase3 autograding x3, phase3 e2e; the 4 phase3 ones were rerun on the base source `0a8c9f30` and fail the same way), plus `educatorAnalytics` chart rendering and `security.test.ts` (in-memory Mongo port clash), which both pass when rerun alone.

## MoodleCloud runbook (for the owner)

Site **https://lms-test-enara.moodlecloud.com**, course **"ENARA Test Course"** (`ENARATEST`), users **teacher.test** and **student.test**. ENARA test site **https://lms-test.enara.app**, school **LT-SCHOOL-A** (fake data). The tool **"ENARA (test)"** is registered (Client ID `8yxn89ieexJUTws`, deployment `1`) with IMS LTI Assignment and Grade Services **"Use this service for grade sync and column management"** and Privacy › Accept grades **"Always"**.

### 0. Before the test (ENARA side; needs the owner's OK)

1. Deploy this branch to the lms-test project.
2. Env vars on lms-test: `LMS_GRADE_PASSBACK_ENABLED=true` (lms-test only, fake data), keep `LMS_LTI_ENABLED=true`, `LMS_TOOL_BASE_URL=https://lms-test.enara.app`, leave `LMS_DRAIN_TRIGGERS` unset.
3. Run `npm run migrate` against the lms-test database (adds `2026-11-18-lms-phase3-indexes`).
4. ENARA admin › LMS connections: the Moodle connection must have the **Access token URL** `https://lms-test-enara.moodlecloud.com/mod/lti/token.php` (add it if it was left empty). A **"Grades to the LMS"** line now shows under the connection.
5. The fake assessment you are given as `<ASSESSMENT_ID>` is in school `LT-SCHOOL-A`, **published**, with **only multiple-choice / true-false questions** (AI is off on lms-test: a wrong short answer would wait for a teacher), and **Max attempts ≥ 2** so re-submitting can be tried. Optional: a second published assessment of kind **practice** as `<PRACTICE_ASSESSMENT_ID>` to see "best".

### 1. Point a Moodle activity at the ENARA assessment

As **teacher.test** (or the site admin), in **ENARA Test Course**:

1. **Turn editing on › Add an activity or resource › ENARA (test)**.
2. Activity name: `ENARA graded quiz`.
3. In **General**, click **Show more...** and find **Custom parameters**. Enter exactly (one line, no spaces around `=`):
   ```
   enara_assessment=<ASSESSMENT_ID>
   ```
4. **Grade** section: Grade type **Point**, Maximum grade **100** (the default). Privacy: "Accept grades from the tool" is on (the tool says Always).
5. **Save and display**. ENARA opens for teacher.test on **Class assignments**, course class selected, with the assignment `<assessment title>` open (0 submitted).

If you see "We couldn't open ENARA" with Reference **`invalid_activity_binding`**, the id is wrong, not published, or not in LT-SCHOOL-A.

### 2. Student completes it

| # | Do | Expected | Screenshot |
|---|---|---|---|
| 1 | As **student.test** (other browser / private window), open ENARA Test Course › **ENARA graded quiz** | ENARA opens on **Assignments** with the quiz open | the Moodle page with ENARA inside |
| 2 | Start, answer (e.g. all but one right), Submit | ENARA shows the result (released at once) | the ENARA result |
| 3 | Within a few seconds, as teacher.test: **ENARA Test Course › Grades** (Grader report) | The **ENARA graded quiz** column shows student.test's score scaled to 100 (e.g. 2 of 3 right → **66.67**) | the grader report |
| 4 | Click the cell's feedback (or **User report** for student.test) | Feedback: `Score: 2/3 (67%). … Details in ENARA.` For a language course also `Level: A1.` (if the course has a CEFR level) and `Skills: …` when question topics name skills; for Maths/Science no level, criteria only if the quiz has rubric questions. **No student name in it** | the feedback |
| 5 | ENARA admin (or LT-SCHOOL-A admin) › **LMS connections** | "Grades to the LMS: 0 waiting · 1 sent · 0 failed", last sent just now | the connection card |

### 3. Re-submit: latest vs best

| # | Do | Expected | Screenshot |
|---|---|---|---|
| 6 | As student.test, open the activity again, start a **second attempt**, get a **lower** score, submit | The assessment is not practice, so **latest** applies: Moodle's cell drops to the new (lower) score within seconds; the feedback is the new attempt's | grader report |
| 7 | Optional: a second activity with `enara_assessment=<PRACTICE_ASSESSMENT_ID>`; do a high attempt then a lower one | **best** applies to practice: the cell keeps the higher score | grader report |

### 4. Teacher view

| # | Do | Expected | Screenshot |
|---|---|---|---|
| 8 | As teacher.test open **ENARA graded quiz** | ENARA › Class assignments: the assignment with student.test's status (released) and score; Review shows the attempt | the ENARA assignment |
| 9 | Optional: in ENARA as teacher.test, **Review › correct** one answer (with a reason) | Moodle's cell changes to the corrected score within seconds | grader report |

### 5. Re-sync and failures

| # | Do | Expected | Screenshot |
|---|---|---|---|
| 10 | LMS connections › **Re-sync grades** | Message "Grades queued again…"; "sent" goes up by the number of learners with a result; Moodle unchanged (same scores, sent again) | the connection card |
| 11 | Optional (failure path): in **Manage tools**, temporarily switch AGS to "Do not use this service", submit another attempt as student.test | The connection shows "1 waiting" or "failed" with a last error code (e.g. `score_http_403` / `token_http_400`); after switching AGS back, **Retry failed** (or wait for the next drain) sends it | the card with the code |
| 12 | Student preview: as teacher.test use **Switch role to › Student**, open the activity | ENARA opens the quiz read-only with the yellow "Preview as student — nothing is saved" banner; starting it is refused; **no** grade appears for teacher.test in Moodle | the banner |

Notes:
- Moodle shows a grade only for a **released** result. If the assignment holds results for manual release, the cell stays empty (ENARA sends "pending") until the teacher releases them in ENARA.
- If a Moodle teacher **overrides** a grade in the gradebook, Moodle ignores later tool scores for that cell (Moodle's rule).

### What I (ENARA side) will check after the run

On the lms-test database (IDs only):
- `lms_resource_links` for the activity: `enaraSourceType: assessment`, `enaraSourceId: <ASSESSMENT_ID>`, `enaraActivityId: asg-lms-…`, `lineItemUrl` = Moodle's `…/mod/lti/services.php/<course>/lineitems/<n>/lineitem?type_id=<n>`.
- `assignments` `asg-lms-…`: `classId` = the course's class, `createdBy: system:lms`, `assessmentVersion` = the published version.
- `lms_grade_sync_jobs` for the student's `lmsUserId`: one `sent` job per result, `gradingProgress: FullyGraded`, `scoreGiven`/`scoreMaximum` = ENARA points, increasing `scoreTimestamp`, no `dead`; after step 6 the latest one has the lower score.
- `lms_access_tokens`: one row for the platform, `tokenEnc` starting `lk1.`.
- `lms_audit_log`: `activity.bound`, `grade.queued`, `grade.sent` (and for step 11 `grade.failed` with its code), no names or emails; for step 12 a `preview_launch` row and no grade job for teacher.test.
- `GET /api/lms/grades` as the LT-SCHOOL-A admin matches the card.

## Not done / later

- Phase 2 deep linking (the picker) will replace the custom parameter; the binding code is small (`core/binding.ts`) and can be called from the deep-link return.
- No UI to change a link's scoring policy (field `lms_resource_links.scoringPolicy` only); no teacher-facing grade sync view.
- Line item paging (`Link` headers) is not followed (first page only; Moodle filters by resource link).
- `result.readonly` is requested but the results service is not read.
- `/api/lms/*` grade routes are not yet in the `p7RoleMatrix` / `p14_9TenantIsolation` sweeps (those run with flags off and see 404s); `phase3.test.ts` has its own role and tenant sweep.
- Not tested live: MoodleCloud (runbook above), Moodle 4.5 LTS / latest (Phase 7).
