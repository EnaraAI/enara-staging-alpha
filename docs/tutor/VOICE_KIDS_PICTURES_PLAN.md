# Plan: avatar voice, children's speaking, our own pictures (21 Nov 2026)

Tutor track only. lms-test only, test.enara.app stays frozen. Each change goes in its own small PR, must pass E2E, then goes live on lms-test. No keys in chat.

## 1. Avatar voice on Anam (PR 1)
- **What I found:** the code already has an "Anam" mode, which uses Anam's own speech-to-text and voice. It is used today because the ElevenLabs key is missing.
- **Change:** with `avatarSpeaking` on, the avatar always uses Anam mode, even if an ElevenLabs key is added later. The ElevenLabs code stays, but the avatar doesn't use it. Nothing about Azure changes. Pronunciation scores stay off.
- **Test:** a unit test (avatarSpeaking always gives Anam mode) and the E2E suite.
- **Cost and latency (after the deploy):** 20 scripted avatar calls on lms-test.
  - A test student (adult) in a headless browser plays a recorded voice as the microphone.
  - Each call is about 2 minutes, with 4 spoken answers.
  - I measure:
    - Anam minutes;
    - LLM tokens, from our own usage records;
    - reply time: learner stops speaking → avatar starts speaking (median and slowest 10%).
  - Cost per session = Anam minutes × the Anam price + the LLM cost.
  - About 40 Anam minutes in total.

## 2. Children's speaking on lms-test (PR 2)
- **What I found:** today the kids tutor has no microphone button, and I found no teacher-per-class or parent-per-child "speaking off" setting.
- **Change:**
  - A new switch, `kidsSpeaking`, off by default and on for lms-test only. It turns on the microphone in the kids tutor chat and lets under-13s use the avatar call.
  - **Teacher:** a new "Speaking off" toggle per class (class settings).
  - **Parent:** a new "Speaking off" toggle per child (parent's child page).
  - If either is off, the microphone is hidden and the server refuses voice for that child. The off setting always wins.
  - Audio is never stored. This is checked by a test.
- **Docs:** add to `docs/GO_LIVE_CHECKLIST.md`: "Children's speaking and voice processing need parent consent and the legal review before the first real school."
- **Tests:** unit tests for the off rules, and an E2E scenario (microphone shown; hidden when the teacher or the parent turns it off).
- **Note:** if the parent-side toggle belongs to the Parents track's code, I'll only add the backend setting and ask you before touching their screens.

## 3. Our own pictures, drawn by an agent (PR 3)
- **Words:** all 495 Cambridge Starters words. The list has 265 nouns, 68 verbs, 52 adjectives, 22 names and 88 small words (pronouns, prepositions, "hello" and so on).
- **Drawing:**
  - Sonnet agents draw simple SVGs in the 20-word trial style, in batches of about 50.
  - Rules: no known characters, brands or copyrighted designs; no text in the pictures.
- **Check:**
  - A separate Opus judge agent sees each picture without the word and names what it shows.
  - It passes if the name matches the word or a listed synonym.
  - A failed picture is redrawn, at most 3 tries in total.
  - Names, the small words and the ones that still fail stay text-only, and are listed.
- **Ship:**
  - The pictures become static files under `frontend/public/kids/pics/`, and the picture list is rebuilt from them.
  - The tutor can offer every word that passed, not only the 158 that had an OpenMoji picture.
  - OpenMoji and its credit line are removed. Everything stays behind `kidsAudioVisual`.
- **Sheet:** one Markdown sheet with every picture and its word, plus a text-only list.
- **Estimate:** about 10 drawing agents, 10 judge agents and up to 2 redraw rounds, so 30 to 40 agent runs.

## Order
PR 1 first, then the cost test. PR 2 and PR 3 are built in parallel, then shipped one at a time.

## Report
One line per deploy. At the end, one short md: what changed, the avatar cost and latency, and the picture counts (drawn, passed, text-only).
