# Writer brief: Enara Kids listen-and-do lessons (Pre A1 Starters)

You write listen-and-do (LAD) lessons for Arabic-speaking children aged 6–8 who are starting English. A tutor avatar says the
story, gives the commands one at a time and says the chant with the child. Code picks the content; the avatar only speaks it.

## Hard rules (checked by `cd backend && npx tsx src/scripts/kidsLessonCheck.ts <your file>`; it must print OK)
- Every word in story, chant and commands is an official Pre A1 Starters word (`data/kids/prea1/WORDS.json`, its `forms`),
  a number one–twenty, a Starters name (`NAMES.json`), or a form of be/have/do/can (is, are, has, does, don't, can't...).
  Plurals and -ing/-ed of listed words are fine. "touch", "tap", "dance", "hop", "pig", "time(s)" are NOT Starters words.
- `words`: 4–8 lesson words, all Starters words, the lesson's focus.
- `story`: 4–6 lines, each at most 10 words. A tiny real story (someone does something, something happens, a happy end),
  with the Starters names (Alex, Anna, Ben, Grace, Kim, Lucy, Sam, Tom...). Present simple, can, have got, there is/are.
- `chant`: 4–8 lines, at most 10 words each, rhythmic, repetitive, uses the lesson words.
- `commands`: 5–8, each one single action, at most 8 words, starting with a Starters verb (Point to, Show me, Clap,
  Stand up, Sit down, Wave, Draw, Colour, Find, Count, Say, Look at, Listen, Jump, Smile, Open, Close, Put, Give).
  No "and"/"then" (one action only).
- `outcomeIds`: always "PREA1-04"; add the others that the lesson really practises (see OUTCOMES.json): stories -> PREA1-03,
  descriptions ("This is blue") -> PREA1-05, short questions/answers -> PREA1-02, naming people/things -> PREA1-08,
  spelling names/words -> PREA1-07, letters -> PREA1-06, short dialogues -> PREA1-09, copying words -> PREA1-10.
- `cards`: 4–8 picture-card ids "card:<starters-noun>" (multi-word nouns with "-": card:ice-cream).
- `id`: "lad-<nn>-<topic>" as given in your topic list. `topic`: one Starters word.

## Fit for the children and families
- Warm, concrete, everyday: family, school, home, animals, food, play. Kind characters, happy endings.
- Culturally right for families in the Gulf and Arab region: no pork or pigs, no alcohol, no romance, nothing scary
  (no monsters attacking, no getting lost or hurt), modest clothes, no magic or spells.
- Never say "wrong" or "bad"; no competition that shames a loser.

## Output
A JSON array of 5 lesson objects in the file you are given, exactly this shape:
{"id":"lad-01-hello","outcomeIds":["PREA1-04","PREA1-02"],"topic":"name","words":["hello","name","boy","girl"],
 "story":["..."],"chant":["..."],"commands":["..."],"cards":["card:boy","card:girl"]}
Run the checker until it prints OK. Do not edit any other file. Do not commit.
