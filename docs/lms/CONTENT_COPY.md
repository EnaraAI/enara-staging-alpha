# Copying learning content to the LMS test site (no personal data)

Approved by Mohamed on 2026-11-17 (B1). **Uploaded files are not copied** (B2: later).

## What is copied, and what is removed

| Collection | Copied | Removed or replaced |
|---|---|---|
| `curriculums` (courses, lessons, practice items, quizzes) | names, levels, languages, descriptions, lesson text, `languageSpec`, quiz questions | school, author, group names (`assignedBatches`), file links (`uploads` emptied), deployment link |
| `assessments`, `assessment_versions` | titles, instructions, questions, answer keys, rubrics, settings | who it was assigned to (`batchId`, `studentId`), school, authors |
| `learning_objectives` | codes, titles, descriptions, translations, levels, links between objectives | school, authors, approvers, `history` |
| `lesson_plans` | plans, sections, goals | school, authors, saved `versions` |
| `curriculum_chunks` (text taken from uploaded documents) | the text passages | school, file URL and upload ID; the file name becomes `document-N` |
| `tutorfaces` | course-level avatar choice | per-student rows are skipped |

**Never copied:** users, students, parents, groups, classes, enrollments, attempts, grades, tutor chats, attendance, emails, logs, usage or billing.

**Removed everywhere, at any depth:** `institutionId`, `createdBy`, `updatedBy`, `publishedBy`, `approvedBy`, `savedBy`, `uploadedBy`, `studentId(s)`, `batchId(s)`, `classId`, `teacherId`, `instructorIds`, `email`, `phone`, `userId`, `fileUrl`, `uploadId`.

**Personal-data scan:** the export holds back any record whose remaining text contains:
- the full name of a real user or student;
- a real email address;
- any email address;
- a phone number.

The report lists only the record ID, the field path and the kind of match, **never the text**.

## Run it (on your computer)

You need: this repo on branch `claude/multi-class-enrollment`, and Node 22 or later. In `backend/`, run `npm ci`.

1. **Create a read-only user on the real database.** Atlas → the real project → Database Access → Add user → Built-in role **"Only read any database"**. Give it a temporary name such as `content-export-readonly`. You'll delete it in step 6.
2. **Dry run.** This reads only and writes nothing:
   ```bash
   cd backend
   SOURCE_MONGODB_URI='mongodb+srv://content-export-readonly:PASSWORD@REAL-CLUSTER/enara_staging_alpha' npm run content:export
   ```
   Send me the printed report: counts, `heldBack` (IDs and paths only) and `filesReferenced`. **Don't send the connection string.**
3. **Export**, after we've looked at the report:
   ```bash
   SOURCE_MONGODB_URI='…same…' npm run content:export -- --write content-export.json
   ```
   This file contains content only. It is git-ignored; keep it on your computer.
4. **Import into the test site.** A dry run comes first:
   ```bash
   TARGET_MONGODB_URI='mongodb+srv://…enara-lms-test…/enara_staging_alpha' npm run content:import -- --file content-export.json
   TARGET_MONGODB_URI='…same…' npm run content:import -- --file content-export.json --apply
   ```
   The import refuses any database that isn't the LMS test cluster. Content goes to "Test School A (fake)", authored by its fake teacher.
5. **To undo** an import:
   ```bash
   TARGET_MONGODB_URI='…' npm run content:import -- --undo <exportId> --apply
   ```
6. **Delete** the read-only user in Atlas, and delete `content-export.json`.
