# lms-test front end vs design.enara.app: feature parity

Read-only audit, 27 Nov 2026. Sources: `origin/lms-test-live:frontend/**` (App.tsx, services/roleRouting.ts, components/Layout.tsx
sidebars, pages/**, parents/**, bus/**, kids/**, services/apiService.ts) against branch `claude/design-app`
(`/home/user/psa/design-app`: src/App.tsx ROUTES/AREA_ROLES, src/screens/**, src/lms/** + src/kids-lms/**, PLAN_KIDS.md).

What the statuses mean: **Full** means the same feature on the same endpoint. **Partial** means the screen exists but some actions or data are missing (the missing parts are named). **Missing** means design.enara.app has no screen or action for it.
"Gated" marks a feature that lms-test shows only when a server switch or school setting is on.
Where the design app sends roles: student goes to `/student` (or `/kids` when uiMode=kids), parent to `/parent`, teacher to `/teacher`, admin and academic_manager to `/school`,
and enara-admin to `/platform`. `/teacher` also allows admin (by URL only: no nav link), and `/school` also allows academic_manager and enara-admin.

## 1. Shared: sign-in, links, launch

| lms-test screen | feature | design app | status | notes (endpoints) |
|---|---|---|---|---|
| Login | Email + password sign-in | shared/Login | Full | POST /api/auth/login |
| Login | Portal tabs (Student / School staff / ENARA team / Parents) with the wrong-portal check (`uiRoleFor`) | shared/Login (`homeFor`) | Partial | The design app routes by role, with no portal choice. So an enara-admin cannot open the full staff portal, and an academic manager is not given a read-only portal (see §6) |
| Login | Forgot password (email the reset link) | none (the link goes back to `#/login`) | Missing | POST /api/auth/password-reset/request |
| AccountLink | Accept a staff invitation (link from email) | none | Missing | POST /api/workspace/invitations/accept |
| AccountLink | Set a new password from the reset link | none | Missing | POST /api/auth/password-reset/confirm |
| Login (Parents tab) | Parent sign-up with email + password | none | Missing | POST /api/parents/register |
| Login (Parents tab) | Continue with Google (gated: Google client ID set) | none | Missing | GET /api/parents/auth-config, POST /api/parents/google |
| parents/CodeStart | Sign in with a school parent code (preview, then start) | shared/ParentCode | Full | POST /api/parents/start/preview, /api/parents/start |
| parents/EmailSignIn | Parent sign-in with an email code | none | Missing | POST /api/parents/email/sign-in/start, /verify |
| App | Remembered parent device (resume and sign out) | lib/session | Full | POST /api/parents/device/session, /device/sign-out |
| App | Session refresh, expiry and sign-out | lib/session | Full | GET /api/auth/session, POST /api/auth/logout |
| DemoPortal `/demo` + Login demo buttons + DemoBar | One-click partner demo school (start, switch role, heartbeat, end) (gated: demo open) | none | Missing | GET /api/demo/status, POST /api/demo/start, /switch, /heartbeat, /end |
| LmsLaunch `/lms/launch` | LMS (LTI) launch: token exchange, frame bar, preview-as-student banner, "Open in new tab" handoff | none (PLAN_KIDS: "no LMS launch") | Missing | POST /api/lms/launch/exchange, /api/lms/launch/handoff/exchange |
| LmsPicker | Moodle "Select content" activity picker for teachers | none | Missing | POST /api/lms/platforms/:id/moodle-quiz, /api/lms/picker/* |
| App | Shared links `?course=` and `?assessment=` (an assessment that can be taken once) | none | Missing | uses /api/me/courses, /api/me/assessments |
| App | Email deep links `?page=lms-status`, `?page=lms`, `?page=class-assignments&class=` | none | Missing | the target pages are also missing |
| Layout header + ProductTour | Guided tour button and first-run tour (students and staff) | none (the kids app keeps its own tour) | Missing | POST /api/auth/tour/complete |
| Layout header | "Share app" (copies the link) | none | Missing | none (client side only) |

## 2. Student (teens and adults)

| lms-test screen | feature | design app | status | notes (endpoints) |
|---|---|---|---|---|
| Home (StudentDashboard) | Greeting, continue learning, recent activity, upcoming work, streak | student/StudentHome | Full | GET /api/me/dashboard, /api/me/courses |
| Home | Upcoming assignment and latest result | student/StudentHome | Full | GET /api/me/assignments, /:id, /api/me/results |
| Home | Achievements / badges | none | Missing | GET /api/me/achievements |
| Home | Switch the current class (multi-class) | none | Missing | GET /api/multi-class/me/classes, PUT /api/multi-class/me/classes/current |
| Home: NextStepsCard + QuickReview | Proactive next steps and spaced-review questions | none | Missing | GET /api/me/next-steps, GET /api/me/reviews, POST /api/me/reviews/:id/answer |
| Home: MyErrorsToWorkOnCard | Errors to work on | student/StudentResults (section) | Full | GET /api/learning/students/me/errors-to-work-on (moved to Results) |
| My learning (CoursePage) | Course list and course/lesson tree | student/StudentChat (lesson picker) | Partial | GET /api/me/courses, /:id. Lessons can only be picked as tutor context, not opened |
| My learning | Lesson reader: text, uploaded or YouTube video, files, "Ask tutor about this video" | none | Missing | lesson content from GET /api/me/courses/:id |
| My learning | Mark lesson complete | none | Missing | POST /api/me/courses/:id/lessons/:lessonId/complete |
| My learning | Lesson-viewed tracking | none | Missing | POST /api/me/events |
| My learning | Streamed tutor chat about the lesson or course | student/StudentChat | Full | POST /api/me/tutor/sessions, /:id/messages/stream |
| My learning | "Visualize" lesson diagram | student/StudentChat | Full | POST /api/me/tutor/visualize |
| My learning | Chat history list and "clear history" | student/StudentChat (opens one chat by `?session=`) and StudentAvatar (lists past voice calls) | Partial | GET /api/me/tutor/sessions is used only for voice calls. DELETE /api/me/tutor/sessions/:id is missing |
| My learning | Voice input and read-aloud in the chat, mic check and mic telemetry | none | Missing | browser SpeechRecognition, POST /api/lms/telemetry/mic |
| My learning | Live avatar tutor call (face picker, visual aids, reconnects) | student/StudentAvatar opening the copied LiveAvatarModal | Full | /api/avatar/*, GET/PUT /api/me/tutor-face |
| My learning | "Tutor calls" usage chip (time used today) | none (the design shows "not available") | Missing | GET /api/usage/me/today, /api/usage/me/requests/:id |
| My progress (KnowledgeMap) (gated: learning intelligence on) | Knowledge map and per-outcome mastery | none | Missing | GET /api/learning/students/:id/knowledge-map, /mastery/:objectiveId |
| My progress | Recommendations | none | Missing | GET /api/learning/students/:id/recommendations |
| My progress | Practice interventions (create, start, complete, reassess) | none | Missing | POST /api/learning/interventions, /:id/start, /complete, /reassess; GET /api/learning/students/me/interventions |
| My progress: Diagnostic | Diagnostic check (answer, complete, report) | none | Missing | POST /api/learning/diagnostics, /:id/answer, /:id/complete; GET /:id/report |
| My progress: MyTeachingProgress | "What my teacher worked on" impact | none | Missing | GET /api/learning/students/:id/teaching-impact |
| Assignments (StudentAssignments) (gated: teaching workflow on) | List and open an assignment | student/StudentAssignment | Full | GET /api/me/assignments, /:id |
| Assignments | Start, autosave draft, submit (choice, text and engine items) | student/StudentAssignment | Full | POST …/attempts, PUT …/draft, POST …/submit |
| Assignments | Speaking and conversation exams | none (the design says "not available in this app yet") | Missing | POST …/speaking/begin, …/speaking/turn, …/conversation |
| Assignments | Ask the teacher to review a result (appeal) | student/StudentResults (shows appeal status only) | Partial | POST …/attempts/:attemptId/appeals is missing |
| Assignments | Help from the tutor (handoff) | StudentAssignment, StudentResults | Full | POST /api/me/tutor/handoff |
| Assignments | Assignment UI language toggle saved to the account | none (the design toggle is per device) | Missing | PUT /api/me/ui-language |
| Study plan (gated: study plans on) | Study plan items (mark done or skip, practise with the tutor) | none | Missing | GET /api/me/study-plan, PATCH /api/me/study-plan/items, POST /api/me/tutor/handoff |
| Assessments + AssessmentInterface (gated: shown when there are older quizzes; never for LMS students) | Take an older quiz with the in-quiz tutor | none | Missing | POST /api/me/assessments/:id/attempts, …/submit, /api/me/tutor/sessions/:id/messages |
| Results (TestResults) | Quiz and assignment results with per-answer detail | student/StudentResults | Full | GET /api/me/results, /:id, /api/me/assignments/:id, /api/me/results/:attemptId |
| Results | Next-best-action recommendations | none | Missing | GET /api/me/recommendations |
| LmsActivity (activity-tutor / avatar / diagnostic) (gated: LMS launch) | No-grade LMS activities | none | Missing | GET /api/lms/activities/:kind |
| AIAssistant (floating tutor on every page) | Side-panel tutor and "Ask tutor" buttons from any page | student/StudentChat (a separate route) | Partial | No floating panel and no "ask about this" from other screens. POST /api/me/tutor/sessions, /messages |
| Layout header | Change my photo (goes to the school for approval) | none | Missing | POST /api/me/photo, GET /api/me |

## 3. Kids student (uiMode = kids)

| lms-test screen | feature | design app | status | notes (endpoints) |
|---|---|---|---|---|
| kids/KidsApp | The whole kids app (home, learning, lessons, word pictures, tutor, progress, assignments, plan, results, tour) | `#/kids` → src/lms/kids/KidsApp (copied byte for byte, drift check) | Full | every kids call through the copied apiService |
| kids + LiveAvatarModal | Kids live avatar | copied LiveAvatarModal | Full | /api/avatar/*, rt.enara.app |
| App → KidsApp props | Opening a shared course or assessment link, or an LMS-launched assignment or page, in the kids app | KidsLms passes null/undefined | Missing | `sharedCourseId`, `sharedAssessmentId`, `lmsAssignmentId`, `lmsPage` |
| App | Staff move a learner to or from kids mode while they are signed in (the session is re-read on open) | the uiMode is read when the session loads | Partial | GET /api/auth/session (lms-test re-reads it whenever the student view opens) |
| App | Kids sign-out | KidsLms → reload on `#/login` | Full | POST /api/auth/logout |

## 4. Parent

| lms-test screen | feature | design app | status | notes (endpoints) |
|---|---|---|---|---|
| ParentsApp | Child list and switcher | parent/A_shared, data | Full | GET /api/parents/learners |
| Home | Learning home and weekly status | parent/A_Home | Full | GET /learners/:id/home, /status, /subjects |
| Home: Subjects | Subject chips filter and subject detail | parent/A_Home, A_Progress (overview only) | Partial | GET /learners/:id/subjects/:key is missing |
| Progress | Week and term progress, per-class filter | parent/A_Progress | Partial | GET /learners/:id/progress is used. The term view and `?classId=` are missing |
| Progress: MemoryCard | Child's errors to work on, plus interests (edit) | none | Missing | GET /learners/:id/errors-to-work-on, GET/PUT /learners/:id/interests |
| Activity | Activity feed | parent/A_Progress (read) | Partial | GET /learners/:id/activity. Opening a tutor-session transcript is missing |
| Activity | Tutor session transcript | none | Missing | GET /learners/:id/sessions/:sessionId/transcript |
| ShareSheet | Share the progress report by email or WhatsApp | none | Missing | GET /learners/:id/report, POST /learners/:id/report/share |
| Controls | Parental controls for the child | none | Missing | GET/PUT /learners/:id/controls |
| Account | Language and email notification preferences | none | Missing | GET /api/parents/account, PUT /api/parents/account/preferences |
| Account | Other guardians: full or view-only role | none | Missing | PUT /learners/:id/guardians/:linkId |
| Account | Unlink a child | none | Missing | DELETE /api/parents/links/:linkId |
| Account | Theme (light / dark / auto) | `?dark=1` only | Partial | client side |
| LinkChild | Link another child with a code once signed in | none (`/parent-code` is sign-in only) | Missing | POST /api/parents/link/preview, /link/confirm |
| AddEmail | Add and verify an email, merge accounts | none | Missing | POST /api/parents/email/start, /verify, /merge |
| School index / overview (gated: SCHOOL_APP_* sections) | Which school sections are on | parent/A_Home, A_Chat | Full | GET /api/parents/school/learners/:id |
| School: Today | Today's school summary | parent/A_Home (next class, bus, latest announcement, unread) | Partial | composed differently, with no full Today screen |
| School: Timetable | Full weekly timetable | parent/A_Home (today only) | Partial | GET …/timetable |
| School: Attendance | Month calendar | parent/B_Attendance | Full | GET …/attendance?month= |
| School: Announcements | Announcement list | parent/A_Home (latest only) | Partial | GET …/announcements |
| School: Fees | Instalments and receipt download | parent/B_Fees | Full | GET …/fees, …/fees/:id/receipt |
| School: Bus | Route, times, notices | parent/B_Bus | Full | GET …/bus |
| BusLive (gated: SCHOOL_APP_BUS_LIVE_ENABLED) | Live bus map, set or cancel the home pin | none | Missing | GET …/bus/live, GET/PUT …/bus/home, DELETE …/bus/home/pending |
| School: Requests | Request list, new request form, cancel | parent/A_Chat (only a request offered by the chat) | Partial | POST …/chat/request only. GET/POST …/requests and POST …/requests/:id/cancel are missing |
| School: Consents | Read and sign consent forms | none | Missing | GET …/consents, POST …/consents/:formId |
| School: Notifications | Notification list and mark as read | parent/A_shared bell + A_Home (unread) | Partial | GET /api/parents/school/notifications. POST …/notifications/read is missing |
| Messages + SchoolChat | Ask the school assistant, offered requests | parent/A_Chat | Full | POST …/chat, …/chat/request |
| Actions ("To do") | Fees due, open requests, forms to sign, with a badge | none | Missing | reads …/fees, …/requests, …/consents |

## 5. Teacher (the staff portal for role teacher; school admins see all of these too)

| lms-test screen | feature | design app | status | notes (endpoints) |
|---|---|---|---|---|
| TeachingDashboard | Classes, work counts, follow-ups, roster (submitted / late / missing) | teacher/ClassOverview | Full | GET /api/assignments/classes, /api/teaching/overview, /api/teaching/classes/:id/roster |
| TeachingDashboard | Class objectives panel | teacher/Builder (AI draft only) | Partial | GET /api/teaching/classes/:id/objectives is not shown on the dashboard |
| TeachingDashboard | Learner profile drawer | none | Missing | GET /api/teaching/students/:id/profile |
| TeachingDashboard | Educator interventions (create, update) | none | Missing | POST /api/teaching/interventions, PATCH /:id |
| TeachingDashboard | Sync the LMS roster (gated: LMS) | none | Missing | POST /api/lms/contexts/:id/roster/sync |
| TeachingDashboard / ClassInsights / Outcomes / Documents / Usage | Live / demo / all data selector | none | Missing | `?origin=` on the dashboard APIs |
| AssessmentBuilder | Open, create draft, edit (choice, true/false, short, rubric), save, publish | teacher/Builder | Full | GET/POST/PATCH /api/assessments, POST /:id/publish |
| AssessmentBuilder | AI draft from class outcomes | teacher/Builder | Full | GET /api/teaching/features, /objectives; POST /api/assessments/generate |
| AssessmentBuilder | Validate a draft | teacher/Builder (uses `publishProblems` from GET) | Partial | POST /api/assessments/:id/validate |
| AssessmentBuilder | Archive, duplicate, version history | none (archived shown read-only) | Missing | POST /:id/archive, /:id/duplicate; GET /:id/versions |
| AssessmentBuilder | Regenerate one AI question | none | Missing | POST /api/assessments/:id/questions/:qid/regenerate |
| AssessmentBuilder: SourcePicker | Choose source documents for AI drafts | none | Missing | GET /api/documents |
| AssessmentBuilder | Engine questions, CEFR speaking rubric, speaking and conversation formats | none ("edited in the full builder") | Missing | same /api/assessments payloads |
| ClassAssignments | List a class's assignments, assign an assessment to a class (dates, settings) | none | Missing | GET/POST /api/assignments, GET /api/assignments/:id |
| ClassAssignments | Open, close, reopen and other actions | none | Missing | POST /api/assignments/:id/:action |
| ClassAssignments | Extensions for a learner | none | Missing | POST /api/assignments/:id/extensions |
| ClassAssignments | Release every result | none | Missing | POST /api/grading/assignments/:id/release |
| SpeakingExamSettings | Speaking exam preview, attempts, remove a transcript | none | Missing | POST /api/speaking/preview; GET /api/assignments/:id/speaking-attempts; POST …/speaking/remove-transcript |
| GradeHistory | Grade history and the LMS gradebook decision | none | Missing | GET /api/assignments/:id/students/:sid/grade-history, POST …/lms-decision |
| GradingReview | Queue, open, score or accept AI, feedback, finalize, release, correct | teacher/Grading | Full | /api/grading/queue, /attempts/:id, …/answers/:qid, …/feedback, …/finalize, …/release, …/correct |
| GradingReview | Server-side queue filters (status, assignment) | teacher/Grading (class filter plus tabs on the page) | Partial | GET /api/grading/queue?… |
| GradingReview | Regrade a submission | none | Missing | POST /api/grading/attempts/:id/regrade |
| GradingReview | Answer learner appeals | teacher/Grading (lists them read-only) | Missing | PUT /api/grading/attempts/:id/appeals/:appealId |
| QuestionBank | Item bank: browse, AI-generate, review, add to an assessment, stats | none | Missing | GET /api/item-bank, /stats, /:id/question; POST /generate, /:id/review; PATCH /api/assessments/:id |
| LessonPlanner | AI lesson plans: generate, edit, regenerate a section, save version, archive | none | Missing | /api/lesson-plans (GET, POST /generate, PUT /:id, POST /:id/sections/:sid/regenerate, /:id/save, /:id/archive) |
| ClassInsights | Misconceptions, common gaps, mastery heatmap | teacher/Errors + ClassOverview | Full | GET /api/learning/classes/:id/insights |
| ClassInsights | Strategies and assigning an intervention | none | Missing | GET /api/learning/strategies, POST /api/learning/interventions |
| ClassInsights | Mark a misconception reviewed | none | Missing | PATCH /api/learning/misconceptions/:id |
| ClassInsights + TeachingEffectivenessPanel | Time-to-understand and teaching effectiveness | none | Missing | GET /api/learning/analytics/ttu, /teaching-effectiveness |
| CurriculumCenter | Curricula: create, edit, delete, deploy, publish to class, assign or unassign batch | none | Missing | /api/curriculums (CRUD, /deploy, /publish-to-class, /assign-batch, /batches/:id) |
| CurriculumCenter | Chapter files and video upload (with compression) | none | Missing | POST …/chapters/:id/uploads, …/video-uploads, /api/upload/course/:id |
| CurriculumCenter: ChapterQuizEditor | Chapter quiz (edit, AI-generate) | none | Missing | PUT …/chapters/:id/quiz, POST …/quiz/generate |
| CurriculumCenter | Batches and course instances (CRUD, enrol or remove students, archive) | none | Missing | /api/batches, /api/course-instances, …/students, …/archive |
| AssessmentCenter | Older assessments: create, edit, delete, attempts | none | Missing | /api/assessments CRUD, GET /:id/attempts |
| LearningObjectives | Outcomes: create, edit, approve, extract from curriculum, link questions | none | Missing | /api/learning/objectives (+/approve, /extract, /:id/questions) |
| Documents | Upload source documents, view sources, retry, delete | none | Missing | /api/documents (+direct-upload, /:id/sources, /retry, DELETE) |
| AIChat | Educator chat over documents, conversations | none | Missing | /api/educator-chat/ask, /documents, /conversations |
| Outcomes | Outcome analytics and student timeline | none | Missing | GET /api/learning/analytics/outcomes, /students/:id/timeline |
| ParentCodeTools (gated: the school lets teachers issue codes) | Print class parent-code sheets, revoke codes | none | Missing | GET /api/parents-admin/classes, POST …/code-sheet, …/codes/revoke |
| LmsEmailOptIn (gated: LMS session) | Ask once whether ENARA may email the teacher | none | Missing | GET/POST /api/lms/email-optin |
| LmsActivityOverview (gated: LMS) | Teacher view of tutor, avatar or diagnostic activity | none | Missing | GET /api/lms/activities/:kind |

## 6. School admin (role admin) and academic manager

Admins also reach every teacher page (§5). The design app allows admin into `/teacher`, but only by typing the URL, because no link leads there.

| lms-test screen | feature | design app | status | notes (endpoints) |
|---|---|---|---|---|
| Staff portal nav | Teacher pages from the admin sidebar | `/teacher` allowed, with no link from the SchoolShell | Partial | see §5 for each page |
| AdminDashboard | School overview: analytics, engagement, score bands, student list | school/Dashboard (school-app numbers only) | Missing | GET /api/analytics/overview, /api/students |
| AdminDashboard: WeeklySummaryCard / MemoryReportCard | Weekly summary, memory report | none | Missing | GET /api/analytics/weekly-summary, /api/learning/memory-report |
| AdminDashboard: StudentPhoto | Approve or reject pending student photos | none | Missing | GET /api/students/photos/pending, POST /:id/photo/approve, /reject |
| AIAssistant (admin) | AI data assistant | none | Missing | POST /api/analytics/assistant |
| Live Avatar Control (AdminAvatarControlCenter + TutorFacePicker) | School tutor face, learners' face choices, test call (the avatar config itself is local mock) | none | Missing | GET/PUT /api/tutor-faces, PUT /api/tutor-faces/student-options |
| CourseTeacherAnalytics | Course intelligence (benchmarks, chapter completion, tutor questions, AI lesson plan) | none | Missing | GET /api/analytics/courses/:id, /api/course-instances |
| InstitutionAnalytics | Governance: credits and engagement by course | none | Missing | GET /api/analytics/overview |
| StudentManagement | Students: list, create, edit, delete, create login | none | Missing | /api/students CRUD, POST /api/auth/users |
| StudentManagement | Class enrolment, archive, permanent delete | none | Missing | POST/DELETE /api/course-instances/:id/students, POST /api/students/:id/archive, GET /archive-settings |
| StudentGroupsPanel | Multi-class memberships | none | Missing | GET /api/multi-class/status, …/students/:id/enrollments (GET/POST/DELETE) |
| ArchivePanels | Restore archived students, batches and course instances; safety alerts; learners with no group | none | Missing | GET /api/students?archived=only, /deleted-safety-alerts, /without-active-group; POST …/restore |
| StudentPhoto | Set a student's photo | none | Missing | PUT /api/students/:id/photo |
| StudentProfile + ParentAccessPanel | Student profile, parent codes (create, revoke), remove a parent link | none | Missing | GET /api/students/:id, /api/analytics/students/:id, /parent-codes (GET/POST/DELETE), DELETE /parent-links/:id |
| StudentDeepAnalytics + ErrorsToWorkOnPanel + LearnerMemoryPanel | Deep analytics, dismiss errors, learner memory profile, habits, what works | none | Missing | GET /api/analytics/students/:id; PATCH /api/learning/errors-to-work-on/:id; /api/learning/students/:id/profile, /session-summaries, /study-habits, /what-works |
| AICredits | School AI credit report | none | Missing | GET /api/credits |
| ResearchInsights | Research and insights (top performers, at-risk, batches, subjects) | none | Missing | GET /api/analytics/overview, /students/:id, /api/batches |
| SchoolInsights | School learning analytics, curriculum processing, shadow comparison | none | Missing | GET /api/learning/analytics/school, /shadow-comparison; GET/POST /api/learning/curricula/:id/process(ing) |
| LearningEvents | Learning event log | none | Missing | GET /api/analytics/events |
| People | Staff users, status, invitations | none | Missing | GET /api/workspace/users, PUT /:id/status, GET/POST/DELETE /api/workspace/invitations |
| LearnerAgeBands | Age bands for students and classes | none | Missing | GET /api/age-bands, PUT /students/:id, /classes/:id |
| Usage | Usage report and credit limits | none | Missing | GET /api/usage/report, /budget, PUT /budget/limits |
| SavingsCenter | AI savings: plan, current tools, simulate | none | Missing | /api/usage/plan, /current-tools, /savings, /simulate |
| LmsConnections (gated: LMS_LTI_ENABLED) | Registration links, platforms (approve, disable, reject), deployments | none | Missing | /api/lms/registration-links, /platforms, /deployments |
| LmsConnections | Grades (resync, retry dead), seats, contexts, rosters | none | Missing | /api/lms/grades, /seats, /contexts, …/roster/sync |
| LmsConnections: MoodleQuizCard + LmsProblems | Moodle quiz import and mapping, problem log | none | Missing | /api/lms/…/moodle-quiz (token, quizzes, run), GET /api/lms/problems |
| LmsSchoolStatus (gated) | School LMS connection status, set the public key | none | Missing | POST /api/lms/platforms/:id/public-key |
| ParentsAdmin (gated: PARENT_SETTINGS_ENABLED) | Parents card: status, school parent settings (e.g. teachers may issue codes) | school/SchoolShell, Dashboard (reads the school name and parent counts) | Partial | GET /api/parents-admin/schools is read. GET /api/parents-admin/status and PUT /schools/:id/settings are missing |
| ParentCodeTools | Class code sheets, revoke codes | none | Missing | GET /api/parents-admin/classes, POST …/code-sheet, …/codes/revoke |
| ParentCsvInvites | CSV parent invites (preview, send, resend, revoke) | none | Missing | /api/parents-admin/csv-invites (+/preview, /:id/resend, /:id/revoke) |
| SchoolAppAdmin | Section switches | school/Sections | Full | GET /api/school-app/status, PUT /sections |
| SchoolAppAdmin | Imports: preview, column mapping, confirm, undo, forget mapping (CSV/XLSX), roster | school/Imports | Full | /api/school-app/imports/*, /roster |
| SchoolAppAdmin | Announcements: publish, withdraw | school/Announcements | Full | GET/POST /api/school-app/announcements, POST /:id/withdraw |
| SchoolAppAdmin | Requests: reply, set status | school/Requests | Full | GET /api/school-app/requests, POST /:id |
| SchoolAppAdmin | Fees: who sees fees | school/Sections | Full | PUT /api/school-app/fees/visibility |
| SchoolAppAdmin | Fees: instalment list, mark paid, upload receipt | none | Missing | GET /api/school-app/fees, POST /fees/instalments/:id/mark, /receipt |
| SchoolAppAdmin | Buses: share bus phones | school/Sections | Full | PUT /api/school-app/buses/phones |
| SchoolAppAdmin | Buses: routes, send or withdraw a bus notice (delay etc.) | none | Missing | GET /api/school-app/buses, POST /buses/notices, /:id/withdraw |
| SchoolAppAdmin | Consent forms: publish, withdraw, response dashboard | none | Missing | GET/POST /api/school-app/consents, GET /:id, POST /:id/withdraw |
| SchoolAppAdmin | Moodle (attendance and announcements) connections: token, on/off, run now | school/Imports, Dashboard (read only) | Partial | GET /api/school-app/moodle is read. PUT /moodle/:id/token, PUT /moodle/:id and POST /moodle/:id/run are missing |
| BusAdmin (gated: SCHOOL_APP_BUS_LIVE_ENABLED) | Live bus settings and windows, supervisors (add, edit, code, sign out, remove) | none | Missing | /api/school-app/bus-live, /settings, /supervisors (+/code, /sign-out, DELETE) |
| BusAdmin | Stops on the map, homes (approve, set, order, door to door), stop a trip | none | Missing | PUT /bus-live/stops, /homes/order, /homes/door-to-door; POST /homes/:id, /trips/:id/stop |
| Academic manager portal: InstitutionAnalytics | School insights (read only) | none (academic_manager is sent to `/school`, the school-app admin screens) | Missing | GET /api/analytics/overview |
| Academic manager portal: Outcomes | School outcome aggregates (read only) | none | Missing | GET /api/learning/analytics/outcomes |
| Academic manager portal: LearnerAgeBands | Age bands (view) | none | Missing | GET /api/age-bands |

## 7. ENARA platform admin (enara-admin)

| lms-test screen | feature | design app | status | notes (endpoints) |
|---|---|---|---|---|
| EnaraAdminDashboard | Executive overview, create user accounts (mostly sample data) | none | Missing | POST /api/auth/users, GET /api/students |
| RevenueGrowth, InstitutionCRM, Contracts, PlatformHealth, ROIMetrics, Financials, AuditCompliance | Executive pages (static sample data in lms-test, no API) | none (Models and Schools take their place with real data) | Missing | none: mock only, low value |
| AdminAvatarControlCenter | Tutor face for any school, test call | none | Missing | GET/PUT /api/tutor-faces?institutionId= |
| LearningObjectives / ClassInsights / SchoolInsights / LearningEvents | The same pages for ENARA staff, across schools | none | Missing | see §5/§6 endpoints |
| Integrations | Partner institution list | platform/Schools | Full | GET /api/integrations/institutions |
| Integrations | Create a partner institution | none | Missing | POST /api/integrations/institutions |
| Integrations | Partner API keys: list, issue, revoke, validate | none | Missing | GET /api/integrations/api-keys, POST …/institutions/:id/api-keys, /api-keys/:id/revoke, /api-keys/validate |
| LmsConnections (gated) | LMS connections across schools | none | Missing | /api/lms/* |
| LmsOnboarding (gated) | New school (LMS self-serve onboarding) and every school's status page | none | Missing | POST /api/lms/onboarding/schools, GET /api/lms/onboarding |
| ParentsAdmin (gated) | Turn parent access on or off per school, per-school settings | none | Missing | PUT /api/parents-admin/schools/:id/access, /settings |
| ParentsAdmin → SchoolAppAdmin | School app admin for any school | school/* with the enara-admin school scope | Partial | has the same gaps as §6 (fees, bus notices, consents, Moodle writes) |
| AICredits (Credit reports) | Credits by institution | platform/Usage | Full | GET /api/credits |
| EnaraCreditManagement | Allocations, top-up and monthly-limit dialogs (local only), AI consumption report | platform/Usage (budgets read-only) | Partial | The AI report (POST /api/gemini/generate) and the top-up/limit UI are missing |
| Staff portal as enara-admin | An enara-admin may open the school staff portal (all admin pages) | `/school` (school-app screens only) | Partial | the admin analytics pages in §6 are missing |

## 8. Bus supervisor (`/bus`, its own code sign-in, not an ENARA session)

| lms-test screen | feature | design app | status | notes (endpoints) |
|---|---|---|---|---|
| BusApp | Sign in with the school's supervisor code | none | Missing | POST /api/bus/start, GET /api/bus/me |
| BusApp | Trips: list, start, live GPS position, end | none | Missing | GET /api/bus/trips, POST /trips/:id/position, /trips/:id/end |
| BusApp | Next home: picked up, dropped off, not riding; trip notices | none | Missing | POST /trips/:id/stops, /trips/:id/notice |

## 9. Design-app features lms-test does not have (brief)

- Arabic and English plus dark mode across every area (lms-test staff and student pages are English only; only the parents and kids apps are bilingual).
- Platform **Models / status** page: GET /api/platform/status (Mishkat, email counts, models; switch LMS_DESIGN_PLATFORM_STATUS).
- Platform **Schools**: turn a school on or off (PUT /api/integrations/institutions/:id/status); **Usage**: per-school AI spend and budgets (GET /api/analytics/ai-usage, /api/ai-controls/budgets/:id).
- School **Dashboard** that sums up school-app status, roster, imports, requests, Moodle and parent counts on one page, plus the enara-admin school-scope switch.
- Parent **Home** that brings timetable, bus, latest announcement and unread notices together on one page.
- Teacher **Errors** page (class-wide misconceptions and heatmap as its own screen); grading and results show who scored each answer (rules, AI, Mishkat, teacher).
- Student results show per-answer scorer badges; a phone-first nav with bottom tabs.
- The sample-data ribbon on unwired screens; the new-design kids screens kept in git, not routed.

## Totals

| role | Full | Partial | Missing | rows |
|---|---|---|---|---|
| Shared: sign-in, links, launch | 4 | 1 | 13 | 18 |
| Student | 10 | 4 | 20 | 34 |
| Kids student | 3 | 1 | 1 | 5 |
| Parent | 7 | 9 | 12 | 28 |
| Teacher | 5 | 3 | 33 | 41 |
| School admin | 6 | 3 | 36 | 45 |
| ENARA platform admin | 2 | 3 | 9 | 14 |
| Bus supervisor | 0 | 0 | 3 | 3 |
| **All** | 37 | 24 | 127 | 188 |

## Biggest gaps

1. **Teacher class assignments**: no way to assign an assessment to a class, open or close it, give extensions, or release all results. The design builder can publish an assessment, but learners never receive it.
2. **School admin core**: students (CRUD, logins, enrolment, archive, photos), people and invitations, curriculum center, batches and course instances. None of it is in the design app.
3. **Student "My learning" lesson reader**: there is no lesson content or video and no mark-complete, so course progress cannot move from the design app.
4. **All analytics and insights pages**: the admin dashboard, course intelligence, governance, research, school insights, learning events, outcomes, AI credits and usage/savings. This also leaves the academic manager with no working portal.
5. **LMS integration**: launch, picker, LMS connections, onboarding, status, LMS activities, roster sync, email opt-in.
6. **Teacher content tools**: question bank, lesson planner, documents, AI chat, learning objectives, plus builder archive/duplicate/versions/engine/speaking formats.
7. **Student learning-intelligence pages** (gated): my progress/knowledge map, diagnostics, study plan, next steps and quick review, achievements; also speaking and conversation exams, appeals, and older quizzes.
8. **Parent account and linking**: settings and preferences, guardian roles, unlink, link another child, add email, controls, share report, transcripts, memory card. Also parent sign-up, Google sign-in and email-code sign-in.
9. **Parent school actions**: requests (list, new, cancel), consents, mark notifications read, live bus map and home pin, full timetable and announcements, plus the matching admin side (fees instalments, bus notices, consents, Moodle writes, live-bus admin) and the bus supervisor app.
10. **Account lifecycle and onboarding**: forgot password, reset password, invitation accept, demo portal, product tour, student photo, parent-code and CSV invite tools, the tutor-face/avatar control center, and the integrations API keys.
