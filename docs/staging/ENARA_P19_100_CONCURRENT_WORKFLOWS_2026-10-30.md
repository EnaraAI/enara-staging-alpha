# ENARA P19: 100 concurrent end-to-end learning workflows (2026-10-30)

| | |
|---|---|
| **Final status** | **PASS_WITH_FINDINGS**: 98 of 100 workflows completed the full journey with real AI. The other 2 were correctly withheld by the grading leak guard (no fake grade) and are in the teacher's exception queue |
| Run window | Barrier **7:07:48 PM Cairo** (17:07:48 UTC) → last workflow 7:27:32 PM Cairo (17:27:32 UTC) |
| Deployment | `dpl_756oCbJoG7VTv7PZTuxh3xrXtiBq` on `enara-staging-alpha.vercel.app` |
| Provider | **Real** Anthropic API through the app's own gateway: `claude-opus-5-5` for tutor and grading, `claude-haiku-5-5` for the dashboard next-steps note. **No mocks** were used in this phase (owner instruction) |
| Results (machine-readable) | `docs/staging/ENARA_P19_100_CONCURRENT_WORKFLOWS_RESULTS_2026-10-30.json` (per workflow, per AI call) |
| Synthetic inventory | `docs/staging/ENARA_P19_100_WORKFLOWS_INVENTORY_2026-10-30.json` (no secrets) |
| Commits / pushes | None |

**Evidence labels**
- **LIVE:** observed on staging.
- **APP-RECORDED:** the application's own ledger and counters.
- **ATTESTED:** stated by the owner.
- **UNVERIFIED:** no independent evidence.

Stop A remains **waived**, not passed.

---

## 1. What changed to make the run possible (owner-approved)

| Change | Why | Approval |
|---|---|---|
| Staging guard maximum $5 → **$10** (`backend/src/config/stagingGuard.ts`, guard test updated) | The expected cost (~$4.1) plus reservation headroom did not fit under $5 | Owner: "$10 run budget" |
| `AI_TEST_SPEND_CAP_USD=10` and a fresh `AI_TEST_SPEND_ID=p19-w100-20261030-192848` | New test window; the counter starts at $0 | Same |
| `JWT_EXPIRES_IN=3h` | The login limit (20 per 15 min per IP) plus 1-hour tokens allow at most ~80 sessions at once from one machine | Owner: "Token life 3h + stagger logins" |
| Provider hard limit ≥ $15 | The ≤ $5 monthly limit would have stopped the run part-way | **ATTESTED** by the owner |
| Deploy `dpl_756o…` | Build `fv3lkerwf`. Smoke-checked (`/health`, `/ready` 3/3) before promotion. Rollback target `dpl_7P8qfkurroswB2iDgcFA4nhRPjWK` | Covered by the "$10 run budget" approval |

**Source:**
- `574010a`;
- the P15/P17 frontend (7 files);
- P19 backend fixes (`autoGrading.ts`, `nextStepsService.ts`);
- `stagingGuard.ts`.

**Mocked harness:** the mocked 100-workflow harness written during preflight was **deleted without being run**, per the owner's "don't ever use a mock provider". No local fault injection was run in this phase (section 10).

## 2. Workload manifest

| Item | Value |
|---|---|
| Users | **100 distinct synthetic students** (`W001`–`W100`, `p19w-*@p19w.staging.enara.test`), each with a unique run id `p19-w100-20261030-Wnnn` |
| Classes | 4 classes of 25 (one batch each, membership enrollment; enrollment model unchanged), 4 synthetic teachers |
| Subjects | Class 1: fractions. Class 2: evaporation. Class 3: water cycle in **Modern Standard Arabic**. Class 4: decimals |
| Content | 2 published lessons per class; one assessment per class (1 MCQ + 1 open response, 2-criterion rubric, 5 points) |
| Diversity | 5 answer qualities per class (strong, correct but weak, partial, misconception, unknown); 5 distinct tutor questions per class, each tagged with the student; alternating lesson order and tutor lesson; random think times (0–25 s) before tutor and submit; 10 replayed submits |
| Workflow steps (same API calls and order as the student UI; P18 logs) | 1 sign-in → 2 dashboard (`/me/dashboard`, `/me/courses`, `/me/assignments`, `/me/next-steps`) → 3 both lessons → 4 tutor session + **real tutor message** → 5 assessment view + start → 6 submit (+ replay for every 10th) → 7–8 poll the result every 4 s (as the result page does) until autonomous release → cross-user probes → 9 reopen results → accounting |
| Product discrepancy (documented, followed) | One curriculum per class, so the 2 lessons are 2 chapters of it. Login happens before the barrier (see section 3) |

## 3. Concurrency model and measurements (LIVE)

- **Sign-in (step 1):** staggered over 80 minutes in 6 batches (13 + 19 + 19 + 19 + 19 + 11) to respect the per-IP login limit. 100/100 succeeded, each token checked against the student's own class. **The login step was not concurrent**, by design and with approval.
- **Steps 2–9: one barrier released all 100 workers at the same instant.**
- **Pacing:** every request went through one client-side pacer at **258 requests/min**, under the app's 300/min per-IP limit. That paces requests, not workflows; nothing was serialised.
- **Tutor cap:** in-flight tutor calls were capped at 25, chosen to keep reservation headroom under the school's $6 daily cap.

| Measurement | Value |
|---|---|
| Workflows active at the same time | **100 for 221 s**; ≥ 90 for 252 s; peak 100 |
| Peak in-flight app requests (client) | 35 |
| Peak in-flight real tutor calls | 25 |
| Peak simultaneous grading | Not directly observable; grading runs in the background on Vercel |
| Requests | 1,996: 1,616 × 200, 200 × 201, **180 × 404** (all deliberate cross-user probes), **0 × 429, 0 × 5xx, 0 timeouts** |
| Request rate | 258/min for the first 6 minutes (the pacer limit), then 20–53/min while waiting on grading |

## 4. Per-step results (LIVE)

| Step | Passed |
|---|---|
| 1 Sign-in (staggered), identity correct | 100/100 |
| 2 Dashboard: own class only | 100/100 |
| 3 Both lessons, content correct | 100/100 |
| 4a Tutor session | 100/100 |
| 4b **Real tutor reply** (user-specific, not a fallback) | **100/100** |
| 5 Assessment visible without answer key; attempt started | 100/100 |
| 6 Submission receipt (and 10/10 replays idempotent) | 100/100 |
| 7–8 **Autonomously graded and released** | **98/100**: W054 and W094 went to `grading_exception` (section 6) |
| 9 Results reopened | 98/98 |

## 5. Latency (LIVE, no SLO exists in the repository; measurements only)

| Metric | p50 | p95 | p99 | Max |
|---|---|---|---|---|
| End to end, completed workflows | 319 s | 354 s | 896 s | 896 s |
| Tutor, client-measured (including the pacer queue) | 28.9 s | 36.1 s | 39.1 s | 39.1 s |
| Tutor-message HTTP request | 13.5 s | 25.7 s | — | 28.6 s |
| Submit → released | 35 s | 94 s | 700 s | 700 s |
| Dashboard `/api/me/dashboard` | 1.0 s | 1.3 s | — | 1.4 s |
| Next-steps (one real haiku call) | 4.1 s | 5.2 s | — | 6.2 s |
| Result poll | 0.68 s | 2.1 s | — | 3.6 s |

**End-to-end times are dominated by the client pacer and think times**, not the app (inferred). The long tail of submit → release (p99 700 s) is the 10-minute product backoff after a leak-guard rejection.

**P18-2 did not recur:** dashboards took 1.0–1.4 s under this load, against 26–33 s in P18. That supports the cold-start hypothesis (inferred).

## 6. Real AI calls and grading (LIVE)

| | Count | Status |
|---|---|---|
| Tutor (`tutor_chat`, opus) | **100** | 100 ok |
| Grading evaluations (`ai_grading`, opus) | **226** = 113 runs × 2 | 226 ok at the provider |
| Next-steps notes (`next_steps_note`, haiku) | **100** | 100 ok (P18-1 fix confirmed live) |
| **Grading runs** | 113 | 98 released; **13 rejected by the feedback-leak guard** (`feedback_leak`, retried by the product); **2 ended in `grading_exception`** after 3 runs (W054, W094: Class 2, misconception answer) |

**Grading correctness:** scores rose with answer quality in every class.

| Answer quality | Scores (out of 5) |
|---|---|
| Strong | 20 × 5/5 |
| Correct but weak | 1–2 (mean 1.8) |
| Partial | 2–4 (mean 2.65) |
| Misconception | 18 × 0/5 (+ 2 exceptions) |
| Unknown | 20 × 0/5 |

Further checks:
- The MCQ was scored by its key in every case.
- Feedback was released only with a valid result.
- No released result contains the model answer.
- Class 3 feedback is in Arabic (MSA).
- No mandatory human step; the 2 exceptions follow the existing policy (teacher queue, no fake grade; the student sees "delayed").

**The leak guard drove all failures:** 13 of 113 runs (11.5%) were rejected. All were wrong, weak or partial answers in Classes 2 and 4, where the AI's corrective feedback restated 8 or more words of the model method. That cost about 13 × $0.028 ≈ **$0.36** in extra paid runs and prevented 2 autonomous completions.

## 7. Data integrity (LIVE, persisted state)

| Check (per workflow) | Result |
|---|---|
| Exactly one submitted attempt; it is the workflow's own | 100/100 (including W054 and W094) |
| Answers stored exactly as submitted; replays did not change them | 100/100 (W054/W094 via the teacher's grading view) |
| Released result = what the workflow saw = the teacher queue = the learner profile (5 per class sampled) | 98/98 |
| Feedback mentions no other student | 98/98 |
| Tutor session bound to own course and lesson; conversation contains only this student | 100/100 |
| No duplicate grades: one `released` per attempt; 1 grading run when not rejected | Confirmed |
| Per-workflow verification checks | **1,178 checks; failures only on W054/W094 completion** (plus the Class 2 queue check that flags those same 2 exceptions) |

## 8. Isolation and authorization (LIVE)

| Test | Result |
|---|---|
| Cross-user probes **during** the concurrent run (another student's result and tutor history, 180 requests) | **180/180 refused (404)**. No authorization decision was reused for the wrong identity |
| Teachers vs other classes (roster, student profile) | 24/24 refused |
| Tutor context leakage across users | None (100 conversations checked) |
| **Gate 2: a second, independent staging tenant** (`inst-c4efd82a7af9`, created through the official ENARA-admin route) | **111/111 probes pass, 0 leaks, both directions.** Covered: students, teachers and admins on courses, lessons, assignments, results, tutor history, rosters, profiles, assessments, curricula, grading, students, classes, batches, tampered `institutionId` queries, cross-tenant enrol and publish, cross-tenant user creation. School B's usage report shows 0 operations; its student list shows only its 2 students |
| Batch-based enrollment | Unchanged (each P19 class has its own batch). P19 B3-1 (cross-class profile visibility) remains an owner decision |

**Live cross-tenant isolation is now verified on staging, within the probed surface.**

## 9. Accounting reconciliation

| Source | Value | Label |
|---|---|---|
| Usage ledger (usage report delta 62 → 488) | **426 rows** = 100 tutor + 226 grading + 100 notes. All succeeded; 0 unknown, 0 failed, 0 refused | APP-RECORDED |
| Per-request ledger (student API, every tutor request) | 100/100 tutor requests have exactly 1 measured row | APP-RECORDED |
| School month spend counter | **+$4.290179** for the run (unknown 0) | APP-RECORDED |
| Runtime `ai_call` logs | 393 of 426 lines retrieved. Vercel's log search drops entries under load, so this is a partial secondary source | LIVE, partial |
| New test-spend counter | Not readable. Indirect evidence: the 50% alert of $10 fired at peak (reservations included) | UNVERIFIED |
| Provider console | — | UNVERIFIED |
| Provider limit ≥ $15 | — | ATTESTED |

## 10. Local fault injection

**Not executed in this phase**, because of the owner's instruction "don't ever use a mock provider". The earlier P19 local results (mocked, clearly labelled, in `ENARA_P19_SCALE_RESILIENCE_MULTI_TENANT_2026-10-30.md` section 7) remain the only fault-injection evidence. They are **not** live resilience proof.

**Live failure observations:**
- 13 leak-guard rejections, each retried by the product and either released or sent to the exception queue;
- no provider 429 or 5xx;
- no app 5xx.

## 11. Spend and budget

| | USD |
|---|---|
| 2-workflow smoke run (live, validates the harness; not counted toward the 100) | ≈ 0.089 (log estimate) |
| **100-workflow run** | **4.290179** |
| Per workflow / per completed workflow | 0.0429 / 0.0438 |
| Estimate before the run | 4.11 expected, 7.7 with headroom: actual matched the expectation |
| New test window used (cap $10) | ≈ 4.38. **≈ $5.62 left** (counter UNVERIFIED) |
| Month to date on the provider (app-recorded) | ≈ 5.08 of the attested ≥ $15 |
| School daily budget ($6, enforced) | Alerts at 50% and 80% fired: **today's committed spend ≈ $5.05** |

**No cap was exceeded.**

## 12. Findings

| Id | Severity | Finding | Recommendation |
|---|---|---|---|
| W-1 | **Medium** | The feedback-leak guard (v1, 8-word rule) rejected 11.5% of grading runs. Two submissions ended without autonomous grades and about $0.36 was spent on rejected runs | Owner decision: enable the existing v2 check, or tell the grader not to restate the model method |
| W-2 | **High** (known: P18-7) | The login limit plus 1-hour tokens make 100 concurrent sign-ins from one network impossible; this run needed 3-hour tokens and 80 minutes of staggering | Decide the P18-7 fix, then **revert `JWT_EXPIRES_IN` to 1h** when testing ends |
| W-3 | **Medium** (known: P19-1) | The 300/min per-IP API limit was the throughput ceiling. It forced pacing, and most workflow time was spent queueing | Decide the P19-1 fix |
| W-4 | **Medium** | The school's daily cap ($6) counts grading spend. One 100-student run used ~84% of it; a second run the same day would have tutor calls refused | Size school budgets for class-scale use, or separate grading |
| W-5 | Low | Runtime-log retrieval is incomplete under load (~8% missing) | Use the ledger for accounting (as done); export logs to a drain |
| W-6 | Info | A school admin cannot create teacher accounts (ENARA admin only) | By design; noted for onboarding |

**No critical security or data-integrity defect.**

## 13. Data created and cleanup (nothing deleted)

| Records | Count |
|---|---|
| P19 cohort | 4 teachers, 100 students, 4 batches, 4 classes, 4 curricula (8 lessons), 4 assessments, 4 + 2 smoke assignments, 102 attempts, 102 tutor sessions |
| Tenant B (`inst-c4efd82a7af9`) | 1 institution, 4 users (admin, teacher, 2 students), 1 batch, 1 class, 1 curriculum, 1 assessment, 1 assignment, 1 attempt, 1 empty tutor session |
| Ledger rows | 434 (append-only) |

- **API key revoked.** There is no delete route for institutions or users, so those remain unless removed in the database.
- Credentials and tokens are in local owner-only files only.
- P16, P17 and P18 records are untouched.

**Staging configuration to restore when testing ends (owner action):**
- `JWT_EXPIRES_IN` back to 1h;
- consider a lower `AI_TEST_SPEND_CAP_USD`;
- the provider limit.

## 14. Unverified and remaining risks

1. Test-spend counter and provider console (section 9).
2. Peak grading concurrency inside Vercel (not observable from the client).
3. Real-provider rate limits: none were hit at a peak of 25 tutor calls. Higher peaks are untested.
4. True concurrent sign-in for 100 users from one network (blocked by design; W-2).
5. Fault injection was not re-run in this phase (owner instruction).

## 15. Decision: **PASS_WITH_FINDINGS**

**Fully met:**
- all 100 workflows started;
- all 100 sign-ins and real tutor interactions succeeded;
- all 100 submissions persisted exactly once;
- all integrity, isolation (including live cross-tenant) and accounting checks passed.

**Not fully met:** 98 of 100 completed autonomous grading. The remaining 2 were withheld by the product's own leak guard and routed to the exception queue, as policy requires. Because not all 100 completed the defined journey, the result is **not PASS**.
