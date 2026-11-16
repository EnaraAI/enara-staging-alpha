# SIMULATION ONLY
# User decisions to be written into ESL6 PROTOCOL.md (before any session runs)

1. **Scoring:** every assessment (pre-test form A, immediate post form B, delayed form C) is scored with ENARA's deterministic grader path, **graderV2 ON** (`ENARA_ENGINE_V2=graderV2`), **model path OFF**. No API calls. The scorer is blind to arm.
2. **Grader guard:** a 10% blind recheck (3 independent agent scorers, rubric only, majority reference), drawn at random with a fixed seed from all scored answers. It must meet the PART 5 targets: **≥95% exact agreement** on exact items and **QWK ≥ 0.80** on free/transfer items. Missing either target is a failed guard → NOT CONFIRMED.
3. **ENARA arm:** runs with graderV2 ON (user decision, recorded earlier). The P+ arm is unchanged: same prompt and the same hash as ESL4/ESL5.
4. **Model path status:** NOT VALIDATED (A1–A2 round 5). It is not used anywhere in ESL6.

Recorded by Claude from the user's instructions; they become binding only once copied into PROTOCOL.md and committed before session 1.
5. **Outcome scope:** 30 outcomes. The 3 A1–A2 form outcomes with no l1ErrorTypes (possessive-adjectives, common-adjectives, make-do) are excluded: they have no wrong belief to simulate. User decision: "Leave them out, go with 30". The protocol must state this as a scope limit, not as a post-hoc exclusion.
