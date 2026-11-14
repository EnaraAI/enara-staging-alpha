# LO3 — Experiment Design

> **Simulated evidence only.** Every learner is an AI student. Nothing here shows that real students learn.

## Namespace, baseline and code
- Folder: `docs/benchmarks/language-teaching/20261113-lo-experiment/`. The r4.2 evidence and earlier benchmark folders were not modified.
- Tutor code under test: fixes 1–7 (branch `claude/codebase-review-kbxqan`, tutor source as at commit `5cdced3`). Hashes of the tutor files, harness, cases and bank are in `campaign_N/config_hashes.txt`.
- The r4.4 features rebuilt later the same day were deliberately **not** in these campaigns (the processes had loaded the code before they were added).

## Units
12 outcomes (LO1) x 10 profiles (LO2) = **120 simulated learners per campaign**, 3 campaigns = **360 learners**.

## Stages per learner
| Stage | What happens |
|---|---|
| Pre-test | 2 held-out items, answered alone, before any teaching |
| Instruction | Depends on the group (below) |
| Note | The learner writes 2–3 lines: "my rule now" |
| Post-test | 2 equivalent but different items, from its note only |
| Transfer | 2 new-context items (new subjects, vocabulary, situations) |
| Short-delay retention | 2 new parallel items, after short forgetting |
| Long-delay retention | 2 new parallel items, after long forgetting |

No answers or feedback are shown between stages. No re-teaching after the session.

## Groups (every learner receives every group as an independent clone, so the comparison is matched)
- **A — ENARA tutor:** 8 learner turns through the real student route `POST /api/me/tutor/sessions/:id/messages` (real provider calls, real authentication, session history, normal hint and reveal policy).
- **B — No teaching:** empty note.
- **C — Static material:** the same ENARA lesson's objectives, success criteria, grammar and examples, then the note.
- **D — Misleading material (validity probe only):** a classmate's note that restates the learner's own wrong belief.

## Tutoring details
- Harness `backend/benchmarks/ltc-v2/run_fixture_v2.ts`, live mode, in-process app with a throwaway database. First learner message scripted per profile; the other 7 written by the simulator (`claude-haiku-5-5`). Fixed 8-turn lesson; the learner is never forced to succeed.
- Each campaign ran as 2 parallel parts (each its own throwaway database), then merged. The three campaigns ran at the same time with fresh sessions and samples. No transcript was reused.
- No threshold, difficulty or definition changed between campaigns. One scoring correction was made after the campaigns (LO5), applied to all three.

## Retention model (assumption)
The learner's own note is what it remembers. By profile: kept in full, kept as its first sentence only, or lost (LO2). Not a model of real memory; nothing is relearned.

## Hint dependency
Per learner, from the stored per-turn records: support turns, highest hint level, whether the answer was given. Classified as independent mastery, mastery after minimal scaffolding (highest hint level 2 or less, no answer given), after extensive scaffolding, correct without transfer, or no mastery.
