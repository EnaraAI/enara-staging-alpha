# Plan: spaced reviews open the session (switch `reviewFirst`)

Status: **plan only. Waiting for Mohamed's "go".** Tutor track; lms-test only; test.enara.app stays frozen.

## Why
The ESL7 simulation (`docs/tutor/ESL7_RESULTS.md`) showed the problem. At the start of a learner's second session, the new engine's prompt says two opposite things:
- `spacedReview`: "Reviews due … open with these … no rule, hint or example before their try".
- The first-time rule block (`ruleFirst` / `levelExplicit`): "state the rule, give a right and a wrong example … this replaces the no-rule-before-try rule".

Tutors settled it differently from round to round, so spaced reviews, the main new feature, often did not run. NEW did not beat BASE at 4 weeks (−1.7 points, not significant).

## The cause in the code
- `ruleFirstDecision` (`languageTeachingContext.ts`) already drops the rule line when a later session opens with recall items. But it only checks the ESL5 record (`reviewOpening`, under `reviewOpen`).
- It never sees the `spacedReview` "Reviews due" rows. Those come from `errorsToWorkOn.ts` through the brief.
- In the same way, `esl5Adjust` removes "present the next lesson item" only for ESL5 recall, not for due reviews.

## The change (one small PR, new named-only switch `reviewFirst`, off by default)
1. **Opening reply of a session with reviews due** (first turn of a session, and `reviewDue` returns at least one row for this learner):
   - no rule line (`ruleFirst` dropped for that reply);
   - no "present the next lesson item";
   - no "Start here" last-session line;
   - the reply is one review item, as `spacedReview` already describes it (focus=E1).
2. **The second due review**, if there is one, comes in the next reply in the same way (focus=E2). That makes at most 2 review replies, then the lesson.
3. **After the reviews**, the lesson goes on as today: the first-time rule block fires on the first lesson item.
4. **A wrong review answer** gets the rule from the review line ("if wrong, say the rule in one plain sentence and give one more new item"). `ruleOnWrong` stays as it is.
5. **One instruction:** the opening reply's prompt holds one "This reply" block, so there are no contradicting lines.
6. **Code:** pure functions only (`ruleFirstDecision`, `esl5Adjust` and the brief order), behind `reviewFirst`. No database change, no migration.

## Tests
- **Unit:**
  - with reviews due, the opening reply has no rule line, no lesson item and no "Start here" line, and has exactly one review item;
  - the second due review comes next;
  - then the rule block fires on the lesson item;
  - with no reviews due, everything is unchanged;
  - with the switch off, everything is unchanged.
- **The ESL7 cases as fixtures:** s7000 (NEW), s7006 and s7011 (round 11).
- **E2E must pass on the PR.** Then turn `reviewFirst` on for lms-test only, with one line per deploy and a push notification.

## A smaller simulation check afterwards (ESL7b, pre-registered first)
- **What runs:** only the second sessions (ESL7 rounds 11–20), from the saved round-10 state, for one new arm, **NEW+reviewFirst**, with 72 learners.
- **Compared with:** the existing NEW and BASE results (same learners, same seeds, same tests).
- **Primary measure:** the 4-week score, NEW+reviewFirst − NEW, using the same test and interval as ESL7.
- **Also measured:** how often the opening reply is a review item, and early answer leaks.
- **Cost:** about 10 rounds × (1 tutor agent + 1 judge agent), plus the 4-week scoring. About 25 agent runs.

## Not in this plan (your decision later)
- The 300-character cap on lesson items, which cuts A2 reading emails. It needs a passage field or a higher cap.
- Under-9s: `childShort` clashes with the rule block.

## Time
About half a day for the PR, plus E2E and the deploy; then about 3–4 hours for ESL7b.
