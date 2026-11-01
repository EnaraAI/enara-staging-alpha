# ENARA — Inconsistency Register (post-hardening)

This register extends `20261101T080442Z-platform-readiness-audit/INCONSISTENCY_REGISTER.md` (I-01…I-44), which is preserved unchanged. Rows below are new, or change status because of this task.

| ID | Claim A (source, date) | Claim B (source, date) | Known now | Status | What would verify |
|---|---|---|---|---|---|
| J-01 | 416/417 provider-free tests, 1 failing (`p7RoleMatrix`) (audit, 2026-11-01 07:58) | 448/448 across 42 files (this task, 11:28) | Different file sets: the 40 audit files plus 2 new P22 files; p7 fixed | Superseded | — |
| J-02 | Earlier full-suite totals 1009–1069 (P14.8–P19) | This task: 42 of 95 files run (48 mocked + 5 stubbed not run) | Not comparable; not merged | Known | Run the mocked suites under an approved policy |
| J-03 | Unscanned files downloadable with a warning (owner, 2026-10-29; README; manifest; `p2NoScannerPolicy`) | Originals never downloadable unless clean (owner, 2026-11-01) | Code follows 2026-11-01 | Superseded; `p2NoScannerPolicy` and `p2Documents` (NOT RUN) still encode the old policy | Update and run those suites |
| J-04 | My first P22 pass (same day) allowed deferred downloads after a confirmation page | Master spec §3.2 | Replaced by the stricter policy before this report | Superseded | — |
| J-05 | Analytics assistant pseudonymised students (my first P22 pass) | Master spec §3.1: no student-level records at all | Aggregates only | Superseded | — |
| J-06 | Test-spend cap "cumulative" (P14.2/P14.3) | Audit: per spend ID | Environment-wide, monotonic | Fixed locally | Deployed read-back of `test_spend:__environment__` |
| J-07 | Speaking-exam STT metered (P4 report) | Audit: settles at $0 | Unpriced; fails closed without ceilings | Fixed locally; values OD-1 | — |
| J-08 | `releasePolicy: 'manual'` setting exists (model, API) | Audit: ignored | Opt-in manual hold works; `phase3.sprint1` expectation changed (it encoded the defect) | Fixed locally | — |
| J-09 | Staging cron "see vercel.json" (code comment) | `p6VercelStaging`: no crons, by design | Comment corrected; schedule is OD-4 | Resolved | — |
| J-10 | Platform doc: 274 API operations | Audit: 275 | This task adds `PUT /api/workspace/users/:id/status` and `PUT /api/integrations/institutions/:id/status`; count not re-measured | Known drift | Re-run `apiDocs` count |
| J-11 | F-5 maintenance endpoint removed (2026-10-29) | — | Still no maintenance code | Resolved (unchanged) | — |
| J-12 | Domain `test.enara.app` (session record) | Reports: `enara-staging-alpha.vercel.app` | Unchanged: OD-2 | Unresolved | Vercel/Cloudflare read-back |
| J-13 | Deployment `dpl_Hw32…` (session record) | No P22 deployment | None of the P22 changes are deployed | Unknown | Deployment report after deploy |
| J-14 | Named analytics privacy: names to model (audit) | — | Educator Chat analytics never sent names; the assistant did; now aggregates only | Fixed locally | — |
| J-15 | Budget enforcement "active" for synthetic schools (implied by earlier runbooks) | Audit: enforcement disabled | Not changed remotely | Unresolved (operator) | Budget read-back |
| J-16 | P12 progress "0→100%" vs log "85.7%" | This task: 0→100% computed from records in the provider-free journey | Earlier figure superseded as evidence | Resolved for the provider-free path | Deployed live re-run |
| J-17 | Tutor "blocked while assignment open" | Code: blocked while an **attempt is in progress** (before starting an attempt the tutor answers) | Behaviour documented; test checks it during the attempt | Known design | Owner to confirm whether "open assignment" should block before the attempt starts |
| J-18 | Lesson videos are uploads without a scan | §3.2 forbids unscanned originals | Treated as media and playable | OD-3 | Owner decision |
