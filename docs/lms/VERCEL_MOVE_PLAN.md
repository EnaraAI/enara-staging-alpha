# Moving all Vercel projects to a new account — plan

_24 Nov 2026, 11:50 AM Cairo. **Plan only: waiting for Mohamed's "go"** before any step that changes a live site. Every step runs in GitHub Actions; you run nothing. Names only, never values. **test.enara.app moves as it is**: same commit, no code change, no database change, freeze kept; only the hosting account changes._

## First: two GitHub secrets (you set them; I never see the values)
| Secret name | What it is |
|---|---|
| `VERCEL_TOKEN_OLD` | A token of the **old** account, scope = the old team (read projects, env values, domains, deployments) |
| `VERCEL_TOKEN_NEW` | A token of the **new** account, scope = the new team (create projects, env, domains, deploy) |

The existing `VERCEL_TOKEN` and `LMSTEST_MAINTENANCE_TOKEN` stay as they are.

## Before the go: three things to know
1. **Plan of the new team.** The old team was blocked for **exceeding Hobby fair-use limits**. A second Hobby account for the same commercial work is likely against Vercel's terms and would hit the same limits. **Recommended: make the new team Pro** ($20 per seat per month). Pro is also needed for **usage alerts** (spend management); Hobby has none, so the 50%/80% alerts are only possible on Pro.
2. **"Sensitive" variables cannot be read back.** Vercel never returns the value of a variable marked Sensitive. The inventory lists the type of each variable. Any Sensitive one cannot be copied by the Action; you would re-enter it in the new project's dashboard (I give you the exact names and clicks). Hash checks work only for readable types; Sensitive ones are checked by behaviour (health check, and for LMS_KEK a read-back of a stored school secret).
3. **The domain move may need you.** If `enara.app` is on Vercel DNS, moving it between teams is a dashboard action by the domain owner. If DNS is elsewhere (Cloudflare, as `rt.enara.app` suggests), the new team must prove ownership with a TXT record because the old team still holds the name. Either way, step 5 stops and tells you the exact click or record.

## Steps (one line per step per project in the report)
| # | Step | Live site changed? | Done when |
|---|---|---|---|
| 1 | **Inventory (read-only, `VERCEL_TOKEN_OLD`).** Per project: domains, variable names + targets + type, build settings, framework, Node version, region, git connection and production branch, crons, protection, the live deployment and its commit. Written to `docs/lms/VERCEL_MOVE.md` (names only) | No | The file lists every project |
| 2 | **Create the same projects in the new team** (API): same name, settings, Node version, region iad1, production branch, preview deployments off, git connection to `EnaraAI/enara-staging-alpha`. Usage alerts at 50% and 80% if the team is Pro | No (new projects, no domains yet) | Each project exists; settings diff = none |
| 3 | **Copy variables inside the Action.** Values stay in the runner's memory: never printed, written to disk, or committed. Each target (production/preview/development) and type kept; Sensitive ones listed for you. Check: name set equal and SHA-256 of every readable value equal; output only "all match" or the names that differ. `LMS_KEK` and `LMS_KEK_PREVIOUS` must match exactly or the run stops | No | "all match" (plus the Sensitive list, if any) |
| 4 | **Pipeline.** `deploy/lms-test/lib.mjs` constants and `lms-deploy.yml` point at the new project and team, using `VERCEL_TOKEN_NEW`. E2E → merge → deploy → migrations → health check → rollback → one line, unchanged. The guard also refuses the old team after cutover. test.enara.app: no pipeline change beyond the new account (it deploys from its git connection, as today) | No | Draft PR, full E2E green |
| 5a | **lms-test cutover.** Deploy the exact live commit to the new project's `*.vercel.app` URL. Run `/ready`, the JWKS check and the mock-LMS health check there (a real Moodle launch can't run on that URL: the Moodle registration points at lms-test.enara.app). **Stop for your go.** Move `lms-test.enara.app`. Second health check plus a **real Moodle LTI launch and grade passback** | **Yes** | Both checks pass on the real domain |
| 5b | **test.enara.app cutover.** Same exact live commit, deployed in the new project (no code change, no migrations, no maintenance calls: the database is frozen). Checks are read-only: `/health`, `/ready`, the front page. **Stop for your go.** Move `test.enara.app`, then read-only checks again | **Yes** | Same pages and `/ready` on the real domain |
| 5c | **Any other project.** Same pattern, read-only checks, your go before each domain | Yes | — |
| 6 | **After cutover.** Anam and the realtime relay (`rt.enara.app`) allowed origins still cover both domains. Resend sender domain unchanged. Cron callers: the GitHub daily job calls the domain, so nothing changes. Moodle: same domain, so **no re-registration**; proven by the real launch in 5a | No | One line per item |
| 7 | **Rollback, 7 days.** The old team's projects are not deleted. Rollback = move the domain back (same click or record as in 5). After 7 quiet days you decide whether to delete them | — | — |

## Where I stop and wait for you
- After this plan: your **go**, and the two secrets.
- If step 1 finds **Sensitive** variables: you re-enter them in the new project (I list names and clicks).
- Before each **domain move** (5a, 5b, 5c): your go, plus any dashboard click or DNS record the move needs.

## Risks
- **The old team is blocked.** Reads may still work; if the API refuses the inventory too, Vercel support must lift the block for read access first.
- **Deployment protection:** a new project's `*.vercel.app` URL is usually behind Vercel login. The Action creates a protection-bypass key for automation and keeps it in the runner only.
- **MongoDB Atlas:** Vercel's outgoing IPs are not fixed, so the Atlas allowlist stays as today. Region iad1 kept.
- **test.enara.app** holds real data. Its variables are copied, never printed, and no step writes to its database.
