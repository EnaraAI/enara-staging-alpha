# ENARA Educator Chat: class analytics and charts (first slice)

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d`. **Uncommitted, ready for owner review.**

- No paid AI calls; this feature makes no model call at all.
- No remote connections, deployment, migrations or environment changes.
- Behind a new flag that defaults to **OFF**.
- All earlier P0–P8 work and reports are preserved.

## 1. Summary

**What it does:** with no document selected and `educator_analytics_enabled` on, a teacher or Workspace Admin can ask AI Chat, in English or Arabic, about their **own** classes. They get a report computed deterministically from records they can already see:
- a summary;
- the period and scope;
- key figures with definitions and n;
- a table;
- an accessible chart;
- notes, suggestions, sources and the generation time.

**What it does not do:**
- **No language model is involved.** The intent comes from fixed English and Arabic patterns, every number from code, and the summary from templates. Nothing can be invented, and there is no provider call to meter.
- Selecting documents keeps chat exactly as before, including F-3 and F-3b.

**Implemented intents:**
- class performance summary;
- assessment trend;
- declined students (student progress comparison);
- missing submissions;
- score distribution;
- learning-gap summary.

**Unsupported, with a clear explanation instead of a report:**
- attendance;
- conceptual diagrams;
- mastery trends over time;
- term-to-term comparison;
- mixed document + analytics requests;
- export.

**Recommendation:** **GO for owner review and internal staging trial** with the flag on for the synthetic school only. **NO-GO for external use** until the items in §12 are done.

## 2. Verified architecture and sources (inspected before building)

| Area | Finding | Files |
|---|---|---|
| Educator chat | `askEducatorChat`. The route guard is `content:author` (teachers and Workspace Admins; Academic Managers and students excluded) plus `educator_chat_enabled`. | `backend/src/services/educatorChat.ts`, `backend/src/routes/educatorChat.routes.ts` |
| Roles and permissions | `ROLE_PERMISSIONS`: `insights:read_school` for academic_manager and admin; `class:teach` for teacher and admin. ENARA admin holds every permission. | `backend/src/auth/permissions.ts` |
| Class scope | `CourseInstance.instructorIds` (teacher's own classes); `classStudentIds` (roster = studentIds plus batch); `loadClassForStaff` | `backend/src/models/CourseInstance.ts`, `backend/src/services/learningAccess.ts` |
| Assignments and status | `Assignment` (state, dueAt, extensions, latePolicy, studentIds); `studentStatus` / `dueFor` / `submissionWindow` give the real per-student status (missing, submitted, graded, released…) | `backend/src/models/Assignment.ts`, `backend/src/services/assignments.ts` |
| Scores | `AssessmentAttempt.score` is a **percent**; staff see scores once the grading status is `finalized` or `released` (same rule as `getAssignment`) | `backend/src/models/AssessmentAttempt.ts`, `backend/src/controllers/assignments.controller.ts` |
| Learning outcomes | `StudentObjectiveMastery.masteryStatus` (not_assessed, emerging, developing, proficient, mastered) and `LearningObjective` code and title; governed by `mastery_tracking_enabled` | `backend/src/models/StudentObjectiveMastery.ts`, `backend/src/models/LearningObjective.ts` |
| Demo/live | `originFilter('live')` and `studentsInView` | `backend/src/services/originScope.ts` |
| Attendance | `AttendanceSession` and `AttendanceRecord` exist, with their own teacher routes. **Not used in this slice.** | `backend/src/models/Attendance*.ts` |
| Existing school assistant | `dataAssistant.ts` (`insights:read_school`, metered model call over a school overview). Not reused, because it sends school data to a model. | `backend/src/services/dataAssistant.ts` |
| Charts | **Recharts 3.7 is already a frontend dependency**, used by 10+ pages. No new dependency was added. | `frontend/package.json` |
| Chat UI | `AIChat.tsx` renders turns as plain text plus citations | `frontend/pages/workspace/AIChat.tsx` |

## 3. Data fields: verified vs unavailable

| Report | Fields used (verified) | Not available, and why |
|---|---|---|
| Class performance | Assignment `classId`, `state` (published or closed), `dueAt`, `studentIds`, `extensions`, `latePolicy`; attempt `status`, `gradingStatus`, `submittedAt`, `score`; class roster | Term dates are not stored, so there is no term comparison |
| Assessment trend | same, per assignment, ordered by `dueAt` | Mastery history is not used (no mastery trend) |
| Declined students | same, per student, over the last N assessments | — |
| Missing submissions | `studentStatus()` = `missing` (due date with extension passed, nothing submitted) | — |
| Score distribution | graded scores | — |
| Learning gaps | `StudentObjectiveMastery.masteryStatus`, `LearningObjective.code/title` | Mastery is current state, so it can't be limited to the period (stated as a note) |
| Attendance | not used | Out of this slice; explained to the user |
| Tutor session outcomes | not used | Not part of this slice |

## 4. Implementation

**New files:**
- `backend/src/services/educatorAnalytics.ts`: planning, scope, metrics, reports and EN/AR templates.
- `backend/src/services/chartPayload.ts`: the chart-v1 schema and validator.
- `frontend/services/chartPayload.ts`: a copy of the validator. A test asserts the code is identical.
- `frontend/components/AnalyticsReport.tsx`: the report component.
- `backend/test/educatorAnalytics.test.ts`.

**Changed files:**
- `educatorChat.ts`: analytics routing, the `saveAnalytics` helper and a narrower privacy guard for analytics.
- `educatorChat.routes.ts`: passes `classId` through and adds `analyticsEnabled` to `/documents`.
- `EducatorConversation.ts`: status `needs_clarification` and an optional `analytics` field (Mixed). This is additive; **no migration**, and existing records load unchanged.
- `featureFlags.ts`: new flag `educator_analytics_enabled` in `EDUCATOR_CHAT_FLAGS`, its own master, **default OFF**.
- `AIChat.tsx` and `apiService.ts`: send with no document when analytics is enabled, and render `AnalyticsReport`.

**Routing:** analytics runs only when the request has `uploadIds: []` **and** the school flag is on. With any document selected, the existing document-grounded path runs unchanged.

**Configuration:** set `features.educator_analytics_enabled` per school through the existing learning-flags admin route. `educator_chat_enabled` must already be on, and learning gaps also need `learning_intelligence_enabled` and `mastery_tracking_enabled`. No environment variable is needed.

**Limits:**

| Limit | Value |
|---|---|
| Classes | ≤ 20 |
| Students | ≤ 500 |
| Assignments | ≤ 50 (most recent in the period, noted when cut) |
| Rows returned | ≤ 50 (noted) |
| Period | default 90 days, at most 365 (clamped, with a note) |
| Assessments compared (last N) | default 3, at most 8 |
| Chart categories | ≤ 24 |
| Chart series | ≤ 4 |
| Chart payload | ≤ 20 KB |

**Definitions** (shown with every metric):
- **Submission rate** = submitted student-assessment pairs ÷ pairs due in the period. Students must be assigned and still in the class.
- **Score** = the student's most recent finalized or released attempt per assessment; duplicates collapse to one.
- **Missing and ungraded work are excluded from scores and are never counted as 0.**
- **Withdrawn students' attempts are excluded**, and the number excluded is stated.
- **"Declined"** = the latest graded score is below the earliest among the last N assessments, which needs 2 or more graded scores.
- **Rounding** is to 1 decimal, after exact computation. Ordering is stable (value, then id).

**Clarification:** trend and declined-student reports need one class. If several are in scope and none is named, chat asks one question listing the class names.

## 5. Role and feature authorization matrix (tested)

| Identity | Class analytics in chat | Evidence |
|---|---|---|
| Teacher | Own classes only (`instructorIds`). Another teacher's class, another school's class or an unknown `classId` gives **404**. Naming an out-of-scope class in the question doesn't add it. Injection text doesn't widen scope or write anything. | test "teacher: own classes only…" |
| Workspace Admin | Every class of their own school, never another school's | test "Workspace Admin…" |
| Academic Manager | **Not enabled in chat**: the existing `content:author` route guard returns 403, unchanged. The existing read-only `/api/analytics/overview` still returns 200. | test "Academic Manager, Student…" |
| Student | 403 (route guard) | same |
| Anonymous | 401 | same |
| Disabled account | 401 | same |
| Unknown account (e.g. an invitation never accepted; accounts exist only after acceptance) | 401 | same |
| ENARA Admin | **403 `ANALYTICS_NOT_PERMITTED`**, even with an institution set. No broadening of identifiable student-data access. | test "ENARA Admin…" |
| Flag off | the existing document-only behavior (400 without documents); `/documents` reports `analyticsEnabled: false`; chat flag off gives 404 | test "feature flag…" |
| Any role, private details (email, phone, address, password, date of birth, health) | refused, with no data shown and no model call | test "student-data requests…" |

No role grant, route guard or tenant check was changed. Academic Manager access to chat would need a route-guard change, which is **left for owner decision** (§12).

## 6. Example questions and expected results (deterministic fixtures)

Fixture: class "Grade 5 Science" with 5 students and 3 due quizzes; class "Grade 6 Math" with 2 students and 1 test. Also present, so the tests can confirm they're left out:
- a withdrawn student;
- a duplicate attempt;
- an in-progress attempt;
- an attempt awaiting review;
- draft, future and old (200-day) assessments;
- another teacher's class;
- school B.

| Question (EN / AR) | Intent | Expected result (asserted) |
|---|---|---|
| "Generate a class performance report for Grade 5 Science" / "اعمل تقرير أداء لفصل Grade 5 Science" | class_performance_summary | submission rate **66.7%** (10/15), mean **72.2%** (n = 9), median **70%** |
| "class performance report with a bar chart" (both classes) | same | **64.7%** (11/17), mean **75%**, median **75%** (n = 10); table rows and bar values identical |
| "قارن نسبة التسليم بين الفصول في رسم أعمدة" | same, submission metric | bar chart, RTL, values **[66.7, 50]**, denominator 17 pairs |
| "Show the trend of class scores over the last 3 assessments in Grade 5 Science" / "ارسم تطور درجات فصل Grade 5 Science خلال آخر 3 تقييمات" | assessment_trend | line **72.5 → 80 → 66.7** (medians 75, 80, 60), change **−5.8**; dates strictly ascending |
| same, with 2 classes and none named | — | **needs_clarification** listing both classes |
| trend for Grade 6 Math (1 assessment) | — | table only; "needs at least 2…"; **no chart** |
| "Which students declined…" / "مين الطلاب اللي مستواهم نزل في آخر 3 تقييمات…" | student_progress_comparison | Amal 80 → 60 (−20), Carim 50 → 45 (−5); **2 of 3** compared; 2 students with fewer than 2 scores not compared |
| "Which students have not submitted…" / "مين الطلاب اللي ما سلموش…" | missing_submissions | 4 missing (Carim Quiz 2; Dana Quizzes 1–3); stacked bar submitted [4, 2, 4] / missing [1, 2, 1] / open [0, 1, 0] |
| "…not submitted? Show a pie chart" (Grade 6 Math) | same | donut [1 submitted, 1 missing, 0 open] |
| "Plot the distribution of assessment scores" / "توزيع درجات الطلاب" | score_distribution | buckets [1, 1, 1, 2, 1, 4] of 10 graded scores |
| "What are the weakest learning outcomes…" / "اعمل رسم بياني لأكتر فجوات التعلم انتشارًا" | learning_gap_summary | O1 Fractions 2/3 = **66.7%**, O2 Ratios 1/2 = **50%**; another teacher's student excluded; `not_assessed` excluded; unsupported when mastery tracking is off |
| "Summarize attendance…", "Draw a mind map…", "line chart of class mastery over the last 8 weeks", "compare … previous term" | unsupported | explanation, with no table or chart |

All 18 natural-language example questions in the specification are mapped in the "intent planning" tests, with Arabic paraphrases.

## 7. Charts

**Types implemented**, chosen by data semantics:

| Type | Used for |
|---|---|
| `bar` | class comparison, outcome gaps, score distribution, score changes |
| `line` | ordered assessment trends; needs 2 or more points with dates |
| `stacked_bar` | submission-status composition across assessments; mutually exclusive categories with one denominator |
| `donut` | a single assessment's status split; 2–6 parts that sum to a whole |

A requested type that misrepresents the data is not used; the natural type is kept and a note says why. The only swap allowed is showing a donut's data as a bar.

**Payload (chart-v1, `chartPayload.ts`):**

```
{ version: 'chart-v1', type: 'bar'|'line'|'stacked_bar'|'donut', title, description, xLabel, yLabel,
  unit: 'percent'|'count'|'score_percent'|'share_percent', categories: string[≤24],
  series: [{ name, values: (number|null)[] }] (≤4), denominator, dates?: ISO[] (line only, strictly ascending),
  period: { from, to }, direction: 'ltr'|'rtl' }
```

The payload is validated **on the server before returning and again in the browser before rendering**. It's rejected for any of the following:
- unknown keys or type;
- `< > \``, control characters, `javascript:` / `data:` / `on…=` patterns in any text;
- non-finite or out-of-range values;
- a series length that doesn't match the categories;
- too many points or series;
- duplicate labels;
- invalid or ascending-order dates;
- donut or stacked rule violations;
- a payload over 20 KB.

There are 22 rejection cases, each tested against both validators. An invalid payload is dropped with a note, and the report still returns.

**Source fields for every plotted series:**
- class means and submission rates: the same per-class rows as the table;
- trend: per-assignment means from graded scores;
- status: `studentStatus()` counts;
- distribution: graded-score buckets;
- gaps: mastery counts.

Every test asserts that chart values equal the table's values. A chart request triggers **no extra query**: one assignment query, with the same class filter (tested).

## 8. Accessibility, RTL and fallback (visual verification run)

- **Every report has a `<table>`** with a `<caption>` and `<th scope="col">`. Each chart sits in a `<figure>` with a caption, a description, the denominator and the period, plus `role="img"` and an `aria-label`. The figure is linked to its table with `aria-describedby`.
- **Values are printed on every bar, point and slice**, so meaning never depends on colour alone. Legends are shown for multi-series charts.
- **Arabic:** `dir="rtl"` container. The chart x-axis is reversed, so the first category sits on the right, and the y-axis moves to the right. Mixed Arabic/English labels are rendered.
- **Narrow viewports:** a wide table scrolls inside its own box, with no page-level horizontal scroll at 375 px (measured).
- **Chart render errors** are caught by an error boundary and fall back to the table. An invalid payload shows "The chart could not be shown; the table has the same data."
- **An empty table** shows "No rows / لا توجد صفوف".
- **Text is never treated as HTML:** React escapes everything. A test renders `<script>` and `<img onerror>` in the summary and table and checks they come out escaped.
- **Server-side render tests** of the real component cover EN and AR, but Recharts 3 draws SVG only after mount. The **browser check** was therefore done with Playwright (Chromium, synthetic data, the real component bundled with the frontend's esbuild). Results are in `VISUAL_CHECK.json`, and screenshots are in `screenshots/`:

| View | Result |
|---|---|
| `bar_en-900` | 2 bars, labels 72.2% and 100% |
| `bar_ar-900` | 2 bars, RTL, labels 66.7% and 50% |
| `bar_ar-375` | RTL, no page scroll |
| `trend_ar-900` | 3 points, RTL, labels 72.5 / 80 / 66.7% |
| `trend_ar-375` | 3 points, RTL, no page scroll |
| `missing_en-900` | stacked bar with legend; zero-height segments carry no label, and the table has every value |
| `donut_en-900` | 3 slices, labels "Submitted: 1", "Missing: 1"… |
| `gaps_ar-900` | 2 bars, RTL |
| `invalid_en-900` | no chart, fallback note, table shown |

0 page errors across all 9 views.

- **Fixed during visual review:** line-chart end labels were clipped, long labels overlapped, and tilted RTL labels pointed into the plot. Now: line padding, tilt when any label is longer than 12 characters, end anchoring, and a wider left margin.
- **Remaining:** on a 375 px phone, a line chart with long labels is cramped; the table stays the reliable view.
- **Not run:** a screen-reader audit, automated colour-contrast checks and keyboard testing beyond native table and figure semantics. The colours are dark (teal-700, amber-700, indigo-700, rose-700) with values printed on the marks.

## 9. Security and privacy

- **Scope** is always derived from the session: institution and role from the authenticated user; classes from `instructorIds` (teacher) or institution (admin); students from rosters. The question and `classId` can **only narrow** it. `classId` is checked against the derived list and must be a string of at most 80 characters, and Mongo operators are rejected (tests).
- **No raw queries:** fixed, typed Mongoose queries only; the question is only matched against patterns. There is no model, code execution or query JSON from the user.
- **Prompt injection:** analytics never reads document text, submissions or comments; it reads only structured fields. An injection-style question is tested: scope is unchanged, and the attempt count is unchanged, so nothing was written.
- **Minimum data:**
  - Student names are shown only in student-level reports (declined, missing) to teachers and admins who already see these names on assignment rosters.
  - Aggregate reports carry no names.
  - No contact, credential or health fields are read at all.
- **Private-detail requests** are refused in the analytics path by a narrower pattern (email, phone, address, password, date of birth, medical/health, religion, home…). The document-chat guard (`asksForStudentData`) is unchanged.
  - That guard was **too broad for analytics**: it blocked "students… Grade 5" and "students… scores", which are exactly the authorized data. This finding is why analytics has its own guard.
- **Audit:** one `educator_analytics` log line per request, with institution, user, role, intent, status, class and student counts, chart type and source count. **No names, no question text, no values.** A rejected chart logs only `educator_analytics_chart_rejected` with validator reasons.
- **Storage:** the report is saved in the user's own conversation (same 180-day retention, owner-only read; tested 404 for another teacher). It holds the same names and figures the report showed.
- **ENARA admin:** refused; no student analytics reach internal-cost surfaces.
- **Training:** no student data is sent to any provider.

## 10. Metering and budget path

- **There is no provider call on the analytics path.** `aiGateway`, P0d reservations and the usage ledger are therefore not involved, and there is nothing to bypass.
- Tests show that with AI paused **and** an exhausted budget, an analytics report is still answered, the mocked Anthropic SDK is **never called**, and `usage_ledger` has **0 rows**.
- Document-grounded chat keeps its existing gateway, budget and pause enforcement; the existing `p3EducatorChat` tests are unchanged and pass.
- If a model is added later, for example to explain a report, it must go through `meteredMessage` with a bound and be tested like `educator_chat`.

## 11. Tests and checks

| Command | Exit | Result |
|---|---|---|
| `cd backend && npx vitest run test/educatorAnalytics.test.ts` (×2) | 0 | **66/66** both times |
| `…educatorAnalytics + p3EducatorChat + p8SmallScopeRetrieval + p7RoleMatrix + p2Documents` | 0 | 5 files, **164/164** (document chat, F-3/F-3b, role sweep, document scoping) |
| `cd backend && npx vitest run` | 0 | **65 files, 874/874** |
| `cd backend && npx tsc --noEmit -p .` | 0 | — |
| `cd frontend && npx tsc --noEmit -p .` | 0 | — |
| `cd frontend && npm run build` | 0 | — |
| `git diff --check` | 0 | clean |
| Whitespace check of every untracked file | — | clean, except the known trailing space in the historical report `…090418Z-p8-p1-fixes/…:76`, left unchanged |
| Playwright visual check (9 views) | 0 | 0 page errors, no horizontal scroll |
| Provenance `npx tsx src/scripts/sourceProvenance.ts --phase educator-analytics-chat --out <this folder>/SOURCE_PROVENANCE_EDUCATOR_ANALYTICS.json` | 0 | new snapshot; earlier snapshots untouched |

**Count reconciliation:** 808 before + 66 in 1 new file = **874** in 65 files. No existing test was changed.

**Development findings fixed before the final run:**
1. The usage ledger's append-only guard rejected test cleanup; the tests now clear collections directly, like the existing tests.
2. The document-chat privacy guard over-blocked analytics questions; analytics now has its own narrower guard (§9).
3. The Arabic phrase "فجوات التعلم" wasn't recognized as a class-data question.
4. The missing-submissions chart was shown only on request; it's now inferred.
5. The submission-rate column header now includes "(%)".
6. The chart layout fixes listed in §8.

## 12. Remaining gaps, and GO / NO-GO

**Gaps:**
1. **Academic Manager access** in chat is not enabled. The chat route guard (`content:author`) excludes them, and changing it is an authorization change for the owner to decide. Their existing read-only analytics pages are unchanged.
2. **Intent detection is pattern-based.** Paraphrases outside the patterns get a transparent "not a class question" reply, not a report. A model-based planner would need gateway metering and the same allowlist validation, and isn't built.
3. **Not implemented:** attendance, mastery trends over time, term comparison, mixed document + analytics questions, export.
4. **Class naming:** matching a class in the question is a substring match on the class name; with similar names, use the `classId` filter. The chat UI doesn't yet offer a class picker; it's API-only.
5. **Narrow line charts are cramped** (§8). A screen-reader, contrast and keyboard audit was not run.
6. **Unchanged blockers:**
   - F-5 is still unresolved on the live deployment;
   - the $4 English benchmark is still unapproved;
   - Arabic assessment generation stays out of scope.

**Recommendation:**
- **GO** for owner review, and for an internal trial with `educator_analytics_enabled` on for the synthetic staging school only, after the separately approved deployment.
- **NO-GO** for external users until gap 1 is decided, an accessibility audit (gap 5) is done, and teachers have tested it on real-shaped data.

## 13. Files

| Path | State | Origin |
|---|---|---|
| `backend/src/services/educatorAnalytics.ts` | new, untracked | **this task** |
| `backend/src/services/chartPayload.ts` | new, untracked | **this task** |
| `frontend/services/chartPayload.ts` | new, untracked | **this task** (copy of the validator) |
| `frontend/components/AnalyticsReport.tsx` | new, untracked | **this task** |
| `backend/test/educatorAnalytics.test.ts` | new, untracked | **this task** |
| `backend/src/services/educatorChat.ts` | modified (+63/−5 vs HEAD, including earlier F-3b and F-9) | **this task**: analytics routing, `saveAnalytics`, private-detail guard |
| `backend/src/routes/educatorChat.routes.ts` | modified (+4/−3) | **this task** |
| `backend/src/models/EducatorConversation.ts` | modified (+8/−3) | **this task** |
| `backend/src/services/featureFlags.ts` | modified (+3/−1) | **this task** |
| `frontend/pages/workspace/AIChat.tsx` | modified (+15/−10) | **this task** |
| `frontend/services/apiService.ts` | modified (+5/−3) | **this task** |
| `docs/benchmarks/diagnostics/20261029T113202Z-educator-analytics-chat/` | new | **this task**: this report, `TEST_SUMMARY.json`, `VISUAL_CHECK.json`, provenance, `screenshots/` (synthetic data) |
| `backend/src/app.ts`, `curriculumRetrieval.ts`, `p3EducatorChat.test.ts`, deleted `stagingMaintenance.routes.ts`, deleted `p6StagingMaintenance.test.ts` | modified or deleted | earlier P8 / F-3 / F-9 work, unchanged here |
| `backend/test/p8SmallScopeRetrieval.test.ts`, `p7RoleMatrix.test.ts`, `benchmark3Model.ts`, the P7 and P8 report folders | untracked | earlier work, unchanged |

No secrets were found in the new or changed files (checked by pattern scan). The fixtures are synthetic. The screenshots show synthetic names only.
