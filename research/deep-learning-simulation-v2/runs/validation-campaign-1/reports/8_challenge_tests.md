# Challenge tests A-G (derived from recorded results; simulation only)

## A. Adversarial learning (misconception-heavy, slow, guessing profiles)

ENARA (A) gain: adversarial -0.08 (n=12) vs other students 0.00 (n=35). No-teaching (F) gain for adversarial: 0.00.
Reading: if the tutor still raises adversarial students above their own no-teaching baseline, the gain over F is positive even though it is smaller than for typical students.

## B. False mastery (mastery declared but not retained / guessed)

Taught blocks reaching the pre-set mastery criteria: 11. Of these, delayed retention below 50%: 4 (36.4%).
Mastery reached by the no-teaching control F (should be rare; chance/prior knowledge): 0.0%.
Guessed-correct answers per block (taught): 0.52; correlation of guessed-correct with mastery: 0.26.

## C. Teaching-failure recovery (limited)

Taught blocks with no gain (post <= pre): 146 of 188 (77.7%). By condition: A 39/47, C 38/48, D 35/48, E 34/45.
**Limitation:** this harness identifies teaching failures but does not run a second recovery session, so recovery after a failed first session is NOT measured.

## D. Prerequisite gap

Prerequisite probe failed (n=22 A-blocks) vs passed (n=25): ENARA gain 0.00 vs -0.04. All taught conditions: 0.04 vs 0.04.

## E. Context transfer (new situation after teaching)

Transfer minus post, by condition: A -0.10; B -0.02; C 0.06; D 0.02; E 0.01; F -0.06. A more negative value means learning did not carry to a new context.

## F. Confidence calibration (mean stated confidence minus actual correctness; 0 = calibrated, + = over-confident)

Taught 0.41; control F 0.36. By tag: over-confident students 0.54, under-confident 0.30 (the simulator should reproduce the configured bias).

## G. Hint dependency

ENARA blocks: correlation between share of tutor turns containing hints and transfer score = -0.02 (n=47). Negative = heavy hint use goes with weaker independent transfer. Hint share is a text-pattern proxy.

_No-gain rate in taught blocks 95% Wilson CI: 71.2%-83.0%._