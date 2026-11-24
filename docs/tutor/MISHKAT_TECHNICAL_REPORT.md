# Mishkat: technical report

_For ENARA's AI engineer. State on 24 Nov 2026, 6:45 PM Cairo. All Mishkat labels are **MODEL-MARKED** (development only, never for claims, never for a real school) until teacher marks arrive. No secret values appear here; names only._

## 1. What Mishkat is
Mishkat is a small **trained scorer for the language criteria** of written answers in English and Arabic (essays and short answers). It runs next to **v3b**, ENARA's LLM grader (DeepSeek V4.1 Flash on Modal with the v3b rubric), inside one grading engine:

| Criterion | Essays | Short answers | Scored by |
|---|---|---|---|
| Grammar (`grammar_accuracy`) | 0–2 | 0–1 | **Mishkat** |
| Spelling and punctuation (`mechanics`) | 0–2 | 0–1 | **Mishkat** |
| Vocabulary (`vocabulary_range`) | 0–2 | — | **Mishkat** |
| Task completion | 0–2 | 0–2 | v3b |
| Organisation | 0–2 | — | v3b |
| Feedback text, strengths, improvements, error codes, flags | — | — | v3b |

**Why the split:**
- On human-scored essays, v3b ranks grammar poorly: ELLIPSE QWK 0.11, LAILA 0.16.
- Mishkat does far better there: 0.42–0.47.
- On content, the reverse holds. On the Egyptian test set Mishkat reaches 0.21 against v3b's 0.69, because Mishkat never sees the question or the model answer.

## 2. Data
### 2.1 ENARA dev pool (stage 2 targets), per language
- **Size:** 500 answers (360 from the benchmark plus 140 new), essays and short answers across language, science, humanities and listening.
- **Location:** branch `claude/tutor-lms-mishkat`, `data/mishkat-dev/pool-<lang>.json`.
- **Arabic:** fusha only. Colloquial counts as a grammar error, and no answer is written in colloquial on purpose.

**Marking:**
- **Markers:** three model markers per answer: DeepSeek (v3b), Claude Sonnet and Claude Opus, all with the v3b rubric. Arabic carries the colloquial rule (engine-v3c).
- **Kept:** answers where all three markers are within 1 point on every criterion.
- **Label:** the median mark per criterion (`labels-<lang>.json`: 495 English, 482 Arabic).
- **Owner corrections:** `owner-corrections.json` (review sheet) overrides the label. 0 have been applied so far.
- **Evaluation target:** **Sonnet–Opus agreed marks** (the subset where those two agree), so DeepSeek is never checking its own marks. The median, which includes DeepSeek's marks, is also reported.

### 2.2 Stage-1 corpora
All are downloaded at run time; only numbers are stored.

| Corpus | Licence | Used as |
|---|---|---|
| ELLIPSE (English) | CC BY 4.0 | analytic criteria (Grammar+Syntax → grammar; Vocabulary+Phraseology → vocabulary; Cohesion → organisation; Conventions → mechanics) banded to 0–2, plus holistic |
| ASAP 2.0 | CC BY 4.0 | holistic 1–6 only |
| PERSUADE 2.0 (official link) | CC BY 4.0 | holistic 1–6 only |
| AR-AES | CC BY 4.0 | holistic (mean of the two final scores, 0–10) |
| AR-ASAG (Mendeley) | CC BY 4.0 | holistic (average of 2 graders, 0–5), short answers |
| LAILA (Arabic) | authors' OK pending | **human re-check only** (not used in the shipped Arabic model) |
| Zenodo Arabic short answers (10.5281/zenodo.18630360) | CC BY 4.0 | **test only, never trained on** |

**Stage-1 target vector:** six columns, the five ENARA criteria (NaN where a corpus lacks one) plus holistic normalised to 0–2. The loss is masked MSE over the present targets.

### 2.3 Human re-checks
- **English:** 200 ELLIPSE **test-split** essays, the same as v3b's measurement. They are excluded from every training set, including the fine-tune, by normalised text match.
- **Arabic:** 200 LAILA essays.

## 3. Features and model
- **Encoder:**
  - English: `microsoft/deberta-v3-base`, fine-tuned (§5).
  - Arabic: `CAMeL-Lab/bert-base-arabic-camelbert-msa`, frozen.
  - Shared settings: max 256 tokens; mean pooling over the attention mask.
  - **Always fp32** (see §8).
- **10 hand features:** `spelling_per_100w` (hunspell: SCOWL en_US / Ayaspell ar), `punct_per_100w`, `linking_per_sent`, `subord_per_sent`, `words_per_sent`, `mean_word_len`, `mattr25`, `colloq_per_100w`, `lowercase_start_share`, `lowercase_i_per_100w`. These are length-robust (rates, not counts).
- **Feature vector:** `[embedding | 10 features]`, z-normalised with the training mean and SD (`norm.npz`). Feature version `v1`; the service refuses a bundle whose `featureVersion` differs.
- **Head:** `Linear(d,128) → ReLU → Dropout(0.2) → Linear(128, k+1)`. The extra output is holistic, a stage-1 auxiliary; it is trimmed from the exported head. One head per question type (essay, short answer).
- **Training:**
  - **Stage 1:** 15 epochs, Adam lr 1e-3, weight decay 1e-4.
  - **Stage 2** (from the stage-1 head): 80 epochs, lr 3e-4.
  - **Stage 2 only** (fresh head): lr 1e-3.
  - Shared: early stopping on a validation split (patience 8, best weights kept); batch 64.
- **Length augmentation (Arabic):**
  - Training copies of answers are shortened and padded with 1, 2 or 4 **same-kind sentences** (same type, same fold, same grammar and mechanics marks: owner's option b). Only grammar and mechanics targets are kept for those copies.
  - Copies come from training answers only.

## 4. Evaluation protocol
- **Cross-validation:**
  - 5 folds grouped by question, so a question's answers are never in train and test together.
  - The validation split is 1/8 of the training groups, shuffled (seeded).
  - Every ENARA answer is tested exactly once.
- **Metrics:**
  - QWK, exact agreement, within-1 and bias per criterion;
  - against the Sonnet–Opus agreed marks and against the median;
  - v3b's marks are scored the same way.
- **Length tests, per fold on test answers:**
  - a short correct answer (task 2, grammar 1, spelling 1) is not marked down: share ≥ 90%;
  - truncating a strong essay to 3 sentences: mean grammar+spelling drop ≤ 0.3;
  - padding with 3 same-kind sentences: rise ≤ 0.1.
- **Bar for a criterion to be served** (by the chosen recipe, against the median): within-1 ≥ 0.85 and QWK ≥ v3b. The manifest records it; the service serves the allow-listed criteria.
- **Egyptian set (Arabic, task completion):**
  - the teacher mark 0–5 is mapped 0–1 → 0, 1.5–3.5 → 1, 4–5 → 2;
  - Mishkat is scored on all 6,597 answers;
  - v3b on a 300-answer systematic sample (every 21st valid row).

## 5. English encoder fine-tune (Modal, A10G)
| | |
|---|---|
| Data | ELLIPSE train + ASAP 2.0 + PERSUADE (one row per essay), de-duplicated by normalised text; all ELLIPSE test texts removed. 27,215 train / 1,432 validation (5%) |
| Targets | The 6-column vector above; masked MSE |
| Model | DeBERTa-v3-base + Linear(768, 6) on mean pooling |
| Optimiser | AdamW lr 2e-5, weight decay 0.01 (not on bias/LayerNorm), linear schedule with 6% warm-up, gradient clip 1.0, batch 16, 2 epochs, fp32 + TF32 |
| Result | Validation masked MSE 0.157 → **0.143** (holistic 0.075, grammar 0.244, vocabulary 0.244, mechanics 0.270, organisation 0.292) |
| Cost | 15 min, about $0.28 (A10G at an assumed $1.10/h). Hard cap 50 min |
| Output | The encoder only (`save_pretrained`, no head) on Modal Volume `mishkat-ft:/en/20261124-828e2db`. The stage-2 head is trained on top in the bundle run |

**Failure found on the way (runs 1–3):**
- **Symptom:** a non-finite loss from step 1.
- **Diagnosis:** a first-batch check showed `transformers 5.24` loads this checkpoint as **float16** by default. AdamW on fp16 weights overflows on the first update.
- **Fix:** `.float()` after loading, here and in the shared `Encoder` (also the likely reason CPU runs were slow).
- **Guards added:** non-finite steps are skipped; the run stops after 20 bad steps; it refuses to save with no finite epoch.

## 6. Results
All QWK. ENARA columns are against the Sonnet–Opus marks.

**English** (shipped: fine-tuned encoder + ENARA-only head):

| | Run 7 (ELLIPSE 2,500, two-stage) | Run 10 (7,500 stage-1, no cap) | **Fine-tuned, stage 2 only** | v3b |
|---|---|---|---|---|
| ENARA essay grammar | 0.80 | 0.71 | 0.79 | 0.78 |
| ENARA essay spelling | 0.52 | 0.47 | **0.64** | 0.34 |
| ENARA essay vocabulary | 0.88 | 0.87 | **0.93** | 0.80 |
| ELLIPSE human grammar | 0.42 | 0.42 | 0.42 | 0.11 |
| ELLIPSE human vocabulary | — | 0.36 | **0.47** | 0.21 |

**What the English runs show:**
- Adding ASAP 2.0 and PERSUADE (holistic only) to stage 1 did not help.
- Short-answer grammar and spelling in English have almost no label spread (nearly all 1), so their QWK is about 0 for every system. Within-1 is about 1.0.

**Arabic** (shipped: run 10, AR-AES + AR-ASAG, two-stage, length augmentation):

| | Run 10 | Run 9 (AR-AES only) | v3b |
|---|---|---|---|
| ENARA essay grammar / spelling / vocabulary | **0.82** / 0.92 / 0.94 | 0.81 / 0.93 / 0.94 | 0.72 / 0.75 / 0.84 |
| ENARA short-answer grammar | 0.80 | 0.82 | 0.55 |
| LAILA human grammar / spelling | **0.47 / 0.52** | 0.46 / 0.44 | 0.16 / 0.30 |
| Egyptian set, task completion | 0.21 | 0.12 | **0.69** |

**Length tests:**
- every shipped model passes all three;
- English: 99% / 0.00 / −0.02;
- Arabic: 97% / 0.02 / 0.01.

**Learned merge (Step B):**
- **What it is:** a per-criterion logistic regression on the one-hot marks of Mishkat and v3b, trained on the Sonnet–Opus marks with 5-fold grouping.
- **Result:** it beat both v3b and the fixed split on some criteria only:
  - Arabic: essays plus short-answer task completion;
  - English: grammar, vocabulary, organisation and short-answer task completion.
- **Clear of noise:** only Arabic organisation (+0.09) and English short-answer task completion (+0.06), by bootstrap over questions.
- **Decision:** not shipped.

## 7. Serving and integration
### 7.1 Bundles (Modal Volume `mishkat-bundles`, `/<lang>`)
| File | Content |
|---|---|
| `manifest.json` | version, encoder (hub name or `encoder/`), max tokens, recipe, feature version and names, dim, per-type criteria, max, served, passesBar |
| `norm.npz` | mean and SD |
| `<type>.pt` | head `state_dict` |
| `encoder/` | **English only:** the fine-tuned encoder |

- **Shipped:** `mishkat-en-20261124-222e908b` and `mishkat-ar-20261124-222e908b`.
- **How they're built:** by `deploy/lms-test/mishkat/gpu/mishkat_gpu.py` on a Modal A10G (cap 50 min), which writes straight to the Volume.

### 7.2 Service (`deploy/modal/mishkat`, app `mishkat`)
- **Endpoint:** `POST /score {lang, type, text}` → `{version, scores (raw floats), criteria}`. Auth is `Bearer MISHKAT_TOKEN`, from the Modal secret `mishkat-auth`.
- **Health:** `GET /health`. Answer text is never logged.
- **Errors:**
  - 400: bad input;
  - 401: missing or wrong token;
  - 404: no bundle for that language or type;
  - 503: the bundle is unusable.
- **Hardware:**
  - CPU by default (2 cores, 6 GiB). `MISHKAT_GPU = False` is a one-line switch to an A10G.
  - Autoscaling 0–10 containers, `@modal.concurrent(max_inputs=8, target_inputs=4)`, scale-down after 300 s.
  - One container is kept warm Sunday–Thursday, 08:00–16:00 Cairo (scheduled `autoscaler.update` hourly; 0 at 16:00).
- **Start-up:** both bundles are loaded and warmed with a dummy answer per language and type at container start.
- **Address:** `https://enaraai--mishkat-web.us-east.modal.run` (US-East, next to Vercel iad1 and Atlas).

### 7.3 Backend (`backend/src/assessment/grading-engine/mishkat/`)
- **Where it applies:**
  - only with the `mishkatSplit` switch (named in `ENARA_ENGINE_V2`; not part of "all");
  - only for written language items in English or Arabic (`domain = language`, essay or short answer, not spoken).
- **Flow:** Mishkat is called in parallel with v3b's two runs (`client.ts`, **10 s** timeout, no retry). Then `merge.ts` applies these rules:
  - **allowed criteria:** the allow-list ∩ the service's served list ∩ the item rubric;
  - code-decided criteria (rules-first) always win;
  - **rounding:** `round(raw)` clamped to the criterion's max;
  - **boundary fallback:** if `|raw − (floor(raw)+0.5)| < 0.15`, keep v3b's mark;
  - **disagreement:** two or more levels apart → flag `graders_disagree` (the teacher's queue);
  - **unavailable** (timeout, HTTP error, bad reply, not configured) → v3b's grade unchanged.
- **What's recorded:** each replaced criterion carries `scoredBy: 'mishkat'`, `rule: 'mishkat@<version>'` and `modelPoints` (v3b's own mark, teacher view only). The grade carries `engine = <bundle version>+v3b`.
- **Teacher view:** shows "Graded by Mishkat (v3b + trained scorer, …)". The learner view hides v3b's rationale for replaced criteria.
- **Deploy check:** `POST /api/maintenance/env-check` (maintenance token) sends one tiny answer per language to the service on every deploy. A failure warns only.

## 8. Performance and cost
**Latency (client-side, from Modal US-East):**

| Test | Median | p95 |
|---|---|---|
| Single answer, warm (100 sequential) | **0.77 s** | 1.03 s |
| 200 at once, warm (after the start-up preload) | 3.5 s | 5.3 s |
| 200 at once, cold (from 0 containers) | 7.7 s | 11.9 s |

Single answers by kind, median / p95: English essays 0.78 / 0.99 s, English short answers 0.63 / 0.69 s, Arabic essays 0.94 / 1.14 s, Arabic short answers 0.77 / 0.92 s.

**Cold start beyond 10 s:** after 8 idle minutes outside school hours, the first English check from lms-test timed out at 10 s and the next one succeeded. So the first answer after idle is graded by v3b alone.

**Cost (Modal list prices on 24 Nov 2026):**

| | Rate |
|---|---|
| CPU container | about $0.14 per hour |
| GPU container | about $1.25 per hour |
| School-hours warm container | about $24 per month (GPU: about $215) |

**Training and evaluation on the A10G (24 Nov):**
- in all, about $2.33;
- fine-tune $0.28, its evaluation $0.23, the English no-cap run about $1.12, the two bundles $0.41.

## 9. State on lms-test (24 Nov, 6:40 PM)
- `mishkatSplit` **ON** on lms-test only (PR #111), with the 10 s timeout (PR #110).
- Deploy health check passed. lms-test reaches the service in both languages while it is warm.
- test.enara.app: off (frozen; move plan in `docs/lms/TEST_ENARA_MOVE_PLAN.md`).

## 10. Known limitations and next work
1. **Labels are model-marked.** Teacher marks (the 50+50 sheet, `docs/tutor/teacher-marking/ENARA_teacher_marking_sheet_50.xlsx`, key in `key-50.json`) are the first real check. Retrain with `owner-corrections.json` (minutes on the GPU).
2. **English short answers:** grammar and spelling labels have almost no spread, so they cannot be evaluated by QWK. More varied weak answers are needed.
3. **Holistic-only corpora** (ASAP 2.0, PERSUADE) did not help English stage 1. Analytic labels (ELLIPSE) do. Consider dropping them, or using them for a holistic head only.
4. **Cold start over 10 s outside school hours.** Options: a wider warm window or 24/7 warm (about $65–100/month), a smaller English encoder (distillation), or ONNX/int8 on CPU.
5. **Learned merge:** revisit with teacher marks; promising for Arabic organisation.
6. **Content:** Mishkat cannot judge content. A cross-encoder over (question, model answer, learner answer) would be the step if task completion is ever to move off v3b.
7. **Feature cache:** Modal Volume `mishkat-ft:/cache/<lang>-<encoder>`, resumable per text hash. Its file names carry the encoder hash plus `f32`.

## 11. Reproduce
**Ops branch:** `claude/tutor-lms-dscompare-run`. Workflows are path-triggered; results go to `claude/tutor-lms-*` branches (numbers only).

| What | Code | Trigger | Output |
|---|---|---|---|
| Training and evaluation on GPU | `deploy/lms-test/mishkat/train_mishkat.py` (env `MK_*`), via `gpu/mishkat_gpu.py` | `.github/workflows/mishkat-gpu-bundles.yml` | `claude/tutor-lms-mishkat-bundles-<lang>` |
| Fine-tune | `deploy/lms-test/mishkat/ft/finetune_en.py` | `.github/workflows/lms-test-mishkat-ft.yml`; `ft/eval-only.txt` = evaluate an existing encoder | — |
| Service | `deploy/modal/mishkat/` | `.github/workflows/mishkat-deploy.yml` (deploy, health, 401 check, sets `MISHKAT_ENDPOINT` on lms-test, 200-concurrent load test) | `claude/tutor-lms-mishkat-service` |
| Single-answer latency | `deploy/modal/mishkat-loadtest/` | `.github/workflows/mishkat-latency.yml` | `claude/tutor-lms-mishkat-service` |
| Learned merge | `deploy/lms-test/mishkat/merge/merge_experiment.py` | — | `claude/tutor-lms-mishkat-merge-results` |
| Backend integration | `backend/src/assessment/grading-engine/mishkat/` (client, manifest, merge) | — | tests `backend/test/assessment/mishkatSplit.test.ts`, `backend/test/envCheck.test.ts` |

**Secrets (names only):** GitHub `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `VERCEL_TOKEN_NEW`, `LMSTEST_MAINTENANCE_TOKEN`; Modal `mishkat-auth` (`MISHKAT_TOKEN`); lms-test Vercel `MISHKAT_ENDPOINT`, `MISHKAT_TOKEN`.
