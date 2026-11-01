# ENARA — Remediation Register

- Source of findings: readiness audit `20261101T080442Z-platform-readiness-audit` plus this task.
- Status values:
  - **FIXED-LOCAL**: fixed in the uncommitted working tree and covered by a test run here.
  - **PARTIAL**
  - **BLOCKED — OWNER/OPERATOR ACTION REQUIRED**
  - **OPEN**
  - **ACCEPTED** (owner decision)
- No fix is deployed.

| ID | Finding | Sev | Root cause | Files | Fix | Tests | Status |
|---|---|---|---|---|---|---|---|
| R-01 | API docs open when `API_DOCS_PASSWORD` unset outside production | P0 | Permissive non-production fallback | `config/swagger.ts` | 404 whenever unset | `apiDocs.test.ts`, p22 action 2, `p7RoleMatrix` | FIXED-LOCAL; operator must set the password on staging |
| R-02 | p7 sweep flagged Academic Manager tour write | P0 | Self-preference write not classified | `test/p7RoleMatrix.test.ts` | Reviewed KNOWN self-only write; no data writes | p22 "tour" test, `p7RoleMatrix` | FIXED-LOCAL |
| R-03 | Unscanned, pending or failed originals downloadable via generic link signing | P0 | All `/uploads/` strings signed in any response | `utils/uploadSigning.ts`, `services/uploadAccess.ts`, `app.ts`, `routes/documents.routes.ts`, `services/studentCourseService.ts`, `frontend/pages/workspace/Documents.tsx` | Download gate: clean only; sign only own-school downloadable files | p22 workstream B | FIXED-LOCAL |
| R-04 | Foreign upload paths could be attached, signed or deleted via curriculum, video complete or delete-by-path | P0 (found in this task) | Client-supplied paths trusted | `controllers/curriculum.controller.ts`, `services/uploadAccess.ts` | Owner checks, school-prefixed names | p22 "never attaches, signs or deletes…" | FIXED-LOCAL |
| R-05 | No per-school R2 prefix | P0 | Flat keys | `services/uploadAccess.ts`, `documents.ts`, curriculum controller | New uploads `<school>~uuid-name`; legacy owner resolution | p22 | PARTIAL: legacy backfill BLOCKED (operator) |
| R-06 | Signed links valid 6 h; logged in request logs | P0 | TTL rounding; raw `originalUrl` logged | `uploadSigning.ts`, `logging.ts`, `requestContext.ts`, `errorHandler.ts`, `uploadStorage.ts` | ≤15 min, owner-bound; redaction everywhere; R2 PUT 15 min; video playback 60 min (documented) | p22 TTL and log tests | FIXED-LOCAL |
| R-07 | Analytics assistant sent up to 300 named students with scores and risk flags; available to Academic Managers | P0 | Student rows in prompt; permission-only gate | `services/dataAssistant.ts`, `controllers/analytics.controller.ts`, `frontend/App.tsx` | Aggregates only; names redacted from questions; teacher/admin only | p22 action 7 | FIXED-LOCAL |
| R-08 | New `AI_TEST_SPEND_ID` reset cumulative spend | P0 | Counter keyed by ID | `services/aiBudget.ts`, `scripts/resetTestSpendWindow.ts` | Environment counter, seeded from earlier IDs; audited operator reset | p22 workstream D | FIXED-LOCAL |
| R-09 | Speaking-exam STT settled at $0 | P0 | Pricing ignored audio units | `services/priceCatalog.ts`, `services/aiBudget.ts`, `services/speakingExam.ts`, `config/env.ts`, `services/aiGateway.ts` | Unpriced (reservation kept); approved ceilings required | p22 action 4 | FIXED-LOCAL; values BLOCKED (OD-1) |
| R-10 | Anam: no length cap; reservations not settled together | P0 | Missing limit; per-key settlement | `controllers/avatar.controller.ts`, `services/avatarUsage.ts`, `services/aiBudget.ts` | Approved reserve and max length required; server hard stop; settle all keys | p22 action 4 | FIXED-LOCAL; values BLOCKED (OD-1); provider-side stop BLOCKED |
| R-11 | Two "average score" definitions | P1 | Separate formulas | `services/scoreMetrics.ts`, `analyticsService.ts`, `educatorAnalytics.ts` | One canonical definition | p22 workstream E; journey step 11 | FIXED-LOCAL |
| R-12 | No withdrawn/inactive learner status | P1 | Data model gap | — | Not inferred from inactivity. Proposed additive field `Student.enrolmentStatus` (`active`/`withdrawn`, with date); migration not written | — | OPEN (data-model decision) |
| R-13 | Method effectiveness not fed back to method selection | P1 | Not implemented | `pedagogyPolicy.ts` | Documented; no adaptive-efficacy claim | — | OPEN |
| R-14 | Some per-student learning queries filter by `studentId` only | P2 | Student resolved in scope first | `learningMastery`, `learningDiagnostics`, `pathways`, `learningContext`, `misconceptionRules`, `interventions` | Add `institutionId` filters (planned) | — | OPEN |
| R-15 | `learning_gap_summary` mastery query not school-filtered | P0 | Missing filter | `services/educatorAnalytics.ts` | `institutionId` filter | journey + existing analytics tests | FIXED-LOCAL |
| R-16 | Suspended school not blocked for sessions | P0 | Check only for API keys | `middleware/auth.middleware.ts`, `routes/integrations.routes.ts` | Per-request check (15 s cache); ENARA route; audit | p22 workstream A | FIXED-LOCAL |
| R-17 | No user disable; no invitation, reset or user-management UI | P0 | Missing endpoint and pages | `routes/workspace.routes.ts`, `frontend/pages/AccountLink.tsx`, `People.tsx`, `Login.tsx`, `App.tsx`, `Layout.tsx`, `roleRouting.ts`, `apiService.ts` | Disable/enable with session revocation; pages | p22 action 6 (API); UI type-checked and built, not browser-tested | FIXED-LOCAL (UI not browser-verified) |
| R-18 | `releasePolicy: 'manual'` silently ignored | P1 | Not read by grading | `services/autoGrading.ts`, `controllers/grading.controller.ts`, `frontend/pages/teaching/ClassAssignments.tsx`, `test/phase3.sprint1.test.ts` | Opt-in manual hold; default auto; UI option; audit | p22 action 5 | FIXED-LOCAL |
| R-19 | Arabic AI drafting offered despite out-of-scope; F-8 | P1 | UI and API accepted `ar` | `controllers/assessment.controller.ts`, `AssessmentBuilder.tsx` | 400 `LANGUAGE_NOT_SUPPORTED`; option hidden | p22 action 8 | FIXED-LOCAL |
| R-20 | No persisted audit trail | P1 | Log lines only | `models/AuditEvent.ts`, `services/auditTrail.ts`, routes | Append-only model; hooks | p22 append-only test | FIXED-LOCAL; remote indexes not created |
| R-21 | No alert sink | P1 | — | `models/AlertEvent.ts`, `aiBudget.ts`, `autoGrading.ts`, `errorHandler.ts`, `cron.routes.ts` | Persisted, `delivery: not_configured` | indirect | PARTIAL: delivery BLOCKED |
| R-22 | Cron unscheduled; plain-string secret compare | P1 | — | `routes/cron.routes.ts` | Constant-time; isolated jobs; alerts | `p6VercelStaging` (no Vercel cron by design) | PARTIAL: schedule is OD-4 |
| R-23 | `/ready` partial | P1 | — | `app.ts` | Runtime-aware required checks; config presence | existing readiness tests | FIXED-LOCAL; R2 connectivity not checked |
| R-24 | Ingestion callback accepts legacy body-only HMAC (replay) | P2 | Legacy option | `routes/ingestion.routes.ts` | Not changed (external integration contract) | — | OPEN (needs partner confirmation) |
| R-25 | Two credit systems | P2 | Legacy | — | Documented | — | OPEN |
| R-26 | Single 2.68 MB bundle | P2 | No code splitting | — | Plan only | — | OPEN |
| R-27 | Accessibility audit not run | P1 | No tool | — | Manual steps | — | NOT RUN |
| R-28 | Deployed source not on remote; deployed state unknown | P0 | Local commits unpushed | — | — | — | BLOCKED (owner commit/push/deploy) |
| R-29 | Keys pasted in chat earlier | P1 | — | — | Rotation checklist | — | BLOCKED (OD-8) |
| R-30 | Intent router below the accuracy target | P1 | 81.3% < 85% | — | Stays off | — | ACCEPTED (off) |
