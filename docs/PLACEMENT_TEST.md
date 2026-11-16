# DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md)

# Placement test (A1–A2)

*16 Nov 2026. A design plus a pure engine. Not wired into the tutor or any route. No model calls.*

- Item bank: `data/assessments/placement/placement.json` (`"status": "DRAFT"`)
- Engine: `backend/src/services/assessment/placementEngine.ts`
- Tests: `backend/test/placementEngine.test.ts` (simulated answer patterns)
- Outcomes the items link to: `data/outcomes/outcomes.json`

## 1. Bank

| Level | Grammar | Vocabulary | Reading | Writing | Total |
|---|---|---|---|---|---|
| A1 | 7 | 7 | 6 (2 texts) | 1 | 21 |
| A2 | 7 | 7 | 6 (2 texts) | 1 | 21 |

Every item has `id`, `level`, `skill`, `type`, `prompt`, `points`, `outcomeIds`, `reference` (CEFR Companion Volume scale, English Grammar Profile or English Vocabulary Profile category, or exam style).
Controlled items use the grader's format (`docs/GRADING_FOR_OUTCOMES.md` §2, §4): `multiple-choice` / `short-answer` with `correctAnswer` and `acceptedAnswers[]` (the extension in §6.1). Writing items are `open-response` with `rubric.criteria[].levels[]` (points per level) and a `modelAnswer`; the rubric total equals `points`.
Prompt vocabulary is kept at or below the item level (EVP). Listening and speaking have **no items** (NOT MEASURABLE YET).

**Adding B1–C1.** Append the level to `levels` (in order) and add items with that `level`. The engine reads the level order from the bank; no code change.

## 2. Scoring

- Controlled items: deterministic. Response and keys are normalised (lower case, curly to straight apostrophe, spaces collapsed, trailing `. ! ? , ; :` removed) and compared with `correctAnswer` ∪ `acceptedAnswers`. 1 or 0.
- Writing: not scored by the engine. The rubric is scored elsewhere (assignment grader, model rubric, or a teacher) and the points are passed in.

## 3. Adaptive rules (constants in `CONFIG`)

1. **Start** at A2 (`startLevel`).
2. **Item choice** (deterministic): at the current level, the skill with the fewest answered items at that level (ties: grammar, vocabulary, reading), first unused item of that skill in bank order.
3. **Blocks of 5.** After every 5 items at the current level, block accuracy `b`:
   - `b ≥ 0.8` → up one level (if there is one);
   - `b ≤ 0.4` → down one level (if there is one);
   - otherwise stay; a new block starts.
4. **Level passed / failed.** For level L: `n_L` items answered at L, `acc_L` share correct.
   `passed(L, k)` = `n_L ≥ k and acc_L ≥ 0.6`; `failed(L, k)` = `n_L ≥ k and acc_L < 0.6`.
5. **Stop** (checked before each item; "level clear" only at a block boundary):
   - **max items:** 25 controlled items answered; or
   - **level clear:** some L with `passed(L, 5) and failed(L+1, 5)`; or L is the top level and `passed(L, 10)`; or the lowest level `failed(A1, 10)` → `pre-A1`; or
   - **bank exhausted** at the current level.
6. **Writing:** after stopping, one writing task at the placed overall level (A1 task if pre-A1).

Examples (simulated in the tests): all correct → A2 after 10 items; A1 right / A2 wrong → A2 block 0/5, down, A1 block 5/5, up blocked by A2 failed → A1 after 10 items; all wrong → pre-A1 after 15 items; 60% everywhere → A2 at 10 items.

## 4. Output: CEFR per skill + confidence

**Level for a set of answers** (overall, or one skill): the highest level L with `n_L ≥ m` and `acc_L ≥ 0.6` (`m` = 5 overall, 2 per skill); if none, the highest level with `n_L > 0` and `acc_L ≥ 0.6` (thin evidence); if none, one level below the lowest level tested (`pre-A1` below A1). Overall uses the "level clear" level when the test stopped on it.

**Confidence** (exact formula):

```
margin(a)   = min(1, |a − 0.6| / 0.4)
m           = min( margin(acc_L) if n_L > 0 , margin(acc_{L+1}) if n_{L+1} > 0 )   (0 if neither)
confidence  = round2( min(1, n / T) × (0.5 + 0.5 × m) )
```

`L` = placed level, `n` = items used for that estimate, `T` = 10 overall, 4 per controlled skill.
**Writing:** one task, fraction `f = points / maxPoints`; level = task level if `f ≥ 0.6`, else one level below; `confidence = round2(0.6 × (0.5 + 0.5 × margin(f)))` (capped at 0.6: one model-scored task).
**Label:** `high` ≥ 0.75, `medium` ≥ 0.5, else `low`.

Result shape: `{ status: 'DRAFT', stopReason, itemsUsed, overall: {level, confidence, label, n}, skills: { grammar, vocabulary, reading, writing } }`. Listening and speaking are not reported (NOT MEASURABLE YET).

## 5. Limits

- Thresholds (0.8 / 0.4 / 0.6, block 5, 25 items) are design choices, not calibrated. Item difficulty is not yet estimated from real responses; no IRT.
- Per-skill levels rest on 2–7 items each; read the confidence.
- Items are drafts; they need teacher review and piloting with Arabic-L1 learners before use.
