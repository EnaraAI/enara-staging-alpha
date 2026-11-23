# Mishkat scoring service (Modal, CPU)

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
