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

## Lessons: passed review (19 Nov 2026)

- 20 listen-and-do lessons in `data/kids/prea1/LESSONS.json`: greetings, alphabet, numbers 1–10 and 11–20, colours, family, body, face, clothes, classroom, classroom instructions, toys, pets, zoo animals, fruit, food, home, garden, sport, transport. Each has 4–8 lesson words, a 4–6 line story with the Starters names, a chant, 5–8 one-action commands, and picture cards.
- Written by 4 Sonnet writers. Two Opus review rounds; the second round's 29 exact fixes were applied and 1 line shortened. Reviews are in `review/`.
  - Round 1: fix asked on all 20 (words never used, wrong outcome tags, commands a child can't do alone, English errors, a pet dog, looking at the sun, children on the street).
  - Round 2: 6 lessons ok and 14 small fixes (needing a real book or ball, colouring with no picture, shoes indoors in Gulf homes, "Draw your family" could upset a child who lost a parent).
- Code checks, all passing: Starters words only; line lengths; one action per command; picture cards are Starters nouns; every lesson word used, at least half of them in the story.
- Can-dos: 9 of 10 practised. PREA1-09 (short conversations) is tagged on lesson 1, whose story is a short spoken exchange; I added that tag, the reviewers didn't. PREA1-10 (copy words) needs the written word on screen, so it belongs to a Kids app task, not a spoken lesson.
- Agent runs used in step 3 so far: 4 writers, 4 reviewers, 2 fixers = 10.

## Next

4. Kids check: the step 2 LAD and KIDPPP groups re-run with kidsPack on vs off, plus age-fit judging. About 25–35 runs. Estimate confirmed before the start.
5. Kids app tap/drag picture cards: needs the Enara Kids frontend, which is not on a tutor branch. Ask before touching it.
