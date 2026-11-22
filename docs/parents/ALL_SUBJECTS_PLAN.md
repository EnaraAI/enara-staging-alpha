# Plan: the Parents portal shows every subject (lms-test only)

test.enara.app stays frozen. No secrets are asked for or printed.

## What the code does today
- **Subjects:** the tutor teaches any course a school sets up (`Curriculum`: English, Maths, Science, Arabic on lms-test). Since `gradeAllSubjects`, chat answers in every subject are graded and feed errors to work on, spaced review and session summaries.
  - A session, a lesson and an error each carry their `courseId`.
  - A test result carries its `subject`.
- **Parent screens** (`frontend/parents/screens`) and their data (`backend/src/parents/service.ts`):
  - **Home:** level, "this week worked on", try at home, upcoming. The level is English (CEFR) only.
  - **Progress:** CEFR ladder, can-dos, strengths, results and lesson count. Results already wait for teacher release.
  - **Activity:** calendar and sessions from every subject, but with no subject named.
  - **Errors to work on** and **interests:** every subject, mixed together.
  - **Weekly email:** one per parent, a part per child. It holds an English level and one English tip.

## What I'll build
1. **Server (one new list, then each screen takes a subject):**
   - `GET /parents/learners/:id/subjects` lists the subjects the child has activity in, with nothing for a subject with no activity. Activity means a lesson done, a session, a result, or an error to work on.
   - Home, progress and activity take `?subject=` to show one subject; with none they show "All subjects".
2. **Per subject:**
   - progress: lessons done, outcomes mastered of total;
   - released results only (the current rule, unchanged);
   - points to practise (errors to work on for that course);
   - recent sessions;
   - next: the next lesson in the course and the next assignment due.
   - **English** keeps the CEFR level view.
   - **Other subjects** show their own outcomes, with a level from the share mastered: Starting / Developing / Secure / Mastered (Arabic: بداية / في تقدم / متمكن / متقن).
3. **"All subjects" overview:** one small card per subject (progress bar, latest released result, points to practise count), plus this week's minutes across all subjects.
4. **Phone first:** a row of subject chips under the child picker. It scrolls sideways on a phone, keeps the order in Arabic right-to-left, and has "All subjects" first. Each tab shows the chosen subject.
5. **Weekly email:** still one email per parent with a part per child. Each child's part now lists every active subject on one line each: minutes, lessons and the latest released result. English keeps its level.
6. **Unchanged:** release rule, several children, both guardians, Arabic and English, school switches.
7. **Seed:** most seeded children already study 2–4 subjects. I'll add released and waiting results plus errors in every subject for one parent's child with 3 subjects, so it can be seen.
8. **Tests:**
   - Unit tests: the subject list (no-activity subjects left out), the level bands, the hidden unreleased results per subject, and the email covering all subjects.
   - E2E: a parent with a child in 3 subjects sees all 3 chips; an unreleased result stays hidden.
9. Small PR, E2E must pass, live on lms-test, 3-line report.

## Open from the last plan
`docs/lms/SEED_FIXES_PLAN.md` asks whether to hide the placeholder parent cards ("Sample data"). This work doesn't depend on it. The new subject cards use only real data, so they carry no badge.

Waiting for your "go".
