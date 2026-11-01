# Deployment record — 2026-11-01 (STAGING-VERIFIED)

| | |
|---|---|
| Source commit | `2619887` "Pre-pilot hardening: file access, privacy, spend controls, accounts, audit" (pushed to `origin/claude/codebase-review-kbxqan`) |
| Built from | `git archive 2619887` into a clean folder; `vercel deploy --prod --skip-domain` (unpromoted) |
| Deployment | `dpl_4hQwNexc1fbnzWc35E8ozL5n71FS` (`enara-staging-alpha-chs8xxxp3.vercel.app`), region iad1 |
| Promoted | yes, after all smoke checks passed; serves `test.enara.app` and `enara-staging-alpha.vercel.app` |
| Rollback target | `dpl_Hw32FB6bvgv7bXoh6awf62o9JgLb` (previous production, `f5dd116`): `vercel promote <that deployment>` |
| Environment variables | none changed; no flags, budgets or DNS changed; no migrations run |

## Smoke checks on the unpromoted deployment (synthetic accounts; statuses only)

| Check | Result |
|---|---|
| `/health` | 200 |
| `/ready` | 200: mongo ok, r2 configured, anthropic configured, **elevenlabs not configured**, anam configured, test-spend cap set; postgres not configured |
| `/api/docs/ui`, `/api/docs.json` without password | 401 |
| Login: admin, teacher, student, academic manager, ENARA admin (4Level1); other-school teacher (P21C) | 200 each |
| Academic manager → AI data assistant | 403 `ASSISTANT_NOT_PERMITTED` |
| ENARA admin → AI data assistant | 403 `ASSISTANT_NOT_PERMITTED` |
| School admin → People (`/api/workspace/users`) | 200 |
| Teacher → People | 403 |
| Student → `/api/me/courses` | 200 |
| 4Level1 teacher → P21C curriculum | 404 (cross-school refused) |
| AI draft request at P21C (AI drafting switched off there) | 404 `FEATURE_DISABLED`; the Arabic refusal itself is test-verified locally, and flags were not changed to probe it |
| Documents: unscanned originals with a download link | 0 (4Level1: 0 documents; P21C: documents workspace off) |
| Unsigned `/uploads/` link | 403 |

After promotion: `test.enara.app` and `enara-staging-alpha.vercel.app` both answer `/health` 200, `/ready` 200, and docs 401.

## Not verified on the deployment

- AI calls (no paid calls made).
- Speaking exams: ElevenLabs is not configured on staging, so they are unavailable regardless of OD-1.
- Download of an actual clean file: no clean files exist.
- The one-month TTL indexes are created by Mongoose when the models are first used; their creation was not read back.
