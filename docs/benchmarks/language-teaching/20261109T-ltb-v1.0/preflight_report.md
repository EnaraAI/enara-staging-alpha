# Preflight report — paid run (LTB v1.0)

Written before the first paid provider call of this benchmark. All figures below are **estimates** unless marked otherwise.

## Inputs (frozen)

| File | SHA-256 |
|---|---|
| `benchmark_cases.jsonl` | `725edb2bcabeb316a388b702b2baba6dc35ed178c80f8de7727c9768c356a2bb` |
| `rubric_v1.json` | `963962bba8b427ea7e15afd5d2b7bc2ad90945fc16fcff6633813941546f0e5b` |
| `scoring_spec_v1.json` | `8fbf752bffd4fe9c1f51831b313e06f020e3d47dc57b62e446fd65dc38f82c05` |

## Cases and planned calls

120 cases, 219 learner turns. One tutor call is planned per turn (no other model call happens on this route; confirmed by the dry run: 219 attempts for 219 turns). Turn count per case in brackets:

- LTB-CA1-T01 (1) | LTB-CA1-T02 (1) | LTB-CA1-T03 (2) | LTB-CA1-T04 (2)
- LTB-CA1-T05 (2) | LTB-CA1-T06 (3) | LTB-CA1-T07 (4) | LTB-CA1-T08 (3)
- LTB-CA1-T09 (1) | LTB-CA1-T10 (1) | LTB-CA1-T11 (1) | LTB-CA1-T12 (1)
- LTB-CA1-T13 (2) | LTB-CA1-T01-v2 (1) | LTB-CA2-T01 (1) | LTB-CA2-T02 (1)
- LTB-CA2-T03 (2) | LTB-CA2-T04 (2) | LTB-CA2-T05 (2) | LTB-CA2-T06 (3)
- LTB-CA2-T07 (4) | LTB-CA2-T08 (3) | LTB-CA2-T09 (1) | LTB-CA2-T10 (1)
- LTB-CA2-T11 (1) | LTB-CA2-T12 (1) | LTB-CA2-T13 (2) | LTB-CB1-T01 (1)
- LTB-CB1-T02 (1) | LTB-CB1-T03 (2) | LTB-CB1-T04 (2) | LTB-CB1-T05 (2)
- LTB-CB1-T06 (3) | LTB-CB1-T07 (4) | LTB-CB1-T08 (3) | LTB-CB1-T09 (1)
- LTB-CB1-T10 (1) | LTB-CB1-T11 (1) | LTB-CB1-T12 (1) | LTB-CB1-T13 (2)
- LTB-TA1-T01 (1) | LTB-TA1-T02 (1) | LTB-TA1-T03 (2) | LTB-TA1-T04 (2)
- LTB-TA1-T05 (2) | LTB-TA1-T06 (3) | LTB-TA1-T07 (4) | LTB-TA1-T08 (3)
- LTB-TA1-T09 (1) | LTB-TA1-T10 (1) | LTB-TA1-T11 (1) | LTB-TA1-T12 (1)
- LTB-TA1-T13 (2) | LTB-TA1-T01-v2 (1) | LTB-TA2-T01 (1) | LTB-TA2-T02 (1)
- LTB-TA2-T03 (2) | LTB-TA2-T04 (2) | LTB-TA2-T05 (2) | LTB-TA2-T06 (3)
- LTB-TA2-T07 (4) | LTB-TA2-T08 (3) | LTB-TA2-T09 (1) | LTB-TA2-T10 (1)
- LTB-TA2-T11 (1) | LTB-TA2-T12 (1) | LTB-TA2-T13 (2) | LTB-TB1-T01 (1)
- LTB-TB1-T02 (1) | LTB-TB1-T03 (2) | LTB-TB1-T04 (2) | LTB-TB1-T05 (2)
- LTB-TB1-T06 (3) | LTB-TB1-T07 (4) | LTB-TB1-T08 (3) | LTB-TB1-T09 (1)
- LTB-TB1-T10 (1) | LTB-TB1-T11 (1) | LTB-TB1-T12 (1) | LTB-TB1-T13 (2)
- LTB-AA1-T01 (1) | LTB-AA1-T02 (1) | LTB-AA1-T03 (2) | LTB-AA1-T04 (2)
- LTB-AA1-T05 (2) | LTB-AA1-T06 (3) | LTB-AA1-T07 (4) | LTB-AA1-T08 (3)
- LTB-AA1-T09 (1) | LTB-AA1-T10 (1) | LTB-AA1-T11 (1) | LTB-AA1-T12 (1)
- LTB-AA1-T13 (2) | LTB-AA1-T01-v2 (1) | LTB-AA2-T01 (1) | LTB-AA2-T02 (1)
- LTB-AA2-T03 (2) | LTB-AA2-T04 (2) | LTB-AA2-T05 (2) | LTB-AA2-T06 (3)
- LTB-AA2-T07 (4) | LTB-AA2-T08 (3) | LTB-AA2-T09 (1) | LTB-AA2-T10 (1)
- LTB-AA2-T11 (1) | LTB-AA2-T12 (1) | LTB-AA2-T13 (2) | LTB-AB1-T01 (1)
- LTB-AB1-T02 (1) | LTB-AB1-T03 (2) | LTB-AB1-T04 (2) | LTB-AB1-T05 (2)
- LTB-AB1-T06 (3) | LTB-AB1-T07 (4) | LTB-AB1-T08 (3) | LTB-AB1-T09 (1)
- LTB-AB1-T10 (1) | LTB-AB1-T11 (1) | LTB-AB1-T12 (1) | LTB-AB1-T13 (2)

Judge: 120 calls plus 12 repeat calls for self-consistency, chosen by a fixed rule (every 10th case in file order): LTB-CA1-T01, LTB-CA1-T11, LTB-CA2-T07, LTB-CB1-T04, LTB-TA1-T01, LTB-TA1-T11, LTB-TA2-T07, LTB-TB1-T04, LTB-AA1-T01, LTB-AA1-T11, LTB-AA2-T07, LTB-AB1-T04. At most one re-ask per case if the judge output can't be parsed.

## Provider, models and limits

| | Tutor (system under test) | Judge (secondary) |
|---|---|---|
| Provider | Anthropic API, direct | Anthropic API, direct |
| Model | `claude-opus-5-5` (app default `anthropicTutorModel`) | `claude-sonnet-5-5` |
| Effort | `low` (app default) | `medium` |
| Max output tokens per call | 4,000 (app setting, unchanged) | 6,000 |
| Max input per call | bounded by the app's text bound; system prompt in the dry run was 2735–5796 characters, plus up to 3 earlier turns | about 4,000 tokens |
| Timeout | 25 s (app SDK setting) | 120 s |
| Retries | gateway `maxAttempts: 2` (at most 1 retry), SDK retries 0 | at most 1 retry on 429, 5xx or network error; at most 1 re-ask on unparseable output |
| Concurrency | 1 | 1 |
| Server-side fallback | the app sends `fallbacks: 'default'`; the served model is recorded per attempt | none |

## Cost estimate (current provider prices; repo price catalog matches)

Prices: Opus 5.5 $4 / $20 per million input / output tokens; Sonnet 5.5 $2 / $10.

| Part | Expected | Range | Hard worst case |
|---|---|---|---|
| Tutor (219 calls) | about $4.50 (≈0.45M input, ≈0.13M output incl. thinking) | $3–$9 | $19.50 (every call at 4,000 output tokens) |
| Judge (132–264 calls) | about $3 | $2–$6 | $18 |
| **Total** | **about $7.50** | **$5–$15** | capped at $35 by the controls below |

## Budget-control mechanism

1. **Harness hard stop (tutor):** `run.ts --cap 25`. Before every turn the harness compares the metered cost (provider-reported usage × catalog prices, summed over every attempt including failures and retries) with the cap and stops when reached. Worst overshoot is one call (≤ $0.09).
2. **App test-spend cap:** `AI_TEST_SPEND_CAP_USD=35` with `AI_TEST_SPEND_ID=ltb-v1-local`, enforced by the app's own budget gateway. It lives only in the throwaway in-memory database. **The staging cap, `AI_TEST_SPEND_ID` and staging ledgers are not touched.**
3. **Judge hard stop:** `judge.ts --cap 10`, same mechanism.
4. Sequential execution, fixed case list, no open-ended loops.

## Staging spend and cap

Not applicable to this run: it uses the user-provided Anthropic key directly from a local, in-process copy of the backend. It does not use the staging deployment, its keys or its budget. The staging test-spend figure on record (cap $100, about $21 used) **couldn't be re-verified in this session**: no read endpoint exists, and reading the database needs credentials outside this task's scope. It is unchanged by this run.

## Data and licence confirmation

- Only synthetic learner profiles are used. Every case's content is original text written for this benchmark; there are no 4Level1 data, no real student data, no audio, and no names of real people.
- Each synthetic learner has a distinctive invented name. Every provider request is scanned for it, and for the learner's email, student ID, user ID, school ID and school name. The dry run found 0 leaks in 219 requests.
- No third-party corpus text is in any case or any paid call (see `license_review.md`). The dataset's licence (ENARA internal, original content) permits the planned API processing.
- The throwaway database is in-memory (`mongodb-memory-server`); no staging, production or school tenant is connected. The harness blocks every outbound host except `api.anthropic.com`.

## Gates

| Gate | Status |
|---|---|
| Licence review done; no restricted corpus used | pass |
| Rubric and scoring spec frozen before outputs | pass |
| Harness on the real tutor route; dry run 120/120 cases, 219/219 turns | pass |
| No identifier leaks in the dry run | pass (0/219) |
| Budget controls in place (3 layers) | pass |
| Provider key works (free `GET /v1/models` returned 200) | pass |
