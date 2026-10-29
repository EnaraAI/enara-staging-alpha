# ENARA F-3: retrieval options review (read-only)

Date: 2026-10-29 (UTC). Repository `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `d52784d`. I reviewed the uncommitted P8 working tree.

**This report is the only file created.** No code, test or historical report was changed. No remote service was contacted, no paid or provider calls were made, nothing was deployed, no migrations ran, and no environment variables were changed.

The task brief says both "do not create files inside the repository" and "create this report under `docs/`". I followed the specific deliverable instruction and created only this report.

Evidence labels:
- **[V]** verified from the code or local test output;
- **[A]** an assumption or expectation that has not been measured.

## 1. Current behavior and known limitations

- **[V]** `retrieveCurriculumSources` (`backend/src/services/curriculumRetrieval.ts`, uncommitted P8 version) is keyword BM25 search (`retrieval-v1`). In scopes of **4+ passages** it keeps the original rules: at least 2 shared terms and a score of at least 1. In scopes of **1–3 passages** it uses the P8 rules:
  - content-word coverage, after question, framing and grade words are removed;
  - for one-topic-word questions, the topic must appear in the file name or section label, in two or more sentences, or as the passage's opening word.
- **[V]** The full backend suite passes 796/796, and `p8SmallScopeRetrieval.test.ts` passes 45/45 (P8 single-topic report).
- These probes are **28 hand-written cases on synthetic one-passage documents. They do not prove retrieval is correct in general.**

Known limitations, all **[V]** from the P8 probes:
1. Valid one-topic-word questions whose topic appears once, mid-text, get no source. Example: "Explain chlorophyll to my students".
2. Synonyms and paraphrases: "release gas" vs "turn into oxygen".
3. Arabic prefixes attached to words (والماء, لطلاب) block matches.
4. A question with no topic word ("Summarise this document") gets no source.
5. Heuristic false positives: the opening-word rule, a misleading file name, or a 5+ word question missing exactly its topic word.
6. PDF, TXT and MD files have no heading data (§2.3).

**The cost of a retrieval miss differs by feature. Each P8 report understated this for chat.** **[V]**
- **Educator chat** (`educatorChat.ts`): when retrieval returns nothing, it **ends early with `no_sources`** ("No approved source in the selected documents supports an answer…"), and **no model call is made**. So every recall miss above is a hard refusal for a teacher who selected the right document. It is not a general-knowledge answer, which is what the earlier P8 reports said.
- **Tutor** (`tutor.controller.ts` and `tutorExtras.controller.ts`, using `sourcesPrompt`): with no passages, the tutor answers at the right level from general knowledge and cites nothing.
- **Lesson planning and assessment generation** (`educatorAi.ts`, `gatherSources`): generation runs with "(no course passages were found)" in place of sources.

## 2. Architecture and dependency findings

### 2.1 Retrieval callers [V]

| Caller | Scope given | Uses `uploadIds` | What happens with no sources |
|---|---|---|---|
| `services/educatorChat.ts:181` (grounded chat) | school + curriculum + **the teacher's selected eligible documents**; k = 6 | yes, always | `no_sources` refusal, no model call |
| `controllers/tutor.controller.ts:267` | school + curriculum + lesson | no | answers from general knowledge, no citation |
| `controllers/tutorExtras.controller.ts:138` | same | no | same |
| `services/educatorAi.ts:27` (lesson plans and assessments) | school + curriculum (+ lesson, + `uploadIds` when sources were chosen); k = 3, up to 5 queries | optional | generates without sources |

### 2.2 Normalization [V]

`textSearch.ts`:
- lowercases text, applies NFKC, and normalizes Arabic letter forms (أ إ آ ٱ become ا, ى becomes ي, ة becomes ه), removes diacritics and tatweel, and converts Arabic-Indic digits;
- strips the Arabic definite article "ال" only from words longer than 4 letters;
- removes a short English and Arabic stop-word list;
- **does no stemming or prefix handling** for و / ب / ل / لل.

The same function builds both the stored passage `terms` (`curriculumExtraction.ts:150`) and the query terms. So any change to normalization means re-extracting every passage. P8 avoided that by changing only the query side.

### 2.3 Metadata and passage boundaries [V]

- `CurriculumChunk` stores `fileName`, `page` (PDF only), `sectionLabel` (DOCX only, from `docxSections`), `chunkIndex`, `text`, `terms` and `termCount`. **There are no titles, summaries or embeddings.**
- PDF text comes from `unpdf` `extractText` (`mergePages: false`). That returns plain text per page, with no font or layout information, so headings can't be told apart. TXT and MD files are a single page with no labels.
- `chunkPage` splits at blank lines or capitalized line starts and caps passages at `CHUNK_CHARS = 1000`; long paragraphs are cut at a space. A small document is therefore at most about 3,000 characters across 1–3 passages.

### 2.4 Semantic, embedding and reranking capability [V]

Searched for: embedding, vector, cosine, rerank, `$vectorSearch`, onnx, `@xenova`/transformers, openai, voyage, cohere, pgvector, faiss, stemmer.

- **Neither `backend/package.json` nor `frontend/package.json` lists any embedding, vector or stemming dependency.** In the source, the word "semantic" appears only in grading prompts (`gradingProposals.ts`, `hybridV1/v6.ts`), never in retrieval.
- `config/postgres.ts` and `ingestionService.ts` use Postgres for ingestion events only (P7 F-1), not vectors. Staging does not use Postgres.
- `ENARA_ORCHESTRATOR_URL` and `AI_ENGINE_URL` are external services; this repository contains no embedding API for them.
- **[A]** MongoDB Atlas offers Atlas Vector Search, but it needs vectors from an embeddings provider. Anthropic offers no embeddings API, so it would be a new vendor. Whether the staging Atlas tier supports vector indexes is unverified, because I did not contact Atlas.

**Conclusion: no semantic retrieval capability exists in the repository.**

### 2.5 Grounded-chat prompt and citation path [V]

`educatorChat.ts`:
- **Prompt rules:** `systemPrompt` tells the model to answer only from the numbered passages, cite every factual sentence as [n], and reply exactly `NOT_IN_SOURCES` if the passages don't support an answer.
- **Answer handling:** after the call, an answer with no text, containing `NOT_IN_SOURCES`, or **without at least one citation the server validated** is replaced by `UNSUPPORTED_ANSWER`. Citation markers that weren't validated are removed. Test coverage: `p3EducatorChat.test.ts:143` "an uncited or NOT_IN_SOURCES reply is not passed on".
- **Metering:** the call goes through `meteredMessage` (`aiGateway`) with `feature: 'educator_chat'`, `maxAttempts: 2`, a token bound for input and output, `MAX_OUTPUT_TOKENS = 1500` and effort `low`. That puts it under the P0d budget reservation. Separately, P7 F-6 found chat and tutor outside the `aiJson` guard; this doesn't change that.
- **Implication:** the chat path **already has an answer-time relevance and entailment check**, as part of the same model call. A retrieval false positive in chat leads to the model declining and the server refusing an uncited answer. It does not produce a false citation, provided the model obeys the prompt.
- **Measured evidence:** P7 `ch-en-unanswerable` declined on all 3 models, and the answerable cases cited correctly. **n = 1 per model.**

### 2.6 Isolation guards [V]

- Retrieval always filters on `institutionId` and `curriculumId` and returns nothing if either is missing.
- `uploadIds` can only narrow that scope.
- Where the document safety gate is required, only cleared documents are searched (`clearedUploadIds`).
- Chat resolves eligible documents for the user's own school, and the conversation is tied to the user and the school (`loadOrCreateConversation`).

Every option below keeps this query scope unchanged.

### 2.7 Tests and probes that reproduce the current behavior [V]

- `backend/test/p8SmallScopeRetrieval.test.ts` (untracked), 45 tests: 28 required probe cases (precision and recall), 15 single-topic guard cases, scope tests and the F-5 test. Run it with `cd backend && npx vitest run test/p8SmallScopeRetrieval.test.ts`.
- Related suites: `test/elie.sprint6.test.ts` (retrieval and extraction), `test/p2Documents.test.ts` (document scoping) and `test/p3EducatorChat.test.ts` (17 chat tests: refusal, NOT_IN_SOURCES and citation handling).
- The 31-probe before/after harness used in the P8 reports was a temporary script outside the repository (under `/tmp/claude-0`). It is not part of the repository.

## 3. Option comparison

| | A. Keep the current lexical guard | B. Better metadata and extraction | C. Lexical + semantic hybrid | D. Separate relevance/entailment call | **E. Small-scope pass-through to the existing grounded check (chat only)** |
|---|---|---|---|---|---|
| **What it is** | Ship P8 as it is | Pull headings from PDF/TXT (font size, layout, markdown `#`) into `sectionLabel` or a title field | Embed passages and queries; combine vector and BM25 scores | Before citing, an extra model call judges whether each passage supports the question | In `educatorChat` only, when the teacher's selected eligible documents hold **≤ 3 passages**, send all of them to the existing answer call and rely on `NOT_IN_SOURCES` and citation validation. Lexical retrieval stays for ranking in 4+ passage scopes and for tutor, lesson planning and assessment generation |
| **False positives** | Residual heuristic false positives remain (§1, item 5) | Fewer one-topic false positives where headings exist; no change elsewhere | Can add false positives from loose semantic neighbors; needs a threshold and tuning | Lowest, if the judge is reliable [A] | **No false citation possible without the model citing.** Off-topic questions should end as `NOT_IN_SOURCES` and an `unsupported` refusal [A: P7 n = 1 per model] |
| **False negatives** | One-topic, synonym, Arabic-prefix and no-topic questions all refused in chat | One-topic gaps reduced for documents with detectable headings; synonym, prefix and no-topic gaps unchanged | Synonyms and paraphrases improved [A]; Arabic quality depends on the model | Retrieval misses still happen before the judge runs, so the gaps are unchanged unless combined with E | **Small-scope chat retrieval misses eliminated by construction:** every selected passage reaches the model, which handles synonyms, morphology and "summarise this document" [A, needs a paid check] |
| **Migration / re-extraction** | None | **Re-extraction of all PDF/TXT documents.** No schema change if `sectionLabel` is reused; a new title field needs a schema change | New stored field or collection, and an **embedding backfill of all passages** | None | None |
| **New dependencies / models / vendor** | None | Possibly PDF layout parsing (`unpdf` `getTextContent` items with font size; no new package, but new logic) | **New embeddings vendor, new secret, new contract**; or a local model download (WASM or ONNX, large, cold starts on Vercel) | None (Anthropic) | None |
| **Provider calls / paid use** | No change | None | Embedding calls when passages are indexed and for every query | **+1 call per question** (×2 latency) | **No new call type.** Questions that are refused today without a call would now make **one existing chat call** each, plus up to about 3,000 more characters (about 750 tokens [A]) of input on small scopes |
| **Arabic + English** | Arabic prefix gaps | Heading detection in right-to-left PDFs is harder (`fixRtlLine` exists) [A] | Depends on the embedding model's Arabic support [A] | Models handle both (P7 Arabic chat PASS, n = 1) | Same model path already PASSes Arabic chat in P7 (n = 1) |
| **Latency / cost** | No change | Ingestion only | Embedding round-trip per query; vector index cost | Slower and more expensive on every question | Tiny: about 750 tokens of extra input, at most about $0.003 per question on Opus at $4/M input [A, list price from P7], and about $0.0001 on Haiku. P7 measured chat latency at 0.8–1.6 s. All of it stays inside the existing `meteredMessage` budget bound and P0d |
| **Citation grounding** | Lexical | Lexical | Lexical + vector; citations still come from stored passages | Judge plus answer | Unchanged server-side check: only valid [n] for passages that were sent are kept; no citation means a refusal |
| **Isolation** | Unchanged | Unchanged | Vector search must apply the same school, curriculum and document filters; risk of mistakes | Unchanged | Unchanged: the passages are exactly those of the selected eligible documents, found with the same scoped query |
| **Scope** | — | Medium (ingestion work) | Large: new component | Medium | **Small: one branch in `educatorChat`, plus tests** |

**Note on D:** in chat, the existing answer call already does D's job, since it must reply `NOT_IN_SOURCES` and must cite. A separate judge call would mostly repeat that work at extra cost. D is only worth considering for features without such a check, such as the tutor or generation.

## 4. Recommendation for this release

**Recommended: Option E for grounded educator chat, with Option A (the current P8 lexical guard) kept for every other caller and for 4+ passage scopes. B, C and D are deferred.**

Rationale:
1. **Verified:** in chat, a retrieval miss is a hard refusal with no model call (§1), so the remaining recall gaps directly break the F-3 user story. More word lists have diminishing returns, as four P8 rounds showed, and each round traded one error for another.
2. **Verified:** chat already has an answer-time grounding gate: `NOT_IN_SOURCES`, at least one validated citation, and removal of unvalidated citation markers. E puts precision in the layer built for it and removes the need for lexical heuristics when the scope is only ever 1–3 passages that the teacher chose.
3. **Verified:** no semantic component exists, and C needs a new vendor or model, a backfill and new secrets. That is not suitable for this release.
4. **Verified:** E needs no migration, re-extraction, new dependency, storage or secret, and it keeps school, curriculum, document and safety-gate scoping exactly as it is.
5. **Assumption:** E's precision depends on the model following `NOT_IN_SOURCES` when unrelated passages are present. P7 tested that with **one** case per model. **E must not be accepted without the paid verification below.**

Tutor, lesson-plan and assessment retrieval stay on the P8 lexical guard. For the tutor, a miss falls back to an uncited general-knowledge answer, which is less harmful.

If the owner does **not** approve the small paid verification, the fallback is **Option A**, shipped with its limits documented.

**F-3 status:** split it into two issues.
- **F-3a (precision, lexical layer):** **FIXED WITH KNOWN LIMITATIONS.** The 28 required probes pass, and the residual false positives are listed in §1, item 5.
- **F-3b (small-scope chat recall):** **OPEN** until either E is implemented and verified, or the owner accepts A's refusals for one-topic, synonym, Arabic-prefix and no-topic questions.

### 4.1 Acceptance criteria for E

**Offline, no AI calls (vitest, model mocked):**
1. Chat with one or more selected documents totalling ≤ 3 eligible passages sends **all and only** those passages to the model, whatever the question's wording. This covers the chlorophyll, synonym, Arabic-prefix and "Summarise this document" cases.
2. Totals of 4+ passages still go through lexical retrieval, with no change.
3. Passages from other schools, other curricula, unselected documents and uncleared documents (with the safety gate on) are never sent. These are cross-school and cross-document negative tests.
4. `NOT_IN_SOURCES`, uncited and invalid-citation replies still become `unsupported`. The existing `p3EducatorChat` tests stay green.
5. The full backend suite, typechecks and build pass. The 28 required P8 probes stay green for the lexical function.

**Paid, needs separate owner approval and a hard cap:**
- Run the 31 P8 probe questions, the 15 single-topic cases and the chlorophyll, synonym and Arabic-prefix cases (about 50 questions) through real `educatorChat`, on the staging chat model, with one synthetic document. Run each twice.
- **Pass criteria:**
  - **0 cited answers** to off-topic probes;
  - **at least 95% answered with a correct citation** on valid probes, English and Arabic;
  - median latency **≤ 3 s**;
  - all spend metered.
- **[A] Estimated cost:**
  - at most about $0.40 on Opus at P7 list prices;
  - about $0.02 on Haiku;
  - **proposed cap: $1**, separate from the $4 English benchmark.

## 5. What was and was not tested

**Done, read-only and local:**
- read `curriculumRetrieval.ts`, `textSearch.ts`, `curriculumExtraction.ts` (`chunkPage`, `extractPages`), the `CurriculumChunk` model, `educatorChat.ts`, `educatorAi.ts` (`gatherSources`), the tutor controllers' retrieval calls, `directTutorModel.ts` (`sourcesPrompt`), `env.ts` (default tutor model `claude-opus-5-5`), and the package manifests;
- searched for semantic, embedding and vector code and dependencies;
- referenced the earlier P8 test results and P7 chat results; I did not re-run them in this task.

**Not tested:**
- Option E or any other option. Nothing was implemented.
- Model behavior with unrelated passages beyond P7's n = 1 per model.
- Atlas Vector Search availability on the staging tier.
- PDF heading detection feasibility on real documents.
- Embedding-model quality in Arabic.
- Cost and latency figures in §3 and §4.1 marked [A], which come from list prices and P7 medians, not new measurements.
- Retrieval on real-world documents. All probes use synthetic one-passage texts.

## 6. Suggested next implementation plan (not implemented)

1. **Get owner approval:** the E approach, plus the paid verification with a $1 cap.
2. **Code** (`educatorChat.ts`, about 15–25 lines): after resolving eligible documents, count their passages with the same scoped query `retrieveCurriculumSources` uses (school, curriculum, `uploadId ∈ eligible`, safety gate). If the count is ≤ 3, load those passages directly as sources, ordered by document and `chunkIndex`, numbered 1..n. Otherwise use the existing retrieval call. Prompt, metering and citation checks stay unchanged.
   - Option: keep the P8 lexical result as ranking metadata only.
   - Consider exporting a small `scopedChunks()` helper from `curriculumRetrieval.ts`, so the scope query is defined in one place.
3. **Tests:** the offline criteria in §4.1 (items 1–5), in a new test file. Keep `p8SmallScopeRetrieval.test.ts` unchanged.
4. **Validation:** the full suite, both typechecks, the frontend build, `git diff --check`, a new provenance snapshot and a report.
5. **Paid verification** (approved separately), then a decision on F-3b.
6. **Later releases:** B (PDF/TXT heading extraction at ingestion, with a re-extraction job) and C (embeddings), only after the vendor, Arabic quality and isolation-filtered vector search have been evaluated.

Unchanged by this review:
- F-5 is still unresolved on the live deployment; the token must be removed in Vercel, the reviewed code redeployed, and the old token must get 404;
- the $4 English assessment benchmark is still unapproved and was not run;
- Arabic assessment generation is out of scope for this release.
