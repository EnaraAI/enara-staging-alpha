# Gate C: lesson context, API security and fixture parity

**Result: PARTIAL.**
- **Student APIs:** no answer-key exposure. Cross-class, cross-school and staff boundaries hold.
- **Fixture v2 parity:** holds statically, and the dry run reproduces.
- **Evaluator integration is incomplete:** no v2 judge or reviewer consumes `evaluatorView` (POST-13, P1 for measurement readiness).
- **One pre-existing exposure** is reported separately: non-downloadable upload paths (POST-14).

## 1. Student-facing curriculum endpoints: field-level inventory

**Endpoints reviewed:**
- `me.routes.ts:102-105`: `/api/me/courses`, `/api/me/courses/:courseId`, `/api/me/courses/:courseId/curriculum`, `/api/me/courses/:courseId/lessons/:lessonId`.
- Other serialisers of curricula:
  - `assignments.controller.ts:346` selects only `id name chapters.id chapters.title`;
  - `courseInstance.controller.ts` and `batch.controller.ts` are behind `requireAdmin` (`courseInstance.routes.ts:17`, `batch.routes.ts:13`);
  - the tutor session API returns `meta.languageTurn`, which contains no answers.

| Field | Where students see it | Classification | Status |
|---|---|---|---|
| lesson id, title, description, status, order, materials (filtered) | course tree, lesson | Student-visible | OK |
| `languageSpec.objectives`, `successCriteria`, `vocabulary`, `grammar`, `functions`, `skills`, `examples` | curriculum context (`me.controller.ts:121-139`) | Student-visible (learning goals); acceptable, was visible before r4 | OK |
| `languageSpec.items[].id`, `prompt` | curriculum context | Student-visible (exercise text) | OK |
| `languageSpec.items[].acceptedAnswers`, `targetForms`, `criteria` | **never** (projected out, `me.controller.ts:141-147`) | **Secret assessment data** | OK (CA-01..04) |
| chapter `uploads` (raw paths, including non-downloadable / unscanned files) | **curriculum context lists them**; the course tree withholds them | File metadata; should follow the download-eligibility filter | **PRE-EXISTING exposure (POST-14, CA-11)** |
| `enaraSectionId`, internal chapter ids | course tree / context | Internal-only identifiers (low risk) | Informational |
| full curriculum incl. answers | `/api/curriculums/:id` | Teacher (author) / admin only | OK: student 403 (CA-05); other-school teacher 404 (CA-09) |

**Authorisation tests (`scenarios/route.json`):**

| # | Scenario | Result |
|---|---|---|
| CA-01..04 | Enrolled student on all four endpoints | 200, no secrets |
| CA-05 | Student on the staff endpoint | 403 |
| CA-06 | Student of another class | 4xx on course and curriculum |
| CA-07 | Student of another school | 4xx |
| CA-08 | Author teacher | Sees answers (by design) |
| CA-09 / CA-10 | Teacher of another school, read / write | 404 / 404 |

**No role permission was changed by the remediation.** The diff touches only `me.controller.ts` (projection) and models.

## 2. Lesson-item sanitisation (11 scenarios: 10 PASS, 1 P3)

Results for `sanitizeLanguageSpec` → `cleanItems`:

| # | Scenario | Result |
|---|---|---|
| LS-01 | Max 20 items | PASS |
| LS-02 | Prompt capped at 300 | PASS |
| LS-03 | Invalid ids dropped | PASS |
| LS-04 | Duplicates (first kept) | PASS |
| LS-05 | Missing / blank prompt | PASS |
| LS-06 | Unexpected fields (incl. `$where`) stripped | PASS |
| LS-07 | Non-string answers and non-array target forms filtered | PASS |
| LS-08 | 10-answer cap | PASS |
| LS-09 | Empty list | PASS |
| LS-10 | Arabic prompt preserved | PASS |
| **LS-11** | **A teacher item prompt containing `</language_teaching_context>` and a marker is inserted verbatim. The block delimiter is not escaped (three closing tags in the rendered block).** | **POST-15, P3.** Teacher-authored text is already trusted in prompts; the fix is to neutralise `<`, `>` and `[[` in item prompts at render time. |

**Ownership:**
- Item edits go through `PATCH /api/curriculums/:id` with `curriculumScope(..., 'write')`, which is author-only (`curriculum.controller.ts:71, 183`).
- A cross-school teacher is refused (CA-10).
- **No editor UI exists.** This limitation is confirmed (no frontend reference to `items`).

## 3. Fixture v2 parity (`scenarios/parity.json`)

| # | Check | Result |
|---|---|---|
| PA-01 | Validator on v2, re-run independently | 0 / 120 failures |
| PA-02 | Validator reproduces the v1.0 defect | 54 unseen-exercise cases |
| PA-03 | 120 records, 120 unique v1 ids, every `v1Sha256` equal to its v1.0 line hash | PASS |
| PA-04 | 219 learner turns, all with a declared target | PASS |
| PA-05 | No answer fields in `tutorView` / `evaluatorView` | PASS |
| PA-06 | `evaluatorView.lesson == tutorView` (120/120) | PASS |
| PA-07 | `tutorView` items are exactly the delivered items reduced to id + prompt | PASS |
| PA-08 | 9 revisions, all T03, all traceable (original text equals the v1.0 turn) | PASS |
| PA-09 | File hash equals the manifest; an in-memory rebuild is byte-identical (reproducible) | PASS |

### The nine T03 revisions

| Cases | v1.0 → v2 | Why it was necessary | Effect on difficulty / answerability / comparability |
|---|---|---|---|
| CA1, TA1, AA1 | "Is my brother mother." → "This is my brother. Mother is twelve." | v1.0 did not answer any exercise. v2 needs an attempt at `ex1` to keep parity. | Same error class (a meaning-blocking noun/pronoun confusion). **Slightly easier to diagnose**, because the frame is now recognisable. Not comparable 1:1. |
| CA2, TA2, AA2 | "Yesterday she go school and every day she went to bed late." → "Yesterday she go to bed and every day she went to bed at ten." | Ties the attempt to `ex1` ("She go to bed at ten") | Same tense / time-marker confusion; similar difficulty |
| CB1, TB1, AB1 | adds "in Aswan" | Ties the attempt to `ex1` | Effectively unchanged |

**What the 120/120 result proves:** fixture parity only. It says nothing about tutor quality.

## 4. Evaluator integration

| # | Check | Result |
|---|---|---|
| PA-10 | Any judge or reviewer script consuming `evaluatorView` | **0 found (FAIL)**. Files inspected: `backend/benchmarks/ltc-v1/{judge.ts, run.ts, run_trusted_age.ts, score.mjs, cases.mjs}`, `backend/benchmarks/ltc-v2/{build_fixture_v2.mjs, validate_parity.mjs, run_fixture_v2.ts}`. |
| PA-11 | `judge.ts` and the AI-review `blind_review.ts` | Both still build the evaluator input with `lesson: c.lesson`, i.e. the full v1 lesson including the exercise and next item. Run on v2 records, they would not even find `c.lesson` (v2 uses `lessonDelivered` / `evaluatorView`). |

**Conclusion:** parity is enforceable in the data, but **not wired into any evaluator**. A live v2 benchmark cannot be scored with parity until a v2 judge and a v2 reviewer read `evaluatorView` only. That is POST-13. No existing evaluation script was modified.

## 5. Dry-run reproduction (zero cost)

```
npx tsx benchmarks/ltc-v2/run_fixture_v2.ts --mode dry \
  --cases ../docs/benchmarks/language-teaching/20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl \
  --out ../docs/benchmarks/language-teaching/20261109-post-remediation-validation/dry_run_reproduction
```

**Exit 0.**

| Measure | Result |
|---|---|
| Turns | 219 / 219, HTTP 200 |
| Lesson-item turns | 72 |
| Tutor saw the target | 72 / 72 |
| Routing | `ex1` → `ex1` 54; `ex2` → `ex2` 18 |
| Accepted answers in system prompts | 0 |
| Markers visible | 0 |
| Identifier leaks | 0 |
| Cost / blocked outbound / provider calls | $0 / 0 / none |

**Pre-run safety check:**
- dry mode is the default (`run_fixture_v2.ts:31`);
- the key is a fake string (`:155`);
- `fetch` to `api.anthropic.com` is intercepted and other hosts are blocked (`:93-94`);
- live mode requires `--authorized-paid-run` (`:32`).

**The stand-in tutor only follows engine instructions.** This proves plumbing, not model behaviour.

## 6. Gate C decision

**PARTIAL.**
- **No P0** student-data or answer-key exposure.
- **POST-13 blocks measurement readiness** (no v2 evaluator).
- **POST-14** (pre-existing upload-path exposure) and **POST-15** (delimiter) are open.
