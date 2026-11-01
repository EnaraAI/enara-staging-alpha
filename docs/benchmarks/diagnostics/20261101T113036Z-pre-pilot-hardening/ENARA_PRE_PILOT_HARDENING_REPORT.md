# ENARA — Pre-Pilot Hardening Report

| | |
|---|---|
| Date | 2026-11-01 (UTC) |
| Specification | `ENARA_PrePilot_Comprehensive_Hardening_Master_Prompt.md` (owner master task; supersedes P22–P26 prompts) |
| Repository | `enara-staging-alpha`, branch `claude/codebase-review-kbxqan`, HEAD `f5dd116` (unchanged) |
| Working tree | 44 tracked files modified, 16 new files (see `PROVENANCE_SNAPSHOT.json`). **Nothing was committed, pushed, deployed, migrated or changed remotely.** |
| Baseline | `docs/benchmarks/diagnostics/20261101T080442Z-platform-readiness-audit/` (readiness audit, same day) |
| Deployed state | **UNKNOWN.** No remote service was contacted. |

## 1. Executive summary

Every P0 code finding from the 2026-11-01 audit now has a repository-local fix and a regression test.

| Area | Fix |
|---|---|
| Security sweep | The role-matrix security test (`p7RoleMatrix`) passes again. |
| API docs | Closed unless a password is set, in every environment. |
| Originals | Never downloadable unless scanned clean, by any role and through any route. |
| Signed links | Bound to the owning school and limited to 15 minutes. They are redacted from every log line. |
| Cross-school files | Another school's file can no longer be attached, signed or deleted through a curriculum, a video completion or a delete-by-path request. |
| Analytics assistant | Sends school-level aggregates only, never student rows. It refuses Academic Managers and ENARA Admins. |
| Test-spend cap | Enforced on one environment-wide counter that a new `AI_TEST_SPEND_ID` cannot reset. |
| Unpriced services | Speaking-exam speech-to-text and Anam no longer settle as $0. Both stay unavailable until the owner sets cost ceilings. |
| Manual release | A working opt-in; autonomous release remains the default. |
| Arabic AI drafting | Refused by the API and hidden in the UI. |
| Accounts | Users can be disabled (sessions revoked). Suspended schools are blocked on every request. Invitation and password-reset pages exist. |
| Operations | Privileged actions write an append-only audit trail. Alerts are persisted, marked "delivery not configured". |
| Analytics | The dashboard and Educator Chat share one canonical score definition. |

A provider-free synthetic learning journey passes end to end through the real application. The AI-only steps (AI tutoring, AI grading of open answers) are **NOT RUN**.

Local checks:

| Check | Result |
|---|---|
| Backend type-check | pass |
| Frontend type-check | pass |
| Frontend production build | pass |
| `git diff --check` | clean |
| Provider-free backend suite | **42 files, 448 tests, all passed** (final run 2026-11-01 11:28 UTC) |
| Provider-mocked test files (48) | **NOT RUN**, by policy |

**Readiness decision.** The release gate matrix is in `ENARA_RELEASE_READINESS_REPORT.md`. In short:

| Level | Decision |
|---|---|
| Internal development | GO |
| Synthetic staging | GO WITH CONDITIONS |
| Invited external teachers | NO-GO until the reviewed changes are committed, deployed and smoke-verified, and the operator steps are done |
| Real-student pilot | NO-GO |
| Broader production | NO-GO |

**The product is not pilot-ready merely because local tests pass.**

## 2. Results by workstream

### A. Roles, authentication, API docs, tenant isolation (P0) — DONE locally

- **API docs.** `backend/src/config/swagger.ts` `docsGate` returns 404 whenever `API_DOCS_PASSWORD` is unset, in every environment (staging runs as `development`). Tests: `apiDocs.test.ts`, `p22TeacherTestingFixes` (action 2).
- **Tour completion.** It is a self-only write to the caller's own user record (`POST /api/auth/tour/complete`). It changes no role, institution, permission or learning data. Disabled users are refused (401). It is listed as a reviewed known write in `p7RoleMatrix.test.ts` (`KNOWN`). Test: p22 "lets an academic manager mark only its own tour".
- **Learning-gap summary.** `educatorAnalytics` now filters `StudentObjectiveMastery` by the caller's `institutionId`; objectives were already school-filtered.
- **Suspension.** `auth.middleware.ts` `isInstitutionSuspended` (15 s per-instance cache) stops a suspended school's users on every request with 403 `INSTITUTION_SUSPENDED`. ENARA Admin gets a new route: `PUT /api/integrations/institutions/:id/status`, which is audited. Test: p22 "stops a suspended school's users…".
- **Account lifecycle.**
  - `PUT /api/workspace/users/:id/status` disables or re-enables a user and revokes their sessions (token version bump). It refuses self-disable, refuses a school admin disabling another admin (ENARA only), and returns 404 for other schools. It is audited.
  - Frontend: `pages/AccountLink.tsx` (`/accept-invitation`, `/reset-password`), a working "Forgot password?" (always the same answer), and `pages/workspace/People.tsx` (invite, copy a one-time link, revoke, disable/enable).
  - No email is sent by this task. When email is not configured, the invitation link is shown once to the inviting admin; it is never logged.
- **Academic Manager.** No model-backed analytics (assistant 403). The `p7RoleMatrix` sweep shows no Academic Manager write except the reviewed self-only ones.
- **Residual (P2).** Several per-student learning queries (`learningMastery`, `learningDiagnostics`, `pathways`, `learningContext`, `misconceptionRules`, `interventions`) filter by `studentId` only. The student is resolved inside the caller's scope first (`resolveStudentForRead`), and student IDs are generated unique, so no exploit path was found. Adding `institutionId` everywhere is registered as R-14.

### B. Documents, R2, signed links (P0) — DONE locally; R2 legacy backfill BLOCKED

New `backend/src/services/uploadAccess.ts`, rewritten `utils/uploadSigning.ts` and the download gate in `app.ts`.

- **Uploads succeed without a scanner.** Files are stored as `pending`, then `deferred` (shown as "not scanned"). Nothing is ever labelled clean without a scanner.
- **Originals are downloadable only when `clean`.** Not scanned, pending, deferred, failed, infected and removed originals are refused for every role and route. This covers `/uploads/:name` on R2 and local disk, Documents, course materials and curriculum responses.
  - Lesson videos (media checked by type and magic bytes) remain playable. This is recorded as owner decision **OD-3**.
- **Signing.** Links are signed only for a signed-in caller of the owning school (ENARA Admin: any school), and only for downloadable files. The signature binds name, expiry and owning school; expiry is at most 15 minutes. R2 presigned PUT is 15 minutes. R2 video playback stays at 60 minutes, because browsers fetch byte ranges for the whole video; this is documented in `uploadStorage.ts`.
- **School-scoped object keys for new uploads** (`<school>~<uuid>-<name>`). Ownership of legacy files comes from the document record, or from the single school that lists them.
  - Curriculum create/update keeps only the school's own `/uploads/` paths.
  - Video completion requires the school's own stored name.
  - Delete-by-path removes storage only when the file was in that lesson and belongs to the school.
- **Logging.** `utils/logging.ts` `redactSignedLinks` removes `sig`, `exp`, `token` and presigned-credential values from every log message and string field. Request and error logs use `logPath`.
- **Raw files never reach a provider unless clean.** This is unchanged (`filterClearedFileUrls`). Extracted text of attested documents remains in the approved AI text path.
- **BLOCKED.** Re-keying legacy R2 objects into school prefixes needs an operator backfill (`ENARA_DOCUMENT_ACCESS_REPORT.md` §6). Not run.

Tests: p22 "action 3 / workstream B" (7 tests).

### C. Analytics privacy and model minimisation (P0) — DONE

- `services/dataAssistant.ts` `assistantData` sends only totals, course/subject aggregates, weakest topics and student **counts**. There are no names, IDs, scores, risk flags or answers. Names typed in a question become `[student]` before the call.
- The assistant route allows teachers and school admins only. Teachers lack `insights:read_school`, so in practice it is school admins only. The frontend no longer mounts the assistant for ENARA Admins or non-admin staff.
- The Educator Chat analytics paths were already compliant (deterministic; names resolved locally; router sees redacted text only): CODE-VERIFIED. `educator_analytics_ai_router_enabled` stays default-off; its last measured accuracy was 81.3% against an 85% target.
- Tests: p22 "action 7 / workstream C" (2). Named-student and router suites (`p10NamedStudents`, `p9AnalyticsRouter`, `educatorAnalytics`) mock the SDK: **NOT RUN**.

### D. AI cost, reservations, service controls (P0) — DONE locally; prices BLOCKED

- **Test-spend cap.** It is enforced on `test_spend:__environment__`, seeded from all earlier spend-ID counters, and a new ID does not reset it. A window reset only via `src/scripts/resetTestSpendWindow.ts`, which requires owner approval and a reconciliation reference and is audited. It was not run.
- **Grading** stays under this cap. When the cap is exhausted there is no reservation, no provider call and no grade, and the attempt goes to a retryable failure and then `grading_exception`. Ceiling: `STAGING_MAX_TEST_SPEND_USD = 50` (unchanged).
- **Unpriced usage is never $0.** `priceUsage` returns `unpriced` for ElevenLabs usage without characters, so the reservation is kept whole. `elevenlabs:speaking_exam_stt` is added to `UNKNOWN_PRICED_TOOLS`.
- **Speaking exams** need `SPEAKING_EXAM_STT_MAX_USD_PER_REPLY` and `SPEAKING_EXAM_MAX_REPLY_SECONDS`. Without both they stay unavailable (503 `VOICE_NOT_PRICED`). `speaking_exams_enabled` remains default-off.
- **Anam** needs `ANAM_SESSION_RESERVE_USD` and `ANAM_MAX_SESSION_SECONDS`. Without both, live calls do not start (503 `AVATAR_NOT_PRICED`).
  - The server ends a call past its maximum length (410) and meters it.
  - All of a call's reservations (start, language switches, test-spend copies) settle together.
- **Values for these four settings are owner decisions: BLOCKED.** No price was guessed.
- **Persisted alerts** cover budget thresholds, cap reached, unknown-cost reservations, the grading emergency, grading exceptions, 5xx responses and cron job failures.
- **Approved synthetic-school limits are not active remotely.** The runbook gives the exact operator steps.
- Tests: p22 "action 4" (2) and "workstream D" (3); existing `p20Accounting`, `p6StagingGuard`, `p14_2StagingEntry`, `p14_3StagingStartup`, `usageLedger` and `priceCatalog` pass. The mocked budget suites (`p0dBudget`, `p0bGateway`, `p14_3TestSpendEnforcement`, `p14_2GradingTestSpend`) are **NOT RUN**.

### E. Analytics correctness (P1) — DONE

New `services/scoreMetrics.ts` holds the canonical definitions. The rules:
- final grades only;
- the latest per student and piece of work;
- assignment work by due date (published/closed, not future);
- self-paced work by submission;
- a 90-day default window;
- missing work never counted as zero.

`analyticsService` (dashboard, course analytics, assistant aggregates) and `educatorAnalytics` both use it. Definitions and the score window are returned in `overview.definitions`.

Tests:
- p22 "workstream E" (unit);
- the journey test step 11 (chart and table totals equal);
- existing `elie.*`, `p21*` and `teacherAttendance` suites pass.

Withdrawn/inactive status is still absent from the data model, and is not inferred: **R-12**.

### F. Assessment scope and result release (P1) — DONE

- **Arabic AI drafting** is refused server-side (400 `LANGUAGE_NOT_SUPPORTED`) on draft and regenerate, and hidden in `AssessmentBuilder`. Teacher-written Arabic assessments, the Arabic tutor, chat, lesson plans and grading are unchanged.
- **Manual release** is an opt-in setting:
  - with `releasePolicy: 'manual'`, AI grading finalizes but does not release, and a teacher releases via the existing endpoints;
  - the default stays `auto`;
  - the setting is in the assignment form and its changes are audited.
- Grading validation, the leak guard, appeals and corrections are unchanged. No mandatory human step was added.
- **Sonnet 5.5 for assessment drafting** is recorded as a staging recommendation only. One setting (`ANTHROPIC_TUTOR_MODEL`) drives drafts, grading and the tutor, so changing it is an owner/operator decision (OD-6).

### G. Operations, audit, cron, readiness (P1) — DONE locally; delivery BLOCKED

- **Audit trail.** `models/AuditEvent.ts` is append-only (update/delete hooks throw). `services/auditTrail.ts` `recordAudit` covers:
  - permission changes and user status;
  - institution status;
  - AI budget, pause and commercial plan changes;
  - feature flags and learning settings;
  - document delete and retry;
  - assignment creation and release-policy changes.
- **Alerts.** `models/AlertEvent.ts` stores alerts with `delivery: 'not_configured'` (deduplicated per 10 minutes). **No human is notified**: there is no alert sink (BLOCKED).
- **Cron.** Each job runs in isolation with an alert on failure. The secret check is constant-time. Staging deliberately has no Vercel cron (`p6VercelStaging` asserts it); the schedule is an operator decision in the runbook.
- **`/ready`** reports Mongo, Postgres (`not_configured`/`ok`/`unavailable`), R2/Anthropic/ElevenLabs/Anam configuration presence and the test-spend cap. It does not connect to R2 or providers. Required checks depend on the runtime (production: Postgres; staging/Vercel: R2; staging with AI: cap).
- **Staging guard** is unchanged and still reached from `api/index.js` → `backend/dist/vercel.js`. Its tests pass.

### H. Accessibility, responsive, performance (P1/P2) — NOT RUN (documented)

No axe or equivalent tool is installed, so the automated audit was **NOT RUN**. Manual steps are in `ENARA_PILOT_OPERATIONS_RUNBOOK.md` §9.

The new pages use labelled fields, roles and table captions. The production bundle is a single 2,680.98 kB chunk (700.90 kB gzip). No code splitting was attempted (plan in the runbook §10). No load test was run.

### I. Learning journey (P1) — PASS (provider-free), PARTIAL overall

`backend/test/p22LearningJourney.test.ts` passes 7/7 through the real app on a synthetic school. Matrix in `ENARA_RELEASE_READINESS_REPORT.md` §3.

Measured progress, from attempt records: 0% → 100% on two answer-key questions. This replaces the earlier illustrative P12 figure.

### J. Pilot operations and privacy governance (P1/P2) — templates written; decisions BLOCKED

See `ENARA_PILOT_OPERATIONS_RUNBOOK.md` and `ENARA_SECURITY_AND_DATA_FLOW_MATRIX.md`. No pilot institution is confirmed. No DPA or compliance claim is made.

### K. Documentation reconciliation — DONE

All documents in this folder. `ENARA_INCONSISTENCY_REGISTER.md` lists superseded claims.

## 3. Files changed

**Modified (44):**
- **Backend source:** `app.ts`, `config/env.ts`, `config/swagger.ts`
- **Backend controllers:** `analytics`, `assessment`, `assignments`, `avatar`, `curriculum`, `grading`, `learningFlags`
- **Backend middleware:** `auth.middleware`, `errorHandler`, `requestContext`
- **Backend routes:** `aiControls`, `cron`, `documents`, `integrations`, `workspace`
- **Backend services:** `aiBudget`, `aiGateway`, `analyticsService`, `autoGrading`, `avatarUsage`, `dataAssistant`, `documentSafety`, `documents`, `educatorAnalytics`, `priceCatalog`, `speakingExam`, `studentCourseService`, `uploadStorage`
- **Backend utils:** `logging`, `uploadSigning`
- **Backend tests:** `apiDocs`, `p7RoleMatrix` (KNOWN tour write), `phase3.sprint1` (manual → auto in the release test; the old expectation encoded the defect)
- **Frontend:** `App.tsx`, `components/Layout.tsx`, `pages/Login.tsx`, `pages/teaching/AssessmentBuilder.tsx`, `pages/teaching/ClassAssignments.tsx`, `pages/workspace/Documents.tsx`, `services/apiService.ts`, `services/roleRouting.ts`

**Added:**
- **Backend:** `models/AuditEvent.ts`, `models/AlertEvent.ts`, `services/auditTrail.ts`, `services/uploadAccess.ts`, `services/scoreMetrics.ts`, `services/downloadNotice.ts`, `scripts/resetTestSpendWindow.ts`, `test/p22TeacherTestingFixes.test.ts`, `test/p22LearningJourney.test.ts`
- **Frontend:** `pages/AccountLink.tsx`, `pages/workspace/People.tsx`
- **Reports:** this folder; the earlier same-day audit folder is preserved unchanged.

**Deleted:** none.

## 4. Owner decisions applied and outstanding

**Applied:**
- §3.1 student identities: names visible to authorized staff; nothing student-level to a model.
- §3.2 no-scanner policy: originals never downloadable unless clean.
- §3.3 autonomous grading default, manual release opt-in, Arabic AI drafting out of scope.
- §3.4 roles.
- §3.5 cap at $50, monotonic, grading under the cap, unpriced fail-closed.
- §3.6 canonical metrics.

**Outstanding:** see `ENARA_RELEASE_READINESS_REPORT.md` §6.

## 5. Next steps (prioritised)

1. Owner review of this diff, then commit and push the reviewed revision (outside this task).
2. Deploy that revision to staging with `git archive`, smoke-check, then promote (runbook §4). Re-run the role, isolation and download probes on the deployed URL.
3. Set `API_DOCS_PASSWORD` on staging and record the live deployment, domain, flags, cap and spend ID read-back.
4. Decide and set the four unpriced-service ceilings, or keep the voice and avatar features off.
5. Enable the approved synthetic-school budgets (runbook §5), and set a provider-side spend limit of $50 or less.
6. Configure an alert sink and a daily scheduler, and plan the backup/restore test.
7. Run the budgeted live plan (readiness report §4) after approval.
8. Before any real-student pilot: a privacy review, an accessibility audit, and the R2 legacy backfill.
