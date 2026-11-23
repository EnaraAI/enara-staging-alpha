# Mishkat: training data from substitute marking, then two-stage training — plan

_23 Nov 2026. **Plan only: waiting for Mohamed's "go".** lms-test only; no secrets asked for or printed. Everything built here is labelled **model-marked**: it is for development only, never for claims, and never for a real school._

## Why
The trained scorers fail on ENARA answers (evaluation 4.4, Arabic: 3–53% same score, about 1 point too low). They learned from long essays by grades 10–12, so they read "short" as "weak". They need training data that looks like ours. No teachers are available yet, so a controlled substitute stands in until they are.

## 1. Substitute marking (model-marked data)

### 1.1 The 500 answers per language
| Source | Per language | Notes |
|---|---|---|
| ENARA benchmark, written answers (language, science, humanities, listening) | 360 | Already in the repo; synthetic learner answers. Maths steps are left out (no prose). |
| New answers | 140 | Written to fill the gaps in a fixed grid (below), with a different prompt and no rubric in view. Mostly **longer essays (100–250 words)**: today only 0–6 answers per set are that long, and length robustness needs them. |

**The spread grid**, filled evenly where possible and reported in the end:
- **Age band:** English A1–A2 / B1 / B2; Arabic grades 4–5 / 6–7 / 8–9.
- **Subject:** language, science, humanities, listening.
- **Question type:** short answer or essay.
- **Length:** under 15 words, 15–40, 40–100, 100–250.
- **Quality band:** weak, mid or strong.

New questions use our existing item style. In Arabic, weak answers may slip into colloquial.

**What is marked:** ENARA's language rubric on the human markers' scale (**v3b, live since today**).
- Essays: task completion, grammar, vocabulary, organisation, spelling/punctuation (0–2 each).
- Short answers: task completion (0–2), grammar (0–1), spelling/punctuation (0–1).
- For science, humanities and listening, "task completion" means "answers the question asked". Their content points stay with their own graders; Mishkat scores the language of the answer.

### 1.2 Three independent markers
| Marker | How | Sees |
|---|---|---|
| (a) DeepSeek | Our endpoint on lms-test, through the same relay as today's measurements. One call per answer, no fallback, nothing stored. | The question, the answer, and the v3b rubric and instructions. |
| (b) Sonnet | A Claude Code subagent on Sonnet, in batches of 25. | The question, the answer, and the rubric text only. |
| (c) Opus | A Claude Code subagent on Opus, in batches of 25. | The same as Sonnet. |

**Independence:**
- Each marker gets only its own batch files, in its own folder.
- The other markers' scores are fetched or written only after all three have finished that batch.
- Each marker is told in its brief never to open other folders.

**Resume after usage-limit stops:**
- Every batch writes one result file. A batch is done only when its file is valid: every answer, the exact criteria, integers within the maxima.
- A restart skips done batches.

This uses Claude Code session usage (subscription), **not Anthropic API credits**.

### 1.3 Agreement rule
- An answer is **kept** only when, on every criterion, at least 2 of the 3 markers are within 1 point of each other. Its label is the **median** of the 3 marks.
- Everything else is **dropped**. Nothing is re-marked to force agreement.
- **Reported:** the keep rate per language, type and band; pairwise agreement (exact and within 1) per criterion for DeepSeek–Sonnet, DeepSeek–Opus and Sonnet–Opus; and what was dropped, by band and length.
- **Stop sign:** if fewer than 60% of answers are kept, I stop and report before training.

### 1.4 Your review sheet (100 answers)
- 50 per language, stratified by band, type and length, plus every answer where the markers spread widest among those kept.
- The sheet is an .xlsx like the teacher sheet. Each row shows the question, the answer, the three marks, the median, and an empty "Your mark" column per criterion.
- **Your corrections win:** the import script writes your mark as the label (`source: "owner"`) and records the change.
- Training waits for your sheet only if you ask. Otherwise I train with the corrections you have sent by then and retrain once the rest arrive.

### 1.5 Where and how it is labelled
- **Location:** `data/mishkat-dev/` in the lms repo. The answers are synthetic; no LAILA or ELLIPSE text ever goes in.
- **Every record** carries `source: "model-marked"`, its 3 raw marks and the median.
- **The README and the reports** say "model-marked: development only, not for claims, not for a real school". Any number from this data in any report carries the same label.

## 2. Two-stage training
- **Two separate models,** one for essays and one for short answers, for each language.
- **Stage 1 (pre-train):** LAILA and ELLIPSE, as today, are downloaded at run time and never stored. It learns the traits on the markers' scale.
- **Stage 2 (fine-tune):** the kept ENARA answers. The stage-1 scorer heads keep training on ENARA data with a small learning rate. On the CPU this is a small head on a frozen encoder, run on GitHub runners with the thread fix (no GPU needed). Full encoder fine-tuning (GPU, e.g. Modal) only if stage 2 falls short, and after your go.

**Length-robust features:** no raw length (characters, words, sentences).
- Rates per 100 words: spelling errors (SCOWL en_US / Ayaspell, via rules-first part 2), linking words, colloquial words (Arabic), punctuation.
- Means: words per sentence and word length.
- A moving-window word-variety measure (MATTR) instead of raw type/token ratio.
- Encoder embeddings averaged over the answer (mean pooling is already length-normalised).

**Length tests** (unit tests that must pass before evaluation):
1. **Short and correct:** 40 short answers that are correct and clean (labelled 2/1/1). The model must give grammar and spelling 1 to at least 90% of them.
2. **Truncation:** cut strong essays to their first 2–3 sentences. Grammar and spelling may not fall by more than 0.3 on average, while organisation and vocabulary may.
3. **Padding:** appending neutral correct sentences must not raise grammar or spelling.

## 3. Evaluation
- **Split by question, not by answer:** 20% of the questions per language and type are held out, with all their answers. They are never trained on.
- **Reported per criterion,** next to v3b on the same answers: same score, within 1 and QWK.
- **Bar before any switch:** within 1 ≥ 0.85 **and** QWK ≥ v3b on that criterion. A criterion that misses the bar stays with v3b.
- **Self-agreement guard:** v3b is DeepSeek, and DeepSeek is one of the three markers, which favours v3b. So every number is also shown against the Sonnet–Opus median alone, without DeepSeek.
- **Also re-checked:** the 200 human-scored essays per language from today, so stage 2 has not destroyed what stage 1 learned.
- **The open item:** English grammar ranking. This is where Mishkat is expected to help.
- **Every number is labelled model-marked** until teacher marks exist.

## 4. Ready for real teachers
- **The same sheet:** today's teacher marking sheet (`docs/tutor/teacher-marking/`) is the format. The model-marked review sheet uses it too.
- **Import script:** reads a returned sheet and writes labels with `source: "teacher"` (and teacher id, date).
  - Teacher labels **replace** model labels for the same answers.
  - New answers come in as teacher-only.
  - It checks criteria, maxima and duplicates.
- **From the first real school:**
  - Anonymised answers only: no names, ids or class data in the training files.
  - They stay in ENARA's own storage, not in the repo.
  - This needs a short data-handling note and your go before any school data is used.
- **Monthly retrain:** a scheduled workflow runs both stages, the length tests and the same evaluation report, and posts the numbers. The switch stays off; a criterion moves only after the bar and your go.

## Cost and time
| Item | Estimate |
|---|---|
| DeepSeek, marker (a) | 1,000 calls (500 per language × 1) |
| DeepSeek, 280 new answers | about 30 calls (10 answers per call) |
| **DeepSeek total** | **about $2–5, upper bound.** From our own call records (today's benchmark runs: about $0.0013–0.003 per call, on your Modal endpoint), plus 50% for retries. |
| Sonnet and Opus markers | Claude Code usage only (40 batches each). A few hours of wall time, longer if the usage limit stops a batch, which then resumes. |
| Training (CPU, GitHub) | About 30–60 min per language per run |
| Anthropic API credits | **none** |

**Total wall time:**
- Data and marking: about half a day to a day.
- Your review: whenever you are ready.
- Training and evaluation: about half a day.

## Decisions I took, which you can change
1. **New answers are written by DeepSeek** with a separate prompt, no rubric in view. It is also a marker. The alternative is a Sonnet writer, but Sonnet is also a marker, so the self-bias is the same either way. The report separates "new" from "benchmark" answers.
2. **Non-language subjects are marked on the language rubric only.** Their content points stay with their own graders.
3. **Marking through subagents departs from the standing rule** ("simulations and judging run through the Anthropic API"). It follows your instruction for this task only; that rule stays for everything else.
4. **LAILA is used in stage 1** (non-commercial licence; the authors' written OK is pending). The trained Mishkat must not reach a real school before that OK, on top of the "model-marked" limits.

**Needs your "go".**
