# Tutor: NEXT_PLAN report (21 Nov 2026)

lms-test.enara.app only. test.enara.app untouched. No simulations this round (no ESL7c).

## What changed (one PR each, E2E passed on every PR)

| PR | Switch | What it does |
|---|---|---|
| #52 | `childRule` | Under-9s: the rule is short (greeting, rule of at most 10 words, one right example, the task). No wrong example. |
| #53 | `adaptiveSpacing` | Review gaps follow how the learner did. Easy right: skip a step. Right after a hint: same step, never closes. Wrong: back to 1 day. |
| #54 | `mixedReview` | Review items mix the old point with another known point, so the learner must choose the rule. |
| #55 | `realChat` | After 3 tutor replies, 2 replies of real chat about the learner's life or interests, then back to the lesson. Children get a fixed safe topic list. Never asks personal details. |
| #56 | `kidsAudioVisual` | Under-9s: picture choices (2 to 4 pictures). Tap = read aloud and answer. Speaker button = listen only. Children's speaking stays off. |
| #57 | `avatarSpeaking` | Speaking practice with the avatar: short spoken tasks, one correction at a time. Reply latency is recorded. Pronunciation scores are built but inactive (see below). |

## Switches on (lms-test only)

All six above, added to `ENARA_ENGINE_V2`. Each is off by default everywhere else.

## Picture trial

- Live now: **OpenMoji** (CC BY-SA 4.0), 158 pictures from the Cambridge Starters word list. The credit line is shown under the pictures.
- The trial of our own SVG set is done (sheet sent earlier). OpenMoji stays until you approve a change.

## Keys

- Set: `ANAM_API_KEY` (by you), `ANAM_AVATAR_ID`, `ANAM_VOICE_ID_EN` (copied).
- **Missing: `ELEVENLABS_API_KEY`.** It is Sensitive on test.enara.app, so it can't be copied. Without it, the avatar can't listen or speak through our server.
- Azure is no longer used. Its keys are no longer needed.

## Waiting for you

1. Set `ELEVENLABS_API_KEY` in Vercel (enara-lms-test, Production). Then I measure the real cost and latency per avatar session and report.
2. Speaking cost cap: decide after that cost report.
3. Pronunciation scores: they were built on Azure, and ElevenLabs gives no pronunciation scores. I will send a short plan for another way and wait for your go.
4. Pictures: approve or not a change away from OpenMoji (no change until you say so).

## Waiting for the legal review

- Children speaking to the tutor or the avatar (off now).
- Pronunciation clips from minors (adults 18+ only in the code; audio never stored).
- Real-learner pilot (plan in `docs/tutor/REAL_LEARNER_PILOT_PLAN.md`).
