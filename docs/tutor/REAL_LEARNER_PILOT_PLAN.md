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

## Added 21 Nov 2026 (NEXT_PLAN items 1 and 5): checked only with real learners
The simulation cannot judge these two, so they are part of the pilot. Children's speaking stays off until the legal review and parent consent.

**`kidsAudioVisual` (under 9): pictures and read-aloud; speaking off.**

| | |
|---|---|
| Measures | Share of picture tasks answered by tap; first-try right rate on picture vs typed tasks; time per task; teacher observation of confusion (a wrong or unclear picture). |
| Safety | A teacher is present; pictures come only from the reviewed set (OpenMoji, or the drawn set if the owner approves it). |

**`avatarSpeaking` (live avatar): speaking practice; pronunciation tips for adults only.**

| | |
|---|---|
| Measures | Reply latency (p50 ≤ 1.5 s, p90 ≤ 2.5 s, from the stored times); cost per session (avatar minutes + speech-to-text + pronunciation seconds); learners' use of the tip (the same word said better on the next try, from transcripts and codes); drop-outs during calls. |
| Minors | No pronunciation clips or speaking practice until the legal review and written parent consent, plus a teacher/parent off switch. |
| Data | Audio is never stored; only the one-line summary and two focus words, deleted with the call. |

**Before either is in the pilot:**
- the legal review result (speaking for minors);
- the Azure Speech key, the pronunciation flag and its price on lms-test;
- the Anam key on lms-test;
- the measured cost per session, reported to the owner, who then decides the speaking cost cap.
