# Adding a new LMS to ENARA

ENARA's LMS layer is provider-neutral. Core code and the LMS domain service talk only to the `LmsProvider` interface (`backend/src/integrations/lms/core/types.ts`). Vendor differences live in **presets** (data) and protocol differences live in **adapters** (code). Nothing outside those two folders may branch on a vendor name.

Release 1 ships the `moodle` and `generic` presets only. The `lti13` adapter (`adapters/lti13/`) exists since Phase 1a (login and launch; `docs/lms/PHASE_1A_NOTES.md`); the `google_classroom` adapter arrives in Phase 5. Provisioning (users, classes, enrollments, seats) lives in the provider-neutral `core/domainService.ts`, which every adapter calls with normalised launch data.

## Which case are you in?

| You want to add… | Example | What you write |
|---|---|---|
| Another LTI 1.3 product | Canvas, Blackboard, D2L, Schoology | **A preset only.** See section A. |
| A new protocol family | OneRoster 1.2, a vendor's own API | **A new adapter.** See section B. |

Try the `generic` preset first. Any spec-compliant LTI 1.3 Advantage platform should already work through it. Add a preset only when the product needs different registration steps, role overrides or placement notes.

## A. A new LTI 1.3 vendor (preset only)

1. Create `backend/src/integrations/lms/presets/<vendor>.ts` exporting an `LmsVendorPreset`:
   - `id`: lowercase, a–z, 0–9 and dashes. This value is stored in `lms_platforms.vendor`.
   - `provider: 'lti13'`.
   - `registration`: `['dynamic', 'manual']`, or whichever the product supports.
   - `capabilities`: the vendor's ceiling. A deployment can only narrow it, through the scopes it grants.
   - `roleOverrides`: only for non-standard role URIs.
2. Add one line to the `PRESETS` list in `presets/index.ts`.
3. Add `backend/test/lms/contract/<vendor>.preset.test.ts`. It runs the shared contract suite with the new preset (launch, deep link, grade push, roster, error and retry). The suite is built in Phases 1–4.
4. Add a row to the table at the end of this file.

**Not touched:** core, models, the LTI adapter, the outbox, the UI.

## B. A new protocol family (adapter)

1. Create `backend/src/integrations/lms/adapters/<kind>/` implementing `LmsProvider`:
   - `kind`: a new string, for example `'oneroster'`.
   - `capabilities()`: return only what the protocol can do. For example, OneRoster has no `launch`.
   - Implement only the methods those capabilities need: `syncRoster`, `pushScore` and so on.
2. Add one `registerProvider(...)` line in `registry.ts`.
3. Store data in the existing generic models, with `provider = '<kind>'` on `lms_platforms`. Do not add vendor-specific collections or fields.
4. Encrypt any credential with `encryptSecret(value, '<collection>:<id>')` from `core/crypto.ts`. Never store one in plain text.
5. Write every registration, sync and push result to `lms_audit_log` with `writeLmsAudit` (IDs only, no personal data).
6. Add `backend/test/lms/contract/<kind>.test.ts`, running the shared contract suite for the capabilities you declared.
7. If the protocol needs a preset (vendor quirks), add one as in section A.

**Not touched:** core, models, the outbox, the UI. Features are shown by capability.

## Rules

- Never branch on `vendor` or on a product name outside `presets/` and `adapters/`.
- Never write stub or placeholder adapters for products we are not shipping.
- Identity is (platform, external user id), never email.
- Every school-owned record carries `institutionId`.

## Registered presets

| Preset | Provider | Added | Tested on |
|---|---|---|---|
| `moodle` | lti13 | Phase 0 | Moodle 4.5 LTS and the latest release (Phase 7) |
| `generic` | lti13 | Phase 0 | saltire.lti.app and the mock platform (Phase 1) |
