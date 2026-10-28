# Hybrid V1 shadow, canary and launch plan (plans only; nothing executed)

## Stage 1: Shadow (ready to run after owner authorization)
- **Eligible traffic:** released attempts in allowlisted schools whose answers meet the validated envelope
  (`V1_INTEGRATION_CONTRACT.md`).
- **Data permissions.** **OWNER_DECISION_REQUIRED:**
  - consent and data-processing basis for sending real student answers, and other students' teacher-scored answers as
    anchors, to the provider;
  - retention period for `HybridShadowResult`.
- **Budget.** **OWNER_DECISION_REQUIRED.** At about $0.0061 per eligible answer, 1,000 answers cost about $6 actual. The
  reservation-based cap needs about $0.085 reserved per call bound, so set `ENARA_HYBRID_V1_MAX_USD` to at least
  0.09 × the expected calls.
- **Observation window:** **OWNER_DECISION_REQUIRED** (for example 2–4 weeks or N answers). Fix it before starting; no
  early stop on favourable results.
- **What shadow can measure:**
  - coverage and eligibility rates;
  - fallback rate by reason;
  - V6 failure rate;
  - latency p50/p95;
  - cost per answer;
  - score distributions;
  - eval-v2 vs V6 disagreement;
  - Hybrid − eval-v2 deltas.
- **What shadow cannot measure:** MAE, QWK and severe-error rates, unless the owner authorizes an independent
  teacher-graded sample of shadow answers, graded blind to both systems. Without that, shadow measures operational
  health, not accuracy.
- **Incidents:** kill switch `ENARA_HYBRID_V1_ENABLED=false`, which takes effect at the next run (config is read per
  run). Shadow results never reach students, so no student-facing rollback is needed.
- **Invariants:** prompts, weights, anchors rules and grids stay frozen during shadow. Any change is a new version.

### Commands (future, separately authorized run)
```
cd backend
# 1) dry run: eligibility only, no calls, no writes
npx tsx src/scripts/hybridShadow.ts --attempts /path/to/attempt_ids.txt
# 2) authorized shadow run
ENARA_HYBRID_V1_ENABLED=true ENARA_HYBRID_V1_MODE=shadow \
ENARA_HYBRID_V1_SHADOW_INSTITUTIONS=<school-id> \
ENARA_HYBRID_V1_MAX_CALLS=<approved calls> ENARA_HYBRID_V1_MAX_USD=<approved USD> \
npx tsx src/scripts/hybridShadow.ts --attempts /path/to/attempt_ids.txt --execute
```

### Shadow go/no-go limits for moving to canary (all OWNER_DECISION_REQUIRED unless product already defines them)
| Signal | Proposed limit (needs approval) |
|---|---|
| Eligible answers with a Hybrid score (`HYBRID`, not a fallback) | ≥ 95% |
| V6 failures (any reason) | ≤ 2% |
| `INSUFFICIENT_ANCHORS` share | Reported; if high, decide the anchor-collection process |
| V6 latency p95 | ≤ 10 s |
| Cost per eligible answer | ≤ $0.01 |
| Mean \|Hybrid − eval-v2\| | Within ±50% of the confirmatory distribution; large shifts trigger investigation |
| Accuracy (only with an authorized blind teacher-graded sample) | Hybrid MAE ≤ eval-v2 MAE; severe-error rate not higher (+1 percentage point margin, as in the confirmatory) |

## Stage 2: Canary (BLOCKED until the precision contract is resolved)
**Prerequisites:**
- an approved fractional-score or holistic-score contract and migration (**blocker**);
- an implemented canary routing mode (not built in V1, by design);
- shadow evidence meeting the limits above;
- incident runbook sign-off.

**Plan:** route a pre-specified fraction (**OWNER_DECISION_REQUIRED**, for example 5% of eligible answers in one school)
to the Hybrid, with:
- the reversible flag;
- automatic rollback if V6 failures exceed 2%, p95 latency exceeds 15 s, or the severe-disagreement rate doubles.

Never tune on protected data.

## Stage 3: General availability
- Separate owner approval after reviewing shadow and canary evidence, privacy, cost, fairness across schools and
  question types, and incident readiness.
- No automatic promotion on benchmark superiority.
