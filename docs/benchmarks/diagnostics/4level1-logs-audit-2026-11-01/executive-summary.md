# Executive summary — 4Level1 logs audit (2026-11-01, UTC)

## Volume and coverage

- **56 retained events** are attributable to 4Level1, all from Vercel request logs, between **11:59:09 and 12:03:24 UTC on 1 November 2026**. Vercel itself retained 11:57:18–12:07:21 (97 rows, all on the current deployment).
- **No MongoDB records were read.** Access was not available (see the README), so audit events, alerts, the usage ledger, AI calls, grading and chat metadata are **not covered**.

## Real versus synthetic

| Class | Events | Detail |
|---|---|---|
| Real school activity | **0 confirmed** | The 4Level1 accounts are synthetic, created by this project. |
| Agent smoke checks | 6 | Deployment verification against the unpromoted build URL, about 11:59 UTC. |
| Interactive browser session | 50 | One person on the **4Level1 teacher** account at `test.enara.app`, 12:01:34–12:03:24 UTC, ending with sign-out. Most likely the owner reviewing the release. **Not confirmed as genuine school use.** |
| Other school | 6 | Excluded (counted only). |
| Unattributable to any tenant | 35 | Unauthenticated health and readiness checks, docs, logins, link checks. In the appendix only. |

## What the teacher session shows (request metadata only)

- Opened the teaching dashboard, classes, assignments, curricula, assessments, documents, Educator Chat document list and conversations, lesson plans, outcomes and teaching-effectiveness analytics, and today's usage. All returned 200.
- **Completed the product tour** (200).
- **Tried to delete an assessment: refused with 409** (conflict, likely because it is in use).
- **Signed out** (204).
- **No AI-provider route was called** (no tutor, grading, drafting or chat question), so no AI cost is attributable in the retained window.

## Security signals

All 403/401 outcomes in the window come from the agent's own deliberate checks:
- Academic Manager refused by the AI assistant;
- teacher refused from People;
- a cross-school read refused (404);
- unauthenticated docs refused.

No 5xx errors.

## Highest-priority findings

1. **Very short log retention**: Vercel returned only about 10 minutes. Without database access there is no durable activity history for 4Level1.
2. **No database visibility in this session.** The audit trail, alerts and usage ledger that the release added can be read only with a read-only MongoDB connection, which the owner must provide (see recommendations).
3. **The pilot school has no confirmed real users or learners.** All observed activity is testing.
