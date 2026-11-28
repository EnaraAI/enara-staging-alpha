# ENARA sales agent

An AI prospecting agent for ENARA. Every hour from 8:14 to 16:14 (Africa/Cairo) it:

1. sends the emails the owner approved (through Resend, from the owner's enara.app address, BCC to the team),
2. drafts follow-ups that are due (after 5 days, then after 7 more),
3. works through lists uploaded on the website, then researches new schools on the web (Egypt, Saudi Arabia, Iraq, UAE, Kuwait, Qatar, Bahrain, Oman),
4. finds the person in charge (work contacts only) and drafts a personal first email for the owner to approve.

Nothing is emailed until the owner approves it on https://sales.enara.app.

## Parts

| Part | Where | Notes |
|---|---|---|
| The agent | Claude scheduled task "ENARA sales agent" | Prompt template: [agent/PROMPT.md](agent/PROMPT.md). The live copy is in the scheduled task. |
| Website | Cloudflare Worker `enara-sales` on `sales.enara.app` | Source: [site/src](site/src). One Worker serves the pages and the JSON API. |
| Data | Cloudflare D1 database `enara-sales` | One table, `docs` (see below). The agent reads and writes it with SQL through the Cloudflare API. |
| Email | Resend, domain `enara.app` | Free plan: 100 a day, 3,000 a month, shared with ENARA's own app emails. Each sales email uses 3 (to + 2 BCC). |

## Data model

Table `docs (coll, id, data JSON text, version, updated_at)`. `version` goes up by 1 on every change, and every write
checks the version it read (optimistic concurrency), so the website and the agent never overwrite each other.

| coll | id | What |
|---|---|---|
| `config` | `settings` | newPerDay, sendCapPerDay, paused, countries, segments, sender details, focus note, demoFormUrl |
| `config` | `control` | last manual run (Run now / Send approved now) |
| `leads` | domain with dots as dashes, e.g. `bisc-edu-eg` | one school: org, country, city, segment, website, contactName, contactRole, email, emailKind, contactPhone, sources, whyFit, score, lang, status, step, draft, sentLog, nextFollowUp, notes, error, foundBy, importId, createdAt, updatedAt |
| `dnc` | `e-<email>` | do-not-contact entries |
| `runs` | `YYYY-MM-DD-HHMM` (Cairo) | one record per run that did something |
| `imports` | `imp-...` | uploaded lists: spreadsheet rows or PDF text, with progress |
| `activity` | `<leadId>-<ms timestamp>` | the lead's log: `{leadId, at, kind, text}`; kinds note, call, meeting, email_in (by the owner) and status, stage (written by the site on every change) |
| `tasks` | `tsk-...` | `{leadId, title, due (YYYY-MM-DD), done, doneAt}`; overdue and due-today tasks show at the top of Review |

CRM fields on a lead (added by the website; the agent leaves them alone): `stage` (none, replied, meeting_booked, demo_done,
proposal_sent, won, lost), `stageAt`, `stageBest` (furthest stage reached, for the funnel), `dealValue`, `currency`
(EGP, SAR, AED, KWD, QAR, BHD, OMR, IQD, USD), `nextStep`, `nextStepDue`, `repliedStep` (the email a school replied to).

Lead `status`: `drafted` → `approved` → `sent` → (`replied` / `not_interested`), plus `do_not_contact`, `skipped` and
`manual` (a school the owner added by hand: never emailed, drafted or followed up, but counted in duplicate checks).
The agent only acts on `approved` (send) and `sent` with a due `nextFollowUp` (draft a follow-up).

## Website

Five tabs (bottom bar on phones, top bar on wide screens): **Review** (drafts and lead lists, tasks due, CSV export,
search), **Pipeline** (stages after a reply, deal values per currency, "Add a school"), **Insights** (`GET /api/insights`,
SQL aggregates over Cairo days, charts drawn as inline SVG), **Ask** (`POST /api/chat`: the owner's AI assistant, see
below) and **Settings** (run controls, uploads, agent settings, do-not-contact list, recent runs). Lead segments include
English teaching centres (`language_center`) and training centres (`training_center`).

Ask: the Worker calls the Anthropic Messages API with the secret `ANTHROPIC_API_KEY` (model from the optional var
`CHAT_MODEL`, default `claude-sonnet-5-5`). The model gets read-only tools (search_leads, get_lead, get_insights,
list_runs, list_imports, get_settings; every query is SELECT-only) and `propose_action`, which only shows the owner a card
with a Confirm button. Confirm calls the normal endpoints with the lead's version. The draft rules in the chat's system
prompt are copied from agent/PROMPT.md at build time. 30 messages per 10 minutes per session (`chat_hits` table).
Without the key the tab says "Chat isn't connected yet".

## Website security

- One shared password (Worker secret `SITE_PASSWORD`). Sessions are an HMAC-signed cookie (`SESSION_KEY`), HttpOnly,
  Secure, SameSite=Strict, 30 days. Changing the password signs everyone out.
- 10 failed sign-ins per IP lock sign-in for 15 minutes (`login_fail` table).
- Strict CSP (scripts only from the Worker and cdnjs for SheetJS / pdf.js), `noindex`, API calls need the `X-Req: 1` header.
- Every write is validated against a whitelist of fields and sizes.
- Run now buttons call the scheduled task's API trigger with secrets `ROUTINE_FIRE_URL` and `ROUTINE_TOKEN`
  (not set until the owner creates the API trigger). 10-minute cooldown.

## Build, test, deploy

```
cd sales-agent/site
python3 build.py                                  # inlines src/ into out/site.mjs
node test_all.mjs schema.sql "$PWD/out/site.mjs"  # Node 22+ (node:sqlite stands in for D1); runs every test file
node dev_server.mjs                               # local preview with made-up data, password preview-only
npx wrangler deploy                               # needs CLOUDFLARE_API_TOKEN; keeps existing secrets
```

Never print, log or commit secrets or tokens.

## Rules the agent always follows

Only sends approved emails, exactly as approved. Work contacts only, nothing personal. Honest claims only (learning
gains come from simulated learners; no prices, no features schools can't use yet). At most 50 emails a day and never
past the Resend quota guard. Full rules: [agent/PROMPT.md](agent/PROMPT.md).
