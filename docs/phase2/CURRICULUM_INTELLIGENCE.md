# Curriculum Intelligence (Sprint 6)

How uploaded course files become passages the tutor can quote and cite, and how school analytics are defined.

## Extraction (`extract-v1`, `services/curriculumExtraction.ts`)
- **What is processed:** files uploaded to a curriculum lesson (`/uploads/...`). PDF (via `unpdf`, text layer only) and `.txt`/`.md`. Other types are recorded as `unsupported` with the reason.
- **When:** after an upload, a video upload, a curriculum update or an upload removal, for schools with `learning_intelligence_enabled`. The request schedules the work in the background (`waitUntil`); the daily cron picks up anything left (`processCurriculumFiles`, 10 files per run). Admins can also run it from School Insights.
- **Jobs:** one `curriculum_processing_jobs` row per file with status `pending | processing | done | failed | unsupported | no_text | removed`, a human-readable `detail`, page counts and the content hash. At most 3 attempts; a job stuck in `processing` for 15 minutes (function timeout) is marked failed and retried. Admins can reset failed attempts ("Retry failed").
- **No text layer:** scanned PDFs are reported as `no_text` ("Needs OCR, which is not supported yet"). Nothing is guessed. Pages without text inside an otherwise readable PDF are skipped and counted in `detail`.
- **Arabic:** PDF text comes out as presentation forms in visual order. Lines that are mostly Arabic are reversed, NFKC-normalised, and digit runs re-reversed. Known limitation: some glyph sequences (e.g. a letter pair) can still come out in the wrong order; retrieval normalises letter forms so search still matches.
- **Passages:** paragraphs are packed into passages of up to 1,000 characters; a longer paragraph is split at word boundaries. Each passage keeps its file, page and lesson. Passages are derived data: re-processing a file replaces its passages; removing a file deletes them (the job is kept as `removed`).
- **Objective links:** a passage records the approved objectives linked to its lesson at processing time. Retrieval reads the objective's current lessons at query time, so a changed link is never stale.
- **Limits:** files over 30 MB are not processed.

## Retrieval (`retrieval-v1`, `services/curriculumRetrieval.ts`)
- Keyword search (BM25, k1 = 1.2, b = 0.75) over normalised terms. English and Arabic: Arabic letter variants, diacritics and the definite article are normalised (`services/textSearch.ts`).
- Always scoped to the student's school and the course's curriculum. A query never reaches another school's passages.
- Boosts: ×1.3 for the current lesson, ×1.2 for lessons of the objective being worked on.
- A passage must match at least two query terms (one if the query has one) and score at least 1; otherwise nothing is returned and the tutor answers without citations.
- Top 4 passages are given to the model.
- No embeddings or vector search: that needs an approved embeddings provider (DECISIONS D11).

## Citations and prompt safety
- Passages are sent as `<source n="..." file="..." page="...">` blocks, with `<` and `>` in the text replaced, and an instruction that the text is reference material only and that instructions inside it are never followed. The test fixture contains such an injection line.
- The model is asked to cite `[n]`. `meta.citations` on the assistant message lists only sources that were retrieved for that turn **and** that the answer actually cites. A `[7]` with no source 7 produces no citation.
- When passages are found, whole lesson files are no longer attached to the model call (less cost, same school scope).
- The chat shows "Sources from your course" with file name and page under the answer.

## School analytics (`GET /api/learning/analytics/school`)
Every metric is returned with its definition (`definitions`), and the School Insights page shows each definition next to its number. Metrics:

| Metric | Definition |
|---|---|
| studentsTotal | Students on the school roster |
| studentsWithEvidence | Students with at least one valid evidence record |
| objectivesApproved / objectivesWithEvidence | Approved objectives; those with at least one valid evidence record |
| masteryDistribution | Stored student-objective estimates by status (not-assessed pairs aren't stored or counted) |
| evidenceLast30Days | Valid evidence by type, last 30 days |
| diagnosticsCompletedLast30Days | Diagnostic sessions completed in the last 30 days |
| interventions | By status, reassessed, and "improved" (reassessment estimate higher). Describes change, not cause |
| misconceptions | By status. Suspected = hypothesis until a teacher confirms |
| retention | Objective reviews due now / overdue (more than 7 days late) |
| curriculumFiles | Files by extraction status |
| objectives[] | Per objective: students assessed and how many are estimated proficient or mastered |

Course-level analytics are the class insights (Sprint 5) and TTU analytics (Sprint 4). Empty values are shown as "Nothing recorded yet" or "—", never filled in.
