# Enara Platform Guide

What the Enara platform does, role by role, as it runs in the sandbox today (24 October 2026).

- **Sandbox app:** https://enara-sandbox-frontend.vercel.app
- **Backend API:** https://enara-sandbox-backend.vercel.app (health check: `/ready`)
- **Code:** `EnaraAI/enara-sandbox`, branch `connect-backend`

> Pages marked **(sample data)** still show placeholder figures and are not connected to the backend yet. Everything else reads and writes real data.

---

## Contents

1. [Roles at a glance](#1-roles-at-a-glance)
2. [Signing in](#2-signing-in)
3. [Students](#3-students)
4. [The live AI tutor (video call)](#4-the-live-ai-tutor-video-call)
5. [The AI tutor chat](#5-the-ai-tutor-chat)
6. [Teachers](#6-teachers)
7. [School administrators](#7-school-administrators)
8. [Enara administrators](#8-enara-administrators)
9. [Partner integrations (LMS API)](#9-partner-integrations-lms-api)
10. [How the AI tutor works](#10-how-the-ai-tutor-works)
11. [Automatic jobs and emails](#11-automatic-jobs-and-emails)
12. [AI credits](#12-ai-credits)
13. [Configuration reference](#13-configuration-reference)
14. [Known limits](#14-known-limits)
15. [Security notes](#15-security-notes)

---

## 1. Roles at a glance

| Role | Who | Signs in as | Main things they do |
|---|---|---|---|
| **Student** | A learner enrolled in one or more courses | Student | Learn lessons, talk to the AI tutor (chat or live video), take assessments, review mistakes, follow suggested next steps |
| **Teacher** | A class teacher | Administrator view (school) | Everything a school admin sees for their school; take attendance (API); receive the weekly class summary |
| **School administrator** | Runs one school (institution) | Administrator | Students, curriculum and lesson files, course groups, assessments, analytics, AI credits, tutor faces |
| **Enara administrator** | Enara staff | Enara Administrator | Everything across all schools: onboarding schools, partner API keys, credit reports, platform-wide settings |
| **Partner system** | A school's LMS | API key | Uploads course material into Enara through the API |

Access is enforced by the backend: students can only reach `/api/me/*` (their own data); admin pages need an admin role; school admins and teachers only ever see their own school's records; Enara admins can see every school.

---

## 2. Signing in

1. Open the app and choose **Student** or **Administrator** on the sign-in screen.
2. Enter email and password. Sessions use signed tokens that expire; signing out clears them.
3. Teachers and school admins land on the school **Dashboard**; Enara admins on the **Executive Overview**; students on **Home**.

Sandbox accounts: a student (`student@enara.com`) and an Enara administrator (`admin@enara.ai`). Passwords are shared privately, not kept in this repository.

Login attempts are rate-limited (20 per 15 minutes per address).

---

## 3. Students

The student app has four tabs: **Home**, **My learning**, **Assessments** and **Results**, plus the AI tutor, available on every page.

### 3.1 Home

| Section | What it shows | Where the data comes from |
|---|---|---|
| **Pick up where you left off** | The course and lesson to continue, with progress bar and a **Resume** button | The student's lesson progress |
| **Due soon** | Open assessments (with **Start assessment**) and upcoming ones with their opening date | Assessments assigned to the student's group |
| **Your next steps** | Up to four suggestions, the most useful first, with a one-line personal note from the tutor (see below) | The student's progress, quiz results and review questions |
| **My courses** | Every enrolled course with progress and lesson counts | Course enrolments |
| **Recent results** | Latest assessment scores | Submitted attempts |
| **Your week** | Activity over the last days | Lessons, quizzes and tutor use |
| **Badges** | Achievements unlocked and still locked | Achievement rules |

**Your next steps** can contain:

- **Quick review**: “3 quick review questions”. Opens the review (see 3.5).
- **Practise a weak topic**: “Practise Forces, 0 of 1 right in Mechanics Check-in”. Opens the tutor chat with a ready-made request for a short review and practice questions on that topic.
- **Continue or start a lesson**: opens the course at that lesson.

The note above the steps is written by the AI for that student each day (for example: *“Sarah, your next step is a 5-minute Forces practice with your tutor, since that's where you missed your Mechanics Check-in question.”*). If the AI is unavailable, a plain sentence is shown instead.

### 3.2 My learning (courses and lessons)

- **Course list:** every enrolled course with progress.
- **Course page:** the lessons in order. A lesson is *completed*, *active* (the next one) or *locked* until the previous one is done.
- **Lesson view:** the lesson's description and its materials (PDFs, text notes, audio and videos uploaded by the school). Videos stream directly from storage, so they start quickly and can be skipped through.
- **Mark as complete:** finishes the lesson and unlocks the next.
- **AI tutor panel:** next to the lesson, the tutor chat knows which lesson is open (section 5).
- **Live tutor:** the video-call button opens the live AI tutor for this lesson (section 4).

### 3.3 Assessments

- **Your Assessments** lists every assessment for the student's group with subject, status and due date.
- Only **active** or **in-progress** assessments can be started.
- **Taking an assessment:** one question at a time (multiple choice, true/false or short answer), a timer based on the assessment's duration, a question navigator, and **Submit**.
- **Attempts:** one attempt per assessment unless the school allows more (up to 10). A second start after the last attempt is refused.
- **Results screen:** score, number correct, time spent, and **View Detailed Feedback** with each question and the student's answer. The right answers and explanations appear once they can no longer help a retake: after the last attempt, or, if the school chose *after close*, once the assessment is completed or past its due date. Until then the screen says when they will appear.
- **Review offer:** when any topic scored under 70%, the results screen shows a card such as *“Forces could use another look: 0 of 1 right”* with **Review with your tutor**, which returns to Home and opens the tutor with a request to review those exact topics and give practice questions one at a time.
- **Missed questions are saved for spaced review** automatically (3.5).

### 3.4 Results

- Every submitted assessment with score and date.
- Per-topic accuracy across assessments.
- **Ask the tutor** about any result: opens the tutor chat about that assessment.
- Subject and assessment analytics for the student.

### 3.5 Quick review (spaced review)

Every question the student gets wrong in an assessment becomes a **review question**.

| After answering | It comes back |
|---|---|
| Wrong in the quiz | Tomorrow |
| Right once | In 3 days |
| Right twice in a row | In 7 days |
| Right 3 times | In 14 days |
| Right 4 times | In 30 days |
| Right 5 times in a row | Retired (learned) |
| Wrong at any point | Tomorrow again, schedule restarts |

The review opens from **Your next steps** when questions are due. It shows one question at a time with the original options (or a text box), says right or wrong, shows the correct answer and explanation, and tells the student when it will come back. Retaking a quiz and getting a question wrong again restarts its schedule.

### 3.5b Live call transcripts

Every live tutor call is saved like a chat. It appears in the course's **chat history** marked *Live call transcript*, with what the student said and what the tutor answered, and can be continued by typing.

### 3.6 Choosing your tutor

Before a live call, the student sees **Your tutor** with a photo and **Change**.

- The first time, **Choose your tutor** opens by itself: a gallery of faces with search and a **Women / Men** filter. **Skip for now** keeps the school's tutor.
- The tutor's **voice matches the face** (a woman's or a man's voice).
- **Use my school's tutor** goes back to the school's choice.
- The faces offered are the ones the school allows (7.2).

---

## 4. The live AI tutor (video call)

A spoken, face-to-face tutor that knows the course, speaks English and Egyptian Arabic, and can draw on screen.

### 4.1 Starting a call

1. Open a lesson and press the live tutor button.
2. Check or change **Your tutor**.
3. Press **Start call** and allow the microphone. There is no language to choose: speak English or Arabic and the tutor follows.

### 4.2 During the call

| Feature | What happens |
|---|---|
| **The tutor speaks first** | It greets the student by name and makes one specific offer based on where they stand: continue the next lesson, practise a weak topic from a recent quiz, or do review questions that are due. The first sentence is in the language the student ended their last call in (English the first time). |
| **Speak naturally, either language** | Each sentence's language is detected on its own. The tutor replies in that language with the matching voice. Saying “speak Arabic” / “كلمني عربي” (or the English equivalent) keeps replies in that language until the student asks for the other. Franco-Arabic (“ya3ni”, “3ayiz”) and dialect words are understood. |
| **Teaches from the course** | Answers use the course outline, the current lesson, and the lesson's uploaded notes and PDFs. |
| **Teaching style** | Socratic: guiding questions rather than giving away answers; ends explanations with a short check question; says clearly whether an answer is right and names the specific mistake if not. |
| **Notices struggle** | After two wrong answers in a row, or the same question twice, it slows down: one small step at a time, simpler words, an everyday example, more encouragement. |
| **Nudges when the student goes quiet** | If the student says nothing for 12 seconds after a question, the tutor offers a hint, a simpler version, or two answers to choose from (at most twice in a row). |
| **Draws on screen** | Asking “can you draw it?”, “show me”, “make a table”, “ارسم”, “وريني” and similar puts a drawing in the **Visual Aid** panel while the tutor talks (about 8 to 20 seconds). The tutor may also decide a drawing would help and put one up itself. Drawings are diagrams, worked steps, tables, number lines or simple illustrations, in the student's language, with equations kept readable in Arabic. |
| **Interrupting** | The student can talk over the tutor; it stops and answers the new question. Its own voice coming back through the speakers is recognised and ignored. |
| **Remembers the call** | The tutor keeps the conversation so far, so “draw this” or “explain that again” refer to what was just discussed. |

### 4.3 Screen layout

- Without a drawing: the tutor's video fills the window.
- With a drawing: the tutor moves to a narrow column (about a third) and the drawing takes the rest; on phones the tutor sits above the drawing.

### 4.4 When something goes wrong

| Situation | What the platform does |
|---|---|
| The video connection drops mid-call | Reconnects by itself (up to 3 times in 5 minutes), keeping the conversation and the current drawing. |
| The video service refuses the call (for example, an account limit) | Carries on as a **voice-only** call: the tutor's photo, name and voice, with every other feature working. |
| The microphone is blocked | Shows “Microphone permission is required for the live tutor.” |
| The AI can't answer | Says so (“Sorry, I had trouble answering that. Please try again.”) instead of making something up. |

### 4.5 Speed

Measured on the live sandbox: the tutor starts speaking about **2.5 to 3 seconds** after the student finishes a sentence, and usually starts with a short phrase while the rest of the reply is still being written. The first call after the sandbox has been idle can take about a second longer.

---

## 5. The AI tutor chat

Available from the tutor button on every student page and beside each lesson.

- **Conversations** are saved and listed; a student can reopen, delete one, or clear all.
- **Grounded in the course:** before answering, the tutor reads the course outline, the current lesson and that lesson's uploaded PDF and text notes. It says so when a question goes beyond the course, and does not invent course content.
- **Knows the student:** progress, recent quiz results, weak topics and reviews due, so it can suggest what to do next.
- **Teaching methods:** Socratic (guiding questions), gap filler (short explanation then a worked example), or error analysis (find and explain the mistake).
- **Streaming replies** with Markdown for steps and formulas, in English or Arabic.
- **Visualise:** turn an explanation into a diagram.
- **Listen:** read a reply aloud.

---

## 6. Teachers

Teachers sign in through the **Administrator** option and use the school administrator view (section 7) for their school.

Additionally:

- **Attendance** (backend API, `/api/teacher/attendance`): list the classes the teacher teaches, load a class roster, record attendance, edit and submit it, and see the history. Saving twice the same day updates the same record rather than duplicating it.
- **Weekly class summary email** every Monday (section 11), the same as school admins.

---

## 7. School administrators

Sidebar: **Dashboard, Live Avatar Control, Course Intelligence, Governance, Students, Curriculum, Assignments, AI Credits, Research & Insights.**

**Data assistant (floating chat button).** Admins ask questions about their school ("who is at risk?", "which topics are weakest?"). The backend reads the school's own computed data and Claude answers from it only; it says so when the data doesn't cover the question. Teachers and students don't have it (students get the AI tutor instead).

**Sample data.** Fields that came from the sandbox's seed data rather than real activity (learning-style notes, seeded recommendations) carry a yellow **Sample data** label, as do pages that aren't connected to live records yet.

**Learning Events (sidebar).** A log of every recorded learning action: lessons viewed and completed, assessments started and submitted, each answered question, review answers, and every tutor question and reply (chat and live calls). Filter by student, type, source, evidence and dates; the tiles count each type. **Verified** means the server saw it happen or checked the answer against the key. Tutor replies are AI output and time on a lesson is reported by the browser, so they're stored but never verified. Enara admins see it for all schools.

### 7.1 Dashboard

- **This week in your school** (written by the AI tutor from real figures):
  - a 2–3 sentence summary of the week and what to do about it;
  - **Need attention:** students at risk and why (low quiz scores, no recent activity, overdue assessments);
  - **Topics to re-teach:** the weakest quiz topics with % right;
  - **Asked the tutor most:** the themes of students' tutor questions this week;
  - students active this week and tutor questions asked.
- **Key figures:** students, active students (7 and 30 days), average score, lesson completion, assessments submitted, tutor questions, credits used.
- **Engagement per week** chart (8 weeks), **score bands**, and the **student table** with status (excelling, on track, at risk, not started) and risk flags.

“At risk” means an average score under the low-score threshold, no activity for 14 days, or 2+ overdue assessments.

### 7.2 Live Avatar Control → Tutor faces

Choose who students see in live tutor calls. The voice always matches the face.

| Setting | What it does |
|---|---|
| **School default** | The tutor for every call in the school. **Choose face** opens a gallery of 120 faces with search and a Women/Men filter; clicking a face saves it. |
| **Per course** | Give a course its own tutor (**Give its own face**), change it, or **Use school default instead**. |
| **Tutors students can choose** | **Edit list** to tick the faces students may pick for themselves. None ticked = every face. Removing a face a student already picked sends them back to the school's choice. |

Which face a call uses: the student's own pick → the course's face → the school default → the platform default.

The other tabs on this page (**API & Provider Config**, **Telemetry & Sessions**) and the figures at the top of the page are **(sample data)**.

### 7.3 Course Intelligence

Per-course analytics: enrolled students, lesson completion, average score, tutor questions and active students (30 days), credits used, at-risk students, topic accuracy and the questions students asked about the course.

### 7.4 Governance

School-level analytics overview: activity, performance, risk and subject results.

### 7.5 Students

- List, search and open every student in the school.
- **Add a student** (and optionally a login account for them), edit details, remove.
- Enrol students in course groups.
- **Student profile** and **deep analytics:** scores, lessons, tutor use, credits, activity and risk for one student.

### 7.6 Curriculum

| Task | Details |
|---|---|
| **Create a curriculum** | Name, course name, type, level, languages, summary, description. |
| **Lessons (chapters)** | Add, reorder and describe lessons. The descriptions are read by the AI tutor. |
| **Upload lesson files** | PDF, text, Word, PowerPoint, audio and MP4, up to 50 MB through the normal upload. Files are stored in Cloudflare R2. The tutor reads a lesson's PDF and text files before answering. |
| **Upload lesson videos** | Videos are **compressed in the browser** before upload (H.264, up to 720p; a 54 MB test clip became 1.3 MB), then sent straight to storage, so large files work. Up to 1 GB. Compression takes about 3× the video's length; keep the tab open. Videos over 500 MB upload uncompressed. |
| **Save draft / Save & deploy** | Deploying makes the curriculum visible to the assigned groups. |
| **Assign to groups** | Assign or unassign student groups (batches). |
| **Course groups** | Create batches and course instances that link a curriculum to a group of students. |

### 7.7 Assignments (assessments)

Create, edit and delete assessments: title, subject, duration, difficulty, due date, instructions, assigned group, status (upcoming, active, completed), attempts allowed (`maxAttempts`, default 1) and when students see the answers (`answerReveal`: `after-submit` (default, once no attempts are left), `after-close` or `never`; set through the API for now), and questions (multiple choice, true/false, short answer) with topic, correct answer and explanation. The **topic** on each question drives the weak-topic features (review offer, next steps, re-teach list). View every student's attempts.

**Template generator.** The question, rubric and "suggested settings" generators on this page produce generic templates, not AI output, and are labelled so. Review every question before publishing. Real AI generation is planned (roadmap Phase 6).

### 7.8 AI Credits

Credits used per student, per feature and over time, with limits and blocked or restricted students.

### 7.9 Research & Insights

Deeper analytics across groups and students: subject and topic performance, engagement, and per-student drill-down.

### 7.10 Reminder preview

`GET /api/analytics/reminders/preview` shows which students would get a reminder email right now and the exact message, without sending anything (section 11).

---

## 8. Enara administrators

Sidebar: **Executive Overview, Live Avatar Control, Revenue & Growth, Institutions (CRM), Contracts, Platform Health, ROI & Courses, Financials, Audit & Compliance, Integrations, Credit Reports, Credit Management.**

| Page | Status | What it does |
|---|---|---|
| **Executive Overview** | Partly sample data | Platform overview; creating user accounts and listing students use real data. |
| **Live Avatar Control** | Real (Tutor faces) | Same as 7.2, with a **School** selector to manage any school's tutor faces and student options. |
| **Integrations** | Real | Onboard a school (creates the institution, its admin login and an API key), issue and revoke API keys, test a key against the API (section 9). |
| **Credit Reports** | Real | Credit usage across schools and students. |
| **Credit Management** | Real | Credit limits, blocks and restrictions. |
| Revenue & Growth, Institutions (CRM), Contracts, Platform Health, ROI & Courses, Financials, Audit & Compliance | **(sample data)** | Business dashboards with placeholder figures. |

Enara admins can also use every analytics endpoint for any school by passing `?institutionId=`.

---

## 9. Partner integrations (LMS API)

Lets a school's own system push course material into Enara.

1. An Enara admin onboards the school in **Integrations**: this creates the institution, an admin login, and an API key (shown once; only its fingerprint is stored).
2. The school's system calls the upload endpoints with `Authorization: Bearer <api key>`.
3. Keys are tied to one school and one LMS, can only reach routes that accept API keys, and can be revoked at any time. **Test** in Integrations validates a key against the live API.

---

## 10. How the AI tutor works

### 10.1 What the tutor reads before answering

1. **The teaching instructions:** Socratic method, check questions, struggle mode, reply language.
2. **The course outline:** course title, subject, summary, and every lesson in order with its description, with the current lesson marked.
3. **The current lesson's materials:** up to 3 PDF or text files from the lesson, read in full.
4. **The student's situation:** progress per course, next lesson, recent quiz scores, weak topics, review questions due, recent tutor topics, days since last active.
5. **The conversation so far.**

Steps 1–3 are cached, so later questions in the same conversation are faster and cheaper.

### 10.2 Which AI does what

| Job | Service |
|---|---|
| Tutor answers in chat | Enara's own AI engine first; if it is unavailable, Claude (Anthropic, `claude-opus-5-5`) |
| Spoken answers in live calls | Claude, fast model (`claude-haiku-5-5`) |
| Drawings, next-step notes, reminder emails, weekly summary | Claude, fast model |
| Listening (speech to text, language per sentence) | ElevenLabs real-time transcription |
| Speaking (text to speech, English and Arabic) | ElevenLabs |
| Video face (lip-sync) | Anam |

Enara's own AI engine is currently down (its upstream key has expired), so chat answers come from Claude.

### 10.3 Languages

English and Egyptian Arabic, detected per sentence from speech and text. Explicit requests (“in Arabic”, “بالإنجليزي”) pin the reply language. Drawings and emails follow the student's language; Arabic layouts are right-to-left with equations kept left-to-right.

---

## 11. Automatic jobs and emails

A scheduled job runs **every day at 15:00 UTC** (about 17:00–18:00 in Egypt). It is protected by a secret and can only be triggered by the scheduler.

| Job | When | Who gets it | What it says |
|---|---|---|---|
| **Student reminder** | Daily | Students inactive for 3+ days, or with 3+ review questions due, at most once every 3 days | A short, personal email from their tutor, based on their progress, pointing to their best next step, with an **Open Enara** button |
| **This week in your school** | Mondays | Every active admin and teacher of each school | The weekly summary from 7.1 |

**Emails are off until switched on.** Nothing is sent unless `REMINDERS_ENABLED=true` and a Resend key and sender are set. With `REMINDER_TEST_RECIPIENT` set, every email goes to that one inbox instead, marked with who it was meant for. Every email (sent or not) is logged so students are not reminded too often.

---

## 12. AI credits

Each student has a credit balance. Features cost:

| Feature | Credits |
|---|---|
| Tutor chat answer | 10 |
| Live tutor spoken answer | 25 |
| Read aloud | 15 |
| Visualise | 40 |
| Research | 20 |
| Assessment submitted | 5 |
| Curriculum action | 2 |

The tutor's own opening line and silence nudges are free. Credits are reserved before an answer and refunded if the answer fails. Students who reach their limit, or are blocked or restricted from a feature, get a clear message instead of an answer.

---

## 13. Configuration reference

Set in Vercel (project `enara-sandbox-backend`) or the backend `.env`. Secrets are never committed to the repository.

| Setting | Purpose |
|---|---|
| `MONGODB_URI` | Main database (MongoDB Atlas, Stockholm) |
| `JWT_SECRET`, `JWT_*` | Sign-in tokens |
| `ANTHROPIC_API_KEY` | Claude |
| `ANTHROPIC_TUTOR_MODEL` / `ANTHROPIC_VOICE_MODEL` / `ANTHROPIC_VISUAL_MODEL` | Models for chat, live calls and drawings (defaults: `claude-opus-5-5`, `claude-haiku-5-5`, `claude-haiku-5-5`) |
| `ELEVENLABS_API_KEY` | Listening and speaking |
| `ELEVENLABS_VOICE_ID_EN` / `_AR` / `ELEVENLABS_FEMALE_VOICE_ID` | Man's voices (English, Arabic) and the woman's voice |
| `ANAM_API_KEY`, `ANAM_AVATAR_ID` | Video face service and the platform default face |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Lesson file and video storage (Cloudflare R2) |
| `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `ENARA_DEFAULT_COURSE_ID` | Enara's own AI engine |
| `RESEND_API_KEY`, `REMINDER_FROM`, `REMINDERS_ENABLED`, `REMINDER_TEST_RECIPIENT` | Emails (off by default) |
| `CRON_SECRET` | Protects the daily job |
| `APP_URL` | Link used in emails |
| `TRUST_PROXY` | `1` on Vercel |
| `RUN_MIGRATIONS_ON_START` | Database migrations run automatically on start-up (one instance at a time). Set to `false` to run them only with `npm run migrate` |

Deployment: every push to `connect-backend` runs the checks (backend type check and tests, frontend build, and a scan of the built frontend for credentials) and, only if they pass, deploys both the backend and frontend to Vercel through GitHub Actions. Pull requests run the checks without deploying. The backend runs in Stockholm (`arn1`), next to the database.

---

## 14. Known limits

| Area | Limit |
|---|---|
| **Video face** | Anam sessions have been refusing calls; calls fall back to voice-only until it connects. Calls on the current plan appear capped at about 3 minutes. |
| **Enara's own AI engine** | Down (expired upstream key); Claude answers instead. |
| **Engine file processing** | Needs a Postgres database, which the sandbox doesn't have. |
| **Tavus backup avatar** | Not configured. |
| **Reminder emails** | Built but off until switched on (needs a Resend key, sender and, for the sandbox, a test inbox). |
| **Uploads through the API** | About 4.5 MB per request on Vercel (videos avoid this by uploading straight to storage). |
| **Drawings** | AI-generated each time; occasionally a label sits close to a line. |
| **Sample data pages** | Listed in 7.2 and 8. |
| **Sandbox sample content** | The Algebra course includes a “Classical Mechanics” lesson; the tutor repeats whatever the curriculum says. |

---

## 15. Security notes

- Each school only sees its own data; students only their own.
- API keys are stored as fingerprints, shown once, and can be revoked.
- Live-call limits count per signed-in user (a school's students often share one internet address).
- The tutor's drawings are cleaned of scripts and links and shown in a locked-down frame.
- Keys pasted into chat during setup (Anthropic, ElevenLabs, Anam, Cloudflare R2, Vercel, Render, Railway) should be rotated.
- No AI provider keys are in the frontend. The keys that used to be there (Enara orchestrator, Beyond Presence) were removed and must be rotated. CI fails a build whose frontend bundle contains anything that looks like a key.
- Uploaded files open only through signed links that expire after about 6 hours. The API signs links in the responses of users allowed to see that curriculum or course.
- Rate limits are shared by all server instances (stored in MongoDB).
- Every AI call is recorded (feature, model, tokens, time, estimated cost, school) for 180 days. Admins see totals at `GET /api/analytics/ai-usage`.
- Students' questions sent to the weekly summary are treated as data: links are removed and the model is told not to follow instructions in them.
- Submitted attendance can only be changed by a school admin.
- Open item: registering with the email of a student the school already added links the new account to that student without verifying the email. A fix is planned separately (sign-in changes were excluded from Phase 0).
