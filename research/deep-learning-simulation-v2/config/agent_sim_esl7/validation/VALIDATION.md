# SIMULATION ONLY: ESL7 scoring validation (new skill outcomes), before any tutor reply

60 blind answers: 20 reading, 20 function, 20 writing. They were written by a Sonnet agent that saw the items but not the keys. 3 independent Opus reference scorers agreed on 59 of 60. The reference score is the majority.

| Path | n | Result | Pre-registered bar | |
|---|---|---|---|---|
| Reading, exact (`matchKeyV2`, graderV2 on) | 20 | 19/20 = 95.0% | ≥ 95% | pass |
| Function, rule (`targetFormPoints`) | 10 | 8/10 exact, QWK 0.848 | QWK ≥ 0.80 | pass |
| Function, model-path stand-in (Opus) | 10 | 10/10, QWK 1.00 | QWK ≥ 0.80 | pass |
| Writing, model-path stand-in (Opus, rubric 0–6) | 20 | 20/20, QWK 1.00 | QWK ≥ 0.80 | pass |

**Misses:**
- Reading V-033: "8 dollar" was scored 0 by the rule and 1 by the references.
- Function V-009 ("my favourite colour blue") and V-058 ("My mother Fatima."): 0 by the rule, 1 by the references (missing verb).

**Limit:** the stand-in and the references are the same model family, so 1.00 overstates how well a real model grader would agree. Files are in this folder.
