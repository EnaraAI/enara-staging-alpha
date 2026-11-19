SIMULATION ONLY

# ESL6 deviations from the pre-registered protocol (commit 3fffc9c8)

Each entry: what, when, why, and its effect on the confirmatory test.

1. **Tutor task wording: "up to 32 sessions per cell" (2026-11-17, before round 1).** The frozen `tasks/TUTOR_TASK.md` (hashed, unchanged) still says a cell prints up to 32 sessions and that `tapply` replies "applied N of 32". With n = 270 (DECISIONS 14) each of the 24 cells holds **47** sessions. The runner prints and applies all sessions of a cell, so behaviour is unchanged. To stop an agent stopping at 32, each tutor agent's instructions also say: "this cell has 47 sessions; write a reply for every one; the final line will read 'applied 47 of 47'". **Effect on the primary test: none** (same prompts, same replies, same application).
2. **Study location moved (2026-11-17, before round 1).** `init` and the pre-test ran in a separate git worktree of the same commit. The frozen task files name `/home/user/enara-staging-alpha`, so the study folder (sessions, pre-test, cells) was copied unchanged to that checkout of the same branch. A tracked `backend/node_modules` symlink, committed by mistake, was removed (commit ebdd4e03; no frozen file changed; hashcheck 39/39 passes). **Effect: none.**
3. **Round 1 `jprep` re-run (2026-11-17).** The empty `judge/` folder made by `init` was not kept when the study folder was copied (git keeps no empty folders), so the first `jprep 1` wrote each turn's judge input and then failed writing `judge/r1_KEY.json`. The runner was not changed. The partial `judgeInput` field was cleared from all 1,128 round-1 turns (no judging had happened: no turn had events), `judge/` was created, and `jprep 1` was run again: 1,128 cases, 32 batches. The judge input is a pure function of the saved state and turns, so it is identical to the first attempt. **Effect: none.**

## Amendment A (2026-11-19, user decision, recorded before round 1 of the restarted run; PROTOCOL header, §4, §6, §10, §12–14)

The run paused mid round 2 (commit 950ae1db) is **discarded**. Its round-1 data, never analysed, stays in git history. All study files made by `init` (sessions, judge, answers, pre-test, checks) were removed and the study restarts from `init`. No ESL6 result had been computed.

4. **A1: one session of 5 turns instead of 2 × 5 (before round 1).**
   - **Why:** usage. About 410 agent runs instead of about 890.
   - **Power:** 0.765 instead of 0.648 at n = 270 (`POWER_A1.json`, ESL5 data used as a proxy).
   - **What changes:**
     - the runner is set to `SESSIONS = 1` and `f1 2` is refused;
     - the delayed test is 7 days after the one session;
     - agreement is judged in rounds 3 and 5 (was 3 and 8);
     - the session-2 agreement condition becomes round 5 ≥ 85%;
     - completeness means 5 judged rounds;
     - session-2 secondary outcomes are empty.
   - **Effect on the primary test:**
     - the test, item set, n and decision rule are unchanged, but the claim is now about 5 turns of teaching;
     - `reviewOpen` and whether the lead holds through a second session are not tested (§12 limit 14);
     - a follow-up study, ESL6b, is proposed in §14.
5. **A2: grader recheck deduplicated (before round 1).**
   - Sampled answers with the same item and answer string are scored once per scorer, as one distinct pair.
   - The guard is still computed over all sampled answers.
   - In the dry run: 3,095 sampled answers, 1,250 distinct pairs, so 32 batches per scorer instead of 78.
   - **Effect:** none on the scores. Both the grader and the answer strings are deterministic, so a repeated pair can only differ through scorer noise.
6. **A3: round-12 grader (before round 1).**
   - `graderV2.ts` round-8 `80746e02…` was replaced by round-12 `f4df7ca8…`: draft PR #30, branch `claude/grader-round12`, the only backend file changed.
   - Round 12 results: controlled items 96.0% (72/75), false accepts 0/30 (old grader: 4/30), free-item QWK 0.847.
   - `answercheck` was re-run: 810 keys and 753 wrong strings, **0 failures**, 15 grader-blind (the same 15).
   - **Effect:** LE's in-lesson key and all assessment scoring use the fixed grader.
7. **A4: agent models (before round 1).**
   - Tutor agents run on Sonnet; judges, agreement judges, recheck scorers, raters and fidelity checkers run on Opus.
   - At most 2 agents run at a time (the protocol allows 3).
   - The simulated learners are deterministic code (no model).
   - **Effect:** both arms use the same tutor model, so the comparison stays paired. Absolute scores may differ from ESL5.
8. **Rater wording (before round 1).**
   - The frozen `RATER_INSTRUCTIONS.md` (ESL4, reused unchanged) says "two short lessons on two days".
   - The case header from `rateprep` now says "One short lesson." The instructions file itself is not changed.
   - **Effect:** none on the primary test; the rating guard (answer protection) is judged per reply.

**Dry run (2026-11-19, scripted replies and judges, no agents, scratch folder with `DRY_RUN`):**
- `init` (hashes 41/41, answercheck pass, overlap pass, 1,128 sessions, 24 cells);
- pre-test, rounds 1–5, agreement in rounds 3 and 5;
- `f1 2` refused, as intended;
- immediate test, `f1 7`, delayed test (grader null 0);
- recheck (deduplicated), `agreescore`, `tags`, `post`, `rateprep` (29 batches), `fidprep` (8 batches);
- analysis: complete = true with 5 rounds.

## During the run (restarted study)

9. **Round 1, LE23: tutor agent scratch files.**
   - The tutor agent wrote two scratch files outside the repository (`/tmp/claude-0/f.txt`, `f2.txt`) to condense the `tprompts` output, then deleted them.
   - It wrote all 47 replies itself: 47 distinct replies, 47 of 47 with the hidden assessment line.
   - No study file was affected. This is the same kind of event as ESL5 deviation 2.
   - **Effect: none.**
10. **Round 1, LE22: one reply used for two sessions.**
    - `s746_LE_r2` (prepositions-time) and `s782_LE_r2` (days-months) got the same first reply, an in/on/at rule and exercise.
    - Both outcomes use the same lesson (PROTOCOL §5a and §12, limit 12), so the same first item fits both.
    - The other 45 replies in the cell are distinct. Kept as written: it is not a scripted or grouped cell.
    - **Effect:** negligible (1 of 1,128 round-1 replies).
11. **Round 2: shared replies.**
    - LE11, LE12, LE24 and LE25 each reused one reply for the same pair of learners on the shared in/on/at lesson (s745/s781, s746/s782, s748/s784); LE25 did the same for s749/s785. In each pair both learners answered "at".
    - LE22 (s842/s986) and LE24 (s934/s940) each reused one reply for two learners on the same outcome who gave the same correct answer.
    - Every other reply in those cells is distinct. Kept as written, on the same reasoning as deviation 10.
    - **Effect:** negligible.
12. **Agent scratch files.**
    - The round-1 LE15 tutor agent left an empty file `/tmp/claude-0/le15.txt`, outside the repository; it was found and deleted during round 2.
    - The round-2 PP25 tutor agent saved its `tprompts` output to a scratchpad file to read it, reported this, and the file was deleted. All 47 PP25 replies are distinct.
    - From then on, tutor agents are told to re-read the output in parts instead of saving it.
    - **Effect: none.**
13. **Concurrency raised (user request, 2026-11-19, from round 2 judging).**
    - Up to 8 agents run at once. The protocol allows at most 3, and amendment A4 had set 2.
    - Every batch is still independent and blind. Each judge reads only its own batch, and outputs go only to its own file.
    - The number of agent runs and the models are unchanged.
    - **Effect:** none on the data; only wall-clock time changes.
14. **Judge batch size 72 from round 3 (user decision, 2026-11-19, before any round-3 judging).**
    - Judge and agreement batches hold 72 cases from round 3 on: 16 judge batches per round instead of 32. Rounds 1–2 stay at 36, as run.
    - Same judge task, same models (Opus), same blind inputs. Every case is still judged.
    - **Why:** usage. Each judge spends about 69k tokens reading the instructions and rules, plus about 0.8k tokens per case. Doubling the batch size cuts about 35% of judge tokens: roughly 54 fewer judge runs over rounds 3–5.
    - **Rule:** any batch that comes back short is completed by its judge, or re-run, before `japply`.
    - **Change made:** the runner sets this through `JUDGE_PER(round)`; its hash is re-synced in PROTOCOL §3. PROTOCOL §6 notes the change.
    - **Effect:** none intended on the data. A possible effect on judge quality from longer batches is watched by the round-3 and round-5 agreement checks (≥ 85% guard).
    - Not adopted: a proposal to judge only 10% of process events. Judge events are what update the simulated learner's state and set the next task, so the primary outcome depends on every case being judged.
15. **Concurrency lowered to 2 (user request, 2026-11-19, during round 4) because the usage limit was near.** Agents already running were allowed to finish. **Effect: none** on the data.
16. **Round 3, LE10: one shared reply.** `s792_LE_r1` and `s984_LE_r1` are on the same family lesson and both answered "She"; they got the same confirmation. Kept, as in deviation 10. **Effect:** negligible.
