# ENARA P8 follow-up: F-3 retrieval precision

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d`. **Uncommitted, ready for owner review.**

No remote service was contacted. Nothing was deployed, no migrations ran, AI was not enabled, no paid calls were made, and no environment files were edited. The earlier P8 report (`20261029T090418Z-p8-p1-fixes/`) and all P7 reports are unchanged.

## 1. Summary

- **Fixed in tests.** All reported false positives now return no source, including the Arabic and mixed-language "carbon dioxide in cars" questions. Every valid English and Arabic question in the probe set still retrieves its source.
- **Remaining limit (recall).** Instruction-style or paraphrased questions whose words aren't in the passage still return no source in one-document scopes. The original code missed these too (§5).
- **F-5 is NOT resolved on the deployed site.** It is removed from local code only. Deployed verification is a separate operation that needs approval.
- **External testing: NO-GO.**

## 2. Root cause

1. The first P8 fix lowered the BM25 minimum score in scopes of 1–3 passages, because IDF is near-constant there and cannot tell terms apart. For example, with one passage every term scores about 0.29.
2. With the score unable to discriminate, the only remaining gate was "shares at least 2 words with the question". Any question that mentioned two of the passage's words passed. Examples:
   - "water" and "energy" in an electric-car question;
   - "oxygen", "carbon" and "dioxide" in a comparison the passage never makes;
   - ثاني، أكسيد، كربون in the cars question.

## 3. Mitigation

Changed file: `backend/src/services/curriculumRetrieval.ts`, about 25 lines in total including the first P8 fix. The new rule applies only in scopes of 1–3 passages. In 4+ passage scopes, BM25 IDF can tell terms apart, the minimum score stays 1, and behavior is unchanged.

In small scopes a passage must also **cover the question's content words**:

- **Content words** are the question's search words minus a short list of question and function words left over after the existing stop-word removal:
  - English: where, when, which, who, whom, whose, into, during, much, many, there, their, its, also, did, done, have, has;
  - Arabic (normalized): أين، متى، لماذا، كم، أي، هي، هم.
- **Light English suffix folding** for this check only: -ing, -ed and -s are stripped when at least 3 letters remain, so happens/happen, added/add and uses/use match. Arabic is matched as already normalized.
- **Words allowed to be missing:**

| Content words in the question | Missing words allowed |
|---|---|
| 1–4 | 0 |
| 5–8 | 1 |
| 9–12 | 2 |

  The first version of this rule allowed one missing word per four, so a 4-word question could miss one. That still let the Arabic and mixed-language cars questions through, because the missing word was "cars", the actual topic. The rule was tightened so up to 4 content words allows none. This case is why a plain overlap ratio is not enough: the Arabic cars question matches 3 of its 4 words (75%).

Not changed:
- `searchTerms` and the stop words;
- the terms stored on passages, so no re-extraction or migration is needed;
- BM25 scoring;
- the 2-word minimum;
- school, curriculum and document scoping;
- the document safety gate.

There is no model call and no new dependency.

## 4. Expected vs observed probe matrix

Setup: one synthetic English photosynthesis passage and one Arabic equivalent, each alone in its own scope (N = 1), run through the real `retrieveCurriculumSources` against an in-memory MongoDB.

Columns:
- **HEAD** is the original code at `d52784d`;
- **P8 v1** is the first fix, with the lowered minimum score only;
- **Current** is this fix.

| # | Question | Expected | HEAD | P8 v1 | Current |
|---|---|---|---|---|---|
| 1 | Where in the plant does photosynthesis happen and what does chlorophyll absorb? | SOURCE | none ✗ | SOURCE | **SOURCE ✓** |
| 2 | How does chlorophyll use sunlight? | SOURCE | none ✗ | SOURCE | **SOURCE ✓** |
| 3 | What happens in the chloroplasts of plant leaves? | SOURCE | SOURCE | SOURCE | **SOURCE ✓** |
| 4 | What does a plant turn carbon dioxide and water into? | SOURCE | SOURCE | SOURCE | **SOURCE ✓** |
| 5 | What energy source powers an electric car and how much water does it use? | none | none | SOURCE ✗ | **none ✓** |
| 6 | Is oxygen or carbon dioxide heavier in the air we breathe? | none (the passage makes no comparison) | none | SOURCE ✗ | **none ✓** |
| 7 | What turns water into steam in a kettle? | none | none | SOURCE ✗ | **none ✓** |
| 8 | How do plant cells divide during mitosis? | none (no cell-division evidence) | none | none | **none ✓** |
| 9 | Why are leaves green? | none (the passage never says why) | none | none | **none ✓** |
| 10 | Who won the football world cup in 1998? | none | none | none | **none ✓** |
| 11 | Describe the oxygen tank on a submarine | none | none | none | **none ✓** |
| 12 | كيف يمتص الكلوروفيل ضوء الشمس؟ (How does chlorophyll absorb sunlight?) | SOURCE | SOURCE | SOURCE | **SOURCE ✓** |
| 13 | أين يحدث البناء الضوئي في النبات؟ (Where does photosynthesis happen in the plant?) | SOURCE | SOURCE | SOURCE | **SOURCE ✓** |
| 14 | ما هو ثاني أكسيد الكربون في السيارات؟ (What is carbon dioxide in cars?) | none | none | SOURCE ✗ | **none ✓** |
| 15 | What is ثاني أكسيد الكربون in cars? (mixed language) | none | none | SOURCE ✗ | **none ✓** |
| 16 | من فاز بكأس العالم؟ (Who won the world cup?) | none | none | none | **none ✓** |
| 17 | Can you summarise photosynthesis simply for my grade 5 students? | SOURCE (recall probe) | none | none | none ✗ |
| 18 | What gas do plants release in photosynthesis? | SOURCE (recall probe) | none | none | none ✗ |
| 19 | اشرح البناء الضوئي لطلاب الصف الخامس (Explain photosynthesis for grade 5 students) | SOURCE (recall probe) | none | SOURCE | none ✗ |

**Current version: 16/16 required cases correct, and 0/3 recall probes.**

- Probes 17–19 are deliberately outside the required set, and HEAD fails 17 and 18 too.
- P8 v1 retrieved probe 19 only because the lowered minimum score let through any passage sharing two words; that is the same leniency that produced the false positives, so the current version gives it up.
- Cases 1, 5–7, 9 and 12–16 are regression tests, and so are the "add/added" match and the distractor cases (§6).

## 5. Remaining risks

**Recall (false negatives), small scopes only.**
- Questions containing words the passage doesn't use return no source. Examples:
  - instruction or audience words: "summarise", "simply", "grade 5", "students", Arabic اشرح، لطلاب;
  - synonyms: "release" vs the passage's "turn into".
- This mostly affects teacher-style prompts in one-document chat.
- What the user sees: an answer from general knowledge with no citation, as the prompt instructs. Nothing wrong is cited.
- The smallest next step, based on the evidence, is to add common instruction and audience words (explain/summarise/simply/students/grade and Arabic equivalents) to the query-only list, with tests from probes 17 and 19. Synonyms need semantic retrieval, which has no embeddings provider today.

**Precision (false positives).**
- A question may still retrieve the passage if it uses nearly all of the passage's vocabulary but asks something the passage doesn't support. For example, a 5+ word question with exactly one missing word, where that word is the topic.
- Lexical matching cannot judge whether the passage actually supports the requested relation. That would need a reranker, which is out of scope and paid.
- Mitigation already in place: the chat prompt tells the model to say the materials don't cover the question, and to cite only what it uses.

**Other.**
- The English suffix folding is crude. For example, "boxes" folds to "boxe", so it won't match "box". This affects coverage only, never scoring.
- Arabic gets no folding beyond the existing normalization. Arabic morphology such as و-/ب-/ل- prefixes can cause misses, for example a question word لطلاب against a passage word طلاب. This is unchanged from before.
- Scopes of 4+ passages are unchanged, so they keep their original behavior, including any original misses.

## 6. Tests

`backend/test/p8SmallScopeRetrieval.test.ts` (untracked, new in P8) has **18 tests**. All of them call the real retrieval function against an in-memory MongoDB with synthetic passages, except the last, which checks the app and source files for F-5:

- 2 earlier F-3 tests: one-document recall, including through the `uploadIds` document filter; unrelated questions and single-shared-word questions;
- **13 probe cases** (`it.each`): cases 1, 3, 4, 5, 6, 7, 8, 9 and 12–16 from §4;
- distractor collection (N = 3): correct passage chosen for photosynthesis and for "add fractions with a common denominator" (add/added), and an unrelated question returns nothing;
- larger scope (N = 9): the minimum score of 1 is kept;
- F-5: the route is not mounted. This test now has an explicit 30 s timeout, because building the app once took 5.95 s, over vitest's 5 s default.

| Command (from `backend/` or `frontend/`) | Exit | Result |
|---|---|---|
| `npx vitest run test/p8SmallScopeRetrieval.test.ts` | 0 | 1 file, 18/18 |
| `npx vitest run test/p8SmallScopeRetrieval.test.ts test/elie.sprint6.test.ts test/p2Documents.test.ts` (run twice) | 0 | 3 files, 49/49 both times |
| `npx vitest run` (full backend) | 0 | **64 files, 769/769** |
| `npx tsc --noEmit -p .` (backend) | 0 | — |
| `npx tsc --noEmit -p .` (frontend) | 0 | — |
| `npm run build` (frontend) | 0 | — |
| `git diff --check` | 0 | clean (tracked changes) |

**Test-count reconciliation.**
- HEAD plus the untracked P7 role-matrix test gave 64 files and 756 tests (measured in the earlier review).
- P8 v1: −1 file and −5 tests (the deleted `p6StagingMaintenance.test.ts`), +1 file and +5 tests, giving 756.
- This task added 13 probe cases: 756 + 13 = **769**, in the same 64 files.

**Provenance.** I ran `npx tsx src/scripts/sourceProvenance.ts --phase P8-F3 --out <this folder>/SOURCE_PROVENANCE_P8_F3.json` and it exited 0. It is a new file; no earlier snapshot was overwritten.
- The `curriculumRetrieval.ts` hash in it, `7708503f…2f78`, matches the working file.
- The script resolves `--out` against the folder above the repository, so the file was first written outside the repository, under the scratch folder. I moved it into this folder and removed the stray folder I had created.

## 7. Change summary (tracked and untracked)

| Path | State | Origin |
|---|---|---|
| `backend/src/app.ts` | modified, −16 | P8 (F-5) |
| `backend/src/routes/stagingMaintenance.routes.ts` | deleted | P8 (F-5) |
| `backend/test/p6StagingMaintenance.test.ts` | deleted | P8 (F-5) |
| `backend/src/services/curriculumRetrieval.ts` | modified, +28/−1 against HEAD | P8 v1 plus **this task** |
| `backend/test/p8SmallScopeRetrieval.test.ts` | untracked | P8 v1; **this task** added the probes, the Arabic passage and the 30 s timeout |
| `docs/benchmarks/diagnostics/20261029T094732Z-p8-f3-precision/` (this report and `SOURCE_PROVENANCE_P8_F3.json`) | untracked | **this task** |
| `docs/benchmarks/diagnostics/20261029T090418Z-p8-p1-fixes/` | untracked | P8 v1, unchanged |
| `backend/test/p7RoleMatrix.test.ts` | untracked | P7, plus one P8 v1 line; unchanged here |
| `backend/src/scripts/benchmark3Model.ts` | untracked | P7, unchanged, not part of P8 |
| `docs/.../ENARA_P7_QA_REPORT_REVISED_SCOPE.md` | untracked | P7, unchanged |

Tracked diff: 4 files, +28/−270.

No secrets, tokens, URIs or environment values appear in any changed or new file. The only token-like string is the made-up test placeholder in the F-5 test.

## 8. Deployment recommendation

**Code: ready for owner review and, once approved, commit.**
- The reported precision regressions are fixed and covered by tests.
- The recall limit in §5 is known, does not cite anything wrong, and is no worse than HEAD on the probes measured.

**Deployment and external testing: still NO-GO**, until the following are done:
1. Approval, commit and push.
2. Delete `STAGING_MAINTENANCE_TOKEN` from the Vercel project, redeploy the reviewed commit, and check that the old token gets **404**, `/health` gives 200, and the variable is gone. **F-5 stays unresolved until this deployed check passes.**
3. Check F-3 on staging with one document, using a valid question and an off-topic one, with AI still paused.
4. The expanded English assessment benchmark (proposed $4 cap) needs separate approval and was not run.

Arabic assessment generation remains OUT OF SCOPE FOR THIS RELEASE. Arabic grounded chat, tutor and lesson planning remain in scope; this task changes only the retrieval precision they rely on. Arabic rubric grading is unchanged.
