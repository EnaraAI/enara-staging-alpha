# Roadmap: from a solid tutor to a world-class one

*Written 13 Nov 2026. Goal: ENARA ranks as the number 1 AI language tutor.*

## What "number 1" means

There is no official ranking of AI tutors. The title is earned with **public, independent evidence** in three places:

1. **Real students learn more** than with the alternatives: a preregistered classroom study with a control group. Nobody can claim number 1 without it.
2. **It beats other tutors** on the same independent tests.
3. **Expert teachers rate it best**, blind.

Until all three exist, ENARA must not claim the title. Simulated (AI-student) results guide the work but are **never** presented as proof that real students learn.

## Where we are (13 Nov 2026)

| Area | Status |
|---|---|
| Testing discipline (paid runs, cost checks, leak checks, controls) | Strong |
| Grammar teaching quality | About 66 of 120 test conversations meet the bar; level fit 91% |
| Other skills (vocabulary, reading, writing, conversation) | 12–48% meet the bar; reading weakest |
| Fixing mistaken beliefs | 28% of simulated students (notes only: 15–20%) |
| Live avatar | **Linked 14 Nov** to the shared language engine; parity tests in place; voice-vs-chat benchmark run with simulated learners (no audio) |
| Real-student evidence | None yet; pilot protocol written |
| r4.4 features | Rebuilt 13 Nov (diagnosis, learner history, transfer checks, pronunciation adapter); not yet measured in a paid run |

## Stages, in order

| # | Stage | Target (how we will know) |
|---|---|---|
| 1 | **Rebuild r4.4 features:** mistake-cause diagnosis, cross-session learner history, transfer checks, pronunciation adapter (off by default) | **Done 13 Nov:** tests pass, in the repository. Paid measurement still to do |
| 2 | **Link the live avatar** to one shared language engine, with a test that fails if chat and avatar drift apart | **Done 14 Nov:** same policy version in both, parity tests pass, voice benchmark run (simulated learners, no audio) |
| 3 | **Teach better:** diagnose the mistake before hinting, fix reading and "why?" answers, rule-in-own-words checks | At least 85% of conversations meet the bar on every skill; at least 50% of simulated students fix their mistaken belief |
| 4 | **Teacher validation:** teachers review about 30 conversations and sign off the grading rubric | AI grader and teachers agree (κ ≥ 0.6) |
| 5 | **Learning-outcome experiment** (running now) and its repeats after each major change | Positive simulated signal, three independent campaigns |
| 6 | **Classroom pilot:** cluster-randomised, preregistered (`docs/benchmarks/language-teaching/20261112-r44-advanced/PILOT_PROTOCOL_learning_outcomes.md`) | Learning gain of at least 0.3 standard deviations over the control |
| 7 | **Public comparison:** run the same public tutoring benchmarks as competitors; publish results and limits | Top result on named benchmarks |

## Rules we keep

- Every claim has a test, a run and a cost behind it. No hand-picked results.
- Thresholds are never lowered to improve a score.
- Everything is committed and pushed the same day, so a machine restart cannot lose it.
- Real learners need teacher review, parental consent and an ethics check before any pilot.

## Decisions needed from the owner

- Pronunciation scoring supplier, contract and audio consent (before that feature can be switched on).
- Partner schools, teachers and budget for the pilot.
