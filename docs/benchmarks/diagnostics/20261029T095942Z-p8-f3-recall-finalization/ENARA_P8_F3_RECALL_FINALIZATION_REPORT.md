# ENARA P8: F-3 recall finalization

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d`. **Uncommitted, ready for owner review.**

No remote service was contacted. There was no Vercel access, no deployment, no migrations, AI was not enabled, no paid calls were made, and no environment files were edited. Earlier reports and provenance snapshots are unchanged. The $4 English-assessment benchmark was not run.

## 1. Summary

- All **28 required probes** return the expected result. That is 21 regression tests carried over from the precision pass and earlier, plus 7 new probes.
- The three instruction-style and paraphrase misses are fixed: the English summarise question, the gas/release paraphrase on a passage that states it, and the Arabic explain question.
- Every earlier false-positive probe still returns no source. Six new negative probes check that framing words never turn an off-topic question into a match.
- **One residual risk is new in this change** (§5.1): a question whose *only* topic word appears incidentally in the passage now retrieves it, e.g. "Explain water to my students".
- **F-5 remains unresolved on the live deployment.**
- **External testing: NO-GO.**

## 2. Algorithm change (`backend/src/services/curriculumRetrieval.ts`)

The change applies only to scopes of 1–3 passages. Scopes of 4+ passages are unchanged: the 2-shared-term rule and the minimum score of 1 still apply, and the code path is identical to HEAD.

1. **Coverage replaces both gates in small scopes.**
   - With 1–3 passages, BM25 IDF is almost the same for every term, so neither the score floor nor the raw 2-term count discriminates. The precision pass already showed that the 2-term rule lets false positives through.
   - A small-scope passage is now kept when its BM25 score is above 0 and it **covers the question's content words**:
     - at least min(2, number of content words) are covered;
     - the number missing is at most 0 for 1–4 content words, 1 for 5–8, and 2 for 9–12, the same as the precision pass.
   - Before, the 2-term rule counted framing words. So "summarise photosynthesis simply for my grade 5 students" had only one matching word and failed, even though its only topic word was in the passage.
2. **Content words** are the query's search terms minus:
   - question and function words (unchanged from the precision pass);
   - **framing words** (new):
     - English, compared after suffix folding: summarise, summarize, summary, simply, simple, brief, briefly, describe, overview, student, learner, pupil, kid, children, grade;
     - Arabic (normalized): اشرح، لخص، وضح، بسط، ببساطه، بسيط، مبسط، طلاب، لطلاب، للطلاب، طالب، تلاميذ، لتلاميذ، للتلاميذ;
   - **grade phrases** (new): "grade" together with an adjacent number ("grade 5", "10th grade"), and الصف/صف/للصف/لصف together with the following word ("الصف الخامس").
   - The grade-phrase rule is deliberately positional. Ordinals such as ثاني are *not* removed globally, because ثاني is part of ثاني أكسيد الكربون (carbon dioxide).
   - "explain" and "please" were already stop words.
   - I left out the candidate word "level", because "sea level" is topical.
3. A question with **no content words at all** never matches in a small scope.

Not changed:
- `searchTerms` and the stop words;
- the terms stored on passages, so no re-extraction or migration is needed;
- BM25 scoring and the lesson and objective boosts;
- school, curriculum and document scoping;
- the document safety gate;
- tenant isolation.

There is no model call and no new dependency.

## 3. Before and after, all probes

Each scope holds exactly one synthetic passage (N = 1), queried through the real `retrieveCurriculumSources` against an in-memory MongoDB:
- **en**: the English photosynthesis passage;
- **ar**: its Arabic equivalent;
- **gas**: a passage stating that "plants … release oxygen gas", which is the passage that genuinely supports the paraphrase.

Columns:
- **HEAD**: original code at `d52784d`;
- **v1**: first P8 fix, minimum score lowered only;
- **Precision**: the previous P8 pass;
- **Current**: this change.

Rows 1–28 are required. Rows 29–31 are informational: they show limits, and are not asserted in tests.

| # | Question | Expected | HEAD | v1 | Precision | Current |
|---|---|---|---|---|---|---|
| 1 | Where in the plant does photosynthesis happen and what does chlorophyll absorb? | SOURCE | none | SOURCE | SOURCE | **SOURCE** ✓ |
| 2 | How does chlorophyll use sunlight? | SOURCE | none | SOURCE | SOURCE | **SOURCE** ✓ |
| 3 | What happens in the chloroplasts of plant leaves? | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 4 | What does a plant turn carbon dioxide and water into? | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 5 | What energy source powers an electric car and how much water does it use? | none | none | SOURCE | none | **none** ✓ |
| 6 | Is oxygen or carbon dioxide heavier in the air we breathe? | none | none | SOURCE | none | **none** ✓ |
| 7 | What turns water into steam in a kettle? | none | none | SOURCE | none | **none** ✓ |
| 8 | How do plant cells divide during mitosis? | none | none | none | none | **none** ✓ |
| 9 | Why are leaves green? | none | none | none | none | **none** ✓ |
| 10 | Who won the football world cup in 1998? | none | none | none | none | **none** ✓ |
| 11 | Describe the oxygen tank on a submarine | none | none | none | none | **none** ✓ |
| 12 | What is the capital city of France? | none | none | none | none | **none** ✓ |
| 13 | كيف يمتص الكلوروفيل ضوء الشمس؟ | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 14 | أين يحدث البناء الضوئي في النبات؟ | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 15 | ما هو ثاني أكسيد الكربون في السيارات؟ | none | none | SOURCE | none | **none** ✓ |
| 16 | What is ثاني أكسيد الكربون in cars? | none | none | SOURCE | none | **none** ✓ |
| 17 | من فاز بكأس العالم؟ | none | none | none | none | **none** ✓ |
| 18 | Can you summarise photosynthesis simply for my grade 5 students? | SOURCE | none | none | none | **SOURCE** ✓ |
| 19 | Summarize photosynthesis for 10th grade students | SOURCE | none | none | none | **SOURCE** ✓ |
| 20 | What gas do plants release in photosynthesis? | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 21 | اشرح البناء الضوئي لطلاب الصف الخامس | SOURCE | none | SOURCE | none | **SOURCE** ✓ |
| 22 | لخص البناء الضوئي للطلاب ببساطة | SOURCE | none | SOURCE | none | **SOURCE** ✓ |
| 23 | Explain the water cycle to my students | none | none | none | none | **none** ✓ |
| 24 | Summarise the history of football for grade 5 students | none | none | none | none | **none** ✓ |
| 25 | Explain simply how carbon dioxide gets into car engines | none | none | SOURCE | none | **none** ✓ |
| 26 | What gas powers a kitchen stove? | none | none | none | none | **none** ✓ |
| 27 | اشرح ثاني أكسيد الكربون في السيارات للطلاب | none | none | SOURCE | none | **none** ✓ |
| 28 | لخص تاريخ كرة القدم لطلاب الصف الخامس | none | none | none | none | **none** ✓ |
| 29 | What gas do plants release in photosynthesis? | info: passage has no gas/release | none | none | none | **none** — |
| 30 | Explain water to my students | info: one topical word | none | none | none | **SOURCE** — |
| 31 | Summarise this document for my students | info: no topical word | none | none | none | **none** — |

Scope per row: rows 1–12 and 18, 19, 23–25, 29–31 use **en**; rows 13–17, 21, 22, 27, 28 use **ar**; rows 20 and 26 use **gas**.

**Current: 28/28 required rows correct.** Earlier versions on the same 28 rows:

| Version | Correct (of 28) | Wrong rows |
|---|---|---|
| HEAD | 22 | missed 1, 2, 18, 19, 21, 22 |
| v1 | 19 | false positives on 5–7, 15, 16, 25, 27; missed 18, 19 |
| Precision | 24 | missed 18, 19, 21, 22 |

## 4. Tests

`backend/test/p8SmallScopeRetrieval.test.ts` (untracked, P8) has **30 tests**. All except the last call the real retrieval function on synthetic passages in an in-memory MongoDB.

| Spec category | Covered by |
|---|---|
| 1. A relevant English question in a one-passage scope retrieves and cites the source | "answers from a single one-passage document…" (also through the one-document `uploadIds` filter); probes 1, 3, 4 |
| 2. The instruction-style photosynthesis question | probes 18, 19 |
| 3. The gas/release paraphrase on a supporting passage | probe 20; plus negative probe 26, a stove question on the same passage |
| 4. The Arabic instruction-style question | probes 21, 22 |
| 5. Off-topic questions return no source | probes 5–12, 15–17 (electric car, oxygen vs carbon dioxide, kettle, Arabic and mixed cars, football and world cup, capital of France, mitosis), plus framed negatives 23–25, 27, 28, plus "still returns no source…" |
| 6. A passage is chosen among distractors only when it is the best match | "picks the right passage from a small collection with distractors" (N = 3) |
| 7. Scopes of 4+ passages keep the minimum score of 1 | "keeps the original score floor of 1 in larger scopes" (N = 9) |
| F-5 (carried over) | route-not-mounted test (30 s timeout) |

The test file contains: 2 earlier F-3 tests, **25** `it.each` probe cases (13 from the precision pass and 12 new), 2 scope tests and 1 F-5 test, for 30 in total.

| Command | Exit | Result |
|---|---|---|
| `npx vitest run test/p8SmallScopeRetrieval.test.ts` (×2) | 0 | 30/30 both times |
| `npx vitest run test/p8SmallScopeRetrieval.test.ts test/elie.sprint6.test.ts test/p2Documents.test.ts` (×2) | 0 | 3 files, 61/61 both times |
| `npx vitest run` (full backend) | 0 | **64 files, 781/781** |
| `npx tsc --noEmit -p .` (backend) | 0 | — |
| `npx tsc --noEmit -p .` (frontend) | 0 | — |
| `npm run build` (frontend) | 0 | — |
| `git diff --check` (tracked) | 0 | clean |
| `git diff --no-index --check /dev/null <file>`, run on every untracked file | — | clean, except one trailing-whitespace line in the earlier report `20261029T090418Z-p8-p1-fixes/ENARA_P8_P1_FIXES_REPORT.md:76`. I left it as it is because historical reports are not edited; fix it at commit time if wanted. |

**Test-count reconciliation:**
- precision pass: 769;
- this change adds 12 probe cases: 6 recall, 1 capital of France, 5 framed negatives — 6 + 1 + 5 = 12;
- 769 + 12 = **781**, in the same 64 files;
- the history before that: HEAD plus P7 gave 756, P8 v1 was ±5 (one test file removed and one added), and the precision pass added 13.

**Provenance:** I ran `npx tsx src/scripts/sourceProvenance.ts --phase P8-F3-recall --out <this folder>/SOURCE_PROVENANCE_P8_F3_RECALL.json` and it exited 0.
- The output path was given relative to the repository root this time, so the file was written directly into this folder.
- The `curriculumRetrieval.ts` hash recorded in it, `c54a2d6c…8283`, matches the working file.
- No earlier snapshot was touched.

## 5. Remaining risks

### 5.1 False positives

1. **New: questions with one topic word, small scopes only.**
   - After framing words are removed, "Explain water to my students" has one content word, "water". The passage mentions water, so it is retrieved (row 30). The precision pass returned none.
   - This is lexically identical to the required row 18, where "photosynthesis" is the one topic word. Keyword matching on a single passage cannot tell the two apart.
   - Impact: in chat with one document selected, the model receives that document and is told to say when it does not cover the question. It is not a cross-document or cross-school leak.
   - Possible mitigation, needing owner choice and data: for one-topic-word questions, also require the word to appear in the document title or section label, or more than once in the passage.
2. **Unchanged from the precision pass:** a question of 5 or more content words that misses exactly its topic word could still match. Lexical retrieval cannot judge whether a passage supports the relation being asked about.
3. **The framing word list can hide a real topic.** For example, "describe" or "simple" are sometimes topical ("simple machines" loses "simple"). In a small scope, the remaining words must still be covered.

### 5.2 False negatives

1. **Synonyms.** Row 29, "what gas do plants release", returns none on the original passage, which says "turn … into … oxygen" and never uses "gas" or "release". Only a passage that uses those words matches (row 20). Fixing this needs semantic retrieval, and there is no embeddings provider.
2. **Questions with no topic word,** e.g. "Summarise this document for my students" (row 31), return none in small scopes. In one-document chat this is arguably a reasonable request; a document-level summary path would serve it better than retrieval.
3. **Arabic morphology** beyond the existing normalization, such as the و/ب/ل prefixes on topic words, can still cause misses. Only the listed framing words are handled.
4. **Instruction words not on the list,** e.g. "outline", "recap", "teach", "kids'", count as content words and can cause misses. This is easy to extend with tests.

## 6. File inventory (tracked and untracked)

| Path | State | Origin |
|---|---|---|
| `backend/src/app.ts` | modified, −16 | P8 v1 (F-5) |
| `backend/src/routes/stagingMaintenance.routes.ts` | deleted | P8 v1 (F-5) |
| `backend/test/p6StagingMaintenance.test.ts` | deleted | P8 v1 (F-5) |
| `backend/src/services/curriculumRetrieval.ts` | modified, +48/−1 against HEAD (all F-3 passes) | P8; **this task**: framing and grade-phrase handling, and coverage replacing the gates in small scopes |
| `backend/test/p8SmallScopeRetrieval.test.ts` | untracked | P8; **this task**: the gas passage and 12 probes |
| `docs/benchmarks/diagnostics/20261029T095942Z-p8-f3-recall-finalization/` (this report and `SOURCE_PROVENANCE_P8_F3_RECALL.json`) | untracked, new | **this task** |
| `docs/benchmarks/diagnostics/20261029T094732Z-p8-f3-precision/` | untracked | P8 precision pass, unchanged |
| `docs/benchmarks/diagnostics/20261029T090418Z-p8-p1-fixes/` | untracked | P8 v1, unchanged |
| `backend/test/p7RoleMatrix.test.ts` | untracked | P7 (plus one P8 line), unchanged here |
| `backend/src/scripts/benchmark3Model.ts` | untracked | P7, unchanged, not part of P8 |
| `docs/.../ENARA_P7_QA_REPORT_REVISED_SCOPE.md` | untracked | P7, unchanged |

Tracked diff: 4 files, +48/−270.

No secrets or environment values appear in any changed or new file.

## 7. Before a reviewed staging deployment

1. **Owner decision on §5.1 item 1:** accept the one-topic-word risk, or ask for the title/section/frequency mitigation first.
2. Review and approval; then commit and push the P8 set. Decide whether the unrelated P7 files (benchmark script, revised P7 report) go into the same commit.
3. Delete `STAGING_MAINTENANCE_TOKEN` in Vercel, redeploy the reviewed commit, and check that the old token gets **404**, `/health` returns 200, and the variable is gone. **F-5 is unresolved on the live deployment until then.**
4. Check F-3 on staging with one document, using a valid question, an instruction-style question and an off-topic question, with AI still paused.
5. The $4 English-assessment benchmark needs separate authorization and was not run.

Arabic assessment generation remains OUT OF SCOPE FOR THIS RELEASE. Arabic grounded chat, tutor and lesson planning remain in scope; only their small-scope retrieval gate changed here. Arabic rubric grading is unchanged.
