# Migration Plan

Migrations run through the existing runner (`backend/src/migrations`), on start-up with a lock or with `npm run migrate`. Each is idempotent and additive; none deletes data. Running them on the sandbox happens when `phase2-elie` is merged into `connect-backend` (which deploys): **that merge needs the owner's approval** (DECISIONS D6).

| Id | Does | Recovery |
|---|---|---|
| `2026-10-25-elie-foundations` | Creates indexes for objectives, evidence and events; gives existing events an idempotency key; marks a duplicate with `supersededBy` instead of deleting it; sets `processing.evidence` (`pending` for verified graded answers) | Re-runnable: only touches events without a key and not superseded. To undo the keys: `$unset idempotencyKey, processing, supersededBy` (no data lost) |
| `2026-10-25-elie-mastery-indexes` | Indexes for mastery state and history | Indexes only |

No migration creates evidence or mastery: the daily cron (and each student's next action) processes pending events once a school has mastery tracking on. That is the supported backfill: it uses only events whose questions a person has linked.
| `2026-10-25-elie-diagnostics-indexes` | Indexes for diagnostic sessions and misconceptions | Indexes only |
| `2026-10-25-elie-pedagogy-indexes` | Indexes for interventions, decisions and TTU | Indexes only |
| `2026-10-25-elie-retention-indexes` | Indexes for objective retention | Indexes only |
| `2026-10-25-elie-curriculum-indexes` | Indexes for curriculum passages and processing jobs | Indexes only. Passages are built by processing, not by the migration |

## Validation (Sprint 7, `elie.sprint7.test.ts`)
- All migrations run on a database with pre-Phase-2 events; a second run applies nothing.
- Documented undo of the foundations migration (unset `idempotencyKey`, `processing`, `supersededBy`; delete its record, whose key is `_id` in the `migrations` collection) followed by a re-run gives identical events.
- Forward recovery: deleting evidence and mastery and marking events pending, then processing, gives identical mastery.
