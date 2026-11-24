# Teacher marking sheet

- **Send to teachers:** `ENARA_teacher_marking_sheet.xlsx` only. It has an Instructions tab, English (15 answers) and Arabic (15 answers), and drop-downs in the yellow cells. It takes about 30–40 minutes per language.
- **Do not send:** `key.json`. It maps the neutral codes (E01…, A01…) back to the benchmark answers (`data/assessment-bench/language`), so the marks can be compared with the grader and the reference scores.
- **Which answers:** 5 questions per language (2 short answers, 3 essays, from easy to hard), each with a weak, a mid and a strong answer, shuffled.
- **Scale:** the re-calibrated rubric (human markers' scale, owner's decision of 23 Nov 2026). The descriptions are the same as `backend/src/assessment/rubrics/templates.ts` on `claude/tutor-lms-rubric-recal`.
- **When it comes back:** put the returned file next to this README (for example `marked-teacher1.xlsx`) and I compare it with DeepSeek, the trained scorers and our reference scores.

## 50 + 50 sheet (24 Nov 2026)
- **Send to teachers:** `ENARA_teacher_marking_sheet_50.xlsx` only. Same tabs, drop-downs and rubric as the first sheet, with 50 English and 50 Arabic answers. About 1.5–2 hours per language; teachers can stop and continue later.
- **Do not send:** `key-50.json`. It maps E01–E50 and A01–A50 back to the Mishkat dev pool (`data/mishkat-dev` on `claude/tutor-lms-mishkat`), so teacher marks can be compared with Mishkat, v3b and the three model markers.
- **Which answers, per language:**
  - 25 essays and 25 short answers;
  - weak, mid and strong spread evenly (8–9 of each per type);
  - 50 different questions across language, science and humanities, at every level;
  - shuffled.
- **Left out:** listening answers, because teachers cannot hear the recording, and the 15 answers already in the first sheet.
