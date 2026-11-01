# ENARA — Security and Data-Flow Matrix

Basis: code in the working tree on 2026-11-01. Labels: CODE-VERIFIED unless noted. "Leaves backend" names the external processor; only the data listed is sent.

## 1. Role × data access (server-enforced)

| Data | Student | Teacher | Academic Manager | Workspace Admin | ENARA Admin |
|---|---|---|---|---|---|
| Own learning record, results (after release) | ✔ own | — | — | — | — |
| Class rosters, names, grades, scores (own classes) | — | ✔ own classes | aggregates only (insight pages) | ✔ own school | ✔ any school (explicit) |
| Named student reports and charts (Educator Chat analytics) | ✘ | ✔ own classes | ✘ | ✔ own school | ✘ |
| AI data assistant (model-backed) | ✘ | ✘ (no `insights:read_school`) | ✘ | ✔ own school, aggregates only | ✘ |
| Document Q&A (Educator Chat) | ✘ | ✔ | ✘ by default (`content:author` is grantable: R-register) | ✔ | ✘ in practice (needs school scope) |
| Original file download | only clean / media of own school | same | same | same | any school, same eligibility |
| Extracted text ("Sources") of documents | ✘ | ✔ | ✘ | ✔ | ✔ |
| Feature flags, budgets, AI pause, integrations, suspension | ✘ | ✘ | ✘ | ✘ | ✔ (audited) |
| Users: disable, enable, invite, permissions | ✘ | ✘ | ✘ | ✔ own school (not other admins) | ✔ |
| Provider cost (`cost:internal`) | ✘ | ✘ | ✘ | ✘ | ✔ |
| Own tour preference | ✔ | ✔ | ✔ | ✔ | ✔ |

## 2. Feature × provider × data sent

| Feature | Provider | Data sent | Student-level? | Gate |
|---|---|---|---|---|
| AI tutor (chat / stream) | Anthropic | Lesson context, conversation, teaching plan, retrieved passages; first name per P12 R-3 (not changed) | **Yes, the learner's own conversation** (core feature, prior approval) | Budget; assignment tutor policy |
| Voice tutor | ElevenLabs STT/TTS; Anthropic | Learner audio and text | Yes, own | Budget; keys |
| Live avatar | Anam (session token); browser streams media | Session config; avatar media | Learner video/audio stream to Anam | **Off until OD-1**; max length |
| AI grading | Anthropic | Question, rubric, the student's answer | Answer text (no name) | `ai_grading_enabled`; cap |
| Speaking exam | ElevenLabs STT/TTS | Recorded replies | Yes | **Off until OD-1** |
| Assessment drafts / lesson plans | Anthropic | Extracted text of attested documents, teacher brief | No | Flags; Arabic drafting refused |
| Educator Chat document Q&A | Anthropic | Retrieved passages, question (student-data questions refused) | No | Flags |
| Educator Chat analytics | **none** (deterministic) | — | Stays in the backend | Flags |
| Intent router (off) | Anthropic | Redacted question only | No | Flag off |
| AI data assistant | Anthropic | School aggregates and counts; question with names redacted | **No** (P22) | School admin |
| Next steps, reminders, weekly summary | Anthropic; Resend (email) | Learner snapshot / class summary | Yes (reminders) | `REMINDERS_ENABLED`; email not configured on staging |
| Documents storage | Cloudflare R2 | Original files | Possibly | Attestation; download gate |
| Ingestion / orchestrator | Internal engines | Curriculum files (only `clean` raw files) | No | Not configured on staging |
| Data stores | MongoDB (Atlas), PostgreSQL (optional), Vercel (logs) | All application data; logs with signed links redacted | Yes | — |

No DPA, sub-processor agreement or compliance certification is evidenced in the repository: **UNKNOWN**.

## 3. Controls summary

| Control | Implementation | Evidence |
|---|---|---|
| Authentication | JWT plus per-request user reload; token version revocation; disabled and suspended checks | p22, `p14_8` (mocked, NOT RUN) |
| Tenant isolation | `scopedFilter`, `learningAccess`, 404 existence-hiding | `p7RoleMatrix`, p22 |
| File access | Owner-bound signed links ≤15 min; clean-only originals | p22 |
| Logs | `redactSignedLinks`, `logPath`, key-based redaction | p22 |
| Audit | Append-only `audit_events` | p22 |
| Spend | Reservation before every call; environment cap; unpriced fail-closed | p22, `p20Accounting` |
