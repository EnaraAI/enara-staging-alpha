# What I need from you

_23 Nov 2026, 8:10 PM Cairo. Ordered by what unblocks the most. Each item says what happens on each answer._

## Decisions
1. **Arabic padding test: (a) or (b)?** _Blocks the Mishkat switch for Arabic._
   - The Arabic padding test fails: adding 3 correct sentences raises grammar and spelling by 0.17 (the bar is 0.1), after four fixes.
   - The cause is v3b's own rubric, which judges sentence by sentence, so more correct sentences legitimately raise the mark.
   - **(a)** Keep the test as it is. Arabic grammar and spelling stay with v3b; English can still use Mishkat.
   - **(b)** Pad with sentences carrying the answer's own kind of errors, keeping the 0.1 bar. **Recommended.**
   - Details: `MISHKAT_VS_CLAUDE.md`, last section.

2. **"Go" to build the Mishkat + v3b split** (`MISHKAT_SPLIT_PLAN.md`).
   - Mishkat scores grammar, spelling and vocabulary; v3b keeps task completion, organisation and the feedback text.
   - It sits behind one switch, `mishkatSplit`, **off by default**. On your go I build it and run the full E2E suite. The switch stays off until the Arabic length tests pass and you say go a second time.

3. **Colloquial in short Arabic answers: one rule.** Sonnet and Opus marked this differently.
   - The question: a short answer written mostly in colloquial but easy to understand. Grammar 0 or 1?
   - Suggested rule: **"mostly colloquial → grammar 0, even when clear; one or two colloquial words → 1."** I add it to the rubric and re-mark the affected answers.

4. **Word lists for rules-first part 2 (spelling by code):** confirm my choice.
   - English: **SCOWL en_US** (permissive; keep its notice).
   - Arabic: **Ayaspell, used under MPL 1.1** (unmodified separate files, with its licence files).
   - A lawyer should glance at both before a real school.

## Things only you can do
5. **Return the Mishkat review sheet** (`mishkat/Mishkat_review_sheet_MODEL-MARKED.xlsx`, sent at about 5:20 PM).
   - Fill the yellow cells only where you disagree.
   - Your marks replace the model marks, and the retrain takes minutes.
6. **Find 1–2 teachers** for the marking sheet (`teacher-marking/ENARA_teacher_marking_sheet.xlsx`, 15 English + 15 Arabic answers, about 30–40 minutes per language). Their marks are the first real check of v3b and Mishkat.
7. **Add the Modal token as a secret** (GitHub and Vercel) when you approve item 2. I never ask for it or print it.
8. **The LAILA authors' written OK.**
   - Still pending.
   - The Arabic Mishkat model no longer uses LAILA (it is trained on ENARA answers only).
   - LAILA is still used for the Arabic human-scored check and in the earlier research.

## Open from this morning (quick yes or no)
9. **Model fallback on lms-test:** normal grading still retries a failed DeepSeek call on Anthropic. Turn it off for zero Anthropic use? (Benchmarks and Mishkat runs never use it.)
10. **Anthropic sample check (≤ $2):** a strong Claude model marks 50–100 benchmark answers to double-check the reference scores. It is off; say yes to run it.
11. **Cairo time in 12-hour format, in the standing rules file (`CLAUDE.md`)?** That file lives on an LMS-track branch, so I need your OK to edit it.

## I'll do next unless you say otherwise
- **Open the PR for rules-first part 1**:
  - blank, wrong-script and copied answers;
  - required points and units by code;
  - "scored by code" shown in the teacher view.

  It runs behind its own switch, off by default, through the full E2E suite.
- **Rules-first part 2:** spelling by code, with the word lists from item 4 once you confirm.
- **Keep the English grammar open item** on the list until Mishkat goes live.
