# LMS Phase 8: tutor, live avatar and diagnostic activities (no grade)

Switch: `LMS_NO_GRADE_ACTIVITIES_ENABLED`, default off. It needs `LMS_LTI_ENABLED` (and `LMS_DEEP_LINKING_ENABLED` for the picker). It is on for lms-test only (`deploy/lms-test.flags.json`). test.enara.app is not touched.

Phase 8 is "(b) items through B1 and B2" of the inventory: three ENARA activities that a teacher adds with the picker and students open from Moodle, with **no grade**.

| Activity | Picker type | Custom parameter | Student page | Teacher page | Microphone |
|---|---|---|---|---|---|
| AI tutor session | `tutor_session` "AI tutor sessions" / "جلسات المعلم الذكي" | `enara_target=tutor-session` | `activity-tutor` | overview | yes (optional voice input) |
| Live avatar session | `live_avatar` "Live avatar sessions" / "جلسات المعلم المرئي" | `enara_target=live-avatar` | `activity-avatar` | overview | yes |
| Diagnostic check | `diagnostic` "Diagnostic checks" / "الاختبارات التشخيصية" | `enara_target=diagnostic` | `activity-diagnostic` | overview | no (multiple choice) |

## The picker (B2)

`core/pickerActivities.ts` registers the three types with `registerPickerType` (no change to the picker's flow, API or signed response). Each lists one item:
- `graded: false`: **no `lineItem`** in the content item, so ENARA asks for no grade column;
- custom parameters: **only** `enara_target=<key>` (no token, code, user or class id);
- `needsMedia` for the tutor and the avatar: the "Microphone: new window or tab" badge and a `window` request (Moodle 4.3+ ignores it; ENARA's own "Open in a new tab" covers it);
- Arabic title and description (an Arabic picker sends them to Moodle);
- `activity: 'tutor' | 'avatar' | 'diagnostic'`: the picker shows this note when such an item is listed (EN/AR): *AI tutor, live avatar and diagnostic activities send no grade. With "Accept grades from the tool: Always", Moodle still adds a grade column for each of them; it stays empty, because ENARA never sends a grade to it.*

A type can now be behind a flag (`PickerItemType.enabled`): `pickerTypes()` and `pickerType()` leave it out while the flag is off, so it is neither listed nor accepted on submit. The three keys are not offered under "ENARA pages", and `enara_page` refuses them on submit. "Already added in this course" works as for page links. The `lti.deep_link` response audit counts `noGradeActivities` (and `pages` no longer counts them).

## Grade column (Moodle's "Accept grades from the tool")

ENARA sends no line item and the grade outbox refuses every `enara_target` link (`page_target`), so ENARA **never** sends a grade for these activities. What Moodle does depends on the tool setting:
- **Always** (the documented setting, owner decision 18 Nov 2026, unchanged): Moodle creates its own grade column (max 100) for every activity, these included. It stays **empty**. Teachers can set the activity's Grade › Type to None (`TEACHER_GUIDE.md`).
- **Delegate to teacher**: Moodle creates **no** grade column for these, and graded ENARA items still get theirs (they carry a line item). This is checked by the E2E suite, which then puts the tool back to Always. Switching the documented setting is an open owner decision.

## The launch (B1)

`core/pageTargets.ts` has a second allowlist, `ACTIVITY_TARGETS`: `tutor-session`, `live-avatar`, `diagnostic`. Each opens one app page for every role (`activity-tutor`, `activity-avatar`, `activity-diagnostic`); the student portal shows the activity, the staff portal its overview. While the flag is off, the key lands on the role's home (`fallback: 'disabled'`). Everything else is Phase 2b: resolved per role (a teacher's "Switch role to Student" preview gets the student page), never bound to work, never graded, exclusive with `enara_assessment` / `enara_assignment`. The `lti.launch` audit adds `activity`. Enara Kids students land on kids home (no kids version).

**"Open in a new tab":** `POST /api/lms/launch/handoff` with the LMS activity (`resourceLinkId`) and no page now reopens a page-target link's own page (resolved for the session's role), so the mic notice's new tab lands on the same activity. An explicit `page` still wins. A page-target link never reopens work it was bound to before.

## Readiness and the teacher's overview

`GET /api/lms/activities/:kind?classId=` (`admin/activityRoutes.ts`, `core/activities.ts`). Signed-in student, teacher or school admin; 404 unless the flag is on; never calls an AI provider; no 500 for a missing provider.

```
{ kind, ready, code, graded: false, needsMicrophone, classId, overview }
```

| Code | When |
|---|---|
| `activity_provider_not_configured` | tutor: no `ANTHROPIC_API_KEY` (and no orchestrator with a default course); avatar: no Anam configuration or no `ANTHROPIC_API_KEY` |
| `activity_ai_paused` | `AI_PAUSED` (default on for staging), the global AI control, or the school's AI budget pause |
| `activity_feature_off` | diagnostic: the school's `learning_intelligence_enabled` or `diagnostics_enabled` is off |
| `activity_no_class` | diagnostic: the launch's class is not one of the student's |
| `activity_no_objectives` | diagnostic: the class has no curriculum with an approved learning objective (an LMS-made class has no curriculum) |

Staff with a `classId` they may see (`loadClassForStaff`: a teacher only their own classes, a school admin their school's; another school's class is 404) also get `overview`: students in the class, and over the last 7 days the students who started, the tutor chats / live calls / diagnostics started, and finished diagnostics. Counts only, no names. Every call writes `lti.activity` (outcome `ok`, or `warn` with the code; refIds `activity`, `role`, `enaraClassId`, `ready`), so the Problems view lists them with their EN/AR help (`problemHelp.ts`).

## The pages (frontend)

`frontend/pages/LmsActivity.tsx`:
- **Student** (`LmsActivityStudent`): title (EN + AR), "No grade · بدون درجة", what it is, then either a **Start** button (tutor: ENARA's normal AI tutor chat panel; avatar: the live avatar call, `LiveAvatarModal` for the course's class; diagnostic: the existing `Diagnostic` screen for the course's class) or, when not ready, an alert in English and Arabic with the reference code. Tutor and avatar have the mic step: **Test microphone**, the Priority 0 `useMicGate` (with the on-load "blocked in the frame" check, telemetry), `MicProblemNotice` with **Open in a new tab** (60-second handoff code) and the Safari hint; the new tab lands on the same page. The mic check works even when the provider is not set up.
- **Teacher** (`LmsActivityOverview`): the same status in teacher words, "This activity sends no grade to your LMS ... ENARA never fills it", the class counts, and a hint to use Moodle's "Switch role to Student" to see the student page.

`LiveAvatarModal` takes `newTabPage` (where its own mic notice's new tab lands).

## Real sessions on lms-test

Today lms-test has no AI tutor or avatar provider, so the tutor and avatar activities show the "not set up" message. Variables (names only) for real sessions:
- AI tutor: `ANTHROPIC_API_KEY`, and `AI_PAUSED=false` (staging defaults to paused).
- Live avatar: the above plus `ANAM_API_KEY`, `ANAM_AVATAR_ID`, `ANAM_VOICE_ID_EN`, `ANAM_VOICE_ID_AR` (optional `ANAM_VOICE_ID_EN_FEMALE`, `ANAM_VOICE_ID_AR_FEMALE`; optional ENARA voice: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID_EN`, `ELEVENLABS_VOICE_ID_AR`).
- Optional spend guard: `AI_TEST_SPEND_CAP_USD` with `AI_TEST_SPEND_ID` (live avatar time is exempt from it), `ANAM_SESSION_RESERVE_USD`, `ANAM_MAX_SESSION_SECONDS`.
- Diagnostic: no variable; the school's `learning_intelligence_enabled` and `diagnostics_enabled` features, and the class linked to a curriculum with approved objectives.

## Tests

- `backend/test/lms/phase8.test.ts` (18 tests, mock LMS): the activity keys per role, flag off (`disabled`), the app pages (and Kids home); the picker types, items (no grade, mic, no custom leak, not under ENARA pages), signed content items (only `enara_target`, no `lineItem`, window for the mic items, audit), Arabic titles, "already added", flag off (not listed, refused); launches for student, teacher and preview (audit `activity`, nothing bound, outbox `page_target`), flag off; readiness for each state (not configured, tutor model only, Anam, AI paused by switch and by the school, diagnostics off, no objectives, another school's objective not counted, no class); the overview counts (7-day window, class only, no names) with another class and another school refused; the new tab landing on the activity (and an explicit page winning); problem help for every code.
- E2E `e2e/tests/09-phase8-activities.spec.ts` (Docker Moodle 4.5, `LMS_NO_GRADE_ACTIVITIES_ENABLED` on, no AI provider, AI paused): the teacher adds all three in one picker submit (No grade column, mic badges, custom parameters exactly `enara_target=...`, Moodle's own column under Always); with Delegate to teacher the three get no grade item and a graded quiz still gets its column (then back to Always); the student opens each one (right page, No grade, EN/AR message with the code, no Start, mic check works for tutor and avatar, no grade in Moodle afterwards); the teacher opens the tutor (overview with counts); mic blocked in the frame on the avatar → Open in a new tab → a signed-in top-level tab on the same activity. The CLI helper has `tool-acceptgrades`.

## Open decisions (owner)

1. Switch the documented tool setting from Always to **Delegate to teacher** (no empty column for no-grade items; graded items unchanged)? Not changed here.
2. The diagnostic needs no microphone, so it has no mic badge and opens in the frame.
3. The diagnostic needs the LMS class linked to a curriculum with approved objectives; LMS-made classes have none (same gap as lessons).
4. No topic or objective presets for the tutor item in Phase 8.
5. Enara Kids students get kids home for these three.
