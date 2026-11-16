# ENARA LMS Integration: Implementation Plan

Status: **approved with changes (2026-11-16)**. This version includes Mohamed's answers to the 15 questions, plus his note that **not every student is a language student**. Spec: `ENARA_LMS_Integration_Spec.md` v1.2.
Release 1 ships and is tested on **Moodle + Google Classroom (Mode A) only**. The design must let any other LMS be added without changing core code or the data model.

---

## 1. Codebase discovery (summary)

| Area | Finding |
|---|---|
| Backend | Node and TypeScript, Express (`backend/src/app.ts`), one Vercel serverless entry (`api/index.js`, `maxDuration` 60 s) |
| DB | MongoDB Atlas with Mongoose. **No migrations**: schema lives in the models, indexes are created by script. Postgres is used only for ingestion and diagnostics |
| Jobs | No queue. `/api/cron/daily` exists. Vercel **Hobby** plan: daily crons only |
| Background work | `@vercel/functions` is already a dependency, so `waitUntil` is available |
| Secrets | Vercel env vars. No encryption-at-rest helper yet |
| Auth | JWT. Roles: student, teacher, academic_manager, admin, enara-admin, parent. `institutionId` scopes all data |
| Org and class | `Institution` (org), `Batch` (class), `CourseInstance` (course × batch), `Curriculum` (chapters, quizzes, languageSpec) |
| Scores and levels | `AssessmentAttempt.score` plus criterion scores and `subject`; `Assignment.cefrLevel` and `Curriculum.languageSpec` are **optional** (set only for language courses); A1–A2 outcomes bank; graderV2 |
| Frontend | React and Vite. Paths are switched in `App.tsx`, with no router library |
| Tests | Vitest with in-memory MongoDB (≈2,100 tests; 16 known pre-existing failures) |
| Deploy | Manual `vercel deploy`. No Git link, by choice |
| Frame headers | `helmet()` defaults send `X-Frame-Options: SAMEORIGIN`. This must be relaxed on LTI routes only |
| Public reachability | Vercel deployment protection is **"all except custom domains"**. `https://test.enara.app` is public; `*.vercel.app` URLs require a Vercel login. **All LMS and Google URLs must use `https://test.enara.app`** (`LMS_TOOL_BASE_URL`). |

---

## 2. Extensible, provider-neutral design

### 2.1 Rules
1. **ENARA core and the LMS Domain Service only use the `LmsProvider` interface** (Spec §3.1). No vendor names or vendor-specific logic exist outside `adapters/` and `presets/`.
2. **Adapter registry:** `integrations/lms/registry.ts` is the single place where providers are registered. Adding a provider means writing a new adapter and adding one registration line.
3. **Vendor presets are data, not code branches.** Each preset is a JSON or TS object holding URL patterns, registration method, role-mapping overrides, claim quirks and placements. Release 1 ships only **`moodle`** and **`generic`**. Any spec-compliant LTI 1.3 platform works through `generic`.
4. **Capability flags per platform and deployment:** `roster`, `grades`, `deepLinking`, `lineItemCreate`, `submissionReview`. They are worked out from the launch claims and scopes plus the preset. Features switch on and off by capability, **never by vendor name**.
5. **Generic data model** (Spec §4) with `provider` and `vendor` fields. No vendor-specific collections or fields.
6. **Contract test suite** (`test/lms/contract/`). Every adapter must pass it: launch, roster sync, grade push, deep link, error and retry. It runs against the mock LTI platform, Google API mocks, and (manually or scripted) MoodleCloud.
7. **`docs/lms/ADDING_A_NEW_LMS.md`** is a step-by-step guide for adding a new provider or vendor preset.
8. **No stub or placeholder adapters** for platforms we are not shipping.
9. **Subject-neutral.** Not every student is a language student. Nothing in the LMS layer assumes English or CEFR. Language-specific output (CEFR level, language skills) is added **only when the course or activity is a language course** (`Curriculum.languageSpec` or `Assignment.cefrLevel` is set). Every other subject gets the same features with its own level and criteria, or none.

### 2.2 Module layout (`backend/src/integrations/lms/`)
```
core/        LmsProvider + capability types, domainService, toLmsScore, roleMap, crypto (KEK),
             outbox (claim/lease/retry), drain triggers, audit, flags, seats
registry.ts  provider registry (lti13, google_classroom)
presets/     moodle.ts, generic.ts           ← data only
adapters/
  lti13/     login, launch, validation, deep linking, AGS, NRPS, dynamic + manual registration, JWKS
  google_classroom/  OAuth, class import, roster, coursework, grades
models/      13 Mongoose models (Spec §4)
admin/       Integrations admin endpoints (platforms, failures, retry, seats, export/delete)
```

### 2.3 Proof of extensibility: which files a new LMS would touch

**Adding Canvas (LTI 1.3):**
- `presets/canvas.ts`: **new**. Issuer pattern, dynamic registration, placements (`course_navigation`, `assignment_selection`, …), any role overrides, claim quirks.
- `presets/index.ts`: **one line** to register the preset.
- `test/lms/contract/canvas.preset.test.ts`: **new**. Runs the contract suite with the Canvas preset.
- `docs/lms/ADDING_A_NEW_LMS.md`: add a row.
- Optionally an `/lti/config/:vendor` output, built from the preset with no new route code.
- **Not touched:** core, models, LTI adapter, outbox, UI.

**Adding OneRoster 1.2 (new provider):**
- `adapters/oneroster/`: **new**. It implements `LmsProvider`: `syncRoster`, `pushScore`, `capabilities` (no launch).
- `registry.ts`: **one line**.
- `test/lms/contract/oneroster.test.ts`: **new**. The same contract suite, with its capabilities.
- `presets/` entry if a vendor needs one.
- **Not touched:** core, models (they use `provider = 'oneroster'` plus generic fields), outbox, UI (shown by capability).

---

## 3. Conflicts and gaps, with the resolution for each

1. **No migrations.** Mongoose models plus an idempotent `scripts/lms/ensure-indexes.ts`. Phase 0 is done when "indexes are created and models validate".
2. **No frequent cron.** Grade delivery is built in layers (§5).
3. **No encryption helper.** AES-256-GCM with Node `crypto` and a key-version field per record, keyed by `LMS_KEK`.
4. **Frame headers.** Turn off helmet frameguard **only** on `/lti/*` and the LMS landing pages, and add `Content-Security-Policy: frame-ancestors <registered platform origins>`. All other routes keep today's headers.
5. **Roles.** Spec `org_admin` maps to ENARA `admin`. `Mentor` maps to an **ignored and logged** observer (release 1).
6. **Class and activity mapping.** `enaraClassId` maps to `Batch`. Activities map to Curriculum lessons, scored practice and assessments.
7. **Levels per attempt, by subject.** For language courses: real CEFR exists only for A1–A2 (outcomes bank); elsewhere the comment uses the assignment's `cefrLevel`. For all other subjects: no CEFR; the comment carries the subject's criterion or rubric breakdown only. When no level or criteria exist, the comment is just the score and a short summary.
8. **Mic and camera in iframes.** Speaking, avatar and video activities default to `presentation = window`.

---

## 4. Technical choices

### 4.1 LTI library: **`jose` plus our own LTI message handling** (chosen)
- `ltijs` **is** actively maintained (7.0.7, released 6 Oct 2026). It fails the second condition, which is to run cleanly on Vercel serverless functions with our MongoDB setup and data model:
  - It owns its **own platform, key and state storage** (its own collections and connection). That clashes with the required generic data model (Spec §4, `lms_platforms`, `lms_tool_keys`, `lms_oidc_state`) and with the provider-neutral registry: Google and OneRoster would live outside it.
  - It opens a **second Mongoose connection** on every cold start next to ours, and now brings `ioredis`. That is extra cold-start cost and connection churn on Hobby functions.
  - It expects to own the Express server and its routing and middleware. Serverless mode exists, but it would split launch handling across two frameworks.
- **`jose`** (6.2.17, released 9 Nov 2026) is a widely used, maintained JWT/JWS/JWKS library. All crypto (signing, verification, JWKS fetch and caching, key generation) goes through `jose`. **No hand-written crypto.** Our code only handles LTI claims and messages.
- **This comes with the full negative-test list** from Spec §5.2 and §10: bad signature, unknown `kid` (forces a JWKS refresh), wrong `iss`, wrong `aud`, array `aud` without a matching `azp`, expired `exp`, `iat` in the future beyond the skew, replayed nonce, missing or unmatched `state`, unknown `deployment_id`, wrong `version`, unsupported `message_type`, missing `sub`, `roles`, `context` or `resource_link`, an anonymous launch, and a tampered deep-link response.

### 4.2 Other choices
- **Keys:** `lms_tool_keys`, RSA-2048, private key encrypted with `LMS_KEK`, states `active`, `next`, `retired`.
- **State and nonce:** MongoDB `lms_oidc_state` with a 10-minute TTL index. The nonce is deleted when used.
- **Google:** the `googleapis` Classroom client plus `google-auth-library`. A **separate Google Cloud project** just for Classroom; this is a permanent choice.
- **Background:** `waitUntil` from `@vercel/functions`.

---

## 5. Grade delivery on Vercel Hobby (no frequent cron)

1. **(a) Push right after the response.** When a result becomes final, the learner's response is sent first. `waitUntil(pushGrade(job))` then runs in the background, so the learner never waits for the LMS.
2. **(b) Quick retries in the same process.** Up to 3 attempts at 2 s, 5 s and 15 s inside that background task. Each LMS call has an **8 s timeout**, so the worst case is about 45 s, under the function's 60 s limit.
3. **(c) Drain on incoming requests.** Any LMS-related request (LTI launch, student activity, teacher page) may start a background drain of up to 20 due jobs. An atomic MongoDB lock (`findOneAndUpdate` on a `lms_locks` document) makes this happen **at most once per minute across all instances**.
4. **(d) Targeted flush.**
   - A teacher opening a class page flushes that class's pending jobs.
   - A learner's LTI launch flushes that learner's pending jobs.
   - A **"Re-sync grades"** button re-queues the latest results.
5. **(e) Daily Vercel cron.** It is the last safety net (drains everything due) and also runs the nightly roster sync. Roster also syncs when a teacher launches and the last sync is more than 24 h old.

**Rules that make the outbox safe:**
- **Claiming:** jobs are claimed atomically, moving `pending` to `processing` with a **2-minute lease**. Expired leases go back to `pending`.
- **Idempotency key:** a hash of line item, user, attempt and score.
- **AGS ordering:** `timestamp` increases on every push.
- **Long-wait schedule:** 1 m, 5 m, 30 m, 2 h, 12 h. Jobs move to `dead` after 5 long-schedule failures, shown in the admin UI with a Retry button.
- **Pluggable drain triggers:** set by `LMS_DRAIN_TRIGGERS` (default `inline,piggyback,targeted,daily`). A per-minute cron (Vercel Pro or external) can be added later **by configuration only**, through the existing protected `/api/cron/lms-drain` route.

**Expected grade delay**

| Situation | Expected delay |
|---|---|
| Normal (LMS up) | **Seconds**: the in-process push right after the response |
| LMS briefly down (under ~20 s) | Seconds to ~25 s: the in-process retries |
| LMS down for minutes to hours | Next drain after it recovers: within **~1 minute of any ENARA traffic** (piggyback), or immediately when the teacher opens the class or the learner launches |
| LMS down for hours, then **no traffic at night** | Up to the **next daily cron** (≤24 h), or the first ENARA request in the morning, whichever comes first |

**Hobby limits.** Every function stays within 60 s. The daily cron does both jobs (drain plus roster) in one invocation, in batches, and keeps going on the next day if it hits the time limit. **Flag:** a school with a very large roster, or a backlog of thousands of jobs, may take several daily runs to clear on Hobby.

**Logging.** Hobby keeps runtime logs for only 1 hour, so **every LMS event is written to `lms_audit_log` in MongoDB from Phase 1**, with IDs only and no PII. The admin view lists recent failures.

**Note:** before the first real school goes live, we will review moving to **Vercel Pro**.

---

## 6. Licensing, scoring and grading decisions

- **Seats per school.** When over the limit, **allow the launch**, alert the school admin (email via `sendTemplate` plus admin UI), and **flag the org for billing**. An optional hard cap can be set per org; it defaults to off.
- **Scoring policy.** `best` for practice and `latest` for assessments. It can be changed per resource link.
- **Gradable.** Assessments and scored practice. **No lesson completion** in release 1.
- **Gradebook value.** Always a numeric score. The comment adds the CEFR level and language skill breakdown **for language courses only**. Other subjects get their own criterion breakdown. `toLmsScore` is heavily unit-tested for both language and non-language attempts.
- **Mentor/parent role from the LMS.** Ignored and logged in release 1.
- **Legal.** Egypt PDPL first. Engineering builds **data export and deletion per org and per context** only. The DPA is outside engineering.

---

## 7. Phases

Each phase gets a short phase plan and waits for "go". Each ends with tests passing and `docs/lms/PHASE_N_NOTES.md`.

| Phase | Builds | Tests | Effort | Done when |
|---|---|---|---|---|
| **0 Foundations** | module skeleton, interfaces, registry, presets (`moodle`, `generic`), capability model, 13 models with indexes, flags (default off), KEK crypto, key generation, `/lti/jwks` and `/.well-known/jwks.json`, `lms_audit_log`, `lms_locks` | crypto round-trip, JWKS shape, flags off mean no change, index script is idempotent | M | `/lti/jwks` serves valid keys; models validate; unit tests pass |
| **1 LTI core and registration** | `/lti/login`, `/lti/launch`, full validation, user, context and enrollment upsert, role mapping, sessions with no cookies needed (signed one-time launch token, plus the platform-storage postMessage flow), "Open in new tab", frame headers, Dynamic Registration, manual "Add LMS" page, audit log with the admin failures view, seat counting and alerts | every negative case in §4.1, contract suite (launch), role map, seats | L | launch works on **MoodleCloud** (teacher and student) and **saltire.lti.app**; all negative tests pass |
| **2 Deep linking and Activity Picker** | picker (subject, level and skill filters; CEFR filters appear only for language courses; multi-select), deep-link JWT, custom params, line items only for gradable items, `window` for mic and camera | builder, accepted types and targets, contract (deep link) | M | a Moodle teacher adds 3 activities in one flow; students land on the right ones |
| **3 Grades (AGS) and outbox** | token service, line-item resolution, `toLmsScore`, outbox with leases and idempotency, the 5 delivery layers, scoring policy, re-sync, daily cron entry, dead jobs and retry | `toLmsScore` (language and non-language), idempotency, lease and concurrency, backoff, contract (grade push, error and retry) | L | score and comment (CEFR for language courses, criteria for others) appear in Moodle within seconds; LMS outages recover; no duplicates |
| **4 Roster (NRPS)** | paging and differences, diff and upsert, sync on teacher launch older than 24 h, nightly sync, "Sync now", "invited / not started" | roster diff, paging, inactive handling, contract (roster) | M | adding or removing in Moodle shows after a sync; history is kept |
| **5 Google Classroom Mode A** (starts when the test domain arrives) | Classroom OAuth (incremental scopes, separate project), student Google sign-in, class import, roster, coursework from the picker, grade patch with the teacher's offline token, `needs_reauth` | contract suite against recorded Google fixtures, PERMISSION_DENIED path | L | in the test domain, import, assign, complete and grade appears in Classroom |
| **6 Admin and teacher UX, observability** | Integrations page (platforms, deployments, capabilities, last sync, failed jobs and retry, disconnect, seats, export and delete per org or context), metrics from `lms_audit_log`, email alerts | UI and endpoint tests | M | a non-engineer can register a Moodle site and diagnose a failed push from the UI |
| **7 Moodle hardening** | test on **Moodle 4.5 LTS** and the **latest Moodle release**; fix issues through the `moodle` preset only; Safari and Chrome with third-party cookies blocked; load: 500 launches in 2 minutes, 10k-job drain over several runs | runbooks (`docs/lms/RUNBOOKS.md`) | M | both Moodle versions pass the runbook |

Out of scope: Google add-ons (Mode B, deferred until editions are confirmed), Marketplace work, 1EdTech certification, Canvas, Blackboard, D2L, Schoology and Teams testing, `/lti/config/canvas`, OneRoster, Clever and ClassLink.

Phases 0–4 do **not** depend on the Google test domain. Phase 5 starts when it arrives.

---

## 8. Changes to existing code, and their risks

All of these sit behind flags that default to off.

| File | Change | Risk |
|---|---|---|
| `backend/src/app.ts` | mount `/lti/*`, `/.well-known/jwks.json` and LMS admin routes **only if flags are on**; relax frame headers on LTI routes only; add the piggyback-drain middleware (does nothing when the flag is off) | low |
| `backend/src/config/env.ts` | new config values | low |
| `vercel.json` | rewrites for `/lti/*` and `/.well-known/*`; **one daily cron** (`/api/cron/daily` also runs the LMS drain and roster sync) | low |
| `backend/src/routes/cron.routes.ts` | call LMS drain and roster sync from the daily handler, plus a protected `/api/cron/lms-drain` route for a future per-minute trigger | low |
| Result completion (assessment and graderV2 completion points) | emit `attempt.completed` and `assessment.graded` events | **medium**: touches the scoring path; does nothing when flags are off; tested |
| `frontend/App.tsx` | routes for the picker, LTI landing page and Integrations page | low |
| Teacher class views, `StudentManagement` | "invited / not started" LMS students; flush pending jobs on open | low |
| `p7RoleMatrix`, `p14_9TenantIsolation` tests | add new routes to their sweeps | low |

---

## 9. Environment variables to create

Mohamed adds these in Vercel himself. **Secrets are never pasted in chat.**

| Name | Example / format | Secret? |
|---|---|---|
| `LMS_LTI_ENABLED` | `true` / `false` | no |
| `LMS_GOOGLE_CLASSROOM_ENABLED` | `true` / `false` | no |
| `LMS_GRADE_PASSBACK_ENABLED` | `true` / `false` | no |
| `LMS_TOOL_BASE_URL` | `https://test.enara.app` | no |
| `LMS_KEK` | 32 random bytes, base64 (e.g. `openssl rand -base64 32`) | **yes** |
| `LMS_DRAIN_TRIGGERS` | `inline,piggyback,targeted,daily` | no |
| `GOOGLE_CLASSROOM_CLIENT_ID` | from the **separate** Classroom Cloud project | no |
| `GOOGLE_CLASSROOM_CLIENT_SECRET` | from the same project | **yes** |
| `GOOGLE_CLASSROOM_REDIRECT_URI` | `https://test.enara.app/api/lms/google/oauth/callback` | no |

`CRON_SECRET` already exists and protects the cron routes. The parent sign-in `GOOGLE_CLIENT_ID` stays separate.

---

## 10. Remaining open items (not blocking Phases 0–4)
- Google Workspace for Education test domain (Mohamed is requesting one) is needed for Phase 5.
- Google OAuth app verification for Classroom scopes. Start it early, because it can take weeks.
- A Vercel Pro review before the first real school.
