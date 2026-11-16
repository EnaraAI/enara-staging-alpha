# Experiments 5b and 5c: interim result (INCOMPLETE: provider credit ran out)

*14 Nov 2026. AI-simulated students only. Not evidence about real learners.*

## What happened

At 18:14 UTC (20:14 Cairo) the Anthropic account returned **"Your credit balance is too low to access the Anthropic API"** for every call. Every v2-arm (condition B) block that had not yet run failed instantly with HTTP 400, which is why both runs "finished" suddenly. Failed blocks are kept in the raw data (`status: failed`, error `provider rejected request (400)`). Nothing in the failures depends on the experimental condition; they depend only on when the credit ended.

| | planned | complete triplets (A, B, C all ok) | B blocks lost to credit | A and C complete |
|---|---|---|---|---|
| 5b (ENARA with v2 changes vs current ENARA vs plain tutor; evidence-seeded) | 300 | 196 | 104 | 300 |
| 5c (arbitration on vs off; one third size) | 102 | 39 | 62 | 101 |

Total recorded spend: 5b $101.54, 5c $28.93 (before the credit ended).

## 5b: what the data support (196 complete triplets of 300; two-way cluster bootstrap, preregistered analysis)

| Contrast (learning gain) | difference | 95% CI | Holm p | Supported? |
|---|---|---|---|---|
| ENARA with v2 − plain tutor (owner's ship bar) | −0.003 | −0.105 to +0.097 | 1.0 | **No** |
| ENARA with v2 − current ENARA | +0.015 | −0.067 to +0.095 | 1.0 | **No** |
| current ENARA − plain tutor, all 300 pairs (descriptive) | −0.003 | n/a | n/a | n/a |

Mean gain on all 300 A/C pairs: current ENARA +0.162, plain tutor +0.164. Transfer, delayed retention and mastery show no clear differences either (for example mastery: v2 13.3% vs plain 13.3%). The 104 lost B units are not systematically different (current ENARA − plain gain +0.026 in the lost units vs −0.018 in the kept ones; noise level), so the 196 triplets are a fair but smaller sample than planned (minimum detectable effect about 0.13 instead of 0.115).

## 5c: uninformative

Only 39 triplets are complete, so the arbitration contrast has no usable power: B − A = +0.006 [−0.091, +0.100]; B − plain = −0.077 [−0.241, +0.063]. Current-ENARA-with-v2 vs plain tutor on 101 pairs: +0.005. Nothing can be concluded about arbitration from this run.

## Reading

With the school's records given to both tutors, ENARA (current, and with the v2 changes) is **level with the plain AI tutor** on learning gain; the v2 changes added about +1.5 points (not clear). The owner's bar (clearly beats the plain tutor) is **not met**. The v2 arm is incomplete (65% of its blocks), so this is not the final word on 5b.

## To finish

Once the API credit is restored: `RETRY_FAILED=1` re-runs only the failed blocks (the failed records stay; the later record wins in analysis):

```
cd backend && RETRY_FAILED=1 ENARA_KEY_FILE=/home/user/.enara_key npx tsx ../research/deep-learning-simulation-v2/src/cli.ts run ../research/deep-learning-simulation-v2/config/exp5b_main.json
cd backend && RETRY_FAILED=1 ENARA_KEY_FILE=/home/user/.enara_key npx tsx ../research/deep-learning-simulation-v2/src/cli.ts run ../research/deep-learning-simulation-v2/config/exp5c_main.json
```
Estimated cost: about $20 for the 104 B blocks of 5b and about $8 for the 62 B blocks of 5c.

## Offline findings from the recorded 5b data (no API used)

- **Tokens and cost of the tutor calls (ok blocks):** current ENARA 3,872 input tokens per call (300 blocks, 1,847 calls); ENARA with v2 2,461 non-cached input tokens per call (196 blocks, 1,256 calls), a 36% drop because about 1,400 tokens per call moved into the cache. Recorded tutor-side cost per block: $0.158 vs $0.129.
- **Cost accounting gap found and fixed:** the ledger counted only non-cached input tokens, so the v2 arm's recorded cost **omits cache read and write charges** (reads cost 0.1x and writes 1.25x the input price; the cached-token counts were not captured). The corrected estimate for the v2 arm is about **$0.131 to $0.139 per block** (12 to 17% below current ENARA) if each block writes the cached prefix once and reads it on later turns; a worst case where every call wrote the cache would put it above current ENARA, which the 36% token drop makes very unlikely but this data cannot exclude. The ledger now records `cache_read_input_tokens` and `cache_creation_input_tokens` and prices them (2 new tests), so future runs are exact. Cost figures for the v2 arm in this report and in earlier summaries should be read with this caveat.
- **Behaviour (196 complete triplets, text-pattern metrics):** three or more consecutive same-shape hint turns: current ENARA 19.4%, v2 17.3%, plain tutor 36.2%. Recap in the last turn: 13.3%, 7.1%, 27.6%. Concession phrases about 1% in all arms.
