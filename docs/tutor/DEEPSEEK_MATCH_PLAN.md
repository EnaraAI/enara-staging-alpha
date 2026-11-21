# Plan: make DeepSeek match Claude on the tutor, in every subject (lms-test only)

**Scope:** the whole tutor, not only English. That covers:
- **answers from the school's materials** in any subject, with sources, and "this isn't in your materials";
- **graded practice** in maths, science, Arabic and other subjects;
- **the English engine**;
- **Arabic and English** learners, all age groups.

**Targets, measured on the bigger test (step 6):**
- grading line fully right: **≥ 95%**;
- rules: **≥ 98%**;
- teaching: **≥ 95%**;
- grounded answers: **≥ 95%** (the source is shown and nothing is made up).

**Gaps found so far (English turns only):**
- the hidden grading line is missing or wrong;
- it names the wrong mistake;
- it sometimes gives the answer away;
- it sometimes ends with no task.

**Not tested yet on DeepSeek:**
- the other subjects;
- answers with sources;
- "not in your materials";
- Arabic replies;
- maths working.

## The fixes, best value first (each is a small PR, then a re-test)

| # | Fix | What it does | Subjects |
|---|---|---|---|
| 1 | **Grade first, then reply** | Call 1 returns the verdict as strict JSON (guaranteed format): right, partly right or wrong; next step; item; **the exact part that is wrong**. Call 2 writes the reply from that verdict, and the server builds the hidden line itself. This is the same grading path for English and subject practice (`gradeAllSubjects`). About +0.5 s per turn. | All |
| 2 | **Code checks the answer before the model does** | Code works out what is wrong and gives that to the model, which only explains it:<br>• **Maths:** numbers and expressions compared by value (0.5 = 1/2), units checked, and the first wrong step in shown working.<br>• **Short answers in any subject:** match against the expected answer and the accepted alternatives.<br>• **Spelling:** exactly which letters are wrong, in English and Arabic (for Arabic: letters, hamza and taa marbuta). | All |
| 3 | **Examples from Claude** | Short example turns in the system prompt, for each kind of turn (practice, an answer from the materials, out of scope) and each age band. They come from our saved Claude replies. For subjects with none saved yet, Claude writes them once when the key is back; fake learners only. | All |
| 4 | **Checks on each reply** | Answer not given away, a task at the end, length for the age band, and a reply in the learner's language. For answers from the materials: a source is shown, and no claims that aren't in the passages. On a failure, regenerate once. | All |
| 5 | **Small tuning** | Temperature 0.3. Try reasoning "low" for the grading call and for maths only, and keep it if accuracy goes up and speed stays under 1.5 s. | All, maths most |
| 6 | **A bigger, automatic test** | Build on the 60 subject questions already in `backend/eval/subjects/` (maths, science, Arabic) plus the English turns: **100 turns**. The mix covers right, wrong and stuck learners, answers from the materials, out-of-scope questions, Arabic learners, and every age group. It runs from GitHub after every DeepSeek change, and the targets above are the pass mark. Where no saved Claude reply exists yet, a written answer key is the reference; Claude replies are added when the key is back. | All |
| 7 | *(Later, only if needed)* **Train DeepSeek on Claude's replies** | A small add-on to the model on our Modal endpoint, trained on Claude's replies in every subject (fake learners only). Needs your go and a check of the model's licence. | All |

## Order
1. **Step 6 first (the test):** we can't fix what we haven't measured outside English.
2. **Fixes 1 + 2:** one PR.
3. **Fixes 3 + 4:** one PR.
4. **Fix 5:** settings only.
5. **Re-test after each step.**
6. **Fix 7:** only if we are still below target.

## Notes
- Anthropic is not touched; all of this is for DeepSeek only, on lms-test.
- E2E keeps the mock tutor, and every PR must pass the full suite.
- Cost: fix 1 roughly doubles the calls per turn; still about $0.10 per session at the safe upper-bound price.
- Switching back to Claude stays one setting.

**Waiting for your "go"** (all of it, or the steps you choose).
