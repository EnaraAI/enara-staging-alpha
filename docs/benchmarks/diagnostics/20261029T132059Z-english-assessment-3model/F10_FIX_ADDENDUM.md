# F-10 addendum: F-3b fallback extended to question drafts

**Owner decision (chat, 2026-10-29):** "extend the F-3b fallback to question drafts".

## Change
- `gatherSources` (`backend/src/services/educatorAi.ts`) has a new `smallScopeFallback` option. Only `generateAssessmentDraft` turns it on.
- **Trigger:** keyword retrieval finds nothing for the brief and the objectives, the teacher chose documents (`uploadIds`, already checked by `resolveGenerationSources`), and those documents hold at most `SMALL_SCOPE_PASSAGES` (3, the chat constant) passages in total.
- **Effect:** all of those passages go to the model, exactly as F-3b does for chat. Selections with more passages keep the "(no course passages were found)" behaviour.
- **Logging:** `assessment_draft_small_scope_fallback`, with counts only (no text).
- **Unchanged:** whole-curriculum drafts (no documents chosen), lesson plans, question regeneration and the tutor keep keyword-only retrieval. Cross-school and ineligible documents are still refused before any model call.

## Tests
`p4Workflow.test.ts` gains the suite "F-3b small-scope fallback for question drafts", with 3 tests:
1. A non-matching brief on one small document sends that passage, and the unchosen document is not sent. Cited questions are `supported`. The fallback is logged once with counts only, and a keyword hit does not use it.
2. With 4 passages selected there is no fallback.
3. The fallback never applies with no chosen documents, for lesson plans, or for another school.

`p3EducatorChat.test.ts`: the guard test is narrowed to "tutor and lesson plans keep keyword-only retrieval", an intended contract change.

**Full backend suite: 947/947** (944 + 3). Backend and frontend typechecks pass; `git diff --check` is clean.

## Effect on the benchmark above
The benchmark ran before this change, with briefs worded in the notes' vocabulary, so its model results are unaffected. With this change, ordinary briefs on a small chosen document now get their passage. No paid re-run was made.
