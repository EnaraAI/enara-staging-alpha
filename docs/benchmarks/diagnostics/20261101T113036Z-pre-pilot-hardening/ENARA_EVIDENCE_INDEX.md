# ENARA — Evidence Index (pre-pilot hardening, 2026-11-01)

## Repository state

- Repo `enara-staging-alpha`, branch `claude/codebase-review-kbxqan`, HEAD `f5dd11602def27e76d550b6967f89d50ac2b6e2e`.
- Cached `origin/staging-alpha` = `574010a`; 13 local commits ahead. Not fetched.
- Changes are uncommitted. SHA-256 per file: `PROVENANCE_SNAPSHOT.json`.
- Deployed state: UNKNOWN.

## Reports

| Report | Path |
|---|---|
| This task | `docs/benchmarks/diagnostics/20261101T113036Z-pre-pilot-hardening/` |
| Readiness audit (baseline, unchanged) | `docs/benchmarks/diagnostics/20261101T080442Z-platform-readiness-audit/` |
| Historical P7–P21 | `docs/benchmarks/diagnostics/2026102*`, `docs/staging/`, `docs/teaching/` (unchanged) |

## Claim → evidence

| Claim | Class | Code | Test (run here) |
|---|---|---|---|
| Docs closed without a password | CODE + TEST | `config/swagger.ts` `docsGate` | `apiDocs.test.ts`; p22 action 2 |
| Role matrix holds | TEST | routes | `p7RoleMatrix.test.ts` |
| Suspension blocks sessions | CODE + TEST | `middleware/auth.middleware.ts` `isInstitutionSuspended`; `routes/integrations.routes.ts` | p22 workstream A |
| Disable revokes sessions | CODE + TEST | `routes/workspace.routes.ts` `PUT /users/:id/status` | p22 action 6 |
| Invitation and reset pages | CODE (type-checked, built) | `frontend/pages/AccountLink.tsx`, `Login.tsx` | none (UI not browser-tested) |
| Originals clean-only | CODE + TEST | `services/uploadAccess.ts` `eligibilityOf`; `app.ts` `requireDownloadableUpload` | p22 workstream B |
| Owner-bound, ≤15 min links | CODE + TEST | `utils/uploadSigning.ts` | p22 workstream B |
| Foreign paths refused | CODE + TEST | `controllers/curriculum.controller.ts`; `uploadAccess.ownUploadsOnly` | p22 workstream B |
| Signed links redacted from logs | CODE + TEST | `utils/logging.ts` `redactSignedLinks`; `requestContext.logPath` | p22 workstream B |
| Assistant sends aggregates only | CODE + TEST | `services/dataAssistant.ts` `assistantData`, `nameRedactor` | p22 action 7 |
| Academic Manager / ENARA Admin / student refused by the assistant | CODE + TEST | `controllers/analytics.controller.ts` `askAssistant` | p22 action 7 |
| Monotonic environment cap | CODE + TEST | `services/aiBudget.ts` `TEST_SPEND_ENVIRONMENT_COUNTER`, `ensureEnvironmentCounter` | p22 workstream D |
| Grading bound by cap | CODE + TEST | `reserveTestSpend` | p22 workstream D |
| Unpriced never $0 | CODE + TEST | `services/priceCatalog.ts` `priceUsage` | p22 action 4 |
| Unpriced services fail closed | CODE | `config/env.ts` `unpricedLimits`; `speakingExam.voiceConfigured`, `transcribeReply`; `avatar.controller` `requireAnam`, `findOwnSession` | indirect |
| Avatar reservations settled together | CODE + TEST | `aiBudget.settleReservationsUnder`; `avatarUsage` | p22 action 4 |
| One score definition | CODE + TEST | `services/scoreMetrics.ts`; `analyticsService.loadScope`; `educatorAnalytics.loadPairs` | p22 workstream E; journey step 11 |
| Manual release opt-in | CODE + TEST | `services/autoGrading.ts` `processAttempt`; `grading.controller.finalizeSubmission`; `ClassAssignments.tsx` | p22 action 5 |
| Arabic AI drafting refused | CODE + TEST | `controllers/assessment.controller.ts` `ARABIC_DRAFTS_OFF`; `AssessmentBuilder.tsx` | p22 action 8 |
| Append-only audit | CODE + TEST | `models/AuditEvent.ts`; `services/auditTrail.ts` | p22 workstream A |
| Persisted alerts | CODE | `models/AlertEvent.ts`; hooks in `aiBudget`, `autoGrading`, `errorHandler`, `cron.routes` | indirect |
| Cron jobs isolated | CODE | `routes/cron.routes.ts` | none |
| `/ready` expanded | CODE | `app.ts` | existing readiness tests |
| Learning journey, provider-free | TEST | — | `p22LearningJourney.test.ts` (7) |
| AI grading and tutor live | LIVE-PROVIDER-VERIFIED (historic builds only) | — | P16–P21 reports; **not re-verified** on the P22 code |

## Commands

See `TEST_SUMMARY.md`.
