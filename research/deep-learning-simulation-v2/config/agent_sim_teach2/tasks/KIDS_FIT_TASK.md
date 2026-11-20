# SIMULATION ONLY

# Age-fit judge task (TRACK 2 kids set)
You are one of 3 independent judges (k1, k2, k3). You will be given a BATCH file path (inside the repository) and an OUTPUT path. Read ONLY the BATCH file. Each case shows the learner (age band, English level), the lesson, the previous tutor turn, the learner's message and the TUTOR TURN TO RATE.

For each case decide `fits` (true/false): does this tutor message fit a learner of this age band at this English level? Use these band rules:
- child (under 13): sentences about 8 words on average, never more than 12; words from the lesson or everyday words a young child knows; grammar labels only if the lesson teaches them; ONE instruction; warm, "not yet" rather than a bare "wrong"; praise effort or strategy, never ability ("you are clever"); examples from family, school, animals, games, food.
- teen (13-17): sentences about 12 words on average, max 16; up to two steps; friendly, never childish; examples from friends, sport, apps, school.
- adult (18+): sentences about 14 words on average, max 20; up to two steps; respectful, never childish.
- every band: no sarcasm, irony or idioms; nothing frightening or adult; the content must still teach the lesson's point.
Judge only age fit and readability, not whether the teaching is right. Give `why` in at most 12 words.
Judge k1 ONLY: also give `next_task`, the task the tutor's message asks the learner to do, in this format: {"kind":"blank"|"sentence"|"rule"|"none","probes":["W1"],"correct":"<a correct answer>","errors":{"W1":"<the answer a learner with the lesson's typical error would give>"}} (kind none if no task).

Write (Write tool) to the OUTPUT path: {"batch":"<id>","cases":{"<case id>":{"fits":true,"why":"..."}, ...}} (k1 adds "next_task" to each case), with an entry for EVERY case. Judge by reading; no scripts.
