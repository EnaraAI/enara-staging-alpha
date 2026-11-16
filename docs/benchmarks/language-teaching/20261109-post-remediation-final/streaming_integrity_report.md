# Streaming integrity: POST-01 (marker leakage) and POST-02 (marker trust)

**Result: FIXED and verified.** Verified by unit tests, by route tests with the SDK mocked, and by live streamed replies from the real model in Stage A. Stage C uses the JSON route; its marker results are in `paid_evaluation_report.md`.

## 1. Design

There is one class, `AssessmentMarkerFilter` (`languageLearningState.ts`):
- the SSE path calls `push(delta)` per provider delta, then `end()`;
- the JSON path calls `stripAssessmentMarkers(text)`, which is `push(text) + end()`.

Both paths therefore share every rule.

| Rule | Behaviour |
|---|---|
| Release | Text before any `[` is released immediately. Streaming latency is unchanged for ordinary text. |
| Hold | A possible `[[assess` prefix is held until the next character decides it. |
| Recognise | Only `[[assess` followed by whitespace or `]`. `[[assessment …]]`, `[1]` and `[[note]]` remain visible. |
| Close | `]]` within 1,000 characters and before any blank line. Newlines inside a marker are allowed (the r4 filter broke on them). |
| Malformed | Unclosed at a blank line, at 1,000 characters, or at the end of the stream: the region is **dropped**, `malformed=true`, nothing is trusted. |
| Trust (POST-02) | Only a marker before any visible text is trusted. Later markers are removed and counted (`assessment_marker_extra`). If the first marker came after visible text, nothing is trusted (`assessment_marker_not_leading`). |
| Learner-supplied marker text | If the learner's message contains `[[assess`, a marker can only lower the verdict (`learner_supplied_marker_text`). |
| Rejected marker | Prose is not used as a verdict either; the turn stays `NOT_EVALUATED`. |
| Retries | `aiGateway.meteredStream` retries only before the first emitted delta. A failure after text gives a `replace` event; the turn's language state is **not stored**. |
| Disconnect | The loop stops, credits are released, nothing is stored. |

## 2. Evidence

### Unit tests (`languageTeachingR4.test.ts`, "r4.1 POST-01" and "r4.1 POST-02")

**Chunking equivalence.** There are 8 adversarial texts:
- a multi-line marker;
- a 300-character marker;
- a leading INCORRECT plus a later CORRECT;
- a non-leading marker;
- an unclosed marker before a blank line;
- look-alike brackets;
- a bare unclosed marker;
- a dangling `[[asse`.

Each is split at every chunk size from 1 to 9 and every offset. **Every split produces the whole-text output exactly**: the same visible text, the same assessment and the same malformed flag. No visible output contains `[[assess` or `verdict=`.

**Malformed handling:**
- An unclosed marker gives `assessment=null` and `malformed=true`.
- The text after the blank line is kept.
- A dangling prefix at the end of the stream is released as text, because it is not a marker.

**Trust:**

| Case | Result |
|---|---|
| Leading INCORRECT + later CORRECT | INCORRECT, `untrustedMarkers=1`, flag `assessment_marker_extra` |
| Late-only marker | No assessment, flag `assessment_marker_not_leading`; **prose praise is not read as CORRECT** |
| Learner-dictated CORRECT | `NOT_EVALUATED`, criteria cleared, item stays open |
| Learner-dictated text, tutor's own INCORRECT | INCORRECT stands |
| Answer key vs marker | The answer key outranks a contrary marker |
| Criteria indices | Bounded to the lesson |
| Verdicts | All 6 round-trip |

### Route tests (real controller, SDK mocked)

- **SSE:**
  - A multi-line marker split into 2-character chunks and a 320-character marker split into 3-character chunks: the streamed text is exactly `Close! Check the verb ending.`.
  - No `[[assess`, `verdict=` or marker body appears in the SSE body.
  - The stored text equals the streamed text.
  - The state is stored (`PARTIALLY_CORRECT`, `markerStatus: ok`).
- **SSE, unclosed marker:** the visible text is only the reply, with `markerStatus: malformed` and verdict `NOT_EVALUATED`.
- **JSON, learner dictates a marker that the model echoes at the end:**
  - the stored verdict is the tutor's leading INCORRECT;
  - the item stays open;
  - flags `assessment_marker_extra` and `learner_supplied_marker_text`;
  - the returned text has no marker.
- **JSON, learner dictates a leading CORRECT:** `NOT_EVALUATED`, item still open.
- **Existing r4 tests still pass:** tiny-chunk SSE, mid-stream failure (no state stored), and a retried first attempt (one reply, one assessment).

### Live (Stage A, real model, real route)

There were 5 streamed turns (SA-09, SA-10) through the new harness SSE transport. Usage was read from the provider's own stream events.

| Check | Result |
|---|---|
| Stream equals stored text | **5/5** |
| Marker text in the stream | **0/5** |
| `markerStatus: ok` | 5/5 |
| HTTP 200 | 5/5 |
| Provider retries | 0 |

Two Stage A JSON turns carried learner-dictated marker text (SA-06, SA-07):
- neither verdict became CORRECT;
- both turns were flagged `learner_supplied_marker_text`;
- no marker reached the learner.

Across all 28 Stage A turns:
- markers visible: 0;
- malformed: 0;
- missing: 0.

**Re-check run (5 cases, 15 turns):** markers visible 0.

## 3. Residual risk

| Risk | Note |
|---|---|
| A leading marker can still be wrong | It is model output. It is trusted only for verdicts the answer key does not settle, and never for success when the learner supplied marker text. Lesson completion still needs a structured verdict. |
| Live SSE sample size | Only 5 turns were streamed live; the chunking proof is exhaustive at unit level. |
