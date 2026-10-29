# P10 named-student role matrix

Scope is always derived from the session; requests and model output can only narrow it. **All rows below are tested** in `backend/test/p10NamedStudents.test.ts` (P10), `p9AnalyticsRouter.test.ts` (P9) and `educatorAnalytics.test.ts` (analytics slice), on synthetic fixtures. Nothing here was tested against a live deployment.

| Identity | Named-student reports in chat | Which students can be resolved | Fields shown | Evidence |
|---|---|---|---|---|
| Teacher | Yes, when both analytics flags are on and no document is selected | Only students enrolled in a class they instruct (`CourseInstance.instructorIds`, membership through `studentIds` or batch) | Name, grade (`Student.grade`), class (`Batch.name` via `Student.batchId`, same school), courses (enrolment in their scope), per-assessment status and score | "student report…", "ambiguity…", "authorisation and enumeration…" |
| Workspace Admin | Yes | Students enrolled in any class of their own school | Same | "Workspace Admin sees both same-named Arabic students…" |
| Academic Manager | **No**: 403 (existing chat route guard, unchanged); no model call | — | — | "roles: ENARA Admin, Academic Manager, student and anonymous are refused" |
| ENARA Admin | **No**: 403 `ANALYTICS_NOT_PERMITTED` before any routing; no model call | — | — | same |
| Student | **No**: 403 | — | — | same |
| Anonymous | **No**: 401 | — | — | same |
| Disabled or unknown account (e.g. an invitation never accepted) | **No**: 401 | — | — | analytics-slice tests |
| Other school | Never: other-school students are not candidates, even with the same name | — | — | "two authorised students share a name…" (the school-B Sara Ali is never listed) |

## Lookup outcomes

| Request | Outcome |
|---|---|
| Name of one authorised student (English, Arabic, Arabic prefix, possessive, without a diacritic, apostrophe or hyphen) | Student report |
| Name shared by 2+ authorised students | A question back listing only those students, with grade, class and course; **never picks one silently**; the user's pick is sent as `studentId` and checked against scope |
| Close misspelling of an authorised student's name | "Did you mean…" with the candidate; never chosen automatically |
| Two different students in one request | "One student at a time" |
| `studentId` of another teacher's, withdrawn, unenrolled, other-school or invented student | **Identical 404 `STUDENT_NOT_FOUND`** in all five cases (enumeration-safe) |
| Name of a student outside scope (router off) | Generic "not a class question" reply; nothing revealed |
| Name of a student outside scope, staff name or unknown name (router on) | Redacted before any call; the model's student report becomes "couldn't match that to a student in your classes" |
| Contact details, birth date or health of a named student | Refused (private-details guard); never read |
| Prompt injection alongside a name | Only the named authorised student; other names, classes and schools ignored |
| Name with HTML/script characters | Rendered as escaped text |
