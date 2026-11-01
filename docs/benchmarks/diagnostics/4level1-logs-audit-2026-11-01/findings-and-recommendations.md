# Findings and recommendations (evidence-backed; recommendations only)

| # | Severity | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| F1 | **High** | No durable activity history is retrievable without database access: Vercel returned only about 10 minutes of request logs | `retention-and-coverage.md`; paging past 11:57:18 UTC returned 0 rows; previous deployment 0 rows | Give the auditor a **read-only MongoDB user** (`read` role on the staging database only), supplied to the session without being echoed. Or export the collections listed in `retention-and-coverage.md` filtered by institution. Consider a log drain (or a higher Vercel plan) if request logs must be kept longer than minutes. |
| F2 | **High** | Persisted audit events, alerts, usage ledger and AI-call records for 4Level1 could not be read | MongoDB not accessed (env pull refused by the safety control) | As F1. Then re-run this audit's database phase. |
| F3 | **Medium** | 4Level1 has no confirmed real activity. All 56 events are agent checks (6) or one interactive session on the synthetic teacher account (50). | `unified-timeline.csv` `data_class` | Before the pilot, create the real classes, rosters and named owners (runbook §4). Label test accounts and sessions so audits can separate them. |
| F4 | Medium | Sign-ins cannot be attributed to a school from request logs: the login request carries no institution | Appendix: `test.enara.app POST /api/auth/login` (1) | Log a `login_succeeded` / `login_failed` event with `userId` and `institutionId` (no email or password), persisted to `audit_events`. |
| F5 | Low | The teacher's attempt to delete an assessment returned 409 (conflict) | timeline 12:02:34 UTC | Confirm the UI explains why (for example, assessment in use by an assignment). No security concern. |
| F6 | Low | 30-day TTL indexes are created by Mongoose autoIndex on first model use; their existence in the staging database is unverified | code (`UsageLedger`, `AuditEvent`, `AlertEvent`); MongoDB not accessed | Verify read-only with `listIndexes` once access exists. Optionally create them explicitly in a reviewed migration. |
| F7 | Info | No 5xx or error-level logs in the retained window. All denials were expected outcomes of deliberate checks. | `runtime-errors.md`, `security-and-audit.md` | — |
| F8 | Info | No AI-provider route was called by 4Level1 actors in the window, so no attributable AI cost there. The analytics assistant (aggregates-only path, code-verified) refused the academic manager before any AI work. | timeline; `ai-usage-and-costs.csv` | Re-check costs from `usage_ledger` once database access exists |

## Inconsistencies

- **Unmapped user IDs:** the project's local setup record lacks IDs for some 4Level1 accounts, so three actors' roles are inferred from the smoke-check call order. The inference is labelled as such.
- **Unparseable rows and timestamps:** none. Timeline order verified ascending. No duplicated Vercel row IDs (97 unique).
- **Missing institution IDs:** 35 rows lack an institution, mainly login, health, docs and unauthenticated checks. They are excluded from the school timeline.
