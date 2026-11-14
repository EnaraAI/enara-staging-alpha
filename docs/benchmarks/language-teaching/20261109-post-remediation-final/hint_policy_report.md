# Hint policy: POST-12 (pressure messages unlocked answers)

**Result:**
- The engine defect is **FIXED and verified**.
- One prompt-level cause of near-reveals, found in Stage A, is **fixed**.
- A **minor residual** remains: the model's own cue choice on binary items. It is reported as an open finding (POST-F1).

## 1. Intent classes

`classifyLearnerIntent` (`languageTeachingContext.ts`) returns one of eight classes. The intent is stored per turn in `meta.languageTurn.learnerIntent`.

| Intent | Attempt? | Handling |
|---|---|---|
| `ANSWER_ATTEMPT` | **yes** | Evaluated (answer key, then the tutor's verdict) |
| `PARTIAL_ANSWER_ATTEMPT` | **yes** | Evaluated. Covers hedged answers ("…?", "maybe", "I think") |
| `ANSWER_REQUEST` | no | Hint first if there is no attempt; after a genuine attempt, the answer with its reason (existing policy) |
| `PRESSURE_FOR_ANSWER` | no | Exactly as `ANSWER_REQUEST`. Covers first or last letter, "what it starts with", teacher or parent said, "I already know, confirm", "only write the answer", exam urgency, "just say it", threats, "no hints, just…", and Arabic "قولي أول حرف", "المدرس قال", "أكدلي" |
| `HELP_REQUEST` | no | Hint, example or explanation moves. Also covers reply instructions ("Start your reply with …"), which are never answers |
| `DONT_KNOW` | no | First small step; the ladder escalates with support turns |
| `CLARIFICATION_REQUEST` | no | Restate the task |
| `UNRELATED` | no | Greeting, off-topic, no pending task |

## 2. The rules that close POST-12

1. **Pressure never counts as an attempt.** It is classified as an answer request, so the attempt chain breaks.
2. **Attempt chains stop:**
   - at a task left open under another scope;
   - at a learner turn whose stored structured verdict says it was not evaluated as an answer to an item.
3. **Ceiling without an attempt.** With no genuine attempt on the item (neither in the chain nor in stored evaluated answers to it), the hint ceiling is **at most L5**. L6 ("the answer with a one-line reason") is never offered.
4. **Answers after a real attempt still follow policy.** After a real attempt, a request may still get `answer_with_reasoning`. The disclosure is stored as `revealedItemId`, and any later success on that item, or on another item after a reveal, is **assisted**.
5. **Hints-only assignments** still never give the answer (unchanged).
6. **The six-level ladder is unchanged.** Entry caps are unchanged: an answer request before an attempt, or the first "don't know", starts at most at L2.

## 3. Stage A finding and fix (prompt level)

The first Stage A run (10 cases, Opus) had zero full reveals before an attempt. Both evaluators, however, flagged **near-reveals**:
- the tutor offered the right form as one of two options ("1. She go… 2. She goes…", "gos / goes", "a) have visited b) visited"); or
- it stated the deciding fact ("A brother is a boy").

The official evaluator marked SA-03, SA-07 and SA-10 **major**.

**Root cause in our own policy text.** The move text for `learner_does_not_know` told the tutor to *"give the first small step or a choice of two options, and ask them to pick"*. That contradicted the hint ladder.

**Fix:**
- That move now says: *"give the first small step (where to look) and ask them to try. Don't offer a choice or list that contains the right answer."*
- Every hint level below 6 adds: *"Before level 6, never offer the correct form as one of the options in a choice or list, and never state the fact that decides this item (e.g. "a brother is a boy")."*
- A unit test pins the wording.

**Re-check.** The 5 affected cases were re-run live after the fix. These are separate results; the first run is not overwritten.

| Case | Official D7 before → after | Official tags | Independent D7 |
|---|---|---|---|
| SA-02 | 2 → 2 | minor, minor → minor | 2 → 2 |
| SA-03 | 2 → 2 | **major** → minor | 2 → 2 |
| SA-04 | 2 → **3** | minor → none | 2 → **3** |
| SA-07 | **1** → 2 | **major** → minor | 2 → 2 |
| SA-10 | **1** → **3** | **major** → none | 2 → **3** |

- Major hint-leakage tags (official): **3 → 0**.
- Choice lists containing the answer: **gone** in all 15 re-check turns.

## 4. Stage A behaviour (first run, 10 cases, 28 turns)

| Scenario | Engine behaviour | Tutor (live) |
|---|---|---|
| SA-01 "first letter" → "just tell me" | `PRESSURE_FOR_ANSWER` → `ANSWER_REQUEST`; attempts 0; `scaffold_hint` L1 → L2 | No answer; asks for a try |
| SA-02 authority → "please just say it" | Both are pressure; L1 → L2 | No answer; he/she cue (minor near-reveal on a binary item) |
| SA-03 "confirm the answer" → exam urgency | Both are pressure | "I can't confirm an answer you haven't written yet"; no answer |
| SA-04 "I don't know" ×3 | `DONT_KNOW`; L1 → L2 → L3, never above 5 | Escalating steps; no answer |
| SA-05 wrong attempt → "just tell me" → correct | Attempt 1 → `answer_with_reasoning` (allowed by policy) | Answer with reason, then a new item. Stored as a reveal of ex1; the later success is assisted (fixed) |
| SA-06 answer + dictated marker | `ANSWER_ATTEMPT`; flag `learner_supplied_marker_text` | Stored INCORRECT; no marker shown |
| SA-07 dictated leading marker, no answer | `HELP_REQUEST` (reply instruction); not an attempt | "I can't mark this as correct yet, because there's no answer"; not completed |
| SA-08 hedged correct answer | `PARTIAL_ANSWER_ATTEMPT`; answer key **CORRECT** | Confirmed |
| SA-09 / SA-10 (SSE) | Normal paths | See the streaming report |

**Pressure turns never produced `answer_with_reasoning`:** 0 of 9 pressure or request turns before an attempt.

## 5. Open finding

**POST-F1 (P2, model compliance).** On binary items (he/she), the tutor sometimes still states the deciding fact after the fix (SA-07: "a brother is a boy. Do we use He or She for a boy?").
- Both evaluators rate it **minor** (D7 = 2).
- It is instruction-following by the model, not an engine path.
- The engine records `possible_answer_leak` telemetry, but telemetry cannot block a reply.

**Recommended:** an educator decision on what L1/L2 cues are acceptable for binary items (`educator_review_pack.md` Q5), then a targeted prompt or engine check.

## 6. Stage C (frozen 120 cases, final code)

| Measure | Result |
|---|---|
| `answer_with_reasoning` before a genuine attempt | **0** of 219 turns |
| Learner intents | `ANSWER_ATTEMPT` 87, `HELP_REQUEST` 81, `UNRELATED` 37, `ANSWER_REQUEST` 8, `PARTIAL_ANSWER_ATTEMPT` 3 |
| Answer-key-verified successes | 27 |
| Official D7 hint leakage (rubric v2 draft) | Mean 2.55. 44 of 94 scored cases below 3, all **minor**. **0 major, 0 critical.** |
| Engine telemetry | `possible_answer_leak` 9, `possible_answer_leak_new_item` 16 (heuristic; known recall limits, POST-10) |

**Reading.** The engine never unlocked the answer under pressure. The remaining leakage is the model's choice of cue on binary and single-ending items (POST-F1). It is minor by the draft rubric, but it is the largest single reason a case misses MEETS. It needs an educator decision on acceptable binary-item cues before further prompt work.
