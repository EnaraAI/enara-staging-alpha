# ENARA design system preview: one-page note

_Branch `claude/design-preview`, folder `design-preview/`. Static screens with sample data only. Not merged, not deployed, no live site touched. Vercel deploys are switched off for this branch in `vercel.json`._

## What changes compared with today's UI

| | Today | Preview |
|---|---|---|
| CSS | Tailwind loaded at runtime from `cdn.tailwindcss.com`, with a config script in `index.html`; parents and kids apps use their own CSS files (`parents.css` 788 lines, `enaraKids.css` 822 lines) | Tailwind 4 built locally by Vite. No CDN, which also allows a strict CSP (security audit M5). |
| Components | Hand-written per page (about 7,200 `className` uses in the main app) | One kit: shadcn/ui-style components on **React Aria** primitives, which handle keyboard, focus, screen readers and RTL. |
| Colours | `--primary #0056D2` blue; teal, indigo and cyan remapped to blue; parents app navy and amber | **One set of semantic tokens** (background, card, primary, accent, success, warning, destructive, info, muted, border, ring, chart 1-5). Brand: ENARA navy and amber. |
| Themes | One look, plus separate kids and parents styles | **Three themes on the same tokens:** Kids, Learners & Parents, School admin. Each has **dark mode**. |
| Fonts | Google Fonts at runtime (Source Sans 3, Bricolage, IBM Plex Arabic, Poppins…) | Self-hosted. Kids: Baloo Bhaijaan 2 (both scripts). Learners: Nunito with IBM Plex Sans Arabic. Admin: Inter with Noto Sans Arabic. |
| RTL | Parents app RTL; main app mostly LTR (about 200 physical `ml/mr/pl/pr` classes) | Full RTL everywhere through logical properties (`ms/me/ps/pe/start/end`). Direction arrows flip automatically. |
| Kids | Custom CSS app | Enforced rules: tap targets ≥ 75×75 px, text 19 px, a "listen" button on every instruction, press feedback on every tap, nothing at the bottom edge, one action per screen. |

## The tokens

| Token group | Kids | Learners & Parents | School admin |
|---|---|---|---|
| Base text size | 19 px | 16 px | 15 px |
| Corner radius | 24 px | 14 px | 8 px |
| Minimum tap target | 75 px | 44 px | 36 px |
| Primary / accent | grape / sunshine (secondary: mint) | ENARA navy / amber | navy / amber, neutral slate surfaces |
| Fonts (Latin / Arabic) | Baloo Bhaijaan 2 / Baloo Bhaijaan 2 | Nunito / IBM Plex Sans Arabic | Inter / Noto Sans Arabic |

All three share the semantic colours for status: success, warning, danger and info, each with a "soft" background. They also share a spacing scale (Tailwind 4 px steps), a type scale (Tailwind `text-xs` to `text-3xl`, relative to the base size), chart colours 1-5 and a dark set per theme. Colours are OKLCH, so contrast stays even across hues. Components never use raw colours, so a theme is only a different set of values.

## What migrating the real app would take (one developer; days of work)

| App | Size today | Work | Estimate |
|---|---|---|---|
| Foundation in `frontend/` | `index.html` CDN plus config | Local Tailwind 4 build, tokens, fonts, the kit, remove the CDN and Google Fonts, then add a CSP | 2-3 days |
| Parents app | 27 files, 3.8k lines, its own CSS, already RTL | Replace `pp-*` CSS with kit components, screen by screen | 4-6 days |
| Kids app | 4 files, 1.3k lines, its own CSS and JS | Rebuild screens on the kids theme. The interaction rules change, so test with a few children. | 3-5 days |
| Student and tutor (main app) | Part of 110 files, 35k lines | Chat, avatar, assignments, results | 6-8 days |
| Teacher | as above | Classes, grading, builder, errors | 6-8 days |
| School admin | as above | Dashboard, imports, announcements, requests, sections | 5-7 days |
| Platform admin | as above | Schools, usage, models | 3-4 days |
| E2E and screenshots | 41 scenarios | Keep `data-testid`s; update selectors that rely on text or styles; new reference screenshots | 3-5 days |
| **Total** | | One app per PR, each behind a switch, E2E on every PR | **about 32-46 days (7-9 weeks)** |

**Suggested order:**
1. Foundation, which also closes the CDN script finding from the security audit.
2. The parents app (smallest; already RTL).
3. The kids app.
4. The student app.
5. Teacher, school admin and platform admin.

Each step ships on its own, and the old UI stays until its replacement passes E2E.

## Risks
- **Class differences between Tailwind 3 and 4.** Moving from the CDN (v3) to v4 changes some defaults (border colour, ring width, shadow names), and today's colour remapping of teal/indigo/cyan to blue goes away. Every page needs a visual check; screenshot diffs in CI catch most of it.
- **RTL in the main app.** About 200 physical spacing classes and some icons need flipping. Pages that were never shown in Arabic may surface layout bugs.
- **E2E selectors** that use visible text or CSS classes will break. Most use `data-testid`, which stays.
- **Kids rules change the interaction.** Larger targets and one action per screen mean fewer things per screen and more screens. Try it with a few children before rollout.
- **Bundle and fonts.** The kit adds about 90 KB gzipped JS. Fonts are self-hosted (about 100-170 KB per family). Load only the active theme's fonts.
- **Dark mode doubles visual QA.** It could ship later, behind a switch.
- **LMS iframe:** inside Moodle the app runs in an iframe with its own CSP. The local build makes that CSP simpler, but heights and scrolling must be rechecked in Moodle.
- **Two looks during migration:** while apps move one by one, a user may see old and new screens side by side for a few weeks.

## How to view
- **Gallery:** `design-preview/GALLERY.md`. Every screen in English and Arabic, on phone (390 px) and desktop (1280 px).
- **Locally:**

  ```bash
  cd design-preview && npm ci && npm run dev
  ```

  Then open the URL Vite prints: `#/` lists every screen; add `?lang=ar` or `&dark=1`.

## What building the preview taught us (kit gaps to add before migrating)

Building 31 screens showed what the kit still needs. These are worth adding before any real migration, so every app uses the same pieces:
- **Chat:** chat set (message bubbles, streaming caret with Stop, hint and source chips, an input bar pinned above the tabs).
- **Badges and status:** a "scored by" badge (rules, Mishkat, AI model, teacher), a status dot, and filter chips with counts.
- **Forms:** an OTP/code input, menu/dropdown, segmented control, date picker and number field.
- **Data display:** a timeline/steps component, a month calendar with status days, a progress bar with threshold markers, and a simple bar chart.
- **Feedback:** empty-state, drop-zone, banner and toast components.
- **Kids:** choice-tile states (selected, correct, wrong) and a shared picture library (the preview has one in `screens/kids/art.tsx`).
- **Small fixes:** text fields need `dir`/`rows` pass-through, Badge needs a size and wrapping, and there should be a `<bdi>` helper for English inside Arabic.
