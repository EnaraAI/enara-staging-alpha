# ENARA LMS end-to-end suite (Moodle in Docker + Playwright)

Fake data only. Never points at lms-test.enara.app or test.enara.app. Needs no
repository secrets: `scripts/gen-env.sh` generates every secret and test
password per run into `e2e/.env` (git-ignored).

## What runs

| Container | What |
|---|---|
| `caddy` | https for `moodle.school.test` and `enara.tool.test` (two different sites, as a school's Moodle and ENARA are), certificates from Caddy's own CA (`tls internal`). Serves the ENARA SPA like the Vercel project and proxies the API paths |
| `moodle` | `moodlehq/moodle-php-apache:8.3` + a Moodle checkout (`MOODLE_SRC`); trusts Caddy's CA; cURL security opened for the private network |
| `postgres` | Moodle's database (17; also ENARA's `DATABASE_URL`, needed in production mode) |
| `mongo` | ENARA's database on `enara-lms-test.local` (the maintenance routes accept only `enara-lms-test.*` hosts) |
| `enara` | `Dockerfile.staging-single`, `NODE_ENV=production`, `ENARA_STAGING=true`, every LMS switch on, multi-class switches as on lms-test. No AI tutor or avatar provider and AI paused (as lms-test today): nothing in the suite calls an AI service or sends email |

Scenarios (`tests/`, run in order, one worker): 1 registration + launches + preview,
2 picker, 3 page links + due date, 4 grades, 5 roster + "Changed in LMS",
6 School B isolation, 7 mic checks (Chrome; `webkit.spec.ts` for Safari),
8 onboarding (skipped until that feature is merged), 9 Phase 8 activities
(tutor, live avatar, diagnostic: no grade column, the "not set up" message
without any AI call, the teacher overview, mic blocked → new tab).

## CI

`.github/workflows/lms-e2e.yml`: pull requests from `claude/lms-*` branches and
manual runs. Artifacts: `lms-e2e-<moodle>` (Playwright report, test results,
summary, docker logs) and `e2e-screenshots-<moodle>` (key screenshots + summary).
The screenshots are also force-pushed as one orphan commit to branch `e2e-results`.

## Locally

```bash
cd e2e
npm ci && npx playwright install chromium webkit   # once (plus install-deps)
git clone --depth 1 -b MOODLE_405_STABLE https://github.com/moodle/moodle.git ../../moodle-src
docker build -f ../Dockerfile.staging-single -t enara-e2e:local ..
./scripts/gen-env.sh && ./scripts/hosts.sh
MOODLE_SRC=../../moodle-src ./scripts/up.sh
npx playwright test && node scripts/summary.mjs
./scripts/down.sh
```

Without building the image, `docker-compose.local.yml` runs ENARA from a local
`backend/dist` and `frontend/dist` (see the file).
