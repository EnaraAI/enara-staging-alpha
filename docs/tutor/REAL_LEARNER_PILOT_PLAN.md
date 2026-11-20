# Real-learner pilot: plan (owner decision 3: option B; NOT started)

Status: **plan only.** It starts only after the legal review and the consents are done, and after the owner's go. Nothing in this plan involves real learners until then. test.enara.app stays frozen; the pilot runs on lms-test.enara.app.

## Design (option B)
- **Randomisation:** learners are randomised within their classes, stratified by age band (under 9, 9–12, teens, adults) and by level (A1, A2).
- **Arms:**
  - **Current engine:** the lms-test setting on the pilot start date.
  - **Current engine plus the review changes:** `spacedReview` and `ruleOnWrong`, plus the other new switches that are on by then.
  - The switch is set per learner by a pilot allowlist. That is a small code change, needed first, and **not built yet**.
- **Length:** 4–6 weeks of normal tutor use, with the same curriculum and the same time available in both arms.

## Outcomes (real learning, not simulation)
- **Tests:** unassisted, on new items, before the pilot, after 1–2 weeks and after 4–6 weeks. Written by the school's teachers from ENARA's outcome definitions (`data/outcomes/outcomes.json`).
- **Scoring:** blind, by trained teachers who do not know the arm.
- **Reported separately:**
  - per skill: grammar, vocabulary, functions, reading and writing;
  - per age band and per level.
- **Not used as the outcome:** AI judge scores and tutor-chat performance.
- **Mechanism log:** codes only. Reviews given and answered, repairs after prompts, released answers, and time on task.

## Safety and consent (must be done first)
1. **Legal review** of data use, retention (13 months) and deletion (existing `studentErasure`).
2. **Consent:** written parent consent for every learner under 18, child assent for under-13s, and adult consent.
3. **Oversight:** a teacher is present for under-9s; weekly transcript review; an adverse-experience report form; and a non-AI alternative for anyone who opts out.
4. **Data:** no learner text leaves ENARA. Analysis uses codes and scores only.

## Analysis
- Intention to treat.
- Confidence intervals, with clustering by class.
- Attrition and actual exposure are reported.
- Subgroup results by age band and level are pre-registered; no claims are made outside them.

## Needed before a go
- The legal review result.
- Consent forms in English and Arabic.
- The schools and classes.
- The allowlist change (about half a day), with its tests and E2E.
