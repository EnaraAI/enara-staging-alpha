# Evidence Index — Platform Readiness Audit (2026-11-01)

- Repository: `enara-staging-alpha`, local branch `claude/codebase-review-kbxqan`, HEAD `f5dd11602def27e76d550b6967f89d50ac2b6e2e`.
- Paths below are relative to the repository root unless marked otherwise.
- No line numbers are given. Cite the symbols instead.

## 1. Git state recorded (read-only)

| Item | Value |
|---|---|
| HEAD | `f5dd116`, 2026-11-01 06:49:36 UTC |
| Working tree | clean (`git status --porcelain` returned 0 entries before and after the test run). Only this audit folder was added. |
| Local refs | `refs/heads/claude/codebase-review-kbxqan` = `f5dd116`; `refs/heads/staging-alpha` = `574010a`; `refs/remotes/origin/staging-alpha` = `574010a` (cached; not fetched) |
| Commits on the local branch not in `origin/staging-alpha` | 13 (`37e8fe8` … `f5dd116`) |
| Stashes | 0 |
| Ignored, relevant | `.vercel/` (project link, name `enara-staging-alpha`), `backend/dist/`, `frontend/dist/`. `.env*` files are excluded by `.gitignore`; none were read. |
| Remote URL | `github.com/EnaraAI/enara-staging-alpha`. P7 F-7 reports the repository as public; not verified here. |

Related checkouts on the same machine were inspected read-only; nothing in them was changed.

| Checkout | State |
|---|---|
| `/home/user/enara-sandbox` (`EnaraAI/enara-sandbox`), branch `staging-alpha` @ `544c6ec` | 6 modified files (`backend/src/app.ts`, `backend/src/config/db.ts`, `backend/src/config/env.ts`, `frontend/services/railwayApi.ts`, `scripts/benchmarks/run_grading_eval.py`, `tests/benchmarks/test_additional_datasets.py`) and 50 untracked entries (benchmark audit logs and evalv2 data under `docs/benchmarks/diagnostics/2026102[5-9]*`, `docs/plans/`, `artifacts/`, `Dockerfile.staging-single`, `railway.staging-single.toml`, `backend/src/config/stagingSingleService.ts`, `backend/test/p6SingleService.test.ts`, two stray files named `+~`). This is the pre-snapshot source of the staging repository; the P0 to P6 provenance lineage lives here. **Uncommitted. Preserve it.** |
| `/home/user/Enara-Platform` (`mohamedsaberelkholy/Enara-Platform`), `claude/codebase-review-kbxqan` @ `8db2052` | clean; earlier frontend repository |
| `/home/user/backend-engine` @ `6b389e0` (main) | clean; earlier backend repository |

## 2. Commands run in this audit

| # | Command (cwd) | Result |
|---|---|---|
| C1 | `npx tsc --noEmit` (backend) | exit 0 |
| C2 | `npx tsc --noEmit` (frontend) | exit 0 |
| C3 | `env -u ANTHROPIC_API_KEY -u ELEVENLABS_API_KEY -u ANAM_API_KEY -u DATABASE_URL -u MONGODB_URI npx vitest run <list R>` (backend) | 40 files (39 pass, 1 fail); 417 tests (416 pass, 1 fail); 75 s |
| C4 | `npx vitest run test/apiDocs.test.ts -t "lists every mounted route"` | 1 pass, 3 skipped; printed `paths: 233 operations: 275` |
| C5 | `git grep -lE` for key, URI, private-key and JWT patterns | Placeholder Mongo URIs only, in `backend/test/p6SingleService.test.ts`, `p6StagingGuard.test.ts` and `p6VercelStaging.test.ts` (example hosts) |
| C6 | `ls backend/src/models/*.ts`, `ls backend/src/routes/*.ts`, `grep -c router.(get\|post\|put\|patch\|delete)` | 44 models, 27 route files, 273 router calls |

### List R: run in this audit (40 files, no provider mocks)

`adultLearners` (2), `apiDocs` (4), `candidateV2/evalV2CriterionLaila` (26), `candidateV2/lailaR1` (14), `elie.sprint2` (14), `elie.sprint3` (13), `elie.sprint5` (8), `elie.sprint6` (11), `elie.sprint7` (8), `engineContract` (3), `gradingEvalAdapter` (5), `gradingPolicy` (8), `p0aReviewFixes` (11), `p0cReviewFixes` (14), `p14_2StagingEntry` (9), `p14_3StagingStartup` (13), `p15StaffRouting` (3), `p19_1LeakGuard` (8), `p1Seed` (5), `p20Accounting` (9), `p20DbAvailability` (10), `p20RateLimit` (4), `p21Effectiveness` (16), `p21ExamEvidence` (8), `p21Orchestrator` (33), `p21Registry` (12), `p21TeachingImpact` (15), `p6SingleService` (9), `p6StagingGuard` (14), `p6Validation` (4), `p6VercelStaging` (9), **`p7RoleMatrix` (1 failed)**, `p8SmallScopeRetrieval` (45), `phase3.sprint1` (12), `phase3.sprint3` (4), `priceCatalog` (6), `productTour` (3), `teacherAttendance` (11), `teachingFeatures` (4), `usageLedger` (6).

All files are under `backend/test/`.

### Not run: provider-mocking files (48)

These mock `@anthropic-ai/sdk`, `@elevenlabs/elevenlabs-js`, `enaraOrchestrator`, `directTutorModel`, `elevenlabsVoice`, `avatarVisuals` or `hybridV1`, so the owner's rule excludes them:

`adminReports`, `analytics`, `avatar`, `benchmarkBudget`, `candidateV2/{contract,designPhase,nativeGrader,runner,v1GraderCompat}`, `conversationExam`, `directTutorModel`, `educatorAnalytics`, `elie.e2e`, `elie.sprint1`, `elie.sprint4`, `hybridV1.frozen`, `hybridV1.shadow`, `integrations`, `p0bGateway`, `p0cMetering`, `p0dBudget`, `p0dHardening`, `p10NamedStudents`, `p14_2GradingTestSpend`, `p14_3TestSpendEnforcement`, `p14_8BlockerFixes`, `p14_9TenantIsolation`, `p15LearningJourney`, `p19Resilience`, `p19TenantIsolation`, `p1Access`, `p1FinalGaps`, `p1ReviewFixes`, `p2Documents`, `p2NoScannerPolicy`, `p3EducatorChat`, `p4SpeakingExam`, `p4Workflow`, `p5Usage`, `p9AnalyticsRouter`, `phase0`, `phase1`, `phase3.autograding`, `phase3.e2e`, `phase3.sprint4`, `phase3.sprint5`, `security`, `tutorFallback`.

### Not run: stubbed fetch, fake upstream or external host (5)

`p12HardCap`, `p20QueryBudget`, `p20TutorStream`, `proactive`, `p6FrontendStaging`.

### Not run: browser and UI

`backend/test/ui/*`.

## 3. Key claims and their evidence

| Claim | Label | Evidence |
|---|---|---|
| 5 roles | CODE-VERIFIED | `backend/src/auth/roles.ts` `USER_ROLES` |
| Permission matrix | CODE-VERIFIED | `backend/src/auth/permissions.ts` `ROLE_PERMISSIONS`, `GRANTABLE_PERMISSIONS` |
| Academic Manager denied Educator Chat | CODE-VERIFIED | `routes/educatorChat.routes.ts` `requirePermission('content:author')`; `services/educatorAnalytics.ts` `runAnalytics` `ANALYTICS_NOT_PERMITTED` |
| Academic Manager allowed the analytics assistant, which sends named rows | CODE-VERIFIED | `routes/analytics.routes.ts`; `services/dataAssistant.ts` `answerDataQuestion` (`students.slice(0, 300)` with `name`) |
| Per-request user reload and token version | CODE-VERIFIED | `middleware/auth.middleware.ts` `authMiddleware`; `auth/jwt.ts` |
| No user-disable route; suspension enforced only for API keys | CODE-VERIFIED (search) | `User.status` never set to `disabled`; `authenticateUserOrApiKey` |
| No invitation or reset frontend | CODE-VERIFIED (search) | No match in `frontend/` |
| Tenant helpers | CODE-VERIFIED | `auth/authorization.ts` `scopedFilter`, `requireInstitutionId`, `resolveWriteInstitutionId`; `services/learningAccess.ts` |
| 27 route groups, 273 router calls, 44 models | CODE-VERIFIED | C6 |
| 233 paths / 275 operations | TEST-VERIFIED | C4; `config/swagger.ts`, `swagger/openapi.ts` |
| Docs open when the password is unset outside production | CODE-VERIFIED + TEST (p7 failure) | `config/swagger.ts` `docsGate` |
| Maintenance endpoint removed | CODE-VERIFIED; STAGING-VERIFIED 2026-10-29 | No match in `backend/src`, `api/`; `docs/benchmarks/diagnostics/20261029T124500Z-f5-vercel-cleanup/F5_VERCEL_CLEANUP_AND_DEPLOY.md` |
| AI gateway reserve, meter, settle | CODE-VERIFIED | `services/aiGateway.ts` `reserveAttempt`, `finishAttempt`, `meteredMessage`/`Stream`/`Speech`/`Call` |
| Model defaults | CODE-VERIFIED | `config/env.ts` (`ANTHROPIC_*_MODEL`) |
| Price catalogue is a list estimate | CODE-VERIFIED + TEST | `services/priceCatalog.ts` `PRICE_CATALOG`; `priceCatalog.test.ts` |
| Speaking-exam speech-to-text priced at $0 | CODE-VERIFIED | `services/speakingExam.ts` `transcribeReply` (`audioSecondsOf`); `priceCatalog.priceUsage` (ElevenLabs prices `characters` only); `aiGateway.priceAttempt` |
| Test-spend cap final, grading included | CODE-VERIFIED + TEST | `services/aiBudget.ts` `reserveAiBudget`/`reserveTestSpend`; `p14_2StagingEntry`, `p14_3StagingStartup`, `p6StagingGuard` |
| Staging ceiling $50 | CODE-VERIFIED | `config/stagingGuard.ts` `STAGING_MAX_TEST_SPEND_USD`; commit `08eb2cf` |
| Grading emergency overrun | CODE-VERIFIED | `aiBudget.reserveSchoolBudget` (`GRADING_FEATURES`, `addUncapped`, `recordGradingEmergency`) |
| School enforcement is opt-in | CODE-VERIFIED | `OrgBudget.enforcementEnabled`; `reserveSchoolBudget` |
| Manual release ignored | CODE-VERIFIED | `releasePolicy` read only in `assignments.controller.ts` (set) and `grading.controller.ts` (display); `autoGrading.processAttempt` always releases |
| Grading validation and leak guard | CODE-VERIFIED + TEST | `autoGrading.validateGrading`, `leaks`, `keyLeak`; `gradingProposals.validateProposal`; `p19_1LeakGuard`, `gradingPolicy` |
| Arabic draft exclusion not enforced; F-8 present | CODE-VERIFIED | `assessment.controller.ts` (`language: 'ar'` accepted); `frontend/pages/teaching/AssessmentBuilder.tsx` (Arabic option); `services/educatorAi.ts` (literal True/False) |
| Retrieval F-3, F-3b, F-10 scope | CODE-VERIFIED + TEST | `services/curriculumRetrieval.ts` (`coversQuestion`, `smallScopePassages`); `services/educatorChat.ts`; `services/educatorAi.ts` `gatherSources`; `p8SmallScopeRetrieval` (45) |
| Router redaction | CODE-VERIFIED | `services/educatorAnalyticsRouter.ts` `redactRequest`, `validateDecision` |
| Named-student resolution | CODE-VERIFIED | `services/studentDirectory.ts` `matchStudentNames`, `nearStudentNames`; `educatorAnalytics.resolveNamedStudent` |
| Chart validation | CODE-VERIFIED | `services/chartPayload.ts` `validateChart`; `frontend/components/AnalyticsReport.tsx` |
| Analytics definitions disagree | CODE-VERIFIED | `educatorAnalytics.loadPairs` vs `services/analyticsService.ts` `buildOverview` |
| 20 feature switches; ENARA-only changes | CODE-VERIFIED | `services/featureFlags.ts`; `routes/learning.routes.ts` `PUT /flags` |
| No scanner; deferred policy | CODE-VERIFIED | `services/malwareScan.ts` `getMalwareScanner`; `services/documentSafety.ts` |
| Download bypass | CODE-VERIFIED | `utils/uploadSigning.ts` `uploadLinkSigning`; `services/studentCourseService.ts` (`materials: chapter.uploads`) |
| R2 keys have no school prefix | CODE-VERIFIED | `services/uploadStorage.ts` |
| No persisted audit; no alert sink | CODE-VERIFIED (search) | `utils/logging.ts`; `aiBudget.storeAlert` |
| No cron schedule | CODE-VERIFIED | `vercel.json` has no `crons`; `routes/cron.routes.ts` |
| `/ready` scope | CODE-VERIFIED | `app.ts` `/ready` handler |
| Learning loop components | CODE-VERIFIED + TEST | `services/evidenceProcessor.ts`, `masteryModel.ts`, `retention.ts`, `pedagogyPolicy.ts` (`selectTeachingPlan`), `teachingImpact.ts`, `methodEffectiveness.ts`; `elie.sprint*`, `p21*` |
| Adult schools | CODE-VERIFIED + TEST | `services/learningContext.ts` `ADULT_GRADE_LEVEL`; `featureFlags.isAdultSchool`; `adultLearners.test.ts` |
| Product tour | CODE-VERIFIED + TEST | `controllers/auth.controller.ts` `tourPending`, `completeTour`; `frontend/components/ProductTour.tsx`; `productTour.test.ts` |

## 4. Reports used (dated claims, not re-verified)

Reports inside the repository (`docs/benchmarks/diagnostics/`):

- `20261028T133812Z-staging-readiness`, `…134450Z-staging-preflight`, `…140412Z-railway-staging-preflight`, `…203644Z-railway-two-service-staging`, `…205447Z-staging-alpha-release-candidate`, `…213000Z-free-tier-staging-architecture`
- `20261029T070000Z-vercel-staging`, `…084111Z-full-role-feature-ai-benchmark` (P7), `…090418Z-p8-p1-fixes`
- F-3 series: `…094732Z`, `…095942Z`, `…100818Z`, `…101847Z`, `…102448Z`, `…105843Z-f3b-live-validation`
- `…113202Z-educator-analytics-chat`, `…115915Z-p9-analytics-intent-router`, `…122253Z-p10-named-analytics`, `…124500Z-f5-vercel-cleanup`, `…131224Z-p10-live-intent-benchmark`, `…132059Z-english-assessment-3model`
- `…141743Z-p12-live-e2e`, `…153006Z-p13-…`, `…162036Z-p13-1-…`, `…162800Z-p13-2-…`, `…171132Z-p13-3-…`
- `…172333Z-p14-…`, `…173323Z-p14-1-…`, `…180450Z-p14-2-…`, `…182733Z-p14-3-…`
- `*-source-provenance` folders (P0c to P6)
- `ENARA_DEPLOYMENT_INVENTORY_REPORT.md`

Other repository documents:

- `docs/staging/`: P14.5 to P14.11, P15, P16 and later copies of P17 to P20
- `docs/teaching/`: adaptive teaching
- `README.md`, `STAGING_REPOSITORY_MANIFEST.md`

Owner-supplied copies outside the repository (not modified):

- `/home/user/ENARA_P17…P20*.md`, `ENARA_ADAPTIVE_TEACHING_*.md`. These are identical to the `docs/staging` and `docs/teaching` copies.
- Scratchpad copies of P13 to P16 and the aggregate report `ENARA_REPORT_2026-10-29.md`.

The supplied platform document ("ENARA Platform Documentation", Claude Docs, 2026-11-01) was not modified. Its claims (`f5dd116`, `dpl_Hw32…`, `test.enara.app`, 44 models, 27 route groups, 274 operations) are reconciled in `INCONSISTENCY_REGISTER.md`.

## 5. Session record (outside the repository)

Some facts come only from this working session's record (31 Oct to 1 Nov 2026), not from repository reports. They are labelled "session record" wherever used:

- Cloudflare DNS for `test.enara.app`
- Deployment `dpl_Hw32FB6bvgv7bXoh6awf62o9JgLb` promoted
- The 4Level1 accounts, with test data removed and adult mode on
- The $50 approval

They need an owner-side check in Vercel and Cloudflare.
