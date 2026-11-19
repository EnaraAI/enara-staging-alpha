# Kids pack (step 3): status and plan

19 Nov 2026. Branch `claude/tutor-kids-pack` (from `claude/tutor-planner2`). Switch `kidsPack` (needs `planner2`), off by default.

## Built (code + tests, 0 agent runs)

- **Child reply length fixed** (kidsPack on): A1 30–50 words instead of 45–70; Pre-A1 20–35. Off: unchanged.
- **Listen-and-do content by stage:** code picks the content for each stage; the model only says it. Listen = the lesson's story; Do = one command at a time; Chant; Check. Every reply: at most 3 short sentences, one action, praise effort.
- **Lesson check:** every story, chant and command word must be a Starters word or a lesson word. Lines ≤ 10 words, commands ≤ 8 words with one action, stories 4–6 lines, chants 4–8.
- **Importer:** `scripts/kids/import_starters.py` builds `data/kids/prea1/WORDS.json` and `OUTCOMES.json` from the official Cambridge PDFs.

## Official Cambridge data: imported (19 Nov 2026, from the PDFs uploaded in chat)

- `data/kids/prea1/WORDS.json`: 495 entries from the Pre A1 Starters A–Z Word List (2018 picture book, pp. 25–29). Each entry has its word types, forms (child/children), UK/US notes and uses (in: of place + time). Cross-checked against the column layout: 0 missing.
- `OUTCOMES.json`: the 10 Pre A1 Starters can-do statements, word for word, with the poster's examples. The poster has no skill headings, so the skill labels are ENARA's own grouping (marked as such).
- `NUMBERS.json` (1–20) and `NAMES.json` (22 names), from the "Letters & numbers" and "Names" pages.
- The PDFs themselves are not committed.

## Next

2. About 20 listen-and-do lessons (story, chant, commands, picture-card ids) across the Starters topics. Write with Sonnet, about 4 runs. Every lesson must pass the lesson check.
3. Two review rounds by Opus, about 4 runs (age fit, Starters fit, no frightening or adult content).
4. Kids check: the step 2 LAD and KIDPPP groups re-run with kidsPack on vs off, plus age-fit judging. About 25–35 runs. Estimate confirmed before the start.
5. Kids app tap/drag picture cards: needs the Enara Kids frontend, which is not on a tutor branch. Ask before touching it.
