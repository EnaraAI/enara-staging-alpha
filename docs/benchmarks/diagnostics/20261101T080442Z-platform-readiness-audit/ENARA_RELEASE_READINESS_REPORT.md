# ENARA — Release Readiness and Pilot Audit

| | |
|---|---|
| Audit date | 2026-11-01 (UTC) |
| Commit audited | `f5dd116`, local branch `claude/codebase-review-kbxqan`, repository `enara-staging-alpha`. The working tree is clean. |
| Remote state | `origin/staging-alpha` is at `574010a` **in this checkout's cached refs**. The local branch is 13 commits ahead. The real remote state was not fetched. |
| Deployed state | **UNKNOWN to this audit.** The last repository-documented deployment is `dpl_AcKtqm8NUQvRcyFPmQJqXPvMoBWN` (P21, 2026-10-31) on `enara-staging-alpha.vercel.app`. The session record (not a repository report) names `dpl_Hw32FB6bvgv7bXoh6awf62o9JgLb` (`f5dd116`) promoted on 2026-11-01, with `test.enara.app` pointed at it. |
| Labels | As in `ENARA_PRODUCT_DOCUMENTATION.md`. Every gate below cites its evidence. |

## 1. Checks actually run during this audit

| Check | Command | Result |
|---|---|---|
| Backend type-check | `cd backend && npx tsc --noEmit` | exit 0, no output |
| Frontend type-check | `cd frontend && npx tsc --noEmit` | exit 0, no output |
| Provider-free backend tests | `cd backend && npx vitest run <40 files>` with provider keys unset. The list is in `EVIDENCE_INDEX.md` §2. | **40 files: 39 passed, 1 failed. 417 tests: 416 passed, 1 failed.** 75 s. |
| API docs operation count | `npx vitest run test/apiDocs.test.ts -t "lists every mounted route"` | 233 paths, 275 operations |
| Secret-pattern scan | `git grep` for key, URI, private-key and JWT patterns (paths only) | Synthetic placeholders in 3 test files only |
| Git state | `git status`, `git log`, `git for-each-ref` | Clean tree; 13 local commits not in `origin/staging-alpha` |

### What was not run, and why

- **The 48 test files that mock or fake the Anthropic SDK, ElevenLabs, the orchestrator or the tutor model.** The owner's standing rule forbids running tests that mock the Anthropic SDK or the tutor model; files that fake other providers were excluded the same way.
- **5 further files that stub `fetch`, use the SDK with a fake upstream, or spawn a server against an external-looking host:** `p12HardCap`, `p20QueryBudget`, `p20TutorStream`, `proactive`, `p6FrontendStaging`.
- **Browser UI suites** (`backend/test/ui/*`), because they need a running server and browser.

### The failing test

`backend/test/p7RoleMatrix.test.ts`, "calls every route as every role and keeps the security invariants". It reports 6 unexpected findings:

- `academic-manager-write POST /api/auth/tour/complete` (×2)
- `unauthenticated-access GET /api/docs.json` and `GET /api/docs/ui`, for anonymous and disabled-teacher identities (×4)

These were introduced by `b9a49c0` (product tour) and `f40002f` (API docs).

### Test totals compared with earlier reports

Earlier reports cite 1069 (P19) and 380 / 38 files (adaptive teaching, mock-free subset). These counts come from different file subsets and are **not comparable** to this audit's 417 / 40. There are 93 backend test files at `f5dd116`. No full-suite count is claimed here.

---

## 2. Gate assessment

| # | Gate | Status | Evidence and reasoning |
|---|---|---|---|
| 1 | Product scope and completeness | **PARTIAL** | The core teaching, grading and tutor flows are CODE-VERIFIED. Missing: invitation-accept and password-reset pages, user disabling, manual results release. The ENARA executive, finance and audit pages are sample data. The Arabic draft exclusion is not enforced. |
| 2 | Role/permission matrix | **FAIL (current)** | `p7RoleMatrix` sweep fails at `f5dd116`: docs open when the password is unset outside production; Academic Manager tour write. Separately: the Academic Manager can use the AI analytics assistant; the Integrations page is shown to staff but refused by the backend. |
| 3 | Tenant, class, course and student isolation | **PARTIAL** | Server-side scoping is CODE-VERIFIED (404 existence-hiding). STAGING-VERIFIED in P19 (Tenant B, 111/111 probes, `dpl_756oCbJo…`, 2026-10-30). Isolation suites `p14_9TenantIsolation` and `p19TenantIsolation` are mocked and were not re-run. Weaknesses: no per-school R2 prefix; signed links in any JSON reach any holder for 6 h; mastery query in `learning_gap_summary` has no `institutionId` filter (objectives are school-filtered). |
| 4 | Authentication, session, invitation, disabled accounts | **PARTIAL** | Token versioning and revocation CODE-VERIFIED; logout STAGING-VERIFIED (P14.8 smoke, 78 PASS). No UI to accept invitations or reset passwords. No disable API. School suspension does not block sessions. |
| 5 | Assessment and assignment lifecycle | **PASS (synthetic)** | Versioning and assignment TEST-VERIFIED (`phase3.sprint1`, `phase3.sprint3`). End-to-end STAGING-VERIFIED with real AI (P16 to P18). |
| 6 | Grading correctness, exceptions, release, appeals, emergency path | **PARTIAL** | Validation and the leak guard are CODE-VERIFIED and TEST-VERIFIED (`gradingPolicy`, `p19_1LeakGuard`). P19.2 found 1 unsafe release, then PASS 0/20 unsafe after the fix (`dpl_BgztikQS…`). **`releasePolicy: 'manual'` is ignored.** The emergency path is uncapped beyond the test-spend cap. Grading accuracy has been benchmarked only offline (`docs/benchmarks`); it has not been validated against teacher grades on real school work. |
| 7 | Learning-intelligence loop | **PARTIAL / NOT PROVEN END-TO-END** | Per-student loop CODE-VERIFIED and unit-tested. Full loop never run on deployed staging (§3). Method effectiveness is not fed back into method choice. |
| 8 | Documents: upload, rights, malware, extraction, R2, signed URLs, download restrictions | **FAIL** | No scanner (owner-approved "deferred" policy). **Download bypass:** generic link signing hands students and staff working links to deferred, pending and failed files without the warning. Signed URLs appear in request logs. No per-school key prefix. |
| 9 | Educator Chat quality and minimisation | **PARTIAL** | F-3/F-3b harness LIVE-AI (102 calls; passed after reclassifying 2 probes). Router 81.3% < 85% target, so it stays off. Named-student matching is deterministic. **Never exercised on deployed staging.** Flag state on staging is UNKNOWN. |
| 10 | Analytics correctness | **PARTIAL** | Chat analytics definitions are explicit: latest finalized score, missing work not counted as zero, roster intersection, date windows. **Dashboard/assistant analytics (`analyticsService`) average every submitted score, all-time, include duplicates and use no grading-status filter.** So two "average score" figures can disagree. No withdrawal status exists. |
| 11 | Real-provider validation | **PARTIAL** | Real calls are documented with ledger reconciliation: P7 $0.445658, P12 $0.112112, P16 to P20 (to the micro-dollar against the ledger, usage report and school counter), P21 about $0.22. **No report checked the provider invoice or console.** Prices are `list_estimate`. |
| 12 | Budget controls | **PARTIAL** | The test-spend cap is final and fail-closed (`p14_2StagingEntry`, `p14_3StagingStartup`, `p6StagingGuard` passed now). Defects: **speaking-exam speech-to-text costs $0 and escapes all caps**; Anam has no session-length cap and loose settlement; school caps are opt-in; grading can overrun uncapped; a new spend ID resets the cumulative counter. The guard ceiling is now $50. |
| 13 | Vercel isolation, maintenance endpoint, flags, domain, health, rollback | **PARTIAL** | Maintenance endpoint removed in code (no match in `backend/src`, `api/`) and STAGING-VERIFIED 404 (F-5 report, `dpl_D3aG…`, 2026-10-29). `test.enara.app` is **not in repository evidence**. Vercel Git linking is contradictory. `/ready` does not cover R2 or AI. Rollback is limited to the previous deployment. Deployed source is not on the remote. |
| 14 | Accessibility and responsive | **UNKNOWN** | Chart semantics are CODE-VERIFIED. No axe, keyboard, screen-reader, contrast or mobile audit has been run. Reduced motion is honoured in the product tour (`motion-reduce`) only, as far as found. |
| 15 | Performance, reliability, rate limits, monitoring | **PARTIAL** | P20 98/100 concurrent; deadline and DB fixes. **No alert sink; no persisted audit; cron not scheduled.** |
| 16 | Privacy and data protection | **FAIL for real student data** | The analytics assistant sends up to 300 named students with scores and risk flags to the model, without redaction, including for Academic Managers. Earlier, P12 R-3 recorded a student's first name sent to the model. Request logs hold signed URLs. No documented retention for logs or the usage ledger. No export or erasure procedure. No DPA or sub-processor record in the repository. |
| 17 | Pilot operations | **UNKNOWN / NOT READY** | No pilot institution data, onboarding runbook, support owner, success metrics or stop criteria found. 4Level1 accounts exist per the session record, with test data removed. Whether classes and students exist there is UNKNOWN. |
| 18 | Commercial / operational | **PARTIAL** | Plans, credits and the savings estimator exist (savings only as good as school-entered spend). Two credit systems coexist. Only ENARA Admin sets budgets. Who approves provider spend is recorded only as "owner" in reports. No contract or pricing artefacts in the repository. |

---

## 3. End-to-end learning journey (P12 and successors)

Sources:

- P12: `docs/benchmarks/diagnostics/20261029T141743Z-p12-live-e2e/` (`P12_LIVE_E2E_REPORT.md`, `P12_RUN_RESULT.json`, `P12_CALL_LEDGER.csv`)
- P13 and P13.1 audit folders
- `docs/staging/P15_*`, `P16_*`
- P17 copy in the owner's home folder

| Stage | P12: local harness, real Anthropic, in-memory DB, commit `cc8530f`, 2026-10-29 | Deployed staging (P16 `dpl_8tccc…` / P17 `dpl_4Bj8…`) | Classification |
|---|---|---|---|
| Assessment creation | AI draft, Sonnet, $0.015012 | Teacher-authored only; **no AI draft on staging** | LIVE-AI-VERIFIED (harness only) |
| Publication / assignment | Deterministic; another school's access gives 404 | PASS | STAGING-VERIFIED |
| Student attempt | Scripted weak answer | Synthetic student, PASS | STAGING-VERIFIED |
| Real AI grading | Opus, 2 evaluations, $0.030576, plus a control | Opus, 2 calls (P16), 4 calls (P17; first held by the leak guard) | LIVE-AI-VERIFIED + STAGING-VERIFIED |
| Release | Released | Auto-released | STAGING-VERIFIED (manual release does not exist) |
| Evidence / mastery update | Deterministic; mastery state not captured (P13 C-5) | Not tested | CODE-VERIFIED; harness PARTIAL |
| Gap identification | Both objectives `in_progress` | **Not tested** | PARTIAL (harness) |
| Targeted tutoring | Opus via intervention, $0.016316 | Tutor on a lesson, **not targeted at a gap** | LIVE-AI (harness); staging PARTIAL |
| Unassisted reassessment | 3 attempts; attempt 1 held by `feedback_leak` (raw FAIL, reported PARTIAL) | **Not tested** | PARTIAL / BLOCKED on staging |
| Measured progress / analytics | 0% → 100% "illustrative"; the log shows 85.7% (contradiction, P13 C-1); mastery "not yet verified" | Analytics pages only | **UNKNOWN** |

P12 synthetic identifiers (from the report): upload `cfj-0a1b4c8e…`, assignment `asg-404794fc-…`, attempt `att-1793282940182-2h9f`. Spend: 9 attempts, $0.112112, under a $1 cap, reconciled ledger to cap ledger to reservations. Not reconciled to an invoice.

**Conclusion:** the whole loop has **not** passed anywhere. Several isolated stages pass on deployed staging with real AI. The closing half has only partial harness evidence: gap, targeted tutoring, unassisted reassessment and measured progress. A real Anthropic call from a local harness is not a call through the deployed staging app; only P16 to P21 are the latter.

---

## 4. Release recommendations by level

| Level | Recommendation | Gates that must pass first |
|---|---|---|
| Continued internal development | **GO** | None blocking. Fix the failing `p7RoleMatrix` invariants first so the security sweep is green again. |
| Synthetic-data internal staging | **GO with conditions** | (a) Push or otherwise preserve the deployed source (`f5dd116` is not on the remote). (b) Confirm the live deployment ID and domain. (c) Keep the test-spend cap set and reconcile it with the provider console. (d) Fix or switch off speaking exams until speech-to-text is priced. |
| Invited external teacher testing (synthetic students) | **NO-GO now** | Gates 2, 8, 12 and 13 must pass, plus invitation and password-reset pages (Gate 4) and the actions in §6. |
| Limited school Pilot with real student data | **NO-GO** | Everything above, plus Gates 3, 6, 7, 10, 14, 15, 16 and 17, and the owner decisions in §8. |
| Broader production release | **NO-GO** | Everything above, plus a successful Pilot with measured outcomes, backup and DR, on-call alerting, a processor and legal review, and a verified scanner or a formally accepted no-scan policy for real schools. |

---

## 5. What is genuinely ready now

- Role-based access with server-side tenant and class scoping (404 existence-hiding), token revocation on logout, and fail-closed staging boot checks.
- Versioned assessments, assignments, submission, AI grading with dual evaluation, a validation and leak guard, exceptions instead of invented scores, teacher correction with history, and appeals. All exercised with real AI on synthetic staging data.
- The AI gateway: every application provider call is reserved and metered, and the cumulative staging test-spend cap is final (grading included).
- Educator Chat deterministic analytics with explicit definitions, local name resolution and chart/table validation.
- The adaptive teaching plan (23 methods) wired into the tutor, with adult-school handling. Unit-tested.
- Type-checks clean; 416 of 417 provider-free tests pass.

## 6. What is not ready, and why

| Item | Why it matters |
|---|---|
| Security sweep failing (`p7RoleMatrix`) | The repository's own security invariant is red. |
| Unscanned or pending files downloadable through generic link signing | The no-scanner policy is not enforced; students can receive unscanned files. |
| Analytics assistant sends named student data to the model, available to Academic Managers | Data minimisation is inconsistent with Educator Chat. |
| Speaking-exam speech-to-text costed at $0 | Spend can escape every cap. |
| Manual results release ignored | Midterm and final results release automatically. |
| No invitation, password-reset or user-disable flow; school suspension does not block sessions | No account lifecycle for external users. |
| Two analytics definitions of "average score" | Teachers can see conflicting numbers. |
| Deployed source not on the remote; domain and deployment only in the session record | Not reproducible; rollback is uncertain. |
| No alerting, no persisted audit, no cron schedule, `/ready` partial | Operations are blind. |
| Full learning loop not demonstrated on staging | The core product claim is unproven. |
| Accessibility and mobile not audited | Unknown suitability for schools. |
| Arabic AI drafts offered in the UI despite being out of scope; F-8 still present | A known failure is exposed to users. |

## 7. Smallest ordered set of actions before invited external teacher testing

1. Preserve and identify the source: push `claude/codebase-review-kbxqan` (or merge it to `staging-alpha`) with owner approval. Record the live deployment ID, its commit and the domain in a dated staging report.
2. Make `p7RoleMatrix` green:
   - require `API_DOCS_PASSWORD` in every non-test environment, or close the docs when it is unset outside tests;
   - allow-list or reclassify `POST /api/auth/tour/complete` as a self-only write.
3. Stop the download bypass: sign only links the caller may download, and filter course `materials` by scan status.
4. Price speaking-exam speech-to-text (or disable `speaking_exams_enabled`), and settle Anam switch reservations.
5. Implement `releasePolicy: 'manual'`, or remove the option from the UI.
6. Add invitation-accept and password-reset pages, and a way to disable users.
7. Decide and enforce the analytics assistant's data exposure: redact, or restrict to admins.
8. Either hide Arabic in AI assessment drafting or fix F-8.
9. Re-run the full test suite under an approved policy for mocked tests. Re-run a deployed smoke test and an isolation probe on the identified deployment.
10. Read the three Educator Chat flag values on staging and record them.

## 8. Additional gates before a school Pilot with real student data

1. Privacy review: the model data inventory per feature, provider data-processing terms, retention for logs, ledger and conversations, and export and erasure procedures.
2. Run the deployed full learning loop (gap → targeted tutoring → unassisted reassessment → measured progress) with real AI on synthetic data and record it.
3. Validate grading agreement against teacher grades on the pilot school's own assessment types and languages.
4. Unify the analytics definitions and add a withdrawal status.
5. Resolve the malware-scanning policy for real schools, with per-school R2 prefixes.
6. Alerting to a human (budget, errors, grading exceptions), persisted audit of administrative actions, a scheduled cron, and a fuller `/ready`.
7. Accessibility (WCAG 2.1 AA checks), RTL and mobile audits.
8. Backup, restore and DR tested; named on-call and support owners.
9. A pilot runbook: institution setup, classes and rosters, teacher and admin onboarding, success metrics, and stop and rollback criteria.
10. Provider invoice reconciliation for at least one billing period, and enforced school budgets (`enforcementEnabled`).

## 9. Owner decisions still required

1. Academic Manager access to Educator Chat and to the analytics assistant.
2. Whether `releasePolicy: 'manual'` must exist for the Pilot.
3. The no-scanner policy for real schools, and whether students may download deferred files.
4. Arabic AI assessment drafting: fix or hide.
5. The intent router (`educator_analytics_ai_router_enabled`): keep off, or accept accuracy below 85%.
6. Grading emergency overrun: accept uncapped overrun, or add a hard per-school grading ceiling.
7. Which domain is canonical (`test.enara.app` or `enara-staging-alpha.vercel.app`), and whether Vercel should be Git-linked.
8. Key rotation: several reports record keys pasted in chat with rotation waived.
9. The pilot institution, scope, success metrics and stop criteria.
10. Who approves provider spend, and the provider-side spend limit to set.

---

## 10. Statement of conduct

During this audit:

- **No code fixes, configuration changes, deployments, promotions, migrations, seeds, flag or domain changes, secret changes, paid AI calls, commits, pushes, fetches, pulls, branch switches, resets, stashes or cleans were performed.**
- No remote service was contacted.
- The only repository writes are the five new Markdown files in this folder.
- Local type-checks and 40 provider-free test files were run against an in-memory database. A single test was then re-run to read the API operation count.
- No provenance snapshot was written.
