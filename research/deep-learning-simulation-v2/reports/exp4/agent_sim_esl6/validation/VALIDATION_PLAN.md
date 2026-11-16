# SIMULATION ONLY

# ESL6 validation plan (rules: config/agent_sim_esl6/LEARNING_RULES.md, F1: config/agent_sim_esl6/F1_PARAMS.json)

These checks test the rule-based learner simulator and its judges. They are not evidence about real learning.

## Targets (fixed now, from the brief, before any judge runs)
| Check | Target |
|---|---|
| Judge agreement, required set (240 mixed cases) | **≥ 85%** overall |
| Judge agreement, required set, session 2 (142 cases) | **≥ 85%** |
| Scripted order (each judge) | **d > c > b ≈ a**: d > c > max(a, b) and abs(b − a) ≤ 0.25 × (d − a), on mean expected post-test accuracy (the ESL5 rule) |
| Forgetting | 7-day mean expected accuracy **(b) > (a)**; immediate **abs((b) − (a)) ≤ 0.03** |
| Noise | Reported only, no pass mark set in the brief: run 2 − run 1 difference in mean expected immediate and 7-day scores |

Agreement = after each judge's events **and retrieval report** are applied to the same state before the turn, with the same production fact, the strengths, independent counts and counted retrievals are identical. This is the ESL5 rule (esl4Study.ts `agreescore`) plus the new 5b retrieval report.

## Files
| File | What it is |
|---|---|
| `src/offline/esl6_forget.py` | Pure, deterministic F1 (6a decay with band floor, 6b partial return with cap, 6c retrieval counting) and 2a answering (round half up; Ck < 1.0 gives at least 0.4 after any F1 interval), post-test expected accuracy, event application on non-whole strengths |
| `src/offline/test_esl6_forget.py` | 19 unit tests, including the section 6d worked example (day 7: C1 0.95 / 1.475, W1 2.0) |
| `src/offline/esl6_outcomes.py` | Content for the 30 outcomes with at least one wrong belief (3 GAP outcomes excluded; the selection is checked against `data/outcomes/outcomes.json` and `OUTCOME_STATUS.json`) |
| `src/offline/esl6_valprep.py` | Builds every input below and computes the forgetting check |
| `src/offline/esl6_valscore.py` | `agree` (agreement + order check per judge), `noise` (noise check), `reference` (sanity check with reference events) |
| `cases_mixed.json`, `scripted_order.json`, `noise_cases.json` | Case texts (blind) |
| `judgeA_input.json`, `judgeB_input.json`, `judgeA/`, `judgeB/` | Identical 720 cases, each judge with its own shuffle, 20 batches of 36. No answer key |
| `noise_run1_input.json`, `noise_run2_input.json`, `noise_run1/`, `noise_run2/` | The same 150 noise cases, two shuffle seeds, 5 batches each |
| `VAL_KEY.json` | **Not for judges.** Source, style, template, state before the turn, production fact, reference events, transcript chains |
| `FORGET_CHECK.json`, `ORDER_REFERENCE.json` | Deterministic results computed now |
| `JUDGE_TASK_ESL6.md` | Judge task: ESL6 rules, private scratch folder per judge, no shared files, never read the other judge's output |

Rebuild: `python3 src/offline/esl6_valprep.py`. Tests: `python3 -m unittest src/offline/test_esl6_forget.py`.

## 1. Scripted-tutor order check
- 30 learners, one per outcome (A1 for even index, A2 for odd; for outcomes with 2 wrong beliefs the primary belief alternates). Each learner meets the 4 scripted tutors for 4 turns in session 1: **480 cases**.
- Tutors keep their ESL5 meaning: **a** chats (no teaching); **b** shows finished examples only (R5); **c** states the outcome's rule once, then small talk (R1 only); **d** gives the rule, a right/wrong pair on the primary belief and asks for own sentences, with confirmation or a pair on the error.
- The transcripts are fixed (learner replies drawn with the reference events). The counted check uses each judge's own events, chained per learner. No F1 (session 1 only).
- Reference events (what a judge who follows the rules should give): a 0.205, b 0.205, c 0.430, d 0.936. This passes the rule (tolerance 0.183).

## 2. Forgetting check (computed now, deterministically, reference events, no judge)
- 60 learners (30 outcomes × A1/A2), the same learners and dice in both arms (dice keyed by item, so shared turns draw the same numbers). Session 2 comes 2 days after session 1 (F1 runs for 2 days). Immediate = end of session 2 (2a applies). 7-day = after 7 days of F1.
- **Counted design ("full", tutor d's content):** session 1 = rule + pair + 3 own sentences + 1 item, with feedback; session 2 (a) = rule + pair + 2 new items with feedback; (b) = the same, starting with a recall item (the session-1 item, answered from memory, so it counts as a retrieval).
- **Sensitivity design ("light")**, to test whether a ceiling explains the result: session 1 = rule + pair + 1 item; session 2 (a) = rule + pair, no item; (b) = recall item first, then the same.

| Design | Immediate (a) | Immediate (b) | diff | 7-day (a) | 7-day (b) | diff | Learners whose 7-day score changes | Result |
|---|---|---|---|---|---|---|---|---|
| **full (counted)** | 0.936 | 0.936 | 0.000 | 0.936 | 0.936 | **0.000** | 0 / 60 | immediate passes; **7-day (b) > (a) FAILS** |
| light (sensitivity) | 0.859 | 0.908 | **+0.049** | 0.366 | 0.366 | **0.000** | 0 / 60 | **both fail** |

**Why (follows from the rules as written; see `FORGET_CHECK.json` → `mechanism`):**
- Retrieval only slows the decay of Ck. Ck's strength only matters through the 2a threshold (Ck < 1.0 gives Wk at least 0.4).
- A wrong belief that was lowered but **not removed** comes back by half its drop over the 7 days (for example 0 → 1.5 from a start of 3). That rounds to 0.4 or 0.8, which is already at least 0.4, so Ck makes no difference (light design: no Wk was removed).
- A wrong belief that was **removed** (R4 reset) stays at 0. Then retrieval matters only if Ck ends session 2 in about [1.525, 2.05). Below that, both arms fall under 1.0. Above it, both stay at or above 1.0. With R3 + R4 on each correct production, Ck usually reaches 3 when the belief is removed (full design: every learner ended above the window).
- In the light design, the recall answer's R3 (+1 Ck) lifts some learners over the 1.0 threshold at the **immediate** test. That makes the immediate difference +0.049, beyond the 0.03 tolerance.
- So under the ESL6 rules F1-v1, adding recall items does not raise the 7-day expected score for these scripted tutors. The forgetting check does **not** pass. I did not change any rule or parameter. Whether to revise F1 (for example, letting retrieval also limit the 6b return, or a threshold above 1.0) is a decision for the protocol owner, and it must be made before any ESL6 tutor session.

## 3. Judge agreement set
- **Mixed cases: 240** (required set). 8 per outcome × 30 outcomes: 4 P+-style and 4 ENARA-style. Session 1: 98, **session 2: 142** (≥ 80 required). By style × session: P+ 60/60, ENARA 38/82.
- Style definitions as in ESL5 round 2. **P+-style:** a warm, plain tutor; it explains in prose, gives one-item reasons, asks question hints, praises, sometimes gives the answer. Templates: P1 rule at start, P2 pair on the error + new item, P3 question hint, P4 confirm + new item (R3 + R4), P5 confirm a retry (R3 only), P6 false confirmation of an own sentence (R7), P7 confirm an own sentence (R3 + R4), P8 answer only (R5), P9 session-2 opener. **ENARA-style:** "Rule: … Right: … Wrong: … Your turn", look-hints, answer release after two tries, own-sentence tasks and, in session 2, recall items. Templates: E1 rule + pair, E2 look-hint, E3 release (R5 + R1 + R2), E4 new item after release, E5 recall asked, E6 recall answered correctly (R3, no R4, retrieval), E7 recall answered wrongly (R2, retrieval), E8 settled recall (no retrieval), E9 own sentence.
- Session-2 states come from a session-1 state after 2 days of F1, so many strengths are non-whole (this exercises 2a and the "rounded 0" wording). Each session-2 case lists the items the learner answered in session 1 (needed for 4b/5b).
- **Plus the 480 scripted order cases.** Total **720** per judge, identical cases, separate shuffles, 20 batches of 36. Judges see only id + text.
- Judges: two fresh, independent judge agents (A, B), each given `JUDGE_TASK_ESL6.md`, its own JDIR and a private scratch folder. No shared files. No access to the other judge's output, `VAL_KEY.json` or any earlier round.
- Scoring: `python3 src/offline/esl6_valscore.py agree <validation>/judgeA <validation>/judgeB --out <validation>/RESULT.json`. Missing cases count as a failure of the targets.
- Sanity check: with both judges set to the reference events, agreement is 100% and the order matches section 1 (`esl6_valscore.py reference`).

## 4. Noise check plan
- Transcripts: the light-design arm (b), 2 sessions, 30 learners (one per outcome): **150 cases**, 60 in session 1 and 90 in session 2. These are the same learners and the same fixed transcript for both runs.
- Run 1 and run 2: two fresh judge agents, each given `JUDGE_TASK_ESL6.md` with JDIR `noise_run1` or `noise_run2`. The inputs differ only in the shuffle and batching seed (`esl6-val-noise-shuffle|run1` / `|run2`): the "judge seed".
- Scoring: `python3 src/offline/esl6_valscore.py noise <validation>/noise_run1 <validation>/noise_run2 --out <validation>/NOISE_RESULT.json`. Each run's events and retrievals are chained per learner, with F1 for 2 days between the sessions. The script reports the mean expected immediate and 7-day scores for each run and for the reference, run 2 − run 1, the mean absolute per-learner difference, and how many learners differ.
- Reference values (both runs equal to the reference events): immediate 0.8967, 7-day 0.3604, difference 0.

## Not run here
No judge agents were started and no API was called. Agreement and noise numbers are produced only when the judges have written their batch JSON files.

## Round 2 (F1 v2)

**Round-1 failure.** Forgetting check, counted (full) design: 7-day (b) − (a) = 0.000 (0 / 60 learners changed); light design 0.000 with immediate +0.049. Cause (`FORGET_CHECK.json` → `mechanism`, round 1): retrieval only slowed Ck decay, which affected answers only below the hard Ck 1.0 threshold; partly returned wrong beliefs already forced ≥ 0.4; full teaching ends at Ck 3.0, and 7 days (−1.05) never crosses 1.0.

**Change (F1 v2, `LEARNING_RULES.md` 2a and 6, `F1_PARAMS.json` version F1-v2; v1 kept in collapsed notes).** All parameters fixed before re-running; no tuning after the result.
1. 6b/6c: each counted retrieval of Ck multiplies Wk's daily return **and** its per-gap cap by **g = 0.5** (testing effect reduces proactive interference / recovery of the old response; Szpunar, McDermott & Roediger 2008; Anderson, Bjork & Bjork 1994 — VERIFY). r = 0: 0.10 × drop/day, cap 0.5 × drop; r = 1: 0.05, cap 0.25; r = 2: 0.025, cap 0.125. g = m (the existing decay multiplier), so no new free value.
2. 2a: hard threshold replaced by a graded floor on Wk's error on an item testing Ck: **0.4 × max(0, 1 − Ck/2)** (Ck 0 -> 0.4, 1 -> 0.2, 2+ -> 0). Anchor Ck ≥ 2 = reliable recall, as in 3a "say the rule". Same as v1 at whole Ck 0 and ≥ 2; at Ck 1 it is 0.2 (v1: 0). Applies only after an F1 interval, so session 1 / ESL5 behaviour is unchanged.
3. Unchanged: decay 0.15/day, m = 0.5, r cap 2, return fraction 0.10 and cap 0.5 at r = 0, floors, timing (2 days / 7 days), rounding.

**Rebuild.** `python3 src/offline/esl6_valprep.py` re-run. Session-2 starting strengths do not depend on v2 (r = 0 during the 2-day gap), and the session-2 learner dice did not change any reply: `cases_mixed.json`, `scripted_order.json`, `noise_cases.json`, the judge/noise inputs, `VAL_KEY.json` and `ORDER_REFERENCE.json` are byte-identical to round 1. Only `FORGET_CHECK.json` changed. Unit tests: 20 pass (`python3 -m unittest src/offline/test_esl6_forget.py`; worked example updated, new test for the retrieval-limited return and the graded floor).

**Results (reference events, deterministic).**

| Check | Result | Pass mark | |
|---|---|---|---|
| Order (session 1, no F1) | a 0.2053, b 0.2053, c 0.4303, d 0.936 | d > c > b ≈ a | **PASS** (unchanged) |
| Forgetting, **full (counted)** | immediate a 0.936 / b 0.936 (diff 0.000); 7-day a 0.936 / b 0.936 (**diff 0.000**), 0 / 60 learners change | 7-day (b) > (a), immediate \|diff\| ≤ 0.03 | **FAIL** (immediate passes) |
| Forgetting, light (sensitivity) | immediate a 0.8535 / b 0.8844 (diff +0.0309); 7-day a 0.3662 / b 0.5950 (diff +0.2288), 43 / 60 change | (not counted) | 7-day passes; immediate just over 0.03 |

**Why the counted design still fails.** In the full design every wrong belief is removed (R4 reset, so the 6b change cannot act) and every Ck ends session 2 at 3.0. After 7 days Ck is 1.95 (a) vs 2.475 (b). The graded floor is 0.4 × (1 − 1.95/2) = 0.01 in (a) and 0 in (b). Both are below the table's 0.05 for W = 0, so both arms answer with p = 0.05 and score the same. The v2 changes do work where a wrong belief is only lowered (light design: +0.229 at 7 days).

**Decision.** As pre-stated, v2 still fails the counted check, so I report it and stop. I did not tune any parameter after seeing the result. The protocol owner decides what happens next, before any ESL6 tutor session. Options: count the light design, accept that full teaching hits a ceiling, or set a new rule in advance.
