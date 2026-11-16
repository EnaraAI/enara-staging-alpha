# LO7 — Validity and Limitations

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
- **Campaign variation.** The ENARA − static gap varied across campaigns (+12, +3 and +11 points).

## Outcomes that are not interpretable
LO-12 had no room to learn before correction and is the weakest outcome to read. 30 learners at ceiling on the pre-test were excluded from gain calculations.
