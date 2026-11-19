SIMULATION ONLY. NO API. Agents stood in as tutors and judges.

# TRACK 2 teaching check: result (run 2)

Plan: TUTOR_TRACK2_TEACHING_PLAN.md ("How it's tested"). Harness: `src/offline/teach2Study.ts`. Fresh learners and seeds (ids 1400-1579 main, 1600-1689 kids; namespace `teach2b`); no ESL6 file read or written.
Run 1 (ids 1100-1389) was stopped after 3 of 8 round-1 tutor cells, before any judging, because the example guard had false hits (fixed, see `discarded_run1/`); run 2 is the result.

## Size
- Main: 30 outcomes x 6 learners x 2 arms (PP = frozen P+ prompt; LE = ESL6 LE + teach2 bundle) x turns 1-3 = 1,080 tutor turns, each judged once with the ESL6 judge task (18 judge batches of 60), 0 rejected events.
- Kids: 30 outcomes x 3 bands (child, teen, adult; band from a staff-entered birth date) x 3 turns = 270 LE turns, deterministic ageFit + 3 independent age-fit judges per turn.
- Agents: 3 rule-bank reviewers x 2 rounds; 9 tutor sessions; 9 judge sessions (never more than 3 at a time).

## Pass bars
| Bar | Result | Pass? |
|---|---|---|
| LE R5 <= PP and <= 1% of LE turns | LE 0 events (0.0% of 540 turns); PP 27 events in 27 turns (5.0%) | PASS |
| LE R6 = 0 | LE 1 (turn 1, weather: tutor's own gloss "After It is, we need the y form"); PP 0 | FAIL |
| 0 guard hits (raw LE replies, pre-registered guard) | LE 43 hits in 41 of 540 turns; PP 130 in 120 turns (kids LE 34) | FAIL |
| LE R1+R2 per turn >= Round 1 (0.84) | turn 1 (the Round 1 comparison): 1.833; turns 1-3 together: 0.765 (turn 2: 0.056, turn 3: 0.406) | PASS on turn 1, FAIL over turns 1-3 |
| Kids: >= 95% within band limits | 35.2% (95/270) as pre-registered; 44.4% (120/270) after the ageFit sentence-split fix (same replies) | FAIL |
| Kids: >= 90% judged "fits" (majority of 3) | 79.3% (214/270): child 72%, teen 86%, adult 80% | FAIL |

PP for reference: R1+R2 per turn 0.756 / 0.389 / 0.461 (turns 1/2/3), R5 27 (all in turn 3: confirming a solved item by writing the completed answer of the item).

## Guard audit (secondary, post hoc, same replies)
`GUARD_AUDIT.json`: re-checked with the later guard fix (pair split, clue lines): main LE 43 -> 38, kids LE 34 -> 31, PP 130 -> 129.
Reading the 38 main LE hits: about 9 are real example sentences that would answer an open assessment item in the same scene ("The scissors are in my bag.", "My aunt has long straight hair.", "School starts in September.", "A nurse works in a hospital."); the rest are explanation or feedback sentences that the open-item target-form scorer accepts ("She is one person, so we use is.", "Orange starts with a vowel sound.", own-sentence task lines). The open-item part of the guard over-flags; with exampleGuard on, the fallback removes those sentences from real replies. Open issue.

## Kids readability (ageFit)
Flags (pre-registered): sentence too long 115, too many instructions 67, vocabulary coverage < 95% 66, average sentence too long 27, grammar label not taught 15, sarcasm 2 (false hit: "obviously"-type words). After the split fix: sentence too long 64, instructions 67, vocabulary 66.
Main causes: the rule-bank rule (up to 20 words) and the worked-example narration exceed the child maximum of 12; replies ask to "explain, then try again" (two instructions); the word list is an approximation of the Cambridge YL lists.
Judges' main reasons for "does not fit": too many steps for the band, rule sentence over the band's maximum, and two lesson mismatches (article-the lesson items test a/an; the days-months lesson teaches prepositions of time).

## Method usage after the change (LE main, 540 turns, 180 sessions; kids column = primary/supporting turns of 270)
| # | Method | primary | supporting | reinforcement | modifier | sessions | kids |
|---|---|---|---|---|---|---|---|
| 1 | Direct Instruction | 6 | 0 | 0 | 0 | 2 | 0/0 |
| 2 | Socratic Method | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 3 | Scaffolded Instruction | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 4 | Mastery Learning | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 5 | Inquiry-Based Learning | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 6 | Problem-Based Learning | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 7 | Case-Based Learning | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 8 | Project-Based Learning | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 9 | Retrieval Practice | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 10 | Spaced Repetition | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 11 | Interleaving | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 12 | Worked Examples | 512 | 6 | 0 | 0 | 180 | 225/0 |
| 13 | Elaborative Interrogation | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 14 | Analogical Reasoning | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 15 | Metacognitive Strategy Instruction | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 16 | Think-Aloud | 0 | 512 | 0 | 0 | 178 | 0/225 |
| 17 | Concept Mapping | 0 | 0 | 0 | 0 | 0 | 0/0 |
| 18 | Differentiated Instruction | 0 | 0 | 0 | 540 | 180 | 0/0 |
| 19 | Adaptive Learning Pathways | 0 | 0 | 0 | 540 | 180 | 0/0 |
| 20 | Formative Assessment & Feedback Loops | 0 | 0 | 0 | 540 | 180 | 0/0 |
| 21 | Gamification & Game-Based Learning | 0 | 0 | 0 | 0 | 0 | 0/18 |
| 22 | Narrative-Based & Contextual Learning | 0 | 0 | 0 | 0 | 0 | 0/72 |
| 23 | Bloom's Taxonomy-Guided Instruction | 0 | 0 | 0 | 0 | 0 | 0/0 |
| - | Guided practice (ENARA technique) | 22 | 0 | 0 | 0 | 22 | 45/0 |

- The plan is now re-selected every turn: 22 switches worked example -> guided practice after no improvement (M1). Reason codes: {"PROCEDURAL_ERROR": 512, "STRATEGY_CHANGED": 22, "NO_IMPROVEMENT": 22, "NOVICE_EXPLICIT_VOCABULARY": 6}.
- Misconceptions come from the pre-test (M2): 178 of 180 learners had at least one pre-test error (160 had two or more), so the plan is still mostly Worked Examples; the 2 learners with no pre-test error (both vocabulary outcomes) got Direct Instruction (6 turns).
- Corrective-feedback ladder (M3, engine): {"elicitation": 62, "metalinguistic": 19} in LE main; kids {'elicitation': 65, 'metalinguistic': 34}. No answer release (needs a 3rd failed attempt; only 3 turns).
- Interleaving (M5): the engine's interleave line fired on 80 LE turns; the plan layer never added it (the plan is chosen before the current answer is checked). Retrieval/spacing (M4) cannot fire in session 1 (unit-tested only).
- Rule template: grammar 360 turns, vocabulary 180 turns (M6). Under-13 frame (M7): narrative 72 / game 18 supporting turns in the kids set; 90 child turns carried the frame line.
- Post-check problems flagged: 37 LE turns. Engine moves: {"present_lesson_item": 180, "comprehensible_model": 540, "corrective_feedback_retry": 354, "short_explanation": 6, "comprehension_check": 6}.
- Never fired in this check: 15 of the 23 (Socratic, scaffolding, mastery learning, inquiry, problem, case, project, retrieval, spaced repetition, interleaving (plan), elaborative interrogation, analogy, metacognitive, concept mapping, Bloom's): the check's learners are all A1-A2 novices in session 1 with pre-test errors. Unit test M8 shows every method is reachable (project-based: teacher-only).

## Files
`main/` and `kids/`: sessions, prompts, answers, judge batches and outputs, `REPORT.json`. `DATACHECK.json` (lesson data check), `RULEBANK_REVIEW.md`, `GUARD_AUDIT.json`.
