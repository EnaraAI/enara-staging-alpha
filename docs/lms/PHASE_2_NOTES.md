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
  - **Practice is graded** (owner decision D3, "practice graded, best attempt"). It gets a grade column (max 100) like any graded item and sends the student's **best** attempt (`scoring.ts`: the default policy for practice is `best`). Moodle creates a column for every activity anyway, so this fills it. Both Phase 2 item types are now graded, so the picker shows the "No grade column" badge for none of them; the badge stays for item types that are truly ungraded (none in Phase 2).
  - `enara_graded=0` (no grade column) is kept for truly ungraded item types. The grade outbox skips such a link (`enqueueForLink` returns `not_graded`), **except when the bound work is practice**: practice activities picked before D3 carry `enara_graded=0`, and they now send their best attempt to the column Moodle made.
  - Items that need the mic or camera get `window` (decision P3), if the LMS accepts window targets. **Decision P3: ENARA asks the LMS for a new window and always offers its own new tab; Moodle 4.3+ ignores the request** (MDL-79442), so ENARA's own in-frame check and "Open in new tab" handle it there. The picker badge reads "Microphone: new window or tab". See `LMS_MEDIA_IN_FRAME` in the "everything in Moodle" plan.

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

Moodle's LTI activity has **no due-date field**, and Moodle doesn't use the date fields of a deep-linking response. Phase 2 therefore skipped due dates. **Phase 2b adds an optional due date in the picker (owner decision D13)**: it is stored on the ENARA assignment and written into the Moodle description text when the activity is created. See "Phase 2b" below.

## One host (startup check)

Moodle's frame grants the microphone and camera only to the **Tool URL's host** (MDL-81637). So `/lti/*` and the app (the `/lms/launch` page and every page after it) must be on the same host. When `LMS_LTI_ENABLED` is on, the LMS config checks (`config/env.ts › parseLmsConfig`):
- `LMS_TOOL_BASE_URL` is an https origin (http only for `localhost` outside production);
- its host (with port) equals the host of `APP_URL`, the app's public address (also used by email links).

If the hosts differ (or `APP_URL` is not a URL), the config gets a `problem` that names the variables, never their values. The LMS is then off (`lmsFlags()`), the problem is logged once at startup (`lms_config_problem`), and `GET /api/lms/status` answers ENARA admins with `{enabled: false, problem}`, which the LMS connections page shows. If `APP_URL` is unset, nothing is blocked: a warning is logged once (`lms_config_warning`). **Before switching LTI on anywhere, set `APP_URL` to the same host as `LMS_TOOL_BASE_URL`** (for lms-test: `https://lms-test.enara.app` for both).

## Moodle settings (owner, by hand)

The web-services token cannot change tool settings. Go to **Site administration › Plugins › Activity modules › External tool › Manage tools › ENARA (test) › edit (cog)**:
1. Tick **Supports Deep Linking (Content-Item Message)**.
2. Set **Content Selection URL** to `https://lms-test.enara.app/lti/launch`.
3. Save.

## Tests

`test/lms/phase2.test.ts` has 14 tests against the mock LMS, covering:
- the switch;
- who may open the picker;
- the return URL and accepted types;
- the session (IDs only, language, single use, expiry);
- the items (this school, published only, language facts only for language courses, no custom parameters leaked);
- the signed response (verified with ENARA's JWKS, deployment, `data`, nonce, items, grade column for graded items, practice included, new window for mic items, duplicates removed);
- Cancel;
- draft, unknown and other-school items refused;
- one item at a time;
- an LMS that accepts neither line items nor windows;
- the badge (earlier picks, and hand-made activities);
- a practice activity picked before D3 (`enara_graded=0`) queuing and sending its **best** attempt (2/4, then 4/4 sent; a later 0/4 sends nothing);
- `enara_graded=0` still keeping a non-practice quiz out of the gradebook;
- the audit log (IDs and counts only).

## Status: DONE, verified on MoodleCloud (18 Nov 2026)

These results come from the owner's tests, with the ENARA side confirmed from the lms-test audit log, the activities and the grade jobs.

**Picker:**
- The picker opened inside Moodle in English, showing the course title.
- **Already added in this course** showed on "Moodle grades test (fake)".
- The owner added 1 item, and then 2 items in one go (a graded quiz and a practice item). The response reported `items: 2, graded: 1`.

**First launches:** each new activity was linked on its first launch (`activity.bound`) to its own assignment in the course's class, and its Moodle title was saved.

**Grades:**
- The graded quiz sent its grade, 2/3, to **its own** grade column (line item 18), with status sent.
- The practice item sent **no** grade (`enara_graded=0`).

**Found during the test:**
1. **Moodle creates a grade column anyway** for an activity whose content item has no `lineItem`. The launch carries that line item (here line item 17), so the column exists but stays empty. ENARA cannot stop this, and cannot remove the activity's own column through AGS. Owner decision D3 (practice graded with "best") resolves it for practice: **done** (see "The signed response"); once deployed, the practice activity above sends its best attempt to line item 17 (not yet verified on MoodleCloud). For items that are genuinely ungraded (later: tutor sessions, the avatar), the teacher guide (`TEACHER_GUIDE.md`) tells teachers to set **Grade › Type: None** on that Moodle activity, and how to give practice weight 0 in the course total.
2. **A (\*) override on "ENARA graded quiz."** in the Moodle gradebook: Moodle ignores tool grades on an overridden cell. The fix is on the Moodle side: untick **Overridden** on that cell. ENARA's ledger shows a difference as "Changed in LMS".

---

# Phase 2b: page links, the course link and due dates

**Status: DONE** (owner, 18 Nov 2026). Deployed to lms-test. The owner skipped the "Delegate to teacher" grade-column test. The recommended tool setting stays **Accept grades from the tool = Always**, and the teacher guide keeps **Grade type: None** for links without a grade.

Branch `claude/lms-phase2b`. Same switches as Phase 2 (`LMS_LTI_ENABLED`, `LMS_DEEP_LINKING_ENABLED`); nothing new to switch on. lms-test only.

## 1. A generic launch target: `enara_target` (owner decision D12)

An LMS activity can name a **page** of ENARA instead of ENARA work. It carries one LTI custom parameter:

```
enara_target=<page key>
```

`core/pageTargets.ts` holds the fixed allowlist. Each key names the page a student opens and/or the page a staff account opens:

| Key | Student lands on | Teacher (and school admin) lands on | Picker |
|---|---|---|---|
| `home` | Home (dashboard) | Teaching Dashboard **for the course's class** | "ENARA home (course link)" |
| `my-learning` | My learning (`courses`) | Teaching Dashboard (home) | ENARA pages |
| `my-progress` | My progress (`progress`) | Teaching Dashboard (home) | ENARA pages |
| `my-assignments` | Assignments (`assignments-student`) | Teaching Dashboard (home) | ENARA pages |
| `study-plan` | Study plan | Teaching Dashboard (home) | ENARA pages |
| `results` | Results | Teaching Dashboard (home) | ENARA pages |
| `teaching` | Home (dashboard) | Teaching Dashboard for the course's class | ENARA pages, **Teachers only** |
| `class-assignments` | Home (dashboard) | Class assignments for the course's class | ENARA pages, **Teachers only** |
| `grading` | Home (dashboard) | Grading | ENARA pages, **Teachers only** |
| `class-insights` | Home (dashboard) | Class insights (the course's class selected) | ENARA pages, **Teachers only** |
| `lesson-planner` | Home (dashboard) | Lesson planner | ENARA pages, **Teachers only** |
| `assessment-builder` | Home (dashboard) | Assessment builder | ENARA pages, **Teachers only** |
| `curriculum` | Home (dashboard) | Curriculum | ENARA pages, **Teachers only** |

Rules:
- **By role, always.** The launch resolves the key for the role the session opens (`resolvePageTarget`), so a student only ever gets student pages and staff only staff pages. No school-admin page is on the list (admins sign in to ENARA directly, D10), and the app's own guard (`staffPageAllowed`) still keeps a teacher off school-admin pages.
- **Unknown or forbidden key → that role's home.** A student who opens a teacher-only link lands on their own home; a teacher who opens a student page lands on the Teaching Dashboard. The key is case-insensitive. The launch audit (`lti.launch`) records `pageTarget`, `page` and, on a fallback, `pageFallback: unknown | forbidden`.
- **Student preview** (a teacher using Moodle's "Switch role to Student"): resolved as a student.
- **Enara Kids:** students in the kids interface get the kids equivalent (`frontend/services/roleRouting.ts › kidsTabForLmsPage`: home, learning, progress, assignments, plan, results), otherwise kids home.
- **Exclusive with work.** `enara_target` together with `enara_assessment` or `enara_assignment` refuses the launch: `invalid_activity_binding`, audit reason `target_and_work`. Nothing is created.
- **Never graded.** A page link binds no ENARA work, so no grade can come from it; the grade outbox also refuses a link with `enara_target` explicitly (`enqueueForLink` → `page_target`), even if the activity was bound to work before it was changed into a page link. The launch opens the page, never that older work.
- **How it lands.** The launch token carries the resolved app page (`lms_launch_tokens.targetPage`); `POST /api/lms/launch/exchange` returns `launch.target = {kind: 'page', page}` and `launch.classId` (the course's class). The app opens the page with that class selected (`TeachingDashboard`, `ClassInsights` and `ClassAssignments` take the class). For students, the launch already makes the course's class their current class (P0 item 5). "Open in new tab" lands on the same page.

## 2. The course link: "ENARA home (course link)"

One role-routed ENARA link for everyone in the course (D12). It is the picker type `course_link` with one item, custom `{enara_target: 'home'}`, **no grade column** (no `lineItem`). A student lands on their dashboard (in the course's class); a teacher lands on the Teaching Dashboard for the course's class.

Moodle may still create a grade column for it (see "Found during the test" above). The owner will test the tool setting "Accept grades from the tool: Delegate to teacher" separately; no Moodle setting was changed here.

**Course navigation:** whether Moodle can show ENARA in the course menu is still to be checked on MoodleCloud; until then the course link is the way.

## 3. Page links in the picker: "ENARA pages"

`core/pickerPages.ts` registers two plug-in types with `registerPickerType` (no change to the picker screen's flow, its API or the signed response):
- `course_link` — "ENARA home (course link)" / "الصفحة الرئيسية لإنارة (رابط المقرر)";
- `enara_page` — "ENARA pages" / "صفحات إنارة", one item per page key above except `home`.

Each item: `graded: false` (no `lineItem`), `needsMedia: false`, `kind: 'page'`, custom `{enara_target: '<key>'}`, and an Arabic title and description (`PickerItem.ar`; an Arabic picker shows them and sends them to the LMS as the activity's title and text). Teacher-only pages carry **`teacherOnly: true`** (new optional field on `PickerItem`). The picker shows a **"Teachers only" / "للمعلمين فقط"** badge on them, and, when any is listed, this note (EN and AR):

> Hide teacher-only links from students in Moodle (or make them 'Available but not shown on course page'). Students who open one land on their own home.

"Already added in this course" also covers page links (earlier picks, and activities launched with `enara_target`).

## 4. The optional due date (owner decision D13)

- **Picker.** For assessments and assignments only (`PickerItemType.dueDate: true`), each picked item shows an optional **Due** date-and-time field. `GET /api/lms/picker/session` returns the school's **time zone** (`timeZone`) and, per type, `dueDate`. The picker sends the local date-time (`YYYY-MM-DDTHH:mm`) as `items[].due`.
- **School time zone.** Institutions had no time zone field. Phase 2b adds an optional **`timeZone`** setting on the institution (IANA name; `models/Institution.ts`), read by `services/institutionTimeZone.ts › institutionTimeZone()`. Unset (or invalid) means the default **`Africa/Cairo`** for now, so Test School A is on Cairo time without any data change. The picker session stores the zone when it opens (`lms_deep_link_sessions.timeZone`).
- **Server checks** (`core/dueDate.ts › checkPickerDue`): the local time is converted to UTC in the school's zone (daylight saving included); it must be **in the future** and **at most 2 years ahead**. Refusals are `400 {error: 'due_in_past' | 'due_too_far' | 'due_invalid' | 'due_not_supported', type, id}`; the picker shows the message next to the item and the session stays usable.
- **What is sent.** The content item gets custom `enara_due=<ISO UTC>` and one line appended to its description (`text`), in the **picker's language** and the **school's time zone**, with Western digits:
  - EN: `Due: 25 Nov 2026, 11:59 PM (Cairo time)`
  - AR: `موعد التسليم: 25 نوفمبر 2026، 11:59 م (توقيت القاهرة)`
- **Applied once.** At the activity's first binding, `binding.ts › materialize()` uses `enara_due` as the ENARA assignment's due date instead of the one-year default (and sets the assignment's time zone to the school's). It is never applied again: once the link is bound, later launches change nothing, so a later edit of the date in ENARA wins. The `activity.bound` audit records `dueFrom: picker | source | default | picker_passed`.
- **Edge cases.** A picked date that has already passed by the first launch is not used (the default applies; `dueFrom: picker_passed`). A malformed `enara_due` (typed by hand) is ignored, not a launch error. A picked assignment that is already in the course's own class is used as it is: its own due date stays.
- **The Moodle text is not updated later.** The "Due: ..." line is written once, when Moodle creates the activity. Changing the date later in ENARA does not change Moodle's description.

## Tests

`test/lms/phase2b.test.ts` (19 tests) against the mock LMS:
- every page key for student, teacher and admin (allowed, forbidden, unknown), case-insensitive keys, no school-admin pages;
- the app side: `lmsLandingPage` keeps the resolved page per role; Kids mapping (`kidsTabForLmsPage`);
- launches: a student on student pages and on teacher-only/unknown links (own home, audited), a teacher on teacher pages with the course's class, a student preview of a teacher-only link;
- `enara_target` with `enara_assessment` / `enara_assignment` refused (`invalid_activity_binding`, `target_and_work`), nothing created;
- no grade for page links (nothing bound; outbox `page_target`, also for a link that was bound before);
- the course link for a student and a teacher (same link, the course's class, enrolment and instructor);
- the picker: the two new types (labels EN/AR, `dueDate`), items (`teacherOnly` on teacher pages only, ungraded, Arabic titles, no custom parameters leaked), content items (`enara_target`, no `lineItem`, no window), Arabic titles, unknown keys refused, "already added" for the course link, the school time zone (default Cairo; school B on `Asia/Riyadh`);
- the due date: helpers (Cairo winter and summer time, Riyadh), a valid date (`enara_due` in UTC and the English line in `text` after the description), the Arabic line, past / too far / malformed / unsupported refused, the first binding stores the UTC date on the materialized assignment (assessment and other-class assignment), applied once (an ENARA edit wins; later launches with another `enara_due` change nothing), missing → one-year default, already passed → default.

`test/lms/phase2.test.ts` now lists the two new types in the session and filters the work items by type.

## Still to do on MoodleCloud (owner)

- Add the course link and one page link with the picker; open them as teacher.test and student.test (a teacher-only link as the student: own home).
- Hide a teacher-only link from students (or "Available but not shown on course page").
- Add an activity with a due date; check the "Due: ..." line in its description and the date on the ENARA assignment.
- Check whether Moodle still makes a grade column for the course link and page links, with "Accept grades from the tool: Delegate to teacher".
- Check whether the course navigation menu can show ENARA.
