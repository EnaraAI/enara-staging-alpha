# ENARA — Release Readiness Report (post-hardening)

| | |
|---|---|
| Date | 2026-11-01 (UTC) |
| Code | `f5dd116` plus the **uncommitted** P22 working-tree changes (`PROVENANCE_SNAPSHOT.json`) |
| Deployed state | **UNKNOWN.** None of these changes are deployed. |
| Evidence classes | `CODE-VERIFIED`, `TEST-VERIFIED` (run in this task), `MOCK-ONLY`, `LIVE-PROVIDER-VERIFIED` (earlier dated reports), `STAGING-VERIFIED` (earlier dated reports, earlier builds), `DOCUMENTED-ONLY`, `UNKNOWN`, `NOT RUN` |

## 1. Gate matrix

| # | Gate | Status | Evidence | Remaining |
|---|---|---|---|---|
| 1 | Role / permission matrix | **PASS (local)** | TEST-VERIFIED: `p7RoleMatrix` (every API route called as every test identity) passes; p22 role tests | Deployed re-run |
| 2 | API docs exposure | **PASS (local)** | `docsGate` 404 without a password; `apiDocs.test.ts`, p22 | Set `API_DOCS_PASSWORD` on staging (operator) |
| 3 | Tenant / class / student isolation | **PASS (local), residual P2** | Scoped queries plus p7 cross-school tests; learning-gap query school-filtered | R-14: add `institutionId` to studentId-only learning queries |
| 4 | Authentication, sessions, disable, suspend, invite, reset | **PASS (local)** | p22 action 6 and workstream A tests; pages built (type-checked, not browser-tested) | Email delivery not configured (operator); browser test |
| 5 | Documents, no-scanner policy, R2, signed links | **PASS (local), BLOCKED backfill** | p22 workstream B (7 tests) | Legacy R2 object re-key (operator); videos as media (OD-3) |
| 6 | Analytics privacy / model minimisation | **PASS (local)** | `assistantData` test; Academic Manager / ENARA Admin / student 403 | Router benchmark stays below target; router off |
| 7 | AI spend: reservation, monotonic cap, grading under cap, unpriced fail-closed | **PASS (local), BLOCKED prices** | p22 action 4 and workstream D; `p20Accounting`, `p6StagingGuard` | The four unpriced ceilings (OD-1); provider-side limit; invoice reconciliation |
| 8 | Analytics correctness (one definition) | **PASS (local)** | `scoreMetrics` unit test; journey step 11 | Withdrawn status (R-12) |
| 9 | Assessment scope and release semantics | **PASS (local)** | Arabic 400; manual release holds; auto releases | — |
| 10 | Grading safeguards | **PASS (unchanged)** | `gradingPolicy`, `p19_1LeakGuard`, `p21ExamEvidence`; autonomous grading itself is MOCK-ONLY locally | Live grading re-check on the new build |
| 11 | Audit trail and alerts | **PASS (local), BLOCKED delivery** | Append-only test; alerts persisted | Alert sink, on-call owner |
| 12 | Cron, readiness, staging guard | **PARTIAL** | `/ready` expanded; cron isolated; guard tests pass | Scheduler decision; backup/restore; R2 connectivity check |
| 13 | Full learning loop | **PARTIAL** | Provider-free journey 7/7 (§3) | AI tutoring and open-answer grading on the deployed build (§4) |
| 14 | Accessibility / RTL / mobile | **NOT RUN** | No automated tool installed | Manual audit (runbook §9) |
| 15 | Performance | **UNKNOWN** | 2.68 MB single bundle; no load test | Plan (runbook §10) |
| 16 | Privacy governance (DPA, retention, erasure) | **BLOCKED** | Data-flow matrix written | Legal review; retention decisions |
| 17 | Pilot operations | **BLOCKED** | Runbook written | Pilot institution, owners, metrics approval |
| 18 | Deployment identity and reproducibility | **UNKNOWN** | 13 local commits not on the cached remote; changes uncommitted | Commit, push and record the deployment |

## 2. Release decisions

| Level | Decision | Conditions / reasons |
|---|---|---|
| Internal development | **GO** | Local build and the provider-free suite pass. |
| Synthetic-data staging | **GO WITH CONDITIONS** | (1) Owner reviews, commits and pushes this diff. (2) Deploy, then smoke-check role, isolation, download and cap behaviour on the deployed URL. (3) `API_DOCS_PASSWORD` is set. (4) Read back the cap ($50 or less) and the provider-side limit. (5) Avatar and speaking exams stay off until OD-1 is set. |
| Invited external teachers (synthetic students) | **NO-GO now** | The staging conditions above, plus: an email path or operator-issued invitation links; an alert sink or a named person watching `alert_events`; budgets enabled for the test school; accessibility spot-check; the live re-check (§4) passing. |
| Pilot with real student data | **NO-GO** | All of the above, plus: privacy/legal review (DPA, sub-processors, retention, erasure); a confirmed pilot institution and owners; backup/restore tested; R2 legacy backfill; withdrawn-status model (R-12) or an explicit roster process; grading agreement checked on the school's own work; accessibility audit. |
| Broader production | **NO-GO** | A successful, measured pilot, plus all of the above, plus a malware-scanner decision for real schools, code splitting/performance, and on-call. |

## 3. Learning-journey matrix (P12 successor)

Test: `backend/test/p22LearningJourney.test.ts`. Run in this task: 7/7 PASS, synthetic school, no provider.

| Step | Result | Note |
|---|---|---|
| Assessment creation (teacher-written, API) | **PASS** | AI drafting: NOT RUN (needs a provider) |
| Publication / assignment | **PASS** | |
| Student attempt (no keys visible) | **PASS** | |
| Autonomous grading (answer key) | **PASS** | AI grading of open answers: MOCK-ONLY locally; LIVE-PROVIDER-VERIFIED on earlier builds (P16–P20) |
| Safe result release | **PASS** | Auto policy |
| Evidence / mastery update | **PASS** | LearningEvidence and StudentObjectiveMastery written |
| Gap identification (teacher only, own class) | **PASS** | Other school's teacher refused |
| Targeted intervention | **PASS (record)** / **NOT RUN (AI tutoring)** | |
| Unassisted reassessment | **PASS** | Tutor refused (`TUTOR_BLOCKED`) while the attempt is open; no keys or feedback leak |
| Measured progress | **PASS** | 0% → 100% from attempt records; mastery estimate rose |
| Analytics report / chart | **PASS** | Chart total equals table total, from one backend result |
| Method effectiveness fed back to method choice | **NOT IMPLEMENTED** | Adaptive efficacy is not proven (R-13) |

The earlier P12 contradiction (narrative 0→100% versus log 85.7%) is superseded: the figure here is computed from records.

## 4. Budget-bounded live plan (prepared, NOT RUN)

Run only on the deployed P22 build, with synthetic accounts, after owner approval.

| Probe | Calls | Max retries | Model | Worst-case reserve each | Max |
|---|---|---|---|---|---|
| Teacher AI draft (English, 4 questions) | 1 | 1 | tutor model | ≈ $0.17 (P12 observed reservation) | $0.34 |
| AI grading (2 students × 1 open answer × up to 3 evaluations) | 6 | 1 | tutor model | ≈ $0.06 | $0.72 |
| Tutor turns during hints-only work (2 students × 2) | 4 | 1 | tutor model | ≈ $0.05 | $0.40 |
| Educator Chat document Q&A | 2 | 1 | tutor model | ≈ $0.05 | $0.20 |
| **Total ceiling** | | | | | **≈ $1.66** (set the test-spend window so that at most $2 remains) |

Expected outputs:
- draft never published automatically;
- grades released, with feedback that passes the leak guard;
- tutor refuses while a blocked assignment is open;
- citations validated;
- ledger, usage report and environment counter agree.

Afterwards, reconcile against the provider console (operator).

## 5. What is genuinely ready now (locally)

All P0 code controls listed in the gate matrix are implemented and test-verified locally, and the build passes.

## 6. Owner decisions still required

| ID | Decision |
|---|---|
| OD-1 | Values for `SPEAKING_EXAM_STT_MAX_USD_PER_REPLY`, `SPEAKING_EXAM_MAX_REPLY_SECONDS`, `ANAM_SESSION_RESERVE_USD`, `ANAM_MAX_SESSION_SECONDS`, or keep both features off. |
| OD-2 | Canonical staging domain (`test.enara.app` versus `enara-staging-alpha.vercel.app`). |
| OD-3 | Lesson videos (uploaded media, no scan) stay playable as media, or are blocked like documents. |
| OD-4 | Daily scheduler for `/api/cron/daily`. Staging currently has none, by design. |
| OD-5 | Retention periods for logs, ledger, audit, alerts and conversations; export and erasure workflow. |
| OD-6 | Sonnet 5.5 for assessment drafting. One model setting drives drafts, grading and the tutor today. |
| OD-7 | Pilot institution, owners, success metrics and stop thresholds. |
| OD-8 | Key rotation for keys previously pasted in chat. |
| OD-9 | Malware scanner before real-school use. |

## 7. Statement

No commits, pushes, deployments, promotions, remote migrations, flag, budget or DNS changes, key rotations or paid provider calls were made in this task. No remote service was contacted.
