# LMS Phase 0: Foundations

Status: **done** (2026-11-16), on branch `claude/lms-integration`. **Not deployed.** All LMS flags default to off, so the live site behaves exactly as before.

## What was built

| Part | Where |
|---|---|
| Provider-neutral types (`LmsProvider`, capabilities, launch result) | `backend/src/integrations/lms/core/types.ts` |
| Adapter registry, empty (no stub adapters) | `backend/src/integrations/lms/registry.ts` |
| Vendor presets, data only: `moodle`, `generic` | `backend/src/integrations/lms/presets/` |
| Capabilities = preset ceiling narrowed by granted scopes | `core/capabilities.ts` |
| LTI role map (Spec §5.4), with per-platform overrides | `core/roleMap.ts` |
| Settings and effective flags | `config/env.ts` (`lms`), `core/flags.ts` |
| AES-256-GCM encryption under `LMS_KEK` (record-bound, key rotation ready) | `core/crypto.ts` |
| Signing keys (RSA-2048, RS256, `jose`), JWKS, rotation | `core/keys.ts` |
| Named locks across instances | `core/locks.ts` |
| Audit log writer (IDs only, personal data dropped) | `core/audit.ts` |
| 14 collections (13 from Spec §4 plus `lms_locks`) | `backend/src/integrations/lms/models/` |
| `GET /lti/jwks` and `GET /.well-known/jwks.json` | `backend/src/integrations/lms/routes.ts`, mounted in `app.ts` |
| Index migration `2026-11-16-lms-phase0-indexes` | `backend/src/migrations/index.ts` |
| Scripts: `npm run lms:keys -- ensure\|next\|promote\|list`, `npm run lms:drop -- --confirm` | `backend/src/scripts/` |
| Vercel routes for `/lti/*` and `/.well-known/jwks.json` | `vercel.json` |
| Guide for adding a new LMS | `docs/lms/ADDING_A_NEW_LMS.md` |

## Decisions and deviations

- **`jose` is ESM-only.** The backend compiles to CommonJS, and Node 22 loads ESM through `require()`, which was checked at runtime. Vercel runs Node 22.x (`package.json` engines).
- **Migrations go forward only.** The repo's runner has no "down" step. `npm run lms:drop -- --confirm` is the manual reverse. It deletes all LMS data, including the signing keys. Plan §3.1 was corrected: the first draft wrongly said the repo had no migrations.
- **Migrations do not run on start in staging mode**, and test.enara.app runs in staging mode (`migrateOnStart` returns false). *(Corrected: an earlier version of this note said the first deploy would create the collections.)* The 14 LMS collections are created only when `npm run migrate` is run, and on the real database that needs Mohamed's approval, a backup first, and a dry run.
- **Fields that don't belong to one school:** `lms_tool_keys` and `lms_locks` are tool-wide by nature. `lms_audit_log.institutionId` is optional because a launch from an unknown platform has no school yet. Every other LMS record requires `institutionId`, and a test enforces this.
- **Outbox statuses** are `pending | processing | sent | dead`. A failed attempt stays `pending` with a later `nextAttemptAt`. The spec's separate `failed` status is not used.
- **Subject-neutral grades:** the outbox stores `levelScheme` and `levelLabel` (for example `cefr` and `A2`) only when an activity has a level. The spec's `cefr_level` field was generalised.
- **`lms_platforms.vendor`** is checked against the preset list, not a fixed enum, so a new vendor needs no schema change.
- **OIDC state and nonce** are stored only as SHA-256 hashes. A 10-minute TTL index removes them.
- **The first signing key** is created on the first JWKS request. A partial unique index means only one active key can ever exist, even with simultaneous requests (tested with 10 at once).
- **Effective flags are off whenever the LMS config has a problem:** a malformed `LMS_KEK`, or LTI on without `LMS_KEK` or `LMS_TOOL_BASE_URL`. The site still starts, and the problem names the variable, never its value.
- **Admin routes** will live under `/api/lms/…` (from Phase 1), because `/api/integrations` is already used for school API keys. The role-matrix and tenant-isolation sweeps cover only `/api/*`; they will be extended when those routes arrive.

## Tests

- New: `backend/test/lms/phase0.test.ts`, **28 tests, all passing**. They cover:
  - config and flags;
  - encryption round-trip, tampering, wrong record, wrong key, rotation and a missing key;
  - role map;
  - presets, registry and capabilities;
  - required `institutionId`;
  - the migration run twice;
  - one active key under 10 simultaneous requests;
  - an encrypted private key and no private parts in the JWKS;
  - signing and verifying against the JWKS;
  - rotation;
  - locks and audit sanitising;
  - HTTP 404 with flags off or a broken key, and 200 with the flag on.
- Updated: `p6VercelStaging.test.ts` now lists the two new function routes. Its old check expected exactly 4.
- Full suite: **the 16 known pre-existing failures only.**
  - The first run showed 17. The extra one was the route-count check above, which is now fixed.
  - A second run under heavier parallel load also timed out `p14_9TenantIsolation` and `p19TenantIsolation`. Both pass when run alone, 16 of 16.

## Environment

- `LMS_KEK` was added to Vercel production as a **sensitive** variable on 2026-11-16. It was generated on the server and never displayed or stored anywhere else. It cannot be read back. If it is lost, delete the signing keys and let them be recreated; registered platforms re-fetch the JWKS by URL.
- Still to add before Phase 1 testing: `LMS_TOOL_BASE_URL=https://test.enara.app`. Keep `LMS_LTI_ENABLED` unset (off) until Phase 1 is tested.
