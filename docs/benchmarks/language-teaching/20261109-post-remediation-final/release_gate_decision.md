# Release gate decision: ENARA Phase 1 language tutor, r4.1

## Decision: `READY_FOR_CONTROLLED_LIVE_BENCHMARK` (conditional)

**What this decision means:**
- The engine and measurement defects that blocked a controlled live benchmark (the five P1s) are fixed and verified in the real code paths.
- The evaluator is wired to `evaluatorView`.
- A full paid run completed safely within budget, with parity, privacy and structured-output integrity intact.

**What it does not mean:**
- It is **not** readiness for production or real learners.
- It is **not** evidence of learning efficacy.
- The rubric is still an unvalidated draft.

**Context:**
- Date: 2026-11-09, Cairo.
- Working tree: branch `claude/codebase-review-kbxqan` at `fc6a487` plus uncommitted changes. Nothing was committed, pushed or deployed.
- Policy revision: `ltc-v1-r4.1`.

## 1. The five P1 defects

| ID | Defect | Status | Primary evidence |
|---|---|---|---|
| POST-01 | Marker fragments leaked over SSE | **FIXED, verified** | Chunk-equivalence at all sizes 1–9 and offsets; route SSE; live 5/5 streamed equal to stored; Stage C 0/219 visible |
| POST-02 | The last (untrusted) marker won | **FIXED, verified** | Leading-only trust; learner-supplied marker text can only lower the verdict; route injection tests; Stage A injections not completed |
| POST-03 | Progression state leaked across lessons | **FIXED, verified** | Hashed scope over tenant, learner, session, course, curriculum and lesson; route lesson-switch with colliding ids; 219/219 turns scoped |
| POST-12 | Pressure unlocked the answer | **FIXED, verified** | 8 intent classes; L5 ceiling without an attempt; 0 reveals before an attempt in Stage A and C; reveals recorded as assisted |
| POST-13 | No evaluator consumed `evaluatorView` | **FIXED, verified** | `judge_v2` (evaluatorView only, explicit failure, versions recorded, separate roles), run on 120 + 15 + 12 cases |

Also fixed:
- POST-04, POST-05, POST-06, POST-09 and AK-11 (Arabic diacritics);
- three defects found during this validation: the reveal-inducing hint text, a disclosed answer counted as independent, and the evaluator's core `n/a` bug.

## 2. Gate checks

| Gate | Result |
|---|---|
| Security / privacy | ✔ 0 identifier leaks in 286 tutor payloads; 0 answer keys in prompts or student APIs; only the age band and CEFR estimate sent; no permission or tenant change |
| Evaluator parity | ✔ 72/72 lesson-item turns delivered the answered item; evaluatorView validated for every case; 0 INVALID |
| Structured output | ✔ 0 malformed and 1 missing of 219 markers in Stage C; 0 visible |
| Provider behaviour | ✔ 0 retries, 0 non-200, 0 unpriced calls |
| Budget | ✔ $8.013 of $10. Stage C was $0.012 over its suggested maximum (completion of the last 2 cases; disclosed). |
| Regression | See `test_results.md`: the historical failures are unchanged and the new failures are listed there |
| Rubric / fixture integrity | ✔ The draft rubric, fixture v2 and all 347 earlier report files are byte-identical to preflight |

## 3. Measured quality (synthetic, automated, draft rubric)

| Layer | Result |
|---|---|
| Deterministic engine and runtime | All integrity checks pass (above) |
| Official v2 evaluator (Sonnet) | **54/120 MEETS**, 66 PARTIAL, 0 DOES_NOT_MEET, 0 critical or major |
| Independent v2 evaluator (Haiku, same provider) | 91/120 MEETS; agreement 58.8%, κ 0.21 |
| Reconciled | 49 MEETS / 42 PARTIAL / **28 UNCERTAIN** (human adjudication needed) |
| Frozen v1 rubric (continuity only, not like for like) | 104/120 (history: 21 → 65 → 76 → 81 → 90; independent 75) |
| Stability (12-case repeat) | Engine identical 24/24; outcome unchanged in 8/12 (official) and 9/12 (independent) |

**Weakest area: D7 hint leakage** (mean 2.55; 44 of 94 cases below 3, all minor). This is POST-F1.

## 4. Conditions attached to the decision

**Before the controlled live benchmark's scores are called official:**
1. **Educator freeze of rubric v2.** Resolve POST-16 (insufficient evidence), POST-18 (overlaps) and POST-19 (a blind educator pack with an independence declaration). Freeze `rubric_v2_machine.json` **and** the outcome logic (`judge_v2_core.ts`) with hashes. The core `n/a` bug shows the outcome code must be frozen and tested with the rubric.
2. **At least two independent full runs, with educator review of a stratified sample, all 28 UNCERTAIN cases and all evaluator disagreements.** Single-run results are not stable: about 1 case in 3 changed outcome on repeat.
3. **Treat POST-F1 explicitly.** Get an educator ruling on acceptable cues for binary and single-ending items, then either a targeted prompt change (re-measured) or an accepted known limitation.

**Before any real-learner exposure (not required for the benchmark):**
1. **POST-14:** a pre-existing student API lists non-downloadable upload paths.
2. **POST-07:** concurrent requests within one session are not serialised.
3. **POST-15:** delimiter escaping in teacher item prompts.

## 5. Why not the other statuses

| Status | Why not |
|---|---|
| `NOT_READY_REQUIRES_REMEDIATION` | Every blocking item from the previous gate (its remediation steps 1–6) is fixed and verified. The open items are P2/P3, educator work, or model-compliance findings that the controlled benchmark itself is designed to measure and adjudicate. |
| `BLOCKED_BY_INFRASTRUCTURE` | No blocker. Provider, metering and harness all worked. |
| `VALIDATION_INCOMPLETE` | Every stage ran to completion: engineering validation, A, B, C and stability. |

## 6. Limitations (must accompany any citation of these numbers)

- **Synthetic learners and scripted turns.** This is not real learner behaviour.
- **Evaluators are LLMs from the same provider and model family as the tutor.** The independent evaluator is not independent of the provider.
- **The rubric v2 is a draft.** Its insufficient-evidence rule and the `n/a` handling are disclosed interpretations.
- **v1-rubric comparability is weakened** by the fixture change, and the v1 judge still sees the full v1 lesson.
- **No learning gains are measured or implied.**
