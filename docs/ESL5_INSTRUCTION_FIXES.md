Note: every ESL5 number below comes from a simulation (agent tutors, a hand-written learner simulator and agent judges). None of it is evidence about real students.

# ESL5 instruction fixes

Source: `AGENT_SIM_ESL5.md` sections 8 and 9, and `config/agent_sim_esl5/DEVIATIONS.md` items 3, 5 and 6. The goal of each fix is that the engine's instructions describe what the ESL5 agents actually did, unless that was unsafe. Every change sits behind an existing switch (`releaseAfterTwo`, `reviewOpen`, `ownSentence`, or the `esl5` bundle that turns them on). With all switches off the output is byte-identical: `esl5OffParity` and `levelExplicitOffParity` pass with their hashes unchanged. No change is gated on `levelExplicit` alone, so `levelExplicit` without `esl5` behaves exactly as it does today.

## Fix 1: the `[[assess]]` marker (deviation 3)

- **Contradiction.** The ESL5 LE prompts said "Do NOT write an [[assess ...]] marker" and also "Start your reply with one hidden line ... [[assess ...]]".
- **Where each line comes from.** The "do not" line is not in the engine. It is in the research runner's wrapper (`esl5Study.ts` `tutorPrompt`, and before that `agentSession.ts`). The engine's language block asks for the marker exactly once (`ASSESSMENT_INSTRUCTION`) and forbids it nowhere.
- **Production.** Production uses the marker. `tutor.controller` and `avatar.controller` strip and parse it (`stripAssessmentMarkers` / `AssessmentMarkerFilter` → `finalizeLanguageTurn`). The verdict, the next item and the open-item tracking all depend on it.
- **What the agents did.** They followed the runner and left the marker out. The runner then stood in for it with a key-based INCORRECT verdict (PROTOCOL "stand-in (a)").
- **Fix.** The engine side is correct, so the engine is unchanged. The runner is the wrong side. It is hashed in the ESL5 protocol, so it was **not modified**. A future runner should drop the "Do NOT write" line, or should strip the engine's marker instruction on purpose and say so.
- **Test.** `esl5Marker.test.ts` covers 10 switch sets, including LE+esl5 and belief. It checks that there is exactly one `[[assess` and exactly one "Start your reply with one hidden line" in both renderings, and no text that forbids the marker. It also checks that the production parser strips the marker and reads it.
- **Behaviour vs the ESL5 agents.** In production the tutor writes the marker, which ESL5 agents did not. This is intended.

## Fix 2: the closing turn (deviation 5) and the answerReleased spikes

### Contradiction and what the agents did
The `reviewOpen` closing line asked for one NEW item. At the same time the learner had just answered the open item wrong, and the hint ladder forbade revealing the answer. The agents gave a hint and a retry, not the new item.

There was a second contradiction on release turns. The closing line said "never write a completed answer to an open exercise" while `RELEASE_TEXT` said "state the answer to this item".

### Fix (behind `reviewOpen`, `reviewCloseLine`)
- **Plain closing.** The closing item is the only task in the reply. The learner gets one unaided try, and the answer is never given before a genuine attempt (`REVIEW_CLOSE_ONE_TRY`). `releaseAfterTwo` then applies to the closing item like any other item.
- **Open task answered or help asked, no release.** `REVIEW_CLOSE_HOLD` is added: a wrong answer or a help request keeps the hint/retry on the open task, with no new item in that reply. Only a right answer is confirmed and followed by the closing item. This is exactly what the agents did. The reply guards still tag the closing as `added` once the reply sets a task. So a closing replaced by a retry is not repeated later in that session, which also matches ESL5 (the guards tagged those turns `added`).
- **Release on the closing turn.** `REVIEW_CLOSE_RELEASE_LINE` replaces the closing line. The release's single new item IS the closing item, set in a new situation. The line adds no other task and no "never write a completed answer" clause.

### Release-spike investigation (TRAJ.json `releasesLE`: rounds 3, 4, 5 = 20, 53, 118; round 9 = 2; round 10 = 70)
`answerReleased` is the engine's own release decision (`turnEvidence` → `ev5.answerReleased`). Rounds 5 and 10 are the last turns of sessions 1 and 2. All 263 recorded releases in the 240 LE session files were examined:

| Turn | Releases | Learner's answer was **correct** | Under 2 genuine tries on one task | 2 or more genuine tries on one task |
|---|---|---|---|---|
| 3 | 20 | 0 | 0 | 20 |
| 4 | 53 | 21 | 28 | 4 |
| 5 (closing, session 1) | 118 | 52 | 37 | 29 |
| 9 | 2 | 0 | 0 | 2 |
| 10 (closing, session 2) | 70 | 51 | 19 | 0 |

The last three columns use an approximate attempt count from the session files: answers since the last success, own-sentence answers excluded.

**Finding: the spikes are a counting bug, not genuine releases.** `genuineFailedAttempts` counted every learner answer while the stored open item stayed on one lesson item. The runner had no marker, so its history kept the last lesson item open (`next=SAME_ITEM`). It recorded INCORRECT for any answer that did not match that item's key, which included:

- answers to the tutor's own new items;
- the own-sentence answer;
- answers given after the item had already been solved.

In production a tutor reply without a marker does the same thing (`fallbackNext` → `SAME_ITEM`). The `ownSentence` task falls at turns 3–4 and 8–9, and the closing follows it at 5 and 10. That is why the miscounted answers pile up exactly on the closing turns.

Examples:

- `s500_LE_r1` turn 5. The item was solved at turn 3. The own sentence was wrong at turn 4. One empty answer on a new tutor item at turn 5 led to a release after **one** attempt.
- `s502_LE_r2` turn 10. The learner answered "opens" correctly on a tutor item after a correct own sentence. The engine released anyway (the agent just confirmed it).
- Correct-answer releases also occur in `s500_LE_r2`, `s510_LE_r1`, `s511_LE_r2` and `s519_LE_r1` (turn 5), and in `s506_LE_r1`, `s507_LE_r2`, `s513_LE_r2` and `s514_LE_r2` (turn 10).

In 103 of the 188 closing-turn releases the learner was right. Because `RELEASE_TEXT` starts with "If this answer is right after all, just confirm it", the agents mostly confirmed and moved on. The tag itself was wrong.

**Bug fix (behind `releaseAfterTwo`).** Attempts count on ONE task. The count starts again after:

- a success verdict on the item;
- a reply tagged `answerReleased` (its new item);
- a reply tagged `ownSentence` (`asked` or `feedback`);
- a reply that set the `reviewOpen` closing item (`closingAsk: added`).

Two genuine wrong answers on the same item still release. Replayed approximately on the session files, the recorded releases fall from 263 to about 35: 20 / 2 / 7 / 2 / 4 at turns 3 / 4 / 5 / 9 / 10.

### Tests
`esl5Closing.test.ts` checks:

- no release at the closing turn for the `s500` and `s502` patterns (these fail without the fix);
- the attempt counter (it resets, and two tries on one item still count 2);
- a release at the closing turn uses the release closing line and not "never write a completed answer";
- a wrong answer at the closing turn gives the hold line and no release;
- a correct answer gives the closing item with one try;
- no rule-recap ask, no own-sentence task, and exactly one closing line.

### Behaviour vs the ESL5 agents
- The hold matches the agents.
- The release fix removes releases that the agents had mostly ignored anyway.

## Fix 3: the session-2 opening (deviation 6)

### Contradiction and what the agents did
On the first message of session 2, `REVIEW_OPEN_LINE` asked for "ONE short recall item ... No rule, no explanation and no example before it". At the same time `levelExplicit` added "First time this lesson's rule comes up ... state the rule". That came from the short-explanation path, which fires when no rule has been introduced in *this* session. The agents gave the recall item only, in 10 of 20 sessions for LE24 alone.

### Fix (behind `reviewOpen`)
There is now one rule:

1. In a later session, the recall opening carries no rule line at all.
2. A later rule line keeps only the rules the learner record does not show as introduced. Under `reviewOpen`, a new `rulesIntroduced` field in the learner profile is written from the turn evidence. It holds codes only, as "<lessonId>:<criterion>".
3. The reply after a recall item gets `REVIEW_RECALL_FAIL`: if the recall was wrong, show the right form, state the rule in one plain sentence and give one right/wrong pair.

`REVIEW_SECOND_LINE` now points to that instruction and no longer says "no rule lecture".

The frozen runner calls `ruleFirstDecision` without the record, so it would not see this change. This does not matter because the runner is not re-run.

### Tests
`esl5Session2.test.ts` covers three cases:

- **Recall opening:** the recall item only, with no rule line and no `rulesIntroduced` recorded. Without `reviewOpen` the old "first time" line is present.
- **Rules not yet introduced:** a rule the record has not seen gets the rule line, and a rule already introduced does not.
- **Failed recall:** the reply after a recall item carries the rule line and the right/wrong contrast.

A fourth test checks that with the switches off the record is ignored.

### Behaviour vs the ESL5 agents
- The opening matches the agents (recall only).
- **New:** a failed recall now gets the rule and a contrast in the next reply. ESL5's instruction was "no rule lecture". This is the requested design.

## Conflict scan: other conflicts found and fixed

`backend/test/esl5InstructionMatrix.test.ts` builds the full prompt for all 64 combinations of `levelExplicit` × the five esl5 sub-switches, on the ESL5 LE base. It does this across nine situations:

- first turn;
- wrong answer;
- hint request;
- release after 2 genuine fails;
- closing with a wrong answer;
- closing with a right answer;
- closing with a release;
- session-2 opening;
- own-sentence task.

It checks 16 contradictory instruction pairs:

- give the answer + never reveal it / don't name the correct form;
- write the marker + do not write it;
- rule before the first try + no rule before the first try;
- recall from memory + state the rule first;
- a closing new item + a closing rule recap;
- two tasks of different kinds (own sentence, release item, recall item, lesson item, closing item, the rule line's own new item);
- no new exercise + a new item;
- release + retry;
- faded support + a rule line.

New conflicts found and fixed:

1. **Release + "don't name the correct form" / "Never write the answer to an open lesson exercise"** (`releaseAfterTwo`, with or without `liveError`). The diagnosis and live-error lines are on the same release turn. On a release the diagnosis line now says to use the cause for the one-line reason. The live-error line now says "Apart from the item whose answer is released above, never write the answer ...".
2. **Release + recap closing without `reviewOpen`** ("Do not set a new exercise this turn" and "never write a completed answer" next to "state the answer ... give ONE new item"). On a release the recap closing line is left out. The reply guards defer the recap because the reply sets a task. The ESL5 agents never saw this because `reviewOpen` was on.
3. **Two tasks: the rule line's "(3) ask them to apply the rule to a new item" next to another task.** The other task is the release's new item, the own-sentence task or the `reviewOpen` closing item (`releaseAfterTwo` / `ownSentence` / `reviewOpen`, each together with `levelExplicit`). In those replies step (3) of the rule line now reads "the task for this reply is the one set by the instruction below (one task only)".

**Found, not fixed:** in plain `levelExplicit`, with no esl5 switch, the rule line's "(3) ... a new item" sits next to the recap closing's "Do not set a new exercise this turn" on a closing turn where a rule is first introduced. This happens today without ESL5. Fixing it would change `levelExplicit` output that the esl5 off-parity hash protects. ESL5's LE arm (`reviewOpen` on) does not have it. The matrix test records it as known and fails on any other hit. Recommended follow-up: apply the same "task below" wording on recap-closing turns, as a deliberate `levelExplicit` change with a hash update.

## Test results

- **New tests:** `esl5Marker` (11), `esl5Closing` (7), `esl5Session2` (4) and `esl5InstructionMatrix` (1 test, 576 prompts). All pass.
- **ESL5 and levelExplicit suites** (`esl5*`, `levelExplicit*`, including both off-parity tests with unchanged hashes): 93 tests, all pass.
- **Full backend run** (`cd backend && npx vitest run`): 1852 passed, 17 failed in 12 files. The 17 are exactly the known base failures:
  - phase3.autograding 11, 14 and 15;
  - phase3.e2e;
  - elie.e2e;
  - elie.sprint4;
  - p14_2GradingTestSpend (2);
  - p14_8BlockerFixes GAP-1;
  - p19Resilience C1b;
  - p20QueryBudget;
  - p2Documents (2);
  - p3EducatorChat isolation;
  - phase0 upload links (2);
  - educatorAnalytics chart render (flaky).

  There are no new failures. `tsc --noEmit` is clean.

## Follow-up: the levelExplicit closing-turn conflict (fixed)

The "found, not fixed" conflict above is now fixed, as an approved, deliberate `levelExplicit` change. In plain `levelExplicit` (no esl5 switch), on a closing turn where a rule is first introduced, step (3) of the rule line now reads `RULE_LINE_TASK_BELOW` ("the task for this reply is the one set by the instruction below (one task only)") instead of "ask them to apply the rule to a new item". The recap closing ("Tell me the rule in your own words", "Do not set a new exercise this turn") is then the reply's one task. The change is in `ruleTaskElsewhere` (`levelExplicit` or `reviewOpen`, on a closing turn with the closing on).

- `esl5InstructionMatrix` has no exemptions left and asserts zero conflicts over all 576 prompts.
- `esl5OffParity` hash changed (`dd94aa40…` → `1d46f988…`). Only the 328 of 6810 matrix keys whose switch set includes `levelExplicit` changed; all switches-off keys are byte-identical. `levelExplicitOffParity` (no `levelExplicit` in its matrix) keeps its hash.
