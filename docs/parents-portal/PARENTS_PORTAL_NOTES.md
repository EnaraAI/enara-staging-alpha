# Parents Portal MVP: implementation notes

Built on branch `claude/email-templates` (16 Nov 2026). The portal is a **parent mode inside the ENARA app** at `/parents`. It is not a separate app, and it can be installed as a PWA.

## User decisions (these override the brief and SPEC)

1. **Visibility.** "Parents get access to all ages when students have parents signed." Once a parent and learner link is **active**, the parent sees **everything for every age**: progress, session summaries, full transcripts, audio (none is recorded yet), and safety-alert excerpts. This applies to kids, teens and adults alike, and replaces brief rule 1 and SPEC §2/§10 "13+ never".
   - The server enforces it in one module, `backend/src/parents/policy.ts`. Without a link there is no access (403). A pending link sees nothing beyond its own invite. Roles: `view` can only read. `full` can also change controls and share the summary. `owner` can also manage guardians and billing.
   - Transparency: the learner has `GET /api/parents/learner/visibility`, the "What your parent can see" notice. It says the parent can see everything, conversations included. 13+ learners also get an in-app notice when a parent links (`notices`, marked read with `POST …/read`) and an email stub.
   - Tiers now affect only **wording and controls**. Kids: the parent sets controls. 13+: the parent suggests or co-sets, and the learner accepts. The tier comes from `Student.birthDate` when set (age < 13 means kid). Otherwise it comes from `Student.learnerAgeBand` (child means kid; teen and adult mean 13+). With neither, the learner is treated as 13+, which affects wording only.
   - **Legal note:** this needs legal review before launch. It is processing of children's and adults' personal data, including the content of private conversations. The relevant laws are Egypt's Personal Data Protection Law (No. 151 of 2020) and, if sold abroad, GDPR (Art. 8 child consent, transparency, and data minimisation for adults) and COPPA. **Adults' conversations being visible to a paying parent is the riskiest part.** It probably needs the adult's explicit, informed consent, not just a notice.
2. **Real-time progress, no report day.** Every parent endpoint computes from live data on each request, with no snapshot or cache. Screens show "Updated just now · 3:40 pm Cairo time". They refresh on window focus or visibility change, on a Refresh button, and on pull-to-refresh. There is no Thursday schedule. The weekly card is an on-demand **"Share this week"** action. Senders sit behind one interface (`backend/src/parents/reportSender.ts`): email via `sendTemplate('enara-weekly-progress')`, and a WhatsApp stub that only builds the text.
3. **Linking uses invite codes issued by the school admin**, for every learner (kids, teens and adults).
   - **Create:** `POST /api/students/:id/parent-codes`, available to an admin of the learner's own school or any `enara-admin`. Another school's admin gets 403; students, teachers and parents also get 403. The code looks like `ENR-XXXX-XXXX` (8 random characters, 31^8 ≈ 8.5e11 combinations) and uses an alphabet without 0/O/1/I/L. Input is accepted in any case, with or without the `ENR` prefix, dashes or spaces; the code screen masks what is typed to `ENR-XXXX-XXXX`. It is single-use, expires after 7 days, and is bound to one learner and school. Only its SHA-256 hash is stored, and it is shown once with a Copy button. An optional email reuses `enara-parent-consent`: the code is in the email body only (`LINK_CODE`), and the button opens `/parents/link` with no code in the URL, where the parent types it (P0 item 4, D15). The portal never reads a code from the URL. Codes cannot be issued for an archived student. Admins can list active codes (only the last 2 characters are shown) and revoke them, and can see linked parents and unlink them. This is the "Parent access" section on the student profile.
     - Format change (16 Nov 2026): codes moved from `ENR-XXXX-XX` (6 characters) to `ENR-XXXX-XXXX` (8 characters). Any unused code in the old format is now **invalid** (it fails with "Code not valid or expired"); no production codes existed yet, so nothing was migrated. Admins re-issue a code if needed.
   - **Redeem:** the Login screen has a Parents tab. From there the parent chooses "Have an invite code? Link your child", signs in or creates a parent account, and enters the code. `POST /api/parents/link/preview` returns only `{ learner: "Omar H.", school }`. The parent then confirms with `POST /api/parents/link/confirm`.
   - **Activation:** the link is **active on confirm** for every age, with no learner-accept step for now. The first parent on a learner becomes `owner`; later parents get `full`, and the owner can downgrade them to `view`. For kids, `consent: 'pending'` is recorded; the consent step (the `enara-parent-consent` email) is a **stub**. For 13+, the learner gets an in-app notice and an email stub (`learnerNoticeSender`, which only logs).
   - **Unlink:** the parent can unlink themself, or an admin of the learner's school can. The link is **ended, not deleted** (`status: 'ended'`, `endedAt`, `endReason` `unlinked_by_parent` / `unlinked_by_school`; owner decision D8). A new code reactivates the same row. Create, redeem, unlink, revoke and role changes are all written to the audit log (`parent_code_*`, `parent_link_*`).
   - **Access ends when the student goes** (P0 item 2, `src/parents/linkLifecycle.ts`): every parent read checks that the student exists, is not archived and is still in the link's school; otherwise the parent gets 403 `PARENT_LINK_ENDED` and the link is ended (`deleted` / `archived` / `left_school`). Hooks also end links (and revoke unused codes) on archive (`archived`), delete (`deleted`), and an LMS roster sync that leaves the student in no class at all (`lms_left_all_classes`). Restore does not relink (D9). PDPL permanent deletion ends the links (audited) and then deletes the rows, as before. `GET /api/parents/learners` lists ended links apart (`ended: [{ linkId, status, endedAt }]`), with nothing about the child. Every end is audited `parent_link_ended` (IDs only).
   - **Abuse protection:** 5 wrong codes lock the parent account for 15 minutes (429 `REDEEM_LOCKED`). There are also per-IP rate limits on `/api/parents/link` (30 per 15 min) and `/api/parents/register` (10 per hour). Errors always read "Code not valid or expired".
   - **Deferred:** learner-issued codes and a 13+ accept step. The school admin issues all codes for now.
4. **Parent sign-up.** Two ways: email + password, or **Continue with Google** (below). `POST /api/parents/register` always creates role `parent`. A body asking for any other role, a school, a student or permissions gets 403. It works even when staff registration is invite-only, because a parent account sees nothing until a school code links a learner. Sign-in uses the normal `/api/auth/login`. The login screen's Parents tab ("Parents" / "أولياء الأمور") accepts only parent accounts and opens `/parents`; the other tabs are unchanged. Forgot password uses the existing reset flow.

## Continue with Google (parents)

- **Frontend:** the Login screen's Parents tab, in both sign-in and "Create a parent account" mode, shows the official Google button (Google Identity Services, `https://accounts.google.com/gsi/client`, `renderButton` with `standard / outline / large / continue_with`, `locale` en or ar) above the email and password form, with an "or" divider. The component is `frontend/components/GoogleSignInButton.tsx`. It is shown only when `GET /api/parents/auth-config` says `google: true`, and it hides itself if the script cannot load. The container is 44 px tall; Google's own button inside it is 40 px (Google renders it, and its height cannot be changed).
- **Backend** (`backend/src/parents/google.ts`): the ID token is verified with `google-auth-library` `OAuth2Client.verifyIdToken` against `GOOGLE_CLIENT_ID` (also checked: `aud`, issuer `accounts.google.com`, `email_verified === true`). Matching is on `googleSub` first, then on email:
  - no account → a new **parent** account (random unusable password; the parent can set one with Forgot password), `ParentProfile`, audit `parent_registered` with `{ method: 'google' }`;
  - an existing **parent** → signed in; `googleSub` is stored the first time; audit `parent_google_signin`;
  - an email that belongs to a **student, teacher, academic manager, admin or ENARA admin** → **403 `GOOGLE_ACCOUNT_NOT_PARENT`** with a clear message. Nothing is changed, merged or escalated;
  - a parent already linked to a different Google account → 403 `GOOGLE_ACCOUNT_MISMATCH`;
  - unverified Google email → 401 `GOOGLE_EMAIL_UNVERIFIED`; invalid token, wrong audience or wrong issuer → 401 `GOOGLE_TOKEN_INVALID`;
  - `GOOGLE_CLIENT_ID` not set → **503 `google_not_configured`**, and the button is hidden.
  - The session is the same JWT as `/api/auth/login` (`signToken` + `sessionUser`), and the sign-in history records a success.

### Google sign-in setup

1. In **Google Cloud Console** pick (or create) the ENARA project.
2. **APIs & Services → OAuth consent screen:** user type *External*; app name "ENARA", support email, the ENARA logo, the app domain `test.enara.app`, privacy policy and terms links, and a developer contact. Scopes: only `openid`, `email` and `profile` (no sensitive scopes, so no Google verification review is needed for these). Publish the app (out of *Testing*) before real parents use it; while in Testing only listed test users can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, application type **Web application**, name e.g. "ENARA Parents (web)".
   - **Authorised JavaScript origins:** `https://test.enara.app`, and for development `http://localhost:5173` and `http://localhost` (Google requires `http://localhost` with the exact port the dev server uses). Add any other front-end origin that serves the Login screen.
   - **Authorised redirect URIs:** none needed (the button uses the popup flow and returns an ID token, not a redirect).
4. Copy the **Client ID** (`…apps.googleusercontent.com`). No client secret is used.
5. On **Vercel** (project settings → Environment Variables) set `GOOGLE_CLIENT_ID` to that value for the environments that should offer Google (Preview / Production), then redeploy. It is listed empty in `backend/.env.example`. The value is public by design: it is returned by `GET /api/parents/auth-config`.
6. Check: `GET /api/parents/auth-config` returns `{ "google": true, "clientId": "…" }`, and the Parents tab shows "Continue with Google".

## SPEC §12: decisions (no longer open questions)

| Question | Decision | Implemented |
| --- | --- | --- |
| Grade bands to CEFR sub-levels | Sub-level % = share of the level's **form** outcomes (`data/outcomes/outcomes.json`) mastered (`StudentObjectiveMastery` status `mastered`, not `needsVerification`; the outcome rule is criterion met on the 7-day delayed check). The level is split in halves: X.1 = 0–49 %, X.2 = 50–100 %. Level-up needs ≥ 80 % plus a passed checkpoint. Pre-A1 has 3 sub-steps. Only A1–A2 have outcomes. | `backend/src/parents/levels.ts`. Mastery rows are matched to outcomes by `objectiveId` or by `LearningObjective.code`. A **passed checkpoint** is approximated as a submitted `AssessmentAttempt` scored ≥ 60 % whose title contains "checkpoint" and the level code, because attempts have no level field. This should become a real level tag. With no outcome evidence, the level is mock-flagged. B1+ shows the level without a sub-level. The outcomes file ships in the Vercel function (`vercel.json` includeFiles). In other deployments where it is missing, the level falls back to mock. |
| Audio recording | No recording by default. Where a speaking task records, audio is stored in R2 and deleted automatically after 90 days. | No recordings exist yet, so the portal shows transcripts and **no audio player**. "Hear the progress" is hidden (`audio.available: false`). The R2 lifecycle rule is not built. |
| Safety categories | Reliable now: `personal_details` (phone, email, address, school name; pattern-based) and `inappropriate_content` (model refusal or moderation flags). Beta, human review first: `distress` and `bullying` (classifier), never shown to parents unreviewed. | `SafetyAlert` model with `category`, `detector`, `beta` and `reviewRequired`. Beta and unreviewed alerts are filtered out on the server. **No detector writes alerts yet**, so the portal serves mock alerts until one exists; real rows take over automatically. |
| Separate app or mode | A parent mode inside the same app, installable as a PWA. | `/parents` with `public/parents.webmanifest` and an SVG icon; the manifest link is injected while the parent area is open. No service worker or offline support yet. |
| Report day | Replaced by real-time progress plus on-demand sharing (decision 2). | — |

## What is real and what is mock

All mock data lives in **`backend/src/parents/mock/index.ts`**. Every section built from it carries `mock: true`, and the UI shows a "Sample data" badge next to it. AI-written text also carries `aiWritten: true` and shows the violet "ENARA summary" badge.

**Real (live database):**
- Weekly status: minutes, day dots (Saturday to Friday, Cairo days), sessions, streak, last practised, and the status with its reason. Sources are `tutor_sessions` plus `tutor_messages` (session duration runs from the first to the last message, minimum 1 and maximum 120 minutes) and practice days from `LearningEvent`. "Check this" triggers on a visible safety alert in the last 7 days or a drop of 20 points or more between the last two results.
- Weekly goal and controls, stored on the link. They are saved but **not enforced**, and the screen says so.
- Level and sub-level when outcome-mastery evidence exists; can-dos (course outcomes for the level, with state taken from mastery) when the level is real.
- Strengths and focus areas, when `Student.adaptiveProfile` has them.
- Assessment results (`AssessmentAttempt`) and lessons completed (`LessonProgress`).
- The session log, 30 days long (title, Cairo start time, duration, chat or voice, voice minutes as speaking time). Teaching methods come from `meta.teaching.primary` and the legacy `teachingMethod`, in parent words.
- Transcripts (`tutor_messages` plus legacy embedded messages): only speaker, text and time, with no internal metadata. After 90 days from the session start the endpoint returns **410** with a summary only.
- Safety alerts, when rows exist (none do yet).
- Learners, guardians (from links), and preferences (`ParentProfile`).
- The weekly summary numbers (minutes, streak, lessons done this week, outcomes mastered) and sharing.

**Mock (every item):**
1. Level and sub-level when there is no outcome evidence (and always for B1+ learners without evidence).
2. Skill bars and 4-week trends (no per-skill score source).
3. The 8-week overall score trend.
4. Can-dos when the level is mock.
5. Strengths and focus areas when `adaptiveProfile` is empty.
6. "This week they learned" bullets (AI; there is no summariser yet).
7. "Try this at home" (AI).
8. Per-session "went well", "was hard", "words to practise" and focus level (AI).
9. "Latest can-do" on Home when the level is mock.
10. Safety alerts (until a detector writes `SafetyAlert` rows). The mock set includes one old `personal_details` alert with an excerpt and one beta `distress` alert that is held back.
11. Upcoming items (checkpoint quiz, plan renewal).
12. Plan, price (`[PRICE]`), renewal date and payment methods. There is no billing system.

**Stubs:** the WhatsApp sender (builds the text only), the 13+ learner email notice, the kids' parental-consent step, and the privacy actions (download, delete conversations, close account), which show "Coming soon".

## Endpoints

Parent role (`/api/parents`):
- `POST register` (public)
- `GET auth-config` (public): `{ google: boolean, clientId? }`. The client ID is public by design.
- `POST google` (public): `{ credential: <Google ID token>, language? }`. 201 for a new parent, 200 for a sign-in; `{ token, user, created }`. 30 per 15 min per IP.
- `POST link/preview`, `POST link/confirm`, `DELETE links/:linkId`
- `GET learners`
- `GET learners/:id/status|home|progress|activity|alerts|report|controls`
- `GET learners/:id/sessions/:sessionId/transcript`
- `POST learners/:id/report/share` with `{ channel: 'email' | 'whatsapp' }`
- `PUT learners/:id/controls`
- `PUT learners/:id/guardians/:linkId` with `{ role: 'full' | 'view' }` (owner only)
- `GET account`, `PUT account/preferences`

Learner (student role): `GET /api/parents/learner/visibility`, `POST /api/parents/learner/visibility/read`.

School admin: `POST|GET /api/students/:id/parent-codes`, `DELETE /api/students/:id/parent-codes/:codeId`, `DELETE /api/students/:id/parent-links/:linkId`.

## Frontend

The portal lives in `frontend/parents/`: the shell `ParentsApp.tsx`, the Home, Progress, Activity, Controls, Account, LinkChild and ShareSheet screens, i18n, API client and CSS.
- It is mobile-first with a 480 px max width. Every parent screen shows a learner switcher and the status line; bottom tabs appear once a learner is linked.
- English and Egyptian Arabic, with a full RTL switch (`dir` on the root and `<html>`). The parents CSS uses logical properties only. Digits are Arabic-Indic in Arabic.
- Weeks start on Saturday and the weekend is Friday and Saturday; times are shown in Africa/Cairo.
- Spark palette with Inter and Noto Sans Arabic. Status is never shown by colour alone (icon plus words). Targets are at least 44 px and the bottom sheets use dialog semantics.
- The Login Parents tab uses `role=tablist/tab` with arrow, Home and End keys.
- The admin panel is `frontend/components/ParentAccessPanel.tsx`, shown on the student profile.

## Known gaps and follow-ups

- Controls are stored but not enforced by the tutor. The 13+ "learner accepts" step has no learner-side UI yet (`learnerAccepted` stays false after a parent change).
- The learner-side "What your parent can see" card exists in the API only. The kids app (`frontend/kids/`) was not touched, and the standard student UI card was not added.
- The WhatsApp preview text from the server is English only.
- The checkpoint-pass rule is title-based (see the CEFR row above).
- There is no PNG icon or service worker for the PWA.
