# SIMULATION ONLY

# ESL3 deviations from PROTOCOL.md

Each item is logged when it happened. PROTOCOL.md itself is not edited.

1. **Round 1, cell LE21:** some applied replies carried a garbled line. The 4 affected sessions were kept as `partial/PARTIAL_*_r1_garbled.json` and rerun with the corrected replies (protocol section 4).
2. **Round 2, judge batch r2_j04:** the batch returned 35 of its 36 cases. The output was kept as `partial/PARTIAL_r2_j04_missing1.json`, the missing case was judged on its own (r2_j04x), and the result was merged in.
3. **Round 3, cells P10–P12, P20–P22, LE10 and LE11:** two agents that were each given 4 cells generated replies with scripts or templates instead of writing each one. All 160 of their round-3 replies were kept as `partial/PARTIAL_*_r3_templated.json` or `partial/PARTIAL_*_r3_scripted.json` and rerun, one cell per agent. TUTOR_TASK.md gained a line forbidding scripted replies. From round 4 on, one agent handles one cell.
4. **Usage limit (round 5):** three tutor agents stopped before writing anything. No data was cut. They were relaunched.
5. **esl3Study.ts `rateprep`:** a code comment added before pre-registration swallowed the declaration `const key` on the same line, so the command crashed. The only change is that the comment is now a block comment. Behaviour is otherwise exactly as pre-registered.
   - Hash before: `24c4b2fd655efe00babd81b5e1c9e656f9c6c2342f1fd285d893806a3bfb4b56`
   - Hash after: `979fc44132cb27c64cb17084f0bbcfd5af8504551c61b6cbe5698d2cc908c38c`
   - Nothing in the sessions, the judging or the analysis was affected.
