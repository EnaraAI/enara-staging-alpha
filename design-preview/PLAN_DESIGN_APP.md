# Plan: the approved screens as a working front end on design.enara.app

_Waiting for your "go". Nothing here is built or deployed yet. test.enara.app stays frozen and is never called._

## Shape
- **New app:** `design-app/` on branch `claude/design-app`, grown from the approved preview: same tokens, kit and screens, now with real data. It is never merged into the lms-test front end; the current lms-test UI keeps working as it is.
- **Hosting:** static files on Cloudflare, plus a few lines of edge code that add the password gate and security headers (strict CSP, `noindex`, no framing).
- **API:** the browser calls `https://lms-test.enara.app/api/...` directly with the same sign-in token as today. lms-test only needs `https://design.enara.app` on its CORS and relay allow lists.
- **Accounts:** the seed accounts. The password stays the shared `SEED_USER_PASSWORD`, never in chat.

## Steps only you can do (I'll give exact clicks when we get there)
1. **DNS: checked on 27 Nov.** enara.app is on Cloudflare (nameservers `cheryl.ns.cloudflare.com` and `clint.ns.cloudflare.com`). Today's records are DNS-only and point to Vercel: lms-test, test, www and the apex. `design.enara.app` does not exist yet.
   - **So:** a Workers static-assets app with a **custom domain** `design.enara.app`. Cloudflare creates that DNS record when the domain is attached; no other record changes.
   - **Password gate:** **Cloudflare Access** (Zero Trust → Access → Applications → add `design.enara.app`). You choose who gets in (for example, your email with a one-time code) and set it yourself; there's no password in code. Basic auth stays the fallback if you'd rather not use Access.
2. **Give CI deploy access to Cloudflare:** an API token limited to Workers/Pages edit on one account. Save it as GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in a GitHub **Environment** "design" that needs your approval to run. This follows the security audit's C1 lesson: no deploy key reachable from a plain branch push.
3. **Relay Worker:** tell me who deploys it today. Its allow list is in code (`relay/worker.js`); I'll prepare the one-line change, and it deploys like the relay does now, or through the same Environment.
4. **The Playwright checks need to pass the password gate:**
   - with **Access:** a service token, saved as secrets `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`;
   - with **basic auth:** a check password, saved as secret `DESIGN_BASIC_AUTH`.

## Changes on lms-test (only these; each a small PR through the normal E2E and deploy path)
| PR | What | Switch |
|---|---|---|
| L1 | Add `https://design.enara.app` to `CORS_ALLOWED_ORIGINS`: a narrow, exact-value exception in the deploy guard (like `TUTOR_LLM_ENDPOINT`), so the pipeline sets it and records it. Or you set it in Vercel yourself, if you prefer. | the origin list itself |
| L2 | Relay allow list adds `https://design.enara.app` (`relay/worker.js`) | — |
| L3 | A read-only platform status endpoint for ENARA admins: model, Mishkat, avatar and email status in one call, from what `/ready` and the health checks already know | `DESIGN_PLATFORM_STATUS_ENABLED` |
| L4+ | Any other API that a screen truly lacks, found while wiring. Listed in the report first, one PR each. | one switch each |

From the API inventory, most screens already have their endpoints:
- **Parents:** home, progress, fees, bus, attendance, chat.
- **School admin:** imports, announcements, requests, switches.
- **Student:** tutor chat (streaming), avatar, assignments, results.
- **Teacher:** classes, grading, assessments, item bank, attendance.

**Gaps known now:**
- **Kids:** lessons and rewards live in the browser today (`frontend/kids/kidsData.ts`, no backend). Phase 1 keeps that as is; kids chat uses the existing tutor API. Saving kids' progress on the server would be a new feature, so it goes in the report, not the build.
- **Platform model status:** needs L3.
- **Teacher "errors to work on":** class-wide grouping may need a small endpoint; this gets checked first.

## Build order (one small PR per step on `claude/design-app`; one line per deploy)
| # | Step | Deploys to design.enara.app |
|---|---|---|
| 0 | App shell, API client (token, errors, Arabic/English), login, parent code entry, password gate, deploy workflow; L1 and L2 on lms-test | Deploy 1 |
| 1 | Parent: home, progress, fees, bus, attendance, chat | Deploy 2 |
| 2 | School admin: dashboard, imports with preview and column matching, announcements, requests, switches | Deploy 3 |
| 3 | Student: home, tutor chat with streaming, assignment, results, avatar (relay) | Deploy 4 |
| 4 | Teacher: class overview, grading queue with scorer badges and override, assessment builder, errors to work on | Deploy 5 |
| 5 | Kids: home, picture lesson, chat, reward (browser data, as today) | Deploy 6 |
| 6 | Platform admin: schools, usage and budgets, model status (after L3) | Deploy 7 |
| 7 | Playwright against design.enara.app, every role, the happy path of every screen, Arabic and English, phone and desktop; then the report | — |

**Effort:** about 4-6 weeks of steady work. Parents and school admin are fastest (their APIs are newest); tutor chat, avatar and grading take longest.

## Things to know
- **It's the same lms-test database.** What you do on design.enara.app (send a request, override a grade) is real on lms-test, and lms-test sends real emails. The checks will use only seed accounts and will avoid bulk-email actions: no announcements to the whole school, no import confirmations with notices.
- **The checks cost a little money:** one tutor chat, one avatar session and one chatbot question per run. That's cents per run, on DeepSeek and Anam.
- **Security:** the sign-in token is stored in the browser, as today. The new origin gets a strict CSP (possible now that there's no CDN script), the password gate, and `noindex`. The audit's critical items (C1, C2) are independent of this work and are still waiting for your go.
- **Afterwards:** when you approve the result, we plan the switch of lms-test to the new front end as its own plan.

## Your decisions
1. "go" on this plan.
2. ~~Where enara.app's DNS is hosted~~: Cloudflare (checked). Access or basic auth? (I recommend Access.)
3. L1: should the pipeline set CORS, or will you set it in Vercel?
4. Who deploys the relay Worker today?
