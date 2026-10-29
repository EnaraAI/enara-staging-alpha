# ENARA F-3b: small-scope grounded chat (option E)

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d`. **Uncommitted, ready for owner review.**

No remote service was contacted. No paid or provider calls were made: every model call in the tests goes to a mocked `@anthropic-ai/sdk`. Nothing was deployed, no migrations ran, no environment files or feature flags were changed, and earlier reports and snapshots are unchanged.

**The USD 1 live validation is PENDING APPROVAL (§7).**

## 1. Behavior change

| Situation (grounded educator chat) | Before | After |
|---|---|---|
| Keyword retrieval finds passages | Those passages go to the answer call | **Unchanged** |
| No keyword match; the selected eligible documents hold **1–3 passages** in total | `no_sources` refusal, **no model call** | **All of those passages** go to the existing answer call. The model must reply `NOT_IN_SOURCES` if they don't support an answer, and the server keeps only citations of the passages it supplied. An uncited answer becomes `unsupported`. |
| No keyword match; **4+ passages** | `no_sources`, no model call | **Unchanged** |
| No eligible document, documents outside the user's scope, or student-data questions | refusal or 404, no model call | **Unchanged** |
| Tutor, lesson planning, assessment generation, grading | keyword retrieval | **Unchanged.** They don't use the fallback. |

I chose to make this a **fallback only when retrieval finds nothing**, rather than always sending small selections whole. This is the narrowest version of option E: when retrieval finds a passage, the call and prompt are exactly as before. The trade-off: in a 2–3 passage selection where retrieval matches only one passage, the others aren't added (§6).

## 2. Implementation

**`backend/src/services/curriculumRetrieval.ts`:**
- **`passageScope` (new, internal):** the school, curriculum, `uploadIds` and safety-gate filter, moved verbatim out of `retrieveCurriculumSources`, which now calls it. The keyword path's behavior is unchanged, and all 45 P8 retrieval tests still pass.
- **`smallScopePassages` (new, exported):**
  - uses the **same** `passageScope`, so the scope can't drift;
  - returns every passage of the selected documents, ordered by `uploadId`, then `chunkIndex`, then `id`, with `score: 0`;
  - returns `null` when there are more than `max` passages, by querying `limit(max + 1)` so large documents are never loaded in full.

**`backend/src/services/educatorChat.ts`:**
- `SMALL_SCOPE_PASSAGES = 3`.
- After the existing keyword retrieval, **if it found nothing**, the code collects `smallScopePassages` for each curriculum the selection spans, using **only** the eligible selected upload ids already authorized by `documentsForChat`, with a running total capped at 3. If any curriculum is over the limit, there's no fallback.
- The passages then go through the existing steps without change:
  - the `eligibleIds` filter, numbering and `MAX_SOURCES` cut;
  - `systemPrompt` (escaped `<passage>` data, `NOT_IN_SOURCES` rule);
  - `meteredMessage`;
  - `toCitations` and `UNSUPPORTED_ANSWER`.
- **Telemetry:** `logger.info('educator_chat_small_scope_fallback', { institutionId, conversationId, passages, documents })`. It logs counts and ids only, never passage text or the question.
- The comment at the top of the file now describes F-3b.

No new model call, vendor, dependency, secret, migration, storage, embedding or feature flag.

## 3. Passage-scope invariants

All verified by tests that assert on what the mocked model actually received.

1. Only documents the caller selected **and** that `documentsForChat` returned for the caller's read scope can contribute. A school-B teacher selecting a school-A document gets **404**, and no model call is made.
2. Only **eligible** selected documents contribute: attested and cleared by the safety gate, with the scan state checked on every request. An ineligible document in the same selection is never sent, and a selection with no eligible document gets `no_sources` with no call.
3. The passage query adds the safety-gate filter again (`passageScope`), so a document whose scan state changes is dropped before the fallback.
4. Unselected documents in the same school, and every document of another school, are never sent.
5. Only extracted passage text is sent, escaped as untrusted data, never the raw uploaded file. This is the existing prompt path, unchanged.
6. Citations exist only for supplied passage numbers. Forged citations (`[0]`, `[2]` when only one passage was sent, `[7]`, `[99]`) are dropped, and an answer left with none is refused.

## 4. Cost and budget path

These findings come from reading the code.

- The fallback call uses the existing `meteredMessage` (`aiGateway.ts`) with `feature: 'educator_chat'`, `maxAttempts: 2`, and `bound = { inputTokens: textTokenBound(system, messages), outputTokens: 1500 }`.
- **Before every attempt**, `reserveAttempt` checks the school's AI rate limit and pause state, then `reserveAiBudget` reserves `upperBoundUsd(model, bound)` against the P0d `OrgBudget`. A refusal throws **before** the provider is called. After the attempt, `finishAttempt` writes a `usage_ledger` row and settles the reservation.
- Tests confirm this: a $0.000001 daily cap gives `AI_BUDGET_EXCEEDED` (429) with no provider call on the fallback path, and a fallback answer writes one `educator_chat` ledger row.
- `textTokenBound` is the byte length of the JSON plus 1024, so an Arabic passage at 2 bytes per character reserves more.

| Model (P7 catalog rates) | Worst-case reservation per attempt, 3 × 1000-char passages, EN | AR |
|---|---|---|
| claude-haiku-5-5 | $0.00142 | $0.00180 |
| claude-sonnet-5-5 | $0.0284 | $0.0359 |
| claude-opus-5-5 (code default for `ANTHROPIC_TUTOR_MODEL`) | $0.0568 | $0.0718 |

I computed these locally with `upperBoundUsd` and `textTokenBound`.

**New spend:** questions that were refused with no call before now make one bounded call. P7 measured similar chat calls at about 500–600 input and about 50–90 output tokens. So the estimated cost per call is about $0.0001 on Haiku, $0.0016–0.0021 on Sonnet and $0.0033–0.0041 on Opus (P7 actuals for comparable chat calls). The larger fallback scope adds at most about 3,000 characters of input.

**Not verified here:** which model `ANTHROPIC_TUTOR_MODEL` is set to on staging (I didn't read environment values), and whether the staging P0d policy is in force. The P7 report recorded budget enforcement as on, with $15 monthly, $6 school daily and $6 per user daily.

**Unchanged from P7 F-6:** chat isn't covered by the `aiJson` guard used by the benchmark harness. Its hard stop is the P0d reservation above.

## 5. Tests and checks

**New** (`describe('F-3b small-scope fallback')` in `backend/test/p3EducatorChat.test.ts`, 11 tests). They use mocked Anthropic, an in-memory MongoDB, real HTTP routes and synthetic EN/AR texts:

| Test | Requirement covered | Before (pre-F-3b code) | After |
|---|---|---|---|
| EN direct question with no keyword match (retrieval confirmed `[]`): answered, citation to the one passage, ledger row written | recall: EN direct | FAIL | PASS |
| Fallback logged with counts only; a keyword hit doesn't trigger the fallback | telemetry, no content in logs | FAIL | PASS |
| EN instruction-style request ("Summarise this for my grade 5 class…") | recall: EN framing | FAIL | PASS |
| AR direct question and AR instruction-style request (لخص … لطلاب الصف الخامس) | recall: AR, AR framing | FAIL | PASS |
| 2 and 3 selected passages: exactly those files, numbered 1..n; an unselected document and a school-B document are never in any call | exact passage set, isolation | FAIL | PASS |
| Unsupported EN (football), AR (كأس العالم), an incidental-word question (electric car / water) and `NOT_IN_SOURCES` mixed with a citation all become `unsupported`, with no citations | precision | FAIL | PASS |
| Forged citations `[2]`, `[0]`, `[99]`, `[7]` rejected; `[1]` alongside `[3]` keeps only `[1]` | citation validation | FAIL | PASS |
| School B selecting a school-A document: 404, no call | cross-school | PASS | PASS |
| Ineligible (scan-failed) document beside an eligible one is never sent; alone it gets no call; a scan state that changes is dropped | safety gate | FAIL | PASS |
| P0d budget refusal before any provider call, on the fallback path | budget | FAIL | PASS |
| Tutor and generation keep keyword-only retrieval (`retrieveCurriculumSources` and `gatherSources` return `[]` for the same question); no other workflow file uses `smallScopePassages` | other workflows | PASS | PASS |

"Before" is the same test file run against the pre-F-3b `educatorChat.ts` and `curriculumRetrieval.ts` (the P8 single-topic versions), then restored and checked with `cmp`. Result: **9 failed, 19 passed (28)**. The 2 PASS rows are isolation and regression guards, which are meant to pass both ways.

**Changed existing test (deliberate):**
- Old: `p3EducatorChat` "no matching passage: no_sources and no model call" asserted the old hard refusal for a **one-passage** selection. That is exactly the behavior F-3b replaces.
- New: "no matching passage in a selection of **4+** passages: no_sources and no model call", with 4 selected documents.
- The one-passage behavior is now covered by the F-3b tests above.
- No other test was changed or removed.

| Command | Exit | Result |
|---|---|---|
| `npx vitest run test/p3EducatorChat.test.ts test/p8SmallScopeRetrieval.test.ts` (×2) | 0 | 2 files, **73/73** both times |
| `+ test/elie.sprint6.test.ts test/p2Documents.test.ts test/p7RoleMatrix.test.ts` (retrieval, document scoping, cross-school and role authorization sweep) | 0 | 5 files, 108/108 |
| `npx vitest run` (full backend) | 0 | **64 files, 807/807** |
| `npx tsc --noEmit -p .` (backend) | 0 | — |
| `npx tsc --noEmit -p .` (frontend; no frontend files changed) | 0 | — |
| `npm run build` (frontend) | 0 | — |
| `git diff --check` | 0 | clean |
| Whitespace check of every untracked file | — | clean, except the known trailing space in the historical report `…090418Z-p8-p1-fixes/ENARA_P8_P1_FIXES_REPORT.md:76`, left as it is |

**Count reconciliation:** 796 (P8 single-topic pass) + 11 new F-3b tests = **807**. The modified test replaced the old one in place, so the count is unchanged by it. Same 64 files.

**Provenance:** I ran `npx tsx src/scripts/sourceProvenance.ts --phase F-3b-small-scope-chat --out <this folder>/SOURCE_PROVENANCE_F3B_SMALL_SCOPE_CHAT.json` and it exited 0. The recorded hashes match the working files: `curriculumRetrieval.ts` `1c42e3f76465…` and `educatorChat.ts` `6daab8b625ce…`.

## 6. Known limitations

1. **Precision now depends on the model.** The server can check that a citation points to a supplied passage. It **cannot** check that the passage actually supports the cited sentence. A model that answers an off-topic question with a citation to `[1]` would get through. The tests show the server enforces every rule it can; whether the model follows `NOT_IN_SOURCES` is **unverified beyond P7's n = 1 per model**. That is what the paid validation measures.
2. **Fallback only on empty retrieval.** In a 2–3 passage selection where keyword retrieval matches one passage, the other passages aren't sent, so the answer may be incomplete.
3. **Slightly higher spend:** questions refused at no cost before now make one bounded, metered call (§4).
4. The limit of 3 is fixed and counted across all selected documents. Four short documents of one passage each use the keyword path.
5. Tutor, lesson planning and assessment generation keep the P8 keyword-matching limits, by design.
6. These tests don't show real model quality, latency or Arabic answer quality. All model output here is mocked.

## 7. Live validation plan (NOT RUN, needs explicit approval)

**Matrix:** 50 synthetic probes × 2 runs = **100 chat questions**, each in a new conversation so history doesn't grow, run sequentially with concurrency 1, through the real `/api/educator-chat/ask` route on an isolated in-memory MongoDB. This uses the same isolation approach as the P7 harness, which does not touch staging data.

| Group | Count | Source |
|---|---|---|
| Supported EN, one passage (direct, paraphrase, synonym, instruction-style, single-topic, "summarise this document") | 12 | P8 probes 1–4 and 18–19, single-topic guard cases, and the chlorophyll, synonym and no-topic cases |
| Supported AR, one passage (direct, instruction-style, prefixed words, single-topic) | 8 | P8 Arabic probes plus single-topic and prefix cases |
| Supported, 2–3 passages, EN and AR | 5 | distractor-collection cases |
| Off-topic EN (incidental shared words, unrelated questions, framed off-topic questions) | 15 | P8 probes 5–12 and 23–26 plus the single-topic negatives |
| Off-topic AR and mixed-language | 7 | P8 probes 15–17, 27, 28 plus AR single-topic negatives |
| 4+ passage regression (must stay `no_sources` with no call) | 3 | — |

**Pass criteria:**
- **0** cited answers to off-topic questions;
- **≥ 95%** of supported questions answered with a citation to the correct passage, in EN and AR separately;
- the 3 regressions make **0** provider calls;
- median latency ≤ 3 s;
- reported spend equals the `usage_ledger` total, with no drift.

**Attempt ceiling:** 97 calls (100 minus the 3 regressions) × `maxAttempts` 2 = **194 attempts** at most. Retries happen only on retryable provider errors, and each retry is reserved again by the gateway.

**Hard cap and enforcement:**
- A test `OrgBudget` with enforcement on, `dailyCapUsd = monthlyCapUsd = perUserDailyCapUsd = 1.00`, in the isolated database.
- Every attempt reserves its `upperBoundUsd` **before** the provider call through the real `meteredMessage` path (§4), and the run stops at the first `AI_BUDGET_EXCEEDED`.
- The run is sequential, so at most one reservation is open at a time. Total charge can therefore never exceed $1.

**Worst case vs expected** (194 attempts):

| Model | Worst case if every attempt reserved its maximum | Can it finish under $1? | Expected actual (P7 per-call actuals) |
|---|---|---|---|
| Haiku 5.5 | 194 × $0.0018 ≈ **$0.35** | yes, even at worst case | about **$0.01** |
| Sonnet 5.5 | 194 × $0.036 ≈ $6.97 | yes in expectation; the cap would stop a pathological run | about **$0.20** |
| Opus 5.5 | 194 × $0.072 ≈ $13.93 | yes in expectation; the cap would stop a pathological run | about **$0.40** |

**Recommendation:** run on the model staging actually uses for chat. It defaults to Opus if `ANTHROPIC_TUTOR_MODEL` is unset; please confirm the model, because I didn't read environment values. The $1 cap holds in all cases through P0d. With Sonnet or Opus, a cap stop would leave the run partial, and that would be reported as a fail.

**Needed to proceed:** explicit approval of the model, the matrix, the 194-attempt ceiling and the $1 cap.

## 8. Files

| Path | State | Origin |
|---|---|---|
| `backend/src/services/educatorChat.ts` | modified, +28/−2 vs HEAD | **this task** |
| `backend/src/services/curriculumRetrieval.ts` | modified, +97/−9 vs HEAD | P8 F-3 passes; **this task** added `passageScope` and `smallScopePassages` |
| `backend/test/p3EducatorChat.test.ts` | modified, +174 | **this task**: 11 tests, and 1 test renamed and moved to 4+ passages |
| `docs/benchmarks/diagnostics/20261029T102448Z-f3-small-scope-chat/` (this report and the provenance JSON) | untracked, new | **this task** |
| `backend/src/app.ts`, deleted `stagingMaintenance.routes.ts` and deleted `p6StagingMaintenance.test.ts` | — | P8 (F-5), unchanged here |
| `backend/test/p8SmallScopeRetrieval.test.ts` and the P8 and options report folders | untracked | earlier P8 work, unchanged |
| `backend/test/p7RoleMatrix.test.ts`, `backend/src/scripts/benchmark3Model.ts` and the revised P7 report | untracked | P7, unchanged |

Tracked diff: 6 files, +296/−283.

No secrets or environment values appear in any changed or new file.

## 9. Status

- **F-3a (precision, keyword layer):** FIXED WITH KNOWN LIMITATIONS. This is unchanged.
- **F-3b (small-scope chat recall):** implemented and passing offline. It stays **OPEN until the live validation (§7) is approved and passes.**
- **F-5:** removed locally only. It is **unresolved on the live deployment** until the Vercel token is removed, reviewed code is deployed, and the endpoint returns 404 with and without the old token.
- The $4 English assessment benchmark is still unapproved.
- External testing remains NO-GO. No deployment is authorized.
