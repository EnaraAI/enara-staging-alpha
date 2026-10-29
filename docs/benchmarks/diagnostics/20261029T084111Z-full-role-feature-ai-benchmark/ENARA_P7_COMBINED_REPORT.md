# ENARA Integrated Alpha: P7 Combined Report

QA, the three-model benchmark and the spend ledger in one file (2026-10-29). Raw data stays in the CSV and JSON files in this folder.

## Contents

1. [Full Feature × Role QA Report](#part-1-full-feature--role-qa-report)
2. [Anthropic 3-Model Cost / Quality Benchmark](#part-2-anthropic-3-model-cost--quality-benchmark)
3. [Execution and Spend Ledger](#part-3-execution-and-spend-ledger)

---

# Part 1: Full Feature × Role QA Report


| | |
|---|---|
| Date (UTC) | 2026-10-29 |
| Code tested | `EnaraAI/enara-staging-alpha` @ `d328dc6` (branch `staging-alpha`) plus uncommitted QA additions in this folder's working copy: `backend/test/p7RoleMatrix.test.ts`, `backend/src/scripts/benchmark3Model.ts` |
| Live environment | `https://enara-staging-alpha.vercel.app` (Vercel Hobby, production deployment of `f6165b4`, same app code as `d328dc6`); MongoDB Atlas `enara_staging_alpha`; Cloudflare R2 `enara-staging-alpha-uploads` |
| Staging identity (non-secret) | `ENARA_STAGING=true`, `NODE_ENV=development`, `AI_PAUSED=true`, no AI provider keys, invite-only, demo mode off, R2 mandatory, `TRUST_PROXY=1` |
| Status words | PASS, FAIL, BLOCKED, NOT RUN, MOCK-ONLY, LIVE-PROVIDER-VERIFIED (plus LIVE-ENV-VERIFIED for real calls to the staging deployment) |

### 1. Executive summary

**GO for continued internal staging testing. Fix P1 items F-3 (chat retrieval) and F-8 (Arabic assessments) before external testers. NO-GO for real schools or real students** until the P1 items in §5 are resolved and the not-tested areas in §6 are covered.

- **Automated baseline (PASS):** backend vitest **756/756** (64 files, including the new 4-test P7 role sweep); backend and frontend `tsc` clean; frontend production build OK; `git diff --check` clean. Worker typecheck is NOT RUN: the worker was removed from the staging repository.
- **Role × route sweep (MOCK-ONLY, in-memory DB):** all **268** API routes called as **11 identities**, **3,047 calls**. 1,024 asserted security checks PASS. 0 unexpected violations. 2 findings (F-1, F-2), covering 7 rows.
- **Live staging (LIVE-ENV-VERIFIED):** 72 API checks against the deployed staging. 49 OK, 23 expected refusals (role or feature rules), 0 broken. R2 upload, extraction, signed download and unsigned refusal all verified live.
- **AI (LIVE-PROVIDER-VERIFIED in an isolated harness):** 49 real paid calls across Haiku, Sonnet and Opus 5.5 for **$0.4457** total, under a $3 hard cap. See `ANTHROPIC_3_MODEL_COST_QUALITY_REPORT.md`. **No AI call was made against the staging deployment**: staging has no provider key and stays paused.

### 2. Roles found in code

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

### 3. Feature × role matrix (observed, MOCK-ONLY sweep)

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

#### Security invariants (asserted, all PASS except the documented findings)

- Anonymous and disabled users never get 2xx outside the public auth endpoints.
- The Academic Manager never succeeds on a write, including direct API calls. Exception: F-2.
- Students never reach staff data: documents, chat, lesson plans, grading, usage, ai-controls, workspace, flags, credits, school analytics.
- Teachers cannot change AI controls, flags or workspace users and invitations.
- Only the ENARA admin reaches `/api/ai-controls`.
- **Cross-school:** the teacher, admin, Academic Manager and student of school B are refused school A's curriculum (403 or 404) and budget. School B's curriculum list never contains school A. School A's own teacher gets 200.
- No 5xx anywhere, except dependency-unavailable 503s and F-1.

### 4. Live staging checks (LIVE-ENV-VERIFIED, 2026-10-29)

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

### 5. Findings

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

### 6. NOT TESTED / BLOCKED

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

### 7. Regression risk and readiness

- **Changes since the approved release:** R2-mandatory guard, unscanned-download policy, Vercel config, the temporary maintenance endpoint, `TRUST_PROXY` hop-count. All are covered by tests (756/756).
- **Highest-risk open items:** F-3 (chat usefulness) and F-5 (temporary endpoint). Fix both before inviting any external tester.
- **Evidence types:** the P7 sweep is integration (in-memory). §4 is live HTTP against staging. The model results are LIVE-PROVIDER-VERIFIED in an isolated harness, not inside staging. **Mocks don't prove real UI or model behaviour.**

---

# Part 2: Anthropic 3-Model Cost / Quality Benchmark


**Status: LIVE-PROVIDER-VERIFIED** (real paid Anthropic API calls, 2026-10-29 08:40–08:47 UTC), run in an **isolated harness**, not inside the staging deployment. Staging has no provider key and stays AI-paused.

### 1. Models and rates (verified)

| Model ID (exact) | Availability | Input $/MTok | Output $/MTok | Cache read $/MTok | Source |
|---|---|---|---|---|---|
| `claude-haiku-5-5` | listed by Models API (`GET /v1/models`), 2026-10-29 | 0.10 (prompts ≤ 100K) | 0.50 | 0.01 | pricing page |
| `claude-sonnet-5-5` | listed | 2.00 | 10.00 | 0.10 | pricing page |
| `claude-opus-5-5` | listed | 4.00 | 20.00 | 0.20 | pricing page |

- Price source: <https://platform.claude.com/docs/en/about-claude/pricing> (read 2026-10-29).
- ENARA's `services/priceCatalog.ts` matches on input and output. It is wrong on Sonnet cache reads ($0.20, should be $0.10; QA finding F-4). No caching was used, so results are unaffected.
- Costs below are **computed from published rates**. They are **not** an invoice: no Admin/Usage API key was available to read the provider's billed amount.

### 2. Design

- **Workflows:** ENARA's real production code, called in-process:
  - `generateLessonPlan` and `generateAssessmentDraft` (`educatorAi.ts`, through `askForJson` and its validators);
  - `askEducatorChat` (`educatorChat.ts`, grounded with citations);
  - `queryDirectTutorModel` (`directTutorModel.ts`, Socratic chat mode);
  - **rubric grading** through ENARA's `rubricPrompt`, the production user-message shape and `validateProposal`, under a benchmark feature name. This is **not** the production grading workflow, which has an uncapped emergency path.
- **Data:**
  - fixed synthetic dataset: an English photosynthesis note and an Arabic (MSA) water-cycle note, registered and extracted by ENARA's real document pipeline;
  - 12 cases (2–3 per workflow, EN and AR);
  - a synthetic 6-point rubric with three synthetic answers (strong, weak, medium Arabic);
  - dataset SHA-256 `3b8281da03378febcdd2482b645dafd175b86d3036bd0243459e1ccfbe3b8c81`.
- **Fairness:**
  - identical prompts, data, `max_tokens` and `effort: low` (ENARA's production setting) for every model;
  - concurrency 1, on one account and region;
  - deterministic randomized model order per case;
  - no caching; the same validators for every model.
  - The SDK makes no retries of its own. ENARA's `askForJson` allows **one** validation retry, metered and reserved per attempt.
- **Scoring:** deterministic and automatic. No LLM judge, so no model graded itself. Per-workflow checks:
  - **lesson plan:** at least 5 section kinds, a check for understanding, differentiation, minutes within ±20% of the duration, cites the given sources, key terms, language;
  - **assessment:** count and type match the request, every question linked to a source and an objective, language;
  - **chat:** answered, cites the right document, expected facts present; for the unanswerable case, declines and invents no year; language;
  - **tutor:** corrects the misconception (keywords), ends with a check question, at most 220 words, language;
  - **grading:** total score in the expected band (strong ≥ 75%, weak ≤ 34%, medium 20–75%), feedback present.
  - **Quality** = % of checks passed. **Success** = ENARA schema valid **and** quality ≥ 70.
- **Metering:** every call went through ENARA's real `aiGateway` into the real `usage_ledger`, in a throwaway in-memory database. The school's P0d budget (15 / 6 / 6 / 3) was enforced there, with a separate **USD 3 hard-cap ledger** (`BudgetLedger`) reserving each attempt's worst case before it started.

### 3. Results

#### Overall (12 valid cases per model)

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 12 | 11/12 | 91.7 | 3.1 s | 13.2 s | 10,916 | 15,231 | $0.0087 | $0.0008 | $0.73 | $7.26 |
| Sonnet 5.5 | 12 | 11/12 | 91.7 | 4.3 s | 14.4 s | 10,069 | 9,422 | $0.1144 | $0.0104 | $9.53 | $95.30 |
| Opus 5.5 | 12 | 11/12 | 89.6 | 5.0 s | 23.1 s | 10,069 | 11,068 | $0.2616 | $0.0238 | $21.80 | $218.03 |


*p95 is shown for completeness only; with n ≤ 12 per model (n = 2–3 per workflow) it equals the slowest call and has no statistical meaning. Per-1K/10K costs = mean cost per case × volume, assuming a similar prompt and answer size.*

#### Lesson plan generation

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 2 | 2/2 | 100 | 18.1 s | 25.2 s | 2,498 | 7,468 | $0.0040 | $0.0020 | $1.99 | $19.92 |
| Sonnet 5.5 | 2 | 2/2 | 100 | 15.0 s | 16.4 s | 1,651 | 3,943 | $0.0427 | $0.0214 | $21.37 | $213.66 |
| Opus 5.5 | 2 | 2/2 | 100 | 25.1 s | 27.1 s | 1,651 | 5,244 | $0.1115 | $0.0557 | $55.74 | $557.42 |

#### Quiz / assessment draft

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 2 | 1/2 | 50 | 9.7 s | 13.2 s | 2,691 | 4,972 | $0.0028 | $0.0028 | $1.38 | $13.78 |
| Sonnet 5.5 | 2 | 1/2 | 50 | 10.4 s | 14.4 s | 2,691 | 3,195 | $0.0373 | $0.0373 | $18.67 | $186.66 |
| Opus 5.5 | 2 | 1/2 | 50 | 14.2 s | 20.9 s | 2,691 | 3,555 | $0.0819 | $0.0819 | $40.93 | $409.32 |

#### Grounded AI Chat with citations

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 3 | 3/3 | 100 | 0.8 s | 1.5 s | 1,641 | 154 | $0.0002 | $0.0001 | $0.08 | $0.81 |
| Sonnet 5.5 | 3 | 3/3 | 100 | 1.6 s | 1.6 s | 1,641 | 165 | $0.0049 | $0.0016 | $1.64 | $16.44 |
| Opus 5.5 | 3 | 3/3 | 100 | 1.3 s | 1.4 s | 1,641 | 162 | $0.0098 | $0.0033 | $3.27 | $32.68 |

#### Education tutor response

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 2 | 2/2 | 100 | 2.0 s | 2.2 s | 1,131 | 499 | $0.0004 | $0.0002 | $0.18 | $1.81 |
| Sonnet 5.5 | 2 | 2/2 | 100 | 3.1 s | 3.8 s | 1,131 | 516 | $0.0074 | $0.0037 | $3.71 | $37.11 |
| Opus 5.5 | 2 | 2/2 | 87.5 | 3.4 s | 4.1 s | 1,131 | 397 | $0.0125 | $0.0062 | $6.23 | $62.32 |

#### Rubric grading (synthetic, capped)

| Model | n | Success | Mean quality | Median latency | p95* | Input tok | Output tok | Cost | Cost / success | per 1K | per 10K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 3 | 3/3 | 100 | 3.1 s | 4.7 s | 2,955 | 2,138 | $0.0014 | $0.0005 | $0.45 | $4.55 |
| Sonnet 5.5 | 3 | 3/3 | 100 | 4.6 s | 4.7 s | 2,955 | 1,603 | $0.0219 | $0.0073 | $7.31 | $73.13 |
| Opus 5.5 | 3 | 3/3 | 100 | 5.2 s | 6.8 s | 2,955 | 1,710 | $0.0460 | $0.0153 | $15.34 | $153.40 |


### 4. Per-case evidence

| Case | Workflow | Lang | Model | Status | Quality | Checks | Latency | Tokens in/out | Cost | Error |
|---|---|---|---|---|---|---|---|---|---|---|
| `as-ar` | assessment_draft | ar | Haiku 5.5 | FAIL | 0 |  | 13.2 s | 1818/3561 | $0.0020 | AI_BAD_OUTPUT: The AI reply could not be used (question 4: true/false answer must be True  |
| `as-ar` | assessment_draft | ar | Opus 5.5 | FAIL | 0 |  | 20.9 s | 1818/2644 | $0.0602 | AI_BAD_OUTPUT: The AI reply could not be used (question 4: true/false answer must be True  |
| `as-ar` | assessment_draft | ar | Sonnet 5.5 | FAIL | 0 |  | 14.4 s | 1818/2196 | $0.0256 | AI_BAD_OUTPUT: The AI reply could not be used (question 4: true/false answer must be True  |
| `as-en` | assessment_draft | en | Haiku 5.5 | PASS | 100 | count_matches=1;types_match=1;all_source_linked=1;all_objective_linked=1;language=1 | 6.1 s | 873/1411 | $0.0008 |  |
| `as-en` | assessment_draft | en | Opus 5.5 | PASS | 100 | count_matches=1;types_match=1;all_source_linked=1;all_objective_linked=1;language=1 | 7.6 s | 873/911 | $0.0217 |  |
| `as-en` | assessment_draft | en | Sonnet 5.5 | PASS | 100 | count_matches=1;types_match=1;all_source_linked=1;all_objective_linked=1;language=1 | 6.5 s | 873/999 | $0.0117 |  |
| `ch-ar-answerable` | grounded_chat | ar | Haiku 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 0.8 s | 581/87 | $0.0001 |  |
| `ch-ar-answerable` | grounded_chat | ar | Opus 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.4 s | 581/88 | $0.0041 |  |
| `ch-ar-answerable` | grounded_chat | ar | Sonnet 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.6 s | 581/91 | $0.0021 |  |
| `ch-en-answerable` | grounded_chat | en | Haiku 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.5 s | 524/53 | $0.0001 |  |
| `ch-en-answerable` | grounded_chat | en | Opus 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.3 s | 524/60 | $0.0033 |  |
| `ch-en-answerable` | grounded_chat | en | Sonnet 5.5 | PASS | 100 | answered=1;cites_the_document=1;expected_facts=1;language=1 | 1.6 s | 524/60 | $0.0016 |  |
| `ch-en-unanswerable` | grounded_chat | en | Haiku 5.5 | PASS | 100 | declines_unsupported=1;no_invented_year=1;language=1 | 0.8 s | 536/14 | $0.0001 |  |
| `ch-en-unanswerable` | grounded_chat | en | Opus 5.5 | PASS | 100 | declines_unsupported=1;no_invented_year=1;language=1 | 1.0 s | 536/14 | $0.0024 |  |
| `ch-en-unanswerable` | grounded_chat | en | Sonnet 5.5 | PASS | 100 | declines_unsupported=1;no_invented_year=1;language=1 | 1.4 s | 536/14 | $0.0012 |  |
| `lp-ar` | lesson_plan | ar | Haiku 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 25.2 s | 1694/5211 | $0.0028 |  |
| `lp-ar` | lesson_plan | ar | Opus 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 27.1 s | 847/2881 | $0.0610 |  |
| `lp-ar` | lesson_plan | ar | Sonnet 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 16.4 s | 847/2216 | $0.0239 |  |
| `lp-en` | lesson_plan | en | Haiku 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 11.1 s | 804/2257 | $0.0012 |  |
| `lp-en` | lesson_plan | en | Opus 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 23.1 s | 804/2363 | $0.0505 |  |
| `lp-en` | lesson_plan | en | Sonnet 5.5 | PASS | 100 | min_5_section_kinds=1;has_check_for_understanding=1;has_differentiation=1;minutes_within_20pct=1;cites_given_sources=1;key_terms_covered=1;language=1 | 13.6 s | 804/1727 | $0.0189 |  |
| `gr-ar-medium` | rubric_grading | ar | Haiku 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.7 s | 972/992 | $0.0006 |  |
| `gr-ar-medium` | rubric_grading | ar | Opus 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 6.8 s | 972/726 | $0.0184 |  |
| `gr-ar-medium` | rubric_grading | ar | Sonnet 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.6 s | 972/649 | $0.0084 |  |
| `gr-en-strong` | rubric_grading | en | Haiku 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 3.0 s | 1023/583 | $0.0004 |  |
| `gr-en-strong` | rubric_grading | en | Opus 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 5.2 s | 1023/539 | $0.0149 |  |
| `gr-en-strong` | rubric_grading | en | Sonnet 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.0 s | 1023/486 | $0.0069 |  |
| `gr-en-weak` | rubric_grading | en | Haiku 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 3.1 s | 960/563 | $0.0004 |  |
| `gr-en-weak` | rubric_grading | en | Opus 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.7 s | 960/445 | $0.0127 |  |
| `gr-en-weak` | rubric_grading | en | Sonnet 5.5 | PASS | 100 | score_in_expected_band=1;feedback_present=1 | 4.7 s | 960/468 | $0.0066 |  |
| `tu-ar-question` | tutor | ar | Haiku 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 1.7 s | 593/214 | $0.0002 |  |
| `tu-ar-question` | tutor | ar | Opus 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 4.1 s | 593/250 | $0.0074 |  |
| `tu-ar-question` | tutor | ar | Sonnet 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 3.8 s | 593/325 | $0.0044 |  |
| `tu-en-misconception` | tutor | en | Haiku 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 2.2 s | 538/285 | $0.0002 |  |
| `tu-en-misconception` | tutor | en | Opus 5.5 | PASS | 75 | addresses_correct_idea=0;ends_with_check_question=1;paced_under_220_words=1;language=1 | 2.7 s | 538/147 | $0.0051 |  |
| `tu-en-misconception` | tutor | en | Sonnet 5.5 | PASS | 100 | addresses_correct_idea=1;ends_with_check_question=1;paced_under_220_words=1;language=1 | 2.3 s | 538/191 | $0.0030 |  |

Raw rows, with redaction-safe output excerpts of the synthetic data only: `MODEL_BENCHMARK_RESULTS.csv` and `.json`.

### 5. Findings from the benchmark

1. **Arabic assessment drafts fail on every model (P1, product bug, QA F-8).** ENARA's validator accepts true/false answers only as the literal `True`/`False`, the prompt doesn't say so, and the models answer in Arabic. All 3 models, 2 attempts each, `AI_BAD_OUTPUT`. This makes the assessment results 1/2 for every model; **it is not a model difference.**
2. **Grounded chat:** all models answered from the source, cited the right document, and **declined** the unanswerable question without inventing a date. Haiku was the fastest (median 0.8 s).
3. **Rubric grading:** all three models gave **identical** scores on all three answers (6/6, 0/6, 3/6), matching the synthetic key.
4. **Tutor:** Opus missed one keyword check on the misconception case. It corrected the idea in different words ("air", "sugar"), which shows the limit of keyword checks, not necessarily lower quality.
5. **Harness defect, found and corrected:** the first grading run left out the student answer, so every model correctly said none was given. Those 9 calls ($0.0610) are **superseded**, kept in the JSON, and counted in spend.

### 6. Recommended routing (least-cost model meeting each workflow's threshold)

| Workflow | Threshold met by | Recommended | Why / caveat |
|---|---|---|---|
| Grounded AI Chat | all 3 (3/3) | **Haiku 5.5** | Same correctness, about 40× cheaper than Opus, fastest |
| Tutor (chat) | Haiku 2/2, Sonnet 2/2, Opus 2/2 | **Haiku 5.5**, Sonnet as fallback | n = 2; confirm pedagogy on a larger set |
| Lesson plan | all 3 (2/2) | **Haiku 5.5** for drafts | Haiku wrote the longest plans; teachers edit anyway |
| Assessment draft | EN: all 3; AR: none (validator bug) | **Fix F-8 first**, then re-test; Haiku is likely sufficient | Not decidable until fixed |
| Rubric grading | all 3 agreed exactly (3/3) | **Sonnet 5.5** pending a larger calibrated set | High stakes: n = 3 is far too small to drop to Haiku for grading |

- **Production today:** `ANTHROPIC_TUTOR_MODEL` defaults to **Opus 5.5** for all of these. On this sample Opus cost **about 30×** Haiku and **about 2.3×** Sonnet per case, with no measured quality gain.
- **Do not switch on this evidence alone:** n = 2–3 per workflow, deterministic keyword checks, synthetic data.

### 7. Uncertainty and next experiments

- **Sample size:** with n = 2–3 per workflow, no difference here is statistically significant. Medians are indicative only.
- **Scoring limits:** keyword and structure checks can't judge pedagogical quality. Next, add a cross-model judge (e.g. Sonnet judging Haiku and Opus, and the reverse), plus a fixed reference set.
- **Next experiments:**
  - 20–30 cases per workflow;
  - Arabic assessments after the F-8 fix;
  - longer documents (realistic chunk counts);
  - streaming time-to-first-token (not observable here, because the tutor path is non-streaming);
  - invoice reconciliation through the Admin Usage API.
- **Not benchmarked (not Anthropic capabilities):** speech STT/TTS, the English Speaking Exam voice path, and the Avatar (ElevenLabs, Anam). BLOCKED, with no paid non-Anthropic calls.

---

# Part 3: Execution and Spend Ledger


### 1. Preflight

| Gate (spec Phase 1) | Outcome |
|---|---|
| Staging deployment has its own Anthropic key | **No.** Staging has no `ANTHROPIC_API_KEY` and `AI_PAUSED=true`. **No AI call was made against staging, its database or its R2 bucket** |
| Owner authorization for paid calls | **Yes:** in chat, 2026-10-29: "You have the authorization to use Anthropic sdk", within the approved staging budget |
| Where the calls ran | An **isolated local harness** (`backend/src/scripts/benchmark3Model.ts`, uncommitted), with a throwaway in-memory MongoDB, temp upload directory, synthetic data, and no staging/production DB, R2, Vercel or email |
| Key used | The key in the sandbox's local `backend/.env`, loaded into the harness process only; never printed, written or sent anywhere except `api.anthropic.com` |
| Models available | `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5` all listed by `GET /v1/models` |
| Rates verified | Published pricing page, 2026-10-29 (see the cost report §1). The ENARA catalogue matches on input and output |
| P0d budget enforced | Yes, in the gateway: synthetic school policy with monthly $15, daily $6, per-user daily $6, grading allowance $3, enforcement on, intended tools listed |
| Per-call upper bound | Yes. Every attempt reserved `maxInput × in-rate + max_tokens × out-rate` in the hard-cap ledger before it started (aiJson guard). Chat and tutor (no aiJson guard) were reserved by the harness for both possible attempts |
| Grading path | Production `ai_grading` (emergency path) **not used**. A benchmark feature name with the same prompt and validator, under the hard cap |
| Hard experiment envelope | **USD 3.00 total** (below $6/day, $15/month and $6/user/day), concurrency 1, stop when exhausted. Lowered from $4 because the account's other spending today isn't visible |
| Account prepaid / spend limit | Not visible (no Admin API key). The $3 cap is the binding limit |

### 2. Spend

| | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 | Total |
|---|---|---|---|---|
| Benchmark cases run (incl. 9 superseded grading cases) | 15 | 15 | 15 | 45 |
| Provider attempts (charged calls) | 17 | 16 | 16 | **49** |
| Validation retries (included above) | 2 | 1 | 1 | 4 |
| Input / output tokens | 13,664 / 17,038 | 12,817 / 10,685 | 12,817 / 12,601 | 39,298 / 40,324 |
| Cost at published rates | $0.009886 | $0.132484 | $0.303288 | **$0.445658** |
| ENARA gateway `usage_ledger` (`costInternal`) | $0.009886 | $0.132484 | $0.303288 | **$0.445658** |
| Unpriced or usage-unknown attempts | 0 | 0 | 0 | 0 |

- **Of the total:** valid results $0.384702; superseded grading run (harness defect) $0.060956.
- **No judge or grader-of-grader calls:** scoring is deterministic and free.
- **Hard-cap ledger** (`HARD_CAP_SPEND_LEDGER.json`): cap $3.00, spent **$0.445658**, 55 reservations (49 attempts plus 6 released chat/tutor second-attempt reservations), **0 refused, no STOP event**.
- **Reconciliation:** published-rate estimate = gateway ledger = hard-cap ledger, with **$0.000000 drift**.
- **Invoice:** the provider's invoiced amount was **not** read (no Admin Usage API access). The figures above are estimates from published rates and the reported token usage, and should match the invoice unless the account has special pricing.

### 3. Runs

| Run | UTC | Calls | Result |
|---|---|---|---|
| Mock dry runs (local stub provider) | 08:31–08:39 | 36 + 9 | $0, pipeline verified |
| Live run 1 (all workflows) | 08:40:15 → about 08:45 | 40 attempts | completed; 9 grading results superseded |
| Live run 2 (grading only, corrected) | about 08:45 → 08:46:36 | 9 attempts | completed |

**Remaining envelope after this task:** $2.554 of the $3 cap, unused. Nothing else was authorized or spent, and no ElevenLabs, Anam or other paid service was called.
