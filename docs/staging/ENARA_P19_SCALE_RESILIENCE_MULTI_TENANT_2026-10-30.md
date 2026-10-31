# ENARA P19: scale, resilience and multi-tenant isolation (2026-10-30)

| | |
|---|---|
| Status | **READY_FOR_OPERATOR_APPROVAL**. Local work complete; Gate 3 deployed; Gates 2 and 4 pending (section 17) |
| Repository / branch | `EnaraAI/enara-staging-alpha` / `staging-alpha` at `574010a` (unchanged on the remote) |
| Live deployment | Baseline `dpl_4Bj8UuVfA4PcTxjq5ZtZdcMs74K1` (P18). **Gate 3 approved and executed:** now `dpl_7P8qfkurroswB2iDgcFA4nhRPjWK` (section 12a) |
| Machine-readable results | `docs/staging/ENARA_P19_RESULTS_2026-10-30.json` |
| Live mutations, deploys, paid calls in P19 | 1 approved deploy (Gate 3); no data mutations; no paid calls |
| Commits / pushes | **None** |

**Evidence labels**
- **LOCAL:** automated tests on an in-memory database with a deterministic mocked provider. They exercise ENARA's own code paths, not the real provider.
- **LIVE:** observed on staging.
- **UNVERIFIED:** no independent evidence was available.

Stop A remains **waived**, not passed.

---

## 1. Executive summary

**Local work is complete, and every in-scope local criterion passes:**

| Suite | Result |
|---|---|
| Two-school isolation, API (new) | **11/11**, including a full route sweep with real foreign ids, tampered queries and bodies, aggregates, background paths and a positive control |
| Two-school isolation, UI (new) | **15/15**, including forged client claims |
| Concurrency levels 3 / 5 / 10 / 20 (mocked provider) | No loss, no duplicates, correct association and accounting |
| Injected provider failures (13 modes) | Grading integrity preserved in every case |
| Budget race tests | The cap holds under 20 concurrent calls |
| Full backend suite | **1069/1069** (78 files) |
| UI learning journey | **43/43** |
| Typechecks and builds | Clean |

**Confirmed defects**

| Id | Severity | Finding | Status |
|---|---|---|---|
| **P19-1** | **High** | The general API rate limit is **300 requests per minute per IP**. A class of 30 behind one school network address (opening the dashboard and reloading once) had **240 of 600 requests refused (40%)** | Reproduced; **owner decision** on the fix |
| P18-7 | **High** | The login limit is **20 per 15 minutes per IP**; **5 of 25** class logins were refused | Reproduced; **owner decision** |
| P18-1 | Low | The dashboard's "next steps" AI note had no cost bound, so a test cap always refused it | **Fixed** with a regression test |
| P18-3 | Low | The teacher's badge read "Admin" | **Fixed** with a UI regression check |
| P18-4 | Low | `releasedAt` recorded the grading run's start time | **Fixed** with a regression test |
| B3-1 | Policy | A teacher of a class sharing a batch sees a student's results from **other classes** in the learner profile | Documented; **owner decision** |
| P18-2 | — | Slow student dashboard on staging | **Not reproduced locally**; needs live timing |

**Not yet proven live:**
- live cross-tenant isolation;
- real-provider concurrency above 3;
- the Atlas test-spend counter;
- provider-console usage.

Each needs an approval gate or access I don't have (section 17).

## 2. Baseline deployment and source revision

| Item | Evidence |
|---|---|
| Branch | `staging-alpha` = `574010aee32bd2fd0493c768ae431baed1cf78c9` (matches `origin/staging-alpha`) |
| Live deployment | `dpl_4Bj8UuVfA4PcTxjq5ZtZdcMs74K1` (alias verified); `/health` 200 |
| Uncommitted work (preserved) | 7 P15/P17 frontend files; P12–P18 tests, harness and docs; now also 2 P19 backend fixes, 1 frontend fix, 2 P19 test files, 1 UI script and the harness extension (section 11) |
| App cap | $4.50 (`AI_TEST_SPEND_CAP_USD`, read in P18 from env metadata; not changed) |
| Cumulative spend | School month counter **698,084 micros ($0.698084)**, read through the ENARA admin API. Usage report: 54 operations, 54 succeeded, 0 unknown. **Unchanged since P18** |
| Reliability of that figure | **Application-recorded** (ledger = counter = report, P18 section 11). The test-spend counter and provider console are **UNVERIFIED** (section 9) |
| Provider-attempt logging | Every attempt gets one `ai_call` log line and one `usage_ledger` row (gateway `meteredMessage`), including failed and retried attempts (section 7) |

## 3. P18 evidence reviewed

Read before this phase:
- the P15, P16, P17 and P18 reports;
- the P18 inventory (`ENARA_P18_SYNTHETIC_INVENTORY_2026-10-30.json`) and its `student_results.json`, `verify.json`, `accounting.json`, `final_checks.json` and `analytics.json`.

Code read before writing tests:
- AI gateway (`aiGateway.ts`, `aiJson.ts`): retry classes are timeouts, connection errors, 408/409/429 and 5xx. Ordinary calls are retried once, and not at all under a spend guard.
- Budget (`aiBudget.ts`, `OrgBudget.ts`).
- Grading (`autoGrading.ts`): lease-based claim, finalisation conditional on owning the run, 3 runs maximum, backoff of 60 s then 10 min.
- Tenant and class authorization in the controllers and middleware.
- The existing P7/P14.9 isolation sweeps.

**What P18 left open:**
- genuine cross-tenant isolation (one tenant only);
- AI failure modes not observed live;
- the Atlas counter;
- provider-console usage;
- P18-1 to P18-7.

## 4. Local tenant-isolation results: **PASS** (LOCAL)

### API suite (`backend/test/p19TenantIsolation.test.ts`, 11/11)

**Fixtures:** two schools, each built **through the real API**:
- 3 classes (two on a shared batch), published and unpublished lessons;
- an MCQ + rubric assessment and assignment;
- 2 submissions graded by the AI grader (mocked) and released;
- 2 tutor conversations;
- usage-ledger rows.

Every school B string carries `TB_`.

| Test | What it does | Result |
|---|---|---|
| Fixtures | Both schools hold every journey record kind (graded attempts with AI feedback, tutor history, ≥ 6 ledger rows) | PASS |
| **Positive control** | The leak detector fires on school B data read by school B itself (roster, tutor session, result, students) | PASS |
| Explicit probes | 19 direct and nested school B resources, read as school A's admin, teacher, academic manager and student: class, student, batch, curriculum (published and draft), assessment (answer keys), attempts, assignment, grading attempt, analytics, course, lesson, result, tutor session, usage record. 10 cross-school writes (publish, assign, regrade, enroll both ways, edit, delete, start attempt, tutor message) | All refused; school B's stored records **unchanged** (digest) |
| Tampered parameters | Every non-parameter GET, as 4 identities, with `institutionId`, `schoolId`, `studentId`, `classId`, `courseId` = school B, `search=TB_`, `q=TB_`, `page`/`limit`/`pageSize=500`, `origin=all` | 0 leaks |
| Tampered bodies | Creates carrying `institutionId: B` (curriculum, batch, user) land in school A; a tutor session on B's course is refused | PASS; school B unchanged |
| Aggregates | School A's usage report total = school A's own ledger rows. Teacher overview and grading queue contain only own class. Institution analytics, students, classes, batches, curricula, learning classes and workspace users show no B data | PASS |
| Background and internal paths | Cron refuses without its secret (401), including for an admin token. A school A view of a school B attempt does not trigger its grading (run count unchanged). Unsigned ingestion is refused | PASS |
| **Full route sweep** | Every route (> 150), as 6 school A identities, with 17 kinds of real school B id, and a tampered body on every write | **0 leaks; school B unchanged** (77 s) |
| Forged client claim | A body with `role: enara-admin`, `institutionId: B` and another `studentId` creates the session for the real caller in their own school | PASS |
| No network | 0 outbound requests | PASS |

### UI suite (`backend/test/ui/p19UiIsolation.cjs`, 15/15)

The browser harness was extended with a second school, including a published lesson, assessment and submission.

| Check | Result |
|---|---|
| School A student, teacher and admin pages | No school B text in the DOM or in any API response across 20 pages |
| Direct requests with school B ids from school A's browser session | Refused (404) or returned no B data |
| **Forged localStorage claims** (`role: enara-admin`, `institutionId: B`), then reload | UI shows nothing from B. The server refused all 5 privileged calls (403) |
| Positive control | School B's own student sees its `TB_` data |

**Not covered:** the HMAC-signed ingestion path trusts the `schoolId` in the signed payload. That is by design (service-to-service); anyone holding `INGEST_HMAC_SECRET` can write to any school. Recorded as a trust boundary, not a defect.

## 5. Same-tenant class access findings (B3)

Pinned in `p19TenantIsolation.test.ts`; observed behaviour, nothing changed.

| Case | Observed | Classification |
|---|---|---|
| Teacher 2 (class 2, own batch) vs class 1 | Roster, student profile and grading attempt refused; grading queue shows none of class 1 | **Intended class-level isolation** |
| Teacher 3 (class 3, **same batch** as class 1) | The class 3 roster lists class 1's batch students (s1, s2), not s3 | **Intended batch-level visibility** (documented rule: every student of a batch is in every class on it) |
| Same teacher 3 | Class 1's roster and grading attempts refused; class 1 attempts absent from the queue | Intended class-level isolation |
| **Same teacher 3 → profile of shared-batch student s1** | **200, and it shows s1's class 1 result and submission title** (class 1 is taught by teacher 1) | **B3-1: owner decision.** The learner profile lists results from every class the student is in, to any teacher who has the student in any class. Not UI-only filtering: the server returns it. It is a consequence of profile scope plus the batch rule, not an id-guessing leak |
| Student on a shared batch | `/api/me/courses` lists class 1 and class 3 | Batch rule (intended) |
| Forged body claims | Ignored; scope comes from the server-side token | Server-side enforcement confirmed |

**Decision needed (B3-1):** should a teacher's learner-profile view be limited to results from the classes that teacher teaches? The enrollment model was not changed.

## 6. Concurrency levels and measurements (LOCAL, mocked provider with 150 ms latency)

**Each level:**
1. N students send a tutor message at the same moment.
2. Then N students submit at the same moment.
3. Each submission is graded by the real pipeline (2 evaluations per open response).
4. Release is awaited.

| Level | Requests | Failures | Tutor p50 / p95 / max (ms) | Submit→release p50 / p95 / max (ms) | Provider calls | Ledger rows | Duplicates | Lost | Association errors |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 12 | 0 | 319 / 321 / 321 | 285 / 289 / 289 | 9 | 9 | 0 | 0 | 0 |
| 5 | 20 | 0 | 347 / 353 / 353 | 321 / 333 / 333 | 15 | 15 | 0 | 0 | 0 |
| 10 | 40 | 0 | 476 / 483 / 483 | 404 / 440 / 440 | 30 | 30 | 0 | 0 | 0 |
| 20 | 80 | 0 | 577 / 583 / 584 | 669 / 687 / 752 | 60 | 60 | 0 | 0 | 0 |

**Per level, also checked:**
- exactly one grading run per attempt, and one attempt per student;
- feedback contains the student's own marker;
- every ledger row `ok` with a unique `operationKey`.

**p99** is not reported: samples of 3–20 are too small for it to mean anything.

**Real-provider capacity:** not measured. These are app-side results with a fixed mock latency. Live P18 concurrency (3 at once, real provider) remains the only real-provider evidence.

**School network (one IP), reproduced:**

| Scenario | Result |
|---|---|
| 30 students open the dashboard and reload once (600 requests) | **240 refused (429 `RATE_LIMITED`)**. Cause: the general limiter, `app.ts:137`, 300/min, keyed per IP |
| 25 students log in within 15 minutes | **5 refused (429)**. Cause: the login limiter, `app.ts:112`, 20 / 15 min per IP |

**Student dashboard (P18-2 investigation):**
- 20 concurrent sessions: `/api/me/dashboard` p95 192 ms, `/api/me/achievements` 94 ms, `/api/me/courses` 130 ms, `/api/me/assignments` 129 ms.
- The dashboard runs about 3 queries per enrolled class plus a fixed set (code-read). There is no per-assignment fan-out.

**Conclusion:** the 26–33 s seen on staging in P18 is **not reproduced locally**. The hypothesis is cold starts, the idle-disconnect database reconnect (`dbIdleDisconnectMs`) and Atlas round trips under new instances. This needs live timing, which costs nothing because the dashboard calls no paid AI before the P18-1 fix is deployed.

**No SLO exists in the repository**, so no thresholds are claimed. The owner should set dashboard and tutor latency targets.

## 7. AI failure and recovery results (LOCAL)

Each mode was injected into the real grading pipeline through the HTTP API (`p19Resilience.test.ts`, section D1).

| Mode | Within-run behaviour | Attempt state | Student sees | Recovery | Ledger |
|---|---|---|---|---|---|
| Timeout | Retried once per evaluation call | `grading_failed`, retry scheduled; **no score** | "processing" status, nothing released | Next run releases **once**, score 100 | 4 rows `error/usage_unknown`, null cost |
| Rate limit (429) | Retried once | Same | Same | Same | 4 rows `error/usage_unknown` |
| Rejection (400) | **Not** retried | Same | Same | Same | 2 rows `error/usage_unknown` |
| Network interruption (ECONNRESET) | Retried once | Same | Same | Same | 4 rows |
| Overloaded (529) | Retried once | Same | Same | Same | 4 rows |
| Invalid structured response | Validation retry | Same | Same | Same | 4 rows `ok`, measured (tokens were used) |
| Truncated (`max_tokens`, partial JSON) | Never accepted; validation retry | Same | Same | Same | 4 rows `ok`, measured |
| Missing usage metadata | — | Released | Result | — | Rows `usage_unknown`, **null cost (never 0)**; test-spend counter `unknownMicros > 0` (exposure kept) |
| Missing cost metadata (unpriced model) | — | Released | Result | — | Rows `unpriced`, null cost; reservation kept whole (`unknownMicros > 0`) |
| Duplicate delivery (2 concurrent runs + sweep + result kick) | Lease: the others are `skipped` | **1 run**, **1 release** | — | — | 2 calls only |
| Application cancellation (process killed mid-run) | Lease held: no reclaim while valid | After lease expiry the sweep runs again | — | Released once (2 runs) | — |
| Failure after the provider answered, before the grade was stored (injected write failure) | Caught | `grading_failed`; **no score** | — | Next run releases once | **4 rows: paid twice, ledgered twice** (expected cost of this failure) |
| Three failed runs | — | `grading_exception`, no score; **no automatic 4th run** | — | Teacher regrade (exception path only, existing policy) | — |

**Integrity in every mode:**
- no silent grade after a failed run;
- no duplicate final grade (one `released` history entry);
- the original submission is preserved;
- feedback is released only with a valid result.

**Live failures:** none occurred naturally in P19, because no live AI calls were made. Live status is NOT_LIVE_VERIFIED for all modes except two earlier observations:
- P17: feedback-leak rejection → retry → correct release;
- P18: the test-spend guard refusing unbounded calls.

## 8. Budget reservation and cap tests (LOCAL)

| Test | Result |
|---|---|
| Below the cap: the call reserves and runs | PASS |
| Over the cap: refused **before** the provider (`AI_TEST_SPEND_CAP`, 0 provider calls) | PASS |
| **20 concurrent tutor calls, cap fits 4.5 reservations** | **4 admitted, 16 refused, 0 lost.** Only the 4 admitted reached the provider. Committed spend never exceeded the cap (cap 427,995 micros; settled 5,600 micros after the real, smaller costs) |
| Provider failure after reservation | Reservation kept as **unknown exposure** (fails safe, not free) |
| Missing usage or unpriced model under the cap | Counted as unknown exposure, never zero |
| P18-1 fix: bounded next-steps note | Admitted under the cap and metered; refused before the provider when the cap is spent; page still works (fallback) |
| Existing suites (unchanged, passing) | `p14_3TestSpendEnforcement` (concurrent oversubscription, reused keys, in-flight attempts, failed settlement, per-attempt retries); `p0dBudget` (daily / monthly / per-user caps under concurrency, stale reservations, store failure fails closed); `p14_2GradingTestSpend` |

## 9. Usage Ledger and provider accounting reconciliation

| Source | Status in P19 |
|---|---|
| Application Usage Ledger (via API) | **Application-recorded**: 54 operations, 0 unknown, unchanged since P18 |
| School spend counter (ENARA admin API) | **Application-recorded**: 698,084 micros = ledger (P18 reconciliation, exact) |
| Per-request token counts and costs | Application-recorded (P18: 45/45 request ids) |
| **Atlas test-spend counter** `test_spend:p14-live-…` | **UNVERIFIED.** No API exposes it. A read-only direct database read with the staging connection string was **refused by this session's permission policy** and not retried. It needs the owner to grant the read or to read it in Atlas |
| **Provider-console usage** | **UNVERIFIED** (no console access) |
| Provider cap ≤ $5 | **Operator-attested** (P18), not independent |
| Estimated cost | Catalogue estimates ($4 / $20 per million tokens for Opus 5.5) |

**Exact reconciliation is not claimed**, because two required sources are unavailable.

## 10. Full learning regression results (LOCAL)

| Suite | Result |
|---|---|
| Backend vitest (all) | **78 files, 1069/1069** |
| `p15LearningJourney` | 14/14: teacher → lesson → publish → assessment → student → tutor → submission → grading → release → analytics → accounting |
| UI learning journey (rebuilt bundle with the P19 fixes) | **43/43**, including the new P18-3 badge check |
| P18 live workflow | PASS on staging (P18), not re-run live in P19 |
| Typechecks | Frontend and backend clean |
| Deployment-candidate build | Frontend `tsc` + vite build and backend build pass on a clean export (section 12) |

## 11. Confirmed defects and fixes

| Id | Severity | Reproduced | Root cause | Fix | Regression coverage |
|---|---|---|---|---|---|
| **P19-1** | **High** (scale) | LOCAL: 240/600 refused | `app.ts:137`: the general `/api` limiter is keyed **per IP** (`perUser=false`), 300/min. The code already makes `/api/learning` per-user because "a class doing diagnostics shares the school's IP address" | **Not applied: owner decision** (security control). Proposed: for requests with a **verified** token, key by user id; keep per-IP for unauthenticated traffic. Keying by the raw `Authorization` header, as the existing `perUser` helper does, would let forged tokens bypass the IP limit | `p19Resilience` C1b |
| **P18-7** | **High** (scale) | LOCAL: 5/25 refused | `app.ts:112`: login limiter 20 / 15 min **per IP** | **Not applied: owner decision.** Proposed: a per-account limit, plus a higher per-IP ceiling sized for a school | `p19Resilience` C1c |
| P18-1 | Low | LOCAL and LIVE (P18: 42 refusals) | `nextStepsNote` called the gateway without a cost bound, so a test cap refused it every time (and uncached, so retried on every dashboard load) | `backend/src/services/nextStepsService.ts`: `meteredMessage` with `bound` = input text tokens + `max_tokens` 300 (same pattern as the tutor and grader) | `p19Resilience` E3 "P18-1 regression" |
| P18-3 | Low | LIVE (P18 screenshot) | The user badge showed the UI role (`admin`) | `frontend/components/Layout.tsx`: show "teacher" or "academic manager" from the backend role | UI journey check "P18-3" |
| P18-4 | Low | LIVE (P18) and LOCAL | `releasedAt`/`finalizedAt` used the run's start time `now` | `backend/src/services/autoGrading.ts`: `new Date()` at the final write | `p19Resilience` E3 "P18-4 regression" |
| B3-1 | Policy | LOCAL | The learner profile spans all of a student's classes | **Owner decision** | `p19TenantIsolation` B3 (logged) |
| P18-2 | — | Not reproduced locally | Hypothesis: environment (cold start, database reconnect) | Needs live timing (Gate 4a, no AI cost) | `p19Resilience` dashboard latency |

**Behaviour change after deployment (P18-1):** the next-steps note will start making real AI calls on staging, about one call per student per day (`claude-haiku-5-5`, `max_tokens` 300). That spend falls under the test cap.

**Files changed in P19:**
- Runtime:
  - `backend/src/services/nextStepsService.ts`
  - `backend/src/services/autoGrading.ts`
  - `frontend/components/Layout.tsx`
- Tests and harness:
  - `backend/test/p19TenantIsolation.test.ts`
  - `backend/test/p19Resilience.test.ts`
  - `backend/test/ui/p19UiIsolation.cjs`
  - `backend/test/ui/journeyServer.ts` (second school)
  - `backend/test/ui/p15UiJourney.cjs` (P18-3 check)
- Docs:
  - this report
  - `ENARA_P19_RESULTS_2026-10-30.json`

All earlier uncommitted work is preserved.

## 12. Deployment manifest (Gate 3, **prepared, not executed**)

| | |
|---|---|
| Base | `git archive` of `origin/staging-alpha` = `574010a` |
| Overlay | The 7 P15/P17 frontend files already live in `dpl_4Bj8…`, plus 2 backend P19 fixes. `Layout.tsx` is updated in place |
| Excluded | Untracked `backend/src/scripts/p12*.ts`, all tests and harness, docs (verified: the compiled backend contains no p12 scripts) |
| Build evidence | Clean export: frontend `tsc` OK, vite build OK, backend `tsc` build OK |
| Environment | Unchanged; no env, cap or key changes |
| Command | `vercel deploy --prod --skip-domain --yes` from `scratchpad/p19-deploy-src`; smoke test (`/health`, `/ready`, login, bundle contains the badge change); then `vercel promote <url>` |
| Rollback | `vercel rollback dpl_4Bj8UuVfA4PcTxjq5ZtZdcMs74K1` (current, keyed) |
| Expected runtime changes | Teacher badge; accurate `releasedAt`; next-steps note becomes billable under the cap |

| sha256 (12) | File |
|---|---|
| `e36f16c846ff` | `backend/src/services/autoGrading.ts` |
| `4dcb757081c0` | `backend/src/services/nextStepsService.ts` |
| `eb5309252956` | `frontend/App.tsx` |
| `e343e7e3e30c` | `frontend/components/Layout.tsx` |
| `72381d844541` | `frontend/pages/AssessmentCenter.tsx` |
| `7b4450d792dc` | `frontend/pages/CurriculumCenter.tsx` |
| `a773e393788b` | `frontend/pages/StudentDashboard.tsx` |
| `54fbe9c17a42` | `frontend/services/apiService.ts` |
| `7015fb8d1442` | `frontend/services/roleRouting.ts` |

P19-1 and P18-7 are **not** included; they await the owner's decision.

## 12a. Gate 3 executed (owner approval: "approve gate 3 deploy")

| Step | Evidence |
|---|---|
| Source | The section 12 manifest (fingerprints re-checked before upload) |
| Deploy | `vercel deploy --prod --skip-domain` → **`dpl_7P8qfkurroswB2iDgcFA4nhRPjWK`** (`enara-staging-alpha-nvm8b3oao.vercel.app`), created 15:18:35Z. The main address stayed on `dpl_4Bj8…` until the smoke checks passed |
| Smoke test (deployment URL) | `/health` ok; `/ready` ready 3/3 (mongo ok, postgres ok). Bundle `index-CZN7pjQz.js` contains the P18-3 badge change and the P17 publish-to-class code |
| Promote | `vercel promote` → `enara-staging-alpha.vercel.app` = `dpl_7P8q…` |
| After promote | `/health` and `/ready` 4/4 ok. Live bundle `index-CZN7pjQz.js` |
| UI check on staging (no AI) | P18 Teacher A: badge reads **Teacher** (P18-3 fixed live); header "Teaching"; 0 AI-triggering requests |
| Not checked live | P18-1 (would make a paid call: Gate 4) and P18-4 (needs a graded submission: Gate 4). Both are covered by local regression tests |
| Rollback | `vercel rollback dpl_4Bj8UuVfA4PcTxjq5ZtZdcMs74K1` (Ready) |
| Unchanged | Environment, caps and keys; no data changes; no commit or push |

**From now on**, any student dashboard load on staging can make one small paid next-steps call per student per day, under the test cap.

## 13. Live tests actually executed in P19

Read-only (plus the approved Gate 3 deploy in section 12a):
- deployment identity;
- `/health`;
- school counter and usage report (2 admin logins).

**No live AI calls, no live record creation, no second tenant.** One deploy (Gate 3, approved).

## 14. Spend and remaining budget

| | |
|---|---|
| P19 spend | **$0** |
| Cumulative (school counter, application-recorded) | **$0.698084** |
| Remaining under the $4.50 app cap | **≈ $3.80** (test-spend counter UNVERIFIED) |
| Provider cap | ≤ $5, operator-attested |

## 15. Data inventory and cleanup status

**Live:** nothing created in P19. The P16, P17 and P18 records are untouched (P18 inventory unchanged).

**Local:** in-memory databases only, discarded after each run.

**Housekeeping:** an older local scratch file holding environment values (`env.staging.before`, from an earlier phase) was readable by all local users (mode 644). It is now owner-only (600). It is not in the repository.

## 16. Unverified items

1. Live cross-tenant isolation: needs Gate 2.
2. Real-provider concurrency above 3 and real-provider capacity: needs Gate 4.
3. Live failure modes (rate limit, timeout, rejection, invalid output, missing usage, budget exhaustion): NOT_LIVE_VERIFIED. Covered locally (section 7).
4. Atlas test-spend counter: direct read refused by policy.
5. Provider-console usage and the provider cap.
6. The P18-2 dashboard latency cause on staging.
7. p99 latencies (samples too small).

## 17. Final evidence-based decision: **READY_FOR_OPERATOR_APPROVAL**

| Acceptance criterion | Status |
|---|---|
| 1. Local cross-tenant isolation suite passes | ✅ API 11/11, UI 15/15 |
| 2. Same-tenant class access documented | ✅ Section 5 (B3-1 decision needed) |
| 3. Concurrency without unexplained loss or duplication | ✅ LOCAL levels 3–20. ⏳ Real-provider levels need Gate 4 |
| 4. AI failure handling preserves grading integrity | ✅ LOCAL, 13 modes |
| 5. Budget reservations correct under concurrency | ✅ LOCAL |
| 6. Usage accounting reconciled to the approved scope | ◐ Application-recorded only. Atlas counter and provider console UNVERIFIED |
| 7. Full learning regression passes | ✅ LOCAL (1069/1069, UI 43/43) |
| 8. Live cross-tenant tests before claiming live isolation | ⏳ **Not claimed**; Gate 2 |
| 9. Live vs local failure evidence distinguished | ✅ |
| 10. No spending cap exceeded | ✅ ($0 spent) |
| 11. No unresolved critical security or data-integrity defect | ✅ No critical defect. P19-1 and P18-7 are availability (High) issues with owner decisions pending |

### Approval requests

**Gate 2: second staging tenant (no AI cost).**
1. As ENARA admin, `POST /api/integrations/institutions` creates "P19 Tenant B (synthetic)" with an admin login and an integration API key.
2. Through the API: 1 teacher, 2 students, 1 class, 1 published lesson, 1 MCQ-only assessment (no AI grading), 1 submission, plus 1 tutor session with no message.
3. Re-run the explicit probes, tampered-parameter probes and aggregate probes from section 4, as P18 school users against tenant B ids **and the reverse**: about 60 read-only requests plus about 10 refused writes.

Cleanup:
- revoke the API key (`/api/integrations/api-keys/:id/revoke`);
- archive or delete the assignment, assessment, curriculum, class and students through the API;
- **there is no institution or user delete route**, so the institution and 4 users stay in the database unless the owner removes them there;
- everything recorded in an inventory.

Risk: low; a synthetic tenant on staging only.

**Gate 3: deploy the three low-severity fixes.** ✅ Approved and executed (section 12a).

**Gate 4: live workload.**

| Part | What | Cost |
|---|---|---|
| 4a. Dashboard timing (P18-2) | 10 P18 students' dashboard loads, timed | $0 before the Gate 3 deploy; about 10 × $0.001 after it |
| 4b. Real-provider concurrency, level 5 | Reuse P18 students: new assignment, 5 tutor + 5 submissions at the same moment (≈ 15 calls) | ≈ $0.21 |
| 4c. Real-provider concurrency, level 10 | Only if 4b is clean: ≈ 30 calls | ≈ $0.42 |

**Total for 4b + 4c:** ≈ $0.63 expected, ≤ $1.50 worst case including retries. Remaining is ≈ $3.80.

Gate 4 conditions:
- **Method:** API-driven, to avoid tripping the per-IP limiter (P19-1) from one machine.
- **Maximum concurrency:** 10.
- **Stop conditions:** any provider 429 or 5xx, any lost, duplicate or misassociated record, a ledger ≠ counter mismatch, spend above $1.50, or an exception state.
- **No automatic paid retries** beyond the product's own grading retry.
