# ENARA — Pilot Operations Runbook (draft for owner approval)

This is a set of templates and checklists. Every target value below is **PROPOSED** until the owner approves it. Nothing here has been executed. No pilot institution is confirmed. 4Level1 is not treated as pilot-ready: its classes and learners are absent or unknown per the audit.

## 1. Roles and ownership (OWNER DECISION: names needed)

| Role | Owner |
|---|---|
| Spend approver | — |
| Operator (deploys, environment, budgets) | — |
| Support lead | — |
| Privacy contact | — |
| On-call for alerts | — |

## 2. Pre-pilot environment checklist (operator)

1. **Commit and push the reviewed revision.** Record the commit SHA.
2. **Set or confirm staging environment variables** (names only):
   - `API_DOCS_PASSWORD`
   - `AI_TEST_SPEND_CAP_USD` (≤ 50) and `AI_TEST_SPEND_ID`
   - `AI_PAUSED`
   - `REMINDERS_ENABLED=false` (unless a single test inbox is configured)
   - `SPEAKING_EXAM_*` and `ANAM_*` ceilings only if OD-1 is approved; otherwise leave them unset (features stay off)
3. **Set a provider-side monthly spend limit** at or below the approved cap in the Anthropic and ElevenLabs consoles. Record a screenshot reference.
4. **Rotate keys** previously pasted in chat (OD-8): Anthropic, R2 token, Atlas user. Then update Vercel environment variables.
5. **Confirm the R2 token is scoped to the staging bucket only.**
6. **Decide the canonical domain** (OD-2) and verify DNS.

## 3. Deploy, smoke-check, promote, roll back

1. `git archive <sha> backend frontend api vercel.json package.json | tar -x -C <clean dir>`
2. `vercel deploy --prod --skip-domain` (this creates an unpromoted deployment). Record the deployment ID.
3. Smoke-check against the deployment URL (`vercel curl` for protected previews):
   - `/health` returns 200;
   - `/ready` returns 200 and lists the required checks;
   - `/api/docs/ui` returns 401 without the password;
   - log in as each synthetic role;
   - a cross-school read returns 404;
   - a link to an unscanned document returns 404 `FILE_NOT_AVAILABLE`;
   - the Academic Manager assistant returns 403;
   - the Arabic AI draft returns 400.
4. `vercel promote <deployment>` only after every check passes. Record the previous deployment ID as the rollback target.
5. Rollback: `vercel promote <previous deployment>`, then repeat the smoke checks.

## 4. Pilot school onboarding (synthetic first, then real)

1. **Create the school** (ENARA Admin) and set its features:
   - `teaching_workflow_enabled`, `ai_grading_enabled`
   - learning flags as agreed
   - `documents_workspace_enabled`
   - `educator_chat_enabled` and `educator_analytics_enabled`
   - keep `educator_analytics_ai_router_enabled` **off**
   - keep `speaking_exams_enabled` **off** unless OD-1 is approved
2. **Set document retention** (`pilotEndsAt`, `retentionDays`; OWNER DECISION).
3. **Create batches, classes and rosters.** Invite the Workspace Admin (ENARA only). The admin invites teachers and students from **People**. Copy the one-time links if email is not configured.
4. **Verify:** each teacher sees only their classes; students see their courses; disabled accounts are signed out.
5. **Train staff:**
   - originals of unscanned files are not downloadable (use **Sources**);
   - results release automatically unless the assignment is set to "Held until I release them";
   - Arabic AI drafting is off.

## 5. Budgets (operator, audited)

`PUT /api/ai-controls/budgets/:institutionId` with:

```json
{ "enforcementEnabled": true, "monthlyCapUsd": 15, "dailyCapUsd": 6, "perUserDailyCapUsd": 6, "gradingAllowanceUsd": 3 }
```

Add `maxReservationUsdPerCall` entries for any unknown-priced tool that is enabled. Then read back `GET /api/ai-controls/budgets/:institutionId`.

## 6. Monitoring and support

- **Watch** `alert_events` daily: no alert sink is configured, so nobody is notified automatically. Watch for:
  - `ai_test_spend_cap_reached`
  - `ai_budget_cap_reached`
  - `ai_unknown_cost_reserved`
  - `grading_exception`
  - `http_5xx`
  - `cron_job_failed`
- **Review** `audit_events` weekly.
- **Daily scheduler** (OD-4): if approved, call `GET /api/cron/daily` once a day with `Authorization: Bearer <CRON_SECRET>`, for example at 03:17 UTC. Staging has none by design.
- **Backup and restore** (BLOCKED, no evidence): enable Atlas backups, test a restore into a scratch cluster, and record the result. Consider R2 object versioning.

## 7. Pilot success metrics (PROPOSED: formulas fixed, targets need approval)

| Metric | Formula | Denominator | Source | Window | Stop threshold (proposed) |
|---|---|---|---|---|---|
| Teacher activation | Teachers with ≥1 assignment | Invited teachers | assignments | Pilot to date | — |
| Weekly active students | Students with any activity in the week | Rostered students | attempts, lessons, tutor | Weekly | — |
| Assessment completion | Submitted pairs ÷ due pairs | Due pairs | `scoreMetrics` / chat analytics | Weekly | — |
| Grading exception rate | `grading_exception` ÷ AI-graded attempts | AI-graded attempts | attempts | Weekly | > 10% |
| Unsafe release | Leak-guard misses found on review | Released AI grades | review | Pilot | ≥ 1 → stop |
| Gap closure | Objectives moving from emerging/developing to secure | Gaps identified | mastery history | Monthly | — |
| Reassessment improvement | Mean score change (latest unassisted vs first) | Students reassessed | `scoreMetrics` | Pilot | — |
| AI cost per active student | Settled + unknown micros ÷ weekly active students | Active students | `budget_counters` / ledger | Weekly | > approved budget |
| Support incidents | Tickets | — | support log | Weekly | — |

## 8. Stop / rollback criteria

Stop at once, pause AI (`PUT /api/ai-controls/pause`) and roll back if any of these happen:
- privacy breach, or student data sent to a model outside the approved flows;
- cross-tenant data exposure;
- unsafe grade release;
- hard cap reached unexpectedly;
- repeated unknown-cost reservations;
- critical 5xx for more than 15 minutes;
- missing data;
- reported harm to a teacher or student.

## 9. Accessibility manual check (automated audit NOT RUN)

For each of sign-in, invitation, reset, student course and lesson, assignment attempt, results, teacher grading, Documents, People, and the Educator Chat report with chart:

| Check | What to do |
|---|---|
| Keyboard | Tab through every control; focus is visible; dialogs trap and restore focus; Esc closes |
| Screen reader | NVDA or VoiceOver: labels, table captions, chart `role="img"` label, live regions |
| Contrast | ≥ 4.5:1 for text |
| Text | 200% zoom with no loss |
| Motion | Reduced motion honoured |
| RTL | Arabic UI and an Arabic analytics report; charts mirrored, table `dir="auto"` |
| Width | 375 px and desktop |

Record the findings in a dated report.

## 10. Bundle plan (not implemented)

The main chunk is 2.68 MB (701 kB gzip), measured in this task. Plan:
1. Lazy-load the ENARA Admin and staff portals and Recharts pages with `React.lazy` per portal.
2. Split the avatar call (`@anam-ai/js-sdk`) into its own chunk.
3. Measure again.

There is no URL router; navigation is state-based, so lazy loading must keep the current state semantics.

## 11. Privacy workflows (DRAFT: retention periods are OWNER DECISION)

- **Export:** a school admin requests it; the operator exports the school's records by `institutionId` (users, students, attempts, mastery, conversations).
- **Erasure:** the operator deletes per student (attempts, evidence, mastery, conversations, tutor messages, files) and records an audit event.
- **Retention:**

| Data | Period |
|---|---|
| Documents | 180 days after `pilotEndsAt` (code default) |
| Educator conversations | 180 days (code) |
| Logs, usage ledger, audit, alerts, tutor messages | **OWNER DECISION** |

- **Sub-processors** (from code): Anthropic, ElevenLabs, Anam, Resend, Cloudflare R2, Vercel, MongoDB Atlas, optional PostgreSQL host, internal engines. No DPA is evidenced.

## 12. Key-rotation checklist (do not execute here)

1. Anthropic API key.
2. R2 access key pair.
3. Atlas database user password.
4. `JWT_SECRET`. This signs everyone out and invalidates file links.
5. `INGEST_HMAC_SECRET` (coordinate with partners).
6. `CRON_SECRET`.
7. `API_DOCS_PASSWORD`.

Update Vercel, redeploy, smoke-check, and revoke the old keys at the provider.
