# Kids pack real-child pilot: plan (waiting for Mohamed's decision)

Status: **plan only**. Owner rule: "Real-child pilot later, when I decide to start with real learners." Nothing here involves real children until then.

## Why a pilot
- The simulation cannot judge listen-and-do for young children (PLN2k2). The tutor delivers the stories, actions and chants, but the simulated child learns only from graded practice.
- Only real children can show whether the kids pack helps.

## Setup (needs a go and three people)
1. **One school, one class of under-9s** (Pre-A1 / Starters), on lms-test only.
2. **Consent.** Written parent consent before the first session (the parents portal records it). Children never give their age; the school enters birth dates.
3. **Teacher check.** A teacher is present in the first sessions and reviews transcripts weekly.
4. **Switch.**
   - Turn `kidsPack` on **for that class only**. Today the switch is per deployment, so one small code change is needed first: a per-school (or per-class) allowlist read with the switch, off everywhere else.
   - Tests and the E2E suite as usual.
5. **Compare.** The same Starters words with the current kids app vs the kids pack. Measures:
   - delayed recall (same items, 1 week);
   - the teacher's rating of each session;
   - the child's engagement (minutes, returns);
   - no harm signals (frustration, stuck).
6. **Length.** 3–4 weeks; then a go/no-go for more classes.

## Safety
- Only short, child-safe content from the checked kids pack (29 lessons, content rule: no test-item sentences).
- The existing child supports apply: short sentences, effort praise, no free chat about personal matters.

## What we need from you
- **Your go**, and the school and class.
- Then the allowlist change (about half a day) and a pilot report template.
