# ENARA Integrated Alpha: Full Feature × Role QA Report

| | |
|---|---|
| Date (UTC) | 2026-10-29 |
| Code tested | `EnaraAI/enara-staging-alpha` @ `d328dc6` (branch `staging-alpha`) plus uncommitted QA additions in this folder's working copy: `backend/test/p7RoleMatrix.test.ts`, `backend/src/scripts/benchmark3Model.ts` |
| Live environment | `https://enara-staging-alpha.vercel.app` (Vercel Hobby, production deployment of `f6165b4`, same app code as `d328dc6`); MongoDB Atlas `enara_staging_alpha`; Cloudflare R2 `enara-staging-alpha-uploads` |
| Staging identity (non-secret) | `ENARA_STAGING=true`, `NODE_ENV=development`, `AI_PAUSED=true`, no AI provider keys, invite-only, demo mode off, R2 mandatory, `TRUST_PROXY=1` |
| Status words | PASS, FAIL, BLOCKED, NOT RUN, MOCK-ONLY, LIVE-PROVIDER-VERIFIED (plus LIVE-ENV-VERIFIED for real calls to the staging deployment) |

## 1. Executive summary

**GO for continued internal staging testing. Fix P1 items F-3 (chat retrieval) and F-8 (Arabic assessments) before external testers. NO-GO for real schools or real students** until the P1 items in §5 are resolved and the not-tested areas in §6 are covered.

- **Automated baseline (PASS):** backend vitest **756/756** (64 files, including the new 4-test P7 role sweep); backend and frontend `tsc` clean; frontend production build OK; `git diff --check` clean. Worker typecheck is NOT RUN: the worker was removed from the staging repository.
- **Role × route sweep (MOCK-ONLY, in-memory DB):** all **268** API routes called as **11 identities**, **3,047 calls**. 1,024 asserted security checks PASS. 0 unexpected violations. 2 findings (F-1, F-2), covering 7 rows.
- **Live staging (LIVE-ENV-VERIFIED):** 72 API checks against the deployed staging. 49 OK, 23 expected refusals (role or feature rules), 0 broken. R2 upload, extraction, signed download and unsigned refusal all verified live.
- **AI (LIVE-PROVIDER-VERIFIED in an isolated harness):** 49 real paid calls across Haiku, Sonnet and Opus 5.5 for **$0.4457** total, under a $3 hard cap. See `ANTHROPIC_3_MODEL_COST_QUALITY_REPORT.md`. **No AI call was made against the staging deployment**: staging has no provider key and stays paused.

## 2. Roles found in code

Source: `backend/src/auth/roles.ts`, `permissions.ts`, route guards.

| Role (code) | UI name | Permissions | Notes |
|---|---|---|---|
| `enara-admin` | ENARA admin | all, including `cost:internal` | global, no school |
| `admin` | Workspace Admin | content:author/publish/manage_school, class:teach, insights:read_school, workspace:users, workspace:billing | one school |
| `teacher` | Teacher | content:author, content:publish, class:teach | **includes content creation; there is no separate Content Creator role** |
| `academic_manager` | Academic Manager | insights:read_school | read-only portal |
| `student` | Student | none (student routes only) | |
| — | Invited (not accepted) | cannot log in until the invitation is accepted | covered by existing P1 tests |
| — | Disabled user | `status: disabled`: every authenticated route returns 401 | verified (P7) |

## 3. Feature × role matrix (observed, MOCK-ONLY sweep)

Cell = routes **allowed (2xx)** out of routes in that area for that identity. The sweep uses non-existent IDs and empty bodies, so many legitimate actions show as 404 or 400. **The sweep proves denials. Allowed paths are proven by the integration suites and the live checks.** Full per-call evidence (3,047 rows, expected rule versus observed outcome): `FEATURE_ROLE_TEST_MATRIX.csv`.

| Feature area | Routes | ENARA admin | Workspace Admin | Teacher | Acad. Manager | Student | Admin (other school) | Anonymous | Disabled |
|---|---|---|---|---|---|---|---|---|---|
| Student portal / tutor | 53 | 0/53 | 0/53 | 0/53 | 0/53 | 23/53 | 0/53 | 0/53 | 0/53 |
| Learning intelligence / flags / outcomes | 47 | 4/47 | 4/47 | 1/47 | 1/47 | 0/47 | 4/47 | 0/47 | 0/47 |
| Assessment authoring | 18 | 1/18 | 1/18 | 1/18 | 0/18 | 0/18 | 1/18 | 0/18 | 0/18 |
| Courses, lessons, content | 14 | 1/14 | 1/14 | 1/14 | 0/14 | 0/14 | 1/14 | 0/14 | 0/14 |
| Assignments / publishing | 12 | 2/12 | 2/12 | 2/12 | 0/12 | 0/12 | 2/12 | 0/12 | 0/12 |
| Usage dashboard / savings / credits | 12 | 1/12 | 7/12 | 1/12 | 1/12 | 1/12 | 7/12 | 0/12 | 0/12 |
| Avatar / tutor sessions | 10 | 1/10 | 1/10 | 1/10 | 1/10 | 1/10 | 1/10 | 0/10 | 0/10 |
| Grading / grade release | 10 | 1/10 | 1/10 | 1/10 | 0/10 | 0/10 | 1/10 | 0/10 | 0/10 |
| AI lesson planning | 9 | 1/9 | 1/9 | 1/9 | 0/9 | 0/9 | 1/9 | 0/9 | 0/9 |
| Class instances | 9 | 1/9 | 1/9 | 0/9 | 0/9 | 0/9 | 1/9 | 0/9 | 0/9 |
| Teaching workflow | 9 | 3/9 | 3/9 | 2/9 | 0/9 | 0/9 | 3/9 | 0/9 | 0/9 |
| Workspace admin (users, invitations, grants) | 8 | 0/8 | 3/8 | 0/8 | 0/8 | 0/8 | 3/8 | 0/8 | 0/8 |
| Dashboards / analytics | 8 | 5/8 | 5/8 | 0/8 | 5/8 | 0/8 | 5/8 | 0/8 | 0/8 |
| Documents (upload, extract, attestation) | 7 | 1/7 | 1/7 | 1/7 | 0/7 | 0/7 | 1/7 | 0/7 | 0/7 |
| AI budgets / pause (ENARA) | 7 | 0/7 | 0/7 | 0/7 | 0/7 | 0/7 | 0/7 | 0/7 | 0/7 |
| Grounded AI Chat | 6 | 0/6 | 2/6 | 2/6 | 0/6 | 0/6 | 2/6 | 0/6 | 0/6 |
| Login / session / reset / invites | 6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 |
| Attendance | 6 | 2/6 | 2/6 | 2/6 | 0/6 | 0/6 | 2/6 | 0/6 | 0/6 |
| Integrations | 6 | 2/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 |
| Classes / batches | 5 | 1/5 | 1/5 | 0/5 | 0/5 | 0/5 | 1/5 | 0/5 | 0/5 |
| Student management | 5 | 1/5 | 1/5 | 0/5 | 0/5 | 0/5 | 1/5 | 0/5 | 0/5 |
| Tutor faces | 3 | 1/3 | 1/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 |
| Ingestion pipeline (Postgres) | 3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| Cron (secret) | 1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| Orchestrator ingestion upload (AWS S3) | 1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| Credits (admin) | 1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 |
| Speaking exams (voice) | 1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |

### Security invariants (asserted, all PASS except the documented findings)

- Anonymous and disabled users never get 2xx outside the public auth endpoints.
- The Academic Manager never succeeds on a write, including direct API calls. Exception: F-2.
- Students never reach staff data: documents, chat, lesson plans, grading, usage, ai-controls, workspace, flags, credits, school analytics.
- Teachers cannot change AI controls, flags or workspace users and invitations.
- Only the ENARA admin reaches `/api/ai-controls`.
- **Cross-school:** the teacher, admin, Academic Manager and student of school B are refused school A's curriculum (403 or 404) and budget. School B's curriculum list never contains school A. School A's own teacher gets 200.
- No 5xx anywhere, except dependency-unavailable 503s and F-1.

## 4. Live staging checks (LIVE-ENV-VERIFIED, 2026-10-29)

| Role | Check | HTTP | Code | Result |
|---|---|---|---|---|
| teacher | login | 200 | — | OK |
| teacher | me | 403 | STUDENT_REQUIRED | CHECK |
| teacher | curriculums | 200 | — | OK |
| teacher | assessments | 200 | — | OK |
| teacher | assignments | 200 | — | OK |
| teacher | assignment classes | 200 | — | OK |
| teacher | course instances | 403 | ADMIN_REQUIRED | CHECK |
| teacher | students | 403 | ADMIN_REQUIRED | CHECK |
| teacher | lesson plans | 200 | — | OK |
| teacher | documents | 200 | — | OK |
| teacher | educator chat conversations | 200 | — | OK |
| teacher | educator chat documents | 200 | — | OK |
| teacher | outcomes | 200 | — | OK |
| teacher | learning strategies | 404 | FEATURE_DISABLED | CHECK |
| teacher | analytics overview | 403 | FORBIDDEN | CHECK |
| teacher | weekly summary | 403 | FORBIDDEN | CHECK |
| teacher | usage today | 200 | — | OK |
| teacher | credits | 403 | ADMIN_REQUIRED | CHECK |
| teacher | document upload (R2 write) | 201 | — | OK |
| teacher | educator chat ask (AI paused expected) | 400 | VALIDATION_ERROR | OK |
| teacher | AI lesson plan (AI paused expected) | 503 | AI_UNAVAILABLE | OK |
| academic_manager | login | 200 | — | OK |
| academic_manager | me | 403 | STUDENT_REQUIRED | CHECK |
| academic_manager | curriculums | 403 | FORBIDDEN | CHECK |
| academic_manager | assessments | 403 | FORBIDDEN | CHECK |
| academic_manager | assignments | 403 | FORBIDDEN | CHECK |
| academic_manager | assignment classes | 403 | FORBIDDEN | CHECK |
| academic_manager | course instances | 403 | ADMIN_REQUIRED | CHECK |
| academic_manager | students | 403 | ADMIN_REQUIRED | CHECK |
| academic_manager | lesson plans | 403 | FORBIDDEN | CHECK |
| academic_manager | documents | 403 | FORBIDDEN | CHECK |
| academic_manager | educator chat conversations | 403 | FORBIDDEN | CHECK |
| academic_manager | educator chat documents | 403 | FORBIDDEN | CHECK |
| academic_manager | outcomes | 200 | — | OK |
| academic_manager | learning strategies | 403 | FORBIDDEN | CHECK |
| academic_manager | analytics overview | 200 | — | OK |
| academic_manager | weekly summary | 200 | — | OK |
| academic_manager | usage today | 200 | — | OK |
| academic_manager | credits | 403 | ADMIN_REQUIRED | CHECK |
| workspace_admin | login | 200 | — | OK |
| workspace_admin | me | 403 | STUDENT_REQUIRED | CHECK |
| workspace_admin | curriculums | 200 | — | OK |
| workspace_admin | assessments | 200 | — | OK |
| workspace_admin | assignments | 200 | — | OK |
| workspace_admin | assignment classes | 200 | — | OK |
| workspace_admin | course instances | 200 | — | OK |
| workspace_admin | students | 200 | — | OK |
| workspace_admin | lesson plans | 200 | — | OK |
| workspace_admin | documents | 200 | — | OK |
| workspace_admin | educator chat conversations | 200 | — | OK |
| workspace_admin | educator chat documents | 200 | — | OK |
| workspace_admin | outcomes | 200 | — | OK |
| workspace_admin | learning strategies | 404 | FEATURE_DISABLED | CHECK |
| workspace_admin | analytics overview | 200 | — | OK |
| workspace_admin | weekly summary | 200 | — | OK |
| workspace_admin | usage today | 200 | — | OK |
| workspace_admin | credits | 200 | — | OK |
| workspace_admin | usage report | 200 | — | OK |
| workspace_admin | usage budget | 200 | — | OK |
| workspace_admin | usage plan | 200 | — | OK |
| workspace_admin | current tools | 200 | — | OK |
| workspace_admin | savings | 200 | — | OK |
| workspace_admin | workspace invitations | 200 | — | OK |
| enara_admin | login | 200 | — | OK |
| enara_admin | me | 403 | STUDENT_REQUIRED | CHECK |
| enara_admin | flags | 200 | — | OK |
| enara_admin | budget | 200 | — | OK |
| enara_admin | budget status | 200 | — | OK |
| enara_admin | integrations institutions | 200 | — | OK |
| enara_admin | school analytics | 200 | — | OK |
| enara_admin | analytics overview | 200 | — | OK |
| enara_admin | credits | 200 | — | OK |

"CHECK" = refused by design: role permissions, flags off, or the student-only `/api/me`. Details in §2 and `FEATURE_ROLE_TEST_MATRIX.csv`. Also verified live earlier the same day:
- R2 upload → extraction (1 passage) → unscanned label with a warning → signed download 200 → unsigned 403;
- invite-only sign-up;
- CORS refusal for `enara.app`;
- legacy Gemini route 404;
- browser screenshots of all role portals.

## 5. Findings

| ID | Sev | Finding | Evidence | Impact | Suggested fix |
|---|---|---|---|---|---|
| F-3 | **P1** | **Grounded AI Chat refuses valid questions when one small document is selected.** BM25 retrieval needs score ≥ 1, but with a single passage in scope each matched term scores about 0.29 (IDF of a 1-chunk corpus), so a question needs about 4 or more exact term matches | Live staging: "What do plants make?" → `no_source`. Harness dry run: all 3 chat cases `no_sources` with 1 document, answered with 2 documents | New schools with their first document get "no source" for normal questions; AI Chat looks broken | Lower or normalise the threshold for small scopes (e.g. relative score, or minMatch 1 when N ≤ 3); add a test |
| F-8 | **P1** | **Arabic assessment drafts always fail.** The validator accepts true/false answers only as the literal `True`/`False`, the prompt doesn't say so, and models answer in Arabic. Result: `AI_BAD_OUTPUT` after the retry | Live benchmark: `as-ar` failed on all 3 models (2 attempts each) | Arabic schools can't generate assessments containing true/false items | Normalise Arabic and other-language true/false answers (صحيح/خطأ) to True/False, or state the required literal in the prompt; add a test |
| F-1 | P2 | `GET /api/ingestion/status/:eventId` returns **500** in staging: it queries Postgres, which Option A doesn't configure | P7 sweep (5 roles) | Orchestrator ingestion status is unusable in staging; noisy 500s | Return 503 `INGESTION_UNAVAILABLE` when Postgres isn't configured |
| F-4 | P2 | **Price catalog: Sonnet 5.5 cache-read rate** is $0.20/MTok; the published rate is **$0.10/MTok** | Anthropic pricing page, 2026-10-29 | Cached Sonnet reads over-estimated 2×; no effect on uncached calls | Update `services/priceCatalog.ts` with a new catalogue version |
| F-5 | P2 | **The temporary staging maintenance endpoint is still deployed** (token-protected; returns 404 without the token) | Commits `fb68487` to `f6165b4` | A privileged set-up route on a public staging site | Delete `STAGING_MAINTENANCE_TOKEN`, redeploy, remove the code |
| F-6 | P2 | Educator chat and the tutor call the gateway directly, outside the `aiJson` spending guard | Code (`educatorChat.ts`, `directTutorModel.ts`) | Offline benchmarks must reserve spend themselves (the harness does); production is covered by P0d only | Optionally route both through a shared guard hook |
| F-2 | P3 (info) | The Academic Manager gets 204 on `DELETE /api/avatar/session/:id` | P7 sweep | Not a write to anyone else's data: it only closes the caller's own session, and is idempotent | None; documented in the test |
| F-7 | P3 | The repository `EnaraAI/enara-staging-alpha` is **public** (changed by the owner for Vercel) | GitHub API | Source code, runbooks and security design are publicly readable; no secrets in it (full-history scan clean) | Make it private again; deploys use the CLI, not GitHub |

No P0 found. Not fixed in this task: the task allows only narrowly safe fixes, and these touch product behaviour or deployment.

## 6. NOT TESTED / BLOCKED

| Area | Status | Reason |
|---|---|---|
| Student experience on live staging (login, courses, assignments, tutor UI) | NOT RUN (live) | The 6 demo students have no passwords. Role and route rules for students are covered in the P7 sweep (MOCK-ONLY) |
| Any real AI call **inside the staging deployment** | BLOCKED | Staging has no Anthropic key and `AI_PAUSED=true`. The model benchmark ran in an isolated harness instead |
| Production grading workflow with real AI | NOT RUN | Grading can overrun through its emergency path; the benchmark used capped synthetic rubric grading instead |
| Speech STT/TTS, English Speaking Exams voice, Avatar (ElevenLabs, Anam) | BLOCKED | No keys; paid non-Anthropic services were not authorized. Flags off |
| Email (invitations, password resets, reminders) | BLOCKED | No email provider in staging |
| Video upload and download in the browser | BLOCKED | Needs the R2 CORS rule for the staging origin |
| Cron (retention, reminders) on live | NOT RUN | No cron configured in staging, by design |
| Orchestrator ingestion (`/api/upload`, `/api/ingestion`) | BLOCKED | AWS S3 and Postgres not configured in staging |
| Accessibility and responsive layout | NOT RUN | No automated accessibility tooling run; screenshots at 1440×900 only |
| Full end-to-end draft → publish → attempt → grade → gap → tutor → reassess | MOCK-ONLY | Covered by existing integration suites (phase3, p4Workflow, elie.*), not run end to end on live with AI |

## 7. Regression risk and readiness

- **Changes since the approved release:** R2-mandatory guard, unscanned-download policy, Vercel config, the temporary maintenance endpoint, `TRUST_PROXY` hop-count. All are covered by tests (756/756).
- **Highest-risk open items:** F-3 (chat usefulness) and F-5 (temporary endpoint). Fix both before inviting any external tester.
- **Evidence types:** the P7 sweep is integration (in-memory). §4 is live HTTP against staging. The model results are LIVE-PROVIDER-VERIFIED in an isolated harness, not inside staging. **Mocks don't prove real UI or model behaviour.**
