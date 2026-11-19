# ENARA: rules for every Claude Code session

These rules apply to every session, on every account, until Mohamed changes them.

## Environments
- **test.enara.app and its database are frozen** until Mohamed reopens them.
  - No deploys, migrations, flags, data copies, backups or reads.
  - Don't put test.enara.app steps in plans; mark them "frozen until Mohamed reopens".
- **All work happens on lms-test.enara.app only.**

## How we work
- **Plan first.** Write a short plan as an md file, then wait for Mohamed's "go".
- **No manual runbooks.** Automate checks and send only the result.
  - Ask Mohamed only for what automation truly can't do: a real iPhone, or the Moodle mobile app.
- **Done means the E2E suite passes on the PR.** The suite is `e2e/`, run by `.github/workflows/lms-e2e.yml`.
  - After that, the pipeline merges and auto-deploys to lms-test, runs a health check, and rolls back if it fails.
  - Report one line per deploy.
- **Secrets:** never ask for them in chat, and never print, log or commit them.
- **Simulations and judging** run through the Anthropic API with the real ENARA engine, never with agents standing in.
- **Reports** are short, in plain words.

## Two parallel sessions: never work on the other track's branches
| Track | Branches | Scope |
|---|---|---|
| LMS | `claude/lms-*` | Moodle, parents P1–P5, emails, per-school grade switch, Tailwind build, small fixes, Google Classroom later |
| Tutor | `claude/tutor-*` | Grader fix, ESL6, pilot plan, Track 2 / ESL7, avatar latency, Enara Kids |

## Pointers
- LMS state: `docs/lms/LMS_INTEGRATION_SUMMARY.md`
- Tutor state and the ESL study table: `docs/tutor/TUTOR_HANDOFF.md`
- Before the first real school: `docs/GO_LIVE_CHECKLIST.md`
- Operations, keys and incidents: `docs/lms/OPS_RUNBOOK.md`
- Standing LMS plan and rules: `docs/lms/IMPLEMENTATION_PLAN.md`
