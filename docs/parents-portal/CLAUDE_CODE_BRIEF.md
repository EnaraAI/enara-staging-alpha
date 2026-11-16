# Brief for Claude Code: build the ENARA Parents Portal (MVP)

## Context

ENARA is an AI English tutor (CEFR Pre-A1 to C2, its own grading system, a library of teaching methods, a live avatar tutor). Parents pay for learners of any age. We need a **mobile-first parents portal** so parents can see whether their learner is practising, improving, and safe.

Files in this folder:

- `SPEC.md` — the product spec. Treat it as the source of truth.
- `mockup/*.dc.html` — reference screens from a design canvas. They need the canvas runtime, so **they won't run in a browser**. Read them for layout, copy, component order, states and sample data. Screens: `Main` (Home, kid), `Progress`, `Activity`, `Controls`, `Account`, `Teen` (Home, 13+), `Adult` (Home, adult = same as 13+), `Report` (weekly WhatsApp card).

## Step 1: explore before building

1. Explore this repo: framework, routing, auth/roles, data layer, i18n/RTL setup, design tokens and UI components.
2. Find what learner data already exists (sessions, scores, CEFR level, assessments, transcripts) and what is missing.
3. Reply with a short plan before writing code: where the portal lives, the data you'll read, the gaps, and which open questions in `SPEC.md` §12 block you. Do not invent answers to those questions; use clearly marked mock data where real data doesn't exist yet.

## Step 2: build the MVP (SPEC §11, "MVP" column only)

- Parent auth and a parent ↔ learner link (role: owner / full / view; status: pending / active).
- Learner switcher + status line on every tab.
- Tabs: Home, Progress, Activity, Account. Controls tab can be a stub (it's v2), but build the screen if it's cheap.
- Kids' transcript view (90-day retention), safety alerts, weekly report payload (render as a shareable card; sending via WhatsApp/email can be a stub behind an interface).

## Non-negotiable rules

1. **Visibility is enforced on the server, not just hidden in the UI.** One policy function decides access, e.g. `tierOf(learner) = age(birthDate) < 13 ? "kid" : "13plus"`. For `13plus`: transcript and audio endpoints return 403; safety alerts are returned without the excerpt field. Add tests for both tiers.
2. Adults (18+) use exactly the same rules as teens. There is no sponsor mode or opt-in sharing.
3. No comparisons between learners anywhere (no leaderboards, percentiles, "vs other kids").
4. Arabic and English, full RTL. Use logical CSS properties (start/end), never left/right. Week starts Saturday; weekend is Fri–Sat; times in Africa/Cairo.
5. AI-written text (session summaries, "this week they learned", try-this-at-home) is visually marked as written by ENARA.
6. Accessibility: WCAG 2.2 AA, touch targets ≥ 44 px, real buttons and links, status never by colour alone.

## Suggested data shapes (adapt to existing models)

- `ProgressSnapshot`: level (CEFR), subLevelPct, skills {listening, speaking, reading, writing, vocabulary, grammar: pct + trend}, canDos [{text, state: achieved | in_progress | not_started}], strengths[2], focusAreas[2]
- `SessionSummary`: startedAt, durationMin, course/unit, methods[], wentWell, wasHard, words[], speakingMin, focus (high | medium | low), result?
- `SafetyAlert`: category, actionTaken, createdAt, excerpt (kids only)
- `WeeklyStatus`: minutesDone, goalMinutes, daysPractised[7], streak, status (on_track | needs_nudge | check_this) + reason

## Look and feel

Use the repo's existing design tokens and components if present. If there are none, use the Enara Spark palette the mockups use: navy `#0b203c` (primary actions, text emphasis), amber `#f59f0a` (progress fills only, never text on white), electric blue `#2f6bff` (links, selection, focus ring), violet `#6d4aff` on `#f1edff` (AI-authored content), emerald `#047857` on `#ecfdf5` (verified results only), text `#111c2c`, muted text `#566376`, borders `#dce2ea`, page `#f6f7fa`, cards white with 10 px radius. Font: Inter, with Noto Sans Arabic as the fallback.

## Done when

- A parent with one kid and one 13+ learner can switch between them and see the correct data on each tab.
- Tier rules pass server-side tests (403 on 13+ transcripts, no excerpt on 13+ alerts).
- Screens work at 360–430 px wide in English and Arabic (RTL).
- Mock data is clearly separated and listed, with the open questions still open in a short `PARENTS_PORTAL_NOTES.md`.
