# Phase 2 (ELIE): Decisions

Each decision records what the code showed and why. Newest last.

### D1. Extend the existing `learning_events` collection
The Phase 1 log already records the actions the spec lists. Rather than a second event store, it gains `schemaVersion`, `idempotencyKey` (unique, sparse), `recordedAt` and `objectiveIds`. Existing `type` values (`question_answered`, …) stay; the spec's dotted names (`learning.question.answered`) are a documented mapping, not a rename, so stored data and the explorer keep working. `at` is the occurrence time (`occurredAt`).

### D2. Learning objectives are the unit of the knowledge model
The spec's objectives replace the earlier plan's separate "concepts". One collection, `learning_objectives`, scoped to institution + curriculum, with prerequisites stored as ids on the objective (the graph is small per curriculum; no separate edge collection is needed). The unused `conceptIds` field on events is kept for compatibility and is not written.

### D3. Evidence is derived from events, never written by clients
`learning_evidence` rows are created by a server-side processor from verified events (one row per event × objective), keyed by `(sourceEventId, objectiveId)` so reprocessing never duplicates. Weights come from a versioned policy in code. AI output and browser-reported events never become evidence.

### D4. No outbox; recoverable instead
MongoDB transactions need a replica set (Atlas has one, mongodb-memory-server in tests does not by default), and the existing write paths aren't transactional. Instead: events get deterministic idempotency keys derived from the source record (e.g. `attempt:<id>:q:<qid>`), so a re-derivation job can rebuild any missing events from assessments, lessons and reviews without duplicates. Documented in `LEARNING_EVENT_SCHEMA.md`.

### D5. Feature flags on the institution
No flag system exists. Flags live in `Institution.features` (map of flag → boolean), read through one helper with a short cache; Enara admins set them. Default **off** for every school, so deploying ELIE changes nothing until a school is enabled. Disabling never deletes data.

### D6. Phase 2 work stays off the auto-deploying branch
Pushes to `connect-backend` deploy to the sandbox and run migrations. Phase 2 commits go to `phase2-elie`; a pull request into `connect-backend` runs CI without deploying. Merging (= sandbox deployment and migrations) waits for the owner's approval.

### D7. Deterministic, explainable algorithms first
Mastery, evidence strength, diagnostic selection, strategy choice, retention and TTU start as documented rules with version strings. Scores are labelled "estimates", not probabilities.

### D8. Question links apply to earlier answers of the same question
When a teacher links a question to an objective, answers already given to *that question* count for the objective: the source record (the graded answer) supports it, and otherwise schools with existing assessment data would start from nothing. The event's `objectiveIds` (a derived annotation, not the recorded action) gets the objective and the answer is processed into evidence. Unlinking removes the objective from those events and invalidates (keeps) the evidence. Nothing is inferred beyond the explicit link.

### D9. Teachers use the existing role checks; no teacher UI yet
There is no teacher layout in the frontend. Backend routes already scope teachers to classes they instruct (`learningAccess.ts`); teacher screens come with the teacher insights work (Sprint 5).

### D10. Teachers reach the staff pages through the existing admin layout
The frontend has no teacher layout and the login screen offers student, administrator and Enara administrator. Class Insights works for teachers (backend scopes it to classes they instruct), but a teacher must sign in through the Administrator tile, and other admin pages will refuse them. A proper teacher portal is outside Phase 2 and is listed as a follow-up.

### D11. Keyword retrieval, no embeddings in Phase 2
No embeddings provider is approved and Atlas Vector Search isn't set up. Retrieval is BM25 over normalised terms stored on each passage, with Arabic normalisation. It returns nothing rather than a weak match. Semantic retrieval can be added later behind the same `retrieveCurriculumSources` function.

### D12. Extraction runs in the background and in the daily job
Vercel functions have time limits, so uploads don't wait for extraction. Each file gets a job; the upload request starts processing in the background and the daily cron finishes the rest. Scanned PDFs are reported, not OCR'd.

### D13. Shadow mode is a school setting that hides results from students
Stage C needs estimates computed on real data without changing what students see. `learningSettings.shadowMode` (Enara admins only) makes every `/api/learning` route answer students as if the feature were off, and the tutor ignores objective context and course passages. Staff routes are unchanged, and a comparison report checks estimates against existing assessment scores.

### D14. Learning routes are rate-limited per verified user
A class doing diagnostics on one school network shares an IP address, and the general limit (300 a minute per IP) would throttle it. `/api/learning` skips the IP limiter and has its own limit of 240 a minute per user, applied after authentication so it can't be dodged with made-up tokens. The general limiter for other routes is unchanged (follow-up S2).
