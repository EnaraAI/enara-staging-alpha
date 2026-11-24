# 24 Nov 2026: everything done today

_Written 6:00 PM Cairo. Mishkat data is MODEL-MARKED: development only, never for claims, never for a real school. test.enara.app stayed frozen all day: no code, no build, no database change. Its project only moved to the new Vercel account, as asked._

## In five lines
1. **Vercel:** all 3 projects moved to the new account with Vercel's own transfer. Nothing went missing, and all three sites, down this morning under the old account's block, are up again.
2. **lms-test:** every merged PR is deployed, one at a time, each with its own health check. Rolled back: none. A test of every variable now runs on every deploy.
3. **Mishkat research:** English uses the **fine-tuned encoder**; Arabic uses **run 10** (AR-AES + AR-ASAG). Both beat v3b on grammar, spelling and vocabulary. v3b keeps task completion and content.
4. **Mishkat split is built and live but switched off:**
   - both bundles are on the Modal scoring service;
   - autoscaling 0–10, warm container in school hours, GPU switch off;
   - shared token and endpoint set on lms-test;
   - `mishkatSplit` stays **off** until you say go.
5. **Load test, 200 answers at once:**

   | | Median | p95 |
   |---|---|---|
   | Warm | **2.7 s** | 8.3 s |
   | Cold | 10.2 s | 26 s |

   These are well above lms-test's 3 s Mishkat timeout under that load; see "Open items".

## 1. Vercel move (old account blocked for fair use → new account, Hobby)
| Project | Domains | Variables | Live version | Site |
|---|---|---|---|---|
| enara-lms-test | lms-test.enara.app | 66/66 match | same deployment and commit | 402 → 200; full health check passed |
| enara-staging-alpha (test.enara.app, frozen) | test.enara.app | 34/34 match | same; not rebuilt | 402 → 200; read-only checks |
| enara-landing | enara.app, www.enara.app | 3/3 match | same | 402 → 200 |

- **Method:** Vercel's project transfer, run from GitHub Actions. It keeps the project ids, domains, deployments and all variables, Sensitive ones included. DNS was not touched.
- **Check:** a second read of the new account against this morning's inventory found **0 differences** in settings, domains, variable names, targets, types, protection or live commit.
- **Pipeline:** PR #107 points the lms-test deploy at the new account (`VERCEL_TOKEN_NEW`).
- **Files:** `docs/lms/VERCEL_MOVE.md` (result and inventory), `docs/lms/VERCEL_MOVE_PLAN.md`.

## 2. One test of every environment variable
- **Part 1, from outside (all 3 projects):**
  - variable names against the live code;
  - value formats;
  - running-site checks.

  Results: `docs/lms/ENV_CHECK.md`.
- **Part 2, inside lms-test (PR #108):** one call per service that changes nothing (database, R2, Resend, Anam, ElevenLabs, Anthropic list-models, DeepSeek), plus in-memory round trips for the login secret, the ingest secret and `LMS_KEK`. It runs on every deploy. A broken core secret fails the deploy and rolls it back; a bad provider key only warns.
- **Findings on lms-test:**
  - all used keys work except the **Anthropic key, which Anthropic rejects**. Tutoring runs on DeepSeek, so it only matters for anything still calling Anthropic.
  - `SEED_USER_PASSWORD` and `API_DOCS_PASSWORD` are **shorter than 12 characters**.
- **test.enara.app (frozen):** Part 1 only. Its Sensitive keys are proven only for the database.

## 3. The "database drops" scare, and its fix
- **What looked wrong:** both sites sometimes answered `/ready` 503 "mongo unavailable".
- **Probe:** 80 checks, 3 s apart. A real database query at the same instants **never failed**.
- **Cause:** `/ready` read the connection state only, so a freshly woken instance said "unavailable" for a moment.
- **Fix (PR #109):** when the connection is reopening, one database ping with a 2 s limit decides. Deployed. A healthy deploy can no longer be rolled back by a false alarm.

## 4. Deploys to lms-test (one line each)
| PR | What | Result |
|---|---|---|
| #103 | Anthropic fallback off; Cairo times | deployed, health check passed |
| #102 | Rules-first part 1 (switch off) | deployed, health check passed |
| #104 | Mishkat + v3b split (switch off) | deployed, health check passed |
| #105 | Spelling by code; colloquial rule | deployed, health check passed |
| #107 | Deploy pipeline on the new Vercel account | deployed, health check passed (one E2E re-run, 3 tests unrelated to the change) |
| #108 | Variable check (Part 2) | deployed, health check passed, variable check ran |
| #106 | Mishkat engine: one engine id + teacher view (switch off) | deployed, health check passed |
| #109 | `/ready` pings the database | deployed, health check passed |

Rolled back: none. Every deploy used the full E2E suite first.

## 5. Mishkat research
**Datasets (licences quoted in `MISHKAT_STAGE1_REPORT.md`):**

| Use | Datasets |
|---|---|
| English stage 1 | ASAP 2.0, PERSUADE 2.0 (CC BY 4.0) |
| Arabic stage 1 | AR-AES, AR-ASAG (CC BY 4.0) |
| Test only, never trained on | Egyptian set (Zenodo, CC BY 4.0) |
| Not used | AraScore (no licence); Cairo University set (not public) |

**English (QWK vs Sonnet–Opus on ENARA essays; human = 200 ELLIPSE essays):**

| | Run 7: ELLIPSE 2,500 | Run 10: 7,500, no cap | **Fine-tuned encoder (chosen)** | v3b |
|---|---|---|---|---|
| ENARA grammar | **0.80** | 0.71 | 0.79 | 0.78 |
| ENARA spelling | 0.52 | 0.47 | **0.64** | 0.34 |
| ENARA vocabulary | 0.88 | 0.87 | **0.93** | 0.80 |
| Human grammar | 0.42 | 0.42 | 0.42 | 0.11 |
| Human vocabulary | — | 0.36 | **0.47** | 0.21 |

**Arabic (QWK vs Sonnet–Opus on ENARA; human = 200 LAILA essays):**

| | **Run 10: AR-AES + AR-ASAG (chosen)** | Run 9: AR-AES | v3b |
|---|---|---|---|
| Essay grammar | **0.82** | 0.81 | 0.72 |
| Essay spelling | 0.92 | **0.93** | 0.75 |
| Essay vocabulary | 0.94 | 0.94 | 0.84 |
| Short-answer grammar | 0.80 | **0.82** | 0.55 |
| Human grammar / spelling | **0.47 / 0.52** | 0.46 / 0.44 | 0.16 / 0.30 |
| Egyptian set, task completion vs teachers | 0.21 | 0.12 | **0.69** |

- **Length tests:** all pass in every run.
- **Learned merge (Step B):** passes on some criteria only, so it is not in the engine.
- **Details:** `MISHKAT_ALL_RUNS_20261124.md` and `mishkat/mishkat_all_runs_20261124.png`.

## 6. Mishkat split: built and live, switched off
| Piece | State |
|---|---|
| English bundle | `mishkat-en-20261124-222e908b`: fine-tuned DeBERTa-v3 (shipped inside the bundle), ENARA-only head |
| Arabic bundle | `mishkat-ar-20261124-222e908b`: CAMeLBERT-MSA, AR-AES + AR-ASAG, two-stage |
| Served criteria | Essays: grammar, spelling, vocabulary. Short answers: grammar, spelling. Task completion, organisation and feedback stay with v3b |
| Scoring service | Modal, `https://enaraai--mishkat-web.us-east.modal.run`. Health ok; refuses requests without the token (401) |
| Autoscaling | 0–10 containers; up to 8 answers each, a new container when more than 4 are queued; 5 min idle stop |
| School hours | 1 warm container Sunday–Thursday, 8 am–4 pm Cairo (re-applied hourly; 0 at 4 pm) |
| GPU switch | `MISHKAT_GPU = False` in `deploy/modal/mishkat/app.py`; `True` + redeploy runs on an A10G |
| Shared token | Generated in a runner, never printed. Saved to Modal (`mishkat-auth`) and lms-test (`MISHKAT_TOKEN`, Sensitive) |
| Endpoint | `MISHKAT_ENDPOINT` set on lms-test from the real URL. It takes effect with the next lms-test deploy |
| Switch | `mishkatSplit` **off** |

**Cost of the service (Modal list prices today; details in `deploy/modal/mishkat/README.md`):**

| | CPU (default) | GPU switch on |
|---|---|---|
| One container, per hour | about $0.14 | about $1.25 |
| Warm container in school hours | about $24/month | about $215/month |
| Burst at 10 containers, per hour | about $1.42 | about $12.50 |

**Load test, 200 answers at once (English and Arabic, essays and short answers):**

| Round | OK | Median | p95 | Max | English median / p95 | Arabic median / p95 |
|---|---|---|---|---|---|---|
| Cold (from 0 containers) | 200/200 | 10.2 s | 26.0 s | 30.3 s | 10.3 / 26.0 s | 10.2 / 26.1 s |
| Warm (right after) | 199/200 (1 connection timeout) | **2.7 s** | 8.3 s | 23.9 s | 2.8 / 3.8 s | 2.7 / 8.3 s |

## 7. Problems met today and how they were solved
| Problem | Fix |
|---|---|
| Old Vercel account blocked; all 3 sites returned 402 | Vercel's project transfer to the new account; nothing rebuilt |
| 26 Sensitive variables cannot be read back | The transfer carries them; checked by behaviour (health check, variable check) |
| Fine-tune runs 1–3: NaN from step 1 | Diagnosed: transformers 5 loads the model in 16-bit; now loaded in 32-bit everywhere |
| CPU evaluation took hours | Moved to the Modal GPU (13–31 min, cents per run) |
| English no-cap run hit the 30-min GPU cap | Cap raised to 50 min; a resumable cache on Modal storage; live progress log |
| AR-ASAG loaded 0 answers | Parser written for its real file layout (2,132 answers) |
| Stopping a run overwrote a good report | A stopped run now publishes to a `-failed` branch |
| Mishkat service crash-looped | A build-machine-only path ran inside the container; fixed |

**GPU spend today (Modal A10G):** about **$2.33** in all (fine-tune, evaluations, the English no-cap run, both bundles); cap $5.

## 8. Open items and decisions for you
1. **Mishkat timeout against latency.**
   - lms-test waits at most **3 s** for Mishkat, then falls back to v3b alone.
   - Under 200 answers at once, the warm median is 2.7 s and p95 8.3 s, so many answers would fall back during a burst.
   - Single answers on a warm container should be far faster; I have not measured that yet.
   - Options:
     - (a) raise the timeout to about 10 s;
     - (b) keep more warm containers in school hours (about $24/month each);
     - (c) the GPU switch;
     - (d) accept the fallback.

   My suggestion: measure single-answer latency first, then choose.
2. **The `mishkatSplit` switch:** stays off until your "go". The next lms-test deploy loads `MISHKAT_ENDPOINT`.
3. **lms-test Anthropic key** is rejected by Anthropic. Replace it, or leave it if nothing should call Anthropic.
4. **Weak passwords on lms-test:** `SEED_USER_PASSWORD` and `API_DOCS_PASSWORD` are shorter than 12 characters.
5. **The new Vercel team is Hobby.** The usage that blocked the old team can happen again; Pro is the fix (you planned it in a few days).
6. **A real Moodle LTI launch on lms-test,** done by a person. The automatic check uses the mock LMS only.
7. **Unchanged from before:**
   - your review-sheet corrections (then retrain on the GPU, minutes);
   - the LAILA authors' OK;
   - the DeepSeek part of the colloquial re-mark of 54 Arabic answers, now possible since lms-test is back up.
