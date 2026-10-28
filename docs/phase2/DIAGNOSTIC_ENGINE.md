# Diagnostic Engine (diag-v1)

Code: `services/diagnosticEngine.ts` (pure selection), `controllers/learningDiagnostics.controller.ts`. Collection `diagnostic_sessions`. Flag: `diagnostics_enabled`.

## Flow
1. Student starts a check for a course they are enrolled in (`POST /api/learning/diagnostics`), optionally for specific objectives; an open check for the same course is resumed (unique open-session index).
2. The server picks a question and stores it as `currentItem`; the student gets only text and options (no key, explanation, tags or distractors).
3. The answer is accepted only for the current question, claimed atomically; a repeat returns the same state (`duplicate: true`) instead of advancing twice.
4. Grading uses the same rule as assessments (`gradeAnswer`). The answer becomes a `question_answered` event (source `diagnostic`, verified, rule-graded), then evidence (`diagnostic`, weight 1.0) and mastery.
5. The next question is selected, or the session stops. No right/wrong feedback is shown until the report.

## Question pool
Multiple-choice and true/false questions from the school's assessments for the curriculum, tagged with a target objective. Short answers are excluded (exact-match grading is unreliable).

## Selection rules
See the header of `diagnosticEngine.ts`: two answers per objective (three if mixed); prerequisites first; dependants of a prerequisite gap are not asked; fewest answers then least prior evidence first; unseen questions first; difficulty starts at 3 and moves ±1 with each answer. Each choice is stored with its reason in `decisions`.

## Stopping
`max_questions` (school setting, default 12, 3–30), `max_duration` (default 30 min, checked on every request), `enough_evidence` (all objectives settled or blocked), `pool_exhausted`, `student_ended`. Results can be inconclusive.

## Report
Per objective: answers and result in this check (`secure`, `gap`, `mixed`, `inconclusive`), prerequisite that blocked it, current mastery estimate and evidence strength (heuristic), weak prerequisites, possible misconceptions (with heuristic confidence), and a fixed-rule recommendation (`review_prerequisite`, `practise`, `reassess`, `move_on`, `needs_assessment`). No AI produces the numbers.

## Access
Students: their own. Staff (teacher of the student, school admin): read state and report, but not the live question, and cannot answer.
