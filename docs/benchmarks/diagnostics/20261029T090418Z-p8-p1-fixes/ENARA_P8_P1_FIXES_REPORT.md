# ENARA P8: P1 fixes (F-3) and removal of the maintenance endpoint (F-5)

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d` (this is the most recent deployed commit known from local evidence: the P7 report records `d52784d` as live). **All changes are uncommitted and ready for owner review.** I connected to no remote service, deployed nothing, ran no migrations, enabled no AI, made no paid calls and changed no environment files.

## 1. Status

| Item | Status |
|---|---|
| F-3 small-scope grounded retrieval | **Fixed in code and tests (local).** Not yet deployed. |
| F-5 maintenance endpoint | **Removed from local code.** It is **NOT resolved on the deployed site** until the operator removes `STAGING_MAINTENANCE_TOKEN` from Vercel, redeploys the reviewed commit, and confirms that the old token gets 404 (§6). |
| Expanded English assessment benchmark | **Not run.** It needs separate owner approval of the proposed $4 hard cap. |
| Arabic assessment generation | OUT OF SCOPE FOR THIS RELEASE. Unchanged. |
| Arabic chat, tutor, lesson planning, rubric grading | Unchanged. |
| External testing | **NO-GO**, until the deployed F-5 check passes, F-3 is deployed and verified, and the English benchmark supports a model choice. |

## 2. Preflight (Phase A)

- Root: the `enara-staging-alpha` clone. Branch: `staging-alpha`. HEAD: `d52784d`. Nothing was staged before this work.
- Untracked files before this work, all preserved and not edited except as noted:
  - `backend/src/scripts/benchmark3Model.ts`;
  - `backend/test/p7RoleMatrix.test.ts` (one line changed, see §3);
  - the P7 revised-scope report.
- The code matched the P7 report: the route was mounted in `backend/src/app.ts` when `config.stagingMode` was on and a 32+ character token was set, and the scorer used a fixed `score >= 1` floor. No differences were found.

## 3. Files changed

| File | Change | Why |
|---|---|---|
| `backend/src/app.ts` | Removed the `stagingMaintenance.routes` import and the `/api/staging-maintenance` mount (16 lines deleted). | F-5 |
| `backend/src/routes/stagingMaintenance.routes.ts` | Deleted. Only `app.ts` and its own test used it. | F-5 |
| `backend/test/p6StagingMaintenance.test.ts` | Deleted. It tested only the temporary endpoint. The staging-guard security tests (`p6StagingGuard.test.ts`) are untouched. | F-5 |
| `backend/test/p7RoleMatrix.test.ts` (untracked) | Removed the exclusion of `/api/staging-maintenance`, which is no longer needed. | F-5 |
| `backend/src/services/curriculumRetrieval.ts` | Score floor changed from `1` to `min(1, ln(1 + (N − 0.5)/1.5))`, plus comments. | F-3 |
| `backend/test/p8SmallScopeRetrieval.test.ts` (new) | 4 tests for F-3 and 1 regression test for F-5. | Tests |
| This report | New file. | Reporting |

Remaining mentions of `staging-maintenance` and `STAGING_MAINTENANCE_TOKEN`:
- the three P7 reports in `docs/benchmarks/diagnostics/20261029T084111Z-full-role-feature-ai-benchmark/`. These are historical evidence and were left as they are;
- the new regression test, which uses the name only to assert that the route is absent.

`backend/dist/` is git-ignored and still holds an old local build that includes the route. Vercel rebuilds it with `npm run build` (`tsc`), so a deploy of the reviewed commit will not contain the route. Check step 4 in §6 confirms this.

## 4. F-3: root cause and fix

**Root cause.**
- BM25 IDF is `ln(1 + (N − df + 0.5)/(df + 0.5))`. In a scope with one passage (N = 1), every term has df = 1, so each term's IDF is ln(4/3) ≈ 0.29.
- A passage of average length scores about 0.29 per matched term, so it needs 4 or more matching terms to reach the fixed floor of 1. Valid 2–3 term questions got no source.
- With two passages, a term found in only one passage has IDF ≈ 0.69, so 2 terms clear the floor. This matches the P7 result: 3/3 cases failed with one document and 3/3 answered with two.

**Fix.**
- The floor is now capped at the highest IDF any term can have in this scope: that of a term found in only one passage.
- N = 1 gives a floor of about 0.29, N = 2 about 0.69, N = 3 about 0.98, and from N = 4 up the floor is 1, as before.
- The other relevance gate is unchanged: a passage must still share at least 2 query terms with the question (or every term, for a 1-term question). Relevance checks are not bypassed.
- Arabic and English share the same code path, and search-term handling is unchanged.

**Evidence** (deterministic, in-memory MongoDB, synthetic passages, no provider).

| Test (`p8SmallScopeRetrieval.test.ts`) | Original code (HEAD) | Fixed code |
|---|---|---|
| One one-passage document answers a question sharing ≥ 2 terms (also through the one-document `uploadIds` filter used by chat) | **FAIL** | PASS |
| Unrelated questions, and questions sharing only one term, still return no source | PASS | PASS |
| A small collection with distractors picks the correct passage, and an unrelated question returns nothing | PASS | PASS |
| A larger scope (9 passages) keeps the floor of 1 | PASS | PASS |

The before column comes from running the new tests against `git show HEAD:backend/src/services/curriculumRetrieval.ts`, then restoring the fix. The existing retrieval tests in `elie.sprint6.test.ts` and `p2Documents.test.ts` pass in the full suite.

Known limit: the fix is keyword-based. A question phrased with synonyms that share no terms with the passage still gets no source; this behavior is unchanged.

## 5. F-5: local evidence

- The regression test builds the app with `STAGING_MAINTENANCE_TOKEN` set. It checks that:
  - no layer in the route table mentions `staging-maintenance`;
  - `POST /api/staging-maintenance` with that token returns **404**;
  - the route module no longer exists;
  - `app.ts` contains no reference to it.
  
  Result: PASS.
- Limit: a staging-mode app can't be built in tests, because the staging guard requires the real staging environment. Staging mode itself is therefore not tested; the source-level checks cover it.

## 6. Validation run (local)

| Check | Result |
|---|---|
| Focused: `npx vitest run test/p8SmallScopeRetrieval.test.ts` | 5/5 passed |
| Full backend: `npx vitest run` | **64 files, 756 tests passed**, 0 failed |
| Backend typecheck: `npx tsc --noEmit` | exit 0 |
| Frontend typecheck: `npx tsc --noEmit` | exit 0 |
| Frontend build: `npm run build` | exit 0 |
| `git diff --check` | exit 0, clean |

There is no separate worker package in this repository.

No secret or environment value appears in this report or the logs. The test token is a made-up placeholder.

## 7. Operator runbook (only after review approval)

1. Review the diff. Commit to `staging-alpha` and push (needs approval).
2. In the Vercel project `enara-staging-alpha`, go to Settings → Environment Variables and **delete `STAGING_MAINTENANCE_TOKEN`** from every environment where it is set. Do not copy or display its value.
3. Deploy the reviewed commit to production for that project. Because GitHub isn't connected, do this from a clean `git archive` export of that commit with `vercel deploy --prod`. Note the deployment's commit.
4. Verify, keeping the old token in a local variable only and never pasting it into a shared place:
   - `POST https://enara-staging-alpha.vercel.app/api/staging-maintenance` with the old token header and body `{"action":"status"}` → expect **404** `NOT_FOUND`;
   - the same request without a token → 404;
   - `GET /health` → 200, and `GET /ready` → ready;
   - in Vercel, Environment Variables no longer lists `STAGING_MAINTENANCE_TOKEN`.
5. Verify F-3 on staging (AI stays paused):
   - teacher retrieval: with exactly one small document selected, a question about that document should list it as a source; this can be checked without generating an answer if the sources are shown;
   - an unrelated question should show no source;
   - a live answer requires unpausing AI, which needs separate approval.
6. Then delete or rotate the old token wherever it is still stored locally.
7. Record the results in a new diagnostics report. Only then can F-5 be marked resolved.

## 8. Remaining blockers before external testing

1. F-5 deployed removal and the 404 check (§7).
2. F-3 deployed and checked on staging.
3. The expanded English assessment benchmark: 144 runs, about $2.50, proposed $4 hard cap. **This needs separate owner approval** and was not run.
4. Carried over from P7, not changed here:
   - F-1: ingestion status returns 500 without Postgres (P2);
   - F-4: Sonnet cache-read price (P2);
   - F-6: chat and tutor are outside the `aiJson` guard (P2);
   - F-7: the repo is public;
   - the Arabic option is still shown in the Assessment Builder. Hiding it is optional and needs approval.
