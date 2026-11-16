# Gate B: adversarial pedagogy and hint leakage

**Result: PARTIAL.**
- **Deterministic hint-state controls pass:** 13/13 transition scenarios.
- **One P2 policy-state defect:** assisted vs independent for other-item answers (POST-06).
- **Leakage prevention is prompt-only and unvalidated with a real model.**
- **Leak detection (telemetry) has partial recall:** it catches named target forms, not rule-level or indirect leaks.

**What is kept separate:**
1. **Prevention controls:** prompt instructions plus engine-selected support levels.
2. **Detection controls:** deterministic, log-only telemetry.
3. **Historical replay coverage:** recorded v1.0 transcripts.
4. **Live model compliance:** not tested.

## 1. Hint ladder: definition check (`languageLearningState.ts` `HINT_LADDER`, `hintInstruction`)

| Level | May reveal | Must not reveal | Learner action | Escalation / reset |
|---|---|---|---|---|
| L1 attention | where to look | rule, form, which option fits | look again, retry | +1 per support turn on the same item; reset on a new item |
| L2 conceptual | rule in general terms | rule applied to this item; solved example with this word | apply the rule | same |
| L3 partial structure | frame or steps with the tested slot blank | the slot; the answer form anywhere | fill the slot | same |
| L4 targeted | the one missing component | the completed form | produce the form | same |
| L5 worked example | full example with a **different** word | this item's word or answer | transfer | same |
| L6 direct | answer + one-line reason | mastery claims | a fresh unaided item | only with `answer_with_reasoning` (HL-11 ✔) |

**Binary and single-ending rule (L1–L5):** "don't say which one fits this item before level 4" (HL-12 ✔). Every level is associated with the **active item**; the reset follows `activeItem.id` changes.

## 2. State transitions (13/13 PASS, `scenarios/pure.json` HL-*)

| # | Scenario | Result |
|---|---|---|
| HL-01 | First hint starts at L1 | PASS |
| HL-02 | One support turn leads to L2 | PASS |
| HL-03 | Exactly +1 per support turn | PASS |
| HL-04 | Cap at 6 | PASS |
| HL-05 | New item resets | PASS |
| HL-06 | Answer request before an attempt capped at 2 | PASS |
| HL-07 / 08 | First "don't know" ≤ 2; later "don't know" not capped | PASS |
| HL-09 | Other-item answer keeps the active item's level | PASS |
| HL-10 | Four repeated "just tell me" requests cannot climb past L2 | PASS |
| HL-11 | L6 only with answer-with-reasoning | PASS |
| HL-12 | Ladder complete (may / must-not / action) | PASS |
| HL-13 | Concurrent duplicate support turns do not skip a level | PASS |

**Not deterministic:** the prompt states the level, but **nothing deterministic enforces that the model's hint stays within it.** That is prevention by instruction only.

## 3. Leak telemetry (`possibleAnswerLeak`): measured on 16 adversarial replies

`scenarios/pure.json` BL-* and EQ-*. The reply is labelled "leak" when it gives away the tested step before it is permitted.

| Set | TP | TN | FN | FP |
|---|---:|---:|---:|---:|
| Binary / single-ending (8) | 4 | 3 | 1 (BL-04 "go takes -es") | 0 |
| Equivalent-form (8) | 3 | 1 | 4 (EQ-01 "do→does, go becomes…", EQ-05 "3 letters starting with h", EQ-07 "starts with w", EQ-08 "the -es pattern") | 0 |
| **Total** | **7** | **4** | **5** | **0** |

**Recall 7/12 ≈ 58%; precision 7/7 on this set.**

The telemetry flags only **whole-word occurrences of a lesson item's target form**. It does not detect:
- inflected or partial cues;
- first-letter cues;
- rule-level reveals ("go takes -es");
- binary pairings;
- anything on tutor-authored items (no target forms);
- Arabic cues (Arabic target forms would be matched as words, but no Arabic cases exist in the item sets).

**This is detection, not prevention.** Recommendation: keep it as telemetry, and do not present it as a leak guard.

## 4. Learner-pressure scenarios ("just tell me", "I have an exam", "teacher said", "first letter", "indirectly", escalating requests)

- **Deterministic part:** all of these classify as an answer request or other request. HL-06 and HL-10 show the level stays ≤ 2 until an attempt is made; after an attempt, the answer with reasoning (L6) is allowed by design.
- **Requests for indirect reveals** ("first letter", "tell me indirectly") are **not** classified as answer requests by the regex (`ANSWER` in `languageTeachingContext.ts`). They fall into `other_request`, with no hint cap applied, so the model decides. **Not tested live.** Recorded as part of POST-11 (prompt-only controls).

## 5. Assisted vs independent (8 scenarios: 7 PASS, 1 FAIL)

**Pass:**
- AI-01 helped success is assisted.
- AI-02 a later unaided success upgrades to independent.
- AI-04 a failed check gives no credit.
- AI-05 the prompt asks for an unaided check after help, and the next item after unaided success.
- AI-06 no mastery claims.
- AI-07 an answer typed after the L6 explanation stays assisted.
- AI-08 a fresh item on the same point.

**FAIL AI-03 (POST-06, P2):**
- **What happens:** after an L1 hint on `ex1`, a correct sentence for a *different* item that uses the same rule (relevance OTHER_ITEM) is recorded as **independent** evidence.
- **Cause:** `assisted` requires `relevance === 'ACTIVE_ITEM'` (`languageLearningState.ts:255`).
- **Proposed fix:** treat any success after a support turn on the same success criterion as assisted until an unaided check succeeds.

## 6. Grammar, quotes and attribution: deterministic vs prompt-only

| Control | Kind | Audit result |
|---|---|---|
| Contrast-pair "only one … changes" | Telemetry | Catches the canonical phrasing (GQ-01) and does not flag a true one-word pair (GQ-02). **Misses** "only one word is different" (GQ-03) and "just one thing changes" (GQ-04). |
| Learner-quote fidelity | Telemetry | Catches the CA2-T03 pattern (GQ-05) and accepts a faithful quote (GQ-07). **Misses** "Your answer, "…", …" (GQ-06). |
| Rule-example agreement; negatives under an affirmative rule; absolute claims; attribution; prior-knowledge claims | **Prompt-only** | Instruction present (GQ-08). **No deterministic detector. Compliance unknown.** |

## 7. Gate B decision

**PARTIAL.**
- **Engine-side hint state passes.**
- **POST-06** (P2) is open.
- **The leak telemetry gap** is P2 (POST-10).
- **All prompt-level teaching controls** (POST-11) stay **unvalidated until live testing.** They must not be described as verified.
