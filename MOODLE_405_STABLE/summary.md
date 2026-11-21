## ENARA LMS e2e — MOODLE_405_STABLE (Moodle 4.5.16+ (Build: 20261117))

**77 passed, 0 failed, 0 skipped, 0 not run** (of 77)

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
| 7 · microphone checks (Safari / WebKit) | ✅ passed | 1/1 |

<details><summary>Tests</summary>

| Test | Browser | Result | Seconds |
|---|---|---|---|
| ENARA: migrate, fake seed, test content | chromium | ✅ | 0.7 |
| School A: registration link (ENARA admin) → Moodle "Add LTI Advantage" → registered | chromium | ✅ | 3.6 |
| School A: LMS emails for the new connection captured once (English, [lms-test], test inbox; never sent) | chromium | ✅ | 0.0 |
| School A: the 4 manual Moodle settings, by script (Activate, chooser, Accept grades = Always, category) | chromium | ✅ | 0.8 |
| teacher adds a plain ENARA activity and launches it (Teaching Dashboard, no ENARA sign-in) | chromium | ✅ | 4.5 |
| student launches the same activity (student portal) | chromium | ✅ | 2.3 |
| teacher "Switch role to… Student" → read-only student preview | chromium | ✅ | 3.2 |
| teacher picks quiz + practice + course link in one go | chromium | ✅ | 7.1 |
| course link: student lands on their ENARA home, teacher on the Teaching Dashboard | chromium | ✅ | 3.8 |
| the picked quiz opens on its assignment for the student | chromium | ✅ | 2.0 |
| teacher picks the "Grading" page and the quiz again with a due date | chromium | ✅ | 5.5 |
| student opens the teacher-only link → lands on their own home | chromium | ✅ | 2.0 |
| teacher opens the same link → the Grading page | chromium | ✅ | 1.9 |
| student opens the dated quiz: the ENARA assignment has the picked due date | chromium | ✅ | 1.9 |
| quiz: 3/4 → Moodle shows 75 | chromium | ✅ | 4.8 |
| quiz: then 1/4 → Moodle shows 25 (latest) | chromium | ✅ | 4.7 |
| practice: 3/4 → 75, then 1/4 → still 75 (best) | chromium | ✅ | 22.6 |
| teacher sees the grades in Moodle's grader report | chromium | ✅ | 1.7 |
| a manual ENARA enrollment in the course class (school admin) | chromium | ✅ | 0.0 |
| student2 enrolled in Moodle → teacher "Sync roster now" → "Not started" in ENARA | chromium | ✅ | 2.7 |
| student2 unenrolled in Moodle → sync → inactive; the manual enrollment is untouched | chromium | ✅ | 32.3 |
| a grade changed in the Moodle gradebook → "Changed in LMS" in ENARA's Grade history | chromium | ✅ | 2.7 |
| School B: registration link → Moodle "Register as a new external tool" → second tool | chromium | ✅ | 7.4 |
| teacher.test adds the School B course link in "Enara School B Course" | chromium | ✅ | 6.0 |
| same Moodle teacher and student → separate School B accounts that see nothing of School A | chromium | ✅ | 9.3 |
| School A still works after School B joined (teacher and student) | chromium | ✅ | 3.6 |
| teacher adds the speaking exam through the picker (mic badge) | chromium | ✅ | 4.8 |
| mic OK in the Moodle frame (fake device, permission granted) | chromium | ✅ | 6.9 |
| mic blocked (permission denied) → "Open in a new tab" → a signed-in ENARA tab | chromium | ✅ | 18.3 |
| ENARA admin: "New school" → invite with the one Moodle link (EN/AR), no email sent | chromium | ✅ | 2.8 |
| Moodle admin: the one link in "Add LTI Advantage" → registered, connection checked automatically | chromium | ✅ | 7.7 |
| status page: connection check, the 4 hand-ticked Moodle settings | chromium | ✅ | 3.0 |
| first teacher and student launch → goal reached on the status page, under 15 minutes | chromium | ✅ | 11.6 |
| teacher adds all three through the picker (No grade column, mic on tutor and avatar); Moodle's "Always" column stays empty | chromium | ✅ | 7.3 |
| with "Delegate to teacher" the three get no grade column at all, and a graded quiz still gets its own | chromium | ✅ | 8.2 |
| student opens each one: the right ENARA page, "No grade", and a clear EN/AR message instead of a session (no AI provider here) | chromium | ✅ | 7.1 |
| teacher opens the tutor activity: the class overview (no grade, not set up here, the class's counts) | chromium | ✅ | 2.0 |
| mic blocked in the frame (live avatar) → "Open in a new tab" → a signed-in ENARA tab on the same activity | chromium | ✅ | 4.4 |
| setup: both schools Free; a code for a School A child and one for a School B child | chromium | ✅ | 0.1 |
| code-first: the parent types the school code and gets straight in (no account, no password) | chromium | ✅ | 2.6 |
| the device remembers the parent: reload, an expired session token, and no session token at all | chromium | ✅ | 2.8 |
| "Add another child": a School B code links the second child to the same account | chromium | ✅ | 1.5 |
| account: "Provided by" each school, no price; the code-only note | chromium | ✅ | 0.2 |
| desktop: the portal uses the wide layout (side navigation), the phone layout stays for phones | chromium | ✅ | 0.2 |
| a second device without this device's token gets the code page, not the portal | chromium | ✅ | 0.6 |
| ENARA admin switches School B's parent access Off: only that child disappears; Free brings it back | chromium | ✅ | 3.7 |
| School A's admin: the Parents card (parents linked, active parents, most-used screens), access read-only | chromium | ✅ | 3.0 |
| School A's admin: code expiry setting, then a printed class code sheet (shown once, no code in a URL) | chromium | ✅ | 2.9 |
| teachers: no code tools until the school allows them, then their own classes only | chromium | ✅ | 0.1 |
| device 1: a code from the sheet, then "Add your email" with a 6-digit code | chromium | ✅ | 4.5 |
| device 2 (second device): sign in with the email and a 6-digit code: the same child | chromium | ✅ | 2.7 |
| device 3: a School B code makes a second account; adding the same email offers the merge; every device then shows both children | chromium | ✅ | 62.6 |
| the code emails were captured (test inbox redirect, never sent); no code in any URL | chromium | ✅ | 0.0 |
| School A's admin: "Show results to parents" is "After the teacher releases them" by default | chromium | ✅ | 2.6 |
| the Moodle student submits a manual-release quiz on the Moodle-made class: graded, held for the teacher | chromium | ✅ | 3.4 |
| the parent sees "Waiting for the teacher" and no score | chromium | ✅ | 1.5 |
| after the release the parent sees the score, labelled with the Moodle course's class | chromium | ✅ | 1.1 |
| School A's admin: the parent email switches (new results is off by default); turn new results on | chromium | ✅ | 2.7 |
| a code-only parent (no address) gets nothing; with an email, linking a second child sends parent-link-confirmed | chromium | ✅ | 2.0 |
| "Send code by email": parent-invite, captured through the test inbox redirect | chromium | ✅ | 0.0 |
| parent-new-results when a result is released, at most one per child per day | chromium | ✅ | 0.2 |
| the weekly step: ONE parent-weekly-summary for this parent of two children in two schools | chromium | ✅ | 0.1 |
| "Share this week -> Email" is no longer blocked: the summary goes out through the safety path | chromium | ✅ | 1.6 |
| parent-link-ended when the school unlinks; nothing when the parent unlinks themself | chromium | ✅ | 0.1 |
| School A's admin turns CSV invites on, checks a CSV (preview) and sends: ONE email for the parent of two children | chromium | ✅ | 3.7 |
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
| student in Safari: launch works in the frame and the "open in a new tab" hint is shown | webkit | ✅ | 2.7 |

</details>

**Timings (seconds)**

- stack up + Moodle install: 76
- Moodle install: 73
- registration school a ui: 3.5
- registration to first launch: 8.7
- grade submit to moodle first: 0.2
- grade submit to moodle second: 0.2
- registration school b ui: 7.4
- school b registration to first launch: 16.9
- onboarding create to registered: 8.1
- onboarding registration to first launch: 18.4
- onboarding total invite to goal: 18.7
