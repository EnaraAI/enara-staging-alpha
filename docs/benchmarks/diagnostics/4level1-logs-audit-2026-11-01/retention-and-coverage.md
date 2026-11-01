# Retention and coverage

| Source | Type | Tenant scope | Access | Observed range (UTC) | Retention (code / provider) | Status |
|---|---|---|---|---|---|---|
| Vercel request logs (project `enara-staging-alpha`, production) | runtime | `institutionId` in `http_request` JSON (exact) | **read** (CLI) | 11:57:18 – 12:07:21, 1 Nov 2026 (97 rows) | Provider-controlled. Only about 10 minutes were returned; paging back and the previous deployment returned nothing | Incomplete (provider retention) |
| MongoDB `audit_events` | audit | `institutionId` | **not accessed** | — | TTL 30 days on `at` (index `retention_30d`, created by Mongoose autoIndex on model use; creation not verified) | Unknown |
| MongoDB `alert_events` | alert | `institutionId` | **not accessed** | — | TTL 30 days on `at` | Unknown |
| MongoDB `usage_ledger` | usage/cost | `institutionId` | **not accessed** | — | TTL 30 days on `createdAt`; budget counters unaffected | Unknown |
| MongoDB `ai_calls`, `budget_reservations`, `budget_counters` | usage | `institutionId` | **not accessed** | — | Reservations expire per TTL; counters long-lived | Unknown |
| MongoDB `educator_conversations` | chat metadata | `institutionId`, `userId` | **not accessed** | — | `expiresAt` set at write; 30 days for conversations saved from now on (180 days for older ones) | Unknown |
| MongoDB `assessment_attempts`, `assignments` (history arrays) | academic | `institutionId` | **not accessed** | — | No TTL | Unknown |
| MongoDB `users` / `account_tokens` (invitations, resets) | identity | `institutionId` | **not accessed** | — | Invitations and resets expire; no sign-in history is stored (sign-ins exist only as request logs) | Unknown |
| PostgreSQL ingestion queue | job | — | **not configured** on staging (`/ready`: postgres not_configured) | — | — | Not implemented here |
| Cloudflare R2 | storage | school-prefixed keys (new uploads) | not accessed (no read-only tool used) | — | — | Unknown |

## Retention behaviour (code-verified)

- Deletion is done by **MongoDB TTL indexes**. No job runs it; there is also no scheduler (owner decision).
- **Gap:** TTL indexes exist only after Mongoose builds them, which happens when a model is first used on a running instance. Whether they exist in the staging database was not verified.
- Old records (more than 30 days) cannot exist for `audit_events`/`alert_events` anyway: those collections were introduced today.

## Coverage statement

What is reported is **all retained Vercel request records that Vercel returned**. It is not everything that ever happened. Any 4Level1 activity before 11:57 UTC on 1 November is not covered.
