# Go-live checklist: before the first real school

Status as of 19 Nov 2026. Owner: Mohamed unless noted.

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Reopen test.enara.app (production). Then the rollout plan (backup, dry runs, flags) comes for OK | Mohamed | Frozen |
| 2 | Production email sender and support reply-to address (D11) | Mohamed | Open |
| 3 | Grader accuracy bar (ESL6 / D15): grades to real schools stay off until it passes | Tutor track | Open |
| 4 | **Per-school grade switch.** Grades are one site-wide switch today (`LMS_GRADE_PASSBACK_ENABLED`); D15 needs one per school | LMS track | Waiting for "go" |
| 5 | Resend plan upgrade (free tier: 100 emails a day, 3,000 a month) | Mohamed | Open |
| 6 | Daily job: add the `LMSTEST_CRON_SECRET` GitHub secret (same value as Vercel `CRON_SECRET`), and put `lms-test-daily.yml` on `main` | Mohamed | Open |
| 7 | One real-device session: an iPhone (Safari) and the Moodle mobile app (Android and iOS) | Mohamed | Open |
| 8 | Final read of `docs/lms/SCHOOL_GUIDE.md` (EN + AR) | Mohamed | Open |
| 9 | Build the styling into the app instead of loading the Tailwind CDN at runtime | LMS track | Open |
| 10 | Revoke the Vercel "Protection Bypass for Automation" secret on `enara-lms-test` | Mohamed | Open |
| 11 | Tutor and avatar on lms-test: `ANAM_API_KEY`, then "turn on AI on lms-test" ($25 cap already set) | Mohamed | Open |
| 12 | Children's speaking and voice processing need parent consent and the legal review before the first real school. (On for lms-test only: internal switch `kidsSpeaking`; audio is never stored.) | Mohamed + legal review | Open |
