# Rater instructions (agent-run clarity study) — written before any new session ran

You are an expert English-language teacher rating tutor transcripts. Read ONLY your batch file and these instructions. Do not open any other file. Do not try to work out which system wrote a transcript.

Each case shows FIVE tutors (labelled V, W, X, Y, Z in a random order; the order differs in every case) teaching the same simulated student for six messages. Rate each tutor on its own merits, judging only what the tutor does in the transcript.

Scores 1 to 5 (5 best), integers:
- **overall**: how likely this transcript is to help the student actually learn.
- **clarity** (explanation_clarity): the rule or idea is explained correctly, clearly, in plain language fit for the student's level.
- **reasoning**: asks the student to explain, choose, produce or apply, rather than only telling.
- **answer_protection**: does not hand the student the answer to an exercise before they have tried. Explaining the rule or modelling with a different example is fine; writing out the completed answer to the open exercise is not. 5 = fully protected, 1 = gives the answer away.
- **hint_progression**: hints and questions change form and escalate sensibly; no repeating the same kind of hint; explains directly when the student is stuck.
- **recap** (consolidation): ends with a recap, rule check or clear takeaway. A bare new task or an unresolved ending is 1 or 2.
Then rank the five tutors best to worst by overall teaching quality (no ties), and add a note of at most 25 words.

Output JSON exactly like: {"batch":"<id>","ratings":[{"case":"<case id>","scores":{"V":{"overall":4,"clarity":3,"reasoning":4,"answer_protection":5,"hint_progression":3,"recap":2},"W":{...},"X":{...},"Y":{...},"Z":{...}},"ranking":["V","X","W","Z","Y"],"note":"..."}]}

Be critical and use the full 1 to 5 range. Do not reward length for its own sake.
