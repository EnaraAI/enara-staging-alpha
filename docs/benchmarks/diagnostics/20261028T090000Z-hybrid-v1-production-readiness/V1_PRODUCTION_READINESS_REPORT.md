# ENARA Hybrid Grading Engine V1: production readiness report

**Classification: READY_FOR_AUTHORIZED_SHADOW.** Canary and GA are **BLOCKED** (score-precision contract). Nothing is
deployed and nothing is committed.

## 1. Frozen versions (verified; full hashes in `V1_FREEZE_MANIFEST.json`)
| Item | Value | Matches confirmatory? |
|---|---|---|
| V6 | `ENARA-ANCHORED-HOLISTIC-experimental@v6`, config `ddcda7fe656d9dcc15a9f43001d4d40bb3ebf63f4d516308744f4da43298f1a5`, K=4, `claude-sonnet-5-5`, max_tokens 8000, provider-default sampling, 1 repair | yes |
| V6 source | `anchored_holistic.py` `a1be3f9c6dbabdfc00956ec53c6139709fa827335ffa2b383622127fc6ed55f3` | yes |
| Hybrid | `ENARA-HYBRID-experimental@v1`: `round(((eval_v2+v6)/2)/0.125)*0.125`; V6 missing → eval-v2 (labelled); eval-v2 missing → non-score | yes (`hybrid_v1.py` hash) |
| eval-v2 harness | `run_grading_eval.py` `b16bbfa24be3bcced257cb3a09c6d87a0c55e9b9c3165e725bf7212a6535fcf1`; production policy `{version:'eval-v2'}`, model `claude-opus-5-5` | yes |
| Amendment A1 | Runner budget check only; no effect on candidate behaviour | recorded |

## 2. Architecture (opt-in, default off)
- **Flow:** shadow job → read the official eval-v2 proposal (no re-run) → frozen anchors → V6 port → frozen blend →
  isolated `HybridShadowResult`.
- **V6 port:** a TypeScript port verified **byte-for-byte** against golden prompts, parse results and anchor picks
  exported from the frozen Python.
- **Controls:** feature flag and kill switch, shadow-only mode, school allowlist, hard call and USD caps, idempotent
  claims, tenant-isolated frozen anchor snapshots, redacted logs, `trackAiCall` cost accounting.

## 3. Changed files
These are all new; see `V1_CHANGELOG.md`. Production eval-v2 code is byte-identical.

## 4. Score precision
**Incompatible with the official contract.** Shadow storage keeps exact 0.125 steps. Official validation
(`autoGrading.ts` 183–190) accepts only rubric-level sums for open responses and right/wrong for short answers, and needs
per-criterion levels. The Hybrid has neither. **BLOCKER for canary and GA.** No silent rounding was added.

## 5. Tests
| Suite | Result |
|---|---|
| New tests | 44 passed (34 frozen-behaviour + 10 shadow) |
| Full backend | 298 passed, 31 files |
| Typecheck | clean |
| Python | 789 passed; 1 pre-existing, unrelated stale-count failure |

## 6. Operational overhead
From `V1_COST_LATENCY_BASELINE.md`, per eligible answer:
- **Shadow:** +$0.0061 and +1.0 V6 call (p50 2.8 s, p95 3.7 s), off the student path.
- **If ever official:** about $0.046 in total per answer.

Unknowns: production concurrency, rate limits, and test-split p95.

## 7. Blockers and owner decisions
| # | Item | Type |
|---|---|---|
| B1 | Fractional or holistic score contract and migration (open-response level sums; criterion breakdown; short answer right/wrong) | **Blocker** for canary/GA |
| B2 | Canary routing mode not implemented (by design) | Blocker for canary |
| D1 | Data permission and consent to send real answers, and other students' teacher-scored answers as anchors, to the provider | OWNER_DECISION_REQUIRED before shadow |
| D2 | Shadow budget, call cap, observation window, allowlisted schools | OWNER_DECISION_REQUIRED |
| D3 | Anchor supply: V6 needs 4 teacher-scored answers per question. Under autonomous grading these may be scarce, which means labelled fallbacks. | OWNER_DECISION_REQUIRED |
| D4 | Whether to widen the envelope (multi-criterion rubrics, other scales, other models). Each needs new evidence. | OWNER_DECISION_REQUIRED |
| D5 | Go/no-go limits in `V1_SHADOW_CANARY_PLAN.md` | OWNER_DECISION_REQUIRED |
| D6 | A blind teacher-graded sample, if shadow should measure accuracy | OWNER_DECISION_REQUIRED |
| D7 | Retention for shadow records | OWNER_DECISION_REQUIRED |

**Known deviation from the benchmark setting:** in production, eval-v2 grades with the teacher's rubric. The benchmark
used a generic single-criterion 0–5 harness rubric. The eligibility envelope restricts V1 to single-criterion 0–5
rubrics, but rubric wording still differs.

## 8. Future shadow commands
See `V1_SHADOW_CANARY_PLAN.md`: a dry run first, then `--execute` with `ENARA_HYBRID_V1_*` set to the approved values.

## 9. Recommendation
Hold for owner decisions D1–D3 and D5. Then run an authorized, bounded shadow on one school. Do not route official grades
to the Hybrid until B1 is resolved and shadow (plus a blind graded sample, if approved) supports it.

## 10. Confirmations
- No production changes.
- No eval-v2 changes.
- No protected validation or test rows read; only aggregate reports were referenced.
- No paid inference, provider calls or network access (tests stub the SDK and `fetch`).
- No deployment, migration, commit or push.
