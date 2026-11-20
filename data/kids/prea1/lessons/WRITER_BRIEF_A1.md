# Writer brief, part 2: 9 listen-and-do lessons for A1 course objectives

Follow `WRITER_BRIEF.md` in this folder (all hard rules and the culture rules), with these differences:

- **Write exactly 9 lessons**, one for each objective in `data/kids/prea1/A1_LINK.json` that has an `"id"` (not a `"lesson"`).
  - Use the given `id`.
  - `topic` = the word after the number in the id (for example "days").
  - `outcomeIds` = "PREA1-04", plus the A1 objective id (for example "EN-F-A1-VO-days-months"), plus any other PREA1 ids that really fit.
- **The lesson must practise the objective's `focus`**, so a child hears and says the right form many times:
  - the story uses it in most lines;
  - the chant repeats it;
  - most commands make the child say or show it (for example "Say an apple.", "Point to the red ball.", "Say she can swim.").
  - Model only the right form. Never say the wrong form.
- **Words:** Starters words, as before, plus only that objective's `extraWords` (days, months, o'clock, hour...). `words`: 4–8 of the lesson's focus words.
- **Children aged 6–8, beginners.** The capitals lesson is spoken: the child shows a big letter, claps for a full stop, and says names. Keep it simple and playful.
- **Output:** a JSON array of 9 lessons in `data/kids/prea1/lessons/a1link.json`.
  - Check: `cd /home/user/kidspack/backend && npx tsx src/scripts/kidsLessonCheck.ts ../data/kids/prea1/lessons/a1link.json` must print OK.
  - Do not edit any other file. Do not commit.
