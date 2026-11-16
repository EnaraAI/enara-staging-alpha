# Simulated student agents

100–200 students per run (`students` in the config). Categories are **experimental parameters, not validated personality types**; dimensions overlap (a student can be a slow learner, over-confident, a guesser and a fast forgetter at once).

| Parameter | Meaning | Effect |
|---|---|---|
| `priorKnowledge[area]` | chance the target skill is already known | seeded `knowsAlready` per block; persona text |
| `misconceptionStrength` | how firmly the explicit misconception is held | persona: "weakly/fairly/very firmly" |
| `prerequisiteLevel` | prerequisite strength | persona; prerequisite probe |
| `learningRate` | persuadability by good teaching | persona: slow/normal/fast |
| `attentionLapse` | per-answer lapse probability | seeded flag → "distracted, careless" instruction |
| `guessRate` | per-answer guess probability | seeded flag → "guess / memorised pattern" |
| `confidenceBias` | under/over-confidence | persona; each answer carries a 0–100 confidence |
| `halfLifeDays` | forgetting half-life | seeded sentence-level forgetting of the learner's note: P(keep) = exp(−ln2·d/h) |
| `strategyResponse`, `inconsistency` | responsiveness to explanation/hints/examples/practice; noise | recorded, available for subgroup analysis |

Each block records the held misconception and `knowsAlready` (`raw/audit.jsonl`) and each answer records its lapse/guess flags, confidence and memory length, so behaviour is auditable. The student model never sees assessment content except while answering the quiz itself. Adversarial/misconception-heavy profiles (`adversarialShare`) get high misconception strength, low learning rate and high guess rate.
