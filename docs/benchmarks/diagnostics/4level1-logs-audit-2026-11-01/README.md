# 4Level1 — Read-only logs and activity audit (2026-11-01)

| | |
|---|---|
| Extraction | 2026-11-01, about 12:07–12:11 UTC. All timestamps are stored and displayed in **UTC** (ISO 8601, `Z`); no conversion was applied. |
| School | **4Level1** (institution reference `inst-…d531`). The full ID is kept in a restricted local evidence index outside the repository. |
| Identity verification | The institution ID was created for "4Level1" in this project's own setup record (`createInstitution`, name "4Level1"). Every 4Level1 account used here belongs to it. Request-log events carry `institutionId`, and only exact matches were included. |
| Deployment observed | `dpl_4hQwNexc1fbnzWc35E8ozL5n71FS` (all retained rows). Commits `2619887`/`9806f3c` per the deployment record. Repository HEAD `9806f3c`; working tree clean before this audit. |
| Sources accessed | **Vercel request logs** (read-only CLI, existing login): yes. **MongoDB**: **no**. Pulling the environment file needed for a read-only connection was refused by the session's safety control (credential materialisation); no workaround was attempted. |

## How to read this

- `unified-timeline.csv` / `.jsonl`: every retained, 4Level1-attributed event, one row each, ascending.
- `user-activity.csv`: per pseudonymous actor (U01…).
- `ai-usage-and-costs.csv`, `alerts-and-operations.csv`: AI/cost and alert/outcome indexes. They hold mostly "not accessed" rows, because those records live in MongoDB.
- `academic-activity.md`, `security-and-audit.md`, `runtime-errors.md`, `retention-and-coverage.md`, `findings-and-recommendations.md`, `evidence-manifest.md`.

## Method

1. Read the code to identify log and activity sources: `requestContext.requestLogger` (`http_request`), `AuditEvent`, `AlertEvent`, `UsageLedger`, `AiCall`, `BudgetReservation`/`BudgetCounter`, `EducatorConversation`, `AssessmentAttempt`/`Assignment` history.
2. Fetched all request logs Vercel returned with `vercel logs --no-branch --environment production --since 30d --json --no-follow`, then paged backwards with `--until` until an empty page.
3. Kept only structured `http_request` entries whose `institutionId` exactly equals 4Level1's.
4. Removed query strings from paths; replaced record IDs with `:id`; replaced user IDs with pseudonyms.
5. No request or response bodies are logged by the application, so none were available or exported.

## Limitations (summary)

- **Vercel retained only about 10 minutes of request logs** (11:57:18–12:07:21 UTC). Older 4Level1 activity is not retrievable from Vercel.
- **No database records were read**, so there are no audit events, alerts, usage ledger, AI calls, grading history or chat metadata.
- **4Level1's accounts are synthetic.** They were created by this project on 31 Oct–1 Nov; no real school activity has been confirmed.
