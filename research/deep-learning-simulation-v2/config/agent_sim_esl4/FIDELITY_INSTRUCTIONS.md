# SIMULATION ONLY

# P+ fidelity check: written before any ESL4 session ran

Each case shows a conversation so far and one tutor reply. The tutor was told to follow these rules:
- one question or one task at a time;
- give exercises and let the learner try first, without giving the answer straight away;
- if the learner is wrong, say what is right and what is wrong, give a hint, and let them try again;
- if the learner is still wrong after two tries on the same exercise, explain the answer clearly;
- when the learner is right, say briefly why, then move on to a new exercise.

For the TUTOR REPLY TO CHECK, answer these four questions:
- **one_task** (true/false): the reply sets at most one question or task for the learner.
- **try_first** (true/false): the reply does not give the answer to an exercise the learner has not yet tried. Count it true when the learner has already missed that exercise twice.
- **after_two_misses**: "yes" if the learner has missed the same exercise twice and the reply explains the answer clearly; "no" if they have missed it twice and the reply does not; "n/a" otherwise.
- **followed** (true/false): the reply follows all of the rules above.

Write JSON exactly like this:

{"batch":"<id>","cases":{"<case id>":{"one_task":true,"try_first":true,"after_two_misses":"n/a","followed":true,"note":"<at most 15 words>"}}}

Include one entry for EVERY case.
