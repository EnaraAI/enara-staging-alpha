# Challenge tests A-G (derived from recorded results; simulation only)

## A. Adversarial learning (misconception-heavy, slow, guessing profiles)

ENARA (A) gain: adversarial 0.03 (n=15) vs other students 0.09 (n=135). No-teaching (F) gain for adversarial: 0.03.
Reading: if the tutor still raises adversarial students above their own no-teaching baseline, the gain over F is positive even though it is smaller than for typical students.

## B. False mastery (mastery declared but not retained / guessed)

Taught blocks reaching the pre-set mastery criteria: 110. Of these, delayed retention below 50%: 27 (24.5%).
Mastery reached by the no-teaching control F (should be rare; chance/prior knowledge): 4.0%.
Guessed-correct answers per block (taught): 0.47; correlation of guessed-correct with mastery: 0.25.

## C. Teaching-failure recovery (limited)

Taught blocks with no gain (post <= pre): 394 of 598 (65.9%). By condition: A 104/150, C 90/148, D 115/150, E 85/150.
**Limitation:** this harness identifies teaching failures but does not run a second recovery session, so recovery after a failed first session is NOT measured.

## D. Prerequisite gap

Prerequisite probe failed (n=78 A-blocks) vs passed (n=72): ENARA gain 0.09 vs 0.08. All taught conditions: 0.13 vs 0.06.

## E. Context transfer (new situation after teaching)

Transfer minus post, by condition: A -0.05; B -0.02; C -0.03; D -0.01; E -0.07; F -0.02. A more negative value means learning did not carry to a new context.

## F. Confidence calibration (mean stated confidence minus actual correctness; 0 = calibrated, + = over-confident)

Taught 0.32; control F 0.42. By tag: over-confident students 0.49, under-confident 0.22 (the simulator should reproduce the configured bias).

## G. Hint dependency

ENARA blocks: correlation between share of tutor turns containing hints and transfer score = -0.02 (n=150). Negative = heavy hint use goes with weaker independent transfer. Hint share is a text-pattern proxy.

_No-gain rate in taught blocks 95% Wilson CI: 62.0%-69.6%._