# ENARA P20: true 100-user simultaneous-start load test (2026-10-30)

| | |
|---|---|
| **Current verdict (run 5)** | **PASS_WITH_FINDINGS**: 98/100 full journeys, 0 unsafe releases (section 11.4) |
| **Original verdict (run 1)** | **FAIL**. The database connection layer collapsed at the simultaneous start: **0 of 100 learning journeys completed**. 96 of 100 first page loads timed out (504) |
| Run | One run (no reruns). Released at **20:34:35 UTC (10:34:35 PM Cairo)**; last request ended 20:38:20 UTC (10:38 PM Cairo) |
| Environment | Staging only: `enara-staging-alpha.vercel.app` → `dpl_BgztikQS7KaowoixcuBGo21J6T3G` (F-2 fix, per-user API limiter, $30 test-cap guard). `ENARA_STAGING=true`. Production not touched |
| AI | **No tutor or grading call was reached.** Only 53+ cheap `next_steps_note` calls (`claude-haiku-5-5`, real provider). Spend ≈ **$0.008** |
| Results (machine-readable) | `docs/staging/ENARA_P20_TRUE_100_USER_SIMULTANEOUS_LOAD_TEST_RESULTS_2026-10-30.json` |

**Labels:** **VERIFIED** (observed by me), **APP-RECORDED** (ENARA's own counters and logs), **DERIVED**, **ATTESTED**, **UNAVAILABLE**.

## 1. What was approved and done before the run

The first preflight was BLOCKED (B1–B5, kept in section 9). The owner approved all unblocking steps ("all your requests are approved"):

| Item | Done | Label |
|---|---|---|
| B1 school daily budget | `dailyCapUsd` 6 → **25**, `monthlyCapUsd` 15 → 60 (budget version 2), at 19:02 UTC | VERIFIED |
| B2 test cap | Guard maximum $10 → $30 (code), `AI_TEST_SPEND_CAP_USD=30`, fresh spend id `p20-20261030-64b99a`, deployed | VERIFIED |
| B3 provider budget | Owner attestation accepted | ATTESTED |
| B4 test-spend counter | Derived figure accepted (school counter delta since the spend id) | DERIVED |
| B5 per-IP limit (P19-1) | **Per-user API limit** deployed: 300/min per verified user; invalid tokens fall back to the IP; 3000/min per-IP ceiling. Unit tests 4/4 | VERIFIED |
| Sessions | 100 students logged in within the login limit (batches of 16 every 15.5 min, 18:5x–20:33 UTC); identity verified for each | VERIFIED |
| Budget headroom at launch | School day $6.08 of $25; month $6.11 of $60; test spend ≈ $0.575 of $30 (P19.2 re-test). 0 unknown | APP-RECORDED |

## 2. Load shape (VERIFIED, client side)

- **100 independent workers**, one pre-warmed keep-alive HTTPS connection each, one barrier, one scheduled instant.
- **Start spread 19.8 ms; 100/100 started within 100 ms.**
- Load generator: 43.8 s CPU on 4 CPUs, 36 MB RSS, 3.6 MB in / 3.7 MB out. It was not the bottleneck.
- Journey per student: dashboard, courses, assignments, next-steps, lesson, tutor session and real tutor message, attempt start and submit, result polling, a cross-user probe, then the results page.
- No POST was ever re-sent; a failed step ended that student's journey.
- **Warm-up note:** each worker warmed its connection with `GET /health`. By design `/health` does not open the database, so every function instance met the database for the first time at the start instant.

## 3. Results

### 3.1 Journeys

| | Count |
|---|---|
| Journeys completed | **0 / 100** |
| Failed at step 1–2 (workspace and class data) | 100 / 100 |
| Reached the tutor, submission or grading | 0 |
| Unsafe releases, misassociations, cross-user access | 0 (not reached) |

### 3.2 Requests at the start (400 requests: 4 per student)

| Endpoint | 200 | 504 (60 s function timeout) | 500 | p50 of the 200s |
|---|---|---|---|---|
| `GET /api/me/dashboard` | 3 | **96** | 1 | 12.0 s |
| `GET /api/me/courses` | 15 | 80 | 5 | 26.4 s |
| `GET /api/me/assignments` | 39 | 59 | 2 | 39.7 s |
| `GET /api/me/next-steps` | 88 | 12 | 0 | 39.1 s |
| **Total** | **145** | **247** | **8** | |

Timeline from the start instant:

| Seconds after start | What happened |
|---|---|
| 0–60 | 3 dashboards answered (10.7–12.7 s); 96 dashboards hung until the 60 s function timeout |
| 60–190 | Waves of 504s at about 60, 120 and 180 s, as each student's next request also hit the timeout |
| After 150 | Requests **sent** after 150 s mostly succeeded: 82 of 85 returned 200 |
| 223 | Last failure |
| After the run | `/api/me/dashboard` answered 200 in 1.2 s. The service **recovered on its own** |

## 4. Root cause

### 4.1 Evidence (APP-RECORDED: Vercel runtime logs, 20:34–20:39 UTC)

| Log signature | Count |
|---|---|
| `Task timed out after 60 seconds` | 121 |
| `MongoServerSelectionError` | 49 |
| `MongoNetworkError` | 29 |
| `ReplicaSetNoPrimary` | 23 |
| TLS `tlsv1 alert internal error` (SSL alert 80) **from the MongoDB Atlas hosts** | 40+ |
| "connection pool … was cleared" | present |

Example: `GET /api/me/dashboard` → 500 after 50.2 s, `MongoServerSelectionError: … tlsv1 alert internal error … SSL alert number 80`.

### 4.2 Mechanism (DERIVED)

1. **Connection storm.** The warm-ups did connect each instance (the Vercel entry connects before answering any path, `/health` included). The burst of 400 database requests then made each instance grow its MongoDB pool on demand, towards the driver default `maxPoolSize` of 100 (not set in `config/db.ts`), across 3 replica-set nodes. Vercel may also have added instances for the burst. *Correction after checking:* the staging idle disconnect (`DB_IDLE_DISCONNECT_MS`) is **not set on Vercel**, so it was not a factor.
2. **Atlas refused the TLS handshakes.** "TLS alert 80 / internal error" from Atlas is the symptom of a cluster refusing new connections when its connection limit or connection-rate limit is reached. The driver then saw no reachable primary (`ReplicaSetNoPrimary`).
3. **Slow failure.** `serverSelectionTimeoutMS` is 10 s, but the request path waited on reconnects and retries until the **60 s function limit**. Students got a 504 after a minute instead of a quick, retryable error.
4. **Self-recovery.** Once instances held working connections, later requests succeeded (82 of 85 after 150 s).

**UNAVAILABLE:** the Atlas tier, its connection limit, and Atlas connection metrics (no Atlas console access). The number of Vercel instances is not visible on Hobby.

### 4.3 Why P19 did not see this

P19's 100 workflows were paced (per-IP limit), so instances and connections ramped up. **P20 is the first test with a genuinely simultaneous start**, and the database connection layer is the first thing that breaks.

## 5. AI and spend (APP-RECORDED)

| Source | Value |
|---|---|
| Tutor and grading calls | **0** (no student got past step 2) |
| `next_steps_note` calls in logs | 53 `ok`, `claude-haiku-5-5`, $0.004474. Log retrieval is incomplete under load |
| School day counter | $6.080652 → $6.088642: **+$0.00799**. Authoritative; 0 unknown |
| Test spend (derived, spend id `p20-…64b99a`) | ≈ $0.575 (P19.2 re-test) + $0.008 = **≈ $0.583 of $30** |

## 6. Data integrity after the failure (VERIFIED)

- No attempt, submission or grade was created: every journey failed before the attempt step.
- Post-run check of all 100 students: 100/100 assignment reads returned 200, **0 attempts** on the P20 assignments.
- No P20 tutor session was created (the tutor step was never reached).
- Errors were 500 and 504 only. **No cross-tenant data and no other student's data appeared in any response.**

## 7. Verdict

**FAIL: ENARA staging cannot absorb 100 students starting at the same instant.**

- The failure is in the database connection layer, before any AI call. 96% of students would see their first page time out after 60 s, and the class would recover only after 3–4 minutes.
- **No claim is made about AI capacity** (tutor or grading concurrency) for a simultaneous start, because it was never reached.
- The start spread and provider-concurrency limitations from the preflight still apply.

## 8. Recommendations (each needs separate approval)

1. **Bound the connection pool per instance.** Set `maxPoolSize` (e.g. 5–10) and `minPoolSize: 0` in `config/db.ts`, so 100 instances cannot ask Atlas for thousands of connections.
2. **Fail fast and retryable.** When the database is unavailable, return 503 with `Retry-After` within about 10 s (bounded by `serverSelectionTimeoutMS`, with no buffering beyond it), instead of hanging to the 60 s timeout. The frontend should retry with jitter.
3. **Check the Atlas tier and connection limit** (owner, Atlas console). If it is a shared tier, its connection limits are low; a dedicated tier, or a connection proxy or pooler in front of Atlas, removes the storm.
4. ~~Reconsider the staging idle disconnect~~: not active on Vercel (checked), so no change is needed.
5. **Then re-run P20 once**, with the same harness, and warm-up through a database-touching endpoint (realistic: students sit on the dashboard before the lesson starts) **and** one fully cold variant. Approval needed, as before.

## 8a. Fixes implemented locally (owner request: "implement the fixes locally with tests"). Not deployed, not committed

| Fix | Change |
|---|---|
| Bounded pool | `config/db.ts`: `maxPoolSize` **10** per instance (env `MONGO_MAX_POOL_SIZE`, 1–100), `minPoolSize` 0, `maxConnecting` 2. 100 instances can now ask for at most 1,000 connections instead of 10,000 |
| One short wait | Server selection, waiting for a pooled connection (`waitQueueTimeoutMS`) and mongoose buffering (`bufferTimeoutMS`) all share one limit: 10 s (env `MONGO_SERVER_SELECTION_TIMEOUT_MS`, 1–30 s) |
| Fail fast, retryable | New `config/dbAvailability.ts`. A database-unreachable error (`MongoServerSelectionError`, network, pool-cleared, wait-queue, buffering timeout) answers **503 `SERVICE_UNAVAILABLE` with `Retry-After: 5`**, never a 500 or a 60 s hang. It also marks the database unavailable in that instance for 5 s; meanwhile database paths answer 503 at once. `/health` and static files are unaffected. No internal detail (hosts, driver messages) reaches the client |
| Serverless entry | `serverlessHandler.ts` (used by `vercel.ts`): a failed first connection returns 503 + Retry-After instead of throwing, and does not reconnect during the cool-down (no reconnect storm) |
| Rate-limit store | While the database is unavailable, counts locally instead of waiting on it before the request is routed |
| Frontend | `services/retryPolicy.ts` + `apiService.ts`: **GET only** retries a 503 that has Retry-After, at most twice, waiting Retry-After + 0–2 s jitter (cap 10 s). POST/PUT/PATCH/DELETE are never re-sent |

**Tests (no AI provider; real local MongoDB stopped mid-test):**
- `backend/test/p20DbAvailability.test.ts` **4/4**:
  - pool defaults, override and bounds;
  - error classification;
  - live outage: the first request gets a 503 after **one** selection timeout (1.5 s in the test, 10 s in production), and then **20 requests answered 503 in 51 ms total**; `/health` stays 200; normal answers return once the database is back;
  - serverless entry: 503, one connect per cool-down, serves once connected.
- `frontend/services/retryPolicy.test.ts` **5/5**.
- Regression:
  - backend `tsc` clean;
  - 30 backend test files / **276 tests pass**. 9 files that mock AI services were not run, per the no-mock instruction;
  - frontend `tsc` clean, both builds pass.

**What this does not fix:** Atlas's own connection limit. With the pool bounded, the cluster sees far fewer handshakes, and anything it still refuses becomes a quick, retried 503 instead of a 60 s timeout. Recommendation 3 (Atlas tier) stays with the owner. **A deploy and one re-run of P20 each need approval.**

## 9. Preflight history (first P20 attempt: BLOCKED)

The first preflight (before approval) found five blockers: B1 school daily cap ($0.82 headroom), B2 test cap ($10, guard maximum $10), B3 provider budget unverifiable, B4 test-spend counter unreadable, B5 per-IP API limit (300/min). All were resolved as in section 1. The zero-cost barrier validation from that preflight (warm spread 15.8 ms, cold 48.4 ms) was confirmed by this run (19.8 ms).


## 11. Fix-and-rerun series (owner-approved, same evening)

All runs: 100 workers, one barrier, start spread 17–21 ms, real provider, staging only, no POST ever re-sent.

| Run | Time (Cairo) | Deployment | Change | Journeys completed | Grades released / withheld | Unsafe releases | Spend |
|---|---|---|---|---|---|---|---|
| 1 | 10:34 PM | `dpl_BgztikQS…` | Baseline | **0** | 0 / 0 | 0 | $0.008 |
| 2 | 11:05 PM | `dpl_BJfgPuJD…` | Pool 10, fail-fast 503, frontend GET retry | **22** | 21 / 1 | 0 | $1.07 |
| 3 | 11:28 PM | `dpl_Dp1b9Ayp…` | Full pool = 503 for that request only; pool **30**; harness retries GET 503 like the frontend | **12** | 12 / 0 | 0 | $0.73 |
| 4 | 11:43 PM | `dpl_6imEkenF…` | Pool back to **10**; credit-reservation fix; **fresh assignments** | **64** | 60 / 4 | 0 | $3.05 |
| **5** | **12:20 AM** | `dpl_2CvqKuKy…` | 25 s GET deadline (never during AI calls or writes); per-request memo of student/class reads; one-round-trip budget settle/release and credit release; fresh assignments | **98** | 93 / 5 | 0 | $4.57 |

### 11.1 What each run taught

- **Run 2:** Atlas stopped refusing connections (no TLS refusals). The new limit was the pool wait (`MongoWaitQueueTimeoutError`): one such timeout blocked the whole instance for 5 s. That was the wrong reaction, and it was fixed in run 3.
- **Run 3:** pool 30 brought back Atlas refusals (14 TLS refusals, 11 pool-cleared errors). Atlas's connection ceiling lies between what 10 and 30 per instance produce. **Harness flaw:** the run reused run 2's single-attempt assignments, so 4 students were correctly refused a second attempt (403). Runs 2 and 3 are not a clean comparison.
- **Run 3, new bug found:** two tutor calls returned `402 CREDIT_LIMIT_EXCEEDED` with credits almost unused (10 and 20 of 50,000). The cause was any reservation error, including a database error, being mapped to 402. It was fixed for run 4 (`creditReservationError`: database errors become 503). A live tutor API test (17/17) confirmed both students' credits were fine.
- **Run 4 (best):** 64/100 complete.

### 11.2 Run 4 in detail

| | Value |
|---|---|
| Journeys completed | **64 / 100** |
| Failed at workspace/class data (a page 504) | 24 (6 `Task timed out` logged on `/api/me/courses` and `/api/me/assignments`) |
| Failed at the tutor | 12: 10 × 504 (60 s limit), 2 client connection resets (not re-sent) |
| Simultaneous tutor calls (client) | **peak 50** |
| Tutor latency (client, 64 OK) | p50 34 s, p95 49 s, max 58 s. Sampled provider latency only about 5 s, so **most of the time is spent waiting on the database pool, not the AI** |
| AI calls in logs | All `ok`. No provider 429/529 or overload |
| Grading | 60 released (p50 38 s after submit), 4 correctly withheld (`feedback_leak`, in teacher queues). **0 unsafe releases, 0 misassociations** |
| Cross-user probes | 43/43 refused (404) |
| Persisted state (796 checks) | All pass. The only flags are the 4 withheld attempts, whose answers are hidden from the student by design |
| Teacher queues | Exactly each class's attempts and scores; isolation 12/12 |
| Retries (frontend policy) | 40 GET retries after 503; 39 then succeeded |
| Spend | $3.05 (school day counter, 0 unknown) |

### 11.3 Verdict after the series

**Still FAIL for "100 students at the same instant"; 64% now complete, up from 0%.** AI safety and isolation held throughout. The remaining limit is **database throughput per instance**:
- Atlas's connection ceiling stops the pool from growing beyond about 10;
- requests that make several sequential queries can still add up to more than 60 s of pool waiting.

**Next steps (each needs approval):**
1. A per-request deadline: answer 503 at about 25 s instead of reaching 60 s.
2. Fewer sequential queries on the dashboard, courses, assignments and tutor paths.
3. A connection pooler or a larger Atlas tier (owner).

**Cumulative P20 test spend:** about $5.48 of $30. School day: $10.98 of $25.

### 11.4 Run 5 in detail (after fixes 1 and 2)

**Fixes deployed:**
- **Fix 1:** GET /api answers 503 + Retry-After at 25 s. Writes and any request that has started an AI call keep the platform limit.
- **Fix 2:** measured database round trips per request (driver command monitoring, real local MongoDB, no provider):

| Request | Round trips before | After |
|---|---|---|
| Dashboard | 13 | 10 |
| Courses | 9 | 7 |
| Next-steps | 15 | 12 |
| Tutor message (AI path) | 39 | 37 |

These are now enforced as budgets in `backend/test/p20QueryBudget.test.ts`. Rate limits, budget checks and credit checks were not changed in substance.

**Results:**

| | Value |
|---|---|
| Journeys completed | **98 / 100** |
| Not completed | W095: tutor message hit the 60 s limit (504). W096: attempt start refused 409 `OTHER_ATTEMPT_OPEN`, because its run-3 attempt on the same assessment was left open when that submit got a 503. This is correct product behaviour and a leftover from the earlier run, not a new failure |
| Page loads (p50 / p90) | Dashboard 11.3 / 12.3 s; courses 7.0 / 9.9 s; assignments 6.5 / 16.6 s; **next-steps 25.9 / 37.0 s**; lesson 4.0 / 7.1 s. All 100 succeeded; 8 GET 503s, each retried once and succeeded |
| Tutor | **95 simultaneous**; 99 OK; p50 38 s, p95 54 s, max 58 s. **Close to the 60 s limit: little headroom** |
| Grading | 93 released (p50 57 s after submit), 5 correctly withheld (`feedback_leak`, in teacher queues). **0 unsafe releases, 0 misassociations** |
| Cross-user probes | 94/94 refused |
| Persisted state (1,168 checks) | All pass, apart from the 5 withheld attempts (answers hidden from the student by design) and the 2 journeys above |
| Teacher queues and isolation | Correct per class; 12/12 |
| Spend | $4.57 (school day counter, 0 unknown) |

**Verdict:** **PASS_WITH_FINDINGS.** 98% of 100 students who started at the same instant completed the full real-AI journey. Safety and isolation held.

**Findings:**
1. Tutor replies take 38 s at the median and up to 58 s, against a 60 s function limit. More load, or a slower provider, would bring timeouts back.
2. The next-steps page is slow (p50 26 s).
3. A 503 on submit leaves an open attempt that blocks the student's next assignment on the same assessment until they submit it.
4. Atlas's connection ceiling (pool 30 was refused) remains the hard limit.

**Next levers:**
- streaming the tutor to the client (the streaming endpoint exists), so the 60 s limit applies to time-to-first-word;
- lighter next-steps;
- an Atlas pooler or a larger tier (owner).

**Cumulative P20 test spend:** ≈ $10.05 of $30. School day: $15.55 of $25.

### 11.5 Tutor streaming (after run 5; deployed `dpl_8UTXpvzc…`, not yet load-tested)

**Found:** the existing `/messages/stream` endpoint was not real streaming. It waited for the whole reply, then re-sent it word by word with 15 ms pauses, adding about 2.5 s.

**Now:**
- **Shared turn logic.** `/messages` and `/messages/stream` share one preparation step (session, tutor policy, credit reservation, retrieval, learner snapshot) and one completion step (credits settled or released, both messages saved). Both endpoints apply the same checks.
- **Real streaming.** The stream sends the provider's text as it is generated, through the metered gateway: the ai_call is logged and the budget is settled.
- **Failures.** A refusal or failure mid-reply sends `replace` with the fallback reply and gives the credits back. A student who disconnects stops the generation; it is metered as cancelled and the credits are released.
- **Frontend.** The course-page tutor (`CoursePage.tsx`) uses the stream and shows the reply as it arrives. The chat assistant widget and the assessment-page tutor still use the JSON endpoint.

**Tests:**
- New `p20TutorStream.test.ts`, 3/3, no provider: refusals before the stream are ordinary HTTP errors; the fallback works with the model unconfigured and with it unreachable; credits are given back.
- New `sse.test.ts`, 2/2.
- Full backend run: 296 tests in 33 files pass, without the AI-mocking files.

**Live, on the staging domain (real provider, 2 students):**

| | First word | Complete | Chunks |
|---|---|---|---|
| Previous "stream" endpoint (before the change) | 6.4 s | 9.1 s | — |
| New stream | **4.3 s** | 7.3–7.5 s | 45–48 |

- Headers arrived at 1.4 s.
- Each call recorded once in the usage ledger, measured, nothing unknown.
- The JSON endpoint is unchanged (200).

**Limit that remains:** Vercel's 60 s function limit still applies to the whole stream. Streaming shows words sooner and keeps the connection visibly alive, but a turn that needs more than 60 s in total is still cut. The P20 harness uses the JSON endpoint, so the effect under 100 simultaneous students is **not yet measured**.

## 10. Owner reminders (staging settings to restore after testing)

- `JWT_EXPIRES_IN` back to 1h.
- Test cap and guard maximum ($30), and the school budget ($25/day, $60/month), back to the intended values.
- The provider limit.
- The P19.2 and P20 synthetic records were kept (no cleanup).
