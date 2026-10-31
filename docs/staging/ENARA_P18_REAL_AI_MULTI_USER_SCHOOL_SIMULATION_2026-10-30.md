# ENARA P18: real-AI multi-user school simulation (2026-10-30)

| | |
|---|---|
| Run id | `p18-sim-20261030` |
| Window (UTC) | Preflight 13:55–14:05 · setup and teachers 14:05–14:08 · students 14:09–14:32 · verification 14:32–14:42 |
| Cairo time | UTC+2 (16:09–16:32 for the student runs) |
| Deployment | `dpl_4Bj8UuVfA4PcTxjq5ZtZdcMs74K1` |
| School | `enara-staging-school` |
| AI | **Real.** Every tutor and grading call went to Anthropic `claude-opus-5-5`. No mocks, cached outputs or simulated results |
| Machine-readable inventory | `docs/staging/ENARA_P18_SYNTHETIC_INVENTORY_2026-10-30.json` |
| Video | `ENARA_P18_REAL_AI_MULTI_USER_SCHOOL_SIMULATION_2026-10-30.mp4` (scratchpad `p18/`); built from the real browser recordings of this run |

Labels used in this report:
- **EXECUTED:** observed live on staging.
- **NOT_LIVE_VERIFIED:** not induced live; only local tests or code reading support it.
- **UNVERIFIED:** no evidence available to us.

---

## 1. Executive summary: **PASS**, with recorded defects

The complete simulated school ran on staging with real AI:
- 3 teachers, 15 students, 3 classes, 6 lessons and 3 assessments;
- **15/15 real tutor interactions**;
- **15/15 submissions**;
- **15/15 autonomous gradings**, all released with no teacher step.

**Results**

| Area | Result |
|---|---|
| Teacher workflows (browser) | 3/3. Teacher A's dashboard text check needed a re-check after load |
| Teacher API steps | 3/3 |
| Student journeys | 15/15, each 9/9 browser checks |
| Per-student API verification | 300/300 |
| Teacher analytics vs stored records | 60/60 |
| Isolation and restriction probes | 36 + 32 + 15 preflight, all pass |
| Duplicate tests (Scenario D) | 3/3 |

**Spend**
- P18 spend: **$0.614916** in 45 provider calls.
- The runtime logs, ledger, usage report and school spend counter all reconcile to the micro-dollar.
- Cumulative app spend is $0.698084 of the $4.50 cap. No cap was exceeded.

**Defects:** no critical security or data-integrity defect was found. Medium and low defects are in section 15:
- slow student dashboard under concurrent load;
- the per-IP login limit is a risk for real schools;
- the dashboard's "next steps" AI note can never run under the test cap;
- cosmetic issues.

**Limits, stated plainly:**
- Genuine cross-tenant access is NOT_LIVE_VERIFIED: only one tenant exists, and creating another was out of scope.
- Several provider failure modes did not occur naturally and are NOT_LIVE_VERIFIED (section 10).
- The provider-side cap and provider-console usage are operator-attested or UNVERIFIED.

**Unchanged decisions:** Stop A remains **waived**, not passed. Anthropic key rotation was not pursued (the owner's standing decision).

## 2. Exact staging deployment

| Check | Evidence |
|---|---|
| Alias | `enara-staging-alpha.vercel.app` → `dpl_4Bj8UuVfA4PcTxjq5ZtZdcMs74K1` (Ready, production, created 13:15:07Z) |
| Source | `574010a` plus the 7 P15/P17 frontend files (P17 manifest) |
| Bundle | `index-FDEaNrVy.js` (the P17 bundle) |
| Health | `/health` 200; `/ready` ready (mongo ok, postgres ok) on 3/3 calls |
| Staging guard | `ENARA_STAGING=true`; `AI_PAUSED=false` |
| App cap | `AI_TEST_SPEND_CAP_USD=4.50`, `AI_TEST_SPEND_ID=p14-live-20261029-12a335` (read from Production env; key present, value not shown) |
| Provider cap | **Operator-attested ≤ $5** (owner answer during preflight; Claude cannot read the console) |
| School budget (ENARA admin, read-only) | Enforced: daily $6, monthly $15, per-user daily $6, grading allowance $3 |
| Rollback | `dpl_8tccc1rcKRNQKURe5wKYbBSX82cP` (Ready) |
| Changes made | **No** deploy, env, cap, flag or key changes. Nothing committed or pushed |

### Preflight gates (all passed before any record or AI call)

1. P15, P16 and P17 reports read.
2. Deployment and commit verified.
3. Staging guard verified.
4. Authentication protections: 15/15 probes (anonymous, bad token, teacher → admin, academic manager writes, workspace admin → flags, unknown login).
5. App cap $4.50 verified.
6. Provider cap attested.
7. Cumulative spend read: $0.083168. The ledger matches the school month counter (83,168 micros) exactly.
8. Remaining budget: about $4.417.
9. Cost estimate: $0.50 expected; $1.30 worst case including up to 3 grading runs per submission.
10. The run fits with more than 3× reserve.
11. The ledger was functioning (P17 reconciliation and per-request records).
12. Rollback available.
13. Cleanup strategy: all records tagged "P18 … (synthetic)", inventoried, nothing deleted; section 14.

## 3. Synthetic school and class structure

| Class | Class id | Batch | Teacher | Students | Lessons (curriculum) | Assessment / assignment |
|---|---|---|---|---|---|---|
| A, Maths (English) | `inst-1793369142530` | `P18 batch A` | P18 Teacher A | A1–A5 | `CUR-6ZK23K-2660`: "Lesson A1: Equivalent fractions", "Lesson A2: Adding unlike fractions" | `ASM256086` / `asg-f0087c14-…` |
| B, Science (English) | `inst-1793369146249` | `P18 batch B` | P18 Teacher B | B1–B5 | `CUR-RTJ63Z-2721`: "Lesson B1: States of matter", "Lesson B2: Changes of state" | `ASM259567` / `asg-b236655e-…` |
| C, Science (**Modern Standard Arabic**) | `inst-1793369149968` | `P18 batch C` | P18 Teacher C | C1–C5 | `CUR-9YC5XK-1291`: «الدرس C1: دورة الماء في الطبيعة»، «الدرس C2: التكاثف وتكوّن الغيوم» | `ASM262850` / `asg-d1acec74-…` |

**Enrollment:** one batch per class, and each student enrolled by class membership. Students have no batch, so the batch-based rule (P17 section 8) cannot spread them across classes. The enrollment model was not changed.

**Assessments:** each has 1 multiple-choice question (1 point, rule-graded) and 1 open response (2 rubric criteria × 0–2 points, AI-graded), for a total of 5 points.

**Answer quality per class:** students 1–5 are, in order: strong and correct; correct with a weak explanation; partially correct; incorrect with a misconception; incorrect and weak.

## 4. Teacher workflow results: **3/3** (EXECUTED)

| Step | A | B | C |
|---|---|---|---|
| 1 Login (real browser, concurrent) | PASS | PASS | PASS |
| 2 Teaching workspace, "Teaching" label | PASS* | PASS | PASS |
| 3 Only own class shown | PASS* | PASS | PASS |
| 4–5 Two lessons created and saved (UI form) | PASS | PASS | PASS |
| 5 Published through the D3 "Publish to class" dialog (lists only own class) | PASS | PASS | PASS |
| 6–7 Assessment created, published and assigned (teacher API, same endpoints the UI uses) | PASS | PASS | PASS |
| 8 Both lessons available to the class (server record) | PASS | PASS | PASS |

\* Teacher A's first text check ran while the dashboard showed "Loading…" (cold data load). A re-check with the same saved session, without a new login, passed: Teaching dashboard, own class, no other classes.

**Teacher isolation: 36/36.** Teachers A, B and C were each refused (404) for every other class's:
- roster;
- publish-to-class;
- assignment creation;
- assessment read;
- student profile;
- curriculum edit.

## 5. Student workflow results: **15/15** (EXECUTED, real browser)

Each journey:
1. login and dashboard (own class only; Due soon lists the assignment);
2. lesson 1 content, then Mark complete;
3. lesson 2 content;
4. **real tutor message** in the lesson 2 context;
5. students 1–3 also complete lesson 2;
6. Open assignment → Start (no answer key on the page) → answer → Submit;
7. stay on the result page until released.

| Student | Quality | MCQ | Rubric | **Total** | Tutor latency | Release after submit |
|---|---|---|---|---|---|---|
| A1 | strong | 1/1 | 4/4 | **5/5** | 9.8 s | 11 s |
| A2 | correct, weak explanation | 1/1 | 1/4 | **2/5** | 11.8 s | 11 s |
| A3 | partial (3/12 slip) | 1/1 | 2/4 | **3/5** | 9.7 s | 11 s |
| A4 | misconception (2/9) | 0/1 | 0/4 | **0/5** | 9.7 s | 11 s |
| A5 | incorrect, weak | 0/1 | 0/4 | **0/5** | 8.7 s | 16 s |
| B1 | strong | 1/1 | 4/4 | **5/5** | 9.2 s | 11 s |
| B2 | correct, weak explanation | 1/1 | 1/4 | **2/5** | 10.1 s | 11 s |
| B3 | partial | 1/1 | 2/4 | **3/5** | 10.2 s | 11 s |
| B4 | misconception (ground soaks it) | 0/1 | 0/4 | **0/5** | 10.7 s | 11 s |
| B5 | incorrect, weak | 0/1 | 0/4 | **0/5** | 10.2 s | 16 s |
| C1 | strong (MSA) | 1/1 | 4/4 | **5/5** | 12.7 s | 11 s |
| C2 | correct, weak (MSA) | 1/1 | 2/4 | **3/5** | 11.1 s | 16 s |
| C3 | partial (MSA) | 1/1 | 2/4 | **3/5** | 11.2 s | 16 s |
| C4 | misconception: smoke (MSA) | 0/1 | 0/4 | **0/5** | 11.2 s | 16 s |
| C5 | "I don't know" (MSA) | 0/1 | 0/4 | **0/5** | 11.1 s | 11 s |

**B2 and C2: first attempt aborted, re-run.** Their first browser run aborted before any AI call. Login succeeded, but the dashboard stayed in its loading state beyond the script's 45 s wait; `/api/me/dashboard` took 26–33 s and `/api/me/achievements` 15–27 s under concurrent load (defect P18-2). The re-run with a 150 s wait passed 9/9. The aborted runs made **no** paid calls (the ledger shows exactly 1 tutor call per student).

**Per-student API verification: 300/300** (20 checks × 15):
- exactly one submitted attempt;
- result stored and released (5 max points), with feedback present;
- no model answer or answer key in the released result;
- tutor session bound to the student's **own course and lesson 2**;
- question and reply persisted;
- a measured ledger row for the tutor request, and ledger rows for grading;
- both lessons retrievable;
- refused: another student's result and tutor session, another class's course, lesson and assignment, the assessment with keys, the grading queue, the class roster, and the unpublished P16 lesson.

## 6. All real AI tutor calls: **15/15 succeeded** (EXECUTED)

| | |
|---|---|
| Provider / model | Anthropic `claude-opus-5-5` (app default) |
| Status | 15 × `ok`, HTTP 200 |
| Server latency | 3.0–6.7 s |
| End-to-end latency (UI) | 8.7–12.7 s |
| Cost | **$0.152280** total ($0.006253–$0.014597 per call) |
| Per-call ids | Request id, student, class and cost for each call are in the inventory (`aiCalls`, `students.*.tutorRequestId`) |

**Context evidence:**
- Every session record carries the student's own `courseId` and lesson 2's `lessonId`.
- Replies cite the lesson by name: "It connects to what we're learning in **Lesson B2: Changes of state**"; «في درسنا (C2) تعلّمنا…»; «تذكّر من الدرس السابق (C1)».
- Replies answer the specific question; for example A4 (misconception): "No, 1/3 + 1/6 is not 2/9. It looks like the tops were added…".
- **Class C replies are in Modern Standard Arabic.**

**No cross-student contamination:** each reply matches its own student's question; other students' sessions return 404.

## 7. All autonomous grading operations: **15/15** (EXECUTED)

| | |
|---|---|
| Real grading calls | **30** (2 evaluations per open response, by design), all `ok` |
| Runs | 15 grading runs, **no failed runs, no retries, no exceptions** (the P17 F1 leak-guard rejection did not recur) |
| Releases | 15 `grading_released` events (version `autograde-v1`) with no teacher step |
| Cost | **$0.462636** ($0.023908–$0.039196 per submission; Arabic answers cost more) |
| Rubric selection | Criterion ids match each class's own rubric. A3: "The conversion to a common denominator is correct… then adds the denominators… partial credit on both criteria" |
| State transitions | Submitted → grading → released, in 11–16 s |
| Score persistence | Result endpoint = teacher queue = learner profile (section 9) |
| Feedback | Specific, kind, with a next step, and never the model answer. **Class C feedback and score explanations are in MSA**, e.g. «حصلت الإجابة على صفر لأنها تقدّم تفسيرًا علميًا خاطئًا لتكوّن الغيوم، إذ تربطه بدخان المصانع والسيارات» |
| Idempotency, no duplicate final grades | One submitted attempt per student; one release event per attempt; repeat submits handled (section 8 D) |
| No cross-student feedback leakage | Each feedback quotes or refers only to its own student's answer; other students' results return 404 |

**Score quality:** the scores follow the answer quality monotonically in every class: strong 5, weak 2–3, partial 3, misconception 0, weak/unknown 0.

**Observation:** the Arabic weak answer (C2, «تتكوّن الغيوم من الماء») received 2/4 on the rubric, whereas the English weak answers (A2, B2) received 1/4. This is a slight cross-language leniency difference; the AI's rationale is coherent. Recorded as an observation, not a defect.

## 8. Concurrency results (EXECUTED)

| Scenario | What ran | Evidence | Result |
|---|---|---|---|
| **A**: simultaneous tutor | A1, B1, C1 released by a barrier at **14:10:18.597Z** | 3 `tutor_chat` calls completed at 14:10:26.3 / 26.9 / 29.9; each reply routed to its own student and lesson; each session has its own 3 messages; 3 ledger rows; per-user counters separate | PASS |
| **B**: simultaneous grading | A1, B1, C1 submitted by a barrier at **14:10:48.427Z** | 6 grading calls, independent; 3 releases at 14:10:56.4 / 56.9 / 59.1 with the correct scores; 6 ledger rows; no duplicate or missing records | PASS |
| **C**: bounded multi-user | Remaining 12 journeys, **3 at a time** | All completed. No HTTP 429 from the app, and no provider rate limit observed | PASS (see P18-2 latency) |
| **D**: duplicates | Repeat submit after release (A1, B3, C5); new attempt after submit | Repeat submit → 200 with the **same receipt** (same attempt id). Stored answers and score **unchanged** (a changed answer was not stored). A new attempt is refused (403). **0 new AI calls** (45 calls = 15 tutor + 30 grading). The UI's 4-second result polling during grading produced no duplicate runs (exactly 2 calls per attempt) | PASS |

**Why concurrency 3:** count_tokens returned no rate-limit headers, so the provider tier limits could not be read, and Vercel Hobby functions are constrained. Each journey costs about $0.04, and the app's login limit is 20 per 15 minutes per IP. A limit of 3 kept the run well inside all of these.

**Concurrent budget reservations:** EXECUTED in Scenarios A and B. After the run every counter shows committed = settled and unknown = 0 (section 11).

## 9. Authorization and isolation findings (EXECUTED unless stated)

| Check | Result |
|---|---|
| Teacher X cannot use class Y (roster, publish, assign, assessment, profile, curriculum edit) | **36/36** refused (404) |
| Teachers: no admin functions (batches, students, usage report, create batch, flags, budget status, P16 class roster) | **21/21** refused |
| Student isolation: another student's result and tutor session; another class's course, lesson and assignment | Refused for all 15 students (inside the 300/300) |
| Unpublished lesson (old P16 lesson) | 404 for all 15 |
| Answer keys (assessment read as a student) | 403 for all 15; keys absent from attempt pages and results |
| School admin functions restricted | Teachers 403; academic manager 403 |
| **Academic manager read-only** | All write attempts 403 (assignment, curriculum, publish, assessment, regrade, flags); grading queue 403 |
| Cross-tenant | Fabricated foreign ids refused (404 / 403). **Genuine second-tenant access: NOT_LIVE_VERIFIED** (staging has one institution; covered locally by `p14_9TenantIsolation`) |
| Teacher analytics isolation | Each teacher's roster, queue and overview contains only their own 5 students and class |
| Batch-based enrollment | Documented (P17 section 8). P18 used one batch per class plus membership-only students; no over-sharing observed |
| Session | Tokens persisted across reload; P17 already verified logout revocation |

## 10. AI failure handling

| Condition | Status | Evidence |
|---|---|---|
| **Budget control refusing unsafe calls** | **EXECUTED (natural)** | The student dashboard's `next_steps_note` was refused **42 times** by the test-spend guard (`ai_test_spend_unbounded_refused`: the call has no cost bound). No provider call, no ledger row, no spend; the dashboard still worked |
| Concurrent budget reservations | **EXECUTED** | Scenarios A and B; counters settled with 0 unknown |
| Interrupted client | **EXECUTED (natural)** | The B2/C2 browsers closed mid-load (script timeout). No orphaned AI calls, attempts or ledger rows |
| Provider rate limiting (429) | NOT_LIVE_VERIFIED | Did not occur |
| Provider timeout | NOT_LIVE_VERIFIED | Did not occur. Local test P17-L passes |
| Provider rejection (4xx/5xx) | NOT_LIVE_VERIFIED | Did not occur |
| Invalid provider response | NOT_LIVE_VERIFIED in P18 | Seen live in P17 (feedback-leak guard → retry → correct release). Local G-negative passes |
| Incomplete usage metadata | NOT_LIVE_VERIFIED | 0 usage-unknown rows. Local P17-L passes |
| Budget exhaustion | NOT_LIVE_VERIFIED | Deliberately not induced (would require changing env or caps). Local journey I passes |

## 11. Usage ledger reconciliation (EXECUTED)

| Source | Tutor | Grading | Total P18 |
|---|---|---|---|
| Runtime `ai_call` logs (one per provider attempt) | 15 calls, $0.152280 | 30 calls, $0.462636 | **45 calls, $0.614916** |
| Ledger, per request (`/api/usage/me/requests/:id`, 30 requests) | 15 rows | 30 rows | **45 rows**, 0 unknown, 0 failed; 30,405 input / 21,724 output tokens (cache tokens priced but not itemised) |
| Usage report (workspace admin, 30 days) | — | — | 54 operations = 9 before + **45**; 54 succeeded; 0 refused, unpriced or usage-unknown |
| **School month counter** (ENARA admin, read-only) | — | — | 83,168 → **698,084 micros = +$0.614916** (exact) |
| Per-user daily counters (tutor only; grading is exempt) | Sum of the 15 P18 students = **152,280 micros = $0.152280** (exact) | — | — |
| Test-spend counter `test_spend:p14-live-…` | — | — | **UNVERIFIED** (Atlas only; not exposed by the API) |
| Provider console / invoice | — | — | **UNVERIFIED** (no console access) |

**Accounting is consistent:** logs = ledger = report = counters. Exactly 3 calls per student (1 tutor + 2 grading). No billable call was stopped, because no inconsistency appeared.

Each call's run id, synthetic user, class, assessment, workflow, provider, model, request id (shared by the log line and its ledger row), status, cost and cumulative P18 spend are listed in the inventory's `aiCalls`.

Two identifiers are not available to us:
- **Provider-side request ids** (Anthropic `req_…`) are not logged by the app.
- **Ledger document `_id`s** are not exposed by any API.

The request id is therefore the join key between log lines and ledger rows.

## 12. Actual spending

| | USD |
|---|---|
| Before P18 (P14.11–P17) | 0.083168 |
| **P18** | **0.614916** (tutor 0.152280 + grading 0.462636) |
| **Cumulative app spend** (school counter) | **0.698084** |
| Outside the app (P14.11 direct check) | ≈ 0.000004 |
| Free preflight `count_tokens` call | 0 |
| P18 estimate vs actual | $0.50 expected / $1.30 worst case → **$0.61 actual** |

Costs are catalogue estimates ($4 / $20 per million tokens for Opus 5.5, which matches published pricing), not invoiced amounts.

## 13. Remaining budget

| Cap | Limit | Used | Remaining |
|---|---|---|---|
| App test cap (verified) | $4.50 | $0.698 | **≈ $3.80** |
| Provider cap (attested ≤ $5) | ≤ $5 | ≈ $0.698 (plus anything else on the workspace, UNVERIFIED) | ≤ $4.30 |
| School monthly budget (enforced) | $15 | $0.698 | $14.30 |
| School grading allowance | $3 | grading total ≈ $0.53 | ≈ $2.47 |

**No cap was exceeded.**

## 14. Data created and cleanup inventory

Everything is synthetic and tagged "P18 … (synthetic)". **Nothing was deleted; P16 and P17 records are untouched.**

| Record | Count | Removal |
|---|---|---|
| Teacher users | 3 | DB only (no user-delete API) |
| Student users and Student records | 15 + 15 | Users: DB only. Students: `DELETE /api/students/:id` |
| Batches | 3 | `DELETE /api/batches/:id` |
| Classes | 3 | `DELETE /api/course-instances/:id` |
| Curricula (2 lessons each) | 3 (6 lessons) | `DELETE /api/curriculums/:id` |
| Assessments | 3 | delete or archive |
| Assignments | 3 | `POST /api/assignments/:id/archive` |
| Attempts (released) | 15 | no route (history) |
| Tutor sessions | 15 | student delete route |
| Ledger rows | 45 | append-only (keep) |
| Lesson-completion and activity events | per journey | history |

All ids are in `ENARA_P18_SYNTHETIC_INVENTORY_2026-10-30.json`, which holds no passwords or tokens. Credentials are in a local 0600 file only.

## 15. Defects discovered

| Id | Severity | Finding | Evidence | Suggested action |
|---|---|---|---|---|
| **P18-2** | **Medium** (performance) | The student dashboard APIs are slow under modest concurrency: `/api/me/dashboard` 26–33 s, `/api/me/achievements` 15–27 s with 3 new students at once; the UI shows skeletons until then | Runtime logs 14:25:2x–14:26:0x | Profile and index those queries; load dashboard sections independently |
| **P18-7** | **Medium** (risk, code) | The login rate limit is **20 per 15 minutes per IP** (`app.ts:112`). A real class behind one school network address would be locked out at lesson start. NOT_LIVE_VERIFIED: P18 paced its logins to avoid it | Code | Key by account plus IP, or raise the limit for school networks |
| P18-1 | Low | The dashboard `next_steps_note` AI feature passes no cost bound, so the test-spend guard always refuses it (42 times). It can never run on staging, and production behaviour is unknown | Logs | Give it an upper bound like the tutor and grader |
| P18-3 | Low (cosmetic, U1 residue) | The teacher's user chip still reads "Admin" | Screenshot `tA_01_dashboard.png` | Show the backend role |
| P18-4 | Low | `releasedAt` is the grading-run start time, a few seconds before the actual release (`grading_released` log) | A1: releasedAt 14:10:49.27 vs release log 14:10:56.9 | Set it at finalisation |
| P18-5 | Observation | Cross-language leniency: Arabic weak answer 2/4 vs English weak answers 1/4 | Section 7 | Monitor in the Arabic evaluation set |
| P18-6 | Observation | The academic manager is refused even the teaching overview (403); stricter than "read-only" | Section 9 | Confirm the intended manager scope |

**No critical security or data-integrity defect.**

## 16. Final decision: **PASS**

| Acceptance criterion | Met | Evidence |
|---|---|---|
| All 3 teachers complete their workflows | ✅ | Section 4 |
| All 6 lessons published | ✅ | Section 4 |
| All 15 students complete the journey | ✅ | Section 5 (B2/C2 needed a browser re-run after slow dashboard loads; no paid call duplicated) |
| All 15 real tutor interactions succeed | ✅ | Section 6 |
| All 15 submissions persist | ✅ | Section 5 |
| All 15 autonomous gradings complete | ✅ | Section 7 |
| Feedback released correctly | ✅ | Section 7 |
| Concurrency checks pass | ✅ | Section 8 |
| Authorization and isolation pass | ✅ | Section 9 (genuine cross-tenant NOT_LIVE_VERIFIED: one tenant only) |
| Analytics match persisted data | ✅ | 60/60 |
| AI usage accounting consistent | ✅ | Section 11 |
| No spend cap exceeded | ✅ | Section 13 |
| No critical security or data-integrity defect | ✅ | Section 15 |

**Still not verified:**
- provider-console usage and the provider cap (operator-attested);
- the Atlas test-spend counter;
- the failure modes marked NOT_LIVE_VERIFIED in section 10.

Stop A remains **waived**.

---

**Evidence files** (scratchpad `p18/`, not in the repo):
- `inventory.json`, `student_results.json`, `verify.json`, `analytics.json`, `accounting.json`, `final_checks.json`;
- runtime log extracts `logs_*.jsonl`;
- screenshots in `shots/`;
- browser recordings in `video/`;
- scripts: `setup.py`, `teachers_ui.cjs`, `assess.py`, `students_ui.cjs`, `verify_students.py`, `analytics.py`, `accounting.py`, `final_checks.py`.
