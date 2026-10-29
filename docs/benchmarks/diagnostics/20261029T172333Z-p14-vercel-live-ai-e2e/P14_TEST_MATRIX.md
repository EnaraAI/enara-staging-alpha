# P14 test matrix: deployed Vercel staging

**No test in this matrix was executed.** Gates 1–5 are not satisfied (see `P14_GATE_REPORT.md`), so every stage is **BLOCKED**.

The endpoints are the planned deployed-app routes, taken from the source at `cc8530f`. All are relative to `https://enara-staging-alpha.vercel.app`; none were called.

The latency and cost columns stay empty because nothing ran.

| Phase | Stage | Planned deployed endpoint(s) | Status | Evidence | Latency | Cost |
|---|---|---|---|---|---|---|
| 0 | Deployment evidence | `GET /health`, `GET /ready` (public); Vercel metadata | **VERIFIED** (public only) | 200 / 200 at 17:23Z; `dpl_GUdo…` Ready. `postgres: ok` is **not proof** (`DATABASE_URL` absent; `app.ts:176-188`). | — | $0 |
| 0 | Synthetic accounts' role and scope verified | `GET /api/me` per account | BLOCKED | Authenticated requests not allowed before the gates pass | — | — |
| 1 | Login per role (teacher, workspace admin, academic manager, student, unauthorized) | `POST /api/auth/login` | BLOCKED | No student or unauthorized account on file (gate 4) | — | — |
| 1 | Tenant isolation and role access | Teacher and admin reads across schools and classes (for example `GET /api/assessments`, `/api/learning/analytics/outcomes`) | BLOCKED | Gates 1–4 | — | — |
| 1 | Non-AI assessment retrieval and persistence | `POST /api/assessments` (teacher-authored), `POST /api/assignments`, `POST /api/me/assignments/:id/attempts`, `…/submit`, `GET …/result` | BLOCKED | Gates 1–4 (writes) | — | — |
| 2 | AI tutor | `POST /api/me/tutor/sessions`, `POST /api/me/tutor/sessions/:id/messages` | BLOCKED | Gate 5 (no key, no hard limit) | — | — |
| 2 | Assessment drafting | `POST /api/assessments/generate` | BLOCKED | Gate 5 | — | — |
| 2 | Rubric grading, English + MSA | Triggered by `…/attempts/:id/submit` on open-response items | BLOCKED | Gate 5; grading retry needs a scheduler (no cron) | — | — |
| 2 | Learning Intelligence | Evidence and mastery processing after release; `GET /api/learning/analytics/outcomes` | BLOCKED | Gates 1–5 | — | — |
| 2 | Educator AI chat, names shown to the teacher and redacted before the model | `POST /api/educator-chat/ask` | BLOCKED | Gate 5; router must stay OFF (P10 below target) | — | — |
| 3 | Full journey: assessment → gap → tutor intervention → reassessment → outcome and analytics | `POST /api/learning/interventions`, `…/start`, `…/complete`, reassessment assignment, `GET /api/learning/analytics/outcomes`, `POST /api/educator-chat/ask` (fixed-pattern analytics) | BLOCKED | Gates 1–5 | — | — |
| 3 | Ledger and cap reconciliation | Admin read of the staging `usage_ledger` and P0d reservations; provider console | BLOCKED | Gate 5 | — | — |

**No `P14_SPEND_LEDGER.csv` was produced**, because no paid calls were approved for execution or made.
