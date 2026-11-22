# Plan: fixes found in the lms-test screenshots

lms-test only. test.enara.app stays frozen. Screenshots are in `docs/lms/screenshots/` (`ALL.png` shows them side by side).

## What the screenshots show
1. **"Sample data" badges on the parent pages.** The badge is honest: these cards show placeholder text, not real data.
   - Level, can-dos and strengths turn real once the learner has progress on the real English goals. The seed wrote progress on its own goals, so it doesn't count yet.
   - Skills, trend, "this week worked on", try at home, upcoming and session insight are placeholders in the product itself, whatever the data.
2. **Grading list dates.** Every waiting answer shows today, 12:16 (when the seed ran), not dates over the last 8 weeks.
3. **Academic manager page:** AI credits used and tutor questions show 0 for the last 30 days. The usage records the seed wrote don't reach this page.
4. **"Demo data" switch** on the teacher dashboard and class insights ("Showing: Live data | Demo data"). It's a product switch, not from the seed, but it puts the word "demo" on screen.
5. **The 2 admin accounts** (platform admin, Nile Valley school admin) now refuse the shared password. They worked an hour earlier.
6. Fine as they are:
   - the suspended school's teacher sees "access is suspended" (expected);
   - students, kids mode, the teacher's classes, the heatmap and the parent dashboards all show the data;
   - the product tour pops up on a student's first sign-in (expected).

## What I'll do
1. **Seed:** write progress against the real English goals, so a parent's level, can-dos and strengths are real (no badge).
2. **Seed:** give waiting answers their real submit dates, spread over 8 weeks.
3. **Seed:** write usage records the academic manager page reads.
4. **Product, your choice:**
   - **(a) My suggestion:** hide the placeholder parent cards (skills, trend, try at home, upcoming, session insight) on lms-test and for real schools until they're built from real data. No placeholder is shown to anyone.
   - **(b)** Keep them, with the badge (honest, but "sample" stays visible).
5. **Product, your choice:** hide the "Demo data" switch everywhere except the demo school. My suggestion: yes.
6. **Admins:** if you changed those 2 passwords, nothing to do. If not, the seed re-run (remove, then run) puts the shared password back.
7. Small PR, E2E must pass, reload the data on lms-test, new screenshots, 3-line report.

Waiting for your "go", and for your answer to 4, 5 and 6.
