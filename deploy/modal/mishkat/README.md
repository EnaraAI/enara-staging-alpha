# Mishkat scoring service (Modal; CPU by default, one-line GPU switch)

Scores one written answer (English or Arabic, essay or short answer) on the language criteria Mishkat is allowed to score. It returns raw numbers only; the backend decides levels, the boundary fallback and the v3b merge (see `docs/tutor/MISHKAT_SPLIT_PLAN.md`). Labels are MODEL-MARKED: development / lms-test only.

- Model bundle: exported by `deploy/lms-test/mishkat/train_mishkat.py` when `MK_EXPORT=1`, for the languages in `MK_EXPORT_LANGS` (`en` for now; add `ar` only after the Arabic length tests pass and the owner says go). The bundle holds the final head per question type (`<type>.pt`, state_dict), `norm.npz` (mu/sd) and `manifest.json` (version, encoder, max tokens, recipe, feature version, criteria, max per criterion, `served`). It is uploaded as the Actions artifact `mishkat-bundle-<lang>` (30 days), never committed.
- Features: `deploy/lms-test/mishkat/mishkat_features.py` is the one copy used by both training and this service (encoder mean-pooled embedding, max 256 tokens + 10 hand features using `hunspell`). The service refuses a bundle whose `featureVersion` differs from the code.
- Served criteria: essays `grammar_accuracy`, `mechanics`, `vocabulary_range`; short answers `grammar_accuracy`, `mechanics`. `task_completion` and `organisation` are never served (hard-coded, a manifest cannot add them).

## API

`POST /score` with header `Authorization: Bearer <token>`

```json
{"lang": "en", "type": "essay", "text": "My school is big. ..."}
```

`type` is `essay` or `short_answer`. Response 200:

```json
{"version": "mishkat-en-20261123-1a2b3c4d",
 "scores": {"grammar_accuracy": 1.62, "mechanics": 1.21, "vocabulary_range": 1.48},
 "criteria": ["grammar_accuracy", "mechanics", "vocabulary_range"]}
```

`scores` are raw head outputs (floats, not rounded to levels; essays 0-2 scale, short-answer grammar/mechanics 0-1 scale), and only for the criteria in `criteria`.

| Status | When |
|---|---|
| 400 | body not a JSON object; bad `lang`; `type` not essay/short_answer; `text` empty, not a string, or longer than 5,000 characters |
| 401 | missing or wrong bearer token |
| 404 | no bundle for that language, or none for that type |
| 503 | bundle present but unusable (e.g. feature version mismatch) |

`GET /health` (no auth) returns `{"ok": true, "loaded": [...]}`. Answer text is never logged.

## Secrets the owner adds (names only)

- GitHub repository secrets: `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` (used by `.github/workflows/mishkat-deploy.yml`; without them the workflow prints "Modal secrets not set; skipping" and ends green).
- Modal secret `mishkat-auth` with key `MISHKAT_TOKEN` (create it in the Modal dashboard before the first deploy). The backend sends the same value as its bearer token.

## Deploy

1. Run the training workflow (`lms-test Mishkat training`); it uploads `mishkat-bundle-en`.
2. Run `Mishkat service deploy (Modal)` (manual, or automatically on a push touching `deploy/modal/mishkat/**`). It runs the local test, downloads the newest non-expired bundle per language, uploads it to the Modal Volume `mishkat-bundles` as `/<lang>/`, and runs `modal deploy deploy/modal/mishkat/app.py`. The URL is printed by `modal deploy` (app `mishkat`).

Manual equivalent (with Modal credentials in your own shell): `modal volume put --force mishkat-bundles bundle-en /en && modal deploy deploy/modal/mishkat/app.py`.

Local test, no Modal or model download: `python -m pytest -q deploy/modal/mishkat/test_scorer.py` (needs numpy, torch, pytest; hunspell optional).

## Cost and latency

- CPU only: 2 vCPU, 4 GB, `min_containers=0`, `scaledown_window=300` s. Nothing is billed while idle; each burst of use keeps one container for 5 more minutes.
- Warm: about 0.2-0.4 s per answer (one encoder pass of at most 256 tokens + hunspell). Cold start: roughly 10-20 s (container, torch import, encoder load; both encoders are baked into the image), to be measured on the first day. The backend's 3 s timeout means the first answer after an idle period falls back to v3b; a warm-up ping to `/health` when a grading session starts avoids that.
- At lms-test volume this is a few dollars a month (CPU-seconds while a container is up, mostly the 5-minute warm windows).
- Training and serving should use the same torch/transformers versions; the bundle records them under `libs` in `manifest.json`.

## Scaling and hardware (owner, 24 Nov 2026)

- **Autoscaling:** 0 to 10 containers. Each container takes up to 8 answers at once; Modal adds a container when more than 4 per container are queued or running (`@modal.concurrent(max_inputs=8, target_inputs=4)`, `max_containers=10`). A container stays 5 min after its last answer.
- **School hours:** one container is kept warm Sunday–Thursday, 8 am – 4 pm Cairo time (`school_hours_warm` runs hourly 8:00–15:00 and sets `min_containers=1`; `school_hours_cool` at 16:00 sets it back to 0). Hourly, so a redeploy during the day (which resets the autoscaler) is corrected within the hour. Outside those hours nothing runs while idle.
- **Bundles:** English = `mishkat-en-20261124-222e908b` (DeBERTa-v3 fine-tuned 20261124-828e2db, shipped inside the bundle; ENARA-only head). Arabic = `mishkat-ar-20261124-222e908b` (CAMeLBERT-MSA, AR-AES + AR-ASAG two-stage). Encoders run in fp32 on CPU and GPU alike.
- **GPU switch:** one line in `app.py`: `MISHKAT_GPU = False` → `True` runs each container on one A10G (CUDA build of torch); redeploy to apply. Off by default.

### Cost (Modal list prices on 24 Nov 2026: A10 $0.000306/s; CPU $0.0000131 per physical core per s; memory $0.00000222 per GiB per s; re-check before relying on them)

| | CPU (default: 2 cores, 6 GiB) | GPU switch on (A10G + 2 cores, 6 GiB) |
|---|---|---|
| One container, per hour | **about $0.14** | **about $1.25** (about 9x) |
| School-hours warm container (8 h x 5 days, about 172 h a month) | **about $24 / month** | **about $215 / month** |
| Burst at the 10-container ceiling, per hour | about $1.42 | about $12.50 |
| Idle outside school hours | $0 | $0 |

The cost per answer depends on throughput, measured by the load test (`deploy/modal/mishkat-loadtest`, run after every deploy; results on `claude/tutor-lms-mishkat-service`).
