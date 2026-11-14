# Fixture v2 (`ltb-fixture-v2`): information-parity report

**Purpose:** repair the measurement defect found by the diagnostic. In v1.0, **54/120** cases scripted learner answers to an exercise the tutor never received (0/54 tutors presented it), while the judge and the independent reviewer **were** shown that exercise.

**This is measurement remediation only:**
- **no benchmark was run;**
- **no paid AI call was made;**
- **v1.0 is unchanged** (source SHA-256 `725edb2b…a2bb`, verified before and after).

## 1. What v2 changes

| | v1.0 (as run) | v2 |
|---|---|---|
| Tutor receives the case exercise | No (`languageSpec` had no item field) | Yes: `languageSpec.items` = `ex1` (exercise) and `ex2` (next item), **id and prompt only** in the model prompt |
| Answer keys | In the case file; used by the deterministic checker | Server-side only: `acceptedAnswers` and `targetForms` on the item, never in the prompt, never in evaluator views, never in student API responses (tested) |
| Learner turns | Fixed strings, no declared target | Every turn declares its target: `lesson_item:<id>`, `tutor_task`, `request` or `own_sentence` |
| Judge and reviewer evidence | Full `lesson` object, including exercise and nextItem | `evaluatorView`: exactly the tutor-visible lesson, plus the case's evaluation guidance |
| Case ids | `LTB-…` | Unchanged; every record carries `v1Id` and `v1Sha256` of its v1.0 source line |

**Builder:** `backend/benchmarks/ltc-v2/build_fixture_v2.mjs`. **Validator:** `backend/benchmarks/ltc-v2/validate_parity.mjs`. **Dry-run harness:** `backend/benchmarks/ltc-v2/run_fixture_v2.ts`.

## 2. Fixture integrity

| Check | Result |
|---|---|
| v1.0 source SHA-256 (before and after) | `725edb2bcabeb316a388b702b2baba6dc35ed178c80f8de7727c9768c356a2bb`, unchanged |
| Fixture v2 SHA-256 | `e72d2a6d3c083240efc0513055c1670a2dea5f12c5e17d3a832746a86713c0c2` |
| Cases / turns | 120 / 219 (same as v1.0) |
| All 120 v1.0 ids accounted for, one-to-one | Yes (`fixture_v2/fixture_v2_mapping.json`) |
| Cases with lesson items delivered | 111 (the 9 T10 no-lesson cases have none, by design) |
| Revised learner text | 9 cases, all T03 (`fixture_v2/fixture_v2_changelog.json`) |
| Turn targets | 120 request, 72 lesson item (`ex1` ×54, `ex2` ×18), 18 tutor task, 9 own sentence |

### Case revisions (T03 only)

| Level | v1.0 learner turn 2 | v2 learner turn 2 | Why |
|---|---|---|---|
| A1 | "Is my brother mother." | "This is my brother. Mother is twelve." | v1.0 did not answer the exercise; v2 keeps the meaning-blocking brother/mother confusion as an attempt at `ex1` |
| A2 | "Yesterday she go school and every day she went to bed late." | "Yesterday she go to bed and every day she went to bed at ten." | Keeps the time-marker/tense confusion, built on `ex1` |
| B1 | "I have visited my aunt last year and I never have seen her since now yesterday." | "I have visited my aunt in Aswan last year and I never have seen her since now yesterday." | Adds "in Aswan" so it is an attempt at `ex1`; the errors are unchanged |

**Comparability:**
- **T03:** partially comparable to v1.0 (same situation and error class, different sentence).
- **All other types:** the scripted text is unchanged, but the tutor now has the item. This is a **different measurement**, so v2 results must not be compared headline-to-headline with v1.0.

**Accepted answers:** each item accepts the case answer and the key alone. For a single-gap "Complete:" item it also accepts the whole completed sentence (e.g. "This is my brother. He is twelve"). This was found necessary by the dry run (§4) and recorded in the builder.

## 3. Static parity validation

The validator compares, per case:
1. tutor-visible lesson and items;
2. learner-script targets;
3. judge-visible evidence;
4. reviewer-visible evidence.

It fails on:
- a missing tutor exercise or a learner answer targeting an unseen exercise;
- evaluator-only target information (extra lesson fields, extra items, answer keys);
- answer keys in the tutor view;
- inconsistent or malformed exercise ids;
- an evaluator lesson that differs from the tutor's;
- missing or malformed targets;
- missing provenance.

| Fixture | Cases passing | Cases failing | Issues |
|---|---:|---:|---|
| **v2** | **120** | **0** | none (`fixture_v2/parity_report_v2.json`) |
| v1.0, as actually run (for comparison) | 9 | 111 | 666 × evaluator-only target information (exercise/nextItem/answers shown to judge and reviewer); 81 turns in **54 cases** answering an unseen exercise (`fixture_v2/parity_report_v1_baseline.json`) |

The validator independently reproduces the diagnostic's 54 unseen-exercise cases. The 9 v1.0 cases that pass are the T10 no-lesson cases.

**Negative tests:** 11 crafted defect types each make the validator fail (`backend/test/benchmarkFixtureV2.test.ts`).

## 4. Runtime parity: zero-cost dry run through the real tutor route

`run_fixture_v2.ts --mode dry` sends all 120 cases through `POST /api/me/tutor/sessions/:id/messages`, with:
- the real controller and engine;
- an in-memory throwaway database;
- trusted age bands set through the product API, as in v1.0.

**The provider call is intercepted at the fetch layer, so no paid call is made.** A scripted stand-in tutor follows the engine's own instructions: it presents the item the engine says to present, and confirms only when the engine reports an answer-key match.

| Runtime check | Result |
|---|---|
| Turns / HTTP 200 | 219 / 219 |
| Provider attempts / cost / blocked outbound | 219 intercepted / $0.00 / 0 |
| Identifier leaks in provider payloads | 0 |
| Exercise requests that made the engine present `ex1` | 54 / 54 |
| Lesson-item turns where the tutor's **actual system prompt** contained the answered item | **72 / 72** |
| Lesson-item answers routed by the engine to the matching active item | 72 / 72 (`ex1` 54, `ex2` 18) |
| Accepted answers present in any system prompt | 0 |
| Hidden assessment markers visible in any reply | 0 (marker status `ok` 219/219) |

A first dry run found 6 A1 cases (T07/T08) where "This is my brother. He is twelve." was not in the accepted answers. The engine therefore kept the item open, and the learner's `ex2` answer was routed to `ex1`. Adding the completed-sentence form fixed all 6, and the run above is the re-run.

**What the dry run proves:** the plumbing. Items reach the tutor, scripted answers target what the tutor received, the engine tracks the right item, and no answers or markers leak.

**What it does not prove:** that the real model presents items verbatim or judges answers correctly. A paid run, not authorised in this task, would answer that. When one is run, its v2 deterministic check should treat a case as **INVALID** (rubric v2 §2) when `lesson_item_not_presented` is flagged or `tutorSawTarget` is false.

## 5. Files

```
fixture_v2/fixture_v2_cases.jsonl        120 records (lessonDelivered, tutorView, learnerScript, evaluatorView, changeLog)
fixture_v2/fixture_v2_manifest.json      hashes, counts, revisions
fixture_v2/fixture_v2_mapping.json       v2 id -> v1 id + v1 line hash
fixture_v2/fixture_v2_changelog.json     per-case changes with original intention and comparability
fixture_v2/parity_report_v2.json         machine-readable parity report (v2)
fixture_v2/parity_report_v1_baseline.json  same validator on v1.0 as run
fixture_v2/dry_run/                      dry-run results, attempts, config, status
```
