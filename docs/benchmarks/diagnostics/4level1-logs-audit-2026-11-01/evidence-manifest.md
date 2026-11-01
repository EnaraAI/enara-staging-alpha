# Evidence manifest

| Item | Value |
|---|---|
| Extraction window | 2026-11-01 12:07–12:11 UTC (local machine clock, UTC) |
| Tool | Vercel CLI 50.44.0, existing authenticated login (not displayed), project `enara-staging-alpha` |
| Command 1 | `vercel logs --no-branch --environment production --since 30d --limit 10000 --json --no-follow` → 50 rows (12:01:34–12:07:21) |
| Command 2 (paging) | Same, with `--until <earliest-1ms>` and `--limit 100`, repeated until a page returned 0 rows → 47 more rows; then 0 |
| Probes | `--since 3d --until 2026-11-01T11:50:00Z` → 0 rows; `--deployment dpl_Hw32FB6bvgv7bXoh6awf62o9JgLb --since 3d` → 0 rows |
| Total unique rows | 97 (dedup by Vercel row `id`), all `dpl_4hQwNexc1fbnzWc35E8ozL5n71FS`, all `info` |
| Pagination completeness | Complete for what the provider returned. Provider retention bounds the window. |
| Tenant filter | Structured `http_request` entries with `institutionId` exactly equal to 4Level1's ID → 56 |
| Excluded | 6 other-tenant (counted only, no details); 35 no-institution (appendix, counts only) |
| Redaction | Query strings removed; record IDs replaced with `:id`; user IDs replaced with pseudonyms U01–U04; no request or response bodies exist in the logs |
| MongoDB | Not accessed. `vercel env pull` to a restricted temp file was refused by the session's safety control (credential materialisation); no alternative attempted |
| Restricted evidence | Full institution ID, pseudonym→userId map and Vercel row IDs, kept outside the repository in the session scratchpad (`l4audit_tmp/restricted_evidence_index.json`, mode 0600) |
| Raw log copy | Session scratchpad only (`l4audit_tmp/`, mode 0700); never printed or committed |
| Query hash | sha256 of the filter definition `institutionId == <4Level1>` over `http_request` lines; see verification below |

## Verification (local, non-mutating)

- Filter-definition sha256: `b4279dee54d3b1df7dd6ec3ffb66e7659ed12c4907d688fb357a09e77f825e26`
- Timeline rows: CSV 56 = JSONL 56 = user-activity total 56 = executive summary 56
- Timeline sorted ascending: True; all timestamps parse as ISO 8601 UTC
- Every row attributed by exact institutionId match: True
- Synthetic classes labelled on every row (agent smoke / interactive session on a synthetic account); real-school rows: 0
- Scan of all 13 report files for signed-link parameters, bearer tokens, JWTs, connection strings, API keys, full institution IDs, account emails and other-school identifiers: no matches. The only hits are the word "password" in prose ("no email or password", "docs without a password"); no values.
- Repository: only this new untracked folder was added; no tracked file changed; no commit, push or deploy
