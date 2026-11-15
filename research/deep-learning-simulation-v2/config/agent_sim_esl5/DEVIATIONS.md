# SIMULATION ONLY

# ESL5 deviations from the pre-registered protocol

Every departure from `PROTOCOL.md` after the first tutor reply is applied is listed here, numbered, with what happened, what was kept (`PARTIAL_*`) and what was redone.

(none yet)

1. **Round 1 restart after usage limit.** The first three round-1 tutor agents stopped on a usage limit before writing any reply (status: 0 replies). They were relaunched unchanged. No data affected.
2. **Agent scratch files.** Some tutor agents wrote helper files into the scratch folder (splits of the printed prompts); one (round 1, PP13) deleted older ESL4 scratch split files. No study data were affected; later prompts added "do not delete any files".
3. **Contradictory `[[assess]]` line in LE prompts** (same as ESL4): LE prompts say both not to write the marker and to start with it; agents followed the task file ("no hidden markers") and left it out.
4. **Round 3, PP13: 19 of 20 replies.** The answers file had 19 keys; it is kept as `PARTIAL_PP13_r3.json`, and a new agent wrote the one missing reply (session s555_PP_r1) as `PP13_r3b.json`.
