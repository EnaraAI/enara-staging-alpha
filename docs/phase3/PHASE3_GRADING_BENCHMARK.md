# Phase 3: Grading Reliability Benchmark

How Enara measures whether automatic grading of subjective answers is reliable enough to release without a teacher, and what has been measured so far.

## Method
- **Harness:** `backend/src/scripts/gradingBenchmark.ts` (`npm run benchmark:grading`). It runs the production grader functions (`evaluateOpen`, `evaluateShort` in `services/autoGrading.ts`). These are the same prompts, the same double evaluation with its consistency check and third evaluation, and the same output validation. It runs against a throwaway in-memory database and makes real AI calls.
- **Set:** `backend/test/fixtures/grading-benchmark.json` (`bench-v1`).
  - Four open questions with two-criterion rubrics (maximum 4 points each): fractions and density in English, fractions and the water cycle in Arabic.
  - 28 responses: 16 English and 12 Arabic. They range from complete, through partial, to misconceptions and off-topic answers.
  - 10 short answers in English and Arabic, testing equivalent forms (`.5`, `CO2`, Arabic-Indic digits) and wrong answers.
- **Metrics, per language:**
  - exact agreement on the question total;
  - agreement on each criterion level, exact and within one level;
  - mean absolute error and mean signed error (bias), as a share of the maximum;
  - quadratic weighted kappa (QWK) on totals;
  - exception rate (responses the grader refused to grade);
  - short-answer accuracy.
- **Output:** each run writes the full row-level results (`--out`). The run below is at `docs/phase3/benchmark/grading-benchmark-results.json`.

## Release criteria
Automatic release of subjective grades counts as **validated** for a language only when a benchmark scored by teachers meets all of these. The bars are set close to what two trained teachers usually reach with each other.

| Criterion | Bar |
|---|---|
| Reference scores | From at least 2 teachers per response, with disagreements settled. Teacher-to-teacher agreement is reported next to the grader's numbers |
| Size | ≥ 30 open responses per language, from ≥ 3 questions, from real student work (anonymised) |
| Exact agreement on totals | ≥ 70 % |
| Criterion level within one level | ≥ 95 % |
| Mean absolute error | ≤ 10 % of the maximum |
| Bias (mean signed error) | within ±5 % of the maximum |
| QWK on totals | ≥ 0.80, and not more than 0.05 below teacher-to-teacher QWK |
| Exception rate | ≤ 5 % |
| Short-answer accuracy | ≥ 95 % |

Until a school's subjects and languages have passed, the safeguards in `PHASE3_AI_SAFEGUARDS.md` still hold:
- every grade passes validation before release;
- AI-graded evidence counts at weight 0.8;
- teachers can correct any grade and answer appeals;
- the ops page shows how often released AI grades get corrected.

## Results so far (run 2026-10-25, model `claude-opus-5-5`, set `bench-v1`)
**The reference scores in `bench-v1` were written by the engineering team, not by teachers.** These numbers show how the grader agrees with that provisional key. They do **not** show reliability against teachers, and they do not meet the "Reference scores" and "Size" criteria above.

| Metric | English (16 open, 6 short) | Arabic (12 open, 4 short) |
|---|---|---|
| Exceptions | 0 | 0 |
| Exact agreement on totals | 0.938 (15/16) | 0.917 (11/12) |
| Criterion exact / within one level | 0.969 / 1.000 | 0.958 / 1.000 |
| Mean absolute error (share of max) | 0.016 | 0.021 |
| Mean signed error (share of max) | −0.016 | +0.021 |
| QWK on totals | 0.988 | 0.985 |
| Short-answer accuracy | 6/6 | 4/4 |

**Disagreements:**
- `en-i-7` ("Density is mass divided by volume. Ice takes up more space…"): reference 2, grader 1. The grader judged the density idea as missing, where the reference had partial. The two evaluations gave 1 and 2, which counted as agreeing; the first was used.
- `ar-w-6` ("the moon pulls water up and it falls as rain"): reference 0, grader 1. The grader gave partial credit for stages, even though the answer rests on a misconception.

No response needed a third evaluation. Cost was about $0.003–0.007 per AI call (from `trackAiCall`).

**Status: not validated.** The harness, criteria and a first provisional run exist. What is missing is teacher-scored real responses (≥ 30 per language). Collecting them is the next step before relying on automatic release for subjective questions in a pilot.
