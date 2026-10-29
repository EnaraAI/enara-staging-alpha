# P13 provenance and contradictions

## Q1. How can P12 be LIVE-PROVIDER-VERIFIED if deployed staging has no provider key?

**Resolved.** The answer is the separate local runner. P12 never exercised the deployed Vercel app.

| Evidence | Status |
|---|---|
| `P12_RUN_RESULT.json` `isolation.database` = `mongodb-memory-server (127.0.0.1, throwaway)`; `providerHost` = `api.anthropic.com` | Verified (artifact) |
| The harness (`backend/src/scripts/p12LiveJourney.ts`) builds the app in-process (`createApp()` + supertest), starts `MongoMemoryServer`, and points `MONGODB_URI` at it. It refuses to continue unless the database URI is `mongodb://127.0.0.1:<port>/`. | Verified (source, read-only) |
| Every request in the run went to the in-process app; the only outbound host allowed was `api.anthropic.com` (cap ledger: 0 `blocked_host` events) | Verified (artifact + source) |
| Deployed staging production env has **no `ANTHROPIC_API_KEY`** (variable names listed, no values read) | Verified (read-only `vercel env ls`) |
| The live alias deployment (`dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4`) was created at 13:48:23Z, before P12 (14:08–14:11Z). No P12 artifact names a Vercel URL as a target. | Verified |
| The provider calls were real: 9 HTTP 200 replies with `end_turn`, provider request ids, model echo and token usage that reprices exactly | Verified (artifacts); invoice not checked |
| The key the runner used came from the sandbox `backend/.env` (`ANTHROPIC_API_KEY` only) | **Reported** (report prose). The run log does not record the command line. |

**Conclusion.** P12 shows that ENARA's code at `cc8530f`, plus the uncommitted harness, completes the journey **in an isolated local runner** against the live Anthropic API. It shows **nothing** about the deployed website making provider calls. The deployed site cannot make them today: it has no key. The aggregate report's label "LIVE-PROVIDER-VERIFIED" is accurate only with the qualifier "isolated harness". The P12 report states that qualifier; the aggregate report's one-line summary does not.

## Q2. Did P12 exercise the deployed F-10 code?

**No.**
- **The code path:** P12 ran the `cc8530f` source tree locally, which includes F-10, so the code existed in the run. But the F-10 fallback never fired: 0 `assessment_draft_small_scope_fallback` events in the full run log (verified). The brief was worded to match the notes, so keyword retrieval found the passage on its own.
- **The deployed copy:** it is probably the same source (the upload folder is byte-identical to `git archive cc8530f`; *inferred*). It was never exercised by any AI call, because it has no key.

## Q3. Is staging configured for the benchmark-recommended model (Sonnet 5.5 for drafts)?

**No.**
- Staging defines no model override (verified), so drafts, grading and tutor would all use the code default `claude-opus-5-5` (verified in `config/env.ts`, `aiJson.ts` and `directTutorModel.ts`).
- One setting drives all three (P12 finding R-5).
- The English benchmark's 48/48 Sonnet result is a **benchmark recommendation, not a staging configuration**.
- P12 itself used Sonnet for drafts only by setting the override inside the harness process.

## Q4. Router state

- **P10:** run 2 scored 81.3% paraphrase accuracy against an 85% target (verified). The router feature should therefore stay off.
- **On staging:** that it is off is **reported, not verified** in P13. The flag lives per school in the staging database and is only visible to a logged-in request, which this audit is not allowed to make.
- **In P12:** the router flag was off in the synthetic school (verified in the harness source). 0 provider calls happened during analytics (verified).

## Other contradictions and gaps

| # | Claim | What the evidence shows | Status |
|---|---|---|---|
| C-1 | P12 report: "journey GO… one partial finding"; step 10 shown as **PARTIAL** | `P12_RUN_RESULT.json` records step 10 as **FAIL** (the harness rule was that every reassessment attempt is released). The report reclassified it by hand after reading the logs. | Discrepancy: labelling. The underlying facts are consistent. |
| C-2 | P12 report and test summary present the harness as the tool that produced the results | The harness was **edited after the live run** (the Batch fixture fix). The hash of the version that made the paid calls was never recorded. The `dry-run/` evidence (finished 14:17:14Z) comes from the post-fix version. The pre-live dry runs that gated the paid run were not kept. | Reproducibility gap |
| C-3 | "Evidence folder: `…/20261029T141743Z-p12-live-e2e/`" (implied to be repo evidence) | The folder and harness are **untracked**, not in GitHub. | Gap: evidence durability |
| C-4 | Provenance snapshot is the P12 provenance | `commit_sha` is null. It doesn't cover the tutor path, analytics, router or harness files. Its hashes still match today's files. | Gap: incomplete coverage |
| C-5 | Step 8 "gap detection matches stored records" | The time-to-understand episodes and outcomes analytics support it. The mastery entries in the artifact carry objective ids only (the harness read the wrong field names), so mastery state is not evidenced. | Partially evidenced |
| C-6 | Matrix row: "student/class/course labels from authoritative records: PASS (harness defect noted)" | The live named-student output shows "class not recorded", from a harness fixture that failed to save. The post-fix dry run shows the class. | Accurate, but live evidence of the class label is missing |
| C-7 | "No real student data in provider payloads" | Fixtures are synthetic (verified in the harness and manifest). The payloads themselves were not retained, so they cannot be inspected. The tutor reply shows the student's first name reached the model (R-3). | Verified for fixtures; payload content unverifiable |
| C-8 | "No secrets in artifacts" | A pattern scan of the P12 folder for key, connection-string, bearer-token and password patterns found none (verified). I did not compare against the actual key value, to avoid reading it. | Verified (patterns) |
| C-9 | Aggregate report: "F-10 implemented and deployed" | Implementation and tests are in commit `cc8530f` (verified). Deployment is evidenced only by scratch deploy logs outside the repo, and no in-repo deploy record exists. The upload folder equals `cc8530f`. | Deployment inferred, not recorded in the repo |
| C-10 | Aggregate report: "953/953 tests, typechecks/build pass" | I re-ran 953/953 and both typechecks pass (verified, on the same tree). Frontend build not re-run (it writes files). | Verified, except the build |
| C-11 | Aggregate report: "staging AI unpaused but no key" | Verified at the configuration level: `AI_PAUSED` exists and its value was not read; no key name exists. That the global and school pauses are off is reported only; it would need an authenticated read. | Partly verified |
| C-12 | The aggregate report is the 2026-10-29 summary of record | It lives in the scratchpad (`ENARA_REPORT_2026-10-29.md`), **not in the repo**. | Gap: durability |
