# LMS Phase 2: activity picker (LTI Deep Linking 2.0)

Switch: `LMS_DEEP_LINKING_ENABLED`, default off. It also needs `LMS_LTI_ENABLED`. It is on for lms-test only.

## Flow

1. **The teacher opens the picker.** In Moodle, a teacher (or admin) adds an **ENARA** activity and clicks **Select content**. Moodle sends an `LtiDeepLinkingRequest` through the normal OIDC login and launch.
2. **The request is checked.** `oidc.ts` checks it like any launch: signature, nonce, issuer, deployment and roles. `deepLinking.ts › startDeepLinking` then checks:
   - the role is teacher or admin (a student gets `deep_link_not_allowed`);
   - the return URL is on the LMS's own host;
   - `accept_types` includes `ltiResourceLink`.
   Nothing is provisioned. Instead, a row in `lms_deep_link_sessions` is created. It holds IDs only, plus the course title, the language (`en` or `ar`, from `launch_presentation.locale`) and the LMS's settings. It lasts 10 minutes and can be used once. Only the SHA-256 of its secret is stored.
3. **The browser opens the picker.** It goes to `/lms/picker#ps=<secret>`. The secret is in the URL fragment, so it never reaches a server and is removed from the address bar. The page `frontend/pages/LmsPicker.tsx` is in Arabic (right to left) or English. It calls the picker API (`admin/pickerRoutes.ts`), sending the secret in the header `X-Lms-Picker`:
   - `GET /api/lms/picker/session` returns the language, course title, item types and whether several items may be picked;
   - `GET /api/lms/picker/items` returns the school's items, each with `alreadyAdded`;
   - `POST /api/lms/picker/submit {items:[{type,id}]}` re-checks every item, marks the session used (atomically), and returns `{returnUrl, jwt}`.
4. **The answer goes back to Moodle.** The page posts the signed `LtiDeepLinkingResponse` (field `JWT`) to Moodle's return URL, and Moodle creates one activity per item.

## The signed response

- **Signature:** RS256, with ENARA's LMS key (the same `kid` as in `/.well-known/jwks.json`, which Moodle already uses for grades).
- **Claims:**
  - `iss` = client ID, `aud` = platform issuer, `exp` = 5 minutes, plus `nonce` and `jti`;
  - `deployment_id`, and `data` sent back unchanged.
- **Each content item:**
  - `type: ltiResourceLink`, with the title, the description as `text`, and `url` = `/lti/launch`.
  - `custom` is the **same binding parameter as Phase 3** (`enara_assessment=…` or `enara_assignment=…`). Grades (Phase 3), the roster (Phase 4) and the ledger therefore work unchanged.
  - `lineItem {scoreMaximum: 100, label, resourceId: "<type>:<id>", tag: "enara"}`, **only for graded items** and only if the LMS accepts line items (decision P2).
  - Practice gets **no** grade column, plus `enara_graded=0`. The grade outbox then skips it (`enqueueForLink` returns `not_graded`), so no column is ever created later through the line-items service.
  - Items that need the mic or camera get `window` (decision P3), if the LMS accepts window targets. **Moodle 4.3+ ignores this hint** (MDL-79442), so ENARA's own in-frame check and "Open in new tab" handle it. See `LMS_MEDIA_IN_FRAME` in the "everything in Moodle" plan.

## "Already added in this course" (decision P4)

Adding the same item twice is allowed. The picker marks an item with the badge when either of these is true for **this** LMS course:
- it was picked before (rows in `lms_deep_link_sessions` that were used keep `picked`, with IDs only);
- an activity in the course already launched with its binding (`lms_resource_links.customParams`). This covers activities made by hand before Phase 2.

Unused sessions are deleted through the TTL index on `purgeAt`. Used sessions keep their picks.

## Item types are plug-ins (owner note on P1)

The picker screen, its API and the signed response know nothing about assessments or assignments. Each item type is a plug-in in the registry `core/picker.ts`:

```ts
export interface PickerItemType {
  type: string;                                   // 'assessment', 'assignment', later 'lesson', ...
  label: { en: string; ar: string };              // shown in the picker's Type filter
  list(institutionId, limit): Promise<PickerItem[]>;          // the school's usable items
  resolve(institutionId, id): Promise<PickerItem | null>;     // re-checked on submit
}
// PickerItem: title, description, subject, kind, difficulty, language {level, skills} (language courses only),
// questions, points, graded, needsMedia, custom (the LTI custom parameters the launch reads), meta.
```

Phase 2 registers `assessment` and `assignment` in `core/pickerTypes.ts`.

### Adding an item type (for example lessons)

1. **Picker side:** create one new file, for example `core/pickerTypes/lesson.ts`. It calls `registerPickerType({ type: 'lesson', label: { en: 'Lessons', ar: 'الدروس' }, list, resolve })`:
   - `list` returns the school's deployed lessons as `PickerItem`s, for example `custom: { enara_lesson: '<curriculumId>:<chapterId>' }`, `graded: false` and `needsMedia: false`;
   - `resolve` re-checks one lesson.
   Import the file next to `pickerTypes.ts`. **The picker UI, API and response need no change.** The new type appears in the Type filter, with its label in both languages.
2. **Launch side:** teach the launch to open the new item. Add `enara_lesson` to the binding (`core/binding.ts`), with a landing target for the lesson page. For a gradable new type, also define its score (Phase 3 `scoring.ts`).
3. **Tests:** one list/resolve test for the new type, plus one launch test.

## Due dates

**Skipped.** Moodle's LTI activity has **no due-date field**, and Moodle doesn't use the date fields of a deep-linking response. A date set in the picker would therefore not show in Moodle. As before, the ENARA assignment keeps its own due date, which comes from the assignment or defaults to one year. If wanted later, the picker could set the ENARA due date, but it would show only in ENARA.

## Moodle settings (owner, by hand)

The web-services token cannot change tool settings. Go to **Site administration › Plugins › Activity modules › External tool › Manage tools › ENARA (test) › edit (cog)**:
1. Tick **Supports Deep Linking (Content-Item Message)**.
2. Set **Content Selection URL** to `https://lms-test.enara.app/lti/launch`.
3. Save.

## Tests

`test/lms/phase2.test.ts` has 13 tests against the mock LMS, covering:
- the switch;
- who may open the picker;
- the return URL and accepted types;
- the session (IDs only, language, single use, expiry);
- the items (this school, published only, language facts only for language courses, no custom parameters leaked);
- the signed response (verified with ENARA's JWKS, deployment, `data`, nonce, items, grade column only for graded items, new window for mic items, duplicates removed);
- Cancel;
- draft, unknown and other-school items refused;
- one item at a time;
- an LMS that accepts neither line items nor windows;
- the badge (earlier picks, and hand-made activities);
- a picked practice item launching through Phase 3 and never sending a grade;
- the audit log (IDs and counts only).
