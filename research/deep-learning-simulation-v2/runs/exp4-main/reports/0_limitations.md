# Limitations

- All learners are AI-simulated. Nothing here is evidence of learning in real humans; it can only guide engineering and prioritise a real classroom study.
- The simulated learner is itself a language model prompted from numeric parameters; its learning behaviour has not been validated against real learner data. Simulator-validity checks (docs/SIMULATOR_VALIDATION.md) test internal sanity, not human realism.
- Listening outcomes are TEXT-BASED dialogue comprehension, not audio. Pronunciation and speaking are not assessed.
- Delayed retention is simulated by seeded sentence-level forgetting of the learner's own note, not by real elapsed time.
- Deterministic key/rubric scoring is authoritative; the blind second judge is a model and agrees only imperfectly (see judge agreement in finished.json). Disagreements are listed for human review.
- Teaching exposure differs by condition (e.g. notes have no interaction; the scripted tutor is not generative); differences are recorded per block as unavoidableDifferences.
- The ENARA ablation (condition E) removes prompt-level adaptive instructions only; answer-hiding guards stay on in all ENARA conditions.
- Student replies and tutor replies are sampled from provider models, so reruns with the same seed reproduce the design, assignment and student parameters exactly but not word-for-word model output.
