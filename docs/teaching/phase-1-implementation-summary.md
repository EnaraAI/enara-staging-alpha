# Phase 1 Implementation Summary (`ltc-v1`)

All changes are uncommitted in the working tree on `claude/codebase-review-kbxqan` (HEAD `fc6a487`).

## New files

| Path | What it is |
|---|---|
| `backend/src/services/languageTeachingContext.ts` | The engine:<br>• labelled learner context;<br>• lesson context from optional specs;<br>• deterministic turn signals (English and Arabic);<br>• pure move selection, each move citing ledger IDs;<br>• the versioned prompt block;<br>• the minimal non-mastery turn record;<br>• tenant-scoped assembly that returns null on any error |
| `backend/test/languageTeachingContext.test.ts` | 31 tests: context, moves, prompt, record, API route, privacy, tenant isolation, enrolment re-check, stream route, curriculum API, and a regression test for the live-run detection fixes |
| `docs/teaching/phase-1-evidence-ledger.md` | Verified sources, decisions LTC-D1 to LTC-D13, statuses, validation measures |
| `docs/architecture/language-teaching-context-engine.md` | Architecture, trust boundaries, schemas, data flow, fallbacks |
| `docs/teaching/phase-1-validation-report.md` | Tests run, baseline comparison, paid-evaluation status, limitations |

## Changed files

| Path | Change |
|---|---|
| `backend/src/controllers/tutor.controller.ts` | Builds the language context for chat and stream turns, only from a curriculum resolved and enrolment-checked in the same turn. A language turn uses the direct model. The reply stores `meta.languageTurn` |
| `backend/src/services/directTutorModel.ts` | New `languageContext` request field, added as one system block |
| `backend/src/models/TutorMessage.ts` | Schema for `meta.languageTurn` |
| `backend/src/models/Curriculum.ts` | Optional `chapters[].languageSpec`. The file's original mixed line endings are kept |
| `backend/src/controllers/curriculum.controller.ts` | Keeps `languageSpec` on create and update, cleaned and capped |
| `backend/src/services/learnerSnapshot.ts` | The model-facing snapshot text no longer includes the student's name |
| `backend/src/controllers/avatar.controller.ts` | The voice opening greets without the student's name |
| `backend/src/services/learningContext.ts` | `ObjectiveContext` now also returns the objective's mastery status (read-only), so moves can fade support for proficient learners |
| `backend/src/services/demoTemplate.ts` | Original lesson specs for the four demo lessons |

Size of the change: 9 files changed (133 insertions, 7 deletions), plus the new files above.

## Evaluation

The live evaluation (11 synthetic cases on unpromoted staging deployments, $0.45 metered) is in `docs/teaching/phase-1-validation-report.md`, section 4.
