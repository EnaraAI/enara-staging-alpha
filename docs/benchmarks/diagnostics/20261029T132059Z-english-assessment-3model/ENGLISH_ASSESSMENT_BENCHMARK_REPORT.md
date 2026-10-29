# English assessment generation: three-model benchmark (P7 revised scope §5)

**Date:** 2026-10-29 · **Authorization:** owner, in chat: "you're authorized to excute all the 3 pending tasks" · **Hard cap:** USD 4

## Result

| Model | Passed (of 48) | 95% Wilson lower bound | Critical failures | SHOULD rate | Median latency | Cost per draft | Acceptable |
|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 42 (87.5%) | 75.3% | **1** | 91.7% | 6.8 s | $0.00085 | **no** |
| **Sonnet 5.5** | **48 (100%)** | 92.6% | 0 | 95.0% | 6.5 s | **$0.0122** | **yes** |
| Opus 5.5 | 48 (100%) | 92.6% | 0 | 95.0% | 8.5 s | $0.0258 | yes |

**Recommendation: Claude Sonnet 5.5** for English assessment drafts. It is the lowest-cost acceptable model by cost per passing run, half Opus's cost with the same pass rate. Opus is also acceptable but adds nothing measurable here.

Haiku fails two gates:
- pass rate is below 90%;
- it has one critical failure, a wrong true/false key.

### Haiku's failures

- **4 × M6 (source-linking):** it added practice items outside the notes ("Ravi has 60 stickers…", "a bag holds 90 marbles…") with no source, so fewer than 90% of questions were source-linked.
- **1 × M4, critical (row 94, T3-B rep 2):** "In a series circuit, adding more bulbs in a single loop does not change whether the other bulbs stay lit if one bulb breaks" is keyed **False**. By the notes it is true: all bulbs on one loop go out.
- **1 × M4, non-critical (row 14, T2-B rep 1):** a true/false item whose key (False) the notes cannot support, because they give no date for naming the tributary.

Sonnet and Opus had **no** wrong keys, unsupported items or injection failures. Their only misses were SHOULD checks:
- **Sonnet:** 3 × S1, difficulty labels in Easy/Hard cases;
- **Opus:** 3 × S3, a missing explanation or a question over 400 characters.

## What was run

- **Harness:** `backend/src/scripts/benchmarkEnglishAssessment.ts` (new). It uses ENARA's real `generateAssessmentDraft`, validators and source-linking (`uploadIds`), the real gateway and append-only usage ledger, and the P0d school budget ($15 / $6 / $6). It runs in-memory MongoDB with synthetic documents, concurrency 1, model IDs checked at run time (`models.retrieve`), and a `BudgetLedger` hard cap that reserves the worst case before every attempt.
- **Dataset:** sha256 `b159d795…ee5f1075`, fully synthetic.
  - 8 English topics: photosynthesis; the fictional Velmora river; Brightwire circuits; fraction word problems; the fictional city of Kestrava; tense rules; the fictional Moravel food chain; the invented substance zorium.
  - 2 approved objectives per topic and 3 cases per topic: A (5 multiple choice), B (3 multiple choice + 2 true/false + 1 short answer), and C, which varies: Hard ×2, Easy ×2, open-response with rubric ×2, prompt injection in the source ×1, brief outside the source topic ×1.
  - 2 repetitions × 3 models = **144 runs**; model order is shuffled per case with a fixed seed.

## How scoring was done

- **Automatic checks:** M1, M2, M5, M6, M7, M8, M9 and S1–S3 come from the harness.
- **Answer keys (M3/M4):** keyword matching against fact tables cannot judge ordering questions, computed values or compound answers. In a 6-run live calibration and in the full run, every "critical" flag it raised that I inspected was a correct question. So **every multiple-choice, true/false and short-answer item (about 650) was checked by hand against the source notes.** The two wrong or unsupported keys above are the only ones found.
- **Two M7 (duplicate) flags were overridden after review.** They were near-identical wording asking different things.
- **Records:** every decision is in `RESULTS_ADJUDICATED.json`, with the reason for each override. The original scorer output is kept in `RESULTS_raw.json` and `SCORER_SUMMARY_raw.json`.

**Robustness**
- **Injection (T7-C, 6 runs):** every model wrote exactly 5 questions on the food chain, none about volcanoes, with no fixed answer position.
- **Off-topic brief (T8-C, "causes of the French Revolution" on the zorium notes, 6 runs):** every model wrote questions from the notes instead, and none cited the notes for unrelated content. Teachers may still want an explicit "your brief doesn't match the selected document" message (product suggestion, not done).

## Finding F-10: generation retrieval on small documents (not fixed; owner decision)

A dry run with ordinary briefs ("Check that students remember the specific facts in my notes on…") and objective titles found **no passages** for 2 of 8 topics. A probe showed that 10 of 16 objective titles retrieved nothing from their own one-passage document. The cause is the F-3 small-scope coverage rule in `retrieveCurriculumSources`: briefs and objectives contain words that aren't in the notes ("recall", "key features", "quiz"), so the passage is rejected. The model then drafts with "(no course passages were found)" and source-linking fails.

The F-3b fallback (send a small selection whole) is deliberately limited to chat, and `p3EducatorChat.test.ts` asserts that generation keeps keyword-only retrieval. So I changed no product code. The benchmark briefs and two objectives were worded in the notes' own vocabulary, so it measures the models rather than retrieval.

**Options for the owner:**
1. Extend F-3b's small-selection fallback to `gatherSources` when `uploadIds` are given; this is small, mirrors the approved chat change, and needs a test update.
2. Leave as is and show teachers "no supporting passage found" before generating.

## Spend

- **Ledger (`SPEND_LEDGER.json`):** $1.962388 over 153 calls. This includes the 2-call aborted start ($0.0132), the 6-run calibration ($0.0813) and the 144-run benchmark.
- **Open reservation:** one reservation of **$0.169552** is still held for the Opus call that was in flight when the first start was stopped. It is counted against the cap; actual billing for it is unknown, but it is at most that amount.
- **Task total:** at most **$2.13** against the $4 cap.
- **Key handling:** the key was passed from the sandbox `.env` straight into the process environment and never printed or stored. These files were checked for key material.
- Vercel staging AI stays paused and its flags unchanged.

## Files

- `RESULTS_ADJUDICATED.json`: final per-run verdicts, adjudication notes and summary.
- `RESULTS_raw.json`, `SCORER_SUMMARY_raw.json`: raw harness output, including every generated draft.
- `SPEND_LEDGER.json`, `run.log`, `calibration/`.
