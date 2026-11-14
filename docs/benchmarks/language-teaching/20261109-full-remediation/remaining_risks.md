# Remaining risks and limitations

These are listed so nobody reads this remediation as more than it is.

## 1. Product (tutor)

| # | Risk | Why it remains | Mitigation / next step |
|---|---|---|---|
| 1 | **Live model compliance is unmeasured.** The answer-class policy, hint ladder, grounding rules and hidden assessment marker are delivered to the model as instructions. Whether the live tutor follows them was not measured. | No paid calls were made in this task. All route tests mock the SDK, and the fixture v2 dry run uses a scripted stand-in tutor. | Run fixture v2 live (paid; needs authorisation) and read the new telemetry: `markerStatus`, `qualityFlags` (`possible_answer_leak`, `contrast_pair_claim_mismatch`, `learner_quote_mismatch`, `lesson_item_not_presented`, `key_tutor_verdict_disagreement`). |
| 2 | **Verdicts for tutor-authored items come from the model.** Only lesson items with stored accepted answers get a deterministic verdict, and only a "correct" one. A wrong model verdict propagates into progression state. | Free-form items have no key. A second model call per turn was ruled out (cost and latency). | Monitor `key_tutor_verdict_disagreement` where keys exist. Prefer lesson items with keys for core practice. |
| 3 | **Missing-marker fallback.** If the model omits the marker, state falls back to the r3 prose reading for success, plus an invitation heuristic for item boundaries. | Compatibility with older messages and model drift. | `markerStatus: missing` is recorded per turn. Alert if its rate is above a threshold once live data exists. |
| 4 | **The state window is the last 12 messages** (the existing `slice(-12)`). A very long chain on one item could lose its hint history. | Kept to avoid widening the database read per turn. | Revisit if live sessions show long chains. |
| 5 | **Leak telemetry is narrow.** It flags only named target forms of lesson items before level 6. It does not catch rule-level hints ("go takes -es") or binary near-reveals. | A deterministic grammar or leak oracle was explicitly out of scope. | Educator review of sampled turns; rubric v2 D7. |
| 6 | **Grammar accuracy controls are prompt-level.** The rule-example and negative/affirmative rules are instructions; only the contrast-pair claim and attributed quotes have deterministic telemetry. | By design (no brittle regex rule collection, no extra AI call). | As 1. |
| 7 | **Language-turn metadata is visible in the student's own API responses** (`assistantMessage.meta.languageTurn`, now including assessment, active item ids and quality flags). | This has been part of the API contract since r1; removing it would break existing clients and tests. It contains no answer keys, item answers or identifiers. | Product decision: strip internal fields from student responses in a contract-versioned change. |
| 8 | **Teachers can only add lesson items through the existing curriculum API.** There is no editor UI for `items`. | UI work was out of scope. | Add the fields to the objective/lesson editor; the server already sanitises them. |
| 9 | The **instruction precedence line** applies to hints and answer reveal only. Its effect on the ped-v2 direct-instruction strategy is unmeasured. | Only a textual conflict was verified (hypothesis H-3). | Measure in a live run. |

## 2. Security and data

| # | Risk | Status |
|---|---|---|
| 10 | `GET /api/me/courses/:courseId/curriculum` returned raw curriculum chapters to students. Lesson-item answer keys would have leaked. | **Fixed** (items projected to id + prompt) and tested. |
| 11 | The same endpoint still returns other raw chapter fields, including the chapter `uploads` list **without** the download-eligibility filter that `buildCourseTree` applies. | **Pre-existing, not changed** (outside this remediation's scope). Recommend a separate review. |
| 12 | The new schema fields (`TutorMessage.meta.languageTurn.*`, `Curriculum.chapters.languageSpec.items`) are optional additions, so no migration was run. Older documents simply lack them. | By design; the engine treats missing fields as unknown. |

## 3. Measurement

| # | Risk | Status |
|---|---|---|
| 13 | **Fixture v2 has not been run live.** Static parity is 120/120 and the dry run passed, but tutor behaviour on v2 is unknown. | Requires a paid, authorised run. |
| 14 | **v2 results are not comparable to v1.0 headlines.** The tutor now receives items, and 9 T03 learner turns were revised. | Documented in the change log. Compare only like with like. |
| 15 | **No v2 judge/reviewer script consumes `evaluatorView` yet.** | The view is defined and validated. Writing and running a v2 judge is a paid-evaluation task. |
| 16 | **Rubric v2 is a draft** and has not been validated by educators. | `educator_review_pack.md` prepared; approval rule proposed. |
| 17 | **Repeated-run methodology** (k = 3 tutor runs; tutor vs judge variance) is specified but not executed. | Needs paid runs. |
| 18 | **The dry-run stand-in tutor is not a model.** It shows that items reach the tutor and answers route to the right item, not teaching quality. | Stated in the parity report. |

## 4. Process

| # | Item | Status |
|---|---|---|
| 19 | 16 backend tests fail in 11 files unrelated to the tutor. | **Pre-existing:** the identical 16 failures reproduce on a copy of the backend with all pre-remediation source files restored. Not touched. |
| 20 | Nothing is committed. All work is uncommitted in the working tree, on top of earlier uncommitted Phase 1 / Option B work. | As instructed (no commit or push). |
| 21 | The brief both forbids new paid AI calls (§14) and says "Do make paid AI calls if needed" (§16). | **No paid calls were made.** The final line was read as a probable typo for "do not". If paid evaluation is intended, it needs explicit authorisation with a cap. |
