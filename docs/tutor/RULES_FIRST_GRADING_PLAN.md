# Rules-first grading of written answers — plan

_Plan only. Waiting for Mohamed's "go". lms-test only; no secrets asked for or printed._

**Goal:** grade short answers, explanations and essays (Arabic and English) with code rules wherever rules can decide, and send the model only what rules cannot. One final score, with each criterion showing who scored it (code or model) and why.

## 1. What exists today

### Arabic correction engine — **not found**
I searched both repos (`lmsint`, `enara-staging-alpha`) and the EnaraAI organisation. There is **no Arabic spelling or grammar correction engine**. What exists:

| Piece | Where | What it does |
|---|---|---|
| Arabic normaliser | `backend/src/assessment/text/ar.ts` | Strips diacritics (tashkeel) and tatweel; أ/إ/آ → ا; ى → ي; optional ة → ه; hamza-seat folding; Arabic-Indic digits and the Arabic decimal mark; script detection (Arabic, Latin or mixed); edit distance. |
| Spelling-difference note | `services/deepseekTutor.ts` (`dsAnswerCheck`) | When an answer matches the key only after folding, it says "only the spelling of a hamza, taa marbuta or alef differs". This works only against a known answer, not on free text. |
| English answer-key rules | `services/graderV2.ts` (switch `graderV2`, default off) | Normalised matching (case, punctuation, contractions), several accepted answers, option letter = option text, and a 0/1/2 target-form scorer for grammar items. English only. |
| Closed graders | `assessment/grading-engine/graders/closed/*` | Every fixed-answer type, numbers with units and Arabic digits, and the maths final answer. In use (assessTypesV1). |

**Not checked anywhere in code today:** Arabic grammar (agreement, case endings), dialect vs MSA, Arabic or English spelling in free text (there is no dictionary in the repo). The only check on these is the model, through the prompt ("colloquial counts as a grammar error").

> **I need from you:** if "our Arabic correction engine" exists outside these repos (another repo, a service, a vendor), tell me where. Otherwise the plan below builds a small, precise rule set (§2.2) and asks for word lists (§5).

### Where written answers are graded now
| Path | Questions | Grader | Rubric / flags |
|---|---|---|---|
| **Engine** (P2–P3) | Language short answer / essay (ar, en; spoken flag), maths steps, science, humanities, listening | `grading-engine/open.ts` → domain graders. Two model runs; maths final answer by code. | Fixed bilingual rubrics: language task_completion, grammar_accuracy, vocabulary_range, organisation, mechanics; science points + reasoning + terminology + units; humanities/listening points + accuracy_vs_source + structure. Flags: confidence < 0.7, runs differ by more than 1 point on a criterion, run failed, integrity, within 1 point of the pass mark. |
| **Older eval-v2** | Older "open-response" questions (teacher rubric), older short answers | `gradingProposals.ts` (`evaluateRubricAnswer`, `evaluateShortAnswer`). Two or three runs. | The teacher's rubric; validation requires exact quotes as evidence. |
| **Speaking** | Speaking exams (old open-response, or engine spoken questions) | As above, on the transcript | Pronunciation is never scored. |

### Written-answer benchmarks
| Set | Size | Languages | Reference scores |
|---|---|---|---|
| `data/assessment-bench` (P2b–P3b) | 720 written answers: language, science, humanities and listening (90 each per language), plus 180 maths steps | ar + en | Written with the data (provisional). Last run: within 1 point 0.89–0.99 (DeepSeek, engine-v2). |
| `test/fixtures/grading-benchmark.json` | 28 open responses + 10 short answers | ar + en | Provisional (engineering). |
| **LAILA** harness (`services/candidateV2/*`) | Real Arabic essays **scored by people** on 7 traits (relevance, organisation, vocabulary, style, development, mechanics, grammar) | ar | Human scores. **The essays are not in the repo**; earlier runs read them on a trusted computer. |

## 2. Design: rules first, model last

### 2.1 Layer 1: code (deterministic findings and scores)
Every finding carries `{criterion, value, evidence (the exact words), rule id}`. A criterion is **scored by code only when the rule is certain**; otherwise the finding is passed on to the model.

| Check | Arabic | English | Scores which criterion |
|---|---|---|---|
| Normalise (letters, diacritics, digits, spaces, punctuation) | `ar.ts` | `graderV2` normaliser | — (input to the other checks) |
| Blank, too short (fewer than N words), wrong language or script, copied stem | ✓ | ✓ | All criteria → 0, with no model call |
| Exact or near match to the model answer (after folding; edit distance ≤ 1 per word) | ✓ | ✓ | task_completion / points → full; the rest still goes to the model |
| Required points: a key phrase present (folded, with the item's synonyms) | ✓ | ✓ | point_N = 1 **only when certain** (phrase found inside one sentence). A miss is never 0 by code, it goes to the model, because paraphrases exist. |
| Numbers and units (numeric grader) | ✓ | ✓ | science `units`; maths final answer (already code) |
| Length and structure: sentence count against the task ("in two sentences", "4–8 sentences"), paragraphs, linking words | ✓ | ✓ | task_completion cap (e.g. "asked 4–8 sentences, wrote 2" → at most the middle level); linking-word count is a finding for organisation |
| Spelling | Rules: hamza on a known word list, taa marbuta / ha, alef maqsura / ya, doubled letters (**needs an Arabic word list**, §5) | Dictionary check (**needs an English word list**, §5) | `mechanics`: errors per 100 words → level (thresholds calibrated on the benchmark); skipped for spoken answers |
| Dialect vs MSA | A high-precision Egyptian colloquial list (بحب، عشان، مش، ده، دي، إزاي، ليه، فين، هنـ…) | — | A finding for grammar_accuracy ("colloquial in 3 of 5 sentences"); the model scores the criterion |
| Error codes | spelling, hamza_spelling, definiteness (a few safe rules), connectors (a missing linker) | spelling, capitalisation, punctuation | Feed "errors to work on" (after release, as today) |

### 2.2 Layer 2: model (only what code cannot judge)
- The model scores only the criteria code left open: meaning, reasoning, organisation, vocabulary range, grammar beyond the rules, and points that code did not confirm.
- Its prompt includes the code findings ("Code scored mechanics = 1: 3 spelling errors: …; units = 1; point_2 found: '…'") with an instruction never to contradict them, and the reply check refuses any score for a code-scored criterion.
- **No model call at all** when code decides every criterion: a blank or off-topic answer, an exact model-answer match on a short answer that has only points and structure, or a numeric-only answer.
- Two runs, confidence and teacher flags stay as today. The flags apply to the model's share; code scores count as confidence 1.

### 2.3 One result
`criteria: [{code, points, max, scoredBy: 'code' | 'model', rule?, reason}]`. The grading view shows "scored by code: 3 spelling errors (…)" or "scored by the model". A teacher override works the same for both. A `rulesFirst` switch, default off; on for lms-test only after it passes the bar.

## 3. What goes first
1. **Science, listening and humanities short answers.** These have the most code-scorable criteria (points, units, structure). Coverage is likely highest, and the risk lowest.
2. **English language short answers.** Mechanics by dictionary, task completion by length and target form (graderV2), blanks.
3. **Arabic language short answers.** Needs the Arabic word list and the dialect list.
4. **Essays, both languages.** Code takes mechanics, length and structure findings; the model keeps the rest. This gives the smallest saving per answer but the largest volume.
5. **Older eval-v2 open-response questions:** only blank / too-short / exact-match shortcuts (they have no fixed rubric to map criteria to).

## 4. Measure (before any switch goes on)
On the 720 written benchmark answers, plus LAILA if available (§5), compare rules-first with today's engine-v2:

| Metric | Target |
|---|---|
| Within 1 point of the reference (per set, per language) | ≥ 0.85 and no lower than the baseline − 0.03 |
| Code-scored criteria (share of all criterion scores) | reported; expected 25–40% (to be measured) |
| Answers with no model call | reported; expected 10–25% |
| Model calls saved, cost saved (from the call records), median and p95 time | reported |
| Code-vs-reference agreement on code-scored criteria alone | ≥ 0.95 exact (code must be near-perfect where it decides) |
| LAILA mechanics and grammar (real human scores) | code mechanics within 1 point ≥ 0.85, as a check that the rules are not just tuned to our own data |

Unit tests for every rule (true positives and false-positive guards: paraphrases, synonyms, dialect words inside quotes, names). E2E: one Arabic and one English answer through the full flow, with each criterion showing its "scored by".

## 5. Risks and what I need
- **Paraphrase false negatives.** Code never gives 0 on a point; misses go to the model.
- **Keyword stuffing.** A point counts only inside a sentence, and the model sees the findings and the whole answer; the integrity flag stays.
- **Tuning to our own provisional reference scores.** Thresholds are set on half the benchmark and checked on the other half, and checked on LAILA's human scores where possible.
- **Word lists:**
  - English and Arabic spelling need dictionaries with licences that allow use in a product (for example Hunspell dictionaries; the Arabic ones are often GPL). **I need your OK on which list and licence** before adding one.
  - Without them, the mechanics criterion stays with the model and coverage drops.
- **LAILA data:** to use the human-scored essays I need them where the benchmark runs: on lms-test, or on a trusted computer as before. Tell me where they are; I won't ask for any key.
- **The Arabic correction engine:** if one exists elsewhere, I'd use it instead of building rules.

**Decisions needed:**
1. Where the Arabic correction engine is, or OK to build the small rule set.
2. Which word lists and licences.
3. LAILA access.
4. "Go".
