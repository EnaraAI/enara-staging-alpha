# ENARA P8: F-3 single-topic false-positive guard

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d`. **Uncommitted, ready for owner review. No deployment is authorized by this task.**

No remote service was contacted. Nothing was deployed, no migrations ran, AI was not enabled, no paid calls were made, and no environment files were edited. Every earlier test, report and snapshot is preserved. No test was weakened or deleted.

## 1. Summary

- "Explain water to my students" against the photosynthesis passage now returns **no source**.
- All **28 required probes** keep their results.
- **15 new guard tests** pass. Six of them fail on the previous recall version, which shows they test the new behavior.
- Full backend suite: **796/796**.
- **F-5 is NOT resolved on the live deployment.** It is removed only from local code.

## 2. Implementation

**Metadata on each passage** (`CurriculumChunk`), checked before choosing the approach:
- `fileName`: every passage has it. It is the uploaded document's name; the extraction code uses the document's display name, or the file name without its storage prefix.
- `sectionLabel`: only on Word documents ("Section 2: Heading").
- `page`: PDF only, and not useful as a topic signal.
- There is no separate title or heading field. Headings in PDFs and text files are not extracted. So metadata grounding works only where the file name or section label names the topic.

**The change** (`backend/src/services/curriculumRetrieval.ts`): a new function, `groundsTopic`. It applies only in 1–3 passage scopes, and only when the question has **exactly one content word** after question, framing and grade words are removed. A passage counts as grounded on that word when any of these holds:

1. **Heading:** the word is in the passage's file name (extension removed) or section label, using the same `searchTerms` and suffix folding as the question.
2. **Repeated (fallback 1):** the word appears in **2 or more sentences** of the passage. Sentences are split on `. ! ? ؟` and line breaks. Two mentions within one sentence don't count.
3. **Opening word (fallback 2):** the word is the passage's first content word (question and function words skipped), so the passage starts with its subject.

Fallback 2 is needed to keep the required probes 18 and 19 passing. In the test passage, "photosynthesis" appears once, as its opening word, and the synthetic file name has no topic in it. The incidental "water" in the same passage appears once, mid-text, and is not the opening word, so it fails all three tests.

Not changed:
- questions with 2 or more content words, which keep the coverage rule from the recall pass;
- scopes of 4+ passages, which still use the 2-term rule and the minimum score of 1;
- stored passage data, school and document scoping, tenant isolation, authorization and the document safety gate;
- `searchTerms` and the stop words.

English and Arabic go through the same path. Arabic ordinals are still never removed on their own; only whole grade phrases are, as in the recall pass.

## 3. Guard tests (`it.each` "single-topic guard", 15 cases)

The previous recall version and the current guard version were both run through the same test file (`p8SmallScopeRetrieval.test.ts`).

| Scope (synthetic passage) | Question | Expected | Previous (recall) | Current |
|---|---|---|---|---|
| one: photosynthesis passage | Explain water to my students | none | SOURCE ✗ | none ✓ |
| one | Explain chlorophyll to my students | none (one mention, mid-text) | SOURCE ✗ | none ✓ |
| one | Summarise photosynthesis for my grade 5 students | SOURCE (opening word) | SOURCE | SOURCE ✓ |
| heading: puddle passage, section "Section 2: Evaporation" | Explain evaporation to my students | SOURCE (heading) | SOURCE | SOURCE ✓ |
| no-heading: same text, no section label | Explain evaporation to my students | none (one mention, mid-text) | SOURCE ✗ | none ✓ |
| titled: same text, file name `evaporation-notes.pdf` | Explain evaporation to my students | SOURCE (title) | SOURCE | SOURCE ✓ |
| repeat: "friction" in 2 sentences | Explain friction simply to my students | SOURCE (repeated) | SOURCE | SOURCE ✓ |
| same-sentence: "friction" twice in 1 sentence | Explain friction simply to my students | none | SOURCE ✗ | none ✓ |
| ar-heading: Arabic passage, section "القسم 2: الكلوروفيل" | اشرح الكلوروفيل للطلاب | SOURCE (heading) | SOURCE | SOURCE ✓ |
| one-ar: Arabic passage, no section | اشرح الكلوروفيل للطلاب | none (one mention, mid-text) | SOURCE ✗ | none ✓ |
| one-ar | اشرح الماء للطلاب | none | none | none ✓ |
| one-ar | اشرح البناء الضوئي للطلاب | SOURCE (2 content words) | SOURCE | SOURCE ✓ |
| few: 3 passages (water cycle, photosynthesis, fractions) | Explain photosynthesis to my students | photosynthesis passage | ✓ | photosynthesis passage ✓ |
| few | Explain water to my students | water-cycle passage, **not** the photosynthesis one | ✗ (the photosynthesis passage was also returned) | water cycle only ✓ |
| large: 9 passages | Explain water to my students | none (4+ scope rules, unchanged) | none | none ✓ |

On the previous recall version the guard tests give 6 failed and 9 passed, so 39 of the file's 45 tests pass. On the current version all 45 pass.

The Arabic water probe gives none on both versions because the passage writes "والماء" with the conjunction attached. The tokenizer keeps it as one word, so it never matches "الماء". That makes this probe a weak test of the guard; it is kept only as a regression check.

## 4. All 31 earlier probes, before and after

Same harness and same three single-passage scopes as the recall report:
- rows 1–12, 18, 19, 23–25 and 29–31 use the English photosynthesis passage;
- rows 13–17, 21, 22, 27 and 28 use the Arabic passage;
- rows 20 and 26 use the passage that says plants release oxygen gas.

Columns: HEAD (original code), v1 (first P8 fix), Precision, Recall (previous pass), Current (guard). Rows 29–31 are informational.

| # | Question | Expected | HEAD | v1 | Precision | Recall | Current |
|---|---|---|---|---|---|---|---|
| 1 | Where in the plant does photosynthesis happen and what does chlorophyll absorb? | SOURCE | none | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 2 | How does chlorophyll use sunlight? | SOURCE | none | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 3 | What happens in the chloroplasts of plant leaves? | SOURCE | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 4 | What does a plant turn carbon dioxide and water into? | SOURCE | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 5 | What energy source powers an electric car and how much water does it use? | none | none | SOURCE | none | none | **none** ✓ |
| 6 | Is oxygen or carbon dioxide heavier in the air we breathe? | none | none | SOURCE | none | none | **none** ✓ |
| 7 | What turns water into steam in a kettle? | none | none | SOURCE | none | none | **none** ✓ |
| 8 | How do plant cells divide during mitosis? | none | none | none | none | none | **none** ✓ |
| 9 | Why are leaves green? | none | none | none | none | none | **none** ✓ |
| 10 | Who won the football world cup in 1998? | none | none | none | none | none | **none** ✓ |
| 11 | Describe the oxygen tank on a submarine | none | none | none | none | none | **none** ✓ |
| 12 | What is the capital city of France? | none | none | none | none | none | **none** ✓ |
| 13 | كيف يمتص الكلوروفيل ضوء الشمس؟ | SOURCE | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 14 | أين يحدث البناء الضوئي في النبات؟ | SOURCE | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 15 | ما هو ثاني أكسيد الكربون في السيارات؟ | none | none | SOURCE | none | none | **none** ✓ |
| 16 | What is ثاني أكسيد الكربون in cars? | none | none | SOURCE | none | none | **none** ✓ |
| 17 | من فاز بكأس العالم؟ | none | none | none | none | none | **none** ✓ |
| 18 | Can you summarise photosynthesis simply for my grade 5 students? | SOURCE | none | none | none | SOURCE | **SOURCE** ✓ |
| 19 | Summarize photosynthesis for 10th grade students | SOURCE | none | none | none | SOURCE | **SOURCE** ✓ |
| 20 | What gas do plants release in photosynthesis? | SOURCE | SOURCE | SOURCE | SOURCE | SOURCE | **SOURCE** ✓ |
| 21 | اشرح البناء الضوئي لطلاب الصف الخامس | SOURCE | none | SOURCE | none | SOURCE | **SOURCE** ✓ |
| 22 | لخص البناء الضوئي للطلاب ببساطة | SOURCE | none | SOURCE | none | SOURCE | **SOURCE** ✓ |
| 23 | Explain the water cycle to my students | none | none | none | none | none | **none** ✓ |
| 24 | Summarise the history of football for grade 5 students | none | none | none | none | none | **none** ✓ |
| 25 | Explain simply how carbon dioxide gets into car engines | none | none | SOURCE | none | none | **none** ✓ |
| 26 | What gas powers a kitchen stove? | none | none | none | none | none | **none** ✓ |
| 27 | اشرح ثاني أكسيد الكربون في السيارات للطلاب | none | none | SOURCE | none | none | **none** ✓ |
| 28 | لخص تاريخ كرة القدم لطلاب الصف الخامس | none | none | none | none | none | **none** ✓ |
| 29 | What gas do plants release in photosynthesis? | info: passage has no gas/release | none | none | none | none | **none** — |
| 30 | Explain water to my students | info: one topical word | none | none | none | SOURCE | **none** — |
| 31 | Summarise this document for my students | info: no topical word | none | none | none | none | **none** — |

Required rows correct (of 28):

| HEAD | v1 | Precision | Recall | Current |
|---|---|---|---|---|
| 22 | 19 | 24 | 28 | **28** |

The only row that changed from the previous pass is row 30, "Explain water to my students", which went from SOURCE to **none**. That is the requested fix.

## 5. Remaining trade-offs

**Recall (false negatives).**
1. A one-topic-word question whose topic is real but mentioned once, mid-text, now gets no source. Example: "Explain chlorophyll to my students" against the photosynthesis passage (§3). This is the deliberate cost of the guard. Adding a second topic word avoids it ("explain how chlorophyll absorbs sunlight" has 3 content words).
2. **Heading metadata is limited.** Only Word documents carry section labels. PDF and text headings aren't extracted, and file names like `lesson1.pdf` say nothing about the topic. Better grounding would need heading extraction at ingestion, which means re-extraction.
3. The opening-word fallback assumes the passage starts at a natural point. Passages produced by splitting a long page can start mid-paragraph, so the opening word may be incidental. In that case it errs toward accepting.
4. Earlier limits still hold:
   - synonyms ("release gas" vs "turn into oxygen", row 29);
   - questions with no topic word (row 31);
   - Arabic prefixes such as و/ب/ل on topic words;
   - instruction words not on the list.

**Precision (false positives).**
1. A one-topic-word question still matches when the word is the passage's opening word or appears in two sentences, even if the passage isn't really about it. Example: "Explain puddles to my students" would match the evaporation passage, which opens with "Puddles". This is lexically indistinguishable from a real topic.
2. The file name is supplied by the uploader. A misleading file name grounds a topic. This stays within the same school and the documents the user selected.
3. Earlier limit, unchanged: a question of 5 or more content words missing exactly its topic word can still match.

## 6. Files, tests and checks

| Path | State | Origin |
|---|---|---|
| `backend/src/app.ts` | modified, −16 | P8 (F-5) |
| `backend/src/routes/stagingMaintenance.routes.ts` | deleted | P8 (F-5) |
| `backend/test/p6StagingMaintenance.test.ts` | deleted | P8 (F-5) |
| `backend/src/services/curriculumRetrieval.ts` | modified, +61/−1 against HEAD (all F-3 passes) | P8; **this task**: `groundsTopic` and its use in `coversQuestion` |
| `backend/test/p8SmallScopeRetrieval.test.ts` | untracked | P8; **this task**: section-label support in the fixture helper, 6 guard fixtures and 15 guard cases. No earlier case was changed or removed. |
| `docs/benchmarks/diagnostics/20261029T100818Z-p8-f3-single-topic-guard/` (this report and `SOURCE_PROVENANCE_P8_F3_SINGLE_TOPIC.json`) | untracked, new | **this task** |
| Earlier P8 report folders (`…090418Z-p8-p1-fixes`, `…094732Z-p8-f3-precision`, `…095942Z-p8-f3-recall-finalization`) | untracked | unchanged |
| `backend/test/p7RoleMatrix.test.ts`, `backend/src/scripts/benchmark3Model.ts`, the revised P7 report | untracked | P7, unchanged |

Tracked diff: 4 files, +61/−270.

| Command | Exit | Result |
|---|---|---|
| `npx vitest run test/p8SmallScopeRetrieval.test.ts`, run 1 | 0 | 45/45 |
| `npx vitest run test/p8SmallScopeRetrieval.test.ts`, run 2 | 0 | 45/45 |
| Same file on the previous recall version (restored afterwards and checked with `cmp`) | 1 | 39 passed, 6 failed, as listed in §3 |
| `npx vitest run test/p8SmallScopeRetrieval.test.ts test/elie.sprint6.test.ts test/p2Documents.test.ts` | 0 | 3 files, 76/76 |
| `npx vitest run` (full backend) | 0 | **64 files, 796/796** |
| `npx tsc --noEmit -p .` (backend) | 0 | — |
| `npx tsc --noEmit -p .` (frontend) | 0 | — |
| `npm run build` (frontend) | 0 | — |
| `git diff --check` | 0 | clean |
| Whitespace check on every untracked file | — | clean, except the known trailing space at `…090418Z-p8-p1-fixes/ENARA_P8_P1_FIXES_REPORT.md:76`. It is in a historical report, so I left it. |

**Test counts:**
- the recall pass ended at 781;
- this task adds 15 guard cases: 781 + 15 = **796**, in the same 64 files;
- the earlier history was 756 (HEAD plus P7), 769 after the precision pass and 781 after the recall pass.

**Provenance:** I ran `npx tsx src/scripts/sourceProvenance.ts --phase P8-F3-single-topic --out <this folder>/SOURCE_PROVENANCE_P8_F3_SINGLE_TOPIC.json` and it exited 0. The recorded `curriculumRetrieval.ts` hash begins `28d5831e53242c7b` and matches the working file. No earlier snapshot was touched.

No secrets or environment values appear in any changed or new file.

## 7. Recommendation

**Stop for review. No deployment is authorized.** Once you approve:
1. Commit and push the P8 set. Decide whether the unrelated P7 files go into the same commit.
2. Delete `STAGING_MAINTENANCE_TOKEN` in Vercel, redeploy the reviewed commit, and check that the old token gets **404**, `/health` returns 200, and the variable is gone. **F-5 stays unresolved on the live deployment until this is done.**
3. Check F-3 on staging with AI paused. Use one document, and ask:
   - a valid question;
   - an instruction-style question;
   - a one-topic-word question, once with the topic in the file name and once without;
   - an off-topic question.
4. The $4 English-assessment benchmark needs separate authorization and was not run.

Arabic assessment generation remains OUT OF SCOPE FOR THIS RELEASE. Arabic grounded chat, tutor and lesson planning remain in scope. Arabic rubric grading is unchanged.
