# Plan: copy the English curriculum from test.enara.app and draw its pictures (21 Nov 2026)

Tutor track. Only **reading** test.enara.app's database, with a read-only user; nothing there is written. Content only, no personal data. lms-test gets the copy.

## What I found
- A safe copy tool already exists (`docs/lms/CONTENT_COPY.md`, approved 17 Nov, paused while the site is frozen).
  - It exports content only: courses, lessons, practice items, quizzes and learning objectives.
  - It removes schools, authors, student and group links, and file links.
  - It holds back any record that contains a real name, an email or a phone number.
  - It can only import into the lms-test database.
- This session can't reach test.enara.app or its database (the network blocks it), so the export has to run on your computer.

## Steps
1. **Small PR:** add `--only-language English` to the export, so only the English courses (and their lessons, quizzes and objectives) are copied.
2. **You, on your computer, about 10 minutes:**
   - Create a read-only database user in Atlas.
   - Run the dry run and send me the printed report (counts only).
   - Run the export.
   - Import into lms-test, dry run first and then apply.
   - Delete the read-only user.
   - Attach `content-export.json` here (content only), so I can read the words.
3. **Pictures:**
   - From the English lessons, quizzes and practice items, I list the concrete words: nouns, verbs and adjectives.
   - I leave out words that already have one of the 292 pictures.
   - The same pipeline as before: an agent draws each word in the same style, a judge names it without seeing the word, and failed pictures are redrawn, at most 3 tries.
4. **Ship:**
   - A small PR adds the passed pictures to the kids picture set (behind `kidsAudioVisual`).
   - The kids' tutor can then show them in lessons from that curriculum.
   - E2E must pass, then it's live on lms-test.
5. **Results to you:**
   - one Markdown sheet with every new picture and its word;
   - counts (words found, drawn, passed, text-only);
   - one line per deploy.

## Please confirm
- "Kids' profiles" means: the pictures show in the kids app (the tutor's picture choices) for that curriculum's words. Is that right?
- Which course or courses: all English courses, or one level (for example Starters / A1)?
