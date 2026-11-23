# Re-calibrating the language rubric to the human markers' scale — plan

_23 Nov 2026. Plan only: waiting for Mohamed's "go". lms-test only. No switch, no fine-tuning. Decision taken: **adopt the human markers' scale** (ELLIPSE and LAILA), as measured this morning._

## Why
On human-scored essays, today's grader is far harsher than people on grammar and spelling/punctuation, and too generous on English organisation (averages out of 2):

| | Grader | Markers |
|---|---|---|
| English grammar | 0.44 | 0.90 |
| English spelling/punctuation | 0.20 | 0.84 |
| English organisation | 1.41 | 0.92 |
| Arabic grammar | 0.27 | 0.96 |
| Arabic spelling/punctuation | 0.23 | 0.99 |
| Arabic task completion | 1.33 | 1.78 |

The cause is in our own instructions (engine-v2 anchors, `grading-engine/graders/domains/index.ts`): "the lowest level when errors appear in most sentences (even if the meaning can still be guessed)".

## What the markers' scale means on ENARA's 0–2 levels
The same bins as all measurements today: ELLIPSE 1–2.5 → 0, 3–3.5 → 1, 4–5 → 2; LAILA 0–1 → 0, 2–3 → 1, 4–5 → 2.

| Criterion | Level 0 | Level 1 | Level 2 |
|---|---|---|---|
| Grammar | Errors in most sentences **block or seriously blur** the meaning | Frequent errors, **but the meaning stays clear** | Occasional errors that do not distract; some complex sentences |
| Spelling/punctuation | Errors so many that reading is hard | Noticeable errors; reading is not hard | Few errors |
| Vocabulary | Very basic or repeated words; wrong words blur meaning | Adequate everyday words for the topic | Varied, precise words, some less common |
| Organisation | No clear order | **Basic order with simple linking (and, then, because)** | Ideas developed across paragraphs with varied linking |
| Task completion | Off the task | Part of the task | **Main point of the task answered**, even if one detail is thin |

Two-level criteria on short answers (0–1): grammar and spelling are 1 unless the errors block the meaning.

## Steps
1. **Rewrite the level descriptions and anchors** (`rubrics/templates.ts` and the engine-v2 anchors) to the table above, in English and Arabic.
   - "Errors in most sentences → lowest level" is removed.
   - Organisation's top level is tightened.
   - Task completion's top level is loosened.
2. **Re-level ENARA's language benchmark reference scores** (`data/assessment-bench/language`, 180 answers) to the new descriptions. They were written to the strict rubric, so they must move with it. These scores stay provisional until teachers mark answers.
3. **Measure before shipping:** run the re-calibrated grader offline, through the same relay as today, so nothing changes on lms-test.
   - **On human-scored essays** (the same 200 per language), the reference scale. It should match the markers' averages within 0.15 and reach QWK at least today's and at least 0.40 per criterion.
   - **On the re-levelled ENARA benchmark:** within 1 point of the reference at least 0.85 per set (the existing bar).
   - **Side by side with the trained scorers:** both on the same scale now.
4. **Ship as one PR** with the full E2E suite. It is deployed to lms-test only after your go on the numbers. There is no switch: the rubric simply changes for the language grader.
5. **Teacher check:** ask 1–2 teachers to mark 10–20 answers per language on the new descriptions. This is the first real teacher-marked set; none exists today.

## Risks
- **Too lenient for younger learners.** The markers' scale comes from grades 8–12. If our teachers find level 1 grammar too generous for primary pupils, a per-level note can tighten it later.
- **Learners' scores rise.** Grades in language essays will go up on lms-test (grammar and spelling mostly). Error codes ("errors to work on") stay the same, so practice is not lost.
- **Benchmark drift.** Re-levelled reference scores are agent-written until teachers mark them.

**Needs your "go"** for steps 1–4.
