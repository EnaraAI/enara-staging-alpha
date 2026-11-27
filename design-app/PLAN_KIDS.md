# Plan: the lms-test kids app, as it is, on design.enara.app

Owner ask (27 Nov 2026): bring the entire kids UI from lms-test as it is, with the word pictures and the kids avatar.

1. **Same code, not a redesign.** Copy the lms front end's kids app (`frontend/kids/*`) and every file it imports
   (API service, live avatar, speaking exam, mic check, tutor text, speech text, toast, role routing) into
   `design-app/src/lms/` with a sync script, so the files stay identical to `lms-test-live`. A check fails if they drift.
2. **Pictures.** Copy `frontend/public/kids` (the 495 word pictures, 1.2 MB) into the design app's public files.
3. **Kids avatar.** Comes with the copied live avatar (Anam SDK 4.29.1, already in the design app), through rt.enara.app.
4. **Sign-in bridge.** A kids learner signs in on the design app's login page; the token is handed to the copied API service
   (calls lms-test only, never test.enara.app). Sign out returns to the design app's login.
5. **Styles.** The old app loads Tailwind from a CDN at run time; the design app builds Tailwind locally. The copied files
   are added to the local build with the old colours, scoped to the kids app, so the other areas are not affected.
6. **Routes.** `#/kids` and below show the copied kids app; the new-design kids screens are removed from the routes (kept in git).
7. **Checks.** Design checks sign in as the kids seed learner (khaled.nasser) and screenshot the kids app on design.enara.app
   **and** on lms-test, side by side, phone and desktop, Arabic and English. No paid avatar call is started.
8. **Deploy** design.enara.app after the checks pass. No change to lms-test.
