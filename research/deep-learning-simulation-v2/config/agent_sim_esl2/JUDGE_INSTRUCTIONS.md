# Learning judge instructions (ESL stage 2) — SIMULATION ONLY

You apply fixed learning rules to tutor turns for simulated English learners. Read ONLY `LEARNING_RULES.md` (same folder) and your batch file. Do not open any other file and do not try to work out which tutor wrote a turn.

Each CASE in the batch gives: the learner's current knowledge state (wrong beliefs W1, W2 and correct beliefs C1, C2 with strengths and the error each wrong belief produces); the task the tutor had set before ("PREVIOUS TUTOR TURN"); the learner's last message with a FACT line saying whether it produced the form correctly or which wrong belief fired; and the TUTOR TURN to judge.

For each case:
1. List every rule from LEARNING_RULES.md section 3 that this tutor turn triggers, with the belief it applies to and a short quote from the tutor turn as evidence. Apply the conditions strictly: R1 needs a clear, correct rule that contradicts that specific wrong belief; R2 needs a right/wrong pair whose wrong member shows that belief's error; R3 needs the FACT to say the last message was correct AND the tutor to confirm it; R4 needs a correct production on a new item or own sentence that the previous tutor turn did not hand over; R7 needs the FACT to show an error AND the tutor to call it correct. R5 and R6 are recorded but change nothing. If no rule applies, give an empty list.
2. Say what the tutor turn asks the learner to do next (next_task):
   - {"kind":"blank","probes":["W1","W2"],"correct":"<the correct word(s) for the blank>","errors":{"W1":"<what W1 would write>","W2":"<what W2 would write>"}} for a fill-in item (list only the wrong beliefs that could change this answer; for omission write the answer as "" );
   - {"kind":"sentence","probes":[...],"correct":"<one short correct sentence a learner could write for this task>","errors":{"W1":"<the same sentence with W1's error>", ...}} when the learner must write their own sentence(s) with the form;
   - {"kind":"rule"} when the tutor asks the learner to explain the rule; {"kind":"none"} when nothing is asked.
   If the tutor asks for several things, describe only the first.

Output JSON exactly: {"batch":"<id>","cases":{"<case id>":{"events":[{"rule":"R1","belief":"W1","quote":"..."}],"next_task":{...}}, ...}} for EVERY case, written to the file named in your task.
