# Plan: full seed data for every role and state (lms-test only)

test.enara.app and its database stay frozen. The seed password is read on the server from `SEED_USER_PASSWORD` (Vercel, Sensitive, set by you). It is never printed, stored in the repo or sent anywhere.

## What exists today (from the code)
- **Roles** (`auth/roles.ts`):
  - platform admin (`enara-admin`)
  - school admin (`admin`)
  - academic manager (`academic_manager`)
  - teacher
  - student (adult, teen or kid: kids are students with `uiMode: kids`)
  - parent / guardian
- **States the seed will cover:**

| Who | States |
|---|---|
| **User** | active, disabled |
| **School** | active, suspended; parent portal off/free; results shown immediately/after release; LMS onboarding step (invite sent → link opened → registered → activated → first teacher launch → first student launch → roster OK → first grade sent) |
| **Teacher** | one class; several classes; no class yet |
| **Student** | child / teen / adult; on track / excelling / at risk; one class or several; enrollment active / inactive / removed; archived; kids mode |
| **Parent** | one child or several; email verified or not; signs in by password or by code; two guardians on one child; link pending / active / ended; consent pending / captured |
| **Invitations** | pending, accepted, revoked, expired; parent codes active / redeemed / revoked / expired |

## What I will build
1. **One script for all of it**, run on lms-test by a GitHub job through the existing maintenance guards (test database + maintenance token). Re-runnable: fixed IDs; a second run updates instead of duplicating.
2. **The data:** 4 schools at different stages, including 1 suspended. All dates are spread over the last 8 weeks (written so dashboards read the real dates):
   - about 15 staff, 120 students and 70 parents;
   - classes in English, Maths, Science and Arabic;
   - lessons done;
   - assignments and attempts, with grades released or waiting for review;
   - errors to work on, learner memory and session summaries;
   - reviews due, mastery, study habits;
   - tutor chats and avatar sessions;
   - parent weekly summaries (send log);
   - usage.
3. **Names:** realistic Egyptian and international names (no public figures), and natural school and class names. No "seed / demo / test / sample / fake" anywhere visible.
4. **Hidden marker:** a separate internal list (`seed_registry`, never shown in any screen) records every record the seed creates.
   - **Remove:** one-step remove deletes exactly those.
   - **Go-live:** I'll add a line to `GO_LIVE_CHECKLIST.md`: never copy registry-listed records; run remove before go-live.
   - **Why not the existing `origin: demo_seed` flag:** dashboards hide those records, so the data would not look real.
5. **Untouched:**
   - the current test data (LT-SCHOOL-A/B, `@lms-test.example`) that E2E and the health check use;
   - the demo sandbox;
   - every other school.
6. **Delivery:**
   - the seed and remove scripts with unit tests, in one PR;
   - E2E must pass;
   - then run on lms-test;
   - `docs/lms/SEED_USERS.md` lists each user's role, state, school and email (no password), grouped by role;
   - a 3-line report.

## Please decide
1. **Email domain.** Options:
   - `firstname.lastname@enara.app` would look real, but could match a real colleague's mailbox if the lms-test email redirect were ever off.
   - **My suggestion:** a sub-domain with no mailboxes, like `@school.enara.app`. It still looks like ours and can never deliver to a person.
   - Or tell me the domain you want.
2. **Grade ledger.** Grade records are append-only by design. For the one-step remove, may the remove script delete the seed's ledger rows directly (lms-test only)? Otherwise those rows stay after remove.
3. **Size.** About 120 students and 70 parents across 4 schools. Bigger or smaller?
4. **Password.** Please set `SEED_USER_PASSWORD` in Vercel (enara-lms-test, Production, Sensitive) and tell me when it's done. Don't paste it here.

Waiting for your "go".
