# Grade ledger (owner decision 4, 2026-11-18)

Status: **built and tested locally** (2026-11-18), branch `claude/lms-grade-ledger` (from the Phase 3 tip `b5bb3ec6`). **Not deployed, migration not run, switch off.** With `GRADE_LEDGER_ENABLED` unset nothing is written or read, the new routes are the normal 404 and every existing API answer is unchanged (tested).

The ledger is an **ENARA feature**: it works with every LMS switch off. Only part (e), grades changed in the LMS, needs the LMS grade switches too (`LMS_LTI_ENABLED` + `LMS_GRADE_PASSBACK_ENABLED`).

## What it does

| Part | What | Where |
|---|---|---|
| a | Every attempt stays its own record (`assessmentattempts`, as today). The history view numbers them per student per assignment (by start time) and shows date, score, status and "graded by" (auto / teacher / regrade). The live attempt is still updated in place (corrections overwrite `score`), the ledger keeps every step. No code path deletes attempts except PDPL erasure (and the local dev seed, which wipes a dev database); a test greps the source for it | `services/gradeLedger.ts` (`gradeHistory`, `gradedByOf`) |
| b | One **append-only** `grade_ledger` entry per grade change: attempt, assignment, student, school, attempt number, `from` → `to` (points / max, percentage, status), who (`system`, `student`, or the teacher's / admin's user ID), reason, timestamp, the question for per-answer changes, and the teacher's own text reason as `note` | `models/GradeLedger.ts`, `services/gradeLedger.ts` (`recordGradeChange`) |
| c | One **append-only** `grade_sync_log` row per try to send a result to the LMS: what was sent (score, maximum, grading/activity progress, the comment as a 16-hex SHA-256 prefix and its first sentence, e.g. `Score: 2/2 (100%).`; no names), when, result `sent` / `retried` (sent after earlier failed tries) / `failed` (will retry, with `nextAttemptAt`) / `dead`, the error code, tries, linked to the `lms_grade_sync_jobs` row (`jobId`) and to the attempt's ledger entry (`ledgerEntryId`) | `integrations/lms/core/gradeSyncLog.ts`, hooked in `outbox.ts` `finish()` |
| d | Teacher "Grade history": attempts, ledger entries and sync log as one timeline (who / what / when, old → new), and the LMS decision | API below; `frontend/pages/teaching/GradeHistory.tsx`, opened from **Class assignments** (each student row: "Grade history"; "Changed in LMS" badge) and the **grading screen** ("Grade history" button) |
| e | Grades changed directly in the LMS: read through the AGS result service, compared with the last value ENARA sent; a difference is a ledger entry `lms_change_detected` with both values, the cell is marked "LMS value differs" and gets **no automatic sends** until an ENARA teacher chooses **Keep LMS value** (recorded, nothing sent) or **Keep ENARA value** (sent again) | `integrations/lms/core/lmsResults.ts` (`checkLmsResults`, `decideLmsSlot`), `adapters/lti13/ags.ts` (`readLmsResult`) |
| f | Append-only enforced; PDPL permanent delete anonymises | `models/GradeLedger.ts` (schema middleware), `services/gradeLedger.ts` (`anonymiseGradeLedger`), `services/studentErasure.ts` |
| g | Backfill for existing attempts and sent jobs (dry run by default) | `services/gradeLedgerBackfill.ts`, `scripts/gradeLedgerBackfill.ts` |

### Where entries are written (the single points where a result changes)

Next to the Phase 3 hook `lmsResultChanged()` (same places, plus the two that had none), always **before** it, so the sync log can link to the entry:

| Reason | Who | Where |
|---|---|---|
| `submitted`, `newer_attempt` (2nd attempt on) | `student` (or `system` for a time-limit submit) | `controllers/meAssignments.controller.ts` `submitAttempt` |
| `auto_graded`, `regrade_after_grader_fix` (when a person sent it back to the grader) | `system` | `services/autoGrading.ts` `processAttempt` |
| `grading_exception` | `system` | `services/autoGrading.ts` `recordFailure` (final) |
| `teacher_override` (changing an answer-key score or not following the AI proposal), `teacher_scored` | teacher ID | `controllers/grading.controller.ts` `scoreAnswer` |
| `teacher_finalized` | teacher ID | `services/grading.ts` `finalizeAttempt` |
| `released` | teacher ID | `services/grading.ts` `releaseAttempt` (automatic release is part of `auto_graded`: its `to.status` is `released`) |
| `teacher_correction` | teacher ID | `controllers/grading.controller.ts` `correctGrade` |
| `regrade_requested` | teacher ID | `controllers/grading.controller.ts` `regradeSubmission` |
| `lms_change_detected`, `lms_change_reverted` (the LMS teacher put the value back: the hold ends by itself) | `system` | `lmsResults.ts` |
| `kept_lms_value`, `kept_enara_value` | teacher ID | `lmsResults.ts` `decideLmsSlot` |

`from` is the previous entry's `to` (or `null` for the first one); `to` is the attempt as stored after the change. For the LMS reasons both values are given explicitly; LMS values carry `status: 'lms'` and the gradebook's own scale (e.g. `40 / 100`, `fraction 0.4`). `recordGradeChange` never throws and never changes a grade.

## Collections (migration `2026-11-18-grade-ledger-indexes`, additive, **not run**)

| Collection | Kind | Indexes |
|---|---|---|
| `grade_ledger` | append-only | `id` unique; `attemptId, at`; `institutionId, assignmentId, studentId, at`; `studentId` |
| `grade_sync_log` | append-only | `id` unique; `attemptId, at`; `resourceLinkId, lmsUserId, at`; `jobId`; `studentId` |
| `grade_lms_slots` | mutable state per LMS cell (resource link + LMS user): `status` `differs` / `resolved`, both values, `detectedAt`, `resolution`, `resolvedBy`, `agreedFraction` after keep-LMS, `lastCheckedAt`, `lastCheckError` | `id` unique; `resourceLinkId, lmsUserId` **unique**; `institutionId, assignmentId, studentId`; `status` |

**Append-only (f):** on `grade_ledger` and `grade_sync_log` every Mongoose `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`, `deleteOne`, `deleteMany`, `findOneAndDelete`, a non-insert `bulkWrite`, `doc.deleteOne()` and saving an existing document **throw** (`AppendOnlyError`). There are no update/delete routes. A test greps `backend/src`: no model update/delete call on the two ledgers anywhere, raw collection access only inside `anonymiseGradeLedger` (the PDPL path), no PUT/PATCH/DELETE route for the history, and `AssessmentAttempt` deletes only in `services/studentErasure.ts` and `scripts/seed.ts`.

## Switch

| Name | Default | Notes |
|---|---|---|
| `GRADE_LEDGER_ENABLED` | **off** | ENARA feature. Off: no reads or writes, `GET .../grade-history` and `POST .../lms-decision` are the normal 404, `GET /api/assignments/:id` and `GET /api/grading/attempts/:id` answer exactly as before (tested: on = off + `gradeLedger: true` and the roster's `lmsValueDiffers`), Re-sync answers without `lmsCheck`, the daily cron has no `lmsResultsCheck` step, and an LMS cell marked "differs" while it was on is **not** held (Phase 3 behaviour exactly) |

Part (e) additionally needs `LMS_LTI_ENABLED` + `LMS_GRADE_PASSBACK_ENABLED` (otherwise `checkLmsResults` returns `{ skipped: 'off' }` and the decision route answers 404). Real schools: passback stays off until the ESL6 accuracy bar (Phase 3 notes); the ledger itself has no such constraint.

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `GET /api/assignments/:id/students/:studentId/grade-history` | the class's teacher, school admin (own school), ENARA admin | `{ assignment, student, attempts[], entries[], syncLog[], lms[], actors{ userId: { name, role } }, lmsDecisions }`. Another class's teacher, another school's staff, an unknown student or one not on the assignment: 404; students 403; anonymous 401. Anonymised (deleted) students' rows are never returned |
| `POST /api/assignments/:id/students/:studentId/lms-decision` `{ resourceLinkId, keep: 'lms' \| 'enara' }` | same | `{ resolution, queued }`; 404 when the cell does not exist (or LMS off), 409 when it no longer waits for a decision |
| `GET /api/assignments/:id` (changed, only when on) | as before | `gradeLedger: true`, each roster row `lmsValueDiffers` |
| `GET /api/grading/attempts/:id` (changed, only when on) | as before | `gradeLedger: true` |
| `POST /api/lms/platforms/:id/grades/resync` (changed, only when on) | as before | first `checkLmsResults` for the platform (or the one link; ≤ 100 cells, 15 s), then the re-sync; answer adds `lmsCheck` |
| `GET /api/cron/daily` (changed, only when on and `daily` is a drain trigger) | scheduler | new step `lmsResultsCheck` (all cells, least recently checked first, ≤ 200 cells, 15 s) **before** `lmsGrades` |

## Grades changed in the LMS (part e) in detail

- **Read:** `GET {lineitem}/results?user_id=<LMS sub>` (the line item's query string, e.g. Moodle's `?type_id=`, is kept), `Accept: application/vnd.ims.lis.v2.resultcontainer+json`, with the cached AGS service token (scope `https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly`, already requested since Phase 3; a course whose granted scopes lack it gives `no_result_scope`). 8 s timeout, a 401 refreshes the token once, only short codes kept (`results_http_503`, ...).
- **Which cells:** every resource link + LMS user that has ever had an outbox job, for one link, one LMS course (context), one platform, or all (cron). Skipped while a newer ENARA job for the cell is pending or processing.
- **Compared with:** the last value ENARA actually sent (newest `sent`/`retried` sync log row; jobs sent before the ledger existed count too), or, if the teacher chose **Keep LMS value** after that, the kept value. **Fractions** are compared (`resultScore / resultMaximum`, AGS default maximum 1) because Moodle scales to the line item's maximum grade (e.g. 2/3 → 66.67/100), with a tolerance of **0.005**. ENARA sent a score but the LMS shows none: not treated as a change (conservative). ENARA sent "pending" (no score) and the LMS shows a score: a change.
- **Different:** ledger `lms_change_detected` (from = ENARA's value, to = the LMS value), audit `grade.lms_changed` (IDs only), the cell becomes `differs`. The same LMS value checked again adds nothing; a different LMS value adds another entry; the LMS put back to ENARA's value ends the hold (`lms_change_reverted`).
- **Held:** the outbox's send-time check refuses a held cell: the job becomes `dead` with code **`lms_value_differs`** (sync log row `dead`), so nothing overwrites the LMS teacher's grade: not a re-sync, not a newer attempt. Admins see it in the dead count with that code; "Retry failed" leaves it held.
- **Keep LMS value:** ledger `kept_lms_value` (from ENARA → to LMS), cell `resolved` with the kept fraction; nothing is sent; later checks compare with the kept value. ENARA's own attempt score is **not** changed (decision below). New ENARA results for the cell are sent again as usual.
- **Keep ENARA value:** ledger `kept_enara_value` (from LMS → to ENARA's **current** result for the cell, by scoring policy), the jobs refused while held go back to the queue (older ones are superseded as usual), the current result is queued again and pushed.
- **Moodle's rule:** if the Moodle teacher **overrode** the grade in the gradebook, Moodle ignores later tool scores for that cell. After "Keep ENARA value" the next check will find the difference again; the Moodle teacher must remove the override (Grader report › edit the cell › untick *Overridden*) for ENARA's value to show.
- **Phase 4 hook:** `checkLmsResults(context)` accepts an `lms_contexts` row (or a resource link row, or `{ contextId | resourceLinkId | platformId, institutionId }`, or `{ all: true }`), is bounded (`limit`, `budgetMs`, defaults 100 / 20 s) and never throws. Wire it into `afterRosterSync(context)`:
  ```ts
  import { checkLmsResults } from './lmsResults';
  export async function afterRosterSync(context: ILmsContext) {
    await checkLmsResults(context, { limit: 100, budgetMs: 10_000 });
  }
  ```

## PDPL permanent delete (part f)

`services/studentErasure.ts` calls `anonymiseGradeLedger` inside `anonymiseResults` (P1), **whatever the switch says** (rows written while it was on must still be anonymised):

- entries and sync log rows of **kept** (anonymised) attempts: `studentId` → the **same random anonymous ID** the kept attempts got, `attemptId` → the kept attempt's new ID, `anonymised: true`; dropped: the teacher's free-text `note`, and the LMS user and job links (`lms.lmsUserId`, `lms.jobId`, sync `lmsUserId`, `jobId`, which could be joined with `lms_audit_log`'s old attempt ID). Kept: reasons, values, timestamps, actors (staff IDs), the activity's resource link;
- entries and sync rows of attempts that are deleted (no final score, personal assignments): deleted;
- the student's `grade_lms_slots`: deleted.

The erasure answer gets `anonymised.grade_ledger`, `anonymised.grade_sync_log`, `removed.grade_ledger`, `removed.grade_sync_log`, `removed.grade_lms_slots` **only when non-zero** (so with no ledger rows the answer is unchanged). Tested: afterwards none of the three collections contains the student ID, the old attempt IDs, the teacher's text or the LMS user ID.

## Backfill (part g)

```
cd backend
npm run ledger:backfill -- --institution LT-SCHOOL-A                    # dry run (default): counts only
npm run ledger:backfill -- --institution LT-SCHOOL-A --apply --confirm  # write (inserts only)
```

- Each submitted assignment attempt of the school (not anonymised, not demo) **without any ledger entry** gets one entry from its stored state: `released` → `released`, `finalized` → `auto_graded`, anything else → `submitted`; `from: null`, `to` = stored value, actor from the attempt's history (`system` for the grader), dated `releasedAt` / `finalizedAt` / `submittedAt`, `backfilled: true`, with its attempt number.
- Each `sent` outbox job without a sync log row gets one `sent` (or `retried`) row dated `sentAt`, `backfilled: true`. This also gives part (e) its reference values.
- Idempotent (run it twice: the second run writes 0). `--limit N` (default 5000). Owner: lms-test only.

## MoodleCloud check (for the owner)

Before: this branch deployed to lms-test with `GRADE_LEDGER_ENABLED=true` (lms-test only), the Phase 3 settings as in `PHASE_3_NOTES.md` (passback on, Access token URL set), `npm run migrate` (adds `2026-11-18-grade-ledger-indexes`), and the backfill applied for `LT-SCHOOL-A` so the earlier quiz has history.

| # | Do | Expected | Screenshot |
|---|---|---|---|
| 1 | As teacher.test in ENARA: **Class assignments** › the course class › **ENARA graded quiz** › student.test's row › **Grade history** | Attempts 1 and 2 (from the earlier run) with their scores; entries "Released · recorded later" (backfilled) and the sync log rows "Sent to the LMS" | the dialog |
| 2 | As student.test, do a new attempt in Moodle (ENARA graded quiz) and submit | Grade history: attempt 3 "Submitted (newer attempt)" then "Graded automatically" (old → new), then "Sent to the LMS · N / M · “Score: …”"; Moodle shows the new score | dialog + grader report |
| 3 | In Moodle as teacher.test: **ENARA Test Course › Grades** (Grader report) › **Turn editing on** › change student.test's cell for ENARA graded quiz (e.g. to **40**) › **Save changes** | Moodle shows 40 (overridden) | grader report |
| 4 | ENARA (LT-SCHOOL-A admin or ENARA admin) › **LMS connections** › **Re-sync grades** (or wait for the nightly run of `/api/cron/daily`) | The response's `lmsCheck` has `newlyFlagged: 1`; "Grades to the LMS" shows 1 more **failed** with code `lms_value_differs` (the held re-send); Moodle still shows **40** | the connection card |
| 5 | As teacher.test in ENARA: Class assignments › the quiz | student.test's row shows **"Changed in LMS"** | the roster |
| 6 | Open **Grade history** | Amber box: "**Changed in LMS.** The LMS gradebook shows **40 / 100 (40%)**; ENARA sent **X / Y (Z%)** … until you choose which one counts", buttons **Keep LMS value** / **Keep ENARA value**; timeline entry "Changed in the LMS · ENARA (automatic) · X / Y → 40 / 100" | the dialog |
| 7a | Click **Keep LMS value** | Box gone, entry "Kept the LMS value · teacher.test"; nothing sent (Moodle stays 40); a new Re-sync does not flag it again | dialog + grader report |
| 7b | (Alternative, or after changing the cell again and re-syncing.) First in Moodle **remove the override** on the cell (Grader report, editing on › the cell's edit icon › untick *Overridden* › Save), then in ENARA click **Keep ENARA value** | Entry "Kept the ENARA value · teacher.test" (from 40 / 100 → ENARA's current value); a new "Sent to the LMS" row; Moodle shows ENARA's value again within seconds. (If the cell is still overridden, Moodle ignores the tool's score and the next check flags it again.) | dialog + grader report |
| 8 | Optional: as student.test submit another attempt while the cell is "Changed in LMS" | Moodle keeps the teacher's value; the sync log shows "Not sent · lms_value_differs" | dialog |

What I (ENARA side) will check after the run (IDs only): `grade_ledger` rows for student.test (reasons in order, `from`/`to`, actor teacher.test's user ID for the decisions), `grade_sync_log` rows with `jobId` of the `lms_grade_sync_jobs` rows and `result`, `grade_lms_slots` (`differs` → `resolved`, `resolution`), `lms_audit_log` `grade.lms_changed` / `grade.lms_decision`, and that Moodle's result read was `…/lineitems/<n>/lineitem/results?type_id=<n>&user_id=<sub>`.

## Decisions and deviations

1. **Ledger rows reference the attempt's state, not a copy of the attempt.** The live attempt is still updated in place (as today); the ledger is the history. Changing every grading path to write a new attempt version was not done: the ledger gives the full history without touching how grades are stored.
2. **`student` as actor** for submissions (no ID): the requirement names `system` or a teacher ID; a submission is the student's act, and no student ID is put in the actor field.
3. **Automatic release** is one `auto_graded` entry (its `to.status` is `released`); `released` entries are the teacher's release (manual release policy, finalize-and-release).
4. **Held cells use the outbox's existing `dead` state** (code `lms_value_differs`) rather than a new job status, to keep the Phase 3 outbox untouched apart from two small hooks. They show in the admin's failed count with that code.
5. **Keep LMS value does not change ENARA's own score** (the attempt keeps ENARA's grade; the LMS gradebook keeps the teacher's). Owner to confirm (below).
6. **After a decision, automatic sends resume** for that cell: a new ENARA result (e.g. a newer attempt) is sent and would replace the LMS teacher's value (unless Moodle has it overridden). Owner to confirm (below).
7. **An LMS cell with no score while ENARA sent one is not flagged** (an emptied cell or a result the LMS has not stored yet); only a different score, or a score where ENARA sent "pending", is.
8. **One results call per cell** (`?user_id=`), as specified; paging of results is not followed (one user per call).
9. **Quick in-process retries** of the inline push (2 s / 5 s / 15 s) are within one outbox try: one sync log row per outbox try, not per HTTP call.

## Decisions needed (owner)

- (5) Should **Keep LMS value** also write the LMS value into ENARA (a teacher correction of the attempt), or only record it (current)?
- (6) After **Keep LMS value**, should a **newer attempt** still be sent automatically (current), or should the cell stay LMS-managed until the teacher says otherwise?
- Should teachers (not only admins) get a "Check LMS grades now" button? Today the check runs from the admin Re-sync, the nightly cron and (once wired) the roster sync.

## Files

- New: `backend/src/models/GradeLedger.ts`, `backend/src/services/gradeLedger.ts`, `backend/src/services/gradeLedgerBackfill.ts`, `backend/src/scripts/gradeLedgerBackfill.ts`, `backend/src/controllers/gradeLedger.controller.ts`, `backend/src/integrations/lms/core/gradeSyncLog.ts`, `backend/src/integrations/lms/core/lmsResults.ts`, `frontend/pages/teaching/GradeHistory.tsx`, `backend/test/lms/gradeLedger.test.ts`, this file.
- Changed (small, additive): `config/env.ts` (`gradeLedger.enabled`), `integrations/lms/core/outbox.ts` (2 hooks: send-time hold check, sync log in `finish()`), `adapters/lti13/ags.ts` (`readLmsResult`, `resultsUrl`), `services/grading.ts`, `services/autoGrading.ts`, `controllers/grading.controller.ts`, `controllers/meAssignments.controller.ts` (one `recordGradeChange` line per point), `controllers/assignments.controller.ts` (roster flag), `routes/assignments.routes.ts` (2 routes), `integrations/lms/admin/routes.ts` (check before re-sync), `routes/cron.routes.ts` (daily step), `services/studentErasure.ts` (PDPL), `migrations/index.ts`, `package.json` (`ledger:backfill`), `frontend/services/apiService.ts`, `frontend/pages/teaching/ClassAssignments.tsx`, `frontend/pages/teaching/GradingReview.tsx`, `backend/test/lms/mockPlatform.ts` (AGS result service and a Moodle-style gradebook).

## Tests

`backend/test/lms/gradeLedger.test.ts` (**19 tests**, mock platform on 127.0.0.1):
- (a)(b) with the LMS switches off: two attempts 75 then 25 → both attempts kept, entries `submitted`/`auto_graded` and `newer_attempt`/`auto_graded` with numbers and old → new, the history shows both; teacher override (old/new, teacher ID, note, question), scored, finalized, released, correction; regrade (`regrade_requested` by the teacher, `regrade_after_grader_fix` by the system; graded by "regrade").
- (d) permissions and tenant isolation: class teacher, school admin, ENARA admin 200; another teacher, another school's admin/teacher 404; student 403; anonymous 401; student not on the assignment / unknown 404; same gate for the decision; roster and grading screen fields.
- (c) sync log: `sent` (job, ledger entry, payload, comment hash/short, no names); `failed` (503, `nextAttemptAt`) → `retried` (tries 2) → `dead` (400), one row each.
- (e) tolerance and Moodle scaling (2/3 vs 66.67/100), the results request (path, query kept, `user_id`, media type, scope); a Moodle change found by **Re-sync** (ledger entry with both values, cell held, the re-sync and a newer attempt not sent, no duplicate entry on re-check, roster flag, history); **Keep LMS** (recorded, nothing sent, 409 on a second decision, later check in sync); **Keep ENARA** (a new change found through `checkLmsResults(context)` as the Phase 4 hook will call it, ENARA's current value sent, Moodle back in sync); the **daily cron** step; read errors as codes.
- Switch off: no ledger or sync rows, held cells not held, `checkLmsResults` skipped, routes 404, no `lmsCheck`; on = off + the ledger fields only for `GET /api/assignments/:id` and `GET /api/grading/attempts/:id`; hand grading writes nothing.
- (f) every update/delete path on both models throws; the source grep; PDPL anonymisation (same anonymous ID and new attempt ID, note dropped, LMS user/job links dropped, non-kept rows and cell states removed, nothing left that names the student or old attempt IDs).
- (g) backfill dry run / apply / idempotent, sync rows for jobs sent while off; the migration twice.
