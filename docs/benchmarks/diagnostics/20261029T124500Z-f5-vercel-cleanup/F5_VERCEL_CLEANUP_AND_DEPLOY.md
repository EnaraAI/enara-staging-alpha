# F-5 cleanup and Vercel deploy (staging)

**Date:** 2026-10-29 · **Authorization:** owner, in chat: "deploy it to vercel and you're authorized to excute all the 3 pending tasks"

## What was done

1. **Removed** `STAGING_MAINTENANCE_TOKEN` from the Production environment of the Vercel project `enara-staging-alpha` (`vercel env rm`).
2. **Deployed** commit `5725490` (`staging-alpha`), the code with the maintenance route removed (P8), as a production deployment:
   - deployment `dpl_D3aGiXSqZhujZ3pVsTKEonG7wUDb`, served at `https://enara-staging-alpha-hiqrdru8q.vercel.app`;
   - aliased to `https://enara-staging-alpha.vercel.app`.
3. **Deleted** the local copy of the old maintenance token in the session scratchpad.

## Verification against the live alias

| Check | Result |
|---|---|
| Maintenance `status` and `migrate` with the old token | 404 |
| Maintenance route without a token / with GET | 404 |
| `/health` | 200 |
| `/ready` | 200 (mongo ok) |
| Home page | 200 |
| `/api/educator-chat/ask` without login | 401 |

## Unchanged

- AI stays paused on staging.
- The `educator_analytics_enabled` and `educator_analytics_ai_router_enabled` flags stay off.
- No migrations were run, and no production (non-staging) system was touched.
