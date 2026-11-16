# Changed files

**Baseline:** the working tree at preflight. Branch `claude/codebase-review-kbxqan`, HEAD `fc6a487d`, with earlier uncommitted Phase 1 / Option B work. Nothing was committed. Pre-change copies and per-file diffs are in `code_diffs/`; preflight hashes are in `implementation_manifest.json`.

Every changed or new file serves **product remediation** (P), **measurement remediation** (M) or **tests** (T). No file outside this list changed: preflight hashes of all 314 tracked inputs were re-verified, and a `find -newer` check shows nothing else touched.

## Modified (6)

| File | Kind | Diff (+/−) | What changed |
|---|---|---:|---|
| `backend/src/services/languageTeachingContext.ts` | P | +235 / −11 | Policy revision `ltc-v1-r4`. Lesson items in `LanguageSpec` and the sanitiser (`cleanItems`). r4 signals (structured state, exercise request, answer-key verdict, hint level, active/next lesson item). An open task from stored state counts as pending. New move `present_lesson_item`. Rewritten answer-class policy in `corrective_feedback_retry`; earlier protected phrases kept verbatim. Corrected strategy-shift text. `GROUNDING_RULES`, `ASSESSMENT_INSTRUCTION`, hint-precedence line, success-criteria status and `stateLines`. r4 evidence fields in `turnEvidence`. New pure `finalizeLanguageTurn` (verdict source order, active item after the reply, support level used, quality flags). |
| `backend/src/controllers/tutor.controller.ts` | P | +48 / −7 | Engine history now carries each stored `languageTurn` (the model still receives plain text only). The hidden marker is stripped on the JSON path (`stripAssessmentMarkers`) and on the SSE path (`AssessmentMarkerFilter`, chunk-safe). `finalizeLanguageTurn` merged into `meta.languageTurn`. The message id is generated before evidence. |
| `backend/src/models/TutorMessage.ts` | P | +16 / −0 | Optional `languageTurn` fields: `ageBandStatus`, `confirmedSuccessStreak`, `hintLevelOffered`, `hintLevel`, `keyVerdict`, `presentedLessonItemId`, `activeItemBefore`, `activeItem`, `assessment`, `qualityFlags`, `markerStatus`. No migration needed: older documents lack them. |
| `backend/src/models/Curriculum.ts` | P | +7 / −0 | Optional `languageSpec.items` (`id`, `prompt`, `acceptedAnswers`, `targetForms`, `criteria`). Original CRLF line endings preserved byte-for-byte. |
| `backend/src/controllers/me.controller.ts` | P (security) | +9 / −1 | `GET /api/me/courses/:courseId/curriculum` projects lesson items to `{id, prompt}` for students, so answer keys never reach them. Response shape otherwise unchanged. |
| `backend/test/languageTeachingR3.test.ts` | T | +1 / −1 | **The only change to an existing assertion:** the expected policy-revision literal `'ltc-v1-r3-ab1'` → `'ltc-v1-r4'`, because the revision really changed. All other existing assertions pass unmodified (protected wording kept verbatim in the new texts). |

## New (8 code/test + documentation)

| File | Kind | Lines | Purpose |
|---|---|---:|---|
| `backend/src/services/languageLearningState.ts` | P | 373 | Pure module. Verdict / relevance / next-task types; marker format, parse, chunk-safe `AssessmentMarkerFilter`, `stripAssessmentMarkers`; answer-key evaluation (success-only); `deriveLearningState` (item-scoped, session-derived); hint ladder (`HINT_LADDER`, `selectHintLevel`, `hintInstruction`); telemetry (`contrastPairClaimMismatch`, `learnerQuoteMismatches`, `possibleAnswerLeak`). |
| `backend/test/languageTeachingR4.test.ts` | T | ~550 | Unit, replay and route tests for workstreams A, B, C, D and G (34 tests). |
| `backend/test/benchmarkFixtureV2.test.ts` | T | 92 | Builder, fixture integrity and parity-validator tests, including 11 negative cases (16 tests). |
| `backend/benchmarks/ltc-v2/build_fixture_v2.mjs` | M | ~150 | `ltb-fixture-v2` builder from the frozen v1.0 set (read-only). |
| `backend/benchmarks/ltc-v2/validate_parity.mjs` | M | 113 | Information-parity validator (v2 records and v1.0-as-run views). |
| `backend/benchmarks/ltc-v2/run_fixture_v2.ts` | M | 296 | Fixture v2 harness on the real route. Dry by default with runtime-parity records; live mode refused without `--authorized-paid-run`. |
| `docs/benchmarks/language-teaching/20261109-full-remediation/**` | M / docs | — | This report set, `rubric_v2_draft.{md,json}`, `fixture_v2/` (fixture, manifest, mapping, changelog, parity reports, dry run), `code_diffs/`. |

## Not changed (verified)

- **Historical artifacts:** all v1.0 benchmark artifacts and every earlier run directory (baseline, r1, r2, r3, ageband), the AI review and the diagnostic, all byte-identical to preflight.
- **Rubric and scorer:** `ltb-rubric-v1` / `ltb-scoring-v1` and the frozen v1 harness (`backend/benchmarks/ltc-v1/*`).
- **Frontend:** no file changed. Nothing under `frontend/` was touched by this work; its uncommitted changes predate this work.
- **Platform settings:** provider configuration, budgets, spend controls, `AI_TEST_SPEND_ID`, permissions and tenant scoping.
