# TEST_SUMMARY — Pre-Pilot Hardening (2026-11-01)

All checks below were run locally in this task. They used isolated in-memory MongoDB (`mongodb-memory-server`), synthetic data, and no AI or provider keys (`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ANAM_API_KEY`, `DATABASE_URL` and `MONGODB_URI` unset). No network provider was called.

## Commands and results

| Check | Command (cwd) | Result |
|---|---|---|
| Backend type-check | `npx tsc --noEmit` (backend) | exit 0 |
| Frontend type-check | `npx tsc --noEmit` (frontend) | exit 0 |
| Frontend production build | `VITE_API_URL=/api npx vite build --outDir <scratch>` (frontend) | exit 0; main chunk 2,680.98 kB (700.90 kB gzip); warning: chunk > 500 kB |
| Whitespace | `git diff --check` | clean |
| Secret / signed-URL scan of changed files | `grep` for key, URI, private key, JWT, `X-Amz-Signature`, long `sig=` patterns | no matches |
| Lint | not configured in this repository | NOT RUN |
| Worker type-check | no worker in this repository | N/A |
| **Backend provider-free suite (final)** | `env -u … npx vitest run <42 files>` (backend), started 2026-11-01 11:28:29 UTC | **42 files passed; 448 tests passed, 0 failed, 0 skipped; 80.9 s** |

### Earlier runs in this task, shown for honesty (not merged with the final)

| Run | Result | Notes |
|---|---|---|
| Run 1 | 3 files failed (`p0cReviewFixes` avatar heartbeat, `p6VercelStaging` "no crons", `phase3.sprint1` manual release) | All fixed: heartbeat config tolerance; cron entry reverted; test expectation changed because it encoded the defect |
| Run 2 | 1 failure (`p6StagingGuard`: "Port already in use") | In-memory Mongo port collision before the test body; the file re-ran once, 14/14 |
| Final | clean | |

## Files run (42), with test counts
- `test/adultLearners.test.ts` (2)
- `test/apiDocs.test.ts` (4)
- `test/candidateV2/evalV2CriterionLaila.test.ts` (26)
- `test/candidateV2/lailaR1.test.ts` (14)
- `test/elie.sprint2.test.ts` (14)
- `test/elie.sprint3.test.ts` (13)
- `test/elie.sprint5.test.ts` (8)
- `test/elie.sprint6.test.ts` (11)
- `test/elie.sprint7.test.ts` (8)
- `test/engineContract.test.ts` (3)
- `test/gradingEvalAdapter.test.ts` (5)
- `test/gradingPolicy.test.ts` (8)
- `test/p0aReviewFixes.test.ts` (11)
- `test/p0cReviewFixes.test.ts` (14)
- `test/p14_2StagingEntry.test.ts` (9)
- `test/p14_3StagingStartup.test.ts` (13)
- `test/p15StaffRouting.test.ts` (3)
- `test/p19_1LeakGuard.test.ts` (8)
- `test/p1Seed.test.ts` (5)
- `test/p20Accounting.test.ts` (9)
- `test/p20DbAvailability.test.ts` (10)
- `test/p20RateLimit.test.ts` (4)
- `test/p21Effectiveness.test.ts` (16)
- `test/p21ExamEvidence.test.ts` (8)
- `test/p21Orchestrator.test.ts` (33)
- `test/p21Registry.test.ts` (12)
- `test/p21TeachingImpact.test.ts` (15)
- `test/p22LearningJourney.test.ts` (7)
- `test/p22TeacherTestingFixes.test.ts` (24)
- `test/p6SingleService.test.ts` (9)
- `test/p6StagingGuard.test.ts` (14)
- `test/p6Validation.test.ts` (4)
- `test/p6VercelStaging.test.ts` (9)
- `test/p7RoleMatrix.test.ts` (4)
- `test/p8SmallScopeRetrieval.test.ts` (45)
- `test/phase3.sprint1.test.ts` (12)
- `test/phase3.sprint3.test.ts` (4)
- `test/priceCatalog.test.ts` (6)
- `test/productTour.test.ts` (3)
- `test/teacherAttendance.test.ts` (11)
- `test/teachingFeatures.test.ts` (4)
- `test/usageLedger.test.ts` (6)

New in this task:
- `test/p22TeacherTestingFixes.test.ts` (24)
- `test/p22LearningJourney.test.ts` (7)

Modified expectations:
- `apiDocs.test.ts`: docs closed without a password in development too.
- `p7RoleMatrix.test.ts`: tour completion added to the reviewed KNOWN self-only writes.
- `phase3.sprint1.test.ts`: the release test uses `auto`; `manual` is now honoured and tested in p22.

## NOT RUN

### Provider-mock policy (48 files)

These mock `@anthropic-ai/sdk`, ElevenLabs, the orchestrator, the tutor model or hybrid graders.
- `test/adminReports.test.ts`
- `test/analytics.test.ts`
- `test/avatar.test.ts`
- `test/benchmarkBudget.test.ts`
- `test/candidateV2/contract.test.ts`
- `test/candidateV2/designPhase.test.ts`
- `test/candidateV2/nativeGrader.test.ts`
- `test/candidateV2/runner.test.ts`
- `test/candidateV2/v1GraderCompat.test.ts`
- `test/conversationExam.test.ts`
- `test/directTutorModel.test.ts`
- `test/educatorAnalytics.test.ts`
- `test/elie.e2e.test.ts`
- `test/elie.sprint1.test.ts`
- `test/elie.sprint4.test.ts`
- `test/hybridV1.frozen.test.ts`
- `test/hybridV1.shadow.test.ts`
- `test/integrations.test.ts`
- `test/p0bGateway.test.ts`
- `test/p0cMetering.test.ts`
- `test/p0dBudget.test.ts`
- `test/p0dHardening.test.ts`
- `test/p10NamedStudents.test.ts`
- `test/p14_2GradingTestSpend.test.ts`
- `test/p14_3TestSpendEnforcement.test.ts`
- `test/p14_8BlockerFixes.test.ts`
- `test/p14_9TenantIsolation.test.ts`
- `test/p15LearningJourney.test.ts`
- `test/p19Resilience.test.ts`
- `test/p19TenantIsolation.test.ts`
- `test/p1Access.test.ts`
- `test/p1FinalGaps.test.ts`
- `test/p1ReviewFixes.test.ts`
- `test/p2Documents.test.ts`
- `test/p2NoScannerPolicy.test.ts`
- `test/p3EducatorChat.test.ts`
- `test/p4SpeakingExam.test.ts`
- `test/p4Workflow.test.ts`
- `test/p5Usage.test.ts`
- `test/p9AnalyticsRouter.test.ts`
- `test/phase0.test.ts`
- `test/phase1.test.ts`
- `test/phase3.autograding.test.ts`
- `test/phase3.e2e.test.ts`
- `test/phase3.sprint4.test.ts`
- `test/phase3.sprint5.test.ts`
- `test/security.test.ts`
- `test/tutorFallback.test.ts`

### External-stub / spawn policy (5 files)
- `test/p12HardCap.test.ts`
- `test/p20QueryBudget.test.ts`
- `test/p20TutorStream.test.ts`
- `test/p6FrontendStaging.test.ts`
- `test/proactive.test.ts`

These stub `fetch`, use a fake upstream, or spawn a server against an external-looking host.

### Browser and UI suites

`backend/test/ui/*` need a running server and browser; NOT RUN.

The new pages (`AccountLink`, `People`, Documents changes, assignment release option) are type-checked and built but **not browser-tested**. No screenshots were captured.

### Accessibility, load and live provider

- No axe or equivalent is installed: accessibility audit NOT RUN.
- Load test: NOT RUN.
- Live provider calls: NOT RUN (no approval in this task).
