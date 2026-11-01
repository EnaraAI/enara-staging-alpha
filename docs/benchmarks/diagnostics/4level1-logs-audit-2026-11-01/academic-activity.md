# Academic activity — 4Level1

Evidence comes only from request metadata in retained Vercel logs, 11:59–12:03 UTC on 1 November 2026. No database records were read.

## Observed in the retained window (interactive session, teacher account U03)

| Action | Requests | Outcome |
|---|---|---|
| View classes (`/api/learning/classes`) | 6 | 200 |
| View class assignments (`/api/assignments/classes`) | 8 | 200 |
| View curricula (`/api/curriculums`) | 6 | 200 |
| View assessments (`/api/assessments`) | 3 | 200 |
| **Delete an assessment** (`DELETE /api/assessments/:id`) | 1 | **409 conflict, not deleted** |
| View documents and Educator Chat documents and conversations | 6 | 200 |
| View lesson plans | 2 | 200 |
| View outcomes and teaching-effectiveness analytics | 4 | 200 |
| Teaching dashboard and feature switches | 6 | 200 |

Agent smoke checks (synthetic) touched courses (student), documents (teacher) and one cross-school curriculum (404).

## Journey reconstruction

| Stage | Retained evidence |
|---|---|
| Assessment creation / publication | No matching retained record found |
| Student submission | No matching retained record found |
| Grading (attempts, retries, exceptions, release) | No matching retained record found (lives in `assessment_attempts.history`; MongoDB not accessed) |
| Mastery / gap / intervention / reassessment | No matching retained record found |
| Progress or report generation | Teacher **viewed** outcomes and teaching-effectiveness analytics. A view does not show any learning outcome exists. |

**Context (not log evidence):** this project's setup record notes that 4Level1's earlier test data was removed on 1 November (one quiz and one objective archived). It also notes that 4Level1 has no confirmed classes or learners for a pilot. A list request returning 200 does not show that records exist.

No real student activity is confirmed. Nothing here may be presented as a 4Level1 learning outcome.
