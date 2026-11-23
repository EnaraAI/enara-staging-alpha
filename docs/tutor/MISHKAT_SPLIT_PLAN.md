# Mishkat + v3b criterion split — plan

_23 Nov 2026. **Plan only.** lms-test only. One switch, **off by default**. It is turned on only after the Arabic length tests pass **and** Mohamed says "go". Mishkat's labels are model-marked (development only) until teacher marks confirm them._

## What it does
For a written language answer (short answer or essay, Arabic or English), each criterion is scored by one grader:

| Criterion | Scored by | Why |
|---|---|---|
| Grammar | **Mishkat** | Ranks far better than v3b on human-scored essays (QWK 0.39 vs 0.11 English, 0.61 vs 0.16 Arabic); at least equal on ENARA answers |
| Spelling/punctuation | **Mishkat** | Same pattern (0.40 vs 0.13; 0.60 vs 0.30) |
| Vocabulary (essays) | **Mishkat** | Better or equal on both checks |
| Task completion | **v3b** | Needs the meaning of the question and the answer; v3b is clearly better |
| Organisation (essays) | **v3b** | v3b clearly better on ENARA answers |
| Feedback text, strengths and improvements, evidence quotes, error codes, integrity flags | **v3b** | Mishkat gives numbers only |

Code-decided criteria from the rules-first grader (when its switch is on) still come first. Spoken answers (speaking exams) stay fully with v3b, because Mishkat has not been trained on transcripts.

## The switch
- **`mishkatSplit`**, a part of `ENARA_ENGINE_V2`.
  - Named only: "all" does **not** turn it on.
  - Off: grading is byte-for-byte as today, and a test proves it.
- **The model manifest** (`mishkat/manifest.json`, shipped with the model) lists, per language and question type, which criteria passed the bar. The switch only ever moves those. A criterion that later fails a monthly check drops back to v3b without a code change.

## Flow when the switch is on
1. v3b grades the answer as today (two runs, confidence, flags).
2. **In parallel**, Mishkat scores the same answer: one call, about 0.2–0.4 s.
3. For Mishkat's criteria, **Mishkat's score replaces v3b's**. Each criterion records `scoredBy: "mishkat"`, the model version and a short reason; the teacher's grading view shows "scored by Mishkat".
4. **Safety rules:**
   - **Unsure:** if Mishkat's raw score sits close to the boundary between two levels (within 0.15 of the midpoint), v3b's score is kept for that criterion. The case is logged.
   - **Disagreement:** if Mishkat and v3b differ by 2 levels on a criterion, the answer goes to the teacher's queue (a new flag reason, "graders disagree").
   - **Mishkat unavailable** (timeout 3 s, error, no model for that language or type): v3b scores everything, as today, and the case is logged. Grading never fails because of Mishkat.
5. **Feedback text stays v3b's.** v3b's per-criterion rationale is hidden for Mishkat's criteria, so the learner never sees "your grammar is weak" next to a good grammar score.

## Where Mishkat runs
- **A small CPU service on Modal**, next to the DeepSeek endpoint. Vercel cannot hold a 0.7 GB language model.
- **You add the Modal token as a secret yourself;** I never ask for it or print it. The backend calls the service with a shared token, like the DeepSeek endpoint.
- **Cost:** CPU only, about 0.3 s per answer. A few dollars a month at lms-test volume (to be measured on the first day).
- **Models:**
  - English: two-stage, pre-trained on ELLIPSE (CC BY 4.0) and fine-tuned on ENARA answers.
  - Arabic: **ENARA answers only (stage 2)**, so it has **no LAILA dependency**. That removes the LAILA licence question for the Arabic model.

## Tests before the switch can go on
1. **Unit tests:**
   - the merge rules (replace, boundary fallback, 2-level flag, unavailable fallback);
   - switch off = identical results;
   - spoken answers untouched;
   - a criterion missing from the manifest stays v3b.
2. **E2E:** one Arabic and one English answer through the full flow, with a stub Mishkat, checking "scored by Mishkat" in the teacher view and that the learner view shows no rubric leak.
3. **Benchmark:** the language sets re-run with the switch on lms-test; within 1 point must be ≥ 0.85 per set.
4. **Gates:**
   - the Arabic length tests pass (run 3, now running);
   - your review-sheet corrections are applied;
   - **your "go"**.

## After the switch (when you say go)
- **lms-test only, watched for a week:** how often the boundary fallback, the disagreement flag and the unavailable fallback fire.
- **Teacher marks**, when the first teachers return the sheet, replace model marks. Mishkat is retrained and re-checked with the same report, and any criterion that falls below v3b drops back.
- **Monthly retrain** with the same report and manifest.

## Risks
- **Model-marked labels:** Mishkat learned from three models' marks, not from teachers. The human-scored check is the only real evidence so far, and the English one is on older learners.
- **Feedback mismatch:** v3b's feedback text may hint at a different grammar level than Mishkat's score. That is why the per-criterion rationale is hidden. A later step could ask v3b to write its feedback after seeing the final scores.
- **One more service:** a Modal outage falls back to v3b, so grading continues, but the fallback rate must be watched.
