# Challenge tests A-G (derived from recorded results; simulation only)

## A. Adversarial learning (misconception-heavy, slow, guessing profiles)

ENARA (A) gain: adversarial 0.02 (n=15) vs other students 0.13 (n=135). No-teaching (F) gain for adversarial: 0.02.
Reading: if the tutor still raises adversarial students above their own no-teaching baseline, the gain over F is positive even though it is smaller than for typical students.

## B. False mastery (mastery declared but not retained / guessed)

Taught blocks reaching the pre-set mastery criteria: 68. Of these, delayed retention below 50%: 7 (10.3%).
Mastery reached by the no-teaching control F (should be rare; chance/prior knowledge): 3.3%.
Guessed-correct answers per block (taught): 1.03; correlation of guessed-correct with mastery: 0.29.

## C. Teaching-failure recovery (limited)

Taught blocks with no gain (post <= pre): 305 of 524 (58.2%). By condition: A 83/150, C 80/150, D 109/150, E 33/74.
**Limitation:** this harness identifies teaching failures but does not run a second recovery session, so recovery after a failed first session is NOT measured.

## D. Prerequisite gap

Prerequisite probe failed (n=96 A-blocks) vs passed (n=54): ENARA gain 0.13 vs 0.11. All taught conditions: 0.14 vs 0.09.

## E. Context transfer (new situation after teaching)

Transfer minus post, by condition: A -0.00; B -0.00; C -0.01; D 0.01; E 0.01; F -0.03. A more negative value means learning did not carry to a new context.

## F. Confidence calibration (mean stated confidence minus actual correctness; 0 = calibrated, + = over-confident)

Taught 0.32; control F 0.42. By tag: over-confident students 0.44, under-confident 0.25 (the simulator should reproduce the configured bias).

## G. Hint dependency

ENARA blocks: correlation between share of tutor turns containing hints and transfer score = 0.00 (n=150). Negative = heavy hint use goes with weaker independent transfer. Hint share is a text-pattern proxy.

_No-gain rate in taught blocks 95% Wilson CI: 53.9%-62.4%._