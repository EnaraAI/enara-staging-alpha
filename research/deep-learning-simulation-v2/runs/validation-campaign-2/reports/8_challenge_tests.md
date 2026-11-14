# Challenge tests A-G (derived from recorded results; simulation only)

## A. Adversarial learning (misconception-heavy, slow, guessing profiles)

ENARA (A) gain: adversarial 0.13 (n=12) vs other students 0.16 (n=35). No-teaching (F) gain for adversarial: -0.04.
Reading: if the tutor still raises adversarial students above their own no-teaching baseline, the gain over F is positive even though it is smaller than for typical students.

## B. False mastery (mastery declared but not retained / guessed)

Taught blocks reaching the pre-set mastery criteria: 34. Of these, delayed retention below 50%: 8 (23.5%).
Mastery reached by the no-teaching control F (should be rare; chance/prior knowledge): 6.3%.
Guessed-correct answers per block (taught): 0.57; correlation of guessed-correct with mastery: 0.32.

## C. Teaching-failure recovery (limited)

Taught blocks with no gain (post <= pre): 124 of 190 (65.3%). By condition: A 29/47, C 32/48, D 38/48, E 25/47.
**Limitation:** this harness identifies teaching failures but does not run a second recovery session, so recovery after a failed first session is NOT measured.

## D. Prerequisite gap

Prerequisite probe failed (n=22 A-blocks) vs passed (n=25): ENARA gain 0.23 vs 0.08. All taught conditions: 0.22 vs 0.05.

## E. Context transfer (new situation after teaching)

Transfer minus post, by condition: A -0.17; B -0.11; C -0.04; D 0.06; E 0.03; F -0.02. A more negative value means learning did not carry to a new context.

## F. Confidence calibration (mean stated confidence minus actual correctness; 0 = calibrated, + = over-confident)

Taught 0.33; control F 0.34. By tag: over-confident students 0.47, under-confident 0.23 (the simulator should reproduce the configured bias).

## G. Hint dependency

ENARA blocks: correlation between share of tutor turns containing hints and transfer score = -0.13 (n=47). Negative = heavy hint use goes with weaker independent transfer. Hint share is a text-pattern proxy.

_No-gain rate in taught blocks 95% Wilson CI: 58.3%-71.7%._