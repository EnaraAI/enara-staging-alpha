# Report: avatar voice, children's speaking, pictures (21 Nov 2026)

Tutor track, lms-test only. test.enara.app untouched.

## Deploys (E2E passed on each)
| PR | What | Status |
|---|---|---|
| #58 | Avatar uses **Anam's own speech-to-text and voice**. ElevenLabs is not used for the avatar. Pronunciation scores stay off. Nothing about Azure changed. | Live |
| #59 | **Children's speaking on:** microphone in the kids tutor chat, plus the "Talk live" avatar call. Internal switch `kidsSpeaking` only; no teacher or parent toggles. Audio never stored. GO_LIVE_CHECKLIST #12 added (parent consent + legal review before the first real school). | Live |
| #60 | Test-only, read-only readout of cost and latency per avatar call (numbers only) | Live |
| #61 | **Our own pictures replace OpenMoji.** Credit line removed. | Live |

Also: `AI_PAUSED=false` on lms-test (your "Turn AI on"). The $25 spend cap is still set.

## Pictures
- The word list has 495 entries (494 distinct words).
- An agent drew 420 of them. A separate judge named each picture **without seeing the word**. Failed pictures were redrawn, at most 3 tries.

| | Words |
|---|---|
| Passed and used | **292** (try 1: 220, try 2: 57, try 3: 15) |
| Text-only: failed 3 tries | 34 |
| Text-only: abstract (he, the, please, today...) | 147 |
| Text-only: names | 22 |

The sheet with every picture and its word is `docs/tutor/picture-sheet/PICTURE_SHEET.md`. The contact sheet is `sheet.png` in the same folder.

## Avatar cost and latency test: blocked
- The test is built: 20 adult voices and 5 child-like voices, 4 sentences each. It runs from GitHub, because this session can't reach lms-test.
- The first problem was that the test browser couldn't play Anam's video. That's fixed, and calls now connect in 2.4 s.
- **The blocker: lms-test's Anthropic key is rejected (HTTP 401).** Every tutor reply on lms-test, in chat and in the avatar, fails and shows "Sorry, I couldn't answer that just now". So the real test can't run yet.
- One test call, adult voice, gave a first look only:
  - speech-to-text: 4 of 4 sentences exact;
  - learner stops speaking → avatar speaks: 1.8 to 2.2 s, for the fallback line, not a real answer.
- Calls used so far: 4 of 30.

## What I need from you
1. **A valid `ANTHROPIC_API_KEY`** in Vercel → enara-lms-test → Production. Tell me "set", then I redeploy and run the 25 calls.
2. **Anam's price per minute**, from Anam's usage page. Without it, the cost is reported in Anam minutes plus the LLM dollars.
3. **Speaking cost cap:** decide after the cost report (as agreed).
4. **Azure / pronunciation scores:** waiting for your go. Nothing has changed.

## Waiting for the legal review
- Children's speaking and voice processing (on for lms-test only).
- Pronunciation clips from minors (off).
