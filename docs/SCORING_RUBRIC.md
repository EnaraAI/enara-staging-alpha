# DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md)

# Scoring rubric for outcome items

*16 Nov 2026. Written for the outcome item bank in `data/assessments/outcomes/`. The grader was not changed. No API call was made.*

Related: `docs/GRADING_FOR_OUTCOMES.md` (what the grader can do), `docs/LEARNING_OUTCOMES.md` (the outcomes), `research/assessment-validation/a1a2/REPORT.md` (validation of this rubric and the grader on 100 answers).

## 0. Validation summary (A1–A2)

See section 6. In short: on 100 synthetic Arabic-L1 answers, the **deterministic** grader paths fall below the 95% target on controlled items and give no score at all to free sentences. The **agent stand-in** (not the production grader) using the grader's exact prompts and these rubrics reached the targets. The reference scores come from **one agent scoring three times**, not three independent people.

## 1. Rules for every item

1. **Score the target form only.** Each item has a `targetForm`. Errors in anything else (spelling of other words, capitals, punctuation, word order outside the form, articles in a tense item, Arabic-L1 resumptive pronouns like "My grandmother she is…") are **ignored**.
2. **Normalise before you compare.** Case, final and inner punctuation, extra spaces, straight vs curly apostrophes, contraction vs full form (`'re` = `are`, `don't` = `do not`, `can't` = `cannot` = `can not`), and a missing apostrophe in a contraction (`cant`, `dont`) do not change the score.
   **Exception (review round 1):** when the target *is* case or punctuation, it is not normalised. For `EN-F-A1-GR-capitals-full-stops` every item is case- and punctuation-sensitive (capital letters, capital I and the final full stop are scored; a choice answered by letter stays case-insensitive). For `EN-F-A1-VO-days-months` the day/month word is case-sensitive (`tuesday` ≠ `Tuesday`); other case and punctuation are still normalised. The item's `matchingNote` states this.
3. **Avoiding the form is not using it.** A grammatical answer that does not contain the target form scores 0 (e.g. "My village has a small mosque." for a *there is* item).
4. **Over-regularised forms are wrong, not slips.** `goed`, `buyed`, `eated` = wrong form (0). `boughted` (right irregular stem, extra ending) = slip.
5. **Blank, "I don't know", copying the prompt unchanged** = 0.
6. **Several accepted answers.** Any answer in `acceptedAnswers` (after rule 2) is right. Lines in `acceptedAnswers` that are notes ("Case-insensitive; …", "Model answer; …") are instructions, not answers.

## 2. The four rubrics, in the grader's format

The assignment grader reads an `IQuestion` (`backend/src/models/Assessment.ts`). Controlled items map to `short-answer` (answer key, then the model meaning check `evaluateShortAnswer` if the key misses). Free and transfer items map to `open-response` with one rubric criterion scored by `evaluateRubricAnswer` (eval-v2, `RUBRIC_SYSTEM`), checked by `validateProposal` and `agree`. Only the fields below are consumed by the grader. `acceptedAnswers` is **not** read by the assignment grader today (one `correctAnswer` only); it is read by the tutor's `evaluateAgainstKey`.

### 2.1 Exact / controlled (gap fill, choice, controlled gap fill, controlled choice, rewrite) — 0/1

`rewrite` = rewrite or reorder a given sentence (e.g. capitals-full-stops 3-4, word-order-svo 3-4); scored against the accepted sentences like a gap fill. Choice items are typed `multiple_choice`.

```json
{
  "id": "EN-F-A2-GR-third-person-s-A-1",
  "type": "short-answer",
  "text": "Write the correct form of the verb: My father ___ (drive) to work every day.",
  "correctAnswer": "drives",
  "points": 1,
  "explanation": "he/she/it + verb-s",
  "objectiveIds": ["EN-F-A2-GR-third-person-s"]
}
```

| Score | Rule |
|---|---|
| 1 | The answer equals an accepted answer after rule 2; for a choice item, the chosen option given as its letter **or** its text; for a gap, the whole sentence with the right word in the gap. |
| 0 | Wrong form, a different option, two options, blank. |

### 2.2 Error correction — 0/1

Same `short-answer` shape; `correctAnswer` is the corrected sentence.

| Score | Rule |
|---|---|
| 1 | The target error is corrected with the right target form. Other changes and slips outside the target form are ignored. |
| 0 | Target error left, corrected to another wrong form, or the sentence rewritten so the target form is avoided (rule 3). |

### 2.3 Free sentence, target form only — 0/1/2

```json
{
  "id": "EN-F-A2-GR-third-person-s-A-7",
  "type": "open-response",
  "text": "Write one sentence about what a friend does every morning.",
  "modelAnswer": "Ali drinks tea every morning.",
  "explanation": "he/she/it + verb-s/-es",
  "objectiveIds": ["EN-F-A2-GR-third-person-s"],
  "rubric": { "criteria": [ {
    "id": "target_form",
    "title": "Target form: he/she/it + verb-s/-es",
    "description": "Score ONLY the target form. Ignore every other error (spelling of other words, capitals, punctuation, articles, prepositions, extra pronouns). A sentence that avoids the form scores 0.",
    "maxPoints": 2,
    "levels": [
      { "id": "tf0", "label": "Missing or wrong", "points": 0, "description": "Target form absent, avoided, wrong (e.g. no -s, wrong be form, missing auxiliary, over-regularised past such as goed/buyed)." },
      { "id": "tf1", "label": "Minor slip", "points": 1, "description": "Target form attempted and recognisable with one small slip: spelling of the form (watchs, biger, writting, cann't), right in one place and wrong in another, or a wrong ending after a correct auxiliary (going to travels, boughted)." },
      { "id": "tf2", "label": "Correct", "points": 2, "description": "Target form used correctly at least once and nowhere wrong." }
    ]
  } ] }
}
```

The grader needs an exact quote for levels above 0 (`validateProposal`): the quote is the target form as written (e.g. `"drinks"`).

**Vocabulary variant (review round 1).** For vocabulary outcomes (`EN-F-*-VO-*`) the free/transfer 0/1/2 levels are: 2 = a word from the target field used with the right meaning in a sentence; 1 = the right word misspelt or in the wrong form; 0 = no target-field word, or the word used with the wrong meaning (e.g. "My grandfather is cheap."). `acceptedAnswers` on these items are example keywords; the list is open, not closed. Day and month names need a capital letter (lower case = 1).

**Mastery criterion (review round 1).** Every A1–A2 form outcome uses: *per delayed form, at least 80% of the available points (exact items 1 point, 0/1/2 items 2 points) and at least 3 of the 4 controlled items (1–4) correct.* This replaces "8 of 10 correct", which did not fit 9 items with mixed scoring.

### 2.4 Transfer — 0/1/2

Same `open-response` shape and the same `target_form` criterion, plus one condition: **the response must do the task in the new context** (right person, right situation). An answer that does not do the task ("Yes, single." for "Are you married or single? Answer with a full sentence") is 0. For items with two or three target slots (there is + there are; on + at + in), 2 = all right, 1 = at least half right, 0 = less. Transfer items whose bank `scoring` is `exact` are scored with this rubric too, so they are comparable; the key match is reported separately.

## 3. Scored examples (5 per type)

These examples are taken from other forms than the 100 validation answers where possible.

### Exact / controlled

| Item | Answer | Score | Why |
|---|---|---|---|
| third-person-s B-2 "He ___ (fix) the cars" | `Fixes.` | 1 | Case and full stop ignored. |
| copula-be A-3 "The soup ___ too hot" | `'s` | 1 | Contraction is an accepted answer. |
| can-ability A-1 "Fish ___ live without water" | `can not` | 1 | = cannot / can't (rule 2). |
| polite-requests A-4 choice (c) | `I would like two tickets, please.` | 1 | Option text instead of letter. |
| past-simple-irregular A-1 "I ___ (go)" | `goed` | 0 | Over-regularised (rule 4). |

### Error correction

| Item | Answer | Score | Why |
|---|---|---|---|
| third-person-s A-5 "My uncle work in a bank…" | `My uncle works in a bank in the city.` | 1 | Exact. |
| third-person-s A-5 | `my uncle works in a bank in the citty` | 1 | Off-target spelling/case ignored. |
| present-continuous A-6 "my father watch the match…" | `My father's watching the match at the moment.` | 1 | Contraction; dropped "Shh" is not the target. |
| third-person-s A-6 "She watchs…" | `She watchs the weather report every evening.` | 0 | Error left. |
| there-is-are A-5 "There is four bedrooms…" | `Our flat has four bedrooms.` | 0 | Target form avoided (rule 3). |

### Free sentence (target form only)

| Item | Answer | Score | Why |
|---|---|---|---|
| third-person-s C-7 teacher | `My teacher checks our homework every day.` | 2 | Correct. |
| third-person-s C-7 | `my teacher give us homeworks every day` | 0 | No -s; "homeworks" ignored. |
| copula-be A-8 older person | `My grandfather he is very old.` | 2 | Resumptive "he" ignored (Arabic-L1, off-target). |
| present-continuous A-7 | `My brother is siting on the sofa.` | 1 | Spelling slip in the -ing form. |
| some-any A-7 | `I haven't got some pens in my bag.` | 0 | some in a negative = wrong form. |

### Transfer

| Item | Answer | Score | Why |
|---|---|---|---|
| third-person-s A-9 "about Omar: I catch the bus" | `He catches the bus at seven.` | 2 | Accepted alternative. |
| third-person-s A-9 | `Omar catchs the bus at 7` | 1 | Spelling slip in -es. |
| there-is-are A-9 pool 1 / restaurants 2 | `There is one pool and there are 2 restaurant.` | 2 | Both slots right; "restaurant" ignored. |
| prepositions-time A-9 | `Art club is in Tuesday at 4 in October.` | 1 | Two of three right. |
| polite-requests A-9 hotel towel | `Give me one more towel.` | 0 | Task done but target form missing. |

## 4. B1–B2

*Placeholder. To be written when the B1–B2 item bank exists. Expected additions: longer free writing (multi-criterion rubric), discourse markers, tense contrast in context.*

## 5. C1

*Placeholder. To be written when the C1 item bank exists. Expected additions: register and cohesion criteria, essay rubrics with quote evidence.*

## 6. A1–A2 validation summary

From `research/assessment-validation/a1a2/REPORT.md` (method, per-answer results, failures). 100 synthetic Arabic-L1 answers (50 controlled, 40 free, 10 transfer). Reference = majority of three scoring passes by **one agent** (not independent raters; 2 split votes, no ties).

| Group | Deterministic (real grader code, offline) | AGENT STAND-IN — not the production grader | Target |
|---|---|---|---|
| Controlled, exact agreement | assignment key 58%; tutor `evaluateAgainstKey` 88% — **fail** | key + meaning check 94% — **fail (just)** | ≥95% |
| Free, QWK | no score (assignment) / 0.00 (tutor key) — **fail** | 0.984 | ≥0.8 |
| Transfer, QWK | 0.151 — **fail** | 1.000 | ≥0.8 |

Main grader failures: raw-string key (punctuation, contractions, `cannot`), single `correctAnswer`, multiple-choice with no letter/text equivalence or fallback, no target-form-only scoring, meaning check credits answers that avoid the target form, and note lines stored inside `acceptedAnswers` in 585/891 bank items. Stand-in figures are inflated (same agent wrote rubric, reference and stand-in) and say nothing about the production model.

Rubric clarification needed: when a correct auxiliary is followed by a wrong verb form (`I can swimming`), tf1 (slip) applies, not tf0 — the passes split on this.
