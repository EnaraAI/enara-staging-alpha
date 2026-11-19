# Tutor track handoff

Status as of 19 Nov 2026. This is for the tutor session (branches `claude/tutor-*`). Read `CLAUDE.md` first.

**New standing rule:** simulations and judging run through the Anthropic API with the real ENARA engine, never with agents. Every study below used agents as tutors, learners and judges. They are rule-based simulations, not evidence about real students.

## ESL studies

The reports are in `research/deep-learning-simulation-v2/reports/exp4/` on branch `claude/grader-round8`.

| Study | Date | Setting | What changed | Primary result (controlled post-test, explicit-first learners) |
|---|---|---|---|---|
| ESL1 | 15 Nov | `levelExplicit` | Explicit rule line first for A1–A2 | No gain: diff 0.000 [−0.069, +0.069] |
| ESL2 | 15 Nov | + fixes (39c1801) | Judge-scored learning rules R1–R7 | +0.167, p = 0.063 after Holm: not significant |
| ESL3 | 15 Nov | + two-ask fix (3ae8c15) | — | **CONFIRMED**: 0.789 vs P 0.638, p = 0.0011, n = 48 |
| ESL4 | 15 Nov | Hash-identical to ESL3, against a stronger P+ | Harder comparison arm | **NOT CONFIRMED**: p = 0.953, n = 96. Judge agreement 65.5% (target 85%) |
| ESL5 | 16 Nov | `ENARA_ENGINE_V2="wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5"` | `esl5` bundle: liveError, releaseAfterTwo, reviewOpen, fadeKnown, ownSentence | **CONFIRMED**: 0.889 vs P+ 0.737, p = 6.6×10⁻⁷, n = 108. **Best result** |
| ESL6 | 18 Nov | LE = A0+LE+esl5 (same as ESL5) against PP | Generalising to all A1–A2 outcomes, plus a 7-day delayed test | **Paused** mid Round 2 (see below) |

## ESL5 is the frozen baseline
- ESL5's engine is still in the code: `backend/src/services/engineV2.ts`, the `esl5` bundle, which "all" never turns on.
- It is **off** for learners on lms-test (`ENARA_ENGINE_V2` isn't set). test.enara.app is frozen and unknown.
- Every new change must beat ESL5 on the same post-test before it replaces it.

## ESL6 status
- Paused mid Round 2. 15 of 24 tutor cells are applied and nothing is judged.
- Round 2 can be undone exactly by restoring the sessions to the Round 1 commit, 6f1f084b.
- See `RESUME.md` on `claude/grader-round8` (commit 950ae1db).
- It must restart from Round 1 with a frozen tutor and the new grader, as track 3. It needs a cost estimate first.

## Grader fix: done, passed (draft PR #30, `claude/grader-round12`, not merged)
| Round 12 (150 new answers, 3 new scorers) | Old grader | Fixed grader | Target |
|---|---|---|---|
| Controlled items | 64/75 (85.3%) | 72/75 (96.0%) | ≥95% |
| False accepts | 4/30 | 0/30 | must not rise |
| Free-item QWK | 0.847 | 0.847 | ≥0.80 |

- The new `graderV2.ts` sha256 is `f4df7ca84ce482e237ab37a4c7057d8b0cd9c5a1c234bcbb609f8a5afc7150ef`.
- Rubric 1A applies to error correction, and there is no slip allowance.
- The scorers were agents. **Re-validate with API judges under the new rule.**

## Track 2: teaching quality (draft PR #31, `claude/tutor-teaching`, not merged; all switches off)
**Results:**
- **Met:**
  - LE gave the answer away (R5) 0 times in 540 turns, against PP 27.
  - Turn-1 rule and contrast events: 1.83 per turn.
- **Missed:**
  - R6: 1 turn, against a target of 0.
  - Example-guard hits: 43, against a target of 0. Only about 9 are real; the rest are false hits.
  - The same events over turns 1–3: 0.77, against 0.84.
  - Kids replies within band limits: 35–44%, against 95%.
  - Kids replies judged "fits": 79%, against 90%.

**Next:**
- narrow the guard;
- write a child-length rule bank;
- enforce one instruction per message;
- re-check on fresh seeds;
- compare against ESL5 on the post-test (ESL7).

The report is `research/deep-learning-simulation-v2/reports/exp4/teach2/RESULT.md` on that branch.

## Track 4 (plans ready, waiting for "go")
- **Avatar latency:** target p50 ≤1.5 s and p90 ≤2.5 s. Real numbers need the Anam and ElevenLabs keys on lms-test.
- **Enara Kids review:** the Moodle tutor and avatar launches land on Kids Home (a small fix in `frontend/services/roleRouting.ts`).

## Open questions
1. **ESL5's comparison arm:** P+ was strengthened after ESL4. Is it a fair stand-in for ENARA's plain prompt? Re-check P+ against the frozen production prompt.
2. **Judge agreement:** it failed in ESL4 (65.5%). Re-establish it with API judges before any new decision.
3. **Outcomes covered:** ESL3–ESL5 used a subset of A1–A2 outcomes. ESL6 is meant to cover all 33.
4. **Pilot plan:** move from simulation to real learners. Needs a design (consent, size, measures), for Mohamed's go.
5. **Turning ESL5 on for lms-test learners:** waiting for Mohamed's "go".
