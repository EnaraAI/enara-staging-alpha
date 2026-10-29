# ENARA P10: named-student analytics: implementation and QA

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d`. **Uncommitted, ready for owner review.**

- No paid or provider calls: all model behavior is mocked or comes from a local stub.
- No remote connections, deployment, migrations, environment or flag changes. Staging AI stays paused and its flags off.
- Earlier P0–P9 work, reports and snapshots are preserved.

## 1. Status

| Item | State |
|---|---|
| Named-student report, ranking and named tables (grade, class, course) | **Implemented and tested offline** |
| Duplicate, typo and Arabic name handling; enumeration-safe lookups | **Implemented and tested offline** |
| Router privacy for named requests (students, staff, unknown names) | **Implemented and tested with a mocked model** |
| 120-item benchmark dataset and runner, dry run | **Done ($0, local stub)** |
| Live Haiku benchmark | **Not run, not authorised** (see `P10_LIVE_INTENT_BENCHMARK_PREFLIGHT.md`) |
| Real model accuracy | **Not tested** |
| Screen-reader and keyboard audit | **Not tested** (semantic HTML and buttons only) |
| Academic Manager access | **Blocked by design**: owner decision, unchanged |

## 2. Inspection (before changes)

- **P9 baseline:** confirmed in the working tree. The fixed patterns run first. The P9 router sits behind `educator_analytics_enabled` plus `educator_analytics_ai_router_enabled` (both default off) and goes through `askForJson` → `meteredMessage` (P0d reservation before every attempt, `usage_ledger`). The analytics roles are teacher and Workspace Admin. The chart schema is `chart-v1`, validated on the server and in the browser.
- **Authoritative fields,** each verified separately:

| Concept | Source | Notes |
|---|---|---|
| Student name | `Student.name` | |
| Grade | `Student.grade` (string) | empty → "not recorded" |
| Class (cohort / section) | `Student.batchId` → `Batch.name`, same institution | absent or unknown → "not recorded" |
| Enrolled course | membership of a `CourseInstance` (`studentIds`, or the class's `batchId` through `classStudentIds`, as in `getEnrolledInstances`); the label is `CourseInstance.courseName` | **never inferred from a class or course label** |

  **Terminology mismatch:** the existing code calls a `CourseInstance` a "class" (`loadClassForStaff`, the earlier "Class" columns in aggregate tables). P10's student-level tables label `Batch.name` as **Class** and `CourseInstance.courseName` as **Course**. The aggregate per-class tables keep their previous labels and contracts.
- **Contact and private fields** (`email`, birth date, health and others) exist on `Student` but are **never selected** by P10 code. `Student.find(...).select('id name grade batchId')` is used everywhere.
- **No duplicate services were created.** P10 extends `educatorAnalytics.ts` and `educatorAnalyticsRouter.ts`, and adds one small module, `studentDirectory.ts`.

## 3. Implementation

| File | Change |
|---|---|
| `backend/src/services/studentDirectory.ts` (new) | `studentProfiles` (name, grade, batch class, enrolled courses in scope); `matchStudentNames` (whole words, full names first, Arabic prefixes ال/و/ب/ل/ك/لل, apostrophe normalisation); `nearStudentNames` (edit distance 1, or 2 for parts of 8+ letters; parts of 4+ letters) |
| `backend/src/services/educatorAnalytics.ts` | Intents `student_report` and `student_ranking`; `parsePeriod` / `parseChart` extracted (same rules); `resolveNamedStudent` (authorised students only, **before any router call**; `studentId` checked against scope, otherwise an identical 404); ambiguity, typo and several-student clarifications with `candidates`; the student report (per-assessment status and score, submission rate, mean, missing, line chart when 2+ graded, scope = 1 student); ranking (competition ranks, highest or lowest first, grade/class/course, duplicate names labelled by class in the chart); grade, class and course columns in the declining and missing tables; EN/AR templates |
| `backend/src/services/educatorAnalyticsRouter.ts` | Redaction now also covers **staff names** and **possible unknown names**: capitalised non-vocabulary words mid-sentence, and the word after cues such as student/son of/named, الطالب/ابن/اسمه. All become `[person]`. School-wide class names are kept. Optional output keys `studentReference` (placeholder only, and it must appear in the request) and `rankOrder`. Router `student_report` → "couldn't match a student in your classes". `ROUTER_SYSTEM_PROMPT` is exported for the cost bound. |
| `backend/src/services/educatorChat.ts`, `backend/src/routes/educatorChat.routes.ts` | `studentId` passed through (a string of at most 80 characters, checked against scope) |
| `frontend/components/AnalyticsReport.tsx` | Student profile line; candidate list as `<button type="button">` (keyboard-focusable, with a focus outline) |
| `frontend/pages/workspace/AIChat.tsx`, `frontend/services/apiService.ts` | Choosing a candidate re-asks with `studentId` |
| `backend/src/scripts/benchmarkIntentRouter.ts` (new) | Benchmark runner (see the preflight report) |
| `backend/test/p10NamedStudents.test.ts` (new) | 24 tests |

**Fixed during development**, all found by the new tests:
1. A regex escape bug in the person redaction (a 500 error).
2. A **privacy leak**: in "the kid called bobo", the cue consumed "called" and left "bobo" unredacted. Fixed with a lookbehind that consumes nothing.
3. The student report showed the class size as its scope.
4. A class-level "excluded attempts" note appeared on single-student reports.

**Existing tests changed** (intended contract changes; the original values are still asserted):

| Test | Change | Why |
|---|---|---|
| `educatorAnalytics.test.ts` | Declining rows gain `grade`, `class` and `course` | P10 named-table columns |
| `educatorAnalytics.test.ts` | Missing row: `class` key → `course`, plus `grade` and `class` | P10 named-table columns |
| `p9AnalyticsRouter.test.ts` | The redaction test now uses a student the teacher **does not** teach (Hiba) instead of their own student | Names of the teacher's own students are now resolved locally, so that question no longer goes to the router |

## 4. Report semantics

- **Student report:** submission rate = submitted ÷ due for this student in the period (courses in scope). Mean = their most recent finalized or released score per assessment. **Missing work is never counted as 0**, and the chart plots graded scores only. Statuses come from the existing `studentStatus` rules (extensions, late policy).
- **Ranking:** mean graded score per student. Students with no graded score are excluded, and the count is stated. Equal means share a rank (competition ranking). Ties are ordered by name. A caveat warns that averages rest on different numbers of graded assessments.
- **Aggregate reports** (class performance, distribution, trends, gaps) still list no students.

## 5. Tests and checks

| Command | Exit | Result |
|---|---|---|
| `cd backend && npx vitest run test/p10NamedStudents.test.ts test/p9AnalyticsRouter.test.ts test/educatorAnalytics.test.ts` (×2) | 0 | **136/136** both times (24 + 46 + 66) |
| `… + p3EducatorChat + p8SmallScopeRetrieval + p7RoleMatrix + p2Documents + elie.sprint6` | 0 | 8 files, **245/245** (document chat, F-3/F-3b, F-9, role sweep, document scoping, retrieval) |
| `cd backend && npx vitest run` | 0 | **67 files, 944/944** |
| `cd backend && npx tsc --noEmit -p .` | 0 | — |
| `cd frontend && npx tsc --noEmit -p .` | 0 | — |
| `cd frontend && npm run build` | 0 | — |
| `git diff --check` | 0 | clean |
| Whitespace check of every untracked file | — | clean, except the known historical `…090418Z-p8-p1-fixes/…:76`, left unchanged |
| Secret scan (new and changed files, this folder) | — | none |
| Benchmark dry run (`benchmarkIntentRouter.ts`, local stub) | 0 | 120/120 evaluated; 0 scope violations, 0 PII, 0 writes; 77 attempts = 77 ledger rows |
| Live-mode refusals (no `--authorize-paid`; no key; Opus over the cap) | — | all NO-GO before any request |
| Provenance `npx tsx src/scripts/sourceProvenance.ts --phase P10-named-analytics --out …` | 0 | `SOURCE_PROVENANCE_P10_NAMED_ANALYTICS.json`. The script's fixed file list doesn't include the analytics files, so their SHA-256 hashes are in `P10_TEST_SUMMARY.json`. |

**Count reconciliation:** 920 + 24 (1 new file) = **944**. The three edited tests changed expectations, not counts.

**Provenance path note:** the script joins `--out` onto the repo root, so the absolute path I passed first created `tmp/…` inside the repository. That folder held only this run's snapshot. I moved the snapshot here and removed the stray folder.

**Visual check** (Playwright, real component, synthetic data; `screenshots/p10-*.png`):

| View | Result |
|---|---|
| Arabic student report (900 px and 375 px) | 3-point line, RTL |
| English student report | 2-point line plus profile line |
| Arabic ranking (900 px and 375 px) | 5 bars, duplicate names labelled "Sara Ali (6B)" and "Sara Ali (5A)" |
| Choose-a-student list | renders |

0 page errors and no horizontal page scroll in every view.

## 6. Privacy and authorisation evidence

See `NAMED_STUDENT_ROLE_MATRIX.md`. In summary:
- teacher → taught classes, admin → own school;
- ENARA Admin, Academic Manager, students and anonymous users are refused **before any model call**;
- five kinds of out-of-scope `studentId` return the **same** 404;
- out-of-scope names are never resolved;
- the mocked model's requests never contain any synthetic student or staff name, unknown name, roster, score or id (5 cases: out-of-scope student, unknown capitalised name, staff name, Arabic cue name, lower-case cue name);
- a P0d reservation precedes the mocked call; an exhausted budget means no call, while local named reports keep working;
- no writes.

## 7. Limitations

1. **Name matching is lexical.** Transliteration across scripts ("Nour" vs "نور") isn't matched; typo suggestions need words of 4+ letters. Unknown lower-case names without a cue word can still reach the router; the cue list and capitalisation heuristic reduce but **do not eliminate** this. Recommendation: keep the router flag off until the live test and an owner decision.
2. **Over-redaction** (capitalised non-vocabulary words such as brand or place names) costs some router recall. It is privacy-safe.
3. **Model accuracy is unmeasured** until the live benchmark runs.
4. **Per-student learning outcomes** are not in this version; such requests get the student report with a note.
5. **Accessibility:** no screen-reader, keyboard or contrast audit was run.
6. **Unchanged blockers:**
   - F-5 is still unresolved on the live deployment;
   - the $4 English assessment benchmark is still unapproved;
   - Arabic assessment generation stays out of scope;
   - Academic Manager access to chat is the owner's decision.

## 8. Recommendation

- **GO** for owner review of the code.
- **GO-ready** for the live Haiku benchmark, pending explicit authorisation ($0.25 cap; worst case $0.1617).
- **NO-GO** for enabling the router flag or named analytics for external users until the live benchmark passes its thresholds, the accessibility audit is done, and the owner accepts limitation 1.
