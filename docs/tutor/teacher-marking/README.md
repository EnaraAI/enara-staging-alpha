# Teacher marking sheet

- **Send to teachers:** `ENARA_teacher_marking_sheet.xlsx` only. It has an Instructions tab, English (15 answers) and Arabic (15 answers), and drop-downs in the yellow cells. It takes about 30–40 minutes per language.
- **Do not send:** `key.json`. It maps the neutral codes (E01…, A01…) back to the benchmark answers (`data/assessment-bench/language`), so the marks can be compared with the grader and the reference scores.
- **Which answers:** 5 questions per language (2 short answers, 3 essays, from easy to hard), each with a weak, a mid and a strong answer, shuffled.
- **Scale:** the re-calibrated rubric (human markers' scale, owner's decision of 23 Nov 2026). The descriptions are the same as `backend/src/assessment/rubrics/templates.ts` on `claude/tutor-lms-rubric-recal`.
- **When it comes back:** put the returned file next to this README (for example `marked-teacher1.xlsx`) and I compare it with DeepSeek, the trained scorers and our reference scores.
