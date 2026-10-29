# P14 final report: Vercel live AI end-to-end

**Deployed Vercel staging: NO-GO for this run, with gates BLOCKED.** No authenticated, write, AI or journey test was executed on the deployed app.

**This is separate from P12.** P12 was an isolated local runner (in-process app, in-memory MongoDB, direct Anthropic calls, $0.112112). It is **not** evidence for the deployed Vercel app, and nothing in P14 changes that.

## What was done (2026-10-29 17:23 UTC)

- **Repository re-checked:** branch `staging-alpha`, HEAD `cc8530f` = origin, 0 tracked changes, 8 untracked entries preserved.
- **Deployment re-checked:** `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4` unchanged; 20 Production-scoped variable names; still no `ANTHROPIC_API_KEY`, model override or email variables.
- **Public checks:** `GET /health` 200, `GET /ready` 200 (`postgres: ok` is not proof of a database).
- **Gate evaluation:** see `P14_GATE_REPORT.md`.

**Spend:** $0. No provider calls. The $5 approval is recorded, unused.

## Why it stops

| Gate | Status | Blocking reason (short) |
|---|---|---|
| 1 Isolation attestation | BLOCKED | No operator attestations yet |
| 2 Safe switches and guard execution | BLOCKED | No operator attestations yet |
| 3 Guard weakness fixed or mitigated | BLOCKED | Needs authorization: a patch (code + deploy) or a formally accepted mitigation |
| 4 Test tenant, accounts, cleanup | BLOCKED | No student or unauthorized test accounts; tenant contents and cleanup plan not confirmed |
| 5 $5 cap enforceable | BLOCKED | No staging key; no verified provider-side limit; the school's app-side caps ($6/day, $15/month) exceed $5; AI pause reported off |
| 6 Re-check after changes | VERIFIED | No changes since P13.3 |

## Exactly what the operator must provide next

1. **P13.3 checklist results**, as yes/no lines with no values: items 1, 1a, 2, 3, 4a, 4b, 4c, 5a, 5b, 6a, 6b, 6c, 6d, 7, 8, 9, 10, 11a, 11b, 13, 15.
2. **Gate 3 decision:** authorize the minimal fail-closed patch plus a redeploy, **or** formally accept the attestation-based mitigation for P14 only.
3. **Gate 4:**
   - confirm the staging school holds only synthetic data;
   - approve creating a synthetic **student** account and an **unauthorized-role** account;
   - approve the cleanup plan.
4. **Gate 5:**
   - create a **staging-only Anthropic key** in a dedicated workspace with a **hard spend limit ≤ $5**, and confirm it (yes/no);
   - decide whether to lower the staging school's P0d caps to ≤ $5;
   - after gates 1–4 pass, authorize setting the key and the AI-pause state on Vercel plus a redeploy.
5. **After any change:** a new deployment id, and re-attestation of the gate-1/2 items (gate 6).

When all of these pass, the next run would begin with Phase 0 and Phase 1: authenticated, non-AI tests only, on the deployed app. AI calls (Phase 2/3) would follow only after Phase 1 passes, within the $5 cap.
