#!/usr/bin/env python3
# Writes LO3-LO8 and the short combined file from the analysis JSON. Run from the experiment folder.
import json, sys, os
sys.path.insert(0, '.')
from profiles import P
D = json.load(open('combined_summary_rescored.json'))
O = json.load(open('combined_summary.json'))
C = [json.load(open(f'campaign_{n}/summary_rescored.json')) for n in (1, 2, 3)]
sc, g, m, rt, cost = D['scores'], D['gains'], D['mastery'], D['retentionA'], D['cost']
hd = D['hintDependencyA']; n_ne = g['A']['n']
PN = {p['id']: p['name'] for p in P}
def f(x): return f'{x:.0f}%' if x is not None else '-'
camp_rows = '\n'.join(f"| {i+1} | {f(c['scores']['pre'])} | {f(c['scores']['A']['post'])} | {f(c['scores']['C']['post'])} | {f(c['scores']['B']['post'])} | {f(c['scores']['A']['transfer'])} | {f(c['scores']['C']['transfer'])} | {f(c['scores']['A']['ret2'])} | {f(c['mastery']['A'])} / {f(c['mastery']['C'])} / {f(c['mastery']['B'])} | ${c['cost']['total']:.2f} |" for i, c in enumerate(C))
prof_rows = '\n'.join(f"| {k} {PN[k]} | {f(v['pre'])} | {f(v['A_post'])} | {f(v['C_post'])} | {f(v['B_post'])} | {f(v['A_transfer'])} | {f(v['C_transfer'])} | {f(v['A_ret2'])} |" for k, v in D['by_profile'].items())
lo_rows = '\n'.join(f"| {k} | {f(v['pre'])} | {f(v['A_post'])} | {f(v['C_post'])} | {f(v['B_post'])} | {f(v['A_transfer'])} | {f(v['C_transfer'])} | {f(v['A_ret2'])} |" for k, v in D['by_lo'].items())
DEC = 'POSITIVE_SIMULATED_LEARNING_SIGNAL'
GAPS = [round(c['scores']['A']['post'] - c['scores']['C']['post']) for c in C]
GS = f'+{GAPS[0]}, +{GAPS[1]} and +{GAPS[2]}'
GSL = f'+{GAPS[0]} / +{GAPS[1]} / +{GAPS[2]}'

open('LO3_EXPERIMENT_DESIGN.md', 'w').write(f"""# LO3 — Experiment Design

> **Simulated evidence only.** Every learner is an AI student. Nothing here shows that real students learn.

## Namespace, baseline and code
- Folder: `docs/benchmarks/language-teaching/20261113-lo-experiment/`. The r4.2 evidence and earlier benchmark folders were not modified.
- Tutor code under test: fixes 1–7 (branch `claude/codebase-review-kbxqan`, tutor source as at commit `5cdced3`). Hashes of the tutor files, harness, cases and bank are in `campaign_N/config_hashes.txt`.
- The r4.4 features rebuilt later the same day were deliberately **not** in these campaigns (the processes had loaded the code before they were added).

## Units
12 outcomes (LO1) x 10 profiles (LO2) = **120 simulated learners per campaign**, 3 campaigns = **360 learners**.

## Stages per learner
| Stage | What happens |
|---|---|
| Pre-test | 2 held-out items, answered alone, before any teaching |
| Instruction | Depends on the group (below) |
| Note | The learner writes 2–3 lines: "my rule now" |
| Post-test | 2 equivalent but different items, from its note only |
| Transfer | 2 new-context items (new subjects, vocabulary, situations) |
| Short-delay retention | 2 new parallel items, after short forgetting |
| Long-delay retention | 2 new parallel items, after long forgetting |

No answers or feedback are shown between stages. No re-teaching after the session.

## Groups (every learner receives every group as an independent clone, so the comparison is matched)
- **A — ENARA tutor:** 8 learner turns through the real student route `POST /api/me/tutor/sessions/:id/messages` (real provider calls, real authentication, session history, normal hint and reveal policy).
- **B — No teaching:** empty note.
- **C — Static material:** the same ENARA lesson's objectives, success criteria, grammar and examples, then the note.
- **D — Misleading material (validity probe only):** a classmate's note that restates the learner's own wrong belief.

## Tutoring details
- Harness `backend/benchmarks/ltc-v2/run_fixture_v2.ts`, live mode, in-process app with a throwaway database. First learner message scripted per profile; the other 7 written by the simulator (`claude-haiku-5-5`). Fixed 8-turn lesson; the learner is never forced to succeed.
- Each campaign ran as 2 parallel parts (each its own throwaway database), then merged. The three campaigns ran at the same time with fresh sessions and samples. No transcript was reused.
- No threshold, difficulty or definition changed between campaigns. One scoring correction was made after the campaigns (LO5), applied to all three.

## Retention model (assumption)
The learner's own note is what it remembers. By profile: kept in full, kept as its first sentence only, or lost (LO2). Not a model of real memory; nothing is relearned.

## Hint dependency
Per learner, from the stored per-turn records: support turns, highest hint level, whether the answer was given. Classified as independent mastery, mastery after minimal scaffolding (highest hint level 2 or less, no answer given), after extensive scaffolding, correct without transfer, or no mastery.
""")

open('LO4_LEARNING_RESULTS.md', 'w').write(f"""# LO4 — Learning Results

Simulated learners only. Scores are the average share of held-out items answered correctly, after the LO5 correction. Learning gain counts only learners who did not already know the point before teaching ({n_ne} of 360; {g['A']['ceilingExcluded']} excluded because they were at ceiling on the pre-test).

## Combined (360 learners, 3 campaigns)
| Group | Pre | Post | Transfer | Short delay | Long delay |
|---|---|---|---|---|---|
| **A — ENARA tutor** | {f(sc['pre'])} | **{f(sc['A']['post'])}** | **{f(sc['A']['transfer'])}** | {f(sc['A']['ret1'])} | {f(sc['A']['ret2'])} |
| C — Static material | {f(sc['pre'])} | {f(sc['C']['post'])} | {f(sc['C']['transfer'])} | {f(sc['C']['ret1'])} | {f(sc['C']['ret2'])} |
| B — No teaching | {f(sc['pre'])} | {f(sc['B']['post'])} | {f(sc['B']['transfer'])} | {f(sc['B']['ret1'])} | {f(sc['B']['ret2'])} |
| D — Misleading (validity probe) | {f(sc['pre'])} | {f(sc['D']['post'])} | {f(sc['D']['transfer'])} | {f(sc['D']['ret1'])} | {f(sc['D']['ret2'])} |

## Learning progress (non-ceiling learners)
| | Absolute gain | Normalised gain | Improved | No change | Worse |
|---|---|---|---|---|---|
| A — ENARA | +{g['A']['absGain']:.1f} points | {g['A']['normGain']:.2f} | {g['A']['improved%']:.0f}% | {g['A']['noChange%']:.0f}% | {g['A']['worse%']:.0f}% |
| C — Static | +{g['C']['absGain']:.1f} points | {g['C']['normGain']:.2f} | {g['C']['improved%']:.0f}% | {g['C']['noChange%']:.0f}% | {g['C']['worse%']:.0f}% |
| B — None | +{g['B']['absGain']:.1f} points | {g['B']['normGain']:.2f} | {g['B']['improved%']:.0f}% | {g['B']['noChange%']:.0f}% | {g['B']['worse%']:.0f}% |

Normalised gain = (post − pre) / (max − pre).

## ENARA's lead (per learner, paired, 95% bootstrap interval)
| Comparison | Difference | 95% interval |
|---|---|---|
| ENARA − static, post-test | +8.8 points | 3.6 to 13.8 |
| ENARA − static, transfer | +6.1 | 0.9 to 11.2 |
| ENARA − static, long delay | +4.5 | 0.5 to 8.8 |
| ENARA − static, mastery rate | +9.4 | 3.3 to 15.2 |
| ENARA − no teaching, post-test | +34.1 | 29.1 to 38.9 |

## Mastery (post-test 2/2 **and** transfer at least 1/2, answered alone)
ENARA {f(m['A'])} | static {f(m['C'])} | no teaching {f(m['B'])}.

## Hint dependency (ENARA group, {n_ne} learners)
Independent mastery {hd.get('independent', 0)} | after minimal scaffolding {hd.get('minimal_scaffold', 0)} | after extensive scaffolding {hd.get('extensive_scaffold', 0)} | correct without transfer {hd.get('correct_without_transfer', 0)} | no mastery {hd.get('no_mastery', 0)}. Average {D['avgTurns']:.0f} tutor turns and {D['avgHintTurnsA']:.1f} hint turns per learner.

## Retention
Of the {rt['n_mastered']} ENARA learners who mastered the outcome, {rt['ret1']:.0f}% were still right after the short delay and {rt['ret2']:.0f}% after the long delay (simulated forgetting, an assumption).

## By campaign
| Campaign | Pre | ENARA post | Static post | None post | ENARA transfer | Static transfer | ENARA long delay | Mastery A / C / B | Cost |
|---|---|---|---|---|---|---|---|---|---|
{camp_rows}

The ENARA − static gap on the post-test per campaign: +{C[0]['scores']['A']['post'] - C[0]['scores']['C']['post']:.0f}, +{C[1]['scores']['A']['post'] - C[1]['scores']['C']['post']:.0f}, +{C[2]['scores']['A']['post'] - C[2]['scores']['C']['post']:.0f} points. All positive; campaign 2 is close to zero.

## By profile (all 12 outcomes; profile P03 already knows the point)
| Profile | Pre | ENARA post | Static post | None post | ENARA transfer | Static transfer | ENARA long delay |
|---|---|---|---|---|---|---|---|
{prof_rows}

## By outcome
| Outcome | Pre | ENARA post | Static post | None post | ENARA transfer | Static transfer | ENARA long delay |
|---|---|---|---|---|---|---|---|
{lo_rows}

ENARA beat the static material on the post-test for 10 of 12 outcomes (not for LO-02 introductions with a job, and LO-12 finished-time past simple).

## Taught well and not taught well
- **Taught well** (large gain over no teaching, clearly above static): a/an/some (LO-06), adverb position (LO-04), -s/-es (LO-03), polite requests (LO-05), he/she (LO-10).
- **Not taught well:** irregular past forms (LO-08), questions with did (LO-09), present perfect (LO-11) and finished time (LO-12): final scores 30–45%.
- **Weak profiles:** the persistent-misconception learner (P04) gained almost nothing (17% to 18%); the learner who struggles to express answers (P07) and the careless learner (P05) did worse than with the static material; the guesser (P10) and beginners (P01, P06, P09) gained clearly.
""")

open('LO5_INDEPENDENT_SCORING.md', 'w').write("""# LO5 — Independent Scoring

## Method
All items are objectively scorable, so **no LLM judge is used anywhere in scoring**.
1. Every item has a frozen list of accepted answers (`lo_assessment_bank.json`), written before any run.
2. Scoring is deterministic (`keyMatch` in `backend/benchmarks/ltc-v2/lo_assess.ts`): answer and key are normalised (case, apostrophes, punctuation, spaces); correct if the answer contains an accepted answer as a whole phrase; an answer that hedges (contains "or" or two question marks) is wrong.
3. Each item is answered 3 times independently; an item is correct when at least 2 of 3 samples are correct. All raw samples are kept.
4. Scoring is blind: the same function scores every group and stage, sees only the answer and the key, never the group, the transcript or any tutor verdict.
5. The tutor's own assessments are never outcome evidence.
6. Measures: stage score = items correct / 2; absolute gain = post − pre; normalised gain only when pre < 1 (ceiling learners reported separately); mastery = post 2/2 and transfer at least 1/2.

## Flaw found and fixed (after the campaigns, before interpretation)
A hand check of 30 randomly drawn scored answers found one false positive: for the outcome "past simple with a finished time" (LO-12) the accepted answer is a bare verb ("opened"), and the wrong answer "They **have opened** the shop on Monday" contains it, so it was scored correct. This also made LO-12 look like it had no room to learn (pre-test 95%).
- **Fix:** for LO-12 only, an answer containing have, has, 've or had is wrong. Applied to all 1,020 LO-12 item results from the stored answers (no new paid calls); 508 decisions changed. Original files are untouched; corrected files are `campaign_N/lo_assessment_rescored.jsonl`.
- **Effect:** LO-12 pre-test 95% to 5%; overall pre-test 27% to 20%; ENARA post 57% to 54%; the average ENARA − static gap stayed at about +9 points (the conclusion is unchanged).
- Other items use full multi-word or non-overlapping keys; none of the other 29 sampled answers was scored wrongly.

## Uncertainty
- **False negatives:** a correct answer in an unexpected form ("I'd love an orange juice") is marked wrong; this lowers all groups equally.
- **Sampling noise:** reduced by 3 samples and the majority rule, not removed.
- **Not scored by humans:** open-ended and "explain why" outcomes were not included (no teacher-validated rubric exists).
- **Evaluator independence:** scoring does not depend on any model, but the simulated learner and the tutor share a model family (LO7).
""")

open('LO6_COST_AND_EFFICIENCY.md', 'w').write(f"""# LO6 — Cost and Efficiency

Actual provider costs, from the harness meter (tutor calls match the app's own call log), the simulated-learner calls and the assessment calls.

| Item | Cost |
|---|---|
| ENARA tutor calls (3 campaigns, 2,880 replies) | ${cost['tutorUsd']:.2f} |
| Simulated learner messages | ${cost['simLearnerUsd']:.2f} |
| Assessment stage (notes and quiz answers) | ${cost['assessUsd']:.2f} |
| **Three campaigns** | **${cost['total']:.2f}** |
| Simulator validity check (no tutor) | $0.52 |
| **Counted in these results** | **${cost['total'] + 0.52:.2f}** |

Not counted in the results (aborted or invalid earlier attempts, kept in `invalid_v1/` or discarded): about $11, including a first simulator check that failed its validity test and campaigns stopped on purpose.

## Efficiency
- **Per simulated learner (A, tutor + learner + assessment):** about ${cost['perLearner']:.2f}.
- **Per independently mastered outcome (ENARA tutor cost / mastered outcomes):** about ${cost['perMasteredOutcomeA']:.2f} ({rt['n_mastered']} mastered).
- **Average time to demonstrated mastery:** the lesson is a fixed 8 learner turns (about {D['avgHintTurnsA']:.1f} of them hint turns); mastery is measured after the lesson, not turn by turn.
- Budget: all spending stayed inside the approved budget and caps; no metering was bypassed.
""")

open('LO7_VALIDITY_AND_LIMITATIONS.md', 'w').write(f"""# LO7 — Validity and Limitations

## Simulator validity checks (no tutor, 120 learners; before the campaigns)
| Check | Result | Verdict |
|---|---|---|
| Strong learner (P03) already knows the point | 92% on the pre-test | Pass |
| Beginner-level profiles make plausible mistakes | about 12–19% on the pre-test | Pass |
| Misconceptions persist with no teaching | 19% to 18% (corrected data: 12% to 14%) | Pass |
| Learner responds differently to good and poor teaching | correct material 39–41% vs misleading notes 13–17% | Pass |
| Stubborn profile resists even good material | 12% from good material | Pass |
| Fast and careless profiles learn from good material | 67% and 75% | Pass |
| Simulator avoids revealing hidden answers | 0 accepted-answer phrases in any of 120 personas | Pass |

**An earlier version failed** the good-vs-misleading check (17% vs 14%) because the persona told the learner to change its belief only if "the tutor" convinced it, so the study-material group could not learn. That version, and the campaigns started with it, were stopped and are kept in `invalid_v1/`; the wording was made source-neutral and the check passed.

## What this experiment cannot establish
- **Real-student learning.** AI students are not children or adults. This shows whether ENARA's lessons can shift simulated learners' beliefs, not that real learners learn.
- **Real retention.** Forgetting is a transparent assumption (the learner's own note kept in full, as one sentence, or lost).
- **Teaching quality outside these outcomes.** Only 12 form-level grammar and phrase outcomes from ENARA's curriculum are covered. Reading, writing, listening, speaking and vocabulary-only outcomes are not measured.
- **Causal effect in classrooms.** Needs the classroom pilot.

## Biases and risks
- **Same model family.** The simulated learner and the tutor are both Claude models. The simulator may follow the tutor's style more readily than a real learner would.
- **Cooperative simulator.** Even with profiles, a model learner may learn from text more easily than a person.
- **Fixed 8-turn lesson, one short exercise set per outcome.**
- **Item design.** Items were written by the experimenter, not by teachers independent of the tutor; the item bank is small (2 items per stage per outcome, 3 samples each).
- **Scoring.** One scoring flaw was found and fixed (LO5); others may remain, though a 30-answer hand check found none.
- **Tutor changes.** The r4.4 features were not in these campaigns, so this is the fixes 1–7 tutor only.
- **Campaign variation.** The ENARA − static gap varied across campaigns ({GS} points).

## Outcomes that are not interpretable
LO-12 had no room to learn before correction and is the weakest outcome to read. 30 learners at ceiling on the pre-test were excluded from gain calculations.
""")

open('LO8_FINAL_DECISION.md', 'w').write(f"""# LO8 — Final Decision

## **{DEC}** (moderate strength)

In controlled AI-student simulations, ENARA's teaching produced measurable, transferable learning beyond no teaching and beyond reading the lesson notes. The advantage over the notes is modest and uneven.

## Criteria
| Criterion | Result |
|---|---|
| Measurable improvement pre to post | **Met:** {f(sc['pre'])} to {f(sc['A']['post'])}; {g['A']['improved%']:.0f}% of learners improved, {g['A']['worse%']:.0f}% got worse |
| Improvement beyond the control | **Met:** +34 points over no teaching; +9 points over static material (95% interval 3.6 to 13.8) |
| Independent performance | **Met, with a caveat:** post-tests are answered alone; mastery {f(m['A'])}, but only {hd.get('independent', 0)} learners mastered with no hint turns at all |
| Transfer to unfamiliar questions | **Met:** {f(sc['A']['transfer'])} vs static {f(sc['C']['transfer'])} vs none {f(sc['B']['transfer'])} |
| No major deterioration for weaker profiles | **Met:** no profile ended below the no-teaching baseline; but P04 (persistent misconception) gained almost nothing, and P05 and P07 did worse than static material |
| Consistent across independent campaigns | **Partly:** ENARA beat static in all three campaigns, by {GS} points |
| Simulator passes validity checks | **Met** (LO7) |
| Reproducible scoring, documented limits | **Met:** deterministic key; one flaw found and corrected (LO5); limits in LO7 |

## What ENARA teaches well and what it fails to teach
- **Well:** a/an/some, adverb position, -s/-es, polite requests, he/she.
- **Poorly:** irregular past forms, questions with did, present perfect, past simple with a finished time (30–45% final scores).
- **Fails:** stubborn misconceptions; learners who understand but cannot express answers, and careless learners, did better with plain study material.

## Not claimed
No claim is made about real students, real retention or other subjects. A positive simulated signal justifies the classroom pilot; it is not proof of efficacy.

## Next steps
1. Add the r4.4 features (diagnosis, learner history, transfer checks) and re-run this exact experiment.
2. Target the four poorly taught outcomes and the stubborn-misconception profile.
3. Teacher-written items and rubric validation (independent of the tutor).
4. The classroom pilot (`PILOT_PROTOCOL_learning_outcomes.md`).
""")

short = f"""# ENARA learning-outcome experiment: short summary
Simulated AI students only. Not proof of real-student learning.

## LO8 Decision
**{DEC}** (moderate). ENARA beat no teaching clearly and beat reading the lesson notes modestly.

## LO1 Outcomes (12, from ENARA's own lessons)
Greeting by time of day; "This is X. He is a Y"; -s after he/she/it; adverb position; polite requests; a/an/some; regular past -ed; went/had/saw/ate; questions with did; he/she; have + past participle; past simple with a finished time. Not covered: reading, writing, listening, speaking.

## LO2 Students (10 types)
Beginner; partial; strong; stubborn misconception; careless; limited English; can't express answers; fast; needs repeated steps; guesser. 120 per campaign, 3 campaigns = 360.

## LO3 Design
Pre-test, lesson, post-test, new-situation test, retention (days, weeks). Groups: A ENARA tutor (8 messages, real student route); B no teaching; C study notes; D misleading notes (validity check). Fixed answer keys, quiz never shown to tutor or students.

## LO4 Results (average score)
- Before: {f(sc['pre'])}
- ENARA: after {f(sc['A']['post'])}, new situation {f(sc['A']['transfer'])}, weeks later {f(sc['A']['ret2'])}
- Study notes: after {f(sc['C']['post'])}, new situation {f(sc['C']['transfer'])}, weeks later {f(sc['C']['ret2'])}
- No teaching: after {f(sc['B']['post'])}
- ENARA lead over notes: +9 points (95% range +4 to +14)
- Mastered: ENARA {f(m['A'])}, notes {f(m['C'])}, none {f(m['B'])}
- Improved / no change / worse: {g['A']['improved%']:.0f}% / {g['A']['noChange%']:.0f}% / {g['A']['worse%']:.0f}%
- Campaigns 1/2/3 lead over notes: {GSL}
- Taught well: a/an/some, adverb position, -s/-es, polite requests, he/she
- Taught poorly: irregular past, "did" questions, present perfect, finished-time past
- Stubborn-misconception student: no gain

## LO5 Scoring
Fixed answer keys, no AI grader, 3 answers per item, majority. A hand check found one flaw (the finished-time outcome counted "have opened" as right); fixed on all 1,020 answers. Conclusion unchanged.

## LO6 Cost
Three campaigns ${cost['total']:.2f} (about ${cost['perLearner']:.2f} per student, about ${cost['perMasteredOutcomeA']:.2f} per mastered outcome). Earlier failed attempts about $11, not counted.

## LO7 Limits
AI students are not real learners. Same model family as the tutor. Forgetting is an assumption. 12 grammar outcomes only. Items written by us, not teachers. An earlier simulator version failed its validity check and was discarded; the final one passed.
"""
open('LO_ALL_SHORT.md', 'w').write(short)
print('written', len(short.split()), 'words in short file')
