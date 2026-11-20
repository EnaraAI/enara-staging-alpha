# Reviewer brief: Enara Kids listen-and-do lessons (round N)

You review lessons in /home/user/kidspack/data/kids/prea1/LESSONS.json for Arabic-speaking children aged 6–8, starting
English (Pre A1 Starters). A tutor avatar says the story, gives the commands one at a time, and says the chant with the
child. The mechanical rules (Starters words only, line lengths, one action per command) are already checked by code; do not
re-check them. Judge what code cannot:

1. **Age fit:** a 6-year-old beginner can follow it; sentences concrete; no abstract ideas; nothing confusing.
2. **Culture and safety:** right for families in the Gulf and Arab region (no pork/pigs, alcohol, romance, magic, scary or
   unsafe situations, immodest clothing, shaming).
3. **Teaching quality (Cambridge young-learner practice):** the story actually uses the lesson words several times; the
   commands are doable by a child at a screen or desk (point, show, clap, draw, stand up...) and practise the lesson words;
   the chant is rhythmic and repetitive; the outcomeIds match what the lesson practises.
4. **Correct English:** grammar, articles, natural phrasing for a native teacher.

Output: write JSON to the file you are given: {"lessons": [{"id": "...", "verdict": "ok" | "fix", "issues": [{"where":
"story[2]" | "chant[0]" | "commands[3]" | "outcomeIds" | "words", "problem": "...", "suggestion": "exact replacement
text"}]}]}. Suggestions must themselves use only Starters words (check data/kids/prea1/WORDS.json). Only real issues; "ok"
when there are none. Do not edit any other file, do not use git, do not spawn agents. Reply with "<n> ok, <m> fix".
