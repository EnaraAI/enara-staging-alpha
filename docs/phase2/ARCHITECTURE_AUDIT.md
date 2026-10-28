# Phase 2 (ELIE): Architecture Audit

Verified against the code on branch `phase2-elie` (based on `connect-backend` at `96c0d1f`), 2026-10-24. Earlier documents (`docs/ARCHITECTURE_REVIEW.md`, `docs/PLATFORM_GUIDE.md`) were checked against the code, not trusted.

## Stack (verified)

| Layer | What the code shows |
|---|---|
| Backend | Express 4 + TypeScript, Mongoose 8 on MongoDB Atlas; one Vercel serverless function (`backend/src/vercel.ts`, region `arn1`). No ORM other than Mongoose; no queue or worker; Vercel Cron once a day (`/api/cron`). |
| Frontend | React 19 + Vite + Tailwind (CDN); no router: `App.tsx` switches on `state.page`; data through `frontend/services/apiService.ts` and the `/api/railway` proxy. |
| Auth | JWT HS256 (`auth/jwt.ts`), user re-read from DB each request; roles `student`, `teacher`, `admin`, `enara-admin`; guards `requireStudent`, `requireTeacher`, `requireAdmin`, `requireRole`. |
| Tenancy | `scopedFilter(req, filter)` adds `institutionId` except for `enara-admin`; `resolveWriteInstitutionId` for writes. Teachers are linked to classes by `CourseInstance.instructorIds`. |
| AI | Claude via `@anthropic-ai/sdk` (`directTutorModel.ts`, chat `claude-opus-5-5`, voice/visuals `claude-haiku-5-5`); ElevenLabs speech; Anam avatar. Every call recorded in `ai_calls` (Phase 0). |
| Tests / CI | Vitest + supertest + mongodb-memory-server, 103 backend tests; no frontend tests. CI (`deploy-vercel.yml`) runs typecheck, tests, frontend build and a bundle secret scan, then deploys on push to `main`/`connect-backend`. |
| Migrations | `backend/src/migrations` runner with lock, applied on start-up (Phase 0). |
| Feature flags | **None exist.** |

## Findings

### Existing and reusable
- **Learning events** (`models/LearningEvent.ts`, Phase 1): append-only, written by lesson completion, assessment start/answer/submit, review answers, tutor chat and voice turns; `verified` and `gradedBy`; school-scoped explorer API; backfill migration.
- **Assessment grading**: server-side (`meAssessment.controller.ts`), answer key stripped for students (`assessmentSecurity.ts`), attempt limits, atomic submit. Questions have `topic`, `type`, `options`, `correctAnswer`.
- **Spaced review** (`ReviewItem`, `reviewService.ts`): per-question items from missed quiz questions, fixed intervals, `sourceKey = assessmentId:questionId`.
- **Learner snapshot** (`learnerSnapshot.ts`) and next steps (`nextStepsService.ts`): weak topics from quiz answers, used by the tutor prompts.
- **Tutor**: chat (`tutor.controller.ts`, `tutorExtras.controller.ts`), voice (`avatar.controller.ts`), messages in `tutor_messages`, prompt building with curriculum and lesson materials (`directTutorModel.ts`).
- **Teaching method** already exists per chat (`socratic`, `gap_filler`, `error_analysis`): a seed for the strategy registry.
- **Teacher scoping**: `teacherAttendance.controller.ts` shows the pattern for "only classes I instruct".
- **Analytics** (`analyticsService.ts`): school overview, per-course and per-student reports from real records.
- **Migrations runner, AI call records, Mongo rate limiting, upload signing** (Phase 0).

### Existing but needs modification
- **LearningEvent** has no `idempotencyKey`, `schemaVersion`, `recordedAt`, objective links (`conceptIds` is always empty) or processing status. Writes are fire-and-forget after the main write (no outbox).
- **Assessment questions** have no objective link or difficulty; `topic` is free text.
- **Curriculum** chapters (lessons) have title, description and file URLs only: no objectives.
- **Short-answer grading** is exact string match; there is no partial credit.
- **Review items** are per question, not per objective.
- **Student** documents carry seeded "learning engine" fields (`adaptiveProfile`, `riskPrediction`, …) that are labelled "sample" in the UI; they must not feed ELIE.

### Missing
Learning objectives and prerequisite graph; evidence layer; mastery state and history; diagnostics; misconception records; strategy registry and decisions; interventions; TTU; objective-level retention; pathways; feature flags; teacher learning-insight APIs and UI; text extraction and chunking of curriculum files (files are sent whole to Claude, PDFs as document blocks).

### Blocked by dependency
- **Semantic retrieval**: needs an embeddings provider (none configured) and confirmation that the Atlas tier supports Vector Search. Keyword retrieval over extracted text is possible without either.
- **Text extraction of uploaded files**: the external ingestion engine (`ingestionService.ts`) needs Postgres, which the sandbox doesn't have. A local extraction step (PDF text) needs a library choice.
- **AI evaluation in Egyptian Arabic**: needs a reviewed evaluation set from people who can judge it.

### Risk or security issue
- **S1 (open, from Phase 0)**: public registration links a new account to an existing student record by email without verification. Any ELIE data (mastery, misconceptions) would be exposed by this takeover. Excluded from Phase 0 at the owner's request; still open.
- **No transactional outbox**: an action can commit without its event if the event write fails (logged, not retried). Mitigation in Sprint 1: deterministic idempotency keys and a re-derivation job, so missing events can be rebuilt from source records.
- **Deploy on push**: pushing to `connect-backend` deploys to the sandbox and runs migrations. Phase 2 work therefore lives on `phase2-elie` until deployment is approved.
- **Serverless limits**: no background worker; evidence processing and mastery recomputation must be fast inline operations or chunked cron jobs.
