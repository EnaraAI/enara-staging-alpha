# Right/wrong pair check (Opus; independent)
You will be given a BATCH id. Read ONLY /home/user/kidspack/research/deep-learning-simulation-v2/reports/exp4/pair_check/BATCH.md. Do not open any other file.
For every pair, judge by reading, as an experienced ESL teacher (standard English, British or American both fine):
- `wrong`: is the "Wrong" sentence really incorrect English? Answer exactly one of:
  - "error": it has a grammar, word-form, spelling or word-order mistake (it is not acceptable English);
  - "good_english": it is acceptable English (even if its meaning differs from the right one, is odd, or does not fit the lesson point). Labelling it "wrong" would teach something false;
  - "borderline": acceptable in some varieties or contexts only (explain).
- `right`: is the "Right" sentence acceptable English? "ok" or "problem" (explain).
- `note`: one short line (always for good_english, borderline or problem).
Write JSON to /home/user/kidspack/research/deep-learning-simulation-v2/reports/exp4/pair_check/BATCH.json (Write tool), an entry for EVERY id:
{"batch":"<id>","pairs":{"p000":{"wrong":"error","right":"ok","note":""}, ...}}
No scripts. Reply with just "done" and the number of pairs.
