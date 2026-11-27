# Design front end (design.enara.app)

The approved new design (branch `claude/design-preview`, screens and tokens) built as a working front end on branch
`claude/design-app`, hosted on Cloudflare at design.enara.app behind Cloudflare Access, calling the lms-test API.
It is not merged into the lms-test front end; the current lms-test UI keeps working as it is. Plan:
`design-preview/PLAN_DESIGN_APP.md` on `claude/design-preview`.

## lms-test changes for it
| Switch | Effect |
|---|---|
| `LMS_DESIGN_APP_ORIGIN=true` | CORS adds exactly `https://design.enara.app` (backend/src/config/env.ts `withDesignAppOrigin`). Off: no change. Never set on test.enara.app. |
