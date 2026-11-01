# ENARA P17: staging stabilization, deployment readiness and E2E regression (2026-10-30)

## 1. Final status: **PASS**, with recorded findings

The updated deployment `dpl_4Bj8UuVfA4PcTxjq5ZtZdcMs74K1` completed the **real end-to-end learning journey** on staging with real AI calls:
- teacher publishes a lesson through the new D3 interface;
- student opens it;
- real tutor reply;
- submission;
- **real autonomous grading, released with no teacher step**;
- teacher views match the stored records;
- usage accounting is consistent;
- 29/29 authorization and persistence checks pass.

D1, D2, D3 and U1 are verified on staging.

**Recorded findings** (section 14.12; none blocks the journey):
- **F1:** the first grading run was rejected by the feedback-leak guard. No grade was released, and the system's own retry released the correct result.
- **F2:** retry timing depends on the student or teacher viewing the attempt, because staging has only a daily sweep.
- **F3:** spend was $0.052, above the $0.03 estimate, because of F1.

Owner waivers stay as recorded:
- **Stop A:** waived, not passed.
- **Anthropic key not rotated:** the owner's decision; an accepted risk.

**Limits:**
- Cross-tenant leakage on staging was probed only with unknown and other-class ids (no second-tenant fixtures, as agreed). Isolation between schools is covered locally by `p14_9TenantIsolation`.
- The Atlas test-spend counter and the provider console remain unverified (section 10).

## 2. Scope and rules followed

- Local work only. The live staging checks were read-only:
  - deployment list and inspect;
  - environment variable names and non-secret values;
  - `/health`;
  - the admin usage report.
- No secrets were printed. The Anthropic key was checked only for presence; its value was not shown.
- No deletion of the P16 synthetic records.
- No change to the enrollment model.
- **Stop A:** waived by the owner (status *waived*, not passed).
- **Anthropic key rotation:** the owner chose not to pursue it in P17. This is recorded as an **accepted unresolved risk** (section 12) and was not raised again.
- Unrelated uncommitted work is preserved: the P12–P16 scripts, tests and docs are unchanged.

## 3. Baseline

| Item | Value |
|---|---|
| Live deployment | `dpl_8tccc1rcKRNQKURe5wKYbBSX82cP` (`enara-staging-alpha.vercel.app`, production, created 2026-10-29 21:03Z), commit `574010a` |
| Previous deployments | `dpl_GsPGJSaGeDxJtGNiWrwcj2EYwbZ1` (keyless; the current Instant Rollback target), `dpl_F195WfHkFaeG8wWhM4NcAtY8P23u` |
| `/health` | 200 |
| Code since P16 | No backend runtime changes. P17 changes are frontend-only, plus tests and the harness |
| Local base | `574010a` + working tree (7 modified frontend files; untracked tests, scripts and docs) |

## 4. Phase A: role behaviour (UI and API)

The checks ran in a real browser (Playwright) against the real backend and built SPA on an in-memory database:

```
backend/test/ui/journeyServer.ts
backend/test/ui/p15UiJourney.cjs
```

**42/42 checks passed.**

| Role | What was checked | Result |
|---|---|---|
| Student | Dashboard; published lesson; Due soon → Assignments (D2); lesson content; tutor failure without a provider is handled gracefully; no answer keys; submit → auto-graded 1/2; per-question marks; no page errors; no 401/403 calls. **New:** after a reload the session is kept, the submitted assignment leaves Due soon, and there are still no refused calls | PASS |
| Teacher | Lands on the Teaching dashboard (D1); admin-only menu items hidden; own class shown; grading view shows the released grade. **New (U1/D3):** see the row below and section 5 | PASS |
| Teacher, new checks (U1/D3) | Curriculum page: no refused calls, no error toasts, Batches and Course Instances tabs hidden, header reads "Teaching". The teacher **publishes the lesson to a second class through the UI**, and the server records it. Assessment Center: no refused calls, no error toasts. Reload lands on the Teaching dashboard with no refused calls; Students is still hidden | PASS |
| Workspace admin | Dashboard, Governance, AI Credits, School Insights and Teaching Dashboard kept. **New:** Curriculum keeps the Batches and Course Instances tabs; header reads "School admin" | PASS |
| Academic manager | API only (backend journey H, P16 probes): reads school analytics; refused roster, grading queue and assignment (403). **Not exercised in the browser journey** | PASS (API); UI not executed |
| Unauthorized navigation | Teacher menu and `navigate()` guard (`staffPageAllowed`); unit tests in `p15StaffRouting.test.ts`; the server still refuses with 403 regardless of the UI | PASS |

**Limit:** D1/D2/U1/D3 are verified locally only. The live staging UI still runs the pre-fix frontend until a deployment is approved.

## 5. Defects found and fixed in P17

| Id | Severity | Finding | Fix | Regression coverage |
|---|---|---|---|---|
| **D3** (new) | High (workflow blocker) | No frontend code called `POST /api/curriculums/:id/publish-to-class`. The only link button on a curriculum card was "Assign to Batch" (admin-only), so **teachers could not publish a lesson to their class from the UI**. P16 did this through the API. | `apiService.publishCurriculumToClass` added. CurriculumCenter shows teachers a "Publish to class" button and a dialog listing their own classes (`GET /api/assignments/classes`). Assign to Batch, Deploy and Delete stay admin-only. | UI checks: publish dialog, publish to the second class, server record |
| **U1** (P15) | Low (cosmetic) | Teachers on Curriculum and Assessment Center triggered admin-only calls (batches, course instances, students → 403), saw red error toasts, and the header read "School admin" | Admin-only calls are skipped for teachers; the Batches and Course Instances tabs are hidden for teachers; the page and top-bar labels read "Teaching" for teachers | UI checks: no refused calls, no toasts, labels; the admin side is kept |

The server-side permissions are unchanged; no security control was weakened.

**Changed files:**
- `frontend/services/apiService.ts`
- `frontend/pages/CurriculumCenter.tsx`
- `frontend/pages/AssessmentCenter.tsx`
- `frontend/components/Layout.tsx`

## 6. Phase B: full local regression (mocked AI)

| Suite | Result |
|---|---|
| Backend vitest (all) | **76 files, 1031/1031 passed** |
| `p15LearningJourney.test.ts` (one database, real password logins) | **14/14**, including 2 new P17 tests |
| Frontend `tsc --noEmit` / backend `tsc --noEmit` | clean / clean |
| Production build (`vite build`) | OK |
| UI journey | 42/42 |

**Coverage of the required cases:**

| Case | Where | Result |
|---|---|---|
| Teacher preparation, publishing, assessment, assignment | Journey B, C, E; UI | PASS |
| Student lesson and tutor (mocked), history, metering | Journey D; UI | PASS |
| MCQ and open-response rubric grading, auto release | Journey F+G | PASS |
| **Partial credit** | **New P17-K:** rubric level 1/2 + MCQ 1/1 → 2/3 | PASS |
| Idempotency (repeat submit, repeat sweep, second regrade 409) | F+G, G-negative, P17-L | PASS |
| Analytics match the database | Journey H | PASS |
| Expired token, no token, wrong password | Journey A | PASS |
| Unauthorized ids (other students, other class, other school) | E, F+G, **P17-L** | PASS |
| Duplicates and concurrency (parallel starts and submits) | F+G, J-race | PASS |
| **Timeout** | **New P17-L:** provider timeout → `grading_failed`, no score, no release, retry scheduled, error rows ledgered; the retry releases once | PASS |
| Malformed output | G-negative: 3 runs → `grading_exception`, never released; teacher regrade recovers | PASS |
| **Missing usage** | **New P17-L:** reply without usage → ledger rows `usage_unknown` with a null cost; grade released once | PASS |
| Budget exhaustion | Journey I: test-spend cap refuses before the provider (429 `AI_TEST_SPEND_CAP`) | PASS |
| No network egress | Journey J: 0 outbound calls | PASS |

### Arabic grading evaluation (Modern Standard Arabic)

P17-K grades an open answer written in **Modern Standard Arabic (فصحى)**:

> «نحتاج إلى مقام مشترك لكي نجمع أجزاءً من النوع نفسه.»

The answer has no Egyptian dialect forms, and the rubric, question and feedback fixtures are all in MSA. Verified:
- the answer reaches the grader verbatim;
- the grading prompt asks for feedback "in Arabic";
- partial credit is applied;
- the MSA feedback is stored and shown;
- the model answer is not leaked.

**Observation, not changed:** the grading prompts (`gradingProposals.ts`) ask for "Arabic" without naming a variety. The tutor and avatar reply in **Egyptian Arabic** by design (`avatar.controller.ts:427`). With a mocked provider, the test cannot show which variety the real model writes.

Pinning "Modern Standard Arabic" in the grading prompts is a product decision. It would change prompts covered by the Arabic grading evaluations, so it is left for the owner (section 13).

## 7. Phase C1: U1

The root cause and fix are in section 5. U1 is **fixed** (in scope: frontend only, no permission change).

## 8. Phase C2: batch-based enrollment (documented, not changed)

**Rule.** `getEnrolledInstances` puts a student in every class whose `studentIds` contains them **or** whose `batchId` is their batch. A class roster therefore includes the whole batch. Teachers are scoped to classes through `instructorIds`.

This behaviour is pinned by the journey test `C-policy`.

**Consequence.** If two classes share one batch, every student of that batch sees both classes' published lessons and assignments, and both teachers see the whole batch.

The P16 staging run avoided this with a dedicated batch. The P17 harness also gives the second class its own batch.

**Owner decision still open:**
- keep batch-based enrollment and require one batch per class; or
- move to membership-only (`studentIds`).

No change was made.

## 9. Phase C3: P16 synthetic records (classified, nothing deleted)

| Record | Id | Class | How to remove |
|---|---|---|---|
| Batch | `b1793311573178` | API-removable | `DELETE /api/batches/:id` |
| Class | `inst-1793311573652` | API-removable | `DELETE /api/course-instances/:id` |
| Curriculum and lesson | `CUR-X8MU9A-4135` | API-removable | `DELETE /api/curriculums/:id` |
| Assessment | `ASM575250` | API-removable | delete or archive |
| Assignments (2) | `asg-fb27a1e3-…` + the second (local inventory) | API-removable (archive) | `POST /api/assignments/:id/archive` |
| Attempts (2) | — | **Needed** (grading history and evidence) | no route; DB only if ever required |
| Tutor session (1) | — | API-removable (student route) | student delete |
| Student record | `STU57776246` | API-removable | `DELETE /api/students/:id` |
| Student **user** | `p16-student@p16.staging.enara.test` | **DB cleanup**; **owner clarification** needed (no Atlas cleanup owner named) | Atlas, by `_id` |
| Usage-ledger rows (3) | — | **Needed** (append-only audit; also the P17 cost evidence) | keep |
| School flag `ai_grading_enabled=true` | — | **Owner clarification** (left on by your choice) | `PUT /api/learning/flags` |

**Recommendation:** keep everything until Phase F has run, because Phase F can reuse the P16 class and student and so create no new identities.

## 10. Phase D: cost and cap reconciliation

| Evidence | Value | Class |
|---|---|---|
| Admin usage report, live, read-only (30 days, school) | 4 operations: `ai_grading` 2 (1,528 in / 827 out), `tutor_chat` 1 (692 / 154), `staff_assistant` 1 (371 / 48). 4 succeeded; 0 failed; 0 unpriced; **0 usage-unknown**. Unchanged since P16 | **Verified** (app ledger) |
| Recomputed cost (catalogue $4 / $20 per million tokens) | grading $0.022652 + tutor $0.005848 + staff $0.002444 = **$0.030944** | **Estimated** (catalogue list price, `source: list_estimate`; matches published Opus 5.5 pricing) |
| P16 report figure | ≈ $0.031 | Consistent with the line above |
| Direct key check (P14.11, outside the app) | ≈ $0.000004 | Estimated |
| Counter `test_spend:p14-live-20261029-12a335` | Expected settled ≈ $0.031 | **Unverified** (Atlas only) |
| Provider console usage and invoice | — | **Unverified** (not accessible to Claude) |
| App cap | `AI_TEST_SPEND_CAP_USD="4.50"`, `AI_TEST_SPEND_ID` set, `ENARA_STAGING="true"`, `AI_PAUSED="false"` (read from Production env; the key's presence was confirmed, its value not shown). The guard refuses a cap above $5 | **Verified** |
| Provider cap ≤ $5 | — | **Operator-attested** only |

**Verdict:** the accounting is **internally consistent**:
- ledger = report = recomputation;
- no unknown-usage rows;
- the cap is in place.

Further paid testing is **not blocked** on accounting grounds. Remaining headroom is about $4.47 of the $4.50 app cap.

## 11. Phase E: deployment manifest (prepared, then **executed after approval**; see section 14.1–14.3)

| Item | Plan |
|---|---|
| Method | `vercel deploy --prod` from the repo root (CLI; the project is not Git-linked) |
| Content | Commit `574010a` + the working tree. **Runtime changes are frontend only** (the 4 files in section 5 + the P15 D1/D2 files `App.tsx`, `Layout.tsx`, `StudentDashboard.tsx`, `roleRouting.ts`). The backend `src` is unchanged except the untracked `src/scripts/p12*.ts`, which nothing imports |
| Build | `vercel.json` buildCommand (vite build + backend tsc); both pass locally |
| Secret scan | No `.env`, credential or key files in the tree (only `.env.example`); the local creds file is outside the repo |
| Environment | Unchanged (keyed: the Anthropic key, cap $4.50 and spend id are already set). No env edits |
| **Rollback** | After the deploy, Hobby Instant Rollback goes only to the immediately previous deployment, which will be the **keyed** `dpl_8tccc…`. The keyless `dpl_GsPG…` will no longer be one click away. Emergency cut-off is then: set `AI_PAUSED=true` (does **not** stop grading), or remove the key and redeploy. Stop A stays waived |
| Post-deploy smoke checks | `/health` 200, guard active, teacher and student logins, D1/D2/U1/D3 in the browser |
| Phase F plan (paid) | Reuse the P16 class and student. 1 tutor message + 1 submission (≈ 2 grading evaluations) ≈ $0.03. No automatic retries of failed paid calls; minimal authorization probes; no cross-tenant fixtures |

## 12. Accepted risks

1. **Anthropic key not rotated:** the key was exposed in chat. The owner explicitly chose not to rotate it during P17. This is an accepted, unresolved risk.
2. **Stop A:** waived, not passed.
3. **Provider cap and Atlas counter:** operator-attested or unverified (section 10).
4. **Rollback chain:** the keyless instant rollback is lost after the next deploy (section 11).
5. **Batch-based enrollment:** risk of over-sharing if two classes share one batch (section 8).

## 13. Open owner decisions

1. Leak-check strictness (F1) and a frequent grading sweep on staging (F2).
2. Arabic grading prompts: pin "Modern Standard Arabic"? (section 6)
3. Enrollment model (section 8).
4. Cleanup of the P16/P17 records and the Atlas owner for the student user (sections 9, 14.15).
5. Keep `ai_grading_enabled` on the staging school?
6. Commit and push the P15/P17 changes (not done; needs separate authorization).

## 14. Phase F: updated deployment and real staging E2E (2026-10-30)

Approvals: "approve deploy", then "approve live test" (separately).

### 14.1 New deployment

| | |
|---|---|
| Deployment | **`dpl_4Bj8UuVfA4PcTxjq5ZtZdcMs74K1`** (`enara-staging-alpha-e5cedshns.vercel.app`), created 13:15:07Z |
| Alias | `enara-staging-alpha.vercel.app` → `dpl_4Bj8…` (promoted 13:18Z) |
| Previous | `dpl_8tccc1rcKRNQKURe5wKYbBSX82cP` (keyed; now the instant-rollback target) |
| Method | `vercel deploy --prod --skip-domain`, then smoke checks on the deployment URL, then `vercel promote` |

### 14.2 Exact source and manifest

- **Base:** `git archive` of `origin/staging-alpha` = `574010aee32bd2fd0493c768ae431baed1cf78c9`.
- **Overlay:** exactly 7 frontend files (sha256 prefixes):

| sha256 prefix | File |
|---|---|
| `eb5309252956` | `App.tsx` |
| `3f67abc249f6` | `Layout.tsx` |
| `7015fb8d1442` | `roleRouting.ts` |
| `a773e393788b` | `StudentDashboard.tsx` |
| `7b4450d792dc` | `CurriculumCenter.tsx` |
| `54fbe9c17a42` | `apiService.ts` |
| `72381d844541` | `AssessmentCenter.tsx` |

- **Excluded:** untracked `backend/src/scripts/p12*.ts`, tests, harness and docs. The compiled backend has no p12 scripts.
- **Unchanged:** the backend runtime is identical to the previous deployment. Environment unchanged (23 vars).
- **Builds:** the clean source passed the frontend `tsc`, vite build and backend build before upload.
- **Bundle:** `index-FDEaNrVy.js` replaced `index-kmzPnrOb.js`; the new bundle contains publish-to-class.
- **Not done:** no commit, no push.

### 14.3 Health and readiness

| Check | Result |
|---|---|
| `/health` (deployment URL, before promote) | 200 `ok` |
| `/ready` (deployment URL, before promote) | `ready` (mongo ok, postgres ok) |
| After promote: `/health` | 200 |
| After promote: `/ready` | `not_ready` (mongo `unavailable`) on the first 2 calls, then `ready` from the 3rd call onward (cold-start connection). Noted, not blocking |
| Guards | `ENARA_STAGING=true`; cap `4.50`; spend id unchanged; `AI_PAUSED=false`; key present (value not shown) |

### 14.4 Teacher UI on staging (Playwright, real browser): **19/19**

The teacher run made no AI calls.
- **D1:** lands on the Teaching dashboard.
- **U1:** header reads "Teaching"; Governance, AI Credits, School Insights, Live Avatar Control and Students are hidden; the authorized class "P16 Fractions (synthetic test)" is shown; no refused (401/403) calls on landing, Curriculum or Assessment Center; no error toasts; Batches and Course Instances tabs hidden.
- **Step 5:** test lesson **"P17 Fractions lesson (synthetic test)"** (chapter "Subtracting fractions") created **through the UI form** → `CUR-YBJCEF-9569`.
- **Step 6 (D3):** "Publish to class" dialog lists only the teacher's 2 classes; published to the P16 class. The server confirms the class now carries `CUR-YBJCEF-9569`.
- **Reload:** session kept; no page errors.
- **Step 7:** the P16 assessment `ASM575250` (MCQ + rubric open response) assigned to the class through the teacher API (the same endpoint the UI uses) → `asg-e00dae16-b18c-470e-bb59-784928693a34`, due 2026-11-01.

### 14.5 Student UI on staging

| Step | Result |
|---|---|
| 8 Login | PASS |
| 9 Dashboard (D2) | PASS. Shows the P17 lesson. "Open assignment" (rendered only for Due soon assignment items) was present and opened the Assignments page. After submission: "Nothing due right now". *The first scripted text check failed because it read the page before data loaded; the re-check after load passed* |
| 10–11 Lesson | PASS. Content "3/4 - 1/4 = 2/4 = 1/2" renders; course `p16-course` carries only the P17 lesson |
| 13 Assessment | PASS. Exactly one "Not started" item; no answer keys on the attempt page; MCQ "3/4" + an open answer submitted (`att-1793366622124-x2oe`) |
| Reload / no refused calls / no page errors | PASS |

### 14.6 Real AI tutor: **PASS**

One message ("Why is 3/4 - 1/4 equal to 1/2?"), reply in **11.2 s**. It was a Socratic, lesson-grounded answer:

> "Imagine a pizza cut into 4 equal slices… the slices stay the same size (quarters), so the denominator doesn't change… Your turn: If you have 3 slices and eat 1, how many quarter-slices are left?"

The exchange is persisted in the session history.

### 14.7 Real autonomous grading: **PASS** (after an automatic, guarded retry)

| Time (UTC) | Event |
|---|---|
| 13:23:44 | Submit (200) |
| 13:23:50 | Run 1: **2 real grading calls** (ok, 4.0 s / 4.2 s) |
| 13:23:51 | **`grading_failed`, reason `feedback_leak`, runs 1.** The deterministic check found an 8-word run of the hidden model answer in the AI feedback. Nothing was released; a retry was scheduled (60 s backoff) |
| 13:26:54 | A view of the attempt (my read-only result check) triggered the system's own retry |
| 13:27:00 | Run 2: **2 real grading calls** (ok) |
| 13:27:01 | `grading_released`, score 100, `aiAnswers: 1` |

**Step 18 was demonstrated live:** a failed grading run did **not** produce a grade. The student saw "being marked", not a fake score.

No manual retry of a paid call was made; the second run was the product's built-in retry.

**Step 15:** the rubric context was correct (criterion level scoring: q2 2/2; MCQ rule-graded 1/1).

### 14.8 Grade and feedback persistence: **PASS**

The result endpoint, the student UI and the teacher queue all agree:
- released, **3/3 (100%)**, `gradedByAi: 1`, no exception, `releasedAt` 13:26:55Z;
- the student UI shows per-question marks and the feedback ("Why this score: Full marks… What went well… To work on…");
- the released text does not contain the model answer.

### 14.9 Analytics: **PASS**

- Teacher grading view (UI) shows the P16 student and the released grade.
- The roster lists the student.
- The learner profile includes the P17 assignment with score 100, which **matches the persisted attempt**.
- The overview loads.
- The queue lists all 3 P16/P17 attempts with the correct statuses: `needs_review` (P16 10a), and `released` 100 twice.

### 14.10 Usage ledger and spending

| | Before P17 | After P17 | Δ |
|---|---|---|---|
| Operations | 4 | **9** | +5 (1 `tutor_chat`, 4 `ai_grading`) |
| Failed / refused / unpriced / usage-unknown | 0 | 0 | 0 |
| Tokens in / out | 2,591 / 1,029 | 6,377 / 2,883 | +3,786 / +1,854 |
| Estimated cost (catalogue $4 / $20 per million tokens) | $0.030944 | **$0.083168** | **+$0.052224** |

The ledger matches the runtime logs: 4 `ai_call` `ai_grading` lines (costUsd 0.011076, 0.011236, 0.010536, 0.011396 = $0.044244) and 1 tutor call ($0.00798).

The cap is $4.50; headroom is about $4.42. Accounting is consistent, so there is no stop.

The Atlas counter and the provider console remain **unverified**. The provider cap of ≤ $5 is operator-attested.

### 14.11 Authorization and reliability regression: **29/29 API checks PASS**

| Role | Refused or not found |
|---|---|
| Teacher | batches, students, usage report, flags (403) |
| Academic manager | class roster, grading queue (403) |
| Student | grading queue, roster, assessment (keys), learner profile (403); unknown attempt (404); demo-class course (404); **the unpublished old P16 lesson `ch1793311574135lv9` (404)**, while the published P17 lesson is 200 |
| Anonymous | result, courses (401) |

**Session renewal:** logout → the old token returns 401; a fresh login → 200.

Reload behaviour passed for teacher and student. The enrollment model is unchanged.

### 14.12 Failures and root causes

| # | Finding | Root cause | Impact | Action |
|---|---|---|---|---|
| F1 | First grading run rejected (`feedback_leak`) | Production leak check (v1) rejects AI feedback containing 8 consecutive words of the hidden model answer. The student's answer did not contain such a run, so the model's feedback paraphrased the model answer closely. The guard behaved as designed | 2 extra grading calls (~$0.022); about a 1–3 min delay | None required. Owner may review the leak-check strictness (v2 exists, not enabled in production) |
| F2 | Retry took 3 min 10 s | Retries fire on views (`kickGrading` on the assignment and result views, and the teacher queue) after the 60 s backoff; staging has only a daily sweep. The UI result page polls every 4 s, so a student staying on it would see the result after ~70 s. My script navigated away | Delay only, while no one views the attempt | Owner decision: add a frequent cron (Hobby limits apply) |
| F3 | Spend above estimate ($0.052 vs ~$0.03) | F1 | Within cap | — |
| T1 | 4 scripted UI checks failed on the first run | Test script timing (dashboard read before data loaded; my 20 s reloads left the result page) | None (re-verified) | Script fixed for re-checks |
| R1 | `/ready` `not_ready` ×2 after promote | Cold-start Mongo connect | Transient | — |

**No product defect was found in the deployed fixes.**

### 14.13 Remaining risks

1. Anthropic key not rotated (owner decision; accepted).
2. Stop A waived, not passed.
3. Keyless instant rollback is no longer available: the rollback target `dpl_8tccc…` is keyed. `AI_PAUSED` does not stop grading.
4. F2: grading retry depends on traffic on staging.
5. Batch-based enrollment over-sharing (section 8).
6. The Atlas counter and provider console are unverified.
7. Cross-tenant leakage was not probed on staging with second-tenant fixtures (local coverage only).

### 14.14 Decision

**PASS:** the updated deployment completed the real end-to-end learning journey, with findings F1–F3 recorded.

### 14.15 P17 records created (kept, all synthetic)

| Record | Id |
|---|---|
| Curriculum and lesson | `CUR-YBJCEF-9569` ("P17 Fractions lesson (synthetic test)", chapter "Subtracting fractions"); now the P16 class's curriculum, replacing `CUR-X8MU9A-4135`, which still exists |
| Assignment | `asg-e00dae16-b18c-470e-bb59-784928693a34` |
| Attempt | `att-1793366622124-x2oe` (released) |
| Tutor session | `tut-1793366602731-e85nb5` |
| Usage-ledger rows | +5 |

Nothing was deleted.

## 15. Evidence and artefacts

**Tests:**
- `backend/test/p15LearningJourney.test.ts` (new P17-K, P17-L; the mock can omit usage);
- `backend/test/p15StaffRouting.test.ts`;
- `backend/test/ui/journeyServer.ts` (second teacher class `ui-cls2` on its own batch);
- `backend/test/ui/p15UiJourney.cjs` (42 checks).

**Phase F scripts and screenshots** (scratchpad `p17/`): `f_teacher.cjs`, `f_prep.py`, `f_student.cjs`, `f_after.cjs`, `f_result.cjs`, `f_api.py`, `DEPLOY_MANIFEST.md`, `shots/f01–f08`.

**Local logs and screenshots** (scratchpad, not in the repo):
- `p17-vitest2.log` (1031/1031);
- `p17-ui.log` (42/42);
- `p17-shots/` (including `ui_06_teacher_publish.png`).

**Read-only live checks:** `scratchpad/p17/d_usage.py` (usage report and health).
