# Moving lms-test to test.enara.app — plan

_24 Nov 2026, 6:30 PM Cairo. **Plan only: waiting for Mohamed's "go".** Nothing on test.enara.app is touched until then: no code, no variable, no database change. Facts below come from read-only checks today. Secret values are never read or shown; names only._

## In three lines
1. **The gap is large:**
   - test.enara.app runs a 16 Nov commit (`894f3ee7`) with **18 migrations**; lms-test-live has **37** (19 new: LMS, multi-class, parents, PDPL retention, Moodle quiz, assessment engine).
   - lms-test has **34 variables** test.enara.app lacks (LMS, parents, enrollment, tutor-model switches).
   - test.enara.app has **no `ENARA_ENGINE_V2`** today, so every tutor switch there is off.
2. **The move is a code-and-switch move, not a data move.**
   - test.enara.app keeps its own database and users.
   - Nothing from lms-test's database is copied: seed data, mock schools and model-marked marks stay on lms-test.
3. **Same pattern as the Vercel move:** backup → migration dry run → shadow URL → real Moodle launch → cutover → 7 days to roll back. The real-user risk sits in the 19 migrations, so they get a dry run on a copy first.

## 1. GO_LIVE_CHECKLIST.md (status on 19 Nov), checked today
| # | Item | Status | Evidence / what is missing |
|---|---|---|---|
| 1 | Reopen test.enara.app; rollout plan for OK | **Needs you** | Still frozen. This plan is the rollout plan |
| 2 | Production email sender and support reply-to | **Needs you** | lms-test sends only to a test inbox (`REMINDER_TEST_RECIPIENT`); its Resend key is send-only, so the sender domain could not be checked |
| 3 | Grader accuracy bar (grades to real schools stay off until it passes) | **Not done** | v3b and Mishkat are measured against model marks only. Teacher marks (50+50 sheet, sent today) are the missing evidence |
| 4 | Per-school grade switch | **Not done** | Code has one site-wide `LMS_GRADE_PASSBACK_ENABLED` (`config/env.ts`, `lms/core/flags.ts`); nothing per school |
| 5 | Resend plan upgrade | **Needs you** | Free tier (100/day) unchanged |
| 6 | Daily job on `main` + `LMSTEST_CRON_SECRET` | **Not done** | `lms-test-daily.yml` is on `lms-test-live`, not on `main`. Secret names cannot be listed from here |
| 7 | One real-device session (iPhone Safari, Moodle app) | **Needs you** | No record |
| 8 | Final read of `docs/lms/SCHOOL_GUIDE.md` | **Needs you** | No record |
| 9 | Build the styling instead of the Tailwind CDN | **Not done** | `frontend/index.html` still loads `cdn.tailwindcss.com` |
| 10 | Revoke the "Protection Bypass for Automation" secret on enara-lms-test | **Not verified** | Needs a read-only Vercel check (I can run it; it changes nothing) |
| 11 | Tutor and avatar on lms-test (`ANAM_API_KEY`, AI on) | **Done** | Variable check today: Anam key ok, AI test-spend cap set, DeepSeek tutor ok |
| 12 | Children's speaking: parent consent | **Needs you** | `kidsSpeaking` is on for lms-test only |
| 13 | Full-seed remove before go-live | **Not done (by design)** | Only for lms-test's database. It is never copied, and the move does not copy data |

**Also done today:**
- the Vercel move: all projects in the new team, 0 differences;
- a variable test on every deploy;
- `/ready` fixed;
- the Mishkat service live, with `mishkatSplit` on lms-test via PR #111.

## 2. lms-test-live against test.enara.app
| Area | test.enara.app (live `894f3ee7`, 16 Nov) | lms-test-live (`a8c06e0b`+) | What the move means |
|---|---|---|---|
| Code | 16 Nov build | 1,216 files differ (most of the added lines are kids' pictures and data; the rest is LMS, parents, assessment engine, email) | Deploy lms-test-live, unchanged |
| Migrations | 18 | 37: **19 new**, including `class-enrollments-step1`, **`pdpl-data-log-retention`** (may delete old logs), parents p1–p5, `lms-moodle-quiz`, `assessment-engine-p1a` | Dry run on a copy first. Staging mode never migrates on start, and the maintenance route refuses non-test clusters, so a one-off migration path is needed (step 2) |
| Variables | 34 (9 Sensitive) | 66 (16 Sensitive) | 34 names to add (step 4). Only on test.enara.app: `ELEVENLABS_API_KEY`, `GOOGLE_CLIENT_ID` (keep) |
| Switches | none (`ENARA_ENGINE_V2` unset) | 20 feature groups in `deploy/lms-test.flags.json` | Section 4: a reduced list |
| Curricula and bench data | none in `data/curricula`, `data/assessment-bench` | 21 + 21 files | Ship with the code (read-only files) |
| Seed data | real data | full seed (`seed_registry`), health-check school LT-SCHOOL-A, mock LMS | **Never copied.** Each database stays its own |
| Modal | none | DeepSeek tutor endpoint; Mishkat service | Same endpoints. Mishkat stays off on test.enara.app at first |
| Anam, ElevenLabs | own keys | own keys | Keep test.enara.app's keys; add Anam-related switches only when wanted |
| Resend | own key | send-only key, test inbox | Production sender decision (checklist #2) before any parent or LMS email is switched on |
| R2 | own bucket | own bucket | Unchanged; no file copy |
| Moodle / LTI | no LTI code live | registrations live in lms-test's database, bound to lms-test.enara.app | **New registration** on test.enara.app's domain for any Moodle site. `LMS_KEK` already exists there (unused today) |
| Staging guard | database `enara_staging_alpha` enforced | same guard | Unchanged |

## 3. Steps, each with a check and a rollback
| # | Step | Check | Rollback |
|---|---|---|---|
| 0 | **Read-only prep (no change):** list test.enara.app's collections and counts; confirm the database name; Vercel protection-bypass check (#10) | Counts recorded | — |
| 1 | **Backup** of test.enara.app's database (Atlas snapshot or `mongodump` by you, or an Action with a read-only user you create) | Snapshot listed; restore tested on a scratch cluster | — |
| 2 | **Migrations dry run on a restored copy:** run the 19 new migrations against the copy (one-off GitHub Action; database URI from a secret you add) | Every migration ok; counts before and after; the PDPL retention step reports how many documents it would remove | Drop the copy |
| 3 | **Code PR for the move** (no deploy): pipeline target for test.enara.app (guard: project `enara-staging-alpha`, new team; refuses lms-test); a reduced flags file `deploy/test-enara.flags.json`; the one-off migration path | Full E2E | Revert |
| 4 | **Variables:** add the 34 missing names to test.enara.app (values: you for Sensitive ones; switches from the flags file) | Variable check reaches every service | Remove the added names |
| 5 | **Shadow deploy:** a new deployment of lms-test-live in the test.enara.app project, **not promoted**, on its `*.vercel.app` URL (protection bypass for the check only). Read-only checks only; migrations not yet run | `/ready`, JWKS, variable check, front page | Delete the deployment; users never saw it |
| 6 | **Real Moodle launch on the shadow URL:** register a Moodle test course against the shadow tool URLs; launch as teacher and student | Launch, roster, grade to the Moodle gradebook | Remove the test registration |
| 7 | **Cutover** at a quiet time, after the go: final backup → migrations on the real database → promote the shadow deployment | `/ready`, a login per role, variable check, one real Moodle launch on test.enara.app | Promote the previous deployment (minutes) and restore the backup if a migration damaged data |
| 8 | **7-day watch:** errors, grades, email counts (test recipient first), Modal and Vercel usage | Daily one-line report | The old deployment stays available for 7 days; the backup is kept 30 days |

## 4. Switches on test.enara.app at first
**Stay off:**
- `mishkatSplit`;
- `kidsPack` and `kidsSpeaking` (parent consent first);
- anything that grades from model-marked data;
- `LMS_GRADE_PASSBACK_ENABLED` (no per-school switch yet, no accuracy bar);
- `LMS_EMAILS_ENABLED` and `PARENT_EMAILS_ENABLED` until the production sender and the Resend upgrade;
- `ENROLLMENT_*` shadow and dual-write (test-site experiments);
- `MAINTENANCE_ENDPOINTS_ENABLED`.

**Turn on:**
- LTI launch;
- deep linking;
- roster sync;
- no-grade activities;
- the grade ledger (internal only);
- parents P1–P3 and all-subjects (no emails);
- the tutor-engine list proven on lms-test (`ENARA_ENGINE_V2` without `mishkatSplit`, kids and research items);
- the DeepSeek tutor provider.

**Each school:** stays off until its own go.

## 5. Risks
- **Real users and real data:** the 19 migrations run on live data. The PDPL retention migration may delete old logs. Hence the backup, the dry run on a copy, and the counts before and after.
- **Data that must not be overwritten:** nothing is copied from lms-test. Seed records and the mock LMS exist only in lms-test's database, and the staging guard pins the database name.
- **Moodle:** lms-test's registrations are not valid for test.enara.app. A wrong `LMS_KEK` would make stored school secrets unreadable; test.enara.app keeps its own key, so there is no copying.
- **Cost on Hobby:** the new team is Hobby. Adding test.enara.app's real traffic to lms-test's raises the chance of another fair-use block, which would take both sites down. **Vercel Pro before cutover.** Model costs: Modal DeepSeek per use; Anam per minute (cap); Mishkat off.
- **Model keys:** the lms-test Anthropic key is rejected (left as is); test.enara.app's own Anthropic key is untested (frozen). With the DeepSeek tutor provider and the fallback off, Anthropic is not needed. If wanted, a key check runs at step 4.
- **Email:** the free Resend tier and a test-only sender. Every email switch stays off until checklist #2 and #5.

## 6. What you must do before the move
1. **Teachers:** send the 50+50 marking sheet (`docs/tutor/teacher-marking/ENARA_teacher_marking_sheet_50.xlsx`) and return the marks. This is the accuracy bar for any grading claim.
2. **Moodle:** one real launch on lms-test by hand, and later on the shadow URL (step 6).
3. **Passwords:** change `SEED_USER_PASSWORD` and `API_DOCS_PASSWORD` on lms-test in Vercel (12+ characters).
4. **Anthropic:** decide on the key (left as is; not needed with DeepSeek and the fallback off).
5. **Vercel Pro** for the new team, before cutover.
6. **Backups:** the database backup (Atlas snapshot), or a read-only database user and a secret for the dry-run copy.
7. **Email:** the production sender and reply-to, and the Resend plan (checklist #2, #5).
8. **The first real school:** parent consent for children's speaking; a real-device session; a final read of the school guide (checklist #7, #8, #12).
9. **Your "go"** on each step: 1–2 → 3–6 → 7.
