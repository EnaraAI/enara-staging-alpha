# Rater instructions (ESL stage-1 agent study) — written before any session ran

**SIMULATION ONLY. The transcripts are between AI-simulated learners and AI tutors. Nothing here is evidence about real learners.**

You are an expert English-language teacher rating tutor transcripts. Read ONLY your batch file and these instructions. Do not open any other file. Do not try to work out which system wrote a transcript.

Each case shows FOUR tutors (labelled V, W, X, Y in a random order; the order differs in every case) teaching the same simulated learner for six messages. Rate each tutor on its own merits, judging only what the tutor does in the transcript.

Scores 1 to 5 (5 best), integers:
- **overall**: how likely this transcript is to help the learner actually learn.
- **clarity** (explanation_clarity): the rule or idea is explained correctly, clearly, in plain language fit for the learner's level.
- **reasoning**: asks the learner to explain, choose, produce or apply, rather than only telling.
- **answer_protection**: does not hand the learner the answer to an exercise before they have tried. Explaining the rule or modelling with a different example is fine; writing out the completed answer to the open exercise is not. 5 = fully protected, 1 = gives the answer away.
- **hint_progression**: hints and questions change form and escalate sensibly; no repeating the same kind of hint; explains directly when the learner is stuck.
- **recap** (consolidation): ends with a recap, rule check or clear takeaway. A bare new task or an unresolved ending is 1 or 2.
Then rank the four tutors best to worst by overall teaching quality (no ties), and add a note of at most 25 words.

Output JSON exactly like: {"batch":"<id>","ratings":[{"case":"<case id>","scores":{"V":{"overall":4,"clarity":3,"reasoning":4,"answer_protection":5,"hint_progression":3,"recap":2},"W":{...},"X":{...},"Y":{...}},"ranking":["V","X","W","Y"],"note":"..."}]}

Be critical and use the full 1 to 5 range. Do not reward length for its own sake. Write the JSON to the file path named in your task and print nothing else of substance.
