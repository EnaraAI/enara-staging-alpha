## ENARA LMS e2e — MOODLE_405_STABLE (Moodle 4.5.16+ (Build: 20261124))

**145 passed, 0 failed, 0 skipped, 0 not run** (of 145)

| Scenario | Result | Tests |
|---|---|---|
| 1 · registration (School A) + launches + student preview | ✅ passed | 7/7 |
| 2 · picker: multi-select, practice graded, course link without grade | ✅ passed | 3/3 |
| 3 · page links (teacher-only) + due date in the description | ✅ passed | 4/4 |
| 4 · grades in the Moodle gradebook: quiz latest, practice best | ✅ passed | 4/4 |
| 5 · roster sync + grade changed in the LMS | ✅ passed | 4/4 |
| 6 · School B on the same Moodle + isolation | ✅ passed | 4/4 |
| 7 · microphone checks (Chrome) | ✅ passed | 3/3 |
| 8 · step 2 onboarding (timed) | ✅ passed | 4/4 |
| 9 · Phase 8: tutor, live avatar and diagnostic activities (no grade) | ✅ passed | 5/5 |
| 10 · Parents P1: code-first entry, two children in two schools, school access, usage | ✅ passed | 9/9 |
| 11 · Parents P2: class code sheet, add your email, second device, merge | ✅ passed | 6/6 |
| 12 · Parents P3: results reach parents only after release | ✅ passed | 4/4 |
| 13 · Parents P4: parent emails through the safety path (captured) | ✅ passed | 7/7 |
| 14 · Parents P5: CSV invitations, one email per parent | ✅ passed | 1/1 |
| 15-errors-to-work-on.spec.ts | ✅ passed | 5/5 |
| 16-moodle-quiz-errors.spec.ts | ✅ passed | 4/4 |
| 17-kids-audio-visual.spec.ts | ✅ passed | 1/1 |
| 18-kids-speaking.spec.ts | ✅ passed | 1/1 |
| 19-tutor-markdown.spec.ts | ✅ passed | 1/1 |
| 20 · Parents: every subject the child studies | ✅ passed | 2/2 |
| 21 · assessment engine: every closed type, English and Arabic, graded by code, to the Moodle gradebook | ✅ passed | 4/4 |
| 22 · assessment engine: a flagged essay goes to the teacher, then the learner sees the final grade | ✅ passed | 3/3 |
| 23 · assessment engine: science and humanities by checklist, humanities against the source | ✅ passed | 2/2 |
| 24 · assessment engine: listening, transcript hidden, closed item by code, written answer by the teacher | ✅ passed | 2/2 |
| 25-item-bank.spec.ts | ✅ passed | 1/1 |
| 26-engine-code.spec.ts | ✅ passed | 1/1 |
| 27 · Parents school app (a1): timetable, attendance, announcements, notifications | ✅ passed | 6/6 |
| 28 · Parents school app (a2): parent screens | ✅ passed | 1/1 |
| 29 · Parents school app (a3): school admin screens | ✅ passed | 1/1 |
| 30 · Parents school app (a4): school notice emails (captured) | ✅ passed | 4/4 |
| 31 · Parents school app (b1): fees, display only | ✅ passed | 5/5 |
| 32 · Parents school app (b2): fee screens | ✅ passed | 1/1 |
| 33 · Parents school app (b3): fee receipts | ✅ passed | 1/1 |
| 34 · Parents school app (c1): buses | ✅ passed | 3/3 |
| 35 · Parents school app (c2): bus screens | ✅ passed | 1/1 |
| 36 · Parents school app (d1): requests and consent | ✅ passed | 3/3 |
| 37 · Parents school app (d2): request and consent screens | ✅ passed | 1/1 |
| 38 · Parents school app (e1): the assistant and its safety tests | ✅ passed | 7/7 |
| 39 · Parents school app (e2): the assistant on a phone | ✅ passed | 1/1 |
| 40 · Parents school app: Moodle connector | ✅ passed | 2/2 |
| 41 · Parents school app: saved column mappings | ✅ passed | 2/2 |
| 42 · Live bus map: supervisor phone, school tab, parent map | ✅ passed | 1/1 |
| 43 · Door to door: home pickup point, school confirms, supervisor taps Picked up | ✅ passed | 1/1 |
| 44 · Family account: 3 children, 5 subjects each | ✅ passed | 1/1 |
| 45 · Platform status (design app) | ✅ passed | 1/1 |
| 46 · Live tutor: microphone and tutor voice off/on (liveMute) | ✅ passed | 1/1 |
| 47 · Live tutor: captions (liveCaptions) | ✅ passed | 1/1 |
| 48 · Live tutor: expressive avatar (liveExpressive) | ✅ passed | 1/1 |
| 48 · Live tutor: time used today and calls left (liveTimeUsed) | ✅ passed | 4/4 |
| 49 · Live tutor: role-play scene card (liveRolePlay) | ✅ passed | 2/2 |
| 7 · microphone checks (Safari / WebKit) | ✅ passed | 1/1 |

<details><summary>Tests</summary>

| Test | Browser | Result | Seconds |
|---|---|---|---|
| ENARA: migrate, fake seed, test content | chromium | ✅ | 1.2 |
| School A: registration link (ENARA admin) → Moodle "Add LTI Advantage" → registered | chromium | ✅ | 8.4 |
| School A: LMS emails for the new connection captured once (English, [lms-test], test inbox; never sent) | chromium | ✅ | 0.0 |
| School A: the 4 manual Moodle settings, by script (Activate, chooser, Accept grades = Always, category) | chromium | ✅ | 1.1 |
| teacher adds a plain ENARA activity and launches it (Teaching Dashboard, no ENARA sign-in) | chromium | ✅ | 5.2 |
| student launches the same activity (student portal) | chromium | ✅ | 2.5 |
| teacher "Switch role to… Student" → read-only student preview | chromium | ✅ | 3.1 |
| teacher picks quiz + practice + course link in one go | chromium | ✅ | 7.0 |
| course link: student lands on their ENARA home, teacher on the Teaching Dashboard | chromium | ✅ | 3.9 |
| the picked quiz opens on its assignment for the student | chromium | ✅ | 2.0 |
| teacher picks the "Grading" page and the quiz again with a due date | chromium | ✅ | 6.1 |
| student opens the teacher-only link → lands on their own home | chromium | ✅ | 1.9 |
| teacher opens the same link → the Grading page | chromium | ✅ | 1.9 |
| student opens the dated quiz: the ENARA assignment has the picked due date | chromium | ✅ | 2.0 |
| quiz: 3/4 → Moodle shows 75 | chromium | ✅ | 5.0 |
| quiz: then 1/4 → Moodle shows 25 (latest) | chromium | ✅ | 5.0 |
| practice: 3/4 → 75, then 1/4 → still 75 (best) | chromium | ✅ | 22.9 |
| teacher sees the grades in Moodle's grader report | chromium | ✅ | 2.1 |
| a manual ENARA enrollment in the course class (school admin) | chromium | ✅ | 0.0 |
| student2 enrolled in Moodle → teacher "Sync roster now" → "Not started" in ENARA | chromium | ✅ | 2.7 |
| student2 unenrolled in Moodle → sync → inactive; the manual enrollment is untouched | chromium | ✅ | 32.3 |
| a grade changed in the Moodle gradebook → "Changed in LMS" in ENARA's Grade history | chromium | ✅ | 2.7 |
| School B: registration link → Moodle "Register as a new external tool" → second tool | chromium | ✅ | 3.3 |
| teacher.test adds the School B course link in "Enara School B Course" | chromium | ✅ | 6.5 |
| same Moodle teacher and student → separate School B accounts that see nothing of School A | chromium | ✅ | 7.8 |
| School A still works after School B joined (teacher and student) | chromium | ✅ | 3.5 |
| teacher adds the speaking exam through the picker (mic badge) | chromium | ✅ | 6.3 |
| mic OK in the Moodle frame (fake device, permission granted) | chromium | ✅ | 7.4 |
| mic blocked (permission denied) → "Open in a new tab" → a signed-in ENARA tab | chromium | ✅ | 8.2 |
| ENARA admin: "New school" → invite with the one Moodle link (EN/AR), no email sent | chromium | ✅ | 2.3 |
| Moodle admin: the one link in "Add LTI Advantage" → registered, connection checked automatically | chromium | ✅ | 3.8 |
| status page: connection check, the 4 hand-ticked Moodle settings | chromium | ✅ | 3.1 |
| first teacher and student launch → goal reached on the status page, under 15 minutes | chromium | ✅ | 12.4 |
| teacher adds all three through the picker (No grade column, mic on tutor and avatar); Moodle's "Always" column stays empty | chromium | ✅ | 9.5 |
| with "Delegate to teacher" the three get no grade column at all, and a graded quiz still gets its own | chromium | ✅ | 9.6 |
| student opens each one: the right ENARA page, "No grade", and a clear EN/AR message instead of a session (no AI provider here) | chromium | ✅ | 8.3 |
| teacher opens the tutor activity: the class overview (no grade, not set up here, the class's counts) | chromium | ✅ | 2.1 |
| mic blocked in the frame (live avatar) → "Open in a new tab" → a signed-in ENARA tab on the same activity | chromium | ✅ | 4.7 |
| setup: both schools Free; a code for a School A child and one for a School B child | chromium | ✅ | 0.2 |
| code-first: the parent types the school code and gets straight in (no account, no password) | chromium | ✅ | 2.9 |
| the device remembers the parent: reload, an expired session token, and no session token at all | chromium | ✅ | 1.6 |
| "Add another child": a School B code links the second child to the same account | chromium | ✅ | 1.6 |
| account: "Provided by" each school, no price; the code-only note | chromium | ✅ | 0.2 |
| desktop: the portal uses the wide layout (side navigation), the phone layout stays for phones | chromium | ✅ | 0.3 |
| a second device without this device's token gets the code page, not the portal | chromium | ✅ | 0.7 |
| ENARA admin switches School B's parent access Off: only that child disappears; Free brings it back | chromium | ✅ | 4.5 |
| School A's admin: the Parents card (parents linked, active parents, most-used screens), access read-only | chromium | ✅ | 2.5 |
| School A's admin: code expiry setting, then a printed class code sheet (shown once, no code in a URL) | chromium | ✅ | 2.8 |
| teachers: no code tools until the school allows them, then their own classes only | chromium | ✅ | 0.1 |
| device 1: a code from the sheet, then "Add your email" with a 6-digit code | chromium | ✅ | 3.3 |
| device 2 (second device): sign in with the email and a 6-digit code: the same child | chromium | ✅ | 2.6 |
| device 3: a School B code makes a second account; adding the same email offers the merge; every device then shows both children | chromium | ✅ | 62.8 |
| the code emails were captured (test inbox redirect, never sent); no code in any URL | chromium | ✅ | 0.0 |
| School A's admin: "Show results to parents" is "After the teacher releases them" by default | chromium | ✅ | 2.1 |
| the Moodle student submits a manual-release quiz on the Moodle-made class: graded, held for the teacher | chromium | ✅ | 3.5 |
| the parent sees "Waiting for the teacher" and no score | chromium | ✅ | 1.5 |
| after the release the parent sees the score, labelled with the Moodle course's class | chromium | ✅ | 1.1 |
| School A's admin: the parent email switches (new results is off by default); turn new results on | chromium | ✅ | 2.9 |
| a code-only parent (no address) gets nothing; with an email, linking a second child sends parent-link-confirmed | chromium | ✅ | 2.2 |
| "Send code by email": parent-invite, captured through the test inbox redirect | chromium | ✅ | 0.0 |
| parent-new-results when a result is released, at most one per child per day | chromium | ✅ | 0.2 |
| the weekly step: ONE parent-weekly-summary for this parent of two children in two schools | chromium | ✅ | 0.1 |
| "Share this week -> Email" is no longer blocked: the summary goes out through the safety path | chromium | ✅ | 1.5 |
| parent-link-ended when the school unlinks; nothing when the parent unlinks themself | chromium | ✅ | 0.1 |
| School A's admin turns CSV invites on, checks a CSV (preview) and sends: ONE email for the parent of two children | chromium | ✅ | 3.9 |
| setup: an English objective, a one-question quiz with a labelled wrong option, two assignments (1 try and 2 tries) | chromium | ✅ | 0.1 |
| during the test: a released wrong answer with an attempt left is recorded but waits (no help during a test) | chromium | ✅ | 0.2 |
| after the test: no attempts left, so the error is ready for the tutor | chromium | ✅ | 0.1 |
| the learner sees their own list (no sources); another school's admin cannot read it | chromium | ✅ | 0.0 |
| a teacher dismisses it: the learner no longer sees it | chromium | ✅ | 0.0 |
| setup: a read-only Moodle web service and token, a 1-question quiz and student.test's wrong, finished attempt | chromium | ✅ | 0.8 |
| the school admin sees the quiz and maps it to an ENARA objective; another school cannot | chromium | ✅ | 0.1 |
| the import turns the wrong answer into an error to work on, ready for the tutor, and runs only once per attempt | chromium | ✅ | 0.2 |
| removing the token stops it: the school's switch goes off | chromium | ✅ | 0.0 |
| picture index and pictures load and draw; read-aloud is available | chromium | ✅ | 0.1 |
| the kids app is told to show the chat microphone and the live call | chromium | ✅ | 0.0 |
| learner chat: a Markdown tutor reply shows formatted, with no raw ** or # and nothing run | chromium | ✅ | 2.7 |
| the student submits work in English, Maths and Science (and one Maths quiz held for the teacher) | chromium | ✅ | 0.4 |
| a parent on a phone sees "All subjects" and the 3 subjects, one card each, and no "Sample data" | chromium | ✅ | 2.0 |
| the admin writes both quizzes; a broken item is refused in plain words | chromium | ✅ | 0.0 |
| the Moodle teacher adds both through the picker | chromium | ✅ | 6.2 |
| English: every type answered right (metres for a centimetres key still counts) → Moodle shows 100 | chromium | ✅ | 4.0 |
| Arabic, in the Arabic screen language, right to left: true/false wrong, number without unit (half) → Moodle shows 80 | chromium | ✅ | 3.0 |
| the student submits a quiz with an essay; it waits for the teacher, flagged, with no score shown | chromium | ✅ | 0.2 |
| the teacher scores the essay by rubric levels (a bad reason code is refused), finalizes and releases | chromium | ✅ | 0.1 |
| the learner now sees the final grade and the teacher's feedback | chromium | ✅ | 0.0 |
| each question gets its own rubric; the learner sees the source but never the points; both answers wait for the teacher | chromium | ✅ | 0.2 |
| the teacher scores both by rubric levels, finalizes and releases; the learner sees 9 of 12 | chromium | ✅ | 0.1 |
| the learner hears the recording but never sees its transcript; the true/false item is graded by code | chromium | ✅ | 0.2 |
| the teacher scores the written answer (spelling not marked: it is listening) and releases: 6 of 6 | chromium | ✅ | 0.1 |
| 25 · item bank: checks, review with reasons, versions, approve, add to an assessment, graded by code | chromium | ✅ | 0.2 |
| 26 · code questions are switched off: refused in plain words | chromium | ✅ | 0.0 |
| the school turns the sections on; a School A child in a class is picked | chromium | ✅ | 0.7 |
| timetable import: preview (Arabic headers, one bad row), confirm, then the parent sees it with its source | chromium | ✅ | 0.0 |
| undo restores the timetable as it was before the import | chromium | ✅ | 0.0 |
| attendance import: the absence shows on the parent screen and as a notification; another child’s row stays hidden | chromium | ✅ | 0.1 |
| announcements: a school-wide one reaches the parent (screen and notification); one for another child does not | chromium | ✅ | 0.1 |
| isolation: another school’s parent and admin get nothing of School A | chromium | ✅ | 0.0 |
| phone: Home card, bell, timetable, attendance, announcements, notifications; Arabic RTL; sections off hide it all | chromium | ✅ | 5.0 |
| sections, Excel template → preview → import → undo, CSV with a bad row, announcement compose and withdraw | chromium | ✅ | 4.3 |
| a parent with a verified email links to a School A child | chromium | ✅ | 0.4 |
| an absence sends one email (captured); importing the same row again sends none | chromium | ✅ | 0.0 |
| attendance emails off: the next absence is in-app only | chromium | ✅ | 0.0 |
| a school-wide announcement sends an email | chromium | ✅ | 0.0 |
| fees on; a fee sheet with Arabic headers is previewed (bad amount rejected) and imported | chromium | ✅ | 1.0 |
| the parent sees totals, overdue, the next instalment and the source | chromium | ✅ | 0.0 |
| the school marks the overdue instalment paid; School B cannot | chromium | ✅ | 0.0 |
| reminder 7 days before the due date, once | chromium | ✅ | 0.0 |
| main guardian only: the second guardian gets 403; another school’s parent gets 403 | chromium | ✅ | 0.1 |
| parent phone view, then the school marks the overdue instalment paid | chromium | ✅ | 5.4 |
| attach, download, refuse bad files, isolation | chromium | ✅ | 0.9 |
| routes and assignments sheets; a wrong stop is rejected | chromium | ✅ | 0.7 |
| the parent sees both trips with the stop times; the phone only once shared | chromium | ✅ | 0.0 |
| a delay notice reaches parents on that trip only; School B cannot send one | chromium | ✅ | 0.1 |
| parent phone view; the school sends a delay notice from its screen | chromium | ✅ | 6.4 |
| setup: sections on; two children in two classes, one parent each | chromium | ✅ | 1.0 |
| a request: new → in progress → done with a reply; the parent is notified | chromium | ✅ | 0.1 |
| a consent form for one class: signed with the text hash; hidden from another class; dashboard and CSV | chromium | ✅ | 0.1 |
| parent signs a form and sends a request; the school answers | chromium | ✅ | 7.2 |
| setup: two children of School A with fees; buses off; chat on | chromium | ✅ | 0.7 |
| fees from the parent's own data, with the source; no number outside the data | chromium | ✅ | 0.1 |
| parent A asks about parent B's child: by id → 403; by name → nothing of that child | chromium | ✅ | 0.0 |
| an injected announcement and an injected request text are never followed | chromium | ✅ | 0.1 |
| a section the school did not share: says so and offers a request | chromium | ✅ | 0.0 |
| a request only after the parent confirms | chromium | ✅ | 0.1 |
| chat off for the school → 404 | chromium | ✅ | 0.0 |
| ask, see the source, confirm a request; Arabic | chromium | ✅ | 4.5 |
| a read-only token is saved and checked; it is never returned | chromium | ✅ | 0.4 |
| a Moodle Announcements post comes in once, for the course's ENARA class | chromium | ✅ | 0.6 |
| API: match once, remembered for the next file, forget | chromium | ✅ | 0.1 |
| admin page: match your columns, preview, import, remembered | chromium | ✅ | 4.1 |
| school sets it up, the supervisor shares a trip, the parent sees the bus live | chromium | ✅ | 8.9 |
| the whole cycle | chromium | ✅ | 9.7 |
| the family is built, the parent signs in and sees every child, subject and chart | chromium | ✅ | 7.1 |
| ENARA admin only; booleans, names and counts, no addresses | chromium | ✅ | 0.0 |
| switch off: no mute buttons; switch on: microphone and voice toggles work, by mouse and keyboard | chromium | ✅ | 35.5 |
| off by default; tutor and learner lines, clean text, Arabic right to left, last lines only, beside the visual aid, phone, remembered | chromium | ✅ | 12.7 |
| cues never show; a drawing opens on the face side with a pulse and "Look at the picture"; switch off as before | chromium | ✅ | 11.7 |
| API: learners only, read only; nothing used yet, 30 calls left, no maximum length | chromium | ✅ | 0.1 |
| course page and call start screen show calls left; none left: the buttons say so | chromium | ✅ | 8.2 |
| in the call: this call, today, calls left; a warning 2 minutes before the maximum length, none without one | chromium | ✅ | 18.9 |
| kids app: the tutor shows calls left next to "Talk live" | chromium | ✅ | 6.5 |
| desktop: setting, character and goal; Arabic right to left; never over the Visual Aid; gone after the scene | chromium | ✅ | 9.0 |
| phone: the card starts collapsed to one line and opens on a tap | chromium | ✅ | 7.9 |
| student in Safari: launch works in the frame and the "open in a new tab" hint is shown | webkit | ✅ | 3.2 |

</details>

**Timings (seconds)**

- stack up + Moodle install: 102
- Moodle install: 97
- registration school a ui: 8.3
- registration to first launch: 14.4
- grade submit to moodle first: 0.2
- grade submit to moodle second: 0.2
- registration school b ui: 3.3
- school b registration to first launch: 13.4
- onboarding create to registered: 4.3
- onboarding registration to first launch: 16.1
- onboarding total invite to goal: 16.8
