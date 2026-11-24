# One test for every environment variable — plan

_24 Nov 2026, 12:35 PM Cairo. **Plan only: waiting for Mohamed's "go".** Names and states only (ok / missing / rejected); no value is printed, logged or committed. No Anthropic spending: the AI-key checks use free "list models" calls, never a model call._

## What "tested" means
Each variable gets one of four results:
- **set**: the name is set in Vercel for the right target;
- **well-formed**: the value parses as expected (URL, number, true/false, key prefix);
- **works**: the service it belongs to accepted it with a call that changes nothing;
- **missing**: the code needs it but Vercel does not have it, or **unused**: Vercel has it but the live code never reads it.

Sensitive values cannot be read from Vercel by anyone, so for them "works" can only be proven from inside the running site. That is why the test has two parts.

## Part 1: from outside, read-only, all 3 projects, no deploy (can run today)
A GitHub Action, `env-check`, with `VERCEL_TOKEN_NEW`:
1. **Names:** the variable names the live commit of each project reads (`process.env.*` and `backend/src/config`), compared with the names set in Vercel, giving **missing** and **unused** lists.
2. **Readable values** (non-sensitive): format checks in the runner's memory (URLs parse, numbers are numbers, switches are true/false, `ENARA_ENGINE_V2` names only known features).
3. **Running site:** `/ready` on lms-test and test.enara.app reports mongo, r2, anthropic, anam and elevenlabs as configured or not. lms-test also gets its full health check (LTI flow, which uses `LMS_KEK`). enara.app gets its front page.

## Part 2: from inside lms-test, after the deploy freeze lifts (one small PR, full E2E)
A maintenance endpoint `POST /api/maintenance/env-check` behind `MAINTENANCE_TOKEN`, read-only. One call per integration that changes nothing:

| Variable(s) | Check |
|---|---|
| `MONGODB_URI` | ping |
| `DATABASE_URL` | `SELECT 1` (if set) |
| `R2_*` | list one object in the bucket (no write) |
| `RESEND_API_KEY`, sender | list domains; the sender's domain is verified |
| `ANAM_API_KEY` | list personas |
| `ELEVENLABS_API_KEY` | read the account |
| `ANTHROPIC_API_KEY` (and fallback) | list models (free) |
| `TUTOR_LLM_*` (DeepSeek) | the endpoint's health route |
| `JWT_SECRET` | sign and verify a test token in memory |
| `LMS_KEK` | decrypt one stored tool secret (no write) |
| `INGEST_HMAC_SECRET` | sign and verify in memory |
| `CRON_SECRET`, `MAINTENANCE_*`, `SEED_USER_PASSWORD`, `API_DOCS_PASSWORD` | set and long enough (calling cron would run jobs) |

- **Reply:** names and states only.
- **On every deploy:** the pipeline's health check calls it, so a broken key fails the deploy and rolls back.
- **Switch:** none. It is a maintenance endpoint, off unless `MAINTENANCE_ENDPOINTS_ENABLED` is set, as today.

## test.enara.app and enara.app
- **test.enara.app is frozen:** no code change is allowed, so Part 2 cannot run there. It gets Part 1 only. Its Sensitive keys (Resend, Anam, ElevenLabs, R2, Google, `LMS_KEK`) stay unproven until you unfreeze it, or until you log in and start an avatar session by hand.
- **enara.app:** Part 1 (3 variables).

## Output
- **One table per project:** variable name → set / well-formed / works / missing / unused.
- **Where it goes:** written to `docs/lms/ENV_CHECK.md` and summarised in one line per project.

## Order, on your "go"
1. Part 1 now (about 10 minutes).
2. Part 2 as a draft PR with full E2E; it runs on lms-test when you say lms-test is back.
