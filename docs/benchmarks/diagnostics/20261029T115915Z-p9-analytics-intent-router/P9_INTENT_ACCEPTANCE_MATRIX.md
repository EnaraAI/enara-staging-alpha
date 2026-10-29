# P9 analytics intent acceptance matrix

Path:
- **patterns**: the deterministic fast path, with no model call.
- **model (mocked)**: the P9 router. In these tests the Anthropic SDK is a scripted mock; the real gateway, P0d budget and usage ledger run underneath it.

All results come from `backend/test/educatorAnalytics.test.ts` (patterns) and `backend/test/p9AnalyticsRouter.test.ts` (router), synthetic fixtures only.

**What the model-path rows prove:** for each model-path row, the test asserts that the question misses the fixed patterns. **The mock returns the intent; the numbers are computed by the backend.** These rows therefore show that the pipeline is safe and correct. They do **not** show that a real model would classify these phrasings correctly; that needs the separately approved live test (report §9).

## Supported phrasings

| Intent | Language | Example | Path | Expected outcome (asserted) |
|---|---|---|---|---|
| class_performance_summary | EN | "Generate a class performance report for the last month" | patterns | report |
| class_performance_summary | AR | "اعمل تقرير أداء الفصل خلال آخر شهر" | patterns | report |
| class_performance_summary | EN | "How are my kids doing lately?" | model (mocked) | report; mean 75.6% (n = 9), interpretedBy = model |
| class_performance_summary | AR | "كيف حال أولادي هذه الأيام؟" | model (mocked) | report, Arabic |
| class_performance_summary (submission rate) | AR | "قارن نسبة التسليم بين الفصول في رسم أعمدة" | patterns | bar chart of submission rate |
| assessment_trend | EN | "Show the trend of class scores over the last 3 assessments" | patterns | line chart |
| assessment_trend | AR | "ارسم تطور درجات الفصل خلال آخر 3 تقييمات" | patterns | line chart |
| assessment_trend | EN | "Is Grade 5 Science on an upward path lately?" | model (mocked) | line [73.3, 80, 66.7] |
| assessment_trend | AR | "هل Grade 5 Science في تحسن مؤخرا؟" | model (mocked) | line chart |
| student_progress_comparison | EN | "Which students declined over the last 3 assessments?" | patterns | table |
| student_progress_comparison | AR | "مين الطلاب اللي مستواهم نزل في آخر 3 تقييمات؟" | patterns | table |
| student_progress_comparison | EN | "Who in Grade 5 Science is slipping?" | model (mocked) | Amal Haddad, Carim |
| student_progress_comparison | AR | "مين في Grade 5 Science مستواه بيقل؟" | model (mocked) | 2 rows |
| missing_submissions | EN | "Which students have not submitted the last assignment?" | patterns | table and chart |
| missing_submissions | AR | "مين الطلاب اللي ما سلموش الواجب الأخير؟" | patterns | table and chart |
| missing_submissions | EN | "Who still owes me work?" | model (mocked) | 5 missing |
| missing_submissions | AR | "مين لسه ما عملش الشغل المطلوب؟" | model (mocked) | 5 missing |
| score_distribution | EN | "Plot the distribution of assessment scores" | patterns | buckets |
| score_distribution | AR | "توزيع درجات الطلاب" | patterns | buckets |
| score_distribution | EN | "Where do most marks fall?" | model (mocked) | [1, 1, 1, 1, 1, 4] |
| score_distribution | AR | "فين معظم العلامات؟" | model (mocked) | same |
| learning_gap_summary | EN | "What are the weakest learning outcomes in my class?" | patterns | table |
| learning_gap_summary | AR | "اعمل تقرير بأضعف نواتج التعلم في فصلي خلال آخر شهر" | patterns | table |
| learning_gap_summary | EN | "Which topics need reteaching?" | model (mocked) | O1 Fractions 50% |
| learning_gap_summary | AR | "ايه المواضيع اللي محتاجة إعادة شرح؟" | model (mocked) | same |

## Intentional clarification and refusal cases

| Case | Path | Expected outcome (asserted) |
|---|---|---|
| Several reports at once ("trends and gaps and who is missing") | model (mocked) | needs_clarification (multiple_reports) |
| Vague ("عايز أعرف كل حاجة") | model (mocked) | needs_clarification (ambiguous_intent) |
| Unsupported action ("Export everything to Excel") | model (mocked) | unsupported |
| Not about class data ("Write me a poem") | model (mocked) | unsupported ("choose documents or ask about your classes") |
| Attendance, diagrams, mastery trend, term comparison | patterns | unsupported, with an explanation |
| Two classes in scope, none named, for a one-class report | patterns or model | needs_clarification listing the caller's classes |
| A class the caller does not teach | model (mocked) | needs_clarification listing only their own classes |
| Explicit future period ("next month"; model-proposed future dates) | both | needs_clarification (future_period) |
| Invalid dates (2026-09-31, 2026-02-30, reversed range) | both | needs_clarification (invalid_period) |
| Too-broad period (2020 → today, 3,000 days) | both | clamped to 365 days, with a note |
| Request over 500 characters (router) | router, not sent | unsupported ("rephrase") |
| Router flag off, unmatched question | — | unsupported ("choose documents…"), no call |
| Malformed or extra model output (14 cases) | model (mocked) | unsupported, with no table or chart |
