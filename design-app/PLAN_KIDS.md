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

## Done / differences (27 Nov 2026)

Done as planned: `scripts/sync-lms-kids.mjs` copies `frontend/kids/*` plus the error boundary and toast host and every file they
import (35 files, 9,930 lines, same layout) into `src/lms/`, and `frontend/public/kids` (292 word pictures + index) into
`public/kids`. `--check` fails on any byte difference, and also when `frontend/` differs from `origin/lms-test-live` (when that
ref is fetched). Relay fix #148 is merged upstream, so there is no allowed difference. `#/kids` shows the copied KidsApp in its
own chunk, full screen; the new-design kids screens are no longer routed (files kept). The student Live tutor screen
(`#/student/avatar`) now opens the copied LiveAvatarModal with CoursePage's props (the hand-written call, `lib/relay.ts` and
`lib/speechText.ts` are gone). Sign-in bridge: `src/kids-lms/bridge.ts`; styles: `src/kids-lms/kids-lms.css`.

What cannot be identical, and why:
- **Tailwind.** lms-test runs Tailwind v3.4.17 from the CDN at run time; the design app builds Tailwind 4 locally (CSP: no CDN
  scripts). The copied files' classes are built from `src/lms` with the old config (Campus blue for teal/indigo/cyan, Source
  Sans 3), the v3 palette in hex, v3 values for names v4 changed (shadow-sm, rounded-sm, blur-sm), v3 preflight differences
  (border colour, placeholder, button cursor) and the old inline `<style>`, all inside `.lms-scope` (`:where()` prefix, no added
  specificity). Left as v4: `space-x/y` margin side, `ring` defaults (not used), and the CDN's exact rule order against
  enaraKids.css (here enaraKids.css always wins ties against utilities; on lms-test it wins because it loads later).
- **React** 19.2.4 (the design app's) instead of 19.2.8: one React per page. Other packages are at lms-test's exact versions;
  lucide-react 0.574.0 comes in as the alias `lucide-react-lms` for the copied files only (the design app keeps 1.x).
- **ffmpeg.wasm** (teacher chapter-video compression, never reached from these screens) is pointed at jsDelivr instead of being
  bundled: the 32 MB file is over the static host's 25 MB per-file limit. CSP does not allow jsDelivr, so it would fail there.
- **Wrapper.** lms-test's App also calls `/api/auth/session` refresh and the student assessment list around KidsApp; the design
  app does its own session read instead. Props are the same (no LMS launch or shared links on design.enara.app).
- **Relative server URLs** (`/api/tutor-faces/image/…`, lesson videos under `/uploads/…`) resolve to design.enara.app; the
  worker redirects those GETs to lms-test.
- **CSP** (lms-test sends none) is widened only for: blob: scripts (ElevenLabs speech-to-text worklet in the kids avatar call),
  Google Fonts, ElevenLabs direct (the copied relay fallback), YouTube/Vimeo lesson players.
- **Sign-out** reloads the page on `#/login`, so the kids styles never stay behind.
- **Checks** cannot run locally (no seed password); they run in CI and save `kidscompare--<screen>--<lang>--<device>--design.png`
  next to `--lmstest.png`.
