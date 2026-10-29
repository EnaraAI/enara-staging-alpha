# ENARA P9: natural-language analytics intent router

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d`. **Uncommitted, ready for owner review.**

- **No paid or provider calls:** every model interaction in the tests is a mocked SDK.
- No remote connections, deployment, migrations, environment-file or flag changes in any environment.
- Earlier P0–P8 and analytics work, reports and snapshots are preserved.

## 1. Summary

- The **deterministic fast path is unchanged** and still makes no call.
- A **model-backed intent router** was added behind a second flag, `educator_analytics_ai_router_enabled`, **default OFF**. It runs only when:
  - no document is selected;
  - `educator_analytics_enabled` is on;
  - the router flag is on;
  - the fixed patterns found nothing.
- **What the model receives:** only a **locally redacted** question and a fixed allowlist.
- **What the model returns:** only a **strictly validated intent object**. It never receives student records, ids, rosters, class lists or results. It never supplies numbers, and any class it names must literally appear in the question and is matched only against the caller's own classes.
- **The call path:** it goes through the **existing** `askForJson` → `aiGateway.meteredMessage` path. P0d reserves budget and checks pause and rate limits before **every** attempt, and every attempt is written to `usage_ledger`.
- Every failure fails closed, with a question back or an "unsupported" reply, never a guessed report.
- **No new provider path, dependency, migration or security-policy change** was needed, so no blocker applies.

## 2. Baseline check (verified, no mismatch)

The fixed baseline in the specification matches the code:
- the `educator_analytics_enabled` flag (default off);
- six intents (`ANALYTICS_INTENTS`);
- pattern-only planning (no model import in `educatorAnalytics.ts`);
- teacher (taught classes) and Workspace Admin (own school) only, with ENARA Admin refused with `ANALYTICS_NOT_PERMITTED`;
- the chat route's `content:author` guard, which excludes Academic Managers and students;
- attendance, mastery trend, term comparison, diagrams and export out of scope.

## 3. Implementation

| File | Change |
|---|---|
| `backend/src/services/educatorAnalyticsRouter.ts` (new) | `redactRequest`, `validateDecision`, fixed `SYSTEM` prompt, `routeWithModel` |
| `backend/src/services/educatorAnalytics.ts` | Plan fields `range`, `classReference`, `via`; `PlanOutcome` with `clarify`; deterministic **explicit dates** ("from YYYY-MM-DD to YYYY-MM-DD", Arabic "من … الى …") and **future-window** detection; `explicitRange()` checks (real dates, earliest first, not future, clamped to 365 days); local `classReference` resolution in `analyticsScope`; a `route` hook in `runAnalytics`; **the role check runs before any routing**, so a refused caller can't cause a metered call; EN/AR clarification messages; `interpretedBy: 'model'` marker |
| `backend/src/services/educatorChat.ts` | Passes `routeWithModel` to `runAnalytics` only when the router flag is on |
| `backend/src/services/aiJson.ts` | Optional `model` and `validationAttempts` (1–2) parameters; existing callers unchanged (defaults) |
| `backend/src/config/env.ts` | `anthropicIntentModel` from `ANTHROPIC_INTENT_MODEL`, default `claude-haiku-5-5` (priced in the catalog). **No environment file was edited.** |
| `backend/src/services/featureFlags.ts` | New flag `educator_analytics_ai_router_enabled` in `EDUCATOR_CHAT_FLAGS` (own master, default off) |
| `backend/src/services/usageReport.ts` | Usage label for feature `educator_analytics_intent`: "AI Chat (question routing)" |
| `backend/test/p9AnalyticsRouter.test.ts` (new) | 46 tests |

**Configuration names** (documented only, nothing changed):
- school flag `educator_analytics_ai_router_enabled`, which also needs `educator_analytics_enabled` and `educator_chat_enabled`;
- optional environment variable `ANTHROPIC_INTENT_MODEL`.

## 4. Which path handles what

| Behavior | Path |
|---|---|
| Questions matching the fixed EN/AR patterns (all six intents, chart types, explicit dates, last-N, future-window refusal) | **deterministic** (no call, works with AI paused, no budget or no key) |
| Other analytics wording, when the router flag is on | **model**: intent only, then the same deterministic report code |
| Scope, authorization, data queries, every metric, table, chart series, summary, caveat and definition | **deterministic, always** |
| Questions with documents selected | the **document-grounded path, unchanged** (the router is never called) |

## 5. Privacy boundary (evidence)

**Sent to the model:**
- the fixed `SYSTEM` prompt (1,716 bytes: an allowlist of intents, keys, chart types and reasons, plus a rule to treat the request as untrusted data);
- `<request>` plus the question, **normalized and redacted**, at most 500 characters. Longer requests are not sent.

**Never sent:** student rows, scores, submissions, assessments, rosters, class lists, document text, database ids, tenant ids, credentials or stored results. A test checks the full request for every fixture student name, the other classes, `instA`, class ids, assessment titles, data values, the user id and the API key: none appear.

**Local redaction, before any call:**
- **Student names** (all students of the caller's school, so names outside the caller's classes are hidden too): full names and name parts of 3 or more letters, also after Arabic prefixes (ال / و / ب / ل / ك), become `[student]`. Name parts that are words of the caller's own class names are kept, so a class can still be named.
- **Emails** become `[email]`.
- **Phone-like numbers** become `[phone]`.
- **24-hex ids, UUIDs, prefixed ids (`cfj-`, `ecv-`…), digit runs of 5 or more, and mixed letter-digit tokens of 8 or more characters** become `[id]`.
- ISO dates are protected from the number rules.
- If anything personal-looking survives, the call is **refused** (`redaction_failed`).
- **Tested:** "Amal Haddad", an email, a +971 phone number, a Mongo id, a `cfj-` id and the Arabic name "لأحمد" are all absent from what the mock received, with the placeholders present.

**Model output** (`validateDecision`):
- **exact keys:** `intent, metric, timeRange, lastN, classReference, chart, language, clarificationNeeded, clarificationReason`;
- enum and range checks on every field;
- `timeRange` is only `{default}`, `{last_days, 1–3650}` or `{between, ISO, ISO}`, with exact keys;
- `classReference` is 2–80 characters, has no `<>{}$;\`` characters, is not a placeholder, and must be a **substring of the redacted request**.

**Tested rejections (14):**
- extra `classId`, `institutionId`, `mean` and `filter` fields;
- an unknown intent, and SQL as the intent;
- a class not in the request, a query fragment as the class, and a placeholder as the class;
- a bad chart type, a bad time range and a missing key;
- a clarification without a reason;
- non-JSON prose ("mean 99%").

Each one gives `unsupported`, with no table, no chart and no student names. `askForJson` runs with `validationAttempts: 1`, so an invalid reply is not retried.

**Authorization:**
- the role check happens before routing (ENARA Admin gives 403 with no call; Academic Manager 403 with no call);
- teachers see only their classes, even when an injection-style question is "complied with" by the mock;
- a teacher naming another teacher's class gets a clarification listing only their own classes;
- Workspace Admin keeps school scope;
- school B sees only its own class.

**Audit:** `educator_analytics_router` logs institution, user, outcome, intent, clarification reason and the number of redactions. **No question text, no names.**

## 6. Budget, metering and failure (evidence, mocked provider)

- **Reservation:** a P0d reservation is written for `educator_analytics_intent` before the call, bounded at under $0.005; it measured $0.00063 on the intent model (test).
- **Every attempt is metered:** an overloaded reply (529) followed by success gives **2** usage-ledger rows; two failures (500) give **2** rows, followed by a question back with no report.
- **Exhausted budget or AI paused:** the router makes **no provider call** and gives `unsupported`, while fixed-pattern reports still answer.
- **No provider key:** the router is unavailable, and fixed patterns still answer.
- **Router flag off** (default): no call, and the existing reply.

## 7. Tests and checks

| Command | Exit | Result |
|---|---|---|
| `cd backend && npx vitest run test/p9AnalyticsRouter.test.ts test/educatorAnalytics.test.ts` (×2) | 0 | 2 files, **112/112** both times (46 new + 66 existing, unchanged) |
| `… + p3EducatorChat + p8SmallScopeRetrieval + p7RoleMatrix + p2Documents` | 0 | 6 files, **210/210** (document chat, F-3/F-3b, role sweep, document scoping) |
| `cd backend && npx vitest run` | 0 | **66 files, 920/920** |
| `cd backend && npx tsc --noEmit -p .` | 0 | — |
| `cd frontend && npx tsc --noEmit -p .` | 0 | — (no frontend change in P9) |
| `cd frontend && npm run build` | 0 | — |
| `git diff --check` | 0 | clean |
| Whitespace check of every untracked file | — | clean, except the known historical `…090418Z-p8-p1-fixes/…:76`, left unchanged |
| Provenance `npx tsx src/scripts/sourceProvenance.ts --phase P9-analytics-intent-router --out <this folder>/SOURCE_PROVENANCE_P9_ANALYTICS_ROUTER.json` | 0 | new snapshot; earlier ones untouched |

**Count reconciliation:** 874 + 46 (1 new file) = **920** in 66 files. No existing test was changed.

**Test-side corrections made during development**, none in the product code:
1. A mean I had calculated by hand for the new fixture was wrong: 680/9 = 75.6.
2. One test question matched the fixed patterns, so it was rephrased so the router is exercised. The fixed path had also correctly kept scope.
3. A collection name was wrong.

## 8. Files changed (tracked and untracked)

**P9 (this task):**
- new `backend/src/services/educatorAnalyticsRouter.ts`;
- new `backend/test/p9AnalyticsRouter.test.ts`;
- modified `educatorAnalytics.ts` (untracked file from the analytics slice), `educatorChat.ts`, `aiJson.ts` (+6/−2), `env.ts` (+3), `featureFlags.ts`, `usageReport.ts` (+1/−1);
- this report folder.

**Earlier, unchanged here:**
- the analytics slice: `chartPayload.ts` ×2, `AnalyticsReport.tsx`, `educatorAnalytics.test.ts`, `EducatorConversation.ts`, `educatorChat.routes.ts`, `AIChat.tsx`, `apiService.ts`;
- P8, F-3 and F-9: `app.ts`, `curriculumRetrieval.ts`, `p3EducatorChat.test.ts`, deleted `stagingMaintenance.routes.ts` and `p6StagingMaintenance.test.ts`, `p8SmallScopeRetrieval.test.ts`;
- P7: `p7RoleMatrix.test.ts`, `benchmark3Model.ts`;
- all earlier report folders.

## 9. Future live cost and proposed live test (NOT authorized, NOT run)

**Worst-case reservation per attempt:** input bound 3,831 tokens (system prompt plus a 500-character Arabic request, through `textTokenBound`), output at most 300 tokens. Computed locally with `upperBoundUsd`.

| Intent model | Per attempt | Per question (at most 2 attempts: one transport retry, no validation retry) |
|---|---|---|
| **claude-haiku-5-5 (default)** | **$0.00063** | **$0.0013** |
| claude-sonnet-5-5 | $0.0126 | $0.0252 |
| claude-opus-5-5 | $0.0252 | $0.0503 |

Typical actual cost per question on Haiku is about $0.0001 (roughly 900 input and 60 output tokens; estimated).

**Proposed live test (separate owner approval needed):**
- **Matrix:** the 12 model-path phrasings above, plus 30 more varied EN/AR paraphrases (5 per intent), 10 clarification or unsupported cases and 8 injection cases. That's **60 questions × 2 runs = 120 questions**, at most **240 attempts**.
- **Model:** Haiku.
- **Worst case:** 240 × $0.00063 = **$0.15**.
- **Proposed hard cap:** **$0.25** through a test `OrgBudget`, the same mechanism as the F-3b validation.
- **Pass criteria:**
  - **≥ 90%** correct intents on supported paraphrases;
  - **0** reports produced from injection cases;
  - **0** schema-valid outputs that widen scope;
  - every attempt metered.

## 10. Limitations and open decisions

1. **Redaction is name-list-based.** Names that are not in the school's student list (misspellings, nicknames, staff or parent names) are not redacted. The post-check catches contact details and ids, not unknown names. **Decision for the owner:** accept this, or require that requests be sent only when no capitalized or unknown word is present. That second option would sharply reduce recall.
2. **Over-redaction:** a student name part that matches a common word (for example a student called "Science") is redacted unless it is in the caller's class names. This loses some recall but is safe.
3. **Model accuracy is unmeasured.** The mocked tests prove the pipeline is safe and correct, not real classification quality; that needs the live test in §9.
4. **Router outcomes in history:** clarification or unsupported replies from the router appear in the conversation history like other analytics replies.
5. **Academic Manager:** still excluded from chat. That's unchanged and is the owner's decision.
6. **Unchanged blockers:**
   - F-5 is still unresolved on the live deployment;
   - the $4 English benchmark is still unapproved;
   - Arabic assessment generation stays out of scope;
   - both analytics flags stay off.

**Recommendation:**
- **GO** for owner review of the code.
- Approve or decline the live router test (§9) before enabling the router flag anywhere.
- **NO-GO** for enabling it for external users until that test passes and limitation 1 is decided.
