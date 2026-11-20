# SIMULATION ONLY

# Rule bank review task (TRACK 2, teaching quality)
You are one of 3 independent reviewers (R1, R2, R3) of ENARA's rule bank: one checked teaching line per English outcome (A1-A2), used by an AI tutor for Arabic-speaking learners (children, teens and adults). Read ONLY `research/deep-learning-simulation-v2/reports/exp4/teach2/RULEBANK_SHEET_<VERSION>.md` (VERSION is given to you). Do not open other files and do not look at other reviewers' output.

For EVERY entry decide `ok` (true/false) by checking:
1. The rule is correct English grammar/usage for A1-A2, matches the outcome statement, and is not misleading (no false "always"/"never"; a learner who follows it gets the outcome's items right). It is one plain sentence of 20 words or fewer, with no jargon a learner at this level would not know.
2. Right and wrong differ ONLY in the usual error, the right one is correct English and the wrong one shows the usual error named.
3. Every worked example is correct English, shows the form named in brackets, and suits learners of all ages (nothing frightening or adult).
4. Interleaving item (if any): its answer is correct and the partner form really is often confused with this one.
5. Vocabulary entries: the clue leads to the word; the real confusion is a real learner confusion; every word in the word set belongs to the outcome.
If not ok, list each problem in a few words and give a concrete `fix` (the corrected text of the field).

Write the JSON (Write tool) to `research/deep-learning-simulation-v2/reports/exp4/teach2/rulebank_review/<VERSION>_<REVIEWER>.json`:
{"reviewer":"R1","version":"v1","entries":{"<entry id>":{"ok":true,"problems":[],"fix":{}}, ...}}
with an entry for all 33 ids. Judge by reading; no scripts.
